import {test,expect,type Page} from '@playwright/test';
import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const execute=promisify(execFile);

// Real frozen/current UI and controller. HtmlDialog, model and image APIs are
// synthetic doubles. These metrics never assert native SketchUp click timings.
type Reply={version:1;id:string;result:unknown;error:string|null};
type Dialog={file:string;width:number;height:number;visible:boolean};
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
const baseline=process.env.PLANOS_FLUJOS_BASELINE==='1';
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(value:Reply)=>void;reject:(error:Error)=>void}>,errors:string[],calls:{action:string;data:Record<string,unknown>}[],stderr='',loaded=false;
function native(action:string,data:Record<string,unknown>={}):Promise<Reply>{return new Promise((resolve,reject)=>{const id=`flujos-${Date.now()}-${Math.random()}`;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({version:1,id,action,data})+'\n');});}
async function boot(page:Page,folder:string,remember=true,action='sheet'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];stderr='';loaded=false;
 const installation=baseline?'/tmp/planos-flujos-baseline-085':resolve('sketchup_offline/build');
 const painting=['sheet','edge','remove_edge','sample'].includes(action);
 const uiFile=baseline||!painting?'index.html':'palette.html';
 child=spawn(ruby,['sketchup_offline/test/flujos_bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,PLANOS_TEST_INSTALL_DIR:installation,PLANOS_TEST_UI_FILE:uiFile,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',chunk=>{stderr+=String(chunk);});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);if(reply.script){if(loaded&&reply.dialogFile===uiFile)void page.evaluate(reply.script).catch(()=>{});return;}const entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 const entering=await native('__flujos_enter',{action,remember,selection:!painting});expect(entering.error).toBeNull();
 await page.exposeFunction('flujosNative',(raw:string)=>new Promise<Reply>((resolve,reject)=>{const message=JSON.parse(raw);calls.push({action:message.action,data:message.data});pending.set(message.id,{resolve,reject});child.stdin.write(raw+'\n');}));
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.flujosNative(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://flujos.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^(index|palette)\.html$|^(app|palette)\.(js|css)$/.test(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve(installation,'planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.setViewportSize({width:baseline?1440:painting?680:1280,height:baseline?920:painting?320:920});loaded=true;await page.goto(`https://flujos.test/${uiFile}`);
 if(painting)await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();else await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'})).toBeVisible();
 return entering.result as {dialogs:Dialog[];toolState:{active:boolean}};
}
async function rpc(action:string,data:Record<string,unknown>={}){const reply=await native(action,data);expect(reply.error).toBeNull();return reply.result as Record<string,unknown>;}
async function screenshot(page:Page,name:string){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`artifacts/flujos-086-${name}-SINTETICA.png`,fullPage:true});}
test.afterEach(async()=>{loaded=false;child?.stdin.end();child?.kill();expect(errors||[]).toEqual([]);});

if(baseline)test('Flujos baseline085: pintar usa HtmlDialog general antes del rediseño',async({page},info)=>{
 const initial=await boot(page,info.outputDir);
 await expect.poll(()=>calls.filter(call=>call.action==='smart_tool_start').length).toBe(1);
 await screenshot(page,'before-paint-general');
 const lifecycle=await rpc('__flujos_dialogs');expect((lifecycle.dialogs as Dialog[]).some(dialog=>dialog.file==='index.html'&&dialog.width===1440)).toBe(true);
 await writeFile('artifacts/flujos-086-before.json',JSON.stringify({source:'Frozen0.8.5UIandcontroller+syntheticAPI',nativeSketchupExecuted:false,rbzSha256:'2ab072647d7b042b6a5ee39af91d93ce3eb8787931f3f44924ba166b052fd997',initial,lifecycle,calls},null,2));
});

