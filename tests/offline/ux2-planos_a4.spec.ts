import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';

// UX2 of the A4 sheet: copy of the list, «Ir a corregir», order state, fold option and accessible names.
// Real Ruby controller with synthetic API doubles, or a synthetic harness; never SketchUp or a customer's SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams|undefined,pending:Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void}>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child!.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];
 child=spawn(ruby,['sketchup_offline/test/a4_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(Error('Driver sintético terminado: '+stderr));pending.clear();});
 await page.exposeFunction('a4NativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.a4NativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:/Otro mueble/}).uncheck();
 await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
}
async function harness(page:Page,folder:string){
 const outfile=resolve(folder,'harness/harness.js');
 await build({absWorkingDir:process.cwd(),entryPoints:['tests/offline/fixtures/a4-ux2-harness.tsx'],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64'},logLevel:'silent'});
 errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://a4-harness.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script src="harness.js" defer></script></head><body><div id="root"></div></body></html>'});
  if(!['harness.js','harness.css'].includes(name))throw Error('Unexpected resource');
  await route.fulfill({body:await readFile(resolve(folder,'harness',name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://a4-harness.test/index.html');
 return page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();child=undefined;expect(errors).toEqual([]);});

test('UX2 A4: copiar tabla en TSV, estado del pedido, un único estado vivo y «Ir a corregir» con foco',async({page,context},info)=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://planos-santo.test'});
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Planos A4',exact:true}).click();
 const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});
 await expect(preview).not.toHaveAttribute('aria-busy');
 await expect(preview.getByRole('status').filter({hasText:/^Hoja lista · \d+(,\d)? (KB|MB)$/})).toBeVisible();
 await expect(preview.locator('.a4-order-pill')).toHaveText('○ Sin datos del pedido');
 const copy=preview.getByRole('button',{name:'Copiar tabla',exact:true});await copy.click();
 await expect(preview.getByRole('status').filter({hasText:'Tabla copiada:'})).toHaveText(/^Tabla copiada: \d+ filas de 1 mueble\. Pegala en Excel o Google Sheets\.$/);await expect(copy).toBeFocused();
 const clip=await page.evaluate(()=>navigator.clipboard.readText());const lines=clip.trimEnd().split('\r\n');
 expect(lines[0]).toBe('Mueble\tID\tNombre\tLargo\tAncho\tEsp.\tCant.');expect(lines[1]).toMatch(/^[^\t]+\tP01\t[^\t]+\t\d+(,\d+)?\t\d+(,\d+)?\t\d+(,\d+)?\t\d+$/);
 // A sheet that does not fit still lets the list be copied, and «Ir a corregir» lands on the field to shorten.
 const observations=page.getByLabel('Observaciones de armado',{exact:true});
 await observations.fill('Revisar las uniones y la alineación antes del montaje. '.repeat(35));
 const alert=preview.getByRole('alert');await expect(alert).toHaveAttribute('data-fit-kind','legend');
 await expect(preview.getByRole('status').filter({hasText:'La hoja no se actualizó'})).toBeVisible();
 await expect(copy).toBeEnabled();await copy.click();await expect(preview.getByRole('status').filter({hasText:'Tabla copiada:'})).toBeVisible();
 await page.getByRole('button',{name:'Planos A4',exact:true}).focus();
 await alert.getByRole('button',{name:'Ir a corregir',exact:true}).click();await expect(observations).toBeFocused();
 // While the sheet is recomposed the links stay in place, marked unavailable with a visible reason.
 await observations.fill('Revisar escuadra.');
 const download=preview.getByRole('link',{name:'Descargar vista previa',exact:true});
 await expect(download).not.toHaveAttribute('aria-disabled');await expect(download).toHaveAttribute('href',/^blob:/);
});

test('UX2 A4: «Agrupar por medidas» se guarda sin romper la guía, plural de ocultas y nombres visibles en chips',async({page},info)=>{
 await boot(page,info.outputDir);
 const fold=page.getByRole('checkbox',{name:'Agrupar por medidas en el listado A4',exact:true});await expect(fold).not.toBeChecked();
 await fold.check();await expect(fold).toBeChecked();
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await expect(fold).toBeChecked();
 const share=page.getByRole('checkbox',{name:'Compartir orientación entre exterior e interior',exact:true});await expect(share).toBeVisible();await expect(share).not.toHaveAttribute('aria-label');
 await expect(page.getByText(/^Piezas visibles en la vista interior · 0 ocultas$/)).toBeVisible();
 await page.getByText(/^Piezas visibles en la vista interior ·/).click();await page.getByRole('button',{name:'Editar visibilidad interior',exact:true}).click();
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();
 const chip=page.getByRole('button',{name:/^Mostrar P0\d · .+ \(1\/13\/12\)$/});await expect(chip).toBeVisible();
 const visible=(await chip.innerText()).replace('×','').trim();expect((await chip.getAttribute('aria-label'))!.startsWith(`Mostrar ${visible}`)).toBe(true);
 await expect(page.getByRole('button',{name:'Mostrar todas',exact:true})).toHaveCount(1);await expect(page.getByText(/previsualización/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Cancelar vista previa (descarta 1 cambio)',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();
 await expect(page.getByText(/^Piezas visibles en la vista interior · 1 oculta$/)).toBeVisible();
});

test('UX2 A4: el pedido parcial se indica sin depender del color y «Ir a corregir» abre la hoja del mueble que falla',async({page},info)=>{
 const preview=await harness(page,info.outputDir);
 await expect(preview.locator('.a4-order-pill')).toHaveText('○ Sin datos del pedido');
 await page.getByRole('button',{name:'Pedido parcial',exact:true}).click();
 const state=preview.locator('.a4-order-state');await expect(state).toHaveAttribute('data-order','partial');
 await expect(state.locator('.a4-order-pill')).toHaveText(/^✓ Con placa y cantos del pedido · \d+ de \d+ piezas$/);
 await expect(state).toContainText('2 piezas excluidas del pedido se imprimen sin material.');
 const sheet=preview.getByRole('combobox',{name:'Hoja visible',exact:true});await expect(sheet).toHaveValue('0');
 await expect(preview.getByRole('link',{name:'Abrir PDF',exact:true})).toHaveAttribute('href',/^blob:/);
 await page.getByRole('button',{name:'Desbordar segundo mueble',exact:true}).click();
 const alert=preview.getByRole('alert');await expect(alert).toHaveAttribute('data-fit-kind','legend');
 const blocked=preview.getByRole('link',{name:'Abrir PDF',exact:true});await expect(blocked).toHaveAttribute('aria-disabled','true');await expect(blocked).toHaveAccessibleDescription('Esperá a que la hoja esté actualizada');
 await alert.getByRole('button',{name:'Ir a corregir',exact:true}).click();
 await expect(sheet).toHaveValue('1');await expect(preview.getByRole('status').filter({hasText:/^Mostrando la hoja 2 · /})).toBeVisible();
 await expect(page.getByLabel('Observaciones de armado',{exact:true})).toBeFocused();
 await preview.getByRole('button',{name:'Copiar tabla',exact:true}).click();
 await expect(preview.getByRole('status').filter({hasText:/Tabla copiada|No se pudo copiar/})).toBeVisible();
});
