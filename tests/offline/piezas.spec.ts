import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Vista «Piezas» (lista de corte al estilo OpenCutList, escrita de cero) sobre la UI empaquetada y el
// controlador Ruby real con dobles de la API (names_bridge_driver.rb, modo materials-cutlist). No es SketchUp nativo.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],replies:Map<string,Reply>,errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];replies=new Map();errors=[];await page.setViewportSize({width:1500,height:1100});
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'materials-cutlist'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  const reply=await native(raw);replies.set(msg.id,reply);if(action==='piece_highlight'||action==='cutlist')replies.set(action,reply);return reply;
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.shellRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.clock.install();await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});
const axeSource=require.resolve('axe-core/axe.min.js');
type AxeResult={violations:{id:string;impact:string;help:string;nodes:{target:string[];failureSummary:string}[]}[]};
async function axe(page:Page,label:string){
 if(!await page.evaluate(()=>'axe' in window))await page.evaluate(await readFile(axeSource,'utf8'));
 const found=await page.evaluate(async()=>{const result:AxeResult=await (window as unknown as {axe:{run:(context:unknown,options:unknown)=>Promise<AxeResult>}}).axe.run({include:[['body']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  return result.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>`${v.impact} ${v.id}: ${v.nodes.map(n=>n.target.join(' ')+' | '+n.failureSummary.replace(/\s+/g,' ')).join(' ;; ')}`);});
 return found.map(line=>`[${label}] ${line}`);
}

test('Piezas: secciones por material y espesor, plegar, filtrar, resaltar y axe',async({page},info)=>{
 await boot(page,info.outputDir);const found:string[]=[];
 // Sin guías generadas la pestaña explica qué falta y no pide datos a Ruby.
 await rail(page,'Piezas').click();await expect(rail(page,'Piezas')).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('heading',{level:2,name:'Primero generá las guías en Muebles'})).toBeVisible();
 expect(calls.filter(call=>call.action==='cutlist')).toHaveLength(0);found.push(...await axe(page,'Piezas vacío'));
 await page.getByRole('button',{name:'Ir a Muebles',exact:true}).click();await expect(rail(page,'Muebles')).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();

 await rail(page,'Piezas').click();
 const view=page.locator('section.cutlist');
 await expect(view.getByRole('heading',{level:2,name:'Piezas por material y espesor'})).toBeVisible();
 await expect.poll(()=>replies.has('cutlist')?replies.get('cutlist')!.error:'pendiente').toBeNull();
 const toggles=view.locator('.cutlist-section-title button');
 await expect(toggles).toHaveCount(2);
 await expect(toggles.nth(0)).toContainText('Jade synthetic');await expect(toggles.nth(0)).toContainText('19,05 mm');
 await expect(toggles.nth(1)).toContainText('Jade synthetic / Placa sin aplicar');
 for(const index of [0,1])await expect(toggles.nth(index)).toHaveAttribute('aria-expanded','true');
 const first=view.getByRole('table',{name:'Piezas de Jade synthetic · 19,05 mm'});
 await expect(first.getByRole('columnheader')).toHaveText(['Código','Nombre','Cant.','Largo','Ancho','Esp.','Arr','Aba','Izq','Der','Veta']);
 await expect(first.locator('tbody tr')).toHaveCount(2);
 const lateral=first.locator('tbody tr').filter({hasText:'Lateral - Blanco'});
 await expect(lateral.locator('td.num')).toHaveText(['1','609,6','406,4','19,05']);
 // Cantos por lado: chip con el nombre del canto pintado; «—» donde no hay.
 await expect(lateral.locator('td.edge')).toHaveText(['Canto de…Arriba: Canto de prueba — pintado en el modelo, sin ficha de biblioteca','—Abajo: sin canto','Canto sec…Izquierda: Canto secundario de prueba — pintado en el modelo, sin ficha de biblioteca','—Derecha: sin canto']);
 await expect(first.locator('tfoot')).toContainText('2 piezas · 0,50 m² netos');
 await expect(first.locator('tfoot')).toContainText('Canto de prueba 1,22 m');
 await expect(view.locator('.cutlist-totals')).toContainText('3 piezas · 2 materiales');
 found.push(...await axe(page,'Piezas'));

 // Plegar una sección y todas; volver a desplegar.
 await toggles.nth(0).click();await expect(toggles.nth(0)).toHaveAttribute('aria-expanded','false');await expect(first).toBeHidden();
 await toggles.nth(0).click();await expect(first).toBeVisible();
 await view.getByRole('button',{name:'Plegar todo',exact:true}).click();
 for(const index of [0,1])await expect(toggles.nth(index)).toHaveAttribute('aria-expanded','false');
 await expect(view.getByRole('button',{name:'Plegar todo',exact:true})).toBeDisabled();
 found.push(...await axe(page,'Piezas plegadas'));
 await view.getByRole('button',{name:'Expandir todo',exact:true}).click();
 for(const index of [0,1])await expect(toggles.nth(index)).toHaveAttribute('aria-expanded','true');

 // Filtro por mueble y búsqueda por nombre.
 await view.getByLabel('Mueble',{exact:true}).selectOption({label:'Otro mueble'});
 await expect(toggles).toHaveCount(1);await expect(view.locator('tbody tr')).toHaveText([/Base ajena/]);
 await view.getByLabel('Mueble',{exact:true}).selectOption({label:'Todos los muebles'});
 await view.getByLabel('Buscar',{exact:true}).fill('lateral');
 await expect(view.locator('tbody tr')).toHaveCount(1);await expect(view.locator('.cutlist-totals')).toContainText('1 pieza · 1 material');
 await view.getByLabel('Buscar',{exact:true}).fill('no existe');await expect(view.getByText('Ninguna pieza coincide con el filtro.')).toBeVisible();
 await view.getByLabel('Buscar',{exact:true}).fill('');

 // Clic en una fila: resalta la pieza en SketchUp con la acción existente.
 const row=view.locator('tbody tr').filter({hasText:'Lateral - Blanco'});
 await row.locator('td.num').first().click();
 await expect.poll(()=>calls.filter(call=>call.action==='piece_highlight').map(call=>call.data.pieceId)).toEqual(['1/11']);
 await expect.poll(()=>replies.has('piece_highlight')?replies.get('piece_highlight')!.error:'pendiente').toBeNull();
 await expect(row).toHaveAttribute('aria-current','true');
 // También con teclado, desde el nombre.
 await view.getByRole('button',{name:'Base ajena',exact:true}).focus();await page.keyboard.press('Enter');
 await expect.poll(()=>calls.filter(call=>call.action==='piece_highlight').length).toBe(2);
 found.push(...await axe(page,'Piezas con fila resaltada'));
 // Solo lectura: la pestaña no escribió nada.
 expect(calls.some(call=>['save','order_save','names_apply','catalog_save','paint_apply'].includes(call.action))).toBe(false);
 expect(found).toEqual([]);
});
