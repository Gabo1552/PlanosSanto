import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

// 0.8.26 (SketchUp 2022, CEF 88). The same assertions must hold on the current
// Chromium (native :has()) and on Chromium 88 (npm run test:chromium88), where
// polyfills.ts adds ps-has-* classes and compat-chromium88.css copies each rule.
// Only page.evaluate is used, so it runs on Chromium 88 even without the
// Playwright patch. Simulated: this is not SketchUp 2022's HtmlDialog.
const markup=`<div class="paint-panel"><label id="paint-select">Material<select><option>a</option></select></label><label id="paint-check"><input type="checkbox">Una</label></div>
<div class="photo-duplicate"><label id="dup-radio"><input type="radio" name="r">Reemplazar</label><label id="dup-select">Ficha<select><option>a</option></select></label></div>
<div class="material-review-filters"><label id="filter"><input type="checkbox">Filtrar</label></div>
<div class="workshop-form"><label id="workshop"><input type="checkbox">Taller</label></div>
<div class="piece-grouping"><label id="group"><input type="checkbox">Agrupar</label></div>`;

test('respaldo de :has() y polyfills en el bundle empaquetado',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const css=await readFile(resolve('sketchup_offline/build/planos_santo/ui/app.css'),'utf8');
  const polyfills=(await build({entryPoints:['sketchup_offline/ui/polyfills.ts'],bundle:true,write:false,format:'iife',target:'chrome88',loader:{'.css':'empty'},logLevel:'silent'})).outputFiles[0].text;
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${markup}</body></html>`);
  await page.evaluate(code=>{const script=document.createElement('script');script.textContent=code;document.head.appendChild(script);},polyfills);
  const engine=await page.evaluate(()=>({has:CSS.supports('selector(:has(*))'),version:navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]}));
  if(!engine.has)await page.waitForFunction(()=>document.getElementById('dup-radio')?.classList.contains('ps-has-radio'));
  const style=(id:string,props:string[])=>page.evaluate(([target,names])=>{const computed=getComputedStyle(document.getElementById(target as string)!);return (names as string[]).map(name=>computed.getPropertyValue(name));},[id,props] as const);
  expect(await style('paint-select',['flex-direction','align-items'])).toEqual(['column','stretch']);
  expect(await style('dup-radio',['display','align-items','min-height'])).toEqual(['flex','center','34px']);
  expect(await style('dup-select',['display','font-weight','margin-top'])).toEqual(['block','700','10px']);
  expect(await style('filter',['display','align-items'])).toEqual(['flex','center']);
  expect(await style('workshop',['display','align-items'])).toEqual(['flex','flex-start']);
  const before=(await style('group',['color']))[0];
  await page.evaluate(()=>(document.querySelector('#group input') as HTMLInputElement).click());
  await expect.poll(async()=>(await style('group',['color']))[0]).toBe('rgb(23, 76, 123)');
  expect(before).not.toBe('rgb(23, 76, 123)');
  // The polyfills either keep the native API or add a working one.
  expect(await page.evaluate(()=>[[1,2,3].at(-1),typeof crypto.randomUUID(),structuredClone({a:[1]}).a[0],Object.hasOwn({k:1},"k"),([1,2] as unknown as {findLast:(f:(v:number)=>boolean)=>number}).findLast(v=>v<2)])).toEqual([3,'string',1,true,1]);
  expect(await page.evaluate(()=>document.documentElement.classList.contains('ps-no-has'))).toBe(!engine.has);
  expect(errors).toEqual([]);
  test.info().annotations.push({type:'chromium',description:`Chrome ${engine.version}; :has() nativo=${engine.has}`});
});
