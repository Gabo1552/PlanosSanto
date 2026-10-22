import {describe,it,expect} from 'vitest';
import {legendKey,optimizeOrder,packSheets,sheetCost,usable,type SheetLayout,type SheetPiece,type SheetSpec} from '../sketchup_offline/ui/sheetOptimizer';
import {optimizedBudget,type Budget} from '../sketchup_offline/ui/maderaRules';
import {edgePurchase,edgeTotals,orderSize} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';

// Datos sintéticos: placas, SKU y precios inventados para la prueba.
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
const catalog:Catalog={schema:2,revision:1,items:[item({id:'mel',kind:'sheet',price:{amount:50000,currency:'ARS',unit:'placa',date:'2026-10-01',source:'Lista de prueba'}}),item({id:'sin',kind:'sheet',lengthMm:null,widthMm:null}),item({id:'can',kind:'edge',widthMm:22,thicknessMm:0.45,price:{amount:300,currency:'ARS',unit:'metro',date:'2026-10-01',source:'Lista de prueba'}})]};
const plan=(rows:OrderRow[],geometry:Record<string,Geometry>):Pick<OrderPlan,'rows'|'geometry'>=>({rows,geometry});

describe('Optimización del pedido por placa',()=>{
 const profile={trimMm:10,kerfMm:4,dimensionRule:'finished'};
 it('agrupa por placa, usa la medida que recibe la maderera y separa lo que no se puede optimizar',()=>{
  const p=plan([row('a'),row('b'),row('c',{include:false}),row('d',{materialId:''}),row('e',{axes:null}),row('f',{materialId:'sin'}),row('g')],{a:geom(1830,1300),b:geom(1830,1300),c:geom(100,100),d:geom(100,100),e:geom(100,100),f:geom(500,400),g:geom(2700,400)});
  const result=optimizeOrder(p,catalog,profile),mel=result.materials.find(m=>m.materialId==='mel')!;
  expect(result.skipped).toEqual({noBoard:1,noSize:1,notRectangular:0});
  expect(mel).toMatchObject({status:'ok',pieces:3,trimMm:10,kerfMm:4});expect(mel.sheets).toHaveLength(2);expect(mel.oversize.map(o=>o.id)).toEqual(['g']);
  expect(mel.boughtM2).toBeCloseTo(2*2.6*1.83,6);expect(mel.utilization).toBeCloseTo(2*1.83*1.3/(2*2.6*1.83),6);
  // Mismas medidas, misma letra; la más grande primero.
  expect(mel.legend.map(e=>[e.key,e.base,e.height,e.count])).toEqual([['A',1830,1300,2],['B',2700,400,1]]);expect(mel.keys).toMatchObject({a:'A',b:'A',g:'B'});
  // Dos placas con la misma distribución se dibujan una sola vez.
  expect(mel.layouts.map(l=>l.sheetNumbers)).toEqual([[1,2]]);
  expect(result.materials.find(m=>m.materialId==='sin')).toMatchObject({status:'no_format',sheets:[]});
 });
 it('costo por placa con precio vigente; desactualizado y pendiente aparte',()=>{
  const mel=optimizeOrder(plan([row('a'),row('b')],{a:geom(1830,1300),b:geom(1830,1300)}),catalog,profile).materials[0];
  expect(sheetCost(mel,new Date('2026-10-22T12:00:00Z'))).toEqual({amount:100000,currency:'ARS',status:'current_price'});
  expect(sheetCost(mel,new Date('2027-03-01T12:00:00Z')).status).toBe('stale_price');
  expect(sheetCost({...mel,price:{amount:10000,currency:'ARS',unit:'m2',date:'2026-10-01',source:'x'}},new Date('2026-10-22T12:00:00Z')).amount).toBeCloseTo(10000*mel.boughtM2,6);
  expect(sheetCost({...mel,price:null},new Date('2026-10-22T12:00:00Z')).status).toBe('price_pending');
 });
 it('giro solo con placa sin veta y «permitir giro»; con veta nunca',()=>{
  const grained:Catalog={...catalog,items:catalog.items.map(i=>i.id==='mel'?{...i,grain:true}:i)},p=plan([row('a',{grainPolicy:'rotate'})],{a:geom(1810,2000)});
  expect(optimizeOrder(p,catalog,profile).materials[0].oversize).toEqual([]);
  expect(optimizeOrder(p,grained,profile).materials[0].oversize.map(o=>o.id)).toEqual(['a']);
 });
 it('«descontar el canto» del perfil achica la medida como Ruby',()=>{
  const r=row('a',{edgeMap:[1,1,1,0]});
  expect(orderSize(r,geom(600,400),catalog,{...profile,dimensionRule:'deduct_edge'})).toEqual([599.55,399.1]);
  expect(orderSize(r,geom(600,400),catalog,profile)).toEqual([600,400]);
 });
});

