import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {importRubyDocument} from '../lib/ruby-import';
import {importUpload} from '../lib/archive';
async function main(){
const directory='fixtures/private';
const raw=await readFile(`${directory}/modelo.planos-santo.json`);
const supplied=JSON.parse(await readFile(`${directory}/modelo.planos-santo.informe.json`,'utf8'));
const hash=createHash('sha256').update(raw).digest('hex');
if(hash!==supplied.sha256)throw new Error('El informe no corresponde al JSON.');
const project=importRubyDocument(JSON.parse(raw.toString('utf8')));
const pieces=project.furniture.flatMap(f=>f.pieces);
const rows=JSON.parse(execFileSync('python3',['-c',"import csv,json,sys;print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig',newline='')))))",`${directory}/modelo.planos-santo.medidas.csv`],{encoding:'utf8'})) as Record<string,string>[];
if(pieces.length!==rows.length||pieces.length!==supplied.pieces||project.furniture.length!==supplied.furniture.length)throw new Error('No coincide la cantidad de muebles/piezas.');
let maximumDifference=0;
const ids=new Set<string>();
for(const row of rows){
  const p=pieces.find(p=>p.id===row.pieza_id);
  if(!p||p.name!==row.nombre||ids.has(row.pieza_id))throw new Error('Piezas inconsistentes o repetidas en CSV.');
  ids.add(row.pieza_id);
  for(const [i,column] of ['largo_mm','ancho_mm','espesor_mm'].entries()){
    const actual=Number(row[column]);if(!Number.isFinite(actual))throw new Error('Medida inválida en CSV.');
    const difference=Math.abs(actual-p.dimensions[i]);maximumDifference=Math.max(difference,maximumDifference);
    if(difference>0.1)throw new Error(`La medida ${column} no coincide con la geometría de ${p.id}.`);
  }
}
const zip=await importUpload(await readFile('artifacts/CA-AmSurrbac-PlanosSanto.zip'),'proyecto.zip');
if(zip.state!=='imported'||JSON.stringify(zip.project.furniture)!==JSON.stringify(project.furniture))throw new Error('El ZIP cambió las piezas del proyecto.');
const file='artifacts/CA-AmSurrbac-Grupo13-A3.pdf';
const pdf=await PDFDocument.load(await readFile(file));
if(pdf.getPageCount()!==project.furniture.length)throw new Error('La cantidad de hojas no coincide.');
for(const page of pdf.getPages())if(Math.abs(page.getWidth()/72*25.4-420)>1e-6||Math.abs(page.getHeight()/72*25.4-297)>1e-6)throw new Error('Formato de hoja incorrecto.');
const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
for(const piece of pieces)if(!text.includes(piece.code)||!text.includes(piece.name))throw new Error('Faltan piezas en el PDF.');
const evidence={source:'Exportación real aportada por el usuario desde SketchUp; SketchUp no ejecutado en este host',sketchupVersion:project.importedDocument!.exporter!.sketchupVersion,sha256:hash,reportMatches:true,furniture:project.furniture.length,pieces:pieces.length,csvMeasuresChecked:rows.length*3,maximumDifferenceMm:maximumDifference,zipPreservesModel:true,pdfPages:pdf.getPageCount(),pdfSizeMm:[420,297],pdfIncludesAllPieceCodesAndNames:true,manualComparisonWithSketchup:false};
await writeFile('artifacts/validacion-exportacion-real.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));

}
main().catch(error=>{console.error(error.message);process.exit(1);});
