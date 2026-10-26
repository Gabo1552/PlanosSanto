import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {packExperto,packExpertoReference,expertoUsable,EXPERTO_SETTINGS} from '../sketchup_offline/ui/expertoOptimizer';
import type {SheetPiece,SheetSpec} from '../sketchup_offline/ui/sheetOptimizer';

const spec=(patch:Partial<SheetSpec>={}):SheetSpec=>({lengthMm:2750,widthMm:1830,trimMm:10,kerfMm:4.4,...patch});
const piece=(id:string,base:number,height:number,rotate=false):SheetPiece=>({id,detail:id,base,height,rotate});
type OracleCase={name:string;spec:SheetSpec;pieces:SheetPiece[];expected:{placas:number;ml_sierra_m:number;detalle:[(string|number|boolean)[][],number[]][]}};
const oracle=JSON.parse(readFileSync(new URL('./fixtures/experto/reference.json',import.meta.url),'utf8')) as {sourceSha256:string;cases:OracleCase[]};

function valid(pieces:SheetPiece[],s:SheetSpec,pack=packExperto){
 const result=pack(pieces,s);
 expect(result.errors).toEqual([]);
 expect(result.sheets.flatMap(sheet=>sheet.placements)).toHaveLength(pieces.length);
 expect(result.sheets.length).toBeGreaterThanOrEqual(result.theoreticalMinimum);
 for(const sheet of result.sheets){
  for(const p of sheet.placements){
   expect(p.x).toBeGreaterThanOrEqual(10-1e-6);expect(p.y).toBeGreaterThanOrEqual(10-1e-6);
   expect(p.x+p.w).toBeLessThanOrEqual(s.lengthMm+1e-6);expect(p.y+p.h).toBeLessThanOrEqual(s.widthMm+1e-6);
  }
  sheet.placements.forEach((a,i)=>sheet.placements.slice(i+1).forEach(b=>{
   const overlap=a.x<b.x+b.w+4.4-1e-6&&b.x<a.x+a.w+4.4-1e-6&&a.y<b.y+b.h+4.4-1e-6&&b.y<a.y+a.h+4.4-1e-6;
   expect(overlap,`${a.id}/${b.id}`).toBe(false);
  }));
 }
 return result;
}

describe('Experto: parity with supplied Python reference, not live supplier validation',()=>{
 it('records the hash of the actual user-supplied oracle',()=>expect(oracle.sourceSha256).toBe('28114a6a3c54092611fc30fe1a6bab6e34effb6d2eabbe56b32d2071f9d07e1f'));
 for(const c of oracle.cases)it(c.name,()=>{
  const result=valid(c.pieces,c.spec,packExpertoReference);
  expect(result.sheets).toHaveLength(c.expected.placas);
  expect(result.sawMetres).toBeCloseTo(c.expected.ml_sierra_m,4);
  result.sheets.forEach((sheet,index)=>{
   const [placed,cuts]=c.expected.detalle[index];
   expect(sheet.placements).toHaveLength(placed.length);
   sheet.placements.forEach((p,i)=>{
    const [id,x,y,w,h,rotated]=placed[i];
    expect(p.id).toBe(id);expect(p.rotated).toBe(rotated);
    expect(p.x-10).toBeCloseTo(Number(x),6);expect(p.y-10).toBeCloseTo(Number(y),6);
    expect(p.w).toBe(w);expect(p.h).toBe(h);
   });
   expect(result.partitionCutsMm[index]).toHaveLength(cuts.length);
   cuts.forEach((v,i)=>expect(result.partitionCutsMm[index][i]).toBeCloseTo(v,6));
  });
 });
});

