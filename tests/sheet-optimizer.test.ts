import {describe,it,expect} from 'vitest';
import {canRotate,legendKey,optimizeBoards,packSheets,usable,type BoardGroup,type CutSettings,type SheetLayout,type SheetPiece,type SheetSpec} from '../sketchup_offline/ui/sheetOptimizer';
import {DEFAULT_CUT,cutFields,edgeToBuy,edgeTotals,parseCut} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';

// Datos sintéticos: placas y SKU inventados para la prueba.
const spec=(patch:Partial<SheetSpec>={}):SheetSpec=>({lengthMm:2600,widthMm:1830,trimMm:0,kerfMm:0,...patch});
const piece=(id:string,base:number,height:number,rotate=false):SheetPiece=>({id,detail:`Pieza ${id}`,base,height,rotate});
const many=(count:number,base:number,height:number,rotate=false)=>Array.from({length:count},(_,i)=>piece(`p${String(i).padStart(3,'0')}`,base,height,rotate));
const overlaps=(a:{x:number;y:number;w:number;h:number},b:typeof a,kerf:number)=>a.x<b.x+b.w+kerf-1e-6&&b.x<a.x+a.w+kerf-1e-6&&a.y<b.y+b.h+kerf-1e-6&&b.y<a.y+a.h+kerf-1e-6;
/** Cada pieza dentro de la medida útil y separada de las demás al menos un kerf. */
function valid(sheets:SheetLayout[],s:SheetSpec){
 for(const sheet of sheets){
  for(const p of sheet.placements){expect(p.x).toBeGreaterThanOrEqual(s.trimMm-1e-6);expect(p.y).toBeGreaterThanOrEqual(s.trimMm-1e-6);expect(p.x+p.w).toBeLessThanOrEqual(s.lengthMm-s.trimMm+1e-6);expect(p.y+p.h).toBeLessThanOrEqual(s.widthMm-s.trimMm+1e-6);}
  sheet.placements.forEach((a,i)=>sheet.placements.slice(i+1).forEach(b=>expect(overlaps(a,b,s.kerfMm),`${a.id} y ${b.id} se pisan`).toBe(false)));
 }
}
const utilization=(sheets:SheetLayout[],s:SheetSpec)=>sheets.reduce((sum,sheet)=>sum+sheet.usedMm2,0)/(sheets.length*s.lengthMm*s.widthMm);

