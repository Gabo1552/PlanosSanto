import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, setTextRenderingMode, setLineWidth, setStrokingColor, TextRenderingMode, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Project } from '../../lib/model';
import { A4FitError, hasEdgeMap, orderReference, type OrderReferences } from './pdf';
import { compositeCode } from './names';
import release from '../version.json';
const {version}=release;

// DESPIECE-07 / OPT-10: piece labels for self-adhesive A4 sheets (portrait), one label per physical piece.
// F-OPT-D: the supplier TXT may group several identical pieces in one line (quantity > 1). Each label still
// carries its own composite code ('M03·P07', never the TXT line) plus «Lote NN» when the lot is known, so a
// grouped line yields as many labels as pieces and every cut piece can be traced back to the model.
export type LabelTemplate='3x7'|'2x5';
export type LabelMargins={top:number;right:number;bottom:number;left:number};
export type LabelCell={x:number;y:number;w:number;h:number};
export type LabelState='order'|'pending'|'none';
export type LabelItem={furnitureId:string;furnitureName:string;pieceId:string;code:string;name:string;measures:[number,number,number];oriented:boolean;edgeMap?:number[];lot?:number;grain?:boolean|null;state:LabelState;copy:number;copies:number};
export type LabelOptions={template:LabelTemplate;margins:LabelMargins;references?:OrderReferences;pending?:readonly string[];guides?:boolean};

export const A4_PORTRAIT_MM={width:210,height:297} as const;
export const LABEL_GRID:Record<LabelTemplate,{cols:number;rows:number}>={'3x7':{cols:3,rows:7},'2x5':{cols:2,rows:5}};
export const LABEL_DEFAULTS:Record<LabelTemplate,LabelMargins>={'3x7':{top:4.5,right:0,bottom:4.5,left:0},'2x5':{top:6,right:4,bottom:6,left:4}};
export const LABEL_MARGIN_MAX=25, LABEL_MIN_CELL={w:35,h:20} as const;
const SIDE_NAMES:Record<keyof LabelMargins,string>={top:'superior',right:'derecho',bottom:'inferior',left:'izquierdo'};

/** Cells in mm over A4 portrait, row-major; each cell is (page − margins) / cols | rows. */
export function labelLayout(template:LabelTemplate,margins:LabelMargins):{cols:number;rows:number;cells:LabelCell[]}{
  const grid=LABEL_GRID[template];
  if(!grid)throw new Error(`Plantilla de etiquetas desconocida: ${String(template)}.`);
  for(const side of ['top','right','bottom','left'] as const){
    const value=margins?.[side];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>LABEL_MARGIN_MAX)throw new Error(`Margen ${SIDE_NAMES[side]} fuera de rango: usá entre 0 y ${LABEL_MARGIN_MAX} mm.`);
  }
  const w=(A4_PORTRAIT_MM.width-margins.left-margins.right)/grid.cols,h=(A4_PORTRAIT_MM.height-margins.top-margins.bottom)/grid.rows;
  if(w<LABEL_MIN_CELL.w||h<LABEL_MIN_CELL.h)throw new Error(`Cada etiqueta quedaría de ${plainMm(w)} × ${plainMm(h)} mm; el mínimo es ${LABEL_MIN_CELL.w} × ${LABEL_MIN_CELL.h} mm. Reducí los márgenes.`);
  const cells:LabelCell[]=[];
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++)cells.push({x:margins.left+col*w,y:margins.top+row*h,w,h});
  return {...grid,cells};
}

const plainMm=(n:number)=>Number(n.toFixed(2)).toLocaleString('es-AR',{maximumFractionDigits:2,useGrouping:false});
export const measureText=(item:Pick<LabelItem,'measures'>)=>`${item.measures.map(plainMm).join(' × ')} mm`;
const byCode=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true});
const validLot=(lot:unknown):lot is number=>typeof lot==='number'&&Number.isInteger(lot)&&lot>0;

