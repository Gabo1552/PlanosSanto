// Replay of the operator's JSON only. No SketchUp runtime or physical SKP save.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {importDocument} from '../lib/model';
import {pieceRows,pieceCodeMap} from '../lib/pieceGroups';
import {withNaming} from '../lib/naming';
import {makeScene} from '../lib/scene';
import {editsFor} from '../sketchup_offline/ui/guide';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import release from '../sketchup_offline/version.json';
async function main(){
 const source=await readFile('fixtures/private/modelo.planos-santo.json'),raw=JSON.parse(source.toString());
 const project=importDocument(raw,'sketchup-ruby'),original=structuredClone(project.furniture[0]);
 project.furniture=project.furniture.map(f=>withNaming({...f,groupIdentical:true},'VF','M9'));
 const f=project.furniture[0],rows=pieceRows(f),codes=pieceCodeMap(f);
 if(f.pieces.length!==8||rows.length!==5||rows.reduce((n,r)=>n+r.quantity,0)!==8)throw new Error('La agrupación real no conserva las ocho piezas en cinco filas.');
 if(rows.find(r=>r.code==='P02')?.quantity!==2||rows.find(r=>r.code==='P05')?.quantity!==3)throw new Error('Cantidades incorrectas.');
 for(const view of ['front','back'] as const){
  if(makeScene(f,{view,layout:'sheet'}).faces.length!==makeScene(original,{view,layout:'sheet'}).faces.length)throw new Error('Se perdió geometría.');
  const labels=makeScene(f,{view,layout:'sheet'}).labels;
  if(labels.filter(l=>l.code==='P02').length!==2||labels.filter(l=>l.code==='P05').length!==3)throw new Error('IDs de fabricación incorrectos.');
 }
 const physical=(value:typeof f)=>JSON.stringify(value.pieces.map(p=>[p.id,p.mesh,p.transform,p.dimensions,p.quantity]));
 if(physical(f)!==physical(original))throw new Error('Se modificaron datos físicos.');
 const member=f.pieces.find(p=>p.code==='P03')!;
 f.notes=[{id:crypto.randomUUID(),pieceId:member.id,anchor:member.mesh.vertices[0],position:[718,32],text:'NOTA DE PRUEBA: anclada al segundo lateral'}];
 const pdf=await createOfflinePdf(project,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'),await readFile('sketchup_offline/assets/santo-carpintero.png'));
 const doc=await PDFDocument.load(pdf);if(doc.getPageCount()!==1)throw new Error('No es una A3 por mueble.');
 const file='artifacts/CA-AmSurrbac-AGRUPADO-064-PRUEBA-A3.pdf';await writeFile(file,pdf);
 const table=execFileSync('pdftotext',['-x','866','-y','161','-W','310','-H','550','-raw',file,'-'],{encoding:'utf8'});
 for(const code of ['P01','P02','P04','P05','P06'])if(table.split(code).length!==2)throw new Error('Falta o se repite la fila '+code);
 for(const code of ['P03','P07','P08'])if(table.includes(code))throw new Error('Se imprimió una fila física duplicada.');
 const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
 const validated=execFileSync(ruby,['-e',`require_relative 'sketchup_offline/test/fake_model';require_relative 'sketchup/planos_santo/exporter';require_relative 'sketchup_offline/guide_store';data=JSON.parse(STDIN.read);store=PlanosSanto::GuideStore.new(NativeModelDouble.new(Fixture.model));puts JSON.generate(store.validate(data['document'],data['edits']))`],{input:JSON.stringify({document:raw,edits:editsFor(project,{})}),encoding:'utf8'});
 if(JSON.parse(validated)[0].groupIdentical!==true)throw new Error('Ruby no validó el contrato agrupado real.');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1050}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const guide={version:1,revision:0,selection:raw.furniture.map((r:{id:string})=>r.id),furniture:[]};
  await page.exposeFunction('groupingReplay',(message:string)=>{
   const msg=JSON.parse(message);const result=msg.action==='diagnostic'?{extensionVersion:release.version}:msg.action==='scan'?{tree:{roots:raw.furniture,warnings:[],modelName:raw.name},guide,path:'reproducción JSON, sin SKP',selected:guide.selection}:msg.action==='generate'?{document:raw,guide,fingerprint:'replay'}:msg.action==='dirty'?true:undefined;
   if(result===undefined)throw new Error('Acción no implementada en este replay de consulta: '+msg.action);return {version:1,id:msg.id,result,error:null};
  });
  await page.addInitScript({content:'window.sketchup={request:function(message){window.groupingReplay(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
  await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});
  await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
  await page.getByLabel('Abreviatura de la obra').fill('VF');await page.getByLabel('Módulo de este mueble').fill('M9');
  const faces=await page.locator('polygon[data-piece]').count();
  await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();
  if(await page.locator('[data-piece-row]').count()!==5||await page.locator('polygon[data-piece]').count()!==faces)throw new Error('El visor/listado no conserva piezas.');
  await page.getByRole('button',{name:'Seleccionar P02, pieza 2 de 2',exact:true}).click();await page.getByLabel('Nombre P02',{exact:true}).fill('PT');
  await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();await page.screenshot({path:'artifacts/componentes-iguales-064-real.png',fullPage:false});
  await page.setViewportSize({width:1000,height:900});await page.getByRole('button',{name:'Seleccionar P02, pieza 2 de 2',exact:true}).click();
  if(!await page.locator('.parts-config .table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth))throw new Error('Listado cortado horizontalmente.');
  await page.screenshot({path:'artifacts/componentes-iguales-064-real-1000px.png',fullPage:false});
  if(errors.length)throw new Error(errors.join('\n'));
 }finally{await browser.close();}
 const result={source:'Exportación JSON real del usuario; sin ejecutar SketchUp',sourceSha256:createHash('sha256').update(source).digest('hex'),physicalPieces:8,tableRows:rows.length,rows:rows.map(r=>({code:r.code,name:r.name,quantity:r.quantity,dimensions:r.dimensions})),allGeometryAndMeasuresRetained:true,sharedLabelsBothViews:true,secondLateralNoteTarget:member.id,secondLateralDisplayCode:codes.get(member.id),rubyValidationAccepted:true,pdf:{file,pages:1,sizeMm:[doc.getPage(0).getWidth()*25.4/72,doc.getPage(0).getHeight()*25.4/72]},sketchupExecuted:false,physicalSkpSaved:false};
 await writeFile('artifacts/agrupacion-064-modelo-real.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
