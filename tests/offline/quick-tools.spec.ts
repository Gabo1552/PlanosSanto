import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {QuickIntent} from '../../sketchup_offline/ui/quickActions';

// Browser quick-command contract with a tool double and actual Ruby synthetic
// scan/guide controller. Not native SketchUp, no customer's model or material.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type State={options?:Record<string,unknown>;active:boolean;mode?:string;changed?:boolean;queuedCount?:number;message?:string;sampleSequence?:number;sample?:Record<string,unknown>|null;contextChanged?:boolean;contextRestored?:boolean;error?:string};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[],tool:State;
const items=[['sheet-a','Melamina de prueba','sheet'],['edge-a','Canto de prueba','edge']].map(([id,name,kind])=>({id,name,kind,favorite:true,sku:'QA',supplier:'Taller sintético',approved:true,thicknessMm:kind==='sheet'?18:1,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:[],price:null,updatedAt:'2026-10-20',sourceHash:'',observed:{}}));
const materials=[{id:'1',name:'Placa nativa primera',color:[180,150,90],hasTexture:false,binding:{uuid:'uuid-sheet-a',catalogId:'sheet-a',kind:'sheet'},issues:[]},{id:'2',name:'Placa nativa muestreada',color:[150,110,60],hasTexture:true,binding:{uuid:'uuid-sheet-second',catalogId:'sheet-a',kind:'sheet'},issues:[]},{id:'3',name:'Canto nativo',color:[130,90,50],hasTexture:false,binding:{uuid:'uuid-edge-a',catalogId:'edge-a',kind:'edge'},issues:[]}];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string,intent?:QuickIntent,settings:Record<string,unknown>={}){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];tool={active:false,changed:false,queuedCount:0,message:'Sin cambios'};
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('quickContractRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});let result:unknown;
  if(action==='ui_ready')result={intent};
  else if(action==='ui_loading'||action==='quick_action_ack')result=true;
  else if(action==='smart_palette_load')result={catalog:{schema:1,revision:1,items},visuals:{materials},settings,toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='smart_tool_status')result={toolState:tool};
  else if(action==='smart_tool_stop'){tool={active:false,changed:false,queuedCount:0,message:'Herramienta detenida'};result={toolState:tool};}
  else if(action==='smart_tool_start'){tool={active:true,mode:data.options.mode,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_quick_start'){tool={active:true,mode:data.mode,options:data,queuedCount:0};result={toolState:tool};}
  else if(action==='smart_sample_start'){tool={active:true,mode:'sample',queuedCount:0,sampleSequence:0,sample:null,message:'Cuentagotas de lectura'};result={toolState:tool};}
  else return native(raw);
  return {version:1,id:msg.id,result,error:null};
 });
 await page.exposeFunction('quickToolState',(state:State)=>{tool={...state};});
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.quickContractRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
async function state(page:Page,value:State){tool={...value};await page.evaluate(value=>window.dispatchEvent(new CustomEvent('planos-santo-smart-paint',{detail:value})),value);}
async function quick(page:Page,intent:QuickIntent){tool={active:false,changed:false,queuedCount:0,message:intent.message||'Cola cancelada'};await page.evaluate(intent=>window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:intent})),intent);}
const starts=()=>calls.filter(call=>call.action==='smart_tool_start');
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('intención rápida abre paleta inmediata; tarjeta válida arma sin autorizaciones y modos repetidos no duplican',async({page},info)=>{
 await boot(page,info.outputDir,{sequence:1,action:'sheet'});const palette=page.locator('.smart-paint-palette');
 await expect.poll(()=>calls.some(call=>call.action==='quick_action_ack'&&call.data.sequence===1)).toBe(true);await expect(palette).toHaveClass(/immediate-palette/);await expect(palette.getByRole('button',{name:'Pintar pieza',exact:true})).toHaveAttribute('aria-pressed','true');
 await palette.getByRole('button',{name:'Melamina de prueba',exact:true}).click();await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);expect(starts()).toHaveLength(0);expect(calls.find(call=>call.action==='smart_quick_start')?.data).toMatchObject({mode:'sheet',immediate:true,immediatePiece:true,side:'both',paintScope:'piece',batch:false});await expect(palette.getByRole('checkbox')).toHaveCount(0);await expect(palette.getByRole('combobox')).toHaveCount(0);
 await quick(page,{sequence:2,action:'edge',message:'Elegí canto.'});await expect(palette.getByRole('button',{name:'Pintar canto',exact:true})).toHaveAttribute('aria-pressed','true');await expect(palette).toHaveCount(1);expect(calls.filter(call=>call.action==='smart_quick_start')).toHaveLength(1);
 await quick(page,{sequence:2,action:'sheet'});await expect(palette.getByRole('button',{name:'Pintar canto',exact:true})).toHaveAttribute('aria-pressed','true');
 await quick(page,{sequence:3,action:'edge',toggleOff:true});await expect(palette.getByText('○ Detenido',{exact:true})).toBeVisible();expect(calls.filter(call=>call.action==='smart_quick_start')).toHaveLength(1);
});

