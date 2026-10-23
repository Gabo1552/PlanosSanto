import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// UX del taller (biblioteca y revisión de materiales) sobre el controlador real con dobles sintéticos de SketchUp.
// 0.8.20: el pedido pieza por pieza (progreso, problemas, estimación, vista 2D y vínculo de cantos) se quitó de la
// UI; la maderera es la optimización por placa y la cubre maderera-placas.spec.ts.
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
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('biblioteca: alta en línea validada, flechas en la lista y Ctrl+S sin prompt nativo',async({page},info)=>{
 await boot(page,info.outputDir);await catalog([{name:'Placa existente',kind:'sheet',patch:{}},{name:'Canto existente',kind:'edge',patch:{}}]);
 let prompted=false;page.on('dialog',dialog=>{prompted=true;void dialog.dismiss();});
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca del taller'});
 const list=panel.getByRole('group',{name:'Materiales de biblioteca'});await expect(list.getByRole('button')).toHaveCount(2);
 await expect(list.locator('.workshop-badge',{hasText:'Incompleta'})).toHaveCount(2);
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
