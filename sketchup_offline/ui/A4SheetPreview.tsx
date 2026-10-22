import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {Furniture,Project} from '../../lib/model';
import type {View} from '../../lib/scene';
import {A4FitError,a4ViewScene,createOfflinePdfPages,decode64,exportTableTsv,metricFont,previewFileName,referenceCoverage,type A4FitKind,type A4Page,type Metrics,type OrderReferences} from './pdf';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import logo from '../assets/santo-carpintero.png?inline';
import './a4SheetPreview.css';

type Composed={project:Project;references?:OrderReferences;pending?:readonly string[];attempt:number;error?:unknown};
/** `list`: the printed pages in order («1», «2a», «2b»…), as the exporter returned them. */
type Sheet={key:string;url:string;bytes:number;list:A4Page[];fileName:string};
const SIZE=new Intl.NumberFormat('es-AR',{maximumFractionDigits:1});
export function formatBytes(bytes:number){return bytes>=1024*1024?`${SIZE.format(bytes/1024/1024)} MB`:`${SIZE.format(Math.max(1,Math.round(bytes/1024)))} KB`;}
const count=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
let metrics:Metrics|undefined;
/**
 * The scene the editor viewer draws: the one page 1 of the PDF prints, composed with the same fonts (read once from
 * the bundled assets), defaults and order references, so the viewer never needs a «generate and check» round.
 */
export function a4ViewerScene(f:Furniture,view:View,references?:OrderReferences,pending?:readonly string[]){
  metrics??={regular:metricFont(decode64(regularFont)),mono:metricFont(decode64(monoFont))};
  return a4ViewScene(f,view,metrics,references,pending);
}
/**
 * Controls of the editor that fix each kind of layout problem, by stable data attributes (no wiring through App).
 * The editor shows only the active furniture: they are looked up only once the furniture that fails is the active one.
 */