describe('Experto validation, physical instances and catalogue dimensions',()=>{
 it('matches case A: 3 boards, 37.3464 saw metres and four estimated stacked steps',()=>{
  const result=packExperto([piece('A1',1500,1500),piece('A2',1500,1500),piece('A3',1500,1500)],spec());
  expect(result.errors).toEqual([]);expect(result.sheets).toHaveLength(3);expect(result.sawMetres).toBe(37.3464);expect(result.estimatedSawSteps).toBe(4);
  expect(result.partitionCutsMm).toEqual([[1824.4,1504.4],[1824.4,1504.4],[1824.4,1504.4]]);
 });
 it('uses the configured board dimensions, including nonstandard formats, without any brand lookup',()=>{
  const custom=spec({lengthMm:3010,widthMm:1210});
  expect(expertoUsable(custom)).toEqual({length:3000,width:1200});
  const result=valid([piece('custom',3000,1200)],custom);
  expect(result.sheets).toHaveLength(1);expect(result.partitionCutsMm).toEqual([[]]);expect(result.estimatedSawSteps).toBe(2);
  expect(result.sheets[0].placements[0]).toMatchObject({x:10,y:10,w:3000,h:1200});
 });
 it('allows the exact usable length and counts no cut at an exact edge',()=>{
  const result=packExperto([piece('a',2740,600)],spec());
  expect(result.errors).toEqual([]);expect(result.sheets).toHaveLength(1);expect(result.estimatedSawSteps).toBe(3);expect(result.partitionCutsMm).toEqual([[2744.4]]);
 });
 it.each([[2745,600,2750,'PIEZA_NO_ENTRA'],[2600,600,2600,'PIEZA_NO_ENTRA'],[40,30,2600,'LADO_MENOR_AL_MINIMO'],[NaN,500,2600,'MEDIDA_INVALIDA'],[Infinity,500,2600,'MEDIDA_INVALIDA'],[-100,500,2600,'MEDIDA_INVALIDA'],[0,500,2600,'MEDIDA_INVALIDA']] as const)('blocks the WHOLE run for invalid piece %s × %s', (base,height,length,code)=>{
  const result=packExperto([piece('valid',600,400),piece('bad',base,height,true)],spec({lengthMm:length}));
  expect(result.errors[0]).toMatchObject({pieceId:'bad',code});expect(result.oversize.map(p=>p.id)).toEqual(['bad']);
  expect(result.sheets).toEqual([]);expect(result.sawMetres).toBe(0);expect(result.estimatedSawSteps).toBe(0);
 });
 it.each([spec({kerfMm:4}),spec({trimMm:20}),spec({widthMm:Infinity}),spec({widthMm:10}),spec({lengthMm:NaN})])('rejects a malformed or mismatching specification',s=>{
  const result=packExperto([piece('a',600,400)],s);expect(result.errors.length).toBeGreaterThan(0);expect(result.sheets).toEqual([]);
 });
 it.each([0,-1,NaN,Infinity])('rejects invalid thickness %s',thickness=>expect(packExperto([piece('a',600,400)],spec(),thickness).errors[0].code).toBe('ESPESOR_INVALIDO'));
 it('returns a finite zero result for an empty order',()=>{
  expect(packExperto([],spec())).toEqual({sheets:[],oversize:[],errors:[],warnings:[],sawMetres:0,estimatedSawSteps:0,partitionCutsMm:[],theoreticalMinimum:0});
 });
 it('keeps a positive physical lower bound and finite steps at numeric extremes',()=>{
  const result=packExperto([piece('small',50,50)],spec({lengthMm:1e8,widthMm:1e6}),Number.MIN_VALUE);
  expect(result.errors).toEqual([]);expect(result.theoreticalMinimum).toBe(1);expect(result.estimatedSawSteps).toBe(4);
 });
 it('preserves grain axes and only rotates pieces explicitly allowed to turn',()=>{
  expect(packExperto([piece('grain',600,2400)],spec()).errors[0].code).toBe('PIEZA_NO_ENTRA');
  const result=valid([piece('rotate',600,2400,true),piece('locked',500,300,false)],spec());
  expect(result.sheets.flatMap(s=>s.placements).find(p=>p.id==='rotate')).toMatchObject({w:2400,h:600,rotated:true});
  expect(result.sheets.flatMap(s=>s.placements).find(p=>p.id==='locked')).toMatchObject({w:500,h:300,rotated:false});
 });
 it('does not reorder stable area/long-side ties or mutate input dimensions and order',()=>{
  const pieces=[piece('first',400,600,true),piece('second',600,400,true)],before=JSON.stringify(pieces),result=valid(pieces,spec());
  expect(result.sheets[0].placements[0]).toMatchObject({id:'first',w:400,h:600,rotated:false});expect(JSON.stringify(pieces)).toBe(before);
 });
 it('does not stack rectangles with different heights despite the same id, x, y and width',()=>{
  const result=packExperto([piece('same',1500,1500),piece('same',1500,1600)],spec());
  expect(result.sheets).toHaveLength(2);expect(result.estimatedSawSteps).toBe(8);
 });
 it('stacks identical physical patterns independently of their instance IDs; respects stack thickness',()=>{
  const pieces=Array.from({length:6},(_,i)=>piece(`p${i}`,1500,1500));
  expect(packExperto(pieces,spec(),18).estimatedSawSteps).toBe(8);
  expect(packExperto(pieces,spec(),12).estimatedSawSteps).toBe(4);
  expect(packExperto(pieces,spec(),100).estimatedSawSteps).toBe(24);
 });
 it('1500+ pieces remain complete and deterministic with bounded search',()=>{
  const pieces=Array.from({length:1560},(_,i)=>piece(`bench${i}`,100+(i*97)%1400,50+(i*61)%700,i%2===0));
  packExperto(pieces.slice(0,50),spec());
  const start=performance.now(),result=packExperto(pieces,spec()),elapsed=performance.now()-start;
  expect(result.errors).toEqual([]);expect(result.sheets.flatMap(s=>s.placements)).toHaveLength(1560);expect(result.sheets.length).toBeGreaterThanOrEqual(result.theoreticalMinimum);
  expect(packExperto(pieces,spec())).toEqual(result);
  // A generous CI budget detects accidental exponential work, not a native UI benchmark.
  expect(elapsed).toBeLessThan(2000);
 });
 it('has fixed provider settings and never applies a four-side trim',()=>expect(EXPERTO_SETTINGS).toMatchObject({kerfMm:4.4,trimMm:10,minSideMm:50,maxDepth:2}));
});
