import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
// Hito 7 · pincel avanzado (docs/hito2-pincel/DISENO_AVANZADO.md §4). Contrato de la paleta
// inmediata con un doble de transporte: no afirma nada del dibujo en la vista, del muestreo
// ni de la transparencia real; eso lo cubren las suites Ruby y la validación en SketchUp.
type Call={action:string;data:Record<string,unknown>};
type Missing={enabled:boolean;withoutSheet:number;evaluated:number;truncated:boolean};
type Hover={pieceId:string;faceId:string;name?:string;sharedCount?:number;scope?:string;edgeCount?:number;verdict?:{ok:boolean;reason?:string|null};depth?:{index:number;count:number}};
type Tool={active:boolean;mode?:string;queuedCount:number;options?:Record<string,unknown>;hover?:Hover|null;sampling?:boolean;missing?:Missing;transparency?:boolean;eyedropperKey?:string};
let calls:Call[],tool:Tool,settings:Record<string,unknown>,transparency:boolean;
const item=(id:string,kind='sheet')=>({id,name:id==='photo'?'Roble foto QA':id==='edge'?'Canto QA':'Placa QA',kind,approved:true,sku:'',supplier:'',favorite:false,thicknessMm:18,widthMm:1200,lengthMm:2400,grain:false,compatibleIds:[],price:null,sourceHash:'0'.repeat(64),updatedAt:'2026-10-22',observed:{}});
const sheetOptions={mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',immediate:true,immediatePiece:true,paintScope:'piece',side:'both',edgeCount:1};
const hover={pieceId:'1/11',faceId:'101',name:'Puerta 3',sharedCount:4,scope:'unique',edgeCount:1,verdict:{ok:true,reason:null}};
async function boot(page:Page,folder:string,{initial={},active}:{initial?:Record<string,unknown>;active?:Record<string,unknown>}={}){
 calls=[];settings={scope:'unique',...initial};transparency=false;tool=active?{active:true,mode:String(active.mode),queuedCount:0,options:active}:{active:false,mode:'sheet',queuedCount:0};
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-avanzado-entry-'));
 const entry=join(temp,'palette-entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{quickMode:true,initialCompact:true,onClose:()=>{},onManage:()=>{},onApplied:()=>{},onCreateMaterial:()=>{}}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('avanzadoSetTool',(state:Tool)=>{tool=state;});
 await page.exposeFunction('avanzadoRequest',async(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message;calls.push({action,data});let result:unknown;
  if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items:[item('photo'),item('sheet'),item('edge','edge')]},visuals:{materials:['photo','sheet','edge'].map(id=>({id,name:id+' real QA',hasTexture:false,color:[113,81,55],binding:{uuid:id+'-uuid',catalogId:id,kind:id==='edge'?'edge':'sheet'},issues:[]}))},settings,toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='smart_quick_start'){tool={...tool,active:true,mode:data.mode as string,options:{...data,scope:data.scope==='all'&&data.allowShared===true?'all':'unique'},queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_stop'){tool={active:false,mode:tool.mode,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  // Ruby (DISENO_AVANZADO §3): las acciones de vista responden el estado sin detener la herramienta.
  else if(action==='smart_tool_view'){tool={...tool,missing:{enabled:data.highlightMissing===true,withoutSheet:data.highlightMissing===true?3:0,evaluated:12,truncated:false}};result={toolState:tool};}
  else if(action==='smart_toggle_transparency'){transparency=!transparency;tool={...tool,transparency};result={transparency,toolState:tool};}
  else if(action==='smart_eyedropper_key'){settings={...settings,eyedropperKey:data.key};result={settings,toolState:tool};}
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(()=>{const w=window as unknown as {avanzadoRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.sketchup={request:raw=>{void w.avanzadoRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};});
 await page.route('https://avanzado.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><body class="standalone-paint-body"><div id="root"></div><script src="app.js"></script></body></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name))});});
 await page.context().setOffline(true);await page.setViewportSize({width:680,height:360});await page.goto('https://avanzado.test/index.html');await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeEnabled();
}
const requests=(action:string)=>calls.filter(call=>call.action===action);
const starts=()=>requests('smart_quick_start');
// Simula un push de Ruby (y lo deja como estado del doble para el sondeo de respaldo).
async function push(page:Page,state:Tool){await page.evaluate(async state=>{const w=window as unknown as {avanzadoSetTool:(state:unknown)=>Promise<void>};await w.avanzadoSetTool(state);window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:state}));},state);}
const viewGroup=(page:Page)=>page.getByRole('group',{name:'Vista del modelo'});
const keyGroup=(page:Page)=>page.getByRole('group',{name:'Tecla del cuentagotas'});
const scopeGroup=(page:Page)=>page.getByRole('group',{name:'Alcance del clic'});

test('avanzado: «Resaltar lo que falta» envía smart_tool_view y muestra «Sin placa: N piezas»',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 const missing=viewGroup(page).getByRole('button',{name:'Resaltar lo que falta',exact:true});
 await expect(missing).toHaveAttribute('aria-pressed','false');await expect(missing).toBeEnabled();
 await missing.click();await expect.poll(()=>requests('smart_tool_view').length).toBe(1);
 expect(requests('smart_tool_view')[0].data).toEqual({highlightMissing:true});
 await expect(missing).toHaveAttribute('aria-pressed','true');await expect(page.getByText('Sin placa: 3 piezas',{exact:true})).toBeVisible();
 await push(page,{...tool,missing:{enabled:true,withoutSheet:300,evaluated:500,truncated:true}});
 await expect(page.getByText('Sin placa: 300+ piezas',{exact:true})).toBeVisible();
 await push(page,{...tool,missing:{enabled:true,withoutSheet:1,evaluated:4,truncated:false}});
 await expect(page.getByText('Sin placa: 1 pieza',{exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/pincel-avanzado-vista-680-SINTETICA.png'});
 await missing.click();await expect.poll(()=>requests('smart_tool_view').length).toBe(2);
 expect(requests('smart_tool_view')[1].data).toEqual({highlightMissing:false});
 await expect(missing).toHaveAttribute('aria-pressed','false');await expect(page.getByText(/^Sin placa:/)).toHaveCount(0);
 expect(requests('smart_tool_stop')).toHaveLength(0);expect(starts()).toHaveLength(0);
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
});

test('avanzado: «Resaltar lo que falta» solo se habilita con la herramienta activa',async({page},info)=>{
 await boot(page,info.outputDir);
 await expect(viewGroup(page).getByRole('button',{name:'Resaltar lo que falta',exact:true})).toBeDisabled();
 await page.getByRole('region',{name:'Materiales disponibles para pintar'}).getByRole('button',{name:'Placa QA',exact:true}).click();await expect.poll(()=>starts().length).toBe(1);
 await expect(viewGroup(page).getByRole('button',{name:'Resaltar lo que falta',exact:true})).toBeEnabled();
});

test('avanzado: «Transparencia» envía smart_toggle_transparency y refleja el valor de Ruby',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 const xray=viewGroup(page).getByRole('button',{name:'Transparencia',exact:true});
 await expect(xray).toHaveAttribute('aria-pressed','false');
 await xray.click();await expect.poll(()=>requests('smart_toggle_transparency').length).toBe(1);await expect(xray).toHaveAttribute('aria-pressed','true');
 await xray.click();await expect.poll(()=>requests('smart_toggle_transparency').length).toBe(2);await expect(xray).toHaveAttribute('aria-pressed','false');
 // Cambiada desde el menú contextual de la vista: llega en el evento.
 await push(page,{...tool,transparency:true});await expect(xray).toHaveAttribute('aria-pressed','true');
 expect(requests('smart_tool_stop')).toHaveLength(0);expect(starts()).toHaveLength(0);
});

test('avanzado: selector de tecla del cuentagotas toma settings.eyedropperKey y envía smart_eyedropper_key',async({page},info)=>{
 await boot(page,info.outputDir,{initial:{eyedropperKey:'shift'},active:sheetOptions});
 const alt=keyGroup(page).getByRole('button',{name:'Alt',exact:true}),shift=keyGroup(page).getByRole('button',{name:'Mayús',exact:true});
 await expect(shift).toHaveAttribute('aria-pressed','true');await expect(alt).toHaveAttribute('aria-pressed','false');
 await alt.click();await expect.poll(()=>requests('smart_eyedropper_key').length).toBe(1);
 expect(requests('smart_eyedropper_key')[0].data).toEqual({key:'alt'});
 await expect(alt).toHaveAttribute('aria-pressed','true');await expect(shift).toHaveAttribute('aria-pressed','false');
 // Ya elegida: no reenvía.
 await alt.click();await page.waitForTimeout(200);expect(requests('smart_eyedropper_key')).toHaveLength(1);
 expect(requests('smart_tool_stop')).toHaveLength(0);expect(starts()).toHaveLength(0);
});

test('avanzado: sin preferencia el cuentagotas usa Alt',async({page},info)=>{
 await boot(page,info.outputDir);
 await expect(keyGroup(page).getByRole('button',{name:'Alt',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(keyGroup(page).getByRole('button',{name:'Mayús',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('avanzado: aviso de muestreo y pie con la profundidad bajo el cursor',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 const notice=page.getByText('Cuentagotas activo: hacé clic en una cara para tomar su material.',{exact:true});
 await expect(notice).toHaveCount(0);
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,sampling:true});await expect(notice).toBeVisible();
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,sampling:false});await expect(notice).toHaveCount(0);
 const footer=page.locator('.immediate-footer');
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,hover:{...hover,depth:{index:1,count:3}}});
 await expect(footer).toContainText('Pieza 2 de 3 bajo el cursor (↑/↓)');await expect(footer).toContainText('Puerta 3');
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,hover});
 await expect(footer).not.toContainText('bajo el cursor');
 expect(starts()).toHaveLength(0);
});

test('avanzado: un material elegido desde la vista queda activo y vuelve a «Solo esta» sin reenviar smart_quick_start',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,hover});
 await scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true}).click();await expect.poll(()=>starts().length).toBe(1);
 await expect(scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true})).toHaveAttribute('aria-pressed','true');
 // Clic en un reciente (o cuentagotas) de la vista: Ruby informa otro catalogId.
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,catalogId:'photo',materialUuid:'photo-uuid',scope:'unique'},hover});
 const library=page.getByRole('region',{name:'Materiales disponibles para pintar'});
 await expect(library.getByRole('button',{name:'Roble foto QA',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(library.getByRole('button',{name:'Placa QA',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Roble foto QA');
 await expect(scopeGroup(page).getByRole('button',{name:'Solo esta',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('Pinta todas las copias de la definición con un solo Undo.',{exact:true})).toHaveCount(0);
 // Aunque un evento traiga scope 'all' con otro material, la autorización no se hereda.
 await scopeGroup(page).getByRole('button',{name:'Todas las iguales (4)',exact:true}).click();await expect.poll(()=>starts().length).toBe(2);
 expect(starts()[1].data).toMatchObject({catalogId:'photo',scope:'all',allowShared:true});
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:{...sheetOptions,scope:'all',allowShared:true},hover});
 await expect(library.getByRole('button',{name:'Placa QA',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(scopeGroup(page).getByRole('button',{name:'Solo esta',exact:true})).toHaveAttribute('aria-pressed','true');
 // Cuentagotas de la vista hacia un canto: cambia el modo de la paleta.
 await push(page,{active:true,mode:'edge',queuedCount:0,options:{...sheetOptions,mode:'edge',catalogId:'edge',materialUuid:'edge-uuid',immediatePiece:false,scope:'unique'}});
 await expect(page.getByRole('button',{name:'Pintar canto',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(library.getByRole('button',{name:'Canto QA',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.waitForTimeout(1200);expect(starts()).toHaveLength(2);expect(requests('smart_tool_stop')).toHaveLength(0);
});

test('avanzado: la ayuda documenta recientes 1–6, Alt sostenido, ↑/↓ y clic derecho',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 await page.getByRole('button',{name:'Ayuda: Atajos del pincel',exact:true}).click();
 const help=page.getByRole('dialog');
 await expect(help).toContainText('1–6');await expect(help).toContainText('Alt');await expect(help).toContainText('↑/↓');await expect(help).toContainText('clic derecho');
});

test('avanzado: paleta 680 y 360 sin scroll horizontal con la fila de vista',async({page},info)=>{
 await boot(page,info.outputDir,{active:sheetOptions});
 await push(page,{active:true,mode:'sheet',queuedCount:0,options:sheetOptions,hover:{...hover,depth:{index:0,count:2}},sampling:true,missing:{enabled:true,withoutSheet:12,evaluated:40,truncated:false}});
 for(const width of [680,360]){
  await page.setViewportSize({width,height:360});
  const geometry=await page.evaluate(()=>{
   const boxes=[...document.querySelectorAll('.immediate-view button, .immediate-view .immediate-missing')].map(element=>element.getBoundingClientRect());
   const overlaps=boxes.some((a,i)=>boxes.some((b,j)=>j>i&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));
   return {scroll:document.documentElement.scrollWidth,overlaps,outside:boxes.some(box=>box.right>window.innerWidth+0.5||box.left<-0.5)};
  });
  expect(geometry.scroll).toBeLessThanOrEqual(width);expect(geometry.overlaps).toBe(false);expect(geometry.outside).toBe(false);
  await page.screenshot({path:`artifacts/pincel-avanzado-${width}-SINTETICA.png`,fullPage:true});
 }
});
