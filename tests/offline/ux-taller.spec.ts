import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

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
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();return panel;
}
const verifications=['Orientación y cara verificadas','Material y espesor verificados','Corte / terminadas verificadas con proveedor','Los cuatro cantos coinciden con esta vista','Dirección de veta verificada'];
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true};
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('pedido: progreso por pieza, siguiente pendiente con atajos y confirmación al preparar de nuevo',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await catalog([{name:'Placa UX',kind:'sheet',patch:board}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido'),progress=panel.locator('#workshop-progress');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(ids).toHaveLength(3);
 await expect(progress).toContainText('0 de 3 piezas listas');await expect(progress).toContainText('3 con verificaciones pendientes');
 await expect(select.locator('option').first()).toHaveText(/^0\/5 · /);
 await expect(panel.getByRole('button',{name:'Revisar pedido y costo neto',exact:true})).toHaveClass(/workshop-primary/);
 await expect(panel.getByRole('button',{name:'Exportar TXT de prueba…',exact:true})).toHaveClass(/workshop-primary/);
 await expect(panel.getByRole('button',{name:'Siguiente pendiente',exact:true})).toHaveAttribute('aria-keyshortcuts','Alt+ArrowDown');
 await expect(panel.getByRole('button',{name:'Pieza anterior',exact:true})).toHaveAttribute('aria-keyshortcuts','Alt+ArrowUp');
 await page.getByLabel('Placa del pedido').selectOption(sheet.id);
 for(const label of verifications.slice(0,3))await page.getByLabel(label,{exact:true}).check();
 await expect(select.locator('option').first()).toHaveText(/^3\/5 · /);await expect(panel.getByText('Verificaciones de la pieza (3/5)',{exact:true})).toBeVisible();
 for(const label of verifications.slice(3))await page.getByLabel(label,{exact:true}).check();
 await expect(select.locator('option').first()).toHaveText(/^Lista · /);await expect(progress).toContainText('1 de 3 piezas listas');
 await panel.getByRole('button',{name:'Siguiente pendiente',exact:true}).click();await expect(select).toHaveValue(ids[1]);
 await expect(panel.getByRole('status')).toContainText('0/5 verificaciones');
 await page.getByLabel('Detalle del pedido').focus();await page.keyboard.press('Alt+ArrowDown');await expect(select).toHaveValue(ids[2]);
 await page.keyboard.press('Alt+ArrowDown');await expect(select).toHaveValue(ids[1]);// cíclico: salta la pieza lista
 await page.keyboard.press('Alt+ArrowUp');await expect(select).toHaveValue(ids[0]);
 await select.selectOption(ids[2]);await page.getByLabel('Incluir pieza física en el pedido').uncheck();
 await expect(select.locator('option').nth(2)).toHaveText(/^EXCLUIDA sin motivo · /);
 await page.getByLabel('Motivo de exclusión').fill('Se corta en el taller');await expect(select.locator('option').nth(2)).toHaveText(/^EXCLUIDA · /);
 await expect(progress).toContainText('2 de 3 piezas listas · 1 excluida');
 let asked='';page.once('dialog',dialog=>{asked=dialog.message();void dialog.dismiss();});
 await panel.getByRole('button',{name:'Preparar de nuevo',exact:true}).click();expect(asked).toContain('descarta los cambios del pedido');
 await expect(progress).toContainText('2 de 3 piezas listas');
 await page.getByLabel('Motivo de exclusión').focus();await page.keyboard.press('Control+s');
 await expect(panel.getByRole('status')).toContainText('Borrador guardado');await expect(panel.getByText('Sin cambios pendientes',{exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/ux-taller-progreso-SINTETICO.png',fullPage:false});
});

test('pedido: bloqueadas accionables y estimación legible que se marcan desactualizadas al editar',async({page},info)=>{
 await boot(page,info.outputDir);const today=new Date().toISOString().slice(0,10);
 const [sheet]=await catalog([{name:'Placa precio',kind:'sheet',patch:{...board,price:{amount:12345.5,currency:'ARS',unit:'m2',date:today,source:'Lista sintética'}}}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await panel.getByRole('button',{name:'Ver piezas bloqueadas',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'3 piezas bloqueadas',exact:true})).toBeVisible();await expect(panel.getByLabel('Piezas bloqueadas').locator('li')).toHaveCount(3);
 await panel.getByLabel('Piezas bloqueadas').locator('li').nth(1).getByRole('button').click();
 await expect(select).toHaveValue(ids[1]);await expect(page.getByLabel('Incluir pieza física en el pedido')).toBeFocused();
 await page.getByLabel('Detalle del pedido').fill('Lateral revisado');
 await expect(panel.getByText('Revisión desactualizada por cambios.',{exact:false})).toBeVisible();await expect(panel.getByLabel('Piezas bloqueadas').locator('li')).toHaveCount(3);
 for(const id of ids){
  await select.selectOption(id);await page.getByLabel('Ejes de la vista 2D').selectOption('0,1');await page.getByLabel('Cara de la vista 2D').selectOption('1');
  await page.getByLabel('Placa del pedido').selectOption(sheet.id);await page.getByLabel('Dirección de veta del pedido').selectOption('none');await page.getByLabel('Rotación del pedido').selectOption('locked');
  await page.getByLabel('Origen de revisión de cantos').selectOption('manual');await page.getByLabel('Justificación manual de cantos').fill('Cantos sintéticos inspeccionados');
  await page.getByLabel('Regla de medidas del pedido').selectOption('finished_accepted');await page.getByLabel('Justificación del pedido').fill('Medidas sintéticas aceptadas');
  for(const label of verifications)await page.getByLabel(label,{exact:true}).check();
 }
 await expect(panel.getByLabel('Piezas bloqueadas').locator('li.is-verified')).toHaveCount(3);await expect(panel.getByText('Verificaciones completas · volvé a revisar').first()).toBeVisible();
 await panel.getByRole('button',{name:'Volver a revisar',exact:true}).click();await expect(panel.getByRole('status')).toContainText('No hay piezas bloqueadas');
 await expect(panel.getByLabel('Piezas bloqueadas')).toHaveCount(0);
 await panel.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Pedido coherente');
 const figures=panel.locator('.workshop-figures');await expect(figures.locator('dt')).toHaveText(['Subtotal vigente','Precios desactualizados','Consumos sin precio']);
 await expect(figures.locator('dd').first()).toHaveText(/^ARS \d{1,3}(\.\d{3})*,\d{2}$/);await expect(figures.locator('dd').nth(2)).toHaveText('0');
 const table=panel.locator('.workshop-estimate-table');await expect(table.locator('tbody tr')).toHaveCount(3);
 await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText(/^\d+,\d{3}$/);await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText('Vigente');
 await expect(table.locator('thead th.workshop-num')).toHaveCount(2);await expect(panel.getByText('sin optimización, desperdicio, impuestos ni mano de obra',{exact:false})).toBeVisible();
 await table.getByRole('button',{name:'Ir a la pieza Lateral revisado'}).click();await expect(select).toHaveValue(ids[1]);
 await page.getByLabel('Detalle del pedido').fill('Lateral corregido');
 await expect(panel.getByText('Costo desactualizado',{exact:false})).toBeVisible();await expect(table.locator('tbody tr')).toHaveCount(3);
 await panel.getByRole('button',{name:'Volver a calcular',exact:true}).click();await expect(panel.getByText('Costo desactualizado',{exact:false})).toHaveCount(0);
 await panel.locator('.workshop-estimate').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/ux-taller-estimacion-SINTETICA.png',fullPage:false});
});

test('biblioteca: alta en línea validada, flechas en la lista y Ctrl+S sin prompt nativo',async({page},info)=>{
 await boot(page,info.outputDir);await catalog([{name:'Placa existente',kind:'sheet',patch:{}},{name:'Canto existente',kind:'edge',patch:{}}]);
 let prompted=false;page.on('dialog',dialog=>{prompted=true;void dialog.dismiss();});
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 const list=panel.getByRole('group',{name:'Materiales de biblioteca'});await expect(list.getByRole('button')).toHaveCount(2);
 await expect(list.locator('.workshop-badge',{hasText:'Sin aprobar'})).toHaveCount(2);
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
 await expect(panel.getByRole('status')).toContainText('creado sin aprobar');await expect(list.getByRole('button')).toHaveCount(3);
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

test('cantos: diagnóstico completo, estado por lado y vínculo rápido a principal/secundario',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');
 const [sheet,first,second]=await catalog([{name:'Placa observable',kind:'sheet',patch:board},{name:'Principal biblioteca',kind:'edge',patch:{sku:'EDGE-1',supplier:'Prueba',thicknessMm:.8,widthMm:22,approved:true}},{name:'Secundario biblioteca',kind:'edge',patch:{sku:'EDGE-2',supplier:'Prueba',thicknessMm:1,widthMm:22,approved:true}}]);
 const panel=await openOrder(page),read=panel.getByRole('button',{name:'Leer cantos de las caras',exact:true});
 await expect(read).toBeDisabled();await expect(panel.getByText('Elegí ejes y cara para leer cantos.',{exact:true})).toBeVisible();
 await page.getByLabel('Ejes de la vista 2D').selectOption('0,1');await page.getByLabel('Cara de la vista 2D').selectOption('1');await page.getByLabel('Placa del pedido').selectOption(sheet.id);
 await expect(read).toBeEnabled();await read.click();await expect(panel.getByText('Recorrido completo',{exact:true})).toBeVisible();
 const edgeTable=panel.locator('.edge-review table');await expect(edgeTable.locator('thead th')).toHaveText(['Lado 2D','Estado','Pintura / evidencia']);
 await expect(edgeTable.locator('tbody tr').first().locator('.workshop-badge')).toHaveText('Observado');await expect(edgeTable.locator('tbody tr').nth(1).locator('.workshop-badge')).toHaveText('Sin canto');
 const issues=panel.locator('.edge-issues li'),propose=panel.getByRole('button',{name:'Usar propuesta de los cuatro lados',exact:true});
 await expect(issues).toHaveCount(2);await expect(issues.first()).toContainText('Arriba: vinculá');await expect(issues.nth(1)).toContainText('Izquierda: vinculá');await expect(propose).toBeDisabled();
 await page.getByLabel('Vincular canto observado material:888',{exact:true}).selectOption(first.id);await page.getByLabel('Vincular canto observado material:890',{exact:true}).selectOption(second.id);
 await expect(issues).toHaveCount(2);await expect(issues.first()).toContainText('como principal (1) o secundario (2)');
 await panel.getByRole('group',{name:'Rol de Principal biblioteca en el pedido'}).getByRole('button',{name:'Usar como principal (1)',exact:true}).click();
 await expect(page.getByLabel('Canto principal del pedido')).toHaveValue(first.id);await expect(issues).toHaveCount(1);
 await panel.getByRole('group',{name:'Rol de Secundario biblioteca en el pedido'}).getByRole('button',{name:'Usar como secundario (2)',exact:true}).click();
 await expect(page.getByLabel('Canto secundario del pedido')).toHaveValue(second.id);await expect(issues).toHaveCount(0);
 await expect(panel.getByRole('group',{name:'Rol de Principal biblioteca en el pedido'}).getByRole('button',{name:'Usar como principal (1)',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(propose).toBeEnabled();await propose.click();
 await expect(page.getByLabel('Canto arriba del pedido')).toHaveValue('1');await expect(page.getByLabel('Canto izquierda del pedido')).toHaveValue('2');await expect(page.getByLabel('Canto abajo del pedido')).toHaveValue('0');
 await page.screenshot({path:'artifacts/ux-taller-cantos-SINTETICO.png',fullPage:false});
 await page.getByLabel('Ejes de la vista 2D').selectOption('1,0');
 await expect(panel.getByText('La lectura anterior era de otra orientación. Volvé a leer.',{exact:true})).toBeVisible();await expect(propose).toHaveCount(0);
});

test('revisión de materiales: conteos por filtro, vacío con salida, «/» y ver piezas que usan un material',async({page},info)=>{
 await boot(page,info.outputDir,'materials');
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});
 const filter=dialog.getByLabel('Filtrar materiales OCL',{exact:true}),rows=dialog.locator('tbody').first().locator('tr');await expect(rows).toHaveCount(3);
 await expect(filter.locator('option')).toHaveText(['Todos (3)','Placas (2)','Cantos (1)','Sin resolver (0)','Sin aplicar (1)','Con conflicto (0)']);
 await expect(dialog.getByText('Mostrando 3 de 3 materiales',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Limpiar filtros'})).toHaveCount(0);
 await dialog.getByRole('heading',{name:'Materiales y cantos'}).click();await page.keyboard.press('/');const search=dialog.getByLabel('Buscar material OCL');await expect(search).toBeFocused();
 await page.keyboard.type('zzz');await expect(rows).toHaveCount(0);await expect(dialog.getByText('No hay materiales con ese filtro ni con «zzz».',{exact:true})).toBeVisible();
 await dialog.locator('.material-review-empty').getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(rows).toHaveCount(3);await expect(search).toHaveValue('');
 await filter.selectOption('edge');await expect(dialog.getByText('Mostrando 1 de 3 materiales',{exact:false})).toBeVisible();
 const allPieces=await dialog.getByLabel('Pieza para revisar materiales',{exact:true}).locator('option').count();
 await rows.first().getByRole('button',{name:'Ver piezas',exact:true}).click();
 const pieces=dialog.getByLabel('Pieza para revisar materiales',{exact:true});await expect(pieces).toBeFocused();
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
