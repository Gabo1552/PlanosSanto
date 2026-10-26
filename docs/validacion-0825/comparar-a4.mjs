/** Compare composition only; candidate variants never modify the product's PDF renderer. */
import {build} from 'esbuild';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const scratch=await mkdtemp(join(tmpdir(),'ps25-a4-'));
const root=resolve(import.meta.dirname,'../..');
const entry=`
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {composeA4,createOfflinePdfPages} from './sketchup_offline/ui/pdf';
import {createDemo} from './lib/demo';
export async function run(){
 const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const fonts={regular:await pdf.embedFont(regular),mono:await pdf.embedFont(mono)};
 const results=[];
 for(const mode of ['exterior','both'])for(const longNames of [false,true])for(const count of [8,16,24]){
  const p=createDemo();p.furniture=[p.furniture[0]];const f=p.furniture[0],original=f.pieces;
  f.presentation={guide:{mode,hiddenPieceIds:[],sharedCamera:true,observations:'Verificar escuadra antes del ajuste final.'}};
  f.groupIdentical=false;
  f.pieces=Array.from({length:count},(_,i)=>({...original[i%original.length],definition:undefined,id:'test/'+i,code:'P'+String(i+1).padStart(2,'0'),name:longNames?['Lateral izquierdo de módulo bajo','Estante regulable interior','Refuerzo trasero superior','Frente de cajón inferior'][i%4]:['Lateral','Estante','Refuerzo','Frente'][i%4]}));
  try{const c=composeA4(p,f,fonts);results.push({mode,longNames,count,drawingWidthsMm:c.scenes.map(s=>+(s.box.width*25.4/72).toFixed(2)),tableHeightMm:+(c.rows.reduce((sum,r)=>sum+r.height,0)*25.4/72).toFixed(2),nameLines:c.rows.reduce((sum,r)=>sum+r.lines.length,0),pages:1+(c.detailSheets?.length||0)});}catch(e){results.push({mode,longNames,count,error:e.message});}
 }
 const p=createDemo();p.furniture=[p.furniture[0]];p.furniture[0].presentation={guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 return {results,reference:(await createOfflinePdfPages(p,regular,mono)).bytes};
}`;
try{
 const outputs={};
 for(const [name,narrow] of [['actual',false],['listado_10mm_menor',true]]){
  const outfile=join(scratch,name+'.cjs');
  await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},platform:'node',format:'cjs',bundle:true,outfile,logLevel:'silent',plugins:narrow?[{name:'composition-experiment',setup(b){b.onLoad({filter:/sketchup_offline\/ui\/pdf\.ts$/},async({path})=>({contents:(await readFile(path,'utf8')).replace('NAME_W=35*MM','NAME_W=25*MM').replace('(single?177:86)*MM','(single?187:91)*MM').replace('single?8:index===0?8:99','single?8:index===0?8:104'),loader:'ts'}));}}]:[]});
  const data=await createRequire(import.meta.url)(outfile).run();outputs[name]=data.results;
  if(!narrow)await writeFile(resolve(root,'docs/validacion-0825/A4-referencia.pdf'),data.reference);
 }
 await writeFile(resolve(root,'docs/validacion-0825/COMPARACION-A4.json'),JSON.stringify(outputs,null,2)+'\n');
 console.log(JSON.stringify(outputs,null,2));
}finally{await rm(scratch,{recursive:true,force:true});}
