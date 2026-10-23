// Optimización estimada de placas para el pedido a maderera (0.8.19). Nesting 2D guillotina escrito para Planos Santo:
// todos los cortes van de lado a lado de un rectángulo libre, como en una seccionadora. Determinística: mismo pedido,
// mismas placas. Corre en la UI porque filas, geometría y biblioteca ya están acá: se recalcula en vivo con cada cambio,
// aun con piezas con problemas, sin ida y vuelta a Ruby. Es una estimación: la maderera puede optimizar distinto.
import {orderSize,rowThickness,type CutProfile} from './workshopRules';
import type {Catalog,CatalogItem,OrderPlan} from './WorkshopPanel';

/** Pieza a ubicar: base a lo largo del largo de la placa (la veta), altura a lo ancho. */
export type SheetPiece={id:string;detail:string;base:number;height:number;rotate:boolean};
export type SheetSpec={lengthMm:number;widthMm:number;trimMm:number;kerfMm:number};
/** Posición en mm sobre la placa entera (incluye el refilado): x a lo largo, y a lo ancho. */
export type Placement={id:string;x:number;y:number;w:number;h:number;rotated:boolean};
export type SheetLayout={placements:Placement[];usedMm2:number};
export type PackResult={sheets:SheetLayout[];oversize:SheetPiece[]};
type Free={x:number;y:number;w:number;h:number};
type Split='shorter'|'longer'|'minArea'|'maxArea';
const EPS=0.01;