describe('Optimizador de placas (guillotina)',()=>{
 it('dos piezas de 1830 × 1300 en placa 2600 × 1830: no entran juntas, van en 2 placas',()=>{
  const s=spec({kerfMm:4}),{sheets,oversize}=packSheets([piece('a',1830,1300),piece('b',1830,1300)],s);
  expect(oversize).toEqual([]);expect(sheets).toHaveLength(2);valid(sheets,s);
  expect(utilization(sheets,s)).toBeCloseTo(0.5,2);
 });
 it('dos piezas de 1300 × 1830 sin kerf llenan una placa; con kerf de 4 mm ya no entran juntas',()=>{
  const pair=[piece('a',1300,1830),piece('b',1300,1830)];
  expect(packSheets(pair,spec()).sheets).toHaveLength(1);
  expect(packSheets(pair,spec({kerfMm:4})).sheets).toHaveLength(2);
 });
 it('con veta no gira: 1830 × 1300 a lo largo no entra si la placa útil mide 1810 de ancho; sin veta y giro permitido sí',()=>{
  const s=spec({trimMm:10});
  expect(packSheets([piece('a',1300,1830)],s).oversize.map(p=>p.id)).toEqual(['a']);
  const rotated=packSheets([piece('a',1300,2590,true)],s);expect(rotated.oversize).toHaveLength(1);
  const turn=packSheets([piece('a',1810,2000,true)],s);expect(turn.oversize).toEqual([]);expect(turn.sheets[0].placements[0]).toMatchObject({rotated:true,w:2000,h:1810});
  const locked=packSheets([piece('a',1810,2000,false)],s);expect(locked.oversize).toHaveLength(1);
 });
 it('una pieza más grande que la placa queda aparte y no abre placas',()=>{
  const {sheets,oversize}=packSheets([piece('big',2700,500),piece('ok',600,400)],spec());
  expect(oversize.map(p=>p.id)).toEqual(['big']);expect(sheets).toHaveLength(1);expect(sheets[0].placements.map(p=>p.id)).toEqual(['ok']);
 });
 it('kerf y refilado: 4 franjas de 2580 × 450 entran en 1810 útiles con kerf 3; la quinta va a otra placa',()=>{
  const s=spec({trimMm:10,kerfMm:3});
  // 4 × 450 + 3 × 3 = 1809 ≤ 1810.
  expect(packSheets(many(4,2580,450),s).sheets).toHaveLength(1);
  const five=packSheets(many(5,2580,450),s);expect(five.sheets).toHaveLength(2);valid(five.sheets,s);
  // Con kerf 4: 4 × 450 + 3 × 4 = 1812 > 1810.
  expect(packSheets(many(4,2580,450),spec({trimMm:10,kerfMm:4})).sheets).toHaveLength(2);
 });
 it('caso de mueble: laterales, estantes y fondos en pocas placas, sin superposiciones',()=>{
  const s=spec({trimMm:10,kerfMm:4.2});
  const pieces=[...many(6,2000,580),...many(10,764,560).map(p=>({...p,id:`e${p.id}`})),...many(8,400,300).map(p=>({...p,id:`c${p.id}`}))];
  const {sheets,oversize}=packSheets(pieces,s);expect(oversize).toEqual([]);valid(sheets,s);
  const net=pieces.reduce((sum,p)=>sum+p.base*p.height,0),lower=Math.ceil(net/(usable(s).length*usable(s).width));
  expect(sheets.length).toBeGreaterThanOrEqual(lower);expect(sheets.length).toBeLessThanOrEqual(lower+1);
  expect(sheets.flatMap(sheet=>sheet.placements).length).toBe(pieces.length);
 });
 it('determinístico: el mismo pedido da exactamente las mismas placas, aunque cambie el orden de entrada',()=>{
  const pieces=Array.from({length:120},(_,i)=>piece(`r${i}`,200+(i*37)%900,150+(i*53)%600,i%3===0));
  const a=packSheets(pieces,spec({trimMm:10,kerfMm:3})),b=packSheets([...pieces].reverse(),spec({trimMm:10,kerfMm:3}));
  expect(JSON.stringify(a)).toBe(JSON.stringify(packSheets(pieces,spec({trimMm:10,kerfMm:3}))));expect(JSON.stringify(a)).toBe(JSON.stringify(b));
 });
 it('cualquier mezcla de medidas, kerf y refilado da placas válidas y ubica todas las piezas que entran',()=>{
  for(let seed=1;seed<=12;seed++){
   const s=spec({trimMm:seed%3*5,kerfMm:seed%4*1.6}),pieces=Array.from({length:40+seed*5},(_,i)=>piece(`m${seed}-${i}`,80+(i*seed*131)%2400,60+(i*(seed+7)*71)%1700,(i+seed)%2===0));
   const {sheets,oversize}=packSheets(pieces,s);valid(sheets,s);
   expect(sheets.flatMap(sheet=>sheet.placements).length+oversize.length).toBe(pieces.length);
  }
 });
 it('rendimiento: 500 piezas en menos de 300 ms',()=>{
  const pieces=Array.from({length:500},(_,i)=>piece(`q${i}`,150+(i*97)%1400,100+(i*61)%700,i%2===0)),s=spec({trimMm:10,kerfMm:4});
  packSheets(pieces.slice(0,50),s);
  const start=performance.now(),{sheets,oversize}=packSheets(pieces,s),elapsed=performance.now()-start;
  expect(elapsed).toBeLessThan(300);expect(oversize).toEqual([]);valid(sheets,s);
  expect(utilization(sheets,s)).toBeGreaterThan(0.7);
 });
 it('refilado que no deja medida útil: todo queda sin ubicar',()=>{
  expect(packSheets([piece('a',100,100)],spec({lengthMm:15,widthMm:15,trimMm:10})).oversize).toHaveLength(1);
 });
 it('letras de leyenda',()=>{expect([0,1,25,26,27,701,702].map(legendKey)).toEqual(['A','B','Z','AA','AB','ZZ','AAA']);});
});

