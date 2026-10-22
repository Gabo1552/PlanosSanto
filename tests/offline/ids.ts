import type {Page} from '@playwright/test';

/**
 * Since 0.8.19 the A4 hides piece IDs unless the guide chooses to show them, and the viewer draws exactly the A4.
 * Specs that select pieces through their ID labels turn them on first, as a user would, leaving the panel as it was.
 */
export async function showIds(page:Page){
  // Muebles has no view adjustments: its locator drawing always shows every ID.
  const panel=page.locator('details.view-adjustments');if(!await panel.count())return;
  const open=await panel.evaluate(node=>(node as HTMLDetailsElement).open);
  if(!open)await panel.locator('summary').click();
  await page.getByRole('checkbox',{name:'Mostrar IDs en el dibujo'}).check();
  if(!open)await panel.locator('summary').click();
}

/** Picks one physical instance by its drawn faces (an ID label stands for every instance of a grouped type). */
export async function pickFace(page:Page,pieceId:string){
  const faces=page.locator(`polygon[data-piece="${pieceId}"]`),boxes=await faces.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,area:r.width*r.height};}));
  const index=boxes.reduce((best,box,i)=>box.area>boxes[best].area?i:best,0),{x,y}=boxes[index];
  await faces.nth(index).dispatchEvent('pointerdown',{clientX:x,clientY:y,pointerId:1,bubbles:true});
}
