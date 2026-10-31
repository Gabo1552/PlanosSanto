import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Piezas 0.8.26 · veta por pieza: columna Veta (↕/↔, auto/manual), «Girar veta 90°» y «Veta automática» por fila,
// sobre la UI empaquetada y el controlador Ruby real con dobles de la API (names_bridge_driver.rb, modo
// materials-cutlist-grain: textura posicionable y «Hacer único» en memoria). No es SketchUp nativo.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Grain={axis:number|null;definition:string;positioned:number;materials:(string|null)[]};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await native(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'materials-cutlist-grain'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  return native(raw);
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.shellRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.clock.install();await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});
const axeSource=require.resolve('axe-core/axe.min.js');
type AxeResult={violations:{id:string;impact:string;nodes:{target:string[];failureSummary:string}[]}[]};
async function axe(page:Page,label:string){
 if(!await page.evaluate(()=>'axe' in window))await page.evaluate(await readFile(axeSource,'utf8'));
 const found=await page.evaluate(async()=>{const result:AxeResult=await (window as unknown as {axe:{run:(context:unknown,options:unknown)=>Promise<AxeResult>}}).axe.run({include:[['body']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  return result.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>`${v.impact} ${v.id}: ${v.nodes.map(n=>n.target.join(' ')+' | '+n.failureSummary.replace(/\s+/g,' ')).join(' ;; ')}`);});
 return found.map(line=>`[${label}] ${line}`);
}
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});