const open=(target:string)=>document.querySelector<HTMLElement>(`[data-fix-target="${target}"]:not(:checked):not(:disabled)`);
const FIX_TARGETS:Partial<Record<A4FitKind,(action?:string)=>HTMLElement|null|undefined>>={
  legend:()=>document.querySelector<HTMLElement>('[data-fix-target="legend"]'),
  scale:()=>document.querySelector<HTMLElement>('[data-fix-target="scale"] [aria-checked="true"]'),
  // «Agrupar por medidas» when the diagnosis names it, then the list itself (hoja 2 is automatic since 0.8.16).
  table:action=>(action?.startsWith('Activá «Agrupar por medidas')?open('table'):null)||open('table')||document.querySelector<HTMLElement>('[data-piece-row] input'),
  names:()=>[...document.querySelectorAll<HTMLInputElement>('input[data-piece-name]')].find(input=>!input.value.trim())||document.querySelector<HTMLElement>('input[data-piece-name]'),
};
/** Focus the control that fixes `kind`; returns the notice when it cannot be reached. */
function focusFix(kind:A4FitKind,action?:string):string|undefined{
  const target=FIX_TARGETS[kind]?.(action);
  if(!target)return 'El control para corregirlo no está en esta pantalla.';
  target.scrollIntoView?.({block:'center'});target.focus();
  if(document.activeElement===target)return undefined;
  return target.matches(':disabled')||target.closest('[aria-disabled="true"]')?'El control para corregirlo está bloqueado: aplicá o cancelá los cambios de visibilidad interior y volvé a intentar.':'No se pudo llevar el foco al control para corregirlo.';
}
/** Clipboard of SketchUp's CEF may refuse the async API: fall back to a hidden textarea. */
async function copyText(value:string){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}}catch{/* fall back below */}
  const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.setAttribute('aria-hidden','true');
  Object.assign(area.style,{position:'fixed',left:'-9999px',top:'0',opacity:'0'});document.body.appendChild(area);area.select();
  const ok=document.execCommand('copy');area.remove();if(!ok)throw new Error('copy refused');
}
function FitProblem({error,onRetry,onFix,stale}:{error:unknown;onRetry:()=>void;onFix?:()=>void;stale:boolean}){
  const fit=error instanceof A4FitError?error:undefined,message=error instanceof Error?error.message:String(error);
  return <div className="a4-preview-blocked" role="alert" data-fit-kind={fit?.kind}>
    <strong>{fit?.furniture?`No entra en la hoja: ${fit.furniture}`:'La hoja necesita un ajuste'}</strong>
    <p className="a4-fit-reason">{fit?fit.reason:message}</p>
    {fit?.detail&&<p className="a4-fit-detail">{fit.detail}</p>}
    {fit?.action&&<p className="a4-fit-action"><span>Qué hacer:</span> {fit.action}</p>}
    <p className="a4-fit-note">No se recortó información ni se agregaron hojas.{stale?' Se muestra la última versión que entraba.':''}</p>
    <div className="a4-fit-buttons">{onFix&&<button type="button" className="a4-fit-fix" onClick={onFix}>Ir a corregir</button>}<button type="button" onClick={onRetry}>Reintentar</button></div>
  </div>;
}
/** Render the actual export bytes: never a second approximation of the printed sheet. */
/** `pending`: piece ids included in the order whose rows are still under review (printed «pendiente de pedido»). */
export default function A4SheetPreview({project,references,pending,disabled=false,pendingReason,activeFurnitureId,onActivate}:{project:Project;references?:OrderReferences;pending?:readonly string[];disabled?:boolean;pendingReason?:string;activeFurnitureId?:string;onActivate?:(furnitureId:string)=>void}){
  const [composed,setComposed]=useState<Composed>(),[sheet,setSheet]=useState<Sheet>(),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0),[synced,setSynced]=useState<string>(),[note,setNote]=useState<{text:string;live:string}>(),[pendingFix,setPendingFix]=useState<{id:string;kind:A4FitKind;action?:string}>();
  const blockedId=useId(),copyButton=useRef<HTMLButtonElement>(null);
  // A sheet of another project or set of furniture is never shown as "the previous version"; dropping it releases its URL.
  const key=[project.id,...project.furniture.map(f=>f.id)].join('\n');
  if(sheet&&sheet.key!==key){setSheet(undefined);setPage(0);}
  // Follow the active furniture only when it changes, not on every edit of the project (which would reset the browsed sheet).
  // A furniture with hoja 2 has several pages: it opens on its first one.
  const firstPage=(id:string)=>sheet?sheet.list.findIndex(p=>p.furnitureId===id):project.furniture.findIndex(f=>f.id===id);
  if(activeFurnitureId!==synced){setSynced(activeFurnitureId);const index=activeFurnitureId?firstPage(activeFurnitureId):-1;if(index>=0)setPage(index);}
  useEffect(()=>{
    if(disabled)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void createOfflinePdfPages(project,decode64(regularFont),decode64(monoFont),decode64(logo),references,{pending}).then(({bytes,pages:list})=>{
        if(cancelled)return;
        const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
        setSheet({key:[project.id,...project.furniture.map(f=>f.id)].join('\n'),url,bytes:bytes.length,list,fileName:previewFileName(project)});
        setComposed({project,references,pending,attempt});
      }).catch((error:unknown)=>{if(!cancelled)setComposed({project,references,pending,attempt,error});});
    },200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[project,references,pending,disabled,attempt]);
  // The previous sheet stays on screen until its replacement exists; only then is its URL released.
  useEffect(()=>{const url=sheet?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[sheet?.url]);
  const current=composed?.project===project&&composed?.references===references&&composed?.pending===pending&&composed?.attempt===attempt?composed:undefined;
  const fresh=!!current&&!current.error,pages=sheet?.list.length||project.furniture.length,shown=Math.min(page,Math.max(0,pages-1));
  const go=(next:number)=>setPage(Math.max(0,Math.min(pages-1,next)));
  function keys(event:KeyboardEvent<HTMLElement>){
    if(pages<2||(event.target as HTMLElement).closest('textarea,input'))return;
    const back=event.key==='PageUp'||(event.altKey&&event.key==='ArrowLeft'),forward=event.key==='PageDown'||(event.altKey&&event.key==='ArrowRight');
    if(back||forward){event.preventDefault();go(shown+(back?-1:1));}
  }
  const summary=sheet&&`PDF · ${formatBytes(sheet.bytes)} · ${count(sheet.list.length,'hoja','hojas')}`;
  const coverage=referenceCoverage(project,references,pending||[]),waiting=references?coverage.pending:0,missing=coverage.total-coverage.covered-waiting;
  const furnitureCount=sheet?new Set(sheet.list.map(p=>p.furnitureId)).size:project.furniture.length,split=!!sheet&&sheet.list.length>furnitureCount;
  const status=disabled?pendingReason||'Aplicá o cancelá los cambios de visibilidad para preparar la hoja completa.':!current?(sheet?'Actualizando…':'Componiendo la hoja con piezas, cotas y anotaciones…'):current.error!==undefined?'La hoja no se actualizó: revisá el aviso.':sheet?`Hoja lista · ${formatBytes(sheet.bytes)}`:'';
  // One live region: an action's notice is announced in place of the state and gives way when the state changes.
  const setNotice=(text:string)=>setNote({text,live:status}),live=note&&note.live===status?note.text:status;
  async function copy(){
    try{const table=exportTableTsv(project,references,pending);await copyText(table.text);setNotice(`Tabla copiada: ${count(table.rows,'fila','filas')} de ${count(table.furniture,'mueble','muebles')}. Pegala en Excel o Google Sheets.`);}
    catch(error){setNotice(error instanceof A4FitError?`No se copió la tabla. ${error.message}`:'No se pudo copiar la tabla. Probá de nuevo o descargá la vista previa.');}
    copyButton.current?.focus();
  }
  const fit=current?.error instanceof A4FitError?current.error:undefined;
  const failing=fit?project.furniture.findIndex(f=>fit.furnitureId?f.id===fit.furnitureId:!!fit.furniture&&f.name===fit.furniture):-1;
  // Open the sheet of the furniture that fails, make it the active one in the editor and only then focus its control.
  function fix(){
    if(!fit)return;
    const id=failing>=0?project.furniture[failing].id:undefined,target=id?firstPage(id):-1;
    const paged=target>=0&&sheet?.list[shown]?.furnitureId!==id&&pages>1;
    if(paged)go(target);
    const active=activeFurnitureId??(project.furniture.length===1?project.furniture[0].id:undefined);
    const shownText=paged?`Mostrando la hoja ${sheet?.list[target]?.label??failing+1} · ${project.furniture[failing].name}.`:'';
    if(!id||id===active){const problem=focusFix(fit.kind,fit.action);if(problem||paged)setNotice([shownText,problem].filter(Boolean).join(' '));return;}
    if(onActivate){setPendingFix({id,kind:fit.kind,action:fit.action});onActivate(id);if(paged)setNotice(shownText);return;}
    setNotice(`${shownText} Abrí «${project.furniture[failing].name}» en el editor para corregirlo.`.trim());
  }
  useEffect(()=>{
    if(!pendingFix||activeFurnitureId!==pendingFix.id)return;
    const frame=requestAnimationFrame(()=>{setPendingFix(undefined);const problem=focusFix(pendingFix.kind,pendingFix.action);if(problem)setNote({text:problem,live:status});});
    return()=>cancelAnimationFrame(frame);
  },[pendingFix,activeFurnitureId,status]);
  return <section className="a4-sheet-preview" aria-label="Vista previa del PDF A4" aria-keyshortcuts={pages>1?'PageUp PageDown Alt+ArrowLeft Alt+ArrowRight':undefined} onKeyDown={keys}>
    <header><div><h2>Hoja A4 para imprimir</h2><p>297 × 210 mm · {split?`${count(furnitureCount,'mueble','muebles')} · ${count(pages,'hoja','hojas')} con despiece completo en hoja 2`:`${project.furniture.length} ${project.furniture.length===1?'mueble · 1 hoja':'muebles · una hoja por mueble'}`}</p></div>
      {!disabled&&pages>1&&sheet&&<div className="a4-sheet-pager" role="group" aria-label="Hojas" title="Cambiar de hoja: RePág / AvPág o Alt + ← / →">
        <button type="button" disabled={shown===0} aria-keyshortcuts="PageUp Alt+ArrowLeft" onClick={()=>go(shown-1)}><span aria-hidden="true">‹</span> Anterior</button>
        <select aria-label="Hoja visible" value={shown} onChange={e=>go(Number(e.target.value))}>{sheet.list.map((p,i)=><option key={`${p.furnitureId}#${p.label}`} value={i}>Hoja {p.label} de {furnitureCount} · {p.name}</option>)}</select>
        <button type="button" disabled={shown>=pages-1} aria-keyshortcuts="PageDown Alt+ArrowRight" onClick={()=>go(shown+1)}>Siguiente <span aria-hidden="true">›</span></button>
      </div>}
      <nav aria-label="Acciones de vista previa">{!disabled&&sheet&&(fresh?<><a href={sheet.url} target="_blank" rel="noreferrer">Abrir PDF</a><a href={sheet.url} download={sheet.fileName} title={sheet.fileName}>Descargar vista previa</a></>:<><a role="link" tabIndex={0} className="a4-link-disabled" aria-disabled="true" aria-describedby={blockedId}>Abrir PDF</a><a role="link" tabIndex={0} className="a4-link-disabled" aria-disabled="true" aria-describedby={blockedId}>Descargar vista previa</a></>)}
        <button ref={copyButton} type="button" className="a4-copy-table" disabled={!project.furniture.length} title="Copia el listado de piezas separado por tabulaciones" onClick={()=>void copy()}>Copiar tabla</button></nav>
      <div className="a4-sheet-meta">
        <div className="a4-order-state" data-order={references?(missing||waiting?'partial':'complete'):'none'}><p className="a4-order-pill"><span aria-hidden="true">{references?'✓':'○'}</span> {references?`Con placa y cantos del pedido · ${coverage.covered} de ${count(coverage.total,'pieza','piezas')}${waiting?` · ${waiting} ${waiting===1?'pendiente':'pendientes'} de pedido`:''}`:'Sin datos del pedido'}</p>{references&&missing>0&&<p className="a4-order-missing">{missing===1?'1 pieza excluida del pedido se imprime sin material.':`${missing} piezas excluidas del pedido se imprimen sin material.`}</p>}</div>
        <p className="a4-live-status" role="status" aria-live="polite">{live}</p>
        {!disabled&&sheet&&!fresh&&<small id={blockedId} className="a4-link-reason">Esperá a que la hoja esté actualizada</small>}
        {!disabled&&sheet&&<small className="a4-sheet-size" data-testid="a4-sheet-size">{summary}</small>}
        {!disabled&&sheet&&(notices=>!!notices?.length&&<small className="a4-sheet-notice" data-testid="a4-sheet-notice">{notices.join(' ')}</small>)(sheet.list[shown]?.notices)}
        {!disabled&&sheet&&(advice=>advice&&<small className="a4-sheet-fit" data-testid="a4-sheet-fit">El listado sigue en la hoja 2. {advice.detail} Para que entre en una sola hoja: {advice.action}</small>)(sheet.list.find(p=>p.fit&&p.furnitureId===sheet.list[shown]?.furnitureId)?.fit)}
      </div>
    </header>
    {!disabled&&<>
      {current?.error!==undefined&&<FitProblem error={current.error} stale={!!sheet} onRetry={()=>setAttempt(n=>n+1)} onFix={fit&&(FIX_TARGETS[fit.kind]||failing>=0)?fix:undefined}/>}
      {sheet&&<>
        {current?.error===undefined&&<p className="a4-preview-fidelity">PDF real del exportador, con tabla, cotas y notas completas. Si no se ve en SketchUp, usá Abrir PDF.</p>}
        <div className={`a4-sheet-frame${fresh?'':' is-stale'}`}>{!current&&<span className="a4-stale-badge" aria-hidden="true">Actualizando…</span>}<iframe key={`${sheet.url}#${shown}`} title="PDF A4 generado" src={`${sheet.url}#page=${shown+1}&view=FitH&toolbar=0`} data-pdf-bytes={sheet.bytes} data-stale={fresh?undefined:'true'}/></div>
      </>}
    </>}
  </section>;
}
