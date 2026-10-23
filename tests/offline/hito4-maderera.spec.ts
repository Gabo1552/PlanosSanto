import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// Hito 4: alta desde valores sugeridos y variantes de espesor en la biblioteca del taller.
// Controlador Ruby real con dobles sintéticos de SketchUp; no se abre ni se escribe ningún SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:{action:string;data:Record<string,unknown>}[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
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
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

// 0.8.20: el perfil de maderera, el presupuesto y las salidas por espesor distinto del pedido dejaron de mostrarse
// (la maderera es la optimización por placa: maderera-placas.spec.ts). Queda la biblioteca v2 de Materiales.
test('biblioteca v2: alta desde valor sugerido y variante de espesor; la ficha dice qué le falta, sin aprobar nada',async({page},info)=>{
 await boot(page,info.outputDir);
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca del taller'});
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
 await expect(panel.locator('#workshop-item-complete')).toHaveText('Ficha completa: se puede usar para la maderera.');await expect(panel.getByRole('note')).toContainText('ficha de origen de la variante');
 expect(actions.map(a=>a.action)).toEqual(expect.arrayContaining(['catalog_presets','catalog_add_preset','catalog_variant']));
});
