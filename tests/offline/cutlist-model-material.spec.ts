import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {CutlistData,CutlistPiece} from '../../sketchup_offline/ui/cutlistModel';

// Same synthetic cutlist contract used by cutlist-model.test.ts; no private model
// or SketchUp claims. Exercises the component callbacks, including null material.
const piece=(id:string,sectionKey:string,material:CutlistPiece['material']):CutlistPiece=>({id,ids:[id],code:'',codes:[],name:`Pieza ${id}`,furnitureId:'1',furnitureName:'Ensayo',quantity:1,lengthMm:700,widthMm:450,thicknessMm:18,rectangular:true,mirrored:false,material,sectionKey,edges:[],strips:[],grain:null,notes:[]});
const fixture=():CutlistData=>({schema:1,complete:true,readOnly:true,modelName:'Ensayo de fichas',unit:'mm',furniture:[{id:'1',name:'Ensayo'}],sections:[
 {key:'catalog:qa|18',source:'catalog',kind:'sheet',name:'Melamina QA',catalogId:'catalog-qa',thicknessMm:18,missing:[]},
 {key:'model:qa|18',source:'model',kind:'sheet',name:'Melamina QA',thicknessMm:18,missing:['ficha']},
 {key:'mixed:qa|18',source:'mixed',kind:'unknown',name:'Mezcla QA',thicknessMm:18,missing:['ficha']},
 {key:'none|18',source:'none',kind:'unknown',name:'Sin material',thicknessMm:18,missing:[]},
 ],edgeSections:[{key:'model:edge',source:'model',kind:'edge',name:'Canto nativo QA',observedIds:['native-edge-19'],thicknessMm:null,widthMm:null,missing:['ficha']}],pieces:[
 piece('1/1','catalog:qa|18',{source:'catalog',name:'Melamina QA',catalogId:'catalog-qa',observedId:'bound-22'}),
 {...piece('1/2','model:qa|18',{source:'model',name:'Melamina QA',observedId:'native-77'}),edges:[{side:'arr',status:'observed',lengthMm:700,name:'Canto nativo QA',observedIds:['native-edge-19'],edgeKey:'model:edge'}],strips:[{side:'arr',label:'Longitud del borde 1',edgeKey:'model:edge',lengthMm:700,widthMm:18,widthApprox:true,approximate:false}]},
 piece('1/3','mixed:qa|18',{source:'mixed',name:'Mezcla QA',observedIds:['native-77','native-88']}),
 piece('1/4','none|18',null),
 ]});

async function mount(page:Page,folder:string,data:CutlistData){
 const pageErrors:string[]=[];page.on('pageerror',error=>{pageErrors.push(error.message);console.error(error.message);});
 await mkdir(folder,{recursive:true});const entry=join(folder,'entry.tsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import{createRoot}from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import Cutlist from ${JSON.stringify(resolve('sketchup_offline/ui/CutlistView.tsx'))};const data=${JSON.stringify(data)};const load=async()=>data;window.__calls=[];createRoot(document.getElementById('root')).render(<Cutlist ready={true} load={load} onCreateMaterial={id=>window.__calls.push(['create',id])} onEditMaterial={id=>window.__calls.push(['edit',id])}/>);`);
 await build({entryPoints:[entry],nodePaths:[resolve('node_modules')],bundle:true,outfile:join(folder,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},format:'iife',platform:'browser'});
 await page.route('https://cutlist-native.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);await route.fulfill(name==='index.html'?{contentType:'text/html',body:'<html lang="es"><head><meta charset="utf-8"><title>Piezas QA</title><link rel="stylesheet" href="app.css"></head><body><main id="root"></main><script src="app.js"></script></body></html>'}:{body:await readFile(join(folder,name)),contentType:name.endsWith('.css')?'text/css':'text/javascript'});});
 await page.goto('https://cutlist-native.test/index.html');await expect(page.getByRole('table',{name:'Resumen por material'})).toBeVisible();
 return pageErrors;
}
const calls=(page:Page)=>page.evaluate(()=>(window as unknown as {__calls:string[][]}).__calls);

test('Piezas admite material nulo y distingue crear de editar aunque el nombre coincida',async({page},info)=>{
 const errors=await mount(page,info.outputDir,fixture()),summary=page.getByRole('table',{name:'Resumen por material'});
 await expect(summary.locator('tbody tr')).toHaveCount(5);
 await expect(summary.getByRole('button',{name:'Crear ficha de Sin material',exact:true})).toHaveCount(0);
 await summary.getByRole('button',{name:'Crear ficha de Melamina QA',exact:true}).click();
 await summary.getByRole('button',{name:'Editar la ficha de Melamina QA en Materiales',exact:true}).click();
 expect(await calls(page)).toEqual([['create','native-77'],['edit','catalog-qa']]);expect(errors).toEqual([]);
});

test('canto nativo elige su identidad y mezcla de dos materiales no escoge uno arbitrariamente',async({page},info)=>{
 const errors=await mount(page,info.outputDir,fixture()),summary=page.getByRole('table',{name:'Resumen por material'});
 await expect(summary.getByRole('button',{name:'Crear ficha de Mezcla QA',exact:true})).toHaveCount(0);
 await summary.getByRole('button',{name:'Crear ficha de Canto nativo QA',exact:true}).click();
 expect(await calls(page)).toEqual([['create','native-edge-19']]);expect(errors).toEqual([]);
});

test('varias piezas de un mismo material observado conservan un único destino',async({page},info)=>{
 const data=fixture();data.pieces.push(piece('1/5','model:qa|18',{source:'model',name:'Melamina QA',observedIds:['native-77']}));
 const errors=await mount(page,info.outputDir,data),create=page.getByRole('button',{name:'Crear ficha de Melamina QA',exact:true});
 await expect(create).toHaveCount(1);await create.click();expect(await calls(page)).toEqual([['create','native-77']]);expect(errors).toEqual([]);
});
