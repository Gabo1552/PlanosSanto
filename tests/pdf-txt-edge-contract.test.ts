import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {createDemo,box} from '../lib/demo';
import {identity} from '../lib/model';
import {createOfflinePdf,type OrderReferences,type OrderReference} from '../sketchup_offline/ui/pdf';

it('el PDF impreso conserva los códigos de canto del TXT Ruby por placa, aunque cada pieza use un producto diferente',async()=>{
 const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
 const data=JSON.parse(execFileSync(ruby,['sketchup_offline/test/order_pdf_fixture.rb'],{encoding:'utf8',env:{...process.env,LANG:'C.UTF-8'}})) as {
  pieces:{id:string;name:string;dimensions:[number,number,number]}[];txt:string;references:Record<string,OrderReference>;pending:string[];
 };
 expect(data.pending).toEqual([]);
 const txtRows=data.txt.trim().split('\r\n').map(line=>line.split('\t'));
 expect(txtRows.every(row=>row.length===9)).toBe(true);
 expect(txtRows.map(row=>row.slice(5).map(Number))).toEqual([[1,1,0,0],[2,0,0,0]]);
 for(const [index,piece] of data.pieces.entries())expect(data.references[piece.id].edgeMap).toEqual(txtRows[index].slice(5).map(Number));
 const project=createDemo();project.furniture=[project.furniture[0]];
 const furniture=project.furniture[0],template=furniture.pieces[0];
 furniture.pieces=data.pieces.map((p,index)=>{const transform=identity();transform[14]=index*100;return {...template,id:p.id,name:p.name,definition:undefined,code:`P0${index+1}`,dimensions:p.dimensions,mesh:box(...p.dimensions),transform};});
 furniture.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 const bytes=await createOfflinePdf(project,readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),undefined,data.references);
 const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);
 expect(pdf.getPage(0).getWidth()*25.4/72).toBeCloseTo(297,3);expect(pdf.getPage(0).getHeight()*25.4/72).toBeCloseTo(210,3);
 const dir=mkdtempSync(join(tmpdir(),'planos-edge-contract-'));
 try{
  const path=join(dir,'guide.pdf');writeFileSync(path,bytes);
  const text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
  expect(text).toContain('1·1·0·0');expect(text).toContain('2·0·0·0');
  expect(text).toContain('1 = ABS-A');expect(text).toContain('2 = PVC-B');
  expect(text).not.toContain('1 = ABS-A / PVC-B');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('distingue en la leyenda las placas que asignan el mismo número a distintos cantos',async()=>{
 const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0];f.pieces=f.pieces.slice(0,2);
 f.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 const references:OrderReferences=Object.fromEntries(f.pieces.map((p,index)=>[p.id,{text:'',board:index?'ROBLE / 18 mm':'BLANCO / 18 mm',edgeMap:[1,0,0,0],principal:index?'PVC-B':'ABS-A',secondary:null,base:700,height:450}]));
 const bytes=await createOfflinePdf(project,readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),undefined,references);
 const dir=mkdtempSync(join(tmpdir(),'planos-multiple-boards-'));
 try{
  const path=join(dir,'guide.pdf');writeFileSync(path,bytes);
  const text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
  expect(text).toContain('BLANCO / 18 mm: 1 = ABS-A');expect(text).toContain('ROBLE / 18 mm: 1 = PVC-B');
  expect(text).not.toContain('1 = ABS-A / PVC-B');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('identifica dos fichas de placa con el mismo SKU para no mezclar sus cantos en tabla y leyenda',async()=>{
 const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
 const data=JSON.parse(execFileSync(ruby,['sketchup_offline/test/order_pdf_fixture.rb','--same-board-sku'],{encoding:'utf8',env:{...process.env,LANG:'C.UTF-8'}})) as {references:Record<string,OrderReference>;pieces:{id:string;name:string}[]};
 const refs=Object.values(data.references);expect(new Set(refs.map(ref=>ref.board)).size).toBe(2);
 expect(refs.every(ref=>ref.board?.includes('QA-18 / 18 mm'))).toBe(true);
 expect(refs[0].edgeMap).toEqual([1,1,0,0]);expect(refs[1].edgeMap).toEqual([1,0,0,0]);
 const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0];
 f.pieces=f.pieces.slice(0,2).map((p,i)=>({...p,id:data.pieces[i].id,name:data.pieces[i].name}));
 f.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 const bytes=await createOfflinePdf(project,readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),undefined,data.references);
 const dir=mkdtempSync(join(tmpdir(),'planos-same-sku-'));
 try{
  const path=join(dir,'guide.pdf');writeFileSync(path,bytes);
  const text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
  expect(text).toContain('Placa sintetica (placa 1): 1 = ABS-A');expect(text).toContain('Roble QA (placa 2): 1 = PVC-B');
  expect(text).not.toContain('1 = ABS-A / PVC-B');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
