import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openDetail} from './fixtures/order-detail';

// 0.8.19: la maderera ve placas optimizadas, diagramas y total de cantos; el detalle por pieza queda plegado.
// Controlador Ruby real con dobles sintéticos de SketchUp; placas, SKU, precios y perfil son inventados. No es SketchUp real.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Library={catalog:{revision:number;items:Item[]}};
type Profiles={profiles:{revision:number;profiles:{id:string}[]}};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
 await page.exposeFunction('namesNativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',e=>errors.push(e.message));
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
async function useProfile(){
 const content={id:null,name:'Perfil sintético',supplier:'Proveedor de prueba',trimMm:10,kerfMm:4,dimensionRule:'finished',wastePercent:10,cutPrice:null,edgingPrice:null,encoding:'utf8',decimal:'.',header:false,notes:''};
 const saved=await send('maderera_profile_save',{profile:content,revision:0}) as Profiles;
 await send('maderera_profile_activate',{id:saved.profiles.profiles[0].id,revision:saved.profiles.revision});
}
async function openOrder(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(panel.locator('#workshop-problems-summary')).toBeVisible();return panel;
}
const today=()=>new Date().toISOString().slice(0,10);
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('maderera: placas optimizadas, diagramas y total de cantos a la vista; el detalle por pieza plegado y a mano',async({page},info)=>{
 await boot(page,info.outputDir);await useProfile();
 const [sheet,strip]=await catalog([{name:'Placa optimizada',kind:'sheet',patch:{sku:'PO-19',supplier:'Prueba',thicknessMm:19.05,lengthMm:2600,widthMm:1830,grain:true,price:{amount:9000,currency:'ARS',unit:'placa',date:today(),source:'Lista sintética'}}},
  {name:'Canto optimizado',kind:'edge',patch:{sku:'CO-22',supplier:'Prueba',thicknessMm:.8,widthMm:22,price:{amount:100,currency:'ARS',unit:'metro',date:today(),source:'Lista sintética'}}}]);
 const panel=await openOrder(page),detail=panel.locator('details.workshop-piece-detail'),select=panel.getByLabel('Pieza del pedido');
 // Cerrado por defecto: la vista principal no muestra pieza por pieza.
 await expect(detail).not.toHaveAttribute('open','');await expect(select).toBeHidden();await expect(detail.locator(':scope > summary')).toHaveText('Ver detalle por pieza · 3 piezas · 3 con problemas');
 const optim=panel.getByRole('region',{name:'Optimización de placas'});
 await expect(optim).toContainText('Optimización estimada.');await expect(optim).toContainText('La maderera puede optimizar distinto');
 await expect(optim).toContainText('refilado de 10 mm por lado y disco (kerf) de 4 mm del perfil «Perfil sintético» v 1');
 await expect(optim).toContainText('Todavía no hay piezas con placa y medidas para optimizar.');
 await expect(optim.getByRole('list',{name:'Avisos de la optimización'})).toContainText('3 piezas incluidas quedan fuera de la optimización: 3 sin placa.');
 // «Ir a la pieza» abre el detalle y lleva al campo del problema.
 await panel.getByLabel('Piezas con problemas').locator(':scope > li').first().getByRole('button',{name:/^Ir a la pieza/}).click();
 await expect(detail).toHaveAttribute('open','');await expect(page.getByLabel('Placa del pedido')).toBeFocused();
 for(const id of await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value))){
  await select.selectOption(id);await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Cara mostrada de la vista 2D').selectOption('1');
  await page.getByLabel('Placa del pedido').selectOption(sheet.id);await page.getByLabel('Canto principal (1) del pedido').selectOption(strip.id);await page.getByLabel('Arriba · canto del pedido').selectOption('1');
 }
 await expect(panel.locator('#workshop-problems-summary')).toHaveText('Sin problemas físicos: el pedido se puede exportar.');
 // Se pliega de nuevo y la vista principal queda con lo que importa a la maderera.
 await detail.locator(':scope > summary').click();await expect(select).toBeHidden();
 const summary=optim.getByRole('table',{name:'Optimización de placas por material'});
 await expect(summary.locator('thead th')).toHaveText(['Placa','Formato','Piezas','Placas','Aprovechamiento','m² netos','m² comprados','Costo estimado']);
 const row=summary.locator('tbody tr');await expect(row).toHaveCount(1);await expect(row.locator('th')).toContainText('Placa optimizada');await expect(row.locator('th')).toContainText('PO-19 · 19,05 mm · con veta');
 await expect(row.locator('td')).toHaveText(['2.600 × 1.830 mm','3','1',/^\d+,\d\s?%$/,/^0,\d{3}$/,'4,758','ARS 9.000,00']);
 await expect(optim.getByRole('img',{name:/^Placa 1 de 1: 3 piezas, aprovechamiento \d+,\d\s?%\. Placa 2\.600 × 1\.830 mm, veta a lo largo\.$/})).toBeVisible();
 // Piezas iguales, una sola letra en la leyenda.
 const legend=optim.getByRole('table',{name:'Leyenda de Placa optimizada: piezas iguales comparten letra'});await expect(legend.locator('tbody tr')).toHaveCount(1);await expect(legend.locator('tbody tr td').nth(1)).toHaveText('3');
 // Total de cantos: neto, con el 10 % del perfil y a comprar en metros enteros.
 const edges=panel.getByRole('region',{name:'Total de cantos del pedido'}),edgeRow=edges.getByRole('table',{name:/^Cantos del pedido: metros lineales por SKU/}).locator('tbody tr');
 await expect(edges.locator('thead th').nth(2)).toHaveText('Con margen (10 %)');await expect(edgeRow).toHaveCount(1);
 await expect(edgeRow.locator('td').nth(0)).toHaveText(/^\d+,\d{3} m$/);await expect(edgeRow.locator('td').nth(2)).toHaveText(/^\d+ metros?$/);
 // Presupuesto: la placa sale de la optimización (1 placa entera), no de m² + desperdicio.
 const budget=panel.getByRole('region',{name:'Presupuesto con desperdicio · Perfil sintético v 1'});
 const plate=budget.getByRole('table',{name:'Presupuesto estimado por material'}).locator('tbody tr').filter({hasText:'Placa optimizada'});
 await expect(plate.locator('th')).toContainText('según la optimización');await expect(plate.locator('td').nth(2)).toHaveText('1 placaARS 9.000,00');
 await expect(panel.getByText('Estimación neta de placas y cantos',{exact:true})).toBeHidden();
 await optim.screenshot({path:info.outputPath('maderera-optimizada-SINTETICA.png')});
 // El TXT no cambia: nueve columnas, una línea por medida.
 await panel.getByRole('button',{name:'Exportar TXT…',exact:true}).click();await expect(panel.getByRole('status')).toContainText('TXT y manifiesto (manifest.json) guardados');
 const folder=(await readdir(info.outputDir)).find(name=>name.startsWith('PlanosSanto-pedido-'))!;
 const txt=await readFile(resolve(info.outputDir,folder,'lote-01.txt'),'utf8');for(const line of txt.trim().split('\r\n'))expect(line.split('\t')).toHaveLength(9);
});

test('maderera: sin perfil en uso optimiza con los valores sugeridos y una pieza que no entra se avisa',async({page},info)=>{
 await boot(page,info.outputDir);
 const [sheet]=await catalog([{name:'Placa chica',kind:'sheet',patch:{sku:'PC-19',supplier:'Prueba',thicknessMm:19.05,lengthMm:620,widthMm:1000,grain:false}}]);
 const panel=await openOrder(page);await openDetail(panel);const select=panel.getByLabel('Pieza del pedido');
 for(const id of await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value))){await select.selectOption(id);await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Placa del pedido').selectOption(sheet.id);}
 const optim=panel.getByRole('region',{name:'Optimización de placas'});
 await expect(optim).toContainText('refilado de 10 mm por lado y disco (kerf) de 3 mm sugeridos: no hay perfil de maderera en uso');
 // 609,6 mm de base no entran en 600 mm útiles (620 − 2 × 10 de refilado).
 await expect(optim.getByRole('list',{name:'Avisos de la optimización'})).toContainText('«Placa chica»: 3 piezas no entran en la medida útil de 600 × 980 mm (después del refilado)');
 await expect(optim.getByRole('table',{name:'Optimización de placas por material'}).locator('tbody tr')).toHaveClass(/is-pending/);
});
