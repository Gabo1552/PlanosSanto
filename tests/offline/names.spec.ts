import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,copyFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
let saveRequests:unknown[],saveReplies:Reply[],actions:Map<string,string>;
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[];
type Reply={version:1;id:string;result:unknown;error:string|null};
type Snapshot={definitionGuids:string[];simulatedSaves:number;names:Record<string,string>;definitions:string[];operations:unknown[][];geometryHash:string;guide:{workCode?:string;revision:number;furniture:{groupIdentical?:boolean;presentation?:{hideIds?:boolean;cameras?:{front?:{yaw:number;pitch:number};back?:{yaw:number;pitch:number}};dimensionOffsets?:{offset:[number,number]}[]};pieces:{id:string;code:string;name:string}[];notes:unknown[]}[]}};
async function send(action:string,data:unknown={}){
 const msg={version:1,id:randomUUID(),action,data};return raw(JSON.stringify(msg));
}
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);actions.set(msg.id,msg.action);if(msg.action==='save')saveRequests.push(msg.data);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function snapshot(){const r=await send('__names_inspect');expect(r.error).toBeNull();return r.result as Snapshot;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];saveRequests=[];saveReplies=[];actions=new Map();
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);if(actions.get(reply.id)==='save')saveReplies.push(reply);const p=pending.get(reply.id);if(p){pending.delete(reply.id);p.resolve(reply);}});
 child.on('exit',()=>{for(const p of pending.values())p.reject(new Error('Terminó el driver sintético.'));pending.clear();});
 await page.exposeFunction('namesNativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('configuración integrada: grupo y piezas se editan viendo el dibujo y se sincronizan en una operación',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await expect(page.getByRole('button',{name:'Nombres de grupos y piezas',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();
 await expect(page.getByLabel('Nombre P02',{exact:true})).toBeFocused();
 await expect(page.locator('[data-piece-row="1/13/12"]')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.selected-piece-summary')).toContainText('P02');
 const chart=await page.locator('.diagram').boundingBox(),field=await page.getByLabel('Nombre P02',{exact:true}).boundingBox();
 expect(field!.y).toBeGreaterThanOrEqual(0);expect(field!.y+field!.height).toBeLessThanOrEqual(1100);
 expect(chart!.x).toBeGreaterThanOrEqual(0);expect(chart!.x+chart!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 // The wide Muebles workspace places the drawing on the right; compact windows keep it on the left.
 expect(chart!.x+chart!.width<field!.x||field!.x+field!.width<chart!.x).toBe(true);expect(Math.max(chart!.y,field!.y)).toBeLessThan(Math.min(chart!.y+chart!.height,field!.y+field!.height));
 await page.getByLabel('Nombre P02',{exact:true}).fill('Puerta derecha');
 await page.getByLabel('Nombre del grupo',{exact:true}).fill('M01 Estantería izq. Util.');
 await expect(page.getByLabel('Módulo de este mueble')).toHaveValue('M01');
 expect(await snapshot()).toEqual(before);
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const after=await snapshot();expect(after.names['1']).toBe('M01 Estantería izq. Util.');expect(after.names['12']).toBe('Puerta derecha');
 expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);expect(after.operations.filter(op=>op[0]==='start')).toHaveLength(1);
 await page.reload();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByLabel('Nombre del grupo',{exact:true})).toHaveValue('M01 Estantería izq. Util.');await expect(page.getByLabel('Nombre P02',{exact:true})).toHaveValue('Puerta derecha');
 await page.screenshot({path:'artifacts/configuracion-integrada-061.png',fullPage:true});
});

test('configuración integrada bloquea nombres compartidos sin escrituras parciales',async({page},info)=>{
 await boot(page,info.outputDir,'shared');const before=await snapshot();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral nuevo');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/compartid/);
 expect(await snapshot()).toEqual(before);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('configuración integrada detecta cambios externos y muestra texto sin ejecutar HTML',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByLabel('Nombre P01',{exact:true}).fill('<img src=x onerror=evil()>');
 await expect(page.locator('.selected-piece-summary')).toContainText('<img src=x onerror=evil()>');expect(await page.locator('.parts-config img').count()).toBe(0);
 await send('__names_external');await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/cambi[oó]/);
 expect((await snapshot()).operations).toHaveLength(0);
 await page.getByRole('button',{name:'Volver a analizar',exact:true}).click();await page.getByRole('alertdialog',{name:'Descartar cambios y volver a analizar'}).getByRole('button',{name:'Descartar y analizar',exact:true}).click();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre del grupo',{exact:true})).toHaveValue('Alacena externa');
});

test('grupo y pieza conservan notas/códigos y Undo revierte la operación completa',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Nota original que debe conservarse');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const before=await snapshot();await page.getByLabel('Nombre del grupo',{exact:true}).fill('M08 Alacena');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral derecho');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const after=await snapshot();expect(after.guide.furniture[0].notes).toEqual(before.guide.furniture[0].notes);expect(after.guide.furniture[0].pieces.map(p=>[p.id,p.code])).toEqual(before.guide.furniture[0].pieces.map(p=>[p.id,p.code]));
 expect(after.names['1']).toBe('M08 Alacena');expect(after.names['11']).toBe('Lateral derecho');expect(after.geometryHash).toBe(before.geometryHash);
 await send('__names_undo');const undo=await snapshot();expect(undo.names).toEqual(before.names);expect(undo.guide).toEqual(before.guide);
});

