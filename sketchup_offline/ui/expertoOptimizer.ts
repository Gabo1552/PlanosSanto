/** Experto 405: first-fit guillotine from the supplied reference, not a supplier API.
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
};
type Node={x:number;y:number;w:number;h:number;depth:number};
type OpenSheet={free:Node[];layout:SheetLayout;cuts:number[]};
type Fit={sheet:OpenSheet;index:number;w:number;h:number;rotated:boolean};
const EPS=1e-9;
const remainder=(v:number)=>{const rounded=Math.round(v*1e6)/1e6;return Math.abs(rounded)<1e-6?0:rounded;};
const empty=():ExpertoPackResult=>({sheets:[],oversize:[],errors:[],warnings:[],sawMetres:0,estimatedSawSteps:0,partitionCutsMm:[],theoreticalMinimum:0});
const positive=(v:number)=>Number.isFinite(v)&&v>0;

/** Refilado only on the leading side of each axis: ten mm total, not twenty. */
export const expertoUsable=(spec:Pick<SheetSpec,'lengthMm'|'widthMm'>)=>({length:spec.lengthMm-EXPERTO_SETTINGS.trimMm,width:spec.widthMm-EXPERTO_SETTINGS.trimMm});

function firstFit(sheets:OpenSheet[],piece:SheetPiece):Fit|null{
 const k=EXPERTO_SETTINGS.kerfMm;
 for(const sheet of sheets){
  for(let index=0;index<sheet.free.length;index++){
   const node=sheet.free[index];
   if(piece.base+k<=node.w+EPS&&piece.height+k<=node.h+EPS)return {sheet,index,w:piece.base,h:piece.height,rotated:false};
   if(piece.rotate&&piece.height+k<=node.w+EPS&&piece.base+k<=node.h+EPS)return {sheet,index,w:piece.height,h:piece.base,rotated:true};
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
 if(auxH>auxV){
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
 const ordered=pieces.map((piece,index)=>({piece,index})).sort((a,b)=>b.piece.base*b.piece.height-a.piece.base*a.piece.height||Math.max(b.piece.base,b.piece.height)-Math.max(a.piece.base,a.piece.height)||a.index-b.index);
 const sheets:OpenSheet[]=[];
 for(const {piece} of ordered){
  let fit=firstFit(sheets,piece);
  if(!fit){
   const sheet:OpenSheet={free:[{x:trim,y:trim,w:length+k,h:width+k,depth:0}],layout:{placements:[],usedMm2:0},cuts:[]};
   sheets.push(sheet);fit=firstFit([sheet],piece);
  }
  if(!fit){result.errors.push({code:'RESULTADO_INVALIDO',pieceId:piece.id,message:'No se pudo colocar una pieza validada; no se emitió un total parcial.'});return result;}
  place(fit,piece);
 }
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
