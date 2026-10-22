import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {CatalogItem} from '../../sketchup_offline/ui/WorkshopPanel';
import type {FichaItem} from '../../sketchup_offline/ui/materialLibraryModel';
// 0.8.17 · Materiales: grilla agrupada por tipo, «Propiedades del material», espesores
// estándar con + y − y el aviso de un clic para la única ambigüedad que queda.
// Contrato UI/puente con dobles en memoria: sin SketchUp, sin texturas reales.
type Call={action:string;data:Record<string,unknown>};
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const base=(id:string,patch:Partial<FichaItem>):FichaItem=>({id,name:'',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'2026-10-22T00:00:00Z',sourceHash:'0'.repeat(64),observed:{},notes:'',variantOf:null,suggested:null,thicknessesMm:[],...patch});
let calls:Call[],items:FichaItem[],revision:number,ambiguous:unknown[];
const requests=(action:string)=>calls.filter(call=>call.action===action);
const sheetList=[3,5,12,15,18,25],edgeList=[0.45,2];
async function harness(page:Page,folder:string){
 calls=[];revision=5;
 items=[base(uuid(1),{name:'Caju 18mm',thicknessMm:18,thicknessesMm:sheetList,sku:'CJ18',supplier:'Maderera QA',lengthMm:2750,widthMm:1830,grain:true}),
  base(uuid(2),{name:'Camellia',thicknessMm:18,thicknessesMm:sheetList}),
  base(uuid(3),{name:'Camellia (variante)',kind:'edge',thicknessMm:0.45,thicknessesMm:edgeList,widthMm:22}),
  base(uuid(4),{name:'Pino macizo',kind:'solid_wood',thicknessesMm:[]}),
  base(uuid(5),{name:'Melamina petiribí 18mm',kind:'unknown',thicknessesMm:[]})];
 ambiguous=[{materialId:'902',name:'Roble QA',reason:'name',message:'«Roble QA» del modelo coincide con 2 fichas con el mismo nombre. Elegí cuál es.',candidates:[{catalogId:uuid(1),name:'Caju 18mm',kind:'sheet',thicknessMm:18},{catalogId:uuid(3),name:'Camellia (variante)',kind:'edge',thicknessMm:0.45}]}];
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-ficha-entry-'));const entry=join(temp,'entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Library from ${JSON.stringify(resolve('sketchup_offline/ui/MaterialLibraryPanel.tsx'))};
createRoot(document.getElementById('root')).render(React.createElement(Library,{onEdit:id=>window.harnessCall('__edit',id),onPaint:(id,autoStart)=>window.harnessCall('__paint',id+':'+!!autoStart),onApplied:()=>{},onClose:()=>window.harnessCall('__close','')}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outdir:folder,entryNames:'app',bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',loader:{'.css':'css'},define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('harnessCall',(action:string,value:string)=>{calls.push({action,data:{value}});});
 await page.exposeFunction('fichaRequest',(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message as {action:string;data:Record<string,unknown>};calls.push({action,data});let result:unknown;
  const catalog=()=>({schema:3,revision,items});
  if(action==='skm_library')result={catalog:catalog(),rows:[{catalogId:uuid(2),name:'Camellia',sourceName:'Foto propia',thumbnail:pixel}],
   materials:[{id:'901',name:'Caju 18mm',hasTexture:false,color:[143,98,64],binding:{catalogId:uuid(1),kind:'sheet',uuid:'u-1'},issues:[]},{id:'902',name:'Roble QA',hasTexture:false,color:[120,90,60],binding:null,issues:[]}],
   visuals:[],assetRevision:1,ambiguous,autoLink:{changed:0},standardThicknessesMm:{sheet:sheetList,edge:edgeList}};
  else if(action==='material_extras')result={archivedIds:[],statesRevision:0};
  else if(action==='catalog_save'){if(data.revision!==revision)return {version:1,id:message.id,result:null,error:'La biblioteca cambió en otra ventana.'};items=data.items as FichaItem[];revision++;result={catalog:catalog(),conflicts:[]};}
  else if(action==='catalog_add'){const item=data.item as {name:string;kind:string};items=[...items,base(uuid(20+items.length),{name:item.name,kind:item.kind,thicknessesMm:item.kind==='edge'?edgeList:item.kind==='sheet'?sheetList:[]})];revision++;result={catalog:catalog(),conflicts:[]};}
  else if(action==='material_link_resolve'){ambiguous=[];result={stale:true};}
  else if(action==='material_package_export')result={fileName:'ficha.zip',items:1,files:0,bytes:10};
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(()=>{const w=window as unknown as {fichaRequest:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.sketchup={request:raw=>{void w.fichaRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://ficha.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Materiales</title><link rel="stylesheet" href="app.css"></head><body><main><div id="root"></div></main><script src="app.js"></script></body></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name)).catch(()=>'')});});
 await page.context().setOffline(true);await page.goto('https://ficha.test/index.html');
 await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
 await expect(page.getByRole('article',{name:/^Material /}).first()).toBeVisible();
 return errors;
}
const ficha=(page:Page)=>page.getByRole('dialog',{name:/^(Propiedades del material|Nueva ficha)/});
const card=(page:Page,name:string)=>page.getByRole('article',{name:`Material ${name}`,exact:true});
async function axe(page:Page,label:string){
 const {violations,passes}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 expect(passes.length).toBeGreaterThan(0);
 expect(violations.filter(violation=>['serious','critical'].includes(violation.impact||'')).map(violation=>`${label}: ${violation.id} ${violation.nodes.map(node=>node.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('grilla agrupada por tipo con tarjetas, ícono de tipo y acciones; axe sin violaciones graves',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 const groups=page.locator('.material-group-title');
 await expect(groups).toHaveText(['Placas2','Cantos1','Otros materiales1','Sin tipo1']);
 await expect(page.getByRole('region',{name:/^Placas/}).getByRole('article')).toHaveCount(2);
 await expect(page.getByRole('region',{name:/^Cantos/}).getByRole('article',{name:'Material Camellia (variante)',exact:true})).toBeVisible();
 await expect(card(page,'Camellia').getByRole('img',{name:'Miniatura real de Camellia'})).toBeVisible();
 await expect(card(page,'Caju 18mm')).toContainText('Placa · 18 mm');await expect(card(page,'Caju 18mm')).toContainText('En el modelo');
 await expect(card(page,'Camellia')).toContainText('Incompleta');await expect(card(page,'Melamina petiribí 18mm')).toContainText('Sin tipo');
 await expect(card(page,'Caju 18mm').getByRole('button',{name:'Editar ficha Caju 18mm',exact:true})).toBeVisible();
 await expect(card(page,'Caju 18mm').getByRole('button',{name:/^Caju 18mm: Placa · 18 mm, ficha completa, en este modelo/})).toBeVisible();
 // Lo único manual que queda: el nombre del modelo coincide con dos fichas.
 const choices=page.getByRole('region',{name:'Elegí la ficha de este material del modelo'});
 await expect(choices).toContainText('coincide con 2 fichas');
 await page.screenshot({path:info.outputPath('grilla-materiales.png'),fullPage:true});
 await axe(page,'grilla');
 await choices.getByRole('button',{name:'Es «Camellia (variante)» · Canto 0,45 mm',exact:true}).click();
 await expect(page.getByText('«Roble QA» del modelo quedó vinculado a «Camellia (variante)».',{exact:false})).toBeVisible();
 expect(requests('material_link_resolve')[0].data).toEqual({materialId:'902',catalogId:uuid(3),revision:5});
 await expect(choices).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('la ficha se abre desde la tarjeta: espesores con + y −, elegir otro y Aplicar guarda la lista',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await card(page,'Caju 18mm').locator('.material-card-select').click();
 const dialog=page.getByRole('dialog',{name:'Propiedades del material «Caju 18mm»',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:'Nombre',exact:true})).toBeFocused();
 await expect(dialog.getByRole('tab',{name:'General',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(dialog).toContainText('Ficha completa: se puede usar en pedidos.');
 await expect(dialog.getByText('#8f6240',{exact:true})).toBeVisible();
 const rows=dialog.getByRole('textbox',{name:/^Espesor estándar \d+ \(mm\)$/});
 await expect(rows).toHaveCount(6);await expect(rows.nth(4)).toHaveValue('18');
 await expect(dialog.getByRole('radio',{name:'Usar 18 mm como espesor de la ficha',exact:true})).toBeChecked();
 await expect(dialog.getByRole('combobox',{name:'Dirección de fibra',exact:true})).toHaveValue('true');
 await expect(dialog.getByRole('textbox',{name:'Largo del panel (mm)',exact:true})).toHaveValue('2750');
 await page.screenshot({path:info.outputPath('ficha-placa.png')});
 await axe(page,'ficha');
 const apply=dialog.getByRole('button',{name:'Aplicar',exact:true});await expect(apply).toBeDisabled();
 await dialog.getByRole('button',{name:'Quitar espesor 3 mm',exact:true}).click();await expect(rows).toHaveCount(5);
 await dialog.getByRole('button',{name:'Agregar espesor',exact:true}).click();await expect(rows).toHaveCount(6);await expect(rows.nth(5)).toBeFocused();
 await rows.nth(5).fill('16');await dialog.getByRole('radio',{name:'Usar 16 mm como espesor de la ficha',exact:true}).check();
 await expect(dialog).toContainText('Ficha completa');
 await apply.click();await expect(dialog).toHaveCount(0);
 const saved=(requests('catalog_save')[0].data.items as FichaItem[]).find(row=>row.id===uuid(1))!;
 expect(saved).toMatchObject({thicknessMm:16,thicknessesMm:[5,12,15,16,18,25],sku:'CJ18',grain:true,lengthMm:2750,widthMm:1830});
 expect(requests('catalog_save')[0].data.revision).toBe(5);
 await expect(page.getByText('Ficha «Caju 18mm» guardada. Ficha completa.',{exact:true})).toBeVisible();
 await expect(card(page,'Caju 18mm').locator('.material-card-select')).toBeFocused();
 await expect(card(page,'Caju 18mm')).toContainText('Placa · 16 mm');
 expect(errors).toEqual([]);
});

test('Cancelar y Escape descartan sin guardar; el foco queda atrapado en la ficha y vuelve a la tarjeta',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await card(page,'Camellia').getByRole('button',{name:'Editar ficha Camellia',exact:true}).click();
 const dialog=ficha(page);await expect(dialog).toBeVisible();
 await dialog.getByRole('textbox',{name:'SKU',exact:true}).fill('CM18');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(requests('catalog_save')).toHaveLength(0);await expect(card(page,'Camellia').locator('.material-card-select')).toBeFocused();
 await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await expect(dialog.getByRole('textbox',{name:'SKU',exact:true})).toHaveValue('');
 // Tab desde el último control vuelve al primero; Shift+Tab desde el primero va al último.
 const apply=dialog.getByRole('button',{name:'Aplicar',exact:true});await dialog.getByRole('textbox',{name:'SKU',exact:true}).fill('X');
 await apply.focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Cerrar propiedades',exact:true})).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(apply).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(requests('catalog_save')).toHaveLength(0);
 await expect(card(page,'Camellia').locator('.material-card-select')).toBeFocused();
 expect(errors).toEqual([]);
});

test('canto: espesores 0,45 y 2 mm, ancho del canto; errores accesibles sin bloquear la ficha incompleta',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await card(page,'Camellia (variante)').locator('.material-card-select').click();
 const dialog=ficha(page);
 await expect(dialog.getByRole('textbox',{name:/^Espesor estándar/})).toHaveCount(2);
 await expect(dialog.getByRole('radio',{name:'Usar 0,45 mm como espesor de la ficha',exact:true})).toBeChecked();
 await expect(dialog.getByRole('textbox',{name:'Ancho del canto',exact:true})).toHaveValue('22');
 await expect(dialog.getByRole('combobox',{name:'Dirección de fibra'})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('ficha-canto.png')});
 const name=dialog.getByRole('textbox',{name:'Nombre',exact:true});await name.fill('');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();
 await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toBeFocused();await expect(dialog.getByText('Escribí un nombre para el material.',{exact:true})).toBeVisible();
 await name.fill('Camellia (variante)');await dialog.getByRole('textbox',{name:'Ancho del canto',exact:true}).fill('');
 await expect(dialog).toContainText('Ficha incompleta · para pedidos falta: ancho');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect((requests('catalog_save')[0].data.items as CatalogItem[]).find(row=>row.id===uuid(3))!.widthMm).toBeNull();
 await expect(page.getByText('Para pedidos falta: ancho.',{exact:false})).toBeVisible();
 expect(errors).toEqual([]);
});

test('+ Crear → Ficha nueva: el tipo trae sus espesores predeterminados y se guarda la lista',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await page.getByRole('button',{name:'Crear',exact:true}).click();await page.getByRole('button',{name:'Ficha nueva…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Nueva ficha de material',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:/^Espesor estándar/})).toHaveCount(6);
 await dialog.getByRole('combobox',{name:'Tipo',exact:true}).selectOption('edge');
 const rows=dialog.getByRole('textbox',{name:/^Espesor estándar/});await expect(rows).toHaveCount(2);await expect(rows.nth(0)).toHaveValue('0,45');await expect(rows.nth(1)).toHaveValue('2');
 await dialog.getByRole('textbox',{name:'Nombre',exact:true}).fill('Canto nogal');await dialog.getByRole('radio',{name:'Usar 2 mm como espesor de la ficha',exact:true}).check();
 await dialog.getByRole('textbox',{name:'Ancho del canto',exact:true}).fill('22');
 await dialog.getByRole('button',{name:'Crear ficha',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(requests('catalog_add')[0].data).toEqual({revision:5,item:{name:'Canto nogal',kind:'edge'}});
 const saved=(requests('catalog_save')[0].data.items as FichaItem[]).find(row=>row.name==='Canto nogal')!;
 expect(saved).toMatchObject({kind:'edge',thicknessMm:2,thicknessesMm:[0.45,2],widthMm:22});
 await expect(page.getByRole('region',{name:/^Cantos/}).getByRole('article',{name:'Material Canto nogal',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('Textura: vista, foto y uso en el modelo; con cambios sin aplicar no se pinta',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await card(page,'Caju 18mm').locator('.material-card-select').click();const dialog=ficha(page);
 await dialog.getByRole('tab',{name:'General',exact:true}).press('ArrowRight');
 const tab=dialog.getByRole('tab',{name:'Textura',exact:true});await expect(tab).toBeFocused();await expect(tab).toHaveAttribute('aria-selected','true');
 const panel=dialog.getByRole('tabpanel',{name:'Textura'});
 await expect(panel.getByText('1 material vinculado',{exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Asignar foto / textura',exact:true})).toBeEnabled();
 await page.screenshot({path:info.outputPath('ficha-textura.png')});await axe(page,'textura');
 await tab.press('ArrowLeft');await dialog.getByRole('textbox',{name:'SKU',exact:true}).fill('OTRO');
 await dialog.getByRole('tab',{name:'Textura',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Abrir paleta de pintura',exact:true})).toBeDisabled();
 await expect(panel).toContainText('Aplicá o cancelá los cambios de la ficha');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 await card(page,'Caju 18mm').locator('.material-card-select').click();await ficha(page).getByRole('tab',{name:'Textura',exact:true}).click();
 await ficha(page).getByRole('button',{name:'Abrir paleta de pintura',exact:true}).click();await expect(ficha(page)).toHaveCount(0);
 expect(requests('__paint')[0].data).toEqual({value:`${uuid(1)}:false`});
 await axe(page,'después de pintar');
 expect(errors).toEqual([]);
});

test('Precio opcional y exportar la ficha sola; el enlace a Taller abre cantos compatibles',async({page},info)=>{
 const errors=await harness(page,info.outputDir);
 await card(page,'Caju 18mm').locator('.material-card-select').click();const dialog=ficha(page);
 await dialog.getByRole('tab',{name:'Precio',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Precio (opcional)',exact:true}).fill('95000');
 await dialog.getByRole('button',{name:'Aplicar',exact:true}).click();await expect(dialog).toHaveCount(0);
 const saved=(requests('catalog_save')[0].data.items as FichaItem[]).find(row=>row.id===uuid(1))!;
 expect(saved.price).toMatchObject({amount:95000,currency:'ARS',unit:'placa',source:'Carga manual'});
 await card(page,'Caju 18mm').locator('.material-card-select').click();
 await ficha(page).getByRole('button',{name:'Exportar (.zip)…',exact:true}).click();
 await expect(page.getByText('Paquete «ficha.zip» exportado: 1 ficha',{exact:false})).toBeVisible();
 expect(requests('material_package_export')[0].data).toEqual({catalogIds:[uuid(1)],includeArchived:true});
 await ficha(page).getByRole('button',{name:'abrir en Taller',exact:true}).click();await expect(ficha(page)).toHaveCount(0);
 expect(requests('__edit')[0].data).toEqual({value:uuid(1)});
 expect(errors).toEqual([]);
});
