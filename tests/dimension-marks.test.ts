import {describe,expect,it} from 'vitest';
import {createA4Demo} from '../lib/a4Demo';
import {dimensionChoices,dimensionKey,dimensionMarkHitsRect,dimensionText,segmentHitsRect,type Dimension,type DimensionSegment,type Rect} from '../lib/dimensions';
import {makeScene,sheetView} from '../lib/scene';

// Public, synthetic geometry only: this fixture is not the operator's BM17 SKP.
function furniture(yaw=-2,pitch=10,zoom=.7){
 const f=createA4Demo().furniture[0];f.zoom=zoom;f.presentation!.cameras={front:{yaw,pitch}};return f;
}
function assertMarksRemainVisible(dimensions:Dimension[]){
 for(const dimension of dimensions)for(const other of dimensions){
  if(dimension===other)continue;
  const r=other.label.rect,padding=1;
  for(const segment of dimension.segments){
   // Independent definition of protected marks: complete ticks and measured
   // endpoints, rather than every line which may conventionally pass under text.
   if(segment.kind==='tick')expect(segmentHitsRect(segment.a,segment.b,r,padding),`${dimension.code} tick under ${other.code}`).toBe(false);
   if(segment.kind==='dimension')for(const p of [segment.a,segment.b]){
    const inside=p.x>=r.x-padding&&p.x<=r.x+r.w+padding&&p.y>=r.y-padding&&p.y<=r.y+r.h+padding;
    expect(inside,`${dimension.code} endpoint under ${other.code}`).toBe(false);
   }
  }
 }
}

/** Each visible measure is drawn, or a drawn cota with the same printed text names it in `shared`. */
function assertEveryMeasureDrawn(dimensions:Dimension[],choices:ReturnType<typeof dimensionChoices>){
 for(const c of choices){
  const own=dimensions.find(d=>d.pieceId===c.pieceId&&d.role===c.role);
  if(own){expect(own.valueMm).toBeCloseTo(c.valueMm,8);continue;}
  expect(dimensions.some(d=>d.shared?.includes(c.code)&&Math.abs(d.valueMm-c.valueMm)<=.5&&d.text.endsWith(dimensionText(c.valueMm))),`${dimensionKey(c.pieceId,c.role)} sin cota`).toBe(true);
 }
}

describe('Cotas: máscaras de texto conservan marcas completas',()=>{
 const rect:Rect={x:10,y:10,w:20,h:10};
 const segment=(kind:DimensionSegment['kind'],ax:number,ay:number,bx:number,by:number):DimensionSegment=>({kind,a:{x:ax,y:ay},b:{x:bx,y:by}});
 it('protege todo el trazo de una marca aunque sus extremos queden fuera del texto',()=>{
  expect(dimensionMarkHitsRect(segment('tick',0,15,40,15),rect,0)).toBe(true);
  expect(dimensionMarkHitsRect(segment('tick',0,8,40,8),rect,0)).toBe(false);
  expect(dimensionMarkHitsRect(segment('tick',0,9,40,9),rect,1)).toBe(true);
 });
 it('protege ambos extremos medidos, incluidos los límites y su margen',()=>{
  expect(dimensionMarkHitsRect(segment('dimension',15,15,80,15),rect,0)).toBe(true);
  expect(dimensionMarkHitsRect(segment('dimension',-20,15,30,15),rect,0)).toBe(true);
  expect(dimensionMarkHitsRect(segment('dimension',-20,15,9,15),rect,0)).toBe(false);
  expect(dimensionMarkHitsRect(segment('dimension',-20,15,9,15),rect,1)).toBe(true);
 });
 it('permite el centro de una línea y líderes o extensiones bajo una máscara',()=>{
  for(const kind of ['dimension','extension','leader'] as const)expect(dimensionMarkHitsRect(segment(kind,0,15,40,15),rect,0)).toBe(false);
  for(const kind of ['extension','leader'] as const)expect(dimensionMarkHitsRect(segment(kind,15,15,40,15),rect,0)).toBe(false);
 });
 it.each([[-2,10,.7],[-30,45,1],[35,35,.7]])('ubica todas las cotas sin borrar marcas en ambas vistas: yaw %s, pitch %s, zoom %s',(yaw,pitch,zoom)=>{
  const f=furniture(yaw,pitch,zoom),before=JSON.stringify(f);
  for(const view of ['front','back'] as const){
   const scene=makeScene(f,{view,layout:'sheet'});
   expect(scene.warnings).toEqual([]);
   assertMarksRemainVisible(scene.dimensions);
   const hidden=new Set(view==='back'?f.presentation!.guide!.hiddenPieceIds:[]);
   assertEveryMeasureDrawn(scene.dimensions,dimensionChoices({...f,pieces:f.pieces.filter(p=>!hidden.has(p.id))}).filter(c=>c.visible));
  }
  expect(JSON.stringify(f)).toBe(before);
 });
 // 0.8.19: la composición que antes no admitía todas las cotas entra al acotar una vez las medidas iguales.
 it('acota una composición densa sin perder medidas ni cambiar geometría',()=>{
  const f=furniture(-20,27,.7),before=JSON.stringify(f),choices=dimensionChoices(f).filter(c=>c.visible);
  const scene=makeScene(f,{view:'front',layout:'sheet'});
  expect(scene.warnings).toEqual([]);
  assertMarksRemainVisible(scene.dimensions);
  assertEveryMeasureDrawn(scene.dimensions,choices);
  expect(JSON.stringify(f)).toBe(before);
 });
 it('corre sola una cota movida sobre la marca de otra, sin bloquear la exportación',()=>{
  const f=furniture(),scene=makeScene(f,{view:'front',layout:'sheet'});
  expect(scene.warnings).toEqual([]);
  const moved=scene.dimensions[0],other=scene.dimensions.find(d=>d!==moved&&d.segments.some(s=>s.kind==='tick'))!;
  const tick=other.segments.find(s=>s.kind==='tick')!,{width,height}=sheetView(f);
  const target={x:(tick.a.x+tick.b.x)/2,y:(tick.a.y+tick.b.y)/2};
  f.presentation!.dimensionOffsets=[{pieceId:moved.pieceId,role:moved.role,view:'front',offset:[(target.x-moved.label.center.x)/width,(target.y-moved.label.center.y)/height]}];
  const before=JSON.stringify(f),changed=makeScene(f,{view:'front',layout:'sheet'});
  const updated=changed.dimensions.find(d=>d.pieceId===moved.pieceId&&d.role===moved.role)!;
  expect(changed.warnings).toEqual([]);
  assertMarksRemainVisible(changed.dimensions);
  expect(Math.hypot(updated.label.center.x-target.x,updated.label.center.y-target.y)).toBeLessThan(Math.hypot(moved.label.center.x-target.x,moved.label.center.y-target.y));
  expect(changed.dimensions.map(d=>[d.pieceId,d.role,d.valueMm]).sort()).toEqual(scene.dimensions.map(d=>[d.pieceId,d.role,d.valueMm]).sort());
  expect(JSON.stringify(f)).toBe(before);
 });
});
