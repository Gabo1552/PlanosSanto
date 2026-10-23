// Synthetic PDF/TXT demonstration. Does not open SketchUp or use customer files.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createDemo,box} from '../../lib/demo';
import {PDFDocument} from 'pdf-lib';
import {identity} from '../../lib/model';
import {createOfflinePdf,type OrderReference} from '../../sketchup_offline/ui/pdf';

async function main(){
 const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
 const data=JSON.parse(execFileSync(ruby,['sketchup_offline/test/order_pdf_fixture.rb'],{encoding:'utf8',env:{...process.env,LANG:'C.UTF-8'}})) as {
  pieces:{id:string;name:string;dimensions:[number,number,number]}[];references:Record<string,OrderReference>;txt:string;
 };
 const project=createDemo();project.name='DEMOSTRACION SINTETICA · Cantos PDF y TXT';project.furniture=[project.furniture[0]];
 const f=project.furniture[0],template=f.pieces[0];f.name='Dos piezas QA · sin modelo real';
 f.pieces=data.pieces.map((p,index)=>{const transform=identity();transform[14]=index*100;return {...template,id:p.id,name:p.name,definition:undefined,code:`P0${index+1}`,dimensions:p.dimensions,mesh:box(...p.dimensions),transform};});
 f.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:'Muestra sintetica para comparar la leyenda con el TXT. No usar para fabricar.'}};
 const bytes=await createOfflinePdf(project,readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),undefined,data.references);
 const pdf=await PDFDocument.load(bytes);const date=new Date('2026-10-23T00:00:00Z');pdf.setCreationDate(date);pdf.setModificationDate(date);
 mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/PlanosSanto-0.8.21-DEMO-cantos.pdf',await pdf.save());
 writeFileSync('artifacts/PlanosSanto-0.8.21-DEMO-cantos.txt',data.txt);
 console.log('PDF/TXT sintéticos generados en artifacts/PlanosSanto-0.8.21-DEMO-cantos.*');
}
void main();
