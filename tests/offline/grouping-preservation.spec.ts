import {test,expect,type Page} from '@playwright/test';
import {toMuebles,toPlanos} from './fixtures/modules';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {showIds} from './ids';

// Actual offline Ruby controller with synthetic SketchUp API/file-save doubles.
// This is not a claim of native SketchUp validation or writing a real SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type GuideFurniture={groupIdentical?:boolean;naming?:{bases:{id:string;base:string}[]};pieces:{id:string;name:string}[];notes:unknown[];presentation:unknown};
type Snapshot={names:Record<string,string>;operations:unknown[][];geometryHash:string;definitions:string[];simulatedSaves:number;guide:{furniture:GuideFurniture[]}|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void}>,errors:string[],requests:{saveFile:boolean}[];
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);if(msg.action==='save')requests.push(msg.data);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function send(action:string){return raw(JSON.stringify({version:1,id:randomUUID(),action,data:{}}));}
async function snapshot(){const reply=await send('__names_inspect');expect(reply.error).toBeNull();return reply.result as Snapshot;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];requests=[];
 child=spawn(ruby,['sketchup_offline/test/grouping_bridge_driver.rb',folder,'save-revision'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error('Driver sintético terminado: '+stderr));pending.clear();});
 await page.exposeFunction('groupingNativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.groupingNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:/Otro mueble/}).uncheck();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
}
async function save(page:Page){const count=requests.length;await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect.poll(()=>requests.length).toBe(count+1);await expect(page.getByText('Guía y archivo SketchUp guardados.',{exact:true})).toBeVisible();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('agrupar nueve instancias con nombres diferentes solo cambia la presentación; guardar y reabrir conserva nombres físicos, bases, cámara y notas',async({page},info)=>{
 await boot(page,info.outputDir);const initial=await snapshot();
 await expect(page.locator('[data-piece-row]')).toHaveCount(9);
 await toPlanos(page);await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();await page.getByRole('slider',{name:'Giro horizontal',exact:true}).fill('24');
 await showIds(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Nota física del lateral derecho');
 await save(page);const baseline=await snapshot();expect(baseline.names).toEqual(initial.names);expect(baseline.simulatedSaves).toBe(1);
 await toMuebles(page);
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();await expect(page.locator('[data-piece-row]')).toHaveCount(1);await expect(page.locator('[data-piece-row]')).toContainText('×9');
 await save(page);const grouped=await snapshot();expect(requests.at(-1)).toMatchObject({saveFile:true});expect(grouped.simulatedSaves).toBe(2);
 expect(grouped.names).toEqual(baseline.names);expect(grouped.definitions).toEqual(initial.definitions);expect(grouped.geometryHash).toBe(initial.geometryHash);
 expect(grouped.guide!.furniture[0].pieces).toEqual(baseline.guide!.furniture[0].pieces);expect(grouped.guide!.furniture[0].naming).toEqual(baseline.guide!.furniture[0].naming);expect(grouped.guide!.furniture[0].notes).toEqual(baseline.guide!.furniture[0].notes);expect(grouped.guide!.furniture[0].presentation).toEqual(baseline.guide!.furniture[0].presentation);
 await page.reload();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true})).toBeChecked();
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).uncheck();await expect(page.locator('[data-piece-row]')).toHaveCount(9);await expect(page.getByLabel('Nombre P02',{exact:true})).toHaveValue('Lateral derecho');await expect(page.getByLabel('Nombre P08',{exact:true})).toHaveValue('Puerta derecha');
 await save(page);const ungrouped=await snapshot();expect(ungrouped.names).toEqual(initial.names);expect(ungrouped.guide!.furniture[0].pieces).toEqual(baseline.guide!.furniture[0].pieces);expect(ungrouped.guide!.furniture[0].notes).toEqual(baseline.guide!.furniture[0].notes);
 // A deliberate edit to a grouped row still renames every physical member.
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();await page.getByLabel('Nombre P01',{exact:true}).fill('PT confirmada');await save(page);
 const edited=await snapshot();for(let id=11;id<=19;id++)expect(edited.names[String(id)]).toBe('PT confirmada');expect(edited.names['21']).toBe(initial.names['21']);expect(edited.geometryHash).toBe(initial.geometryHash);expect(edited.guide!.furniture[0].notes).toEqual(baseline.guide!.furniture[0].notes);
 await send('__names_undo');const undo=await snapshot();expect(undo.names).toEqual(ungrouped.names);expect(undo.guide).toEqual(ungrouped.guide);expect(undo.geometryHash).toBe(initial.geometryHash);
});