test('Piezas: veta automática, girar 90°, Deshacer, volver a automática, bloqueos en la fila y axe',async({page},info)=>{
 await boot(page,info.outputDir);const found:string[]=[];
 // Biblioteca: la placa con veta y el canto; se vinculan a los materiales del doble.
 let library=await send('catalog_add',{revision:0,item:{name:'Roble Jade',kind:'sheet'}}) as {catalog:{revision:number;items:Record<string,unknown>[]}};
 library=await send('catalog_add',{revision:library.catalog.revision,item:{name:'Canto roble',kind:'edge'}}) as typeof library;
 const [sheet,edge]=library.catalog.items as {id:string}[];
 Object.assign(sheet,{sku:'RJ-19',supplier:'Prueba',thicknessesMm:[19.05],widthMm:1830,lengthMm:2750,grain:true});Object.assign(edge,{sku:'CR-22',supplier:'Prueba',thicknessMm:.8,widthsMm:[22]});
 await send('catalog_save',{revision:library.catalog.revision,items:[sheet,edge]});
 await send('__bind_material',{materialName:'Jade synthetic',catalogId:sheet.id});await send('__bind_material',{materialName:'Canto de prueba',catalogId:edge.id});
 await rail(page,'Piezas').click();
 const view=page.locator('section.cutlist'),table=view.getByRole('table',{name:'Piezas de Roble Jade / 19,05 mm'});
 await expect(table.locator('thead th')).toHaveText(['No.','Designación','Cant.','Finales','Veta','L','A']);
 const lateral=table.locator('tbody tr').filter({hasText:'Lateral - Blanco'});
 // Pieza horizontal (las placas del doble están acostadas): la veta sigue el lado más largo, automática.
 await expect(lateral.locator('td.num')).toHaveText(['1','609,6 mm','406,4 mm']);
 await expect(lateral.locator('td.grain .cutlist-grain-cell')).toHaveText('↔Veta horizontal (a lo largo, automática)auto');
 await expect(lateral.locator('td.grain .cutlist-grain-cell')).toHaveAttribute('title','Veta horizontal (a lo largo, automática)');
 const rotate=lateral.getByRole('button',{name:'Girar veta 90°: Lateral - Blanco',exact:true}),auto=lateral.getByRole('button',{name:'Veta automática: Lateral - Blanco',exact:true});
 await expect(rotate).toBeVisible();await expect(auto).toBeVisible();
 found.push(...await axe(page,'Piezas con veta'));
 await page.screenshot({path:info.outputPath('piezas-veta-auto-SINTETICO.png'),fullPage:true});

 // Girar 90°: una operación; la pieza compartida con otros muebles se hace única y el listado se vuelve a leer.
 const before=(await send('__names_inspect') as {operations:unknown[][]}).operations.length;
 await rotate.click();
 await expect(view.locator('.cutlist-notice')).toHaveText(/^Veta girada 90° en 1 pieza\. Ctrl\+Z en SketchUp lo deshace\. .*Se hizo único el componente de 1 pieza/);
 expect(calls.filter(call=>call.action==='piece_grain').map(call=>call.data)).toEqual([{ids:['1/11'],mode:'rotate'}]);
 await expect(lateral.locator('td.num')).toHaveText(['1','406,4 mm','609,6 mm']);
 await expect(lateral.locator('td.grain .cutlist-grain-cell')).toHaveText('↔Veta horizontal (a lo largo, elegida a mano)manual');
 const operations=(await send('__names_inspect') as {operations:unknown[][]}).operations.slice(before);
 expect(operations.filter(o=>o[0]==='start').map(o=>o[1])).toEqual(['Orientar veta Planos Santo']);
 let grain=await send('__grain_inspect') as Record<string,Grain>;
 expect(grain['11'].axis).toBe(1);expect(grain['11'].positioned).toBeGreaterThan(0);expect(grain['21'].axis).toBeNull();
 expect(grain['11'].definition).not.toBe(grain['21'].definition);expect(grain['21'].positioned).toBe(0);
 // Cantos intactos; la cara ancha que heredaba la placa del mueble quedó pintada con la misma placa (avisado).
 expect(grain['11'].materials.slice(3,5)).toEqual(['Canto de prueba','Canto secundario de prueba']);
 expect([grain['11'].materials[1],grain['21'].materials[1]]).toEqual(['Jade synthetic',null]);
 await expect(view.locator('.cutlist-notice')).toContainText('Se pintó 1 cara con «Jade synthetic»');
 const other=table.locator('tbody tr').filter({hasText:'Base ajena'});
 await expect(other.locator('td.num')).toHaveText(['1','609,6 mm','406,4 mm']);
 found.push(...await axe(page,'Piezas veta manual'));

 // «Veta automática» después de girar: vuelve al lado más largo, en otra operación.
 await auto.click();
 await expect(view.locator('.cutlist-notice')).toHaveText(/^Veta automática en 1 pieza\./);
 await expect(lateral.locator('td.num')).toHaveText(['1','609,6 mm','406,4 mm']);
 await expect(lateral.locator('td.grain .cutlist-grain-cell')).toContainText('auto');
 grain=await send('__grain_inspect') as Record<string,Grain>;expect(grain['11'].axis).toBe(-1);

 // Bloqueos: un contenedor bloqueado deja el aviso en la fila y sin botones; un fallo al girar queda en la fila.
 await send('__names_lock',{persistentId:'2'});await view.getByRole('button',{name:'Generar',exact:true}).click();
 await expect(other.locator('.cutlist-grain-blocked')).toHaveText('La pieza o un contenedor está bloqueado.');
 await expect(other.getByRole('button',{name:/Girar veta/})).toHaveCount(0);
 await send('__names_lock',{persistentId:'12'});
 const base=table.locator('tbody tr').filter({hasText:'Base'}).filter({hasNotText:'ajena'});
 await base.getByRole('button',{name:'Girar veta 90°: Base',exact:true}).click();
 await expect(base.getByRole('alert')).toHaveText('La pieza o un contenedor está bloqueado.');
 found.push(...await axe(page,'Piezas veta bloqueada'));
 await page.screenshot({path:info.outputPath('piezas-veta-bloqueos-SINTETICO.png'),fullPage:true});

 // Ctrl+Z en SketchUp (doble): cada cambio de veta es un paso; dos pasos atrás, la pieza vuelve a su definición
 // compartida sin veta guardada; Generar vuelve a leer la veta automática.
 await send('__names_undo');grain=await send('__grain_inspect') as Record<string,Grain>;expect(grain['11'].axis).toBe(1);
 await send('__names_undo');grain=await send('__grain_inspect') as Record<string,Grain>;
 expect(grain['11'].axis).toBeNull();expect(grain['11'].definition).toBe(grain['21'].definition);expect(grain['11'].positioned).toBe(0);
 await view.getByRole('button',{name:'Generar',exact:true}).click();
 await expect(lateral.locator('td.num')).toHaveText(['1','609,6 mm','406,4 mm']);await expect(lateral.locator('td.grain .cutlist-grain-cell')).toContainText('auto');
 expect(found).toEqual([]);
});
