// Herrajes calculados por nombre (0.8.36): cada pieza llamada Puerta o Frente cajón lleva sus herrajes según las
// reglas del taller. Lógica pura sobre el listado de Piezas (nombres, cantidades y códigos) y los muebles generados
// (alto de la puerta y profundidad del mueble medidos con el frente confirmado). No toca el modelo.
import {Matrix4,Vector3} from 'three';
import {bounds,type Furniture} from '../../lib/model';
import {nameSuggestions} from '../../lib/nameSuggestions';
import {furnitureEnvelope} from '../../lib/scene';
import type {CutlistData,CutlistPiece} from './cutlistModel';

/** Reglas del taller (a confirmar en uso real). Bisagras: hasta `upTo` mm de alto, `count` bisagras.
 * Correderas: el largo comercial más grande que entra en la profundidad del mueble menos `runnerMarginMm`
 * (frente y fondo). */
export const HARDWARE_RULES={
  hinges:[{upTo:900,count:2},{upTo:1500,count:3},{upTo:2000,count:4},{upTo:Infinity,count:5}],
  runnerLengthsMm:[300,350,400,450,500],
  runnerMarginMm:50,
} as const;

export type HardwareKind='hinge'|'runner'|'handle';
export type HardwareRole='door'|'drawer';
/** Ficha de la biblioteca (solo lo que se usa acá). */
export type HardwareCatalogItem={id:string;name:string;kind:string;sku?:string|null;lengthMm?:number|null;favorite?:boolean};
export type HardwareFicha={id:string;name:string;sku:string|null};
/** Una fila del listado que lleva este herraje: `ids`, sus piezas físicas que lo llevan; `perPiece` por pieza, `quantity` en total. */
export type HardwareSource={piece:CutlistPiece;ids:string[];perPiece:number;quantity:number};
/** 0.8.39: lo elegido en Piezas para cada pieza física (guardado en el modelo): puerta, frente de cajón o ninguno.
 * Manda sobre el nombre. */
export type HardwareChoice=HardwareRole|'none';
export type HardwareRoles=Record<string,HardwareChoice>;
export type HardwareLine={key:string;kind:HardwareKind;name:string;unit:'u'|'par';lengthMm:number|null;quantity:number;
  ficha:HardwareFicha|null;warning:string|null;sources:HardwareSource[]};
export type HardwareResult={lines:HardwareLine[];notes:string[]};

const word=(text:string)=>new RegExp(`(?<![\\p{L}\\p{N}])(?:${text})(?![\\p{L}\\p{N}])`,'iu');
const DOOR=word('Puertas?');
const FRONT=word('Frente\\s+caj[oó]n|Fte');
const INNER=word('Del\\s+Caj');

/** Puerta o frente de cajón según el nombre de la pieza (con o sin obra y módulo delante). */
export function hardwareRole(name:string):HardwareRole|null{
  if(DOOR.test(name))return 'door';
  if(FRONT.test(name)||INNER.test(name))return 'drawer';
  return null;
}
export const hingeCount=(heightMm:number)=>HARDWARE_RULES.hinges.find(rule=>Math.round(heightMm)<=rule.upTo)!.count;
/** Largo de corredera para esa profundidad; null si no entra ni la más corta. */
export function runnerLength(depthMm:number):number|null{
  const room=Math.round(depthMm)-HARDWARE_RULES.runnerMarginMm;
  const fits=HARDWARE_RULES.runnerLengthsMm.filter(length=>length<=room);
  return fits.length?fits[fits.length-1]:null;
}

/** Alto y ancho de una pieza en el mueble armado (ejes de las cotas totales). */
function pieceExtent(f:Furniture,id:string):{alto:number;ancho:number}|null{
  const envelope=furnitureEnvelope(f),piece=f.pieces.find(p=>p.id===id);
  if(!envelope||!piece)return null;
  const box=bounds(piece.mesh),matrix=new Matrix4().fromArray(piece.transform),range={alto:[Infinity,-Infinity],ancho:[Infinity,-Infinity]};
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=new Vector3(x,y,z).applyMatrix4(matrix);
    for(const axis of ['alto','ancho'] as const){const d=point.dot(envelope.axes[axis]);range[axis][0]=Math.min(range[axis][0],d);range[axis][1]=Math.max(range[axis][1],d);}
  }
  return {alto:range.alto[1]-range.alto[0],ancho:range.ancho[1]-range.ancho[0]};
}

