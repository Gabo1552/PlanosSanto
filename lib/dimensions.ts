import { Matrix4, Vector3 } from 'three';
import { bounds, normalizeDimensionDisplay, TOTAL_DIMENSIONS, type DimensionDisplay, type Furniture, type Vec3, type TotalDimension } from './model';
import {pieceCodeMap} from './pieceGroups';
import {convexHull} from './paintOrder';
import type { Envelope, Point } from './scene';

export type Rect={x:number;y:number;w:number;h:number};
export type DimensionSegment={a:Point;b:Point;kind:'dimension'|'extension'|'tick'|'leader'};
export type PieceRole='largo'|'ancho';
/** A cota the user can show, hide or move: one of a piece (by the representative of its equal pieces) or a total. */
export type DimensionRef={pieceId:string;role:PieceRole}|{total:TotalDimension};
export type Dimension={
  pieceId:string;code:string;axis:number;role:PieceRole|TotalDimension;valueMm:number;text:string;
  /** 0.8.31: a total of the furniture. pieceId and code are empty; localStart/localEnd are world millimetres. */
  total?:TotalDimension;
  mode:'linear'|'depth';
  localStart:Vec3;localEnd:Vec3;segments:DimensionSegment[];
  label:{center:Point;angle:number;width:number;height:number;rect:Rect};
  /** Codes of other pieces with the same measure in the same direction, covered by this cota. */
  shared?:string[];
  /** Set only when no free position existed: the cota prints anyway, flagged in the viewer and the sheet. */
  issue?:string;
};
export const dimensionRef=(d:Pick<Dimension,'pieceId'|'role'|'total'>):DimensionRef=>d.total?{total:d.total}:{pieceId:d.pieceId,role:d.role as PieceRole};
/** «P03 largo» or «alto total», as the notices and the viewer name a cota. */
export const dimensionName=(d:Pick<Dimension,'code'|'role'|'total'>)=>d.total?`${d.total} total`:`${d.code} ${d.role}`;
/** Stable key of a drawn cota (data-dimension in the viewer). */
export const dimensionId=(d:Pick<Dimension,'pieceId'|'axis'|'total'>)=>d.total?`total-${d.total}`:`${d.pieceId}-${d.axis}`;
export const DIMENSION_FONT_SIZE=13;
export const dimensionText=(value:number)=>`${new Intl.NumberFormat('es-AR',{useGrouping:false,maximumFractionDigits:2}).format(Number(value.toFixed(2)))} mm`;
const add=(p:Point,v:Point,s:number):Point=>({x:p.x+v.x*s,y:p.y+v.y*s});
const overlap=(a:Rect,b:Rect,gap=3)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;

export function segmentHitsRect(a:Point,b:Point,r:Rect,padding=1):boolean{
  const minX=r.x-padding,maxX=r.x+r.w+padding,minY=r.y-padding,maxY=r.y+r.h+padding;
  let lo=0,hi=1;
  for(const [origin,diff,min,max] of [[a.x,b.x-a.x,minX,maxX],[a.y,b.y-a.y,minY,maxY]]){
    if(Math.abs(diff)<1e-9){if(origin<min||origin>max)return false;continue;}
    let t0=(min-origin)/diff,t1=(max-origin)/diff;if(t0>t1)[t0,t1]=[t1,t0];
    lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
  }
  return true;
}
/** Crossing a line behind a text mask is conventional; erasing a tick or
 * measured endpoint leaves misleading fragments and is never acceptable. */
export function dimensionMarkHitsRect(segment:DimensionSegment,rect:Rect,padding=1):boolean{
  if(segment.kind==='tick')return segmentHitsRect(segment.a,segment.b,rect,padding);
  if(segment.kind!=='dimension')return false;
  const inside=(p:Point)=>p.x>=rect.x-padding&&p.x<=rect.x+rect.w+padding&&p.y>=rect.y-padding&&p.y<=rect.y+rect.h+padding;
  return inside(segment.a)||inside(segment.b);
}

