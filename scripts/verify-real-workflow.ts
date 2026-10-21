import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {PDFDocument} from 'pdf-lib';
import {toEdit,type Project} from '../lib/model';

async function main(){
  await new Promise<void>((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error('El puerto 3100 está ocupado; no se inicia la prueba privada.')));probe.listen(3100,'127.0.0.1',()=>probe.close(()=>resolve()));});
  const directory=await mkdtemp(path.join(tmpdir(),'santo-real-workflow-'));
  const base='http://127.0.0.1:3100';
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env:{...process.env,PORT:'3100',PROJECT_DATA_DIR:directory},stdio:'ignore'});
  let failed:Error|undefined;
  server.on('error',e=>{failed=e;});
  server.on('exit',code=>{if(code)failed=new Error('El servidor privado no pudo iniciar; comprobá que el puerto 3100 esté libre.');});
  try{
    let ready=false;
    for(let i=0;i<100;i++){if(failed)throw failed;try{if((await fetch(base)).ok){ready=true;break;}}catch{}await delay(150);}
    if(!ready)throw new Error('No inició el servidor de prueba.');
    const zip=await readFile('artifacts/CA-AmSurrbac-PlanosSanto.zip');const form=new FormData();form.append('file',new File([zip],'proyecto.zip',{type:'application/zip'}));
    const response=await fetch(`${base}/api/import/file`,{method:'POST',body:form});if(!response.ok)throw new Error(await response.text());
    const result=await response.json();const p=result.project as Project;
    if(result.state!=='imported'||!p.furniture.length)throw new Error('No se importó la exportación real.');
    const edit=toEdit(p);const piece=p.furniture[0].pieces[0];
    const note={id:crypto.randomUUID(),pieceId:piece.id,anchor:piece.mesh.vertices[0],position:[718,32] as [number,number],text:'NOTA DE PRUEBA: comprobar el anclaje de esta flecha.'};
    edit.furniture[0].notes=[note];edit.furniture[0].explosion=0.8;edit.furniture[0].zoom=0.9;
    let save=await fetch(`${base}/api/projects/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(edit)});if(!save.ok)throw new Error(await save.text());
    const reopened=await(await fetch(`${base}/api/projects/${p.id}`)).json() as Project;
    if(JSON.stringify(reopened.furniture[0].notes[0])!==JSON.stringify(note))throw new Error('No persistió la nota.');
    if(JSON.stringify(reopened.furniture[0].pieces.map(p=>p.dimensions))!==JSON.stringify(p.furniture[0].pieces.map(p=>p.dimensions)))throw new Error('Se alteraron las medidas.');
    const pdf=await fetch(`${base}/api/pdf/${p.id}`);if(!pdf.ok)throw new Error(await pdf.text());
    const file='artifacts/CA-AmSurrbac-PRUEBA-notas-A3.pdf';const bytes=new Uint8Array(await pdf.arrayBuffer());await writeFile(file,bytes);
    const doc=await PDFDocument.load(bytes);if(doc.getPageCount()!==p.furniture.length)throw new Error('Número de hojas incorrecto.');
    const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!text.includes('NOTA DE PRUEBA'))throw new Error('La nota no está en el PDF.');
    const remove=toEdit(reopened);remove.furniture[0].notes=[];save=await fetch(`${base}/api/projects/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(remove)});if(!save.ok)throw new Error(await save.text());
    const cleared=await(await fetch(`${base}/api/projects/${p.id}`)).json() as Project;if(cleared.furniture[0].notes.length)throw new Error('No se borró la nota.');
    const evidence={source:'Exportación real aportada por el usuario',uploadedAsSingleZip:true,furniture:p.furniture.length,pieces:p.furniture.reduce((n,f)=>n+f.pieces.length,0),noteSavedAndReopened:true,measurementsUnchanged:true,noteTextInPdf:true,noteDeletedAndReopened:true,pdfPages:doc.getPageCount(),isolatedTestData:true,manualSketchupMeasurementComparison:false};
    await writeFile('artifacts/prueba-flujo-real.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
  }finally{
    server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(4000)]);if(server.exitCode===null)server.kill('SIGKILL');await rm(directory,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e.message);process.exit(1);});
