import {expect,type Page} from '@playwright/test';
// Muebles names pieces and Planos A4 draws them: specs move between both through the rail.
async function go(page:Page,label:string){const button=page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:label,exact:true});await button.click();await expect(button).toHaveAttribute('aria-current','page');}
export const toPlanos=(page:Page)=>go(page,'Planos A4');
export const toMuebles=(page:Page)=>go(page,'Muebles');

export async function openMaterialTools(page:Page){
 await go(page,'Materiales');
 const tools=page.locator('.ux-material-tools details');
 if(await tools.getAttribute('open')===null)await tools.locator('summary').click();
}
export async function openMaterialTool(page:Page,name:string){
 await openMaterialTools(page);
 await page.locator('.ux-material-tools').getByRole('button',{name,exact:true}).click();
}