function labelAt(center:Point,angle:number,width:number):Dimension['label']{
  const height=19,rad=angle*Math.PI/180;
  const w=Math.abs(Math.cos(rad))*width+Math.abs(Math.sin(rad))*height;
  const h=Math.abs(Math.sin(rad))*width+Math.abs(Math.cos(rad))*height;
  return {center,angle,width,height,rect:{x:center.x-w/2,y:center.y-h/2,w,h}};
}

/** Choose one stable representative per full physical size, within this furniture only.
 * Ignore floating-point transform noise; do not merge dimensions rounded for display.
 */
export function dimensionGroups(f:Furniture){
  const groups:Furniture['pieces'][]=[];
  for(const piece of [...f.pieces].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})||a.id.localeCompare(b.id))){
    const group=groups.find(items=>items[0].dimensions.every((value,i)=>Math.abs(value-piece.dimensions[i])<=1e-6));
    if(group)group.push(piece);else groups.push([piece]);
  }
  return groups;
}

export const dimensionKey=(pieceId:string,role:PieceRole)=>JSON.stringify([pieceId,role]);

/**
 * Piece cotas, one per group of equal pieces. Since 0.8.31 they are hidden unless turned on (dimensionDisplay.shownPieces);
 * the references follow a physical piece and equal-size instances share the same cota. hiddenDimensions, the list of
 * the earlier default (all shown), is kept in the guide for older versions and no longer decides anything here.
 */
export function dimensionChoices(f:Furniture){
  const codes=pieceCodeMap(f),shown=f.dimensionDisplay?.shownPieces||[];
  return dimensionGroups(f).flatMap(group=>(['largo','ancho'] as const).map((role,i)=>({
    pieceId:group[0].id,code:codes.get(group[0].id)!,pieceIds:group.map(p=>p.id),codes:[...new Set(group.map(p=>codes.get(p.id)!))],role,valueMm:group[0].dimensions[i],
    visible:shown.some(ref=>ref.role===role&&group.some(p=>p.id===ref.pieceId)),
  })));
}
/** The three totals of the furniture, shown unless turned off. `size` (furnitureEnvelope) gives their values. */
export function totalChoices(f:Furniture,size?:Record<TotalDimension,number>){
  const hidden=f.dimensionDisplay?.hiddenTotals||[];
  return TOTAL_DIMENSIONS.map(total=>({total,valueMm:size?.[total],visible:!hidden.includes(total)}));
}
/** Shows or hides one cota; returns the new dimensionDisplay (normalized: what the guide stores). */
export function setDimensionVisible(f:Furniture,ref:DimensionRef,visible:boolean):DimensionDisplay{
  const display=f.dimensionDisplay||{};
  if('total' in ref){
    const hiddenTotals=(display.hiddenTotals||[]).filter(total=>total!==ref.total);
    return normalizeDimensionDisplay({...display,hiddenTotals:visible?hiddenTotals:[...hiddenTotals,ref.total]});
  }
  const choice=dimensionChoices(f).find(c=>c.pieceIds.includes(ref.pieceId)&&c.role===ref.role);
  if(!choice)return normalizeDimensionDisplay(display);
  const shownPieces=(display.shownPieces||[]).filter(r=>!(r.role===ref.role&&choice.pieceIds.includes(r.pieceId)));
  return normalizeDimensionDisplay({...display,shownPieces:visible?[...shownPieces,{pieceId:choice.pieceId,role:ref.role}]:shownPieces});
}
/** Every total and every piece cota; moved positions are kept. */
export const showAllDimensions=(f:Furniture):DimensionDisplay=>normalizeDimensionDisplay({...f.dimensionDisplay,shownPieces:dimensionChoices(f).map(c=>({pieceId:c.pieceId,role:c.role})),hiddenTotals:[]});
/** Back to the default: the three totals and no piece cota; moved positions are kept. */
export const onlyTotalDimensions=(f:Furniture):DimensionDisplay=>normalizeDimensionDisplay({...f.dimensionDisplay,shownPieces:[],hiddenTotals:[]});
export function dimensionCaption(f:Furniture){
  const totals=totalChoices(f).filter(c=>c.visible).length,pieces=dimensionChoices(f).filter(c=>c.visible).length;
  if(!totals&&!pieces)return 'COTAS OCULTAS · MEDIDAS EN LA TABLA';
  const total=totals===TOTAL_DIMENSIONS.length?'TOTALES DEL MUEBLE':totals?`${totals} TOTAL${totals===1?'':'ES'}`:'';
  return `COTAS EN mm · ${[total,pieces?`${pieces} DE PIEZA`:'PIEZAS EN LA TABLA'].filter(Boolean).join(' · ')}`;
}

