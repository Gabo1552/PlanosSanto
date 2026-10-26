import {openMaterialTool} from './fixtures/modules';
import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// UX2 del taller: maderera embebida y revisión de materiales con «Ver en el modelo».
// 0.8.20: cantos por SKU del pedido, avisos en vivo, piezas equivalentes y auditoría por pieza se quitaron con el pedido
// pieza por pieza; la maderera por placa la cubre maderera-placas.spec.ts.
// Controlador Ruby real con dobles sintéticos de SketchUp; no se abre ni se escribe ningún SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[],actions:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
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
async function saveGuide(page:Page){
 await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
 await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('maderera embebida: región sin diálogo, «Volver al inicio» y estado anunciado siempre montado',async({page},info)=>{
 await boot(page,info.outputDir);await saveGuide(page);
 await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Maderera',exact:true}).click();
 const region=page.getByRole('region',{name:'Optimización de placas'});await expect(region).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(region).not.toHaveAttribute('aria-busy');await expect(region.getByRole('button',{name:'Volver al inicio',exact:true})).toBeVisible();
 await expect(region.getByRole('button',{name:/^Cerrar/})).toHaveCount(0);
 const status=region.getByRole('status');await expect(status).toHaveCount(1);await expect(status).toHaveAttribute('aria-live','polite');
 // Sin placas pintadas no hay TXT que exportar: el botón queda deshabilitado y el estado sigue montado al actualizar.
 await expect(region.getByRole('button',{name:'Exportar todos los TXT…',exact:true})).toBeDisabled();
 await region.getByRole('button',{name:'Actualizar desde el modelo',exact:true}).click();await expect(region.getByRole('list',{name:'Piezas fuera de las placas'})).toBeVisible();await expect(status).toHaveCount(1);
 expect(actions.filter(a=>/^order_/.test(a))).toEqual([]);
});

test('revisión de materiales y cantos observados: sin códigos internos, plural correcto y ver la pieza en el modelo',async({page},info)=>{
 await boot(page,info.outputDir,'materials');
 await openMaterialTool(page,'Informe de materiales y cantos');const dialog=page.getByRole('dialog',{name:'Materiales y cantos',exact:true});
 await expect(dialog.getByRole('status')).toHaveCount(1);await expect(dialog.getByLabel('Mostrar materiales por tipo',{exact:true})).toBeVisible();
 await expect(dialog.locator('tbody').first()).not.toContainText(/\b1 piezas\b/);
 const pieces=dialog.getByLabel('Revisar una pieza: caras y materiales',{exact:true});await pieces.selectOption('1/11');
 await expect(dialog.getByText(/^XYZ locales escalados: [\d.,]+ mm × /)).not.toContainText(/\d\.\d{1,2} mm/);
 await dialog.getByRole('button',{name:/^Ver en el modelo .* · 1\/11$/}).click();await expect(dialog.getByRole('status')).toContainText('quedó resaltada en SketchUp');
 expect(actions).toContain('piece_highlight');
 await expect(dialog.locator('table').last()).not.toContainText(/painted_face|inherited_instance|unpainted/);
});

