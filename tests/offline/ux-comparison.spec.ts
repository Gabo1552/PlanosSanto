import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Same synthetic fixture and browser window across frozen 0.8.3 and new UI.
// These are HtmlDialog/browser comparisons, never native SketchUp screenshots.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],calls:string[];
async function boot(page:Page,folder:string,baseline=false){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 const installation=baseline?'/tmp/planos-ux-baseline-083':resolve('sketchup_offline/build');
 child=spawn(ruby,['sketchup_offline/test/ux_bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,PLANOS_TEST_INSTALL_DIR:installation,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('uxNativeRequest',(raw:string)=>new Promise<Reply>((resolve,reject)=>{const message=JSON.parse(raw);calls.push(message.action);pending.set(message.id,{resolve,reject});child.stdin.write(raw+'\n');}));
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.uxNativeRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve(installation,'planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.setViewportSize({width:1280,height:720});await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function shot(page:Page,name:string){await page.screenshot({path:`artifacts/ux-084-${name}-SINTETICA.png`,fullPage:true});}
async function comparisonManifest(){
 const names=(await readdir('artifacts')).filter(name=>/^ux-084-(?:before|after)-.*(?:SINTETICA|ICONOS)\.png$/.test(name)).sort();
 const files:Record<string,string>={};for(const name of names)files[name]=createHash('sha256').update(await readFile(resolve('artifacts',name))).digest('hex');
 await writeFile('artifacts/ux-084-comparison-manifest.json',JSON.stringify({baselineVersion:'0.8.3',baselineRbZSha256:'7d2d6c47fdc70245ede3c7c96d42dc7e943b7c55081082605428b99a97181b54',currentVersion:'0.8.4',fixture:'Same NamesFixture, orthogonally positioned two-board L-shaped cabinet, fixed QA materials, no customer assets',nativeSketchupExecuted:false,sizes:{comparison:{width:1280,height:720},materialLarge:{width:1920,height:1080},palette:{width:440,height:760}},browserCssZooms:[1,1.25,1.5],osDpiVerified:false,files},null,2));
}
async function comparisonGallery(){
 const sections=[['inicio','Inicio'],['materials','Materiales'],['furniture','Muebles'],['order','Maderera'],['guides','Planos A4'],['paint','Pintura compacta']];
 const rows=sections.map(([id,label])=>`<section><h2>${label}</h2><div class="pair"><figure><figcaption>Antes · 0.8.3</figcaption><img src="ux-084-before-${id}-SINTETICA.png" alt="${label}, interfaz anterior con fixture sintético"></figure><figure><figcaption>Después · candidata actual</figcaption><img src="ux-084-after-${id}-SINTETICA.png" alt="${label}, interfaz rediseñada con el mismo fixture"></figure></div></section>`).join('');
 await writeFile('artifacts/ux-084-comparacion.html',`<!doctype html><html lang="es"><meta charset="utf-8"><title>Planos Santo — comparación UI sintética</title><style>body{font:15px system-ui,sans-serif;margin:24px;background:#f4f3ef;color:#26322c}h1{font-size:25px}section{margin:28px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}figure{margin:0;min-width:0;background:white;border:1px solid #d4d9d0;padding:8px}figcaption{padding:8px;font-weight:600}img{display:block;max-width:100%;height:auto}p{max-width:900px;line-height:1.6}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Comparación de interfaz · fixture sintético</h1><p>Ambas versiones usan un mueble sintético en L de dos tablas (derivado de NamesFixture) y los mismos dos materiales QA. Ventana 1280 × 720; paleta 440 × 760. Capturas completas de Chromium offline, no pantallas nativas de SketchUp ni pruebas con materiales privados. La interfaz anterior de Muebles y Planos era el mismo editor; se muestran sus funciones dentro del contexto disponible en 0.8.3.</p>${rows}<section><h2>Iconos originales</h2><p>Láminas de archivos PNG originales, no captura de barras instaladas en SketchUp.</p><div class="pair"><figure><figcaption>Antes</figcaption><img src="ux-084-before-toolbar-ICONOS.png" alt="Iconos originales anteriores"></figure><figure><figcaption>Después</figcaption><img src="ux-084-after-toolbar-ICONOS.png" alt="Nuevos iconos lineales originales"></figure></div></section></html>`);
}

test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

if(process.env.PLANOS_UX_CAPTURE_BASELINE==='1')test('UX baseline 083: capturas congeladas comparables del mismo fixture sintético',async({page},info)=>{
 await boot(page,info.outputDir,true);
 await shot(page,'before-inicio');
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const workshop=page.getByRole('dialog',{name:'Biblioteca y pedidos'});await expect(workshop).toContainText('Placa QA sintética');await shot(page,'before-materials');await page.setViewportSize({width:1920,height:1080});await shot(page,'before-materials-1920');await page.setViewportSize({width:1280,height:720});
 await workshop.getByRole('button',{name:'Pedido maderera',exact:true}).click();await shot(page,'before-order');
 await workshop.getByRole('button',{name:/Cerrar/}).click();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();await shot(page,'before-furniture');await shot(page,'before-guides');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Pintado directo',exact:true}).click();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();await page.getByRole('button',{name:'Paleta compacta',exact:true}).click();await page.setViewportSize({width:440,height:760});await shot(page,'before-paint');
 await writeFile('artifacts/ux-084-baseline-capture.json',JSON.stringify({source:'Frozen0.8.3RBZHtmlDialog+actualRubycontrollerwithsyntheticAPIdoubles',viewport:{width:1280,height:720},paintViewport:{width:440,height:760},fixture:'NamesFixture positioned as two-board L cabinet +2fixedapprovedsyntheticcatalogitems',nativeSketchupExecuted:false,networkOffline:true,calls},null,2));
});

if(process.env.PLANOS_UX_CAPTURE_BASELINE!=='1'){
 test('UX actual: cinco destinos reales y capturas comparables sin exportaciones implícitas',async({page},info)=>{
  await boot(page,info.outputDir);
  const nav=page.getByRole('navigation',{name:'Módulos de Planos Santo'});
  await expect(nav).toBeVisible();
  for(const label of ['Inicio','Materiales','Muebles','Maderera','Planos A4'])await expect(nav.getByRole('button',{name:label,exact:true})).toBeVisible();
  await shot(page,'after-inicio');
  await nav.getByRole('button',{name:'Materiales',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
  await expect(page.getByText('Placa QA sintética',{exact:true}).first()).toBeVisible();await shot(page,'after-materials');
  const beforeNav=calls.length;await nav.getByRole('button',{name:'Maderera',exact:true}).click();
  await expect(page.getByRole('region',{name:'Optimización de placas'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await shot(page,'after-order');
  expect(calls.slice(beforeNav).some(action=>['pdf','order_save','order_export','maderera_txt','names_apply'].includes(action))).toBe(false);
  await nav.getByRole('button',{name:'Inicio',exact:true}).click();
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
  await nav.getByRole('button',{name:'Muebles',exact:true}).click();
  await page.screenshot({path:'artifacts/ux-084-after-furniture-VIEWPORT-SINTETICA.png'});
  const layout=await page.locator('.assembly-drawing').evaluate(holder=>{
   const svg=holder.querySelector<SVGSVGElement>('svg.diagram')!;const h=holder.getBoundingClientRect(),s=svg.getBoundingClientRect();
   return {scrollTop:holder.scrollTop,clientHeight:holder.clientHeight,scrollHeight:holder.scrollHeight,overflowY:getComputedStyle(holder).overflowY,holder:{top:h.top,bottom:h.bottom,height:h.height},svg:{top:s.top,bottom:s.bottom,height:s.height},svgViewBox:svg.getAttribute('viewBox'),svgBBox:(()=>{const b=svg.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height};})(),window:{width:innerWidth,height:innerHeight,scrollY}};
  });
  await writeFile('artifacts/ux-084-furniture-layout.json',JSON.stringify(layout,null,2));
  expect(layout.svg.bottom).toBeLessThanOrEqual(layout.holder.bottom+2);
  expect(layout.svg.top).toBeGreaterThanOrEqual(layout.holder.top-2);
  await shot(page,'after-furniture');
  await nav.getByRole('button',{name:'Planos A4',exact:true}).click();await shot(page,'after-guides');
  await page.getByRole('button',{name:'Pintura avanzada',exact:true}).click();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
  const compact=page.getByRole('button',{name:'Paleta compacta',exact:true});if(await compact.isVisible())await compact.click();
  await page.setViewportSize({width:440,height:760});await shot(page,'after-paint');
  expect(calls.some(action=>['pdf','order_save','order_export','names_apply','smart_tool_start'].includes(action))).toBe(false);await comparisonGallery();
  await writeFile('artifacts/ux-084-after-capture.json',JSON.stringify({source:'CurrentHtmlDialog+actualRubycontrollerwithsyntheticAPIdoubles',viewport:{width:1280,height:720},paintViewport:{width:440,height:760},fixture:'NamesFixture positioned as two-board L cabinet +2fixedapprovedsyntheticcatalogitems',nativeSketchupExecuted:false,networkOffline:true,calls},null,2));
 });
 test('UX materiales: búsqueda y destinos conservan contexto con teclado',async({page},info)=>{
  await boot(page,info.outputDir);const nav=page.getByRole('navigation',{name:'Módulos de Planos Santo'});
  const observedActions=[];const started=Date.now();
  await nav.getByRole('button',{name:'Materiales',exact:true}).click();observedActions.push({action:'click',target:'Materiales'});
  const search=page.getByRole('searchbox',{name:'Buscar materiales del taller',exact:true});await search.fill('Placa QA');observedActions.push({action:'fill',target:'Buscar materiales del taller'});
  await expect(page.getByText('Placa QA sintética',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Canto QA sintético',{exact:true})).toHaveCount(0);
  await writeFile('artifacts/ux-084-usability.json',JSON.stringify({source:'Observed browser automation, not human/nativeSketchUp timing',searchActions:observedActions,observedCount:observedActions.length,elapsedAutomationMs:Date.now()-started,nativeSketchupExecuted:false},null,2));
  await nav.getByRole('button',{name:'Inicio',exact:true}).focus();await page.keyboard.press('Tab');
  await expect(nav.getByRole('button',{name:'Materiales',exact:true})).toBeFocused();
  const focused=await page.evaluate(()=>{const style=getComputedStyle(document.activeElement!);return {outline:style.outlineStyle,width:parseFloat(style.outlineWidth)};});
  expect(focused.outline==='none'&&focused.width===0).toBe(false);
  await page.keyboard.press('Enter');await expect(search).toHaveValue('Placa QA');
 });
 test('UX adaptable: navegación y controles accesibles a tamaños y zoom CSS de ensayo',async({page},info)=>{
  await boot(page,info.outputDir);const nav=page.getByRole('navigation',{name:'Módulos de Planos Santo'});
  const measured=[];
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){
   await page.setViewportSize(viewport);
   for(const zoom of [1,1.25,1.5]){
    await page.evaluate(zoom=>{document.body.style.zoom=String(zoom);},zoom);
    await expect(nav.getByRole('button',{name:'Materiales',exact:true})).toBeVisible();await nav.getByRole('button',{name:'Materiales',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
    const metrics=await page.evaluate(()=>{
     const button=document.querySelector<HTMLElement>('.ux-rail button[aria-current="page"]')!;
     const style=getComputedStyle(button);
     const luminance=(rgb:string)=>{const values=(rgb.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return values.reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);};
     const a=luminance(style.color),b=luminance(style.backgroundColor);
     return {scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,activeTextContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth+2);expect(metrics.activeTextContrast).toBeGreaterThanOrEqual(4.5);
    for(const button of await nav.getByRole('button').all()){
     const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(32);expect(box!.height).toBeGreaterThanOrEqual(32);
    }
    measured.push({viewport,zoom,metrics});
   }
  }
  await page.evaluate(()=>{document.body.style.zoom='1';});await page.setViewportSize({width:1920,height:1080});await shot(page,'after-materials-1920');
  await writeFile('artifacts/ux-084-responsive.json',JSON.stringify({source:'Chromium CSS zoom and window dimensions; not native Windows DPI verification',nativeSketchupExecuted:false,measurements:measured},null,2));await comparisonManifest();
 });
}