const fold=(text:string)=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const NAMES:Record<HardwareKind,(length:number|null)=>string>={
  hinge:()=>'Bisagra cazoleta 35 mm',
  runner:length=>length?`Par de correderas ${length} mm`:'Par de correderas (largo a definir)',
  handle:()=>'Tirador',
};
/** Fichas que pueden nombrar herrajes: las de la biblioteca menos las archivadas (que `catalog_load` también trae). */
export const activeCatalog=(items:HardwareCatalogItem[],archivedIds:readonly string[]=[])=>{const archived=new Set(archivedIds);return items.filter(item=>!archived.has(item.id));};
/** Ficha de herraje de la biblioteca: por palabra del nombre (y largo en correderas). Con varias, la favorita. */
export function matchFicha(items:HardwareCatalogItem[],kind:HardwareKind,lengthMm:number|null):{ficha:HardwareFicha|null;warning:string|null}{
  const words={hinge:/bisagra/,runner:/corredera/,handle:/tirador|manija/}[kind];
  let found=items.filter(item=>item.kind==='hardware'&&words.test(fold(item.name)));
  if(kind==='runner'){
    if(lengthMm==null)return {ficha:null,warning:'Sin largo de corredera'};
    found=found.filter(item=>item.lengthMm===lengthMm||new RegExp(`(?<!\\d)${lengthMm}(?!\\d)`).test(item.name));
  }
  if(found.length>1){const favorites=found.filter(item=>item.favorite);if(favorites.length===1)found=favorites;}
  if(found.length===1)return {ficha:{id:found[0].id,name:found[0].name,sku:found[0].sku||null},warning:null};
  if(!found.length)return {ficha:null,warning:'Sin ficha en la biblioteca'};
  return {ficha:null,warning:`${found.length} fichas posibles: marcá una como favorita`};
}

/**
 * Herrajes de las filas del listado (ya filtradas por mueble). `furniture`: los muebles generados, para medir el alto
 * de cada puerta y la profundidad de cada mueble; sin ellos se usa el lado más largo de la puerta y la corredera
 * queda sin largo.
 */
