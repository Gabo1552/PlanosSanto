import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
// UX2 nombres: synthetic Ruby controllers (names and recognition doubles) drive the real
// guide/name engine and the offline UI; never SketchUp's desktop UI or a private SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
function raw(message:string):Promise<Reply>{return new Promise(resolve=>{const msg=JSON.parse(message);calls.push(msg);pending.set(msg.id,resolve);child.stdin.write(message+'\n');});}
async function inspect(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return reply.result as {names:Record<string,string>;operations:unknown[][]};}
const count=(action:string)=>calls.filter(call=>call.action===action).length;
async function boot(page:Page,folder:string,driver:'names'|'recognition'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,[`sketchup_offline/test/${driver}_bridge_driver.rb`,folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('ux2NamesRequest',async(message:string)=>raw(message));
 await page.addInitScript({content:'window.sketchup={request(raw){window.ux2NamesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected asset');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 const generate=page.getByRole('button',{name:'Generar guías (2)',exact:true});await expect(generate).toBeEnabled();await generate.click();
}
async function modules(page:Page,work=''){if(work)await page.getByLabel('Abreviatura de la obra').fill(work);await page.getByLabel('Módulo de este mueble').fill('M01');await page.getByRole('button',{name:'Otro mueble 1 pieza',exact:true}).click();await page.getByLabel('Módulo de este mueble').fill('M02');}
async function openProposals(page:Page){await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog).toBeVisible();return dialog;}
async function openBatch(page:Page){await page.getByRole('button',{name:'Aplicar renombrado',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Aplicar renombrado',exact:true});await expect(dialog).toBeVisible();return dialog;}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('sugerencias: nombres accesibles iguales al rótulo, código compuesto, fila resaltada sin aria-selected y nombre final',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');await modules(page,'VF');await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();
 const dialog=await openProposals(page);
 // WCAG 2.5.3: the accessible name is exactly the visible label (voice control says what it sees).
 await expect(dialog.getByRole('combobox',{name:'Vertical local',exact:true})).toBeVisible();await expect(dialog.getByRole('combobox',{name:'Frente local',exact:true})).toBeVisible();
 const confirmed=dialog.getByRole('checkbox',{name:'Confirmé frente y vertical en el dibujo',exact:true});await expect(confirmed).toBeFocused();
 await expect(dialog.locator('[aria-selected]')).toHaveCount(0);
 await dialog.getByRole('button',{name:'M01·P02 · ×1',exact:true}).click();const current=dialog.locator('tr[data-current="true"]');await expect(current).toHaveCount(1);await expect(current).toContainText('M01·P02');await expect(current.getByText('(pieza resaltada)',{exact:true})).toHaveClass('sr-only');
 const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true});await p01.fill('Estante medio');
 const hint=await p01.getAttribute('aria-describedby');expect(hint).toBeTruthy();await expect(dialog.locator(`[id="${hint}"]`)).toHaveText('Quedará: VF M01 Estante medio');
 await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).toBeChecked();
 // TC-05: a single primary action, the same close pattern as the batch and an error style.
 const save=dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true});await expect(save).toHaveClass(/primary/);
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(count('save')).toBe(0);
 const again=await openProposals(page);await again.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(again).toHaveCount(0);
});

test('sugerencias: sin obra se aclara que no hay prefijo',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page);const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true});await p01.fill('Lateral');
 await expect(dialog.locator(`[id="${await p01.getAttribute('aria-describedby')}"]`)).toHaveText('Quedará: Lateral (sin prefijo de obra)');
});

