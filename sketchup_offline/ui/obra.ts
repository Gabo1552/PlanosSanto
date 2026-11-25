// «Paquete de obra» (0.8.35): arma el JSON planos-santo.obra.v1 para el visor 3D de App Santo con lo mismo que
// ya tiene la ventana: el listado de Piezas (nombres de mueble y de pieza, códigos y material, igual que el CSV)
// y los muebles generados (matriz mundo y caja local de cada pieza, medidas totales como en las cotas del A4).
// Solo lectura: no pide nada a SketchUp; Ruby después lo compara con el modelo vigente y lo escribe.
import {bounds,type Furniture} from '../../lib/model';
import {moduleFromName} from '../../lib/naming';
import {OBRA_SCHEMA,obraSchema,type Obra,type ObraHerraje,type ObraPieza} from '../../lib/obra';
import {furnitureEnvelope} from '../../lib/scene';
import {hexColor,type CutlistData,type CutlistPiece} from './cutlistModel';
import {computeHardware,type HardwareCatalogItem} from './hardwareModel';

const STALE='El listado de Piezas no corresponde a los muebles generados: volvé a generar Piezas y exportá de nuevo.';
const round=(value:number,digits:number)=>{const factor=10**digits,result=Math.round(value*factor)/factor;return Object.is(result,-0)?0:result;};
/** Rotación y escala con 6 decimales (error < 0,01 mm a 10 m); traslación y medidas con 2 (centésima de mm). */
const roundMatrix=(m:number[])=>m.map((value,index)=>round(value,index>=12&&index<=14?2:6));
const roundVec=(v:number[])=>v.map(value=>round(value,2)) as [number,number,number];

/** `catalog`: fichas de la biblioteca para nombrar los herrajes calculados (0.8.36); sin ellas van con el nombre genérico. */
export type ObraInput={version:string;exportedAt:string;data:CutlistData;furniture:Furniture[];catalog?:HardwareCatalogItem[]};

/** Código de una pieza física: el de Ruby por pieza (`idCodes`); sin él, el de la fila solo si es de una pieza. */
function codeOf(piece:CutlistPiece,index:number):string{
  if(piece.idCodes&&piece.idCodes.length===piece.ids.length)return piece.idCodes[index]||'';
  return piece.ids.length===1?piece.code||'':'';
}

export function buildObra({version,exportedAt,data,furniture,catalog=[]}:ObraInput):Obra{
  const byId=new Map(furniture.map(f=>[f.id,f]));
  const colors=new Map(data.sections.map(section=>[section.key,hexColor(section.colorRgb)]));
  const rows=new Map<string,{piece:CutlistPiece;code:string}>();
  for(const piece of data.pieces)piece.ids.forEach((id,index)=>rows.set(id,{piece,code:codeOf(piece,index)}));
  let used=0;
  const muebles=data.furniture.map(entry=>{
    const f=byId.get(entry.id);
    if(!f)throw new Error(STALE);
    const piezas=f.pieces.map((p):ObraPieza=>{
      const row=rows.get(p.id);
      if(!row||row.piece.furnitureId!==entry.id)throw new Error(STALE);
      used++;
      const {piece}=row,box=bounds(p.mesh),material=piece.material;
      return {id:p.id,codigo:row.code,nombre:piece.name,
        material:material?{nombre:material.name||'Sin material',sku:material.sku||null,color:colors.get(piece.sectionKey)??null}:{nombre:'Sin material',sku:null,color:null},
        medidas:roundVec([piece.lengthMm,piece.widthMm,piece.thicknessMm]),
        caja:{min:roundVec(box.min.toArray()),max:roundVec(box.max.toArray())},transform:roundMatrix(p.transform)};
    });
    const herrajes=computeHardware({pieces:data.pieces.filter(piece=>piece.furnitureId===entry.id)},[f],catalog).lines.map((line):ObraHerraje=>({
      nombre:line.ficha?.name||line.name,sku:line.ficha?.sku||null,cantidad:line.quantity,unidad:line.unit,largo:line.lengthMm,
      piezas:[...new Set(line.sources.flatMap(source=>source.piece.ids))]}));
    return {id:entry.id,nombre:entry.name,codigo:f.naming?.moduleCode||moduleFromName(entry.name),medidas:totals(f),piezas,herrajes};
  });
  if(used!==rows.size)throw new Error(STALE);
  return obraSchema.parse({schema:OBRA_SCHEMA,version,modelo:data.modelName,exportado:exportedAt,unidades:'mm',muebles});
}

/** Alto, ancho y profundidad del mueble armado, los mismos de las cotas totales del A4 (lib/scene furnitureEnvelope). */
// Un mueble generado siempre tiene piezas (lib/model lo exige), así que la envolvente siempre existe.
function totals(f:Furniture){
  const size=furnitureEnvelope(f)?.size;
  if(!size)throw new Error(`El mueble «${f.name}» no tiene piezas con geometría.`);
  return {alto:round(size.alto,1),ancho:round(size.ancho,1),profundidad:round(size.profundidad,1)};
}

/** App Santo empareja los módulos por nombre: dos muebles con el mismo nombre no se pueden distinguir. */
export function obraNameIssues(obra:Obra):string[]{
  const count=new Map<string,number>();
  for(const m of obra.muebles)count.set(m.nombre,(count.get(m.nombre)||0)+1);
  return [...count].filter(([,n])=>n>1).map(([name,n])=>`Hay ${n} muebles llamados «${name}»: App Santo los empareja por nombre. Renombrá uno en Muebles antes de importar.`);
}
