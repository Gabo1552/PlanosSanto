// Reglas puras de la biblioteca y de la maderera. Ruby sigue siendo la validación que habilita exportar; acá solo se
// presenta. Desde 0.8.20 la maderera es la optimización por placa del proyecto y un TXT por placa: las reglas del pedido
// editable pieza por pieza (vista 2D, aplicar a otras, problemas en vivo) dejaron de mostrarse y se quitaron de la UI.
import {mm} from '../../lib/model';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from './WorkshopPanel';

/** Origen del material de una cara, sin códigos internos. */
export const faceOrigin:Record<string,string>={painted_face:'Cara pintada',inherited_instance:'Heredado',unpainted:'Sin pintar'};
export const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const metres=new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3});
/** Metros lineales con tres decimales y coma decimal (1.234,567). */
export const formatMetres=(value:number)=>metres.format(value);
/** «Nombre · SKU · 18 mm» sin huecos cuando falta un dato. Los cantos muestran su ancho. */
export function materialLabel(item:Pick<CatalogItem,'name'|'sku'|'kind'|'thicknessMm'|'widthMm'>){
 const size=item.kind==='edge'?(item.widthMm===null?'ancho sin cargar':`ancho ${mm(item.widthMm)} mm`):(item.thicknessMm===null?'espesor sin cargar':`${mm(item.thicknessMm)} mm`);
 return `${item.name.trim()||'Sin nombre'} · ${item.sku.trim()||'Sin SKU'} · ${size}`;
}
const measured=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)&&value>0;
/** Datos que le faltan a una ficha para usarla en un pedido (mismo criterio que CatalogStore.missing). Placa: SKU, espesor, largo, ancho y veta. Canto: ancho. */
export function catalogMissing(item:Pick<CatalogItem,'kind'|'sku'|'thicknessMm'|'widthMm'|'lengthMm'|'grain'>):string[]{
 if(item.kind==='sheet')return [...(item.sku.trim()?[]:['SKU']),...(measured(item.thicknessMm)?[]:['espesor']),...(measured(item.lengthMm)?[]:['largo']),...(measured(item.widthMm)?[]:['ancho']),...(item.grain===true||item.grain===false?[]:['veta'])];
 if(item.kind==='edge')return measured(item.widthMm)?[]:['ancho'];
 return ['tipo'];
}
export const catalogComplete=(item:Parameters<typeof catalogMissing>[0])=>catalogMissing(item).length===0;
/** «Ficha completa» o «Falta: SKU, veta». */
export const completeness=(item:Parameters<typeof catalogMissing>[0])=>{const missing=catalogMissing(item);return missing.length?`Falta: ${missing.join(', ')}`:'Ficha completa';};
/** Base y altura de la pieza, las mismas que van al TXT: las de corte si se cargaron explícitas, si no las del modelo según los ejes. */
export function rowDimensions(row:Pick<OrderRow,'axes'|'dimensionRule'|'cutBase'|'cutHeight'>,geometry:Pick<Geometry,'lengths'>):[number,number]|null{
 if(row.dimensionRule==='explicit_cut')return row.cutBase&&row.cutHeight&&row.cutBase>0&&row.cutHeight>0?[row.cutBase,row.cutHeight]:null;
 return row.axes?[geometry.lengths[row.axes[0]],geometry.lengths[row.axes[1]]]:null;
}
/** Motivo por el que no se puede girar la pieza (rota 1), o null: solo placas sin veta y con cantos simétricos. */
export function rotationBlock(row:Pick<OrderRow,'edgeMap'>,board:CatalogItem|undefined){
 if(board&&board.grain!==false)return board.grain?'La placa tiene veta: mantené la orientación (rota 0).':'La ficha de la placa no tiene la veta cargada: mantené la orientación (rota 0).';
 if(new Set(row.edgeMap).size>1)return 'Los cantos son asimétricos: mantené la orientación (rota 0).';
 return null;
}
export type EdgeTotal={id:string;label:string;sku:string;metres:number;sides:number;pieces:number};
/** Metros de canto por producto en todo el proyecto, con la misma regla que Ruby: lados 0-1 suman la base y 2-3 la altura de la pieza. */
export function edgeTotals(plan:Pick<OrderPlan,'rows'|'geometry'>,catalog:Catalog){
 const lines=new Map<string,EdgeTotal>(),pieceIds=new Map<string,Set<string>>();let missing=0,unassigned=0;
 for(const row of plan.rows){
  if(!row.include||!row.edgeMap.some(v=>v>0))continue;
  const geometry=plan.geometry[row.id],size=geometry&&rowDimensions(row,geometry);
  if(!size){missing++;continue;}
  let lacking=false;
  row.edgeMap.forEach((role,index)=>{
   if(role<1)return;const id=role===1?row.principalId:row.secondaryId,item=id?catalog.items.find(i=>i.id===id):undefined;
   if(!id||!item){lacking=true;return;}
   const line=lines.get(id)??{id,label:materialLabel(item),sku:item.sku.trim()||'Sin SKU',metres:0,sides:0,pieces:0},ids=pieceIds.get(id)??new Set<string>();
   line.metres+=(index<2?size[0]:size[1])/1000;line.sides++;ids.add(row.id);line.pieces=ids.size;pieceIds.set(id,ids);lines.set(id,line);
  });
  if(lacking)unassigned++;
 }
 return {lines:[...lines.values()],missing,unassigned};
}
/** Metros enteros de canto a comprar (la unidad en que se vende), sin margen de desperdicio. */
export const edgeToBuy=(metres:number)=>metres>0?Math.ceil(metres-1e-9):0;
// --- Corte de la seccionadora (0.8.20) -------------------------------------------------------------------------
/** Campos simples que reemplazan al perfil de maderera, con los mismos rangos que aceptaba el perfil. */
export const cutFields={kerfMm:{label:'Disco (kerf) mm',range:[0,10]},trimMm:{label:'Refilado por lado mm',range:[0,50]}} as const;
export type CutField=keyof typeof cutFields;
/**
 * Sugeridos para una seccionadora de maderera argentina: disco de 4 mm (sierra principal con incisor: de 3,2 a 4,4 mm;
 * 4 es lo habitual en los optimizadores y no subestima placas) y 10 mm de refilado por lado (el borde de fábrica de la
 * melamina viene golpeado). Sin girar: el TXT sale con rota 0, como hasta 0.8.19.
 */
export const DEFAULT_CUT={kerfMm:4,trimMm:10,allowRotate:false};
/** Lo guardado en esta computadora, o los sugeridos campo por campo si falta o es inválido. */
export function parseCut(raw:string|null):{kerfMm:number;trimMm:number;allowRotate:boolean}{
 let data:Record<string,unknown>={};try{const parsed=raw?JSON.parse(raw):null;if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed as Record<string,unknown>;}catch{/* inválido: sugeridos */}
 const value=(field:CutField)=>{const v=data[field],[min,max]=cutFields[field].range;return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:DEFAULT_CUT[field];};
 return {kerfMm:value('kerfMm'),trimMm:value('trimMm'),allowRotate:typeof data.allowRotate==='boolean'?data.allowRotate:DEFAULT_CUT.allowRotate};
}
