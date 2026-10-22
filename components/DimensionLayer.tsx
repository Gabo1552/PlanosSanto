import type {PointerEvent} from 'react';
import { DIMENSION_FONT_SIZE, type Dimension } from '../lib/dimensions';

/** All strokes first, then opaque text masks, as in a technical dimension drawing. */
export default function DimensionLayer({dimensions,onHide,onMove,phase='all'}:{dimensions:Dimension[];phase?:'all'|'lines'|'labels';onHide?:(pieceId:string,role:Dimension['role'])=>void;onMove?:(pieceId:string,role:Dimension['role'],delta:[number,number])=>void}){
  function point(e:PointerEvent<SVGElement>){const svg=e.currentTarget.ownerSVGElement!,p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM()!.inverse());}
  return <g className="dimension-layer" data-dimension-phase={phase} pointerEvents="none">
    {phase!=='labels'&&dimensions.flatMap(d=>d.segments.map((s,i)=><line key={`${d.pieceId}-${d.axis}-${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={s.kind==='extension'?'#8b94a0':'#4b5563'} strokeWidth={s.kind==='extension'?0.7:1} />))}
    {phase!=='lines'&&dimensions.map(d=><g key={`${d.pieceId}-${d.axis}`} data-dimension={`${d.pieceId}-${d.axis}`} data-piece={d.pieceId} data-role={d.role} data-mm={d.valueMm} data-shared={d.shared?.join(' ')} data-issue={d.issue} aria-label={`${onMove?'Mover cota ':onHide?'Ocultar cota ':''}${d.code}${onMove||onHide?' ':' · '}${d.role}: ${d.text}${d.shared?.length?` (también ${d.shared.join(', ')})`:''}`} role={onHide||onMove?'button':undefined} tabIndex={onHide||onMove?0:undefined} pointerEvents={onHide||onMove?'all':'none'} style={{cursor:onMove?'move':onHide?'pointer':undefined,touchAction:'none'}} onPointerDown={e=>{e.stopPropagation();if(onMove){e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);e.currentTarget.dataset.drag=JSON.stringify([p.x,p.y]);}else onHide?.(d.pieceId,d.role);}}
      onPointerMove={e=>{const raw=e.currentTarget.dataset.drag;if(!raw||!onMove)return;const [x,y]=JSON.parse(raw),p=point(e);e.currentTarget.dataset.drag=JSON.stringify([p.x,p.y]);onMove(d.pieceId,d.role,[p.x-x,p.y-y]);}}
      onPointerUp={e=>{delete e.currentTarget.dataset.drag;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={e=>{delete e.currentTarget.dataset.drag;}} onKeyDown={e=>{const deltas:Record<string,[number,number]>={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]};if(onMove&&deltas[e.key]){e.preventDefault();e.stopPropagation();onMove(d.pieceId,d.role,deltas[e.key]);}else if(onHide&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();onHide(d.pieceId,d.role);}}} transform={`translate(${d.label.center.x} ${d.label.center.y}) rotate(${d.label.angle})`}>
      {onHide&&<title>Ocultar esta cota. Podés recuperarla en Mostrar u ocultar cotas.</title>}
      {d.issue&&!onHide&&<title>{`Sin lugar libre: ${d.issue}`}</title>}
      <rect x={-d.label.width/2} y={-d.label.height/2} width={d.label.width} height={d.label.height} fill="white"/>
      <text x="0" y="4.5" textAnchor="middle" fontFamily="monospace" fontSize={DIMENSION_FONT_SIZE} fill="#363e4d">{d.text}</text>
    </g>)}
  </g>;
}
