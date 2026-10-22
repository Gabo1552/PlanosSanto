import {expect,it,describe} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {A4FitError,createOfflinePdf,exportTableTsv,listRows,referenceCoverage,type OrderReference} from '../sketchup_offline/ui/pdf';
import {createDemo,box} from '../lib/demo';
import type {Project} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const LEGEND='Pendiente de pedido: la fila sigue en revisión en Biblioteca y pedidos; se imprime sin placa ni cantos.';
const asymmetric:OrderReference={text:'TEST-18 / 18 mm',board:'TEST-18 / 18 mm',edgeMap:[1,1,0,2],principal:'EDGE-P',secondary:'EDGE-S',base:720,height:560};
function sample(observations=''):Project{
 const project=createDemo();project.furniture=[project.furniture[0]];
 project.furniture[0].presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations}};
 return project;
}
function groupsProject(count:number){
 const project=sample(),f=project.furniture[0],template=f.pieces[0];
 f.pieces=Array.from({length:count},(_,i)=>({...template,definition:undefined,id:`grupo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,300+i,700),dimensions:[700,300+i,18]}));
 // Stacked synthetic pieces: the interior view shows one, so only the list grows.
 f.presentation={guide:{mode:'interior',hiddenPieceIds:f.pieces.slice(1).map(p=>p.id),sharedCamera:true,observations:''}};
 return project;
}
function text(bytes:Uint8Array){const dir=mkdtempSync(join(tmpdir(),'ps-a4-pend-'));try{const path=join(dir,'guide.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');}finally{rmSync(dir,{recursive:true,force:true});}}

describe('F-DESP-B: filas pendientes de pedido',()=>{
 it('imprime «pendiente de pedido» bajo el nombre y la leyenda, sin tocar las filas con pedido',async()=>{
  const project=sample(),f=project.furniture[0],[a,b]=f.pieces;
  const references={[a.id]:asymmetric};
  const bytes=await createOfflinePdf(project,regular,mono,undefined,references,{pending:[b.id]}),output=text(bytes);
  expect(output).toContain(`${b.name} pendiente de pedido`);expect(output).toContain(LEGEND);
  expect(output).toContain('1·1·0·2 TEST-18 / 18 mm · corte 720 × 560');
  expect(output.match(/pendiente de pedido/g)).toHaveLength(1);
  // Without pending rows the legend is absent; a pending id that has a reference is not pending.
  expect(text(await createOfflinePdf(project,regular,mono,undefined,references))).not.toContain('Pendiente de pedido');
  expect(text(await createOfflinePdf(project,regular,mono,undefined,references,{pending:[a.id]}))).not.toContain('Pendiente de pedido');
 });
 it('la línea cuenta en la altura de la fila con las mismas reglas de ajuste',async()=>{
  let blocked:A4FitError|undefined,fitted=0;
  for(let count=10;count<=30&&!blocked;count++){
   const project=groupsProject(count),all=project.furniture[0].pieces.map(p=>p.id);
   if(!await createOfflinePdf(project,regular,mono,undefined,{}).then(()=>true,()=>false))break;
   fitted=count;blocked=await createOfflinePdf(project,regular,mono,undefined,{},{pending:all}).then(()=>undefined,(error:A4FitError)=>error);
  }
  expect(fitted).toBeGreaterThan(10);expect(blocked?.kind).toBe('table');expect(blocked?.action).toContain('«Permitir hoja 2: despiece completo»');
 },60000);
 it('la leyenda de pendientes pasa por el mismo ajuste que la de cantos',async()=>{
  let blocked:A4FitError|undefined;
  for(let lines=4;lines<=16&&!blocked;lines++){
   const project=sample('Revisar escuadra.\n'.repeat(lines).trim()),f=project.furniture[0];
   if(!await createOfflinePdf(project,regular,mono,undefined,{}).then(()=>true,()=>false))break;
   blocked=await createOfflinePdf(project,regular,mono,undefined,{},{pending:[f.pieces[0].id]}).then(()=>undefined,(e:A4FitError)=>e);
  }
  expect(blocked?.kind).toBe('legend');expect(blocked?.reason).toBe('Las notas y observaciones no dejan lugar a la leyenda de filas pendientes de pedido debajo de las vistas.');
 },60000);
 it('TSV y cobertura distinguen las pendientes',()=>{
  const project=sample(),f=project.furniture[0],[a,b]=f.pieces,pending=[b.id];
  const lines=exportTableTsv(project,{[a.id]:asymmetric},pending).text.trimEnd().split('\r\n').map(line=>line.split('\t'));
  expect(lines[0].slice(-2)).toEqual(['Placa','Cantos']);
  expect(lines[1].slice(-2)).toEqual(['TEST-18 / 18 mm','1·1·0·2']);expect(lines[2].slice(-2)).toEqual(['','pendiente de pedido']);
  expect(referenceCoverage(project,{[a.id]:asymmetric},pending)).toEqual({covered:1,pending:1,total:f.pieces.length});
  expect(listRows(f,{[a.id]:asymmetric},false,pending).filter(r=>r.pending).map(r=>r.piece.memberIds)).toEqual([[b.id]]);
 });
});
describe('F-DESP-B con piezas iguales agrupadas',()=>{
 it('una fila agrupada con una pieza todavía en revisión se imprime pendiente en lugar de bloquear la hoja',async()=>{
  const {pieceRows}=await import('../lib/pieceGroups');
  const project=createDemo();const f=project.furniture.find(item=>{item.groupIdentical=true;return pieceRows(item).some(row=>row.memberIds.length>1);});
  expect(f).toBeDefined();const group=pieceRows(f!).find(row=>row.memberIds.length>1)!;
  const references={[group.memberIds[0]]:{text:'',board:'TEST-18 / 18 mm',edgeMap:[1,0,0,0],principal:'EDGE-1',base:720,height:560}};
  const row=listRows(f!,references,false,[group.memberIds[1]]).find(r=>r.piece.memberIds.includes(group.memberIds[0]))!;
  expect(row.pending).toBe(true);expect(row.reference).toBeUndefined();
 });
});
