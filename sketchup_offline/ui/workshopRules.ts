// Reglas puras del pedido a maderera. Replican en el cliente las comprobaciones de supplier_order.rb
// para avisar mientras se carga; Ruby sigue siendo la única validación que habilita exportar.
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
const find=(catalog:Catalog,id:string|null|undefined,kind:string)=>id?catalog.items.find(item=>item.id===id&&item.kind===kind&&item.approved):undefined;
export const boardOf=(row:Pick<OrderRow,'materialId'>,catalog:Catalog)=>find(catalog,row.materialId,'sheet');
/** Espesor observado: el eje que no es base ni altura. */
export function rowThickness(row:Pick<OrderRow,'axes'>,geometry:Pick<Geometry,'lengths'>){if(!row.axes)return null;const axis=[0,1,2].find(i=>!row.axes!.includes(i));return axis===undefined?null:geometry.lengths[axis];}
/** Base y altura que recibe la maderera: las de corte si se cargaron explícitas, si no las del modelo según los ejes. */
export function rowDimensions(row:Pick<OrderRow,'axes'|'dimensionRule'|'cutBase'|'cutHeight'>,geometry:Pick<Geometry,'lengths'>):[number,number]|null{
 if(row.dimensionRule==='explicit_cut')return row.cutBase&&row.cutHeight&&row.cutBase>0&&row.cutHeight>0?[row.cutBase,row.cutHeight]:null;
 return row.axes?[geometry.lengths[row.axes[0]],geometry.lengths[row.axes[1]]]:null;
}
/** Motivos por los que un canto no sirve para la placa elegida, en el orden de Ruby (ancho y después compatibilidad), o null si es compatible. */
export function edgeIncompatibility(edge:CatalogItem,board:CatalogItem|undefined,thickness:number|null){
 if(!board)return null;const reasons:string[]=[],t=thickness??board.thicknessMm;
 if(edge.widthMm===null)reasons.push('ancho sin cargar');else if(t!==null&&edge.widthMm+0.1<t)reasons.push(`no cubre el espesor de ${mm(t)} mm`);
 if(!board.compatibleIds.includes(edge.id))reasons.push('sin compatibilidad cargada en la biblioteca');
 return reasons.length?reasons.join('; '):null;
}
/** Indica si el motivo se corrige en la ficha de la placa (compatibilidad) y no en la del canto. */
export const fixInBoard=(reason:string)=>reason.includes('sin compatibilidad');
export type RowField='material'|'principalId'|'secondaryId'|'edgeMap'|'grainAxis'|'grainPolicy'|'dimensions';
export type RowWarnings=Partial<Record<RowField,string[]>>;
const sideNames=['Arriba','Abajo','Izquierda','Derecha'];
/** Avisos por campo que ya se pueden deducir sin leer el modelo. Vacío no significa exportable. */
export function rowWarnings(row:OrderRow,geometry:Pick<Geometry,'lengths'>,catalog:Catalog):RowWarnings{
 const out:RowWarnings={},add=(field:RowField,text:string)=>{(out[field]??=[]).push(text);};
 if(!row.include)return out;
 const board=boardOf(row,catalog),thickness=rowThickness(row,geometry);
 if(board&&thickness!==null){if(board.thicknessMm===null)add('material','La placa no tiene espesor cargado en la biblioteca.');else if(Math.abs(thickness-board.thicknessMm)>0.1)add('material',`El eje de espesor mide ${mm(thickness)} mm y la placa tiene ${mm(board.thicknessMm)} mm. Revisá los ejes o la placa.`);}
 (['principalId','secondaryId'] as const).forEach((key,index)=>{
  const role=index+1,id=row[key],used=row.edgeMap.some(v=>v===role),edge=find(catalog,id,'edge');
  if(id&&!edge)add(key,'El canto ya no está aprobado en la biblioteca.');
  if(edge){const reason=edgeIncompatibility(edge,board,thickness);if(reason)add(key,`No compatible con la placa elegida: ${reason}.`);}
  if(used&&!id)add('edgeMap',`${row.edgeMap.map((v,i)=>v===role?sideNames[i]:'').filter(Boolean).join(', ')}: lleva canto ${role===1?'principal (1)':'secundario (2)'} y no hay producto asignado en ese rol.`);
 });
 if(row.principalId&&row.principalId===row.secondaryId)add('secondaryId','El canto secundario debe ser distinto del principal.');
 if(row.grainAxis==='v')add('grainAxis','La veta en V no se exporta: intercambiá los ejes para que la veta quede según la base.');
 else if(board&&row.grainAxis){if(board.grain===true&&row.grainAxis!=='u')add('grainAxis','La placa tiene veta: elegí «Según base U».');if(board.grain!==true&&row.grainAxis==='u')add('grainAxis',board.grain===false?'La placa elegida es sin veta: elegí «Pieza sin veta».':'La placa no tiene la veta confirmada en la biblioteca.');}
 if(row.grainPolicy==='rotate'){const reason=rotationBlock(row,board);if(reason)add('grainPolicy',reason);}
 const size=rowDimensions(row,geometry);
 if(board&&size&&board.lengthMm!==null&&board.widthMm!==null){const [base,height]=size,fits=(base<=board.lengthMm+0.1&&height<=board.widthMm+0.1)||(row.grainPolicy==='rotate'&&height<=board.lengthMm+0.1&&base<=board.widthMm+0.1);if(!fits)add('dimensions',`Mide ${mm(base)} × ${mm(height)} mm y la placa aprobada es ${mm(board.lengthMm)} × ${mm(board.widthMm)} mm.`);}
 return out;
}
/** Motivo por el que no se puede permitir giro (rota 1), o null. */
export function rotationBlock(row:Pick<OrderRow,'edgeMap'>,board:CatalogItem|undefined){
 if(board&&board.grain!==false)return board.grain?'La placa tiene veta: mantené la orientación (rota 0).':'La placa no tiene la veta confirmada: mantené la orientación (rota 0).';
 if(new Set(row.edgeMap).size>1)return 'Los cantos son asimétricos: mantené la orientación (rota 0).';
 return null;
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
export type ApplyResult={applied:number;edgesSkipped:number;cutsSwapped:number;dimensionsSkipped:number;invalidated:Record<string,string[]>};
/** Aviso de «Aplicar a…» con lo que Ruby copió, salteó e invalidó; `left` son las verificaciones pendientes en los destinos. */
export function applySummary(result:ApplyResult,left:number){
 const invalid=Object.values(result.invalidated||{}).reduce((sum,keys)=>sum+keys.length,0);
 return `Aplicado a ${plural(result.applied,'pieza','piezas')}; ${invalid?`se ${invalid===1?'invalidó':'invalidaron'} ${plural(invalid,'confirmación','confirmaciones')}`:'no se invalidó ninguna confirmación'} y quedan ${plural(left,'verificación','verificaciones')} por confirmar.`
  +(result.edgesSkipped?` Los cantos no se copiaron a ${plural(result.edgesSkipped,'pieza','piezas')} con otros ejes, cara o inversión.`:'')
  +(result.cutsSwapped?` En ${plural(result.cutsSwapped,'pieza','piezas')} con los ejes cruzados se intercambiaron base y altura de corte.`:'')
  +(result.dimensionsSkipped?` Las medidas de corte explícitas no se copiaron a ${plural(result.dimensionsSkipped,'pieza que no es equivalente','piezas que no son equivalentes')}.`:'');
}
export type ProposalRow={id:string;detail:string;status:'proposed'|'kept'|'abstained';bulkReady:boolean;reasons:string[]};
export type ProposalSummary={proposed:number;kept:number;abstained:number;bulkReady:number;review:number};
export const proposalStatus:Record<ProposalRow['status'],string>={proposed:'Propuesta sin confirmar',kept:'Conservada',abstained:'Sin propuesta'};
/** Filas propuestas o sin propuesta que no cumplen el criterio de «Confirmar en bloque»: se revisan una por una. */
export const proposalReview=(rows:ProposalRow[])=>rows.filter(row=>row.status!=='kept'&&!row.bulkReady);
export function proposalNotice(summary:ProposalSummary){
 return `Propuesta lista: ${plural(summary.proposed,'pieza propuesta','piezas propuestas')}, ${plural(summary.kept,'conservada','conservadas')} por tener verificaciones y ${plural(summary.abstained,'sin propuesta','sin propuesta')}. Nada quedó confirmado; ${summary.bulkReady?`${plural(summary.bulkReady,'pieza se puede','piezas se pueden')} confirmar en bloque`:'ninguna pieza se puede confirmar en bloque todavía'}.`;
}
export function bulkNotice(confirmed:number,review:number){
 return `${confirmed?`Se ${confirmed===1?'confirmó':'confirmaron'} en bloque ${plural(confirmed,'pieza','piezas')} sin ambigüedad.`:'No se confirmó ninguna pieza en bloque.'} ${review?`${review===1?'Queda 1 pieza':`Quedan ${review} piezas`} en revisión individual.`:'No queda ninguna pieza en revisión individual.'}`;
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
export type BlockField='detail'|'links'|'include'|'exclude'|'secondaryEdge'|'axes'|'checks'|'edgeResolution'|'note'|'dimensions'|'grain'|'edges'|'material';
/** Campo del formulario (data-field) al que lleva cada motivo de bloqueo de Ruby. */
export function blockedField(reason:string):BlockField|null{
 const r=reason.toLocaleLowerCase('es');
 if(r.includes('excluye'))return 'exclude';
 if(r.includes('código módulo·pieza')||r.includes('detalle con código')||r.includes('se repite en otro mueble'))return 'detail';
 if(r.includes('vínculos de cantos del borrador'))return 'links';
 // Una caja no rectangular no se corrige con los ejes: se verifica la geometría o se excluye la pieza.
 if(r.includes('geometría no rectangular'))return 'include';
 if(r.includes('falta confirmar'))return 'checks';
 if(r.includes('ejes')||r.includes('cara frontal'))return 'axes';
 if(/verificaste los cantos|mapa manual|releer las caras|inspección manual|cara perimetral|canto nativo/.test(r))return 'edgeResolution';
 if(r.includes('justificación')||r.includes('detalle'))return 'note';
 if(/asimétric|girar|rota|veta/.test(r))return 'grain';
 if(/no entra|medidas|corte/.test(r))return 'dimensions';
 if(r.includes('canto'))return r.includes('secundario')?'secondaryEdge':'edges';
 if(/placa|espesor|material/.test(r))return 'material';
 return null;
}
