import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Color } from 'three';
import { makeScene, guideViews, type View } from '../../lib/scene';
import { mm, type Furniture, type Project } from '../../lib/model';
import {pieceRows,groupedNameIssues,identicalGroups,type PieceRow} from '../../lib/pieceGroups';
import { sheetEntries } from '../../lib/sheet';
import { DIMENSION_FONT_SIZE,dimensionCaption } from '../../lib/dimensions';
import release from '../version.json';
const {version}=release;

export const A4_LANDSCAPE_MM={width:297,height:210} as const;
const MM=72/25.4, PAGE_W=A4_LANDSCAPE_MM.width*MM, PAGE_H=A4_LANDSCAPE_MM.height*MM;
const INK=rgb(8/255,12/255,46/255),BLUE=rgb(31/255,77/255,120/255),GRAY=rgb(0.32,0.39,0.46);
const TEAL=rgb(7/255,54/255,62/255),RULE=rgb(0.72,0.77,0.82),WHITE=rgb(1,1,1),AMBER=rgb(0.6,0.36,0),BAND=rgb(0.87,0.91,0.94);

type Fonts={regular:PDFFont;mono:PDFFont};

export function decode64(value:string):Uint8Array{
  return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
export function encode64(bytes:Uint8Array):string{
  let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
export type A4FitKind='table'|'legend'|'scale'|'header'|'glyph'|'names'|'size'|'view'|'order'|'empty';
const FIT_ACTIONS:Partial<Record<A4FitKind,string>>={table:'Agrupá piezas iguales o acortá sus nombres.',legend:'Acortá observaciones o notas.',scale:'Pasá a 1 vista.',header:'Acortá el nombre del mueble o del proyecto.',names:'Completá el nombre de cada pieza.',size:'Reducí la cantidad de muebles por PDF.',view:'Corregí lo indicado en el editor de la guía y volvé a revisar la hoja.',order:'Desactivá Agrupar componentes iguales en este mueble o igualá su asignación en Biblioteca y pedidos.',empty:'Marcá al menos un mueble y generá su guía.'};
/** Layout infeasibility: `reason` is the cause, `action` the fix, `detail` the numbers. The same text reaches the preview and the export notice. */
export class A4FitError extends Error{
  /** `furniture` is the printed name; `furnitureId` the instance path that lets the editor open the furniture that fails. */
  furniture:string;furnitureId?:string;reason:string;kind:A4FitKind;action?:string;character?:string;detail?:string;
  constructor(message:string|undefined,{furniture='',furnitureId,reason,kind,action,character,detail}:{furniture?:string;furnitureId?:string;reason:string;kind:A4FitKind;action?:string;character?:string;detail?:string}){
    super('');this.name='A4FitError';this.furniture=furniture;this.furnitureId=furnitureId;this.reason=reason;this.kind=kind;this.character=character;this.detail=detail;
    this.action=action??(kind==='glyph'&&character?`Reemplazá el carácter «${character}».`:FIT_ACTIONS[kind]);
    this.message=message||this.compose();
  }
  /** `${mueble}: ${causa} ${detalle} Qué hacer: ${acción}` */
  compose(){return `${this.furniture?`${this.furniture}: `:''}${this.reason}${this.detail?` ${this.detail}`:''}${this.action?` Qué hacer: ${this.action}`:''}`;}
}
function ensureGlyphs(font:PDFFont,text:string){
  const available=new Set(font.getCharacterSet());
  // Tab and CR (pasted from a spreadsheet, CRLF notes) are whitespace, not glyphs: they print as a space.
  for(const char of text)if(!'\n\t\r'.includes(char)&&!available.has(char.codePointAt(0)!))throw new A4FitError(undefined,{reason:`El PDF no puede representar el carácter «${char}».`,kind:'glyph',character:char});
}
/** One row of the reviewed supplier order. A plain string is the legacy text-only contract. */
/** `code` is the module·piece code of the saved guide (OrderProposal.codes, the TXT detail code). `lot` is the 1-based supplier TXT lot (board, thickness and edge roles); `grain` the board grain (true: runs along `base`). */
export type OrderReference={text:string;board?:string;edgeMap?:number[];principal?:string|null;secondary?:string|null;base?:number;height?:number;lot?:number;grain?:boolean|null;code?:string};
export type OrderReferences=Record<string,string|OrderReference>;
/** F-DESP-B (`order_references_partial`): rows that validate, included rows still under review and excluded rows. */
export type PartialReferences={references:Record<string,OrderReference>;pending:string[];excluded:string[]};
export function orderReference(value:string|OrderReference|undefined|null):OrderReference|undefined{
  if(value===undefined||value===null||value==='')return undefined;
  return typeof value==='string'?{text:value}:value;
}
/** Structured rows carry the TXT's edge map: Arr·Aba·Izq·Der over the order's base × height. */
export function hasEdgeMap(reference?:OrderReference):reference is OrderReference&{edgeMap:number[]}{
  return !!reference&&Array.isArray(reference.edgeMap)&&reference.edgeMap.length===4&&reference.edgeMap.every(v=>v===0||v===1||v===2);
}
export const edgeCode=(reference?:OrderReference)=>hasEdgeMap(reference)?reference.edgeMap.join('·'):'';
const plainMm=(n:number)=>Number(n.toFixed(2)).toLocaleString('es-AR',{maximumFractionDigits:2,useGrouping:false});
export function boardLine(reference:OrderReference){
  const board=reference.board||reference.text;
  return typeof reference.base==='number'&&typeof reference.height==='number'?`${board} · corte ${plainMm(reference.base)} × ${plainMm(reference.height)}`:board;
}
const referenceKey=(reference?:OrderReference)=>reference?JSON.stringify([reference.board??reference.text,reference.edgeMap??null,reference.principal??null,reference.secondary??null,reference.base??null,reference.height??null]):'';
const normalName=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
/** `pending`: no order assignment yet, but the row is included in the order and still under review (F-DESP-B). */
export type ListRow={piece:PieceRow;reference?:OrderReference;also:string[];pending?:boolean};
/** `pending`: piece ids included in the order whose rows are still under review. */
export type A4Options={pending?:readonly string[]};
/** One printed page: `label` is «3» for a single-page furniture, «3a», «3b»… when it has a hoja 2. */
export type A4Page={furnitureId:string;name:string;label:string};
export const PENDING_TEXT='pendiente de pedido';
const PENDING_LEGEND={full:'Pendiente de pedido: la fila sigue en revisión en Biblioteca y pedidos; se imprime sin placa ni cantos.',compact:'Pendiente de pedido: sin placa ni cantos hasta revisarla.'};
const HOJA2_ACTION='También podés activar «Permitir hoja 2: despiece completo» en Vistas de la guía A4.';
/**
 * Rows of the printed list. Identical instances may share a row only with the same order assignment;
 * with `foldTable` rows with equal measures, material, order assignment and name are folded too (codes stay in the drawing).
 */
export function listRows(f:Furniture,references?:OrderReferences,fold=!!f.presentation?.guide?.foldTable,pending?:readonly string[]):ListRow[]{
  const codes=new Map(f.pieces.map(p=>[p.id,p.code])),waiting=new Set(pending||[]);
  const rows=pieceRows(f).map(piece=>{
    const assigned=references?piece.memberIds.map(id=>orderReference(references[id])):[];
    // A grouped row with a member still under review prints as pending: its order data is not final for any of them.
    if(piece.memberIds.some(id=>waiting.has(id)&&!assigned[piece.memberIds.indexOf(id)]))return {piece,reference:undefined,also:[] as string[],pending:true};
    const keys=assigned.map(referenceKey),other=keys.findIndex(key=>key!==keys[0]);
    if(other>0){
      const a=codes.get(piece.memberIds[0])||piece.code,b=codes.get(piece.memberIds[other])||piece.memberIds[other];
      throw new A4FitError(undefined,{furniture:f.name,furnitureId:f.id,kind:'order',reason:a===b?`${a}: las piezas agrupadas tienen placa o cantos distintos en el pedido.`:`${a} y ${b} comparten el ID ${piece.code} pero tienen placa o cantos distintos en el pedido.`});
    }
    return {piece,reference:assigned[0],also:[] as string[],pending:!assigned[0]&&piece.memberIds.some(id=>waiting.has(id))};
  });
  if(!fold)return rows;
  const folded=new Map<string,ListRow>();
  for(const row of rows){
    const {piece}=row,material=piece.metadata?.material;
    const key=JSON.stringify([piece.dimensions.map(d=>Math.round(d*10)/10),material?material.id||material.name:null,referenceKey(row.reference),!!row.pending,normalName(piece.name)]);
    const match=folded.get(key);
    if(!match){folded.set(key,{...row,piece:{...piece,memberIds:[...piece.memberIds]}});continue;}
    match.piece.quantity+=piece.quantity;match.piece.memberIds.push(...piece.memberIds);
    if(piece.code!==match.piece.code&&!match.also.includes(piece.code))match.also.push(piece.code);
  }
  return [...folded.values()];
}
/** One spreadsheet cell: no tabs or line breaks, and text that a spreadsheet would evaluate as a formula is quoted. */
export function tsvCell(value:string){const flat=value.replace(/[\t\r\n]+/g,' ').trim();return /^[=+\-@]/.test(flat)?`'${flat}`:flat;}
/**
 * Tab separated list for a spreadsheet or a message: the same rows, quantities and order validation as the printed list
 * (with «Agrupar por medidas» the folded codes go in «También»), decimal comma. Throws the A4FitError of listRows.
 */
export function exportTableTsv(project:Project,references?:OrderReferences,pending?:readonly string[]):{text:string;rows:number;furniture:number}{
  const withOrder=!!references,listed=project.furniture.map(f=>({f,rows:listRows(f,references,undefined,pending)})),folded=listed.some(({rows})=>rows.some(r=>r.also.length));
  const lines=[['Mueble','ID','Nombre','Largo','Ancho','Esp.','Cant.',...(folded?['También']:[]),...(withOrder?['Placa','Cantos']:[])].join('\t')];
  for(const {f,rows} of listed)for(const {piece,reference,also,pending:waiting} of rows){
    lines.push([tsvCell(f.name),tsvCell(piece.code),tsvCell(piece.name),...piece.dimensions.map(plainMm),String(piece.quantity),
      ...(folded?[tsvCell(also.join(', '))]:[]),...(withOrder?[tsvCell(reference?reference.board||reference.text:''),waiting?PENDING_TEXT:edgeCode(reference)]:[])].join('\t'));
  }
  return {text:lines.join('\r\n')+'\r\n',rows:lines.length-1,furniture:project.furniture.length};
}
/** How many printed pieces carry an order assignment and, given `pending`, how many are still under review without one. */
export function referenceCoverage(project:Project,references?:OrderReferences):{covered:number;total:number};
export function referenceCoverage(project:Project,references:OrderReferences|undefined,pending:readonly string[]):{covered:number;pending:number;total:number};
export function referenceCoverage(project:Project,references?:OrderReferences,pending?:readonly string[]){
  const ids=project.furniture.flatMap(f=>f.pieces.map(p=>p.id)),waiting=new Set(pending||[]);
  const covered=references?ids.filter(id=>orderReference(references[id])).length:0;
  if(!pending)return {covered,total:ids.length};
  return {covered,pending:ids.filter(id=>waiting.has(id)&&!orderReference(references?.[id])).length,total:ids.length};
}
/** Workshop-friendly download name: '<obra>-<mueble si es uno solo>-A4-AAAA-MM-DD.pdf'. */
export function previewFileName(project:Pick<Project,'name'|'furniture'>,date=new Date()):string{
  const clean=(value:string)=>value.normalize('NFC').replace(/[/\\:*?"<>|\u0000-\u001f]+/g,' ').trim().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'');
  const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parts=[clean(project.name||''),project.furniture.length===1?clean(project.furniture[0].name||''):''].filter(Boolean);
  const base=Array.from(parts.join('-')||'PlanosSanto').slice(0,80).join('').replace(/[-.]+$/,'')||'PlanosSanto';
  return `${base}-A4-${day}.pdf`;
}
function linesFor(text:string,width:number,font:PDFFont,size:number):string[]{
  ensureGlyphs(font,text);
  const result:string[]=[];
  for(const paragraph of text.split('\n')){
    let current='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(font.widthOfTextAtSize((current+' '+word).trim(),size)<=width){current=(current+' '+word).trim();continue;}
      if(current){result.push(current);current='';}
      for(const char of word){if(current&&font.widthOfTextAtSize(current+char,size)>width){result.push(current);current='';}current+=char;}
    }
    result.push(current);
  }
  return result;
}
function text(page:PDFPage,value:string,x:number,top:number,size:number,font:PDFFont,color=INK){
  ensureGlyphs(font,value);page.drawText(value.replace(/[\t\r\n]/g,' '),{x,y:PAGE_H-top-size,size,font,color});
}
function line(page:PDFPage,x1:number,y1:number,x2:number,y2:number,color=BLUE,width=0.7){
  page.drawLine({start:{x:x1,y:PAGE_H-y1},end:{x:x2,y:PAGE_H-y2},color,thickness:width});
}
/** Match the SVG viewer's CSS colors, including modern space-separated hsl/rgb. */
export function pdfFaceColor(fill:string){
  const css=fill.replace(/^(rgb|hsl)\(([^)]+)\)$/i,(_match,kind:string,channels:string)=>`${kind}(${channels.trim().replace(/\s*,\s*|\s+/g,',')})`);
  const color=new Color().setStyle(css).convertLinearToSRGB();
  return rgb(color.r,color.g,color.b);
}
type DiagramBox={x:number;top:number;width:number;height:number};
function diagram(page:PDFPage,f:Furniture,fonts:Fonts,view:View,scene:ReturnType<typeof makeScene>,box:DiagramBox){
  const SCALE=box.width/scene.width;
  const diagramX=box.x,diagramTop=box.top;
  const x=(n:number)=>diagramX+n*SCALE,y=(n:number)=>diagramTop+n*SCALE;
  const segment=(a:{x:number;y:number},b:{x:number;y:number},width=0.8,color=BLUE)=>line(page,x(a.x),y(a.y),x(b.x),y(b.y),color,width*SCALE);
  for(const face of scene.faces){
    const points=face.points.split(' ').map(pair=>pair.split(',').map(Number));
    // PDF-lib's SVG path adapter flips the SVG y axis, preserving the editor coordinates.
    const path=points.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ')+' Z';
    const color=pdfFaceColor(face.fill);
    page.drawSvgPath(path,{x:diagramX,y:PAGE_H-diagramTop,scale:SCALE,color,borderColor:color,borderWidth:0.4});
    for(const outline of face.outline){
      const n=outline.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
      segment({x:n[0],y:n[1]},{x:n[2],y:n[3]},0.8,rgb(0.46,0.43,0.36));
    }
  }
  for(const dimension of scene.dimensions){
    for(const s of dimension.segments)segment(s.a,s.b,s.kind==='extension'?0.7:1,s.kind==='extension'?rgb(139/255,148/255,160/255):rgb(75/255,85/255,99/255));
  }
  for(const note of scene.notes){
    const start={x:note.rect.x+12,y:note.rect.y+12},end=note.target;
    segment(start,end,1.8);
    const angle=Math.atan2(end.y-start.y,end.x-start.x);
    for(const a of [-0.43,0.43])segment(end,{x:end.x-9*Math.cos(angle+a),y:end.y-9*Math.sin(angle+a)},1.8);
    page.drawCircle({x:x(start.x),y:PAGE_H-y(start.y),size:12*SCALE,color:WHITE,borderColor:BLUE,borderWidth:1.5*SCALE});
    const value=String(note.number),size=13*SCALE;
    text(page,value,x(start.x)-fonts.regular.widthOfTextAtSize(value,size)/2,y(start.y-8),size,fonts.regular,BLUE);
  }
  for(const label of scene.labels){
    const caption=label.quantity&&label.quantity>1?`${label.code} ×${label.quantity}`:label.code;
    segment(label.anchor,{x:label.x+label.w/2,y:label.y+12},1);
    page.drawRectangle({x:x(label.x),y:PAGE_H-y(label.y+24),width:label.w*SCALE,height:24*SCALE,color:WHITE,borderColor:INK,borderWidth:0.9});
    const size=13*SCALE;
    text(page,caption,x(label.x+label.w/2)-fonts.regular.widthOfTextAtSize(caption,size)/2,y(label.y+4),size,fonts.regular,INK);
  }
  // Paint every leader before dimension masks so strokes cannot obscure measured values.
  for(const dimension of scene.dimensions){
    const label=dimension.label,angle=-label.angle*Math.PI/180,size=DIMENSION_FONT_SIZE*SCALE;
    ensureGlyphs(fonts.mono,dimension.text);
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),x(label.center.x),PAGE_H-y(label.center.y)));
    page.drawRectangle({x:-label.width*SCALE/2,y:-label.height*SCALE/2,width:label.width*SCALE,height:label.height*SCALE,color:WHITE});
    page.drawText(dimension.text,{x:-fonts.mono.widthOfTextAtSize(dimension.text,size)/2,y:-4.5*SCALE,size,font:fonts.mono,color:rgb(54/255,62/255,77/255)});
    page.pushOperators(popGraphicsState());
  }
  const caption=view==='front'?dimensionCaption(f):'INTERIOR · LAS PIEZAS OCULTAS SIGUEN EN LA TABLA';
  // The footer lives outside the scene: it never covers a measured edge.
  const captions=linesFor(caption,box.width-8*MM,fonts.regular,7);
  captions.forEach((value,index)=>text(page,value,box.x+2*MM,box.top+box.height+2+index*8,7,fonts.regular,GRAY));
}

