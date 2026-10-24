import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import AxeBuilder from '@axe-core/playwright';

// Synthetic component harness: no real model, commercial material or SketchUp claim.
async function mount(page:Page,folder:string,busy=false,blocked=false,outsideCount=0){
 await mkdir(folder,{recursive:true});const entry=join(folder,'entry.tsx');
 await writeFile(entry,`import React from ${JSON.stringify(resolve('node_modules/react'))};import{createRoot}from ${JSON.stringify(resolve('node_modules/react-dom/client'))};import View from ${JSON.stringify(resolve('sketchup_offline/ui/SheetOptimizationView.tsx'))};
 const materials=['Roble de ensayo','Blanco de ensayo'].map((name,i)=>({key:'mat-'+i,materialId:'m'+i,name,sku:'QA-'+i,thicknessMm:18,grain:!!i,lengthMm:2750,widthMm:1830,trimMm:10,kerfMm:4,status:'ok',pieces:1,unsized:0,rotatable:0,sheets:[{placements:[{id:'piece-'+i,x:10,y:10,w:900,h:500,rotated:false}],usedMm2:450000}],layouts:[{sheetNumbers:[1],layout:{placements:[{id:'piece-'+i,x:10,y:10,w:900,h:500,rotated:false}],usedMm2:450000}}],legend:[{key:'A',base:900,height:500,count:1,details:['Lateral ensayo']}],keys:{['piece-'+i]:'A'},oversize:[],netM2:.45,boughtM2:5.0325,utilization:.0894}));
 if(${blocked})Object.assign(materials[0],{status:'blocked',errors:['El motor no pudo ubicar esta placa'],sheets:[],layouts:[]});
 const boards=materials.map((m,i)=>({...m,rowIds:['piece-'+i],edges:[],problems:i?[{id:'piece-'+i,detail:'Lateral ensayo',reasons:['Falta confirmar orientación']}]:[],blocker:null,edgeNotes:0,fileName:'QA-'+i+'.txt'}));
 createRoot(document.getElementById('root')).render(<View result={{materials,trimMm:10,kerfMm:4,allowRotate:false}} boards={boards} busy={${busy}} exporting="" outsideCount={${outsideCount}} methodLabel="Experto" renderSettings={key=><p>Configuración de {key}</p>} onExport={board=>window.lastExport=board.key} onHighlight={id=>window.lastHighlight=id}/>);`);
 const bundle=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',target:'chrome109',define:{'process.env.NODE_ENV':'"production"'}});
 await page.setContent('<html lang="es"><head><title>Planos Santo · Ensayo sintético</title></head><body><main id="root" class="workshop-panel"></main></body></html>');
 await page.addStyleTag({content:'body{font-family:Arial,sans-serif;color:#242437;background:#f6f5f2;margin:24px}button{font:inherit}'+await readFile('sketchup_offline/ui/workshop.css','utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
}
test('materiales: teclado abre solo un detalle, exporta, vuelve al foco y permite revisar bloqueos',async({page},info)=>{
 await mount(page,info.outputDir);const first=page.getByRole('button',{name:'Ver optimización de Roble de ensayo · 18 mm'});
 await expect(page.getByRole('img')).toHaveCount(0);await expect(page.getByText('TXT listo',{exact:true})).toBeVisible();await expect(page.getByText('TXT bloqueado',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('despues-resumen-SINTETICO.png'),fullPage:true});
 await first.focus();await page.keyboard.press('Enter');const back=page.getByRole('button',{name:'Volver a materiales',exact:false});await expect(back).toBeFocused();
 await expect(page.getByRole('region',{name:'Roble de ensayo · 18 mm',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Blanco de ensayo · 18 mm',exact:true})).toHaveCount(0);await expect(page.getByText('Configuración de mat-0')).toBeVisible();
 await page.getByRole('button',{name:'Exportar TXT de Roble de ensayo · 18 mm'}).click();expect(await page.evaluate(()=>(window as unknown as {lastExport:string}).lastExport)).toBe('mat-0');
 await page.screenshot({path:info.outputPath('despues-detalle-SINTETICO.png'),fullPage:true});
 await back.click();await expect(first).toBeFocused();await page.getByRole('button',{name:'Ver optimización de Blanco de ensayo · 18 mm'}).click();await expect(page.getByRole('button',{name:'Exportar TXT de Blanco de ensayo · 18 mm'})).toBeDisabled();
 await page.getByRole('button',{name:/Ver en el modelo/}).click();expect(await page.evaluate(()=>(window as unknown as {lastHighlight:string}).lastHighlight)).toBe('piece-1');
 const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(violations).toEqual([]);
});
test('materiales: compacto sin desborde, validación pendiente impide exportar',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await mount(page,info.outputDir,true);await expect(page.getByRole('status')).toHaveText('Actualizando medidas y validaciones…');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'Ver optimización de Roble de ensayo · 18 mm'}).click();await expect(page.getByRole('button',{name:'Exportar TXT de Roble de ensayo · 18 mm'})).toBeDisabled();
});

test('materiales: motor bloqueado conserva diagnóstico y marca total parcial',async({page},info)=>{
 await mount(page,info.outputDir,false,true);await expect(page.getByText('Total parcial · hay piezas sin ubicar')).toBeVisible();const card=page.getByRole('button',{name:'Ver optimización de Roble de ensayo · 18 mm'});await expect(card).toContainText('Revisar optimización');await expect(card).toContainText('El motor no pudo ubicar esta placa');await card.click();await expect(page.getByRole('list',{name:'Avisos de Roble de ensayo · 18 mm'})).toContainText('El motor no pudo ubicar esta placa');await expect(page.getByRole('img')).toHaveCount(0);
});

test('materiales: piezas ajenas a las placas no quedan disimuladas en el total',async({page},info)=>{
 await mount(page,info.outputDir,false,false,3);await expect(page.getByText('Total parcial · hay piezas sin ubicar')).toBeVisible();await expect(page.getByText('3 piezas fuera del cálculo.',{exact:false})).toBeVisible();
});
