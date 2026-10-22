import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openDetail} from './fixtures/order-detail';

// Del modelo al TXT sin tildes (0.8.16): el pedido se propone solo al abrirlo, se guarda solo, los problemas
// físicos se ven en vivo por pieza y hay un único «Exportar TXT». Controlador Ruby real con dobles sintéticos.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:string[],prompts:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string,mode='safe'){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];actions=[];prompts=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,mode],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',(message:string)=>{actions.push(JSON.parse(message).action);return raw(message);});
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
 // Ninguna confirmación nativa en el pedido salvo «Volver a proponer» con cambios a mano (lo cuenta cada prueba).
 page.on('dialog',dialog=>{prompts.push(dialog.message());void dialog.dismiss();});
 await page.route('https://planos-santo.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
  await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
 });
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
}
async function catalog(items:{name:string;kind:string;patch:Record<string,unknown>}[]){
 let library:Library|undefined;
 for(const item of items)library=await send('catalog_add',{revision:library?.catalog.revision??0,item:{name:item.name,kind:item.kind}}) as Library;
 const all=library!.catalog.items;items.forEach((item,i)=>Object.assign(all[i],item.patch));
 await send('catalog_save',{revision:library!.catalog.revision,items:all});return all;
}
async function openOrder(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await openDetail(panel);await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();return panel;
}
// Fichas completas sin la vieja casilla «aprobada».
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false};
const edge={supplier:'Prueba',thicknessMm:.8};
const library=()=>catalog([{name:'Placa propuesta',kind:'sheet',patch:board},{name:'Canto blanco',kind:'edge',patch:{...edge,sku:'CB-22',widthMm:22}},{name:'Canto gris',kind:'edge',patch:{...edge,sku:'CG-22',widthMm:22}}]);
const sideValues=(page:Page)=>Promise.all(['Arriba','Abajo','Izquierda','Derecha'].map(side=>page.getByLabel(`${side} · canto del pedido`).inputValue()));
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('propuesta automática al abrir: sin tildes ni «Proponer», y los cantos pintados sin vínculo se resuelven solos al vincularlos',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');const [,white,gray]=await library();
 const panel=await openOrder(page);
 expect(actions).toContain('order_plan');expect(actions).not.toContain('order_propose');expect(actions).not.toContain('order_save');
 await expect(panel.getByRole('button',{name:/Proponer pedido|Confirmar en bloque|Revisar pedido|Guardar borrador|Ver piezas bloqueadas/})).toHaveCount(0);
 await expect(panel.getByRole('checkbox',{name:/verificad|coinciden/})).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'Exportar TXT…',exact:true})).toHaveClass(/workshop-primary/);
 await expect(page.getByLabel('Ejes de base / altura de la vista 2D')).not.toHaveValue('');await expect(page.getByLabel('Cara mostrada de la vista 2D')).not.toHaveValue('');
 // Cantos pintados con materiales del modelo sin vínculo: el selector aparece solo para ellos.
 const links=panel.getByRole('region',{name:'Cantos pintados sin vínculo'}),table=links.getByRole('table',{name:'Cantos pintados sin vínculo'});
 await expect(table.locator('tbody tr')).toHaveCount(2);await expect(table.locator('tbody tr td.workshop-num')).toHaveText(['3','3']);
 await expect(panel.getByRole('list',{name:'Avisos de los cantos del modelo'})).toContainText('vinculá «Canto de prueba»');
 expect((await sideValues(page)).every(value=>value==='0')).toBe(true);
 await links.getByLabel('Canto de biblioteca para Canto de prueba').selectOption(white.id);
 await links.getByLabel('Canto de biblioteca para Canto secundario de prueba').selectOption(gray.id);
 // El guardado automático vuelve a proponer las piezas con el vínculo: los lados quedan con sus cantos.
 const totals=panel.getByRole('region',{name:'Cantos del pedido'});await expect(totals).toContainText('CB-22');await expect(totals).toContainText('CG-22');
 expect((await sideValues(page)).sort()).toEqual(['0','0','1','2']);
 await expect(panel.getByRole('list',{name:'Avisos de los cantos del modelo'})).toHaveCount(0);
 await expect(panel.getByText('Cantos leídos de las caras pintadas del modelo.',{exact:true})).toBeVisible();
 expect(actions).toContain('order_save');
 // El vínculo y los cantos viajan en el borrador guardado.
 await panel.getByRole('button',{name:'Biblioteca',exact:true}).click();await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await expect(links.getByLabel('Canto de biblioteca para Canto de prueba')).toHaveValue(white.id);expect((await sideValues(page)).sort()).toEqual(['0','0','1','2']);
 // Dar vuelta la cara no borra nada: izquierda y derecha intercambian su canto.
 const before=await sideValues(page),face=page.getByLabel('Cara mostrada de la vista 2D');await face.selectOption((await face.inputValue())==='1'?'-1':'1');
 const after=await sideValues(page);expect([after[0],after[1],after[2],after[3]]).toEqual([before[0],before[1],before[3],before[2]]);
 await expect(panel.getByText('Cantos leídos de las caras pintadas del modelo.',{exact:true})).toBeVisible();
 expect(prompts).toEqual([]);
});

