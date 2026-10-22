import {test,expect,type Page,type Locator} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// Hito 3 «Del modelo al TXT sin fricción»: proponer, vínculos de cantos del borrador, confirmar en bloque, aplicar a seleccionadas y código módulo·pieza.
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
async function openOrder(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Biblioteca y pedidos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Biblioteca y pedidos'});
 await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();await expect(panel.getByLabel('Pieza del pedido')).toBeVisible();return panel;
}
const proposeButton=(panel:Locator)=>panel.getByRole('group',{name:'Propuesta automática del pedido'}).getByRole('button',{name:'Proponer pedido desde el modelo',exact:true});
const board={sku:'BOARD-19',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false,approved:true};
const edge={supplier:'Prueba',thicknessMm:.8,approved:true};
const library=()=>catalog([{name:'Placa propuesta',kind:'sheet',patch:board},{name:'Canto blanco',kind:'edge',patch:{...edge,sku:'CB-22',widthMm:22}},{name:'Canto gris',kind:'edge',patch:{...edge,sku:'CG-22',widthMm:22}}],all=>{all[0].compatibleIds=[all[1].id,all[2].id];});
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('proponer desde el modelo: resumen sin confirmar, vínculo de canto del borrador y volver a proponer',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');const [,white]=await library();
 const panel=await openOrder(page),links=panel.getByRole('region',{name:'Vínculos de cantos del borrador'});
 await expect(links).toContainText('La lista se completa al proponer el pedido desde el modelo.');
 await proposeButton(panel).click();
 const summary=panel.getByRole('region',{name:'Propuesta desde el modelo'});await expect(summary).toBeVisible();
 await expect(summary).toContainText('Todo lo propuesto queda como propuesta sin confirmar');await expect(panel.getByRole('status')).toContainText(/^Propuesta lista: .* Nada quedó confirmado;/);
 await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();expect(actions).toContain('order_propose');
 // Ninguna pieza propuesta queda con verificaciones marcadas.
 await expect(panel.getByLabel('Orientación y cara verificadas',{exact:true})).not.toBeChecked();
 const review=summary.getByRole('list',{name:'Piezas propuestas en revisión'});
 await expect(review.locator(':scope > li')).toHaveCount(3);const first=review.locator(':scope > li').first();await expect(first).toContainText('Propuesta sin confirmar');
 await expect(first.getByRole('list')).toContainText('Vinculá «Canto de prueba» con un canto en «Vínculos de cantos del borrador».');
 const id=(await first.locator('strong').textContent())!.split(' · ').pop()!;await first.getByRole('button',{name:/^Ir a la pieza/}).click();await expect(panel.getByLabel('Pieza del pedido')).toHaveValue(id);
 // Material de canto observado sin vínculo nativo: se elige un canto aprobado para todo el borrador.
 const table=links.getByRole('table',{name:'Vínculos de cantos del borrador'});await expect(table.locator('tbody tr')).toHaveCount(2);
 await expect(table.locator('tbody tr').first()).toContainText('Canto de prueba');await expect(table.locator('tbody tr td.workshop-num')).toHaveText(['3','3']);
 const editable=links.getByLabel('Canto del borrador para Canto de prueba');await expect(editable).toBeEnabled();await expect(editable).toHaveValue('');
 await editable.selectOption(white.id);await expect(links).toContainText('Cambiaste vínculos de cantos. Volvé a proponer');await expect(panel.getByRole('status')).toContainText('Volvé a «Proponer pedido desde el modelo»');
 await proposeButton(panel).click();await expect(links).not.toContainText('Cambiaste vínculos de cantos');
 await expect(editable).toHaveValue(white.id);await expect(review.getByText('Vinculá «Canto de prueba»',{exact:false})).toHaveCount(0);expect(actions.filter(a=>a==='order_propose')).toHaveLength(2);
 // El vínculo viaja en el borrador guardado.
 await panel.getByRole('button',{name:'Guardar borrador del pedido',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Borrador guardado');
 await panel.getByRole('button',{name:'Biblioteca',exact:true}).click();await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await expect(links).toContainText('El borrador ya tiene 1 vínculo guardado.');
});

test('confirmar en bloque: solo las filas sin ambigüedad y el resto en revisión individual con motivos',async({page},info)=>{
 await boot(page,info.outputDir,'materials-edges');const [sheet,white,gray]=await library();
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido'),links=panel.getByRole('region',{name:'Vínculos de cantos del borrador'});
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await proposeButton(panel).click();
 await links.getByLabel('Canto del borrador para Canto de prueba').selectOption(white.id);await links.getByLabel('Canto del borrador para Canto secundario de prueba').selectOption(gray.id);
 await proposeButton(panel).click();await expect(links).not.toContainText('Cambiaste vínculos');
 // La placa del modelo no está en la biblioteca: la propuesta la deja pendiente y el bloque no confirma nada todavía.
 const summary=panel.getByRole('region',{name:'Propuesta desde el modelo'});await expect(summary.getByRole('list',{name:'Piezas propuestas en revisión'}).locator(':scope > li')).toHaveCount(ids.length);
 await expect(summary.getByRole('list',{name:'Piezas propuestas en revisión'}).locator(':scope > li').first()).toContainText('Sin placa aprobada.');
 await panel.getByRole('button',{name:'Confirmar en bloque las filas sin ambigüedad',exact:true}).click();expect(actions).toContain('order_confirm_bulk');
 await expect(panel.getByRole('status')).toHaveText(`No se confirmó ninguna pieza en bloque. Quedan ${ids.length} piezas en revisión individual.`);
 const bulk=panel.getByRole('region',{name:'Confirmación en bloque · 0 piezas confirmadas'}),list=bulk.getByRole('list',{name:'Piezas en revisión individual'});
 await expect(list.locator(':scope > li')).toHaveCount(ids.length);await expect(list.locator(':scope > li').first().getByRole('list')).toContainText('Sin placa aprobada.');
 // Con placa y veta elegidas a mano en dos piezas ya no falta la placa, pero el doble pinta cantos distintos en un lado largo
 // y uno corto: el mapa depende de la cara vista y esas piezas siguen en revisión individual (la confirmación positiva se prueba en Ruby).
 for(const id of ids.slice(0,2)){await select.selectOption(id);await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);await page.getByLabel('Dirección de veta en esta vista').selectOption('none');await page.getByLabel('Veta / rotación del pedido').selectOption('locked');}
 await expect(bulk).toContainText('Resultado anterior a tus últimos cambios.');
 await panel.getByRole('button',{name:'Confirmar en bloque las filas sin ambigüedad',exact:true}).click();
 const after=panel.getByRole('region',{name:'Confirmación en bloque · 0 piezas confirmadas'}).getByRole('list',{name:'Piezas en revisión individual'});
 await expect(after.locator(':scope > li')).toHaveCount(ids.length);
 const first=after.locator(':scope > li').filter({hasText:` · ${ids[0]}`});await expect(first).not.toContainText('Sin placa aprobada.');
 await first.getByRole('button',{name:/^Ir a la pieza/}).click();await expect(select).toHaveValue(ids[0]);await expect(select.locator(`option[value="${ids[0]}"]`)).toHaveText(/^0\/5 · /);
 await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();
});

