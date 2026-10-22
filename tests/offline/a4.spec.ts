import {test,expect,type Page} from '@playwright/test';
import {spawn,execFileSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {toPlanos} from './fixtures/modules';
import {showIds} from './ids';

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
 await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await toPlanos(page);
}
async function save(page:Page){await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();}
async function openVisibility(page:Page){const button=page.getByRole('button',{name:'Editar visibilidad interior',exact:true});if(!await button.isVisible())await page.getByText(/^Piezas visibles en la vista interior ·/).click();await button.click();}
function unchanged(before:Snapshot,after:Snapshot){expect(after.geometryHash).toBe(before.geometryHash);expect(after.visibility).toEqual(before.visibility);expect(after.definitions).toEqual(before.definitions);expect(after.definitionGuids).toEqual(before.definitionGuids);}
async function pdf(page:Page,folder:string){await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();const path=resolve(folder,'PlanosSanto-A4.pdf'),info=execFileSync('pdfinfo',[path],{encoding:'utf8'}),text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');expect(info).toMatch(/Pages:\s+1/);expect(info).toMatch(/Page size:\s+841\.89\d* x 595\.27\d* pts \(A4\)/);return {path,text};}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('A4 exterior ensamblada: cámara y zoom se guardan, reabren y exportan una hoja con medidas y nota',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();
 await page.getByRole('radio',{name:'Exterior',exact:true}).click();
 await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();
 const points=await page.locator('polygon[data-piece]').first().getAttribute('points');
 await page.getByRole('slider',{name:'Giro horizontal',exact:true}).fill('24');await page.getByRole('slider',{name:'Zoom',exact:true}).fill('1.15');
 expect(await page.locator('polygon[data-piece]').first().getAttribute('points')).not.toBe(points);
 await showIds(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Alinear esta pieza antes de fijar');
 await page.getByLabel('Observaciones de armado',{exact:true}).fill('Revisar escuadra antes del montaje');await save(page);
 const after=await snapshot();unchanged(before,after);expect(after.guide!.furniture[0].presentation!.guide!.mode).toBe('exterior');expect(after.guide!.furniture[0].notes).toHaveLength(1);expect(after.guide!.furniture[0].presentation!.cameras!.front!.yaw).toBe(24);
 await page.reload();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await toPlanos(page);await expect(page.getByRole('radio',{name:'Exterior',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();await expect(page.getByRole('slider',{name:'Giro horizontal',exact:true})).toHaveValue('24');await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('1.15');
 const output=await pdf(page,info.outputDir);expect(output.text).toContain('Alinear esta pieza antes de fijar');expect(output.text).toContain('Revisar escuadra antes del montaje');expect(output.text).toContain('P01');expect(output.text).toContain('P02');expect(output.text).toContain('609,6');expect(output.text).toContain('406,4');await copyFile(output.path,'artifacts/A4-exterior-SINTETICO.pdf');
});

test('A4 interior: previsualizar, cancelar y restaurar; ocultar una ruta anidada conserva otra instancia compartida y la tabla',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();await page.getByRole('radio',{name:'Interior',exact:true}).click();
 await openVisibility(page);await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();
 await expect(page.locator('polygon[data-piece="1/13/12"]')).toHaveCount(0);expect(await page.locator('polygon[data-piece="1/11"]').count()).toBeGreaterThan(0);expect(await snapshot()).toEqual(before);
 await expect(page.getByRole('button',{name:'Guardar guía',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:/^Cancelar vista previa/}).click();expect(await page.locator('polygon[data-piece="1/13/12"]').count()).toBeGreaterThan(0);
 await openVisibility(page);await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();await page.getByRole('button',{name:'Mostrar todas',exact:true}).click();await expect(page.getByLabel('Visible en interior 1/13/12',{exact:true})).toBeChecked();
 await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();await expect(page.locator('[data-piece-row="1/13/12"]')).toBeVisible();await save(page);
 const after=await snapshot();unchanged(before,after);expect(after.guide!.furniture[0].pieces).toHaveLength(2);expect(after.guide!.furniture[0].presentation!.guide!.hiddenPieceIds).toEqual(['1/13/12']);
 const output=await pdf(page,info.outputDir);expect(output.text).toContain('P02');await copyFile(output.path,'artifacts/A4-interior-SINTETICO.pdf');
 await page.reload();await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();await toPlanos(page);await expect(page.locator('polygon[data-piece="1/13/12"]')).toHaveCount(0);expect(await page.locator('polygon[data-piece="1/11"]').count()).toBeGreaterThan(0);
});

test('A4 dos vistas: orientación compartida e interior distinto persisten en una página y Undo revierte solo ajustes',async({page},info)=>{
 await boot(page,info.outputDir);const before=await snapshot();await page.getByRole('radio',{name:'Exterior + interior',exact:true}).click();await page.getByLabel('Compartir orientación entre exterior e interior',{exact:true}).check();
 await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();await page.getByRole('slider',{name:'Giro horizontal',exact:true}).fill('18');
 await openVisibility(page);await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();await save(page);
 await expect(page.getByRole('slider',{name:'Giro horizontal',exact:true})).toHaveValue('18');await page.getByRole('button',{name:'Ver exterior',exact:true}).click();await expect(page.getByRole('slider',{name:'Giro horizontal',exact:true})).toHaveValue('18');
 const after=await snapshot();unchanged(before,after);expect(after.guide!.furniture[0].presentation!.guide).toMatchObject({mode:'both',sharedCamera:true,hiddenPieceIds:['1/13/12']});
 const output=await pdf(page,info.outputDir);expect(output.text).toMatch(/Exterior/i);expect(output.text).toMatch(/Interior/i);await copyFile(output.path,'artifacts/A4-dos-vistas-SINTETICO.pdf');await page.screenshot({path:info.outputPath('A4-editor-SINTETICO.png'),fullPage:true});
 await send('__names_undo');const undone=await snapshot();unchanged(before,undone);expect(undone.guide).toEqual(before.guide);
});

test('A4 bloquea una nota anclada a una pieza oculta y permite recuperarla sin perder su texto',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('radio',{name:'Interior',exact:true}).click();
 await showIds(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P02',exact:true}).click();await page.getByLabel('Texto de la nota').fill('Conservar la indicación de la pieza interior');
 await openVisibility(page);await page.getByLabel('Visible en interior 1/13/12',{exact:true}).uncheck();await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.locator('.ux-notices').getByRole('alert')).toContainText(/oculta|visible/i);expect(existsSync(resolve(info.outputDir,'PlanosSanto-A4.pdf'))).toBe(false);
 await openVisibility(page);await page.getByRole('button',{name:'Mostrar todas',exact:true}).click();await page.getByRole('button',{name:'Aplicar visibilidad interior',exact:true}).click();const output=await pdf(page,info.outputDir);expect(output.text).toContain('Conservar la indicación de la pieza interior');
});

test('A4 composición inviable informa ajustes y no recorta notas ni genera hojas extra',async({page},info)=>{
 await boot(page,info.outputDir);await page.getByRole('radio',{name:'Exterior + interior',exact:true}).click();
 for(let index=0;index<6;index++){
  await showIds(page);await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();await page.getByLabel('Texto de la nota').fill((`Indicación ${index+1}. Revisar fijaciones y alineación de todas las piezas antes de realizar el montaje. `).repeat(2).slice(0,200));
 }
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();await expect(page.locator('.ux-notices').getByRole('alert')).toContainText(/no caben legiblemente|no cabe legiblemente/i);await expect(page.locator('.ux-notices').getByRole('alert')).toContainText(/Acortá|reducí|ajust/i);expect(existsSync(resolve(info.outputDir,'PlanosSanto-A4.pdf'))).toBe(false);
});

test('A4 visor: los líderes se pintan antes de las máscaras y textos de cotas; mover sigue disponible',async({page},info)=>{
 await boot(page,info.outputDir);await showIds(page);
 const phases=await page.locator('svg.diagram').evaluate(svg=>{
  const lines=svg.querySelector('[data-dimension-phase="lines"]'),labels=svg.querySelector('[data-dimension-phase="labels"]'),id=svg.querySelector('.piece-label');
  return {linesBeforeIds:!!lines&&!!id&&!!(lines.compareDocumentPosition(id)&Node.DOCUMENT_POSITION_FOLLOWING),idsBeforeLabels:!!id&&!!labels&&!!(id.compareDocumentPosition(labels)&Node.DOCUMENT_POSITION_FOLLOWING),labelsHaveNoStrokes:!!labels&&!labels.querySelector('line'),measures:labels?.querySelectorAll('[data-dimension]').length||0};
 });
 expect(phases).toMatchObject({linesBeforeIds:true,idsBeforeLabels:true,labelsHaveNoStrokes:true});expect(phases.measures).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Mover cotas',exact:true}).click();
 const dimension=page.getByRole('button',{name:/^Mover cota /}).first();await dimension.focus();await dimension.press('ArrowRight');await expect(dimension).toBeFocused();
 expect(errors).toEqual([]);
});

test('A4: elegir la ruta durante 158 segundos conserva la confirmación final y el PDF',async({page},info)=>{
 // Browser-clock/transport regression only. The Ruby controller writes a synthetic
 // PDF; this test does not run SketchUp or a Windows modal dialog.
 await boot(page,info.outputDir);await page.getByRole('radio',{name:'Exterior',exact:true}).click();
 const before=await snapshot();await page.clock.install();
 await page.evaluate(()=>{
  const w=window as unknown as {a4NativeRequest:(raw:string)=>Promise<{version:1;id:string;result:unknown;error:string|null}>;pdfHeld?:boolean;releasePdf?:()=>void};
  const nativeRequest=window.sketchup!.request;
  window.sketchup!.request=(raw:string)=>{
   const message=JSON.parse(raw);
   if(message.action!=='pdf'){nativeRequest(raw);return;}
   void w.a4NativeRequest(raw).then(reply=>{
    window.PlanosSantoBridge.receive({version:1,id:reply.id,phase:'waiting_user'});
    w.pdfHeld=true;
    w.releasePdf=()=>{window.PlanosSantoBridge.receive({version:1,id:reply.id,phase:'working'});window.PlanosSantoBridge.receive(reply);};
   });
  };
 });
 await page.getByRole('button',{name:'Exportar PDF A4',exact:true}).click();
 await page.waitForFunction(()=>(window as unknown as {pdfHeld:boolean}).pdfHeld);
 await page.clock.fastForward(158_000);
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeDisabled();
 await page.evaluate(()=>(window as unknown as {releasePdf:()=>void}).releasePdf());
 await expect(page.getByText('PDF A4 guardado:',{exact:false})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Exportar PDF A4',exact:true})).toBeEnabled();
 const path=resolve(info.outputDir,'PlanosSanto-A4.pdf');
 const pdfInfo=execFileSync('pdfinfo',[path],{encoding:'utf8'});
 expect(pdfInfo).toMatch(/Pages:\s+1/);expect(pdfInfo).toMatch(/Page size:\s+841\.89\d* x 595\.27\d* pts \(A4\)/);
 unchanged(before,await snapshot());
});
