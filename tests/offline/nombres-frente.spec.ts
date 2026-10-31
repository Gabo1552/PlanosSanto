import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
// 0.8.28 · «Ocultar frente» en Sugerencias de nombres. Placard SINTÉTICO con dos puertas al frente
// (frente_bridge_driver.rb): laterales, piso, tapa y dos estantes detrás de las puertas. Dobles Ruby, no SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise(resolve=>{const msg=JSON.parse(message);pending.set(msg.id,resolve);child.stdin.write(message+'\n');});}
async function names(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return (reply.result as {names:Record<string,string>}).names;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];
 child=spawn(ruby,['sketchup_offline/test/frente_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('frenteRequest',async(message:string)=>raw(message));
 await page.addInitScript({content:'window.sketchup={request(raw){window.frenteRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected asset');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 const generate=page.getByRole('button',{name:'Generar guías (2)',exact:true});await expect(generate).toBeEnabled();await generate.click();
 await page.getByRole('button',{name:'M01 Placard 8 piezas',exact:true}).click();
 await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog).toBeVisible();return dialog;
}
const drawnPieces=async(dialog:ReturnType<Page['getByRole']>)=>new Set(await dialog.locator('svg.diagram polygon[data-piece]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-piece'))));
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('ocultar el frente deja ver y tocar el interior; las puertas siguen en la lista y reciben su nombre',async({page},info)=>{
 const dialog=await boot(page,info.outputDir);
 const hide=dialog.getByRole('button',{name:'Ocultar frente (2)',exact:true});await expect(hide).toBeEnabled();await expect(hide).toHaveAttribute('aria-pressed','false');
 const all=await drawnPieces(dialog);expect(all.size).toBe(8);
 await hide.click();
 const show=dialog.getByRole('button',{name:'Mostrar frente',exact:true});await expect(show).toHaveAttribute('aria-pressed','true');
 await expect(dialog.getByRole('status').filter({hasText:'Frente oculto en el dibujo: 2 piezas (puertas y frentes de cajón).'})).toBeVisible();
 const interior=await drawnPieces(dialog);expect(interior.size).toBe(6);
 // Las puertas no están en el dibujo, pero siguen en la lista de sugerencias.
 const doors=[...all].filter(id=>!interior.has(id));expect(doors).toHaveLength(2);
 await expect(dialog.locator('[data-suggestion-input]')).toHaveCount(await dialog.locator('[data-suggestion-input]').count());
 // Tocar un estante, que antes quedaba detrás de las puertas, lleva a su fila en la lista.
 const shelf=[...interior].find(id=>id!==undefined)!;
 await dialog.locator(`svg.diagram polygon[data-piece="${shelf}"]`).first().click({force:true});
 await expect.poll(()=>page.evaluate(()=>document.activeElement?.hasAttribute('data-suggestion-input')??false)).toBe(true);
 const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).include('.naming-dialog').analyze();
 expect(violations.map(v=>`${v.impact} ${v.id}`)).toEqual([]);
 // Marcar el frente necesita las caras exteriores: vuelve a mostrarlas y deshabilita «Ocultar frente» mientras se marca.
 await dialog.getByRole('button',{name:'Marcar frente en el dibujo',exact:true}).click();
 const again=dialog.getByRole('button',{name:'Ocultar frente (2)',exact:true});await expect(again).toBeDisabled();await expect(again).toHaveAttribute('aria-pressed','false');
 expect((await drawnPieces(dialog)).size).toBe(8);
 await dialog.getByRole('button',{name:'Marcar frente en el dibujo',exact:true}).click();await expect(again).toBeEnabled();
 // Con el frente oculto se confirma igual: las puertas también reciben su nombre.
 await again.click();
 // Las puertas son propuestas «a revisar»: no vienen tildadas. Se aplican tildando su fila aunque no estén en el dibujo.
 const doorRows=dialog.locator('tbody tr').filter({has:page.locator('[data-suggestion-input][value="Puerta"]')});
 await expect(doorRows).not.toHaveCount(0);
 for(const row of await doorRows.all()){const box=row.getByRole('checkbox');if(!(await box.isChecked()))await box.check();}
 await dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect.poll(async()=>{const n=await names();return [n['17'],n['18']].every(name=>/Puerta/.test(name||''));}).toBe(true);
});
