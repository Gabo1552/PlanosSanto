import {test,expect} from '@playwright/test';
import type {Project} from '../../lib/model';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
test('web agrupa nombres y cantidades y conserva instancias al reabrir e imprimir',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'Abrir demostración',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(6);
 await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();await expect(page.locator('tbody tr')).toHaveCount(4);await expect(page.locator('[data-label="P01"]')).toHaveCount(2);
 await page.getByLabel('Nombre P01',{exact:true}).fill('M01 PT');await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado'})).toBeVisible();
 const id=new URL(page.url()).searchParams.get('proyecto')!;const p=await(await request.get(`/api/projects/${id}`)).json() as Project;
 expect(p.furniture[0].groupIdentical).toBe(true);expect(p.furniture[0].pieces).toHaveLength(6);expect(p.furniture[0].pieces.slice(0,2).map(p=>p.name)).toEqual(['M01 PT','M01 PT']);expect(p.furniture[0].pieces.every(p=>p.quantity===1)).toBe(true);
 await page.reload();await expect(page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true})).toBeChecked();await expect(page.locator('tbody tr')).toHaveCount(4);
 const pdf=await request.get(`/api/pdf/${id}`);expect(pdf.status()).toBe(200);const file='artifacts/componentes-iguales-064-WEB-A4.pdf';await writeFile(file,await pdf.body());
 const table=execFileSync('pdftotext',['-f','1','-l','1','-x','566','-y','70','-W','254','-H','484','-raw',file,'-'],{encoding:'utf8'});expect(table).toContain('P01');expect(table).toContain('M01 PT');expect(table).not.toContain('P02');expect(table).not.toContain('P04');
 await page.goto(`/print/${id}`);await expect(page.locator('.sheet').first().locator('.print-table tbody tr')).toHaveCount(4);await expect(page.locator('.sheet').first().locator('[data-label="P01"]')).toHaveCount(2);
 for(const view of ['front','back']){const diagram=page.locator('.sheet').first().locator(`[data-view=${view}]`);await expect(diagram.locator('[data-label="P01"]')).toContainText('×2');for(const piece of p.furniture[0].pieces.slice(0,2))expect(await diagram.locator(`[data-piece="${piece.id}"]`).count()).toBeGreaterThan(0);}
});