const sorts:((a:SheetPiece,b:SheetPiece)=>number)[]=[
 (a,b)=>b.base*b.height-a.base*a.height,
 (a,b)=>Math.max(b.base,b.height)-Math.max(a.base,a.height),
 (a,b)=>b.base+b.height-(a.base+a.height),
 (a,b)=>b.base-a.base,
 (a,b)=>b.height-a.height,
];
// Desempate fijo para que el orden no dependa del motor: mayor base, mayor altura, id.
const tie=(a:SheetPiece,b:SheetPiece)=>b.base-a.base||b.height-a.height||(a.id<b.id?-1:a.id>b.id?1:0);
/** Medida útil después del refilado de cada lado. */
export const usable=(spec:SheetSpec)=>({length:spec.lengthMm-2*spec.trimMm,width:spec.widthMm-2*spec.trimMm});
/** Orientaciones posibles dentro de la medida útil: sin girar y, si se permite, girada. */
function orientations(piece:SheetPiece,spec:SheetSpec){
 const {length,width}=usable(spec),out:{w:number;h:number;rotated:boolean}[]=[];
 if(piece.base<=length+EPS&&piece.height<=width+EPS)out.push({w:piece.base,h:piece.height,rotated:false});
 if(piece.rotate&&piece.base!==piece.height&&piece.height<=length+EPS&&piece.base<=width+EPS)out.push({w:piece.height,h:piece.base,rotated:true});
 return out;
}
function splitFree(free:Free,w:number,h:number,rule:Split,min:number):Free[]{
 // Cada pieza ocupa su medida más un kerf; el rectángulo libre inicial también suma un kerf, así el último corte no se cobra en el borde.
 const right=free.w-w,top=free.h-h;
 const horizontal=rule==='shorter'?right<=top:rule==='longer'?right>top:rule==='minArea'?right*free.h<free.w*top:right*free.h>=free.w*top;
 // horizontal: el corte largo corre a lo largo de la placa sobre la pieza (arriba queda todo el ancho del libre).
 const parts=horizontal?[{x:free.x+w,y:free.y,w:right,h},{x:free.x,y:free.y+h,w:free.w,h:top}]:[{x:free.x+w,y:free.y,w:right,h:free.h},{x:free.x,y:free.y+h,w,h:top}];
 // Un libre donde no entra ni la pieza más chica se descarta: menos rectángulos para recorrer.
 return parts.filter(part=>part.w>=min-EPS&&part.h>=min-EPS);
}
type Open={free:Free[];layout:SheetLayout};
type Fit={sheet:Open;index:number;w:number;h:number;rotated:boolean;score:number;short:number};
/** Best area fit en todas las placas abiertas; desempata el sobrante más corto y, después, la primera encontrada (determinístico). */
function bestFit(sheets:Open[],options:{w:number;h:number;rotated:boolean}[],k:number){
 let best:Fit|null=null;
 for(const sheet of sheets)sheet.free.forEach((free,index)=>{for(const o of options){const w=o.w+k,h=o.h+k;if(w>free.w+EPS||h>free.h+EPS)continue;
  const score=free.w*free.h-w*h,short=Math.min(free.w-w,free.h-h);if(!best||score<best.score-EPS||(Math.abs(score-best.score)<=EPS&&short<best.short-EPS))best={sheet,index,w,h,rotated:o.rotated,score,short};}});
 return best as Fit|null;
}
function guillotine(pieces:SheetPiece[],spec:SheetSpec,rule:Split):SheetLayout[]{
 const {length,width}=usable(spec),k=spec.kerfMm,sheets:Open[]=[],min=Math.min(...pieces.map(p=>Math.min(p.base,p.height)))+k;
 for(const piece of pieces){
  const options=orientations(piece,spec);
  let fit=bestFit(sheets,options,k);
  if(!fit){const sheet:Open={free:[{x:spec.trimMm,y:spec.trimMm,w:length+k,h:width+k}],layout:{placements:[],usedMm2:0}};sheets.push(sheet);fit=bestFit([sheet],options,k);}
  if(!fit)continue;
  const free=fit.sheet.free[fit.index];
  fit.sheet.layout.placements.push({id:piece.id,x:free.x,y:free.y,w:fit.w-k,h:fit.h-k,rotated:fit.rotated});fit.sheet.layout.usedMm2+=piece.base*piece.height;
  fit.sheet.free.splice(fit.index,1,...splitFree(free,fit.w,fit.h,rule,min));
 }
 return sheets.map(sheet=>sheet.layout);
}
/** Franjas a lo ancho (dos etapas): primero cortes de lado a lado a lo largo, después cada franja en trozos. */
function strips(pieces:SheetPiece[],spec:SheetSpec):SheetLayout[]{
 const {length,width}=usable(spec),k=spec.kerfMm;
 type Strip={y:number;h:number;used:number};type Sheet={strips:Strip[];top:number;layout:SheetLayout};const sheets:Sheet[]=[];
 for(const piece of pieces){
  const o=orientations(piece,spec).sort((a,b)=>a.h-b.h)[0];if(!o)continue;const w=o.w+k,h=o.h+k;
  let best:{sheet:Sheet;strip:Strip;waste:number}|null=null;
  for(const sheet of sheets)for(const strip of sheet.strips){if(h<=strip.h+EPS&&strip.used+w<=length+k+EPS){const waste=strip.h-h;if(!best||waste<best.waste-EPS)best={sheet,strip,waste};}}
  if(!best){let sheet=sheets.find(s=>s.top+h<=width+k+EPS);if(!sheet){sheet={strips:[],top:0,layout:{placements:[],usedMm2:0}};sheets.push(sheet);}
   const strip={y:sheet.top,h,used:0};sheet.strips.push(strip);sheet.top+=h;best={sheet,strip,waste:0};}
  const {sheet,strip}=best;sheet.layout.placements.push({id:piece.id,x:spec.trimMm+strip.used,y:spec.trimMm+strip.y,w:o.w,h:o.h,rotated:o.rotated});strip.used+=w;sheet.layout.usedMm2+=piece.base*piece.height;
 }
 return sheets.map(sheet=>sheet.layout);
}
const stripHeight=(piece:SheetPiece,spec:SheetSpec)=>Math.min(...orientations(piece,spec).map(o=>o.h));
/** Menos placas; a igualdad, la última placa más vacía (queda un retazo mayor); después, el primer intento. */
const better=(a:SheetLayout[],b:SheetLayout[])=>a.length!==b.length?a.length<b.length:(a[a.length-1]?.usedMm2??0)<(b[b.length-1]?.usedMm2??0)-EPS;
/** Ubica las piezas en placas iguales probando varios órdenes (de mayor a menor) y reglas de corte, y se queda con el mejor. */
export function packSheets(pieces:SheetPiece[],spec:SheetSpec):PackResult{
 const {length,width}=usable(spec);
 if(length<=0||width<=0)return {sheets:[],oversize:[...pieces]};
 const fits=pieces.filter(piece=>orientations(piece,spec).length),oversize=pieces.filter(piece=>!orientations(piece,spec).length);
 let best:SheetLayout[]|null=null;
 for(const sort of sorts){
  const ordered=[...fits].sort((a,b)=>sort(a,b)||tie(a,b));
  for(const rule of ['shorter','longer','minArea','maxArea'] as Split[]){const run=guillotine(ordered,spec,rule);if(!best||better(run,best))best=run;}
  const run=strips([...fits].sort((a,b)=>stripHeight(b,spec)-stripHeight(a,spec)||sort(a,b)||tie(a,b)),spec);if(!best||better(run,best))best=run;
 }
 return {sheets:best||[],oversize};
}

