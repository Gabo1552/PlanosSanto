import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Color } from 'three';
import { makeScene, guideViews, type View } from '../../lib/scene';
import { mm, type Furniture, type Project } from '../../lib/model';
import {pieceRows,groupedNameIssues,type PieceRow} from '../../lib/pieceGroups';
import { sheetEntries } from '../../lib/sheet';
import { DIMENSION_FONT_SIZE,dimensionCaption } from '../../lib/dimensions';
import release from '../version.json';
const {version}=release;

export const A4_LANDSCAPE_MM={width:297,height:210} as const;
const MM=72/25.4, PAGE_W=A4_LANDSCAPE_MM.width*MM, PAGE_H=A4_LANDSCAPE_MM.height*MM;
const INK=rgb(8/255,12/255,46/255),BLUE=rgb(31/255,77/255,120/255),GRAY=rgb(0.32,0.39,0.46);
const TEAL=rgb(7/255,54/255,62/255),RULE=rgb(0.72,0.77,0.82),WHITE=rgb(1,1,1);

type Fonts={regular:PDFFont;mono:PDFFont};

export function decode64(value:string):Uint8Array{
  return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
export function encode64(bytes:Uint8Array):string{
  let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
function ensureGlyphs(font:PDFFont,text:string){
  const available=new Set(font.getCharacterSet());
  for(const char of text)if(char!=='\n'&&!available.has(char.codePointAt(0)!))throw new Error(`El PDF no puede representar el carácter «${char}». Cambiá ese carácter antes de exportar.`);
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
  ensureGlyphs(font,value);page.drawText(value,{x,y:PAGE_H-top-size,size,font,color});
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

type TableRow={piece:PieceRow;lines:string[];height:number};
const TABLE_FONT=8, TABLE_LEADING=10;
function tableRows(f:Furniture,font:PDFFont,references?:Record<string,string>):TableRow[]{
  return pieceRows(f).map(piece=>{
    const referenceValues=references?[...new Set(piece.memberIds.map(id=>references[id]||''))]:[];
    if(referenceValues.length>1)throw new Error(`${piece.code}: las piezas agrupadas tienen asignaciones de pedido distintas. Desagrupá para imprimir sus materiales.`);
    const reference=referenceValues[0];
    const lines=[...linesFor(piece.name,35*MM,font,TABLE_FONT),...(reference?linesFor(reference,35*MM,font,TABLE_FONT):[])];
    return {piece,lines,height:Math.max(5.6*MM,lines.length*TABLE_LEADING+6)};
  });
}

/** One furniture, exactly one A4 page. Infeasible layouts fail before any bytes are returned. */
export async function createOfflinePdf(project:Project,fontBytes:Uint8Array,monoBytes:Uint8Array,logoBytes?:Uint8Array,references?:Record<string,string>):Promise<Uint8Array>{
  if(!project.furniture.length)throw new Error('Seleccioná al menos un mueble para exportar la guía A4.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const fonts:Fonts={regular:await pdf.embedFont(fontBytes,{subset:true}),mono:await pdf.embedFont(monoBytes,{subset:true})};
  const logo=logoBytes?await pdf.embedPng(logoBytes):undefined;
  pdf.setTitle(`Planos Santo · ${project.name}`);pdf.setCreator(`Planos Santo ${version} · PDF A4 offline`);
  const prepared=project.furniture.map(source=>{
    const f:Furniture={...source,presentation:{...source.presentation,guide:source.presentation?.guide||{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}}};
    const fail=(reason:string):never=>{throw new Error(`${f.name}: ${reason} No se recortó información ni se agregaron hojas. Ajustá las vistas, agrupá piezas iguales o acortá textos; cualquier hoja adicional requiere aprobación.`);};
    if(f.pieces.some(p=>!p.name.trim()))fail('Completá los nombres vacíos.');
    const rows=tableRows(f,fonts.regular,references);
    if(rows.reduce((h,r)=>h+r.height,0)>139*MM)fail('El listado no cabe legiblemente en una A4 con texto de 8 pt.');
    for(const {piece} of rows){
      if(fonts.regular.widthOfTextAtSize(piece.code,TABLE_FONT)>9*MM)fail(`${piece.code}: el identificador no cabe en la tabla.`);
      for(const value of [...piece.dimensions.map(mm),String(piece.quantity)])if(fonts.regular.widthOfTextAtSize(value,TABLE_FONT)>12*MM)fail(`${piece.code}: una medida o cantidad no cabe en su columna.`);
    }
    const entries=sheetEntries(f);
    const legendLines=entries.flatMap(entry=>linesFor(entry,175*MM,fonts.regular,8));
    const hasObservations=!!f.presentation?.guide?.observations?.trim();
    const legendHeight=Math.max(16*MM,legendLines.length*10+14+(hasObservations?0:8*MM));
    if(legendHeight>42*MM)fail('Las notas y observaciones no caben legiblemente debajo de las vistas. Acortá el texto o reducí la cantidad de notas.');
    const legendTop=194*MM-legendHeight, diagramTop=44*MM, diagramBottom=legendTop-9*MM;
    const views=guideViews(f),single=views.length===1,diagramWidth=(single?177:86)*MM;
    const scale=diagramWidth/(single?640:320);
    const sceneHeight=Math.floor((diagramBottom-diagramTop)/scale);
    const scenes=views.map((view,index)=>{
      const box={x:(single?8:index===0?8:99)*MM,top:diagramTop,width:diagramWidth,height:sceneHeight*scale};
      const scene=makeScene(f,{view,layout:'sheet',width:single?640:320,height:sceneHeight});
      const warnings=[...groupedNameIssues(f),...scene.warnings];
      if(warnings.length)fail(`${view==='front'?'Vista exterior':'Vista interior'}: ${[...new Set(warnings)].join(' ')}`);
      // Printed identifiers and dimensions must remain readable after scene scaling.
      if((scene.labels.length&&13*scale<7)||(scene.dimensions.length&&DIMENSION_FONT_SIZE*scale<7))fail('Las etiquetas o cotas quedarían por debajo de 7 pt. Elegí una sola vista.');
      return {view,scene,box};
    });
    if(linesFor(f.name,130*MM,fonts.regular,13).length>1||linesFor(project.name,130*MM,fonts.regular,9).length>1)fail('El nombre del proyecto o mueble no cabe en el encabezado. Acortalo antes de exportar.');
    return {f,rows,legendLines,legendTop,scenes};
  });
  for(const [pageIndex,{f,rows,legendLines,legendTop,scenes}] of prepared.entries()){
    const page=pdf.addPage([PAGE_W,PAGE_H]);page.setMediaBox(0,0,PAGE_W,PAGE_H);page.setCropBox(0,0,PAGE_W,PAGE_H);
    if(logo){const w=43*MM,h=w*logo.height/logo.width;if(h>22*MM)throw new Error('El logotipo supera el espacio del encabezado A4. Usá una imagen horizontal.');page.drawImage(logo,{x:8*MM,y:PAGE_H-8*MM-h,width:w,height:h});}
    else{text(page,'SANTO CARPINTERO',8*MM,9*MM,10,fonts.regular);text(page,'AMOBLAMIENTOS',8*MM,16*MM,8,fonts.regular);}
    text(page,'GUÍA DE ARMADO',56*MM,7*MM,9,fonts.regular,BLUE);
    text(page,f.name,56*MM,13*MM,13,fonts.regular);
    text(page,project.name,56*MM,22*MM,9,fonts.regular,GRAY);
    page.drawRectangle({x:190*MM,y:PAGE_H-30*MM,width:99*MM,height:23*MM,color:rgb(0.95,0.96,0.97),borderColor:RULE,borderWidth:0.5});
    text(page,'FICHA DE MUEBLE',193*MM,9*MM,8,fonts.regular,BLUE);
    text(page,`Hoja ${pageIndex+1} de ${project.furniture.length} · ${f.pieces.length} piezas`,193*MM,16*MM,9,fonts.regular);
    text(page,'A4 HORIZONTAL · MEDIDAS EN mm',193*MM,23*MM,8,fonts.regular,GRAY);
    line(page,8*MM,33*MM,289*MM,33*MM,INK,1);
    for(const {view,scene,box} of scenes){
      page.drawRectangle({x:box.x,y:PAGE_H-43*MM,width:box.width,height:7*MM,color:TEAL});
      text(page,view==='front'?'VISTA EXTERIOR':'VISTA INTERIOR',box.x+2*MM,38*MM,8,fonts.regular,WHITE);
      page.drawRectangle({x:box.x,y:PAGE_H-box.top-box.height,width:box.width,height:box.height,borderColor:RULE,borderWidth:0.5});
      diagram(page,f,fonts,view,scene,box);
    }
    const tx=190*MM,tw=99*MM;
    page.drawRectangle({x:tx,y:PAGE_H-43*MM,width:tw,height:7*MM,color:TEAL});
    text(page,'LISTADO COMPLETO DE PIEZAS',tx+2*MM,38*MM,8,fonts.regular,WHITE);
    const col=[0,11,48,61,74,87].map(n=>tx+n*MM);
    page.drawRectangle({x:tx,y:PAGE_H-52*MM,width:tw,height:7*MM,color:INK});
    ['ID','Nombre','Largo','Ancho','Esp.','Cant.'].forEach((value,i)=>text(page,value,col[i]+MM,47*MM,7.3,fonts.regular,WHITE));
    let top=52*MM;
    for(const [rowIndex,{piece,lines,height}] of rows.entries()){
      if(rowIndex%2===1)page.drawRectangle({x:tx,y:PAGE_H-top-height,width:tw,height,color:rgb(0.95,0.96,0.97)});
      line(page,tx,top,tx+tw,top,RULE,0.45);
      text(page,piece.code,col[0]+MM,top+3,TABLE_FONT,fonts.regular);
      lines.forEach((s,i)=>text(page,s,col[1]+MM,top+3+i*TABLE_LEADING,TABLE_FONT,fonts.regular));
      [...piece.dimensions.map(mm),String(piece.quantity)].forEach((s,i)=>text(page,s,col[i+2]+MM,top+3,TABLE_FONT,fonts.regular));
      for(const edge of [...col,tx+tw])line(page,edge,top,edge,top+height,RULE,0.45);
      top+=height;
    }
    line(page,tx,top,tx+tw,top,RULE,0.45);
    text(page,'NOTAS Y OBSERVACIONES DE ARMADO',8*MM,legendTop,8,fonts.regular,BLUE);
    legendLines.forEach((s,i)=>text(page,s,8*MM,legendTop+13+i*10,8,fonts.regular,GRAY));
    if(!f.presentation?.guide?.observations?.trim()){text(page,'Observaciones:',8*MM,188*MM,8,fonts.regular,GRAY);line(page,8*MM,193*MM,185*MM,193*MM,RULE,0.45);}
    line(page,8*MM,198*MM,289*MM,198*MM,TEAL,0.8);
    text(page,'PLANOS SANTO · 297 × 210 mm · Imprimir al 100 % · No medir sobre el dibujo',8*MM,201*MM,8,fonts.regular,GRAY);
    text(page,`${pageIndex+1} / ${project.furniture.length}`,279*MM,201*MM,8,fonts.regular,GRAY);
  }
  const bytes=await pdf.save();
  if(bytes.length>30*1024*1024)throw new Error('El PDF supera 30 MB. No se exportó un archivo incompleto.');
  return bytes;
}
