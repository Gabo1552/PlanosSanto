import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {Catalog} from '../../sketchup_offline/ui/WorkshopPanel';
import type {SkmPreviewRow} from '../../sketchup_offline/ui/MaterialLibraryPanel';
// MATERIALES-06: tipo en lote y por fila en la vista previa SKM. Puente simulado en memoria: el controlador real
// necesita un ZIP elegido en un diálogo nativo. El resto del arranque va al controlador Ruby real con dobles sintéticos.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let calls:{action:string;data:Record<string,unknown>}[],errors:string[],child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>;
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});calls=[];errors=[];pending=new Map();
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
const catalog:Catalog={schema:2,revision:4,items:[]};
 const rows:SkmPreviewRow[]=[['1','Melamina Blanca 18mm','sheet',18],['2','Canto Blanco 0.45','edge',0.45],['3','Textura libre',undefined,null]].map(([id,name,kind,thickness])=>({id:String(id),sha256:String(id).repeat(64),name:String(name),sourceName:`${name}.skm`,bytes:2048,thumbnail:pixel,suggestions:{kind:kind as string|undefined,thicknessMm:thickness as number|null,verified:false},warnings:[],status:'new'}));
 await page.exposeFunction('skmTypedContract',async(message:string)=>{
  const msg=JSON.parse(message),{action,data}=msg;calls.push({action,data});let result:unknown=true;
  if(action==='ui_ready')result={intent:{sequence:1,action:'materials'}};
  else if(action==='skm_library')result={catalog,rows:[],materials:[],assetRevision:0};
  else if(action==='skm_preview')result={token:'typed-token',revision:catalog.revision,rows};
  else if(action==='skm_commit_typed')result={catalog,imported:(data.selectedIds as string[]).length,skipped:0,rows:[]};
  else if(action==='skm_commit'||action==='skm_install'||action==='catalog_save')return {version:1,id:msg.id,result:null,error:`Acción no esperada: ${action}`};
  else if(!['ui_loading','quick_action_ack','skm_cancel'].includes(action))return raw(message);
  return {version:1,id:msg.id,result,error:null};
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.skmTypedContract(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
}
test.afterEach(()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('vista previa SKM: tipo por fila prellenado, tipo en lote para los seleccionados y espesor sugerido sin aprobar',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Importar biblioteca',exact:true}).click();await page.getByRole('button',{name:'Desde ZIP o archivo SKM',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Revisar importación de materiales'});await expect(modal).toBeVisible();
 await expect(modal.getByLabel('Tipo de Melamina Blanca 18mm.skm')).toHaveValue('sheet');await expect(modal.getByLabel('Tipo de Canto Blanco 0.45.skm')).toHaveValue('edge');await expect(modal.getByLabel('Tipo de Textura libre.skm')).toHaveValue('unknown');
 await modal.getByLabel('Tipo de Textura libre.skm').selectOption('veneer');await expect(modal.getByLabel('Tipo de Textura libre.skm')).toHaveValue('veneer');
 await modal.getByRole('checkbox',{name:'Importar Canto Blanco 0.45.skm'}).uncheck();
 const batch=modal.getByRole('group',{name:'Tipo del lote'});await batch.getByLabel('Tipo para los seleccionados').selectOption('edge');
 await batch.getByRole('button',{name:'Aplicar tipo a los seleccionados (2)',exact:true}).click();
 await expect(modal.getByLabel('Tipo de Melamina Blanca 18mm.skm')).toHaveValue('edge');await expect(modal.getByLabel('Tipo de Textura libre.skm')).toHaveValue('edge');
 await modal.getByLabel('Tipo de Melamina Blanca 18mm.skm').selectOption('sheet');
 const suggest=batch.getByLabel('Usar el espesor sugerido por el nombre del archivo como sugerencia (sin aprobar)');await expect(suggest).not.toBeChecked();await suggest.check();
 await expect(modal).toContainText('El espesor se precarga en la ficha; corregilo si no coincide.');
 await modal.getByRole('button',{name:'Importar 2 materiales',exact:true}).click();await expect(modal).toHaveCount(0);
 const commit=calls.filter(call=>call.action==='skm_commit_typed');expect(commit).toHaveLength(1);expect(calls.some(call=>call.action==='skm_commit')).toBe(false);
 expect(commit[0].data).toEqual({token:'typed-token',revision:4,selectedIds:['1','3'],renames:{},confirmed:true,kinds:{'1':'sheet','3':'edge'},applySuggestions:true});
});
