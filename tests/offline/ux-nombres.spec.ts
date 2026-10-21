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
async function openBatch(page:Page){await page.getByRole('button',{name:'Aplicar renombrado',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Aplicar renombrado',exact:true});await expect(dialog).toBeVisible();return dialog;}
async function openProposals(page:Page){await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog).toBeVisible();return dialog;}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('lote: cada ajuste se revisa solo, una vez, y la confirmación no necesita un paso intermedio',async({page},info)=>{
 await boot(page,info.outputDir,'names');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral revisado solo');await page.getByLabel('Nombre P02',{exact:true}).fill('Base excluida');
 const dialog=await openBatch(page),before=await inspect(),opened=count('guide_names_preview');
 await expect(dialog.getByRole('button',{name:'Revisar selección del lote'})).toHaveCount(0);await expect(dialog.getByRole('status')).toHaveText('Selección verificada');
 const p02=dialog.getByRole('checkbox',{name:'Incluir renombrado P02 1/13/12',exact:true});
 // Three quick toggles inside the debounce window produce a single review of the final selection.
 await p02.uncheck();await p02.check();await p02.uncheck();await expect(dialog.getByRole('button',{name:'Comprobando…',exact:true})).toBeDisabled();
 await expect(dialog.getByRole('status')).toHaveText('Selección verificada');expect(count('guide_names_preview')).toBe(opened+1);
 const confirm=dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true});await expect(confirm).toBeEnabled();expect(await inspect()).toEqual(before);
 await confirm.click();await expect(dialog).toHaveCount(0);const after=await inspect();expect(after.names['11']).toBe('Lateral revisado solo');expect(after.names['12']).toBe(before.names['12']);expect(after.operations.filter(op=>op[0]==='start')).toHaveLength(1);
});

test('lote: encabezado de tres estados, fila clicable, Espacio y diferencias marcadas',async({page},info)=>{
 await boot(page,info.outputDir,'names');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral marcado');await page.getByLabel('Nombre P02',{exact:true}).fill('Base marcada');
 const dialog=await openBatch(page),all=dialog.getByRole('checkbox',{name:'Incluir todos los renombrados excluibles',exact:true}),p01=dialog.getByRole('checkbox',{name:'Incluir renombrado P01 1/11',exact:true}),p02=dialog.getByRole('checkbox',{name:'Incluir renombrado P02 1/13/12',exact:true});
 await expect(all).toBeChecked();await expect(dialog.locator('mark.name-batch-change').first()).toBeVisible();await expect(dialog.locator('del.name-batch-before').first()).toContainText('antes:');
 await expect(dialog).toContainText(/cambian? nombre base/);
 await dialog.locator('tr[data-batch-row="1/13/12"] td').nth(1).click();await expect(p02).not.toBeChecked();expect(await all.evaluate(node=>(node as HTMLInputElement).indeterminate)).toBe(true);
 await all.click();await expect(p01).toBeChecked();await expect(p02).toBeChecked();await all.click();await expect(p01).not.toBeChecked();await expect(p02).not.toBeChecked();
 await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true})).toBeDisabled();
 const row=dialog.locator('tr[data-batch-row="1/11"]');await row.focus();await page.keyboard.press('Space');await expect(p01).toBeChecked();
 await p02.click({modifiers:['Shift']});await expect(p02).toBeChecked();
 await expect(dialog.getByRole('status')).toHaveText('Selección verificada');await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);
});

