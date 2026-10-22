import type {Locator,Page} from '@playwright/test';
/** 0.8.19: el detalle pieza por pieza del pedido viene plegado. Lo abre si está cerrado (si ya está abierto, queda así). */
export async function openDetail(scope:Page|Locator){
 const detail=scope.locator('details.workshop-piece-detail');
 if(!await detail.evaluate(element=>(element as HTMLDetailsElement).open))await detail.locator(':scope > summary').click();
}
