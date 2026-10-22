import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';

// UX of the A4 editor and sheet preview, with the real Ruby controller and synthetic API doubles.
// These checks never open SketchUp or a customer's SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
type Snapshot={guide:{furniture:{presentation?:{guide?:{mode:string;hiddenPieceIds:string[]}}}[]}|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void}>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function snapshot(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return reply.result as Snapshot;}
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
async function openVisibility(page:Page){const button=page.getByRole('button',{name:'Editar visibilidad interior',exact:true});if(!await button.isVisible())await page.getByText(/^Piezas visibles en la vista interior ·/).click();await button.click();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('UX A4: un solo selector de vistas con flechas y orientación compartida solo en dos vistas',async({page},info)=>{
 await boot(page,info.outputDir);
 const group=page.getByRole('radiogroup',{name:'Vistas en el PDF',exact:true});await expect(group.getByRole('radio')).toHaveCount(3);
 await expect(page.getByRole('combobox',{name:'Vistas en el PDF'})).toHaveCount(0);await expect(page.getByRole('button',{name:'1 vista',exact:true})).toHaveCount(0);
 const exterior=group.getByRole('radio',{name:'Exterior',exact:true}),interior=group.getByRole('radio',{name:'Interior',exact:true}),both=group.getByRole('radio',{name:'Exterior + interior',exact:true});
 await expect(both).toHaveAttribute('aria-checked','true');await expect(both).toHaveAttribute('tabindex','0');await expect(exterior).toHaveAttribute('tabindex','-1');
 await expect(page.getByLabel('Compartir orientación entre exterior e interior',{exact:true})).toBeVisible();
 await interior.click();await expect(interior).toHaveAttribute('aria-checked','true');await expect(page.getByLabel('Compartir orientación entre exterior e interior',{exact:true})).toHaveCount(0);
 await interior.press('ArrowLeft');await expect(exterior).toHaveAttribute('aria-checked','true');await expect(exterior).toBeFocused();
 await exterior.press('ArrowLeft');await expect(both).toHaveAttribute('aria-checked','true');await expect(both).toBeFocused();
 await both.press('Home');await expect(exterior).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 expect((await snapshot()).guide!.furniture[0].presentation!.guide!.mode).toBe('exterior');
});

test('UX A4: buscar piezas, diferencia frente a lo aplicado y atajos Esc / Ctrl+Enter',async({page},info)=>{
 await boot(page,info.outputDir);await openVisibility(page);
 const status=page.getByTestId('a4-view-stage'),apply=page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true});
 await expect(status).toContainText('Sin cambios respecto de lo aplicado');await expect(apply).toBeDisabled();
 await expect(page.getByRole('button',{name:'Cancelar vista previa',exact:true})).toBeVisible();
 const search=page.getByRole('searchbox',{name:'Buscar pieza (código o nombre)',exact:true});
 await search.fill('p02');await expect(page.locator('.guide-physical-pieces [data-piece-path]')).toHaveCount(1);await expect(page.getByText('1 de 2',{exact:true})).toBeVisible();
 await search.fill('zzz');await expect(page.getByText('Ninguna pieza coincide con «zzz».',{exact:true})).toBeVisible();
 await search.press('Escape');await expect(search).toHaveValue('');await expect(page.locator('.guide-physical-pieces [data-piece-path]')).toHaveCount(2);
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();
 await expect(status).toContainText('Sin aplicar: 1 nueva oculta');await expect(apply).toBeEnabled();
 await expect(page.locator('[data-piece-path="1/13/12"]')).toContainText('nueva oculta');
 await expect(page.getByRole('button',{name:'Cancelar vista previa (descarta 1 cambio)',exact:true})).toBeVisible();
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).check();await expect(status).toContainText('Sin cambios respecto de lo aplicado');await expect(apply).toBeDisabled();
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();await search.focus();await page.keyboard.press('Control+Enter');
 await expect(page.getByTestId('a4-view-stage')).toHaveCount(0);await expect(page.getByRole('button',{name:/^Mostrar P0\d · .+ \(1\/13\/12\)$/})).toBeVisible();
 await openVisibility(page);await page.getByLabel('Visible en interior 1/13/12',{exact:true}).check();
 await expect(status).toContainText('Sin aplicar: 1 se restaura');await expect(page.locator('[data-piece-path="1/13/12"]')).toContainText('se restaura');
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).focus();await page.keyboard.press('Escape');
 await expect(page.getByTestId('a4-view-stage')).toHaveCount(0);await expect(page.getByRole('button',{name:/^Mostrar P0\d · .+ \(1\/13\/12\)$/})).toBeVisible();
});

