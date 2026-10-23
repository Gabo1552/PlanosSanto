import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {Vector3} from 'three';
import Diagram from '../../components/Diagram';
import type {Furniture} from '../../lib/model';
import type {CameraAngles} from '../../lib/presentation';
import {frontCamera,makeScene} from '../../lib/scene';
import './pieceViewer.css';

const LABEL_LIMIT=80,ZOOM=[.4,6] as const;
type Mode='orbit'|'move'|'pan';
type Drag={pointerId:number;x:number;y:number;startX:number;startY:number;pieceId?:string;mode:Mode;moved:boolean};
const wrapYaw=(yaw:number)=>((yaw+540)%360)-180;
const clampPitch=(pitch:number)=>Math.max(-30,Math.min(89,pitch));
const clampZoom=(zoom:number)=>Math.max(ZOOM[0],Math.min(ZOOM[1],zoom));
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;

/**
 * Viewer of Muebles: orbit, zoom, separate and move pieces to look inside. Everything lives in this component's
 * state (camera, zoom, pieces moved by hand): nothing reaches the guide or the SketchUp model. The drawing is the
 * shared scene (lib/scene, same painter's order as the A4), fitted to the bounding sphere so it keeps its size while
 * it turns. While dragging, the ID labels are left out and the scene is rebuilt at most once per frame.
 */
