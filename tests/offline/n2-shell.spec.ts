import {toggleOptions,openMaterialTools} from './fixtures/modules';
import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';


// Shell, ronda nocturna 2: pendientes de la revisión de la ronda 2 (foco tras confirmar o cancelar sin opener,
// atajo ? desde casillas, avisos que no cruzan de sección, Pintar con aria-disabled) y auditoría axe-core
// (serious/critical) de las vistas principales. Usa el controlador Ruby sintético de nombres; no es SketchUp nativo.
// Usa el controlador Ruby sintético de nombres; no es SketchUp nativo ni un modelo de cliente.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let slow=false,hang=false,child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,calls:{action:string;data:Record<string,unknown>}[],errors:string[];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string,viewport={width:1500,height:1100}){
 await mkdir(folder,{recursive:true});pending=new Map();calls=[];errors=[];slow=false;hang=false;await page.setViewportSize(viewport);
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('shellRequest',async(raw:string)=>{const msg=JSON.parse(raw),{action,data}=msg;calls.push({action,data});
  if(action==='ui_ready')return {version:1,id:msg.id,result:{},error:null};
  if(action==='ui_loading'||action==='quick_action_ack')return {version:1,id:msg.id,result:true,error:null};
  if(action==='order_references')return {version:1,id:msg.id,result:null,error:'Guardá primero el borrador revisado del pedido.'};
  if(action==='diagnostic'&&hang)return new Promise(()=>{});
  if(action==='diagnostic'&&slow){await new Promise(done=>setTimeout(done,2500));}
  return native(raw);
 });
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.shellRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.clock.install();await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect.poll(()=>calls.filter(call=>call.action==='ui_ready').length).toBe(1);
}
const rail=(page:Page,name:string)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name,exact:true});
async function generated(page:Page){await page.keyboard.press('Alt+3');await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});
const axeSource=require.resolve('axe-core/axe.min.js');
type AxeResult={violations:{id:string;impact:string;help:string;nodes:{target:string[];failureSummary:string}[]}[]};
// Solo reglas WCAG 2.x A/AA; se reportan las violaciones serious y critical con el nodo y el resumen de axe.
async function axe(page:Page,label:string,exclude:string[][]=[]){
 if(!await page.evaluate(()=>'axe' in window))await page.evaluate(await readFile(axeSource,'utf8'));
 const found=await page.evaluate(async(exclude)=>{const result:AxeResult=await (window as unknown as {axe:{run:(context:unknown,options:unknown)=>Promise<AxeResult>}}).axe.run({include:[['body']],exclude},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  return result.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>`${v.impact} ${v.id}: ${v.nodes.map(n=>n.target.join(' ')+' | '+n.failureSummary.replace(/\s+/g,' ')).join(' ;; ')}`);},exclude);
 return found.map(line=>`[${label}] ${line}`);
}
// Contraste no textual (WCAG 1.4.11): borde de un campo o contorno de foco contra el fondo efectivo del contenedor.
async function boundaryRatio(page:Page,selector:string,property:'borderTopColor'|'outlineColor'){
 return await page.locator(selector).first().evaluate((node,property)=>{
  const rgb=(c:string)=>c.match(/[\d.]+/g)!.map(Number);const lum=(c:number[])=>{const f=(v:number)=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
  let parent=node.parentElement,bg=[255,255,255];while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if((c[3]??1)>=1){bg=c;break;}parent=parent.parentElement;}
  const [a,b]=[lum(rgb(getComputedStyle(node)[property])),lum(bg)].sort((x,y)=>y-x);return (a+.05)/(b+.05);
 },property);
}

test('axe no encuentra violaciones serious ni critical en las vistas del shell',async({page},info)=>{
 await boot(page,info.outputDir);const found:string[]=[];
 found.push(...await axe(page,'Inicio'));
 await page.keyboard.press('Alt+2');await expect(rail(page,'Materiales')).toHaveAttribute('aria-current','page');found.push(...await axe(page,'Materiales'));
 await expect(page.getByRole('navigation',{name:'Filtrar biblioteca'}).getByRole('button',{name:'Por completar',exact:true})).toHaveAccessibleDescription(/^\d+ material(es)?$/);await expect(page.getByRole('group',{name:'Materiales visuales del taller'})).toBeAttached();
 await page.keyboard.press('Alt+4');await expect(rail(page,'Maderera')).toHaveAttribute('aria-current','page');found.push(...await axe(page,'Maderera'));
 await page.keyboard.press('Alt+5');await expect(page.getByRole('heading',{level:2,name:'Primero generá las guías en Muebles'})).toBeVisible();found.push(...await axe(page,'Planos A4 vacío'));
 await generated(page);found.push(...await axe(page,'Muebles'));
 await page.getByLabel('Nombre P01',{exact:true}).fill('');await expect(page.locator('.warnings').first()).toBeVisible();found.push(...await axe(page,'Muebles con advertencias'));
 await page.evaluate(()=>window.dispatchEvent(new Event('planos-santo-document-invalidated')));await page.keyboard.press('Control+Shift+E');await expect(page.getByRole('alert')).toBeVisible();found.push(...await axe(page,'Aviso de error'));
 await page.getByRole('button',{name:/^Generar guías/}).first().click();await expect(page.locator('.ux-confirm')).toBeVisible();found.push(...await axe(page,'Confirmación'));
 await page.getByRole('button',{name:'Seguir editando',exact:true}).click();
 await page.keyboard.press('Alt+5');await expect(page.locator('.a4-sheet-preview')).toBeVisible();found.push(...await axe(page,'Planos A4'));
 await page.locator('.ux-module-heading').click();await page.keyboard.press('Shift+?');await expect(page.getByRole('dialog',{name:'Atajos y diagnóstico'})).toBeVisible();found.push(...await axe(page,'Ayuda'));
 expect(found).toEqual([]);
});