test('obra/módulo/tabla sincronizan instancias; rotación, ID y cota se guardan y llegan a la A4',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await page.getByLabel('Abreviatura de la obra').fill('VF');
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByLabel('Módulo de este mueble').fill('M01');
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral');
 await expect(page.locator('tbody tr').first()).toContainText('VF M01 Lateral');
 await page.getByRole('button',{name:'Otro mueble 1 piezas',exact:true}).click();
 await page.getByLabel('Módulo de este mueble').fill('M02');
 await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();
 expect((await snapshot()).operations).toEqual([]);
 await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();
 const original=await page.locator('[data-piece] polygon, polygon[data-piece]').first().getAttribute('points');
 await page.getByRole('slider',{name:'Giro horizontal',exact:true}).press('ArrowRight');
 expect(await page.locator('polygon[data-piece]').first().getAttribute('points')).not.toBe(original);
 await page.getByRole('button',{name:'Rotar con el mouse',exact:true}).click();
 await page.locator('.diagram').scrollIntoViewIfNeeded();
 const svg=await page.locator('.diagram').boundingBox();
 await page.mouse.move(svg!.x+svg!.width*.75,svg!.y+svg!.height*.8);await page.mouse.down();await page.mouse.move(svg!.x+svg!.width*.75+20,svg!.y+svg!.height*.8-4,{steps:3});await page.mouse.up();
 const yaw=Number(await page.getByRole('slider',{name:'Giro horizontal',exact:true}).inputValue());expect(yaw).toBeGreaterThan(1);
 await page.getByRole('button',{name:'Ver interior',exact:true}).click();await expect(page.getByRole('slider',{name:'Giro horizontal',exact:true})).toHaveValue(String(yaw));
 await page.getByRole('button',{name:'Ver exterior',exact:true}).click();
 await page.getByRole('checkbox',{name:'Mostrar IDs en el dibujo'}).uncheck();await expect(page.locator('[data-label]')).toHaveCount(0);
 await page.getByRole('button',{name:'Mover cotas',exact:true}).click();await expect(page.locator('.diagram')).toHaveAttribute('data-layout','sheet');
 const dimension=page.getByRole('button',{name:/^Mover cota P01 largo:/});await dimension.focus();await page.keyboard.press('ArrowDown');
 const beforeDrag=await dimension.boundingBox();await page.mouse.move(beforeDrag!.x+beforeDrag!.width/2,beforeDrag!.y+beforeDrag!.height/2);await page.mouse.down();await page.mouse.move(beforeDrag!.x+beforeDrag!.width/2+7,beforeDrag!.y+beforeDrag!.height/2+2,{steps:2});await page.mouse.up();
 const afterDrag=await dimension.boundingBox();expect(afterDrag!.x).toBeGreaterThan(beforeDrag!.x+5);
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Guardar también el archivo SKP'}).uncheck();
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const saved=await snapshot();expect(saved.names['11']).toBe('VF M01 Lateral');expect(saved.names['12']).toBe('VF M01 Base');expect(saved.names['21']).toBe('VF M02 Base ajena');
 expect(saved.geometryHash).toBe(before.geometryHash);expect(saved.definitions).toEqual(before.definitions);
 expect(saved.operations.filter(op=>op[0]==='start')).toHaveLength(1);expect(saved.guide.workCode).toBe('VF');
 expect(saved.guide.furniture[0].presentation?.hideIds).toBe(true);expect(saved.guide.furniture[0].presentation?.cameras?.front?.yaw).toBeCloseTo(yaw,5);
 expect(saved.guide.furniture[0].presentation?.dimensionOffsets?.[0].offset[1]).toBeGreaterThan(0);
 await page.reload();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByLabel('Abreviatura de la obra')).toHaveValue('VF');await expect(page.getByLabel('Nombre P01',{exact:true})).toHaveValue('Lateral');await expect(page.locator('[data-label]')).toHaveCount(0);
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');
 const pdfPath=resolve(info.outputDir,'PlanosSanto-A4.pdf');
 const text=execFileSync('pdftotext',['-raw',pdfPath,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');expect(text).toContain('VF M01 Lateral');expect(text).toContain('VF M02 Base ajena');
 const drawing=execFileSync('pdftotext',['-f','1','-l','1','-x','22','-y','124','-W','504','-H','405','-raw',pdfPath,'-'],{encoding:'utf8'});expect(drawing).not.toContain('P01');
 await copyFile(pdfPath,'artifacts/ajustes-060-SINTETICO-A4.pdf');await page.screenshot({path:'artifacts/ajustes-060-complemento.png',fullPage:true});
});

