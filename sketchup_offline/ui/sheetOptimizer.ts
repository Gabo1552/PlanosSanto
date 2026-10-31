// Optimización estimada de placas para la maderera (0.8.19; por placa del proyecto desde 0.8.20). Nesting 2D guillotina
// escrito para Planos Santo: todos los cortes van de lado a lado de un rectángulo libre, como en una seccionadora.
// Determinística: mismas piezas, mismas placas. Corre en la UI con las filas, la geometría y la biblioteca que manda Ruby:
// se recalcula en vivo al cambiar disco, refilado o giro. Es una estimación: la maderera puede optimizar distinto.
import {packExperto} from './expertoOptimizer';
import {grainBaseBlock,rotationBlock,rowDimensions} from './workshopRules';
import type {Catalog,CatalogItem,OrderPlan,OrderRow} from './WorkshopPanel';

/** Pieza a ubicar: base a lo largo del largo de la placa (la veta), altura a lo ancho. Con veta, la base es la medida de la
 * pieza a lo largo de SU veta (0.8.26, Grain): así la veta de la pieza corre con la de la placa y no se gira. */
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

// --- De las placas del proyecto a la optimización --------------------------------------------------------------------
/** Corte de la seccionadora: disco (kerf), refilado por lado y si se giran las piezas que lo permiten. */
export type OptimizationMethod='general'|'experto';
export type CutSettings={kerfMm:number;trimMm:number;allowRotate:boolean;method?:OptimizationMethod};
/** Una placa del proyecto (material + espesor real de la pieza), como la arma Ruby (SupplierOrder#boards). */
export type BoardGroup={key:string;materialId:string;name:string;sku:string;thicknessMm:number;rowIds:string[]};
export type LegendEntry={key:string;base:number;height:number;count:number;details:string[]};
export type OversizePiece={id:string;detail:string;base:number;height:number};
/** Placas con la misma distribución se dibujan una vez: sheetNumbers dice cuáles son (1, 2…). */
export type LayoutGroup={sheetNumbers:number[];layout:SheetLayout};
export type MaterialOptimization={key:string;materialId:string;name:string;sku:string;thicknessMm:number;grain:boolean|null;lengthMm:number|null;widthMm:number|null;trimMm:number;kerfMm:number;
 trimMode?:'total'|'per_side';method?:OptimizationMethod;errors?:string[];warnings?:string[];sawMetres?:number;estimatedSawSteps?:number;
 status:'ok'|'no_format'|'no_usable'|'blocked';pieces:number;unsized:number;rotatable:number;sheets:SheetLayout[];layouts:LayoutGroup[];legend:LegendEntry[];keys:Record<string,string>;oversize:OversizePiece[];netM2:number;boughtM2:number;utilization:number|null};
export type OrderOptimization={materials:MaterialOptimization[];trimMm:number;kerfMm:number;allowRotate:boolean};
const measured=(value:number|null|undefined):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
/** Letras de leyenda: A…Z, AA, AB… */
export function legendKey(index:number){let out='',n=index;do{out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)-1;}while(n>=0);return out;}
const size=(value:number)=>Math.round(value*10)/10;
/** Se gira solo si se pidió, la placa no tiene veta y los cantos son simétricos: la misma regla que el TXT (rota 1). */
export const canRotate=(row:Pick<OrderRow,'edgeMap'>,board:CatalogItem,cut:Pick<CutSettings,'allowRotate'|'method'>)=>cut.method==='experto'?board.grain===false:cut.allowRotate&&rotationBlock(row,board)===null;
/**
 * Optimiza cada placa del proyecto con el disco y el refilado elegidos. Las medidas son las de las piezas (las mismas
 * del TXT); el kerf y el refilado solo cuentan para ubicarlas en la placa.
 */
