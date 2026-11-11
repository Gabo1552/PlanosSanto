import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// 0.8.31 «Materiales del proyecto»: real browser bundle + real Ruby controller/services
// with synthetic SketchUp API doubles (photo_bridge_driver.rb). NOT SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],calls:{action:string;data:Record<string,unknown>}[];
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 const installation=resolve('sketchup_offline/build');
 child=spawn(ruby,['sketchup_offline/test/photo_bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,PLANOS_TEST_INSTALL_DIR:installation,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error('Ruby bridge exited'));});
 await page.exposeFunction('projectNativeRequest',(raw:string)=>new Promise<Reply>((resolve,reject)=>{const message=JSON.parse(raw);calls.push({action:message.action,data:message.data});pending.set(message.id,{resolve,reject});child.stdin.write(raw+'\n');}));
 await page.addInitScript({content:'window.sketchup={request:function(raw){window.projectNativeRequest(raw).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve(installation,'planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});});
 await page.context().setOffline(true);await page.setViewportSize({width:1280,height:760});await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'})).toBeVisible();
}
async function rpc(page:Page,action:string,data:Record<string,unknown>={}){
 const reply=await page.evaluate(async({action,data})=>{
  const bridge=window as unknown as {projectNativeRequest:(raw:string)=>Promise<Reply>};
  return bridge.projectNativeRequest(JSON.stringify({version:1,id:`fixture-${Date.now()}-${Math.random()}`,action,data}));
 },{action,data});
 expect(reply.error).toBeNull();return reply.result as Record<string,unknown>;
}
const toMaterials=(page:Page)=>page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Materiales',exact:true}).click();
async function savePhoto(page:Page,name:string,variant=false){
 await toMaterials(page);
 await page.getByRole('button',{name:'Crear',exact:true}).click();await page.getByRole('button',{name:'Material desde una foto…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material desde una foto',exact:true});
 await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
 await expect(dialog.getByRole('img',{name:'Foto elegida para la textura y miniatura del material'})).toBeVisible();
 // The second ficha reuses the same synthetic photo as a variant (another library material).
 if(variant)await dialog.getByRole('radio',{name:'Crear variante',exact:true}).check();
 await dialog.getByLabel('Nombre del material desde foto').fill(name);
 await dialog.getByLabel('Espesor del material desde foto').fill('18');
 await dialog.getByRole('button',{name:'Guardar material',exact:true}).click();await expect(dialog).toBeHidden();
}
async function openQuickPalette(page:Page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:{sequence:1,action:'sheet'}})));
 await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();
 return page.locator('.immediate-palette');
}
test.afterEach(async({page})=>{const seen=[...(errors||[])];await page.close();child?.stdin.end();child?.kill();expect(seen).toEqual([]);});

test('materiales del proyecto: se eligen en Materiales y la paleta muestra solo esos, con el resto plegado',async({page},info)=>{
 await boot(page,info.outputDir);
 // Two photo fichas in the taller library, then a NEW model (another SKP) where none is loaded yet.
 await savePhoto(page,'Roble proyecto QA');
 await savePhoto(page,'Nogal biblioteca QA',true);
 await rpc(page,'__photo_new_model',{});await page.reload();
 await expect(page.getByRole('navigation',{name:'Módulos de Planos Santo'})).toBeVisible();
 expect((await rpc(page,'project_materials')).projectMaterials).toMatchObject({ids:[],status:'empty'});

 // Materiales: an empty project shows the whole library unfolded and invites to choose.
 await toMaterials(page);
 const projectBlock=page.getByRole('region',{name:/En este proyecto/});
 await expect(projectBlock).toContainText('Todavía no elegiste materiales para este SKP');
 const fold=page.getByRole('button',{name:/Biblioteca del taller/});
 await expect(fold).toHaveAttribute('aria-expanded','true');
 const useRoble=page.getByRole('button',{name:'Usar Roble proyecto QA en este proyecto',exact:true});
 await expect(useRoble).toHaveAttribute('aria-pressed','false');
 await useRoble.click();
 await expect(page.getByRole('status').filter({hasText:'«Roble proyecto QA» se usa en este proyecto'})).toBeVisible();
 await expect(projectBlock.getByRole('article',{name:'Material Roble proyecto QA'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Usar Roble proyecto QA en este proyecto',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(fold,'the block the user was working in stays open').toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#material-workshop-list').getByRole('article',{name:'Material Nogal biblioteca QA'})).toBeVisible();
 await expect(page.locator('#material-workshop-list').getByRole('article',{name:'Material Roble proyecto QA'})).toHaveCount(0);
 const saved=(await rpc(page,'project_materials')).projectMaterials as {ids:string[]};
 expect(saved.ids).toHaveLength(1);
 expect(calls.filter(call=>call.action==='project_materials_set').map(call=>Object.keys(call.data))).toEqual([['add']]);
 // Searching still finds everything (the folded block opens by itself).
 await fold.click();await expect(fold).toHaveAttribute('aria-expanded','false');
 await page.screenshot({path:info.outputPath('materiales-proyecto-biblioteca-SINTETICA.png'),fullPage:true});
 await expect(page.getByRole('article',{name:'Material Nogal biblioteca QA'})).toHaveCount(0);
 await page.getByLabel('Buscar materiales del taller').fill('nogal');
 await expect(page.getByRole('article',{name:'Material Nogal biblioteca QA'})).toBeVisible();
 await page.getByLabel('Buscar materiales del taller').fill('');
 await expect(page.getByRole('article',{name:'Material Nogal biblioteca QA'})).toHaveCount(0);

 // Quick paint palette: only the project's sheet; the rest of the library folded.
 const palette=await openQuickPalette(page);
 const main=palette.getByRole('region',{name:'Materiales disponibles para pintar'});
 await expect(main.getByRole('button',{name:/Roble proyecto QA/})).toBeVisible();
 await expect(main.getByRole('button',{name:/Nogal biblioteca QA/})).toHaveCount(0);
 const others=palette.getByRole('region',{name:'Otros de la biblioteca'});
 const othersToggle=others.getByRole('button',{name:/Otros de la biblioteca \(1\)/});
 await expect(othersToggle).toHaveAttribute('aria-expanded','false');
 await expect(palette.getByRole('button',{name:/Nogal biblioteca QA/})).toHaveCount(0);
 await expect(palette.locator('.paint-project-invite')).toHaveCount(0);
 await page.setViewportSize({width:680,height:460});await page.screenshot({path:info.outputPath('materiales-proyecto-paleta-SINTETICA.png')});

 // The search includes the others, marked.
 await palette.getByLabel('Buscar material de pintado directo').fill('nogal');
 await expect(main.getByRole('button',{name:/Nogal biblioteca QA/})).toContainText('Otro de la biblioteca');
 await palette.getByLabel('Buscar material de pintado directo').fill('');

 // Choosing one of the others to paint adds it to the project, with a notice.
 await othersToggle.click();await expect(othersToggle).toHaveAttribute('aria-expanded','true');
 await others.getByRole('button',{name:/Nogal biblioteca QA/}).click();
 await expect(palette.getByRole('status').filter({hasText:'«Nogal biblioteca QA» se sumó a los materiales de este proyecto.'})).toBeVisible();
 await expect(palette.getByText('● Pintando',{exact:true})).toBeVisible();
 await expect(main.getByRole('button',{name:/Nogal biblioteca QA/})).toBeVisible();
 await expect(palette.getByRole('region',{name:'Otros de la biblioteca'})).toHaveCount(0);
 expect(((await rpc(page,'project_materials')).projectMaterials as {ids:string[]}).ids).toHaveLength(2);
});
