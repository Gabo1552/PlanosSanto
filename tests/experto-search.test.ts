import {describe,it,expect} from 'vitest';
import {packExperto,packExpertoReference} from '../sketchup_offline/ui/expertoOptimizer';
import type {SheetPiece} from '../sketchup_offline/ui/sheetOptimizer';
import {verifyExpertoLayout} from './helpers/experto-invariants';
import oracle from './fixtures/experto/reference.json';
import probes from './fixtures/experto/supplier-probes.json';
const spec={lengthMm:2750,widthMm:1830,trimMm:10,kerfMm:4.4};

describe('Búsqueda Experto: planes completos y geometría independiente',()=>{
 for(const c of oracle.cases)it(`conserva piezas y no agrega placas a la referencia: ${c.name}`,()=>{
  const result=packExperto(c.pieces,c.spec),baseline=packExpertoReference(c.pieces,c.spec);
  verifyExpertoLayout(c.pieces,c.spec,result);
  expect(result.sheets.length).toBeLessThanOrEqual(baseline.sheets.length);
  expect(result.search?.referenceBoards).toBe(baseline.sheets.length);
  expect(result.search!.candidates).toBeLessThanOrEqual(90);
 });
 it('A construye la franja completa antes de subdividir las cinco columnas giradas',()=>{
  const pieces=Array.from({length:5},(_,i)=>({id:String(i),detail:'',base:1600,height:500,rotate:true}));
  const result=packExperto(pieces,spec);
  verifyExpertoLayout(pieces,spec,result);
  expect(result.sheets).toHaveLength(1);expect(result.sheets[0].placements.every(p=>p.rotated)).toBe(true);
  expect(result.estimatedSawSteps).toBe(8);expect(result.sawMetres).toBe(19.8864);
  expect(result.partitionCutsMm[0]).toEqual(probes.cases[0].partitionCutLengthsMm);
  expect(packExperto(pieces.map(p=>({...p,rotate:false})),spec).sheets).toHaveLength(2);
 });
 it('los nombres e IDs no seleccionan una regla ni modifican el plan geométrico',()=>{
  const pieces=Array.from({length:5},(_,i)=>({id:String(i),detail:'A',base:1600,height:500,rotate:true}));
  const a=packExperto(pieces,spec),b=packExperto(pieces.map(p=>({...p,id:`other/${p.id}`,detail:'C'})),spec);
  const geometry=(r:typeof a)=>r.sheets.map(s=>s.placements.map(p=>({...p,id:''})));
  expect(geometry(a)).toEqual(geometry(b));expect(a.search).toEqual(b.search);
 });
 it('mantiene duplicados físicos y bordes exactos con decimales y formatos propios',()=>{
  const pieces=[{id:'same',detail:'',base:600.1,height:400.2,rotate:false},{id:'same',detail:'',base:600.1,height:400.2,rotate:false}];
  const board={...spec,lengthMm:1214.6,widthMm:410.2};
  const result=packExperto(pieces,board);verifyExpertoLayout(pieces,board,result);expect(result.sheets).toHaveLength(1);
 });
 for(let seed=1;seed<=24;seed++)it(`invariantes, veta, entrada inmutable y determinismo ${seed}`,()=>{
  let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const pieces:SheetPiece[]=Array.from({length:12+seed},(_,i)=>({id:String(i),detail:'Synthetic',base:50+(random()%21000)/10,height:50+(random()%13000)/10,rotate:random()%3===0}));
  const original=JSON.stringify(pieces),result=packExperto(pieces,spec),baseline=packExpertoReference(pieces,spec);
  verifyExpertoLayout(pieces,spec,result);
  expect(result.sheets.length).toBeLessThanOrEqual(baseline.sheets.length);
  expect(JSON.stringify(pieces)).toBe(original);expect(packExperto(pieces,spec)).toEqual(result);
 });
});
