import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
// Synthetic Ruby controllers (names and recognition doubles): they exercise the real
// guide/name engine and the offline UI, never SketchUp's desktop UI or a private SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
function raw(message:string):Promise<Reply>{return new Promise(resolve=>{const msg=JSON.parse(message);calls.push(msg);pending.set(msg.id,resolve);child.stdin.write(message+'\n');});}
async function inspect(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return reply.result as {names:Record<string,string>;operations:unknown[][];geometryHash:string;definitions:string[]};}
const count=(action:string)=>calls.filter(call=>call.action===action).length;
async function boot(page:Page,folder:string,driver:'names'|'recognition',mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,[`sketchup_offline/test/${driver}_bridge_driver.rb`,folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('uxNamesRequest',async(message:string)=>{const msg=JSON.parse(message);if(driver==='names'&&msg.action==='ui_ready')return {version:1,id:msg.id,result:{intent:{sequence:1,action:'furniture',selectionPaths:['1']}},error:null};return raw(message);});
 await page.addInitScript({content:'window.sketchup={request(raw){window.uxNamesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected asset');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 if(driver==='recognition'){const generate=page.getByRole('button',{name:'Generar guías (2)',exact:true});await expect(generate).toBeEnabled();await generate.click();}
}
// Simplificación punto 20: there is no «Aplicar renombrado» dialog; saving the guide renames.
async function saveGuide(page:Page){await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText(/Guía (guardada en el modelo abierto|y archivo SketchUp guardados)/)).toBeVisible();}
async function openProposals(page:Page){await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog).toBeVisible();return dialog;}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('lote: guardar la guía renombra todo en una operación, sin vista previa ni paso intermedio',async({page},info)=>{
 await boot(page,info.outputDir,'names');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral revisado solo');await page.getByLabel('Nombre P02',{exact:true}).fill('Base revisada sola');
 const before=await inspect();await expect(page.getByRole('button',{name:'Aplicar renombrado',exact:true})).toHaveCount(0);
 await saveGuide(page);await expect(page.getByRole('dialog')).toHaveCount(0);expect(count('guide_names_preview')).toBe(0);expect(count('save')).toBe(1);
 const after=await inspect();expect(after.names['11']).toBe('Lateral revisado solo');expect(after.names['12']).toBe('Base revisada sola');expect(after.geometryHash).toBe(before.geometryHash);expect(after.operations.filter(op=>op[0]==='start')).toHaveLength(1);
});

test('lote: con Sincronizar nombres apagado, guardar conserva los nombres de SketchUp y sólo guarda la guía',async({page},info)=>{
 await boot(page,info.outputDir,'names');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral sólo en la guía');const before=await inspect();
 await page.getByText('Opciones de guardado',{exact:true}).click();await page.getByRole('checkbox',{name:'Sincronizar nombres de grupos y piezas en SketchUp',exact:true}).uncheck();await page.getByText('Opciones de guardado',{exact:true}).click();
 await saveGuide(page);const after=await inspect();expect(after.names).toEqual(before.names);await expect(page.getByLabel('Nombre P01',{exact:true})).toHaveValue('Lateral sólo en la guía');
 await expect(page.getByRole('table',{name:'Piezas del mueble'}).getByRole('note')).toHaveCount(0);
});

test('lote vacío: guardar sin nombres nuevos no escribe nombres ni deja avisos',async({page},info)=>{
 await boot(page,info.outputDir,'names');await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();const before=await inspect();
 await saveGuide(page);const after=await inspect();expect(after.names).toEqual(before.names);
 await expect(page.getByRole('table',{name:'Piezas del mueble'}).getByRole('note')).toHaveCount(0);await expect(page.getByText(/no se cambi/)).toHaveCount(0);
});

