import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {CatalogItem} from '../../sketchup_offline/ui/WorkshopPanel';
// Hito 7 material management: UI/bridge contract only. Every new action is an
// in-memory double; no SketchUp, no real ZIP, SKM, texture or OCL attribute here.
type Call={action:string;data:Record<string,unknown>};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base=(id:string,patch:Partial<CatalogItem>):CatalogItem=>({id,name:'',kind:'sheet',sku:'',supplier:'',thicknessMm:18,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'2026-10-22T00:00:00Z',sourceHash:'0'.repeat(64),observed:{},...patch});
let calls:Call[],items:CatalogItem[],archived:string[],revision:number,next:number;
const requests=(action:string)=>calls.filter(call=>call.action===action);
async function harness(page:Page,folder:string,mode:'library'|'palette'|'photo'){
 calls=[];revision=3;next=10;archived=[];
 items=[base(uuid(1),{name:'Roble foto QA',lengthMm:2600,widthMm:1830,sku:'R18',supplier:'Maderera QA',observed:{source:'photo',photo:{schema:1,designReady:true,widthPx:2000,heightPx:1000,textureScale:{verified:false,widthMm:null,heightMm:null}}}}),
  base(uuid(2),{name:'Canto blanco QA',kind:'edge',thicknessMm:0.45,approved:true,sku:'C22',supplier:'Maderera QA',widthMm:22}),base(uuid(3),{name:'Herraje QA',kind:'unknown',thicknessMm:null})];
 let tool={active:false,mode:'sheet',queuedCount:0} as Record<string,unknown>;
 await mkdir(folder,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'planos-hito7-entry-'));const entry=join(temp,'entry.jsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Library from ${JSON.stringify(resolve('sketchup_offline/ui/MaterialLibraryPanel.tsx'))};import Palette from ${JSON.stringify(resolve('sketchup_offline/ui/SmartPaintPalette.tsx'))};import Photo from ${JSON.stringify(resolve('sketchup_offline/ui/PhotoMaterialPanel.tsx'))};
const root=createRoot(document.getElementById('root'));
root.render(window.harnessMode==='photo'?React.createElement(Photo,{onClose:()=>{},onCreated:()=>{}}):window.harnessMode==='palette'?React.createElement(Palette,{quickMode:true,initialCompact:true,autoStart:true,initialCatalogId:${JSON.stringify(uuid(1))},onClose:()=>{},onManage:()=>{},onApplied:()=>{}}):React.createElement(Library,{onEdit:()=>{},onPaint:(id,autoStart)=>window.harnessPaint(id,!!autoStart),onApplied:()=>{}}));`);
 await build({entryPoints:[entry],absWorkingDir:process.cwd(),outdir:folder,entryNames:'app',bundle:true,minify:true,format:'iife',platform:'browser',target:'chrome109',jsx:'automatic',loader:{'.css':'css'},define:{'process.env.NODE_ENV':'"production"'}}).finally(()=>rm(temp,{recursive:true,force:true}));
 await page.exposeFunction('harnessPaint',(id:string,autoStart:boolean)=>{calls.push({action:'__paint',data:{id,autoStart}});});
 await page.exposeFunction('hito7Request',(raw:string)=>{
  const message=JSON.parse(raw),{action,data}=message as {action:string;data:Record<string,unknown>};calls.push({action,data});let result:unknown;
  const library=()=>({catalog:{schema:1,revision,items},rows:[{catalogId:uuid(1),name:'Roble foto QA',sourceName:'Foto propia',thumbnail:pixel}],materials:[{id:'501',name:'Roble foto QA',hasTexture:true,binding:{catalogId:uuid(1),kind:'sheet',uuid:'photo-uuid'},issues:[]}],visuals:[{catalogId:uuid(1),available:true,designReady:true}],assetRevision:2});
  if(action==='skm_library')result=library();
  else if(action==='material_extras')result={archivedIds:archived,statesRevision:archived.length};
  else if(action==='material_duplicate'){const source=items.find(row=>row.id===data.catalogId)!;const copy={...source,id:uuid(next++),name:String(data.name),approved:false,favorite:false};items=[...items,copy];revision++;result={catalog:{schema:1,revision,items},catalogId:copy.id,duplicatedFrom:source.id,name:copy.name,warnings:[]};}
  else if(action==='material_archive'){
   const ids=data.catalogIds as string[];const rows=ids.map(id=>({catalogId:id,name:items.find(row=>row.id===id)!.name,inModel:id===uuid(1)?1:0,compatibleWith:id===uuid(2)?2:0,warnings:id===uuid(2)?['Este canto sigue siendo compatible con placas activas.']:[]}));
   if(data.dryRun)result={archivedIds:archived,changed:0,rows,noChanges:true};
   else{archived=data.archived?[...new Set([...archived,...ids])]:archived.filter(id=>!ids.includes(id));result={archivedIds:archived,changed:ids.length,rows};}
  }else if(action==='material_package_export')result={fileName:'biblioteca-taller.zip',items:items.filter(row=>!archived.includes(row.id)).length,files:4,bytes:204800,sha256:'a'.repeat(64)};
  else if(action==='material_package_preview')result={token:'pkg-token',revision,package:{items:3,files:5,bytes:3*1024*1024,createdAt:'2026-10-22T00:00:00Z'},rows:[{id:'p1',name:'Nogal paquete QA',kind:'sheet',status:'new',thumbnail:pixel,files:3,warnings:[]},{id:'p2',name:'Roble foto QA',kind:'sheet',status:'conflict',thumbnail:pixel,files:3,warnings:[]},{id:'p3',name:'Canto blanco QA',kind:'edge',status:'duplicate',thumbnail:null,files:1,warnings:[]}]};
  else if(action==='material_package_commit'){const renames=data.renames as Record<string,string>;const names:Record<string,string>={p1:'Nogal paquete QA',p2:'Roble foto QA'};const added=(data.selectedIds as string[]).map(id=>base(uuid(next++),{name:renames[id]||names[id]}));items=[...items,...added];revision++;result={catalog:{schema:1,revision,items},imported:added.length,skipped:0};}
  else if(action==='material_package_cancel')result={cancelled:true};
  else if(action==='material_texture_preview'||action==='material_texture_apply'){
   const proposed={widthMm:data.widthMm,heightMm:data.heightMm,rotation:data.rotation};
   result=action==='material_texture_preview'?{catalogId:data.catalogId,current:{widthMm:null,heightMm:null,verified:false},proposed,pixels:{widthPx:2000,heightPx:1000},thumbnail:null,affected:[{materialId:'501',name:'Roble foto QA'}],materialIds:['501'],revision,assetRevision:2,repeats:null,warnings:['La veta de corte se confirma por pieza.'],noChanges:true}
    :{catalogId:data.catalogId,applied:[{materialId:'501',name:'Roble foto QA',widthMm:data.widthMm,heightMm:data.heightMm}],textureScale:{verified:true,widthMm:data.widthMm,heightMm:data.heightMm},rotation:data.rotation,verification:{ok:true,checked:1},warnings:[]};
  }else if(action==='material_ocl_sync'){
   const row={materialId:'501',name:'Roble foto QA',catalogId:uuid(1),status:data.dryRun?'updated':'updated',changes:[{key:'std_thicknesses',from:'15mm',to:'18mm',action:'update'},{key:'std_sizes',from:null,to:'2600mm x 1830mm',action:'write'}],kept:[{key:'grained',current:true,proposed:false}]};
   if(!data.dryRun&&data.planDigest!=='plan-digest-qa')return {version:1,id:message.id,result:null,error:'La vista previa de OpenCutList venció.'};
   result={dryRun:!!data.dryRun,changed:2,materials:[row],...(data.dryRun?{noChanges:true,planDigest:'plan-digest-qa'}:{})};
  }else if(action==='smart_palette_load')result={catalog:{schema:1,revision,items},visuals:{materials:[{id:'501',designReady:true,name:'Roble foto QA',hasTexture:true,color:[113,81,55],binding:{uuid:'photo-uuid',catalogId:uuid(1),kind:'sheet'},issues:[]}]},thumbnails:{[uuid(1)]:pixel},settings:{scope:'all',axes:[0,1],batch:true,paintScope:'face',side:'front'},toolState:tool};
  else if(action==='smart_palette_compact')result={compact:data.compact};
  else if(action==='smart_quick_start'||action==='smart_tool_start'){tool={active:true,mode:'sheet',options:{...data,scope:'unique'},queuedCount:0};result={toolState:tool};}
  else if(action==='smart_tool_status')result={toolState:tool};
  else if(action==='smart_tool_stop'){tool={...tool,active:false};result={toolState:tool};}
  else if(action==='viewport_focus')result={focused:true,method:'Sketchup.focus'};
  else if(action==='material_photo_pick')result={token:'photo-token',revision,sourceHash:'b'.repeat(64),name:'Nogal QA',widthPx:3000,heightPx:1000,preview:pixel,duplicates:[],warnings:[],scaleVerified:false};
  else if(action==='material_photo_cancel')result={cancelled:true};
  else if(action==='material_photo_create')result={catalogId:uuid(9),materialUuid:'u',designReady:true};
  else if(action==='diagnostic')result={extensionVersion:'0.8.10'};
  else throw Error('Unexpected action '+action);
  return {version:1,id:message.id,result,error:null};
 });
 await page.addInitScript(harnessMode=>{const w=window as unknown as {harnessMode:string;hito7Request:(raw:string)=>Promise<unknown>;sketchup:{request:(raw:string)=>void};PlanosSantoBridge:{receive:(reply:unknown)=>void}};w.harnessMode=harnessMode;w.sketchup={request:raw=>{void w.hito7Request(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};},mode);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://hito7.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="app.css"><div id="root"></div><script src="app.js"></script></html>'}:{contentType:name.endsWith('.js')?'text/javascript':'text/css',body:await readFile(resolve(folder,name)).catch(()=>'')});});
 await page.context().setOffline(true);await page.goto('https://hito7.test/index.html');
 if(mode==='library')await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
 return errors;
}
const details=(page:Page)=>page.getByRole('complementary',{name:'Material seleccionado'});
const select=(page:Page,name:string)=>page.getByRole('article',{name:`Material ${name}`,exact:true}).locator('.material-card-select').click();

test('archivar oculta la ficha de la biblioteca activa sin borrarla y restaurar la devuelve',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 await expect(page.getByRole('button',{name:'Archivados',exact:true})).toContainText('0');
 await select(page,'Canto blanco QA');await details(page).getByRole('button',{name:'Archivar ficha',exact:true}).click();
 const confirm=page.getByRole('group',{name:'Confirmar archivado'});await expect(confirm).toContainText('Compatible con 2 fichas activas');await expect(confirm).toContainText('sigue siendo compatible');
 expect(requests('material_archive')[0].data).toMatchObject({catalogIds:[uuid(2)],archived:true,dryRun:true,revision:3,statesRevision:0});
 await confirm.getByRole('button',{name:'Sí, archivar',exact:true}).click();
 await expect(page.getByText('archivada. No se borró la ficha',{exact:false})).toBeVisible();
 await expect(page.getByRole('article',{name:'Material Canto blanco QA',exact:true})).toHaveCount(0);expect(items).toHaveLength(3);
 await page.getByRole('button',{name:'Archivados',exact:true}).click();await expect(page.getByRole('article',{name:/^Material /})).toHaveCount(1);await expect(page.getByRole('article',{name:'Material Canto blanco QA',exact:true})).toContainText('Archivada');
 await details(page).getByRole('button',{name:'Restaurar ficha',exact:true}).click();await page.getByRole('group',{name:'Confirmar restauración'}).getByRole('button',{name:'Sí, restaurar',exact:true}).click();
 await expect(page.getByText('restaurada en la biblioteca activa',{exact:false})).toBeVisible();expect(archived).toEqual([]);
 await expect(page.getByRole('button',{name:'Todos',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('article',{name:/^Material /})).toHaveCount(3);
 await page.getByRole('button',{name:'Archivados',exact:true}).click();await expect(page.getByText('No hay fichas archivadas',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('duplicar propone un nombre único y la copia queda seleccionada sin aprobar',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 await select(page,'Canto blanco QA');await details(page).getByRole('button',{name:'Duplicar ficha',exact:true}).click();
 const name=page.getByRole('textbox',{name:'Nombre de la copia',exact:true});await expect(name).toBeFocused();await expect(name).toHaveValue('Canto blanco QA (copia)');
 await name.fill('');await expect(page.getByRole('button',{name:'Crear copia',exact:true})).toBeDisabled();
 await name.fill('Canto blanco QA 2 mm');await page.getByRole('button',{name:'Crear copia',exact:true}).click();
 await expect(page.getByText('Copia creada: «Canto blanco QA 2 mm»',{exact:false})).toBeVisible();
 expect(requests('material_duplicate')[0].data).toEqual({catalogId:uuid(2),revision:3,name:'Canto blanco QA 2 mm',confirmed:true});
 await expect(details(page).getByRole('heading',{name:'Canto blanco QA 2 mm',exact:true})).toBeVisible();expect(items.find(row=>row.name==='Canto blanco QA 2 mm')!.approved).toBe(false);
 expect(errors).toEqual([]);
});

test('paquete .zip: exporta con aviso y la importación exige renombrar el conflicto; Escape cancela',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 await page.getByRole('button',{name:'Exportar paquete .zip',exact:true}).click();await expect(page.getByText('Paquete «biblioteca-taller.zip» exportado: 3 fichas y 4 archivos verificados.',{exact:false})).toBeVisible();
 expect(requests('material_package_export')[0].data).toEqual({includeArchived:false});
 const trigger=page.getByRole('button',{name:'Importar paquete .zip',exact:true});await trigger.click();
 const modal=page.getByRole('dialog',{name:'Revisar paquete de materiales'});await expect(modal).toBeVisible();await expect(modal).toBeFocused();
 await expect(modal).toContainText('1 nuevas');await expect(modal).toContainText('1 ya en la biblioteca');await expect(modal.getByRole('checkbox',{name:'Importar ficha Canto blanco QA',exact:true})).toBeDisabled();
 await modal.getByRole('checkbox',{name:'Importar ficha Roble foto QA',exact:true}).check();await expect(modal.getByRole('button',{name:'Importar 2 fichas',exact:true})).toBeDisabled();
 await modal.getByRole('textbox',{name:'Resolver nombre de Roble foto QA',exact:true}).fill('Roble foto QA importado');await modal.getByRole('button',{name:'Importar 2 fichas',exact:true}).click();
 await expect(modal).toHaveCount(0);await expect(page.getByText('2 fichas importadas del paquete',{exact:false})).toBeVisible();
 expect(requests('material_package_commit')[0].data).toEqual({token:'pkg-token',revision:3,selectedIds:['p1','p2'],renames:{p2:'Roble foto QA importado'},confirmed:true});
 await expect(page.getByRole('article',{name:'Material Roble foto QA importado',exact:true})).toHaveCount(1);await expect(trigger).toBeFocused();
 await trigger.click();await expect(modal).toBeVisible();
 // While the panel is busy Escape is ignored on purpose: wait until it is idle.
 await expect(page.locator('.visual-material-library')).toHaveAttribute('aria-busy','false');await expect(modal.getByRole('button',{name:'Cerrar vista previa del paquete',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);expect(requests('material_package_cancel')).toHaveLength(1);await expect(trigger).toBeFocused();
 expect(requests('material_package_commit')).toHaveLength(1);expect(errors).toEqual([]);
});

test('escala y giro: el candado sigue la proporción, girar intercambia lados y aplicar exige verificar',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 await select(page,'Roble foto QA');await details(page).getByRole('button',{name:'Ajustar escala y giro',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ajustar escala y giro de textura'});await expect(dialog).toBeFocused();
 await expect(dialog.getByRole('checkbox',{name:'Mantener proporción de la textura',exact:true})).toBeChecked();
 await dialog.getByRole('spinbutton',{name:'Ancho de textura ajustada',exact:true}).fill('1300');await expect(dialog.getByRole('spinbutton',{name:'Alto de textura ajustada',exact:true})).toHaveValue('650');
 await expect(dialog).toContainText('se repite 2 veces a lo largo y 2,82 a lo ancho');
 const apply=dialog.getByRole('button',{name:'Aplicar al material',exact:true});await expect(apply).toBeDisabled();
 await dialog.getByRole('button',{name:'Girar 90° a la derecha',exact:true}).click();await expect(dialog.getByRole('status').first()).toContainText('Giro: 90°');
 await expect(dialog.getByRole('spinbutton',{name:'Ancho de textura ajustada',exact:true})).toHaveValue('650');await expect(dialog.getByRole('spinbutton',{name:'Alto de textura ajustada',exact:true})).toHaveValue('1300');
 await dialog.getByRole('button',{name:'Verificar vista previa',exact:true}).click();await expect(dialog.getByRole('group',{name:'Resultado de la verificación'})).toContainText('Se actualizarán 1 material');
 expect(requests('material_texture_preview')[0].data).toEqual({catalogId:uuid(1),widthMm:650,heightMm:1300,rotation:90});
 await apply.click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Textura ajustada y verificada en 1 material del modelo.',{exact:false})).toBeVisible();
 expect(requests('material_texture_apply')[0].data).toEqual({catalogId:uuid(1),widthMm:650,heightMm:1300,rotation:90,materialIds:['501'],revision:3,assetRevision:2,confirmed:true});
 expect(errors).toEqual([]);
});

test('OpenCutList: la vista previa lista cambios y conserva valores del usuario antes de confirmar',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 await select(page,'Herraje QA');await expect(details(page).getByRole('button',{name:'Sincronizar con OpenCutList',exact:true})).toBeDisabled();
 await select(page,'Roble foto QA');await details(page).getByRole('button',{name:'Sincronizar con OpenCutList',exact:true}).click();
 const plan=page.getByRole('group',{name:'Cambios para OpenCutList'});await expect(plan.getByRole('list',{name:'Cambios en Roble foto QA'})).toContainText('std_thicknesses: 15mm → 18mm');
 await expect(plan.getByRole('list',{name:'Valores del usuario conservados en Roble foto QA'})).toContainText('grained: se conserva true');
 expect(requests('material_ocl_sync')).toHaveLength(1);expect(requests('material_ocl_sync')[0].data).toEqual({catalogId:uuid(1),dryRun:true});
 await plan.getByRole('button',{name:'Aplicar 2 cambios',exact:true}).click();await expect(page.getByText('OpenCutList sincronizado: 2 cambios',{exact:false})).toBeVisible();await expect(page.getByText('Se conservaron 1 valor cargado por el usuario.',{exact:false})).toBeVisible();
 expect(requests('material_ocl_sync')[1].data).toEqual({catalogId:uuid(1),dryRun:false,confirmed:true,planDigest:'plan-digest-qa'});
 expect(errors).toEqual([]);
});

test('búsqueda: Escape la limpia, las flechas recorren tarjetas y "Pintar en el modelo" inicia con autoStart',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'library');
 const search=page.getByRole('searchbox',{name:'Buscar materiales del taller'});await search.fill('zzz');await expect(page.getByText('Ningún material coincide con «zzz»',{exact:true})).toBeVisible();
 await search.press('Escape');await expect(search).toHaveValue('');await expect(page.getByRole('article',{name:/^Material /})).toHaveCount(3);
 await search.fill('roble');await expect(page.getByRole('button',{name:'Limpiar búsqueda',exact:true})).toBeVisible();await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();await expect(search).toBeFocused();await expect(search).toHaveValue('');
 const cards=page.locator('.material-card-select');await expect(cards.nth(0)).toHaveAttribute('tabindex','0');await expect(cards.nth(1)).toHaveAttribute('tabindex','-1');
 await cards.nth(0).focus();await page.keyboard.press('End');await expect(cards.nth(2)).toBeFocused();await page.keyboard.press('Home');await expect(cards.nth(0)).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(cards.nth(1)).toBeFocused();await expect(cards.nth(1)).toHaveAttribute('tabindex','0');
 await expect(page.getByRole('group',{name:'Materiales visuales del taller'})).toBeVisible();
 await select(page,'Roble foto QA');await details(page).getByRole('button',{name:'Pintar en el modelo',exact:true}).click();
 expect(requests('__paint')[0].data).toEqual({id:uuid(1),autoStart:true});
 expect(errors).toEqual([]);
});

test('MATERIALES-19: tras iniciar la pintura desde la biblioteca se pide foco al viewport',async({page},info)=>{
 await page.setViewportSize({width:680,height:320});
 const errors=await harness(page,info.outputDir,'palette');
 await expect.poll(()=>requests('smart_quick_start').length).toBe(1);await expect.poll(()=>requests('viewport_focus').length).toBe(1);
 const order=calls.map(call=>call.action);expect(order.indexOf('viewport_focus')).toBeGreaterThan(order.indexOf('smart_quick_start'));
 expect(errors).toEqual([]);
});

test('foto: candado de proporción, errores accesibles y Enter guarda sin pintar',async({page},info)=>{
 const errors=await harness(page,info.outputDir,'photo');
 const dialog=page.getByRole('dialog',{name:'Material desde una foto'});await dialog.getByRole('button',{name:'Elegir foto (JPG/PNG)',exact:true}).click();
 const name=dialog.getByRole('textbox',{name:'Nombre del material desde foto',exact:true});await expect(name).toHaveValue('Nogal QA');
 await name.fill('');await expect(name).toHaveAttribute('aria-invalid','true');await expect(dialog.getByText('Escribí un nombre para el material.',{exact:true})).toBeVisible();
 await dialog.getByText('Escala de textura (opcional)',{exact:true}).click();await dialog.getByRole('checkbox',{name:'Confirmar escala física de la textura',exact:true}).check();
 await expect(dialog.getByRole('checkbox',{name:'Mantener la proporción de la foto',exact:true})).toBeChecked();
 await dialog.getByRole('spinbutton',{name:'Ancho físico de textura',exact:true}).fill('1500');await expect(dialog.getByRole('spinbutton',{name:'Alto físico de textura',exact:true})).toHaveValue('500');
 await name.fill('Nogal del taller');await name.press('Enter');await expect.poll(()=>requests('material_photo_create').length).toBe(1);
 expect(requests('material_photo_create')[0].data).toMatchObject({action:'new',name:'Nogal del taller',textureWidthMm:1500,textureHeightMm:500,confirmed:true});
 expect(errors).toEqual([]);
});
