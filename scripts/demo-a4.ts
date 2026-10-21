/** Reproducible synthetic example, not the operator's BM17 SketchUp file. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createA4Demo} from '../lib/a4Demo';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import {PDFDocument} from 'pdf-lib';
import {applyEdit,toEdit} from '../lib/model';
import release from '../sketchup_offline/version.json';
async function main(){
const project=createA4Demo(),f=project.furniture[0];
f.zoom=1;f.presentation!.cameras={front:{yaw:-30,pitch:45}};
applyEdit(project,toEdit(project)); // The displayed example must also be saveable.
const [regular,mono,logo]=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf','santo-carpintero.png'].map(file=>readFile(`sketchup_offline/assets/${file}`)));
await mkdir('artifacts',{recursive:true});
const results=[];
for(const mode of ['exterior','interior','both'] as const){
 f.presentation!.guide!.mode=mode;
 const bytes=await createOfflinePdf(project,regular,mono,logo),pdf=await PDFDocument.load(bytes);
 if(pdf.getPageCount()!==1)throw new Error('La demo debe producir una sola página.');
 const page=pdf.getPage(0);
 if(Math.abs(page.getWidth()*25.4/72-297)>1e-8||Math.abs(page.getHeight()*25.4/72-210)>1e-8)throw new Error('La demo no es A4 exacta.');
 const file=`artifacts/A4-DEMO17-${mode}-SINTETICO.pdf`;await writeFile(file,bytes);
 results.push({file,pieces:f.pieces.length,mode,pages:1,sizeMm:[297,210],source:'SINTÉTICO: no es el archivo BM17 real',sketchupExecuted:false});
}
await writeFile(`artifacts/demo-a4-${release.version.replaceAll('.','')}.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
