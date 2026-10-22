import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {QuickIntent} from '../../sketchup_offline/ui/quickActions';

// Shell UX: atajos, avisos con acción, pendientes del riel, motivos de bloqueo, progreso y confirmación integrada.
// Usa el controlador Ruby sintético de nombres; no es SketchUp nativo ni un modelo de cliente.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
// `held` retiene el diagnóstico hasta que la prueba llama a `release`: sin esperas fijas ni carreras con el reloj real.
let held:Promise<void>|undefined,release=()=>{},child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];held=undefined;
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  if(action==='diagnostic'&&held)await held;
  return native(raw);
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.shellRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.clock.install();await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
const count=(action:string)=>calls.filter(call=>call.action===action).length;
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
async function quick(page:Page,intent:QuickIntent){await page.evaluate(intent=>window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:intent})),intent);}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('atajos: Alt+número cambia de módulo y Ctrl+S guarda con las mismas protecciones que el botón',async({page},info)=>{
 await boot(page,info.outputDir);
 await expect(rail(page,'Muebles')).toHaveAttribute('aria-keyshortcuts','Alt+3');await expect(rail(page,'Muebles')).toHaveAttribute('title',/Alt\+3/);
 await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toHaveAttribute('aria-keyshortcuts','Control+S');
 await page.keyboard.press('Alt+4');await expect(rail(page,'Maderera')).toHaveAttribute('aria-current','page');
 await page.keyboard.press('Alt+1');await expect(rail(page,'Inicio')).toHaveAttribute('aria-current','page');
 await page.keyboard.press('Control+s');await expect(page.getByRole('alert')).toContainText('No se puede guardar. Primero generá las guías en Muebles.');expect(count('save')).toBe(0);
 await page.keyboard.press('Control+Shift+E');await expect(page.getByRole('alert')).toContainText('No se puede exportar');expect(count('pdf')).toBe(0);
 await page.keyboard.press('Alt+3');await expect(rail(page,'Muebles')).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('Lateral atajo');
 await expect(rail(page,'Muebles').locator('.ux-rail-badge')).toHaveCount(1);await expect(rail(page,'Muebles')).toHaveAttribute('title',/Guía sin guardar/);await expect(rail(page,'Muebles')).toHaveAccessibleDescription('Guía sin guardar');
 await expect(rail(page,'Planos A4').locator('.ux-rail-badge')).toHaveCount(1);await expect(rail(page,'Inicio').locator('.ux-rail-badge')).toHaveCount(0);
 await name.focus();await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(1);
 await expect(page.getByRole('status').filter({hasText:'Guía guardada'})).toBeVisible();await expect(rail(page,'Muebles')).not.toHaveAttribute('title',/Guía sin guardar/);});

test('motivo visible del bloqueo de exportar y avisos que se cierran o traen la acción para resolverlos',async({page},info)=>{
 await boot(page,info.outputDir);const exportButton=page.getByRole('button',{name:'Exportar PDF A4',exact:true});
 await expect(exportButton).toBeDisabled();await expect(exportButton).toHaveAccessibleDescription('Primero generá las guías en Muebles');await expect(page.locator('#export-block-reason')).toBeVisible();
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();await expect(exportButton).toBeEnabled();await expect(page.locator('#export-block-reason')).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().uncheck();await expect(exportButton).toBeDisabled();await expect(exportButton).toHaveAccessibleDescription('Cambiaste los muebles; pulsá Generar guías');
 await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().check();await expect(exportButton).toBeEnabled();
 // Sin cambios en la guía, el análisis y las guías se rehacen solos (como OpenCutList): no hace falta «Reanalizar».
 const scansBefore=count('scan'),generatesBefore=count('generate');
 await page.evaluate(()=>window.dispatchEvent(new Event('planos-santo-document-invalidated')));
 await expect.poll(()=>count('scan')).toBe(scansBefore+1);await expect.poll(()=>count('generate')).toBe(generatesBefore+1);
 await expect(exportButton).toBeEnabled();await expect(rail(page,'Muebles')).not.toHaveAttribute('title',/Análisis desactualizado/);
 // Con cambios sin guardar no se reanaliza solo (los perdería): queda el aviso y exportar sigue bloqueado.
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral editado');
 await page.evaluate(()=>window.dispatchEvent(new Event('planos-santo-document-invalidated')));
 await expect(exportButton).toHaveAccessibleDescription('El análisis está desactualizado; volvé a analizar y generar las guías');await expect(rail(page,'Muebles')).toHaveAttribute('title',/Análisis desactualizado/);
 await page.keyboard.press('Control+Shift+E');const alert=page.getByRole('alert');await expect(alert).toContainText('No se puede exportar. El análisis está desactualizado;');expect(count('pdf')).toBe(0);
 await alert.getByRole('button',{name:'Cerrar aviso',exact:true}).click();await expect(alert).toHaveCount(0);
 const scans=count('scan');await quick(page,{sequence:1,action:'guides',scanRequired:true,refreshWarning:'El modelo cambió. Volvé a analizar antes de continuar.'});
 await expect(alert).toContainText('El modelo cambió');await alert.getByRole('button',{name:'Analizar de nuevo',exact:true}).click();
 const confirm=page.getByRole('alertdialog',{name:'Descartar cambios y volver a analizar'});if(await confirm.count())await confirm.getByRole('button',{name:'Descartar y analizar',exact:true}).click();await expect.poll(()=>count('scan')).toBe(scans+1);await expect(alert).toHaveCount(0);
});

