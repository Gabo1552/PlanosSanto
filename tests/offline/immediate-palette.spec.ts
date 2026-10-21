import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import release from '../../sketchup_offline/version.json';
// Immediate palette contract. Native material creation/picking/Undo belong to
// the Ruby/SketchUp suites: this transport double never claims native results.
type Call={action:string;data:Record<string,unknown>};
type Tool={active:boolean;mode?:string;queuedCount:number;options?:Record<string,unknown>;error?:string};
let calls:Call[],tool:Tool,created:number;
const item=(id:string,kind='sheet')=>({id,name:id==='photo'?'Roble foto QA':id==='edge'?'Canto QA':id==='skm'?'SKM diseño QA':id==='unready'?'SKM sin verificar QA':'Placa QA',kind,approved:!['photo','skm','unready'].includes(id),sku:'',supplier:'',favorite:false,thicknessMm:18,widthMm:1200,lengthMm:2400,grain:false,compatibleIds:[],price:null,sourceHash:'0'.repeat(64),updatedAt:'2026-10-20',observed:id==='photo'?{photo:{schema:1,designReady:true}}:{}});
async function boot(page:Page,folder:string,props:Record<string,unknown>={},active=false){
 calls=[];created=0;tool={active,mode:'sheet',queuedCount:0,...(active?{options:{mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',immediate:true,immediatePiece:true,paintScope:'piece',side:'both'}}:{})};
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-immediate-entry-'));
 const entry=join(temp,'palette-entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{quickMode:true,initialCompact:true,...window.paletteProps,onClose:()=>{},onManage:()=>{},onApplied:()=>{},onCreateMaterial:()=>window.paletteCreate()}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('paletteCreate',()=>{created+=1;});
 await page.exposeFunction('immediateRequest',(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message;calls.push({action,data});let result:unknown;
  if(action==='diagnostic')result={extensionVersion:release.version};
  else if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items:[item('photo'),item('sheet'),item('edge','edge'),item('skm'),item('unready')]},visuals:{materials:['photo','sheet','edge','skm'].map(id=>({id,designReady:id==='skm',name:id+' real QA',hasTexture:id==='photo'||id==='skm',color:[113,81,55],binding:{uuid:id+'-uuid',catalogId:id,kind:id==='edge'?'edge':'sheet'},issues:[]}))},thumbnails:{photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='},settings:{scope:'all',axes:[0,1],batch:true,paintScope:'face',side:'front'},toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='smart_quick_start'&&props.rejectPhoto&&data.catalogId==='photo')return {version:1,id:message.id,result:null,error:'El UUID cambió; no se aplicó el material.'};
  else if(action==='smart_quick_start'){tool={active:true,mode:data.mode as string,options:{...data,scope:'unique'},queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_stop'){tool={...tool,active:false,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(props=>{const w=window as unknown as {paletteProps:unknown;immediateRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.paletteProps=props;w.sketchup={request:raw=>{void w.immediateRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};},props);
 await page.route('https://immediate.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name))});});
 await page.context().setOffline(true);await page.setViewportSize({width:680,height:320});await page.goto('https://immediate.test/index.html');await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeEnabled();
}
const requests=(action:string)=>calls.filter(call=>call.action===action);
const choose=(page:Page,name:string)=>page.getByRole('region',{name:'Materiales disponibles para pintar'}).getByRole('button',{name,exact:true}).click();

test('inmediato: foto lista para diseño arma pieza completa sin formularios ni permiso comercial',async({page},info)=>{
 await boot(page,info.outputDir);await choose(page,'Roble foto QA');await expect.poll(()=>requests('smart_quick_start').length).toBe(1);
 expect(requests('smart_quick_start')[0].data).toMatchObject({mode:'sheet',catalogId:'photo',materialUuid:'photo-uuid',immediate:true,immediatePiece:true,paintScope:'piece',side:'both',batch:false});
 await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Roble foto QA');
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Alcance pintado directo',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Lado pintado directo',{exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toHaveCount(0);expect(requests('smart_tool_start')).toHaveLength(0);expect(requests('smart_tool_stop')).toHaveLength(0);
 await page.screenshot({path:'artifacts/immediate-087-paleta-foto-SINTETICA.png'});
});

test('inmediato: cambia material sin detener Tool ni pedir reactivación, conserva recientes',async({page},info)=>{
 await boot(page,info.outputDir,{},true);await choose(page,'Roble foto QA');await expect.poll(()=>requests('smart_quick_start').length).toBe(1);await choose(page,'Placa QA');await expect.poll(()=>requests('smart_quick_start').length).toBe(2);
 expect(requests('smart_tool_stop')).toHaveLength(0);expect(requests('smart_tool_start')).toHaveLength(0);await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Materiales usados recientemente'})).toContainText('Roble foto QA');
 for(const request of requests('smart_quick_start'))expect(request.data).toMatchObject({immediate:true,immediatePiece:true,batch:false,paintScope:'piece',side:'both'});
 await page.screenshot({path:'artifacts/immediate-087-paleta-recientes-SINTETICA.png'});
});

test('inmediato: modos pieza/canto directos y alta de foto detiene una sola vez',async({page},info)=>{
 await boot(page,info.outputDir,{},true);await page.getByRole('button',{name:'Pintar canto',exact:true}).click();await choose(page,'Canto QA');await expect.poll(()=>requests('smart_quick_start').length).toBe(1);expect(requests('smart_quick_start')[0].data).toMatchObject({mode:'edge',catalogId:'edge',immediate:true,immediatePiece:false});expect(requests('smart_tool_stop')).toHaveLength(1);
 await page.getByRole('button',{name:'+ Material',exact:true}).click();await expect.poll(()=>created).toBe(1);expect(requests('smart_tool_stop')).toHaveLength(2);
});

test('inmediato: Guardar y pintar foto usa el UUID real y no abre confirmaciones',async({page},info)=>{
 await boot(page,info.outputDir,{initialCatalogId:'photo',autoStart:true});await expect.poll(()=>requests('smart_quick_start').length).toBe(1);expect(requests('smart_quick_start')[0].data).toMatchObject({mode:'sheet',materialUuid:'photo-uuid',immediatePiece:true,paintScope:'piece',side:'both'});expect(requests('smart_tool_start')).toHaveLength(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('inmediato: paleta horizontal y adaptable sin controles de caras ocultos en formularios',async({page},info)=>{
 await boot(page,info.outputDir,{},true);
 for(const width of [680,360]){await page.setViewportSize({width,height:320});const geometry=await page.locator('main').evaluate(element=>({width:element.getBoundingClientRect().width,viewport:window.innerWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.width).toBeLessThanOrEqual(width);expect(geometry.scroll).toBeLessThanOrEqual(width);await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Pintar canto',exact:true})).toBeVisible();await page.screenshot({path:`artifacts/immediate-087-paleta-${width}-SINTETICA.png`});}
});


test('inmediato: SKM nativo listo para diseño permite pintar sin aprobar maderera y no ofrece SKM sin verificar',async({page},info)=>{
 await boot(page,info.outputDir);await expect(page.getByRole('button',{name:'SKM sin verificar QA',exact:true})).toHaveCount(0);await choose(page,'SKM diseño QA');await expect.poll(()=>requests('smart_quick_start').length).toBe(1);expect(requests('smart_quick_start')[0].data).toMatchObject({catalogId:'skm',materialUuid:'skm-uuid',immediatePiece:true});expect(calls.some(call=>call.action==='catalog_save'||call.action==='skm_install')).toBe(false);await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
});


test('inmediato: rechazo nativo conserva material activo real y muestra una sola advertencia',async({page},info)=>{
 await boot(page,info.outputDir,{rejectPhoto:true},true);await choose(page,'Roble foto QA');await expect(page.getByRole('alert')).toContainText('El UUID cambió');await expect(page.getByRole('alert')).toHaveCount(1);await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Placa QA');await expect(page.getByRole('region',{name:'Material activo en la paleta'})).not.toContainText('Roble foto QA');await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();expect(tool.options?.catalogId).toBe('sheet');expect(requests('smart_tool_stop')).toHaveLength(0);
});
