import type {Furniture} from '../lib/model';
import {type CameraAngles} from '../lib/presentation';
import {viewCamera,withViewCamera} from '../lib/scene';
import {moveDimension,dimensionChoices,type Dimension} from '../lib/dimensions';
export function shiftDimension(f:Furniture,view:'front'|'back',pieceId:string,role:Dimension['role'],delta:[number,number],size:[number,number]=[960,580]){
  const choice=dimensionChoices(f).find(c=>c.role===role&&c.pieceIds.includes(pieceId));
  const previous=f.presentation?.dimensionOffsets?.find(r=>r.view===view&&r.role===role&&choice?.pieceIds.includes(r.pieceId))?.offset||[0,0];
  return {...f.presentation,dimensionOffsets:moveDimension(f,pieceId,role,view,[previous[0]+delta[0]/size[0],previous[1]+delta[1]/size[1]])};
}
export function orbitCamera(f:Furniture,view:'front'|'back',delta:[number,number]){
  const key=f.presentation?.guide?.sharedCamera?'front':view,camera=viewCamera(f,key);
  return withViewCamera(f,key,{yaw:((camera.yaw+delta[0]*.4+540)%360)-180,pitch:Math.max(10,Math.min(80,camera.pitch-delta[1]*.3))});
}
export default function ViewAdjustments({furniture:f,view,disabled,mode,onMode,onChange,showTools=true}:{furniture:Furniture;view:'front'|'back';disabled?:boolean;mode:'select'|'orbit'|'dimensions';onMode:(mode:'select'|'orbit'|'dimensions')=>void;onChange:(p:NonNullable<Furniture['presentation']>)=>void;showTools?:boolean}){
  const guide=f.presentation?.guide,shared=!!guide?.sharedCamera,key=shared?'front':view;
  // A shared guide shows the exterior angles; the interior follows from the opposite side.
  const angles=viewCamera(f,key);
  function camera(change:Partial<CameraAngles>){onChange(withViewCamera(f,key,{...angles,...change}));}
  return <details className="view-adjustments"><summary>Rotar vista, mover cotas y mostrar IDs</summary><div className="adjustment-controls">
    {showTools&&<div role="group" aria-label="Herramienta del plano">{([['select','Seleccionar piezas'],['orbit','Rotar con el mouse'],['dimensions','Mover cotas']] as const).map(([value,label])=><button key={value} disabled={disabled} aria-pressed={mode===value} onClick={()=>onMode(value)}>{label}</button>)}</div>}
    <p>{guide?(shared?'El exterior mira el frente marcado en Muebles y el interior, el lado opuesto; girar una vista gira las dos.':'La orientación exterior e interior se guarda por separado.'):'La rotación se guarda por separado para cada vista.'} Con «Mover cotas» ves el encuadre de impresión {guide?'A4':'de la guía'}: arrastrá la medida o usá las flechas del teclado.</p>
    <label>Giro horizontal<input aria-label="Giro horizontal" disabled={disabled} type="range" min="-180" max="180" step="1" value={angles.yaw} onChange={e=>camera({yaw:Number(e.target.value)})}/><output>{Math.round(angles.yaw)}°</output></label>
    <label>Inclinación<input aria-label="Inclinación" disabled={disabled} type="range" min="10" max="80" step="1" value={angles.pitch} onChange={e=>camera({pitch:Number(e.target.value)})}/><output>{Math.round(angles.pitch)}°</output></label>
    <label><input type="checkbox" aria-label="Mostrar IDs en el dibujo" disabled={disabled} checked={!f.presentation?.hideIds} onChange={e=>onChange({...f.presentation,hideIds:!e.target.checked})}/> Mostrar IDs en el dibujo</label>
    {!guide&&<label><input type="checkbox" aria-label="Plano compacto por tipos" disabled={disabled} checked={f.presentation?.compact||false} onChange={e=>onChange({...f.presentation,compact:e.target.checked})}/> Plano compacto por tipos: IDs por tipo y cantidad en la trasera; cotas por referencia bajo la delantera. Usar con componentes iguales agrupados.</label>}
    <button disabled={disabled} onClick={()=>onChange({...f.presentation,cameras:{...f.presentation?.cameras,[key]:undefined,...(shared?{back:undefined}:{})}})}>Restablecer rotación de esta vista</button>
    <button disabled={disabled} onClick={()=>onChange({...f.presentation,dimensionOffsets:(f.presentation?.dimensionOffsets||[]).filter(r=>r.view!==view)})}>Restablecer cotas de esta vista</button>
  </div></details>;
}
