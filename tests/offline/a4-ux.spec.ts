import {test,expect,type Page} from '@playwright/test';
import {spawn,execFileSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

// Actual Ruby controller and browser/PDF generation with synthetic API doubles.
// These checks never open SketchUp or a customer's SKP.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={id:string;result:unknown;error:string|null};
type Snapshot={geometryHash:string;visibility:Record<string,boolean>;definitions:string[];definitionGuids:string[];guide:{furniture:{pieces:{id:string}[];presentation?:{guide?:{mode:string;hiddenPieceIds:string[];sharedCamera:boolean;observations:string};cameras?:{front?:{yaw:number;pitch:number;zoom?:number};back?:{yaw:number;pitch:number;zoom?:number}}};notes:unknown[]}[]}|null};
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(reply:Reply)=>void;reject:(error:Error)=>void}>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function send(action:string,data:unknown={}){return raw(JSON.stringify({version:1,id:randomUUID(),action,data}));}
async function snapshot(){const reply=await send('__names_inspect');expect(reply.error).toBeNull();return reply.result as Snapshot;}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];
 child=spawn(ruby,['sketchup_offline/test/a4_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
 createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});
 child.on('exit',()=>{for(const entry of pending.values())entry.reject(Error('Driver sintético terminado: '+stderr));pending.clear();});
 await page.exposeFunction('a4NativeRequest',raw);
 await page.addInitScript({content:'window.sketchup={request:function(message){window.a4NativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
 await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
 await expect(page.getByRole('button',{name:'Generar guías (2)',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:/Otro mueble/}).uncheck();
 await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
}
async function save(page:Page){await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();}
function unchanged(before:Snapshot,after:Snapshot){expect(after.geometryHash).toBe(before.geometryHash);expect(after.visibility).toEqual(before.visibility);expect(after.definitions).toEqual(before.definitions);expect(after.definitionGuids).toEqual(before.definitionGuids);}
async function pdf(page:Page,folder:string){await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();const path=resolve(folder,'PlanosSanto-A4.pdf'),info=execFileSync('pdfinfo',[path],{encoding:'utf8'}),text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');expect(info).toMatch(/Pages:\s+1/);expect(info).toMatch(/Page size:\s+841\.89\d* x 595\.27\d* pts \(A4\)/);return {path,text};}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('A4 UX: 1/2 vistas y clic para ocultar por ruta conservan modelo, tabla y guardado',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await page.getByRole('radio',{name:'Exterior',exact:true}).click();await expect(page.getByRole('radio',{name:'Exterior',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByRole('radio',{name:'Interior',exact:true}).click();await expect(page.getByRole('radio',{name:'Interior',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByRole('radio',{name:'Exterior + interior',exact:true}).click();await expect(page.getByRole('radio',{name:'Exterior + interior',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'Ocultar pieza en el dibujo',exact:true}).click();
 await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
 const chip=page.getByRole('button',{name:/^Mostrar P01 · .+ \(1\/11\)$/});await expect(chip).toBeVisible();
 await expect(page.locator('[data-piece-row]')).toHaveCount(2);
 await chip.click();await expect(chip).toHaveCount(0);
 await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
 await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();await save(page);
 const after=await snapshot();unchanged(before,after);expect(after.guide!.furniture[0].pieces).toHaveLength(2);expect(after.guide!.furniture[0].presentation!.guide!.hiddenPieceIds).toEqual(['1/11']);
 await page.reload();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await expect(page.getByRole('button',{name:/^Mostrar P01 · .+ \(1\/11\)$/})).toBeVisible();
});

for(const viewCount of [1,2])test(`A4 UX: ${viewCount} vistas, la vista previa usa PDF real y coincide píxel a píxel con la exportación`,async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('radio',{name:viewCount===1?'Exterior':'Exterior + interior',exact:true}).click();
 await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Nota completa de la vista previa');await save(page);
 await page.getByRole('button',{name:'Planos A4',exact:true}).click();
 const link=page.getByRole('link',{name:'Descargar vista previa',exact:true});await expect(link).toBeVisible();
 const download=page.waitForEvent('download');await link.click();const previewPath=resolve(info.outputDir,'preview-A4.pdf');await (await download).saveAs(previewPath);
 const exported=await pdf(page,info.outputDir);
 const previewText=execFileSync('pdftotext',['-raw',previewPath,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');expect(previewText).toBe(exported.text);expect(previewText).toContain('Nota completa de la vista previa');
 const prefix=resolve(info.outputDir,'preview'),finalPrefix=resolve(info.outputDir,'export');
 for(const [input,output] of [[previewPath,prefix],[exported.path,finalPrefix]])execFileSync('pdftoppm',['-png','-singlefile','-scale-to','1600',input,output]);
 expect(await readFile(prefix+'.png')).toEqual(await readFile(finalPrefix+'.png'));
 await expect(page.getByTitle('PDF A4 generado')).toHaveAttribute('src',/^blob:/);
});

test('A4 UX: bloqueo de notas conserva la causa exacta y no muestra una hoja recortada',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await page.getByLabel('Observaciones de armado',{exact:true}).fill('Revisar las uniones y la alineación antes del montaje. '.repeat(35));
 await page.getByRole('button',{name:'Planos A4',exact:true}).click();
 const preview=page.getByRole('region',{name:'Vista previa del PDF A4',exact:true});
 await expect(preview.getByRole('alert')).toContainText('Las notas y observaciones no caben legiblemente');
 await expect(preview.getByRole('alert')).toContainText('No se recortó información ni se agregaron hojas');
 await expect(preview.getByRole('link',{name:'Descargar vista previa',exact:true})).toHaveCount(0);await expect(preview.locator('iframe')).toHaveCount(0);expect(await snapshot()).toEqual(before);
});