type EdgeDetail={code:string;codeWidth:number;top:number;lines:string[]};
type TableRow={piece:PieceRow;lines:string[];extra:string[];reference?:OrderReference;detail?:EdgeDetail;orderLines:number;height:number;pending:number};
const LEGEND_LIMIT=42*MM, TABLE_FONT=8, TABLE_LEADING=10, REF_FONT=7, REF_LEADING=8.5, CODE_FONT=6.5, NAME_W=35*MM, GLYPH_W=10*MM, GLYPH_H=4.5*MM, DETAIL_W=74*MM, TABLE_LIMIT=139*MM;
/**
 * Name (and «también …», then «pendiente de pedido» for a row still under review) inside the Nombre cell; with an order row, the edge glyph at the cell's right and,
 * below, one line «1·1·0·2  SKU / 18 mm · corte 720 × 560» that spans the measure columns (they hold a single value).
 */
function tableRows(rows:ListRow[],fonts:Fonts):TableRow[]{
  return rows.map(({piece,reference,also,pending:waiting})=>{
    const glyph=hasEdgeMap(reference),width=glyph?NAME_W-GLYPH_W:NAME_W;
    const lines=linesFor(piece.name,width,fonts.regular,TABLE_FONT);
    const legacy=reference&&!glyph?linesFor(reference.text,width,fonts.regular,REF_FONT):[];
    const pending=waiting?linesFor(PENDING_TEXT,width,fonts.regular,REF_FONT):[];
    const extra=[...(also.length?linesFor(`también ${also.join(', ')}`,width,fonts.regular,REF_FONT):[]),...legacy,...pending];
    const nameBlock=lines.length*TABLE_LEADING+extra.length*REF_LEADING;
    let detail:EdgeDetail|undefined;
    if(glyph){
      const code=edgeCode(reference);ensureGlyphs(fonts.mono,code);
      const codeWidth=fonts.mono.widthOfTextAtSize(code,CODE_FONT)+1.5*MM;
      detail={code,codeWidth,top:Math.max(nameBlock,GLYPH_H+1),lines:linesFor(boardLine(reference),DETAIL_W-codeWidth,fonts.regular,REF_FONT)};
    }
    const content=detail?detail.top+detail.lines.length*REF_LEADING:nameBlock;
    return {piece,lines,extra,reference,detail,orderLines:(detail?detail.lines.length:legacy.length)+pending.length,height:Math.max(5.6*MM,content+6),pending:pending.length};
  });
}
/** Own edge glyph: the order's base × height rectangle; thick solid = 1, dashed = 2, hairline = no edge. */
function edgeGlyph(page:PDFPage,reference:OrderReference&{edgeMap:number[]},right:number,top:number){
  const maxW=8*MM,limit=maxW/GLYPH_H,base=reference.base,height=reference.height;
  const ratio=typeof base==='number'&&typeof height==='number'&&base>0&&height>0?base/height:limit;
  const w=Math.max(1.5*MM,ratio>=limit?maxW:GLYPH_H*ratio),h=Math.max(1.5*MM,ratio>=limit?maxW/ratio:GLYPH_H);
  const cx=right-GLYPH_W/2,x0=cx-w/2,y0=top+(GLYPH_H-h)/2;
  page.drawRectangle({x:x0,y:PAGE_H-y0-h,width:w,height:h,color:WHITE});
  const sides:[number,number,number,number][]=[[x0,y0,x0+w,y0],[x0,y0+h,x0+w,y0+h],[x0,y0,x0,y0+h],[x0+w,y0,x0+w,y0+h]];
  sides.forEach(([x1,y1,x2,y2],i)=>{const role=reference.edgeMap[i];
    page.drawLine({start:{x:x1,y:PAGE_H-y1},end:{x:x2,y:PAGE_H-y2},color:role?INK:GRAY,thickness:role===1?1.6:role===2?1.1:0.5,...(role===2?{dashArray:[1.6,1.1]}:{})});});
}
/** Full legend of the edge code and a compact one with the same SKUs, used only when the full one does not fit. */
function edgeLegend(rows:TableRow[]):{full:string;compact:string}|undefined{
  const structured=rows.map(r=>r.reference).filter(hasEdgeMap);
  if(!structured.length)return undefined;
  const skus=(role:1|2)=>[...new Set(structured.filter(r=>r.edgeMap.includes(role)).map(r=>(role===1?r.principal:r.secondary)||'sin asignar'))].join(' / ');
  const principal=skus(1),secondary=skus(2);
  return {full:`Cantos: ${[principal&&`1 = ${principal} (principal)`,secondary&&`2 = ${secondary} (secundario)`,'0 = sin canto'].filter(Boolean).join(' · ')} · orden Arr·Aba·Izq·Der sobre base × altura del pedido.`,
    compact:`Cantos Arr·Aba·Izq·Der: ${[principal&&`1 = ${principal}`,secondary&&`2 = ${secondary}`,'0 = sin canto'].filter(Boolean).join(' · ')}.`};
}
function foldCount(f:Furniture,references?:OrderReferences,pending?:readonly string[]){try{return listRows(f,references,true,pending).length;}catch{return Infinity;}}
/** Numbers and the lever that matches the cause, for a list that does not fit. */
function tableDiagnosis(f:Furniture,rows:TableRow[],used:number,references?:OrderReferences,pending?:readonly string[]){
  const over=Math.max(1,Math.ceil((used-TABLE_LIMIT)/(used/rows.length)));
  const detail=`Necesita ${Math.round(used/MM)} mm de ${Math.round(TABLE_LIMIT/MM)} mm: ${over===1?'sobra 1 fila':`sobran unas ${over} filas`}.`;
  const total=rows.reduce((n,r)=>n+r.lines.length+r.extra.length+(r.detail?r.detail.lines.length:0),0),fromOrder=rows.reduce((n,r)=>n+r.orderLines,0);
  let action:string;
  if(references&&fromOrder*2>total)action='Desactivá «Incluir materiales y cantos del pedido» en Opciones de guardado o activá «Agrupar por medidas en el listado A4».';
  else if(!f.groupIdentical&&identicalGroups(f).some(group=>group.length>1))action='Activá Agrupar componentes iguales en este mueble.';
  else if(!f.presentation?.guide?.foldTable&&foldCount(f,references,pending)<rows.length)action='Activá «Agrupar por medidas en el listado A4» en Vistas de la guía A4.';
  else{const long=rows.filter(r=>r.lines.length>1).sort((a,b)=>b.lines.length-a.lines.length).slice(0,3).map(r=>r.piece.code);action=long.length?`Acortá los nombres más largos: ${long.join(', ')}.`:'Separá el mueble en dos grupos de SketchUp para imprimir cada uno en su hoja.';}
  return {detail,action};
}

