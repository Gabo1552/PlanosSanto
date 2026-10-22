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
  /** Codes of other pieces with the same measure in the same direction, covered by this cota. */
  shared?:string[];
  /** Set only when no free position existed: the cota prints anyway, flagged in the viewer and the sheet. */
  issue?:string;
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
  return `COTAS EN mm · MEDIDAS IGUALES UNA SOLA VEZ${hidden?` · ${hidden} OCULTA${hidden===1?'':'S'}`:''}`;
}

/** Two cotas are the same measure within this tolerance, and only if they also print the same text. */
export const EQUAL_DIMENSION_MM=.5;
/** Layout notices of cotas never block the sheet: they print where they least obstruct. */
export const isDimensionNotice=(warning:string)=>/^Cotas (sin lugar libre|que no entran en la vista):/.test(warning);
type Request={pieceId:string;code:string;axis:number;role:Dimension['role'];valueMm:number;edges:{a:Point;b:Point;localStart:Vec3;localEnd:Vec3}[];difficulty:number;direction:Vector3;printed:string;offset?:[number,number]};
/**
 * Same length (±0,5 mm and identical printed text), same direction in the furniture and same kind of cota (linear or
 * depth leader, whose text names the role): one cota stands for all. An omitted cota therefore never carries a
 * different number than the one drawn, and the table keeps every piece.
 */
export function sameMeasure(a:Pick<Request,'direction'|'valueMm'|'printed'>,b:Pick<Request,'direction'|'valueMm'|'printed'>){
  return Math.abs(a.direction.dot(b.direction))>.999&&Math.abs(a.valueMm-b.valueMm)<=EQUAL_DIMENSION_MM&&a.printed===b.printed;
}