test('cuentagotas conserva UUID exacto y pasa a pintar pieza sin permiso compartido ni formulario',async({page},info)=>{
 await boot(page,info.outputDir,{sequence:1,action:'sample'});const palette=page.locator('.smart-paint-palette');
 await expect.poll(()=>calls.filter(call=>call.action==='smart_sample_start').length).toBe(1);expect(calls.find(call=>call.action==='smart_sample_start')!.data).toEqual({side:'front'});expect(starts()).toHaveLength(0);
 await state(page,{active:true,mode:'sample',sampleSequence:1,sample:{selectable:true,catalogId:'sheet-a',kind:'sheet',materialUuid:'uuid-sheet-second',name:'Placa nativa muestreada'}});
 await expect(palette.getByRole('button',{name:'Melamina de prueba',exact:true})).toHaveAttribute('aria-pressed','true');expect(calls.filter(call=>call.action==='smart_quick_start')).toHaveLength(0);
 await palette.getByRole('button',{name:'Pintar pieza',exact:true}).click();await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);expect(calls.find(call=>call.action==='smart_quick_start')?.data).toMatchObject({catalogId:'sheet-a',materialUuid:'uuid-sheet-second',immediatePiece:true});await expect(palette.getByRole('checkbox')).toHaveCount(0);
});

test('cuentagotas rápido usa lado frontal seguro y material ambiguo no se convierte en permiso de pintura',async({page},info)=>{
 await boot(page,info.outputDir,{sequence:1,action:'sample'},{side:'both'});const palette=page.locator('.smart-paint-palette');await expect.poll(()=>calls.filter(call=>call.action==='smart_sample_start').length).toBe(1);expect(calls.find(call=>call.action==='smart_sample_start')!.data).toEqual({side:'front'});await expect(palette.getByRole('combobox')).toHaveCount(0);
 await state(page,{active:true,mode:'sample',sampleSequence:1,sample:{selectable:false,issues:['Material heredado sin asociación aprobada.']}});await expect(palette.getByRole('alert')).toContainText('Material heredado sin asociación aprobada.');await expect(palette.getByRole('button',{name:'Melamina de prueba',exact:true})).toHaveAttribute('aria-pressed','false');expect(calls.filter(call=>call.action==='smart_quick_start')).toHaveLength(0);expect(starts()).toHaveLength(0);
});

test('Muebles prepara la selección sin guardar; Guías reutiliza y Maderera no publica',async({page},info)=>{
 await boot(page,info.outputDir,{sequence:1,action:'furniture',selectionPaths:['1']});await expect(page.getByRole('table',{name:'Piezas del mueble'})).toBeVisible();expect(calls.filter(call=>call.action==='generate').map(call=>call.data.ids)).toEqual([['1']]);expect(calls.filter(call=>['save','names_apply','pdf'].includes(call.action))).toHaveLength(0);
 await quick(page,{sequence:2,action:'guides'});await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Planos A4',exact:true})).toHaveAttribute('aria-current','page');expect(calls.filter(call=>call.action==='generate')).toHaveLength(1);expect(calls.filter(call=>['pdf','save','names_apply'].includes(call.action))).toHaveLength(0);
 await quick(page,{sequence:3,action:'order'});await expect(page.getByRole('alert')).toContainText('Conservá los cambios pendientes');expect(calls.filter(call=>['save','order_export','order_save','maderera_txt','pdf'].includes(call.action))).toHaveLength(0);await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();await quick(page,{sequence:4,action:'order'});const panel=page.getByRole('region',{name:'Optimización de placas'});await expect(panel).toBeVisible();await expect(panel.getByRole('group',{name:'Corte de la seccionadora'})).toBeVisible();expect(calls.filter(call=>call.action==='order_export'||call.action==='order_save'||call.action==='maderera_txt'||call.action==='pdf')).toHaveLength(0);
});

test('cambiar el modelo no descarta los nombres sin guardar y bloquea guardar/exportar',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('Nombre pendiente que conservar');
 await state(page,{active:false,contextChanged:true,error:'Cambió el modelo activo. Volvé a analizar.'});await expect(name).toHaveValue('Nombre pendiente que conservar');await expect(page.getByRole('alert')).toContainText('Cambió el modelo activo');await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeDisabled();expect(calls.filter(call=>call.action==='save'||call.action==='pdf')).toHaveLength(0);
 await state(page,{active:false,contextChanged:false,contextRestored:true});await expect(name).toHaveValue('Nombre pendiente que conservar');await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeEnabled();
});


test('Pintar de navegación activa el material recordado sin un segundo botón de activación',async({page},info)=>{
 await boot(page,info.outputDir,undefined,{catalogId:'edge-a',mode:'edge',scope:'all'});const navigation=page.getByRole('navigation',{name:'Módulos de Planos Santo'});await navigation.getByRole('button',{name:'Pintar',exact:true}).click();await expect.poll(()=>calls.filter(call=>call.action==='smart_quick_start').length).toBe(1);expect(calls.find(call=>call.action==='smart_quick_start')?.data).toMatchObject({catalogId:'edge-a',materialUuid:'uuid-edge-a',mode:'edge',immediate:true,immediatePiece:false,batch:false});await expect(page.getByText('● Pintando',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Pintar',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);expect(starts()).toHaveLength(0);expect(calls.some(call=>['scan','save','generate'].includes(call.action)&&call.action!=='scan')).toBe(false);
});
