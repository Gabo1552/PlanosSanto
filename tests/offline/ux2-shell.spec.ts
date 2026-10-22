import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Shell UX, segunda ronda: avisos a la vista y con tono, recuperación de errores, foco tras operaciones, riel y
// herramientas con aria-disabled, ayuda de atajos y diagnóstico, estados vacíos, plurales y contraste de foco.
// Usa el controlador Ruby sintético de nombres; no es SketchUp nativo ni un modelo de cliente.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
// `held` retiene el diagnóstico hasta que la prueba llama a `release`: sin esperas fijas ni carreras con el reloj real.
let held:Promise<void>|undefined,release=()=>{},hang=false,child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string,viewport={width:1500,height:1100}){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];held=undefined;hang=false;await page.setViewportSize(viewport);
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  if(action==='order_references')return {version:1,id:msg.id,result:null,error:'Guardá primero el borrador revisado del pedido.'};
  if(action==='diagnostic'&&hang)return new Promise(()=>{});
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
async function generated(page:Page){await page.keyboard.press('Alt+3');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();}
async function inViewport(page:Page,selector:string){return await page.locator(selector).first().evaluate(node=>{const box=node.getBoundingClientRect();return box.height>0&&box.top>=0&&box.bottom<=window.innerHeight;});}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('a 1366×768 los avisos de guardar y de bloqueo quedan a la vista aunque se haya hecho scroll',async({page},info)=>{
 await boot(page,info.outputDir,{width:1366,height:768});await generated(page);
 await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().uncheck();
 await page.locator('.ux-module-heading').click();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(300);
 await page.keyboard.press('Control+Shift+E');const alert=page.getByRole('alert');await expect(alert).toContainText('No se puede exportar. Cambiaste los muebles');
 expect(await inViewport(page,'.ux-notices .ux-notice.error')).toBe(true);
 await alert.getByRole('button',{name:'Cerrar aviso',exact:true}).click();await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().check();
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.locator('.notes-panel .hint').first().click();await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(1);
 await expect(page.getByRole('status').filter({hasText:'Guía guardada'})).toBeVisible();expect(await inViewport(page,'.ux-notices .ux-notice')).toBe(true);
});

test('un guardado sin SKP es una advertencia ámbar que no se cierra sola y ofrece Guardar SKP',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Guardar también el archivo SKP'}).uncheck();await page.getByText('Opciones de guardado',{exact:true}).click();
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect.poll(()=>count('save')).toBe(1);expect(calls.filter(call=>call.action==='save')[0].data.saveFile).toBe(false);
 const warning=page.getByRole('status').filter({hasText:'Falta guardar el archivo .skp'});await expect(warning).toHaveClass(/warning/);await expect(warning).toHaveAttribute('data-tone','warning');
 await page.mouse.move(5,5);await page.clock.fastForward(7000);await expect(warning).toBeVisible();await page.clock.fastForward(21000);await expect(warning).toBeVisible();
 await page.getByText(/^Último aviso/).click();await expect(page.locator('.ux-last-notice p')).toContainText('Falta guardar el archivo .skp');
 await warning.getByRole('button',{name:'Guardar SKP',exact:true}).click();await expect.poll(()=>count('save')).toBe(2);expect(calls.filter(call=>call.action==='save')[1].data.saveFile).toBe(true);
});

test('un cuelgue de SketchUp ofrece Analizar de nuevo; el foco vuelve al botón que inició la operación',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 const saveButton=page.getByRole('button',{name:'Guardar guía',exact:true});await saveButton.focus();await page.keyboard.press('Enter');await expect.poll(()=>count('save')).toBe(1);
 await expect(page.locator('.ux-busy')).toHaveCount(0);await expect(saveButton).toBeFocused();
 await page.getByRole('button',{name:'Ayuda: Atajos y diagnóstico',exact:true}).click();hang=true;await page.getByRole('button',{name:'Ver diagnóstico',exact:true}).click();await expect(page.locator('.ux-busy')).toBeVisible();
 await page.clock.fastForward(121_000);const alert=page.getByRole('alert');await expect(alert).toContainText('SketchUp no respondió');
 hang=false;const scans=count('scan');await alert.getByRole('button',{name:'Analizar de nuevo',exact:true}).click();await expect.poll(()=>count('scan')).toBe(scans+1);
});

