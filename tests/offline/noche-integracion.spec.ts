import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// QA de integración de la noche: cruces entre el shell (atajos, ronda 2), la paleta
// Pintar del pincel diario (Hito 2), la franja «Análisis desactualizado» (Hito 6) y
// el foco al viewport (Hito 7). Controlador Ruby sintético de nombres con dobles de
// la API; los empujes de Ruby (eventos) se simulan en la página. No es SketchUp nativo.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];await page.setViewportSize({width:1400,height:1000});
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('nocheRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack'||action==='window_fit')return {version:1,id:msg.id,result:true,error:null};
  if(action==='viewport_focus')return {version:1,id:msg.id,result:{focused:true,method:'Sketchup.focus'},error:null};
  return native(raw);
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.nocheRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>count('ui_ready')).toBe(1);
}
const count=(action:string)=>calls.filter(call=>call.action===action).length;
const emit=(page:Page,name:string,detail:unknown)=>page.evaluate(([name,detail])=>window.dispatchEvent(new CustomEvent(name as string,{detail})),[name,detail] as const);
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
// Pintar exige la guía guardada (blockReason 'paint'): generar y guardar antes de abrir la paleta.
async function generated(page:Page){await page.keyboard.press('Alt+3');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
 const save=page.getByRole('button',{name:'Guardar guía',exact:true});await expect(save).toBeEnabled();await save.click();await expect.poll(()=>count('save')).toBe(1);await expect(rail(page,'Pintar')).toBeEnabled();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('Pintar en la ventana principal: los atajos del shell no actúan y Tab navega la paleta sin ir a SketchUp',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await rail(page,'Pintar').click();
 const palette=page.locator('.smart-paint-palette');await expect(palette).toBeVisible();
 await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeEnabled();
 const saves=count('save'),scans=count('scan');
 for(const key of ['Alt+2','Alt+5','Control+s','Control+Shift+E','?'])await page.keyboard.press(key);
 await expect(palette).toBeVisible();await expect(page.locator('.ux-shell')).toBeHidden();
 expect(count('save')).toBe(saves);expect(count('pdf')).toBe(0);expect(count('scan')).toBe(scans);
 // Tab y Ctrl+Tab del pincel viven en el viewport: en la paleta, Tab conserva la navegación normal.
 await page.getByRole('button',{name:'Pintar pieza',exact:true}).focus();await page.keyboard.press('Tab');
 await expect(page.getByRole('button',{name:'Pintar canto',exact:true})).toBeFocused();
 await page.keyboard.press('Control+Tab');await page.keyboard.press('Shift+Tab');
 await expect(page.getByRole('button',{name:'Pintar pieza',exact:true})).toBeFocused();
 expect(count('viewport_focus')).toBe(0);expect(count('smart_quick_start')).toBe(0);
});

// Simplificación punto 18: the stale banner stays as information but never blocks saving.
test('pintar con la paleta abierta deja la franja «Pintaste…» al volver; guardar igual regenera por id y la quita',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await rail(page,'Pintar').click();await expect(page.locator('.smart-paint-palette')).toBeVisible();
 // Ruby, en el mismo clic del pincel: estado de herramienta, documento invalidado y franja de escritura propia.
 await emit(page,'planos-santo-smart-paint',{active:true,mode:'sheet',changed:true,queuedCount:0});
 await emit(page,'planos-santo-document-invalidated',{scanRequired:true});
 await emit(page,'planos-santo-analysis-state',{stale:true,reason:'Pintaste desde Planos Santo.',source:'paint'});
 await page.getByRole('button',{name:'Cerrar paleta',exact:true}).click();
 await expect(page.locator('.smart-paint-palette')).toHaveCount(0);
 const banner=page.getByRole('status',{name:'Análisis desactualizado'});
 await expect(banner).toContainText('Pintaste desde Planos Santo.');
 const scans=count('scan');
 await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(2);expect(count('scan')).toBe(scans+1);await expect(banner).toHaveCount(0);
 // La revisión diferida no cambia el motivo en una ráfaga de clics (mismo evento repetido).
 await emit(page,'planos-santo-analysis-state',{stale:true,reason:'Pintaste desde Planos Santo.',source:'paint'});
 await expect(banner).toContainText('Pintaste desde Planos Santo.');
 await banner.getByRole('button',{name:'Reanalizar',exact:true}).click();
 const discard=page.getByRole('button',{name:'Descartar y analizar',exact:true});if(await discard.isVisible())await discard.click();
 await expect.poll(()=>count('scan')).toBe(scans+2);await expect(banner).toHaveCount(0);
 await page.keyboard.press('Alt+2');await expect(page.locator('.ux-module-heading')).toHaveText('Materiales');
});
