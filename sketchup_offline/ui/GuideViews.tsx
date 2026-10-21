import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import type {Furniture} from '../../lib/model';
import type {View} from '../../lib/scene';
import HelpPopover from './HelpPopover';
import './guideViews.css';

export function ensureGuide(f:Furniture):Furniture {
  if(f.presentation?.guide)return f;
  return {...f,presentation:{...f.presentation,guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}}};
}
type Mode=NonNullable<NonNullable<Furniture['presentation']>['guide']>['mode'];
const MODES:{value:Mode;label:string}[]=[{value:'exterior',label:'Exterior'},{value:'interior',label:'Interior'},{value:'both',label:'Exterior + interior'}];
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
/** Draft versus applied hidden instances: what «Aplicar» would change in the sheet. */
export function visibilityDiff(applied:string[],draft:string[]){
  const added=draft.filter(id=>!applied.includes(id)),removed=applied.filter(id=>!draft.includes(id));
  return {added,removed,count:added.length+removed.length};
}
export default function GuideViews({furniture:f,view,selectedId,draftHidden,disabled,onChange,onSelect,onView,onDraft,onApply,onCancel,onHideMode,hideMode=false}:{
  furniture:Furniture;view:View;selectedId?:string;draftHidden:string[]|null;disabled:boolean;
  onChange:(f:Furniture)=>void;onSelect:(id:string)=>void;onView:(view:View)=>void;
  onDraft:(ids:string[])=>void;onApply:()=>void;onCancel:()=>void;onHideMode?:()=>void;hideMode?:boolean;
}){
  const guide=ensureGuide(f).presentation!.guide!,hidden=draftHidden??guide.hiddenPieceIds,editing=draftHidden!==null;
  const [query,setQuery]=useState(''),list=useRef<HTMLDivElement>(null),radios=useRef<(HTMLButtonElement|null)[]>([]);
  const diff=visibilityDiff(guide.hiddenPieceIds,hidden),needle=query.trim().toLocaleLowerCase('es');
  const matches=needle?f.pieces.filter(p=>[p.code,p.name,p.id].some(v=>v?.toLocaleLowerCase('es').includes(needle))):f.pieces;
  function update(change:Partial<typeof guide>){onChange({...f,presentation:{...f.presentation,guide:{...guide,...change}}});}
  function toggle(id:string){onView('back');onDraft(hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id]);}
  function mode(next:Mode){update({mode:next});onView(next==='interior'?'back':'front');}
  function apply(){setQuery('');onApply();}
  function cancel(){setQuery('');onCancel();}
  function modeKeys(event:KeyboardEvent<HTMLButtonElement>,index:number){
    const step=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;
    const target=event.key==='Home'?0:event.key==='End'?MODES.length-1:step?(index+step+MODES.length)%MODES.length:-1;
    if(target<0)return;event.preventDefault();mode(MODES[target].value);radios.current[target]?.focus();
  }
  function keys(event:KeyboardEvent<HTMLElement>){
    if(!editing||disabled||event.defaultPrevented||(event.target as HTMLElement).closest('textarea'))return;
    if(event.key==='Escape'){event.preventDefault();if((event.target as HTMLElement).matches('input[type=search]')&&query){setQuery('');return;}cancel();}
    else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(diff.count)apply();}
  }
  // Selecting a piece in the viewer brings its row into view inside the scrolling list.
  useEffect(()=>{if(!editing||!selectedId||!list.current)return;const row=[...list.current.querySelectorAll<HTMLElement>('[data-piece-path]')].find(node=>node.dataset.piecePath===selectedId);row?.scrollIntoView?.({block:'nearest'});},[editing,selectedId]);
  const pending=diff.count?['Sin aplicar',diff.added.length&&`+${plural(diff.added.length,'oculta','ocultas')}`,diff.removed.length&&plural(diff.removed.length,'restaurada','restauradas')].filter(Boolean).join(' · '):'Sin cambios respecto de lo aplicado';
  return <section data-testid="a4-view-editor" className="guide-views" aria-label="Configuración de vistas A4" onKeyDown={keys} aria-keyshortcuts={editing?'Escape Control+Enter':undefined}>
    <div className="section-heading"><h2>Vistas de la guía A4</h2><HelpPopover title="Exterior e interior"><p>Exterior muestra el mueble armado. Interior permite quitar piezas solo de esta representación para ver las uniones. No cambia la visibilidad ni la geometría de SketchUp.</p><p>El listado y las cantidades siempre conservan todas las piezas. Dos instancias iguales se pueden ocultar por separado.</p></HelpPopover></div>
    <div className="guide-view-count" role="radiogroup" aria-label="Vistas en el PDF" aria-disabled={disabled||editing||undefined}>{MODES.map((option,index)=>{const checked=guide.mode===option.value;return <button key={option.value} ref={node=>{radios.current[index]=node;}} type="button" role="radio" aria-checked={checked} tabIndex={checked?0:-1} disabled={disabled||editing} onKeyDown={event=>modeKeys(event,index)} onClick={()=>mode(option.value)}>{option.label}</button>;})}</div>
    <div className="guide-hide-shortcut"><button disabled={disabled||editing} onClick={()=>{const key=guide.sharedCamera||view==='front'?'front':'back';onChange({...f,zoom:1,presentation:{...f.presentation,cameras:{...f.presentation?.cameras,[key]:undefined,...(guide.sharedCamera?{back:undefined}:{})}}});}}>Restablecer vista</button>{onHideMode&&<button disabled={disabled} aria-pressed={hideMode} onClick={()=>{onView('back');if(!editing)onDraft([...guide.hiddenPieceIds]);onHideMode?.();}}>Ocultar pieza en el dibujo</button>}<span>Solo cambia la guía interior; todas las piezas siguen en el listado.</span></div>
    {hidden.length>0&&<div className="guide-hidden-chips" role="group" aria-label="Piezas ocultas en interior">{hidden.map(id=>{const piece=f.pieces.find(p=>p.id===id);return <button key={id} disabled={disabled} title={`Restaurar instancia ${id}`} aria-label={`Mostrar pieza oculta ${id}`} onClick={()=>toggle(id)}>{piece?.code||id} · {piece?.name||'Pieza'} <span aria-hidden="true">×</span></button>;})}<button disabled={disabled} onClick={()=>{onView('back');onDraft([]);}}>Mostrar todas</button></div>}
    {guide.mode==='both'&&<div className="guide-view-options"><label className="guide-shared"><input aria-label="Compartir cámara entre vistas" type="checkbox" checked={guide.sharedCamera} disabled={disabled||editing} onChange={e=>{const sharedCamera=e.target.checked;const camera=f.presentation?.cameras?.front;onChange({...f,presentation:{...f.presentation,cameras:sharedCamera?f.presentation?.cameras:{...f.presentation?.cameras,back:camera},guide:{...guide,sharedCamera}}});}}/> Compartir orientación entre exterior e interior</label></div>}
    <p className="hint">Girá y ajustá el zoom en el visor. La cámara es ortográfica y se guarda en la guía; el modelo de SketchUp permanece intacto.</p>
    <details className="guide-visibility" open={editing||undefined}><summary>Piezas visibles en la vista interior · {hidden.length} ocultas</summary>
      <p>Seleccioná una pieza en el dibujo o en esta lista. La casilla controla solo su aparición en la vista interior. Aplicá la previsualización para conservarla.</p>
      {!editing?<button disabled={disabled} onClick={()=>{onView('back');onDraft([...guide.hiddenPieceIds]);}}>Editar visibilidad interior</button>:<>
        <div data-testid="a4-view-stage" className={`guide-preview-status${diff.count?'':' is-clean'}`} role="status">{pending} · {plural(hidden.length,'pieza oculta','piezas ocultas')} en total. {view==='front'?'La vista exterior permanece completa.':'El dibujo muestra la propuesta interior.'} <small>Esc cancela · Ctrl+Enter aplica.</small></div>
        <div className="guide-visibility-actions"><button disabled={disabled||!selectedId||hidden.includes(selectedId)} onClick={()=>{if(selectedId)onDraft([...hidden,selectedId]);onView('back');}}>Ocultar pieza seleccionada</button><button disabled={disabled||!hidden.length} onClick={()=>onDraft([])}>Restaurar todas en la previsualización</button></div>
        <div className="guide-piece-search"><input type="search" aria-label="Buscar pieza (código o nombre)" placeholder="Buscar pieza (código o nombre)" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/><small aria-live="polite">{needle?`${matches.length} de ${f.pieces.length}`:`${f.pieces.length} piezas`}</small></div>
        <div ref={list} className="guide-physical-pieces" role="group" aria-label="Visibilidad por instancia">{matches.map(p=>{const change=diff.added.includes(p.id)?'nueva oculta':diff.removed.includes(p.id)?'se restaura':undefined;return <div key={p.id} data-piece-path={p.id} data-pending={change} className={selectedId===p.id?'selected':''}><button disabled={disabled} title={`Instancia: ${p.id}`} aria-label={`Seleccionar instancia ${p.id}`} aria-pressed={selectedId===p.id} onClick={()=>onSelect(p.id)}><strong>{p.code}</strong> {p.name}<small>{p.id}</small></button>{change&&<span className="guide-pending-tag">{change}</span>}<label><input disabled={disabled} aria-label={`Visible en interior ${p.id}`} type="checkbox" checked={!hidden.includes(p.id)} onChange={()=>toggle(p.id)}/> Visible</label></div>;})}
          {!matches.length&&<p className="guide-piece-empty" role="status">Ninguna pieza coincide con «{query.trim()}».</p>}</div>
        <div className="guide-visibility-actions"><button className="primary" disabled={disabled||!diff.count} aria-keyshortcuts="Control+Enter" title={diff.count?'Ctrl+Enter':'No hay cambios para aplicar'} onClick={apply}>Aplicar visibilidad interior</button><button disabled={disabled} aria-keyshortcuts="Escape" title="Esc" onClick={cancel}>Cancelar previsualización{diff.count>0&&<span className="guide-discard"> (descarta {plural(diff.count,'cambio','cambios')})</span>}</button></div>
      </>}
    </details>
    <label className="guide-observations">Observaciones de armado<textarea aria-label="Observaciones de armado" value={guide.observations} disabled={disabled||editing} maxLength={2000} rows={2} placeholder="Indicaciones generales que se imprimirán en la guía" onChange={e=>update({observations:e.target.value})}/><small>{guide.observations.length}/2000 · Se comprueba el espacio disponible antes de exportar.</small></label>
  </section>;
}
