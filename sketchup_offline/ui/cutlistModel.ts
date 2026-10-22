// Vista «Piezas»: lógica pura de filtros, secciones y totales sobre la respuesta de la acción Ruby `cutlist`.
// Sin React ni puente: la prueba vitest la ejercita directamente.

export type CutlistSide='arr'|'aba'|'izq'|'der';
export type CutlistEdgeStatus='catalog'|'observed'|'none'|'unknown';
export type CutlistEdge={side:CutlistSide;status:CutlistEdgeStatus;lengthMm:number;catalogId?:string;sku?:string|null;name?:string;observedIds?:string[]};
export type CutlistMaterial={source:'catalog'|'model'|'mixed';name:string;catalogId?:string;sku?:string|null;thicknessMm?:number|null;format?:[number,number]|null;grain?:boolean|null;observedId?:string;observedIds?:string[];category?:string;linked?:boolean};
export type CutlistGrain='length'|'width'|'none'|null;
export type CutlistPiece={id:string;ids:string[];code:string;codes:string[];name:string;furnitureId:string;furnitureName:string;quantity:number;
  lengthMm:number;widthMm:number;thicknessMm:number;rectangular:boolean;mirrored:boolean;material:CutlistMaterial|null;sectionKey:string;edges:CutlistEdge[];grain:CutlistGrain;notes:string[]};
export type CutlistSectionInfo={key:string;source:'catalog'|'model'|'mixed'|'none';name:string;thicknessMm:number;sku?:string|null;catalogId?:string|null;catalogThicknessMm?:number|null;format?:[number,number]|null;grain?:boolean|null};
export type CutlistData={schema:1;complete:boolean;readOnly:boolean;furniture:{id:string;name:string}[];sections:CutlistSectionInfo[];pieces:CutlistPiece[]};
export type CutlistFilter={furnitureId?:string;query?:string};
export type EdgeTotal={key:string;label:string;name:string;linked:boolean;metres:number};
export type SectionTotals={rows:number;pieces:number;areaM2:number;edges:EdgeTotal[]};
export type CutlistSection={info:CutlistSectionInfo;pieces:CutlistPiece[];totals:SectionTotals};

export const SIDES:CutlistSide[]=['arr','aba','izq','der'];
export const SIDE_LABELS:Record<CutlistSide,string>={arr:'Arriba',aba:'Abajo',izq:'Izquierda',der:'Derecha'};

const fold=(text:string)=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const round=(value:number,digits:number)=>{const factor=10**digits;return Math.round(value*factor)/factor;};

/** Mueble elegido y búsqueda por código o nombre, sin distinguir mayúsculas ni tildes. */
export function filterPieces(pieces:CutlistPiece[],filter:CutlistFilter={}):CutlistPiece[]{
  const query=fold(filter.query||'');
  return pieces.filter(piece=>(!filter.furnitureId||piece.furnitureId===filter.furnitureId)
    &&(!query||[piece.name,piece.code,...piece.codes].some(text=>fold(text).includes(query))));
}

/** Clave estable de un canto para sumar metros: la ficha si existe; si no, los materiales observados. */
export function edgeKey(edge:CutlistEdge):string|undefined{
  if(edge.status==='catalog'&&edge.catalogId)return `catalog:${edge.catalogId}`;
  if(edge.status==='observed'&&edge.observedIds?.length)return `model:${[...edge.observedIds].sort().join(',')}`;
  return undefined;
}

/** Texto del chip: el SKU (o el nombre) recortado; «—» si el lado no tiene canto. */
export function edgeLabel(edge:CutlistEdge,max=10):string{
  if(edge.status==='none'||edge.status==='unknown')return '—';
  const text=(edge.status==='catalog'&&edge.sku?edge.sku:edge.name||edge.sku||'').trim();
  if(!text)return '—';
  return text.length>max?`${text.slice(0,max-1).trimEnd()}…`:text;
}

export function edgeDescription(edge:CutlistEdge):string{
  const side=SIDE_LABELS[edge.side];
  if(edge.status==='catalog')return `${side}: ${edge.name||edge.sku}${edge.sku?` (${edge.sku})`:''}`;
  if(edge.status==='observed')return `${side}: ${edge.name} — pintado en el modelo, sin ficha de biblioteca`;
  if(edge.status==='none')return `${side}: sin canto`;
  return `${side}: sin canto observado (lado sin verificar)`;
}

