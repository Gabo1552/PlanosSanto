import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// Hito 4: perfil de maderera versionado, presupuesto en tres columnas con servicios, alta desde valores sugeridos y variantes de espesor.
// Controlador Ruby real con dobles sintéticos de SketchUp; no se abre ni se escribe ningún SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:{action:string;data:Record<string,unknown>}[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];actions=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',(message:string)=>{const msg=JSON.parse(message);actions.push({action:msg.action,data:msg.data});return raw(message);});
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
async function fillOrder(page:Page,panel:ReturnType<Page['getByRole']>,sheetId:string,stripId:string){
 const select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 for(const id of ids){
  // 0.8.16: ejes, cara, veta y medidas ya vienen propuestos; solo se eligen placa y canto, sin tildes.
  await select.selectOption(id);await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
  await page.getByLabel('Placa del pedido').selectOption(sheetId);await page.getByLabel('Canto principal (1) del pedido').selectOption(stripId);await page.getByLabel('Arriba · canto del pedido').selectOption('1');
 }
 await expect(panel.locator('#workshop-problems-summary')).toHaveText('Sin problemas físicos: el pedido se puede exportar.');
}
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false};
const edge={supplier:'Prueba',thicknessMm:.8};
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('perfil de maderera: queda sin aprobar, se aprueba, se usa en pedidos y el presupuesto muestra tres columnas y servicios',async({page},info)=>{
 await boot(page,info.outputDir);const today=new Date().toISOString().slice(0,10);
 const [sheet,strip]=await catalog([{name:'Placa presupuesto',kind:'sheet',patch:{...board,price:{amount:10000,currency:'ARS',unit:'m2',date:today,source:'Lista sintética'}}},{name:'Canto presupuesto',kind:'edge',patch:{...edge,sku:'CP-22',widthMm:22,price:{amount:300,currency:'ARS',unit:'metro',date:today,source:'Lista sintética'}}}],all=>{all[0].compatibleIds=[all[1].id];});
 const panel=await openOrder(page);
 await panel.getByRole('button',{name:'Perfil de maderera',exact:true}).click();await expect(panel.getByRole('button',{name:'Perfil de maderera',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(panel).toContainText('El TXT sigue siendo de nueve columnas');await expect(panel).toContainText('Los valores son sugeridos hasta que apruebes una versión');
 await expect(panel.getByLabel('Refilado por lado (mm)')).toHaveValue('10');await expect(panel.getByLabel('Kerf: espesor de la sierra (mm)')).toHaveValue('3');await expect(panel.getByLabel('Desperdicio (%)')).toHaveValue('15');
 const rule=panel.getByLabel('Regla de medidas');await rule.selectOption('deduct_edge');
 await expect(rule).toHaveAttribute('aria-describedby','madera-deduct-risk');await expect(panel.locator('#madera-deduct-risk')).toContainText('Riesgo de descontar dos veces');await rule.selectOption('finished');
 await panel.getByLabel('Nombre del perfil').fill('Maderera sintética');await panel.getByLabel('Proveedor',{exact:true}).fill('Proveedor de prueba');
 const cut=panel.getByRole('group',{name:'Tarifa de corte'});await cut.getByLabel('Cargar tarifa (opcional)').check();await cut.getByLabel('Unidad').selectOption('placa');await cut.getByLabel('Importe').fill('5000');await cut.getByLabel('Fuente de la tarifa').fill('Lista de corte sintética');
 const edging=panel.getByRole('group',{name:'Tarifa de canteado (por metro)'});await edging.getByLabel('Cargar tarifa (opcional)').check();await edging.getByLabel('Importe').fill('150');await edging.getByLabel('Fuente de la tarifa').fill('Lista de canteado sintética');
 await expect(panel.getByRole('button',{name:'Aprobar esta versión',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Perfil guardado como versión 1, sin aprobar');
 const list=panel.getByRole('group',{name:'Perfiles de maderera'}),entry=list.getByRole('button',{name:/^Maderera sintética/});
 await expect(entry).toContainText('Sin aprobar · v 1');await expect(entry).toHaveAttribute('aria-pressed','true');
 const use=panel.getByRole('button',{name:'Usar en pedidos',exact:true});await expect(use).toBeDisabled();
 const saved=actions.find(a=>a.action==='maderera_profile_save')!.data as {profile:Record<string,unknown>};expect(saved.profile).not.toHaveProperty('approved');expect(saved.profile).not.toHaveProperty('version');
 await panel.getByRole('button',{name:'Aprobar esta versión',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Versión 1 aprobada');await expect(entry).toContainText('Aprobado · v 1');
 await use.click();const stop=panel.getByRole('button',{name:'Dejar de usar',exact:true});await expect(stop).toBeEnabled();await expect(entry).toContainText('En uso en pedidos');
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();const select=panel.getByLabel('Pieza del pedido');await expect(select).toBeVisible();
 await fillOrder(page,panel,sheet.id,strip.id);
 const budget=panel.getByRole('region',{name:'Presupuesto con desperdicio · Maderera sintética v 1'});await expect(budget).toBeVisible();
 const table=budget.getByRole('table',{name:'Presupuesto estimado por material'});
 await expect(table.locator('thead th')).toHaveText(['Material','Neto','Con desperdicio (15 %)','A comprar (placas enteras / metros)','Estado']);
 const rows=table.locator('tbody tr');await expect(rows).toHaveCount(2);
 const plate=rows.filter({hasText:'Placa presupuesto'});await expect(plate.locator('td').nth(0)).toHaveText(/^\d+,\d{3} m²ARS [\d.]+,\d{2}$/);await expect(plate.locator('td').nth(2)).toHaveText(/^\d+ placas?ARS [\d.]+,\d{2}$/);await expect(plate.locator('td').nth(3)).toHaveText('Vigente');
 await expect(rows.filter({hasText:'Canto presupuesto'}).locator('td').nth(2)).toHaveText(/^\d+,00 mARS [\d.]+,\d{2}$/);
 await expect(table.locator('tfoot tr')).toContainText('Total vigente');await expect(table.locator('tfoot td').nth(2)).toHaveText(/^ARS [\d.]+,\d{2}$/);
 const services=budget.getByRole('table',{name:'Servicios de la maderera'});await expect(services.locator('tbody th')).toHaveText(['Corte','Canteado']);
 await expect(services.locator('tbody tr').first().locator('td').first()).toHaveText(/^\d+ placas?$/);await expect(services.locator('tfoot')).toContainText(/ARS [\d.]+,\d{2}/);
 await expect(budget).toContainText('Estimación: la maderera optimiza el corte; no es un presupuesto cerrado');
 await page.screenshot({path:info.outputPath('presupuesto-SINTETICO.png'),fullPage:true});
});

test('espesor distinto ofrece variante, otra placa o excluir; sin perfil en uso el presupuesto invita a aprobar y activar uno',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet,strip,thick]=await catalog([{name:'Placa buena',kind:'sheet',patch:board},{name:'Canto bueno',kind:'edge',patch:{...edge,sku:'CB-22',widthMm:22}},{name:'Placa gruesa',kind:'sheet',patch:{...board,sku:'BOARD-25',thicknessMm:25}}],all=>{all[0].compatibleIds=[all[1].id];});
 const panel=await openOrder(page);
 let asked='';page.on('dialog',dialog=>{asked=dialog.message();void dialog.dismiss();});
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Detalle del pedido').fill('Lateral a conservar');await page.getByLabel('Placa del pedido').selectOption(thick.id);
 const options=panel.getByRole('group',{name:'Opciones por espesor distinto'});await expect(options).toBeVisible();await expect(options).toContainText('el pedido conserva tus cambios');
 await options.getByRole('button',{name:'Elegir otra placa',exact:true}).click();await expect(page.getByLabel('Placa del pedido')).toBeFocused();
 await options.getByRole('button',{name:'Excluir la pieza',exact:true}).click();
 await expect(page.getByLabel('Incluir pieza física en el pedido')).not.toBeChecked();await expect(page.getByLabel('Incluir pieza física en el pedido')).toBeFocused();
 await page.getByLabel('Incluir pieza física en el pedido').check();await expect(options).toBeVisible();
 // Sin confirmación: crear la variante cambia la biblioteca y el pedido se cruza solo, sin perder lo editado.
 await options.getByRole('button',{name:/^Crear variante de Placa gruesa de [\d,]+ mm$/}).click();
 await expect(panel.getByRole('status')).toContainText('el pedido se conserva');expect(asked).toBe('');
 const variant=actions.find(a=>a.action==='catalog_variant')!.data;expect(variant).toMatchObject({id:thick.id});expect(Math.abs((variant.thicknessMm as number)-25)).toBeGreaterThan(.1);
 await expect(page.getByLabel('Detalle del pedido')).toHaveValue('Lateral a conservar');
 await fillOrder(page,panel,sheet.id,strip.id);
 const empty=panel.getByRole('region',{name:'Presupuesto con desperdicio',exact:true});await expect(empty).toContainText('Sin perfil de maderera aprobado en uso');
 await empty.getByRole('button',{name:'Ir a Perfil de maderera',exact:true}).click();await expect(panel.getByRole('button',{name:'Perfil de maderera',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(asked).toBe('');
});

test('biblioteca v2: alta desde valor sugerido y variante de espesor; la ficha dice qué le falta, sin aprobar nada',async({page},info)=>{
 await boot(page,info.outputDir);
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Alta rápida desde valores sugeridos',exact:true}).click();
 const quick=panel.getByRole('group',{name:'Alta rápida desde valores sugeridos'});await expect(quick).toContainText('Con medidas sugeridas; completá el SKU.');
 await quick.getByLabel('Valor sugerido').selectOption('melamina-18-2750');await quick.getByLabel('Nombre (opcional)').fill('Melamina blanca');
 await quick.getByRole('button',{name:'Crear sugerido',exact:true}).click();
 await expect(panel.getByRole('status')).toContainText('Material «Melamina blanca» creado con valores sugeridos. Completá su SKU');
 await expect(page.getByLabel('Nombre de material de biblioteca')).toHaveValue('Melamina blanca');await expect(page.getByLabel('Espesor de biblioteca')).toHaveValue('18');
 await expect(panel.getByRole('checkbox',{name:/aprobad/})).toHaveCount(0);await expect(panel.locator('#workshop-item-complete')).toContainText('Falta: SKU, veta');
 await expect(panel.getByRole('note')).toHaveText('Valores precargados desde valores sugeridos del taller: largo, espesor y ancho. Corregilos si no coinciden con el producto.');
 const details=panel.locator('details.catalog-v2-variant');await details.locator('summary').click();
 await details.getByLabel('Espesor de la variante (mm)').fill('15');await details.getByRole('button',{name:'Crear variante',exact:true}).click();
 await expect(panel.getByRole('status')).toContainText(/Variante «.+15 mm» creada sin SKU ni precio/);
 await expect(page.getByLabel('Espesor de biblioteca')).toHaveValue('15');await expect(panel).toContainText('Variante de espesor de «Melamina blanca».');
 await expect(panel.getByRole('note')).toContainText('ficha de origen de la variante');
 await page.getByLabel('SKU de biblioteca').fill('MB-15');await page.getByLabel('Veta de biblioteca').selectOption('false');
 await expect(panel.locator('#workshop-item-complete')).toHaveText('Ficha completa: se puede usar en pedidos.');await expect(panel.getByRole('note')).toContainText('ficha de origen de la variante');
 expect(actions.map(a=>a.action)).toEqual(expect.arrayContaining(['catalog_presets','catalog_add_preset','catalog_variant']));
});