export default function PieceViewer({furniture:f,selected,highlight=false,disabled=false,onSelect}:{furniture:Furniture;selected?:string;highlight?:boolean;disabled?:boolean;onSelect:(id:string)=>void}){
  const home=useMemo(()=>frontCamera(f),[f]);
  // undefined: the camera follows the front (marked or proposed) until the operator turns it.
  const [camera,setCamera]=useState<CameraAngles>(),[zoom,setZoom]=useState(1),[pan,setPan]=useState<[number,number]>([0,0]);
  const [offsets,setOffsets]=useState<ReadonlyMap<string,Vector3>>(()=>new Map()),[exploded,setExploded]=useState(false);
  const [tool,setTool]=useState<'orbit'|'move'>('orbit'),[dragging,setDragging]=useState(false);
  // The drawing is laid out in the stage's own CSS pixels: IDs keep their real size in a narrow column.
  const [size,setSize]=useState({w:960,h:600});
  const angles=camera||home;
  const shown=useMemo(()=>({...f,presentation:{...f.presentation,hideIds:false}}),[f]);
  // Large models only label the selected piece: 300 IDs do not fit legibly on screen.
  const labels=useMemo(()=>dragging?false:f.pieces.length<=LABEL_LIMIT?true:new Set(selected?[selected]:[]),[dragging,f.pieces.length,selected]);
  const scene=useMemo(()=>makeScene(shown,{camera:angles,zoom,pan,offsets,explosion:exploded?1:0,frame:'sphere',width:size.w,height:size.h,labels,notes:false,dimensions:false}),[shown,angles,zoom,pan,offsets,exploded,labels,size]);
  const stage=useRef<HTMLDivElement>(null),drag=useRef<Drag|undefined>(undefined),pending=useRef({dx:0,dy:0}),frame=useRef(0);
  const latest=useRef({scene,home,zoom,pan,size});latest.current={scene,home,zoom,pan,size};
  useEffect(()=>{
    const node=stage.current;if(!node||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(([entry])=>{const w=Math.round(entry.contentRect.width),h=Math.round(entry.contentRect.height);if(w>50&&h>50)setSize(previous=>previous.w===w&&previous.h===h?previous:{w,h});});
    observer.observe(node);return()=>observer.disconnect();
  },[]);
  /** Drawing units per CSS pixel (viewBox fitted with «meet»). */
  const units=useCallback(()=>{const svg=stage.current?.querySelector('svg'),r=svg?.getBoundingClientRect();const {w,h}=latest.current.size;return r&&r.width&&r.height?1/Math.min(r.width/w,r.height/h):1;},[]);
  const moveBy=useCallback((id:string,dx:number,dy:number)=>{
    const {scene}=latest.current,delta=scene.camera.right.clone().multiplyScalar(dx/scene.scale).addScaledVector(scene.camera.up,-dy/scene.scale);
    setOffsets(previous=>{const next=new Map(previous);next.set(id,(next.get(id)||new Vector3()).clone().add(delta));return next;});
  },[]);
  const flush=useCallback(()=>{
    frame.current=0;const d=drag.current,{dx,dy}=pending.current;pending.current={dx:0,dy:0};
    if(!d||(!dx&&!dy))return;
    const u=units();
    if(d.mode==='pan')setPan(([x,y])=>[x+dx*u,y+dy*u]);
    else if(d.mode==='move'&&d.pieceId)moveBy(d.pieceId,dx*u,dy*u);
    else setCamera(c=>{const from=c||latest.current.home;return {yaw:wrapYaw(from.yaw+dx*.4),pitch:clampPitch(from.pitch-dy*.3)};});
  },[units,moveBy]);
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  // Wheel zoom about the pointer; a native listener, since React's wheel listener cannot prevent scrolling.
  useEffect(()=>{
    const node=stage.current;if(!node)return;
    const wheel=(event:WheelEvent)=>{
      if(disabled)return;event.preventDefault();
      const svg=node.querySelector('svg'),r=svg?.getBoundingClientRect();if(!r)return;
      const {w,h}=latest.current.size,u=1/Math.min(r.width/w,r.height/h),px=(event.clientX-r.left-(r.width-w/u)/2)*u,py=(event.clientY-r.top-(r.height-h/u)/2)*u;
      const {zoom:previous,pan:[x,y]}=latest.current,next=clampZoom(previous*Math.exp(-event.deltaY*.0015)),k=next/previous,ox=w/2+x,oy=h/2+y;
      const panned:[number,number]=[x+(px-ox)*(1-k),y+(py-oy)*(1-k)];
      latest.current={...latest.current,zoom:next,pan:panned};setZoom(next);setPan(panned);
    };
    node.addEventListener('wheel',wheel,{passive:false});
    return()=>node.removeEventListener('wheel',wheel);
  },[disabled]);
  function down(event:PointerEvent<HTMLDivElement>){
    if(disabled||event.button>1)return;
    const pieceId=(event.target as Element).closest?.('polygon[data-piece]')?.getAttribute('data-piece')||undefined;
    const mode:Mode=event.button===1||event.shiftKey?'pan':tool==='move'&&pieceId?'move':'orbit';
    drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,pieceId,mode,moved:false};
    try{event.currentTarget.setPointerCapture?.(event.pointerId);}catch{/* a synthetic pointer cannot be captured */}
    event.currentTarget.focus({preventScroll:true});
  }
  function move(event:PointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;
    if(!d.moved&&Math.hypot(event.clientX-d.startX,event.clientY-d.startY)<4)return;
    if(!d.moved){d.moved=true;setDragging(true);}
    pending.current.dx+=event.clientX-d.x;pending.current.dy+=event.clientY-d.y;d.x=event.clientX;d.y=event.clientY;
    if(!frame.current)frame.current=requestAnimationFrame(flush);
  }
  function up(event:PointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;
    cancelAnimationFrame(frame.current);flush();drag.current=undefined;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(d.moved)setDragging(false);else if(d.pieceId&&event.type==='pointerup')onSelect(d.pieceId);
  }
  function turn(change:Partial<CameraAngles>){setCamera({...angles,...change});}
  function zoomBy(factor:number){setZoom(z=>clampZoom(z*factor));}
  function reset(){setCamera(undefined);setZoom(1);setPan([0,0]);setOffsets(new Map());setExploded(false);}
  function keys(event:KeyboardEvent<HTMLDivElement>){
    if(disabled)return;
    const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},arrow=arrows[event.key];
    if(arrow){
      event.preventDefault();
      if(tool==='move'&&selected)moveBy(selected,arrow[0]*20*latest.current.scene.scale,arrow[1]*20*latest.current.scene.scale);
      else turn({yaw:wrapYaw(angles.yaw+arrow[0]*15),pitch:clampPitch(angles.pitch-arrow[1]*10)});
    }else if(event.key==='+'||event.key==='='){event.preventDefault();zoomBy(1.25);}
    else if(event.key==='-'){event.preventDefault();zoomBy(1/1.25);}
  }
  const moved=[...offsets.values()].filter(v=>v.lengthSq()>1e-6).length,changed=!!camera||zoom!==1||pan[0]!==0||pan[1]!==0||moved>0||exploded;
  const back={yaw:wrapYaw(home.yaw+180),pitch:home.pitch};
  return <div className="piece-viewer" data-testid="piece-viewer">
    <div className="piece-viewer-tools" role="toolbar" aria-label="Visor 3D del mueble">
      <div className="piece-viewer-mode" role="group" aria-label="Arrastrar para">
        <button type="button" aria-pressed={tool==='orbit'} disabled={disabled} onClick={()=>setTool('orbit')}>Girar el mueble</button>
        <button type="button" aria-pressed={tool==='move'} disabled={disabled} onClick={()=>setTool('move')}>Mover piezas</button>
      </div>
      <button type="button" disabled={disabled} onClick={()=>turn({yaw:wrapYaw(angles.yaw-90)})} aria-label="Girar 90° a la izquierda">Girar −90°</button>
      <button type="button" disabled={disabled} onClick={()=>turn({yaw:wrapYaw(angles.yaw+90)})} aria-label="Girar 90° a la derecha">Girar +90°</button>
      <button type="button" disabled={disabled} onClick={()=>setCamera(undefined)}>Frente</button>
      <button type="button" disabled={disabled} onClick={()=>setCamera(back)}>Atrás</button>
      <button type="button" disabled={disabled} onClick={()=>turn({pitch:89})}>Arriba</button>
      <button type="button" disabled={disabled||zoom>=ZOOM[1]} onClick={()=>zoomBy(1.25)} aria-label="Acercar">+</button>
      <button type="button" disabled={disabled||zoom<=ZOOM[0]} onClick={()=>zoomBy(1/1.25)} aria-label="Alejar">−</button>
      <button type="button" aria-pressed={exploded} disabled={disabled} onClick={()=>setExploded(value=>!value)}>Separar piezas</button>
      <button type="button" disabled={disabled||!changed} onClick={reset}>Restablecer</button>
    </div>
    <div ref={stage} className={`piece-viewer-stage${dragging?' is-dragging':''}${tool==='move'?' is-moving':''}`} tabIndex={0} role="application" aria-roledescription="visor 3D"
      aria-label={`Visor 3D de ${f.name}. Flechas: ${tool==='move'?'mover la pieza elegida':'girar'}; más y menos: acercar o alejar.`} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + -"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys} data-yaw={Math.round(angles.yaw)} data-pitch={Math.round(angles.pitch)} data-zoom={zoom.toFixed(2)}>
      <Diagram paper highlight={highlight} scene={scene} furniture={shown} selected={selected} pickFaces={false} caption={false} onPick={disabled?undefined:id=>onSelect(id)}/>
    </div>
    <p className="piece-viewer-status" role="status">{moved?`${plural(moved,'pieza movida','piezas movidas')} solo en esta vista. `:''}{exploded?'Piezas separadas. ':''}{moved||exploded?'El modelo de SketchUp no cambia.':''}</p>
  </div>;
}