/** All values come from the local box and accumulated axis scale, never from projected pixels. */
export function makeDimensions(f:Furniture,anchor:(pieceId:string,local:Vec3)=>Point,obstacles:Rect[],noteLeaders:DimensionSegment[]=[],protectedNotes:Rect[]=[],viewport={width:960,height:580},view:'front'|'back'='front'){
  const pieceRects:Rect[]=[],requests:Request[]=[];
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
        direction:new Vector3().setFromMatrixColumn(matrix,axis).normalize(),printed:difficulty<0.05?`${role} ${dimensionText(lengths[axis])}`:dimensionText(lengths[axis]),offset:manual(piece.id,role)});
    }
  }
  // Place the main lengths first; short dimensions can put their text outside the ticks.
  requests.sort((a,b)=>f.presentation?.compact?(a.code.localeCompare(b.code,undefined,{numeric:true})||a.axis-b.axis):(b.difficulty-a.difficulty||a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis));
  const dimensions:Dimension[]=[],occupied=[...obstacles],previousLines:DimensionSegment[]=[],missing:string[]=[];
  if(f.presentation?.compact){
    let compactSlot=0;
    for(const req of requests){
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
    }
    dimensions.sort((a,b)=>a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
    return {dimensions,warnings:missing.length?[`No hay espacio legible para todas las cotas: ${missing.slice(0,8).join(', ')}${missing.length>8?` y ${missing.length-8} más`:''}. Revisá el zoom o las notas; no se exportará un plano incompleto.`]:[]};
  }
  const inside=(p:Point)=>p.x>=9&&p.x<=viewport.width-9&&p.y>=9&&p.y<=viewport.height-40;
  const fits=(r:Rect)=>r.x>=9&&r.y>=9&&r.x+r.w<=viewport.width-9&&r.y+r.h<=viewport.height-40;
  /** Every geometrically possible position of one cota, with the cost that does not depend on other cotas. */
  function candidates(req:Request,expanded:boolean){
    const out:{d:Dimension;cost:number}[]=[];
    const text=dimensionText(req.valueMm),width=text.length*DIMENSION_FONT_SIZE*0.61+10;
    const base={pieceId:req.pieceId,code:req.code,axis:req.axis,role:req.role,valueMm:req.valueMm};
    for(const edge of req.edges){
      const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy);
      if(length<0.05){
        // The measured axis points into the camera. Use a named leader, never a fictitious length.
        const depthWidth=req.printed.length*DIMENSION_FONT_SIZE*.61+10;
        for(const radius of [24,40,64,96,140,190])for(let direction=0;direction<16;direction++){
          const angle=direction*Math.PI/8,center={x:edge.a.x+Math.cos(angle)*(radius+depthWidth/2),y:edge.a.y+Math.sin(angle)*radius};
          const label=labelAt(center,0,depthWidth),r=label.rect;
          const segment:DimensionSegment={a:edge.a,b:{x:Math.max(r.x,Math.min(edge.a.x,r.x+r.w)),y:Math.max(r.y,Math.min(edge.a.y,r.y+r.h))},kind:'leader'};
          out.push({d:{...base,text:req.printed,mode:'depth',localStart:edge.localStart,localEnd:edge.localEnd,segments:[segment],label},cost:radius+pieceRects.filter(other=>overlap(r,other)).length*100});
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
          for(const shift of shifts){
            const center=add(add(middle,normal,14),u,shift),label=labelAt(center,angle,width),r=label.rect;
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
            out.push({d:{...base,text,mode:'linear',localStart:edge.localStart,localEnd:edge.localEnd,segments,label},cost:offset+Math.abs(shift)*.25+crossings*12+geometryOverlap*100});
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
      if(found)break;
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
  const classes:Request[][]=[];
  for(const req of requests){const found=classes.find(group=>sameMeasure(group[0],req));if(found)found.push(req);else classes.push([req]);}
  for(const group of classes)group.sort((a,b)=>Number(!!b.offset)-Number(!!a.offset)||a.code.localeCompare(b.code,undefined,{numeric:true})||a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
  for(const group of [...classes.filter(g=>g[0].offset),...classes.filter(g=>!g[0].offset)]){
    let placed:Dimension|undefined;
    for(const req of group){placed=req.offset?placeMoved(req,req.offset):best(req);if(placed)break;}
    placed??=best(group[0],true);
    if(!placed){missing.push(`${group[0].code} (${group[0].role})`);continue;}
    const shared=[...new Set(group.map(r=>r.code).filter(code=>code!==placed!.code))];
    if(shared.length)placed.shared=shared;
    dimensions.push(placed);occupied.push(placed.label.rect);previousLines.push(...placed.segments);
  }
  // Independent check of the final sheet: only a cota without any free position remains flagged.
  const problems:string[]=[];
  for(const d of dimensions){
    const r=d.label.rect,issues:string[]=[];
    if(d.segments.some(s=>protectedNotes.some(note=>segmentHitsRect(s.a,s.b,note,0))))issues.push('cruza una nota');
    if(dimensions.some(other=>other!==d&&(other.segments.some(s=>dimensionMarkHitsRect(s,r,1))||d.segments.some(s=>dimensionMarkHitsRect(s,other.label.rect,1)))))issues.push('tapa marcas de otra');
    if(obstacles.some(other=>overlap(r,other,0))||dimensions.some(other=>other!==d&&overlap(r,other.label.rect,0)))issues.push('queda superpuesta');
    if(issues.length){d.issue=`${d.code} ${d.role}: ${issues.join(' y ')}`;problems.push(d.issue);}
  }
  const warnings=[
    ...(problems.length?[`Cotas sin lugar libre: ${problems.slice(0,6).join('; ')}${problems.length>6?` y ${problems.length-6} más`:''}. Se imprimen igual donde menos tapan; para despejarlas bajá el zoom u ocultá alguna cota.`]:[]),
    ...(missing.length?[`Cotas que no entran en la vista: ${missing.slice(0,8).join(', ')}${missing.length>8?` y ${missing.length-8} más`:''}. Sus medidas siguen en la tabla; bajá el zoom para dibujarlas.`]:[]),
  ];
  dimensions.sort((a,b)=>a.pieceId.localeCompare(b.pieceId)||a.axis-b.axis);
  return {dimensions,warnings};
}

export function moveDimension(f:Furniture,pieceId:string,role:Dimension['role'],view:'front'|'back',offset:[number,number]){
  const choice=dimensionChoices(f).find(c=>c.role===role&&c.pieceIds.includes(pieceId));
  const existing=f.presentation?.dimensionOffsets||[];
  if(!choice)return existing;
  return [...existing.filter(ref=>!(ref.role===role&&ref.view===view&&choice.pieceIds.includes(ref.pieceId))),{pieceId:choice.pieceId,role,view,offset:offset.map(n=>Math.max(-1,Math.min(1,n))) as [number,number]}];
}
