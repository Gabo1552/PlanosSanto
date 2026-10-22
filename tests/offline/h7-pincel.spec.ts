import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import release from '../../sketchup_offline/version.json';
// Adelanto del Hito 7 · pincel avanzado (docs/hito2-pincel/DISENO_H7_PINCEL.md §6 y §7). Contrato de la
// paleta inmediata con un doble de transporte que agrega smart_tool_option: no afirma resultados nativos
// (revisión, profundidad, cuentagotas temporal); esos los cubren las suites Ruby y SketchUp real.
type Call={action:string;data:Record<string,unknown>};
type Review={active:boolean;missingSheet:number;partialEdges:number;truncated:boolean};
type Hover={pieceId:string;faceId:string;name?:string;side?:string;sharedCount?:number;scope?:string;edgeCount?:number;expandedFaceIds?:string[];verdict?:{ok:boolean;reason?:string|null};depth?:{index:number;count:number};summary?:{sheetName:string|null;edgeSides:number}};
type Tool={active:boolean;mode?:string;queuedCount:number;options?:Record<string,unknown>;hover?:Hover|null;review?:Review|null;sampling?:boolean;error?:string;message?:string};
let calls:Call[],tool:Tool,stored:Record<string,unknown>;
// Retrasa (y opcionalmente hace fallar) el próximo smart_tool_option del doble.
let optionHook:(()=>Promise<'fail'|void>)|undefined;
const counts:Review={active:true,missingSheet:3,partialEdges:2,truncated:false};
const item=(id:string,kind='sheet')=>({id,name:id==='edge'?'Canto QA':'Placa QA',kind,approved:true,sku:'',supplier:'',favorite:false,thicknessMm:18,widthMm:1200,lengthMm:2400,grain:false,compatibleIds:[],price:null,sourceHash:'0'.repeat(64),updatedAt:'2026-10-22',observed:{}});
const sheetOptions={mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',immediate:true,immediatePiece:true,paintScope:'piece',side:'both'};
const edgeOptions={mode:'edge',catalogId:'edge',materialUuid:'edge-uuid',scope:'unique',immediate:true,immediatePiece:false,paintScope:'piece',side:'both',edgeCount:2};
async function boot(page:Page,folder:string,{settings={},active}:{settings?:Record<string,unknown>;active?:Record<string,unknown>}={}){
 calls=[];optionHook=undefined;stored={scope:'unique',...settings};tool=active?{active:true,mode:String(active.mode),queuedCount:0,options:active}:{active:false,mode:'sheet',queuedCount:0};
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-h7-entry-'));
 const entry=join(temp,'palette-entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{quickMode:true,initialCompact:true,onClose:()=>{},onManage:()=>{},onApplied:()=>{},onCreateMaterial:()=>{}}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('h7SetTool',(state:Tool)=>{tool=state;});
 await page.exposeFunction('immediateRequest',async(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message;calls.push({action,data});let result:unknown;
  const fail=(error:string)=>({version:1,id:message.id,result:null,error});
  if(action==='diagnostic')result={extensionVersion:release.version};
  else if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items:[item('sheet'),item('edge','edge')]},visuals:{materials:['sheet','edge'].map(id=>({id,name:id+' real QA',hasTexture:false,color:[113,81,55],binding:{uuid:id+'-uuid',catalogId:id,kind:id==='edge'?'edge':'sheet'},issues:[]}))},settings:stored,toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='smart_quick_start'){tool={...tool,active:true,mode:data.mode as string,options:{...tool.options,...data,scope:'unique'},queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_stop'){tool={active:false,mode:tool.mode,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  // DISENO_H7 §7: solo reviewMissing (bool, herramienta activa, no persiste) y sampleKey (persiste y se aplica).
  else if(action==='smart_tool_option'){
   if(optionHook){const hook=optionHook;optionHook=undefined;if(await hook()==='fail')return fail('Fallo simulado de SketchUp');}
   const {key,value}=data as {key:string;value:unknown};
   if(key==='reviewMissing'&&typeof value==='boolean'){if(!tool.active)return fail('No hay herramienta activa.');tool={...tool,options:{...tool.options,reviewMissing:value},review:value?counts:null};}
   else if(key==='sampleKey'&&(value==='shift'||value==='alt'||value==='off')){stored={...stored,sampleKey:value};if(tool.active)tool={...tool,options:{...tool.options,sampleKey:value}};}
   else return fail('Opción no admitida.');
   result={toolState:tool};
  }else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(()=>{const w=window as unknown as {immediateRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.sketchup={request:raw=>{void w.immediateRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};});
 await page.route('https://h7.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><body class="standalone-paint-body"><div id="root"></div><script src="app.js"></script></body></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name))});});
 await page.context().setOffline(true);await page.setViewportSize({width:680,height:320});await page.goto('https://h7.test/index.html');await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeEnabled();
}
const options=()=>calls.filter(call=>call.action==='smart_tool_option');
// Push de Ruby que también queda como estado del doble (para el sondeo de respaldo).
async function push(page:Page,state:Tool){await page.evaluate(async state=>{const w=window as unknown as {h7SetTool:(state:unknown)=>Promise<void>};await w.h7SetTool(state);window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:state}));},state);}
// Push que solo llega a la paleta (evento viejo en tránsito): el doble conserva su estado.
async function stalePush(page:Page,state:Tool){await page.evaluate(state=>{window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:state}));},state);}
const hold=()=>{let release:(value?:'fail')=>void=()=>{};const gate=new Promise<'fail'|void>(resolve=>{release=resolve;});return {gate,release};};
const review=(page:Page)=>page.getByRole('button',{name:'Revisar lo que falta',exact:true});
const reviewCounts=(page:Page)=>page.locator('.immediate-review-counts');
const keyGroup=(page:Page)=>page.getByRole('radiogroup',{name:'Tecla del cuentagotas'});
const openMore=(page:Page)=>page.getByLabel('Más herramientas de pintura',{exact:true}).click();
const hover:Hover={pieceId:'1/11',faceId:'101',name:'Puerta 3',side:'both',sharedCount:1,scope:'unique',edgeCount:2,expandedFaceIds:['103','105'],verdict:{ok:true,reason:null}};

test('h7: «Revisar lo que falta» deshabilitado sin herramienta; activo envía reviewMissing y muestra los conteos de Ruby',async({page},info)=>{
 await boot(page,info.outputDir);
 await expect(review(page)).toBeDisabled();await expect(review(page)).toHaveAttribute('aria-pressed','false');
 await page.getByRole('region',{name:'Materiales disponibles para pintar'}).getByRole('button',{name:'Placa QA',exact:true}).click();
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();await expect(review(page)).toBeEnabled();
 await review(page).click();await expect.poll(()=>options().length).toBe(1);expect(options()[0].data).toEqual({key:'reviewMissing',value:true});
 await expect(review(page)).toHaveAttribute('aria-pressed','true');await expect(reviewCounts(page)).toHaveText('Sin placa: 3 · Cantos parciales: 2');
 await page.waitForTimeout(1200);await expect(review(page)).toHaveAttribute('aria-pressed','true');// el sondeo de respaldo lo confirma
 // Tope de 2000 piezas: Ruby avisa truncated.
 await push(page,{...tool,review:{active:true,missingSheet:2000,partialEdges:14,truncated:true}});await expect(reviewCounts(page)).toHaveText('Sin placa: 2000+ · Cantos parciales: 14+');
 await review(page).click();await expect.poll(()=>options().length).toBe(2);expect(options()[1].data).toEqual({key:'reviewMissing',value:false});
 await expect(review(page)).toHaveAttribute('aria-pressed','false');await expect(reviewCounts(page)).toHaveCount(0);
 // Tecla R en el modelo: la paleta solo refleja lo que dice Ruby, sin enviar nada.
 await push(page,{...tool,options:{...tool.options,reviewMissing:true},review:counts});await expect(review(page)).toHaveAttribute('aria-pressed','true');expect(options()).toHaveLength(2);
 // Terminar apaga el conmutador (Ruby ya no informa herramienta activa).
 await page.getByRole('button',{name:'Terminar',exact:true}).click();await expect(review(page)).toBeDisabled();await expect(review(page)).toHaveAttribute('aria-pressed','false');await expect(reviewCounts(page)).toHaveCount(0);
});

test('h7: el conmutador sigue a Ruby aunque llegue un push viejo durante el request',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 const {gate,release}=hold();optionHook=()=>gate;
 await review(page).click();await expect.poll(()=>options().length).toBe(1);
 // Push anterior a la respuesta, todavía sin revisión: no baja el conmutador mientras espera.
 await stalePush(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,reviewMissing:false},hover});
 await expect(review(page)).toHaveAttribute('aria-pressed','true');
 release();await expect.poll(()=>tool.review?.active).toBe(true);
 await expect(review(page)).toHaveAttribute('aria-pressed','true');await expect(reviewCounts(page)).toHaveText('Sin placa: 3 · Cantos parciales: 2');
 await page.waitForTimeout(1200);await expect(review(page)).toHaveAttribute('aria-pressed','true');
});

