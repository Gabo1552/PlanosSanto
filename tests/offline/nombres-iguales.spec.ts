import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
// 0.8.26 · Sugerencias agrupadas. Placard SINTÉTICO (iguales_bridge_driver.rb): P01 y P02 laterales iguales de
// definiciones distintas, P03 divisor que es otra instancia de la definición de P01, P04/P05 piso y tapa de una
// misma definición y P06/P07 estantes que comparten definición. Dobles Ruby, no SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(reply:Reply)=>void>,errors:string[],calls:{action:string}[];
function raw(message:string):Promise<Reply>{return new Promise(resolve=>{const msg=JSON.parse(message);calls.push(msg);pending.set(msg.id,resolve);child.stdin.write(message+'\n');});}
async function names(){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action:'__names_inspect',data:{}}));expect(reply.error).toBeNull();return (reply.result as {names:Record<string,string>}).names;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];
 child=spawn(ruby,['sketchup_offline/test/iguales_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line);pending.get(reply.id)?.(reply);pending.delete(reply.id);});
 await page.exposeFunction('igualesRequest',async(message:string)=>raw(message));
 await page.addInitScript({content:'window.sketchup={request(raw){window.igualesRequest(raw).then(reply=>window.PlanosSantoBridge.receive(reply));}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected asset');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 const generate=page.getByRole('button',{name:'Generar guías (2)',exact:true});await expect(generate).toBeEnabled();await generate.click();
 await page.getByRole('button',{name:'M01 Placard 7 piezas',exact:true}).click();
 await page.getByRole('button',{name:'Proponer nombres por geometría…',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Sugerencias de nombres',exact:true});await expect(dialog).toBeVisible();return dialog;
}
// `has` se busca dentro de cada fila: el localizador interno parte de la página, no del diálogo.
const row=(dialog:ReturnType<Page['getByRole']>,code:string)=>dialog.locator('tbody tr').filter({has:dialog.page().getByLabel(`Nombre sugerido ${code}`,{exact:true})});
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('agrupa piezas iguales (otras definiciones e instancias compartidas) sin juntar Lateral con Divisor, y aplica a toda la fila',async({page},info)=>{
 const dialog=await boot(page,info.outputDir);const grouped=dialog.getByRole('checkbox',{name:'Agrupar piezas iguales en las sugerencias',exact:true});
 await expect(grouped).toBeChecked();
 // P01 y P02: definiciones distintas, mismas medidas y función → una fila ×2.
 await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toHaveValue('Lateral');await expect(dialog.getByLabel('Nombre sugerido P02',{exact:true})).toHaveCount(0);
 await expect(row(dialog,'P01').locator('.naming-count')).toHaveText('×2');await expect(row(dialog,'P01')).toContainText('2 piezas: M01·P01, M01·P02');
 // P03 comparte definición con P01 pero divide el ancho: fila propia.
 await expect(dialog.getByLabel('Nombre sugerido P03',{exact:true})).toHaveValue('Divisor');await expect(row(dialog,'P03').locator('.naming-count')).toHaveCount(0);
 // Piso y tapa: instancias de una definición con funciones distintas → dos filas.
 await expect(dialog.getByLabel('Nombre sugerido P04',{exact:true})).toHaveValue('Piso');await expect(dialog.getByLabel('Nombre sugerido P05',{exact:true})).toHaveValue('Tapa');
 // Estantes: instancias compartidas con la misma función → una fila ×2.
 await expect(row(dialog,'P06').locator('.naming-count')).toHaveText('×2');await expect(dialog.getByLabel('Nombre sugerido P07',{exact:true})).toHaveCount(0);
 await dialog.getByLabel('Nombre sugerido P01',{exact:true}).fill('Lateral placard');
 await dialog.getByRole('checkbox',{name:'Aplicar propuesta P06',exact:true}).check();await dialog.getByLabel('Nombre sugerido P06',{exact:true}).fill('Estante móvil');
 await dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect.poll(async()=>{const n=await names();return [n['11'],n['12'],n['13'],n['16'],n['17']];}).toEqual(['Lateral placard','Lateral placard','Divisor','Estante móvil','Estante móvil']);
});

test('desagrupar y volver a agrupar conserva cada edición por pieza; ediciones distintas quedan en filas separadas',async({page},info)=>{
 const dialog=await boot(page,info.outputDir);const grouped=dialog.getByRole('checkbox',{name:'Agrupar piezas iguales en las sugerencias',exact:true}),notice=dialog.locator('.naming-notice');
 await dialog.getByLabel('Nombre sugerido P01',{exact:true}).fill('Lateral placard');
 await grouped.uncheck();
 await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toHaveValue('Lateral placard');await expect(dialog.getByLabel('Nombre sugerido P02',{exact:true})).toHaveValue('Lateral placard');
 await expect(notice).toContainText('Se conservó 1 nombre editado');
 await grouped.check();await expect(dialog.getByLabel('Nombre sugerido P02',{exact:true})).toHaveCount(0);await expect(row(dialog,'P01').locator('.naming-count')).toHaveText('×2');
 await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toHaveValue('Lateral placard');
 // Una pieza con otra edición: al agrupar no se pisa, queda en su fila y se avisa.
 await grouped.uncheck();await dialog.getByLabel('Nombre sugerido P02',{exact:true}).fill('Lateral derecho');await grouped.check();
 await expect(dialog.getByLabel('Nombre sugerido P01',{exact:true})).toHaveValue('Lateral placard');await expect(dialog.getByLabel('Nombre sugerido P02',{exact:true})).toHaveValue('Lateral derecho');
 await expect(notice).toContainText('1 fila de piezas iguales quedó separada porque sus piezas tenían nombres editados distintos.');
 await dialog.getByRole('button',{name:'Confirmar y guardar nombres',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect.poll(async()=>{const n=await names();return [n['11'],n['12']];}).toEqual(['Lateral placard','Lateral derecho']);
});