/** Metros de canto por canto de un grupo de filas: largo del lado × cantidad. */
export function edgeTotals(pieces:CutlistPiece[]):EdgeTotal[]{
  const totals=new Map<string,EdgeTotal>();
  for(const piece of pieces)for(const edge of piece.edges){
    const key=edgeKey(edge);if(!key)continue;
    const entry=totals.get(key)||{key,label:edge.status==='catalog'&&edge.sku?edge.sku:edge.name||edge.sku||'',name:edge.name||edge.sku||'',linked:edge.status==='catalog',metres:0};
    entry.metres+=edge.lengthMm*piece.quantity/1000;totals.set(key,entry);
  }
  return [...totals.values()].map(entry=>({...entry,metres:round(entry.metres,2)})).sort((a,b)=>Number(b.linked)-Number(a.linked)||a.label.localeCompare(b.label,'es'));
}

export function sectionTotals(pieces:CutlistPiece[]):SectionTotals{
  return {rows:pieces.length,pieces:pieces.reduce((sum,piece)=>sum+piece.quantity,0),
    areaM2:round(pieces.reduce((sum,piece)=>sum+piece.lengthMm*piece.widthMm*piece.quantity/1e6,0),3),edges:edgeTotals(pieces)};
}

/** Secciones con filas visibles, en el orden que manda Ruby (fichas, modelo, mezcla, «Sin material»). */
export function buildSections(data:CutlistData,filter:CutlistFilter={}):CutlistSection[]{
  const visible=filterPieces(data.pieces,filter);
  const bySection=new Map<string,CutlistPiece[]>();
  for(const piece of visible){const list=bySection.get(piece.sectionKey)||[];list.push(piece);bySection.set(piece.sectionKey,list);}
  const known=new Set(data.sections.map(section=>section.key));
  // Una pieza con una sección que Ruby no listó no se pierde: va al final con lo que se sabe de ella.
  const orphans=[...bySection.keys()].filter(key=>!known.has(key)).map(key=>{const piece=bySection.get(key)![0];
    return {key,source:piece.material?.source||'none',name:piece.material?.name||'Sin material',thicknessMm:piece.thicknessMm} as CutlistSectionInfo;});
  return [...data.sections,...orphans].filter(info=>bySection.has(info.key)).map(info=>{const pieces=bySection.get(info.key)!;return {info,pieces,totals:sectionTotals(pieces)};});
}

export function grandTotals(sections:CutlistSection[]):{sections:number;rows:number;pieces:number;areaM2:number;edgeMetres:number}{
  return {sections:sections.length,rows:sections.reduce((sum,s)=>sum+s.totals.rows,0),pieces:sections.reduce((sum,s)=>sum+s.totals.pieces,0),
    areaM2:round(sections.reduce((sum,s)=>sum+s.totals.areaM2,0),3),edgeMetres:round(sections.reduce((sum,s)=>sum+s.totals.edges.reduce((acc,e)=>acc+e.metres,0),0),2)};
}

/** Códigos agrupados: «M01·P01» o «M01·P01, P02» (el prefijo del módulo se muestra una vez). */
export function codeText(piece:CutlistPiece,max=3):string{
  const codes=piece.codes.length?piece.codes:piece.code?[piece.code]:[];
  if(!codes.length)return '—';
  const prefix=codes[0].includes('·')?codes[0].slice(0,codes[0].indexOf('·')+1):'';
  const shown=codes.slice(0,max).map((code,index)=>index>0&&prefix&&code.startsWith(prefix)?code.slice(prefix.length):code);
  return shown.join(', ')+(codes.length>max?` +${codes.length-max}`:'');
}

const number=new Intl.NumberFormat('es-AR',{maximumFractionDigits:2});
const area=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatMm=(value:number)=>number.format(value);
export const formatM2=(value:number)=>area.format(value);
export const formatMetres=(value:number)=>area.format(value);
export function grainSymbol(grain:CutlistGrain):{symbol:string;label:string}{
  if(grain==='length')return {symbol:'↔',label:'Veta a lo largo'};
  if(grain==='width')return {symbol:'↕',label:'Veta a lo ancho'};
  if(grain==='none')return {symbol:'—',label:'Sin veta'};
  return {symbol:'—',label:'Veta sin definir en la ficha'};
}
export function sectionTitle(info:CutlistSectionInfo):string{return `${info.name} · ${formatMm(info.thicknessMm)} mm`;}
