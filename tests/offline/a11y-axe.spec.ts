import {test,expect,type Page,type Locator} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// Auditoría WCAG 2.2 AA con axe-core sobre el controlador Ruby real con dobles sintéticos de SketchUp
// (mismo puente que names.spec.ts / ux-taller.spec.ts). Cualquier violación nueva rompe el spec;
// las conocidas y justificadas viven en ALLOWLIST, documentadas en docs/qa/A11Y_AXE.md.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
const TAGS=['wcag2a','wcag2aa','wcag21aa','wcag22aa'];
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
type Finding={screen:string;rule:string;impact:string;help:string;targets:string[]};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[];

// Excepciones explícitas: pantalla + regla + motivo. Vacía = toda violación es regresión.
const ALLOWLIST:{screen:string;rule:string;reason:string}[]=[];

function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function generate(page:Page){await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();}
async function catalog(items:{name:string;kind:string;patch:Record<string,unknown>|((all:Item[])=>Record<string,unknown>)}[]){
 let library:Library|undefined;
 for(const item of items)library=await send('catalog_add',{revision:library?.catalog.revision??0,item:{name:item.name,kind:item.kind}}) as Library;
 const all=library!.catalog.items;items.forEach((item,i)=>Object.assign(all[i],typeof item.patch==='function'?item.patch(all):item.patch));
 await send('catalog_save',{revision:library!.catalog.revision,items:all});return all;
}
async function openWorkshop(page:Page){
 await generate(page);await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});await expect(panel).toBeVisible();return panel;
}
// Escanea la pantalla (o solo el diálogo abierto) y falla ante cualquier violación fuera de la allowlist.
async function audit(page:Page,screen:string,scope?:Locator){
 let builder=new AxeBuilder({page}).withTags(TAGS);
 if(scope){await scope.evaluate(node=>node.setAttribute('data-axe-scope',''));builder=builder.include('[data-axe-scope]');}
 const {violations,passes}=await builder.analyze();
 expect(passes.length,`axe no evaluó reglas en ${screen}`).toBeGreaterThan(0);
 if(scope)await scope.evaluate(node=>node.removeAttribute('data-axe-scope'));
 const findings:Finding[]=violations.map(v=>({screen,rule:v.id,impact:v.impact??'unknown',help:v.help,targets:v.nodes.map(n=>n.target.join(' '))}));
 if(process.env.A11Y_REPORT){await mkdir(process.env.A11Y_REPORT,{recursive:true});await writeFile(resolve(process.env.A11Y_REPORT,screen.replace(/\W+/g,'-')+'.json'),JSON.stringify(findings,null,1));}
 const unexpected=findings.filter(f=>!ALLOWLIST.some(a=>a.screen===screen&&a.rule===f.rule));
 expect(unexpected,`Violaciones WCAG nuevas en ${screen}`).toEqual([]);
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('axe: inicio',async({page},info)=>{await boot(page,info.outputDir);await audit(page,'inicio');});

test('axe: guía y editor',async({page},info)=>{await boot(page,info.outputDir);await generate(page);await audit(page,'guia-editor');});

test('axe: ayuda',async({page},info)=>{
 await boot(page,info.outputDir);await generate(page);
 await page.getByRole('button',{name:'Ayuda: Vistas configurables',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'Vistas configurables',exact:true});await expect(popup).toBeVisible();
 await audit(page,'ayuda',popup);
});

test('axe: nombres sugeridos',async({page},info)=>{
 await boot(page,info.outputDir);await generate(page);
 await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();
 await page.getByRole('checkbox',{name:'Incluir piezas que ya tienen nombre'}).check();
 const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog.locator('[aria-label^="Nombre sugerido"]').first()).toBeVisible();
 await audit(page,'nombres-sugerencias',dialog);
});

test('axe: nombres en lote',async({page},info)=>{
 await boot(page,info.outputDir);await generate(page);
 await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral auditoría');await page.getByLabel('Nombre P01',{exact:true}).press('Enter');
 await page.getByRole('button',{name:'Aplicar renombrado',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Aplicar renombrado',exact:true});await expect(dialog.getByRole('status')).toBeVisible();
 await audit(page,'nombres-lote',dialog);
});

test('axe: vista previa A4',async({page},info)=>{
 await boot(page,info.outputDir);await generate(page);
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Planos A4',exact:true}).click();
 const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});await expect(preview.locator('iframe[title="PDF A4 generado"]')).toBeVisible();
 await audit(page,'vista-previa-a4');
});

test('axe: biblioteca y pedido del taller',async({page},info)=>{
 await boot(page,info.outputDir);
 await catalog([{name:'Placa auditoría',kind:'sheet',patch:{sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true}}]);
 const panel=await openWorkshop(page);
 await audit(page,'biblioteca',panel);
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();
 await audit(page,'pedido-taller',panel);
});

test('axe: revisión de cantos',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');
 const [board,first,second]=await catalog([
  {name:'Placa observable',kind:'sheet',patch:all=>({sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true,compatibleIds:[all[1].id,all[2].id]})},
  {name:'Principal biblioteca',kind:'edge',patch:{sku:'EDGE-1',supplier:'Prueba',thicknessMm:.8,widthMm:22,approved:true}},
  {name:'Secundario biblioteca',kind:'edge',patch:{sku:'EDGE-2',supplier:'Prueba',thicknessMm:1,widthMm:22,approved:true}}]);
 const panel=await openWorkshop(page);await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
 await page.getByLabel('Placa aprobada del pedido').selectOption(board.id);
 await page.getByLabel('Canto principal (1) del pedido').selectOption(first.id);await page.getByLabel('Canto secundario (2) del pedido').selectOption(second.id);
 await panel.getByRole('button',{name:'Leer cantos de las caras',exact:true}).click();await expect(panel.getByText('Recorrido completo',{exact:true})).toBeVisible();
 await audit(page,'revision-cantos',panel);
});

test('axe: materiales y cantos (OCL)',async({page},info)=>{
 await boot(page,info.outputDir,'materials');
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});await expect(dialog.locator('tbody').first().locator('tr')).toHaveCount(3);
 await audit(page,'materiales-cantos',dialog);
});
