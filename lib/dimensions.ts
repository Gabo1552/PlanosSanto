import { Matrix4, Vector3 } from 'three';
import { bounds, type Furniture, type Vec3, type HiddenDimension } from './model';
import {pieceCodeMap} from './pieceGroups';
import type { Point } from './scene';

export type Rect={x:number;y:number;w:number;h:number};
export type DimensionSegment={a:Point;b:Point;kind:'dimension'|'extension'|'tick'|'leader'};
export type Dimension={
  pieceId:string;code:string;axis:number;role:'largo'|'ancho';valueMm:number;text:string;
  mode:'linear'|'depth';
  localStart:Vec3;localEnd:Vec3;segments:DimensionSegment[];
  label:{center:Point;angle:number;width:number;height:number;rect:Rect};
};
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

export const dimensionKey=(pieceId:string,role:Dimension['role'])=>JSON.stringify([pieceId,role]);

/** Hidden references follow a physical piece; equal-size instances share the same cota. */
export function dimensionChoices(f:Furniture){
  const codes=pieceCodeMap(f);
  return dimensionGroups(f).flatMap(group=>(['largo','ancho'] as const).map((role,i)=>({
    pieceId:group[0].id,code:codes.get(group[0].id)!,pieceIds:group.map(p=>p.id),codes:[...new Set(group.map(p=>codes.get(p.id)!))],role,valueMm:group[0].dimensions[i],
    visible:!(f.hiddenDimensions||[]).some(ref=>ref.role===role&&group.some(p=>p.id===ref.pieceId)),
  })));
}
export function setDimensionVisible(f:Furniture,pieceId:string,role:Dimension['role'],visible:boolean):HiddenDimension[]{
  const choice=dimensionChoices(f).find(c=>c.pieceIds.includes(pieceId)&&c.role===role);
  if(!choice)return f.hiddenDimensions||[];
  const next=(f.hiddenDimensions||[]).filter(ref=>!(ref.role===role&&choice.pieceIds.includes(ref.pieceId)));
  return visible?next:[...next,{pieceId:choice.pieceId,role}];
}
export function dimensionCaption(f:Furniture){
  const choices=dimensionChoices(f),hidden=choices.filter(c=>!c.visible).length;
  if(hidden===choices.length)return 'COTAS OCULTAS · MEDIDAS EN LA TABLA';
  return `COTAS EN mm · UNA PIEZA POR TAMAÑO${hidden?` · ${hidden} OCULTA${hidden===1?'':'S'}`:''}`;
}

