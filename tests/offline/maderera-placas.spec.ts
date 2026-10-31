import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// 0.8.20 «Maderera» (pedido de Gabriel): la sección queda solo con la optimización de las placas de todo el proyecto
// (material + espesor real de la pieza) y un TXT por placa en el formato que acepta la maderera. Sin perfil de maderera,
// biblioteca ni pedido pieza por pieza. Controlador Ruby real con dobles sintéticos de SketchUp (names_bridge_driver.rb,
// modo materials-cutlist): placas, cantos y SKU inventados. No es SketchUp real.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:string[],boardRotations:boolean[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];actions=[];boardRotations=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'materials-cutlist'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',(message:string)=>{const request=JSON.parse(message);actions.push(request.action);if(request.action==='maderera_boards')boardRotations.push(request.data.rotate===true);return raw(message);});
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
/** Biblioteca sintética vinculada a los materiales pintados del doble (sin UI de pintado). */
async function library(sheet:Record<string,unknown>,extraSheet=false){
 let lib=await send('catalog_add',{revision:0,item:{name:'Melamina Jade',kind:'sheet'}}) as Library;
 lib=await send('catalog_add',{revision:lib.catalog.revision,item:{name:'Canto Jade',kind:'edge'}}) as Library;
 if(extraSheet)lib=await send('catalog_add',{revision:lib.catalog.revision,item:{name:'Placa gris',kind:'sheet'}}) as Library;
 const [board,edge,gray]=lib.catalog.items;
 Object.assign(board,{sku:'JADE-SINT',supplier:'Prueba',thicknessMm:19.05,widthMm:1830,lengthMm:2750,grain:true,...sheet});Object.assign(edge,{sku:'CJ-SINT',supplier:'Prueba',thicknessMm:.8,widthMm:22});
 if(gray)Object.assign(gray,{sku:'GRIS-SINT',supplier:'Prueba',thicknessMm:19.05,widthMm:1830,lengthMm:2750,grain:false});
 await send('catalog_save',{revision:lib.catalog.revision,items:lib.catalog.items});
 await send('__bind_material',{materialName:'Jade synthetic',catalogId:board.id});await send('__bind_material',{materialName:'Canto de prueba',catalogId:edge.id});
 if(gray)await send('__bind_material',{materialName:'Placa sin aplicar',catalogId:gray.id});
 return {board,edge};
}
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
async function openMaderera(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await rail(page,'Maderera').click();
 const region=page.getByRole('region',{name:'Optimización de placas'});await expect(region.getByRole('list',{name:'Materiales y espesores del proyecto'})).toBeVisible();return region;
}
const validate=(path:string)=>['scripts/validar_txt_maderera.py','scripts/validar_pedido_txt.py'].map(script=>{const run=spawnSync('python3',[script,path],{encoding:'utf8'});return `${basename(script)}:${run.status}:${run.stderr.trim()}`;});
const ok=['validar_txt_maderera.py:0:','validar_pedido_txt.py:0:'];
async function axe(page:Page){
 const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).include('.ux-order-content').analyze();
 return violations.map(v=>`${v.impact} ${v.id}: ${v.nodes.map(n=>n.target.join(' ')).join(' ; ')}`);
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('maderera: solo la optimización por placa, corte simple recordado y un TXT por placa validado',async({page},info)=>{
 await boot(page,info.outputDir);await library({});
 const region=await openMaderera(page);
 // Lo que se quitó: perfil, biblioteca, pedido pieza por pieza, problemas del pedido, presupuesto y OpenCutList.
 for(const name of ['Biblioteca','Pedido maderera','Perfil de maderera','Optimización y presupuesto'])await expect(region.getByRole('button',{name,exact:true})).toHaveCount(0);
 for(const text of ['Problemas del pedido','Ver detalle por pieza','Presupuesto','Perfil del archivo','Pieza del pedido'])await expect(region.getByText(text)).toHaveCount(0);
 // Corte de la seccionadora: tres campos simples con los sugeridos.
 const cut=region.getByRole('group',{name:'Corte de la seccionadora'});
 await expect(cut.getByLabel('Disco (kerf) mm')).toHaveValue('4');await expect(cut.getByLabel('Refilado por lado mm')).toHaveValue('10');
 await expect(cut.getByRole('checkbox',{name:'Girar piezas en placas sin veta (rota 1)'})).not.toBeChecked();
 const optim=region.getByRole('region',{name:'Placas del proyecto'});
 const card=optim.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'});
 await expect(card).toContainText('JADE-SINT · con veta');await expect(card).toContainText('2.750 × 1.830 mm');await expect(card).toContainText('TXT listo');
 await expect(optim.getByRole('img')).toHaveCount(0);await card.click();
 // Una sección por placa: cifras, cantos para el portal, diagrama y su botón de TXT.
 const board=optim.getByRole('region',{name:'Melamina Jade · 19,05 mm'});
 await expect(board.getByRole('img',{name:/^Placa 1 de 1: 3 piezas, aprovechamiento \d+,\d\s?%\. Placa 2\.750 × 1\.830 mm, veta a lo largo\.$/})).toBeVisible();
 await expect(board.getByRole('list',{name:'Cantos de Melamina Jade · 19,05 mm'})).toContainText('Canto 1 Canto Jade · CJ-SINT · ancho 22 mm');
 const fileName=(await board.locator('.workshop-board-export small').textContent())!.replace(/^Archivo: /,'');
 expect(fileName).toMatch(/^.+-Melamina Jade-19,05mm\.txt$/);
 await expect(region.getByRole('region',{name:'Total de cantos del proyecto'}).locator('tbody tr')).toHaveCount(1);
 expect(await axe(page)).toEqual([]);
 await page.screenshot({path:info.outputPath('maderera-placas-SINTETICO.png'),fullPage:true});

 // TXT de la placa: diálogo de guardado nativo con obra-material-espesor.txt; medidas de las piezas, no del diagrama.
 await board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm',exact:true}).click();
 const status=region.getByRole('status').first();
 await expect(status).toContainText(`TXT de Melamina Jade · 19,05 mm guardado en ${join(info.outputDir,fileName)}: 3 piezas`);
 await expect(status).toContainText('En el portal elegí Melamina Jade de 19,05 mm, canto 1 CJ-SINT.');
 const single=join(info.outputDir,fileName),bytes=await readFile(single);
 expect([...bytes.subarray(0,3)]).not.toEqual([0xef,0xbb,0xbf]);expect(validate(single)).toEqual(ok);
 const lines=bytes.toString('utf8').split('\r\n');expect(lines.at(-1)).toBe('');
 const cells=lines.slice(0,-1).map(line=>line.split('\t'));expect(cells.every(c=>c.length===9&&c[4]==='0')).toBe(true);
 expect(cells.reduce((sum,c)=>sum+Number(c[0]),0)).toBe(3);expect(new Set(cells.map(c=>`${c[1]}×${c[2]}`))).toEqual(new Set(['609.6×406.4']));

 // Disco, refilado y giro se recuerdan en esta computadora: al volver a la sección siguen los elegidos.
 await cut.getByLabel('Disco (kerf) mm').fill('3.2');await cut.getByLabel('Refilado por lado mm').fill('15');
 await cut.getByLabel('Refilado por lado mm').fill('99');await expect(cut.getByText('Entre 0 y 50 mm. Se sigue usando 15 mm.')).toBeVisible();await cut.getByLabel('Refilado por lado mm').fill('15');
 await cut.getByRole('checkbox',{name:'Girar piezas en placas sin veta (rota 1)'}).check();
 await expect(cut.getByLabel('Disco (kerf) mm')).toHaveValue('3.2');
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('planos-santo.maderera.corte.v1'))||'{}')).toEqual({kerfMm:3.2,trimMm:15,allowRotate:true});
 await rail(page,'Inicio').click();await rail(page,'Maderera').click();
 await expect(page.getByRole('region',{name:'Optimización de placas'}).getByLabel('Disco (kerf) mm')).toHaveValue('3.2');
 await expect(page.getByRole('region',{name:'Optimización de placas'}).getByLabel('Refilado por lado mm')).toHaveValue('15');

 // «Exportar todos»: un TXT por placa en una carpeta nueva. Placa con veta: aunque se pida girar, rota 0.
 const again=page.getByRole('region',{name:'Optimización de placas'});
 await again.getByRole('button',{name:'Exportar todos los TXT…',exact:true}).click();
 await expect(again.getByRole('status').first()).toContainText(`1 TXT guardado en ${info.outputDir}`);
 const folder=(await readdir(info.outputDir)).find(name=>/-maderera-\d{8}-\d{4}$/.test(name))!;expect(folder).toBeTruthy();
 expect(await readdir(join(info.outputDir,folder))).toEqual([fileName]);
 const all=join(info.outputDir,folder,fileName);expect(validate(all)).toEqual(ok);expect(await readFile(all)).toEqual(bytes);
 // Ni pedido, ni perfil: nada se guardó en el modelo ni en los perfiles.
 expect(actions.filter(a=>/^order_|^maderera_profile/.test(a))).toEqual([]);
 expect(actions).toEqual(expect.arrayContaining(['maderera_boards','maderera_txt']));
});

