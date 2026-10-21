import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import release from '../../sketchup_offline/version.json';
// Component browser contracts with a native transport double. This never runs
// SketchUp, creates a native material or validates a commercial supplier item.
type Call={action:string;data:Record<string,unknown>};
type Options=Record<string,unknown>;
type Tool={active:boolean;mode?:string;queuedCount:number;options?:Options;message?:string};
let calls:Call[],tool:Tool,created:number;
const item=(id:string,kind='sheet',approved=true)=>({id,name:id==='photo'?'Foto de diseño QA':id==='edge'?'Canto QA':id==='unknown'?'SKM pendiente QA':'Placa QA',kind,approved,sku:approved?'QA18':'',supplier:approved?'Ensayo':'',favorite:false,thicknessMm:18,widthMm:1200,lengthMm:2400,grain:false,compatibleIds:[],price:null,sourceHash:'0'.repeat(64),updatedAt:'2026-10-21',observed:id==='photo'?{photo:{schema:1,designReady:true}}:{}});
async function boot(page:Page,folder:string,props:Record<string,unknown>={},badBinding=false,initialTool?:Tool,standalone=false){
 calls=[];created=0;tool=initialTool||{active:false,queuedCount:0};
 await mkdir(folder,{recursive:true});
 const entryFolder=await mkdtemp(join(tmpdir(),'planos-palette-entry-'));const entry=join(entryFolder,'palette-entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Palette from ${JSON.stringify(resolve(standalone?'sketchup_offline/ui/StandalonePaintApp.tsx':'sketchup_offline/ui/SmartPaintPalette.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Palette,{...window.paletteProps,onClose:()=>{},onManage:()=>{},onApplied:()=>{},onCreateMaterial:()=>window.paletteCreate()}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outfile:resolve(folder,'app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(entryFolder,{recursive:true,force:true}));
 await page.exposeFunction('paletteCreate',()=>{created+=1;});
 await page.exposeFunction('paletteSetTool',(state:Tool)=>{tool=state;});
 await page.exposeFunction('paletteRequest',(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message;calls.push({action,data});let result:unknown;
  if(action==='diagnostic')result={extensionVersion:props.__backendVersion||release.version};
  else if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items:[item('photo','sheet',false),item('sheet'),item('edge','edge'),item('unknown','unknown',false)]},visuals:{materials:['photo','sheet','edge'].map(id=>({id,name:id+' native QA',hasTexture:id==='photo',color:[90,120,100],binding:{uuid:id+'-uuid',catalogId:id,kind:id==='edge'?'edge':'sheet'},issues:badBinding&&id==='photo'?['Visual inválido de ensayo']:[]}))},settings:{scope:props.__settingsScope||'all',axes:[0,1]},toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='palette_ready')result={toolState:tool};
  else if(action==='palette_close'||action==='palette_manage')result={closed:true};
  else if(action==='smart_quick_start'){tool={active:true,mode:data.mode as string,options:{...data,scope:'unique',allowShared:false},queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_start'){tool={active:true,mode:data.options.mode,options:data.options,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_stop'){tool={...tool,active:false,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(props=>{const w=window as unknown as {paletteProps:unknown;paletteRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.paletteProps=props;w.sketchup={request:raw=>{void w.paletteRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};},props);
 await page.route('https://palette.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(name==='index.html')await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script></html>'});else if(name==='app.js'||name==='app.css')await route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name))});else throw Error('Unexpected resource '+name);});
 await page.context().setOffline(true);await page.goto('https://palette.test/index.html');
 if(!props.__expectRuntimeMismatch)await expect(page.getByRole('button',{name:standalone||props.quickMode?'Pintar pieza':'Placas',exact:true})).toBeEnabled();
}
const starts=()=>calls.filter(call=>call.action==='smart_tool_start');