if(!baseline){
 test('Flujos086: barra con material recordado pinta en dos decisiones sin crear panel general',async({page},info)=>{
  const initial=await boot(page,info.outputDir);
  expect(initial.dialogs).toHaveLength(1);expect(initial.dialogs[0]).toMatchObject({file:'palette.html',width:680,height:320});
  const ready=await rpc('__flujos_dialogs');expect(ready.toolState).toMatchObject({active:true,mode:'sheet'});expect(ready.toolStarts).toBe(1);
  expect(calls.filter(call=>['scan','ui_ready','ui_loading','generate','smart_tool_start'].includes(call.action))).toHaveLength(0);
  await screenshot(page,'after-paint-compact');
  const painted=await rpc('__flujos_paint');expect(painted).toMatchObject({targetCatalogId:'11111111-1111-4111-8111-000000000001',toolStarts:1});
  expect(painted.operations).toEqual(['start','commit']);
  expect((painted.dialogs as Dialog[]).every(dialog=>dialog.file!=='index.html')).toBe(true);
  const undo=await rpc('__flujos_undo');expect(undo.targetCatalogId).toBeNull();
  await writeFile('artifacts/flujos-086-metricas.json',JSON.stringify({nativeSketchupExecuted:false,evidence:'Integration actualRubycontroller/SmartPaint +syntheticAPI',decisions:['Pintar (callback de barra con API doble)','Clic en cara (API doble)'],count:2,initial,ready,painted,calls,windowsDpiMeasured:false},null,2));
 });
 test('Flujos086: elegir tarjeta arma una vez; cambiar material mantiene pintura y cancela cola',async({page},info)=>{
  await boot(page,info.outputDir,false);
  expect((await rpc('__flujos_dialogs')).toolState).toMatchObject({active:false});
  await page.getByRole('button',{name:/Placa QA sintética/}).click();
  await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
  expect((await rpc('__flujos_dialogs')).toolState).toMatchObject({active:true});
  const firstPaint=await rpc('__flujos_paint',{flags:4});expect(firstPaint.toolState).toMatchObject({active:true,queuedCount:0});expect(firstPaint.targetCatalogId).toBe('11111111-1111-4111-8111-000000000001');
  await page.getByRole('button',{name:/Placa QA alternativa/}).click();
  await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(2);
  const changed=await rpc('__flujos_dialogs');expect(changed.toolState).toMatchObject({active:true,queuedCount:0});expect(changed.targetCatalogId).toBe('11111111-1111-4111-8111-000000000001');
  const painted=await rpc('__flujos_paint');expect(painted.targetCatalogId).toBe('11111111-1111-4111-8111-000000000003');
  expect(painted.operations).toEqual(['start','commit','start','commit']);expect((painted.dialogs as Dialog[]).some(dialog=>dialog.file==='index.html')).toBe(false);
  expect(calls.filter(call=>call.action==='smart_tool_start')).toHaveLength(0);
  await writeFile('artifacts/flujos-086-cambio-material-metricas.json',JSON.stringify({nativeSketchupExecuted:false,chooserDecisionsIncludingToolbar:3,chooser:['Pintar','Tarjeta válida','Cara'],changeDecisionsWhileActive:2,change:['Otra tarjeta','Cara'],manualReactivationRequired:false,queuedSelectionCancelled:true,changed,calls},null,2));
 });
 test('Flujos086: paleta compacta conserva modos y controles a zoom CSS 100/125/150',async({page},info)=>{
  await boot(page,info.outputDir);
  for(const zoom of [1,1.25,1.5]){
   await page.evaluate(zoom=>{document.documentElement.style.zoom=String(zoom);},zoom);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   for(const name of ['Pintar pieza','Pintar canto','+ Material'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  }
  await page.evaluate(()=>{document.documentElement.style.zoom='1';});await screenshot(page,'after-palette-modes');
 });
}

if(baseline)test('Flujos baseline085: nombres y A4 requieren generar después de seleccionar',async({page},info)=>{
 await boot(page,info.outputDir,false,'furniture');
 await expect(page.getByRole('button',{name:'Generar guías (1)',exact:true})).toBeEnabled();
 expect(calls.filter(call=>call.action==='generate')).toHaveLength(0);
 await screenshot(page,'before-furniture-entry');
 await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
 await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();await screenshot(page,'before-furniture-editor');
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Planos A4',exact:true}).click();
 await screenshot(page,'before-a4-editor');
});
if(!baseline){
 test('Flujos086: selección abre piezas inline; un preview confirma un lote real',async({page},info)=>{
  await boot(page,info.outputDir,false,'furniture');
  const first=page.getByLabel('Nombre P01',{exact:true});await expect(first).toBeVisible();
  expect(calls.filter(call=>call.action==='generate')).toHaveLength(1);
  await screenshot(page,'after-furniture-editor');
  const original=await first.inputValue();await first.fill('Borrador cancelable');await first.press('Escape');await expect(first).toHaveValue(original);
  await first.fill('Lateral QA rápido');await first.press('Enter');
  await page.getByRole('button',{name:'Aplicar renombrado',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'Aplicar renombrado',exact:true});await expect(preview).toBeVisible();
  const headers=await preview.locator('th').evaluateAll(nodes=>nodes.map(node=>{
   const style=getComputedStyle(node),rgb=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number),lum=(channels:number[])=>channels.map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
   const a=lum(rgb(style.color)),b=lum(rgb(style.backgroundColor));return {contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fontSize:parseFloat(style.fontSize)};
  }));for(const header of headers){expect(header.contrast).toBeGreaterThanOrEqual(4.5);expect(header.fontSize).toBeGreaterThanOrEqual(12);}

  expect(calls.filter(call=>call.action==='guide_names_preview')).toHaveLength(1);
  const before=await rpc('__flujos_dialogs');expect((before.instanceNames as Record<string,string>)['11']).not.toContain('Lateral QA rápido');
  await screenshot(page,'after-names-preview');
  await preview.getByRole('button',{name:'Confirmar lote y guardar',exact:true}).click();await expect(preview).toBeHidden();
  expect(calls.filter(call=>call.action==='save')).toHaveLength(1);
  const after=await rpc('__flujos_dialogs');expect((after.instanceNames as Record<string,string>)['11']).toContain('Lateral QA rápido');
 });
 test('Flujos086: A4 inmediato muestra PDF real de una hoja, una y dos vistas',async({page},info)=>{
  await boot(page,info.outputDir,false,'guides');
  const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});await expect(preview).toBeVisible();
  const frame=preview.locator('iframe[title="PDF A4 generado"]');await expect(frame).toBeVisible();
  expect(calls.filter(call=>call.action==='generate')).toHaveLength(1);
  await page.getByRole('button',{name:'1 vista',exact:true}).click();
  await expect(page.getByRole('button',{name:'1 vista',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(frame).toBeVisible();
  const one=await frame.getAttribute('src');
  await page.getByRole('button',{name:'2 vistas',exact:true}).click();
  await expect(page.getByRole('button',{name:'2 vistas',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(frame).toBeVisible();await expect(frame).not.toHaveAttribute('src',one!);
  const [download]=await Promise.all([page.waitForEvent('download'),preview.getByRole('link',{name:'Descargar vista previa',exact:true}).click()]);
  const downloaded=await download.path();expect(downloaded).not.toBeNull();const bytes=await readFile(downloaded!);
  const pdf=await PDFDocument.load(new Uint8Array(bytes));expect(pdf.getPageCount()).toBe(1);
  const size=pdf.getPage(0).getSize();expect(size.width*25.4/72).toBeCloseTo(297,1);expect(size.height*25.4/72).toBeCloseTo(210,1);
  await writeFile('artifacts/flujos-086-A4-SINTETICO.pdf',Buffer.from(bytes));
  try{await execute('pdftoppm',['-r','120','-png','-singlefile','artifacts/flujos-086-A4-SINTETICO.pdf','artifacts/flujos-086-A4-RENDER-SINTETICO']);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  await screenshot(page,'after-a4-editor');
  await preview.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/flujos-086-after-a4-sheet-SINTETICA.png'});
  const layout=await preview.evaluate(element=>{const container=element.closest('.assembly-drawing')!,bounds=element.getBoundingClientRect(),parent=container.getBoundingClientRect();return {scrollTop:container.scrollTop,scrollHeight:container.scrollHeight,clientHeight:container.clientHeight,preview:{top:bounds.top,bottom:bounds.bottom},container:{top:parent.top,bottom:parent.bottom}};});
  await writeFile('artifacts/flujos-086-a4-layout.json',JSON.stringify(layout,null,2));expect(layout.preview.top).toBeGreaterThanOrEqual(layout.container.top);expect(layout.preview.bottom).toBeLessThanOrEqual(layout.container.bottom);
  expect(calls.filter(call=>call.action==='pdf'||call.action==='save')).toHaveLength(0);
 });
}

test.afterAll(async({browser})=>{
 if(baseline)return;
 const comparisons=[['Pintura desde la barra','before-paint-general','after-paint-compact'],['Mueble seleccionado: lista inmediata','before-furniture-entry','after-furniture-editor'],['Configuración A4','before-a4-editor','after-a4-editor']];
 const capture=(name:string,label:string)=>existsSync(`artifacts/flujos-086-${name}-SINTETICA.png`)?`<img src="flujos-086-${name}-SINTETICA.png" alt="${label}">`:'<p>Captura no disponible en esta ejecución; la línea base requiere el RBZ 0.8.5 congelado y PLANOS_FLUJOS_BASELINE=1.</p>';
 const blocks=comparisons.map(([title,before,after])=>`<section><h2>${title}</h2><div class="pair"><figure><figcaption>Antes · candidata 0.8.5</figcaption>${capture(before,`Antes: ${title}`)}</figure><figure><figcaption>Después · candidata 0.8.6</figcaption>${capture(after,`Después: ${title}`)}</figure></div></section>`).join('');
 const rendered=existsSync('artifacts/flujos-086-A4-RENDER-SINTETICO.png')?'<section><h2>PDF real generado por la vista previa (render Poppler)</h2><img src="flujos-086-A4-RENDER-SINTETICO.png" alt="Render del PDF sintético A4, una hoja"></section>':'';
 await writeFile('artifacts/flujos-086-comparacion-SINTETICA.html',`<!doctype html><html lang="es"><meta charset="utf-8"><title>Planos Santo · flujos 0.8.6</title><style>body{font:16px system-ui;background:#f4f4ee;color:#1d4237;max-width:1800px;margin:25px auto;padding:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:#fff;padding:10px}img{max-width:100%;height:auto}figcaption{padding:8px}section{margin:30px 0}</style><h1>Menos pasos · comparativa sintética</h1><p>Interfaz real de ambas candidatas y controlador Ruby real con dobles explícitos de HtmlDialog, modelo y materiales. No se ejecutó SketchUp ni se muestran imágenes privadas del taller. El prototipo del paquete no se utilizó como evidencia.</p><p>Baseline 0.8.5: RBZ SHA256 2ab072647d7b042b6a5ee39af91d93ce3eb8787931f3f44924ba166b052fd997. Mismo modelo L y tres materiales QA. La entrada de pintura anterior crea un diálogo general de 1440 × 920; la nueva registra únicamente palette.html 400 × 760. Las capturas de página completa muestran también los controles con desplazamiento y no imitan marcos de ventanas nativas.</p>${blocks}${rendered}<p>Métrica de integración: callback Pintar + clic de cara = dos decisiones con material recordado. El ciclo de HtmlDialog se registró con API doble; los clics físicos, DPI Windows, interacción con el modelo y ventanas reales requieren validación local.</p></html>`);
 const gallery=await browser.newPage({viewport:{width:1600,height:1000}});
 await gallery.route('https://flujos-gallery.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!/^flujos-086-[A-Za-z0-9-]+\.(html|png)$/.test(name))throw Error('Unexpected gallery asset');await route.fulfill({body:await readFile(resolve('artifacts',name)),contentType:name.endsWith('.html')?'text/html':'image/png'});});
 await gallery.goto('https://flujos-gallery.test/flujos-086-comparacion-SINTETICA.html');await gallery.locator('img').evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));
 await gallery.screenshot({path:'artifacts/flujos-086-comparacion-SINTETICA.png',fullPage:true});await gallery.close();
 const files=[...comparisons.flatMap(([,before,after])=>[`flujos-086-${before}-SINTETICA.png`,`flujos-086-${after}-SINTETICA.png`]),'flujos-086-after-names-preview-SINTETICA.png','flujos-086-after-a4-sheet-SINTETICA.png','flujos-086-A4-SINTETICO.pdf','flujos-086-A4-RENDER-SINTETICO.png'];
 const hashes=[];for(const name of files)if(existsSync(`artifacts/${name}`))hashes.push({file:name,sha256:createHash('sha256').update(await readFile(`artifacts/${name}`)).digest('hex')});
 await writeFile('artifacts/flujos-086-evidencias.json',JSON.stringify({nativeSketchupExecuted:false,privateCustomerAssets:false,baselineVersion:'0.8.5',candidateVersion:'0.8.6',files:hashes},null,2));
});