test('problemas en vivo y un solo «Exportar TXT»: elegir la placa resuelve las piezas y se exporta sin ningún tilde',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await library();
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido'),summary=panel.locator('#workshop-problems-summary');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(ids).toHaveLength(3);
 // El doble no tiene placas de la biblioteca pintadas: cada pieza pide la placa, nada más.
 await expect(summary).toHaveText('3 piezas con 3 problemas que impiden exportar.');
 const problems=panel.getByRole('list',{name:'Piezas con problemas'});await expect(problems.locator(':scope > li')).toHaveCount(3);await expect(problems).toContainText('Elegí una placa de la biblioteca.');
 await expect(select.locator('option').first()).toHaveText(/^Con problemas · /);
 await problems.locator(':scope > li').nth(1).getByRole('button',{name:/^Ir a la pieza/}).click();await expect(select).toHaveValue(ids[1]);await expect(page.getByLabel('Placa del pedido')).toBeFocused();
 await panel.getByRole('button',{name:'Exportar TXT…',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('No se exportó');expect(actions).not.toContain('order_export');
 for(const id of ids){await select.selectOption(id);await page.getByLabel('Placa del pedido').selectOption(sheet.id);}
 await expect(summary).toHaveText('Sin problemas físicos: el pedido se puede exportar.');await expect(problems).toHaveCount(0);
 await expect(select.locator('option').first()).toHaveText(/^Lista · /);await expect(panel.locator('#workshop-progress')).toContainText('3 de 3 piezas listas');
 // Sin problemas, el costo neto aparece solo.
 const figures=panel.locator('.workshop-figures');await expect(figures.locator('dt')).toHaveText(['Subtotal vigente','Precios desactualizados','Consumos sin precio']);await expect(figures.locator('dd').nth(2)).toHaveText('3');
 await panel.getByRole('button',{name:'Exportar TXT…',exact:true}).click();await expect(panel.getByRole('status')).toContainText('TXT y manifiesto (manifest.json) guardados');
 const folders=(await readdir(info.outputDir)).filter(name=>name.startsWith('PlanosSanto-pedido-'));expect(folders).toHaveLength(1);
 const manifest=JSON.parse(await readFile(resolve(info.outputDir,folders[0],'manifest.json'),'utf8'));expect(manifest.lots[0].physicalQuantity).toBe(3);
 for(const row of manifest.lots[0].sourceRows)for(const key of ['orientationConfirmed','materialConfirmed','dimensionsConfirmed','edgesConfirmed','grainConfirmed','reviewNote','edgeResolution'])expect(row).not.toHaveProperty(key);
 const txt=await readFile(resolve(info.outputDir,folders[0],'lote-01.txt'),'utf8');for(const line of txt.trim().split('\r\n'))expect(line.split('\t')).toHaveLength(9);
 expect(prompts).toEqual([]);
 // Lo elegido se guardó solo: reabrir el pedido lo conserva.
 await panel.getByRole('button',{name:'Biblioteca',exact:true}).click();await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await expect(page.getByLabel('Placa del pedido')).toHaveValue(sheet.id);await expect(summary).toHaveText('Sin problemas físicos: el pedido se puede exportar.');
});

test('excluir no pide motivo y «Volver a proponer» pregunta solo cuando hay cambios a mano',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await library();
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido'),reset=panel.getByRole('button',{name:'Volver a proponer todo desde el modelo',exact:true});
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await reset.click();await expect(panel.getByRole('status')).toContainText('Pedido propuesto de nuevo desde el modelo');expect(prompts).toEqual([]);
 await select.selectOption(ids[2]);await page.getByLabel('Incluir pieza física en el pedido').uncheck();
 await expect(select.locator('option').nth(2)).toHaveText(/^Excluida · /);await expect(panel.getByLabel('Nota de exclusión (opcional)')).toHaveValue('');
 await select.selectOption(ids[0]);await page.getByLabel('Placa del pedido').selectOption(sheet.id);
 await expect(panel.getByText(/Cambiado a mano en esta pieza: placa\./)).toBeVisible();
 await expect(panel.locator('#workshop-problems-summary')).toHaveText('1 pieza con 1 problema que impide exportar.');
 await reset.click();expect(prompts).toHaveLength(1);expect(prompts[0]).toContain('reemplaza los cambios que hiciste a mano');
 await expect(page.getByLabel('Placa del pedido')).toHaveValue(sheet.id,{timeout:2000});
 await panel.getByRole('button',{name:'Volver a la propuesta del modelo',exact:true}).click();await expect(page.getByLabel('Placa del pedido')).toHaveValue('');
});