/** All values come from the local box and accumulated axis scale, never from projected pixels. */
export function makeDimensions(f:Furniture,anchor:(pieceId:string,local:Vec3)=>Point,obstacles:Rect[],noteLeaders:DimensionSegment[]=[],protectedNotes:Rect[]=[],viewport={width:960,height:580},view:'front'|'back'='front'){
  const pieceRects:Rect[]=[],requests:{pieceId:string;code:string;axis:number;role:Dimension['role'];valueMm:number;edges:{a:Point;b:Point;localStart:Vec3;localEnd:Vec3}[];difficulty:number}[]=[];
  const choices=dimensionChoices(f),representatives=new Set(choices.map(c=>c.pieceId));
  const visible=new Set(choices.filter(c=>c.visible).map(c=>dimensionKey(c.pieceId,c.role)));
  const codes=pieceCodeMap(f);
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
      if(!visible.has(dimensionKey(piece.id,axis===rank[0]?'largo':'ancho')))continue;
      const others=[0,1,2].filter(i=>i!==axis),edges=[];
      for(let bits=0;bits<4;bits++){
        const a=[...min] as Vec3,b=[...min] as Vec3;b[axis]=max[axis];
        others.forEach((other,index)=>{a[other]=b[other]=bits&(1<<index)?max[other]:min[other];});
        edges.push({a:anchor(piece.id,a),b:anchor(piece.id,b),localStart:a,localEnd:b});
      }
      requests.push({pieceId:piece.id,code:codes.get(piece.id)!,axis,role:axis===rank[0]?'largo':'ancho',valueMm:lengths[axis],edges,
        difficulty:Math.hypot(edges[0].b.x-edges[0].a.x,edges[0].b.y-edges[0].a.y)});
    }
  }
  // Place the main lengths first; short dimensions can put their text outside the ticks.
  requests.sort((a,b)=>f.presentation?.compact?(a.code.localeCompare(b.code,undefined,{numeric:true})||a.axis-b.axis):(b.difficulty-a.difficulty||a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis));
  const dimensions:Dimension[]=[],occupied=[...obstacles],previousLines:DimensionSegment[]=[],missing:string[]=[];
  let compactSlot=0;
  for(const req of requests){
    if(f.presentation?.compact){
      const columns=viewport.width>700?4:2,columnWidth=(viewport.width-20)/columns,rows=Math.floor((viewport.height-40-220-19)/20)+1;
      let placed=false;
      while(compactSlot<columns*rows&&!placed){
        const slot=compactSlot++,column=Math.floor(slot/rows),row=slot%rows;
        const text=`${req.code} ${req.role} ${dimensionText(req.valueMm)}`,width=text.length*DIMENSION_FONT_SIZE*.61+10;
        const center={x:10+columnWidth*(column+.5),y:229.5+row*20},label=labelAt(center,0,width);
        if(width>columnWidth-6||occupied.some(rect=>overlap(label.rect,rect,0)))continue;
        const edge=[...req.edges].sort((a,b)=>Math.hypot((a.a.x+a.b.x)/2-center.x,(a.a.y+a.b.y)/2-center.y)-Math.hypot((b.a.x+b.b.x)/2-center.x,(b.a.y+b.b.y)/2-center.y))[0];
        const target={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2};
        dimensions.push({pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,valueMm:req.valueMm,text,mode:'depth',localStart:edge.localStart,localEnd:edge.localEnd,segments:[{a:edge.a,b:target,kind:'dimension'}],label});
        occupied.push(label.rect);placed=true;
      }
      if(!placed)missing.push(`${req.code} (${req.role})`);
      continue;
    }
    const text=dimensionText(req.valueMm),width=text.length*DIMENSION_FONT_SIZE*0.61+10;
    let best:Dimension|undefined,bestCost=Infinity;
    for(const expanded of [false,true]){
      if(best)break;
    for(const edge of req.edges){
      const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy);
      if(length<0.05){
        // The measured axis points into the camera. Use a named leader, never a fictitious length.
        const depthText=`${req.role} ${text}`,depthWidth=depthText.length*DIMENSION_FONT_SIZE*.61+10;
        for(const radius of [24,40,64,96,140,190])for(let direction=0;direction<16;direction++){
          const angle=direction*Math.PI/8,center={x:edge.a.x+Math.cos(angle)*(radius+depthWidth/2),y:edge.a.y+Math.sin(angle)*radius};
          const label=labelAt(center,0,depthWidth),r=label.rect;
          if(r.x<9||r.y<9||r.x+r.w>viewport.width-9||r.y+r.h>viewport.height-40||occupied.some(other=>overlap(r,other)))continue;
          const segment:DimensionSegment={a:edge.a,b:{x:Math.max(r.x,Math.min(edge.a.x,r.x+r.w)),y:Math.max(r.y,Math.min(edge.a.y,r.y+r.h))},kind:'leader'};
          if(protectedNotes.some(other=>segmentHitsRect(segment.a,segment.b,other)))continue;
          if(previousLines.some(s=>dimensionMarkHitsRect(s,r,2))||dimensions.some(d=>dimensionMarkHitsRect(segment,d.label.rect,2)))continue;
          const cost=radius+pieceRects.filter(other=>overlap(r,other)).length*100;
          if(cost<bestCost){bestCost=cost;best={pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,valueMm:req.valueMm,text:depthText,mode:'depth',localStart:edge.localStart,localEnd:edge.localEnd,segments:[segment],label};}
        }
        continue;
      }
      const u={x:dx/length,y:dy/length};
      let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
      for(const side of [-1,1]){
        const normal={x:-u.y*side,y:u.x*side};
        for(const offset of (expanded?[8,12,16,20,24,28,34,40,48,58,66,78,88,101,114,130,146,164,182,202,222]:[12,22,34,48,66,88,114,146,182,222])){
          const a=add(edge.a,normal,offset),b=add(edge.b,normal,offset),middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
          if([a,b].some(p=>p.x<9||p.x>viewport.width-9||p.y<9||p.y>viewport.height-40))continue;
          const baseShifts=length>width+16?[0,-length*.2,length*.2]:[-(length+width)/2-8,(length+width)/2+8];
          const shifts=expanded?[...new Set([...baseShifts,0,-width/2,width/2,-width,width,-width*1.5,width*1.5,-length*.4,length*.4,-(length+width)/2-8,(length+width)/2+8])]:baseShifts;
          for(const shift of shifts){
            const center=add(add(middle,normal,14),u,shift),label=labelAt(center,angle,width),r=label.rect;
            if(r.x<9||r.y<9||r.x+r.w>viewport.width-9||r.y+r.h>viewport.height-40||occupied.some(other=>overlap(r,other)))continue;
            // Prefer clear paper. AABB overlap is a cost, not proof that the label covers a face.
            const geometryOverlap=pieceRects.filter(other=>overlap(r,other,1)).length;
            const segments:DimensionSegment[]=[
              {a:add(edge.a,normal,3),b:add(a,normal,4),kind:'extension'},
              {a:add(edge.b,normal,3),b:add(b,normal,4),kind:'extension'},
              {a,b,kind:'dimension'},
            ];
            for(const p of [a,b])segments.push({a:add(add(p,u,-3),normal,-3),b:add(add(p,u,3),normal,3),kind:'tick'});
            if(shift)segments.push({a:middle,b:add(middle,u,shift),kind:'leader'});
            if(segments.some(s=>protectedNotes.some(other=>segmentHitsRect(s.a,s.b,other,1))))continue;
            if(noteLeaders.some(s=>segmentHitsRect(s.a,s.b,r,3)))continue;
            // Keep complete measurement endpoints and ticks outside every other text mask.
            if(previousLines.some(s=>dimensionMarkHitsRect(s,r,2))||segments.some(s=>dimensions.some(d=>dimensionMarkHitsRect(s,d.label.rect,2))))continue;
            const crossings=segments.filter(s=>pieceRects.some(other=>segmentHitsRect(s.a,s.b,other,0))).length;
            const textCrossings=segments.filter(s=>occupied.some(other=>segmentHitsRect(s.a,s.b,other,1))).length+previousLines.filter(s=>segmentHitsRect(s.a,s.b,r,2)).length;
            const cost=offset+Math.abs(shift)*.25+crossings*12+textCrossings*65+geometryOverlap*100;
            if(cost<bestCost){bestCost=cost;best={pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,valueMm:req.valueMm,text,mode:'linear',localStart:edge.localStart,localEnd:edge.localEnd,segments,label};}
          }
        }
      }
    }
    }
    if(best){dimensions.push(best);occupied.push(best.label.rect);previousLines.push(...best.segments);}
    else missing.push(`${req.code} (${req.role})`);
  }
  const warnings=missing.length?[`No hay espacio legible para todas las cotas: ${missing.slice(0,8).join(', ')}${missing.length>8?` y ${missing.length-8} más`:''}. Revisá el zoom o las notas; no se exportará un plano incompleto.`]:[];
  for(const d of dimensions){
    const choice=choices.find(c=>c.pieceId===d.pieceId&&c.role===d.role);
    const placement=f.presentation?.dimensionOffsets?.find(ref=>ref.view===view&&ref.role===d.role&&choice?.pieceIds.includes(ref.pieceId));
    if(!placement)continue;
    const dx=placement.offset[0]*viewport.width,dy=placement.offset[1]*viewport.height;
    const shift=(p:Point)=>({x:p.x+dx,y:p.y+dy});
    d.label={...d.label,center:shift(d.label.center),rect:{...d.label.rect,x:d.label.rect.x+dx,y:d.label.rect.y+dy}};
    d.segments=d.segments.map(s=>({...s,a:s.kind==='extension'||(d.mode==='depth'&&s.kind==='leader')?s.a:shift(s.a),b:shift(s.b)}));
  }
  const manualWarnings:string[]=[];
  for(const d of dimensions){
    const r=d.label.rect;
    if(r.x<8||r.y<8||r.x+r.w>viewport.width-8||r.y+r.h>viewport.height-35)manualWarnings.push(`${d.code}: la cota movida queda fuera de la vista.`);
    if(d.segments.some(s=>protectedNotes.some(note=>segmentHitsRect(s.a,s.b,note,0))))manualWarnings.push(`${d.code}: la cota cruza una nota. Movela antes de exportar.`);
    if(dimensions.some(other=>other!==d&&(other.segments.some(s=>dimensionMarkHitsRect(s,r,1))||d.segments.some(s=>dimensionMarkHitsRect(s,other.label.rect,1)))))manualWarnings.push(`${d.code}: el texto de una cota tapa marcas de otra. Mové la cota o restablecé su posición.`);
    if(obstacles.some(other=>overlap(r,other,0))||dimensions.some(other=>other!==d&&overlap(r,other.label.rect,0)))manualWarnings.push(`${d.code}: hay una cota superpuesta. Movela o restablecé su posición.`);
  }
  dimensions.sort((a,b)=>a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
  return {dimensions,warnings:[...warnings,...new Set(manualWarnings)]};
}

export function moveDimension(f:Furniture,pieceId:string,role:Dimension['role'],view:'front'|'back',offset:[number,number]){
  const choice=dimensionChoices(f).find(c=>c.role===role&&c.pieceIds.includes(pieceId));
  const existing=f.presentation?.dimensionOffsets||[];
  if(!choice)return existing;
  return [...existing.filter(ref=>!(ref.role===role&&ref.view===view&&choice.pieceIds.includes(ref.pieceId))),{pieceId:choice.pieceId,role,view,offset:offset.map(n=>Math.max(-1,Math.min(1,n))) as [number,number]}];
}
