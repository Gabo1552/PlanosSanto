import {test,expect} from '@playwright/test';
import type {Project} from '../../lib/model';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

test('web guarda rotación, IDs ocultos y cota movida; recarga y exporta las mismas preferencias',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'Abrir demostración',exact:true}).click();
 await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();
 await page.getByRole('slider',{name:'Giro horizontal',exact:true}).press('ArrowRight');
 await page.getByRole('checkbox',{name:'Mostrar IDs en el dibujo'}).uncheck();
 await expect(page.locator('[data-label]')).toHaveCount(0);
 await page.getByRole('button',{name:'Mover cotas',exact:true}).click();
 const dimension=page.getByRole('button',{name:/^Mover cota P/}).first();await dimension.focus();await dimension.press('ArrowDown');
 await page.getByRole('button',{name:'Guardar ahora',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado'})).toBeVisible();
 const id=new URL(page.url()).searchParams.get('proyecto')!;
 const p=await(await request.get(`/api/projects/${id}`)).json() as Project;
 expect(p.furniture[0].presentation?.hideIds).toBe(true);// 0.8.20: the guide starts at the soft ¾ facing the front (yaw −15); one arrow step turns it 1°.
 expect(p.furniture[0].presentation?.cameras?.front?.yaw).toBe(-14);
 expect(p.furniture[0].presentation?.dimensionOffsets).toHaveLength(1);
 await page.reload();await expect(page.locator('[data-label]')).toHaveCount(0);await expect(page.getByLabel('Nombre P01',{exact:true})).toBeVisible();
 const response=await request.get(`/api/pdf/${id}`);expect(response.status()).toBe(200);
 const file='artifacts/ajustes-060-WEB-SINTETICO-A4.pdf';await writeFile(file,await response.body());
 const drawing=execFileSync('pdftotext',['-f','1','-l','1','-x','22','-y','124','-W','504','-H','405','-raw',file,'-'],{encoding:'utf8'});expect(drawing).not.toContain('P01');
});