const item=(patch:Partial<CatalogItem>&{id:string;kind:string}):CatalogItem=>({name:patch.id,sku:`SKU-${patch.id}`,supplier:'Prueba',thicknessMm:18,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},...patch});
const row=(id:string,patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:`Pieza ${id}`,axes:[0,1],flipX:false,flipY:false,frontSign:1,materialId:'mel',principalId:'can',secondaryId:null,edgeMap:[1,0,0,0],grainPolicy:'locked',dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,edgeBindings:[],...patch});
const geom=(x:number,y:number,z=18):Geometry=>({lengths:[x,y,z],bounds:{min:[0,0,0],max:[x,y,z]},scales:[1,1,1],mirrored:false,rectangular:true,vertices:[],triangles:[]});
const catalog:Catalog={schema:2,revision:1,items:[item({id:'mel',kind:'sheet'}),item({id:'sin',kind:'sheet',lengthMm:null,widthMm:null}),item({id:'can',kind:'edge',widthMm:22,thicknessMm:0.45})]};
const plan=(rows:OrderRow[],geometry:Record<string,Geometry>):Pick<OrderPlan,'rows'|'geometry'>=>({rows,geometry});
// Placas como las arma Ruby (SupplierOrder#boards): material + espesor real de la pieza.
const board=(materialId:string,thicknessMm:number,rowIds:string[]):BoardGroup=>({key:`${materialId}|${Math.round(thicknessMm*10)}`,materialId,name:`Placa ${materialId}`,sku:`SKU-${materialId}`,thicknessMm,rowIds});
const cut=(patch:Partial<CutSettings>={}):CutSettings=>({trimMm:10,kerfMm:4,allowRotate:false,...patch});

describe('Optimización por placa del proyecto',()=>{
 it('una placa por material y espesor: cada una se optimiza aparte con la medida de las piezas',()=>{
  const p=plan([row('a'),row('b'),row('c',{axes:null}),row('f',{materialId:'sin'}),row('g'),row('t')],{a:geom(1830,1300),b:geom(1830,1300),c:geom(100,100),f:geom(500,400),g:geom(2700,400),t:geom(1000,500,15)});
  const result=optimizeBoards(p,catalog,[board('mel',18,['a','b','c','g']),board('mel',15,['t']),board('sin',18,['f'])],cut());
  expect(result.materials.map(m=>[m.key,m.thicknessMm,m.pieces])).toEqual([['mel|180',18,3],['mel|150',15,1],['sin|180',18,1]]);
  const mel=result.materials[0];
  expect(mel).toMatchObject({status:'ok',trimMm:10,kerfMm:4,unsized:1,name:'Placa mel'});expect(mel.sheets).toHaveLength(2);expect(mel.oversize.map(o=>o.id)).toEqual(['g']);
  expect(mel.boughtM2).toBeCloseTo(2*2.6*1.83,6);expect(mel.utilization).toBeCloseTo(2*1.83*1.3/(2*2.6*1.83),6);
  // Mismas medidas, misma letra; la más grande primero.
  expect(mel.legend.map(e=>[e.key,e.base,e.height,e.count])).toEqual([['A',1830,1300,2],['B',2700,400,1]]);expect(mel.keys).toMatchObject({a:'A',b:'A',g:'B'});
  // Dos placas con la misma distribución se dibujan una sola vez.
  expect(mel.layouts.map(l=>l.sheetNumbers)).toEqual([[1,2]]);
  expect(result.materials[1].sheets).toHaveLength(1);
  expect(result.materials[2]).toMatchObject({status:'no_format',sheets:[]});
  // Una placa cuya ficha ya no está en la biblioteca no se dibuja.
  expect(optimizeBoards(p,catalog,[board('otra',18,['a'])],cut()).materials).toEqual([]);
 });
 it('kerf y refilado solo cuentan para ubicar: las medidas de la leyenda son las de las piezas',()=>{
  const p=plan([row('a'),row('b')],{a:geom(1300,900),b:geom(1300,900)}),groups=[board('mel',18,['a','b'])];
  const thin=optimizeBoards(p,catalog,groups,cut({kerfMm:0,trimMm:0})).materials[0],thick=optimizeBoards(p,catalog,groups,cut({kerfMm:10,trimMm:50})).materials[0];
  expect(thin.legend[0]).toMatchObject({base:1300,height:900});expect(thick.legend[0]).toMatchObject({base:1300,height:900});
  expect(thin.sheets).toHaveLength(1);expect(thick.sheets).toHaveLength(2);
 });
 it('giro solo si se pide, con placa sin veta y cantos simétricos; con veta nunca',()=>{
  const grained:Catalog={...catalog,items:catalog.items.map(i=>i.id==='mel'?{...i,grain:true}:i)},p=plan([row('a',{edgeMap:[0,0,0,0]})],{a:geom(1810,2000)}),groups=[board('mel',18,['a'])];
  expect(optimizeBoards(p,catalog,groups,cut()).materials[0].oversize.map(o=>o.id)).toEqual(['a']);
  const turned=optimizeBoards(p,catalog,groups,cut({allowRotate:true})).materials[0];expect(turned.oversize).toEqual([]);expect(turned.rotatable).toBe(1);
  expect(optimizeBoards(p,grained,groups,cut({allowRotate:true})).materials[0].oversize.map(o=>o.id)).toEqual(['a']);
  const asymmetric=plan([row('a',{edgeMap:[1,0,0,0]})],{a:geom(1810,2000)});
  expect(optimizeBoards(asymmetric,catalog,groups,cut({allowRotate:true})).materials[0].oversize.map(o=>o.id)).toEqual(['a']);
  expect(canRotate(row('x',{edgeMap:[1,1,1,1]}),catalog.items[0],{allowRotate:true})).toBe(true);
 });
 it('determinístico: mismas placas aunque cambie el orden de las piezas',()=>{
  const rows=Array.from({length:40},(_,i)=>row(`r${i}`)),geometry=Object.fromEntries(rows.map((r,i)=>[r.id,geom(200+(i*37)%900,150+(i*53)%600)]));
  const a=optimizeBoards(plan(rows,geometry),catalog,[board('mel',18,rows.map(r=>r.id))],cut()),b=optimizeBoards(plan([...rows].reverse(),geometry),catalog,[board('mel',18,[...rows].reverse().map(r=>r.id))],cut());
  expect(JSON.stringify(a.materials[0].sheets)).toBe(JSON.stringify(b.materials[0].sheets));
 });
});

