// Reglas puras del pedido a maderera. Replican en el cliente las comprobaciones físicas de supplier_order.rb
// para avisar mientras se carga; Ruby sigue siendo la validación que habilita exportar. Desde 0.8.16 no hay
// tildes de revisión: las fichas están completas o les falta un dato, y el pedido se propone desde el modelo.
import {mm} from '../../lib/model';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from './WorkshopPanel';

/** Origen del material de una cara, sin códigos internos. */
export const faceOrigin:Record<string,string>={painted_face:'Cara pintada',inherited_instance:'Heredado',unpainted:'Sin pintar'};
export const sideBound:Record<string,string>={min:'lado mínimo',max:'lado máximo'};
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
const find=(catalog:Catalog,id:string|null|undefined,kind:string)=>id?catalog.items.find(item=>item.id===id&&item.kind===kind):undefined;
export const boardOf=(row:Pick<OrderRow,'materialId'>,catalog:Catalog)=>find(catalog,row.materialId,'sheet');
/** Espesor observado: el eje que no es base ni altura. */
export function rowThickness(row:Pick<OrderRow,'axes'>,geometry:Pick<Geometry,'lengths'>){if(!row.axes)return null;const axis=[0,1,2].find(i=>!row.axes!.includes(i));return axis===undefined?null:geometry.lengths[axis];}
/** Base y altura que recibe la maderera: las de corte si se cargaron explícitas, si no las del modelo según los ejes. */
export function rowDimensions(row:Pick<OrderRow,'axes'|'dimensionRule'|'cutBase'|'cutHeight'>,geometry:Pick<Geometry,'lengths'>):[number,number]|null{
 if(row.dimensionRule==='explicit_cut')return row.cutBase&&row.cutHeight&&row.cutBase>0&&row.cutHeight>0?[row.cutBase,row.cutHeight]:null;
 return row.axes?[geometry.lengths[row.axes[0]],geometry.lengths[row.axes[1]]]:null;
}
/** Motivo físico por el que un canto no sirve para la pieza (más angosto que el espesor), o null. Cualquier canto vale: no hay canto fijo por placa. */
export function edgeIncompatibility(edge:CatalogItem,board:CatalogItem|undefined,thickness:number|null){
 const t=thickness??board?.thicknessMm??null;
 if(t===null)return null;
 if(edge.widthMm===null)return 'ancho sin cargar';
 return edge.widthMm+0.1<t?`más angosto que el espesor de ${mm(t)} mm`:null;
}
export type RowField='material'|'principalId'|'secondaryId'|'edgeMap'|'grainPolicy'|'dimensions'|'detail';
export type RowWarnings=Partial<Record<RowField,string[]>>;
const sideNames=['Arriba','Abajo','Izquierda','Derecha'];
/** Avisos por campo que ya se pueden deducir sin leer el modelo. Vacío no significa exportable. */
export function rowWarnings(row:OrderRow,geometry:Pick<Geometry,'lengths'>,catalog:Catalog):RowWarnings{
 const out:RowWarnings={},add=(field:RowField,text:string)=>{(out[field]??=[]).push(text);};
 if(!row.include)return out;
 const board=boardOf(row,catalog),thickness=rowThickness(row,geometry),boardMissing=board?catalogMissing(board):[];
 if(!board)add('material',row.materialId?'La placa elegida ya no está en la biblioteca: elegí otra.':'Elegí una placa de la biblioteca.');
 else if(boardMissing.length)add('material',`La ficha de «${board.name}» está incompleta: falta ${boardMissing.join(', ')}. Completala en la biblioteca.`);
 if(board&&thickness!==null&&board.thicknessMm!==null&&Math.abs(thickness-board.thicknessMm)>0.1)add('material',`El eje de espesor mide ${mm(thickness)} mm y la placa tiene ${mm(board.thicknessMm)} mm. Revisá los ejes o la placa.`);
 (['principalId','secondaryId'] as const).forEach((key,index)=>{
  const role=index+1,id=row[key],used=row.edgeMap.some(v=>v===role),edge=find(catalog,id,'edge');
  if(id&&!edge)add(key,'El canto ya no está en la biblioteca.');
  if(edge&&used){const missing=catalogMissing(edge);if(missing.length)add(key,`La ficha de «${edge.name}» está incompleta: falta ${missing.join(', ')}.`);const reason=edgeIncompatibility(edge,board,thickness);if(reason&&!missing.length)add(key,`El canto es ${reason}.`);}
  if(used&&!id)add('edgeMap',`${row.edgeMap.map((v,i)=>v===role?sideNames[i]:'').filter(Boolean).join(', ')}: lleva canto ${role===1?'principal (1)':'secundario (2)'} y no hay producto asignado en ese rol.`);
 });
 if(row.principalId&&row.principalId===row.secondaryId)add('secondaryId','El canto secundario debe ser distinto del principal.');
 if(row.grainPolicy==='rotate'){const reason=rotationBlock(row,board);if(reason)add('grainPolicy',reason);}
 if([...row.detail].length>DETAIL_MAX)add('detail',`El detalle supera ${DETAIL_MAX} caracteres.`);
 const size=rowDimensions(row,geometry);
 if(board&&size&&board.lengthMm!==null&&board.widthMm!==null){const [base,height]=size,fits=(base<=board.lengthMm+0.1&&height<=board.widthMm+0.1)||(row.grainPolicy==='rotate'&&height<=board.lengthMm+0.1&&base<=board.widthMm+0.1);if(!fits)add('dimensions',`La pieza no entra en la placa: mide ${mm(base)} × ${mm(height)} mm y la placa es ${mm(board.lengthMm)} × ${mm(board.widthMm)} mm.`);}
 return out;
}
/** Motivo por el que no se puede permitir giro (rota 1), o null. */
export function rotationBlock(row:Pick<OrderRow,'edgeMap'>,board:CatalogItem|undefined){
 if(board&&board.grain!==false)return board.grain?'La placa tiene veta: mantené la orientación (rota 0).':'La ficha de la placa no tiene la veta cargada: mantené la orientación (rota 0).';
 if(new Set(row.edgeMap).size>1)return 'Los cantos son asimétricos: mantené la orientación (rota 0).';
 return null;
}
/** Dirección de veta que va al pedido: la decide la placa (punto 8). */
export function grainText(board:CatalogItem|undefined,row:Pick<OrderRow,'axes'>){
 if(!board||(board.grain!==true&&board.grain!==false))return 'Se define con la placa.';
 if(!board.grain)return 'Placa sin veta.';
 return row.axes?`Con veta: corre a lo largo de la base (eje ${'XYZ'[row.axes[0]]}). Para cambiarla, intercambiá los ejes.`:'Con veta: corre a lo largo de la base.';
}
// --- Orientación y cantos ---------------------------------------------------------------
type View=Pick<OrderRow,'axes'|'frontSign'|'flipX'|'flipY'>;
/** Cara física (eje y límite) de cada lado de la vista 2D, con la misma regla que OclReader.projected_edges. */
export function sideFaces(view:View,mirrored:boolean):string[]|null{
 if(!view.axes||view.frontSign===null)return null;
 const [u,v]=view.axes,parity=[[0,1],[1,2],[2,0]].some(([a,b])=>a===u&&b===v)?1:-1,flipX=view.flipX!==(view.frontSign*parity*(mirrored?-1:1)<0);
 return [[v,view.flipY?0:1],[v,view.flipY?1:0],[u,flipX?1:0],[u,flipX?0:1]].map(([axis,high])=>`${axis}:${high}`);
}
/** Al cambiar ejes, cara o inversión, cada canto sigue en su cara física: el mapa se reordena, no se pierde. */
export function remapEdges(before:View,after:View,edgeMap:number[],mirrored:boolean){
 const from=sideFaces(before,mirrored),to=sideFaces(after,mirrored);
 if(!from||!to)return edgeMap;
 return to.map(face=>{const index=from.indexOf(face);return index<0?0:edgeMap[index]??0;});
}
// --- Propuesta desde el modelo y línea de base ---------------------------------------
export type ProposedEntry={values:Partial<OrderRow>;mirrored?:boolean;edgeBlockers?:string[];notes?:{group:string;text:string}[]};
export const PROPOSED_GROUPS:Record<string,(keyof OrderRow)[]>={detail:['detail'],orientation:['axes','frontSign','flipX','flipY'],material:['materialId'],edges:['principalId','secondaryId','edgeMap','edgeBindings'],grain:['grainPolicy'],dimensions:['dimensionRule','cutBase','cutHeight']};
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const baseline=(plan:Pick<OrderPlan,'proposed'>,id:string)=>plan.proposed?.[id];
const baseView=(entry:ProposedEntry):View=>({axes:entry.values.axes??null,frontSign:entry.values.frontSign??null,flipX:!!entry.values.flipX,flipY:!!entry.values.flipY});
/** Mapa del modelo expresado en la vista actual de la fila (cada canto en su cara física). */
const modelMap=(entry:ProposedEntry,row:OrderRow)=>remapEdges(baseView(entry),row,entry.values.edgeMap??[0,0,0,0],!!entry.mirrored);
/** Igual que OrderProposal.follows?: la fila conserva lo que propuso el modelo para ese grupo. Los cantos siguen al modelo aunque se haya girado la vista. */
export function followsModel(plan:Pick<OrderPlan,'proposed'>,row:OrderRow,group:string){
 const entry=baseline(plan,row.id);if(!entry)return false;
 if(group!=='edges')return PROPOSED_GROUPS[group].every(key=>key in entry.values&&same(row[key],entry.values[key]));
 if(!(['principalId','secondaryId','edgeBindings','edgeMap'] as const).every(key=>key in entry.values)||!(['principalId','secondaryId','edgeBindings'] as const).every(key=>same(row[key],entry.values[key])))return false;
 return same(row.edgeMap,PROPOSED_GROUPS.orientation.every(key=>same(row[key],entry.values[key]))?entry.values.edgeMap:modelMap(entry,row));
}
/** Avisos de la propuesta que siguen vigentes (su grupo no se editó a mano). No bloquean. */
export function rowNotes(plan:Pick<OrderPlan,'proposed'>,row:OrderRow,group?:string){return (baseline(plan,row.id)?.notes||[]).filter(note=>PROPOSED_GROUPS[note.group]&&(!group||note.group===group)&&followsModel(plan,row,note.group)).map(note=>note.text);}
/** «Más de dos cantos» mientras los cantos sean los del modelo (bloquea, como en Ruby). */
export function rowEdgeBlockers(plan:Pick<OrderPlan,'proposed'>,row:OrderRow){return followsModel(plan,row,'edges')?baseline(plan,row.id)?.edgeBlockers||[]:[];}
/** Grupos editados a mano en la fila. */
export function editedGroups(plan:Pick<OrderPlan,'proposed'>,row:OrderRow){return baseline(plan,row.id)?Object.keys(PROPOSED_GROUPS).filter(group=>!followsModel(plan,row,group)):[];}
/** Valores que propuso el modelo para volver a ellos (todos o un grupo). */
export function restoreProposal(plan:Pick<OrderPlan,'proposed'>,row:OrderRow,group?:string):Partial<OrderRow>{
 const entry=baseline(plan,row.id);if(!entry)return {};
 const keys=group?PROPOSED_GROUPS[group]:Object.values(PROPOSED_GROUPS).flat();
 const patch:Partial<OrderRow>=Object.fromEntries(keys.filter(key=>key in entry.values).map(key=>[key,structuredClone(entry.values[key])]));
 // Solo los cantos, con la vista cambiada a mano: el mapa del modelo se reordena para esta vista.
 if(group==='edges'&&'edgeMap' in entry.values)patch.edgeMap=modelMap(entry,row);
 return patch;
}
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value as object).sort().map(key=>[key,stable((value as Record<string,unknown>)[key])])):value;
/** Mismas filas sin importar el orden de las claves (para saber si el modelo movió la propuesta). */
export const sameRows=(a:OrderRow[],b:OrderRow[])=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export type MergeStats={kept:number;added:number;removed:number;stale?:boolean};
/** Aviso al cruzar el borrador guardado con una propuesta nueva (punto 10). */
export function mergeNotice(merge:MergeStats|null|undefined){
 if(!merge?.stale)return '';
 const parts=[merge.added?`se ${merge.added===1?'agregó':'agregaron'} ${plural(merge.added,'pieza nueva','piezas nuevas')}`:'',merge.removed?`se ${merge.removed===1?'quitó':'quitaron'} ${plural(merge.removed,'pieza que ya no está','piezas que ya no están')}`:'',merge.kept?`se conservaron tus cambios en ${plural(merge.kept,'pieza','piezas')}`:''].filter(Boolean);
 return `El modelo, la biblioteca o el perfil cambiaron: el pedido se actualizó${parts.length?` (${parts.join(', ')})`:''}.`;
}
export type EdgeTotal={id:string;label:string;sku:string;metres:number;sides:number;pieces:number};
/** Metros de canto por producto, con la misma regla que Ruby: lados 0-1 suman la base y 2-3 la altura. */
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
/** Mismas medidas ordenadas (±0,1 mm), mismo espejado y misma forma. */
export function equivalentRows(plan:Pick<OrderPlan,'rows'|'geometry'>,row:OrderRow){
 const own=plan.geometry[row.id];if(!own)return [];const key=[...own.lengths].sort((a,b)=>a-b);
 return plan.rows.filter(other=>{if(other.id===row.id)return false;const g=plan.geometry[other.id];if(!g||g.mirrored!==own.mirrored||g.rectangular!==own.rectangular)return false;const lengths=[...g.lengths].sort((a,b)=>a-b);return lengths.every((v,i)=>Math.abs(v-key[i])<=0.1);});
}
export type CopyGroups={material:boolean;edges:boolean;grain:boolean;dimensions:boolean};
type EdgeCharge={amount:number|null;status:string;price:{currency:string}|null;materialId?:string;role?:string};
export type EdgeAmount={current:Record<string,number>;outdated:Record<string,number>;pending:boolean};
/** Importe de canto por producto separando, como el subtotal, los precios vigentes de los desactualizados o con fecha futura. */
export function edgeAmounts(charges:EdgeCharge[]){
 const out=new Map<string,EdgeAmount>();
 for(const charge of charges){
  if(!charge.materialId||(charge.role!=='principal_edge'&&charge.role!=='secondary_edge'))continue;const entry=out.get(charge.materialId)??{current:{},outdated:{},pending:false};
  if(charge.amount===null||!charge.price||charge.status==='price_pending')entry.pending=true;
  else{const bucket=charge.status==='stale_price'||charge.status==='future_price'?entry.outdated:entry.current;bucket[charge.price.currency]=(bucket[charge.price.currency]||0)+charge.amount;}
  out.set(charge.materialId,entry);
 }
 return out;
}
export type ApplyResult={applied:number;edgesSkipped:number;cutsSwapped:number;dimensionsSkipped:number};
/** Aviso de «Aplicar a…» con lo que Ruby copió y salteó. */
export function applySummary(result:ApplyResult){
 return `Aplicado a ${plural(result.applied,'pieza','piezas')}.`
  +(result.edgesSkipped?` Los cantos no se copiaron a ${plural(result.edgesSkipped,'pieza','piezas')} con otros ejes, cara o inversión.`:'')
  +(result.cutsSwapped?` En ${plural(result.cutsSwapped,'pieza','piezas')} con los ejes cruzados se intercambiaron base y altura de corte.`:'')
  +(result.dimensionsSkipped?` Las medidas de corte explícitas no se copiaron a ${plural(result.dimensionsSkipped,'pieza que no es equivalente','piezas que no son equivalentes')}.`:'');
}
export type EdgeLink={observedId:string;catalogId:string;name:string};
/** Vínculo del borrador «material observado → canto»: uno por material; sin canto se quita. */
export function linkEdge(links:EdgeLink[]|undefined,observedId:string,name:string,catalogId:string):EdgeLink[]{
 const rest=(links||[]).filter(link=>link.observedId!==observedId);return catalogId?[...rest,{observedId,catalogId,name}]:rest;
}
export const DETAIL_MAX=80;
/** Aviso del código compuesto del TXT (código + espacio + detalle, máximo 80 caracteres), o null. */
export function detailCodeWarning(detail:string,code:string|undefined,mode:string|undefined){
 if(mode!=='module_piece')return null;
 if(code===undefined)return 'Falta el código módulo·pieza: completá módulo y código de pieza en la guía y guardala, o desactivá el código en el perfil del archivo.';
 if(code==='')return 'El código módulo·pieza se repite en otro mueble: corregí el módulo en la guía para que cada mueble tenga el suyo.';
 const length=[...`${code} ${detail}`].length;
 return length>DETAIL_MAX?`Con el código ${code} el detalle ocupa ${length} caracteres y el máximo es ${DETAIL_MAX}: acortalo ${plural(length-DETAIL_MAX,'carácter','caracteres')}.`:null;
}
export type BlockField='detail'|'links'|'include'|'secondaryEdge'|'axes'|'dimensions'|'grain'|'edges'|'material';
/** Campo del formulario (data-field) al que lleva cada problema de Ruby. */
export function blockedField(reason:string):BlockField|null{
 const r=reason.toLocaleLowerCase('es');
 if(r.includes('código módulo·pieza')||r.includes('detalle con código')||r.includes('se repite en otro mueble')||r.includes('el detalle supera'))return 'detail';
 if(r.includes('cantos pintados sin vínculo'))return 'links';
 // Una pieza no rectangular no se corrige con los ejes: se excluye o se corrige en el modelo.
 if(r.includes('no rectangular'))return 'include';
 if(r.includes('ejes'))return 'axes';
 if(r.includes('incompleta'))return r.includes('canto')?(r.includes('secundario (2)')?'secondaryEdge':'edges'):'material';
 if(/asimétric|girar|giro|rota|veta/.test(r))return 'grain';
 if(/no entra|medidas|corte/.test(r))return 'dimensions';
 if(r.includes('canto'))return r.includes('secundario (2)')?'secondaryEdge':'edges';
 if(/placa|espesor|material/.test(r))return 'material';
 return null;
}