const DETAIL_COLS=[0,14,110,128,146,160,174,210],DETAIL_X=8*MM,SHEET2_W=281*MM,DETAIL_TOP=50*MM,DETAIL_BOTTOM=196*MM,DETAIL_PAGES=20;
type DetailRow={kind:'row';piece:PieceRow;reference?:OrderReference;pending?:boolean;lines:string[];extra:string[];cut:string;code:string;height:number};
type DetailItem=DetailRow|{kind:'group';lines:string[];height:number};
const piecesText=(n:number)=>`${n} ${n===1?'pieza':'piezas'}`;
/** Hoja 2 groups: one per board (supplier lot, then board name), then rows still under review and rows without order. */
function detailGroups(rows:ListRow[]){
  const groups=new Map<string,{title:string;rank:[number,number,string];rows:ListRow[]}>();
  for(const row of rows){
    const board=row.reference?row.reference.board||row.reference.text:undefined,key=board!==undefined?`placa:${board}`:row.pending?'pending':'none';
    let group=groups.get(key);
    if(!group){group={title:board!==undefined?`Placa: ${board}`:row.pending?'Pendiente de pedido':'Sin pedido',rank:[board!==undefined?0:row.pending?1:2,Infinity,board||''],rows:[]};groups.set(key,group);}
    if(typeof row.reference?.lot==='number')group.rank[1]=Math.min(group.rank[1],row.reference.lot);
    group.rows.push(row);
  }
  // Infinity - Infinity is NaN (falsy): groups without lot fall through to the board name.
  return [...groups.values()].sort((a,b)=>a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||a.rank[2].localeCompare(b.rank[2],'es'))
    .map(g=>({title:`${g.title} · ${piecesText(g.rows.reduce((n,r)=>n+r.piece.quantity,0))}`,rows:g.rows}));
}
/** Full-width list of hoja 2, paginated without truncating: a group header opens each group and each continued page. */
function detailPages(rows:ListRow[],fonts:Fonts):DetailItem[][]{
  const header=(title:string):DetailItem=>{const lines=linesFor(title,SHEET2_W-4*MM,fonts.regular,TABLE_FONT);return {kind:'group',lines,height:Math.max(6*MM,lines.length*TABLE_LEADING+6)};};
  const nameW=(DETAIL_COLS[2]-DETAIL_COLS[1]-2)*MM,pages:DetailItem[][]=[];let page:DetailItem[]=[],top=0;
  for(const group of detailGroups(rows))group.rows.forEach(({piece,reference,also,pending},index)=>{
    const lines=linesFor(piece.name,nameW,fonts.regular,TABLE_FONT),extra=also.length?linesFor(`también ${also.join(', ')}`,nameW,fonts.regular,REF_FONT):[];
    const code=edgeCode(reference);ensureGlyphs(fonts.mono,code);
    const cut=reference&&typeof reference.base==='number'&&typeof reference.height==='number'?`${plainMm(reference.base)} × ${plainMm(reference.height)}`:'—';
    const row:DetailRow={kind:'row',piece,reference,pending,lines,extra,cut,code,height:Math.max(5.6*MM,lines.length*TABLE_LEADING+extra.length*REF_LEADING+6)};
    const title=index?`${group.title} (continúa)`:group.title;
    let lead=index===0||!page.length?header(title):undefined;
    if(page.length&&top+(lead?.height??0)+row.height>DETAIL_BOTTOM-DETAIL_TOP){pages.push(page);page=[];top=0;lead=header(title);}
    if(lead){page.push(lead);top+=lead.height;}
    page.push(row);top+=row.height;
  });
  if(page.length)pages.push(page);
  return pages;
}
function drawDetail(page:PDFPage,items:DetailItem[],fonts:Fonts){
  const col=DETAIL_COLS.map(n=>DETAIL_X+n*MM),right=DETAIL_X+SHEET2_W;
  page.drawRectangle({x:DETAIL_X,y:PAGE_H-43*MM,width:SHEET2_W,height:7*MM,color:TEAL});
  text(page,'DESPIECE COMPLETO · AGRUPADO POR PLACA',DETAIL_X+2*MM,38*MM,8,fonts.regular,WHITE);
  page.drawRectangle({x:DETAIL_X,y:PAGE_H-DETAIL_TOP,width:SHEET2_W,height:7*MM,color:INK});
  ['ID','Nombre','Largo','Ancho','Esp.','Cant.','Corte','Cantos'].forEach((value,i)=>text(page,value,col[i]+MM,45*MM,7.3,fonts.regular,WHITE));
  let top=DETAIL_TOP,stripe=0;
  for(const item of items){
    if(item.kind==='group'){
      page.drawRectangle({x:DETAIL_X,y:PAGE_H-top-item.height,width:SHEET2_W,height:item.height,color:BAND});line(page,DETAIL_X,top,right,top,RULE,0.45);
      item.lines.forEach((s,i)=>text(page,s,DETAIL_X+2*MM,top+3+i*TABLE_LEADING,TABLE_FONT,fonts.regular,BLUE));top+=item.height;stripe=0;continue;
    }
    const {piece,reference,pending,lines,extra,cut,code,height}=item;
    if(stripe++%2===1)page.drawRectangle({x:DETAIL_X,y:PAGE_H-top-height,width:SHEET2_W,height,color:rgb(0.95,0.96,0.97)});
    line(page,DETAIL_X,top,right,top,RULE,0.45);
    text(page,piece.code,col[0]+MM,top+3,TABLE_FONT,fonts.regular);
    lines.forEach((s,i)=>text(page,s,col[1]+MM,top+3+i*TABLE_LEADING,TABLE_FONT,fonts.regular));
    extra.forEach((s,i)=>text(page,s,col[1]+MM,top+3+lines.length*TABLE_LEADING+i*REF_LEADING,REF_FONT,fonts.regular,GRAY));
    [...piece.dimensions.map(mm),String(piece.quantity),cut].forEach((s,i)=>text(page,s,col[i+2]+MM,top+3,TABLE_FONT,fonts.regular));
    if(hasEdgeMap(reference)){edgeGlyph(page,reference,col[7]+MM+GLYPH_W,top+3);text(page,code,col[7]+GLYPH_W+3*MM,top+3,TABLE_FONT,fonts.mono);}
    else if(pending)text(page,PENDING_TEXT,col[7]+MM,top+3,REF_FONT,fonts.regular,AMBER);
    for(const edge of [...col,right])line(page,edge,top,edge,top+height,RULE,0.45);
    top+=height;
  }
  line(page,DETAIL_X,top,right,top,RULE,0.45);
}

