import {describe,it,expect} from 'vitest';
import probes from './fixtures/experto/supplier-probes.json';
import {packExperto} from '../sketchup_offline/ui/expertoOptimizer';

describe('Ensayos sintéticos devueltos por el proveedor: testigos, no algoritmo inferido',()=>{
 for(const probe of probes.cases){
  it(`${probe.id}: testigo de una placa conserva cantidades, medidas, giro y sierra`,()=>{
   const [length,width]=probe.observedBoardMm.map(n=>n-probe.trimMm),counts=new Map<number,number>();
   for(const [i,p] of probe.witness.entries()){
    counts.set(p.row,(counts.get(p.row)||0)+1);const input=probe.cuts[p.row];
    expect((p.w===input.base&&p.h===input.height)||(input.rotate&&p.w===input.height&&p.h===input.base)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x+p.w).toBeLessThanOrEqual(length+1e-6);expect(p.y+p.h).toBeLessThanOrEqual(width+1e-6);
    for(const b of probe.witness.slice(i+1))expect(p.x+p.w+probe.kerfMm<=b.x+1e-6||b.x+b.w+probe.kerfMm<=p.x+1e-6||p.y+p.h+probe.kerfMm<=b.y+1e-6||b.y+b.h+probe.kerfMm<=p.y+1e-6).toBe(true);
   }
   probe.cuts.forEach((p,i)=>expect(counts.get(i)).toBe(p.quantity));
   const area=probe.cuts.reduce((n,p)=>n+p.quantity*p.base*p.height,0);
   expect(Math.round(area/(probe.observedBoardMm[0]*probe.observedBoardMm[1])*10000)/100).toBe(probe.supplier.utilizationPercent);
   expect(probe.partitionCutLengthsMm.length+2).toBe(probe.supplier.sawSteps);
   expect(Math.round((2*length+2*width+probe.partitionCutLengthsMm.reduce((a,b)=>a+b,0))/100)/10).toBe(probe.supplier.sawMetres);
  });
  it(`${probe.id}: registra la discrepancia del motor 0.8.23 con el formato realmente observado`,()=>{
   const pieces=probe.cuts.flatMap((p,row)=>Array.from({length:p.quantity},(_,i)=>({id:`${row}/${i}`,base:p.base,height:p.height,rotate:p.rotate,detail:'Ensayo sintético'})));
   const result=packExperto(pieces,{lengthMm:probe.observedBoardMm[0],widthMm:probe.observedBoardMm[1],kerfMm:probe.kerfMm,trimMm:probe.trimMm},18);
   expect(result.errors).toEqual([]);expect(result.sheets).toHaveLength(2);
   // Update this known-discrepancy assertion when implementing the calibrated search.
   expect(probe.supplier.boards).toBe(1);
  });
 }
 it('C no se acepta como prueba del formato 2600 solicitado',()=>{
  const c=probes.cases.find(p=>p.id==='C')!;
  expect(c.requestedBoardMm).toEqual([2600,1830]);expect(c.observedBoardMm).toEqual([2750,1830]);
  expect(c.observedBoardMm).not.toEqual(c.requestedBoardMm);
 });
});
