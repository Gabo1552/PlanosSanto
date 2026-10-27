import assert from 'node:assert/strict';
import type {ExpertoPackResult} from '../../sketchup_offline/ui/expertoOptimizer';
import type {Placement,SheetPiece,SheetSpec} from '../../sketchup_offline/ui/sheetOptimizer';

// Independent geometric check: recursively separate rectangles by a full-width
// or full-height saw corridor. No implementation free nodes or split policy used.
function guillotine(placed:Placement[],kerf:number):boolean{
 if(placed.length<2)return true;
 for(const axis of ['x','y'] as const){
  const side=axis==='x'?'w':'h';
  for(const p of placed){
   const cut=p[axis]+p[side],left=placed.filter(q=>q[axis]+q[side]<=cut+1e-6);
   if(left.length===placed.length)continue;
   const right=placed.filter(q=>q[axis]>=cut+kerf-1e-6);
   if(left.length+right.length===placed.length&&guillotine(left,kerf)&&guillotine(right,kerf))return true;
  }
 }
 return false;
}
export function verifyExpertoLayout(pieces:SheetPiece[],spec:SheetSpec,result:ExpertoPackResult){
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.oversize,[]);
 const remaining=new Map<string,SheetPiece[]>();
 for(const p of pieces)remaining.set(p.id,[...(remaining.get(p.id)??[]),p]);
 let count=0;
 for(const [index,sheet] of result.sheets.entries()){
  let area=0;
  for(const [i,p] of sheet.placements.entries()){
   count++;area+=p.w*p.h;
   const originals=remaining.get(p.id)??[];
   const match=originals.findIndex(o=>p.rotated?o.rotate&&p.w===o.height&&p.h===o.base:p.w===o.base&&p.h===o.height);
   assert.ok(match>=0,'Missing, duplicate, resized or forbidden rotated piece');originals.splice(match,1);
   for(const n of [p.x,p.y,p.w,p.h])assert.ok(Number.isFinite(n));
   assert.ok(p.x>=spec.trimMm-1e-6&&p.y>=spec.trimMm-1e-6);
   assert.ok(p.x+p.w<=spec.lengthMm+1e-6&&p.y+p.h<=spec.widthMm+1e-6);
   for(const b of sheet.placements.slice(i+1))assert.ok(p.x+p.w+spec.kerfMm<=b.x+1e-6||b.x+b.w+spec.kerfMm<=p.x+1e-6||p.y+p.h+spec.kerfMm<=b.y+1e-6||b.y+b.h+spec.kerfMm<=p.y+1e-6,'Overlap or lost kerf');
  }
  assert.ok(Math.abs(sheet.usedMm2-area)<1e-4);
  assert.ok(guillotine(sheet.placements,spec.kerfMm),'Non-guillotine layout');
  assert.ok(result.partitionCutsMm[index].every(c=>Number.isFinite(c)&&c>0));
 }
 assert.equal(count,pieces.length);assert.ok([...remaining.values()].every(list=>list.length===0));
 assert.ok(Number.isFinite(result.sawMetres)&&Number.isFinite(result.estimatedSawSteps));
 assert.equal(result.partitionCutsMm.length,result.sheets.length);
 const metres=result.sheets.length*(2*(spec.lengthMm-spec.trimMm)+2*(spec.widthMm-spec.trimMm))+result.partitionCutsMm.flat().reduce((sum,n)=>sum+n,0);
 assert.ok(Math.abs(result.sawMetres-metres/1000)<0.000051);
}