/** The PDF bytes. Same contract as createOfflinePdfPages. */
export async function createOfflinePdf(project:Project,fontBytes:Uint8Array,monoBytes:Uint8Array,logoBytes?:Uint8Array,references?:OrderReferences,options?:A4Options):Promise<Uint8Array>{
  return (await createOfflinePdfPages(project,fontBytes,monoBytes,logoBytes,references,options)).bytes;
}
/**
 * One furniture, one A4 page. With its explicit consent (`detailSheet`), a furniture whose list does not fit prints
 * page «{n}a» with views and legend and the full list on «{n}b», «{n}c»… grouped by board. Infeasible layouts fail before any bytes are returned.
 */
export async function createOfflinePdfPages(project:Project,fontBytes:Uint8Array,monoBytes:Uint8Array,logoBytes?:Uint8Array,references?:OrderReferences,options:A4Options={}):Promise<{bytes:Uint8Array;pages:A4Page[]}>{
  const pending=options.pending;
  if(!project.furniture.length)throw new A4FitError(undefined,{reason:'No hay ningún mueble seleccionado para la guía A4.',kind:'empty'});
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const fonts:Fonts={regular:await pdf.embedFont(fontBytes,{subset:true}),mono:await pdf.embedFont(monoBytes,{subset:true})};
  const logo=logoBytes?await pdf.embedPng(logoBytes):undefined;
  pdf.setTitle(`Planos Santo · ${project.name}`);pdf.setCreator(`Planos Santo ${version} · PDF A4 offline`);
  const prepared=project.furniture.map(source=>{
    const f:Furniture={...source,presentation:{...source.presentation,guide:source.presentation?.guide||{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}}};
    const fail=(reason:string,kind:A4FitKind,action?:string,detail?:string):never=>{throw new A4FitError(undefined,{furniture:f.name,furnitureId:f.id,reason,kind,action,detail});};
    try{
    if(f.pieces.some(p=>!p.name.trim()))fail('Hay piezas sin nombre.','names');
    const list=listRows(f,references,undefined,pending),rows=tableRows(list,fonts),used=rows.reduce((h,r)=>h+r.height,0);
    let detailSheets:DetailItem[][]|undefined;
    if(used>TABLE_LIMIT){
      const {detail,action}=tableDiagnosis(f,rows,used,references,pending);
      if(!f.presentation?.guide?.detailSheet)fail('El listado no cabe legiblemente en una A4 con texto de 8 pt.','table',`${action} ${HOJA2_ACTION}`,detail);
      detailSheets=detailPages(list,fonts);
      if(detailSheets.length>DETAIL_PAGES)fail(`El despiece completo necesita ${detailSheets.length} hojas; el máximo es ${DETAIL_PAGES} hojas por mueble.`,'size','Separá el mueble en dos grupos de SketchUp para imprimir cada uno con su despiece.');
    }
    for(const {piece} of rows){
      if(fonts.regular.widthOfTextAtSize(piece.code,TABLE_FONT)>9*MM)fail(`${piece.code}: el identificador no entra en la columna ID.`,'table','Acortá el código de la pieza.');
      for(const value of [...piece.dimensions.map(mm),String(piece.quantity)])if(fonts.regular.widthOfTextAtSize(value,TABLE_FONT)>12*MM)fail(`${piece.code}: una medida o cantidad no entra en su columna.`,'table','Revisá la medida o la cantidad de esa pieza.');
    }
    const cantos=edgeLegend(rows),waiting=rows.some(r=>r.pending)?PENDING_LEGEND:undefined,order=[cantos,waiting].filter(o=>!!o);
    const entries=sheetEntries(f),hasObservations=!!f.presentation?.guide?.observations?.trim();
    const legendFor=(first:string[]=[])=>{const lines=[...first,...entries].flatMap(entry=>linesFor(entry,175*MM,fonts.regular,8));return {lines,height:Math.max(16*MM,lines.length*10+14+(hasObservations?0:8*MM))};};
    // The order legends (edges, pending rows) are not editable: their compact forms are tried before blaming the notes, and a failure caused by them says so.
    let legend=legendFor(order.map(o=>o.full));
    if(legend.height>LEGEND_LIMIT&&order.length)legend=legendFor(order.map(o=>o.compact));
    if(legend.height>LEGEND_LIMIT){
      const detail=`Necesita ${Math.round(legend.height/MM)} mm de ${Math.round(LEGEND_LIMIT/MM)} mm.`;
      if(order.length&&legendFor().height<=LEGEND_LIMIT){
        if(cantos&&!waiting)fail('Las notas y observaciones no dejan lugar a la leyenda de cantos del pedido debajo de las vistas.','legend','Acortá observaciones o notas para dejar una línea a la leyenda de cantos, o desactivá «Incluir materiales y cantos del pedido» en Opciones de guardado.',detail);
        fail(`Las notas y observaciones no dejan lugar a la leyenda ${cantos?'de cantos y de filas pendientes de pedido':'de filas pendientes de pedido'} debajo de las vistas.`,'legend','Acortá observaciones o notas para dejar lugar a la leyenda del pedido, o terminá de revisar las filas pendientes en Biblioteca y pedidos.',detail);
      }
      fail('Las notas y observaciones no caben legiblemente debajo de las vistas.','legend',undefined,detail);
    }
    const legendLines=legend.lines,legendHeight=legend.height;
    const legendTop=194*MM-legendHeight, diagramTop=44*MM, diagramBottom=legendTop-9*MM;
    const views=guideViews(f),single=views.length===1,diagramWidth=(single?177:86)*MM;
    const scale=diagramWidth/(single?640:320);
    const sceneHeight=Math.floor((diagramBottom-diagramTop)/scale);
    const scenes=views.map((view,index)=>{
      const box={x:(single?8:index===0?8:99)*MM,top:diagramTop,width:diagramWidth,height:sceneHeight*scale};
      const scene=makeScene(f,{view,layout:'sheet',width:single?640:320,height:sceneHeight});
      const warnings=[...groupedNameIssues(f),...scene.warnings];
      if(warnings.length)fail(`${view==='front'?'Vista exterior':'Vista interior'}: ${[...new Set(warnings)].join(' ')}`,'view');
      // Printed identifiers and dimensions must remain readable after scene scaling.
      if((scene.labels.length&&13*scale<7)||(scene.dimensions.length&&DIMENSION_FONT_SIZE*scale<7))fail(`Las etiquetas o cotas quedarían por debajo de 7 pt${single?'':' con dos vistas'}.`,'scale',single?'Reducí el zoom o la cantidad de cotas y etiquetas.':undefined);
      return {view,scene,box};
    });
    if(linesFor(f.name,130*MM,fonts.regular,13).length>1||linesFor(project.name,130*MM,fonts.regular,9).length>1)fail('El nombre del proyecto o del mueble no entra en el encabezado.','header');
    return {f,rows,legendLines,legendTop,scenes,detailSheets};
    }catch(error){if(error instanceof A4FitError&&!error.furniture){error.furniture=f.name;error.furnitureId=f.id;error.message=error.compose();}throw error;}
  });
  const total=project.furniture.length,printed:A4Page[]=[];
  /** A new page with the furniture header and the footer, both carrying the page label. */
  const sheet=(f:Furniture,label:string)=>{
    const page=pdf.addPage([PAGE_W,PAGE_H]);page.setMediaBox(0,0,PAGE_W,PAGE_H);page.setCropBox(0,0,PAGE_W,PAGE_H);printed.push({furnitureId:f.id,name:f.name,label});
    if(logo){const w=43*MM,h=w*logo.height/logo.width;if(h>22*MM)throw new Error('El logotipo supera el espacio del encabezado A4. Usá una imagen horizontal.');page.drawImage(logo,{x:8*MM,y:PAGE_H-8*MM-h,width:w,height:h});}
    else{text(page,'SANTO CARPINTERO',8*MM,9*MM,10,fonts.regular);text(page,'AMOBLAMIENTOS',8*MM,16*MM,8,fonts.regular);}
    text(page,'GUÍA DE ARMADO',56*MM,7*MM,9,fonts.regular,BLUE);
    text(page,f.name,56*MM,13*MM,13,fonts.regular);
    text(page,project.name,56*MM,22*MM,9,fonts.regular,GRAY);
    page.drawRectangle({x:190*MM,y:PAGE_H-30*MM,width:99*MM,height:23*MM,color:rgb(0.95,0.96,0.97),borderColor:RULE,borderWidth:0.5});
    text(page,'FICHA DE MUEBLE',193*MM,9*MM,8,fonts.regular,BLUE);
    text(page,`Hoja ${label} de ${total} · ${f.pieces.length} piezas`,193*MM,16*MM,9,fonts.regular);
    text(page,'A4 HORIZONTAL · MEDIDAS EN mm',193*MM,23*MM,8,fonts.regular,GRAY);
    line(page,8*MM,33*MM,289*MM,33*MM,INK,1);
    line(page,8*MM,198*MM,289*MM,198*MM,TEAL,0.8);
    text(page,'PLANOS SANTO · 297 × 210 mm · Imprimir al 100 % · No medir sobre el dibujo',8*MM,201*MM,8,fonts.regular,GRAY);
    const footer=`${label} / ${total}`;text(page,footer,Math.min(279*MM,289*MM-fonts.regular.widthOfTextAtSize(footer,8)),201*MM,8,fonts.regular,GRAY);
    return page;
  };
  for(const [pageIndex,{f,rows,legendLines,legendTop,scenes,detailSheets}] of prepared.entries()){
    const n=pageIndex+1,page=sheet(f,detailSheets?`${n}a`:String(n));
    for(const {view,scene,box} of scenes){
      page.drawRectangle({x:box.x,y:PAGE_H-43*MM,width:box.width,height:7*MM,color:TEAL});
      text(page,view==='front'?'VISTA EXTERIOR':'VISTA INTERIOR',box.x+2*MM,38*MM,8,fonts.regular,WHITE);
      page.drawRectangle({x:box.x,y:PAGE_H-box.top-box.height,width:box.width,height:box.height,borderColor:RULE,borderWidth:0.5});
      diagram(page,f,fonts,view,scene,box);
    }
    const tx=190*MM,tw=99*MM;
    page.drawRectangle({x:tx,y:PAGE_H-43*MM,width:tw,height:7*MM,color:TEAL});
    text(page,'LISTADO COMPLETO DE PIEZAS',tx+2*MM,38*MM,8,fonts.regular,WHITE);
    if(detailSheets){
      linesFor(`El despiece completo de ${f.pieces.length} piezas sigue en la hoja ${n}b, agrupado por placa.`,tw-4*MM,fonts.regular,9).forEach((s,i)=>text(page,s,tx+2*MM,48*MM+i*12,9,fonts.regular));
    }else{
    const col=[0,11,48,61,74,87].map(n=>tx+n*MM);
    page.drawRectangle({x:tx,y:PAGE_H-52*MM,width:tw,height:7*MM,color:INK});
    ['ID','Nombre','Largo','Ancho','Esp.','Cant.'].forEach((value,i)=>text(page,value,col[i]+MM,47*MM,7.3,fonts.regular,WHITE));
    let top=52*MM;
    for(const [rowIndex,{piece,lines,extra,reference,detail,height,pending}] of rows.entries()){
      if(rowIndex%2===1)page.drawRectangle({x:tx,y:PAGE_H-top-height,width:tw,height,color:rgb(0.95,0.96,0.97)});
      line(page,tx,top,tx+tw,top,RULE,0.45);
      text(page,piece.code,col[0]+MM,top+3,TABLE_FONT,fonts.regular);
      lines.forEach((s,i)=>text(page,s,col[1]+MM,top+3+i*TABLE_LEADING,TABLE_FONT,fonts.regular));
      extra.forEach((s,i)=>text(page,s,col[1]+MM,top+3+lines.length*TABLE_LEADING+i*REF_LEADING,REF_FONT,fonts.regular,i>=extra.length-pending?AMBER:GRAY));
      if(hasEdgeMap(reference))edgeGlyph(page,reference,col[2],top+3);
      if(detail){text(page,detail.code,col[1]+MM,top+3+detail.top+0.5,CODE_FONT,fonts.mono);detail.lines.forEach((s,i)=>text(page,s,col[1]+MM+detail.codeWidth,top+3+detail.top+i*REF_LEADING,REF_FONT,fonts.regular,GRAY));}
      [...piece.dimensions.map(mm),String(piece.quantity)].forEach((s,i)=>text(page,s,col[i+2]+MM,top+3,TABLE_FONT,fonts.regular));
      // Measure columns hold one value: their rules stop above the edge-detail line that spans them.
      for(const [i,edge] of [...col,tx+tw].entries())line(page,edge,top,edge,top+(detail&&i>=2&&i<=4?detail.top+2:height),RULE,0.45);
      top+=height;
    }
    line(page,tx,top,tx+tw,top,RULE,0.45);
    }
    text(page,'NOTAS Y OBSERVACIONES DE ARMADO',8*MM,legendTop,8,fonts.regular,BLUE);
    legendLines.forEach((s,i)=>text(page,s,8*MM,legendTop+13+i*10,8,fonts.regular,GRAY));
    if(!f.presentation?.guide?.observations?.trim()){text(page,'Observaciones:',8*MM,188*MM,8,fonts.regular,GRAY);line(page,8*MM,193*MM,185*MM,193*MM,RULE,0.45);}
    detailSheets?.forEach((items,i)=>drawDetail(sheet(f,`${n}${String.fromCharCode(98+i)}`),items,fonts));
  }
  const bytes=await pdf.save();
  if(bytes.length>30*1024*1024)throw new A4FitError(undefined,{reason:'El PDF supera 30 MB; no se exportó un archivo incompleto.',kind:'size'});
  return {bytes,pages:printed};
}
