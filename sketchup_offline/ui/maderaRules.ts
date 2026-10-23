// Reglas puras del catálogo v2 (sugerencias, variantes de espesor y lote SKM). Ruby valida; acá solo se presenta.
// 0.8.20: el perfil de maderera y el presupuesto dejaron de mostrarse; sus reglas de presentación se quitaron de la UI.
// El perfil sigue guardado y Ruby lo conserva (maderera_profile.rb) para poder volver atrás.
import type {CatalogItem} from './WorkshopPanel';

const fieldNames:Record<string,string>={kind:'tipo',sku:'SKU',supplier:'proveedor',thicknessMm:'espesor',widthMm:'ancho',lengthMm:'largo',grain:'veta',compatibleIds:'cantos compatibles'};
const sourceNames:Record<string,string>={preset:'valores sugeridos del taller',ocl:'OpenCutList',skm:'nombre del archivo SKM',variant:'ficha de origen de la variante'};
/** «espesor, ancho y largo» desde los campos sugeridos de una ficha, y su origen legible. */
export function suggestedSummary(suggested:NonNullable<CatalogItem['suggested']>){
 const names=suggested.fields.map(field=>fieldNames[field]||field);
 const list=names.length>1?`${names.slice(0,-1).join(', ')} y ${names[names.length-1]}`:names[0]||'';
 return {fields:list,source:sourceNames[suggested.source]||suggested.source};
}

/** MATERIALES-06: tipos admitidos en el lote SKM, en el orden en que se ofrecen. */
export const skmKinds=[['unknown','Sin resolver'],['sheet','Placa'],['edge','Canto'],['solid_wood','Madera maciza'],['dimensional','Listón / perfil'],['veneer','Lámina']] as const;
const validKind=(kind:string|undefined)=>skmKinds.some(([id])=>id===kind)?kind!:'unknown';
/** Tipo por fila prellenado con la sugerencia del nombre del archivo (editable). */
export function initialKinds(rows:{id:string;suggestions?:{kind?:string}}[]){return Object.fromEntries(rows.map(row=>[row.id,validKind(row.suggestions?.kind)]));}
/** Solo las filas seleccionadas viajan a Ruby, que rechaza tipos de filas no elegidas. */
export function typedKinds(selectedIds:string[],kinds:Record<string,string>){return Object.fromEntries(selectedIds.map(id=>[id,validKind(kinds[id])]));}
