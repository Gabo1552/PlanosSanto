import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// Synthetic browser + actual Ruby controller contracts; no SketchUp execution claimed.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Snapshot={names:Record<string,string>;operations:unknown[][];geometryHash:string;definitions:string[];guide:{furniture:{naming?:{reference?:{upAxis:number;frontAxis:number;frontSign:number;confirmed:boolean};reviews?:{id:string;base:string}[]};pieces:{id:string;name:string}[];notes:unknown[]}[]}|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],saves:number;
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);if(msg.action==='save')saves++;pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){return raw(JSON.stringify({version:1,id:randomUUID(),action,data}));}
async function snapshot(){const reply=await send('__names_inspect');expect(reply.error).toBeNull();return reply.result as Snapshot;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];saves=0;
 child=spawn(ruby,['sketchup_offline/test/recognition_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error('Driver sintético terminado: '+stderr));pending.clear();});
 await page.exposeFunction('recognitionNativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.recognitionNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
}
async function openProposals(page:Page){await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();return page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('piezas originalmente sin nombre: propuesta editable junto al dibujo, frente persistido y un único guardado reversible',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();expect(before.names['11']).toBe('');expect(before.names['12']).toBe('');
 await page.getByLabel('Abreviatura de la obra').fill('VF');await page.getByLabel('Módulo de este mueble').fill('M01');await page.getByRole('button',{name:'Otro mueble 1 pieza',exact:true}).click();await page.getByLabel('Módulo de este mueble').fill('M02');await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Alinear sin perder esta anotación');
 const dialog=await openProposals(page);await expect(dialog.locator('[aria-label^="Nombre sugerido"]')).toHaveCount(2);
 // Punto 21: the group axes are the default; nothing asks to confirm them.
 await expect(dialog).not.toContainText('Falta confirmar vertical y frente');await expect(dialog.getByLabel('Confirmé frente y vertical en el dibujo',{exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true})).toBeDisabled();
 await dialog.getByLabel('Frente local',{exact:true}).selectOption('0,1');
 await dialog.getByLabel('Nombre sugerido P01',{exact:true}).fill('Estante corregido');await dialog.getByLabel('Nombre sugerido P02',{exact:true}).fill('Piso revisado');
 await dialog.getByRole('button',{name:'M01·P02 · ×1',exact:true}).click();await expect(dialog.locator('.diagram')).toBeVisible();await expect(dialog.locator('tr[data-current="true"]')).toContainText('P02');
 const chart=await dialog.locator('.diagram').boundingBox(),field=await dialog.getByLabel('Nombre sugerido P02',{exact:true}).boundingBox();expect(chart!.x+chart!.width).toBeLessThanOrEqual(field!.x);expect(field!.y).toBeLessThan(1100);
 await page.screenshot({path:info.outputPath('propuestas-nombres-SINTETICO.png'),fullPage:true});
 expect(await snapshot()).toEqual(before);expect(saves).toBe(0);
 await dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 const after=await snapshot();expect(saves).toBe(1);expect(after.names['11']).toBe('VF M01 Estante corregido');expect(after.names['12']).toBe('VF M01 Piso revisado');expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);expect(after.operations.filter(op=>op[0]==='start')).toHaveLength(1);
 expect(after.guide!.furniture[0].naming!.reference).toEqual({upAxis:2,frontAxis:0,frontSign:1,confirmed:true});expect(after.guide!.furniture[0].notes).toHaveLength(1);expect(after.guide!.furniture[0].naming!.reviews).toEqual(expect.arrayContaining([expect.objectContaining({id:'1/11',base:'Estante corregido'})]));
 await page.reload();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();const reopened=await openProposals(page);await expect(reopened.getByLabel('Frente local',{exact:true})).toHaveValue('0,1');await expect(reopened.getByLabel('Confirmé frente y vertical en el dibujo',{exact:true})).toHaveCount(0);await expect(reopened).toContainText('No hay piezas sin nombre pendientes');
 await reopened.getByRole('button',{name:'Cerrar',exact:true}).click();await send('__names_undo');const undone=await snapshot();expect(undone.names).toEqual(before.names);expect(undone.guide).toEqual(before.guide);expect(undone.geometryHash).toBe(before.geometryHash);
});

test('cancelar propuestas no escribe nombres ni frente; Escape conserva el modelo y devuelve el foco',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot(),dialog=await openProposals(page);await dialog.getByLabel('Nombre sugerido P01',{exact:true}).fill('Propuesta cancelada');await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).not.toHaveValue('Propuesta cancelada');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true})).toBeFocused();expect(await snapshot()).toEqual(before);expect(saves).toBe(0);
});

// Simplificación punto 20: the incompatible shared occurrence is not renamed (no partial change) and its row says why.
test('una ocurrencia compartida incompatible no se renombra: aviso en la fila, sin cambios parciales',async({page},info)=>{
 await boot(page,info.outputDir,'shared');const before=await snapshot(),dialog=await openProposals(page);await dialog.getByLabel('Nombre sugerido P01',{exact:true}).fill('Nombre incompatible');await dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(dialog).toHaveCount(0);expect(saves).toBe(1);
 await expect(page.getByRole('table',{name:'Piezas del mueble'}).getByRole('note').first()).toContainText(/compartid/);const after=await snapshot();expect(after.names).toEqual(before.names);expect(after.geometryHash).toBe(before.geometryHash);
});
