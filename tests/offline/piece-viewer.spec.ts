import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

// 0.8.20, Muebles: the 3D viewer turns, zooms, separates and moves pieces only on screen. Synthetic harness with the
// placard of tests/synthetic-furniture.ts (20 pieces) and a run of 20 placards (300 pieces); never SketchUp.
let errors:string[]=[];
async function harness(page:Page,folder:string,model='placard'){
 const outfile=resolve(folder,'harness/harness.js');
 await build({absWorkingDir:process.cwd(),entryPoints:['tests/offline/fixtures/piece-viewer-harness.tsx'],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://viewer-harness.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);
  if(name==='index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Visor 3D</title><link rel="stylesheet" href="harness.css"><script src="harness.js" defer></script></head><body><div id="root"></div></body></html>'});
  if(!['harness.js','harness.css'].includes(name))throw Error('Unexpected resource');
  await route.fulfill({body:await readFile(resolve(folder,'harness',name)),contentType:name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto(`https://viewer-harness.test/index.html?model=${model}`);
 const stage=page.getByRole('application',{name:/^Visor 3D de /});await expect(stage).toBeVisible();
 return stage;
}
const points=(page:Page,id:string)=>page.locator(`polygon[data-piece="${id}"]`).first().getAttribute('points');
async function center(page:Page,id:string){
 const boxes=await page.locator(`polygon[data-piece="${id}"]`).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,area:r.width*r.height};}));
 return boxes.sort((a,b)=>b.area-a.area)[0];
}
test.afterEach(()=>{expect(errors).toEqual([]);});

