import {describe,expect,it} from 'vitest';
import {GENERAL_REFERENCE_CASES} from './fixtures/general-reference-cases';
import {packSheets,type Placement,type SheetPiece,type SheetSpec} from '../sketchup_offline/ui/sheetOptimizer';

// Synthetic order only. These are safety properties, not parity with OpenCutList.
const spec:SheetSpec={lengthMm:2800,widthMm:2070,trimMm:12,kerfMm:4.4};
const pieces=(count:number):SheetPiece[]=>Array.from({length:count},(_,i)=>({id:`synthetic-${i}`,detail:`Pieza ${i}`,base:100+(i*97)%1100,height:80+(i*61)%700,rotate:i%3===0}));
const tolerance=0.00001;

/** A guillotine layout admits a complete horizontal or vertical separating cut at every subdivision. */
function guillotineLayout(parts:Placement[],kerf:number):boolean{
 if(parts.length<2)return true;
 for(const axis of ['x','y'] as const){
  const extent=axis==='x'?'w':'h';
  for(const part of parts){
   const cut=part[axis]+part[extent];
   const before=parts.filter(p=>p[axis]+p[extent]<=cut+tolerance);
   const after=parts.filter(p=>p[axis]>=cut+kerf-tolerance);
   if(!before.length||!after.length||before.length+after.length!==parts.length)continue;
   if(guillotineLayout(before,kerf)&&guillotineLayout(after,kerf))return true;
  }
 }
 return false;
}

describe('General: invariantes independientes del algoritmo',()=>{
 it('cada pieza mantiene identidad, medidas físicas y permiso individual de giro; la entrada no se modifica',()=>{
  const input=pieces(180),snapshot=JSON.stringify(input),settings=JSON.stringify(spec);
  const packed=packSheets(input,spec),byId=new Map(input.map(p=>[p.id,p]));
  expect(packed.oversize).toEqual([]);
  const placements=packed.sheets.flatMap(s=>s.placements);
  expect(placements.map(p=>p.id).sort()).toEqual(input.map(p=>p.id).sort());
  for(const p of placements){
   const source=byId.get(p.id)!;
   expect(p.w).toBeCloseTo(p.rotated?source.height:source.base,8);
   expect(p.h).toBeCloseTo(p.rotated?source.base:source.height,8);
   if(p.rotated)expect(source.rotate).toBe(true);
  }
  for(const sheet of packed.sheets){
   expect(sheet.usedMm2).toBeCloseTo(sheet.placements.reduce((sum,p)=>sum+p.w*p.h,0),5);
   expect(guillotineLayout(sheet.placements,spec.kerfMm)).toBe(true);
  }
  expect(JSON.stringify(input)).toBe(snapshot);expect(JSON.stringify(spec)).toBe(settings);
 });
 it('acepta formato de ficha no estándar y distingue un pedido vacío de piezas que no caben',()=>{
  const configured={lengthMm:1734,widthMm:932,trimMm:7,kerfMm:3.2};
  expect(packSheets([],configured)).toEqual({sheets:[],oversize:[]});
  const input:SheetPiece[]=[{id:'exact',detail:'Util exacta',base:1720,height:918,rotate:false},{id:'outside',detail:'No cabe',base:1721,height:918,rotate:false}];
  const result=packSheets(input,configured);
  expect(result.oversize).toEqual([input[1]]);expect(result.sheets).toHaveLength(1);
  expect(result.sheets[0].placements).toEqual([{id:'exact',x:7,y:7,w:1720,h:918,rotated:false}]);
 });
 it('1560 piezas: no pierde ocurrencias, no duplica IDs y conserva cortes de guillotina',()=>{
  const input=pieces(1560),result=packSheets(input,spec);
  const ids=result.sheets.flatMap(s=>s.placements.map(p=>p.id));
  expect(result.oversize).toEqual([]);expect(ids).toHaveLength(1560);expect(new Set(ids).size).toBe(1560);
  for(const sheet of result.sheets)expect(guillotineLayout(sheet.placements,spec.kerfMm)).toBe(true);
 },20000);
});

// Board-count/occurrence observations from the pinned public engine, not identical layouts.
describe('General: corpus sintético comparado con referencia pública',()=>{
 const expectedCounts=[3,2,1,1,1,4];
 for(const [index,fixture] of GENERAL_REFERENCE_CASES.entries())it(fixture.name,()=>{
  const result=packSheets(fixture.pieces,fixture.spec);
  expect(result.sheets).toHaveLength(expectedCounts[index]);
  expect(result.oversize.map(p=>p.id)).toEqual(index===3?['locked-0']:[]);
  expect(result.sheets.flatMap(s=>s.placements).length+result.oversize.length).toBe(fixture.pieces.length);
 });
});
