import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {Catalog,CatalogItem} from '../../sketchup_offline/ui/WorkshopPanel';
import type {SkmPreviewRow,VisualLibrary} from '../../sketchup_offline/ui/MaterialLibraryPanel';
// UI/bridge contract with an in-memory import double and actual Ruby synthetic
// scan controller. No real SKM, user's texture, SketchUp or Materials.load here.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[],catalog:Catalog,assets:VisualLibrary['rows'];
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
function candidate(row:SkmPreviewRow,name=row.name):CatalogItem{return {id:`00000000-0000-4000-8000-${row.id.padStart(12,'0')}`,name,kind:'unknown',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'2026-10-20T00:00:00Z',sourceHash:row.sha256,observed:{skmSha256:row.sha256}};}
async function boot(page:Page,folder:string,options:{conflict?:boolean;badThumbnail?:boolean;malformed?:boolean;approved?:boolean}={}){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];catalog={schema:1,revision:0,items:[]};assets=[];
 const rows:SkmPreviewRow[]=Array.from({length:35},(_,i)=>({id:String(i+1),sha256:(i+1).toString(16).padStart(64,'0'),name:i===12?'Catno QA 13':`Material QA ${String(i+1).padStart(2,'0')}`,sourceName:`QA${String(i+1).padStart(3,'0')}.skm`,bytes:1024,thumbnail:options.badThumbnail&&i===0?'https://untrusted.invalid/photo.png':pixel,suggestions:{kind:i===12?'edge':'sheet',thicknessMm:i===12?0.45:18,verified:false},warnings:['Tipo y medidas pendientes de revisión.'],status:options.conflict&&i===0?'conflict':'new'}));
 if(options.conflict){catalog.items=[candidate({...rows[0],id:'99',sha256:'f'.repeat(64)})];}
 let nativeRecords:NonNullable<VisualLibrary['materials']>=[];
 if(options.approved){const item={...candidate(rows[0]),kind:'sheet',approved:true,sku:'QA18',supplier:'Taller de prueba',thicknessMm:18,widthMm:1220,lengthMm:2440,grain:false};catalog.items=[item];assets=[{catalogId:item.id,sha256:rows[0].sha256,name:item.name,sourceName:rows[0].sourceName,thumbnail:pixel}];}

 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(Error(stderr));pending.clear();});
 await page.exposeFunction('materialImportContract',async(message:string)=>{
  const msg=JSON.parse(message),{action,data}=msg;calls.push({action,data});let result:unknown;
  if(action==='ui_ready')result={intent:{sequence:1,action:'materials'}};
  else if(action==='ui_loading'||action==='quick_action_ack'||action==='skm_cancel')result=true;
  else if(action==='skm_library')result={catalog,rows:assets,materials:nativeRecords,assetRevision:0};
  else if(action==='skm_preview'){
   if(options.malformed)return {version:1,id:msg.id,result:null,error:'El archivo no es un ZIP válido. La biblioteca no cambió.'};
   result={token:'synthetic-import-token',revision:catalog.revision,rows:rows.map(row=>({...row,status:catalog.items.some(item=>item.observed.skmSha256===row.sha256)?'duplicate':row.status}))};
  }else if(action==='skm_commit'){
   const ids=data.selectedIds as string[],renames=data.renames as Record<string,string>;
   const selected=rows.filter(row=>ids.includes(row.id));
   const items=selected.map(row=>candidate(row,renames[row.id]||row.name));catalog={...catalog,revision:catalog.revision+1,items:[...catalog.items,...items]};
   assets.push(...selected.map((row,index)=>({catalogId:items[index].id,sha256:row.sha256,name:items[index].name,sourceName:row.sourceName,thumbnail:row.thumbnail,suggestions:row.suggestions,warnings:row.warnings})));
   result={catalog,imported:selected.length,skipped:35-selected.length,rows:assets};
  }else if(action==='skm_install'){
   const item=catalog.items.find(item=>item.id===data.catalogId)!;
   nativeRecords=[{id:'native-loaded-qa',name:item.name,hasTexture:true,binding:{catalogId:item.id,kind:item.kind,uuid:'qa-loaded-uuid'},issues:[]}];
   const scanned=await raw(JSON.stringify({version:1,id:msg.id+'-scan',action:'scan',data:{}}));result={scan:scanned.result};
  }else if(action==='catalog_save'){catalog={...catalog,revision:catalog.revision+1,items:data.items as CatalogItem[]};result={catalog,conflicts:[]};}
  else return raw(message);
  return {version:1,id:msg.id,result,error:null};
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.materialImportContract(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('https://planos-santo.test/'))errors.push('Unexpected remote resource');});
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
}
async function preview(page:Page){await page.getByRole('button',{name:'Importar biblioteca',exact:true}).click();await page.getByRole('button',{name:'Desde ZIP o archivo SKM',exact:true}).click();await expect(page.getByRole('dialog',{name:'Revisar importación de materiales'})).toBeVisible();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('35 candidatos con miniaturas se importan sin aprobar; repetir detecta duplicados y no toca el modelo',async({page},info)=>{
 await boot(page,info.outputDir);await preview(page);const modal=page.getByRole('dialog',{name:'Revisar importación de materiales'});
 await expect(modal.getByRole('checkbox')).toHaveCount(35);await expect(modal.getByRole('img',{name:/Miniatura real/})).toHaveCount(35);await expect(modal).toContainText('Sugerencia sin verificar: Canto');
 await page.screenshot({path:info.outputPath('import-35-SINTETICO.png'),fullPage:true});
 await modal.getByRole('button',{name:'Importar 35 pendientes',exact:true}).click();await expect(modal).toHaveCount(0);
 await expect(page.getByRole('article',{name:/Material /})).toHaveCount(35);expect(catalog.items.every(item=>!item.approved&&item.kind==='unknown'&&item.thicknessMm===null&&item.grain===null)).toBe(true);
 const forbidden=['catalog_install','paint_apply','smart_tool_start','skm_install','save','pdf','order_export'];expect(calls.some(call=>forbidden.includes(call.action))).toBe(false);
 await page.getByRole('searchbox',{name:'Buscar materiales del taller'}).fill('Catno QA 13');await expect(page.getByRole('article',{name:'Material Catno QA 13',exact:true})).toHaveCount(1);await expect(page.getByRole('article',{name:'Material Catno QA 13',exact:true})).toContainText('Tipo pendiente');
 await preview(page);await expect(modal).toContainText('35 duplicados');await expect(modal.getByRole('button',{name:'Importar 0 pendientes',exact:true})).toBeDisabled();
 await modal.getByRole('button',{name:'Cancelar importación',exact:true}).click();expect(catalog.items).toHaveLength(35);expect(calls.filter(call=>call.action==='skm_commit')).toHaveLength(1);
});

test('conflicto requiere un nombre explícito o excluir la fila; Escape cancela sin crear candidatos',async({page},info)=>{
 await boot(page,info.outputDir,{conflict:true});await preview(page);const modal=page.getByRole('dialog',{name:'Revisar importación de materiales'});
 await modal.getByRole('checkbox',{name:'Importar QA001.skm',exact:true}).check();await expect(modal.getByRole('button',{name:'Importar 35 pendientes',exact:true})).toBeDisabled();
 await modal.getByRole('textbox',{name:'Resolver nombre QA001.skm',exact:true}).fill('Material QA 01 alternativa');await expect(modal.getByRole('button',{name:'Importar 35 pendientes',exact:true})).toBeEnabled();
 await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);expect(catalog.items).toHaveLength(1);expect(calls.filter(call=>call.action==='skm_commit')).toHaveLength(0);expect(calls.some(call=>call.action==='skm_cancel')).toBe(true);
 await expect(page.getByRole('button',{name:'Importar biblioteca',exact:true})).toBeFocused();
});

