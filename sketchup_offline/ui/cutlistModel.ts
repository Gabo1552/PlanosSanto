// Vista «Piezas»: lógica pura del listado (resumen por material, secciones de placas y de cantos,
// textos de celda, opciones y CSV) sobre la respuesta de la acción Ruby `cutlist`.
// Sin React ni puente: la prueba vitest la ejercita directamente.

export type CutlistSide='arr'|'aba'|'izq'|'der';
export type CutlistEdgeStatus='catalog'|'observed'|'none'|'unknown';
export type CutlistEdge={side:CutlistSide;status:CutlistEdgeStatus;lengthMm:number;catalogId?:string;sku?:string|null;name?:string;observedIds?:string[];edgeKey?:string};
/** Tira de canto de un lado: largo del lado, ancho de la ficha (o el espesor de la pieza, aproximado). */
export type CutlistStrip={side:CutlistSide;label:string;edgeKey:string;lengthMm:number;widthMm:number;widthApprox:boolean;approximate:boolean};
/** Biblioteca v4 (0.8.20): una ficha de placa trae sus espesores (`thicknessesMm`), no uno solo. */
export type CutlistMaterial={source:'catalog'|'model'|'mixed';name:string;catalogId?:string;sku?:string|null;thicknessMm?:number|null;thicknessesMm?:number[];format?:[number,number]|null;grain?:boolean|null;observedId?:string;observedIds?:string[];category?:string;linked?:boolean};
export type CutlistGrain='length'|'width'|'none'|null;
/** 0.8.26: veta de la pieza (Grain en Ruby). `grainAxis`: eje local; `grainSource`: automática o elegida en Piezas;
 * `grainDirection`: sentido en el mueble; `grainReview`: caso ambiguo para confirmar; `grainBlock`: por qué no se puede girar. */
export type CutlistGrainInfo={grainAxis?:number|null;grainSource?:'auto'|'manual'|null;grainDirection?:'vertical'|'horizontal'|null;grainReview?:string|null;grainBlock?:string|null};
/** `thicknessMm`: espesor real de la pieza (eje menor), el que separa las secciones y usa la maderera; `thicknessInList`: si está
 * entre los de la ficha (null sin ficha de placa). */
export type CutlistPiece={id:string;ids:string[];code:string;codes:string[];name:string;furnitureId:string;furnitureName:string;quantity:number;
  lengthMm:number;widthMm:number;thicknessMm:number;thicknessInList?:boolean|null;rectangular:boolean;mirrored:boolean;material:CutlistMaterial|null;sectionKey:string;edges:CutlistEdge[];strips:CutlistStrip[];grain:CutlistGrain;notes:string[]}&CutlistGrainInfo;
export type SheetTotals={pieces:number;lengthM:number;areaM2:number;volumeM3:number};
export type EdgeTotals={strips:number;lengthM:number;areaM2:number;volumeM3:number|null};
export type CutlistSectionInfo={key:string;source:'catalog'|'model'|'mixed'|'none';kind:'sheet'|'hardware'|'unknown';name:string;thicknessMm:number;sku?:string|null;catalogId?:string|null;
  catalogThicknessMm?:number|null;standardThicknessesMm?:number[]|null;thicknessInList?:boolean|null;format?:[number,number]|null;grain?:boolean|null;colorRgb?:number[]|null;missing:string[];totals?:SheetTotals};
export type CutlistEdgeSectionInfo={key:string;source:'catalog'|'model';kind:'edge';name:string;sku?:string|null;catalogId?:string|null;observedIds?:string[];
  thicknessMm:number|null;widthMm:number|null;widthsMm?:number[];colorRgb?:number[]|null;missing:string[];widthApprox?:boolean;totals?:EdgeTotals};
export type CutlistData={schema:1;complete:boolean;readOnly:boolean;modelName:string;unit:'mm';furniture:{id:string;name:string}[];
  sections:CutlistSectionInfo[];edgeSections:CutlistEdgeSectionInfo[];pieces:CutlistPiece[]};
