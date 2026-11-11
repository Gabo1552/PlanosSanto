import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import type {Project} from '../../lib/model';

// 0.8.31: the plan draws the alto, ancho and profundidad of the furniture by default; piece cotas start hidden.
test('web: clic y lista ocultan/restauran cotas, persisten y llegan al PDF sin cambiar la tabla',async({page,request})=>{
  const project=await (await request.post('/api/projects')).json() as Project;
  await page.goto(`/?proyecto=${project.id}`);await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
  await expect(page.locator('[data-dimension][data-total]')).toHaveCount(3);await expect(page.locator('[data-dimension][data-piece]')).toHaveCount(0);
  const before=await page.locator('[data-dimension]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-mm'))));
  const pieces=project.furniture[0].pieces;
  const depth=page.locator('[data-dimension][data-total="profundidad"]'),depthMm=Number(await depth.getAttribute('data-mm'));
  await page.getByRole('button',{name:/Ocultar cota total profundidad:/}).click();
  await expect(depth).toHaveCount(0);await expect(page.locator('[data-dimension]')).toHaveCount(2);
  await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Guardado'})).toBeVisible();
  const stored=await (await request.get(`/api/projects/${project.id}`)).json() as Project;
  expect(stored.furniture[0].dimensionDisplay).toEqual({hiddenTotals:['profundidad']});expect(stored.furniture[0].pieces).toEqual(pieces);
  await page.reload();await expect(depth).toHaveCount(0);await expect(page.locator('[data-dimension]')).toHaveCount(2);
  const response=await request.get(`/api/pdf/${project.id}`);expect(response.ok()).toBe(true);await mkdir('artifacts',{recursive:true});
  const path='artifacts/cota-oculta-WEB-SINTETICO-A4.pdf';await writeFile(path,await response.body());
  const drawing=execFileSync('pdftotext',['-f','1','-l','1','-x','22','-y','70','-W','262','-H','458','-raw',path,'-'],{encoding:'utf8'});
  const values=[...drawing.matchAll(/(\d+(?:,\d+)?)\s+mm\b/g)].map(m=>Number(m[1].replace(',','.'))).sort((a,b)=>a-b);
  const kept=[...before];kept.splice(kept.indexOf(depthMm),1);
  expect(values).toEqual(kept.sort((a,b)=>a-b));expect(drawing).toContain('2 TOTALES');expect(drawing).not.toContain('profundidad');
  await page.locator('.dimension-controls>summary').click();await expect(page.getByRole('checkbox',{name:'Mostrar cota total profundidad',exact:true})).not.toBeChecked();
  await page.getByRole('checkbox',{name:'Mostrar cota P01 largo',exact:true}).check();
  await expect(page.locator('[data-dimension][data-role="largo"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Solo medidas totales',exact:true}).click();await expect(page.locator('[data-dimension]')).toHaveCount(3);
  const savedRestore=page.waitForResponse(response=>response.url().endsWith(`/api/projects/${project.id}`)&&response.request().method()==='PUT');
  await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();
  expect((await savedRestore).ok()).toBe(true);
  const restored=await (await request.get(`/api/projects/${project.id}`)).json() as Project;expect(restored.furniture[0].dimensionDisplay).toBeUndefined();expect(restored.furniture[0].pieces).toEqual(pieces);
});