test('miniatura externa se sustituye por placeholder y favorito persiste sin alterar aprobación',async({page},info)=>{
 await boot(page,info.outputDir,{badThumbnail:true});await preview(page);const modal=page.getByRole('dialog',{name:'Revisar importación de materiales'});
 await expect(modal.getByRole('img')).toHaveCount(34);await expect(modal).toContainText('Sin miniatura disponible');
 await modal.getByRole('button',{name:'Importar 35 pendientes',exact:true}).click();const card=page.getByRole('article',{name:'Material Material QA 01',exact:true});
 await card.getByRole('button',{name:'Marcar favorito Material QA 01',exact:true}).click();await expect(card.getByRole('button',{name:'Quitar favorito Material QA 01',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('checkbox',{name:'Solo favoritos',exact:true}).check();await expect(page.getByRole('article',{name:/Material /})).toHaveCount(1);expect(catalog.items.find(item=>item.name==='Material QA 01')!.approved).toBe(false);
 await page.getByRole('button',{name:'En este modelo',exact:true}).click();await expect(page.getByRole('article',{name:/Material /})).toHaveCount(0);await expect(page.getByText('Materiales ya cargados en el modelo abierto.',{exact:false})).toBeVisible();
});

test('archivo malformado informa recuperación y no sustituye la biblioteca ni abre importación',async({page},info)=>{
 await boot(page,info.outputDir,{malformed:true});await page.getByRole('button',{name:'Importar biblioteca',exact:true}).click();await page.getByRole('button',{name:'Desde ZIP o archivo SKM',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('El archivo no es un ZIP válido');await expect(page.getByRole('dialog',{name:'Revisar importación de materiales'})).toHaveCount(0);expect(catalog.items).toHaveLength(0);expect(calls.some(call=>call.action==='skm_commit')).toBe(false);
});


test('un SKM aprobado requiere confirmación explícita antes de cargarse en el modelo',async({page},info)=>{
 await boot(page,info.outputDir,{approved:true});const card=page.getByRole('article',{name:'Material Material QA 01',exact:true});await card.getByRole('button',{name:/Material QA 01/}).first().click();
 const details=page.getByRole('complementary',{name:'Material seleccionado'});await details.getByRole('button',{name:'Cargar SKM en este modelo',exact:true}).click();expect(calls.filter(call=>call.action==='skm_install')).toHaveLength(0);
 await details.getByRole('button',{name:'Sí, cargar SKM',exact:true}).click();await expect(page.getByText('SKM cargado en el modelo.',{exact:false})).toBeVisible();
 expect(calls.filter(call=>call.action==='skm_install')).toHaveLength(1);expect(calls.find(call=>call.action==='skm_install')!.data).toMatchObject({catalogId:catalog.items[0].id,revision:0,assetRevision:0,confirmed:true,replaceVisual:false});
 await expect(details.getByText('1 material vinculado',{exact:true})).toBeVisible();await expect(details.getByRole('button',{name:'Cargar SKM en este modelo',exact:true})).toHaveCount(0);expect(calls.some(call=>call.action==='paint_apply'||call.action==='smart_tool_start')).toBe(false);
});
