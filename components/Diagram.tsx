'use client';
import { useMemo, type PointerEvent } from 'react';
import { Ray, Vector3 } from 'three';
import { makeScene, pickAnchor, type Point, type View } from '@/lib/scene';
import { bounds, type Furniture, type Piece, type Vec3 } from '@/lib/model';
import { sheetCaption } from '@/lib/sheet';
import DimensionLayer from './DimensionLayer';
import {dimensionCaption,type Dimension} from '@/lib/dimensions';
import {groupedPieces} from '@/lib/pieceGroups';
import {diagramViewport} from '@/lib/diagramViewport';

/** Surface point under the pointer in the scene actually drawn: a supplied A4 scene has its own box and defaults. */
function anchorIn(scene:ReturnType<typeof makeScene>,p:Piece,screen:Point):Vec3{
  const {right,forward,up}=scene.camera;
  const origin=right.clone().multiplyScalar((screen.x-scene.origin.x)/scene.scale+scene.cx).add(up.clone().multiplyScalar((scene.origin.y-screen.y)/scene.scale+scene.cy)).add(forward.clone().multiplyScalar(1e7));
  const ray=new Ray(origin,forward.clone().negate()).applyMatrix4(scene.transforms.get(p.id)!.clone().invert());
  let nearest:Vector3|undefined;
  for(const tri of p.mesh.triangles){
    const hit=ray.intersectTriangle(...tri.map(i=>new Vector3(...p.mesh.vertices[i])) as [Vector3,Vector3,Vector3],false,new Vector3());
    if(hit&&(!nearest||hit.distanceTo(ray.origin)<nearest.distanceTo(ray.origin)))nearest=hit.clone();
  }
  return (nearest||bounds(p.mesh).getCenter(new Vector3())).toArray();
}
/** `pickFaces` false leaves face clicks to a parent (the Muebles viewer tells a click from a drag); ID labels still pick. `caption` false drops the footer line. */
type Props={ fit?:boolean; highlight?:boolean; pickFaces?:boolean; caption?:boolean; furniture:Furniture; view?:View; layout?:'editor'|'sheet'; selected?:string; print?:boolean; paper?:boolean; scene?:ReturnType<typeof makeScene>; onOrbit?:(delta:[number,number])=>void; onMoveDimension?:(pieceId:string,role:Dimension['role'],delta:[number,number])=>void; onHideDimension?:(pieceId:string,role:Dimension['role'])=>void; onPick?:(pieceId:string,anchor:Vec3)=>void; onMove?:(noteId:string,position:[number,number])=>void; onNote?:(id:string)=>void };
export default function Diagram({furniture:f,view='front',layout='editor',selected,print=false,paper=false,scene:suppliedScene,onPick,onMove,onNote,onHideDimension,onMoveDimension,onOrbit,fit=false,highlight=false,pickFaces=true,caption=true}:Props) {
  const scene=useMemo(()=>suppliedScene||makeScene(f,{view,layout}),[f,suppliedScene,view,layout]);
  const groups=useMemo(()=>groupedPieces(f),[f]);
  const selectedIds=useMemo(()=>new Set(f.presentation?.guide?(selected?[selected]:[]):groups.find(group=>group.some(p=>p.id===selected))?.map(p=>p.id)||[]),[groups,selected,f.presentation?.guide]);
  const focused=!print&&highlight&&!!selected;
  const visibleScene=useMemo(()=>focused?{...scene,labels:scene.labels.filter(label=>selectedIds.has(label.pieceId)),dimensions:scene.dimensions.filter(dimension=>selectedIds.has(dimension.pieceId))}:scene,[scene,focused,selectedIds]);
  const codes=new Map(groups.flatMap(group=>group.map(p=>[p.id,group[0].code] as const)));
  const labelNames=new Map(groups.flatMap(group=>group.map((p,i)=>[p.id,`Seleccionar ${group[0].code}${group.length>1?`, pieza ${i+1} de ${group.length}`:''}`] as const)));
  const fitted=fit&&!print&&layout==='editor';
  const viewport=useMemo(()=>{
    if(!fitted)return `0 0 ${scene.width} ${scene.height}`;
    const base=f.zoom===1?scene:makeScene({...f,zoom:1},{view,layout});
    return diagramViewport(focused?{...base,labels:base.labels.filter(label=>selectedIds.has(label.pieceId)),dimensions:base.dimensions.filter(dimension=>selectedIds.has(dimension.pieceId))}:base);
  },[fitted,f,scene,view,layout,focused,selectedIds]);
  function point(e:PointerEvent<SVGElement>) {
    const svg=e.currentTarget.ownerSVGElement!;
    const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function pick(e:PointerEvent<SVGElement>,id:string) {
    if(onOrbit||!onPick||!pickFaces) return;
    const p=f.pieces.find(p=>p.id===id)!;
    onPick(id,suppliedScene?anchorIn(suppliedScene,p,point(e)):pickAnchor(f,p,point(e),{view,layout}));
  }
  return <svg className="diagram" viewBox={viewport} aria-label={`Axonometría ortográfica de ${f.name}`} data-view={view} data-layout={layout} role={print||!(onPick||onOrbit||onMove||onMoveDimension||onHideDimension)?'img':'group'} style={{touchAction:onOrbit?'none':undefined,cursor:onOrbit?'grab':undefined}}
    onPointerDown={e=>{if(!onOrbit)return;e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.orbit=JSON.stringify([e.clientX,e.clientY]);}}
    onPointerMove={e=>{const raw=e.currentTarget.dataset.orbit;if(!onOrbit||!raw)return;const [x,y]=JSON.parse(raw);e.currentTarget.dataset.orbit=JSON.stringify([e.clientX,e.clientY]);onOrbit([e.clientX-x,e.clientY-y]);}}
    onPointerUp={e=>{delete e.currentTarget.dataset.orbit;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={e=>{delete e.currentTarget.dataset.orbit;}}>
    <defs><marker id={`arrow-${f.id}-${view}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1f4d78"/></marker></defs>
    <rect x={fitted?-10000:0} y={fitted?-10000:0} width={fitted?20000:scene.width} height={fitted?20000:scene.height} fill={print||paper?'#ffffff':'#f8f8f4'}/>
    {!print&&!paper && <g stroke="#e8e9e2" strokeWidth="1">{Array.from({length:24},(_,i)=><path key={i} d={`M ${i*40} 0 V ${scene.height} M 0 ${i*40} H ${scene.width}`}/>)}</g>}
    {scene.faces.map(face=><g key={face.key} opacity={!print&&highlight&&selected&&!selectedIds.has(face.pieceId)?0.22:1}><polygon data-piece={face.pieceId} points={face.points} fill={selectedIds.has(face.pieceId) && !print?'#c7daee':face.fill} stroke={selectedIds.has(face.pieceId) && !print?'#c7daee':face.fill} strokeWidth="0.4" onPointerDown={e=>pick(e,face.pieceId)} style={{cursor:onPick&&pickFaces?'pointer':undefined}}/><path d={face.outline.join(' ')} stroke={!print&&selectedIds.has(face.pieceId)?'#1f609d':'#756e5c'} strokeWidth={!print&&selectedIds.has(face.pieceId)?'1.8':'0.8'} fill="none" pointerEvents="none"/></g>)}
    <DimensionLayer dimensions={visibleScene.dimensions} phase="lines"/>
    {scene.notes.filter(n=>n.marker).map(note=><g key={note.id} data-note-marker={note.number}>
      <path d={`M${note.rect.x+12},${note.rect.y+12} L${note.target.x},${note.target.y}`} fill="none" stroke="#1f4d78" strokeWidth="1.8" markerEnd={`url(#arrow-${f.id}-${view})`}/>
      <circle cx={note.rect.x+12} cy={note.rect.y+12} r="12" fill="white" stroke="#1f4d78" strokeWidth="1.5"/>
      <text x={note.rect.x+12} y={note.rect.y+16.5} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fill="#17375e">{note.number}</text>
    </g>)}
    {scene.notes.filter(n=>!n.marker).map(note=><g key={note.id} data-note={note.id}>
      <path d={`M${note.rect.x},${note.rect.y+20} L${note.target.x},${note.target.y}`} fill="none" stroke="#1f4d78" strokeWidth="1.8" markerEnd={`url(#arrow-${f.id}-${view})`}/>
      <circle cx={note.target.x} cy={note.target.y} r="3" fill="#1f4d78"/>
      <g className={onMove?'draggable-note':undefined} data-testid="note-box" role={onMove?'button':undefined} aria-label={onMove?`${codes.get(note.pieceId)} · NOTA DE ARMADO ${note.lines.join(' ')}. Mover con las flechas`:undefined} tabIndex={onMove?0:undefined} style={onMove?{userSelect:'none',WebkitUserSelect:'none',touchAction:'none'}:undefined}
        onKeyDown={e=>{const d:Record<string,[number,number]>={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]};if(d[e.key]){e.preventDefault();onMove?.(note.id,[Math.max(16,Math.min(734,note.position[0]+d[e.key][0])),Math.max(22,Math.min(528,note.position[1]+d[e.key][1]))]);}if(e.key==='Enter')onNote?.(note.id);}}
        onPointerDown={e=>{
          if(!onMove)return;
          // SVG text must not start the browser's native text-selection drag.
          e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});onNote?.(note.id);
          e.currentTarget.setPointerCapture(e.pointerId);
          const start=point(e),initial=note.position;
          e.currentTarget.dataset.drag=JSON.stringify([start.x,start.y,...initial]);
        }} onPointerMove={e=>{
          const raw=e.currentTarget.dataset.drag;if(!raw || !onMove)return;
          const [sx,sy,x,y]=JSON.parse(raw) as number[];const p=point(e);
          onMove(note.id,[Math.max(16,Math.min(734,x+p.x-sx)),Math.max(22,Math.min(528,y+p.y-sy))]);
        }} onPointerUp={e=>{delete e.currentTarget.dataset.drag;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={e=>{delete e.currentTarget.dataset.drag;}}>
        <rect {...note.rect} width={note.rect.w} height={note.rect.h} rx="4" fill="#f3f7fc" stroke="#9cb2cc"/>
        <text x={note.rect.x+12} y={note.rect.y+20} fontFamily="Arial, sans-serif" fontSize="12" fontWeight="700" fill="#17375e">{codes.get(note.pieceId)} · NOTA DE ARMADO{' '}</text>
        <text x={note.rect.x+12} y={note.rect.y+40} fontFamily="monospace" fontSize="12.5" fill="#202d2a">{note.lines.map((line,i)=><tspan key={i} x={note.rect.x+12} dy={i?17:0}>{line}{i<note.lines.length-1?' ':''}</tspan>)}</text>
      </g>
    </g>)}
    {visibleScene.labels.map(label=><g key={label.pieceId} className="piece-label" data-label={label.code} aria-pressed={onPick?selectedIds.has(label.pieceId):undefined} role={onPick?'button':undefined} aria-label={onPick?labelNames.get(label.pieceId):undefined} tabIndex={onPick?0:undefined} onPointerDown={e=>{if(!onPick)return;e.stopPropagation();const p=f.pieces.find(p=>p.id===label.pieceId)!;onPick?.(p.id,p.mesh.vertices[0]);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const p=f.pieces.find(p=>p.id===label.pieceId)!;onPick?.(p.id,p.mesh.vertices[0]);}}}>
      <path d={`M${label.anchor.x},${label.anchor.y} L${label.x+label.w/2},${label.y+12}`} stroke="#1f4d78" strokeWidth="1" pointerEvents="none"/>
      <circle cx={label.anchor.x} cy={label.anchor.y} r="2" fill="#1f4d78" pointerEvents="none"/>
      <rect x={label.x} y={label.y} width={label.w} height={24} rx="4" fill={!print&&selectedIds.has(label.pieceId)?'#080c2e':'#ffffff'} stroke="#080c2e" strokeWidth="1.2"/>
      <text x={label.x+label.w/2} y={label.y+16.5} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="13" fill={!print&&selectedIds.has(label.pieceId)?'white':'#080c2e'}>{label.code}{label.quantity&&label.quantity>1?` ×${label.quantity}`:''}</text>
    </g>)}
    {/* Text and its opaque backing stay above every note/ID leader. */}
    <DimensionLayer dimensions={visibleScene.dimensions} phase="labels" onHide={print?undefined:onHideDimension} onMove={print?undefined:onMoveDimension}/>
    {!fitted&&caption&&<text x="12" y={scene.height-16} fontFamily="Arial, sans-serif" fontSize="11" fill="#68746a">{f.presentation?.guide&&layout==='sheet'?sheetCaption(f,view):f.presentation?.guide?`${view==='front'?'EXTERIOR':'INTERIOR'} · ${dimensionCaption(f)}`:scene.sheet&&view==='back'?(f.presentation?.hideIds?'TRASERA · SIN COTAS':'TRASERA · MISMOS CÓDIGOS · SIN COTAS'):dimensionCaption(f)}</text>}
  </svg>;
}
