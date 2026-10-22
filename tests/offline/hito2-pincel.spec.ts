import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import release from '../../sketchup_offline/version.json';
// Hito 2 · pincel diario (docs/hito2-pincel/DISENO.md §1, §3, §4). Contrato de la
// paleta inmediata con un doble de transporte: no afirma resultados nativos
// (veredicto, copias, Undo); esos los cubren las suites Ruby y SketchUp real.
type Call={action:string;data:Record<string,unknown>};
type Hover={pieceId:string;faceId:string;name?:string;side?:string;sharedCount?:number;scope?:string;edgeCount?:number;expandedFaceIds?:string[];verdict?:{ok:boolean;reason?:string|null}};
type Tool={active:boolean;mode?:string;queuedCount:number;options?:Record<string,unknown>;hover?:Hover|null;error?:string;message?:string};
let calls:Call[],tool:Tool;
const item=(id:string,kind='sheet')=>({id,name:id==='photo'?'Roble foto QA':id==='edge'?'Canto QA':id==='edge2'?'Canto negro QA':'Placa QA',kind,approved:true,sku:'',supplier:'',favorite:false,thicknessMm:18,widthMm:1200,lengthMm:2400,grain:false,compatibleIds:[],price:null,sourceHash:'0'.repeat(64),updatedAt:'2026-10-22',observed:{}});
const sheetOptions={mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',immediate:true,immediatePiece:true,paintScope:'piece',side:'both'};
const edgeOptions={mode:'edge',catalogId:'edge',materialUuid:'edge-uuid',scope:'unique',immediate:true,immediatePiece:false,paintScope:'piece',side:'both',edgeCount:1};
async function boot(page:Page,folder:string,{props={},settings={},active}:{props?:Record<string,unknown>;settings?:Record<string,unknown>;active?:Record<string,unknown>}={}){
 calls=[];tool=active?{active:true,mode:String(active.mode),queuedCount:0,options:active}:{active:false,mode:'sheet',queuedCount:0};
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-hito2-entry-'));
 const entry=join(temp,'palette-entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{quickMode:true,initialCompact:true,...window.paletteProps,onClose:()=>{},onManage:()=>{},onApplied:()=>{},onCreateMaterial:()=>{}}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('hitoSetTool',(state:Tool)=>{tool=state;});
 await page.exposeFunction('immediateRequest',(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message;calls.push({action,data});let result:unknown;
  if(action==='diagnostic')result={extensionVersion:release.version};
  else if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items:[item('photo'),item('sheet'),item('edge','edge'),item('edge2','edge')]},visuals:{materials:['photo','sheet','edge','edge2'].map(id=>({id,name:id+' real QA',hasTexture:false,color:[113,81,55],binding:{uuid:id+'-uuid',catalogId:id,kind:id.startsWith('edge')?'edge':'sheet'},issues:[]}))},settings:{scope:'unique',...settings},toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  // Ruby (DISENO §1) informa el alcance autorizado tal como lo recibió.
  else if(action==='smart_quick_start'){tool={active:true,mode:data.mode as string,options:{...data,scope:data.scope==='all'&&data.allowShared===true?'all':'unique'},queuedCount:0,hover:tool.hover};result={toolState:tool};}
  else if(action==='smart_tool_stop'){tool={active:false,mode:tool.mode,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(props=>{const w=window as unknown as {paletteProps:unknown;immediateRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.paletteProps=props;w.sketchup={request:raw=>{void w.immediateRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};},props);
 await page.route('https://hito2.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><body class="standalone-paint-body"><div id="root"></div><script src="app.js"></script></body></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name))});});
 await page.context().setOffline(true);await page.setViewportSize({width:680,height:320});await page.goto('https://hito2.test/index.html');await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeEnabled();
}
const requests=(action:string)=>calls.filter(call=>call.action===action);
const starts=()=>requests('smart_quick_start');
const choose=(page:Page,name:string)=>page.getByRole('region',{name:'Materiales disponibles para pintar'}).getByRole('button',{name,exact:true}).click();
// Simula un push de Ruby (y lo deja como estado del doble para el sondeo de respaldo).
async function push(page:Page,state:Tool){await page.evaluate(async state=>{const w=window as unknown as {hitoSetTool:(state:unknown)=>Promise<void>};await w.hitoSetTool(state);window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:state}));},state);}
const edgeGroup=(page:Page)=>page.getByRole('group',{name:'Cantos por clic'});
const scopeGroup=(page:Page)=>page.getByRole('group',{name:'Alcance del clic'});

test('hito2: selector 1·2·4 toma settings.edgeCount, viaja en smart_quick_start y no detiene la herramienta',async({page},info)=>{
 await boot(page,info.outputDir,{settings:{edgeCount:2}});
 await expect(edgeGroup(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Pintar canto',exact:true}).click();
 await expect(edgeGroup(page)).toBeVisible();
 await expect(edgeGroup(page).getByRole('button',{name:'2 cantos opuestos',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(edgeGroup(page).getByRole('button',{name:'1 canto',exact:true})).toHaveAttribute('aria-pressed','false');
 await choose(page,'Canto QA');await expect.poll(()=>starts().length).toBe(1);
 expect(starts()[0].data).toMatchObject({mode:'edge',catalogId:'edge',materialUuid:'edge-uuid',edgeCount:2,scope:'unique',immediate:true,immediatePiece:false});
 await edgeGroup(page).getByRole('button',{name:'4 cantos',exact:true}).click();await expect.poll(()=>starts().length).toBe(2);
 expect(starts()[1].data).toMatchObject({mode:'edge',catalogId:'edge',materialUuid:'edge-uuid',edgeCount:4,scope:'unique'});
 await expect(edgeGroup(page).getByRole('button',{name:'4 cantos',exact:true})).toHaveAttribute('aria-pressed','true');
 // Cambiar de canto conserva el 4 elegido.
 await choose(page,'Canto negro QA');await expect.poll(()=>starts().length).toBe(3);expect(starts()[2].data).toMatchObject({catalogId:'edge2',edgeCount:4});
 // Quitar canto también lleva la cantidad y muestra el selector.
 await page.getByLabel('Más herramientas de pintura',{exact:true}).click();await page.getByRole('button',{name:'Quitar canto',exact:true}).click();await expect.poll(()=>starts().length).toBe(4);
 expect(starts()[3].data).toMatchObject({mode:'remove_edge',edgeCount:4,scope:'unique'});await expect(edgeGroup(page)).toBeVisible();
 expect(requests('smart_tool_stop')).toHaveLength(0);expect(requests('smart_tool_start')).toHaveLength(0);
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
});

test('hito2: arranque con material elegido usa la cantidad persistida, no 1 fijo',async({page},info)=>{
 await boot(page,info.outputDir,{props:{initialCatalogId:'edge',autoStart:true},settings:{edgeCount:4,mode:'edge'}});
 await expect.poll(()=>starts().length).toBe(1);expect(starts()[0].data).toMatchObject({mode:'edge',catalogId:'edge',edgeCount:4,scope:'unique'});expect(starts()[0].data.allowShared).not.toBe(true);
 await expect(edgeGroup(page).getByRole('button',{name:'4 cantos',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('hito2: Ctrl+Tab en el modelo (options.edgeCount 4) actualiza el selector',async({page},info)=>{
 await boot(page,info.outputDir,{active:edgeOptions});
 await expect(edgeGroup(page).getByRole('button',{name:'1 canto',exact:true})).toHaveAttribute('aria-pressed','true');
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,edgeCount:4},message:'4 cantos'});
 await expect(edgeGroup(page).getByRole('button',{name:'4 cantos',exact:true})).toHaveAttribute('aria-pressed','true');
 // Un evento de placa (Ruby fuerza 1 allí) no pisa la cantidad elegida para cantos.
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,edgeCount:1}});
 await expect(edgeGroup(page)).toHaveCount(0);
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,edgeCount:4}});
 await expect(edgeGroup(page).getByRole('button',{name:'4 cantos',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(starts()).toHaveLength(0);
});

test('hito2: «Todas las iguales (4)» autoriza en la misma solicitud y cambiar de material vuelve a «Solo esta»',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 await expect(scopeGroup(page).getByRole('button',{name:'Todas las iguales (—)',exact:true})).toBeVisible();
 await expect(scopeGroup(page).getByRole('button',{name:'Solo esta',exact:true})).toHaveAttribute('aria-pressed','true');
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,hover:{pieceId:'1/11',faceId:'101',name:'Puerta 3',side:'both',sharedCount:4,scope:'unique',edgeCount:1,expandedFaceIds:['101','102'],verdict:{ok:true,reason:null}}});
 await scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true}).click();await expect.poll(()=>starts().length).toBe(1);
 expect(starts()[0].data).toMatchObject({mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'all',allowShared:true,immediate:true,immediatePiece:true,paintScope:'piece',side:'both',batch:false});
 await expect(scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('Pinta todas las copias de la definición con un solo Undo.',{exact:true})).toBeVisible();
 await page.waitForTimeout(1200);// el sondeo de respaldo con scope 'all' no lo resetea
 await expect(scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'artifacts/hito2-paleta-todas-680-SINTETICA.png'});
 await choose(page,'Roble foto QA');await expect.poll(()=>starts().length).toBe(2);
 expect(starts()[1].data).toMatchObject({catalogId:'photo',scope:'unique'});expect(starts()[1].data.allowShared).not.toBe(true);
 await expect(scopeGroup(page).getByRole('button',{name:'Solo esta',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('Pinta todas las copias de la definición con un solo Undo.',{exact:true})).toHaveCount(0);
 expect(requests('smart_tool_stop')).toHaveLength(0);
});

test('hito2: cambiar de modo, Terminar o un evento con scope unique resetean «Todas»',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 const all=()=>scopeGroup(page).getByRole('button',{name:/^Todas las iguales/});
 const only=()=>scopeGroup(page).getByRole('button',{name:'Solo esta',exact:true});
 // Evento de Ruby (p. ej. Tab o flechas en el modelo) con scope unique.
 await all().click();await expect.poll(()=>starts().length).toBe(1);await expect(all()).toHaveAttribute('aria-pressed','true');
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,scope:'unique'}});await expect(only()).toHaveAttribute('aria-pressed','true');
 // Cambio de modo desde la paleta.
 await all().click();await expect.poll(()=>starts().length).toBe(2);expect(starts()[1].data).toMatchObject({scope:'all',allowShared:true});
 await page.getByRole('button',{name:'Pintar canto',exact:true}).click();await expect(only()).toHaveAttribute('aria-pressed','true');
 await choose(page,'Canto QA');await expect.poll(()=>starts().length).toBe(3);expect(starts()[2].data).toMatchObject({mode:'edge',scope:'unique'});expect(starts()[2].data.allowShared).not.toBe(true);
 // Terminar.
 await all().click();await expect.poll(()=>starts().length).toBe(4);expect(starts()[3].data).toMatchObject({mode:'edge',scope:'all',allowShared:true,edgeCount:1});
 await page.getByRole('button',{name:'Terminar',exact:true}).click();await expect(page.getByText('○ Detenido',{exact:true})).toBeVisible();await expect(only()).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Pintar',exact:true}).click();await expect.poll(()=>starts().length).toBe(5);expect(starts()[4].data).toMatchObject({mode:'edge',scope:'unique'});expect(starts()[4].data.allowShared).not.toBe(true);
 // «Solo esta» vuelve explícitamente.
 await all().click();await expect.poll(()=>starts().length).toBe(6);await only().click();await expect.poll(()=>starts().length).toBe(7);expect(starts()[6].data).toMatchObject({scope:'unique'});expect(starts()[6].data.allowShared).not.toBe(true);
});

test('hito2: el pie muestra el veredicto del hover y los cantos que pinta el clic',async({page},info)=>{
 await boot(page,info.outputDir,{active:{...edgeOptions,edgeCount:4}});
 const footer=page.locator('.immediate-footer');
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,edgeCount:4},hover:{pieceId:'1/11',faceId:'101',name:'Puerta 3',side:'both',sharedCount:4,scope:'unique',edgeCount:4,expandedFaceIds:['103','104','105','106'],verdict:{ok:true,reason:null}}});
 await expect(footer).toContainText('Puerta 3');await expect(footer).toContainText('4 cantos');
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,edgeCount:4},hover:{pieceId:'1/12',faceId:'201',name:'Lateral',side:'both',sharedCount:1,scope:'unique',edgeCount:4,expandedFaceIds:[],verdict:{ok:false,reason:'Canto sin placa: pintá primero la placa de esta pieza.'}}});
 const verdict=footer.getByRole('status').filter({hasText:'Canto sin placa'});
 await expect(verdict).toHaveText('Canto sin placa: pintá primero la placa de esta pieza.');await expect(verdict).toHaveClass(/blocked/);
 await expect(scopeGroup(page).getByRole('button',{name:'Todas las iguales (1)',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/hito2-paleta-veredicto-680-SINTETICA.png'});
 expect(starts()).toHaveLength(0);
});

test('hito2: ayuda de teclado visible y Tab sigue navegando la paleta',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 await expect(page.getByText('Tab alterna pieza/canto · Ctrl+Tab cambia 1/2/4 cantos · Esc termina',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Pintar pieza',exact:true}).focus();const before=calls.length;
 await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Pintar canto',exact:true})).toBeFocused();
 await page.keyboard.press('Control+Tab');await page.waitForTimeout(100);expect(calls.slice(before).filter(call=>call.action!=='smart_tool_status')).toHaveLength(0);
});

test('hito2: paleta compacta 680x320 y 360 sin scroll horizontal ni solapamientos',async({page},info)=>{
 await boot(page,info.outputDir,{active:{...edgeOptions,edgeCount:2}});
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,edgeCount:2},hover:{pieceId:'1/11',faceId:'101',name:'Puerta 3',side:'both',sharedCount:4,scope:'unique',edgeCount:2,expandedFaceIds:['103','105'],verdict:{ok:true,reason:null}}});
 await scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true}).click();await expect.poll(()=>starts().length).toBe(1);
 for(const width of [680,360]){
  await page.setViewportSize({width,height:320});
  const geometry=await page.evaluate(()=>{
   const boxes=[...document.querySelectorAll('.immediate-options button, .immediate-options .immediate-scope-warning')].map(element=>element.getBoundingClientRect());
   const overlaps=boxes.some((a,i)=>boxes.some((b,j)=>j>i&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));
   return {scroll:document.documentElement.scrollWidth,viewport:window.innerWidth,overlaps,outside:boxes.some(box=>box.right>window.innerWidth+0.5||box.left<-0.5)};
  });
  expect(geometry.scroll).toBeLessThanOrEqual(width);expect(geometry.overlaps).toBe(false);expect(geometry.outside).toBe(false);
  await expect(edgeGroup(page)).toBeVisible();await expect(scopeGroup(page)).toBeVisible();
  await page.screenshot({path:`artifacts/hito2-paleta-canto-${width}-SINTETICA.png`,fullPage:true});
 }
});