test('h7: si el request falla, el conmutador muestra lo último que dijo Ruby (también un R pulsado en el medio)',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 let gated=hold();optionHook=()=>gated.gate;
 await review(page).click();await expect.poll(()=>options().length).toBe(1);await expect(review(page)).toHaveAttribute('aria-pressed','true');
 gated.release('fail');await expect(page.getByText(/Fallo simulado de SketchUp/)).toBeVisible();
 await expect(review(page)).toHaveAttribute('aria-pressed','false',{timeout:300});await expect(reviewCounts(page)).toHaveCount(0);
 // Ahora el usuario apaga; mientras tanto R en el modelo la dejó encendida y el request falla: gana Ruby (encendida).
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,reviewMissing:true},review:counts});await expect(review(page)).toHaveAttribute('aria-pressed','true');
 gated=hold();optionHook=()=>gated.gate;
 await review(page).click();await expect.poll(()=>options().length).toBe(2);expect(options()[1].data).toEqual({key:'reviewMissing',value:false});
 await expect(review(page)).toHaveAttribute('aria-pressed','false');
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,reviewMissing:true},review:{...counts,missingSheet:5}});
 gated.release('fail');await expect(page.getByText(/Fallo simulado de SketchUp/)).toBeVisible();
 await expect(review(page)).toHaveAttribute('aria-pressed','true',{timeout:300});await expect(reviewCounts(page)).toHaveText('Sin placa: 5 · Cantos parciales: 2');
});