// El doble sintético usa la misma definición de placa en las tres piezas: todas son equivalentes y no hay «Otras piezas del pedido» que listar.
test('aplicar solo a las piezas seleccionadas: Ruby aplica, informa lo invalidado y no toca las no elegidas',async({page},info)=>{
 await boot(page,info.outputDir);const [sheet]=await library();
 const panel=await openOrder(page),select=panel.getByLabel('Pieza del pedido');
 const ids=await select.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
 await page.getByLabel('Ejes de base / altura de la vista 2D').selectOption('0,1');await page.getByLabel('Placa aprobada del pedido').selectOption(sheet.id);
 await page.getByLabel('Medidas que recibe la maderera').selectOption('finished_accepted');await page.getByLabel('Fuente / explicación de la revisión').fill('Medidas sintéticas');
 const apply=panel.locator('details.workshop-apply');await expect(apply.locator(':scope > summary')).toHaveText('Aplicar a otras piezas · 2 equivalentes');await apply.locator(':scope > summary').click();
 await expect(apply.locator('details.workshop-apply-others')).toHaveCount(0);
 const equivalents=apply.getByRole('group',{name:/^Piezas destino equivalentes/});
 for(const box of await equivalents.getByRole('checkbox').all())await box.uncheck();
 await expect(apply.getByRole('button',{name:'Aplicar a 0 piezas',exact:true})).toBeDisabled();
 await equivalents.getByRole('checkbox',{name:new RegExp(` · ${ids[1]}$`)}).check();await expect(equivalents).toHaveAccessibleName('Piezas destino equivalentes (1 de 2)');
 await apply.getByRole('button',{name:'Aplicar a 1 pieza',exact:true}).click();expect(actions).toContain('order_apply');
 await expect(panel.getByRole('status')).toHaveText(/^Aplicado a 1 pieza; (se invalidó 1 confirmación|se invalidaron \d+ confirmaciones|no se invalidó ninguna confirmación) y quedan \d+ verificaci(ón|ones) por confirmar\./);
 await select.selectOption(ids[1]);await expect(page.getByLabel('Placa aprobada del pedido')).toHaveValue(sheet.id);await expect(page.getByLabel('Fuente / explicación de la revisión')).toHaveValue('Medidas sintéticas');
 await expect(page.getByLabel('Material y espesor verificados',{exact:true})).not.toBeChecked();
 await select.selectOption(ids[2]);await expect(page.getByLabel('Placa aprobada del pedido')).toHaveValue('');
 await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();
});

test('código módulo·pieza: casilla del perfil guardada en el borrador y aviso en vivo si falta el código',async({page},info)=>{
 await boot(page,info.outputDir);await library();
 const panel=await openOrder(page),profile=panel.locator('details',{has:page.getByText('Perfil del archivo para la maderera',{exact:true})});
 await profile.locator('summary').click();const box=profile.getByRole('checkbox',{name:'Agregar código módulo·pieza al detalle (ej. M03·P07)',exact:true});
 await expect(box).not.toBeChecked();const detail=page.getByLabel('Detalle del pedido'),hint=panel.locator('#workshop-detail-code');
 await expect(detail).not.toHaveAttribute('aria-invalid','true');
 await box.check();await expect(panel.getByText('Cambios sin guardar',{exact:false})).toBeVisible();
 // La guía sintética no tiene código de módulo: el aviso lo dice en la pieza y en el perfil (la regla de 80 caracteres se prueba en vitest).
 await expect(hint).toHaveText('Falta el código módulo·pieza: completá módulo y código de pieza en la guía y guardala, o desactivá el código en el perfil del archivo.');
 await expect(detail).toHaveAttribute('aria-invalid','true');await expect(profile).toContainText('3 piezas incluidas no tienen código: completá módulo y código en la guía.');
 await panel.getByRole('button',{name:'Guardar borrador del pedido',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Borrador guardado');
 await panel.getByRole('button',{name:'Biblioteca',exact:true}).click();await panel.getByRole('button',{name:'Pedido maderera',exact:true}).click();
 await profile.locator('summary').click();await expect(box).toBeChecked();
 await box.uncheck();await expect(detail).not.toHaveAttribute('aria-invalid','true');
});