test('los avisos de éxito se van solos a los 20 s salvo con el puntero encima; los errores quedan',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 const done=page.getByRole('status').filter({hasText:'Guías generadas'});await expect(done).toBeVisible();await page.clock.fastForward(8000);await expect(done).toBeVisible();await done.hover();await page.clock.fastForward(21000);await expect(done).toBeVisible();
 await page.locator('.ux-module-heading').hover();await page.clock.fastForward(21000);await expect(done).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().uncheck();await page.locator('.ux-module-heading').click();await page.keyboard.press('Control+Shift+E');
 const alert=page.getByRole('alert');await expect(alert).toContainText('No se puede exportar. Cambiaste los muebles; pulsá Generar guías.');await page.clock.fastForward(21000);await expect(alert).toBeVisible();expect(count('pdf')).toBe(0);
});

test('confirmación integrada al descartar cambios: Escape conserva, el botón nombra la acción y el progreso muestra segundos',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('Nombre a conservar');
 const reanalyze=page.getByRole('button',{name:'Volver a analizar',exact:true});const scans=count('scan');await reanalyze.click();
 const confirm=page.getByRole('alertdialog',{name:'Descartar cambios y volver a analizar'});await expect(confirm).toBeVisible();await expect(confirm).toContainText('Se pierden los nombres, notas y ajustes de vista que no guardaste en 2 muebles');
 await expect(confirm.getByRole('button',{name:'Seguir editando',exact:true})).toBeFocused();await page.keyboard.press('Control+s');expect(count('save')).toBe(0);
 await page.keyboard.press('Escape');await expect(confirm).toHaveCount(0);await expect(reanalyze).toBeFocused();await expect(name).toHaveValue('Nombre a conservar');expect(count('scan')).toBe(scans);
 await reanalyze.click();await confirm.getByRole('button',{name:'Descartar y analizar',exact:true}).click();await expect.poll(()=>count('scan')).toBe(scans+1);await expect(confirm).toHaveCount(0);await expect(reanalyze).toBeFocused();
 held=new Promise(done=>{release=done;});await page.getByRole('button',{name:'Ayuda: Atajos y diagnóstico',exact:true}).click();await page.getByRole('button',{name:'Ver diagnóstico',exact:true}).click();
 const busy=page.locator('.ux-busy');await expect(busy).toHaveAttribute('role','status');await expect(busy).toContainText('Comprobando instalación…');await expect(busy.locator('.ux-spinner')).toHaveCount(1);await expect(busy).toContainText(/· [23] s/,{timeout:4000});
 await expect(rail(page,'Muebles')).toBeDisabled();await expect(rail(page,'Muebles')).toHaveAttribute('title',/Esperá a que termine «Comprobando instalación»/);release();await expect(busy).toHaveCount(0);
});

// Regresión: noticeHold se reinicia al quitar el aviso. Chromium suele despachar blur/pointerleave al nodo quitado,
// así que la prueba fija el comportamiento esperado en ambos caminos (puntero y foco) sin depender de eso.
test('un aviso de éxito que desaparece con el puntero o el foco encima no deja trabados los avisos siguientes',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
 const name=page.getByLabel('Nombre P01',{exact:true}),saved=page.getByRole('status').filter({hasText:'Guía guardada'});
 const done=page.getByRole('status').filter({hasText:'Guías generadas'});await expect(done).toBeVisible();await done.hover();
 await done.evaluate(node=>node.querySelector<HTMLButtonElement>('.ux-notice-close')?.click());await expect(done).toHaveCount(0);await page.mouse.move(5,5);
 await name.fill('Lateral puntero');await name.focus();await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(1);
 await expect(saved).toBeVisible();await saved.getByRole('button',{name:'Cerrar aviso',exact:true}).focus();await page.keyboard.press('Enter');await expect(saved).toHaveCount(0);
 await name.fill('Lateral foco');await name.focus();await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(2);
 await expect(saved).toBeVisible();await page.clock.fastForward(21000);await expect(saved).toBeVisible();await expect(saved).toHaveClass(/warning/);
 await saved.getByRole('button',{name:'Cerrar aviso',exact:true}).click();await expect(saved).toHaveCount(0);await page.mouse.move(5,5);
 await quick(page,{sequence:1,action:'home',message:'Aviso informativo de prueba'});const notice=page.getByRole('status').filter({hasText:'Aviso informativo de prueba'});await expect(notice).toBeVisible();await page.clock.fastForward(21000);await expect(notice).toHaveCount(0);
});