export function computeHardware(data:Pick<CutlistData,'pieces'>,furniture:Furniture[]=[],catalog:HardwareCatalogItem[]=[],roles:HardwareRoles={}):HardwareResult{
  const byId=new Map(furniture.map(f=>[f.id,f])),lines=new Map<string,HardwareLine>(),notes:string[]=[];
  // Un cajón se cuenta por su frente: si el mueble tiene «Fte» o «Frente cajón», la «Del Caj» es la delantera de la caja.
  const withFront=new Set(data.pieces.filter(piece=>FRONT.test(piece.name)).map(piece=>piece.furnitureId));
  const add=(kind:HardwareKind,lengthMm:number|null,piece:CutlistPiece,perPiece:number,ids:string[])=>{
    const key=`${kind}:${lengthMm??''}`;
    let line=lines.get(key);
    if(!line){const match=matchFicha(catalog,kind,lengthMm);line={key,kind,name:NAMES[kind](lengthMm),unit:kind==='runner'?'par':'u',lengthMm,quantity:0,...match,sources:[]};lines.set(key,line);}
    line.quantity+=perPiece*ids.length;
    const same=line.sources.find(source=>source.piece===piece&&source.perPiece===perPiece);
    if(same){same.quantity+=perPiece*ids.length;same.ids.push(...ids);}else line.sources.push({piece,ids:[...ids],perPiece,quantity:perPiece*ids.length});
  };
  for(const piece of data.pieces){
    // Cada pieza física: lo elegido en Piezas o, si no, el nombre («Del Caj» no suma si el mueble tiene «Fte»).
    const doors:string[]=[],drawers:string[]=[];
    for(const id of piece.ids){
      const chosen=roles[id];
      let role:HardwareRole|null=chosen==='none'?null:chosen||hardwareRole(piece.name);
      if(!chosen&&role==='drawer'&&!FRONT.test(piece.name)&&withFront.has(piece.furnitureId))role=null;
      if(role==='door')doors.push(id);else if(role==='drawer')drawers.push(id);
    }
    const f=byId.get(piece.furnitureId);
    if(doors.length){
      // Piezas iguales agrupadas en una fila pueden tener distinto alto en el mueble (una girada): se mide cada una.
      const counts=new Map<number,string[]>();
      for(const id of doors){
        const extent=f?pieceExtent(f,id):null,height=extent?extent.alto:piece.lengthMm,count=hingeCount(height);
        counts.set(count,[...(counts.get(count)||[]),id]);
        if(extent&&extent.ancho>extent.alto+1)notes.push(`${piece.name} (${piece.furnitureName}) es más ancha que alta: si es rebatible, las bisagras van arriba; revisá la cantidad.`);
      }
      if(!f)notes.push(`${piece.name} (${piece.furnitureName}): sin el mueble generado, las bisagras se cuentan por el lado más largo.`);
      for(const [count,ids] of counts)add('hinge',null,piece,count,ids);
      add('handle',null,piece,1,doors);
    }
    if(drawers.length){
      const depth=f?furnitureEnvelope(f)?.size.profundidad:undefined,length=depth==null?null:runnerLength(depth);
      if(depth==null)notes.push(`${piece.name} (${piece.furnitureName}): sin la profundidad del mueble no se elige el largo de la corredera.`);
      else if(length==null)notes.push(`${piece.furnitureName}: ${Math.round(depth)} mm de profundidad no alcanzan para una corredera de ${HARDWARE_RULES.runnerLengthsMm[0]} mm.`);
      if(depth==null||length!=null)add('runner',length,piece,1,drawers);
      add('handle',null,piece,1,drawers);
    }
  }
  const order:HardwareKind[]=['hinge','runner','handle'];
  return {lines:[...lines.values()].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)||(a.lengthMm??0)-(b.lengthMm??0)),notes:[...new Set(notes)]};
}

/** «Puerta ×2: 3 c/u» para la columna de origen. */
export function sourceText(source:HardwareSource):string{
  const count=source.quantity/source.perPiece;
  return `${source.piece.name}${count>1?` ×${count}`:''}${source.perPiece>1?`: ${source.perPiece} c/u`:''}`;
}

/** Piezas que por su forma y posición parecen puerta o frente de cajón (la misma clasificación de Sugerencias de
 * nombres, con el frente confirmado) pero su nombre no lo dice y no se eligió nada para ellas en Piezas. Una por fila
 * del listado y función. `unconfirmed`: muebles sin frente confirmado, donde no se puede sugerir. */
export type ShapeSuggestion={key:string;piece:CutlistPiece;ids:string[];role:HardwareRole;reason:string};
export function shapeSuggestions(furniture:Furniture[],rows:CutlistPiece[],roles:HardwareRoles={}):{suggestions:ShapeSuggestion[];unconfirmed:string[]}{
  const rowOf=new Map(rows.flatMap(row=>row.ids.map(id=>[id,row] as const))),found=new Map<string,ShapeSuggestion>(),unconfirmed:string[]=[];
  for(const f of furniture){
    if(!rows.some(row=>row.furnitureId===f.id))continue;
    const orientation=f.naming?.reference;
    if(!orientation?.confirmed){unconfirmed.push(rows.find(row=>row.furnitureId===f.id)!.furnitureName);continue;}
    for(const proposal of nameSuggestions(f,orientation,true)){
      const role=hardwareRole(proposal.base);
      if(!role)continue;
      for(const id of proposal.ids){
        const row=rowOf.get(id);
        if(!row||roles[id]||hardwareRole(row.name))continue;
        const key=`${row.id}:${role}`,entry=found.get(key);
        // Solo la primera frase: el resto del motivo habla de nombres, no de herrajes.
        if(entry)entry.ids.push(id);else found.set(key,{key,piece:row,ids:[id],role,reason:proposal.reason.split(/(?<=\.)\s/)[0]});
      }
    }
  }
  return {suggestions:[...found.values()],unconfirmed};
}
