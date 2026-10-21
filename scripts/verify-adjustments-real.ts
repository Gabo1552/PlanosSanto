// Read-only transformation of the operator's JSON export. Never opens or saves a SKP.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {importDocument} from '../lib/model';
import {makeScene} from '../lib/scene';
import {shiftDimension} from '../components/ViewAdjustments';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';

async function main(){
 const input=await readFile('fixtures/private/modelo.planos-santo.json'),hash=createHash('sha256').update(input).digest('hex');
 const project=importDocument(JSON.parse(input.toString()),'sketchup-ruby'),f=project.furniture[0];
 if(project.furniture.length!==1||f.pieces.length!==8)throw new Error('No corresponde al modelo real recibido.');
 const geometry=JSON.stringify(f.pieces);
 f.presentation={hideIds:true,cameras:{front:{yaw:12,pitch:36},back:{yaw:-15,pitch:40}}};
 const before=makeScene(f,{layout:'sheet'}),d=before.dimensions[0];
 f.presentation=shiftDimension(f,'front',d.pieceId,d.role,[3,2],[460,640]);
 const scene=makeScene(f,{layout:'sheet'}),rear=makeScene(f,{layout:'sheet',view:'back'}),moved=scene.dimensions.find(row=>row.pieceId===d.pieceId&&row.role===d.role)!;
 if(scene.labels.length||rear.labels.length||scene.dimensions.length!==10||rear.dimensions.length)throw new Error('Preferencias visuales incompletas.');
 if(Math.abs(moved.label.center.x-d.label.center.x-3)>1e-7||Math.abs(moved.label.center.y-d.label.center.y-2)>1e-7)throw new Error('La cota no se desplazó.');
 const file='artifacts/CA-AmSurrbac-AJUSTES-060-PRUEBA-A3.pdf';
 const bytes=await createOfflinePdf(project,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'),await readFile('sketchup_offline/assets/santo-carpintero.png'));
 await writeFile(file,bytes);const pdf=await PDFDocument.load(bytes),page=pdf.getPage(0);
 if(pdf.getPageCount()!==1||Math.abs(page.getWidth()*25.4/72-420)>1e-6||Math.abs(page.getHeight()*25.4/72-297)>1e-6)throw new Error('Formato incorrecto.');
 const drawing=execFileSync('pdftotext',['-x','28','-y','161','-W','810','-H','550','-raw',file,'-'],{encoding:'utf8'});
 for(const p of f.pieces)if(drawing.includes(p.code))throw new Error('Se imprimió un ID oculto.');
 const expected=f.pieces.filter(p=>['P01','P02','P04','P05','P06'].includes(p.code)).flatMap(p=>p.dimensions.slice(0,2).map(n=>Number(n.toFixed(2)))).sort((a,b)=>a-b);
 const actual=[...drawing.matchAll(/(\d+(?:,\d+)?)\s+mm\b/g)].map(m=>Number(m[1].replace(',','.'))).sort((a,b)=>a-b);
 if(JSON.stringify(expected)!==JSON.stringify(actual)||geometry!==JSON.stringify(f.pieces))throw new Error('Se alteraron piezas o medidas.');
 const table=execFileSync('pdftotext',['-x','866','-y','161','-W','310','-H','516','-raw',file,'-'],{encoding:'utf8'});
 for(const p of f.pieces)if(!table.includes(p.code))throw new Error('Falta una fila.');
 const report={source:'JSON real del usuario, presentación de PRUEBA; sin ejecutar SketchUp ni escribir SKP',sourceSha256:hash,file,pages:1,sizeMm:[420,297],pieces:8,cameras:f.presentation.cameras,hiddenIdsInBothDrawings:true,allRowsRetained:true,printedDimensions:10,measuresAndGeometryUnchanged:true,movedDimension:{pieceId:d.pieceId,role:d.role,deltaSheet:[3,2]},sketchupExecuted:false};
 await writeFile('artifacts/validacion-ajustes-060-real.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