// --- Del pedido a la optimización por placa --------------------------------------------------------------------------
export type LegendEntry={key:string;base:number;height:number;count:number;details:string[]};
export type OversizePiece={id:string;detail:string;base:number;height:number};
/** Placas con la misma distribución se dibujan una vez: sheetNumbers dice cuáles son (1, 2…). */
export type LayoutGroup={sheetNumbers:number[];layout:SheetLayout};
export type MaterialOptimization={materialId:string;name:string;sku:string;thicknessMm:number|null;grain:boolean|null;lengthMm:number|null;widthMm:number|null;trimMm:number;kerfMm:number;
 status:'ok'|'no_format'|'no_usable';pieces:number;sheets:SheetLayout[];layouts:LayoutGroup[];legend:LegendEntry[];keys:Record<string,string>;oversize:OversizePiece[];netM2:number;boughtM2:number;utilization:number|null;price:CatalogItem['price']};
export type OrderOptimization={materials:MaterialOptimization[];skipped:{noBoard:number;noSize:number;notRectangular:number};trimMm:number;kerfMm:number};
const measured=(value:number|null|undefined):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
/** Letras de leyenda: A…Z, AA, AB… */
export function legendKey(index:number){let out='',n=index;do{out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)-1;}while(n>=0);return out;}
const size=(value:number)=>Math.round(value*10)/10;
/** Optimiza cada placa del pedido (material y espesor de la ficha) con el refilado y el kerf del perfil en uso. */
export function optimizeOrder(plan:Pick<OrderPlan,'rows'|'geometry'>,catalog:Catalog,profile:CutProfile&{trimMm:number;kerfMm:number}):OrderOptimization{
 const groups=new Map<string,{board:CatalogItem;pieces:SheetPiece[];thicknesses:Set<number>}>(),skipped={noBoard:0,noSize:0,notRectangular:0};
 for(const row of plan.rows){
  if(!row.include)continue;const geometry=plan.geometry[row.id],board=catalog.items.find(item=>item.id===row.materialId&&item.kind==='sheet');
  if(!board){skipped.noBoard++;continue;}
  if(geometry&&!geometry.rectangular){skipped.notRectangular++;continue;}
  const cut=geometry?orderSize(row,geometry,catalog,profile):null;if(!cut||!(cut[0]>0)||!(cut[1]>0)){skipped.noSize++;continue;}
  const group=groups.get(board.id)??{board,pieces:[],thicknesses:new Set<number>()};group.pieces.push({id:row.id,detail:row.detail,base:cut[0],height:cut[1],rotate:row.grainPolicy==='rotate'&&board.grain===false});groups.set(board.id,group);
  // 0.8.20 (biblioteca v4, toque mínimo): la placa no tiene «el» espesor; se informa el real de las piezas.
  const thickness=geometry?rowThickness(row,geometry):null;if(thickness!==null)group.thicknesses.add(Math.round(thickness*100)/100);
 }
 const materials=[...groups.values()].map(({board,pieces,thicknesses}):MaterialOptimization=>{
  const netM2=pieces.reduce((sum,p)=>sum+p.base*p.height,0)/1e6;
  // Mismas medidas (al décimo de mm) comparten letra; la leyenda va de la pieza más grande a la más chica.
  const bySize=new Map<string,LegendEntry>();for(const p of [...pieces].sort((a,b)=>b.base*b.height-a.base*a.height||tie(a,b))){const id=`${size(p.base)}x${size(p.height)}`,entry=bySize.get(id)??{key:'',base:size(p.base),height:size(p.height),count:0,details:[]};entry.count++;if(!entry.details.includes(p.detail))entry.details.push(p.detail);bySize.set(id,entry);}
  const legend=[...bySize.values()].map((entry,i)=>({...entry,key:legendKey(i)})),keys=Object.fromEntries(pieces.map(p=>[p.id,legend.find(e=>e.base===size(p.base)&&e.height===size(p.height))!.key]));
  const base={materialId:board.id,name:board.name.trim()||'Sin nombre',sku:board.sku.trim(),thicknessMm:thicknesses.size===1?[...thicknesses][0]:board.thicknessMm,grain:board.grain,lengthMm:board.lengthMm,widthMm:board.widthMm,trimMm:profile.trimMm,kerfMm:profile.kerfMm,pieces:pieces.length,legend,keys,netM2,price:board.price};
  if(!measured(board.lengthMm)||!measured(board.widthMm))return {...base,status:'no_format',sheets:[],layouts:[],oversize:[],boughtM2:0,utilization:null};
  const spec={lengthMm:board.lengthMm,widthMm:board.widthMm,trimMm:profile.trimMm,kerfMm:profile.kerfMm},{length,width}=usable(spec);
  const result=packSheets(pieces,spec),boughtM2=result.sheets.length*board.lengthMm*board.widthMm/1e6;
  const layouts:LayoutGroup[]=[];result.sheets.forEach((layout,i)=>{const sign=signature(layout,keys),same=layouts.find(group=>signature(group.layout,keys)===sign);if(same)same.sheetNumbers.push(i+1);else layouts.push({sheetNumbers:[i+1],layout});});
  const placedNet=result.sheets.reduce((sum,s)=>sum+s.usedMm2,0)/1e6;
  return {...base,status:length>0&&width>0?'ok':'no_usable',sheets:result.sheets,layouts,oversize:result.oversize.map(p=>({id:p.id,detail:p.detail,base:p.base,height:p.height})),boughtM2,utilization:boughtM2>0?placedNet/boughtM2:null};
 });
 return {materials,skipped,trimMm:profile.trimMm,kerfMm:profile.kerfMm};
}
const signature=(layout:SheetLayout,keys:Record<string,string>)=>layout.placements.map(p=>`${keys[p.id]}@${Math.round(p.x)},${Math.round(p.y)}${p.rotated?'r':''}`).join(';');
export type SheetCost={amount:number|null;currency:string|null;status:'current_price'|'stale_price'|'future_price'|'price_pending'};
/** Costo de las placas a comprar con el precio de la ficha: por placa o por m² comprado. Vigente hasta `ageDays` días. */
export function sheetCost(material:Pick<MaterialOptimization,'sheets'|'boughtM2'|'price'>,today:Date,ageDays=90):SheetCost{
 const price=material.price;if(!price||!(price.unit==='placa'||price.unit==='m2')||!material.sheets.length)return {amount:null,currency:price?.currency||null,status:'price_pending'};
 const age=Math.round((Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-Date.parse(`${price.date}T00:00:00Z`))/86400000);
 const status=!Number.isFinite(age)?'price_pending':age<0?'future_price':age>ageDays?'stale_price':'current_price';
 return {amount:status==='price_pending'?null:price.unit==='placa'?material.sheets.length*price.amount:material.boughtM2*price.amount,currency:price.currency,status};
}
