import type {Furniture} from '../../lib/model';
import type {View} from '../../lib/scene';
import HelpPopover from './HelpPopover';
import './guideViews.css';

export function ensureGuide(f:Furniture):Furniture {
  if(f.presentation?.guide)return f;
  return {...f,presentation:{...f.presentation,guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}}};
}
export default function GuideViews({furniture:f,view,selectedId,draftHidden,disabled,onChange,onSelect,onView,onDraft,onApply,onCancel,onHideMode,hideMode=false}:{
  furniture:Furniture;view:View;selectedId?:string;draftHidden:string[]|null;disabled:boolean;
  onChange:(f:Furniture)=>void;onSelect:(id:string)=>void;onView:(view:View)=>void;
  onDraft:(ids:string[])=>void;onApply:()=>void;onCancel:()=>void;onHideMode?:()=>void;hideMode?:boolean;
}){
  const guide=ensureGuide(f).presentation!.guide!,hidden=draftHidden??guide.hiddenPieceIds,editing=draftHidden!==null;
  function update(change:Partial<typeof guide>){onChange({...f,presentation:{...f.presentation,guide:{...guide,...change}}});}
  function toggle(id:string){onView('back');onDraft(hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id]);}
  function mode(next:typeof guide.mode){update({mode:next});onView(next==='interior'?'back':'front');}
  return <section data-testid="a4-view-editor" className="guide-views" aria-label="Configuración de vistas A4">
    <div className="section-heading"><h2>Vistas de la guía A4</h2><HelpPopover title="Exterior e interior"><p>Exterior muestra el mueble armado. Interior permite quitar piezas solo de esta representación para ver las uniones. No cambia la visibilidad ni la geometría de SketchUp.</p><p>El listado y las cantidades siempre conservan todas las piezas. Dos instancias iguales se pueden ocultar por separado.</p></HelpPopover></div>
    <div className="guide-view-count" role="group" aria-label="Cantidad de vistas"><button disabled={disabled||editing} aria-pressed={guide.mode!=='both'} onClick={()=>mode(view==='back'?'interior':'exterior')}>1 vista</button><button disabled={disabled||editing} aria-pressed={guide.mode==='both'} onClick={()=>mode('both')}>2 vistas</button></div>
    {guide.mode!=='both'&&<div className="guide-single-view" role="group" aria-label="Vista única"><button disabled={disabled||editing} aria-pressed={guide.mode==='exterior'} onClick={()=>mode('exterior')}>Exterior</button><button disabled={disabled||editing} aria-pressed={guide.mode==='interior'} onClick={()=>mode('interior')}>Interior</button></div>}
    <div className="guide-hide-shortcut"><button disabled={disabled||editing} onClick={()=>{const key=guide.sharedCamera||view==='front'?'front':'back';onChange({...f,zoom:1,presentation:{...f.presentation,cameras:{...f.presentation?.cameras,[key]:undefined,...(guide.sharedCamera?{back:undefined}:{})}}});}}>Restablecer vista</button>{onHideMode&&<button disabled={disabled} aria-pressed={hideMode} onClick={()=>{onView('back');if(!editing)onDraft([...guide.hiddenPieceIds]);onHideMode?.();}}>Ocultar pieza en el dibujo</button>}<span>Solo cambia la guía interior; todas las piezas siguen en el listado.</span></div>
    {hidden.length>0&&<div className="guide-hidden-chips" role="group" aria-label="Piezas ocultas en interior">{hidden.map(id=>{const piece=f.pieces.find(p=>p.id===id);return <button key={id} disabled={disabled} title={`Restaurar instancia ${id}`} aria-label={`Mostrar pieza oculta ${id}`} onClick={()=>toggle(id)}>{piece?.code||id} · {piece?.name||'Pieza'} <span aria-hidden="true">×</span></button>;})}<button disabled={disabled} onClick={()=>{onView('back');onDraft([]);}}>Mostrar todas</button></div>}
    <div className="guide-view-options"><label>Vistas en el PDF<select aria-label="Vistas en el PDF" value={guide.mode} disabled={disabled||editing} onChange={e=>mode(e.target.value as typeof guide.mode)}><option value="exterior">Una vista exterior</option><option value="interior">Una vista interior</option><option value="both">Dos vistas: exterior e interior</option></select></label><label className="guide-shared"><input aria-label="Compartir cámara entre vistas" type="checkbox" checked={guide.sharedCamera} disabled={disabled||editing} onChange={e=>{const sharedCamera=e.target.checked;const camera=f.presentation?.cameras?.front;onChange({...f,presentation:{...f.presentation,cameras:sharedCamera?f.presentation?.cameras:{...f.presentation?.cameras,back:camera},guide:{...guide,sharedCamera}}});}}/> Compartir orientación entre exterior e interior</label></div>
    <p className="hint">Girá y ajustá el zoom en el visor. La cámara es ortográfica y se guarda en la guía; el modelo de SketchUp permanece intacto.</p>
    <details className="guide-visibility" open={editing||undefined}><summary>Piezas visibles en la vista interior · {hidden.length} ocultas</summary>
      <p>Seleccioná una pieza en el dibujo o en esta lista. La casilla controla solo su aparición en la vista interior. Aplicá la previsualización para conservarla.</p>
      {!editing?<button disabled={disabled} onClick={()=>{onView('back');onDraft([...guide.hiddenPieceIds]);}}>Editar visibilidad interior</button>:<>
        <div data-testid="a4-view-stage" className="guide-preview-status" role="status">Previsualización sin aplicar · {hidden.length} piezas ocultas. {view==='front'?'La vista exterior permanece completa.':'El dibujo muestra la propuesta interior.'}</div>
        <div className="guide-visibility-actions"><button disabled={disabled||!selectedId||hidden.includes(selectedId)} onClick={()=>{if(selectedId)onDraft([...hidden,selectedId]);onView('back');}}>Ocultar pieza seleccionada</button><button disabled={disabled||!hidden.length} onClick={()=>onDraft([])}>Restaurar todas en la previsualización</button></div>
        <div className="guide-physical-pieces" role="group" aria-label="Visibilidad por instancia">{f.pieces.map(p=><div key={p.id} data-piece-path={p.id} className={selectedId===p.id?'selected':''}><button disabled={disabled} title={`Instancia: ${p.id}`} aria-label={`Seleccionar instancia ${p.id}`} aria-pressed={selectedId===p.id} onClick={()=>onSelect(p.id)}><strong>{p.code}</strong> {p.name}<small>{p.id}</small></button><label><input disabled={disabled} aria-label={`Visible en interior ${p.id}`} type="checkbox" checked={!hidden.includes(p.id)} onChange={()=>toggle(p.id)}/> Visible</label></div>)}</div>
        <div className="guide-visibility-actions"><button className="primary" disabled={disabled} onClick={onApply}>Aplicar visibilidad interior</button><button disabled={disabled} onClick={onCancel}>Cancelar previsualización</button></div>
      </>}
    </details>
    <label className="guide-observations">Observaciones de armado<textarea aria-label="Observaciones de armado" value={guide.observations} disabled={disabled||editing} maxLength={2000} rows={2} placeholder="Indicaciones generales que se imprimirán en la guía" onChange={e=>update({observations:e.target.value})}/><small>{guide.observations.length}/2000 · Se comprueba el espacio disponible antes de exportar.</small></label>
  </section>;
}