/** One item per physical piece: by furniture (project order), lot (unknown last), code (numeric aware) and piece id. */
export function labelItems(project:Project,references?:OrderReferences,pending?:readonly string[]):LabelItem[]{
  const waiting=new Set(pending||[]);
  return project.furniture.flatMap(f=>{
    const copies=new Map<string,string[]>();
    for(const p of f.pieces)copies.set(p.code,[...(copies.get(p.code)||[]),p.id]);
    for(const ids of copies.values())ids.sort(byCode);
    const items=f.pieces.map(p=>{
      const reference=references?orderReference(references[p.id]):undefined,state:LabelState=waiting.has(p.id)?'pending':reference?'order':'none';
      const ordered=state==='order'?reference:undefined,ids=copies.get(p.code)!;
      const oriented=!!ordered&&typeof ordered.base==='number'&&typeof ordered.height==='number'&&ordered.base>0&&ordered.height>0;
      const measures:[number,number,number]=oriented?[ordered!.base!,ordered!.height!,p.dimensions[2]]:[p.dimensions[0],p.dimensions[1],p.dimensions[2]];
      const item:LabelItem={furnitureId:f.id,furnitureName:f.name,pieceId:p.id,code:compositeCode(f.naming?.moduleCode,p.code),name:p.name.trim(),measures,oriented,state,copy:ids.indexOf(p.id)+1,copies:ids.length};
      if(ordered&&hasEdgeMap(ordered))item.edgeMap=[...ordered.edgeMap];
      if(ordered&&validLot(ordered.lot))item.lot=ordered.lot;
      if(ordered&&typeof ordered.grain==='boolean')item.grain=ordered.grain;
      return {item,code:p.code};
    });
    items.sort((a,b)=>(a.item.lot??Infinity)-(b.item.lot??Infinity)||byCode(a.code,b.code)||a.item.pieceId.localeCompare(b.item.pieceId));
    return items.map(({item})=>item);
  });
}

