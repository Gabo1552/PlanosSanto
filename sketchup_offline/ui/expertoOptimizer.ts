/** Bounded guillotine search with the supplied first-fit reference as incumbent.
 * See docs/validacion-0822/EXPERTO.md for provenance and unverified assumptions.
 * Board dimensions always come from the configured material, never its brand/name.
 */
import type {PackResult,SheetLayout,SheetPiece,SheetSpec} from './sheetOptimizer';

export const EXPERTO_SETTINGS=Object.freeze({kerfMm:4.4,trimMm:10,minSideMm:50,maxDepth:2,maxStackMm:90});
export type ExpertoError={code:'CONFIGURACION_EXPERTO'|'FORMATO_INVALIDO'|'ESPESOR_INVALIDO'|'MEDIDA_INVALIDA'|'LADO_MENOR_AL_MINIMO'|'PIEZA_NO_ENTRA'|'RESULTADO_INVALIDO';pieceId?:string;message:string};
export type ExpertoPackResult=PackResult&{
 errors:ExpertoError[];warnings:string[];sawMetres:number;estimatedSawSteps:number;
 /** Partition cuts in execution order, one array per sheet. Excludes the two trim steps. */
 partitionCutsMm:number[][];theoreticalMinimum:number;
 search?:{strategy:string;candidates:number;referenceBoards:number};
};
type Node={x:number;y:number;w:number;h:number;depth:number};
type OpenSheet={free:Node[];layout:SheetLayout;cuts:number[]};
type Fit={sheet:OpenSheet;index:number;w:number;h:number;rotated:boolean;horizontal?:boolean};
type Policy={split:'reference'|'horizontal'|'vertical'|'minarea'|'maxarea'|'lookahead';orientation:'normal'|'rotated'|'repeat'};
const REFERENCE:Policy={split:'reference',orientation:'normal'};
const EPS=1e-9;
const remainder=(v:number)=>{const rounded=Math.round(v*1e6)/1e6;return Math.abs(rounded)<1e-6?0:rounded;};
const empty=():ExpertoPackResult=>({sheets:[],oversize:[],errors:[],warnings:[],sawMetres:0,estimatedSawSteps:0,partitionCutsMm:[],theoreticalMinimum:0});
const positive=(v:number)=>Number.isFinite(v)&&v>0;

/** Refilado only on the leading side of each axis: ten mm total, not twenty. */
export const expertoUsable=(spec:Pick<SheetSpec,'lengthMm'|'widthMm'>)=>({length:spec.lengthMm-EXPERTO_SETTINGS.trimMm,width:spec.widthMm-EXPERTO_SETTINGS.trimMm});

