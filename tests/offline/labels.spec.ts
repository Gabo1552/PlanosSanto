import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

// DESPIECE-07: labels panel in a synthetic harness (demo project and order); never SketchUp or a customer's SKP.
let errors:string[]=[];
async function harness(page:Page,folder:string){
 const outfile=resolve(folder,'harness/harness.js');
 await build({absWorkingDir:process.cwd(),entryPoints:['tests/offline/fixtures/labels-harness.tsx'],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64'},logLevel:'silent'});
 errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://labels-harness.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script src="harness.js" defer></script></head><body><div id="root"></div></body></html>'});
  if(!['harness.js','harness.css'].includes(name))throw Error('Unexpected resource');
  await route.fulfill({body:await readFile(resolve(folder,'harness',name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://labels-harness.test/index.html');
 return page.getByRole('region',{name:'Etiquetas para piezas',exact:true});
}
test.afterEach(()=>{expect(errors).toEqual([]);});

test('Etiquetas: plantilla 2 × 5, margen editado, PDF descargable y opciones recordadas',async({page},info)=>{
 const panel=await harness(page,info.outputDir);
 await expect(panel.getByRole('heading',{name:'Etiquetas de piezas'})).toBeVisible();
 await expect(panel.getByRole('radio',{name:/3 × 7 · 21 por hoja/})).toBeChecked();
 await expect(panel.getByLabel('Margen superior')).toHaveValue('4.5');
 await panel.getByRole('radio',{name:/2 × 5 · 10 por hoja/}).check();
 await expect(panel.getByLabel('Margen izquierdo')).toHaveValue('4');
 await panel.getByLabel('Margen superior').fill('8');
 await panel.getByRole('checkbox',{name:'Líneas de corte'}).check();
 await panel.getByRole('button',{name:'Generar etiquetas'}).click();
 await expect(panel.getByRole('status')).toHaveText('10 etiquetas · 1 hoja · plantilla 2 × 5');
 const download=panel.getByRole('link',{name:'Descargar etiquetas'});
 await expect(download).toHaveAttribute('href',/^blob:/);await expect(download).toHaveAttribute('download',/-etiquetas-\d{4}-\d{2}-\d{2}\.pdf$/);
 await expect(panel.getByRole('link',{name:'Abrir etiquetas'})).toHaveAttribute('target','_blank');
 const bytes=await download.evaluate(async a=>{const r=await fetch((a as HTMLAnchorElement).href);return new Uint8Array(await r.arrayBuffer()).slice(0,5).join(',');});
 expect(bytes).toBe('37,80,68,70,45');
 // Editing the project invalidates the file; an invalid margin is reported in an alert.
 await page.getByRole('button',{name:'Editar proyecto'}).click();
 await expect(download).toHaveCount(0);await expect(panel.getByRole('status')).toHaveText('');
 await panel.getByLabel('Margen derecho').fill('40');await panel.getByRole('button',{name:'Generar etiquetas'}).click();
 await expect(panel.getByRole('alert')).toContainText('Margen derecho fuera de rango');
 await panel.getByRole('button',{name:'Restablecer márgenes'}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
 await expect(panel.getByLabel('Margen derecho')).toHaveValue('4');await expect(panel.getByLabel('Margen superior')).toHaveValue('6');
 await panel.getByLabel('Margen inferior').fill('10');
 await page.reload();
 const again=page.getByRole('region',{name:'Etiquetas para piezas',exact:true});
 await expect(again.getByRole('radio',{name:/2 × 5 · 10 por hoja/})).toBeChecked();
 await expect(again.getByLabel('Margen inferior')).toHaveValue('10');
 await again.getByRole('radio',{name:/3 × 7/}).check();await expect(again.getByLabel('Margen superior')).toHaveValue('4.5');
 await again.getByRole('button',{name:'Generar etiquetas'}).click();
 await expect(again.getByRole('status')).toHaveText('10 etiquetas · 1 hoja · plantilla 3 × 7');
});