test('Muebles: girar, acercar, elegir, separar y mover piezas solo en la vista',async({page},info)=>{
 const stage=await harness(page,info.outputDir),selected=page.getByTestId('selected');
 // Faces the front (soft ¾) and shows every ID of a small model.
 await expect(stage).toHaveAttribute('data-yaw','-15');await expect(page.getByRole('button',{name:/^Seleccionar P01/}).first()).toBeVisible();
 await page.screenshot({path:info.outputPath('visor-muebles-frente-SINTETICO.png')});
 // Dragging turns the furniture and never selects.
 const box=(await stage.boundingBox())!;
 await page.mouse.move(box.x+box.width*.15,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.15+120,box.y+box.height*.5+20,{steps:6});await page.mouse.up();
 await expect(stage).not.toHaveAttribute('data-yaw','-15');await expect(selected).toHaveText('ninguna');
 // A click on a face selects that piece.
 await page.getByRole('button',{name:'Frente',exact:true}).click();await expect(stage).toHaveAttribute('data-yaw','-15');
 const door=await center(page,'PLACARD/puerta-der');await page.mouse.click(door.x,door.y);await expect(selected).toHaveText('PLACARD/puerta-der');
 // Keyboard buttons and keys.
 await page.getByRole('button',{name:'Atrás',exact:true}).click();await expect(stage).toHaveAttribute('data-yaw','165');
 await page.getByRole('button',{name:'Girar 90° a la derecha',exact:true}).click();await expect(stage).toHaveAttribute('data-yaw','-105');
 await page.getByRole('button',{name:'Arriba',exact:true}).click();await expect(stage).toHaveAttribute('data-pitch','89');
 await page.getByRole('button',{name:'Frente',exact:true}).click();await stage.focus();await page.keyboard.press('ArrowRight');await expect(stage).toHaveAttribute('data-yaw','0');
 await page.getByRole('button',{name:'Frente',exact:true}).click();
 // Wheel zoom.
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-300);await expect(stage).not.toHaveAttribute('data-zoom','1.00');
 await page.getByRole('button',{name:'Restablecer',exact:true}).click();await expect(stage).toHaveAttribute('data-zoom','1.00');
 // Moving a door reveals the interior: only that piece moves, and nothing claims to change the model.
 const before=await points(page,'PLACARD/puerta-izq'),shelf=await points(page,'PLACARD/estante-izq-1');
 await page.getByRole('button',{name:'Mover piezas',exact:true}).click();
 const left=await center(page,'PLACARD/puerta-izq');
 await page.mouse.move(left.x,left.y);await page.mouse.down();await page.mouse.move(left.x-140,left.y+40,{steps:5});await page.mouse.up();
 expect(await points(page,'PLACARD/puerta-izq')).not.toBe(before);expect(await points(page,'PLACARD/estante-izq-1')).toBe(shelf);
 await expect(page.getByRole('status')).toHaveText('1 pieza movida solo en esta vista. El modelo de SketchUp no cambia.');
 await page.screenshot({path:info.outputPath('visor-muebles-pieza-movida-SINTETICO.png')});
 // Arrow keys move the selected piece in «Mover piezas».
 await page.mouse.click(door.x,door.y);await expect(selected).toHaveText('PLACARD/puerta-der');const right=await points(page,'PLACARD/puerta-der');
 await stage.focus();await page.keyboard.press('ArrowLeft');expect(await points(page,'PLACARD/puerta-der')).not.toBe(right);
 await expect(page.getByRole('status')).toHaveText('2 piezas movidas solo en esta vista. El modelo de SketchUp no cambia.');
 // Separate pieces (explosion), then reset everything.
 const separate=page.getByRole('button',{name:'Separar piezas',exact:true});await separate.click();await expect(separate).toHaveAttribute('aria-pressed','true');
 expect(await points(page,'PLACARD/estante-izq-1')).not.toBe(shelf);await expect(page.getByRole('status')).toContainText('Piezas separadas.');
 await page.screenshot({path:info.outputPath('visor-muebles-separado-SINTETICO.png')});
 await page.getByRole('button',{name:'Restablecer',exact:true}).click();
 expect(await points(page,'PLACARD/puerta-izq')).toBe(before);expect(await points(page,'PLACARD/estante-izq-1')).toBe(shelf);await expect(page.getByRole('status')).toHaveText('');
 // Highlight keeps working as before: the other pieces fade.
 await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
 expect(await page.locator('polygon[data-piece="PLACARD/lat-izq"]').first().evaluate(el=>el.parentElement?.getAttribute('opacity'))).toBe('0.22');
 const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 expect(violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('Muebles con 300 piezas: el giro se redibuja fluido',async({page},info)=>{
 const stage=await harness(page,info.outputDir,'run');
 await expect(page.locator('polygon[data-piece]').first()).toBeVisible();
 const box=(await stage.boundingBox())!;
 // Record the frames in which the drawing changed while the mouse turns the furniture.
 await page.evaluate(()=>{const w=window as unknown as {frames300:number[];stop300:boolean};w.frames300=[];w.stop300=false;let last='';
  const tick=(time:number)=>{const yaw=document.querySelector('.piece-viewer-stage')?.getAttribute('data-yaw')||'';if(yaw!==last){last=yaw;w.frames300.push(time);}if(!w.stop300)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 const start=Date.now();
 await page.mouse.move(box.x+20,box.y+box.height/2);await page.mouse.down();
 for(let i=1;i<=40;i++)await page.mouse.move(box.x+20+i*12,box.y+box.height/2);
 await page.mouse.up();const elapsed=Date.now()-start;
 const frames=await page.evaluate(()=>{const w=window as unknown as {frames300:number[];stop300:boolean};w.stop300=true;return w.frames300;});
 const gaps=frames.slice(2).map((t,i)=>t-frames[i+1]).sort((a,b)=>a-b),median=gaps[gaps.length>>1];
 info.annotations.push({type:'medición',description:`300 piezas: ${frames.length-1} redibujos en ${elapsed} ms de arrastre; mediana ${median?.toFixed(0)} ms entre cuadros, máximo ${gaps[gaps.length-1]?.toFixed(0)} ms`});
 console.log(info.annotations.at(-1)!.description);
 expect(frames.length).toBeGreaterThan(10);expect(median).toBeLessThan(120);
 await page.screenshot({path:info.outputPath('visor-muebles-300-piezas-SINTETICO.png')});
});
