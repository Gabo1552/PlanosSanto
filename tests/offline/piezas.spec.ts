import {test,expect,type Locator,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Vista «Piezas» 0.8.18: listado de partes (resumen por material, secciones por placa y por canto) escrito de
// cero sobre la UI empaquetada y el controlador Ruby real con dobles de la API (names_bridge_driver.rb, modo
// materials-cutlist). No es SketchUp nativo.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Totals=Record<string,number|null>;type Cutlist={modelName:string;sections:{name:string;totals:Totals}[];edgeSections:{name:string;missing:string[];totals:Totals}[]};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],replies:Map<string,Reply>,errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await native(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];replies=new Map();errors=[];await page.setViewportSize({width:1500,height:1100});
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'materials-cutlist'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  const reply=await native(raw);replies.set(msg.id,reply);if(['piece_highlight','cutlist','cutlist_csv'].includes(action))replies.set(action,reply);return reply;
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.shellRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};window.__prints=[];window.print=function(){window.__prints.push(document.body.className);};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.clock.install();await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});
const axeSource=require.resolve('axe-core/axe.min.js');
type AxeResult={violations:{id:string;impact:string;help:string;nodes:{target:string[];failureSummary:string}[]}[]};
async function axe(page:Page,label:string){
 if(!await page.evaluate(()=>'axe' in window))await page.evaluate(await readFile(axeSource,'utf8'));
 const found=await page.evaluate(async()=>{const result:AxeResult=await (window as unknown as {axe:{run:(context:unknown,options:unknown)=>Promise<AxeResult>}}).axe.run({include:[['body']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  return result.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>`${v.impact} ${v.id}: ${v.nodes.map(n=>n.target.join(' ')+' | '+n.failureSummary.replace(/\s+/g,' ')).join(' ;; ')}`);});
 return found.map(line=>`[${label}] ${line}`);
}
async function openPieces(page:Page){
 await rail(page,'Piezas').click();await expect(rail(page,'Piezas')).toHaveAttribute('aria-current','page');
 await expect.poll(()=>replies.has('cutlist')?replies.get('cutlist')!.error:'pendiente').toBeNull();
 const view=page.locator('section.cutlist');await expect(view.getByRole('heading',{level:2,name:'Listado de piezas'})).toBeVisible();
 return {view,summary:view.getByRole('table',{name:'Resumen por material'}),groups:view.locator('section.cutlist-group'),result:replies.get('cutlist')!.result as Cutlist};
}
const cells=(row:Locator)=>row.locator('td');

test('Piezas: resumen, secciones de placa y canto, plegar, ocultar, filtrar, resaltar y axe',async({page},info)=>{
 await boot(page,info.outputDir);const found:string[]=[];
 // Como el listado de OpenCutList: abrir Piezas alcanza. Sin guías, se generan solas para los muebles marcados.
 const {view,summary,groups,result}=await openPieces(page);
 expect(calls.filter(call=>call.action==='generate')).toHaveLength(1);
 // Encabezado: Generar (naranja), Imprimir, Exportar, Opciones y ayuda; debajo, la pestaña del modelo con la unidad.
 for(const name of ['Generar','Imprimir','Exportar','Opciones','Ayuda: Listado de piezas'])await expect(view.getByRole('button',{name,exact:true})).toBeVisible();
 await expect(view.getByRole('button',{name:'Generar',exact:true})).toHaveCSS('background-color','rgb(166, 76, 10)');
 await expect(view.locator('.cutlist-doc-tab')).toContainText('Milímetro');
 if(result.modelName)await expect(view.locator('.cutlist-doc-tab strong')).toHaveText(result.modelName);

 // Resumen: placa del modelo (sin ficha), dos cantos pintados y la mezcla de materiales («?», Σ rayadas).
 await expect(summary.locator('thead th')).toHaveText(['Tipo','Espesor / Material','Cantidad','Σ','Longitud','Área','Volumen']);
 const rows=summary.locator('tbody tr');await expect(rows).toHaveCount(4);
 await expect(rows.locator('td.type .sr-only')).toHaveText(['Placa','Canto','Canto','Sin tipo definido']);
 await expect(cells(rows.nth(0))).toHaveText(['Placa','Jade synthetic / 19,05 mmSin ficha en la biblioteca','2','1,22 m','0,50 m²','0,009 m³']);
 await expect(cells(rows.nth(1))).toHaveText(['Canto','Canto de prueba / 19,05 mmSin ficha en la biblioteca','3','1,83 m','0,03 m²','—Sin espesor en la ficha']);
 await expect(rows.nth(1).locator('.is-approx')).toHaveAttribute('title','Ancho aproximado: espesor de la pieza');
 await expect(cells(rows.nth(2))).toHaveText(['Canto','Canto secundario de prueba / 19,05 mmSin ficha en la biblioteca','3','1,22 m','0,02 m²','—Sin espesor en la ficha']);
 await expect(rows.nth(3).locator('td.material')).toContainText('Jade synthetic / Placa sin aplicar / 19,05 mm');
 await expect(rows.nth(3).locator('td.is-hatched')).toHaveCount(3);
 await expect(rows.nth(3).locator('.cutlist-material-name')).toHaveCSS('font-style','italic');
 await expect(rows.nth(0).locator('.cutlist-warn')).toHaveCSS('background-color','rgb(161, 42, 18)');
 // Los Σ de la UI salen de las mismas cuentas que Ruby.
 expect(result.sections.map(s=>[s.name,s.totals])).toEqual([['Jade synthetic',{pieces:2,lengthM:1.219,areaM2:0.495,volumeM3:0.0094}],['Jade synthetic / Placa sin aplicar',{pieces:1,lengthM:0.61,areaM2:0.248,volumeM3:0.0047}]]);
 expect(result.edgeSections.map(s=>[s.name,s.missing,s.totals])).toEqual([['Canto de prueba',['ficha'],{strips:3,lengthM:1.829,areaM2:0.035,volumeM3:null}],['Canto secundario de prueba',['ficha'],{strips:3,lengthM:1.219,areaM2:0.023,volumeM3:null}]]);
 await expect(view.locator('.cutlist-totals')).toHaveText('3 piezas · 2 materiales · 0,74 m² · 3,05 m de canto');

 // Una sección por material en el orden del resumen, con borde izquierdo de color por tipo.
 await expect(groups).toHaveCount(4);
 await expect(groups.locator('h3')).toHaveText(['Jade synthetic / 19,05 mm','Canto de prueba / 19,05 mm','Canto secundario de prueba / 19,05 mm','Jade synthetic / Placa sin aplicar / 19,05 mm']);
 await expect(groups.nth(0)).toHaveCSS('border-left-color','rgb(166, 76, 10)');await expect(groups.nth(1)).toHaveCSS('border-left-color','rgb(63, 81, 181)');
 const board=view.getByRole('table',{name:'Piezas de Jade synthetic / 19,05 mm'});
 await expect(board.locator('thead th')).toHaveText(['No.','Designación','Cant.','Finales','L','A']);
 await expect(board.locator('tbody tr')).toHaveCount(2);
 await expect(board.locator('td.no')).toHaveText(['A','B']);await expect(board.locator('td.no').first()).toHaveCSS('color','rgb(161, 42, 18)');
 await expect(board.locator('td.designation').nth(1)).toHaveText('Lateral - Blanco (Bajo Mesada · 609,6 × 406,4 × 19,05 · Jade synthetic)');
 await expect(cells(board.locator('tbody tr').nth(1)).locator('nth=2')).toHaveText('1');
 await expect(board.locator('tbody tr').nth(1).locator('td.num')).toHaveText(['1','609,6 mm','406,4 mm']);
 // Cantos: una fila por tira, «Pieza – Longitud del borde 1» o «Ancho del borde 1», con su L.
 const tape=view.getByRole('table',{name:'Tiras de Canto de prueba'});
 await expect(tape.locator('thead th')).toHaveText(['No.','Designación','Cant.','Finales','L']);
 await expect(tape.locator('tbody td.designation button')).toHaveText(['Base – Longitud del borde 1','Lateral - Blanco – Longitud del borde 1','Base ajena – Longitud del borde 1']);
 await expect(tape.locator('tbody td.num:last-child')).toHaveText(['609,6 mm','609,6 mm','609,6 mm']);
 await expect(view.getByRole('table',{name:'Tiras de Canto secundario de prueba'}).locator('tbody td.designation button')).toHaveText(['Base – Ancho del borde 1','Lateral - Blanco – Ancho del borde 1','Base ajena – Ancho del borde 1']);
 // Sin tipo: L, A y E.
 await expect(view.getByRole('table',{name:'Piezas de Jade synthetic / Placa sin aplicar / 19,05 mm'}).locator('thead th')).toHaveText(['No.','Designación','Cant.','Finales','L','A','E']);
 found.push(...await axe(page,'Piezas'));
 await page.screenshot({path:info.outputPath('piezas-listado-SINTETICO.png'),fullPage:true});

 // Plegar una sección y todas; volver a desplegar.
 const fold=view.getByRole('button',{name:'Plegar Jade synthetic / 19,05 mm',exact:true});
 await expect(fold).toHaveAttribute('aria-expanded','true');await fold.click();
 const unfold=view.getByRole('button',{name:'Desplegar Jade synthetic / 19,05 mm',exact:true});
 await expect(unfold).toHaveAttribute('aria-expanded','false');await expect(board).toBeHidden();
 await unfold.click();await expect(board).toBeVisible();
 await view.getByRole('button',{name:'Plegar todo',exact:true}).click();
 await expect(groups.locator('button[aria-expanded="false"][aria-controls]')).toHaveCount(4);
 await expect(view.getByRole('button',{name:'Plegar todo',exact:true})).toBeDisabled();
 found.push(...await axe(page,'Piezas plegadas'));
 await view.getByRole('button',{name:'Expandir todo',exact:true}).click();
 await expect(groups.locator('button[aria-expanded="true"][aria-controls]')).toHaveCount(4);

 // Ojo: oculta la sección del listado (la fila del resumen queda atenuada); «Ir a la sección» la trae de vuelta.
 await groups.nth(1).getByRole('button',{name:'Ocultar la sección Canto de prueba',exact:true}).click();
 await expect(groups).toHaveCount(3);await expect(rows.nth(1)).toHaveClass(/is-off/);
 await expect(summary.getByRole('button',{name:'Mostrar la sección Canto de prueba',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(view.locator('.cutlist-totals')).toHaveText('3 piezas · 2 materiales · 0,74 m² · 1,22 m de canto');
 await summary.getByRole('button',{name:'Ir a la sección Canto de prueba',exact:true}).click();
 await expect(groups).toHaveCount(4);await expect(view.getByRole('heading',{level:3,name:'Canto de prueba / 19,05 mm'})).toBeFocused();
 await expect(summary.getByRole('button',{name:'Mostrar la sección Canto de prueba',exact:true})).toHaveAttribute('aria-pressed','true');
 // Menú «⋮»: teclado y Escape; «Ocultar la sección» desde el menú.
 const more=groups.nth(3).getByRole('button',{name:'Más acciones de Jade synthetic / Placa sin aplicar / 19,05 mm',exact:true});
 await more.click();const menu=page.getByRole('menu',{name:'Más acciones de Jade synthetic / Placa sin aplicar / 19,05 mm'});
 await expect(menu.getByRole('menuitem')).toHaveText(['Exportar CSV de esta sección','Ocultar la sección']);
 await expect(menu.getByRole('menuitem').first()).toBeFocused();await page.keyboard.press('ArrowDown');await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
 found.push(...await axe(page,'Menú de sección'));
 await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(more).toBeFocused();
 await more.click();await menu.getByRole('menuitem',{name:'Ocultar la sección'}).click();
 await expect(groups).toHaveCount(3);await expect(view.locator('.cutlist-totals')).toHaveText('2 piezas · 1 material · 0,50 m² · 3,05 m de canto');
 await summary.getByRole('button',{name:'Mostrar la sección Jade synthetic / Placa sin aplicar / 19,05 mm',exact:true}).click();await expect(groups).toHaveCount(4);

 // Filtro por mueble y búsqueda por nombre: el resumen y los cantos siguen al filtro.
 await view.getByLabel('Mueble',{exact:true}).selectOption({label:'Otro mueble'});
 await expect(rows).toHaveCount(3);await expect(groups).toHaveCount(3);
 await expect(tape.locator('tbody td.designation button')).toHaveText(['Base ajena – Longitud del borde 1']);
 await view.getByLabel('Mueble',{exact:true}).selectOption({label:'Todos los muebles'});
 await view.getByLabel('Buscar',{exact:true}).fill('lateral');
 await expect(board.locator('tbody tr')).toHaveCount(1);await expect(view.locator('.cutlist-totals')).toContainText('1 pieza · 1 material');
 await view.getByLabel('Buscar',{exact:true}).fill('no existe');await expect(view.getByText('Ninguna pieza coincide con el filtro.')).toBeVisible();await expect(summary).toHaveCount(0);
 await view.getByLabel('Buscar',{exact:true}).fill('');

 // Clic en una fila: resalta la pieza en SketchUp con la acción existente; también desde una tira de canto.
 const row=board.locator('tbody tr').filter({hasText:'Lateral - Blanco'});
 await row.locator('td.num').first().click();
 await expect.poll(()=>calls.filter(call=>call.action==='piece_highlight').map(call=>call.data.pieceId)).toEqual(['1/11']);
 await expect.poll(()=>replies.has('piece_highlight')?replies.get('piece_highlight')!.error:'pendiente').toBeNull();
 await expect(row).toHaveAttribute('aria-current','true');
 await tape.locator('tbody tr').nth(2).locator('td.no').click();
 await expect.poll(()=>calls.filter(call=>call.action==='piece_highlight').map(call=>call.data.pieceId)).toEqual(['1/11','2/21']);
 await expect(row).not.toHaveAttribute('aria-current','true');await expect(tape.locator('tbody tr').nth(2)).toHaveAttribute('aria-current','true');
 // También con teclado, desde el nombre.
 await view.getByRole('button',{name:'Base ajena',exact:true}).focus();await page.keyboard.press('Enter');
 await expect.poll(()=>calls.filter(call=>call.action==='piece_highlight').length).toBe(3);
 found.push(...await axe(page,'Piezas con fila resaltada'));

 // Opciones: columnas Σ y detalle de la designación (se recuerdan en el navegador).
 await view.getByRole('button',{name:'Opciones',exact:true}).click();
 const options=view.getByRole('group',{name:'Opciones del listado'});await expect(options).toBeVisible();await expect(options).toContainText('Milímetro (mm)');
 await options.getByLabel('Volumen').uncheck();await options.getByLabel('Detalle en la designación').uncheck();
 await expect(summary.locator('thead th')).toHaveText(['Tipo','Espesor / Material','Cantidad','Σ','Longitud','Área']);
 await expect(board.locator('td.designation').nth(1)).toHaveText('Lateral - Blanco');
 found.push(...await axe(page,'Opciones'));
 await page.keyboard.press('Escape');await expect(options).toBeHidden();await expect(view.getByRole('button',{name:'Opciones',exact:true})).toBeFocused();
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('planos-santo.cutlist.options')||'{}'))).toMatchObject({volume:false,detail:false});

 // Imprimir: la impresión del diálogo con la marca que deja solo el listado.
 await view.getByRole('button',{name:'Imprimir',exact:true}).click();
 expect(await page.evaluate(()=>(window as unknown as {__prints:string[]}).__prints)).toEqual(['cutlist-printing']);
 await expect(page.locator('body')).not.toHaveClass(/cutlist-printing/);
 await page.emulateMedia({media:'print'});await page.evaluate(()=>document.body.classList.add('cutlist-printing'));
 await expect(view).toBeVisible();await expect(view.locator('.cutlist-actions')).toBeHidden();await expect(page.locator('.ux-rail')).toBeHidden();
 await page.evaluate(()=>document.body.classList.remove('cutlist-printing'));await page.emulateMedia({media:'screen'});

 // Solo lectura: la pestaña no escribió nada en el modelo.
 expect(calls.some(call=>['save','order_save','names_apply','catalog_save','paint_apply'].includes(call.action))).toBe(false);
 expect(found).toEqual([]);
});

test('Piezas: fichas vinculadas, «Ancho no definido», espesor fuera de la lista, lápiz a Materiales y CSV exportado',async({page},info)=>{
 await boot(page,info.outputDir);const found:string[]=[];
 // Biblioteca: placa completa y un canto sin ancho; se vinculan a los materiales pintados del doble.
 // Biblioteca v4: la placa solo trae 18 mm (las piezas miden 19,05) y el canto se quedó sin anchos estándar.
 let library=await send('catalog_add',{revision:0,item:{name:'Melamina Jade',kind:'sheet'}}) as {catalog:{revision:number;items:Record<string,unknown>[]}};
 library=await send('catalog_add',{revision:library.catalog.revision,item:{name:'Canto ABS sin ancho',kind:'edge'}}) as typeof library;
 const [sheet,edge]=library.catalog.items as {id:string}[];
 Object.assign(sheet,{sku:'MJ-18',supplier:'Prueba',thicknessesMm:[18],widthMm:1830,lengthMm:2750,grain:true,compatibleIds:[edge.id]});Object.assign(edge,{sku:'ABS-SA',supplier:'Prueba',thicknessMm:.8,widthsMm:[]});
 await send('catalog_save',{revision:library.catalog.revision,items:[sheet,edge]});
 await send('__bind_material',{materialName:'Jade synthetic',catalogId:sheet.id});await send('__bind_material',{materialName:'Canto de prueba',catalogId:edge.id});
 const {view,summary,groups,result}=await openPieces(page);
 const rows=summary.locator('tbody tr');
 // Con la placa vinculada, la pieza que mezclaba materiales también resuelve su placa: ya no queda «?».
 await expect(rows.locator('td.type .sr-only')).toHaveText(['Placa','Canto','Canto']);
 await expect(cells(rows.nth(0))).toHaveText(['Placa','Melamina Jade / 19,05 mm','3','1,83 m','0,74 m²','0,014 m³']);
 // El canto sin ancho en la ficha: aviso rojo en la fila y en su sección, ancho aproximado en rojo.
 await expect(cells(rows.nth(1)).nth(1)).toHaveText('Canto ABS sin ancho / 0,8 mm x 19,05 mmAncho no definido');
 await expect(rows.nth(1).locator('.cutlist-warn')).toHaveText('Ancho no definido');
 await expect(cells(rows.nth(1)).locator('nth=5')).toHaveText('0,000 m³');
 expect(result.edgeSections[0]).toMatchObject({name:'Canto ABS sin ancho',missing:['ancho'],totals:{strips:3,lengthM:1.829,areaM2:0.035,volumeM3:0.00003}});
 const tapeGroup=groups.filter({has:page.getByRole('heading',{level:3,name:'Canto ABS sin ancho / 0,8 mm x 19,05 mm'})});
 await expect(tapeGroup.locator('.cutlist-group-bar .cutlist-warn')).toHaveText('Ancho no definido');
 await expect(groups.nth(0).locator('.cutlist-grain')).toHaveText('La fibra sigue la longitud');
 // 19,05 mm no está en la lista de la ficha: se lista igual, marcado suave (no es un aviso rojo), con un clic para agregarlo.
 await expect(groups.nth(0).locator('.cutlist-group-bar .cutlist-flag')).toHaveText('Espesor fuera de la lista de la ficha');
 await expect(groups.nth(0).locator('.cutlist-group-bar .cutlist-warn')).toHaveCount(0);
 const addThickness=groups.nth(0).getByRole('button',{name:'Agregar 19,05 mm a la ficha',exact:true});await expect(addThickness).toBeVisible();
 found.push(...await axe(page,'Piezas con fichas'));
 await page.screenshot({path:info.outputPath('piezas-fichas-SINTETICO.png'),fullPage:true});

 // Exportar: CSV de lo que se ve (sin la sección oculta), guardado por Ruby con BOM UTF-8.
 await groups.nth(2).getByRole('button',{name:'Ocultar la sección Canto secundario de prueba',exact:true}).click();await expect(groups).toHaveCount(2);
 await view.getByRole('button',{name:'Exportar',exact:true}).click();
 await expect.poll(()=>replies.has('cutlist_csv')?replies.get('cutlist_csv')!.error:'pendiente').toBeNull();
 const saved=replies.get('cutlist_csv')!.result as {path:string;bytes:number};
 expect(saved.path).toBe(resolve(info.outputDir,'piezas-exportadas.csv'));
 await expect(view.locator('.cutlist-notice')).toHaveText(`CSV guardado en ${saved.path}.`);
 const bytes=await readFile(saved.path);expect([...bytes.subarray(0,3)]).toEqual([0xef,0xbb,0xbf]);
 const lines=bytes.subarray(3).toString('utf8').split('\r\n');
 expect(lines[0]).toBe('Tipo;Material;Espesor material (mm);No.;Designación;Mueble;Código;Cant.;L (mm);A (mm);E (mm);Aproximada;Aviso de la ficha');
 expect(lines.slice(1,-1)).toEqual([
  'Placa;Melamina Jade;19,05;A;Base;Bajo Mesada;;1;609,6;406,4;19,05;No;',
  'Placa;Melamina Jade;19,05;B;Lateral - Blanco;Bajo Mesada;;1;609,6;406,4;19,05;No;',
  'Placa;Melamina Jade;19,05;C;Base ajena;Otro mueble;;1;609,6;406,4;19,05;No;',
  'Canto;Canto ABS sin ancho;0,8;A;Base – Longitud del borde 1;Bajo Mesada;;1;609,6;19,05;0,8;Sí;Ancho no definido',
  'Canto;Canto ABS sin ancho;0,8;B;Lateral - Blanco – Longitud del borde 1;Bajo Mesada;;1;609,6;19,05;0,8;Sí;Ancho no definido',
  'Canto;Canto ABS sin ancho;0,8;C;Base ajena – Longitud del borde 1;Otro mueble;;1;609,6;19,05;0,8;Sí;Ancho no definido']);
 expect(lines.at(-1)).toBe('');

 // Un clic agrega 19,05 mm a los espesores de la ficha y el listado se vuelve a leer, sin la marca.
 await addThickness.click();
 await expect(view.locator('.cutlist-notice')).toHaveText('19,05 mm agregado a los espesores de «Melamina Jade».');
 expect(calls.filter(call=>call.action==='catalog_add_thickness').map(call=>call.data)).toEqual([{id:sheet.id,thicknessMm:19.05}]);
 await expect(view.locator('.cutlist-group-bar .cutlist-flag')).toHaveCount(0);

 // Lápiz: abre la ficha de la placa en Materiales.
 await summary.getByRole('button',{name:'Editar la ficha de Melamina Jade en Materiales',exact:true}).click();
 await expect(rail(page,'Materiales')).toHaveAttribute('aria-current','page');
 const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});await expect(panel).toBeVisible();
 await expect(panel.getByRole('group',{name:'Materiales de biblioteca'}).getByRole('button',{name:/Melamina Jade/})).toHaveAttribute('aria-pressed','true');
 expect(found).toEqual([]);
});