export type CutlistFilter={furnitureId?:string;query?:string};
export type CutlistSection={info:CutlistSectionInfo;pieces:CutlistPiece[];totals:SheetTotals};
export type StripRow={key:string;letter:string;piece:CutlistPiece;strip:CutlistStrip};
export type CutlistEdgeSection={info:CutlistEdgeSectionInfo;rows:StripRow[];totals:EdgeTotals};
export type SummaryKind='sheet'|'edge'|'hardware'|'unknown';
/** Fila de la tabla resumen: una por sección de placa, de canto o sin tipo, con sus Σ. */
export type SummaryRow={key:string;kind:SummaryKind;name:string;thicknessMm:number|null;widthMm:number|null;widthApprox:boolean;color:string|null;
  warnings:string[];catalogId:string|null;count:number;lengthM:number;areaM2:number|null;volumeM3:number|null};

export const SIDES:CutlistSide[]=['arr','aba','izq','der'];
export const KIND_LABELS:Record<SummaryKind,string>={hardware:'Herraje',sheet:'Placa',edge:'Canto',unknown:'Sin tipo definido'};

const fold=(text:string)=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const round=(value:number,digits:number)=>{const factor=10**digits;return Math.round(value*factor)/factor;};

/** Mueble elegido y búsqueda por código o nombre, sin distinguir mayúsculas ni tildes. */
export function filterPieces(pieces:CutlistPiece[],filter:CutlistFilter={}):CutlistPiece[]{
  const query=fold(filter.query||'');
  return pieces.filter(piece=>(!filter.furnitureId||piece.furnitureId===filter.furnitureId)
    &&(!query||[piece.name,piece.code,...piece.codes].some(text=>fold(text).includes(query))));
}

/** Σ de placas con las mismas cuentas que Ruby (Cutlist.sheet_totals): medidas finales × cantidad. Ruby redondea su
 * contrato a milésimas; acá se guarda la precisión para no redondear dos veces al mostrar. */
export function sheetTotals(pieces:CutlistPiece[]):SheetTotals{
  const sum=(value:(piece:CutlistPiece)=>number)=>pieces.reduce((total,piece)=>total+value(piece)*piece.quantity,0);
  return {pieces:sum(()=>1),lengthM:round(sum(p=>p.lengthMm)/1000,6),areaM2:round(sum(p=>p.lengthMm*p.widthMm)/1e6,6),volumeM3:round(sum(p=>p.lengthMm*p.widthMm*p.thicknessMm)/1e9,9)};
}

/** Σ de un canto (Cutlist.edge_sections): tiras, metros, m² con el ancho de cada tira y m³ si la ficha tiene espesor. */
export function edgeTotals(rows:StripRow[],thicknessMm:number|null):EdgeTotals{
  const area=rows.reduce((total,{piece,strip})=>total+strip.lengthMm*strip.widthMm*piece.quantity,0);
  return {strips:rows.reduce((total,{piece})=>total+piece.quantity,0),lengthM:round(rows.reduce((total,{piece,strip})=>total+strip.lengthMm*piece.quantity,0)/1000,6),
    areaM2:round(area/1e6,6),volumeM3:thicknessMm==null?null:round(area*thicknessMm/1e9,9)};
}

/** Letras de fila como en una lista de corte: A…Z, AA, AB… */
export function rowLetter(index:number):string{
  let text='',value=index+1;
  while(value>0){const rest=(value-1)%26;text=String.fromCharCode(65+rest)+text;value=Math.floor((value-1)/26);}
  return text;
}

/** Secciones de placas con filas visibles, en el orden que manda Ruby (fichas, modelo, mezcla, «Sin material»). */
export function buildSections(data:CutlistData,filter:CutlistFilter={}):CutlistSection[]{
  const visible=filterPieces(data.pieces,filter);
  const bySection=new Map<string,CutlistPiece[]>();
  for(const piece of visible){const list=bySection.get(piece.sectionKey)||[];list.push(piece);bySection.set(piece.sectionKey,list);}
  const known=new Set(data.sections.map(section=>section.key));
  // Una pieza con una sección que Ruby no listó no se pierde: va al final con lo que se sabe de ella.
  const orphans=[...bySection.keys()].filter(key=>!known.has(key)).map(key=>{const piece=bySection.get(key)![0];
    return {key,source:piece.material?.source||'none',kind:'unknown',name:piece.material?.name||'Sin material',thicknessMm:piece.thicknessMm,missing:[]} as CutlistSectionInfo;});
  return [...data.sections,...orphans].filter(info=>bySection.has(info.key)).map(info=>{const pieces=bySection.get(info.key)!;return {info,pieces,totals:sheetTotals(pieces)};});
}