test('lote vacío: un mensaje claro y un único Cerrar con foco, sin tabla ni Confirmar',async({page},info)=>{
 await boot(page,info.outputDir,'names');await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();const dialog=await openBatch(page);
 await expect(dialog).toContainText('No hay nombres nuevos para sincronizar');await expect(dialog.getByRole('table')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar'})).toHaveCount(0);
 const close=dialog.getByRole('button',{name:'Cerrar',exact:true});await expect(close).toBeFocused();await expect(dialog.getByRole('button')).toHaveCount(1);await close.press('Enter');await expect(dialog).toHaveCount(0);
});

test('sugerencias: foco útil, motivos pendientes, Enter avanza, Esc deshace la fila y Ctrl+Enter confirma',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page),confirm=dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true});
 await expect(dialog.getByRole('checkbox',{name:'Frente y vertical confirmados',exact:true})).toBeFocused();
 const reasons=dialog.getByRole('list',{name:'Falta para confirmar'});await expect(reasons).toContainText('Confirmá frente y vertical en el dibujo.');await expect(reasons).toContainText('Elegí al menos una propuesta.');
 await expect(confirm).toHaveAttribute('aria-describedby','naming-pending');await expect(confirm).toBeDisabled();
 await page.keyboard.press('Space');await expect(reasons).not.toContainText('Confirmá frente');
 const p01=dialog.getByLabel('Nombre sugerido P01',{exact:true}),p02=dialog.getByLabel('Nombre sugerido P02',{exact:true});
 await p01.click();await p01.fill('Estante por teclado');await p01.press('Enter');await expect(p02).toBeFocused();await expect(dialog).toContainText('1 de 2 propuestas seleccionadas');
 await p02.fill('Borrador descartado');await p02.press('Escape');await expect(dialog).toBeVisible();await expect(p02).not.toHaveValue('Borrador descartado');await expect(dialog).toContainText('1 de 2 propuestas seleccionadas');
 await p02.press('Shift+Enter');await expect(p01).toBeFocused();await expect(p01).toHaveValue('Estante por teclado');
 await p02.fill('');await expect(reasons).toContainText('Completá o desmarcá 1 propuesta vacía.');await p02.fill('Piso por teclado');await expect(reasons).toHaveCount(0);
 await p02.press('Control+Enter');await expect(dialog).toHaveCount(0);await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();expect(count('save')).toBe(1);
});

test('sugerencias: filtros por confianza, maestro de la tabla y Desmarcar todas sin perder selección oculta',async({page},info)=>{
 await boot(page,info.outputDir,'recognition');const dialog=await openProposals(page);await dialog.getByRole('checkbox',{name:'Frente y vertical confirmados',exact:true}).check();
 const group=dialog.getByRole('group',{name:'Filtrar propuestas por confianza'}),all=group.getByRole('button',{name:/^Todas \(\d+\)$/});await expect(all).toHaveAttribute('aria-pressed','true');
 const master=dialog.getByRole('checkbox',{name:'Aplicar todas las propuestas visibles',exact:true});await master.check();await expect(dialog).toContainText('2 de 2 propuestas seleccionadas');
 for(const name of [/^Geométricas \(\d+\)$/,/^Revisar \(\d+\)$/,/^Sin clasificar \(\d+\)$/]){const button=group.getByRole('button',{name});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');const rows=await dialog.locator('[data-suggestion-row]').count(),shown=Number((await button.textContent())!.match(/\((\d+)\)/)![1]);expect(rows).toBe(shown);}
 await expect(dialog).toContainText('2 de 2 propuestas seleccionadas');await all.click();
 await dialog.getByRole('button',{name:'Desmarcar todas',exact:true}).click();await expect(dialog).toContainText('0 de 2 propuestas seleccionadas');await expect(master).not.toBeChecked();
 await dialog.getByRole('button',{name:'Cerrar sugerencias',exact:true}).click();await expect(dialog).toHaveCount(0);expect(count('save')).toBe(0);
});

test('lote bloqueado: la franja fija explica el bloqueo junto a la acción y lleva a la fila',async({page},info)=>{
 await boot(page,info.outputDir,'names','shared');await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral compartido');const before=await inspect(),dialog=await openBatch(page);
 const strip=dialog.locator('.name-batch-issues');await expect(strip.getByRole('alert')).toContainText('1 bloqueo impide confirmar');await expect(strip).toContainText(/compartida/);
 await expect(dialog.getByRole('status')).toHaveText('Bloqueado: 1 problema');await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true})).toBeDisabled();
 await strip.getByRole('button',{name:'Ver fila P01',exact:true}).click();await expect(dialog.locator('tr[data-batch-row="1/11"]')).toBeFocused();
 await strip.getByRole('button',{name:'Excluir y revisar',exact:true}).click();await expect(dialog.getByRole('checkbox',{name:'Incluir renombrado P01 1/11',exact:true})).not.toBeChecked();
 await expect(dialog.getByRole('button',{name:'Confirmar lote y guardar',exact:true})).toBeDisabled();expect(await inspect()).toEqual(before);
});
