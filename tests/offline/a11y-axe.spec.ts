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
 await page.getByRole('button',{name:'Biblioteca del taller',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'Biblioteca del taller'});await expect(panel).toBeVisible();return panel;
}
/** 0.8.20: la Maderera es la optimización de todas las placas del proyecto (sección del riel, sin diálogo). */
async function openMaderera(page:Page){
 await generate(page);await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Maderera',exact:true}).click();
 const region=page.getByRole('region',{name:'Optimización de placas'});await expect(region.getByRole('group',{name:'Corte de la seccionadora'})).toBeVisible();return region;
}
// axe no resuelve el fondo cuando hay capas superpuestas (modal, encabezado fijo, SVG): se mide con colores
// computados, tomando el primer fondo opaco de los ancestros o el <rect> que enmascara el texto SVG.
async function measureContrast(page:Page,selectors:string[]){
 return page.evaluate(list=>list.map(selector=>{
  const node=document.querySelector(selector);if(!node)return {selector,ratio:null as number|null,required:4.5,fg:'',bg:''};
  const rgb=(value:string)=>(value.match(/[\d.]+/g)||[]).map(Number);
  const lum=([r,g,b]:number[])=>[r,g,b].map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const css=getComputedStyle(node),fg=node instanceof SVGTextElement?css.fill:css.color;let bg='';
  const mask=node instanceof SVGTextElement?node.parentElement?.querySelector(':scope > rect'):null;
  if(mask)bg=getComputedStyle(mask).fill;
  for(let el:Element|null=node;!bg&&el;el=el.parentElement){const value=getComputedStyle(el).backgroundColor,parts=rgb(value);if(parts.length===3||(parts.length===4&&parts[3]>=.99))bg=value;}
  bg||='rgb(255, 255, 255)';const a=lum(rgb(fg)),b=lum(rgb(bg)),size=parseFloat(css.fontSize),bold=Number(css.fontWeight)>=700;
  return {selector,fg,bg,ratio:Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100,required:size>=24||(bold&&size>=18.66)?3:4.5};
 }),selectors);
}
// Escanea la pantalla (o solo el diálogo abierto) y falla ante cualquier violación fuera de la allowlist.
async function audit(page:Page,screen:string,scope?:Locator){
 const size=page.viewportSize()!,variant=`${screen}@${size.width}`;
 let builder=new AxeBuilder({page}).withTags(TAGS);
 if(scope){await scope.evaluate(node=>node.setAttribute('data-axe-scope',''));builder=builder.include('[data-axe-scope]');}
 const {violations,passes,incomplete}=await builder.analyze();
 expect(passes.length,`axe no evaluó reglas en ${screen}`).toBeGreaterThan(0);
 if(scope)await scope.evaluate(node=>node.removeAttribute('data-axe-scope'));
 const toFindings=(list:typeof violations):Finding[]=>list.map(v=>({screen,rule:v.id,impact:v.impact??'unknown',help:v.help,targets:v.nodes.map(n=>n.target.join(' ')+(process.env.A11Y_REPORT?' :: '+[...n.any,...n.all,...n.none].map(c=>c.message).join(' | '):''))}));
 const findings=toFindings(violations);
 const measured=await measureContrast(page,incomplete.filter(v=>v.id==='color-contrast').flatMap(v=>v.nodes.map(n=>n.target.join(' '))));
 // «incomplete» = axe no pudo decidir (p. ej. contraste sobre fondos superpuestos): se reporta para revisión manual, no falla.
 if(process.env.A11Y_REPORT){await mkdir(process.env.A11Y_REPORT,{recursive:true});await writeFile(resolve(process.env.A11Y_REPORT,variant.replace(/\W+/g,'-')+'.json'),JSON.stringify({violations:findings,incomplete:toFindings(incomplete),measured},null,1));}
 const unexpected=findings.filter(f=>!ALLOWLIST.some(a=>a.screen===screen&&a.rule===f.rule));
 expect(unexpected,`Violaciones WCAG nuevas en ${variant}`).toEqual([]);
 expect(measured.filter(m=>m.ratio!==null&&m.ratio<m.required),`Contraste medido insuficiente en ${variant}`).toEqual([]);
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

// Ancho de trabajo habitual y ventana compacta del HtmlDialog (la misma que usa editor.spec.ts).
for(const [w,h] of [[1500,1100],[1000,760]] as const)test.describe(`${w}px`,()=>{
 test(`axe ${w}px: inicio`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});await boot(page,info.outputDir);await audit(page,'inicio');});

 test(`axe ${w}px: guía y editor`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});await boot(page,info.outputDir);await generate(page);await audit(page,'guia-editor');});

 test(`axe ${w}px: ayuda`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir);await generate(page);
  await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Planos A4',exact:true}).click();
  await page.getByRole('button',{name:'Ayuda: Vistas configurables',exact:true}).click();
  const popup=page.getByRole('dialog',{name:'Vistas configurables',exact:true});await expect(popup).toBeVisible();
  await audit(page,'ayuda',popup);
 });

 test(`axe ${w}px: nombres sugeridos`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir);await generate(page);
  await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();
  await page.getByRole('checkbox',{name:'Incluir piezas que ya tienen nombre'}).check();
  const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog.locator('[aria-label^="Nombre sugerido"]').first()).toBeVisible();
  await audit(page,'nombres-sugerencias',dialog);
 });

 // Simplificación punto 20: no batch dialog; the row notice of a name that was not synced is what gets audited.
 test(`axe ${w}px: nombres en lote`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir);await generate(page);
  await send('__names_lock',{persistentId:'12'});
  await page.getByLabel('Nombre P01',{exact:true}).fill('Lateral auditoría');await page.getByLabel('Nombre P02',{exact:true}).fill('Base auditoría');await page.getByLabel('Nombre P02',{exact:true}).press('Enter');
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
  const table=page.getByRole('table',{name:'Piezas del mueble'});await expect(table.getByRole('note')).toContainText('No se renombró en SketchUp');
  await audit(page,'nombres-lote',table);
 });

 test(`axe ${w}px: vista previa A4`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir);await generate(page);
  await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Planos A4',exact:true}).click();
  const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});await expect(preview.locator('iframe[title="PDF A4 generado"]')).toBeVisible();
  await audit(page,'vista-previa-a4');
 });

 test(`axe ${w}px: biblioteca del taller`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir);
  await catalog([{name:'Placa auditoría',kind:'sheet',patch:{sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false}}]);
  const panel=await openWorkshop(page);
  await audit(page,'biblioteca',panel);
 });

 // 0.8.20: Maderera = optimización por placa del proyecto, corte de la seccionadora, TXT por placa y total de cantos.
 test(`axe ${w}px: maderera por placa`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir,'materials-cutlist');
  const [board,strip]=await catalog([{name:'Placa auditoría',kind:'sheet',patch:{sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:true}},{name:'Canto auditoría',kind:'edge',patch:{sku:'EDGE-1',supplier:'Prueba',thicknessMm:.8,widthMm:22}}]);
  await send('__bind_material',{materialName:'Jade synthetic',catalogId:board.id});await send('__bind_material',{materialName:'Canto de prueba',catalogId:strip.id});
  const region=await openMaderera(page);
  await region.getByRole('button',{name:'Ver optimización de Placa auditoría · 19,05 mm'}).click();
  await expect(region.getByRole('region',{name:'Placas del proyecto'}).getByRole('img',{name:/^Placa 1 de 1/})).toBeVisible();
  await audit(page,'maderera-placas',region);
  // Con un valor fuera de rango, el aviso del campo también se audita.
  await region.getByLabel('Refilado por lado mm').fill('99');await expect(region.getByText('Entre 0 y 50 mm.',{exact:false})).toBeVisible();
  await audit(page,'maderera-placas-aviso',region);
 });

 test(`axe ${w}px: materiales y cantos (OCL)`,async({page},info)=>{
  await page.setViewportSize({width:w,height:h});
  await boot(page,info.outputDir,'materials');
  await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});await expect(dialog.locator('tbody').first().locator('tr')).toHaveCount(3);
  await audit(page,'materiales-cantos',dialog);
 });
});
