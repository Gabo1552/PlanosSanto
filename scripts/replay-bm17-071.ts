/** Replay supplied native JSON/guide; never opens SKP or executes uploaded scripts. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {mergeGuide,type Guide} from '../sketchup_offline/ui/guide';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import release from '../sketchup_offline/version.json';
async function main(){
 const source=resolve(process.argv[2]||'fixtures/private/validacion-071-recibida');
 const document=JSON.parse(await readFile(resolve(source,'native-real/document.json'),'utf8'));
 const guide=JSON.parse(await readFile(resolve(source,'evidence/guide-before-reopen.json'),'utf8')) as Guide;
 const {project,orphans}=mergeGuide(document,guide);if(Object.values(orphans).some(notes=>notes.length))throw Error('Hay notas sin ancla.');if(project.furniture.length!==1||project.furniture[0].pieces.length!==17)throw Error('No coincide BM17.');
 const f=project.furniture[0];f.presentation!.guide!.mode='both';f.presentation!.cameras={front:{yaw:-2,pitch:10},back:{yaw:-2,pitch:10}};f.zoom=.7;f.hiddenDimensions=[];
 const original=JSON.stringify(project);
 const [regular,mono,logo]=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf','santo-carpintero.png'].map(n=>readFile(`sketchup_offline/assets/${n}`)));
 await mkdir('artifacts',{recursive:true});
 const output=process.argv[3]||`artifacts/BM17-REPLAY-${release.version.replaceAll('.','')}.pdf`;
 await writeFile(output,await createOfflinePdf(project,regular,mono,logo));
 if(JSON.stringify(project)!==original)throw Error('Se modificó entrada.');
 await writeFile(output+'.proyecto.json',JSON.stringify(project,null,2));
 console.log(JSON.stringify({output,rendererVersion:release.version,pieces:17,source:'Native JSON/guide supplied; replay only, not execution of SketchUp in cloud',sketchupExecutedHere:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
