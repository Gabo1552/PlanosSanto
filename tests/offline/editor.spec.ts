import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {toMuebles,toPlanos} from './fixtures/modules';

const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
// Enterprise Chromium policy blocks file:// in this host. Serve the exact packaged bytes
// through intercepted requests, with the network offline. Real HtmlDialog#set_file remains a Windows check.
const file='https://planos-santo.test/index.html';
let child:ChildProcessWithoutNullStreams;
let pending:Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>;
let calls:string[],errors:string[];
async function boot(page:Page,folder:string,legacy=false){
  await mkdir(folder,{recursive:true});
  pending=new Map();calls=[];errors=[];
  const installed=resolve(folder,'legacy-plugins');
  if(legacy)execFileSync('python3',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])','artifacts/PlanosSanto-0.5.3.rbz',installed]);
  child=spawn(ruby,['sketchup_offline/test/bridge_driver.rb',folder],{stdio:'pipe',env:{...process.env,...(legacy?{PLANOS_TEST_INSTALL_DIR:installed}:{})}});
  child.stderr.on('data',()=>{}); // Ruby errors are surfaced through the actual protocol replies.
  createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),wait=pending.get(reply.id);if(wait){pending.delete(reply.id);wait.resolve(reply);}});
  child.on('exit',()=>{for(const wait of pending.values())wait.reject(new Error('El driver Ruby terminó antes de responder.'));pending.clear();});
  await page.exposeFunction('nativeRequest',(raw:string)=>new Promise((resolve,reject)=>{
    const msg=JSON.parse(raw);calls.push(msg.action);pending.set(msg.id,{resolve,reject});child.stdin.write(raw+'\n');
  }));
  await page.addInitScript(()=>{
    const w=window as unknown as {nativeRequest:(raw:string)=>Promise<unknown>;sketchup:unknown;PlanosSantoBridge:{receive:(reply:unknown)=>void}};
    w.sketchup={request:(raw:string)=>{void w.nativeRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};
  });
  page.on('pageerror',error=>errors.push(error.message));
  const allowed=new Set(['index.html','app.js','app.css']);
  await page.route('https://planos-santo.test/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if(!allowed.has(name)){errors.push('Recurso inesperado: '+name);await route.abort();return;}
    const bytes=await readFile(resolve('sketchup_offline/build/planos_santo/ui',name));
    await route.fulfill({body:bytes,contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
  });
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('https://planos-santo.test/'))errors.push('Solicitud de red: '+request.url());});
  await page.context().setOffline(true);
  await page.goto(file);
  if(legacy)await expect(page.getByRole('alert')).toContainText('Actualización pendiente');
  else await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('assets empaquetados sin red: Ruby valida nombres/notas, reapertura del diálogo y PDF multipágina',async({page},info)=>{
  await boot(page,info.outputDir);
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toBeVisible();
  // Muebles only names pieces; cotas, views and notes live in Planos A4.
  await expect(page.locator('[data-dimension]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Agregar nota',exact:true})).toHaveCount(0);
  await toPlanos(page);
  await expect(page.locator('[data-dimension]')).toHaveCount(2);
  await expect(page.locator('[data-dimension][data-role=espesor]')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-label]')).toHaveCount(2);
  const originalPoints=await page.locator('[data-piece]').first().getAttribute('points');
  const dirtyBefore=calls.filter(c=>c==='dirty').length;
  // The interior looks from the side opposite the front; switching views edits nothing.
  await page.getByRole('button',{name:'Ver interior',exact:true}).click();
  expect(await page.locator('[data-piece]').first().getAttribute('points')).not.toBe(originalPoints);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  expect(calls.filter(c=>c==='dirty').length).toBe(dirtyBefore);
  await page.getByRole('button',{name:'Ver exterior',exact:true}).click();
  expect(await page.locator('[data-piece]').first().getAttribute('points')).toBe(originalPoints);
  const originalMeasures=await page.locator('[data-dimension]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-mm')));
  await page.getByText('Opciones de guardado',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Sincronizar nombres de grupos y piezas en SketchUp'}).uncheck();
  await toMuebles(page);await page.getByLabel('Nombre P01').fill('Costado de prueba offline');
  await toPlanos(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();
  await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
  await page.getByLabel('Texto de la nota').fill('Alinear antes de fijar');
  const slider=page.getByRole('slider',{name:'Zoom',exact:true});
  await slider.focus();await slider.press('End');for(let i=0;i<12;i++)await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('0.8');
  await page.getByTestId('note-box').focus();await page.keyboard.press('ArrowDown');
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
  await expect(page.getByText('Falta guardar el archivo .skp',{exact:false})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toHaveValue('Costado de prueba offline');
  await toPlanos(page);await page.getByRole('button',{name:'P01 Alinear antes de fijar',exact:true}).click();
  await expect(page.getByLabel('Texto de la nota')).toHaveValue('Alinear antes de fijar');
  await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('0.8');
  await expect(page.locator('[data-dimension]')).toHaveCount(2);
  expect(await page.locator('[data-dimension]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-mm')))).toEqual(originalMeasures);
  await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();
  await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
  const path=resolve(info.outputDir,'PlanosSanto-A4.pdf'),bytes=await readFile(path),pdf=await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);for(const p of pdf.getPages()){expect(p.getWidth()*25.4/72).toBeCloseTo(297,6);expect(p.getHeight()*25.4/72).toBeCloseTo(210,6);}
  const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
  const readingOrder=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
  expect(readingOrder).toContain('Costado de prueba offline');expect(text).toContain('Alinear antes de fijar');expect(text).toContain('609,6');
  await page.screenshot({path:resolve('artifacts/editor-offline-sintetico.png'),fullPage:true});
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/offline-contrato-A4.pdf',bytes);
  expect(calls).toContain('save');expect(calls).toContain('pdf');
});