test('el nuevo número del grupo se toma al analizar y recompone nombres sin acumular prefijos',async({page},info)=>{
 await boot(page,info.outputDir);await send('__names_external',{name:'M01 Estantería izq. Util.'});await page.getByRole('button',{name:'Volver a analizar',exact:true}).click();
 await page.getByLabel('Abreviatura de la obra').fill('VF');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByLabel('Módulo de este mueble')).toHaveValue('M01');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral');
 await page.getByRole('button',{name:'Otro mueble 1 piezas',exact:true}).click();await page.getByLabel('Módulo de este mueble').fill('M02');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await send('__names_external',{name:'M03 Estantería izq. Util.'});await page.getByRole('button',{name:'Volver a analizar',exact:true}).click();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByLabel('Módulo de este mueble')).toHaveValue('M03');await expect(page.locator('tbody tr').first()).toContainText('VF M03 Lateral');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 expect((await snapshot()).names['11']).toBe('VF M03 Lateral');
});

test('en 1000 px la pieza y su nombre quedan visibles al seleccionarla en el dibujo',async({page},info)=>{
 await page.setViewportSize({width:1000,height:760});await boot(page,info.outputDir);
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();
 const input=page.getByLabel('Nombre P02',{exact:true});await expect(input).toBeFocused();
 const field=await input.boundingBox(),chart=await page.locator('.diagram').boundingBox();
 expect(field!.y).toBeGreaterThanOrEqual(0);expect(field!.y+field!.height).toBeLessThanOrEqual(760);
 expect(chart!.x+chart!.width).toBeLessThan(field!.x);
 const face=await page.locator('polygon[data-piece="1/13/12"]').first().boundingBox();
 expect(Math.min(face!.y+face!.height,760)-Math.max(face!.y,0)).toBeGreaterThan(50);
 await input.fill('Estante');await expect(page.locator('.selected-piece-summary')).toContainText('Estante');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:'artifacts/configuracion-integrada-061-1000px.png',fullPage:false});
});


test('Guardar y cerrar solicita el cierre solo después de guardar y mantiene el estado si se cancela el SKP',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Guardar y cerrar',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 expect(saveRequests[0]).toMatchObject({closeAfterSave:true,saveFile:true});expect(saveReplies[0].result).toMatchObject({modelSaved:false,closeAfterSave:false});
 await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Guardar también el archivo SKP'}).uncheck();
 await page.getByRole('button',{name:'Guardar y cerrar',exact:true}).click();
 await expect.poll(()=>saveReplies.length).toBe(2);
 expect(saveRequests[1]).toMatchObject({closeAfterSave:true,saveFile:false});expect(saveReplies[1].result).toMatchObject({closeAfterSave:true});
 // The native HtmlDialog close and cancellation checks are exercised in controller_test.rb.
});


test('guardar SKP y exportar sin regenerar tolera revisiones internas y sigue bloqueando geometría real modificada',async({page},info)=>{
 await boot(page,info.outputDir,'save-revision');const before=await snapshot();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByLabel('Nombre del grupo',{exact:true}).fill('M01 Estantería');
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral guardado');
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
 await page.getByLabel('Texto de la nota').fill('Alinear antes de fijar');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía y archivo SketchUp guardados.',{exact:true})).toBeVisible();
 const saved=await snapshot();expect(saved.simulatedSaves).toBe(1);expect(saved.definitionGuids).not.toEqual(before.definitionGuids);expect(saved.geometryHash).toBe(before.geometryHash);
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');const pdfPath=resolve(info.outputDir,'PlanosSanto-A4.pdf');
 const pdfText=execFileSync('pdftotext',['-raw',pdfPath,'-'],{encoding:'utf8'});expect(pdfText).toContain('Lateral guardado');expect(pdfText).toContain('Alinear antes de fijar');
 expect(execFileSync('pdfinfo',[pdfPath],{encoding:'utf8'})).toMatch(/Pages:\s+2/);
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral definitivo');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía y archivo SketchUp guardados.',{exact:true})).toBeVisible();
 const resaved=await snapshot();expect(resaved.simulatedSaves).toBe(2);expect(resaved.guide.revision).toBe(2);expect(resaved.geometryHash).toBe(before.geometryHash);expect(resaved.guide.furniture[0].notes).toEqual(saved.guide.furniture[0].notes);
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 expect(execFileSync('pdftotext',['-raw',pdfPath,'-'],{encoding:'utf8'})).toContain('Lateral definitivo');
 const validPdf=await readFile(pdfPath);
 await copyFile(pdfPath,'artifacts/guardado-exportacion-062-SINTETICO-A4.pdf');
 await send('__names_geometry');await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByRole('alert')).toContainText('La geometría o la selección cambió');
 expect(await readFile(pdfPath)).toEqual(validPdf);expect((await snapshot()).guide).toEqual(resaved.guide);
});


