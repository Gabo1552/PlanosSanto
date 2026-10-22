import {expect,it,describe} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFArray,PDFRawStream,PDFRef,decodePDFRawStream} from 'pdf-lib';
import {createOfflinePdf,edgeCode,listRows,type OrderReference} from '../sketchup_offline/ui/pdf';
import {createDemo,box} from '../lib/demo';

// CANTOS-04: the edge glyph of the A4 table marks the same sides as the supplier TXT and the 2D view
// (sketchup_offline/test/cantos_coincidencia_test.rb and tests/offline/cantos-04.spec.ts read the same fixture).
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const fixture=JSON.parse(readFileSync('tests/offline/fixtures/cantos-asimetricos.json','utf8')) as {pieces:{detail:string;edgeMap:number[]}[]};
const SIDES=['Arr','Aba','Izq','Der'];

/** Five boards of 609,6 × 406,4 mm: the same base × height the order gives to the Ruby fixture. */
function asymmetricProject(){
  const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0],template=f.pieces[0];
  f.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
  f.pieces=fixture.pieces.map((_,i)=>({...template,definition:undefined,id:`3/${31+i}`,code:`P0${i+1}`,name:`Pieza asimétrica ${i+1}`,mesh:box(19.05,406.4,609.6),dimensions:[609.6,406.4,19.05]}));
  const references:Record<string,OrderReference>=Object.fromEntries(f.pieces.map((p,i)=>[p.id,{text:'',board:'TEST-18 / 19.05 mm',edgeMap:fixture.pieces[i].edgeMap,principal:'EDGE-1',secondary:'EDGE-2',base:609.6,height:406.4}]));
  return {project,references};
}
type Segment={x1:number;y1:number;x2:number;y2:number;width:number;dashed:boolean};
/** Every stroked segment of the first page with its line width and dash state (pdf-lib draws one `m l S` per line). */
async function segments(bytes:Uint8Array):Promise<Segment[]>{
  const pdf=await PDFDocument.load(bytes),page=pdf.getPage(0),contents=page.node.Contents();
  const streams=contents instanceof PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref as PDFRef)):[contents];
  const source=streams.map(stream=>new TextDecoder('latin1').decode(decodePDFRawStream(stream as PDFRawStream).decode())).join('\n');
  const found:Segment[]=[];let width=1,dashed=false;
  for(const statement of source.split('\n')){
    const op=statement.trim();
    if(op==='q'){continue;}
    if(op==='Q'){width=1;dashed=false;continue;}
    let match=op.match(/^(-?[\d.]+) w$/);if(match){width=Number(match[1]);continue;}
    match=op.match(/^\[([^\]]*)\] -?[\d.]+ d$/);if(match){dashed=match[1].trim().length>0;continue;}
    match=op.match(/^(-?[\d.]+) (-?[\d.]+) m$/);if(match){found.push({x1:Number(match[1]),y1:Number(match[2]),x2:NaN,y2:NaN,width,dashed});continue;}
    match=op.match(/^(-?[\d.]+) (-?[\d.]+) l$/);if(match&&found.length&&Number.isNaN(found[found.length-1].x2)){Object.assign(found[found.length-1],{x2:Number(match[1]),y2:Number(match[2])});}
  }
  return found.filter(s=>!Number.isNaN(s.x2));
}
const role=(s:Segment)=>s.dashed?2:s.width>=1.5?1:0;
/** Edge glyphs: four consecutive strokes closing a rectangle no wider than 9 mm; sides read from the geometry, not from the drawing order. */
function glyphs(all:Segment[]){
  const result:{top:number;map:number[]}[]=[];
  for(let i=0;i+3<all.length;i++){
    const four=all.slice(i,i+4),horizontal=four.filter(s=>Math.abs(s.y1-s.y2)<0.01),vertical=four.filter(s=>Math.abs(s.x1-s.x2)<0.01);
    if(horizontal.length!==2||vertical.length!==2)continue;
    const [left,right]=[...vertical].sort((a,b)=>a.x1-b.x1),[bottom,top]=[...horizontal].sort((a,b)=>a.y1-b.y1);
    const w=Math.abs(top.x2-top.x1),h=Math.abs(left.y2-left.y1);
    if(w>9*72/25.4||h>9*72/25.4||Math.abs(Math.min(top.x1,top.x2)-left.x1)>0.01||Math.abs(Math.max(top.x1,top.x2)-right.x1)>0.01||Math.abs(Math.max(left.y1,left.y2)-top.y1)>0.01||Math.abs(Math.min(left.y1,left.y2)-bottom.y1)>0.01)continue;
    result.push({top:top.y1,map:[role(top),role(bottom),role(left),role(right)]});i+=3;
  }
  // PDF y grows upwards: table rows go from the highest glyph down.
  return result.sort((a,b)=>b.top-a.top);
}

describe('CANTOS-04: marcas de canto de la A4, el TXT y la vista 2D',()=>{
  it('la tabla tiene cinco piezas asimétricas: ninguna se lee igual girada o espejada',()=>{
    expect(fixture.pieces).toHaveLength(5);
    for(const {edgeMap} of fixture.pieces){
      const [top,bottom,left,right]=edgeMap;
      expect(top!==bottom||left!==right).toBe(true);
      expect(new Set(edgeMap).size).toBeGreaterThan(1);
    }
  });
  it('el glifo de cada fila marca arriba, abajo, izquierda y derecha como el mapa del pedido',async()=>{
    const {project,references}=asymmetricProject(),f=project.furniture[0];
    const bytes=await createOfflinePdf(project,regular,mono,undefined,references);
    const expected=listRows(f,references).map(row=>row.reference!.edgeMap!);
    expect(expected).toEqual(fixture.pieces.map(p=>p.edgeMap));
    const printed=glyphs(await segments(bytes));
    expect(printed.map(g=>g.map)).toEqual(expected);
    // The printed code repeats the same order (Arr·Aba·Izq·Der) as the TXT columns.
    expect(listRows(f,references).map(row=>edgeCode(row.reference))).toEqual(fixture.pieces.map(p=>p.edgeMap.join('·')));
    for(const [i,glyph] of printed.entries())for(const [side,value] of glyph.map.entries())expect(value,`${fixture.pieces[i].detail} ${SIDES[side]}`).toBe(fixture.pieces[i].edgeMap[side]);
  });
});