test('sugerencias: «no ambiguas» suma sin pisar lo editado y reorientar conserva las ediciones manuales',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page),confirmed=dialog.getByRole('checkbox',{name:'Confirmé frente y vertical en el dibujo',exact:true});
 await confirmed.check();const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true});await p01.fill('Editado a mano');
 await dialog.getByRole('button',{name:'Seleccionar propuestas no ambiguas',exact:true}).click();
 await expect(p01).toHaveValue('Editado a mano');await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).toBeChecked();
 const notice=dialog.locator('.naming-notice');await expect(notice).toHaveAttribute('role','status');await expect(notice).toHaveText(/(Se sum(ó|aron) .* geométricas?; lo ya elegido o editado se conservó\.|No había propuestas geométricas nuevas para sumar\.)/);
 // Untick and tick the confirmation: the manual edit survives, automatic proposals are recalculated.
 await confirmed.uncheck();await expect(p01).toHaveValue('Editado a mano');await expect(notice).toContainText('Se conservó 1 nombre editado');
 await confirmed.check();await expect(p01).toHaveValue('Editado a mano');await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).toBeChecked();
 await dialog.getByRole('combobox',{name:'Frente local',exact:true}).selectOption('0,1');await expect(p01).toHaveValue('Editado a mano');
 await dialog.getByRole('checkbox',{name:'Incluir piezas que ya tienen nombre o revisión guardada'}).check();await expect(p01).toHaveValue('Editado a mano');
 expect(count('save')).toBe(0);
});

test('lote: agrupado por mueble, casilla de tres estados, plegado y código compuesto en filas y bloqueos',async({page},info)=>{
 await boot(page,info.outputDir,'names');await modules(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Base del otro');
 await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral nuevo');await page.getByLabel('Nombre P02',{exact:true}).fill('Base nueva');
 const before=await inspect(),dialog=await openBatch(page);await expect(dialog.getByRole('status')).toHaveText('Selección verificada');
 const m1p1=dialog.getByRole('checkbox',{name:'Incluir renombrado M01·P01',exact:true}),m1p2=dialog.getByRole('checkbox',{name:'Incluir renombrado M01·P02',exact:true}),m2p1=dialog.getByRole('checkbox',{name:'Incluir renombrado M02·P01',exact:true});
 await expect(m1p1).toBeChecked();await expect(m2p1).toBeChecked();await expect(dialog.locator('tr[data-batch-row="1/11"]')).toContainText('M01·P01');
 await expect(dialog.getByRole('rowheader')).toHaveCount(2);await expect(dialog).toContainText('Muebles: 2 de 2 con cambios incluidos');
 const group=dialog.getByRole('checkbox',{name:'Incluir los cambios de Bajo Mesada (M01)',exact:true});await expect(group).toBeChecked();
 await m1p2.uncheck();expect(await group.evaluate(el=>(el as HTMLInputElement).indeterminate)).toBe(true);await expect(dialog.getByRole('rowheader').first()).toContainText('1 de 2 incluidos');
 await group.check();await expect(m1p2).toBeChecked();await group.uncheck();await expect(m1p1).not.toBeChecked();await expect(m1p2).not.toBeChecked();await expect(m2p1).toBeChecked();
 await expect(dialog).toContainText('Muebles: 1 de 2 con cambios incluidos');
 const fold=dialog.getByRole('button',{name:'Plegar Bajo Mesada (M01)',exact:true});await expect(fold).toHaveAttribute('aria-expanded','true');await fold.click();
 const unfold=dialog.getByRole('button',{name:'Mostrar Bajo Mesada (M01)',exact:true});await expect(unfold).toHaveAttribute('aria-expanded','false');await expect(m1p1).toHaveCount(0);await unfold.click();await expect(m1p1).toBeVisible();
 await group.check();await expect(dialog.getByRole('status')).toHaveText('Selección verificada');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(await inspect()).toEqual(before);
});

test('lote bloqueado: el bloqueo trae la ruta y «Ver fila» se distingue con el código y la ruta',async({page},info)=>{
 await mkdir(info.outputDir,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',info.outputDir,'shared'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(info.outputDir,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('ux2NamesRequest',async(message:string)=>{const msg=JSON.parse(message);if(msg.action==='ui_ready')return {version:1,id:msg.id,result:{intent:{sequence:1,action:'furniture',selectionPaths:['1']}},error:null};return raw(message);});
 await page.addInitScript({content:'window.sketchup={request(raw){window.ux2NamesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral compartido');const dialog=await openBatch(page);
 const strip=dialog.locator('.name-batch-issues');await expect(strip.getByRole('alert')).toContainText(/^.*1\/11: /);
 const view=strip.getByRole('button',{name:'Ver fila P01 1/11',exact:true});await expect(view).toHaveText('Ver fila P01');await view.click();await expect(dialog.locator('tr[data-batch-row="1/11"]')).toBeFocused();
 await expect(dialog.getByRole('button',{name:'Cerrar',exact:true})).toHaveText('×');
});
