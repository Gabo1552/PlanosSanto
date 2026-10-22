import {useEffect,useMemo,useRef,useState} from 'react';
import {mm,type Furniture} from '../../lib/model';
import {codePlan,referenceBoard} from './names';
import type {OrderReferences} from './pdf';
import './name-batch-preview.css';
import './codePlanDialog.css';
// DESPIECE-01 «Codificar despiece»: preview of workshop-ordered codes for the active furniture.
// Applying only changes the project in memory; «Guardar guía» stores it (renumber travels in editsFor).
export default function CodePlanDialog({furniture,unsaved,references,loadReferences,onApply,onClose}:{furniture:Furniture;unsaved:readonly string[];references?:OrderReferences;loadReferences?:()=>Promise<OrderReferences|undefined>;onApply:(codes:Record<string,string>,renumber:boolean)=>void;onClose:()=>void}){
 const panel=useRef<HTMLElement>(null),keys=useRef({onClose});
 const [renumber,setRenumber]=useState(false),[loaded,setLoaded]=useState<OrderReferences|undefined>(references),[referenceNote,setReferenceNote]=useState('');
 // Loaded once on open: without a reviewed order the board falls back to the model material.
 useEffect(()=>{if(references||!loadReferences)return;let current=true;loadReferences().then(value=>{if(current)setLoaded(value);}).catch(()=>{if(current)setReferenceNote('Sin pedido revisado: la placa sale del material del modelo.');});return()=>{current=false;};},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const plan=useMemo(()=>{
  const missing=new Set(unsaved),saved=furniture.pieces.filter(p=>!missing.has(p.id)).map(p=>p.id);
  try{return {rows:codePlan(furniture.pieces,{saved,renumber,board:referenceBoard(loaded)}),error:''};}catch(e){return {rows:[],error:e instanceof Error?e.message:String(e)};}
 },[furniture,unsaved,renumber,loaded]);
 const changed=plan.rows.filter(r=>r.changed).length,same=plan.rows.length-changed;
 useEffect(()=>{keys.current={onClose};});
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLElement>('input')?.focus();return()=>previous?.focus();},[]);
 useEffect(()=>{function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();keys.current.onClose();}if(event.key==='Tab'){const items=[...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')||[])],first=items[0],last=items[items.length-1];if(first&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)||!panel.current?.contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first)?.focus();}}}document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
 function apply(){if(!changed)return;onApply(Object.fromEntries(plan.rows.map(r=>[r.id,r.after])),renumber);}
 return <div className="material-review-backdrop"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="code-plan-title" aria-describedby="code-plan-help" className="name-batch-preview code-plan">
  <header><div><h2 id="code-plan-title">Codificar despiece</h2><p id="code-plan-help">Ordena las piezas de «{furniture.name}» por placa, espesor, largo y ancho (de mayor a menor) y les da códigos en ese orden. Sin renumerar, solo reciben código las piezas que todavía no tienen uno guardado.</p></div><button className="naming-close" aria-label="Cerrar" title="Cerrar" onClick={onClose}>×</button></header>
  <div className="name-batch-content">
   <label className="code-plan-renumber"><input type="checkbox" checked={renumber} onChange={e=>setRenumber(e.target.checked)}/> Renumerar todas las piezas</label>
   {renumber&&<p className="name-batch-warning" role="note">Cambia códigos que ya pueden estar impresos en etiquetas o planos. La guía conserva el código anterior de cada pieza.</p>}
   {referenceNote&&<p className="code-plan-note">{referenceNote}</p>}
   {plan.error&&<p role="alert" className="name-batch-error">{plan.error}</p>}
   <p className="code-plan-summary" aria-live="polite">{changed===1?'1 pieza recibe código':`${changed} piezas reciben código`} · {same} sin cambios</p>
   <table><thead><tr><th>ID actual → ID nuevo</th><th>Nombre</th><th>Placa</th><th>Esp × largo × ancho (mm)</th></tr></thead><tbody>{plan.rows.map(row=><tr key={row.id} data-code-row={row.id} data-changed={row.changed||undefined} className={row.changed?'code-plan-changed':undefined}><td><span>{row.before}</span> <span aria-hidden="true">→</span><span className="sr-only">pasa a</span> <strong>{row.after}</strong>{!row.changed&&<small>Sin cambios</small>}</td><td>{row.name}</td><td>{row.board||<em>Sin placa</em>}</td><td>{mm(row.dimensions[2])} × {mm(row.dimensions[0])} × {mm(row.dimensions[1])}</td></tr>)}</tbody></table>
  </div>
  <footer><button onClick={onClose}>Cancelar</button><button className="primary" disabled={!changed} onClick={apply}>Aplicar códigos</button></footer>
 </section></div>;
}
