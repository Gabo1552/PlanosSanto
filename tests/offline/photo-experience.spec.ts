import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Actual frozen/current browser and Ruby controller with synthetic API doubles.
// No native SketchUp, customer image, or customer model is used in these tests.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let nativeStderr='';
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
async function boot(page:Page,folder:string,baseline=false){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 const installation=baseline?'/tmp/planos-photo-baseline-084':resolve('sketchup_offline/build');
 child=spawn(ruby,[baseline?'sketchup_offline/test/ux_bridge_driver.rb':'sketchup_offline/test/photo_bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,PLANOS_TEST_INSTALL_DIR:installation,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 nativeStderr='';child.stderr.on('data',chunk=>{nativeStderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(nativeStderr));pending.clear();});
 await page.exposeFunction('photoNativeRequest',(raw:string)=>new Promise<Reply>((resolve,reject)=>{const message=JSON.parse(raw);calls.push({action:message.action,data:message.data});pending.set(message.id,{resolve,reject});child.stdin.write(raw+'\n');}));
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.photoNativeRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve(installation,'planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.setViewportSize({width:1280,height:720});await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function shot(page:Page,name:string){await page.screenshot({path:`artifacts/fotos-085-${name}-SINTETICA.png`,fullPage:true});}
test.afterEach(async()=>{child?.stdin.end();child?.kill();if(nativeStderr)await writeFile('artifacts/fotos-085-native-stderr.log',nativeStderr);expect(errors||[]).toEqual([]);});

if(process.env.PLANOS_PHOTO_CAPTURE_BASELINE==='1')test('Fotos baseline 084: biblioteca, alta manual y paleta anteriores',async({page},info)=>{
 await boot(page,info.outputDir,true);
 const nav=page.getByRole('navigation',{name:'Módulos de Planos Santo'});
 await nav.getByRole('button',{name:'Materiales',exact:true}).click();await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();await shot(page,'before-library');
 await page.getByRole('button',{name:'Nuevo material',exact:true}).click();await shot(page,'before-create');
 const cancel=page.getByRole('button',{name:'Cancelar nuevo material',exact:true});if(await cancel.count())await cancel.click();else await page.getByRole('button',{name:'Nuevo material',exact:true}).click();
 await nav.getByRole('button',{name:'Pintar',exact:true}).click();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();await page.setViewportSize({width:440,height:760});await shot(page,'before-palette');
 await writeFile('artifacts/fotos-085-baseline.json',JSON.stringify({baselineVersion:'0.8.4',rbzSha256:'68f3417ff77eae10f5f78c374de1c1729c48040b32bfc391aa722787d889935b',source:'Frozen084UIandRubycontroller,syntheticLcabinet+QAcatalog',nativeSketchupExecuted:false,photoCreationAvailable:false,calls},null,2));
});

async function rpc(page:Page,action:string,data:Record<string,unknown>={}){
 const reply=await page.evaluate(async({action,data})=>{
  const bridge=window as unknown as {photoNativeRequest:(raw:string)=>Promise<Reply>};
  return bridge.photoNativeRequest(JSON.stringify({version:1,id:`fixture-${Date.now()}-${Math.random()}`,action,data}));
 },{action,data});
 expect(reply.error).toBeNull();return reply.result as Record<string,unknown>;
}
async function openPhoto(page:Page){
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Materiales',exact:true}).click();
 await page.getByRole('button',{name:'+ Material',exact:true}).click();
 return page.getByRole('dialog',{name:'Material desde una foto',exact:true});
}
async function choosePhoto(page:Page){
 const dialog=page.getByRole('dialog',{name:'Material desde una foto',exact:true});
 await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
 await expect(dialog.getByRole('img',{name:'Foto elegida para la textura y miniatura del material'})).toBeVisible();return dialog;
}

if(process.env.PLANOS_PHOTO_CAPTURE_BASELINE!=='1'){
 test('Foto 085: crear textura privada desde biblioteca y pintar con el motor real',async({page},info)=>{
  await boot(page,info.outputDir);const decisions:string[]=[];
  const dialog=await openPhoto(page);decisions.push('+ Material');await shot(page,'after-create-empty');
  await choosePhoto(page);decisions.push('Elegir foto (selector API doble)');
  const chosenPreview=await dialog.getByRole('img',{name:'Foto elegida para la textura y miniatura del material'}).getAttribute('src');
  await expect(dialog.getByLabel('Nombre del material desde foto')).toHaveValue('Foto QA ámbar');
  await dialog.getByLabel('Espesor del material desde foto').fill('18');decisions.push('Espesor 18 mm');
  await shot(page,'after-create-preview');
  await dialog.getByRole('button',{name:'Guardar y pintar',exact:true}).click();decisions.push('Guardar y pintar');
  await expect(dialog).toBeHidden();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
  await expect.poll(()=>calls.filter(c=>c.action==='smart_quick_start').length).toBe(1);
  const start=calls.find(c=>c.action==='smart_quick_start')!;
  expect(start.data).toMatchObject({mode:'sheet',immediate:true,immediatePiece:true,paintScope:'piece',side:'both',batch:false});
  await page.setViewportSize({width:440,height:760});
  await expect(page.locator('.immediate-current-swatch img')).toHaveAttribute('src',chosenPreview!);await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await shot(page,'after-palette');await page.setViewportSize({width:680,height:320});await page.screenshot({path:'artifacts/immediate-087-foto-creada-paleta-SINTETICA.png'});await page.locator('.immediate-palette').screenshot({path:'artifacts/immediate-087-foto-creada-panel-SINTETICA.png'});
  const before=await rpc(page,'__photo_snapshot');
  expect(before.photoItems).toMatchObject([{name:'Foto QA ámbar',approved:false,designReady:true,hasTexture:true,hasArchive:true,scaleVerified:false}]);
  const painted=await rpc(page,'__photo_paint');decisions.push('Clic sobre cara nativa (doble API)');
  await writeFile('artifacts/fotos-085-paint-debug.json',JSON.stringify(painted,null,2));expect(painted).toMatchObject({changed:true,targetHasPhoto:true});
  const undone=await rpc(page,'__photo_undo');expect(undone.targetHasPhoto).toBe(false);
  expect(decisions).toHaveLength(5);
  await writeFile('artifacts/fotos-085-usabilidad.json',JSON.stringify({nativeSketchupExecuted:false,source:'Browser+actualRubycontroller/PhotoMaterial/SmartPaintwithsyntheticAPIdoubles',entry:'Materiales',decisions,mainDecisions:decisions.length,menuNavigationExcluded:1,nativeFileExplorerInteractions:'Not measured: controlled picker API double',humanTimingMeasured:false,safety:{scope:'unique',allowShared:false},calls},null,2));
  await page.getByRole('button',{name:'+ Material',exact:true}).click();
  const palettePhoto=page.getByRole('dialog',{name:'Material desde una foto',exact:true});await expect(palettePhoto).toBeVisible();
  expect(calls.some(call=>call.action==='smart_tool_stop')).toBe(true);
  // While the panel is busy Escape is ignored on purpose: wait until it is idle.
  await expect(palettePhoto).toHaveAttribute('aria-busy','false');await page.keyboard.press('Escape');await expect(palettePhoto).toBeHidden();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
 });
 test('Foto 085: guardar sin pintar, duplicado explícito, cancelación y foco modal',async({page},info)=>{
  await boot(page,info.outputDir);let dialog=await openPhoto(page);
  await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Cerrar material desde foto'})).toBeFocused();
  await choosePhoto(page);await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
  expect(calls.filter(c=>c.action==='smart_tool_start')).toHaveLength(0);
  const first=await rpc(page,'__photo_snapshot');expect((first.photoItems as unknown[])).toHaveLength(1);
  dialog=await openPhoto(page);await choosePhoto(page);
  await expect(dialog.getByRole('radio',{name:'Usar existente',exact:true})).toBeChecked();
  await expect(dialog.getByText('Se utilizará el material existente tal como está, con su propia textura.',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
  expect((await rpc(page,'__photo_snapshot')).photoItems).toHaveLength(1);
  dialog=await openPhoto(page);await choosePhoto(page);
  await dialog.getByRole('radio',{name:'Reemplazar textura',exact:true}).check();
  await expect(dialog.getByRole('button',{name:'Guardar material',exact:true})).toBeDisabled();
  await shot(page,'after-duplicate');
  await dialog.getByRole('radio',{name:'Crear variante',exact:true}).check();
  await expect(dialog.getByLabel('Nombre del material desde foto')).toHaveValue('Foto QA ámbar (variante)');
  await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
  expect((await rpc(page,'__photo_snapshot')).photoItems).toHaveLength(2);
  dialog=await openPhoto(page);await choosePhoto(page);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  expect((await rpc(page,'__photo_snapshot')).photoItems).toHaveLength(2);
  await shot(page,'after-library');
 });
 test('Foto 085: biblioteca reutilizable en otro modelo sin la imagen original',async({page},info)=>{
  await boot(page,info.outputDir);const dialog=await openPhoto(page);await choosePhoto(page);
  await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
  await rpc(page,'__photo_new_model',{deleteOriginal:true});await page.reload();
  await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Materiales',exact:true}).click();
  const card=page.getByRole('article',{name:'Material Foto QA ámbar',exact:true});await expect(card).toBeVisible();
  await card.getByRole('button').first().click();
  await page.getByRole('button',{name:'Cargar SKM en este modelo',exact:true}).click();
  // Punto 27: cargar el SKM es un clic, sin paso de confirmación.
  await expect(page.getByRole('button',{name:'Sí, cargar SKM',exact:true})).toHaveCount(0);
  await expect.poll(()=>calls.filter(c=>c.action==='material_photo_install').length).toBe(1);
  await expect.poll(async()=>((await rpc(page,'__photo_snapshot')).photoItems as {hasTexture:boolean}[])[0]?.hasTexture).toBe(true);
  await page.getByRole('button',{name:'Abrir paleta de pintura',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
  const snapshot=await rpc(page,'__photo_snapshot');expect(snapshot.photoItems).toMatchObject([{approved:false,designReady:true,hasTexture:true}]);
  await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
  await expect.poll(()=>calls.filter(c=>c.action==='smart_quick_start').length).toBe(1);
  expect(await rpc(page,'__photo_paint')).toMatchObject({changed:true,targetHasPhoto:true});
  expect(await rpc(page,'__photo_undo')).toMatchObject({targetHasPhoto:false});
 });
 test('Foto 085: cancelación nativa, imagen inválida y JPG Unicode mantienen el modelo',async({page},info)=>{
  await boot(page,info.outputDir);const dialog=await openPhoto(page);
  await rpc(page,'__photo_picker',{kind:'cancel'});await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
  await expect(dialog.getByRole('img')).toHaveCount(0);expect((await rpc(page,'__photo_snapshot')).photoItems).toHaveLength(0);
  await rpc(page,'__photo_picker',{kind:'invalid'});await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('JPG o PNG válida');
  await rpc(page,'__photo_picker',{kind:'jpeg'});await choosePhoto(page);
  await expect(dialog.getByLabel('Nombre del material desde foto')).toHaveValue('Textura QA ñ');
  await page.setViewportSize({width:440,height:760});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await shot(page,'after-photo-compact');await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  expect((await rpc(page,'__photo_snapshot')).photoItems).toHaveLength(0);
 });

}


test.afterAll(async({browser})=>{
 if(process.env.PLANOS_PHOTO_CAPTURE_BASELINE==='1')return;
 const comparisons=[['Biblioteca permanente','before-library','after-library'],['Crear un material','before-create','after-create-preview'],['Paleta compacta','before-palette','after-palette']];
 const capture=(name:string,label:string)=>existsSync(`artifacts/fotos-085-${name}-SINTETICA.png`)?`<img src="fotos-085-${name}-SINTETICA.png" alt="${label}">`:'<p>Captura no disponible en esta ejecución. La línea base requiere extraer el RBZ 0.8.4 y ejecutar PLANOS_PHOTO_CAPTURE_BASELINE=1.</p>';
 const blocks=comparisons.map(([title,before,after])=>`<section><h2>${title}</h2><div class="pair"><figure><figcaption>Antes · candidata 0.8.4 congelada</figcaption>${capture(before,`Antes: ${title}`)}</figure><figure><figcaption>Después · candidata 0.8.5</figcaption>${capture(after,`Después: ${title}`)}</figure></div></section>`).join('');
 await writeFile('artifacts/fotos-085-comparacion-SINTETICA.html',`<!doctype html><html lang="es"><meta charset="utf-8"><title>Planos Santo · comparativa fotos 0.8.5</title><style>body{font:16px system-ui;background:#f5f4ee;color:#233326;max-width:1900px;margin:30px auto;padding:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;padding:10px}img{max-width:100%;height:auto}figcaption{padding:8px}section{margin:35px 0}small{display:block}</style><h1>Materiales desde fotos · comparación sintética</h1><p>Interfaz HTML real y servicios Ruby reales con dobles de la API. Modelo L y materiales de ensayo propios. No son capturas del visor nativo de SketchUp ni imágenes del taller. La creación real de SKM, la imagen nativa y el pintado en SketchUp 2026 requieren validación local.</p><p>La línea base 0.8.4 se cargó del RBZ congelado, incluyendo su controlador Ruby. Ventana de biblioteca: 1280 × 720; paleta: 440 × 760. Las imágenes capturan la página completa para incluir los controles que requieren desplazamiento. El modelo conserva la misma forma; el ensayo nuevo usa definiciones independientes para probar el alcance seguro sin simular make_unique.</p>${blocks}<section><h2>Duplicados y reemplazo explícito</h2>${capture('after-duplicate','Decisiones de duplicado y confirmación de reemplazo')}</section><small>Contador de decisiones automatizadas en fotos-085-usabilidad.json; no mide tiempo de una persona ni clics del explorador de Windows.</small></html>`);
 const gallery=await browser.newPage({viewport:{width:1600,height:1000}});
 await gallery.route('https://planos-gallery.test/**',async route=>{const filename=new URL(route.request().url()).pathname.slice(1);if(!/^fotos-085-[A-Za-z0-9-]+\.(png|html)$/.test(filename))throw Error('Unexpected gallery asset');await route.fulfill({body:await readFile(resolve('artifacts',filename)),contentType:filename.endsWith('.html')?'text/html':'image/png'});});
 await gallery.goto('https://planos-gallery.test/fotos-085-comparacion-SINTETICA.html');
 await gallery.locator('img').evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));
 await gallery.screenshot({path:'artifacts/fotos-085-comparacion-SINTETICA.png',fullPage:true});await gallery.close();
 const names=[...comparisons.flatMap(([,before,after])=>[before,after]),'after-create-empty','after-duplicate','after-photo-compact'];
 const screenshots=[];for(const name of names){const filename=`fotos-085-${name}-SINTETICA.png`;if(existsSync(`artifacts/${filename}`))screenshots.push({file:filename,sha256:createHash('sha256').update(await readFile(`artifacts/${filename}`)).digest('hex')});}
 await writeFile('artifacts/fotos-085-capturas-manifiesto.json',JSON.stringify({nativeSketchupExecuted:false,privateCustomerAssets:false,capture:'fullPage',screenshots},null,2));
});
