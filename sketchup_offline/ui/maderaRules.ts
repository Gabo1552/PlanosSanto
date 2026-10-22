// Reglas puras del perfil de maderera, el presupuesto estimado y el catálogo v2. Ruby valida y calcula; acá solo se presenta.
import type {CatalogItem} from './WorkshopPanel';

export type ServicePrice={amount:number;currency:string;unit:string;date:string;source:string};
export type DimensionRule='finished'|'deduct_edge';
export type MaderaProfile={id:string|null;version:number;approved:boolean;approvedAt:string|null;updatedAt:string|null;contentHash:string|null;name:string;supplier:string;trimMm:number|null;kerfMm:number|null;dimensionRule:DimensionRule;wastePercent:number|null;cutPrice:ServicePrice|null;edgingPrice:ServicePrice|null;encoding:'utf8'|'windows1252';decimal:'.'|',';header:boolean;notes:string};
export type MaderaProfiles={profiles:{schema:1;revision:number;activeId:string|null;profiles:MaderaProfile[]};template:MaderaProfile};
export type BudgetStatus='current_price'|'stale_price'|'future_price'|'price_pending'|'size_pending';
export type BudgetMaterial={materialId:string;name:string;sku:string;role:'board'|'edge';unit:'m2'|'metro';netQuantity:number;wasteQuantity:number;purchaseQuantity:number|null;purchaseUnit:'placa'|'metro';netAmount:number|null;wasteAmount:number|null;purchaseAmount:number|null;currency:string|null;status:BudgetStatus};
export type BudgetService={kind:'cut'|'edging';quantity:number|null;unit:string;amount:number|null;currency:string;status:BudgetStatus;approximate:boolean};
export type Budget={profile:{id:string;name:string;supplier:string;version:number;approved:boolean;contentHash:string;trimMm:number;kerfMm:number;dimensionRule:DimensionRule;wastePercent:number};wastePercent:number;kerfMm:number;trimMm:number;priceAgeDays:number;materials:BudgetMaterial[];totals:{net:Record<string,number>;waste:Record<string,number>;purchase:Record<string,number>};services:BudgetService[];servicesTotals:Record<string,number>;estimated:true;optimized:false};
export type UsableWarning={id:string;detail:string;message:string};

const CONTENT=['name','supplier','trimMm','kerfMm','dimensionRule','wastePercent','cutPrice','edgingPrice','encoding','decimal','header','notes'] as const;
/** Lo único que manda el cliente: identificador y contenido. Versión, aprobación y huella las pone Ruby. */
export function profileContent(profile:MaderaProfile){return {id:profile.id,...Object.fromEntries(CONTENT.map(key=>[key,profile[key]]))};}
export const sameContent=(a:MaderaProfile,b:MaderaProfile)=>JSON.stringify(profileContent(a))===JSON.stringify(profileContent(b));
/** «Aprobado · v 2», «Sin aprobar · v 1» y, si corresponde, «En uso en pedidos». */
export function profileState(profile:MaderaProfile,activeId:string|null){return [`${profile.approved?'Aprobado':'Sin aprobar'} · v ${profile.version}`,...(profile.id&&profile.id===activeId?['En uso en pedidos']:[])];}

const decimals=(digits:number)=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const two=decimals(2),three=decimals(3),whole=new Intl.NumberFormat('es-AR',{maximumFractionDigits:0});
export const money=(currency:string,value:number)=>`${currency} ${two.format(value)}`;
export const moneyTotals=(values:Record<string,number>)=>Object.entries(values).map(([currency,value])=>money(currency,value)).join(' · ');
/** Cantidad con su unidad en formato argentino: m² con tres decimales, metros con dos, placas enteras. */
export function quantity(value:number|null,unit:string){
 if(value===null)return 'Medida pendiente';
 if(unit==='m2')return `${three.format(value)} m²`;
 if(unit==='placa')return `${whole.format(value)} ${value===1?'placa':'placas'}`;
 if(unit==='pieza')return `${whole.format(value)} ${value===1?'pieza':'piezas'}`;
 return `${two.format(value)} m`;
}
export const statusLabels:Record<BudgetStatus,string>={current_price:'Vigente',stale_price:'Precio desactualizado',future_price:'Precio con fecha futura',price_pending:'Precio pendiente',size_pending:'Formato de placa pendiente'};
/** Importe de una celda: solo los vigentes suman al total; el resto se muestra aparte o queda pendiente. */
export function cellAmount(amount:number|null,currency:string|null,status:BudgetStatus){
 if(amount===null||!currency||status==='price_pending'||status==='size_pending')return {text:'Pendiente',counted:false};
 return {text:money(currency,amount),counted:status==='current_price'};
}
export const serviceNames:Record<BudgetService['kind'],string>={cut:'Corte',edging:'Canteado'};

const fieldNames:Record<string,string>={kind:'tipo',sku:'SKU',supplier:'proveedor',thicknessMm:'espesor',widthMm:'ancho',lengthMm:'largo',grain:'veta',compatibleIds:'cantos compatibles'};
const sourceNames:Record<string,string>={preset:'valores sugeridos del taller',ocl:'OpenCutList',skm:'nombre del archivo SKM',variant:'ficha de origen de la variante'};
/** «espesor, ancho y largo» desde los campos sugeridos de una ficha, y su origen legible. */
export function suggestedSummary(suggested:NonNullable<CatalogItem['suggested']>){
 const names=suggested.fields.map(field=>fieldNames[field]||field);
 const list=names.length>1?`${names.slice(0,-1).join(', ')} y ${names[names.length-1]}`:names[0]||'';
 return {fields:list,source:sourceNames[suggested.source]||suggested.source};
}
/** Igual criterio que el aviso en vivo: más de 0,1 mm entre el eje de espesor y la placa. */
export function thicknessMismatch(board:Pick<CatalogItem,'thicknessMm'>|undefined,thickness:number|null){return !!board&&thickness!==null&&board.thicknessMm!==null&&Math.abs(thickness-board.thicknessMm)>0.1;}
/** Espesor medido redondeado a centésimas para la variante (evita 17,999999 de la geometría). */
export const variantThickness=(value:number)=>Math.round(value*100)/100;

/** MATERIALES-06: tipos admitidos en el lote SKM, en el orden en que se ofrecen. */
export const skmKinds=[['unknown','Sin resolver'],['sheet','Placa'],['edge','Canto'],['solid_wood','Madera maciza'],['dimensional','Listón / perfil'],['veneer','Lámina']] as const;
const validKind=(kind:string|undefined)=>skmKinds.some(([id])=>id===kind)?kind!:'unknown';
/** Tipo por fila prellenado con la sugerencia del nombre del archivo (editable). */
export function initialKinds(rows:{id:string;suggestions?:{kind?:string}}[]){return Object.fromEntries(rows.map(row=>[row.id,validKind(row.suggestions?.kind)]));}
/** Solo las filas seleccionadas viajan a Ruby, que rechaza tipos de filas no elegidas. */
export function typedKinds(selectedIds:string[],kinds:Record<string,string>){return Object.fromEntries(selectedIds.map(id=>[id,validKind(kinds[id])]));}
