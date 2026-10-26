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
// Simplificación punto 20: no batch dialog; «Guardar guía» renames.
async function saveGuide(page:Page){await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText(/Guía (guardada en el modelo abierto|y archivo SketchUp guardados)/)).toBeVisible();}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('sugerencias: nombres accesibles iguales al rótulo, código compuesto, fila resaltada sin aria-selected y nombre final',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');await modules(page,'VF');await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();
 const dialog=await openProposals(page);
 // WCAG 2.5.3: the accessible name is exactly the visible label (voice control says what it sees).
 await dialog.getByText('Ajustar ejes del mueble',{exact:true}).click();await expect(dialog.getByRole('combobox',{name:'Vertical local',exact:true})).toBeVisible();await expect(dialog.getByRole('combobox',{name:'Frente local',exact:true})).toBeVisible();
 // Punto 21: the group axes are the default orientation; focus goes to the first proposal.
 await expect(dialog.getByRole('checkbox',{name:'Confirmé frente y vertical en el dibujo',exact:true})).toHaveCount(0);await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toBeVisible();
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
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page),front=dialog.getByRole('combobox',{name:'Frente local',exact:true});
 const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true});await p01.fill('Editado a mano');
 await dialog.getByRole('button',{name:'Seleccionar propuestas no ambiguas',exact:true}).click();
 await expect(p01).toHaveValue('Editado a mano');await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).toBeChecked();
 const notice=dialog.locator('.naming-notice');await expect(notice).toHaveAttribute('role','status');await expect(notice).toHaveText(/(Se sum(ó|aron) .* geométricas?; lo ya elegido o editado se conservó\.|No había propuestas geométricas nuevas para sumar\.)/);
 // Correcting the front: the manual edit survives, automatic proposals are recalculated.
 await dialog.getByText('Ajustar ejes del mueble',{exact:true}).click();await front.selectOption('0,1');await expect(p01).toHaveValue('Editado a mano');await expect(notice).toContainText('Se conservó 1 nombre editado');
 await front.selectOption('1,-1');await expect(p01).toHaveValue('Editado a mano');await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).toBeChecked();
 await dialog.getByRole('checkbox',{name:'Incluir piezas que ya tienen nombre o revisión guardada'}).check();await expect(p01).toHaveValue('Editado a mano');
 expect(count('save')).toBe(0);
});

test('lote: dos muebles se renombran al guardar en una sola operación, con su código compuesto en pantalla',async({page},info)=>{
 await boot(page,info.outputDir,'names');await modules(page);await page.getByLabel('Nombre P01',{exact:true}).fill('Base del otro');
 await page.getByRole('button',{name:'Bajo Mesada 2 piezas',exact:true}).click();await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral nuevo');await page.getByLabel('Nombre P02',{exact:true}).fill('Base nueva');
 const before=await inspect();await saveGuide(page);const after=await inspect();
 expect(after.names['11']).toBe('Lateral nuevo');expect(after.names['12']).toBe('Base nueva');expect(Object.values(after.names)).toContain('Base del otro');
 expect(after.operations.filter(op=>op[0]==='start').length).toBe(before.operations.filter(op=>op[0]==='start').length+1);
 expect(count('guide_names_preview')).toBe(0);
});

// Simplificación punto 22: with an obra, an empty module becomes M01, M02… in order; nothing blocks the save.
test('obra y módulo: los módulos vacíos se asignan M01, M02 por orden al guardar',async({page},info)=>{
 await boot(page,info.outputDir,'names');await page.getByLabel('Abreviatura de la obra').fill('VF');
 await page.getByLabel('Módulo de este mueble').fill('');await page.getByRole('button',{name:'Otro mueble 1 pieza',exact:true}).click();await page.getByLabel('Módulo de este mueble').fill('');
 await saveGuide(page);const names=Object.values((await inspect()).names);
 expect(names.filter(name=>/^VF M0[12] /.test(name)).length).toBeGreaterThanOrEqual(3);expect(names.some(name=>name.startsWith('VF M01 '))).toBe(true);expect(names.some(name=>name.startsWith('VF M02 '))).toBe(true);
 await page.getByLabel('Abreviatura de la obra').fill('V');await expect(page.getByText('La obra lleva dos letras (por ejemplo VF); mientras tanto los nombres se guardan sin obra.')).toBeVisible();
});

test('lote bloqueado: el aviso queda en la fila compartida, sin ruta interna',async({page},info)=>{
 await mkdir(info.outputDir,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',info.outputDir,'shared'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(info.outputDir,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('ux2NamesRequest',async(message:string)=>{const msg=JSON.parse(message);if(msg.action==='ui_ready')return {version:1,id:msg.id,result:{intent:{sequence:1,action:'furniture',selectionPaths:['1']}},error:null};return raw(message);});
 await page.addInitScript({content:'window.sketchup={request(raw){window.ux2NamesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral compartido');await saveGuide(page);
 // Punto 20: the blocked row carries its own notice instead of a dialog strip.
 const note=page.locator('tr[data-piece-row="1/11"]').getByRole('note');await expect(note).toContainText('No se renombró en SketchUp');await expect(note).not.toContainText('1/11:');
});
