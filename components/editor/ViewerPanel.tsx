import ViewAdjustments,{shiftDimension,orbitCamera} from '../ViewAdjustments';
import Diagram from '../Diagram';
import DimensionControls from '../DimensionControls';
import GuideViews,{ensureGuide} from '../../sketchup_offline/ui/GuideViews';
import ArrowIcon from './ArrowIcon';
import { setDimensionVisible } from '@/lib/dimensions';
import { sheetView, type View } from '@/lib/scene';
import type { Furniture, Vec3 } from '@/lib/model';

export type Tool='select'|'orbit'|'dimensions';

type Props={
  furniture:Furniture; preview:Furniture; view:View; tool:Tool; pieceId:string; draftHidden:string[]|null; busy:boolean; reanchor:boolean;
  onView:(v:View)=>void; onTool:(t:Tool)=>void; onEdit:(fn:(f:Furniture)=>void)=>void; onPick:(id:string,anchor:Vec3)=>void; onSelect:(id:string)=>void;
  onNote:(id:string)=>void; onCancelReanchor:()=>void; onDraft:(ids:string[])=>void; onCancelDraft:()=>void;
};

export default function ViewerPanel({furniture:f,preview,view,tool,pieceId,draftHidden,busy,reanchor,onView,onTool,onEdit,onPick,onSelect,onNote,onCancelReanchor,onDraft,onCancelDraft}:Props){
  const drafting=draftHidden!==null,locked=busy||drafting;
  return <section className="viewer-panel"><div className="panel-heading"><div><p className="eyebrow">VISTA DE ARMADO</p><h2>{f.name}</h2></div><span className="view-tag"><ArrowIcon/> Axonometría ortográfica</span></div>
    <div className="view-tools">
      <div className="view-switch" role="group" aria-label="Vista del mueble">{(['front','back'] as const).map(v=><button className="text-button" key={v} aria-label={v==='front'?'Ver exterior':'Ver interior'} aria-pressed={view===v} onClick={()=>onView(v)}>{v==='front'?'Exterior':'Interior'}</button>)}</div>
      <label>Zoom <input aria-label="Zoom" disabled={locked} type="range" min="0.35" max="1.4" step="0.05" value={f.zoom} onChange={e=>onEdit(f=>{f.zoom=Number(e.target.value);})}/></label>
      <button className="text-button" disabled={locked} onClick={()=>onEdit(f=>{f.zoom=1;f.presentation={...f.presentation,cameras:undefined};})}>Restablecer vista</button>
    </div>
    {reanchor&&<div className="anchor-hint" role="status">Hacé clic sobre la pieza para ubicar la punta de la flecha (Esc para cancelar). <button className="text-button" onClick={onCancelReanchor}>Cancelar</button></div>}
    <ViewAdjustments furniture={f} view={view} mode={tool} onMode={onTool} disabled={locked} onChange={presentation=>onEdit(f=>{f.presentation=presentation;})}/>
    <DimensionControls furniture={f} disabled={locked} onChange={refs=>onEdit(f=>{f.hiddenDimensions=refs;})}/>
    <Diagram furniture={preview} layout={tool==='dimensions'?'sheet':'editor'} view={view} selected={pieceId} onPick={onPick} onNote={onNote}
      onOrbit={tool==='orbit'&&!drafting?delta=>onEdit(f=>{f.presentation=orbitCamera(f,view,delta);}):undefined}
      onMoveDimension={tool==='dimensions'&&!drafting?(id,role,delta)=>onEdit(f=>{f.presentation=shiftDimension(f,view,id,role,delta,[sheetView(f).width,sheetView(f).height]);}):undefined}
      onHideDimension={tool==='select'&&!drafting?(id,role)=>onEdit(f=>{f.hiddenDimensions=setDimensionVisible(f,id,role,false);}):undefined}
      onMove={drafting?undefined:(id,position)=>onEdit(f=>{f.notes.find(n=>n.id===id)!.position=position;})}/>
    <GuideViews furniture={f} view={view} selectedId={pieceId} draftHidden={draftHidden} disabled={busy} onChange={next=>onEdit(f=>{Object.assign(f,next);})} onSelect={onSelect} onView={onView} onDraft={onDraft}
      onApply={()=>{if(draftHidden!==null)onEdit(f=>{f.presentation={...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}};});onCancelDraft();}} onCancel={onCancelDraft}/>
    <div className="viewer-footer"><span>● Una o dos vistas ensambladas · Cámara configurable</span><span>mm · Medidas originales protegidas</span></div>
  </section>;
}
