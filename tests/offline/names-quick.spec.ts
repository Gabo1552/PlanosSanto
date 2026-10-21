import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
// Synthetic Ruby controller: this exercises the real guide/name save engine,
// never SketchUp's desktop UI or a private SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
function raw(message:string):Promise<Reply>{return new Promise(resolve=>{const msg=JSON.parse(message);calls.push(msg);pending.set(msg.id,resolve);child.stdin.write(message+'\n');});}
async function inspect(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return reply.result as {names:Record<string,string>;operations:unknown[][];geometryHash:string;definitions:string[]};}
async function boot(page:Page,folder:string,selected=true){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('quickNamesRequest',async(message:string)=>{const msg=JSON.parse(message);if(selected&&msg.action==='ui_ready')return {version:1,id:msg.id,result:{intent:{sequence:1,action:'furniture',selectionPaths:['1']}},error:null};return raw(message);});
 await page.addInitScript({content:'window.sketchup={request(raw){window.quickNamesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected asset');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('selección nativa abre Muebles y piezas sin Generar ni renombrado implícito',async({page},info)=>{
 await boot(page,info.outputDir);await expect(page.getByRole('table',{name:'Piezas del mueble'})).toBeVisible();
 expect(calls.filter(call=>call.action==='generate').map(call=>call.data.ids)).toEqual([['1']]);expect(calls.some(call=>['save','names_apply'].includes(call.action))).toBe(false);
 const state=await inspect();expect(state.operations).toHaveLength(0);await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Muebles',exact:true})).toHaveAttribute('aria-current','page');
});

test('Escape restaura borrador; Tab y Enter recorren nombres sin RPC de resaltado por tecla',async({page},info)=>{
 await boot(page,info.outputDir);const first=page.getByLabel('Nombre P01',{exact:true}),second=page.getByLabel('Nombre P02',{exact:true});await expect(first).toBeVisible();const original=await first.inputValue(),before=await inspect();
 await first.click();const highlightCalls=calls.filter(call=>call.action==='piece_highlight').length;await first.fill('Nombre pendiente sin confirmar');await first.press('Escape');await expect(first).toHaveValue(original);expect(calls.filter(call=>call.action==='piece_highlight')).toHaveLength(highlightCalls);expect(await inspect()).toEqual(before);
 await first.click();await first.fill('Lateral confirmado en guía');await first.press('Tab');await expect(second).toBeFocused();await second.press('Enter');await expect(second).not.toBeFocused();expect(calls.some(call=>call.action==='save')).toBe(false);
});

test('vista previa permite excluir una pieza y confirma un lote con Undo',async({page},info)=>{
 await boot(page,info.outputDir);await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();const before=await inspect();await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral nuevo lote');await page.getByLabel('Nombre P02',{exact:true}).fill('Pieza excluida lote');
 await page.getByRole('button',{name:'Aplicar renombrado',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Aplicar renombrado',exact:true});await expect(dialog).toBeVisible();expect(await inspect()).toEqual(before);await expect(dialog).toContainText('Lateral nuevo lote');
 await dialog.getByRole('checkbox',{name:'Incluir renombrado P02 1/13/12',exact:true}).uncheck();await dialog.getByRole('button',{name:'Revisar selección del lote',exact:true}).click();await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true}).click();await expect(dialog).toHaveCount(0);
 const after=await inspect();expect(after.names['11']).toBe('Lateral nuevo lote');expect(after.names['12']).toBe(before.names['12']);expect(after.geometryHash).toBe(before.geometryHash);expect(after.definitions).toEqual(before.definitions);expect(after.operations.filter(op=>op[0]==='start')).toHaveLength(1);
 await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_undo',data:{}}));expect((await inspect()).names).toEqual(before.names);
});

test('acceso de paleta a vinculación visual abre la función real y catálogo vuelve a biblioteca',async({page},info)=>{
 await boot(page,info.outputDir);await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:{sequence:2,action:'materials',destination:'visuals'}})));await expect(page.getByRole('dialog',{name:'Pintar placas y cantos'})).toBeVisible();
 await page.getByRole('button',{name:'Cerrar pintado',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:{sequence:3,action:'materials',destination:'catalog'}})));await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
});
