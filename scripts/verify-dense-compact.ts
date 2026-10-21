// QA replay only: observations from the operator are not a manufacturing import.
// Input/output stay private/ignored. No SKP is opened, renamed or saved here.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {Matrix4,Vector3} from 'three';
import {importDocument,type RawDocument,type RawNode,type Mesh} from '../lib/model';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows} from '../lib/pieceGroups';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import {PDFDocument} from 'pdf-lib';
import release from '../sketchup_offline/version.json';

type Geometry={faces:{vertices_mm:[number,number,number][];triangles:[number,number,number][]}[]};
type Instance={path:string[];parent_path:string[];name:string;definition_id:string;local_transform:number[];world_transform:number[];axis_lengths_mm:number[]|null};
type Diagnostic={schema:string;complete:boolean;instances:Instance[];definitions:{id:string;name:string;geometry:Geometry}[];selection_paths:string[][]};
async function main(){
  const input=process.argv[2];if(!input)throw Error('Indicá un diagnóstico privado como argumento.');
  const bytes=await readFile(input),d=JSON.parse(bytes.toString()) as Diagnostic;
  if(d.schema!=='planos-santo.diagnostic.v1'||!d.complete)throw Error('Se requiere diagnóstico completo.');
  const definitions=new Map(d.definitions.map(def=>[def.id,def]));
  const build=(instance:Instance):RawNode=>{
    const definition=definitions.get(instance.definition_id)!;
    const mesh:Mesh={vertices:[],triangles:[]};
    for(const face of definition.geometry.faces){const base=mesh.vertices.length;mesh.vertices.push(...face.vertices_mm);mesh.triangles.push(...face.triangles.map(t=>t.map(i=>i+base) as [number,number,number]));}
    return {id:instance.path.join('/'),name:(instance.name||definition.name||'Sin nombre').slice(0,120),kind:'component',definition:definition.id,
      transform:instance.local_transform,...(mesh.triangles.length?{mesh}:{}),children:d.instances.filter(child=>child.parent_path.join('/')===instance.path.join('/')).map(build)};
  };
  const selected=d.selection_paths.map(path=>d.instances.find(instance=>instance.path.join('/')===path.join('/'))!).filter(Boolean);
  if(!selected.length)throw Error('El diagnóstico no tiene raíces seleccionadas.');
  const raw:RawDocument={version:1,units:'mm',name:'Reproducción privada de diagnóstico',furniture:selected.map(build)};
  const project=importDocument(raw,'sketchup-ruby');
  const original=JSON.stringify(project.furniture.map(f=>f.pieces));
  const metrics=project.furniture.map(f=>{
    const before=new Map<string,number[]>();f.explosion=0;
    const assembled=makeScene(f);for(const p of f.pieces)before.set(p.id,assembled.offsets.get(p.id)!.toArray());
    f.explosion=.65;f.groupIdentical=true;f.presentation={compact:true};
    const front=makeScene(f),back=makeScene(f,{view:'back'});
    const separated=f.pieces.filter(p=>front.offsets.get(p.id)!.length()>1).length;
    if(separated!==f.pieces.length)throw Error('Una pieza no se separó.');
    for(const p of f.pieces){
      const center=new Vector3(...p.mesh.vertices[0]);const projected=front.anchor(p.id,center.toArray());
      if(!Number.isFinite(projected.x+projected.y))throw Error('Ancla no finita.');
      const actual=front.transforms.get(p.id)!;
      const expected=new Matrix4().makeTranslation(...front.offsets.get(p.id)!.toArray()).multiply(new Matrix4().fromArray(p.transform));
      if(actual.elements.some((n,i)=>Math.abs(n-expected.elements[i])>1e-7))throw Error('Transformación desplazada incorrecta.');
      if(before.get(p.id)!.some(n=>n!==0))throw Error('Despiece cero no está ensamblado.');
    }
    return {pieces:f.pieces.length,groupedRows:pieceRows(f).length,separated,frontVisiblePieces:new Set(front.faces.map(face=>face.pieceId)).size,
      rearVisiblePieces:new Set(back.faces.map(face=>face.pieceId)).size,warnings:layoutWarnings(f)};
  });
  if(original!==JSON.stringify(project.furniture.map(f=>f.pieces)))throw Error('Se alteraron piezas o medidas.');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
  try{
    const page=await browser.newPage({viewport:{width:1550,height:1050}}),errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    const ids=raw.furniture.map(f=>f.id),guide={version:1,revision:0,selection:ids,furniture:[]};
    await page.exposeFunction('replayDiagnostic',async(message:string)=>{
      const m=JSON.parse(message);let result:unknown;
      if(m.action==='diagnostic')result={extensionVersion:release.version,replayOnly:true};
      else if(m.action==='scan')result={tree:{roots:raw.furniture,warnings:[],modelName:raw.name},guide,selected:ids,path:'reproducción privada del diagnóstico'};
      else if(m.action==='generate')result={document:raw,guide,fingerprint:'qa-only'};
      else if(m.action==='dirty')result=true;
      else throw Error('Acción no permitida en revisión de solo lectura.');
      return {version:1,id:m.id,result};
    });
    await page.addInitScript({content:'window.sketchup = {request: function(raw) { window.replayDiagnostic(raw).then(function(reply) { window.PlanosSantoBridge.receive(reply); }); }};'});
    await page.route('https://planos-santo.test/**',async route=>{
      const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Recurso inesperado.');
      await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
    });
    await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
    await page.getByRole('button',{name:`Generar guías (${ids.length})`,exact:true}).click();await page.getByLabel('Nombre P01',{exact:true}).waitFor();
    for(let i=0;i<ids.length;i++){
      if(i)await page.locator('.furniture-tabs button').nth(i).click();
      await page.getByRole('checkbox',{name:'Agrupar componentes iguales',exact:true}).check();
      await page.locator('.view-adjustments>summary').click();
      await page.getByRole('checkbox',{name:'Plano compacto por tipos',exact:true}).check();
      await page.locator('.view-adjustments>summary').click();
      for(const view of ['delantera','trasera']){
        await page.getByRole('button',{name:`Ver ${view}`,exact:true}).click();
        await page.screenshot({path:`artifacts/diagnostico-068-mueble-${i+1}-${view}.png`,fullPage:false});
        await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
        await page.screenshot({path:`artifacts/diagnostico-068-mueble-${i+1}-${view}-foco.png`,fullPage:false});
        await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
      }
    }
    if(errors.length)throw Error(errors.join('\n'));
  }finally{await browser.close();}
  // Print one page only for furniture whose existing legibility checks allow it.
  const printable=project.furniture.filter(f=>!layoutWarnings(f).length);
  let pdfPages=0;
  if(printable.length){
    const fonts=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf'].map(n=>readFile('sketchup_offline/assets/'+n)));
    const pdf=await createOfflinePdf({...project,furniture:printable},fonts[0],fonts[1],await readFile('sketchup_offline/assets/santo-carpintero.png'));
    const document=await PDFDocument.load(pdf);pdfPages=document.getPageCount();
    if(pdfPages!==printable.length)throw Error('Número de hojas incorrecto.');
    for(const page of document.getPages())if(Math.abs(page.getWidth()*25.4/72-420)>.001||Math.abs(page.getHeight()*25.4/72-297)>.001)throw Error('Formato no A3.');
    await writeFile('artifacts/diagnostico-068-A3-PRUEBA.pdf',pdf);
  }
  const report={source:'Diagnóstico nativo aportado por usuario; reproducción de geometría, sin ejecutar SketchUp aquí',sha256:createHash('sha256').update(bytes).digest('hex'),instances:d.instances.length,
    furniture:metrics,pdfPages,sketchupExecutedHere:false,physicalNamesSaved:false,manualMeasurementsVerified:false};
  await writeFile('artifacts/diagnostico-068-replay.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exit(1);});