test('sugerencias: foco útil, motivos pendientes, Enter avanza, Esc deshace la fila y Ctrl+Enter confirma',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page),confirm=dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true});
 // Punto 21: no «Confirmé frente y vertical»; the group axes are the default and focus goes to the first proposal.
 await expect(dialog.getByRole('checkbox',{name:'Confirmé frente y vertical en el dibujo',exact:true})).toHaveCount(0);await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toBeFocused();
 await expect(dialog).toContainText('Frente −Y · arriba +Z · tomado de los ejes del grupo.');
 const reasons=dialog.getByRole('list',{name:'Falta para confirmar'});await expect(reasons).not.toContainText('Confirmá frente');await expect(reasons).toContainText('Elegí al menos una propuesta.');
 await expect(confirm).toHaveAttribute('aria-describedby','naming-pending');await expect(confirm).toBeDisabled();
 const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true}),p02=dialog.getByLabel('Nombre sugerido P02',{exact:true});
 // Enter only moves between rows: walking through them never accepts a proposal, not even on the last row.
 await p01.click();await p01.press('Enter');await expect(p02).toBeFocused();await p02.press('Enter');await expect(p02).toBeFocused();await p02.press('Shift+Enter');await expect(p01).toBeFocused();await expect(dialog).toContainText('0 de 2 propuestas seleccionadas');
 await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P01',exact:true})).not.toBeChecked();await expect(dialog.getByRole('checkbox',{name:'Aplicar propuesta P02',exact:true})).not.toBeChecked();
 await p01.fill('Estante por teclado');await p01.press('Enter');await expect(p02).toBeFocused();await expect(dialog).toContainText('1 de 2 propuestas seleccionadas');
 await p02.fill('Borrador descartado');await p02.press('Escape');await expect(dialog).toBeVisible();await expect(p02).not.toHaveValue('Borrador descartado');await expect(dialog).toContainText('1 de 2 propuestas seleccionadas');
 await p02.press('Shift+Enter');await expect(p01).toBeFocused();await expect(p01).toHaveValue('Estante por teclado');
 await p02.fill('');await expect(reasons).toContainText('Completá o desmarcá 1 propuesta vacía.');await p02.fill('Piso por teclado');await expect(reasons).toHaveCount(0);
 await p02.press('Control+Enter');await expect(dialog).toHaveCount(0);await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();expect(count('save')).toBe(1);
});

test('sugerencias: filtros por confianza, maestro de la tabla y Desmarcar todas sin perder selección oculta',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page);
 const group=dialog.getByRole('group',{name:'Filtrar propuestas por confianza'}),all=group.getByRole('button',{name:/^Todas \(\d+\)$/});await expect(all).toHaveAttribute('aria-pressed','true');
 const master=dialog.getByRole('checkbox',{name:'Aplicar todas las propuestas visibles',exact:true});await master.check();await expect(dialog).toContainText('2 de 2 propuestas seleccionadas');
 for(const name of [/^Geométricas \(\d+\)$/,/^Revisar \(\d+\)$/,/^Sin clasificar \(\d+\)$/]){const button=group.getByRole('button',{name});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');const rows=await dialog.locator('[data-suggestion-row]').count(),shown=Number((await button.textContent())!.match(/\((\d+)\)/)![1]);expect(rows).toBe(shown);}
 await expect(dialog).toContainText('2 de 2 propuestas seleccionadas');await all.click();
 // An empty proposal hidden by a filter can still be reached from the pending reason.
 const p02=dialog.getByLabel('Nombre sugerido P02',{exact:true});await p02.fill('');
 for(const name of [/^Geométricas \(\d+\)$/,/^Revisar \(\d+\)$/,/^Sin clasificar \(\d+\)$/]){await group.getByRole('button',{name}).click();if(!await p02.count())break;}
 await expect(p02).toHaveCount(0);const reasons=dialog.getByRole('list',{name:'Falta para confirmar'});await expect(reasons).toContainText('Completá o desmarcá 1 propuesta vacía.');
 await reasons.getByRole('button',{name:'Ir a la propuesta vacía',exact:true}).click();await expect(all).toHaveAttribute('aria-pressed','true');await expect(p02).toBeFocused();
 await dialog.getByRole('button',{name:'Desmarcar todas',exact:true}).click();await expect(dialog).toContainText('0 de 2 propuestas seleccionadas');await expect(master).not.toBeChecked();
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(dialog).toHaveCount(0);expect(count('save')).toBe(0);
});

test('lote bloqueado: la fila compartida queda con aviso y su nombre en SketchUp; la guía se guarda igual',async({page},info)=>{
 await boot(page,info.outputDir,'names','shared');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral compartido');const before=await inspect();
 await saveGuide(page);await expect(page.getByText(/no se cambi(ó|aron) en SketchUp: mirá el aviso/)).toBeVisible();
 const note=page.locator('tr[data-piece-row="1/11"]').getByRole('note');await expect(note).toContainText('No se renombró en SketchUp');await expect(note).toContainText(/compartida/);
 const after=await inspect();expect(after.names['11']).toBe(before.names['11']);await expect(page.getByLabel('Nombre P01',{exact:true})).toHaveValue('Lateral compartido');
});