describe('Total de cantos del proyecto',()=>{
 it('metros netos por canto y a comprar en metros enteros, sin margen',()=>{
  const p=plan([row('a',{edgeMap:[1,1,0,0]}),row('b',{edgeMap:[1,0,1,1]}),row('c',{include:false,edgeMap:[1,1,1,1]})],{a:geom(1000,400),b:geom(800,500),c:geom(500,500)});
  const {lines}=edgeTotals(p,catalog);expect(lines).toHaveLength(1);expect(lines[0].metres).toBeCloseTo(3.8,9);expect(lines[0]).toMatchObject({sides:5,pieces:2});
  expect(edgeToBuy(lines[0].metres)).toBe(4);expect(edgeToBuy(4)).toBe(4);expect(edgeToBuy(4.0001)).toBe(5);expect(edgeToBuy(0)).toBe(0);
  expect(edgeTotals(plan([row('d',{edgeMap:[2,0,0,0]})],{d:geom(100,100)}),catalog).unassigned).toBe(1);
 });
});

describe('Corte de la seccionadora',()=>{
 it('sugeridos: disco de 4 mm, 10 mm de refilado y sin girar; lo guardado vale campo por campo',()=>{
  expect(DEFAULT_CUT).toEqual({kerfMm:4,trimMm:10,allowRotate:false});
  expect(parseCut(null)).toEqual(DEFAULT_CUT);expect(parseCut('{roto')).toEqual(DEFAULT_CUT);expect(parseCut('[1,2]')).toEqual(DEFAULT_CUT);
  expect(parseCut(JSON.stringify({kerfMm:3.2,trimMm:15,allowRotate:true}))).toEqual({kerfMm:3.2,trimMm:15,allowRotate:true});
  expect(parseCut(JSON.stringify({kerfMm:11,trimMm:-1,allowRotate:'sí'}))).toEqual(DEFAULT_CUT);
  expect(parseCut(JSON.stringify({kerfMm:0,trimMm:50}))).toEqual({kerfMm:0,trimMm:50,allowRotate:false});
  expect(cutFields.kerfMm.range).toEqual([0,10]);expect(cutFields.trimMm.range).toEqual([0,50]);
 });
});