/** '<obra>-etiquetas-AAAA-MM-DD.pdf', with the same cleaning as the A4 preview name. */
export function labelsFileName(project:Pick<Project,'name'>,date=new Date()):string{
  const clean=(value:string)=>value.normalize('NFC').replace(/[/\\:*?"<>|\u0000-\u001f]+/g,' ').trim().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'');
  const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const base=clean(project.name||'').slice(0,80).replace(/[-.]+$/,'')||'PlanosSanto';
  return `${base}-etiquetas-${day}.pdf`;
}

const MM=72/25.4, PAGE_H=A4_PORTRAIT_MM.height*MM;
const INK=rgb(8/255,12/255,46/255),GRAY=rgb(0.32,0.39,0.46),AMBER=rgb(0.62,0.38,0.04),GUIDE=rgb(0.82,0.84,0.86),WHITE=rgb(1,1,1);
type Fonts={regular:PDFFont;mono:PDFFont};
function ensureGlyphs(font:PDFFont,value:string){
  const available=new Set(font.getCharacterSet());
  for(const char of value)if(char!=='\n'&&!available.has(char.codePointAt(0)!))throw new A4FitError(undefined,{reason:`El PDF no puede representar el carácter «${char}».`,kind:'glyph',character:char});
}
function linesFor(value:string,width:number,font:PDFFont,size:number):string[]{
  ensureGlyphs(font,value);
  const result:string[]=[];let current='';
  for(const word of value.split(/\s+/).filter(Boolean)){
    if(font.widthOfTextAtSize((current+' '+word).trim(),size)<=width){current=(current+' '+word).trim();continue;}
    if(current){result.push(current);current='';}
    for(const char of word){if(current&&font.widthOfTextAtSize(current+char,size)>width){result.push(current);current='';}current+=char;}
  }
  if(current||!result.length)result.push(current);
  return result;
}
/** `top` in points from the page top; the baseline sits one font size below it. */
function text(page:PDFPage,value:string,x:number,top:number,size:number,font:PDFFont,color:RGB=INK,bold=false){
  ensureGlyphs(font,value);
  if(bold)page.pushOperators(pushGraphicsState(),setTextRenderingMode(TextRenderingMode.FillAndOutline),setLineWidth(size*0.045),setStrokingColor(color));
  page.drawText(value,{x,y:PAGE_H-top-size*0.8,size,font,color});
  if(bold)page.pushOperators(popGraphicsState());
}
const pad2=(n:number)=>String(n).padStart(2,'0');

type Plan={item:LabelItem;codeSize:number;right:string[];rightSize:number;name:string[];nameSize:number;furniture:string;furnitureSize:number;scheme:boolean;caption:string};
/** Fit one label inside its cell, or throw naming the piece: text is never truncated. */
function planLabel(item:LabelItem,cell:LabelCell,fonts:Fonts,template:LabelTemplate):Plan{
  const k=Math.min(1.25,cell.w/70,cell.h/41.1),pad=Math.max(1.5,3*k)*MM,innerW=cell.w*MM-2*pad,innerH=cell.h*MM-2*pad;
  const fail=(reason:string,kind:'table'|'header'='table'):never=>{throw new A4FitError(undefined,{furniture:item.furnitureName,furnitureId:item.furnitureId,kind,reason:`${item.code}: ${reason}`,action:template==='3x7'?'Acortá el nombre o usá la plantilla 2 × 5.':'Acortá el nombre o reducí los márgenes de la hoja.'});};
  const right=[item.copies>1?`${item.copy}/${item.copies}`:'',item.lot?`Lote ${pad2(item.lot)}`:''].filter(Boolean),rightSize=Math.max(5,7*k);
  const rightW=right.length?Math.max(...right.map(s=>fonts.regular.widthOfTextAtSize(s,rightSize)))+2*MM:0;
  ensureGlyphs(fonts.mono,item.code);
  let codeSize=Math.max(6,13*k);
  while(fonts.mono.widthOfTextAtSize(item.code,codeSize)>innerW-rightW&&codeSize>6)codeSize=Math.max(6,codeSize-0.5);
  if(fonts.mono.widthOfTextAtSize(item.code,codeSize)>innerW-rightW)fail('el código no entra en la etiqueta.');
  const codeH=Math.max(codeSize*1.15,right.length*rightSize*1.2);
  let furnitureSize=Math.max(5,6.5*k);
  while(fonts.regular.widthOfTextAtSize(item.furnitureName,furnitureSize)>innerW&&furnitureSize>5)furnitureSize=Math.max(5,furnitureSize-0.5);
  ensureGlyphs(fonts.regular,item.furnitureName);
  if(fonts.regular.widthOfTextAtSize(item.furnitureName,furnitureSize)>innerW)fail(`el nombre del mueble «${item.furnitureName}» no entra en la etiqueta.`,'header');
  const scheme=item.state==='order'&&(!!item.edgeMap||typeof item.grain==='boolean');
  const caption=[item.edgeMap?item.edgeMap.join('·'):'',item.grain===true?'veta':item.grain===false?'sin veta':''].filter(Boolean).join('  ');
  const small=Math.max(5,6*k),measureSize=Math.max(5.5,8*k);
  const column=scheme?(item.edgeMap?10*k*MM:item.grain?3*k*MM:0)+small*1.3:0;
  const measures=measureText(item),note=item.state==='pending'||item.oriented;
  const leftW=innerW-(scheme?Math.max(16*k*MM,fonts.regular.widthOfTextAtSize(caption,small))+2*MM:0);
  if(fonts.regular.widthOfTextAtSize(measures,measureSize)>leftW)fail('las medidas no entran en la etiqueta.');
  const bottomH=Math.max(measureSize*1.2+(note?small*1.3:0),column);
  const label=item.name||'Sin nombre';
  for(let nameSize=Math.max(6,9*k);nameSize>=6;nameSize-=0.5){
    const name=linesFor(label,innerW,fonts.regular,nameSize);
    if(name.length>2)continue;
    if(codeH+name.length*nameSize*1.15+furnitureSize*1.25+MM+bottomH<=innerH)return {item,codeSize,right,rightSize,name,nameSize,furniture:item.furnitureName,furnitureSize,scheme,caption};
  }
  return fail(`el nombre «${label}» no entra en la etiqueta en 2 líneas ni con texto de 6 pt.`);
}
/** Mini edge scheme: the order's base × height rectangle; thick solid = 1, dashed = 2, hairline = no edge (Arr·Aba·Izq·Der). */
function edgeScheme(page:PDFPage,item:LabelItem,right:number,bottom:number,boxW:number,boxH:number){
  const ratio=item.measures[0]>0&&item.measures[1]>0?item.measures[0]/item.measures[1]:boxW/boxH,limit=boxW/boxH;
  const w=Math.max(2*MM,ratio>=limit?boxW:boxH*ratio),h=Math.max(2*MM,ratio>=limit?boxW/ratio:boxH);
  const x0=right-boxW/2-w/2,y0=bottom-boxH/2-h/2;
  if(item.edgeMap){
    page.drawRectangle({x:x0,y:PAGE_H-y0-h,width:w,height:h,color:WHITE});
    const sides:[number,number,number,number][]=[[x0,y0,x0+w,y0],[x0,y0+h,x0+w,y0+h],[x0,y0,x0,y0+h],[x0+w,y0,x0+w,y0+h]];
    sides.forEach(([x1,y1,x2,y2],i)=>{const role=item.edgeMap![i];
      page.drawLine({start:{x:x1,y:PAGE_H-y1},end:{x:x2,y:PAGE_H-y2},color:role?INK:GRAY,thickness:role===1?1.6:role===2?1.1:0.4,...(role===2?{dashArray:[1.6,1.1]}:{})});});
  }
  if(item.grain===true){
    const a=item.edgeMap?x0+w*0.18:right-boxW,b=item.edgeMap?x0+w*0.82:right,y=PAGE_H-(item.edgeMap?y0+h/2:bottom-1.5*MM),head=Math.min(1.4*MM,(b-a)/3);
    page.drawLine({start:{x:a,y},end:{x:b,y},color:GRAY,thickness:0.6});
    for(const s of [-1,1])page.drawLine({start:{x:b,y},end:{x:b-head,y:y+s*head*0.55},color:GRAY,thickness:0.6});
  }
}
function drawLabel(page:PDFPage,plan:Plan,cell:LabelCell,fonts:Fonts,guides:boolean){
  const {item}=plan,k=Math.min(1.25,cell.w/70,cell.h/41.1),pad=Math.max(1.5,3*k)*MM;
  const left=cell.x*MM+pad,top=cell.y*MM+pad,right=(cell.x+cell.w)*MM-pad,bottom=(cell.y+cell.h)*MM-pad;
  if(guides)page.drawRectangle({x:cell.x*MM,y:PAGE_H-(cell.y+cell.h)*MM,width:cell.w*MM,height:cell.h*MM,borderColor:GUIDE,borderWidth:0.3});
  text(page,item.code,left,top,plan.codeSize,fonts.mono,INK,true);
  plan.right.forEach((s,i)=>text(page,s,right-fonts.regular.widthOfTextAtSize(s,plan.rightSize),top+i*plan.rightSize*1.2,plan.rightSize,fonts.regular,i===0&&item.copies>1?INK:GRAY));
  let y=top+Math.max(plan.codeSize*1.15,plan.right.length*plan.rightSize*1.2);
  for(const s of plan.name){text(page,s,left,y,plan.nameSize,fonts.regular);y+=plan.nameSize*1.15;}
  text(page,plan.furniture,left,y,plan.furnitureSize,fonts.regular,GRAY);
  const small=Math.max(5,6*k),measureSize=Math.max(5.5,8*k);
  text(page,measureText(item),left,bottom-measureSize*1.05,measureSize,fonts.regular);
  if(item.state==='pending')text(page,'PENDIENTE DE PEDIDO',left,bottom-measureSize*1.2-small*1.15,small,fonts.regular,AMBER,true);
  else if(item.oriented)text(page,'base × altura del pedido',left,bottom-measureSize*1.2-small*1.15,small,fonts.regular,GRAY);
  if(plan.scheme){
    const boxW=16*k*MM,boxH=item.edgeMap?10*k*MM:3*k*MM;
    edgeScheme(page,item,right,bottom,boxW,boxH);
    const font=item.edgeMap?fonts.mono:fonts.regular;
    text(page,plan.caption,right-font.widthOfTextAtSize(plan.caption,small),bottom-boxH-small*1.25,small,font,GRAY);
  }
}

/** Labels PDF on A4 portrait: every layout problem fails before any bytes are returned. */
export async function createLabelsPdf(project:Project,fontBytes:Uint8Array,monoBytes:Uint8Array,{template,margins,references,pending,guides=false}:LabelOptions):Promise<{bytes:Uint8Array;labels:number;pages:number}>{
  const {cells}=labelLayout(template,margins);
  const items=labelItems(project,references,pending);
  if(!items.length)throw new Error('No hay piezas para etiquetar.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const fonts:Fonts={regular:await pdf.embedFont(fontBytes,{subset:true}),mono:await pdf.embedFont(monoBytes,{subset:true})};
  pdf.setTitle(`Planos Santo · Etiquetas · ${project.name}`);pdf.setCreator(`Planos Santo ${version} · Etiquetas A4`);
  const plans=items.map((item,i)=>planLabel(item,cells[i%cells.length],fonts,template));
  const pages=Math.ceil(plans.length/cells.length);
  for(let index=0;index<pages;index++){
    const page=pdf.addPage([A4_PORTRAIT_MM.width*MM,PAGE_H]);
    plans.slice(index*cells.length,(index+1)*cells.length).forEach((plan,i)=>drawLabel(page,plan,cells[i],fonts,guides));
  }
  return {bytes:await pdf.save(),labels:plans.length,pages};
}