/** Two cotas are the same measure within this tolerance, and only if they also print the same text. */
export const EQUAL_DIMENSION_MM=.5;
/** Layout notices of cotas never block the sheet: they print where they least obstruct. */
export const isDimensionNotice=(warning:string)=>/^Cotas (sin lugar libre|que no entran en la vista):/.test(warning);
/** `printed`: text in depth mode; `linear`: text along a linear cota (totals always name their role). */
type Request={pieceId:string;code:string;axis:number;role:Dimension['role'];total?:TotalDimension;valueMm:number;edges:{a:Point;b:Point;localStart:Vec3;localEnd:Vec3}[];difficulty:number;direction:Vector3;printed:string;linear:string;offset?:[number,number]};
/**
 * Same length (±0,5 mm and identical printed text), same direction in the furniture and same kind of cota (linear or
 * depth leader, whose text names the role): one cota stands for all. An omitted cota therefore never carries a
 * different number than the one drawn, and the table keeps every piece.
 */
export function sameMeasure(a:Pick<Request,'direction'|'valueMm'|'printed'>,b:Pick<Request,'direction'|'valueMm'|'printed'>){
  return Math.abs(a.direction.dot(b.direction))>.999&&Math.abs(a.valueMm-b.valueMm)<=EQUAL_DIMENSION_MM&&a.printed===b.printed;
}

/** A point inside or on a convex polygon (the screen hull of the furniture box). */
function insideHull(hull:Point[],p:Point){
  if(hull.length<3)return false;
  let sign=0;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length],c=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    if(Math.abs(c)<1e-9)continue;if(!sign)sign=Math.sign(c);else if(Math.sign(c)!==sign)return false;
  }
  return true;
}
const rectHitsHull=(hull:Point[],r:Rect)=>hull.some((p,i)=>segmentHitsRect(p,hull[(i+1)%hull.length],r,0))||insideHull(hull,{x:r.x+r.w/2,y:r.y+r.h/2});

/**
 * All values come from the local box and accumulated axis scale, never from projected pixels.
 * `totals` (0.8.31): the box of the whole furniture in its front frame (furnitureEnvelope) and the world-to-sheet
 * projection of the scene. Its three totals are placed first, outside the drawing (ancho below, alto beside it),
 * with the same free-position rules as the cotas of the pieces.
 */