// El doble sintético usa la misma definición de placa en las tres piezas: todas son equivalentes y no hay «Otras piezas del pedido» que listar.
test('aplicar solo a las piezas seleccionadas: Ruby copia y no toca las no elegidas',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await library();
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await page.getByLabel('Placa del pedido').selectOption(sheet.id);await page.getByLabel('Medidas que recibe la maderera').selectOption('explicit_cut');
 await page.getByLabel('Base de corte mm').fill('600');await page.getByLabel('Altura de corte mm').fill('400');
 const apply=panel.locator('details.workshop-apply');await expect(apply.locator(':scope > summary')).toHaveText('Aplicar a otras piezas · 2 equivalentes');await apply.locator(':scope > summary').click();
 await expect(apply.locator('details.workshop-apply-others')).toHaveCount(0);
 const equivalents=apply.getByRole('group',{name:/^Piezas destino equivalentes/});
 for(const box of await equivalents.getByRole('checkbox').all())await box.uncheck();
 await expect(apply.getByRole('button',{name:'Aplicar a 0 piezas',exact:true})).toBeDisabled();
 await equivalents.getByRole('checkbox',{name:new RegExp(` · ${ids[1]}$`)}).check();await expect(equivalents).toHaveAccessibleName('Piezas destino equivalentes (1 de 2)');
 await apply.getByRole('button',{name:'Aplicar a 1 pieza',exact:true}).click();
 await expect(panel.getByRole('status')).toHaveText(/^Aplicado a 1 pieza\./);expect(actions).toContain('order_apply');
 await select.selectOption(ids[1]);await expect(page.getByLabel('Placa del pedido')).toHaveValue(sheet.id);await expect(page.getByLabel('Base de corte mm')).toHaveValue('600');
 await select.selectOption(ids[2]);await expect(page.getByLabel('Placa del pedido')).toHaveValue('');
 await expect(panel.locator('#workshop-problems-summary')).toHaveText('1 pieza con 1 problema que impide exportar.');
});

test('código módulo·pieza: casilla del perfil guardada sola en el borrador y aviso en vivo si falta el código',async({page},info)=>{
 await boot(page,info.outputDir);await library();
 const panel=await openOrder(page),profile=panel.locator('details',{has:page.getByText('Perfil del archivo para la maderera',{exact:true})});
 await profile.locator('summary').click();const box=profile.getByRole('checkbox',{name:'Agregar código módulo·pieza al detalle (ej. M03·P07)',exact:true});
 await expect(box).not.toBeChecked();const detail=page.getByLabel('Detalle del pedido'),hint=panel.locator('#workshop-detail-code');
 await expect(detail).not.toHaveAttribute('aria-invalid','true');
 await box.check();
 // La guía sintética no tiene código de módulo: el aviso lo dice en la pieza y en el perfil (la regla de 80 caracteres se prueba en vitest).
 await expect(hint).toHaveText('Falta el código módulo·pieza: completá módulo y código de pieza en la guía y guardala, o desactivá el código en el perfil del archivo.');
 await expect(detail).toHaveAttribute('aria-invalid','true');await expect(profile).toContainText('3 piezas incluidas no tienen código: completá módulo y código en la guía.');
 await expect(panel.getByRole('list',{name:'Piezas con problemas'})).toContainText('Falta el código módulo·pieza');
 await panel.getByRole('button',{name:'Biblioteca',exact:true}).click();await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await profile.locator('summary').click();await expect(box).toBeChecked();
 await box.uncheck();await expect(detail).not.toHaveAttribute('aria-invalid','true');
 expect(prompts).toEqual([]);
});
