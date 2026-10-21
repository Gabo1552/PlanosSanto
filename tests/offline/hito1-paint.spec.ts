import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Hito 1 (0.8.8): real browser bundle + real Ruby controller/services with
// synthetic SketchUp API doubles (photo_bridge_driver.rb). NOT SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
// Screenshots go to the test output unless HITO1_CAPTURE=1 (evidence refresh on purpose).
const captureFolder=resolve('docs/hito1-pintura-088/capturas');let evidence='';
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
async function boot(page:Page,folder:string){
 evidence=process.env.HITO1_CAPTURE==='1'?captureFolder:folder;await mkdir(folder,{recursive:true});await mkdir(evidence,{recursive:true});pending=new Map();errors=[];calls=[];
 const installation=resolve('sketchup_offline/build');
 child=spawn(ruby,['sketchup_offline/test/photo_bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,PLANOS_TEST_INSTALL_DIR:installation,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error('Ruby bridge exited'));});
 await page.exposeFunction('photoNativeRequest',(raw:string)=>new Promise<Reply>((resolve,reject)=>{const message=JSON.parse(raw);calls.push({action:message.action,data:message.data});pending.set(message.id,{resolve,reject});child.stdin.write(raw+'\n');}));
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.photoNativeRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve(installation,'planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
 await page.context().setOffline(true);await page.setViewportSize({width:1280,height:720});await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'})).toBeVisible();
}
async function rpc(page:Page,action:string,data:Record<string,unknown>={}){
 const reply=await page.evaluate(async({action,data})=>{
  const bridge=window as unknown as {photoNativeRequest:(raw:string)=>Promise<Reply>};
  return bridge.photoNativeRequest(JSON.stringify({version:1,id:`fixture-${Date.now()}-${Math.random()}`,action,data}));
 },{action,data});
 expect(reply.error).toBeNull();return reply.result as Record<string,unknown>;
}
async function savePhotoWithoutPainting(page:Page){
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Materiales',exact:true}).click();
 await page.getByRole('button',{name:'+ Material',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material desde una foto',exact:true});
 await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
 await expect(dialog.getByRole('img',{name:'Foto elegida para la textura y miniatura del material'})).toBeVisible();
 await expect(dialog.getByLabel('Nombre del material desde foto')).toHaveValue('Foto QA ámbar');
 await dialog.getByLabel('Espesor del material desde foto').fill('18');
 await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
}
async function openQuickPalette(page:Page){
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Pintar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
 return page.locator('.immediate-palette');
}
test.afterEach(async({page})=>{const seen=[...(errors||[])];await page.close();child?.stdin.end();child?.kill();expect(seen).toEqual([]);});

test('Hito 1: elegir una melamina guardada en otro modelo la instala y deja el pincel listo',async({page},info)=>{
 await boot(page,info.outputDir);await savePhotoWithoutPainting(page);
 await rpc(page,'__photo_new_model',{deleteOriginal:true});await page.reload();
 const palette=await openQuickPalette(page);
 const tile=palette.getByRole('button',{name:/Foto QA ámbar/});
 await expect(tile).toContainText('Se instala al elegir');
 await page.setViewportSize({width:680,height:420});await page.screenshot({path:resolve(evidence,'hito1-antes-de-elegir-SINTETICA.png')});
 await tile.click();
 await expect(palette.getByText('● Pintando',{exact:true})).toBeVisible();
 await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
 expect(calls.filter(call=>['material_photo_install','skm_install','catalog_install','catalog_bind'].includes(call.action))).toHaveLength(0);
 await expect(page.getByText(/textura válida/)).toHaveCount(0);await expect(palette.getByRole('alert')).toHaveCount(0);
 expect((await rpc(page,'__photo_snapshot')).photoItems).toMatchObject([{name:'Foto QA ámbar',hasTexture:true}]);
 await page.screenshot({path:resolve(evidence,'hito1-pincel-activo-SINTETICA.png')});
 expect(await rpc(page,'__photo_paint')).toMatchObject({changed:true,targetHasPhoto:true});
 expect(await rpc(page,'__photo_undo')).toMatchObject({targetHasPhoto:false});
});

test('Hito 1: ficha comercial sin visual muestra la causa real y "Asignar color" la deja pintable',async({page},info)=>{
 await boot(page,info.outputDir);await rpc(page,'__photo_new_model');await page.reload();
 const palette=await openQuickPalette(page);
 const attention=palette.getByRole('region',{name:'Materiales que necesitan atención'});
 await expect(attention).toContainText('Placa QA sintética');
 await expect(attention).toContainText('no tiene imagen, textura ni color');
 const library=palette.getByRole('region',{name:'Materiales disponibles para pintar'});
 await expect(library.getByRole('button',{name:/Placa QA sintética/})).toHaveCount(0);
 await page.setViewportSize({width:680,height:420});await page.screenshot({path:resolve(evidence,'hito1-necesita-visual-SINTETICA.png')});
 const row=attention.getByRole('listitem').filter({hasText:'Placa QA sintética'});
 await row.getByLabel('Color para Placa QA sintética').fill('#d8cfbf');
 await row.getByRole('button',{name:'Asignar color a Placa QA sintética',exact:true}).click();
 await expect.poll(()=>calls.filter(call=>call.action==='smart_assign_color').length).toBe(1);
 expect(calls.find(call=>call.action==='smart_assign_color')!.data).toMatchObject({rgb:[216,207,191],confirmed:true});
 const tile=library.getByRole('button',{name:/Placa QA sintética/});await expect(tile).toBeVisible();
 await tile.click();await expect(palette.getByText('● Pintando',{exact:true})).toBeVisible();
 expect(await rpc(page,'__photo_paint')).toMatchObject({changed:true});
});

test('Hito 1: "Asignar foto" sobre una ficha comercial conserva SKU y aprobación y la deja pintable',async({page},info)=>{
 await boot(page,info.outputDir);await rpc(page,'__photo_new_model');await page.reload();
 const palette=await openQuickPalette(page);
 const attention=palette.getByRole('region',{name:'Materiales que necesitan atención'});
 await attention.getByRole('listitem').filter({hasText:'Placa QA sintética'}).getByRole('button',{name:'Asignar foto a Placa QA sintética',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Asignar foto al material',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Confirmar reemplazo de textura')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
 await expect(dialog.getByRole('img',{name:'Foto elegida para la textura y miniatura del material'})).toBeVisible();
 await dialog.getByRole('button',{name:'Guardar y pintar',exact:true}).click();await expect(dialog).toBeHidden();
 await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
 await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
 const created=calls.find(call=>call.action==='material_photo_create')!.data;
 expect(created).toMatchObject({action:'replace',replaceConfirmed:true,confirmed:true});
 expect((await rpc(page,'__photo_snapshot')).photoItems).toMatchObject([{name:'Placa QA sintética',approved:true,hasTexture:true}]);
 expect(await rpc(page,'__photo_paint')).toMatchObject({changed:true,targetHasPhoto:true});
});

test('Hito 1: Biblioteca → "Abrir paleta de pintura" con un material no instalado lo instala y arma el pincel',async({page},info)=>{
 await boot(page,info.outputDir);await savePhotoWithoutPainting(page);
 await rpc(page,'__photo_new_model');await page.reload();
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Materiales',exact:true}).click();
 const card=page.getByRole('article',{name:'Material Foto QA ámbar',exact:true});await card.getByRole('button').first().click();
 const open=page.getByRole('button',{name:'Abrir paleta de pintura',exact:true});await expect(open).toBeEnabled();await open.click();
 await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
 expect(calls.filter(call=>['material_photo_install','skm_install','catalog_install'].includes(call.action))).toHaveLength(0);
 expect(await rpc(page,'__photo_paint')).toMatchObject({changed:true,targetHasPhoto:true});
});

test('0.8.9: un cambio de biblioteca hecho en otra ventana actualiza la paleta abierta sin reabrirla',async({page},info)=>{
 await boot(page,info.outputDir);await rpc(page,'__photo_new_model');await page.reload();
 const palette=await openQuickPalette(page);
 const library=palette.getByRole('region',{name:'Materiales disponibles para pintar'});
 await expect(library.getByRole('button',{name:/Placa QA sintética/})).toHaveCount(0);
 const loaded=await rpc(page,'smart_palette_load') as {catalog:{items:{id:string;name:string}[]}};
 const row=loaded.catalog.items.find(item=>item.name==='Placa QA sintética')!;
 await rpc(page,'smart_assign_color',{catalogId:row.id,rgb:[200,190,170],confirmed:true});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-library-changed',{detail:{action:'smart_assign_color'}})));
 await expect(library.getByRole('button',{name:/Placa QA sintética/})).toBeVisible();
});