describe('Total de cantos',()=>{
 it('neto, con el margen del perfil y a comprar en metros enteros',()=>{
  const p=plan([row('a',{edgeMap:[1,1,0,0]}),row('b',{edgeMap:[1,0,1,1]})],{a:geom(1000,400),b:geom(800,500)});
  const [line]=edgeTotals(p,catalog).lines;expect(line.metres).toBeCloseTo(3.8,9);
  const bought=edgePurchase(line.metres,15);expect(bought.withMargin).toBeCloseTo(4.37,9);expect(bought.buy).toBe(5);
  expect(edgePurchase(4,0)).toEqual({net:4,withMargin:4,buy:4});expect(edgePurchase(4.0001,null).buy).toBe(5);expect(edgePurchase(0,15).buy).toBe(0);
 });
});

describe('Presupuesto con placas optimizadas',()=>{
 const budget:Budget={profile:{id:'p',name:'Perfil de prueba',supplier:'Prueba',version:1,contentHash:'h',trimMm:10,kerfMm:4,dimensionRule:'finished',wastePercent:15},wastePercent:15,kerfMm:4,trimMm:10,priceAgeDays:90,
  materials:[{materialId:'mel',name:'mel',sku:'SKU-mel',role:'board',unit:'m2',netQuantity:4.758,wasteQuantity:5.6,purchaseQuantity:3,purchaseUnit:'placa',netAmount:50000,wasteAmount:58000,purchaseAmount:150000,currency:'ARS',status:'current_price'},
   {materialId:'can',name:'can',sku:'SKU-can',role:'edge',unit:'metro',netQuantity:3.8,wasteQuantity:4.37,purchaseQuantity:5,purchaseUnit:'metro',netAmount:1140,wasteAmount:1311,purchaseAmount:1500,currency:'ARS',status:'current_price'}],
  totals:{net:{ARS:51140},waste:{ARS:59311},purchase:{ARS:151500}},services:[{kind:'cut',quantity:3,unit:'placa',amount:3000,currency:'ARS',status:'current_price',approximate:false}],servicesTotals:{ARS:3000},estimated:true,optimized:false};
 it('con formato: placas y m² comprados de la optimización; el corte por placa también',()=>{
  const mel=optimizeOrder(plan([row('a'),row('b')],{a:geom(1830,1300),b:geom(1830,1300)}),catalog,{trimMm:10,kerfMm:4,dimensionRule:'finished'}).materials;
  const {budget:out,optimizedIds,fallback}=optimizedBudget(budget,mel),board=out.materials[0],perM2=50000/4.758;
  expect(optimizedIds).toEqual(['mel']);expect(fallback).toEqual([]);expect(out.optimized).toBe(true);
  expect(board.purchaseQuantity).toBe(2);expect(board.wasteQuantity).toBeCloseTo(2*2.6*1.83,6);expect(board.purchaseAmount).toBeCloseTo(perM2*2*2.6*1.83,6);
  expect(out.materials[1]).toEqual(budget.materials[1]);
  expect(out.services[0]).toMatchObject({quantity:2,amount:2000});expect(out.servicesTotals).toEqual({ARS:2000});
  expect(out.totals.purchase.ARS).toBeCloseTo(Math.round((perM2*2*2.6*1.83+1500)*100)/100,2);
 });
 it('sin formato o con piezas que no entran: queda la estimación por m² y se avisa',()=>{
  const none=optimizedBudget(budget,[]);expect(none.budget.materials).toEqual(budget.materials);expect(none.fallback[0].reason).toBe('no se pudo optimizar');expect(none.budget.optimized).toBe(false);
  const mel=optimizeOrder(plan([row('a'),row('g')],{a:geom(1830,1300),g:geom(2700,400)}),catalog,{trimMm:10,kerfMm:4,dimensionRule:'finished'}).materials;
  expect(optimizedBudget(budget,mel).fallback[0].reason).toBe('1 pieza no entra en la medida útil');
  const noFormat=optimizedBudget(budget,[{...mel[0],status:'no_format'}]);expect(noFormat.fallback[0].reason).toContain('falta el formato');expect(noFormat.budget.services).toEqual(budget.services);
 });
});