test('foto lista para diseño aparece sin aprobar compra y pintar requiere gesto explícito',async({page},info)=>{
 await boot(page,info.outputDir);
 await expect(page.getByRole('button',{name:/SKM pendiente QA/})).toHaveCount(0);
 await page.getByRole('button',{name:/Foto de diseño QA/}).click();
 await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Listo para diseño · pendiente para maderera');
 expect(starts()).toHaveLength(0);await expect(page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toBeDisabled();
 await page.getByText('Ajustes de alcance y caras',{exact:true}).click();await page.getByLabel('Alcance pintado directo',{exact:true}).selectOption('unique');
 await page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true}).click();
 expect(starts()[0].data.options).toMatchObject({catalogId:'photo',materialUuid:'photo-uuid',scope:'unique',allowShared:false,paintScope:'face'});
});

test('Guardar y pintar activa una sola vez solo ocurrencia única y +Material detiene antes de crear',async({page},info)=>{
 await boot(page,info.outputDir,{initialCatalogId:'photo',initialCompact:true,autoStart:true});
 await expect.poll(()=>starts().length).toBe(1);
 expect(starts()[0].data.options).toMatchObject({catalogId:'photo',scope:'unique',allowShared:false,confirmed:true,side:'front',batch:false,paintScope:'face',edgeCount:1});
 await expect(page.getByRole('main')).toHaveClass(/compact/);
 await page.getByRole('button',{name:'+ Material',exact:true}).click();await expect.poll(()=>created).toBe(1);
 expect(calls.at(-1)?.action).toBe('smart_tool_stop');expect(starts()).toHaveLength(1);
});

test('Guardar y pintar no inicia con visual inválido aunque la ficha diga lista para diseño',async({page},info)=>{
 await boot(page,info.outputDir,{initialCatalogId:'photo',autoStart:true},true);
 await expect(page.getByRole('status')).toContainText('Material guardado. Revisá su asociación');expect(starts()).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toBeDisabled();
});

test('submodos Cara/Pieza y uno/dos/cuatro cantos llegan al motor sin activar al cambiar',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:/Placa QA/}).click();
 await page.getByRole('button',{name:'Pieza · 2 caras',exact:true}).click();expect(starts()).toHaveLength(0);
 await page.getByText('Ajustes de alcance y caras',{exact:true}).click();await page.getByLabel('Alcance pintado directo',{exact:true}).selectOption('unique');
 await page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true}).click();expect(starts()[0].data.options).toMatchObject({paintScope:'piece',scope:'unique'});
 await page.getByRole('button',{name:'Cantos',exact:true}).click();await page.getByRole('button',{name:/Canto QA/}).click();
 for(const [label,count] of [['2 cantos opuestos',2],['4 cantos',4],['1 canto',1]] as const){
  const before=starts().length;await page.getByRole('button',{name:label,exact:true}).click();expect(starts()).toHaveLength(before);
  await page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true}).click();expect(starts().at(-1)?.data.options).toMatchObject({mode:'edge',edgeCount:count,scope:'unique'});
 }
});