test('bordes de campos y contornos de foco llegan a 3:1 contra su fondo',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 expect(await boundaryRatio(page,'input[aria-label="Nombre P01"]','borderTopColor')).toBeGreaterThanOrEqual(3);
 expect(await boundaryRatio(page,'.search-field','borderTopColor')).toBeGreaterThanOrEqual(3);
 for(const target of [rail(page,'Muebles'),page.getByRole('button',{name:'Guardar guía',exact:true})]){
  await page.keyboard.press('Shift');await target.focus();expect(await target.evaluate(node=>node.matches(':focus-visible')&&getComputedStyle(node).outlineStyle!=='none')).toBe(true);
  expect(await target.evaluate(node=>{node.dataset.probe='1';return true;})).toBe(true);expect(await boundaryRatio(page,'[data-probe="1"]','outlineColor')).toBeGreaterThanOrEqual(3);await target.evaluate(node=>{delete node.dataset.probe;});
 }
 await page.locator('.ux-module-heading').click();await page.keyboard.press('Shift+?');await expect(page.locator('.help-popover')).toBeFocused();
 expect(await boundaryRatio(page,'.help-popover','outlineColor')).toBeGreaterThanOrEqual(3);
});

test('cancelar o confirmar sin un opener utilizable deja el foco en el título de la sección, nunca en body',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Nombre pendiente');
 const openWithoutFocus=()=>page.evaluate(()=>{(document.activeElement as HTMLElement|null)?.blur();Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button=>/^Generar guías/.test(button.textContent||''))!.click();});
 await openWithoutFocus();const confirm=page.locator('.ux-confirm');await expect(confirm).toBeVisible();
 await page.getByRole('button',{name:'Seguir editando',exact:true}).click();await expect(confirm).toHaveCount(0);
 await expect(page.locator('.ux-module-heading')).toBeFocused();expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(false);
 await openWithoutFocus();await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'Descartar y regenerar',exact:true}).click();
 await expect(page.locator('.ux-busy')).toHaveCount(0);await expect(page.locator('.ux-module-heading')).toBeFocused();
 await expect(page.getByLabel('Nombre P01',{exact:true})).not.toHaveValue('Nombre pendiente');
});

test('cancelar con Escape devuelve el foco al botón que abrió la confirmación',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Nombre pendiente');
 const opener=page.getByRole('button',{name:/^Generar guías/}).first();await opener.focus();await page.keyboard.press('Enter');
 await expect(page.locator('.ux-confirm')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.ux-confirm')).toHaveCount(0);await expect(opener).toBeFocused();
});

test('? abre la ayuda con el foco en una casilla, pero no al escribir en un campo de texto',async({page},info)=>{
 await boot(page,info.outputDir);const help=page.getByRole('dialog',{name:'Atajos y diagnóstico'});
 const box=page.getByRole('checkbox',{name:'Otro mueble',exact:false}).first();await box.focus();const checked=await box.isChecked();
 await page.keyboard.press('Shift+?');await expect(help).toBeVisible();await expect(box).toBeChecked({checked});
 await page.keyboard.press('Escape');await expect(help).toHaveCount(0);
 await generated(page);const name=page.getByLabel('Nombre P01',{exact:true});await name.fill('');await name.pressSequentially('¿Lateral?');await expect(name).toHaveValue('¿Lateral?');await expect(help).toHaveCount(0);
});

test('una advertencia no sobrevive al cambiar de sección con el riel',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);
 await toggleOptions(page);await page.getByRole('checkbox',{name:'Guardar también el archivo SKP'}).uncheck();await toggleOptions(page);
 await page.getByRole('button',{name:'Guardar guía',exact:true}).click();const warning=page.locator('.ux-notice.warning');await expect(warning).toBeVisible();
 await rail(page,'Maderera').click();await expect(rail(page,'Maderera')).toHaveAttribute('aria-current','page');await expect(warning).toHaveCount(0);
 await rail(page,'Muebles').click();await expect(warning).toHaveCount(0);
});

test('con la guía sin guardar, Pintura avanzada sigue disponible y abre la paleta (pintar no depende de la guía)',async({page},info)=>{
 await boot(page,info.outputDir);await generated(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Nombre pendiente');
 await openMaterialTools(page);
 const advanced=page.getByRole('button',{name:'Ajustes avanzados de pintura',exact:true});await expect(advanced).not.toHaveAttribute('aria-disabled','true');
 await advanced.focus();await page.keyboard.press('Enter');await expect(page.locator('.smart-paint-palette')).toHaveCount(1);
 await expect(page.getByRole('alert').filter({hasText:'No se puede pintar'})).toHaveCount(0);
});