/** Una sección por canto con una fila por tira (pieza × lado), en el orden de las piezas. */
export function buildEdgeSections(data:CutlistData,filter:CutlistFilter={}):CutlistEdgeSection[]{
  const visible=filterPieces(data.pieces,filter);
  const byKey=new Map<string,{piece:CutlistPiece;strip:CutlistStrip}[]>();
  for(const piece of visible)for(const side of SIDES)for(const strip of (piece.strips||[]).filter(item=>item.side===side)){
    const list=byKey.get(strip.edgeKey)||[];list.push({piece,strip});byKey.set(strip.edgeKey,list);
  }
  const known=new Set((data.edgeSections||[]).map(section=>section.key));
  const orphans=[...byKey.keys()].filter(key=>!known.has(key)).map(key=>{const {piece,strip}=byKey.get(key)![0];const edge=piece.edges.find(item=>item.side===strip.side);
    return {key,source:key.startsWith('catalog:')?'catalog':'model',kind:'edge',name:edge?.name||edge?.sku||'Canto',thicknessMm:null,widthMm:null,missing:['ficha']} as CutlistEdgeSectionInfo;});
  return [...(data.edgeSections||[]),...orphans].filter(info=>byKey.has(info.key)).map(info=>{
    const rows=byKey.get(info.key)!.map((entry,index)=>({key:`${entry.piece.id}:${entry.strip.side}`,letter:rowLetter(index),...entry}));
    return {info,rows,totals:edgeTotals(rows,info.thicknessMm)};
  });
}

const MISSING:Record<string,string>={ficha:'Sin ficha en la biblioteca',SKU:'SKU no definido',espesor:'Espesor no definido',largo:'Largo no definido',ancho:'Ancho no definido',veta:'Veta no definida',tipo:'Tipo no definido'};
/** Avisos rojos de la fila: lo que le falta a la ficha (CatalogStore.missing). */
export const missingLabels=(missing:string[]|undefined)=>(missing||[]).map(key=>MISSING[key]||`${key[0]?.toUpperCase()||''}${key.slice(1)} no definido`);

export const hexColor=(color?:number[]|null)=>color?.length===3&&color.every(value=>Number.isInteger(value)&&value>=0&&value<=255)?`#${color.map(value=>value.toString(16).padStart(2,'0')).join('')}`:null;

/** Tabla resumen: placas, después cantos y al final lo que no tiene tipo («?»), como en el listado. */
export function summaryRows(sections:CutlistSection[],edges:CutlistEdgeSection[]):SummaryRow[]{
  const sheet=(section:CutlistSection):SummaryRow=>{const {info,totals}=section;const known=info.kind==='sheet';
    return {key:info.key,kind:info.kind==='hardware'?'hardware':known?'sheet':'unknown',name:info.name,thicknessMm:info.kind==='hardware'?null:info.thicknessMm,widthMm:null,widthApprox:false,color:hexColor(info.colorRgb),
      warnings:missingLabels(info.missing),catalogId:info.catalogId||null,count:totals.pieces,lengthM:totals.lengthM,areaM2:known?totals.areaM2:null,volumeM3:known?totals.volumeM3:null};};
  // Sin ancho en la ficha se muestra el de las tiras (espesor de la pieza) si es uno solo, marcado como aproximado.
  const uniform=(rows:StripRow[])=>{const widths=[...new Set(rows.map(row=>row.strip.widthMm))];return widths.length===1?widths[0]:null;};
  const edge=({info,rows,totals}:CutlistEdgeSection):SummaryRow=>({key:info.key,kind:'edge',name:info.name,thicknessMm:info.thicknessMm,widthMm:info.widthMm??uniform(rows),widthApprox:info.widthMm==null,
    color:hexColor(info.colorRgb),warnings:missingLabels(info.missing),catalogId:info.catalogId||null,count:totals.strips,lengthM:totals.lengthM,areaM2:totals.areaM2,volumeM3:totals.volumeM3});
  return [...sections.filter(s=>s.info.kind==='sheet').map(sheet),...edges.map(edge),...sections.filter(s=>s.info.kind!=='sheet').map(sheet)];
}