test('el riel conserva el foco durante una operación y explica el bloqueo al tabular o hacer clic',async({page},info)=>{
 await boot(page,info.outputDir);await page.keyboard.press('Alt+3');const furniture=rail(page,'Muebles');
 await page.getByRole('button',{name:'Ayuda: Atajos y diagnóstico',exact:true}).click();held=new Promise(done=>{release=done;});await page.getByRole('button',{name:'Ver diagnóstico',exact:true}).click();
 await furniture.focus();await expect(furniture).toHaveAttribute('aria-disabled','true');await expect(furniture).toBeFocused();await expect(furniture).toHaveAccessibleDescription(/Esperá a que termine «Comprobando instalación»/);
 await rail(page,'Maderera').click({force:true});await expect(page.getByRole('alert')).toContainText('Esperá a que termine la operación actual');await expect(rail(page,'Muebles')).toHaveAttribute('aria-current','page');await furniture.focus();
 release();await expect(page.locator('.ux-busy')).toHaveCount(0);await expect(furniture).not.toHaveAttribute('aria-disabled','true');await expect(furniture).toBeFocused();
});

test('ayuda global: ? abre atajos y diagnóstico desde cualquier módulo, y el diagnóstico se copia',async({page},info)=>{
 await boot(page,info.outputDir);await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://planos-santo.test'});
 await page.keyboard.press('Alt+4');await expect(rail(page,'Maderera')).toHaveAttribute('aria-current','page');
 await page.locator('.ux-module-heading').click();await page.keyboard.press('Shift+?');const help=page.getByRole('dialog',{name:'Atajos y diagnóstico'});await expect(help).toBeVisible();
 const shortcuts=help.locator('.ux-shortcuts');for(const [keys,label] of [['Alt+1','Inicio'],['Alt+2','Materiales'],['Alt+3','Muebles'],['Alt+4','Maderera'],['Alt+5','Planos A4'],['Ctrl+S','Guardar guía'],['Ctrl+Shift+E','Exportar PDF A4'],['Escape','Cancelar o cerrar']])await expect(shortcuts.locator('div').filter({hasText:keys}).filter({hasText:label}).first()).toBeVisible();
 await expect(help).toContainText('No envía tu modelo.');await help.getByRole('button',{name:'Ver diagnóstico',exact:true}).click();await expect(help.locator('.ux-diagnostic')).toContainText('extensionVersion');
 await help.getByRole('button',{name:'Copiar diagnóstico',exact:true}).click();await expect(help.getByRole('status')).toContainText(/Diagnóstico copiado|quedó seleccionado/);
 await page.keyboard.press('Escape');await expect(help).toHaveCount(0);await expect(page.getByRole('button',{name:'Ayuda: Atajos y diagnóstico',exact:true})).toBeFocused();
 await page.keyboard.press('Alt+3');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('');await name.pressSequentially('Lateral?');await expect(name).toHaveValue('Lateral?');await expect(help).toHaveCount(0);
 await expect(page.locator('#furniture-chooser')).not.toContainText('Ver diagnóstico');
});

test('un solo h1, estados vacíos con el siguiente paso y plurales correctos',async({page},info)=>{
 await boot(page,info.outputDir);
 const steps=page.locator('.ux-next-steps strong');await expect(steps).toHaveText(['1. Materiales','2. Muebles','3. Maderera','4. Planos A4']);
 await page.keyboard.press('Alt+5');await expect(page.locator('h1')).toHaveCount(1);await expect(page.getByRole('heading',{level:2,name:'Primero generá las guías en Muebles'})).toBeVisible();
 await page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first().uncheck();
 await page.getByRole('button',{name:'Generar 1 guía',exact:true}).click();await expect(page.locator('.a4-sheet-preview')).toBeVisible();await expect(rail(page,'Planos A4')).toHaveAttribute('aria-current','page');
 await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('.guide-heading h2')).toBeVisible();
 await expect(page.locator('.furniture-tabs small').first()).toHaveText(/^\d+ piezas?$/);await expect(page.locator('.tree small').first()).not.toContainText(/^1 piezas/);
 await page.keyboard.press('Alt+1');await expect(page.locator('.ux-current-job p')).toContainText(/^1 mueble · \d+ piezas? en revisión$/);
});