export function makeDimensions(f:Furniture,anchor:(pieceId:string,local:Vec3)=>Point,obstacles:Rect[],noteLeaders:DimensionSegment[]=[],protectedNotes:Rect[]=[],viewport={width:960,height:580},view:'front'|'back'='front',totals?:{envelope:Envelope;project:(world:Vec3)=>Point}){
  const pieceRects:Rect[]=[],requests:Request[]=[],totalRequests:Request[]=[];
  const choices=dimensionChoices(f),representatives=new Set(choices.map(c=>c.pieceId));
  const visible=new Set(choices.filter(c=>c.visible).map(c=>dimensionKey(c.pieceId,c.role)));
  const codes=pieceCodeMap(f);
  const manual=(pieceId:string,role:Dimension['role'])=>{
    const choice=choices.find(c=>c.pieceId===pieceId&&c.role===role);
    const ref=f.presentation?.dimensionOffsets?.find(r=>r.view===view&&r.role===role&&choice?.pieceIds.includes(r.pieceId));
    return ref?[ref.offset[0]*viewport.width,ref.offset[1]*viewport.height] as [number,number]:undefined;
  };
  for(const piece of f.pieces){
    const box=bounds(piece.mesh),min=box.min.toArray(),max=box.max.toArray(),matrix=new Matrix4().fromArray(piece.transform);
    const lengths=[0,1,2].map(axis=>(max[axis]-min[axis])*new Vector3().setFromMatrixColumn(matrix,axis).length());
    const rank=[0,1,2].sort((a,b)=>lengths[b]-lengths[a]);
    const corners=Array.from({length:8},(_,bits)=>[0,1,2].map(axis=>bits&(1<<axis)?max[axis]:min[axis]) as Vec3).map(p=>anchor(piece.id,p));
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
    pieceRects.push({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)});
    if(!representatives.has(piece.id))continue;
    for(let axis=0;axis<3;axis++){
      // Thickness stays in the parts table; only the two major dimensions are drawn.
      if(axis===rank[2])continue;
      const role=axis===rank[0]?'largo':'ancho';
      if(!visible.has(dimensionKey(piece.id,role)))continue;
      const others=[0,1,2].filter(i=>i!==axis),edges=[];
      for(let bits=0;bits<4;bits++){
        const a=[...min] as Vec3,b=[...min] as Vec3;b[axis]=max[axis];
        others.forEach((other,index)=>{a[other]=b[other]=bits&(1<<index)?max[other]:min[other];});
        edges.push({a:anchor(piece.id,a),b:anchor(piece.id,b),localStart:a,localEnd:b});
      }
      const difficulty=Math.hypot(edges[0].b.x-edges[0].a.x,edges[0].b.y-edges[0].a.y);
      requests.push({pieceId:piece.id,code:codes.get(piece.id)!,axis,role,valueMm:lengths[axis],edges,difficulty,
        direction:new Vector3().setFromMatrixColumn(matrix,axis).normalize(),printed:difficulty<0.05?`${role} ${dimensionText(lengths[axis])}`:dimensionText(lengths[axis]),linear:dimensionText(lengths[axis]),offset:manual(piece.id,role)});
    }
  }
  // Totals: the four parallel edges of the furniture box for each of alto, ancho and profundidad.
  let hull:Point[]=[],box:Rect|undefined;
  if(totals){
    const {envelope:e,project}=totals,hidden=new Set(f.dimensionDisplay?.hiddenTotals||[]);
    const world=(at:Record<TotalDimension,number>)=>{const v=new Vector3();for(const r of TOTAL_DIMENSIONS)v.addScaledVector(e.axes[r],at[r]);return v.toArray() as Vec3;};
    const corners=Array.from({length:8},(_,bits)=>project(world({alto:bits&1?e.max.alto:e.min.alto,ancho:bits&2?e.max.ancho:e.min.ancho,profundidad:bits&4?e.max.profundidad:e.min.profundidad})));
    hull=convexHull(corners);
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    TOTAL_DIMENSIONS.forEach((total,axis)=>{
      if(hidden.has(total))return;
      const others=TOTAL_DIMENSIONS.filter(r=>r!==total),edges=[];
      for(let bits=0;bits<4;bits++){
        const at={...e.min};others.forEach((other,index)=>{at[other]=bits&(1<<index)?e.max[other]:e.min[other];});
        const a=world({...at,[total]:e.min[total]}),b=world({...at,[total]:e.max[total]});
        edges.push({a:project(a),b:project(b),localStart:a,localEnd:b});
      }
      const text=`${total} ${dimensionText(e.size[total])}`,moved=f.dimensionDisplay?.totalOffsets?.find(r=>r.view===view&&r.total===total);
      totalRequests.push({pieceId:'',code:'',axis,role:total,total,valueMm:e.size[total],edges,difficulty:Math.hypot(edges[0].b.x-edges[0].a.x,edges[0].b.y-edges[0].a.y),
        direction:e.axes[total].clone(),printed:text,linear:text,offset:moved?[moved.offset[0]*viewport.width,moved.offset[1]*viewport.height]:undefined});
    });
  }
  const missingName=(req:Request)=>req.total?`${req.total} total`:`${req.code} (${req.role})`;
  // Place the main lengths first; short dimensions can put their text outside the ticks.
  requests.sort((a,b)=>f.presentation?.compact?(a.code.localeCompare(b.code,undefined,{numeric:true})||a.axis-b.axis):(b.difficulty-a.difficulty||a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis));
  const dimensions:Dimension[]=[],occupied=[...obstacles],previousLines:DimensionSegment[]=[],missing:string[]=[];
  if(f.presentation?.compact){
    let compactSlot=0;
    for(const req of [...totalRequests,...requests]){
      const columns=viewport.width>700?4:2,columnWidth=(viewport.width-20)/columns,rows=Math.floor((viewport.height-40-220-19)/20)+1;
      let placed=false;
      while(compactSlot<columns*rows&&!placed){
        const slot=compactSlot++,column=Math.floor(slot/rows),row=slot%rows;
        const text=req.total?`${req.total} total ${dimensionText(req.valueMm)}`:`${req.code} ${req.role} ${dimensionText(req.valueMm)}`,width=text.length*DIMENSION_FONT_SIZE*.61+10;
        const center={x:10+columnWidth*(column+.5),y:229.5+row*20},label=labelAt(center,0,width);
        if(width>columnWidth-6||occupied.some(rect=>overlap(label.rect,rect,0)))continue;
        const edge=[...req.edges].sort((a,b)=>Math.hypot((a.a.x+a.b.x)/2-center.x,(a.a.y+a.b.y)/2-center.y)-Math.hypot((b.a.x+b.b.x)/2-center.x,(b.a.y+b.b.y)/2-center.y))[0];
        const target={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2};
        dimensions.push({pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,...(req.total?{total:req.total}:{}),valueMm:req.valueMm,text,mode:'depth',localStart:edge.localStart,localEnd:edge.localEnd,segments:[{a:edge.a,b:target,kind:'dimension'}],label});
        occupied.push(label.rect);placed=true;
      }
      if(!placed)missing.push(missingName(req));
    }
    dimensions.sort((a,b)=>a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
    return {dimensions,warnings:missing.length?[`No hay espacio legible para todas las cotas: ${missing.slice(0,8).join(', ')}${missing.length>8?` y ${missing.length-8} más`:''}. Revisá el zoom o las notas; no se exportará un plano incompleto.`]:[]};
  }
  const inside=(p:Point)=>p.x>=9&&p.x<=viewport.width-9&&p.y>=9&&p.y<=viewport.height-40;
  const fits=(r:Rect)=>r.x>=9&&r.y>=9&&r.x+r.w<=viewport.width-9&&r.y+r.h<=viewport.height-40;
  /**
   * Totals read best off the drawing: ancho under it, alto beside it, profundidad anywhere outside. A text on the
   * furniture box costs more than one outside on the wrong side; piece cotas have no preference.
   */
  function preference(req:Request,r:Rect){
    if(!req.total||!box)return 0;
    if(rectHitsHull(hull,r))return 150;
    const center={x:r.x+r.w/2,y:r.y+r.h/2};
    const preferred=req.total==='ancho'?center.y>box.y+box.h*.6:req.total==='alto'?center.x<box.x+box.w*.25||center.x>box.x+box.w*.75:true;
    return preferred?0:60;
  }
  /** Every geometrically possible position of one cota, with the cost that does not depend on other cotas. */
  function candidates(req:Request,expanded:boolean){
    const out:{d:Dimension;cost:number}[]=[];
    const text=req.linear,width=text.length*DIMENSION_FONT_SIZE*0.61+10;
    const base={pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,...(req.total?{total:req.total}:{}),valueMm:req.valueMm};
    for(const edge of req.edges){
      const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy);
      if(length<0.05){
        // The measured axis points into the camera. Use a named leader, never a fictitious length.
        const depthWidth=req.printed.length*DIMENSION_FONT_SIZE*.61+10;
        for(const radius of [24,40,64,96,140,190])for(let direction=0;direction<16;direction++){
          const angle=direction*Math.PI/8,center={x:edge.a.x+Math.cos(angle)*(radius+depthWidth/2),y:edge.a.y+Math.sin(angle)*radius};
          const label=labelAt(center,0,depthWidth),r=label.rect;
          const segment:DimensionSegment={a:edge.a,b:{x:Math.max(r.x,Math.min(edge.a.x,r.x+r.w)),y:Math.max(r.y,Math.min(edge.a.y,r.y+r.h))},kind:'leader'};
          out.push({d:{...base,text:req.printed,mode:'depth',localStart:edge.localStart,localEnd:edge.localEnd,segments:[segment],label},cost:radius+pieceRects.filter(other=>overlap(r,other)).length*100+preference(req,r)});
        }
        continue;
      }
      const u={x:dx/length,y:dy/length};
      let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
      for(const side of [-1,1]){
        const normal={x:-u.y*side,y:u.x*side};
        for(const offset of (expanded?[8,12,16,20,24,28,34,40,48,58,66,78,88,101,114,130,146,164,182,202,222]:[12,22,34,48,66,88,114,146,182,222])){
          const a=add(edge.a,normal,offset),b=add(edge.b,normal,offset),middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
          const baseShifts=length>width+16?[0,-length*.2,length*.2]:[-(length+width)/2-8,(length+width)/2+8];
          const shifts=expanded?[...new Set([...baseShifts,0,-width/2,width/2,-width,width,-width*1.5,width*1.5,-length*.4,length*.4,-(length+width)/2-8,(length+width)/2+8])]:baseShifts;
          // A slanted total may also read level (as the depth leaders do), kept clear of its own line: its box is
          // much smaller than that of a turned text, which matters on the narrow margins of the A4 views.
          const level=req.total&&Math.abs(angle)>8?Math.abs(normal.x)*width/2+Math.abs(normal.y)*19/2+4:undefined;
          for(const [shift,flat] of shifts.flatMap(shift=>level===undefined?[[shift,false] as const]:[[shift,false] as const,[shift,true] as const])){
            const center=add(add(middle,normal,flat?level!:14),u,shift),label=labelAt(center,flat?0:angle,width),r=label.rect;
            const segments:DimensionSegment[]=[
              {a:add(edge.a,normal,3),b:add(a,normal,4),kind:'extension'},
              {a:add(edge.b,normal,3),b:add(b,normal,4),kind:'extension'},
              {a,b,kind:'dimension'},
            ];
            for(const p of [a,b])segments.push({a:add(add(p,u,-3),normal,-3),b:add(add(p,u,3),normal,3),kind:'tick'});
            if(shift)segments.push({a:middle,b:add(middle,u,shift),kind:'leader'});
            // Prefer clear paper. AABB overlap is a cost, not proof that the label covers a face.
            const geometryOverlap=pieceRects.filter(other=>overlap(r,other,1)).length;
            const crossings=segments.filter(s=>pieceRects.some(other=>segmentHitsRect(s.a,s.b,other,0))).length;
            out.push({d:{...base,text,mode:'linear',localStart:edge.localStart,localEnd:edge.localEnd,segments,label},cost:offset+Math.abs(shift)*.25+crossings*12+geometryOverlap*100+preference(req,r)+(flat?15:0)});
          }
        }
      }
    }
    return out;
  }
  /** Outside the paper is never acceptable; the other faults are what the layout resolves. */
  const onPaper=(d:Dimension)=>fits(d.label.rect)&&(d.mode==='depth'||d.segments.filter(s=>s.kind==='dimension').every(s=>inside(s.a)&&inside(s.b)));
  function faults(d:Dimension){
    const r=d.label.rect;let n=0;
    if(d.mode==='linear'){
      if(d.segments.some(s=>protectedNotes.some(other=>segmentHitsRect(s.a,s.b,other,1))))n++;
      if(noteLeaders.some(s=>segmentHitsRect(s.a,s.b,r,3)))n++;
    }else if(protectedNotes.some(other=>segmentHitsRect(d.segments[0].a,d.segments[0].b,other)))n++;
    if(occupied.some(other=>overlap(r,other)))n++;
    // Keep complete measurement endpoints and ticks outside every other text mask.
    if(previousLines.some(s=>dimensionMarkHitsRect(s,r,2))||d.segments.some(s=>dimensions.some(other=>dimensionMarkHitsRect(s,other.label.rect,2))))n++;
    return n;
  }
  const textCrossings=(d:Dimension)=>d.mode==='depth'?0:d.segments.filter(s=>occupied.some(other=>segmentHitsRect(s.a,s.b,other,1))).length+previousLines.filter(s=>segmentHitsRect(s.a,s.b,d.label.rect,2)).length;
  /** Cheapest free position; `relaxed` takes the least obstructive one when no free position exists. */
  function best(req:Request,relaxed=false){
    let found:Dimension|undefined,cost=Infinity;
    for(const expanded of [false,true]){
      // Totals (three per sheet) always weigh the finer positions too: one off the drawing beats the first found.
      if(found&&!req.total)break;
      for(const option of candidates(req,expanded)){
        if(!onPaper(option.d))continue;
        const n=faults(option.d);if(n&&!relaxed)continue;
        const total=option.cost+textCrossings(option.d)*65+n*1000;
        if(total<cost){cost=total;found=option.d;}
      }
    }
    return found;
  }
  const moved=(d:Dimension,dx:number,dy:number):Dimension=>{
    const shift=(p:Point)=>({x:p.x+dx,y:p.y+dy});
    return {...d,label:{...d.label,center:shift(d.label.center),rect:{...d.label.rect,x:d.label.rect.x+dx,y:d.label.rect.y+dy}},
      segments:d.segments.map(s=>({...s,a:s.kind==='extension'||(d.mode==='depth'&&s.kind==='leader')?s.a:shift(s.a),b:shift(s.b)}))};
  };
  /** A moved cota stays where it was put when that is free; otherwise it goes to the nearest free position. */
  function placeMoved(req:Request,[dx,dy]:[number,number]){
    const origin=best(req)||best(req,true);if(!origin)return undefined;
    const wanted=moved(origin,dx,dy),target=wanted.label.center;
    const free=(d:Dimension)=>onPaper(d)&&!faults(d);
    if(free(wanted))return wanted;
    let found:Dimension|undefined,distance=Infinity;
    const consider=(d:Dimension)=>{const k=Math.hypot(d.label.center.x-target.x,d.label.center.y-target.y);if(k<distance&&free(d)){distance=k;found=d;}};
    for(const step of [6,12,18,24,32,40,50,60,75,90])for(let i=0;i<16;i++)consider(moved(wanted,Math.cos(i*Math.PI/8)*step,Math.sin(i*Math.PI/8)*step));
    if(!found)for(const expanded of [false,true])for(const option of candidates(req,expanded)){consider(option.d);consider(moved(option.d,dx,dy));}
    return found||(onPaper(wanted)?wanted:origin);
  }
  // Equal measures form one class; the cota of a moved member is placed first, then the rest avoid it.
  // Totals are never merged with a piece cota (their text names them).
  const classes:Request[][]=totalRequests.map(req=>[req]);
  for(const req of requests){const found=classes.find(group=>sameMeasure(group[0],req));if(found)found.push(req);else classes.push([req]);}
  for(const group of classes)group.sort((a,b)=>Number(!!b.offset)-Number(!!a.offset)||a.code.localeCompare(b.code,undefined,{numeric:true})||a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
  // Totals go first in a fixed order, moved or not, so that a moved cota starts from the place it had unmoved.
  for(const group of [...classes.filter(g=>g[0].total),...classes.filter(g=>!g[0].total&&g[0].offset),...classes.filter(g=>!g[0].total&&!g[0].offset)]){
    let placed:Dimension|undefined;
    for(const req of group){placed=req.offset?placeMoved(req,req.offset):best(req);if(placed)break;}
    placed??=best(group[0],true);
    if(!placed){missing.push(missingName(group[0]));continue;}
    const shared=[...new Set(group.map(r=>r.code).filter(code=>code!==placed!.code))];
    if(shared.length)placed.shared=shared;
    dimensions.push(placed);occupied.push(placed.label.rect);previousLines.push(...placed.segments);
  }
  // Independent check of the final sheet: only a cota without any free position remains flagged.
  const problems:string[]=[],missingTotals=missing.filter(name=>name.endsWith(' total')).length;
  for(const d of dimensions){
    const r=d.label.rect,issues:string[]=[];
    if(d.segments.some(s=>protectedNotes.some(note=>segmentHitsRect(s.a,s.b,note,0))))issues.push('cruza una nota');
    if(dimensions.some(other=>other!==d&&(other.segments.some(s=>dimensionMarkHitsRect(s,r,1))||d.segments.some(s=>dimensionMarkHitsRect(s,other.label.rect,1)))))issues.push('tapa marcas de otra');
    if(obstacles.some(other=>overlap(r,other,0))||dimensions.some(other=>other!==d&&overlap(r,other.label.rect,0)))issues.push('queda superpuesta');
    if(issues.length){d.issue=`${dimensionName(d)}: ${issues.join(' y ')}`;problems.push(d.issue);}
  }
  const warnings=[
    ...(problems.length?[`Cotas sin lugar libre: ${problems.slice(0,6).join('; ')}${problems.length>6?` y ${problems.length-6} más`:''}. Se imprimen igual donde menos tapan; para despejarlas bajá el zoom u ocultá alguna cota.`]:[]),
    ...(missing.length?[`Cotas que no entran en la vista: ${missing.slice(0,8).join(', ')}${missing.length>8?` y ${missing.length-8} más`:''}. ${missingTotals?missingTotals<missing.length?'Las medidas totales no figuran en la tabla y las de pieza sí':'Las medidas totales no figuran en la tabla':'Sus medidas siguen en la tabla'}; bajá el zoom para dibujarlas.`]:[]),
  ];
  dimensions.sort((a,b)=>a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
  return {dimensions,warnings};
}

export function moveDimension(f:Furniture,pieceId:string,role:PieceRole,view:'front'|'back',offset:[number,number]){
  const choice=dimensionChoices(f).find(c=>c.role===role&&c.pieceIds.includes(pieceId));
  const existing=f.presentation?.dimensionOffsets||[];
  if(!choice)return existing;
  return [...existing.filter(ref=>!(ref.role===role&&ref.view===view&&choice.pieceIds.includes(ref.pieceId))),{pieceId:choice.pieceId,role,view,offset:offset.map(n=>Math.max(-1,Math.min(1,n))) as [number,number]}];
}
/** Stores a hand-moved total for `view` (fractions of the sheet, as dimensionOffsets); returns the new dimensionDisplay. */
export function moveTotalDimension(f:Furniture,total:TotalDimension,view:'front'|'back',offset:[number,number]):DimensionDisplay{
  const existing=f.dimensionDisplay?.totalOffsets||[];
  return normalizeDimensionDisplay({...f.dimensionDisplay,totalOffsets:[...existing.filter(r=>!(r.total===total&&r.view===view)),{total,view,offset:offset.map(n=>Math.max(-1,Math.min(1,n))) as [number,number]}]});
}