/** Códigos agrupados: «M01·P01» o «M01·P01, P02» (el prefijo del módulo se muestra una vez). */
export function codeText(piece:CutlistPiece,max=3):string{
  const codes=piece.codes.length?piece.codes:piece.code?[piece.code]:[];
  if(!codes.length)return '';
  const prefix=codes[0].includes('·')?codes[0].slice(0,codes[0].indexOf('·')+1):'';
  const shown=codes.slice(0,max).map((code,index)=>index>0&&prefix&&code.startsWith(prefix)?code.slice(prefix.length):code);
  return shown.join(', ')+(codes.length>max?` +${codes.length-max}`:'');
}

const number=new Intl.NumberFormat('es-AR',{maximumFractionDigits:2,useGrouping:false});
const two=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const three=new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3});
export const formatMm=(value:number)=>number.format(value);
export const formatMetres=(value:number)=>`${two.format(value)} m`;
export const formatM2=(value:number)=>`${two.format(value)} m²`;
export const formatM3=(value:number)=>`${three.format(value)} m³`;
/** Medida final en mm; «~» delante si sale de la caja de una pieza no rectangular. */
export const finalMm=(value:number,approximate=false)=>`${approximate?'~ ':''}${formatMm(value)} mm`;
export const dimensions=(piece:CutlistPiece)=>`${formatMm(piece.lengthMm)} × ${formatMm(piece.widthMm)} × ${formatMm(piece.thicknessMm)}`;

/** Detalle chico de la designación: códigos, mueble, medidas y material. */
export function designationDetail(piece:CutlistPiece,info?:{name:string}):string{
  return [codeText(piece),piece.furnitureName,dimensions(piece),info?.name||piece.material?.name||'Sin material'].filter(Boolean).join(' · ');
}
export const stripDesignation=(piece:CutlistPiece,strip:CutlistStrip)=>`${piece.name} – ${strip.label}`;

/** Título de la sección de placa: «Nombre / 18 mm». */
export const sectionTitle=(info:{name:string;thicknessMm:number|null})=>info.thicknessMm==null?info.name:`${info.name} / ${formatMm(info.thicknessMm)} mm`;
/** Nota de fibra de la ficha: solo para placas con veta. */
export function grainNote(info:CutlistSectionInfo,pieces:CutlistPiece[]):string|undefined{
  if(info.grain!==true)return undefined;
  return pieces.some(piece=>piece.grain==='width')?'La fibra sigue la longitud, salvo donde se indica':'La fibra sigue la longitud';
}

/** Indicador de veta de la fila (columna Veta): ↕ vertical o ↔ horizontal en el mueble, «auto» o «manual». null: la placa no tiene veta. */
export type GrainCell={symbol:'↕'|'↔';direction:string;source:'auto'|'manual';label:string;review:string|null;block:string|null};
export function grainCell(piece:CutlistPiece):GrainCell|null{
  if(piece.grain!=='length'&&piece.grain!=='width')return null;
  const vertical=piece.grainDirection==='vertical',source=piece.grainSource==='manual'?'manual':'auto';
  const direction=piece.grainDirection?vertical?'vertical':'horizontal':'sin leer';
  const along=piece.grain==='width'?'a lo ancho':'a lo largo';
  return {symbol:vertical?'↕':'↔',direction,source,label:`Veta ${direction} (${along}, ${source==='manual'?'elegida a mano':'automática'})`,review:piece.grainReview||null,block:piece.grainBlock||null};
}
/** Mensaje después de girar o volver a automática la veta de una fila (acción Ruby `piece_grain`). */
export function grainNotice(mode:'rotate'|'auto',count:number,warnings:string[]=[]):string{
  const pieces=count===1?'1 pieza':`${formatMm(count)} piezas`;
  return [`${mode==='rotate'?'Veta girada 90°':'Veta automática'} en ${pieces}. Ctrl+Z en SketchUp lo deshace.`,...warnings].join(' ');
}

// Opciones de la vista (por usuario, en el navegador): columnas del resumen y detalle de la designación.
export type CutlistOptions={length:boolean;area:boolean;volume:boolean;detail:boolean};
export const DEFAULT_OPTIONS:CutlistOptions={length:true,area:true,volume:true,detail:true};
export function parseOptions(raw:string|null|undefined):CutlistOptions{
  try{
    const value=raw?JSON.parse(raw):null;if(!value||typeof value!=='object')return {...DEFAULT_OPTIONS};
    return Object.fromEntries(Object.entries(DEFAULT_OPTIONS).map(([key,fallback])=>[key,typeof value[key]==='boolean'?value[key]:fallback])) as CutlistOptions;
  }catch{return {...DEFAULT_OPTIONS};}
}

