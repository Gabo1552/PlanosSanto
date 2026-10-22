import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

// OPT-14 «Hoja 2: despiece completo» and F-DESP-B rows pending of order, in a synthetic harness bundled like the app.
// Never SketchUp or a customer's SKP.
let errors:string[]=[];
async function harness(page:Page,folder:string){
 const outfile=resolve(folder,'harness/harness.js');
 await build({absWorkingDir:process.cwd(),entryPoints:['tests/offline/fixtures/a4-hoja2-harness.tsx'],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64'},logLevel:'silent'});
 errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://a4-harness.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="harness.css"><script src="harness.js" defer></script></head><body><div id="root"></div></body></html>'});
  if(!['harness.js','harness.css'].includes(name))throw Error('Unexpected resource');
  await route.fulfill({body:await readFile(resolve(folder,'harness',name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://a4-harness.test/index.html');
 return page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});
}
test.afterEach(()=>{expect(errors).toEqual([]);});

test('Hoja 2: sin consentimiento bloquea y «Ir a corregir» lleva a la casilla; con consentimiento el paginador lista 1a, 1b, 1c y 2',async({page},info)=>{
 const preview=await harness(page,info.outputDir);
 const consent=page.getByRole('checkbox',{name:'Permitir hoja 2: despiece completo',exact:true});await expect(consent).not.toBeChecked();
 const alert=preview.getByRole('alert');await expect(alert).toHaveAttribute('data-fit-kind','table');
 await expect(alert).toContainText('«Permitir hoja 2: despiece completo»');
 await alert.getByRole('button',{name:'Ir a corregir',exact:true}).click();await expect(consent).toBeFocused();
 await consent.check();
 const sheet=preview.getByRole('combobox',{name:'Hoja visible',exact:true});
 await expect(sheet.locator('option')).toHaveText([/^Hoja 1a de 2 · /,/^Hoja 1b de 2 · /,/^Hoja 1c de 2 · /,/^Hoja 2 de 2 · /]);
 await expect(preview.getByTestId('a4-sheet-size')).toContainText('4 hojas');
 await expect(sheet).toHaveValue('0');
 // The second furniture opens on its own (only) page; going back to the first opens its page 1a.
 await page.getByRole('navigation',{name:'Muebles'}).getByRole('button').nth(1).click();await expect(sheet).toHaveValue('3');
 await expect(preview.getByTitle('PDF A4 generado')).toHaveAttribute('src',/#page=4&/);
 await page.getByRole('navigation',{name:'Muebles'}).getByRole('button').nth(0).click();await expect(sheet).toHaveValue('0');
 await expect(consent).toBeChecked();
});

test('Pendientes de pedido: la píldora las cuenta y marca el pedido como parcial',async({page},info)=>{
 const preview=await harness(page,info.outputDir);
 await page.getByRole('checkbox',{name:'Permitir hoja 2: despiece completo',exact:true}).check();
 await page.getByRole('button',{name:'Pedido con pendientes',exact:true}).click();
 const state=preview.locator('.a4-order-state');await expect(state).toHaveAttribute('data-order','partial');
 await expect(state.locator('.a4-order-pill')).toHaveText(/^✓ Con placa y cantos del pedido · \d+ de \d+ piezas · 1 pendiente de pedido$/);
 await expect(preview.getByRole('status').filter({hasText:/^Hoja lista · /})).toBeVisible();
});