test('UX A4: el bloqueo dice mueble, causa y acción; la hoja anterior queda visible mientras se recompone',async({page},info)=>{
 await boot(page,info.outputDir);
 const observations=page.getByLabel('Observaciones de armado',{exact:true});
 await page.getByRole('button',{name:'Planos A4',exact:true}).click();
 const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true}),frame=preview.locator('iframe[title="PDF A4 generado"]');
 const link=preview.getByRole('link',{name:'Descargar vista previa',exact:true});await expect(link).toBeVisible();
 await expect(link).toHaveAttribute('download',/^[^/\\:*?"<>|]+-A4-\d{4}-\d{2}-\d{2}\.pdf$/);await expect(link).not.toHaveAttribute('download','PlanosSanto-vista-previa-A4.pdf');
 await expect(preview.getByTestId('a4-sheet-size')).toHaveText(/^PDF · \d+(,\d)? (KB|MB) · 1 hoja$/);
 await expect(frame).toHaveAttribute('src',/^blob:.*#page=1&view=FitH/);const first=await frame.getAttribute('src');
 // Editing keeps the previous sheet on screen, dimmed, with download disabled until the new one arrives.
 await observations.fill('Revisar escuadra.');
 await expect(preview.getByRole('status').filter({hasText:'Actualizando…'})).toBeVisible();await expect(frame).toHaveCount(1);await expect(frame).toHaveAttribute('data-stale','true');await expect(link).toHaveAttribute('aria-disabled','true');
 await expect(frame).not.toHaveAttribute('src',first!);await expect(frame).not.toHaveAttribute('data-stale');await expect(link).toBeVisible();
 // A failing layout keeps the last sheet that fit and says what to change.
 await observations.fill('Revisar las uniones y la alineación antes del montaje. '.repeat(35));
 const alert=preview.getByRole('alert');await expect(alert).toBeVisible();
 await expect(alert.locator('strong')).toHaveText(/^No entra en la hoja: .+/);
 await expect(alert).toContainText('Las notas y observaciones no caben legiblemente');await expect(alert).toContainText('Qué hacer: Acortá observaciones o notas.');
 await expect(alert).toContainText('Se muestra la última versión que entraba.');await expect(alert).not.toContainText('Revisá las vistas, el zoom o los textos');
 await expect(frame).toHaveCount(1);await expect(frame).toHaveAttribute('data-stale','true');await expect(link).toHaveAttribute('aria-disabled','true');
 await alert.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(alert.locator('strong')).toHaveText(/^No entra en la hoja: /);
 await observations.fill('Revisar escuadra antes del montaje.');await expect(alert).toHaveCount(0);await expect(link).toBeVisible();await expect(frame).not.toHaveAttribute('data-stale');
 await expect(preview.getByRole('group',{name:'Hojas'})).toHaveCount(0);
});

// The preview with several sheets is exercised in a synthetic harness bundled with the same esbuild options as the app.
async function harness(page:Page,folder:string){
 const outfile=resolve(folder,'harness/harness.js');
 await build({absWorkingDir:process.cwd(),entryPoints:['tests/offline/fixtures/a4-preview-harness.tsx'],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64'},logLevel:'silent'});
 errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://a4-harness.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script src="harness.js" defer></script></head><body><div id="root"></div></body></html>'});
  if(!['harness.js','harness.css'].includes(name))throw Error('Unexpected resource');
  await route.fulfill({body:await readFile(resolve(folder,'harness',name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://a4-harness.test/index.html');
 const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});
 return {preview,frame:preview.locator('iframe[title="PDF A4 generado"]'),sheet:preview.getByRole('combobox',{name:'Hoja visible',exact:true})};
}

test('UX A4: editar el proyecto no cambia la hoja navegada; solo el mueble activo la mueve',async({page},info)=>{
 const {preview,frame,sheet}=await harness(page,info.outputDir);
 await expect(sheet).toHaveValue('0');await expect(frame).toHaveAttribute('src',/#page=1&/);
 await page.getByRole('button',{name:'Activar segundo mueble',exact:true}).click();await expect(sheet).toHaveValue('1');await expect(frame).toHaveAttribute('src',/#page=2&/);
 await preview.getByRole('button',{name:'Anterior',exact:true}).click();await expect(sheet).toHaveValue('0');const first=await frame.getAttribute('src');
 await page.getByRole('button',{name:'Editar proyecto',exact:true}).click();
 // While the edit is composed the old sheet stays, and the unavailable actions are links marked aria-disabled with a visible reason.
 for(const name of ['Abrir PDF','Descargar vista previa']){const blocked=preview.getByRole('link',{name,exact:true});await expect(blocked).toHaveAttribute('aria-disabled','true');await expect(blocked).not.toHaveAttribute('href');await expect(blocked).toHaveAccessibleDescription('Esperá a que la hoja esté actualizada');}
 await expect(frame).not.toHaveAttribute('src',first!);await expect(frame).not.toHaveAttribute('data-stale');
 await expect(sheet).toHaveValue('0');await expect(frame).toHaveAttribute('src',/#page=1&/);await expect(preview.getByRole('link',{name:'Abrir PDF',exact:true})).toBeVisible();
});

test('UX A4: la hoja de otro proyecto no se muestra como versión anterior y su URL se libera',async({page},info)=>{
 const {preview,frame}=await harness(page,info.outputDir);
 await expect(preview.getByRole('link',{name:'Abrir PDF',exact:true})).toBeVisible();
 const old=(await frame.getAttribute('src'))!.split('#')[0];
 await page.getByRole('button',{name:'Otro proyecto',exact:true}).click();
 await expect(frame).toHaveCount(0);await expect(preview.getByRole('status').filter({hasText:'Componiendo la hoja'})).toBeVisible();
 expect(await page.evaluate(url=>fetch(url).then(()=>true,()=>false),old)).toBe(false);
 await expect(frame).toHaveCount(1);await expect(frame).not.toHaveAttribute('src',new RegExp(`^${old}`));
});