test('maderera: una pieza que no entra en la medida útil avisa, una que no entra en la placa frena su TXT y las piezas sin placa se listan',async({page},info)=>{
 await boot(page,info.outputDir);const {board:sheet}=await library({lengthMm:620,widthMm:420,grain:false},true);
 const region=await openMaderera(page),optim=region.getByRole('region',{name:'Placas del proyecto'});
 await optim.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'}).click();
 // La pieza que lleva dos placas pintadas no va a ninguna placa: se lista con el motivo.
 await expect(region.getByRole('list',{name:'Piezas fuera de las placas'})).toContainText(/1 pieza sin placa de Materiales: .+\. Pintalas con una sola placa de Materiales\./);
 const board=optim.getByRole('region',{name:'Melamina Jade · 19,05 mm'});
 // 620 × 420 con 10 mm de refilado deja 600 × 400: la pieza de 609,6 × 406,4 entra en la placa pero no en la medida útil.
 await expect(board.getByRole('list',{name:'Avisos de Melamina Jade · 19,05 mm'})).toContainText('2 piezas no entran en la medida útil de 600 × 400 mm (después del refilado)');
 await expect(board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm',exact:true})).toBeEnabled();
 // Con una placa más chica que la pieza, Ruby frena ese TXT y dice por qué; se puede ver la pieza en el modelo.
 const lib=await send('catalog_load') as Library,items=lib.catalog.items.map(item=>item.id===sheet.id?{...item,lengthMm:600,widthMm:400}:item);
 await send('catalog_save',{revision:lib.catalog.revision,items});
 await region.getByRole('button',{name:'Actualizar desde el modelo',exact:true}).click();
 const problems=board.getByRole('list',{name:'Problemas de Melamina Jade · 19,05 mm'});await expect(problems.locator(':scope > li')).toHaveCount(2);
 await expect(problems).toContainText('La pieza no entra en la placa: mide 609,6 × 406,4 mm y la placa es 600 × 400 mm.');
 await expect(board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm',exact:true})).toBeDisabled();
 await expect(region.getByRole('button',{name:'Exportar todos los TXT…',exact:true})).toBeDisabled();
 await expect(board.getByText('No se puede exportar: resolvé los problemas de abajo.')).toBeVisible();
 await problems.getByRole('button',{name:/^Ver en el modelo/}).first().click();await expect(region.getByRole('status').first()).toHaveText('Pieza resaltada en SketchUp. Volvé a esta ventana para seguir.');
 expect(await axe(page)).toEqual([]);
 expect(actions.filter(a=>a==='maderera_txt')).toEqual([]);
});


test('girar una placa sin veta revalida los botones y el TXT; volver a bloquear giro impide exportar',async({page},info)=>{
 await boot(page,info.outputDir);await library({lengthMm:500,widthMm:700,grain:false});
 const region=await openMaderera(page);
 // El doble mide 609,6 × 406,4: entra en 500 × 700 solamente girado. Para aislar este caso, el borrador
 // de ensayo tiene todas las piezas sin cantos (con cantos asimétricos Ruby debe seguir bloqueando).
 const {plan}=await send('order_plan') as {plan:{rows:Record<string,unknown>[]}};
 plan.rows.forEach(row=>Object.assign(row,{principalId:null,secondaryId:null,edgeMap:[0,0,0,0]}));
 await send('order_save',{plan});
 await region.getByRole('button',{name:'Actualizar desde el modelo',exact:true}).click();
 await region.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'}).click();
 const board=region.getByRole('region',{name:'Melamina Jade · 19,05 mm'});
 const button=board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm',exact:true});
 const all=region.getByRole('button',{name:'Exportar todos los TXT…',exact:true});
 const rotate=region.getByRole('checkbox',{name:'Girar piezas en placas sin veta (rota 1)'});
 await expect(button).toBeDisabled();await expect(all).toBeDisabled();
 await expect(board.getByRole('list',{name:'Problemas de Melamina Jade · 19,05 mm'})).toContainText('no entra en la placa');
 await rotate.check();
 await expect(button).toBeEnabled();await expect(all).toBeEnabled();
 await expect(board.getByRole('list',{name:'Problemas de Melamina Jade · 19,05 mm'})).toHaveCount(0);
 expect(boardRotations.at(-1)).toBe(true);
 await button.click();await expect(region.getByRole('status').first()).toContainText('TXT de Melamina Jade · 19,05 mm guardado');
 const file=(await board.locator('.workshop-board-export small').textContent())!.replace(/^Archivo: /,'');
 const cells=(await readFile(join(info.outputDir,file),'utf8')).trim().split('\r\n').map(line=>line.split('\t'));
 expect(cells.every(row=>row.length===9&&row[4]==='1')).toBe(true);
 expect(validate(join(info.outputDir,file))).toEqual(ok);
 await rotate.uncheck();
 await expect(button).toBeDisabled();await expect(all).toBeDisabled();
 await expect(board.getByRole('list',{name:'Problemas de Melamina Jade · 19,05 mm'})).toContainText('no entra en la placa');
 expect(boardRotations.at(-1)).toBe(false);
});

test('Experto: ficha real, giro con canto asimétrico, compra +15 %, método persistido y regreso a General',async({page},info)=>{
 await boot(page,info.outputDir);const {edge}=await library({grain:false});
 const region=await openMaderera(page),method=region.getByLabel('Método de optimización');await expect(method).toHaveValue('general');
 const cut=region.getByRole('group',{name:'Corte de la seccionadora'});await cut.getByLabel('Disco (kerf) mm').fill('3.2');await cut.getByLabel('Refilado por lado mm').fill('15');
 const data=await send('maderera_boards',{method:'general',rotate:false}) as {boards:{rowIds:string[]}[]};
 const {plan}=await send('order_plan') as {plan:{rows:Record<string,unknown>[]}};const included=new Set(data.boards[0].rowIds);
 plan.rows.forEach(row=>Object.assign(row,{include:included.has(String(row.id)),excludeReason:included.has(String(row.id))?'':'Fuera del ensayo',principalId:edge.id,secondaryId:null,edgeMap:[1,0,0,0]}));await send('order_save',{plan});await region.getByRole('button',{name:'Actualizar desde el modelo',exact:true}).click();
 const edges=region.getByRole('region',{name:'Total de cantos del proyecto'});await expect(edges.locator('tbody tr td').nth(1)).toHaveText('2 metros');
 await method.selectOption('experto');await expect(cut).toHaveCount(0);await expect(region.getByText(/Experto: disco 4,4 mm/)).toBeVisible();
 const open=region.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'});await expect(open).toContainText('2.750 × 1.830 mm');await open.click();
 const board=region.getByRole('region',{name:'Melamina Jade · 19,05 mm',exact:true});await expect(board.getByRole('img')).toHaveCount(1);await expect(board).toContainText('Recorrido de sierra estimado');await expect(board.getByRole('img')).toHaveAttribute('aria-label',/2\.750 × 1\.830 mm/);
 await expect(edges.locator('tbody tr td').nth(1)).toHaveText('3 metros');await expect(edges).toContainText('Incluye 15 % de margen');
 await board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm'}).click();await expect(region.getByRole('status').first()).toContainText('TXT de Melamina Jade · 19,05 mm guardado');
 const file=(await board.locator('.workshop-board-export small').textContent())!.replace(/^Archivo: /,'');const rows=(await readFile(join(info.outputDir,file),'utf8')).trim().split('\r\n').map(row=>row.split('\t'));expect(rows.every(row=>row.length===9&&row[4]==='1')).toBe(true);expect(validate(join(info.outputDir,file))).toEqual(ok);
 expect(rows.every(row=>row.slice(5).filter(value=>value==='1').length===1)).toBe(true);
 expect(await axe(page)).toEqual([]);await page.screenshot({path:info.outputPath('experto-detalle-SINTETICO.png'),fullPage:true});
 await rail(page,'Inicio').click();await rail(page,'Maderera').click();await expect(method).toHaveValue('experto');await expect(cut).toHaveCount(0);
 await method.selectOption('general');await expect(cut.getByLabel('Disco (kerf) mm')).toHaveValue('3.2');await expect(cut.getByLabel('Refilado por lado mm')).toHaveValue('15');await expect(cut.getByRole('checkbox',{name:'Girar piezas en placas sin veta (rota 1)'})).not.toBeChecked();await expect(edges.locator('tbody tr td').nth(1)).toHaveText('2 metros');
 await region.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'}).click();await board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm'}).click();await expect(region.getByRole('status').first()).toContainText('TXT de Melamina Jade · 19,05 mm guardado');const general=(await readFile(join(info.outputDir,file),'utf8')).trim().split('\r\n').map(row=>row.split('\t'));expect(general.every(row=>row[4]==='0')).toBe(true);
});