test('h7: «Tecla del cuentagotas» toma settings.sampleKey (defecto Mayús), envía sampleKey y adapta la ayuda',async({page},info)=>{
 await boot(page,info.outputDir);
 await openMore(page);
 await expect(keyGroup(page).getByRole('radio',{name:'Mayús',exact:true})).toBeChecked();
 await expect(page.getByText('↑/↓ eligen la pieza de atrás · Mayús sostenida toma material · R revisa lo que falta',{exact:true})).toBeVisible();
 // Funciona también sin herramienta activa: se persiste en settings.
 await keyGroup(page).getByRole('radio',{name:'Alt',exact:true}).check();await expect.poll(()=>options().length).toBe(1);
 expect(options()[0].data).toEqual({key:'sampleKey',value:'alt'});expect(stored.sampleKey).toBe('alt');
 await expect(keyGroup(page).getByRole('radio',{name:'Alt',exact:true})).toBeChecked();
 await expect(page.getByText('↑/↓ eligen la pieza de atrás · Alt sostenida toma material · R revisa lo que falta',{exact:true})).toBeVisible();
 await keyGroup(page).getByRole('radio',{name:'Desactivada',exact:true}).check();await expect.poll(()=>options().length).toBe(2);expect(options()[1].data).toEqual({key:'sampleKey',value:'off'});
 await expect(page.getByText('↑/↓ eligen la pieza de atrás · R revisa lo que falta',{exact:true})).toBeVisible();
 await expect(page.getByText(/sostenida toma material/)).toHaveCount(0);
 expect(calls.filter(call=>call.action==='smart_quick_start'||call.action==='smart_tool_stop')).toHaveLength(0);
});

test('h7: fallo de sampleKey vuelve al valor de Ruby; un push de la herramienta actualiza el selector',async({page},info)=>{
 await boot(page,info.outputDir,{settings:{sampleKey:'alt'},active:{...edgeOptions,sampleKey:'alt'}});
 await openMore(page);const alt=keyGroup(page).getByRole('radio',{name:'Alt',exact:true}),off=keyGroup(page).getByRole('radio',{name:'Desactivada',exact:true}),shift=keyGroup(page).getByRole('radio',{name:'Mayús',exact:true});
 await expect(alt).toBeChecked();
 const {gate,release}=hold();optionHook=()=>gate;
 await off.check();await expect.poll(()=>options().length).toBe(1);await expect(off).toBeChecked();
 release('fail');await expect(page.getByText(/Fallo simulado de SketchUp/)).toBeVisible();
 await expect(alt).toBeChecked({timeout:300});await expect(off).not.toBeChecked();expect(stored.sampleKey).toBe('alt');
 await expect(page.getByText('↑/↓ eligen la pieza de atrás · Alt sostenida toma material · R revisa lo que falta',{exact:true})).toBeVisible();
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...edgeOptions,sampleKey:'shift'}});await expect(shift).toBeChecked();
});

