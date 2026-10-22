import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Hito 6 (arquitectura): franja «Análisis desactualizado», carga diferida de Materiales y Maderera,
// ventana sin tamaño fijo y transporte por partes. Controlador Ruby sintético con dobles de la API;
// no es SketchUp nativo ni un modelo de cliente.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Overrides=Record<string,(data:Record<string,unknown>)=>unknown>;
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string,overrides:Overrides={}){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('hito6Request',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(overrides[action])return {version:1,id:msg.id,result:overrides[action](data),error:null};
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='quick_action_ack'||action==='window_fit')return {version:1,id:msg.id,result:true,error:null};
  return native(raw);
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.hito6Request(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
}
const count=(action:string)=>calls.filter(call=>call.action===action).length;
const analysis=(page:Page,detail:Record<string,unknown>)=>page.evaluate(value=>window.dispatchEvent(new CustomEvent('planos-santo-analysis-state',{detail:value})),detail);
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('ARQ-02: pintar o editar en SketchUp muestra la franja en vez de reanalizar; Reanalizar la quita y Deshacer también',async({page},info)=>{
 await boot(page,info.outputDir);await expect.poll(()=>count('ui_ready')).toBe(1);
 await page.keyboard.press('Alt+3');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
 const scans=count('scan');
 await analysis(page,{stale:true,reason:'Pintaste desde Planos Santo.',source:'paint'});
 const banner=page.getByRole('status',{name:'Análisis desactualizado'});
 await expect(banner).toContainText('Análisis desactualizado · Pintaste desde Planos Santo.');
 expect(count('scan')).toBe(scans);
 await page.keyboard.press('Control+s');await expect(page.getByRole('alert')).toContainText(/volvé a analizar/i);expect(count('save')).toBe(0);
 await analysis(page,{stale:false,reason:null,source:null});await expect(banner).toHaveCount(0);
 await analysis(page,{stale:true,reason:'El modelo cambió en SketchUp (edición, Deshacer o Rehacer).',source:'model'});
 await banner.getByRole('button',{name:'Reanalizar',exact:true}).click();
 const discard=page.getByRole('button',{name:'Descartar y analizar',exact:true});if(await discard.isVisible())await discard.click();
 await expect.poll(()=>count('scan')).toBe(scans+1);await expect(banner).toHaveCount(0);
 await analysis(page,{stale:'sí'});await expect(banner).toHaveCount(0);
});