test('Piezas abre directamente la optimización del material y espesor y permite ampliar el plano',async({page},info)=>{
 await boot(page,info.outputDir);await library({});await openMaderera(page);
 await rail(page,'Piezas').click();
 await page.getByRole('button',{name:/Ver optimización de Melamina Jade/}).click();
 const region=page.getByRole('region',{name:'Optimización de placas'});
 await expect(region.getByRole('region',{name:'Melamina Jade · 19,05 mm',exact:true})).toBeVisible();
 await region.getByLabel('Ampliación del diagrama').selectOption('1.5');
 await expect(region.locator('.workshop-sheets')).toHaveAttribute('style',/150%/);
 await region.getByLabel('Ampliación del diagrama').selectOption('1');
 expect(await axe(page)).toEqual([]);
 await page.screenshot({path:info.outputPath('maderera-0825.png'),fullPage:true});
});

test('con la guía sin guardar, Maderera optimiza igual y el TXT avisa que usa los nombres guardados',async({page},info)=>{
 await boot(page,info.outputDir);await library({});
 // Guías generadas y sin guardar: antes Ruby frenaba con «Guardá los cambios de la guía antes de preparar el pedido».
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toBeEnabled();
 await rail(page,'Maderera').click();
 const region=page.getByRole('region',{name:'Optimización de placas'});
 await expect(region.getByRole('list',{name:'Materiales y espesores del proyecto'})).toBeVisible();
 await expect(page.getByText('Guardá los cambios de la guía antes de preparar el pedido.')).toHaveCount(0);
 await expect(region.getByRole('note')).toContainText('La guía tiene cambios sin guardar. La optimización no depende de ellos');
 const optim=region.getByRole('region',{name:'Placas del proyecto'});
 await optim.getByRole('button',{name:'Ver optimización de Melamina Jade · 19,05 mm'}).click();
 const board=optim.getByRole('region',{name:'Melamina Jade · 19,05 mm'});
 await expect(board.getByRole('img',{name:/^Placa 1 de 1: 3 piezas/})).toBeVisible();
 const fileName=(await board.locator('.workshop-board-export small').textContent())!.replace(/^Archivo: /,'');
 await board.getByRole('button',{name:'Exportar TXT de Melamina Jade · 19,05 mm',exact:true}).click();
 const status=region.getByRole('status').first();
 await expect(status).toContainText(`guardado en ${join(info.outputDir,fileName)}: 3 piezas`);
 await expect(status).toContainText('La guía tiene cambios sin guardar: los nombres y códigos del TXT son los de la última guía guardada.');
 expect(validate(join(info.outputDir,fileName))).toEqual(ok);
 expect(await axe(page)).toEqual([]);
 // El pedido viejo, que escribe su borrador en el modelo, sigue pidiendo guardar la guía.
 const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'order_plan',data:{}}));
 expect(reply.error).toContain('Guardá los cambios de la guía antes de preparar el pedido.');
});