export function optimizeBoards(plan:Pick<OrderPlan,'rows'|'geometry'>,catalog:Catalog,boards:BoardGroup[],cut:CutSettings):OrderOptimization{
 const expert=cut.method==='experto';
 const rows=new Map(plan.rows.map(row=>[row.id,row]));
 const materials=boards.map((group):MaterialOptimization|null=>{
  const board=catalog.items.find(item=>item.id===group.materialId&&item.kind==='sheet');if(!board)return null;
  const pieces:SheetPiece[]=[],grainErrors:string[]=[];let unsized=0;
  for(const id of group.rowIds){const row=rows.get(id),geometry=plan.geometry[id],dims=row&&geometry?rowDimensions(row,geometry):null;
   if(!row||!dims||!(dims[0]>0)||!(dims[1]>0)){unsized++;continue;}
   // Defensa: una base que no sigue la veta de la pieza no se ubica (Ruby tampoco deja salir su TXT).
   const grain=grainBaseBlock(row,geometry,board);if(grain){unsized++;grainErrors.push(`${row.detail||id}: ${grain}`);continue;}
   pieces.push({id,detail:row.detail,base:dims[0],height:dims[1],rotate:canRotate(row,board,cut)});}
  const netM2=pieces.reduce((sum,p)=>sum+p.base*p.height,0)/1e6;
  // Mismas medidas (al décimo de mm) comparten letra; la leyenda va de la pieza más grande a la más chica.
  const bySize=new Map<string,LegendEntry>();for(const p of [...pieces].sort((a,b)=>b.base*b.height-a.base*a.height||tie(a,b))){const id=`${size(p.base)}x${size(p.height)}`,entry=bySize.get(id)??{key:'',base:size(p.base),height:size(p.height),count:0,details:[]};entry.count++;if(!entry.details.includes(p.detail))entry.details.push(p.detail);bySize.set(id,entry);}
  const legend=[...bySize.values()].map((entry,i)=>({...entry,key:legendKey(i)})),keys=Object.fromEntries(pieces.map(p=>[p.id,legend.find(e=>e.base===size(p.base)&&e.height===size(p.height))!.key]));
  const base={key:group.key,materialId:board.id,name:group.name,sku:group.sku,thicknessMm:group.thicknessMm,grain:board.grain,lengthMm:board.lengthMm,widthMm:board.widthMm,trimMm:cut.trimMm,kerfMm:cut.kerfMm,trimMode:expert?'total' as const:'per_side' as const,method:cut.method??'general',
   pieces:pieces.length,unsized,rotatable:pieces.filter(p=>p.rotate).length,legend,keys,netM2};
  if(!measured(board.lengthMm)||!measured(board.widthMm))return {...base,status:'no_format',sheets:[],layouts:[],oversize:[],boughtM2:0,utilization:null};
  const spec={lengthMm:board.lengthMm,widthMm:board.widthMm,trimMm:cut.trimMm,kerfMm:cut.kerfMm},{length,width}=expert?{length:board.lengthMm-cut.trimMm,width:board.widthMm-cut.trimMm}:usable(spec);
  const expertResult=expert?packExperto(pieces,spec,group.thicknessMm):undefined;
  const result=expertResult??packSheets(pieces,spec);
  if(expert&&unsized)result.sheets=[];
  const boughtM2=result.sheets.length*board.lengthMm*board.widthMm/1e6;
  const layouts:LayoutGroup[]=[];result.sheets.forEach((layout,i)=>{const sign=signature(layout,keys),same=layouts.find(group=>signature(group.layout,keys)===sign);if(same)same.sheetNumbers.push(i+1);else layouts.push({sheetNumbers:[i+1],layout});});
  const placedNet=result.sheets.reduce((sum,s)=>sum+s.usedMm2,0)/1e6;
  const errors=[...grainErrors,...(expertResult?.errors.map(e=>e.message)??[])];
  return {...base,errors:expertResult||errors.length?errors:undefined,warnings:expertResult?.warnings,sawMetres:expertResult?.sawMetres,estimatedSawSteps:expertResult?.estimatedSawSteps,status:length<=0||width<=0?'no_usable':expert&&(unsized>0||!!expertResult?.errors.length)?'blocked':'ok',sheets:result.sheets,layouts,oversize:result.oversize.map(p=>({id:p.id,detail:p.detail,base:p.base,height:p.height})),boughtM2,utilization:boughtM2>0?placedNet/boughtM2:null};
 }).filter((m):m is MaterialOptimization=>m!==null);
 return {materials,trimMm:cut.trimMm,kerfMm:cut.kerfMm,allowRotate:cut.allowRotate};
}
const signature=(layout:SheetLayout,keys:Record<string,string>)=>layout.placements.map(p=>`${keys[p.id]}@${p.x.toFixed(6)},${p.y.toFixed(6)},${p.w.toFixed(6)},${p.h.toFixed(6)}${p.rotated?'r':''}`).join(';');