test('estado de atajo nativo sincroniza modo y cantos y revoca autorización compartida',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:/Placa QA/}).click();
 await page.getByText('Ajustes de alcance y caras',{exact:true}).click();await page.getByLabel('Autorizar todas las ocurrencias compartidas',{exact:true}).check();
 await page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true}).click();expect(starts()).toHaveLength(1);
 await page.evaluate(async()=>{const state={active:true,mode:'edge',queuedCount:0,requiresSharedReview:true,options:{mode:'edge',paintScope:'face',edgeCount:4,catalogId:'edge',materialUuid:'edge-uuid'},message:'Atajo nativo: revisá alcance'};const w=window as unknown as {paletteSetTool:(state:unknown)=>Promise<void>};await w.paletteSetTool(state);window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:state}));});
 await expect(page.getByRole('button',{name:'Cantos',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'4 cantos',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Canto QA');
 await expect(page.getByLabel('Autorizar todas las ocurrencias compartidas',{exact:true})).not.toBeChecked();expect(starts()).toHaveLength(1);
});


test('paleta rápida adopta herramienta nativa sin duplicar inicio y cambia material con un gesto',async({page},info)=>{
 const active={active:true,mode:'sheet',queuedCount:2,options:{mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',axes:[0,1],paintScope:'face',edgeCount:1,side:'front',batch:true}};
 await boot(page,info.outputDir,{quickMode:true,initialCompact:true},false,active);
 await expect(page.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Placa QA');
 expect(starts()).toHaveLength(0);
 await page.getByRole('button',{name:/Foto de diseño QA/}).click();
 await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
 const change=calls.find(call=>call.action==='smart_quick_start');expect(change?.data).toMatchObject({catalogId:'photo',materialUuid:'photo-uuid',mode:'sheet'});
 expect(calls.filter(call=>call.action==='smart_tool_stop')).toHaveLength(0);
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();expect(change?.data).toMatchObject({paintScope:'piece',side:'both',immediate:true,immediatePiece:true,batch:false});
 await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('paleta inmediata descarta alcance compartido heredado y solicita aislamiento seguro sin formulario',async({page},info)=>{
 const active={active:true,mode:'sheet',queuedCount:1,options:{mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'all',axes:[0,1],paintScope:'face',edgeCount:1}};
 await boot(page,info.outputDir,{quickMode:true},false,active);
 await page.getByRole('button',{name:/Foto de diseño QA/}).click();await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
 expect(calls.find(call=>call.action==='smart_quick_start')?.data).toMatchObject({mode:'sheet',immediate:true,immediatePiece:true,paintScope:'piece',side:'both',batch:false});expect(starts()).toHaveLength(0);expect(calls.filter(call=>call.action==='smart_tool_stop')).toHaveLength(0);
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();await expect(page.getByLabel('Autorizar todas las ocurrencias compartidas',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toHaveCount(0);
});

test('entrada independiente abre solo paleta y adopta inicio nativo antes de abrir foto',async({page},info)=>{
 const active={active:true,mode:'sheet',queuedCount:0,options:{mode:'sheet',catalogId:'sheet',materialUuid:'sheet-uuid',scope:'unique',axes:[0,1],paintScope:'face',edgeCount:1}};
 await boot(page,info.outputDir,{},false,active,true);
 await expect(page.getByRole('main')).toHaveClass(/quick-mode/);expect(starts()).toHaveLength(0);
 expect(calls.some(call=>call.action==='palette_ready')).toBe(true);
 expect(calls.some(call=>call.action==='scan'||call.action==='ui_ready')).toBe(false);
 await page.getByRole('button',{name:'+ Material',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Material desde una foto'})).toBeVisible();
 expect(calls.some(call=>call.action==='smart_tool_stop')).toBe(true);
});


test('entrada rápida fría valida runtime y tarjeta válida arma sin Activar',async({page},info)=>{
 await boot(page,info.outputDir,{__settingsScope:'unique'},false,undefined,true);
 expect(calls[0].action).toBe('diagnostic');expect(calls[1].action).toBe('palette_ready');
 await page.getByRole('button',{name:/Foto de diseño QA/}).click();
 await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);
 expect(calls.find(call=>call.action==='smart_quick_start')?.data).toMatchObject({catalogId:'photo',materialUuid:'photo-uuid'});
 expect(starts()).toHaveLength(0);
 await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();
});

test('entrada rápida bloquea backend antiguo antes de preparar paleta o iniciar herramienta',async({page},info)=>{
 await boot(page,info.outputDir,{__backendVersion:'0.0.0-old',__expectRuntimeMismatch:true},false,undefined,true);
 await expect(page.getByRole('alert')).toContainText('Cerrá todas las ventanas de SketchUp y volvé a abrirlo');
 expect(calls.map(call=>call.action)).toEqual(['diagnostic']);
 await expect(page.getByRole('button',{name:'Placas',exact:true})).toHaveCount(0);
});
