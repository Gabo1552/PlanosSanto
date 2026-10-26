import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
test.setTimeout(20_000);
import type {FichaItem} from '../../sketchup_offline/ui/materialLibraryModel';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
type Call={action:string;data:Record<string,unknown>};let calls:Call[],errors:string[];
test.afterEach(()=>expect(errors).toEqual([]));
async function mount(page:Page,folder:string,kind='sheet',bound=false,direct=false,staleCatalog=false){
 errors=[];page.on('pageerror',error=>errors.push(error.message));calls=[];let saved=false,libraryLoads=0;const item:FichaItem={id:'qa-native',name:'Madera modelo QA',kind,sku:'',supplier:'',thicknessMm:kind==='sheet'?18:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},thicknessesMm:kind==='sheet'?[18]:[],widthsMm:[]};
 await mkdir(folder,{recursive:true});const entry=join(folder,'entry.tsx');await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import{createRoot}from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Library from ${JSON.stringify(resolve('sketchup_offline/ui/MaterialLibraryPanel.tsx'))};createRoot(document.getElementById('root')).render(<Library initialModelMaterialId={${direct&&!staleCatalog?"'m-77'":'undefined'}} initialCatalogId={${staleCatalog?"'qa-native'":'undefined'}} navigationRequestKey={1} onEdit={()=>window.badPaint()} onPaint={()=>window.badPaint()}/>);`);
 await build({entryPoints:[entry],nodePaths:[resolve('node_modules')],bundle:true,outfile:join(folder,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},format:'iife',platform:'browser'});
 await page.exposeFunction('badPaint',()=>{calls.push({action:'__paint',data:{}});});await page.exposeFunction('modelRequest',(raw:string)=>{const {action,data,id}=JSON.parse(raw);calls.push({action,data});let result:unknown;
 const catalog=()=>({schema:4,revision:saved?2:1,items:(saved||bound)&&(!staleCatalog||libraryLoads>1)?[item]:[]});
 if(action==='skm_library'){libraryLoads++;result={catalog:catalog(),rows:[],materials:[{id:'m-77',name:item.name,color:[135,100,60],hasTexture:true,binding:saved||bound?{catalogId:item.id,kind:item.kind,uuid:'uuid-native'}:null}],assetRevision:1,ambiguous:[]};}
 else if(action==='material_extras')result={archivedIds:[]};
 else if(action==='material_model_preview')result=bound?{existingCatalogId:item.id}:{token:'qa-token',revision:1,assetRevision:1,materialId:'m-77',item,thumbnail:pixel,color:[135,100,60],warnings:kind==='unknown'?['Tipo no informado por OpenCutList.']:['Falta el formato de placa.']};
 else if(action==='material_model_commit'){Object.assign(item,data.item);saved=true;result={catalogId:item.id};}
 else if(action==='material_model_cancel')result={cancelled:true};
 else throw Error('Unexpected action '+action);
 return {version:1,id,result,error:null};});
 await page.addInitScript(()=>{const w=window as unknown as {modelRequest:(s:string)=>Promise<unknown>;sketchup:unknown;PlanosSantoBridge:{receive:(v:unknown)=>void}};w.sketchup={request:(s:string)=>w.modelRequest(s).then(v=>w.PlanosSantoBridge.receive(v))};});
 await page.route('https://model-ficha.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<html lang="es"><head><meta charset="utf-8"><title>Ficha QA</title><link rel="stylesheet" href="app.css"></head><body><main id="root"></main><script src="app.js"></script></body></html>'}:{body:await readFile(join(folder,name)),contentType:name.endsWith('.css')?'text/css':'text/javascript'});});await page.goto('https://model-ficha.test/index.html');await expect(page.getByRole('heading',{name:'Materiales del taller',exact:true})).toBeVisible();
}
test('material nativo: extraer datos, conservar textura y guardar ficha sin Pintar',async({page},info)=>{
 await mount(page,info.outputDir);await page.getByRole('button',{name:'Revisar materiales del modelo'}).click();await page.getByRole('button',{name:'Crear ficha desde material'}).click();const dialog=page.getByRole('dialog',{name:'Crear ficha desde «Madera modelo QA»'});
 await expect(dialog.getByLabel('Nombre',{exact:true})).toHaveValue('Madera modelo QA');await expect(dialog.getByLabel('Espesor disponible 1 (mm)')).toHaveValue('18');await expect(dialog.getByLabel('Largo del panel (mm)')).toHaveValue('');
 await dialog.getByRole('tab',{name:'Textura',exact:true}).click();await expect(dialog.getByRole('img',{name:'Miniatura real de Madera modelo QA'})).toHaveAttribute('src',pixel);await expect(dialog.getByRole('button',{name:'Pintar en el modelo'})).toHaveCount(0);
 await dialog.getByRole('tab',{name:'General',exact:true}).click();await page.screenshot({path:info.outputPath('ficha-material-modelo-SINTETICO.png'),fullPage:true});await dialog.getByLabel('Largo del panel (mm)').fill('2750');await dialog.getByLabel('Ancho del panel (mm)').fill('1830');await dialog.getByRole('button',{name:'Guardar ficha y vincular'}).click();await expect(dialog).toHaveCount(0);
 const commit=calls.find(call=>call.action==='material_model_commit')!;expect(commit.data).toMatchObject({token:'qa-token',revision:1,assetRevision:1,item:{name:'Madera modelo QA',thicknessesMm:[18],lengthMm:2750,widthMm:1830}});expect(calls.filter(call=>(call.action.startsWith('smart_')||call.action==='__paint'))).toEqual([]);
});
test('sin tipo OCL: elegir placa, canto o herraje explícitamente, sin medidas inventadas',async({page},info)=>{
 await mount(page,info.outputDir,'unknown',false,true);const dialog=page.getByRole('dialog',{name:'Crear ficha desde «Madera modelo QA»'});await dialog.getByRole('button',{name:'Guardar ficha y vincular'}).click();await expect(dialog.getByRole('alert')).toHaveText('Elegí Placa, Canto o Herraje para crear esta ficha.');expect(calls.some(call=>call.action==='material_model_commit')).toBe(false);await dialog.getByLabel('Tipo',{exact:true}).selectOption('edge');await expect(dialog.getByLabel(/Espesor estándar \d/)).toHaveCount(0);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(calls.some(call=>call.action==='material_model_cancel')).toBe(true);
});
test('vínculo existente abre propiedades por identidad y no crea otra ficha',async({page},info)=>{
 await mount(page,info.outputDir,'sheet',true,true);await expect(page.getByRole('dialog',{name:'Propiedades del material «Madera modelo QA»'})).toBeVisible();expect(calls.filter(call=>call.action==='material_model_commit')).toEqual([]);expect(calls.some(call=>(call.action.startsWith('smart_')||call.action==='__paint'))).toBe(false);
});
test('canto manual: completa espesor y ancho en el editor existente y conserva identidad nativa',async({page},info)=>{
 await mount(page,info.outputDir,'unknown',false,true);const dialog=page.getByRole('dialog',{name:'Crear ficha desde «Madera modelo QA»'});await dialog.getByLabel('Tipo',{exact:true}).selectOption('edge');await dialog.getByRole('button',{name:'Agregar espesor',exact:true}).click();await dialog.getByLabel('Espesor estándar 1 (mm)').fill('0,8');await dialog.getByRole('radio',{name:'Usar 0,8 mm como espesor de la ficha'}).check();await dialog.getByRole('button',{name:'Agregar ancho',exact:true}).click();await dialog.getByLabel('Ancho estándar 1 (mm)').fill('22');await dialog.getByRole('button',{name:'Guardar ficha y vincular'}).click();await expect(dialog).toHaveCount(0);expect(calls.find(call=>call.action==='material_model_commit')?.data).toMatchObject({token:'qa-token',item:{kind:'edge',thicknessMm:0.8,widthsMm:[22]}});expect(calls.some(call=>call.action==='__paint')).toBe(false);
});

test('cancelar ficha nativa devuelve foco al botón del material',async({page},info)=>{
 await mount(page,info.outputDir);await page.getByRole('button',{name:'Revisar materiales del modelo'}).click();const trigger=page.getByRole('button',{name:'Crear ficha desde material'});await trigger.click();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await expect(trigger).toBeFocused();
});

test('solicitud de ficha existente refresca una biblioteca desactualizada antes de abrir',async({page},info)=>{
 await mount(page,info.outputDir,'sheet',true,true,true);await expect(page.getByRole('dialog',{name:'Propiedades del material «Madera modelo QA»'})).toBeVisible();expect(calls.filter(call=>call.action==='skm_library')).toHaveLength(2);expect(calls.some(call=>call.action==='material_model_commit'||call.action==='__paint')).toBe(false);
});