test('buscar, recorrer y resaltar piezas no modifica el modelo ni omite piezas del PDF',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByLabel('Nombre P01',{exact:true}).fill('Láteral derecho');
 await page.getByRole('searchbox',{name:'Buscar piezas',exact:true}).fill('LATERAL');
 await expect(page.locator('[data-piece-row]')).toHaveCount(1);
 await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
 // Renaming a search result must not remove the focused field midway through typing.
 await page.getByLabel('Nombre P01',{exact:true}).fill('Costado nuevo');await expect(page.getByLabel('Nombre P01',{exact:true})).toBeFocused();
 await page.getByRole('searchbox',{name:'Buscar piezas',exact:true}).fill('p02');
 await expect(page.locator('[data-piece-row]')).toHaveCount(1);await expect(page.getByLabel('Nombre P02',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Seleccionar P01',exact:true}).focus();await page.keyboard.press('Space');
 await expect(page.getByRole('searchbox',{name:'Buscar piezas',exact:true})).toHaveValue('');await expect(page.getByLabel('Nombre P01',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Seleccionada',exact:true}).click();await expect(page.locator('[data-piece-row]')).toHaveCount(1);
 await page.getByRole('button',{name:'Pieza siguiente',exact:true}).click();await expect(page.getByLabel('Nombre P02',{exact:true})).toBeFocused();
 await expect(page.getByRole('button',{name:'Pieza siguiente',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
 expect(await page.locator('polygon[data-piece="1/11"]').first().evaluate(el=>el.parentElement?.getAttribute('opacity'))).toBe('0.22');
 await expect(page.locator('[data-label]')).toHaveCount(1);
 await expect(page.locator('[data-label]')).toHaveAttribute('data-label','P02');
 expect(await snapshot()).toEqual(before);
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');const text=execFileSync('pdftotext',['-f','1','-l','1','-raw',resolve(info.outputDir,'PlanosSanto-A4.pdf'),'-'],{encoding:'utf8'});
 expect(text).toContain('P01');expect(text).toContain('P02');expect(text).toContain('Costado nuevo');
 await page.getByRole('searchbox',{name:'Buscar piezas',exact:true}).fill('no existe');await expect(page.locator('[data-piece-row]')).toHaveCount(0);
 await expect(page.getByText('No hay piezas con ese filtro',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mostrar todas las piezas',exact:true}).click();await expect(page.locator('[data-piece-row]')).toHaveCount(2);
});

test('herramientas visibles, medidas completas y dibujo junto al nombre a 1000 px',async({page},info)=>{
 await page.setViewportSize({width:1000,height:760});await boot(page,info.outputDir);
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();await expect(page.getByLabel('Nombre P02',{exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.parts-config .table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const diagram=await page.locator('.diagram').boundingBox(),name=await page.getByLabel('Nombre P02',{exact:true}).boundingBox();
 expect(name!.y).toBeGreaterThanOrEqual(0);expect(name!.y+name!.height).toBeLessThanOrEqual(760);expect(diagram!.x+diagram!.width).toBeLessThanOrEqual(name!.x);
 await expect(page.locator('[data-piece-row="1/13/12"] .piece-measures')).toContainText('Largo');await expect(page.locator('[data-piece-row="1/13/12"] .piece-measures')).toContainText('19,05');
 const width=diagram!.width;await page.getByRole('button',{name:'Ocultar muebles',exact:true}).click();await expect(page.locator('.left-panel')).toBeHidden();
 expect((await page.locator('.diagram').boundingBox())!.width).toBeGreaterThan(width+150);
 await page.getByRole('button',{name:'Mostrar muebles',exact:true}).click();await expect(page.locator('.left-panel')).toBeVisible();
 const points=await page.locator('polygon[data-piece]').first().getAttribute('points');
 await page.getByRole('button',{name:'Rotar con el mouse',exact:true}).click();
 await expect(page.getByRole('button',{name:'Seleccionar P01',exact:true})).toHaveCount(0);
 await page.locator('.diagram').scrollIntoViewIfNeeded();const box=await page.locator('[data-label="P01"] rect').boundingBox();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+45,box!.y+box!.height/2-8,{steps:4});await page.mouse.up();
 expect(await page.locator('polygon[data-piece]').first().getAttribute('points')).not.toBe(points);
 await page.getByRole('button',{name:'Seleccionar piezas',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Mover cotas',exact:true}).click();await expect(page.locator('.diagram')).toHaveAttribute('data-layout','sheet');
 await page.getByRole('button',{name:'Seleccionar piezas',exact:true}).click();
 await page.screenshot({path:'artifacts/piezas-visor-063-1000px.png',fullPage:false});
});


test('clic sobre geometría encuadrada selecciona la pieza y guarda la flecha en coordenadas locales',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.locator('.diagram').scrollIntoViewIfNeeded();
 const hit=await page.locator('polygon[data-piece]').evaluateAll(nodes=>{
  for(const node of [...nodes].reverse()){
   const polygon=node as SVGPolygonElement,svg=polygon.ownerSVGElement!;
   const coords=(polygon.getAttribute('points')||'').split(' ').map(pair=>pair.split(',').map(Number));
   const point=svg.createSVGPoint();point.x=coords.reduce((sum,p)=>sum+p[0],0)/3;point.y=coords.reduce((sum,p)=>sum+p[1],0)/3;
   const screen=point.matrixTransform(svg.getScreenCTM()!);
   if(document.elementFromPoint(screen.x,screen.y)===polygon)return {x:screen.x,y:screen.y,id:polygon.getAttribute('data-piece')!};
  }
  return null;
 });
 expect(hit).not.toBeNull();await page.mouse.click(hit!.x,hit!.y);await page.getByLabel('Texto de la nota').fill('Ancla desde el dibujo ampliado');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const saved=await snapshot(),note=saved.guide.furniture[0].notes[0] as {pieceId:string;anchor:number[]};
 expect(note.pieceId).toBe(hit!.id);expect(note.anchor).toHaveLength(3);expect(note.anchor.every(Number.isFinite)).toBe(true);
 expect(note.anchor.every((value,i)=>value>=-1e-6&&value<=[609.6,406.4,19.05][i]+1e-6)).toBe(true);
 expect(note.anchor.some(value=>Math.abs(value)>1)).toBe(true);
});


test('componentes iguales: nombre/ID compartidos, cantidad 2, notas físicas, guardado/reapertura y PDF',async({page},info)=>{
 await page.setViewportSize({width:1000,height:900});await boot(page,info.outputDir);const before=await snapshot();
 await page.getByRole('checkbox',{name:/Otro mueble/}).uncheck();await page.getByLabel('Abreviatura de la obra').fill('VF');
 await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await page.getByLabel('Módulo de este mueble').fill('M01');
 await expect(page.locator('[data-piece-row]')).toHaveCount(2);
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();await expect(page.locator('[data-piece-row]')).toHaveCount(1);
 await expect(page.locator('[data-piece-row]')).toContainText('×2');await expect(page.locator('[data-label="P01"]')).toHaveCount(2);await expect(page.locator('[data-label="P02"]')).toHaveCount(0);
 await page.getByLabel('Nombre P01',{exact:true}).fill('PT');await expect(page.locator('.selected-piece-summary')).toContainText('2 piezas iguales');
 await page.getByRole('button',{name:'Seleccionar P01, pieza 2 de 2',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01, pieza 2 de 2',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Indicación anclada solo en esta pieza');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const stored=await snapshot();expect(stored.names['11']).toBe('VF M01 PT');expect(stored.names['12']).toBe('VF M01 PT');expect(stored.names['21']).toBe(before.names['21']);expect(stored.geometryHash).toBe(before.geometryHash);
 expect(stored.guide.furniture[0].groupIdentical).toBe(true);expect(stored.guide.furniture[0].pieces.map(p=>p.code)).toEqual(['P01','P02']);expect(stored.guide.furniture[0].notes[0]).toMatchObject({pieceId:'1/13/12'});
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');const pdf=resolve(info.outputDir,'PlanosSanto-A4.pdf');
 const text=execFileSync('pdftotext',['-raw',pdf,'-'],{encoding:'utf8'});expect(text).not.toContain('P02');expect(text).toContain('Indicación anclada');
 const table=execFileSync('pdftotext',['-x','538','-y','147','-W','282','-H','405','-raw',pdf,'-'],{encoding:'utf8'});expect(table.match(/P01/g)).toHaveLength(1);expect(table.replace(/\s+/g,' ')).toContain('VF M01 PT');expect(table).toMatch(/\b2\b/);
 expect(execFileSync('pdfinfo',[pdf],{encoding:'utf8'})).toMatch(/Pages:\s+1/);await copyFile(pdf,'artifacts/componentes-iguales-064-CONTRATO-A4.pdf');
 await page.reload();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true})).toBeChecked();await expect(page.getByLabel('Nombre P01',{exact:true})).toHaveValue('PT');await expect(page.locator('[data-piece-row]')).toHaveCount(1);await expect(page.locator('[data-label="P01"]')).toHaveCount(2);
 await page.getByRole('button',{name:'Seleccionar P01, pieza 2 de 2',exact:true}).click();await page.screenshot({path:'artifacts/componentes-iguales-064-1000px.png',fullPage:false});
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).uncheck();await expect(page.locator('[data-piece-row]')).toHaveCount(2);await expect(page.getByLabel('Nombre P02',{exact:true})).toHaveValue('PT');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();expect((await snapshot()).guide.furniture[0].groupIdentical).toBe(false);
});

test('agrupar no permite renombrar hijos de muebles con padres compartidos',async({page},info)=>{
 await boot(page,info.outputDir,'shared');const before=await snapshot();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();await page.getByLabel('Nombre P01',{exact:true}).fill('PT');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/compartid/);expect(await snapshot()).toEqual(before);
});


test('materiales OCL: lectura, filtros, herencia, informe nuevo y foco sin modificar modelo/guía',async({page},info)=>{
 await boot(page,info.outputDir,'materials');const before=await snapshot();
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByText('OpenCutList 7.1.0',{exact:false})).toBeVisible();
 await expect(dialog.locator('tbody').first().locator('tr')).toHaveCount(3);
 await dialog.getByLabel('Filtrar materiales OCL',{exact:true}).selectOption('edge');
 await expect(dialog.locator('tbody').first().locator('tr')).toHaveCount(1);await expect(dialog.getByRole('cell',{name:'Canto de prueba',exact:false})).toBeVisible();
 await dialog.getByLabel('Filtrar materiales OCL',{exact:true}).selectOption('unused');
 await expect(dialog.getByRole('cell',{name:'Placa sin aplicar',exact:false})).toBeVisible();
 await dialog.getByLabel('Pieza para revisar materiales',{exact:true}).selectOption('1/11');
 await expect(dialog.getByRole('heading',{name:'Materiales de la pieza',exact:true})).toBeVisible();
 await expect(dialog.getByText('Heredado',{exact:true}).first()).toBeVisible();
 await dialog.getByRole('button',{name:'Guardar informe local…',exact:true}).click();
 await expect(dialog.getByText('Informe guardado localmente.',{exact:false})).toBeVisible();
 const report=JSON.parse(await readFile(resolve(info.outputDir,'materiales-cantos.json'),'utf8'));
 expect(report.schema).toBe('planos-santo.material-review.v1');expect(report.production_ready).toBe(false);expect(report.materials).toHaveLength(3);
 await dialog.getByRole('button',{name:'Guardar informe local…',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('ya existe');
 await expect(dialog.getByText('Informe guardado localmente.',{exact:false})).toHaveCount(0);
 expect(JSON.parse(await readFile(resolve(info.outputDir,'materiales-cantos.json'),'utf8'))).toEqual(report);
 expect(await snapshot()).toEqual(before);
 await dialog.evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:'artifacts/materiales-067-interfaz-SINTETICA.png',fullPage:false});
 await page.setViewportSize({width:1000,height:760});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/materiales-067-interfaz-SINTETICA-1000px.png',fullPage:false});
 await dialog.getByRole('button',{name:'Cerrar revisión',exact:true}).focus();await page.keyboard.press('Shift+Tab');
 expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Materiales y cantos',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
});

test('cancelar el informe de materiales no modifica el modelo ni la guía',async({page},info)=>{
 await boot(page,info.outputDir,'materials-cancel');const before=await snapshot();
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});
 await expect(dialog.getByRole('button',{name:'Guardar informe local…',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Guardar informe local…',exact:true}).click();
 await expect(dialog.getByText('Guardado cancelado.',{exact:true})).toBeVisible();expect(await snapshot()).toEqual(before);
});


test('biblioteca global: importar, revisar, guardar, reabrir y exportar sin tocar geometría',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await writeFile(resolve(info.outputDir,'candidatos.json'),JSON.stringify({items:[{nombre_en_modelos:'Placa prueba E2E',tipo_opencutlist:'2'}]}));
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();
 await page.getByRole('button',{name:'Importar JSON…',exact:true}).click();
 await page.getByRole('button',{name:/Placa prueba E2E/}).click();
 await expect(page.getByLabel('Material revisado y aprobado')).not.toBeChecked();
 await page.getByLabel('SKU de biblioteca').fill('PL-E2E');await page.getByLabel('Proveedor de biblioteca').fill('Proveedor sintético');
 await page.getByLabel('Espesor de biblioteca').fill('19.05');await page.getByLabel('Ancho de biblioteca').fill('2000');await page.getByLabel('Largo de biblioteca').fill('3000');
 await page.getByLabel('Veta de biblioteca').selectOption('false');await page.getByLabel('Material revisado y aprobado').check();
 await page.getByRole('button',{name:'Guardar biblioteca',exact:true}).click();await expect(page.getByRole('status')).toContainText('Biblioteca guardada');
 await page.setViewportSize({width:1000,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true})).toBeInViewport();
 await page.screenshot({path:'artifacts/biblioteca-068-SINTETICA-1000px.png',fullPage:false});
 expect(await snapshot()).toEqual(before);
 await page.getByRole('button',{name:'Exportar copia…',exact:true}).click();await expect(page.getByRole('status')).toContainText('Copia de biblioteca exportada');
 const library=JSON.parse(await readFile(resolve(info.outputDir,'biblioteca-exportada.json'),'utf8'));expect(library.items[0].price).toBeNull();expect(library.items[0].approved).toBe(true);
 await page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true}).click();await page.reload();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();await page.getByRole('button',{name:/Placa prueba E2E/}).click();
 await expect(page.getByLabel('SKU de biblioteca')).toHaveValue('PL-E2E');await expect(page.getByLabel('Material revisado y aprobado')).toBeChecked();
 await page.getByLabel('Espesor de biblioteca').fill('18');await expect(page.getByLabel('Material revisado y aprobado')).not.toBeChecked();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true}).click();
 expect(await snapshot()).toEqual(before);
});

test('pedido: revisa cada pieza, guarda borrador y genera lotes TXT reales con trazabilidad',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 const added=await send('catalog_add',{revision:0,item:{name:'Placa E2E',kind:'sheet'}});expect(added.error).toBeNull();
 const library=added.result as {catalog:{revision:number;items:Record<string,unknown>[]}};
 Object.assign(library.catalog.items[0],{sku:'TEST-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true});
 const saved=await send('catalog_save',{revision:library.catalog.revision,items:library.catalog.items});expect(saved.error).toBeNull();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();await page.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await page.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Elegí ejes');
 const select=page.getByLabel('Pieza del pedido'),ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(ids).toHaveLength(3);
 for(const id of ids){
  await select.selectOption(id);await page.getByLabel('Ejes de la vista 2D').selectOption('0,1');await page.getByLabel('Cara de la vista 2D').selectOption('1');
  await expect(page.getByRole('img',{name:'Vista 2D orientada para maderera'})).toBeVisible();
  await page.getByLabel('Placa del pedido').selectOption(library.catalog.items[0].id as string);
  await page.getByLabel('Dirección de veta del pedido').selectOption('none');await page.getByLabel('Rotación del pedido').selectOption('locked');
  await page.getByLabel('Origen de revisión de cantos').selectOption('manual');await page.getByLabel('Justificación manual de cantos').fill('Cantos sintéticos inspeccionados en modelo de prueba');
  await page.getByLabel('Regla de medidas del pedido').selectOption('finished_accepted');await page.getByLabel('Justificación del pedido').fill('Dimensiones sintéticas verificadas para prueba de proveedor');
  for(const label of ['Orientación y cara verificadas','Material y espesor verificados','Corte / terminadas verificadas con proveedor','Los cuatro cantos coinciden con esta vista','Dirección de veta verificada'])await page.getByLabel(label,{exact:true}).check();
 }
 await expect(page.getByRole('img',{name:'Vista 2D orientada para maderera'})).toBeInViewport({ratio:0.9});
 await expect(page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true})).toBeInViewport();
 await page.screenshot({path:'artifacts/pedido-068-SINTETICO-2D.png',fullPage:false});
 await page.getByRole('button',{name:'Guardar borrador del pedido',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Borrador guardado');
 await page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true}).click();await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();await page.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await expect(page.getByLabel('Orientación y cara verificadas')).toBeChecked();
 await page.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Pedido coherente');
 await expect(page.locator('.workshop-figures dd').nth(2)).toHaveText('3');await expect(page.locator('.workshop-estimate-table tbody tr')).toHaveCount(3);
 await page.getByRole('button',{name:'Exportar TXT de prueba…',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('TXT y manifest guardados');
 const folders=(await readdir(info.outputDir)).filter(name=>name.startsWith('PlanosSanto-pedido-'));expect(folders).toHaveLength(1);
 const manifest=JSON.parse(await readFile(resolve(info.outputDir,folders[0],'manifest.json'),'utf8'));expect(manifest.production_ready).toBe(false);expect(manifest.lots[0].physicalQuantity).toBe(3);expect(manifest.columns).toHaveLength(9);
 const txt=await readFile(resolve(info.outputDir,folders[0],'lote-01.txt'),'utf8');for(const row of txt.trim().split('\r\n'))expect(row.split('\t')).toHaveLength(9);
 const after=await snapshot();expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);
 await page.getByRole('button',{name:'Cerrar biblioteca y pedidos',exact:true}).click();
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Incluir materiales y cantos del pedido revisado en el PDF',exact:true}).check();
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');const pdfText=execFileSync('pdftotext',['-raw',resolve(info.outputDir,'PlanosSanto-A4.pdf'),'-'],{encoding:'utf8'});expect(pdfText).toContain('TEST-19');expect(pdfText).toMatch(/[012]·[012]·[012]·[012] TEST-19/);expect(pdfText.replace(/\s+/g,' ')).toContain('orden Arr·Aba·Izq·Der sobre base × altura del pedido');
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();
 await page.getByRole('button',{name:'Optimización y presupuesto',exact:true}).click();await page.getByRole('button',{name:'Abrir listas, optimización y presupuesto OCL',exact:true}).click();await expect(page.getByRole('alert')).toContainText('OpenCutList original');
});

test('sugerencias: ejes confirmados, aplicación explícita y guardado sin alterar definiciones',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();await page.getByRole('checkbox',{name:'Incluir piezas que ya tienen nombre'}).check();
 await expect(page.getByText('Falta confirmar vertical y frente del mueble.',{exact:false}).first()).toBeVisible();
 await page.getByRole('checkbox',{name:'Confirmé frente y vertical en el dibujo'}).check();await page.getByLabel('Nombre sugerido P01').fill('Panel revisado');await page.getByLabel('Nombre sugerido P02').fill('');await expect(page.getByRole('button',{name:'Confirmar y guardar nombres',exact:true})).toBeDisabled();await page.getByLabel('Nombre sugerido P02').fill('Base revisada');
 expect(await snapshot()).toEqual(before);await page.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('Nombre P01',{exact:true})).toHaveValue('Panel revisado');
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();expect(saveRequests).toHaveLength(1);
 const after=await snapshot();expect(after.names['11']).toBe('Panel revisado');expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);
});