function firstFit(sheets:OpenSheet[],piece:SheetPiece,policy:Policy,remaining:SheetPiece[]):Fit|null{
 const k=EXPERTO_SETTINGS.kerfMm;
 const options=[{w:piece.base,h:piece.height,rotated:false}];
 if(piece.rotate&&piece.base!==piece.height)options.push({w:piece.height,h:piece.base,rotated:true});
 for(const sheet of sheets){
  for(let index=0;index<sheet.free.length;index++){
   const node=sheet.free[index];
   if(!(piece.base+k<=node.w+EPS&&piece.height+k<=node.h+EPS)&&!(piece.rotate&&piece.height+k<=node.w+EPS&&piece.base+k<=node.h+EPS))continue;
   const fits=options.filter(p=>p.w+k<=node.w+EPS&&p.h+k<=node.h+EPS);
   if(policy.orientation==='rotated')fits.reverse();
   if(policy.orientation==='repeat')fits.sort((a,b)=>Math.floor((node.w+EPS)/(b.w+k))*Math.floor((node.h+EPS)/(b.h+k))-Math.floor((node.w+EPS)/(a.w+k))*Math.floor((node.h+EPS)/(a.h+k)));
   if(!fits.length)continue;
   if(policy.split!=='lookahead'){
    const fit=fits[0],a=remainder(node.h-fit.h-k),b=remainder(node.w-fit.w-k);
    const horizontal=policy.split==='reference'?undefined:policy.split==='minarea'?b*node.h<node.w*a:policy.split==='maxarea'?b*node.h>=node.w*a:policy.split==='horizontal';
    return {sheet,index,...fit,horizontal};
   }
   // Evaluate both orientations and both partitions against a bounded window of
   // pending physical pieces. This score guides a candidate, never the final plan.
   let best:Fit|null=null,bestScore=-Infinity;
   for(const fit of fits)for(const horizontal of [true,false]){
    const a=remainder(node.h-fit.h-k),b=remainder(node.w-fit.w-k);
    const regions=horizontal?[[node.w,a],[b,fit.h+k]]:[[b,node.h],[fit.w+k,a]];
    let score=0;
    if(node.depth<EXPERTO_SETTINGS.maxDepth)for(const next of remaining){
     if(regions.some(([w,h])=>(next.base+k<=w+EPS&&next.height+k<=h+EPS)||(next.rotate&&next.height+k<=w+EPS&&next.base+k<=h+EPS)))score+=next.base*next.height;
    }
    // Favor reusable principal space only after preserving the pending pieces.
    score+=regions[0][0]*regions[0][1]*1e-6;
    if(score>bestScore){bestScore=score;best={sheet,index,...fit,horizontal};}
   }
   return best;
  }
 }
 return null;
}
function place(fit:Fit,piece:SheetPiece){
 const {sheet,index,w,h,rotated}=fit,node=sheet.free[index],k=EXPERTO_SETTINGS.kerfMm;
 sheet.free.splice(index,1);
 sheet.layout.placements.push({id:piece.id,x:node.x,y:node.y,w,h,rotated});
 sheet.layout.usedMm2+=piece.base*piece.height;
 const auxH=remainder(node.h-h-k),auxV=remainder(node.w-w-k),canSplit=node.depth<EXPERTO_SETTINGS.maxDepth;
 // Append to the END, principal then residual. Inserting at the consumed node
 // changes first-fit order, layouts and the supplier-reference board count.
 if(fit.horizontal??(auxH>auxV)){
  if(auxH>0)sheet.cuts.push(node.w);
  if(canSplit&&auxH>k)sheet.free.push({x:node.x,y:node.y+h+k,w:node.w,h:auxH,depth:node.depth});
  if(auxV>0)sheet.cuts.push(h+k);
  if(canSplit&&auxV>k)sheet.free.push({x:node.x+w+k,y:node.y,w:auxV,h:h+k,depth:node.depth+1});
 }else{
  if(auxV>0)sheet.cuts.push(node.h);
  if(canSplit&&auxV>k)sheet.free.push({x:node.x+w+k,y:node.y,w:auxV,h:node.h,depth:node.depth});
  if(auxH>0)sheet.cuts.push(w+k);
  if(canSplit&&auxH>k)sheet.free.push({x:node.x,y:node.y+h+k,w:w+k,h:auxH,depth:node.depth+1});
 }
}

/** Build a whole strip before cutting it off. The cross cuts then share its
 * height, with at most one final trim per piece (three guillotine stages).
 * Transposition builds columns without changing the allowed grain axes.
 */
function stripPlan(pieces:SheetPiece[],length:number,width:number,vertical:boolean,maxBoards:number):OpenSheet[]|null{
 const k=EXPERTO_SETTINGS.kerfMm,trim=EXPERTO_SETTINGS.trimMm;
 const W=(vertical?width:length)+k,H=(vertical?length:width)+k;
 const sheets:OpenSheet[]=[];
 let pending=pieces.map((piece,index)=>({piece,index}));
 type Item={index:number;piece:SheetPiece;w:number;h:number;rotated:boolean};
 const makeOptions=(p:typeof pending[number]):Item[]=>{
  const w=vertical?p.piece.height:p.piece.base,h=vertical?p.piece.base:p.piece.height;
  return [{...p,w,h,rotated:false},...(p.piece.rotate&&w!==h?[{...p,w:h,h:w,rotated:true}]:[])];
 };
 const cachedOptions=pending.map(makeOptions);
 const options=(p:typeof pending[number])=>cachedOptions[p.index];
 while(pending.length){
  if(sheets.length>=maxBoards)return null;
  const sheet:OpenSheet={free:[],layout:{placements:[],usedMm2:0},cuts:[]};
  let y=0;
  while(pending.length){
   const heights=[...new Set(pending.slice(0,8).flatMap(p=>options(p).filter(o=>o.w+k<=W+EPS&&o.h+k<=H-y+EPS).map(o=>o.h)))];
   let best:Item[]=[],bestHeight=0,bestScore=-1;
   for(const height of heights){
    // Preserve the chosen order, preferring an exact-height fit within each piece.
    let used=0,area=0;
    const row:Item[]=[];
    for(const p of pending){
     let fit:Item|undefined;
     for(const o of options(p))if(o.h<=height+EPS&&o.w+k<=W-used+EPS&&(!fit||o.h>fit.h))fit=o;
     if(fit){row.push(fit);used+=fit.w+k;area+=fit.w*fit.h;}
    }
    // Net area per consumed strip height; ties keep the first deterministic seed.
    const score=area/(height+k);
    if(score>bestScore+EPS){best=row;bestHeight=height;bestScore=score;}
   }
   if(!best.length)break;
   if(remainder(H-y-bestHeight-k)>0)sheet.cuts.push(W);
   let x=0;
   for(const item of best){
    const {piece,w,h,rotated}=item;
    sheet.layout.placements.push({id:piece.id,x:trim+(vertical?y:x),y:trim+(vertical?x:y),w:vertical?h:w,h:vertical?w:h,rotated});
    sheet.layout.usedMm2+=piece.base*piece.height;
    if(remainder(W-x-w-k)>0)sheet.cuts.push(bestHeight+k);
    if(remainder(bestHeight-h)>0)sheet.cuts.push(w+k);
    x+=w+k;
   }
   const consumed=new Set(best.map(p=>p.index));
   pending=pending.filter(p=>!consumed.has(p.index));
   y+=bestHeight+k;
  }
  if(!sheet.layout.placements.length)return null;
  sheets.push(sheet);
 }
 return sheets;
}

