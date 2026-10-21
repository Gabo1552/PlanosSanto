import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import type {Project} from '../../lib/model';

test('web: clic y lista ocultan/restauran cotas, persisten y llegan al PDF sin cambiar la tabla',async({page,request})=>{
  const project=await (await request.post('/api/projects')).json() as Project;
  await page.goto(`/?proyecto=${project.id}`);await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
  const before=await page.locator('[data-dimension]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-mm'))));
  const pieces=project.furniture[0].pieces;
  await page.getByRole('button',{name:/Ocultar cota P01 largo:/}).click();
  await expect(page.locator('[data-dimension]')).toHaveCount(before.length-1);
  await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Guardado'})).toBeVisible();
  const stored=await (await request.get(`/api/projects/${project.id}`)).json() as Project;
  expect(stored.furniture[0].hiddenDimensions).toEqual([{pieceId:pieces[0].id,role:'largo'}]);expect(stored.furniture[0].pieces).toEqual(pieces);
  await page.reload();await expect(page.locator('[data-dimension]')).toHaveCount(before.length-1);
  const response=await request.get(`/api/pdf/${project.id}`);expect(response.ok()).toBe(true);await mkdir('artifacts',{recursive:true});
  const path='artifacts/cota-oculta-WEB-SINTETICO-A4.pdf';await writeFile(path,await response.body());
  const drawing=execFileSync('pdftotext',['-f','1','-l','1','-x','22','-y','124','-W','246','-H','405','-raw',path,'-'],{encoding:'utf8'});
  const values=[...drawing.matchAll(/(\d+(?:,\d+)?)\s+mm\b/g)].map(m=>Number(m[1].replace(',','.'))).sort((a,b)=>a-b);
  const expected=[...before];expected.splice(expected.indexOf(pieces[0].dimensions[0]),1);expect(values).toEqual(expected.sort((a,b)=>a-b));expect(drawing).toContain('1 OCULTA');
  await page.locator('.dimension-controls>summary').click();await expect(page.getByRole('checkbox',{name:'Mostrar cota P01 largo',exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Mostrar todas las cotas',exact:true}).click();await expect(page.locator('[data-dimension]')).toHaveCount(before.length);
  const savedRestore=page.waitForResponse(response=>response.url().endsWith(`/api/projects/${project.id}`)&&response.request().method()==='PUT');
  await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();
  expect((await savedRestore).ok()).toBe(true);
  const restored=await (await request.get(`/api/projects/${project.id}`)).json() as Project;expect(restored.furniture[0].hiddenDimensions).toEqual([]);expect(restored.furniture[0].pieces).toEqual(pieces);
});