test('h7: el pie muestra cuentagotas temporal, profundidad y resumen de la pieza',async({page},info)=>{
 await boot(page,info.outputDir,{active:edgeOptions});
 const footer=page.locator('.immediate-footer');
 await push(page,{active:true,mode:'edge',queuedCount:0,options:edgeOptions,hover:{...hover,depth:{index:2,count:3},summary:{sheetName:'Melamina Blanca',edgeSides:2}}});
 await expect(footer.getByText('Pieza 2 de 3 bajo el cursor (↑/↓)',{exact:true})).toBeVisible();
 await expect(footer.getByText('Placa: Melamina Blanca · Cantos: 2/4',{exact:true})).toBeVisible();
 await expect(footer).toContainText('Puerta 3');
 await page.screenshot({path:'artifacts/h7-paleta-pie-680-SINTETICA.png'});
 await push(page,{active:true,mode:'edge',queuedCount:0,options:edgeOptions,hover:{...hover,depth:{index:1,count:1},summary:{sheetName:null,edgeSides:0}}});
 await expect(footer.getByText(/bajo el cursor/)).toHaveCount(0);await expect(footer.getByText('Sin placa · Cantos: 0/4',{exact:true})).toBeVisible();
 await push(page,{active:true,mode:'edge',queuedCount:0,options:edgeOptions,hover:null,sampling:true});
 await expect(footer.getByText('Clic para tomar material · soltá la tecla para volver',{exact:true})).toBeVisible();
 await expect(footer.getByText(/Placa:|Sin placa/)).toHaveCount(0);
 await page.screenshot({path:'artifacts/h7-paleta-cuentagotas-680-SINTETICA.png'});
 await push(page,{active:true,mode:'edge',queuedCount:0,options:edgeOptions,hover:null,sampling:false});
 await expect(footer.getByText('Clic para tomar material · soltá la tecla para volver',{exact:true})).toHaveCount(0);
 expect(options()).toHaveLength(0);
});

test('h7: paleta con revisión, profundidad y resumen a 680x320 y 360 sin scroll horizontal ni solapamientos',async({page},info)=>{
 await boot(page,info.outputDir,{active:edgeOptions});
 await review(page).click();await expect.poll(()=>options().length).toBe(1);
 await push(page,{...tool,hover:{...hover,name:'Lateral izquierdo del módulo alto',depth:{index:2,count:3},summary:{sheetName:'Melamina Blanca Texturada 18',edgeSides:3}},review:{active:true,missingSheet:2000,partialEdges:120,truncated:true}});
 await expect(reviewCounts(page)).toHaveText('Sin placa: 2000+ · Cantos parciales: 120+');
 for(const width of [680,360]){
  await page.setViewportSize({width,height:320});
  const geometry=await page.evaluate(()=>{
   const pick=(selector:string)=>[...document.querySelectorAll(selector)].map(element=>element.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
   const overlap=(boxes:DOMRect[])=>boxes.some((a,i)=>boxes.some((b,j)=>j>i&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));
   const options=pick('.immediate-options button, .immediate-options .immediate-scope-warning, .immediate-options .immediate-review-counts'),footer=pick('.immediate-footer>*'),all=[...options,...footer];
   return {scroll:document.documentElement.scrollWidth,overlaps:overlap(options)||overlap(footer),outside:all.some(box=>box.right>window.innerWidth+0.5||box.left<-0.5)};
  });
  expect(geometry.scroll).toBeLessThanOrEqual(width);expect(geometry.overlaps).toBe(false);expect(geometry.outside).toBe(false);
  await page.screenshot({path:`artifacts/h7-paleta-revision-${width}-SINTETICA.png`,fullPage:true});
 }
 await openMore(page);await expect(keyGroup(page)).toBeVisible();
 const menu=await page.locator('.immediate-more>div').evaluate(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,viewport:window.innerWidth,scroll:document.documentElement.scrollWidth};});
 expect(menu.left).toBeGreaterThanOrEqual(-0.5);expect(menu.right).toBeLessThanOrEqual(menu.viewport+0.5);expect(menu.scroll).toBeLessThanOrEqual(360);
 await page.screenshot({path:'artifacts/h7-paleta-menu-360-SINTETICA.png',fullPage:true});
});