test('el foco vuelve a Aplicar renombrado, las advertencias no se releen enteras y el foco del riel se ve',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 const batch=page.getByRole('button',{name:'Aplicar renombrado',exact:true});await batch.click();await expect(page.getByRole('dialog',{name:'Aplicar renombrado'})).toBeVisible();
 // El diálogo aparece antes de que termine «Revisando lote de nombres…»; mientras dura, Escape no lo cierra (a propósito).
 await expect(page.locator('.ux-busy')).toHaveCount(0);await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'Aplicar renombrado'})).toHaveCount(0);await expect(batch).toBeFocused();
 const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('');await expect(page.locator('.warnings').first()).toBeVisible();
 await expect(page.locator('.warnings')).not.toHaveAttribute('role','status');await expect(page.locator('.sr-only[role=status]').filter({hasText:/advertencias? en la hoja/})).toHaveCount(1);
 await name.fill('Lateral');
 // Alt+3 lleva el foco al título del módulo en un requestAnimationFrame: se espera ese foco para que no le gane al del riel.
 await page.keyboard.press('Alt+3');await expect(page.locator('.ux-module-heading')).toBeFocused();const current=rail(page,'Muebles');await current.focus();await expect(current).toBeFocused();
 const style=await current.evaluate(node=>{const css=getComputedStyle(node);return {outline:css.outlineColor,style:css.outlineStyle,background:getComputedStyle(node.closest('nav')!).backgroundColor};});
 expect(style.style).toBe('solid');expect(style.outline).not.toBe(style.background);
});

test('si el pedido no está listo la hoja A4 se ve igual, sin materiales, con un aviso que lleva al pedido',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:/Incluir materiales y cantos/}).check();await page.getByText('Opciones de guardado',{exact:true}).click();
 await page.keyboard.press('Alt+5');const notice=page.locator('.ux-sheet-notice');await expect(notice).toContainText('Hoja sin materiales');await expect(notice).toContainText('Guardá primero el borrador revisado del pedido.');
 await expect(page.locator('.a4-sheet-preview')).not.toContainText('Guardá primero el borrador revisado del pedido.');await expect(page.locator('.a4-sheet-preview nav[aria-label="Acciones de vista previa"]')).toBeVisible({timeout:20000});
 await notice.getByRole('button',{name:'Abrir Biblioteca y pedidos',exact:true}).click();await expect(page.getByRole('dialog',{name:'Biblioteca y pedidos'})).toBeVisible();
});

test('con la guía sin guardar, Pintar y Pintura avanzada siguen en el orden de tabulación y explican el bloqueo',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Nombre pendiente');
 for(const name of ['Pintar placas y cantos','Pintura avanzada']){const button=page.getByRole('button',{name,exact:true});await expect(button).toHaveAttribute('aria-disabled','true');await expect(button).not.toHaveAttribute('disabled','');await expect(button).toHaveAccessibleDescription(/Guardá la guía antes de pintar/);}
 const paint=page.getByRole('button',{name:'Pintar placas y cantos',exact:true});await paint.focus();await expect(paint).toBeFocused();
 await paint.click({force:true});await expect(page.getByRole('alert')).toContainText('No se puede pintar. Guardá la guía antes de pintar.');await expect(page.getByRole('dialog',{name:'Pintar placas y cantos'})).toHaveCount(0);
 await page.getByRole('alert').getByRole('button',{name:'Cerrar aviso',exact:true}).click();await paint.focus();await page.keyboard.press('Control+s');await expect.poll(()=>count('save')).toBe(1);
 await expect(page.locator('.ux-busy')).toHaveCount(0);await expect(paint).not.toHaveAttribute('aria-disabled','true');await expect(paint).toBeFocused();
});

test('una advertencia sticky no se arrastra a otra sección',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Guardar también el archivo SKP'}).uncheck();await page.getByText('Opciones de guardado',{exact:true}).click();
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();const warning=page.getByRole('status').filter({hasText:'Falta guardar el archivo .skp'});await expect(warning).toBeVisible();
 await page.keyboard.press('Alt+4');await expect(rail(page,'Maderera')).toHaveAttribute('aria-current','page');await expect(warning).toHaveCount(0);
 await page.getByText(/^Último aviso/).click();await expect(page.locator('.ux-last-notice p')).toContainText('Falta guardar el archivo .skp');
});
