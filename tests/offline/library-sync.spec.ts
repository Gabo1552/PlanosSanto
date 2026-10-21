import {test,expect,type Page,type Browser} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
// UI/controller invalidation contract with transport doubles; not SketchUp.
type Call={action:string;data:Record<string,unknown>};
type Item={id:string;name:string;kind:string;approved:boolean;observed:Record<string,unknown>};
type Tool={active:boolean;mode:string;queuedCount:number;options:Record<string,unknown>};
let folder:string,items:Item[],tool:Tool,controls:Control[];
type Control={page:Page;calls:Call[];gateStart?:()=>Promise<void>;gateLoad?:(number:number)=>Promise<void>};
const item=(id:string,name:string):Item=>({id,name,kind:'sheet',approved:false,observed:{}});
const states=()=>Object.fromEntries(items.map(row=>[row.id,row.id==='draft'?{state:'needs_visual',message:'QA sin visual',action:'assign_visual'}:{state:'ready',message:'QA listo',materialUuid:row.id+'-uuid'}]));
function snapshot(){return {catalog:{schema:1,revision:items.length,items:items.map(row=>({...row,sku:'',supplier:'',favorite:false,thicknessMm:18}))},paintStates:states(),visuals:{materials:items.filter(row=>row.id!=='draft').map(row=>({id:row.id,name:row.name,hasTexture:false,color:[80,100,90],binding:{uuid:row.id+'-uuid',catalogId:row.id,kind:'sheet'},issues:[]}))},thumbnails:{},settings:{catalogId:'one',scope:'all',paintScope:'face',side:'front'},toolState:tool};}
async function open(browser:Browser){
 const page=await browser.newPage({viewport:{width:680,height:520}}),control:Control={page,calls:[]};controls.push(control);
 await page.exposeFunction('syncRequest',async(raw:string)=>{
  const {id,action,data}=JSON.parse(raw);control.calls.push({action,data});let result:unknown;
  if(action==='smart_palette_compact')result=true;
  else if(action==='smart_palette_load'){const response=snapshot();try{await control.gateLoad?.(control.calls.filter(call=>call.action===action).length);}catch(value){return {version:1,id,result:null,error:value instanceof Error?value.message:String(value)};}result=response;}
  else if(action==='smart_quick_start'){await control.gateStart?.();tool={active:true,mode:'sheet',queuedCount:0,options:{...data,mode:'sheet'}};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  else throw Error('Unexpected mutation '+action);
  return {version:1,id,result,error:null};
 });
 await page.addInitScript(()=>{const w=window as unknown as {syncRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.sketchup={request:raw=>{void w.syncRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};});
 await page.route('https://sync.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{body:'<!doctype html><html><head><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>',contentType:'text/html'}:{body:await readFile(resolve(folder,name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://sync.test/index.html');await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('QA uno');return control;
}
async function changed(page:Page,revision:number){await page.evaluate(revision=>window.dispatchEvent(new CustomEvent('planos-santo-material-library-changed',{detail:{revision,action:'catalog_save'}})),revision);}
const loadCount=(control:Control)=>control.calls.filter(call=>call.action==='smart_palette_load').length;
test.beforeEach(async({},info)=>{
 controls=[];items=[item('one','QA uno'),item('two','QA dos'),item('draft','QA ficha pendiente')];tool={active:true,mode:'sheet',queuedCount:0,options:{mode:'sheet',catalogId:'one',materialUuid:'one-uuid',scope:'unique',side:'both',paintScope:'piece'}};
 folder=info.outputDir;await mkdir(folder,{recursive:true});const temp=await mkdtemp(join(tmpdir(),'ps-library-sync-'));
 try{const entry=join(temp,'entry.jsx');await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{quickMode:true,initialCompact:true,onClose:()=>{},onManage:()=>{},onApplied:()=>{}}));`);await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});}finally{await rm(temp,{recursive:true,force:true});}
});
test.afterEach(async()=>{for(const control of controls)await control.page.close();});

test('dos paletas releen catálogo y estados sin cerrar, conservar selección, búsqueda, color ni Tool',async({browser})=>{
 const first=await open(browser),second=await open(browser);
 await first.page.getByLabel('Buscar material de pintado directo').fill('QA');await first.page.getByLabel('Color para QA ficha pendiente').fill('#123456');
 items=[...items,item('new','QA material nuevo')];await changed(first.page,1);await changed(second.page,1);
 for(const control of controls){await expect(control.page.getByRole('button',{name:'QA material nuevo',exact:true})).toBeVisible();await expect(control.page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('QA uno');await expect(control.page.getByText('● Pintando',{exact:true})).toBeVisible();expect(control.calls.some(call=>['smart_tool_start','smart_tool_stop','smart_quick_start','scan'].includes(call.action))).toBe(false);expect(loadCount(control)).toBe(2);}
 await expect(first.page.getByLabel('Buscar material de pintado directo')).toHaveValue('QA');await expect(first.page.getByLabel('Color para QA ficha pendiente')).toHaveValue('#123456');
});

test('actualización externa espera una selección en curso y no cambia su nuevo UUID por preferencias viejas',async({browser})=>{
 const control=await open(browser);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});control.gateStart=()=>gate;
 await control.page.getByRole('button',{name:'QA dos',exact:true}).click();await expect.poll(()=>control.calls.some(call=>call.action==='smart_quick_start')).toBe(true);
 items=[...items,item('new','QA material nuevo')];await changed(control.page,1);await control.page.waitForTimeout(100);expect(loadCount(control)).toBe(1);
 release();await expect(control.page.getByRole('button',{name:'QA material nuevo',exact:true})).toBeVisible();await expect(control.page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('QA dos');expect(tool.options.materialUuid).toBe('two-uuid');expect(control.calls.some(call=>call.action==='smart_tool_stop')).toBe(false);
});

test('una respuesta vieja de catálogo no reemplaza la revisión posterior',async({browser})=>{
 const control=await open(browser);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});control.gateLoad=number=>number===2?gate:Promise.resolve();
 items=[...items,item('old','QA revisión anterior')];await changed(control.page,1);await expect.poll(()=>loadCount(control)).toBe(2);
 items=[...items.filter(row=>row.id!=='old'),item('new','QA revisión nueva')];await changed(control.page,2);await expect(control.page.getByRole('button',{name:'QA revisión nueva',exact:true})).toBeVisible();
 release();await control.page.waitForTimeout(100);await expect(control.page.getByRole('button',{name:'QA revisión anterior',exact:true})).toHaveCount(0);await expect(control.page.getByRole('button',{name:'QA revisión nueva',exact:true})).toBeVisible();expect(control.calls.some(call=>call.action==='scan')).toBe(false);
});

test('cambiar el modelo invalida una relectura pendiente sin cargar datos del modelo anterior',async({browser})=>{
 const control=await open(browser);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});control.gateLoad=number=>number===2?gate:Promise.resolve();
 items=[...items,item('old','QA material del modelo anterior')];await changed(control.page,1);await expect.poll(()=>loadCount(control)).toBe(2);
 await control.page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:{active:false,contextChanged:true,error:'Cambió el modelo activo.'}})));
 release();await control.page.waitForTimeout(100);await expect(control.page.getByRole('button',{name:'QA material del modelo anterior',exact:true})).toHaveCount(0);await expect(control.page.getByRole('alert')).toContainText('Cambió el modelo activo');
 items=[item('fresh','QA material del modelo recuperado')];tool={active:false,mode:'sheet',queuedCount:0,options:{}};
 await control.page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:{active:false,contextChanged:false,contextRestored:true}})));
 await expect(control.page.getByRole('button',{name:'QA material del modelo recuperado',exact:true})).toBeVisible();await expect(control.page.getByRole('button',{name:'QA material del modelo anterior',exact:true})).toHaveCount(0);expect(control.calls.some(call=>call.action==='smart_quick_start')).toBe(false);
});

test('la biblioteca se actualiza al liberarse el otro diálogo sin un nuevo evento ni interacción',async({browser})=>{
 const control=await open(browser);let nativeBusy=true;
 control.gateLoad=number=>number>1&&nativeBusy?Promise.reject(new Error('Esperá a que termine la operación actual.')):Promise.resolve();
 items=[...items,item('new','QA añadido desde otro diálogo')];await changed(control.page,1);
 await expect.poll(()=>loadCount(control)).toBeGreaterThanOrEqual(3);await expect(control.page.getByRole('alert')).toHaveCount(0);
 nativeBusy=false;await expect(control.page.getByRole('button',{name:'QA añadido desde otro diálogo',exact:true})).toBeVisible();
 const completed=loadCount(control);await control.page.waitForTimeout(250);expect(loadCount(control)).toBe(completed);
 await expect(control.page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('QA uno');await expect(control.page.getByText('● Pintando',{exact:true})).toBeVisible();expect(control.calls.some(call=>['scan','smart_tool_stop','smart_quick_start'].includes(call.action))).toBe(false);
});

test('un error distinto de ocupado se informa una vez y no se reintenta hasta otra invalidación',async({browser})=>{
 const control=await open(browser);
 control.gateLoad=number=>number>1?Promise.reject(new Error('Índice visual dañado; restaurá su copia.')):Promise.resolve();
 items=[...items,item('new','QA revisión reparada')];await changed(control.page,1);
 await expect(control.page.getByRole('alert')).toContainText('Índice visual dañado');await control.page.waitForTimeout(350);expect(loadCount(control)).toBe(2);
 control.gateLoad=()=>Promise.resolve();await changed(control.page,2);await expect(control.page.getByRole('button',{name:'QA revisión reparada',exact:true})).toBeVisible();expect(loadCount(control)).toBe(3);await expect(control.page.getByRole('alert')).toHaveCount(0);
});

test('cambiar de modelo cancela el reintento que esperaba al otro diálogo',async({browser})=>{
 const control=await open(browser);control.gateLoad=number=>number>1?Promise.reject(new Error('Esperá a que termine la operación actual.')):Promise.resolve();
 await changed(control.page,1);await expect.poll(()=>loadCount(control)).toBe(2);
 await control.page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:{active:false,contextChanged:true,error:'Cambió el modelo activo.'}})));
 const cancelled=loadCount(control);await control.page.waitForTimeout(250);expect(loadCount(control)).toBe(cancelled);await expect(control.page.getByRole('alert')).toContainText('Cambió el modelo activo');
});