/** A cut-stack pattern is physical geometry, not instance names. Include BOTH
 * dimensions, orientation and cut sequence, unlike the supplied Python signature.
 */
function pattern(sheet:OpenSheet){
 const rectangles=sheet.layout.placements.map(p=>[p.x,p.y,p.w,p.h,p.rotated]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify([rectangles,sheet.cuts]);
}

/** Atomic result: an invalid piece blocks the complete material/thickness batch.
 * `rotate` is per physical piece, already constrained by its grain/edge contract.
 * Never swap input axes or subtract edge thickness here.
 */
export function packExperto(pieces:SheetPiece[],spec:SheetSpec,thicknessMm=18):ExpertoPackResult{
 return pack(pieces,spec,thicknessMm,true);
}
/** Historical oracle for audits; the product always uses packExperto. */
export function packExpertoReference(pieces:SheetPiece[],spec:SheetSpec,thicknessMm=18):ExpertoPackResult{
 return pack(pieces,spec,thicknessMm,false);
}
function pack(pieces:SheetPiece[],spec:SheetSpec,thicknessMm:number,search:boolean):ExpertoPackResult{
 const result=empty(),{kerfMm:k,trimMm:trim,minSideMm}=EXPERTO_SETTINGS;
 if(spec.kerfMm!==k||spec.trimMm!==trim)result.errors.push({code:'CONFIGURACION_EXPERTO',message:'Experto requiere sierra de 4,4 mm y refilado de 10 mm total por eje.'});
 const {length,width}=expertoUsable(spec);
 if(!positive(length)||!positive(width)||!Number.isSafeInteger(Math.ceil(spec.lengthMm*spec.widthMm)))result.errors.push({code:'FORMATO_INVALIDO',message:'Configurá un formato de placa válido, mayor que el refilado.'});
 if(!positive(thicknessMm))result.errors.push({code:'ESPESOR_INVALIDO',message:'El espesor debe ser un número positivo para estimar las tandas de corte.'});
 if(result.errors.length)return result;
 for(const piece of pieces){
  let error:ExpertoError|undefined;
  if(!positive(piece.base)||!positive(piece.height)||!Number.isSafeInteger(Math.ceil(piece.base*piece.height)))error={code:'MEDIDA_INVALIDA',pieceId:piece.id,message:`${piece.detail||piece.id}: las medidas deben ser números positivos finitos.`};
  else if(Math.min(piece.base,piece.height)<minSideMm)error={code:'LADO_MENOR_AL_MINIMO',pieceId:piece.id,message:`${piece.detail||piece.id}: Experto requiere lados de al menos 50 mm.`};
  else if(!(piece.base<=length&&piece.height<=width)&&!(piece.rotate&&piece.height<=length&&piece.base<=width))error={code:'PIEZA_NO_ENTRA',pieceId:piece.id,message:`${piece.detail||piece.id}: no entra en la placa útil de ${length} × ${width} mm con la orientación permitida.`};
  if(error){result.errors.push(error);result.oversize.push(piece);}
 }
 // Never return partial board totals as a purchasable result.
 if(result.errors.length||!pieces.length)return result;
 const indexed=pieces.map((piece,index)=>({piece,index}));
 const orders={
  area:(p:SheetPiece)=>p.base*p.height,
  perimeter:(p:SheetPiece)=>p.base+p.height,
  long:(p:SheetPiece)=>Math.max(p.base,p.height),
  height:(p:SheetPiece)=>p.height,
  width:(p:SheetPiece)=>p.base,
 };
 const sort=(key:keyof typeof orders)=>[...indexed].sort((a,b)=>orders[key](b.piece)-orders[key](a.piece)||Math.max(b.piece.base,b.piece.height)-Math.max(a.piece.base,a.piece.height)||a.index-b.index).map(p=>p.piece);
 const run=(ordered:SheetPiece[],policy:Policy,maxBoards=Infinity):OpenSheet[]|null=>{
  const plan:OpenSheet[]=[];
  for(let i=0;i<ordered.length;i++){
   const piece=ordered[i],remaining=policy.split==='lookahead'?ordered.slice(i+1,i+17):[];
   let fit=firstFit(plan,piece,policy,remaining);
   if(!fit){
    if(plan.length>=maxBoards)return null;
    const sheet:OpenSheet={free:[{x:trim,y:trim,w:length+k,h:width+k,depth:0}],layout:{placements:[],usedMm2:0},cuts:[]};
    plan.push(sheet);fit=firstFit([sheet],piece,policy,remaining);
   }
   // Validation guarantees that either permitted orientation fits a fresh sheet.
   if(!fit)return null;
   place(fit,piece);
  }
  return plan;
 };
 const baseline=run(sort('area'),REFERENCE);
 if(!baseline){result.errors.push({code:'RESULTADO_INVALIDO',message:'No se pudo colocar una pieza validada; no se emitió un total parcial.'});return result;}
 let sheets:OpenSheet[]=baseline;
 const referenceBoards=sheets.length;
 let strategy='reference',candidates=1;
 const score=(plan:OpenSheet[])=>[plan.length,plan.reduce((n,s)=>n+s.cuts.reduce((a,b)=>a+b,0),0),plan.reduce((n,s)=>n+s.cuts.length,0)];
 let bestScore=score(sheets);
 const consider=(candidate:OpenSheet[]|null,name:string)=>{
  candidates++;if(!candidate)return;
  const candidateScore=score(candidate);
  const differing=candidateScore.findIndex((value,i)=>Math.abs(value-bestScore[i])>1e-6);
  if(differing>=0&&candidateScore[differing]<bestScore[differing]){sheets=candidate;bestScore=candidateScore;strategy=name;}
 };
 if(search)for(const order of Object.keys(orders) as (keyof typeof orders)[]){
  const ordered=sort(order);
  for(const split of ['reference','horizontal','vertical','minarea','maxarea','lookahead'] as const)for(const orientation of ['normal','rotated','repeat'] as const){
   if(order==='area'&&split==='reference'&&orientation==='normal')continue;
   if(!pieces.some(p=>p.rotate)&&orientation!=='normal')continue;
   // Lookahead itself considers both orientations; avoid duplicate candidates.
   if(split==='lookahead'&&orientation!=='normal')continue;
   consider(run(ordered,{split,orientation},sheets.length),`${order}/${split}/${orientation}`);
  }
  for(const vertical of [false,true])consider(stripPlan(ordered,length,width,vertical,sheets.length),`${order}/strips/${vertical?'vertical':'horizontal'}`);
 }
 if(search)result.search={strategy,candidates,referenceBoards};
 const netArea=pieces.reduce((sum,p)=>sum+p.base*p.height,0),lower=Math.max(1,Math.ceil(netArea/(length*width)-EPS));
 if(!Number.isFinite(netArea)||sheets.length<lower){result.errors.push({code:'RESULTADO_INVALIDO',message:'El resultado no cumple el mínimo teórico de superficie. Revisá las medidas.'});return result;}
 result.theoreticalMinimum=lower;
 result.sheets=sheets.map(s=>s.layout);
 result.partitionCutsMm=sheets.map(s=>s.cuts);
 result.sawMetres=Math.round(sheets.reduce((sum,s)=>sum+2*length+2*width+s.cuts.reduce((n,v)=>n+v,0),0)/1000*1e4)/1e4;
 const stackSize=Math.max(1,Math.min(sheets.length,Math.floor(EXPERTO_SETTINGS.maxStackMm/thicknessMm))),patterns=new Map<string,{count:number;steps:number}>();
 for(const sheet of sheets){const key=pattern(sheet),prev=patterns.get(key);if(prev)prev.count++;else patterns.set(key,{count:1,steps:2+sheet.cuts.length});}
 result.estimatedSawSteps=Array.from(patterns.values()).reduce((sum,p)=>sum+Math.ceil(p.count/stackSize)*p.steps,0);
 if(sheets.length>lower*1.35)result.warnings.push('La cantidad supera en más del 35 % el mínimo por superficie; verificá el resultado con Experto. Las piezas grandes pueden requerir esas placas.');
 const hasLarge=pieces.some(p=>p.base>length/2&&p.height>width/2);
 if(!hasLarge&&netArea/(sheets.length*spec.lengthMm*spec.widthMm)<0.55)result.warnings.push('Aprovechamiento menor al 55 %: revisá orientación y medidas con Experto antes de comprar.');
 return result;
}