test('Ruby bloquea exportación si la geometría cambió después de generar',async({page},info)=>{
  await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toBeVisible();
  await page.evaluate(async()=>{const w=window as unknown as {nativeRequest:(raw:string)=>Promise<unknown>};await w.nativeRequest(JSON.stringify({version:1,id:'mutation',action:'__fixture_move'}));});
  await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('geometría');
});

test('notas completas: editar, arrastrar, reanclar, eliminar; selección evita padre y descendiente',async({page},info)=>{
  await boot(page,info.outputDir);
  const parent=page.getByRole('checkbox',{name:'Mueble de contrato',exact:false}).first();
  await page.locator('.tree > .tree-node').first().getByText('Ver contenido',{exact:true}).first().click();
  await parent.uncheck();
  await page.getByRole('checkbox',{name:'Lateral sintético',exact:false}).first().check();
  await parent.check();
  await expect(page.getByRole('checkbox',{name:'Lateral sintético',exact:false}).first()).not.toBeChecked();
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await toPlanos(page);
  await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
  await page.getByLabel('Texto de la nota').fill('Unión revisada');
  const box=page.getByTestId('note-box');const before=await box.boundingBox();
  await page.mouse.move(before!.x+50,before!.y+20);await page.mouse.down();await page.mouse.move(before!.x+15,before!.y+70,{steps:5});await page.mouse.up();
  const after=await box.boundingBox();expect(after!.y).toBeGreaterThan(before!.y+30);
  await page.getByRole('button',{name:'Cambiar destino de la flecha',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();
  await expect(page.getByRole('button',{name:'P02 Unión revisada',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Eliminar nota',exact:true}).click();await expect(page.getByTestId('note-box')).toHaveCount(0);
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Falta guardar el archivo .skp',{exact:false})).toBeVisible();
});

test('ayudas con teclado, Escape, clic afuera y ubicación visible en ventana de 1000 px',async({page},info)=>{
  await page.setViewportSize({width:1000,height:760});await boot(page,info.outputDir);
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  const input=page.getByLabel('Nombre P01');await expect(input).toBeVisible();const original=await input.inputValue();
  await toPlanos(page);const help=page.getByRole('button',{name:'Ayuda: Vistas configurables',exact:true});
  await help.focus();await page.keyboard.press('Enter');
  const popup=page.getByRole('dialog',{name:'Vistas configurables',exact:true});await expect(popup).toBeVisible();await expect(popup).toBeFocused();
  await expect(popup).toContainText('nunca cambia la geometría ni la visibilidad del modelo original');
  const bounds=await popup.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(1000);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(760);
  await page.screenshot({path:'artifacts/ayuda-despiece-1000px.png',fullPage:true});
  await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(help).toBeFocused();
  await page.getByRole('button',{name:'Ayuda: PDF para imprimir',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'PDF para imprimir',exact:true})).toContainText('una hoja A4 horizontal por mueble');
  await page.locator('.guide-heading h2').click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Ayuda: Guardar guía',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar ayuda: Guardar guía',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await toMuebles(page);await expect(input).toHaveValue(original);expect(calls).not.toContain('save');expect(calls).not.toContain('pdf');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

// Simplificación punto 23: changing the furniture regenerates the guides by itself (keeping the edits); no «Generar guías» step.
test('al cambiar muebles se regeneran las guías solas y Escape cancela el anclaje',async({page},info)=>{
  await boot(page,info.outputDir);await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toBeVisible();
  await toPlanos(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('.pick-hint')).toHaveCount(0);await expect(page.getByTestId('note-box')).toHaveCount(0);
  await toMuebles(page);
  await page.getByRole('checkbox',{name:'Mueble repetido sintético',exact:false}).first().uncheck();
  await expect(page.locator('.furniture-tabs button')).toHaveCount(1);await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.locator('.selection-notice')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeEnabled();
});

test('cotas: ocultar una, guardar/reabrir y PDF sin esa cota; restaurar con teclado y lista',async({page},info)=>{
  await boot(page,info.outputDir);
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await toPlanos(page);
  await expect(page.locator('[data-dimension]')).toHaveCount(2);
  const table=await page.locator('tbody').innerText();
  await page.locator('.dimension-controls>summary').click();
  await page.getByRole('checkbox',{name:'Mostrar cota P01 largo',exact:true}).uncheck();
  await expect(page.locator('[data-dimension]')).toHaveCount(1);
  await expect(page.locator('[data-dimension][data-role=largo]')).toHaveCount(0);
  expect(await page.locator('tbody').innerText()).toBe(table);
  await page.getByRole('button',{name:'Ver interior',exact:true}).click();await expect(page.locator('[data-dimension]')).toHaveCount(1);
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Falta guardar el archivo .skp',{exact:false})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await toPlanos(page);
  await expect(page.locator('[data-dimension]')).toHaveCount(1);expect(await page.locator('tbody').innerText()).toBe(table);
  await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
  const pdfPath=resolve(info.outputDir,'PlanosSanto-A4.pdf');
  const drawing=execFileSync('pdftotext',['-f','1','-l','1','-x','22','-y','124','-W','246','-H','405','-raw',pdfPath,'-'],{encoding:'utf8'});
  expect(drawing).toMatch(/406,4\s+mm/);expect(drawing).not.toMatch(/609,6\s+mm/);expect(drawing).toContain('1 OCULTA');
  const tablePdf=execFileSync('pdftotext',['-f','1','-l','1','-x','538','-y','147','-W','282','-H','405','-raw',pdfPath,'-'],{encoding:'utf8'});
  expect(tablePdf).toContain('609,6');expect(tablePdf).toContain('P01');expect(tablePdf).toContain('P02');
  await page.locator('.dimension-controls>summary').click();
  await expect(page.getByRole('checkbox',{name:'Mostrar cota P01 largo',exact:true})).not.toBeChecked();
  await page.screenshot({path:'artifacts/cota-oculta-complemento-SINTETICO.png',fullPage:true});
  await page.getByRole('button',{name:'Mostrar todas las cotas',exact:true}).click();await expect(page.locator('[data-dimension]')).toHaveCount(2);
  await page.getByRole('button',{name:/Ocultar cota P01 largo:/}).focus();await page.keyboard.press('Enter');await expect(page.locator('[data-dimension]')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'Mostrar cota P01 largo',exact:true}).check();await expect(page.locator('[data-dimension]')).toHaveCount(2);
  expect(await page.locator('tbody').innerText()).toBe(table);
});

test('jerarquía compactada y filtros conservan la selección de guías',async({page},info)=>{
 await boot(page,info.outputDir);await expect(page.locator('.tree details[open]')).toHaveCount(0);
 await page.getByLabel('Filtrar muebles').selectOption('unselected');await expect(page.locator('.tree > .tree-node')).toHaveCount(0);
 await page.getByLabel('Filtrar muebles').selectOption('all');
 await page.getByRole('checkbox',{name:'Mueble de contrato 2 piezas',exact:true}).uncheck();
 await page.getByLabel('Filtrar muebles').selectOption('selected');await expect(page.locator('.tree > .tree-node')).toHaveCount(1);await expect(page.locator('.tree')).toContainText('Mueble repetido sintético');
 await page.getByLabel('Filtrar muebles').selectOption('unselected');await expect(page.locator('.tree > .tree-node')).toHaveCount(1);await expect(page.locator('.tree')).toContainText('Mueble de contrato');
 await page.getByLabel('Filtrar muebles').selectOption('all');await expect(page.getByRole('button',{name:'Generar guías (1)',exact:true})).toBeEnabled();
 await expect(page.locator('.tree details[open]')).toHaveCount(0);
});


test('una interfaz nueva con Ruby anterior avisa que falta reiniciar antes de leer o guardar',async({page},info)=>{
 await boot(page,info.outputDir,true);
 await expect(page.getByRole('alert')).toContainText('0.5.3');
 await expect(page.getByRole('alert')).toContainText('Cerrá todas las ventanas de SketchUp');
 await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Generar guías (0)',exact:true})).toBeDisabled();
 expect(calls).toEqual(['diagnostic']);
 await page.screenshot({path:'artifacts/actualizacion-sin-reinicio-061.png',fullPage:true});
});