// CSV para planilla: separador «;» y coma decimal (Excel en español), CRLF y texto protegido contra fórmulas.
const csvNumber=new Intl.NumberFormat('es-AR',{maximumFractionDigits:3,useGrouping:false});
function csvCell(value:string|number|null|undefined):string{
  if(value==null)return '';
  if(typeof value==='number')return csvNumber.format(value);
  const text=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;
  return /[;"\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
export const CSV_HEADER=['Tipo','Material','Espesor material (mm)','No.','Designación','Mueble','Código','Cant.','L (mm)','A (mm)','E (mm)','Aproximada','Aviso de la ficha'];
/** CSV de lo que se ve: una fila por pieza de cada placa y una por tira de cada canto. */
export function cutlistCsv(sections:CutlistSection[],edges:CutlistEdgeSection[]):string{
  const lines:(string|number|null)[][]=[CSV_HEADER];
  const sheets=[...sections.filter(s=>s.info.kind==='sheet'),...sections.filter(s=>s.info.kind!=='sheet')];
  for(const {info,pieces} of sheets){const warning=missingLabels(info.missing).join(', ');
    pieces.forEach((piece,index)=>lines.push([info.kind==='sheet'?'Placa':'Sin tipo',info.name,info.thicknessMm,rowLetter(index),piece.name,piece.furnitureName,codeText(piece,99),piece.quantity,
      piece.lengthMm,piece.widthMm,piece.thicknessMm,piece.rectangular?'No':'Sí',warning]));}
  for(const {info,rows} of edges){const warning=missingLabels(info.missing).join(', ');
    for(const {letter,piece,strip} of rows)lines.push(['Canto',info.name,info.thicknessMm,letter,stripDesignation(piece,strip),piece.furnitureName,codeText(piece,99),piece.quantity,
      strip.lengthMm,strip.widthMm,info.thicknessMm,strip.approximate||strip.widthApprox?'Sí':'No',warning]);}
  return lines.map(line=>line.map(csvCell).join(';')).join('\r\n')+'\r\n';
}

// «Ver en SketchUp» (0.8.20): clic en una fila → acción Ruby `piece_highlight` con todas las instancias de la fila,
// selección y encuadre de la cámara. Clics sucesivos (o ‹ ›) recorren las instancias de a una.
export type CutlistHighlightContext='kept'|'opened'|'mixed'|'unavailable';
/** Respuesta de Ruby (`highlight` de `piece_highlight` con `frame`). */
export type CutlistHighlight={pieceIds:string[];missing:string[];count:number;total:number;focus:number|null;selected:number;context:CutlistHighlightContext;framed:boolean;canRestore?:boolean};

/** Siguiente paso del recorrido: todas (null) → 1 → 2 → … → n → todas; hacia atrás al revés. */
export function nextFocus(current:number|null,total:number,step:1|-1):number|null{
  if(total<2)return null;
  if(current==null)return step===1?0:total-1;
  const next=current+step;
  return next<0||next>=total?null:next;
}
/** Rótulo del recorrido: «Todas (4)» o «2 de 4». */
export const focusLabel=(focus:number|null,total:number)=>focus==null?`Todas (${total})`:`${focus+1} de ${total}`;

/** Aviso de la fila después de mostrar la pieza en SketchUp. */
export function highlightNotice(result:CutlistHighlight):string{
  const one=result.focus!=null||result.count===1;
  const parts=[`${one?'Pieza resaltada':`${result.count} piezas resaltadas`}${result.framed?` y ${one?'encuadrada':'encuadradas'}`:''} en SketchUp.`];
  if(!result.framed)parts.push('No se pudo mover la cámara: buscala por el contorno rojo.');
  if(result.focus==null&&result.context==='mixed')parts.push('Están en módulos distintos: con ‹ › se seleccionan de a una.');
  if(result.context==='unavailable')parts.push('No se pudo abrir el grupo que la contiene: quedó marcada sin seleccionar.');
  if(result.missing.length)parts.push(`${result.missing.length===1?'1 pieza ya no está':`${result.missing.length} piezas ya no están`} en el modelo: tocá Generar para volver a leer.`);
  return parts.join(' ');
}
