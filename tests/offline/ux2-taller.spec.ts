import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// UX2 del taller: cantos por SKU, avisos en vivo, piezas equivalentes, auditoría completa y «Ver en el modelo».
// Controlador Ruby real con dobles sintéticos de SketchUp; no se abre ni se escribe ningún SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];actions=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',(message:string)=>{actions.push(JSON.parse(message).action);return raw(message);});
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function catalog(items:{name:string;kind:string;patch:Record<string,unknown>}[],link?:(all:Item[])=>void){
 let library:Library|undefined;
 for(const item of items)library=await send('catalog_add',{revision:library?.catalog.revision??0,item:{name:item.name,kind:item.kind}}) as Library;
 const all=library!.catalog.items;items.forEach((item,i)=>Object.assign(all[i],item.patch));link?.(all);
 await send('catalog_save',{revision:library!.catalog.revision,items:all});return all;
}
async function saveGuide(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
}
async function openOrder(page:Page){
 await saveGuide(page);
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();return panel;
}
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true};
const edge={supplier:'Prueba',thicknessMm:.8,approved:true};
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('cantos del pedido: metros por SKU antes de validar y canto incompatible marcado con salida a la biblioteca',async({page},info)=>{
 await boot(page,info.outputDir);
 const [sheet,good,narrow]=await catalog([{name:'Placa cantos',kind:'sheet',patch:board},{name:'Canto ancho',kind:'edge',patch:{...edge,sku:'CB-22',widthMm:22}},{name:'Canto angosto',kind:'edge',patch:{...edge,sku:'CA-15',widthMm:15}}],all=>{all[0].compatibleIds=[all[1].id];});
 const panel=await openOrder(page),edges=panel.getByRole('region',{name:'Cantos del pedido'});
 await expect(edges).toContainText('Todavía no hay lados con canto');
 await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);
 const principal=page.getByLabel('Canto principal (1) del pedido');
 await expect(principal.locator('optgroup[label="No compatibles con la placa elegida"] option')).toHaveText(['Canto angosto · CA-15 · ancho 15 mm · no cubre el espesor de 19,05 mm']);
 await expect(principal.locator(':scope > option').nth(1)).toHaveText('Canto ancho · CB-22 · ancho 22 mm');
 await expect(page.getByLabel('Placa aprobada del pedido').locator('option').nth(1)).toHaveText('Placa cantos · BOARD-19 · 19,05 mm');
 // Lado 1 sin producto: la opción queda desactivada y el rótulo lo dice.
 // Nombre accesible que empieza con el rótulo visible (WCAG 2.5.3): «clic Arriba» por voz activa el control.
 const sides=panel.getByRole('group',{name:'Cantos respecto de esta vista 2D'});
 for(const side of ['Arriba','Abajo','Izquierda','Derecha']){const control=sides.getByRole('combobox',{name:`${side} · canto del pedido`,exact:true});await expect(control).toHaveCount(1);
  expect(await control.evaluate(el=>(el.closest('label')?.firstChild?.textContent||'').trim())).toBe(side);}
 const top=page.getByLabel('Arriba · canto del pedido');await expect(top.locator('option[value="1"]')).toHaveAttribute('disabled','');await expect(top.locator('option[value="1"]')).toHaveText('1 · Principal (sin canto asignado)');
 await principal.selectOption(good.id);await expect(top.locator('option[value="1"]')).toHaveText('1 · Principal (Canto ancho · CB-22)');
 await top.selectOption('1');await page.getByLabel('Izquierda · canto del pedido').selectOption('1');
 await expect(edges).toContainText('1 pieza con cantos marcados no se cuenta');
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
 const table=edges.getByRole('table',{name:'Cantos del pedido: metros lineales por SKU'});await expect(table.locator('tbody tr')).toHaveCount(1);
 await expect(table.locator('tbody th')).toContainText('Canto ancho · CB-22');await expect(table.locator('tbody td').first()).toHaveText(/^\d+,\d{3} m$/);await expect(table.locator('tbody td').nth(1)).toHaveText('2');
 await expect(page.getByRole('img',{name:/Vista 2D orientada para maderera: base [\d.,]+ × altura [\d.,]+ mm; arriba: canto principal CB-22, [\d.,]+ mm; abajo: sin canto; izquierda: canto principal CB-22/})).toBeVisible();
 await principal.selectOption(narrow.id);await expect(principal).toHaveAttribute('aria-invalid','true');
 const describedBy=await principal.getAttribute('aria-describedby');expect(describedBy).toBeTruthy();
 await expect(page.locator(`#${describedBy}`)).toContainText(/No compatible con la placa elegida: no cubre el espesor de [\d,]+ mm\./);
 // Con el pedido sin guardar, el enlace avisa y guarda el borrador antes de salir: no descarta la pieza en edición.
 const link=panel.getByRole('button',{name:'Revisar Canto angosto en la biblioteca',exact:true});await expect(link).toHaveAttribute('aria-describedby','workshop-catalog-save-help');
 let asked='';page.once('dialog',dialog=>{asked=dialog.message();void dialog.dismiss();});await link.click();
 expect(asked).toContain('se guarda primero el borrador del pedido');await expect(panel.getByRole('button',{name:'Pedido maderera',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(actions.filter(a=>a==='order_save')).toHaveLength(0);
 page.once('dialog',dialog=>void dialog.accept());await link.click();
 await expect(panel.getByRole('button',{name:'Biblioteca',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('Nombre de material de biblioteca')).toHaveValue('Canto angosto');
 await expect(panel.getByRole('status')).toContainText('Borrador del pedido guardado');expect(actions).toContain('order_save');
 await expect(page.getByLabel('Datos revisados y aprobados para este producto')).toBeChecked();await expect(page.getByLabel('Cargar precio opcional')).not.toBeChecked();
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(page.getByLabel('Canto principal (1) del pedido')).toHaveValue(narrow.id);
 await expect(page.getByLabel('Arriba · canto del pedido')).toHaveValue('1');await expect(page.getByLabel('Ejes de base / altura de la vista 2D')).toHaveValue('0,1');
});

test('cantos del pedido: un precio de canto viejo se marca desactualizado y fuera del subtotal vigente',async({page},info)=>{
 await boot(page,info.outputDir);const today=new Date().toISOString().slice(0,10),old=new Date(Date.now()-120*864e5).toISOString().slice(0,10);
 const [sheet,strip]=await catalog([{name:'Placa vigente',kind:'sheet',patch:{...board,price:{amount:1000,currency:'ARS',unit:'m2',date:today,source:'Lista sintética'}}},{name:'Canto viejo',kind:'edge',patch:{...edge,sku:'CV-22',widthMm:22,price:{amount:1234,currency:'ARS',unit:'metro',date:old,source:'Lista antigua sintética'}}}],all=>{all[0].compatibleIds=[all[1].id];});
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 for(const id of ids){
  await select.selectOption(id);await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
  await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);await page.getByLabel('Canto principal (1) del pedido').selectOption(strip.id);await page.getByLabel('Arriba · canto del pedido').selectOption('1');
  await page.getByLabel('Dirección de veta en esta vista').selectOption('none');await page.getByLabel('Veta / rotación del pedido').selectOption('locked');
  await page.getByLabel('Origen de la revisión de cantos').selectOption('manual');await page.getByLabel('Motivo y fuente de la inspección manual').fill('Cantos sintéticos inspeccionados');
  await page.getByLabel('Medidas que recibe la maderera').selectOption('finished_accepted');await page.getByLabel('Fuente / explicación de la revisión').fill('Medidas sintéticas aceptadas');
  for(const label of ['Orientación y cara verificadas','Material y espesor verificados','Corte / terminadas verificadas con la maderera','Los cuatro cantos coinciden con esta vista','Dirección de veta verificada'])await page.getByLabel(label,{exact:true}).check();
 }
 await panel.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Pedido coherente');
 const figures=panel.locator('.workshop-figures');await expect(figures.locator('dd').nth(1)).toHaveText(/^ARS /);
 const cell=panel.getByRole('table',{name:'Cantos del pedido: metros lineales por SKU'}).locator('tbody td').last();
 await expect(cell).toHaveText(/^ARS [\d.]+,\d{2} con precio desactualizado, fuera del subtotal vigente$/);await expect(cell).toHaveClass(/is-outdated/);
});

test('avisos en vivo: espesor, veta en V y giro deshabilitado con motivo, sin esperar la auditoría',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await catalog([{name:'Placa veta',kind:'sheet',patch:{...board,thicknessMm:25,grain:true}}]);
 const panel=await openOrder(page),plate=page.getByLabel('Placa aprobada del pedido');
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await plate.selectOption(sheet.id);
 await expect(plate).toHaveAttribute('aria-invalid','true');await expect(panel.locator('#workshop-warn-material')).toContainText(/El eje de espesor mide [\d,]+ mm y la placa tiene 25 mm/);
 const grain=page.getByLabel('Dirección de veta en esta vista');await grain.selectOption('v');await expect(grain).toHaveAttribute('aria-invalid','true');await expect(panel.locator('#workshop-warn-grainAxis')).toContainText('intercambiá los ejes');
 await grain.selectOption('u');await expect(grain).not.toHaveAttribute('aria-invalid','true');
 const rotation=page.getByLabel('Veta / rotación del pedido');await expect(rotation.locator('option[value="rotate"]')).toHaveAttribute('disabled','');
 await expect(panel.locator('#workshop-rotation-help')).toHaveText('Giro no disponible. La placa tiene veta: mantené la orientación (rota 0).');await expect(rotation).toHaveAttribute('aria-describedby','workshop-rotation-help');
 expect(actions.filter(a=>a==='order_audit'||a==='order_check')).toHaveLength(0);
});

test('aplicar a piezas equivalentes: Ruby copia los grupos elegidos, no las verificaciones, y anuncia lo pendiente',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await catalog([{name:'Placa repetida',kind:'sheet',patch:board}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);
 await page.getByLabel('Medidas que recibe la maderera').selectOption('finished_accepted');await page.getByLabel('Fuente / explicación de la revisión').fill('Laterales iguales revisados');
 await page.getByLabel('Material y espesor verificados',{exact:true}).check();
 const apply=panel.locator('details.workshop-apply');await expect(apply.locator(':scope > summary')).toHaveText(/^Aplicar a otras piezas · \d+ equivalentes?$/);await apply.locator(':scope > summary').click();
 const targets=apply.getByRole('group',{name:/^Piezas destino/});const count=await targets.getByRole('checkbox').count();expect(count).toBeGreaterThan(0);
 for(const box of await targets.getByRole('checkbox').all())await expect(box).toBeChecked();
 await apply.getByRole('checkbox',{name:/^Cantos/}).uncheck();await apply.getByRole('checkbox',{name:'Veta y rotación'}).uncheck();
 await apply.getByRole('button',{name:/^Aplicar a \d+ piezas?$/}).click();
 await expect(panel.getByRole('status')).toHaveText(new RegExp(`^Aplicado a ${count} piezas?; (se invalidó 1 confirmación|se invalidaron \\d+ confirmaciones|no se invalidó ninguna confirmación) y quedan \\d+ verificaci(ón|ones) por confirmar\\.$`));
 await select.selectOption(ids[1]);await expect(page.getByLabel('Placa aprobada del pedido')).toHaveValue(sheet.id);
 await expect(page.getByLabel('Fuente / explicación de la revisión')).toHaveValue('Laterales iguales revisados');await expect(page.getByLabel('Medidas que recibe la maderera')).toHaveValue('finished_accepted');
 await expect(page.getByLabel('Material y espesor verificados',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Dirección de veta en esta vista')).toHaveValue('');
 await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();
});

test('auditoría completa: todos los motivos, foco al campo, siguiente bloqueada, marca en el selector y ver en el modelo',async({page},info)=>{
 await boot(page,info.outputDir);await catalog([{name:'Placa audit',kind:'sheet',patch:board}]);
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await panel.getByRole('button',{name:'Revisar pedido y costo neto',exact:true}).click();
 const alert=panel.getByRole('alert');await expect(alert).toHaveClass(/workshop-error/);await expect(alert).toContainText(`(${ids[0]}): Elegí ejes U/V`);
 await panel.getByRole('button',{name:'Ver todas las piezas bloqueadas',exact:true}).click();
 const list=panel.getByRole('list',{name:'Piezas bloqueadas'});await expect(list.locator(':scope > li')).toHaveCount(3);
 await expect(panel.getByRole('heading',{name:/^3 piezas bloqueadas · 3 problemas$/})).toBeVisible();
 // Con ejes elegidos aparecen varios problemas independientes de la misma pieza en una sola pasada.
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
 await panel.getByRole('button',{name:'Volver a revisar',exact:true}).click();
 const first=list.locator(':scope > li').first();await expect(first.getByRole('list').locator('li').nth(2)).toBeVisible();
 await expect(first.getByRole('list').locator('li').first()).toHaveText(/^Falta confirmar orientación, material, medidas, cantos\.$/);
 await expect(select.locator('option').first()).toHaveText(/^Bloqueada · 0\/5 · /);
 await first.getByRole('button',{name:/^Ir a la pieza/}).click();await expect(page.getByLabel('Orientación y cara verificadas',{exact:true})).toBeFocused();
 await expect(panel.getByRole('button',{name:'Siguiente bloqueada'})).toHaveAttribute('aria-keyshortcuts','Alt+Shift+ArrowDown');
 await page.keyboard.press('Alt+Shift+ArrowDown');await expect(select).toHaveValue(ids[1]);await expect(page.getByLabel('Ejes de base / altura de la vista 2D')).toBeFocused();
 await expect(panel.getByRole('status')).toContainText('Bloqueada ·');
 await panel.getByRole('button',{name:'Siguiente bloqueada'}).click();await expect(select).toHaveValue(ids[2]);
 const see=list.getByRole('button',{name:new RegExp(`^Ver en el modelo .* · ${ids[1]}$`)});await see.focus();await page.keyboard.press('Enter');
 await expect(panel.getByRole('status')).toHaveText('Pieza resaltada en SketchUp. Volvé a esta ventana para seguir. El panel del pedido queda abierto.');await expect(see).toBeFocused();
 await expect(panel.locator('#workshop-progress')).not.toHaveAttribute('aria-live');
 expect(actions).toContain('piece_highlight');
 await panel.getByRole('button',{name:new RegExp(`^Ver en el modelo .* · ${ids[2]}$`)}).last().click();await expect(panel.getByRole('status')).toContainText('Pieza resaltada en SketchUp');
 await page.getByLabel('Detalle del pedido').fill('Editada');await expect(select.locator('option').first()).not.toHaveText(/^Bloqueada/);
});

test('pedido embebido: región sin diálogo, «Volver al inicio» y estado anunciado siempre montado',async({page},info)=>{
 await boot(page,info.outputDir);await saveGuide(page);
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Maderera',exact:true}).click();
 const region=page.getByRole('region',{name:'Biblioteca y pedidos'});await expect(region).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(region).not.toHaveAttribute('aria-busy');await expect(region.getByRole('button',{name:'Volver al inicio',exact:true})).toBeVisible();
 await expect(region.getByRole('button',{name:'Cerrar biblioteca y pedidos'})).toHaveCount(0);
 const status=region.getByRole('status');await expect(status).toHaveCount(1);await expect(status).toHaveAttribute('aria-live','polite');
 await region.getByRole('button',{name:'Guardar borrador del pedido',exact:true}).click();await expect(status).toContainText('Borrador guardado');
 await region.getByRole('button',{name:'Exportar TXT de prueba…',exact:true}).click();await expect(region.getByRole('alert')).toContainText('):');await expect(status).toHaveCount(1);
});

test('revisión de materiales y cantos observados: sin códigos internos, plural correcto y ver la pieza en el modelo',async({page},info)=>{
 await boot(page,info.outputDir,'materials');
 await page.getByRole('button',{name:'Materiales y cantos',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});
 await expect(dialog.getByRole('status')).toHaveCount(1);await expect(dialog.getByLabel('Mostrar materiales por tipo',{exact:true})).toBeVisible();
 await expect(dialog.locator('tbody').first()).not.toContainText(/\b1 piezas\b/);
 const pieces=dialog.getByLabel('Revisar una pieza: caras y materiales',{exact:true});await pieces.selectOption('1/11');
 await expect(dialog.getByText(/^XYZ locales escalados: [\d.,]+ mm × /)).not.toContainText(/\d\.\d{1,2} mm/);
 await dialog.getByRole('button',{name:/^Ver en el modelo .* · 1\/11$/}).click();await expect(dialog.getByRole('status')).toContainText('quedó resaltada en SketchUp');
 expect(actions).toContain('piece_highlight');
 await expect(dialog.locator('table').last()).not.toContainText(/painted_face|inherited_instance|unpainted/);
});

test('cantos observados traducidos: origen de la cara y lado mínimo o máximo',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');const [sheet]=await catalog([{name:'Placa observable',kind:'sheet',patch:board}]);
 const panel=await openOrder(page);
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);
 await panel.getByRole('button',{name:'Leer cantos de las caras',exact:true}).click();await expect(panel.getByText('Recorrido completo',{exact:true})).toBeVisible();
 const table=panel.locator('.edge-review table');await expect(table).not.toContainText(/painted_face|inherited_instance|unpainted|\b(min|max)\b/);
 await expect(table.locator('tbody tr').first().locator('td').first()).toContainText(/Eje [XYZ] · lado (mínimo|máximo)/);
 await table.locator('summary').first().click();await expect(table.locator('details').first()).toContainText(/\((cara pintada|heredado|sin pintar)\)/);
 await expect(panel.getByLabel(/^Producto para .* \(material:888\)$/)).toBeVisible();
 await expect(panel.locator('.edge-review [aria-live="polite"]')).toHaveCount(1);
});