test('interior conserva la tabla agrupada y las instancias físicas al cambiar de vista y reabrir',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const saved=await snapshot();expect(saved.geometryHash).toBe(before.geometryHash);expect(saved.guide.furniture[0].groupIdentical).toBe(true);
 await page.reload();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Ver interior',exact:true}).click();await expect(page.locator('[data-label="P01"]')).toHaveCount(2);await expect(page.locator('[data-piece-row]')).toHaveCount(1);
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 const {execFileSync}=await import('node:child_process');const text=execFileSync('pdftotext',['-raw',resolve(info.outputDir,'PlanosSanto-A4.pdf'),'-'],{encoding:'utf8'}).replace(/\s+/g,' ');expect(text).toContain('P01');expect(text).toContain('VISTA EXTERIOR');expect(text).toContain('VISTA INTERIOR');
 expect((await snapshot()).geometryHash).toBe(before.geometryHash);
});

test('cantos por cara: vinculación explícita, cuatro lados y TXT auditado sin pintar el SKP',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');const before=await snapshot();
 let response=await send('catalog_add',{revision:0,item:{name:'Placa observable',kind:'sheet'}});
 let library=(response.result as {catalog:{revision:number;items:Record<string,unknown>[]}}).catalog;
 response=await send('catalog_add',{revision:library.revision,item:{name:'Principal biblioteca',kind:'edge'}});library=(response.result as {catalog:typeof library}).catalog;
 response=await send('catalog_add',{revision:library.revision,item:{name:'Secundario biblioteca',kind:'edge'}});library=(response.result as {catalog:typeof library}).catalog;
 const [board,first,second]=library.items;
 Object.assign(board,{sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true,compatibleIds:[first.id,second.id]});
 for(const [index,edge] of [first,second].entries())Object.assign(edge,{sku:`EDGE-${index+1}`,supplier:'Prueba',thicknessMm:index?1:.8,widthMm:22,approved:true});
 response=await send('catalog_save',{revision:library.revision,items:library.items});expect(response.error).toBeNull();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog');await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await panel.getByRole('button',{name:'Ver piezas bloqueadas',exact:true}).click();await expect(panel.getByLabel('Piezas bloqueadas').locator('li')).toHaveCount(3);
 const select=page.getByLabel('Pieza del pedido'),ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 for(const id of ids){
  await select.selectOption(id);await page.getByLabel('Ejes de la vista 2D').selectOption('0,1');await page.getByLabel('Cara de la vista 2D').selectOption('1');
  await page.getByLabel('Placa del pedido').selectOption(board.id as string);await page.getByLabel('Canto principal del pedido').selectOption(first.id as string);await page.getByLabel('Canto secundario del pedido').selectOption(second.id as string);
  await panel.getByRole('button',{name:'Leer cantos de las caras',exact:true}).click();await expect(panel.getByText('Recorrido completo',{exact:true})).toBeVisible();
  await page.getByLabel('Vincular canto observado material:888',{exact:true}).selectOption(first.id as string);await page.getByLabel('Vincular canto observado material:890',{exact:true}).selectOption(second.id as string);
  await panel.getByRole('button',{name:'Usar propuesta de los cuatro lados',exact:true}).click();
  await expect(page.getByLabel('Canto arriba del pedido')).toHaveValue('1');await expect(page.getByLabel('Canto abajo del pedido')).toHaveValue('0');await expect(page.getByLabel('Canto izquierda del pedido')).toHaveValue('2');await expect(page.getByLabel('Canto derecha del pedido')).toHaveValue('0');
  await page.getByLabel('Dirección de veta del pedido').selectOption('none');await page.getByLabel('Rotación del pedido').selectOption('locked');await page.getByLabel('Regla de medidas del pedido').selectOption('finished_accepted');await page.getByLabel('Justificación del pedido').fill('Dimensiones sintéticas aceptadas para probar formato');
  for(const label of ['Orientación y cara verificadas','Material y espesor verificados','Corte / terminadas verificadas con proveedor','Los cuatro cantos coinciden con esta vista','Dirección de veta verificada'])await page.getByLabel(label,{exact:true}).check();
 }
 await panel.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Pedido coherente');
 await page.screenshot({path:'artifacts/cantos-069-SINTETICO.png',fullPage:false});
 await panel.getByRole('button',{name:'Exportar TXT de prueba…',exact:true}).click();await expect(panel.getByRole('status')).toContainText('TXT y manifest guardados');
 const folder=(await readdir(info.outputDir)).find(name=>name.startsWith('PlanosSanto-pedido-'))!,manifest=JSON.parse(await readFile(resolve(info.outputDir,folder,'manifest.json'),'utf8'));
 expect(manifest.lots).toHaveLength(1);expect(manifest.lots[0].physicalQuantity).toBe(3);expect(manifest.lots[0].sourceRows.every((row:{edgeResolution:string})=>row.edgeResolution==='observed')).toBe(true);expect(manifest.production_ready).toBe(false);
 const {execFileSync}=await import('node:child_process');execFileSync('python3',['planos-santo-loop-068/scripts/validar_txt_maderera.py',resolve(info.outputDir,folder,'lote-01.txt')]);
 const after=await snapshot();expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);
 // Reversing the shown face invalidates confirmations and relocates the observed left edge.
 await page.getByLabel('Cara de la vista 2D').selectOption('-1');await expect(page.getByLabel('Los cuatro cantos coinciden con esta vista')).not.toBeChecked();
 await panel.getByRole('button',{name:'Leer cantos de las caras',exact:true}).click();await panel.getByRole('button',{name:'Usar propuesta de los cuatro lados',exact:true}).click();await expect(page.getByLabel('Canto izquierda del pedido')).toHaveValue('0');await expect(page.getByLabel('Canto derecha del pedido')).toHaveValue('2');
});
