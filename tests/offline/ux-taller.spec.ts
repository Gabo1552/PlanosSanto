import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openDetail} from './fixtures/order-detail';

// UX del taller (biblioteca, pedido, cantos y revisión de materiales) sobre el controlador real con dobles sintéticos de SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];actions=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',(message:string)=>{actions.push(JSON.parse(message).action);return raw(message);});
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function catalog(items:{name:string;kind:string;patch:Record<string,unknown>}[]){
 let library:Library|undefined;
 for(const item of items)library=await send('catalog_add',{revision:library?.catalog.revision??0,item:{name:item.name,kind:item.kind}}) as Library;
 const all=library!.catalog.items;items.forEach((item,i)=>Object.assign(all[i],item.patch));
 await send('catalog_save',{revision:library!.catalog.revision,items:all});return all;
}
async function openOrder(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await openDetail(panel);await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();return panel;
}
// Las cinco casillas de 0.8.15: ya no existen.
const verifications=['Orientación y cara verificadas','Material y espesor verificados','Corte / terminadas verificadas con la maderera','Los cuatro cantos coinciden con esta vista','Dirección de veta verificada'];
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false};
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('pedido: propuesto al abrir, progreso por pieza, atajos y confirmación solo al volver a proponer con cambios a mano',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await catalog([{name:'Placa UX',kind:'sheet',patch:board}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido'),progress=panel.locator('#workshop-progress');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(ids).toHaveLength(3);
 await expect(progress).toContainText('0 de 3 piezas listas');await expect(progress).toContainText('3 con problemas');
 await expect(select.locator('option').first()).toHaveText(/^Con problemas · /);
 await expect(panel.getByRole('button',{name:'Exportar TXT…',exact:true})).toHaveClass(/workshop-primary/);
 await expect(panel.getByRole('button',{name:'Pieza siguiente',exact:true})).toHaveAttribute('aria-keyshortcuts','Alt+ArrowDown');
 await expect(panel.getByRole('button',{name:'Pieza anterior',exact:true})).toHaveAttribute('aria-keyshortcuts','Alt+ArrowUp');
 for(const label of verifications)await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
 await page.getByLabel('Placa del pedido').selectOption(sheet.id);
 await expect(select.locator('option').first()).toHaveText(/^Lista · /);await expect(progress).toContainText('1 de 3 piezas listas');
 await panel.getByRole('button',{name:'Pieza siguiente',exact:true}).click();await expect(select).toHaveValue(ids[1]);
 await expect(panel.getByRole('status')).toContainText('con problemas');
 await page.getByLabel('Detalle del pedido').focus();await page.keyboard.press('Alt+ArrowDown');await expect(select).toHaveValue(ids[2]);
 await page.keyboard.press('Alt+ArrowDown');await expect(select).toHaveValue(ids[0]);// cíclico
 await page.keyboard.press('Alt+ArrowUp');await expect(select).toHaveValue(ids[2]);
 await page.getByLabel('Incluir pieza física en el pedido').uncheck();
 await expect(select.locator('option').nth(2)).toHaveText(/^Excluida · /);await expect(page.getByLabel('Nota de exclusión (opcional)')).toBeVisible();
 await expect(progress).toContainText('1 de 2 piezas listas · 1 con problemas · 1 excluida');
 let asked='';page.once('dialog',dialog=>{asked=dialog.message();void dialog.dismiss();});
 await panel.getByRole('button',{name:'Volver a proponer todo desde el modelo',exact:true}).click();expect(asked).toContain('reemplaza los cambios que hiciste a mano');
 await expect(progress).toContainText('1 de 2 piezas listas');
 await page.getByLabel('Nota de exclusión (opcional)').fill('Se corta en el taller');await page.keyboard.press('Control+s');
 await expect(panel.getByRole('status')).toContainText('Pedido guardado en el modelo');await expect(panel.getByText('Guardado en el modelo',{exact:false}).first()).toBeVisible();
 await page.screenshot({path:'artifacts/ux-taller-progreso-SINTETICO.png',fullPage:false});
});

test('pedido: problemas accionables en vivo y estimación que se calcula sola al no haber problemas',async({page},info)=>{
 await boot(page,info.outputDir);const today=new Date().toISOString().slice(0,10);
 const [sheet]=await catalog([{name:'Placa precio',kind:'sheet',patch:{...board,price:{amount:12345.5,currency:'ARS',unit:'m2',date:today,source:'Lista sintética'}}}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await expect(panel.getByRole('heading',{name:'Problemas del pedido',exact:true})).toBeVisible();await expect(panel.getByLabel('Piezas con problemas').locator(':scope > li')).toHaveCount(3);
 await panel.getByLabel('Piezas con problemas').locator(':scope > li').nth(1).getByRole('button',{name:/^Ir a la pieza/}).click();
 await expect(select).toHaveValue(ids[1]);await expect(page.getByLabel('Placa del pedido')).toBeFocused();
 await page.getByLabel('Detalle del pedido').fill('Lateral revisado');
 for(const id of ids){await select.selectOption(id);await page.getByLabel('Placa del pedido').selectOption(sheet.id);}
 await expect(panel.locator('#workshop-problems-summary')).toHaveText('Sin problemas físicos: el pedido se puede exportar.');await expect(panel.getByLabel('Piezas con problemas')).toHaveCount(0);
 const figures=panel.locator('.workshop-figures');await expect(figures.locator('dt')).toHaveText(['Subtotal vigente','Precios desactualizados','Consumos sin precio']);
 await expect(figures.locator('dd').first()).toHaveText(/^ARS \d{1,3}(\.\d{3})*,\d{2}$/);await expect(figures.locator('dd').nth(2)).toHaveText('0');
 const table=panel.locator('.workshop-estimate-table');await expect(table.locator('tbody tr')).toHaveCount(3);
 await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText(/^\d+,\d{3}$/);await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText('Vigente');
 await expect(table.locator('thead th.workshop-num')).toHaveCount(2);await expect(panel.getByText('sin optimización, desperdicio, impuestos ni mano de obra',{exact:false})).toBeVisible();
 await table.getByRole('button',{name:'Ir a la pieza Lateral revisado'}).click();await expect(select).toHaveValue(ids[1]);
 await page.getByLabel('Detalle del pedido').fill('Lateral corregido');
 await expect(table.getByRole('button',{name:'Ir a la pieza Lateral corregido'})).toBeVisible();await expect(table.locator('tbody tr')).toHaveCount(3);
 await expect(panel.getByText('Actualizando con tus últimos cambios…',{exact:true})).toHaveCount(0);
 expect(actions.filter(a=>a==='order_check'||a==='order_audit')).toHaveLength(0);
 await panel.locator('.workshop-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/ux-taller-estimacion-SINTETICA.png',fullPage:false});
});

test('biblioteca: alta en línea validada, flechas en la lista y Ctrl+S sin prompt nativo',async({page},info)=>{
 await boot(page,info.outputDir);await catalog([{name:'Placa existente',kind:'sheet',patch:{}},{name:'Canto existente',kind:'edge',patch:{}}]);
 let prompted=false;page.on('dialog',dialog=>{prompted=true;void dialog.dismiss();});
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 const list=panel.getByRole('group',{name:'Materiales de biblioteca'});await expect(list.getByRole('button')).toHaveCount(2);
 // Biblioteca v4: el canto nuevo ya trae los anchos estándar 22 y 45 mm, así que solo la placa (sin SKU ni formato) queda incompleta.
 await expect(list.locator('.workshop-badge',{hasText:'Incompleta'})).toHaveCount(1);
 await list.getByRole('button').first().focus();await page.keyboard.press('ArrowDown');
 await expect(list.getByRole('button').nth(1)).toBeFocused();await expect(list.getByRole('button').nth(1)).toHaveAttribute('aria-pressed','true');await expect(list.getByRole('button').first()).toHaveAttribute('tabindex','-1');
 await page.keyboard.press('Home');await expect(list.getByRole('button').first()).toBeFocused();
 await panel.getByRole('button',{name:'Nuevo material',exact:true}).click();const name=panel.getByLabel('Nombre del material nuevo');await expect(name).toBeFocused();
 await name.press('Enter');await expect(panel.getByText('Escribí un nombre para el material.',{exact:true})).toBeVisible();await expect(name).toHaveAttribute('aria-invalid','true');
 await name.fill('placa EXISTENTE');await name.press('Enter');await expect(panel.getByText('Ya existe un material con ese nombre en la biblioteca.',{exact:true})).toBeVisible();
 await name.press('Escape');await expect(panel).toBeVisible();await expect(name).toHaveCount(0);await expect(panel.getByRole('button',{name:'Nuevo material',exact:true})).toBeFocused();
 await panel.getByRole('button',{name:'Nuevo material',exact:true}).click();await name.fill('Melamina Nogal 18');
 // Dos Enter en el mismo tick: solo un catalog_add.
 await name.evaluate(el=>{for(let i=0;i<2;i++)el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
 await expect(panel.getByRole('status')).toContainText('creado. Completá tipo y datos de su ficha');await expect(list.getByRole('button')).toHaveCount(3);
 await expect(page.getByLabel('Nombre de material de biblioteca')).toHaveValue('Melamina Nogal 18');
 await expect(panel.getByRole('button',{name:'Guardar biblioteca',exact:true})).toHaveAttribute('aria-keyshortcuts','Control+S Meta+S');
 await page.getByLabel('SKU de biblioteca').fill('MN-18');await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Nuevo material',exact:true})).toBeDisabled();await expect(panel.getByText('Guardá la biblioteca (Ctrl+S)',{exact:false})).toBeVisible();
 await page.keyboard.press('Control+s');await expect(panel.getByRole('status')).toContainText('Biblioteca guardada');await expect(panel.getByText('Sin cambios pendientes',{exact:false})).toBeVisible();
 await page.keyboard.press('Control+s');await expect(panel.getByRole('status')).toContainText('No hay cambios para guardar');
 expect(prompted).toBe(false);expect(actions.filter(action=>action==='catalog_add')).toHaveLength(1);
 const saved=await send('catalog_load') as Library;expect(saved.catalog.items.filter(item=>item.name==='Melamina Nogal 18')).toHaveLength(1);expect(saved.catalog.items.find(item=>item.name==='Melamina Nogal 18')?.sku).toBe('MN-18');
 await page.screenshot({path:'artifacts/ux-taller-biblioteca-SINTETICA.png',fullPage:false});
});

test('cantos: leídos solos de las caras, vínculo de los materiales sin ficha y mapa que sigue a la cara física',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');
 const [sheet,first,second]=await catalog([{name:'Placa observable',kind:'sheet',patch:board},{name:'Principal biblioteca',kind:'edge',patch:{sku:'EDGE-1',supplier:'Prueba',thicknessMm:.8,widthMm:22}},{name:'Secundario biblioteca',kind:'edge',patch:{sku:'EDGE-2',supplier:'Prueba',thicknessMm:1,widthMm:22}}]);
 const panel=await openOrder(page);
 await expect(panel.getByRole('button',{name:/Leer cantos|Usar propuesta/})).toHaveCount(0);await expect(panel.getByLabel('Origen de la revisión de cantos')).toHaveCount(0);
 const notes=panel.getByRole('list',{name:'Avisos de los cantos del modelo'});await expect(notes).toContainText('vinculá «Canto de prueba»');
 const links=panel.getByRole('region',{name:'Cantos pintados sin vínculo'});
 await page.getByLabel('Placa del pedido').selectOption(sheet.id);
 await links.getByLabel('Canto de biblioteca para Canto de prueba').selectOption(first.id);await links.getByLabel('Canto de biblioteca para Canto secundario de prueba').selectOption(second.id);
 await expect(notes).toHaveCount(0);
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
 const values=()=>Promise.all(['Arriba','Abajo','Izquierda','Derecha'].map(side=>page.getByLabel(`${side} · canto del pedido`).inputValue()));
 expect((await values()).sort()).toEqual(['0','0','1','2']);
 await page.screenshot({path:'artifacts/ux-taller-cantos-SINTETICO.png',fullPage:false});
 // Al cambiar la cara, izquierda y derecha intercambian su canto: no se vuelven a leer ni se pierden.
 const before=await values();await page.getByLabel('Cara mostrada de la vista 2D').selectOption('-1');
 expect(await values()).toEqual([before[0],before[1],before[3],before[2]]);
 await page.getByLabel('Arriba · canto del pedido').selectOption('0');await expect(panel.getByText('Cantos cambiados a mano en el pedido.',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Volver a los cantos del modelo',exact:true}).click();await expect(panel.getByText('Cantos leídos de las caras pintadas del modelo.',{exact:true})).toBeVisible();
});
test('revisión de materiales: conteos por filtro, vacío con salida, «/» y ver piezas que usan un material',async({page},info)=>{
 await boot(page,info.outputDir,'materials');
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});
 const filter=dialog.getByLabel('Mostrar materiales por tipo',{exact:true}),rows=dialog.locator('tbody').first().locator('tr');await expect(rows).toHaveCount(3);
 await expect(filter.locator('option')).toHaveText(['Todos (3)','Placas (2)','Cantos (1)','Sin resolver (0)','Sin aplicar (1)','Con conflicto (0)']);
 await expect(dialog.getByText('Mostrando 3 de 3 materiales',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Limpiar filtros'})).toHaveCount(0);
 await dialog.getByRole('heading',{name:'Materiales y cantos'}).click();await page.keyboard.press('/');const search=dialog.getByLabel('Buscar material OCL');await expect(search).toBeFocused();
 await page.keyboard.type('zzz');await expect(rows).toHaveCount(0);await expect(dialog.getByText('No hay materiales con ese filtro ni con «zzz».',{exact:true})).toBeVisible();
 await dialog.locator('.material-review-empty').getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(rows).toHaveCount(3);await expect(search).toHaveValue('');
 await filter.selectOption('edge');await expect(dialog.getByText('Mostrando 1 de 3 materiales',{exact:false})).toBeVisible();
 const allPieces=await dialog.getByLabel('Revisar una pieza: caras y materiales',{exact:true}).locator('option').count();
 await rows.first().getByRole('button',{name:'Ver piezas',exact:true}).click();
 const pieces=dialog.getByLabel('Revisar una pieza: caras y materiales',{exact:true});await expect(pieces).toBeFocused();
 await expect(dialog.getByText(/^Piezas con Canto de prueba \(\d+\)/)).toBeVisible();
 const filtered=await pieces.locator('option').count();expect(filtered).toBeGreaterThan(1);expect(filtered).toBeLessThanOrEqual(allPieces);
 await dialog.getByRole('button',{name:'Quitar filtro',exact:true}).click();await expect(pieces.locator('option')).toHaveCount(allPieces);
 await dialog.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(rows).toHaveCount(3);
 // Los estilos del taller se acotan a .workshop-review: no alcanzan otros diálogos .material-review (p. ej. pintura).
 await expect(dialog).toHaveClass(/workshop-review/);expect(await dialog.evaluate(el=>getComputedStyle(el).getPropertyValue('--ws-accent').trim())).toBe('#19483d');
 const foreign=await page.evaluate(()=>{const host=document.createElement('section');host.className='material-review paint-panel';host.innerHTML='<kbd>P</kbd>';document.body.append(host);const result={accent:getComputedStyle(host).getPropertyValue('--ws-accent').trim(),kbdMargin:getComputedStyle(host.querySelector('kbd')!).marginLeft};host.remove();return result;});
 expect(foreign).toEqual({accent:'',kbdMargin:'0px'});
 await page.screenshot({path:'artifacts/ux-taller-materiales-SINTETICA.png',fullPage:false});
});
