import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {Project} from '../../lib/model';
import {A4FitError,createOfflinePdf,decode64,exportTableTsv,previewFileName,referenceCoverage,type A4FitKind,type OrderReferences} from './pdf';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import logo from '../assets/santo-carpintero.png?inline';
import './a4SheetPreview.css';

type Composed={project:Project;references?:OrderReferences;attempt:number;error?:unknown};
type Sheet={key:string;url:string;bytes:number;pages:number;names:string[];ids:string[];fileName:string};
const SIZE=new Intl.NumberFormat('es-AR',{maximumFractionDigits:1});
export function formatBytes(bytes:number){return bytes>=1024*1024?`${SIZE.format(bytes/1024/1024)} MB`:`${SIZE.format(Math.max(1,Math.round(bytes/1024)))} KB`;}
const count=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
/** Controls of the editor that fix each kind of layout problem, by stable data attributes (no wiring through App). */
const FIX_TARGETS:Partial<Record<A4FitKind,()=>HTMLElement|null|undefined>>={
  legend:()=>document.querySelector<HTMLElement>('[data-fix-target="legend"]'),
  scale:()=>document.querySelector<HTMLElement>('[data-fix-target="scale"] [aria-checked="true"]'),
  table:()=>document.querySelector<HTMLElement>('[data-fix-target="table"]:not(:checked):not(:disabled)')||document.querySelector<HTMLElement>('[data-piece-row] input'),
  names:()=>[...document.querySelectorAll<HTMLInputElement>('input[data-piece-name]')].find(input=>!input.value.trim())||document.querySelector<HTMLElement>('input[data-piece-name]'),
};
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
export default function A4SheetPreview({project,references,disabled=false,pendingReason,activeFurnitureId}:{project:Project;references?:OrderReferences;disabled?:boolean;pendingReason?:string;activeFurnitureId?:string}){
  const [composed,setComposed]=useState<Composed>(),[sheet,setSheet]=useState<Sheet>(),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0),[synced,setSynced]=useState<string>(),[notice,setNotice]=useState('');
  const blockedId=useId(),copyButton=useRef<HTMLButtonElement>(null);
  // A sheet of another project or set of furniture is never shown as "the previous version"; dropping it releases its URL.
  const key=[project.id,...project.furniture.map(f=>f.id)].join('\n');
  if(sheet&&sheet.key!==key){setSheet(undefined);setPage(0);}
  // Follow the active furniture only when it changes, not on every edit of the project (which would reset the browsed sheet).
  if(activeFurnitureId!==synced){setSynced(activeFurnitureId);const index=activeFurnitureId?project.furniture.findIndex(f=>f.id===activeFurnitureId):-1;if(index>=0)setPage(index);}
  useEffect(()=>{
    if(disabled)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void createOfflinePdf(project,decode64(regularFont),decode64(monoFont),decode64(logo),references).then(bytes=>{
        if(cancelled)return;
        const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
        setSheet({key:[project.id,...project.furniture.map(f=>f.id)].join('\n'),url,bytes:bytes.length,pages:project.furniture.length,names:project.furniture.map(f=>f.name),ids:project.furniture.map(f=>f.id),fileName:previewFileName(project)});
        setComposed({project,references,attempt});
      }).catch((error:unknown)=>{if(!cancelled)setComposed({project,references,attempt,error});});
    },200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[project,references,disabled,attempt]);
  // The previous sheet stays on screen until its replacement exists; only then is its URL released.
  useEffect(()=>{const url=sheet?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[sheet?.url]);
  const current=composed?.project===project&&composed?.references===references&&composed?.attempt===attempt?composed:undefined;
  const fresh=!!current&&!current.error,pages=sheet?.pages||project.furniture.length,shown=Math.min(page,Math.max(0,pages-1));
  const go=(next:number)=>setPage(Math.max(0,Math.min(pages-1,next)));
  function keys(event:KeyboardEvent<HTMLElement>){
    if(pages<2||(event.target as HTMLElement).closest('textarea,input'))return;
    const back=event.key==='PageUp'||(event.altKey&&event.key==='ArrowLeft'),forward=event.key==='PageDown'||(event.altKey&&event.key==='ArrowRight');
    if(back||forward){event.preventDefault();go(shown+(back?-1:1));}
  }
  const summary=sheet&&`PDF · ${formatBytes(sheet.bytes)} · ${sheet.pages} ${sheet.pages===1?'hoja':'hojas'}`;
  const coverage=referenceCoverage(project,references),missing=coverage.total-coverage.covered;
  const live=disabled?pendingReason||'Aplicá o cancelá los cambios de visibilidad para preparar la hoja completa.':!current?(sheet?'Actualizando…':'Componiendo la hoja con piezas, cotas y anotaciones…'):current.error!==undefined?'La hoja no se actualizó: revisá el aviso.':sheet?`Hoja lista · ${formatBytes(sheet.bytes)}`:'';
  async function copy(){
    try{const table=exportTableTsv(project,references);await copyText(table.text);setNotice(`Tabla copiada: ${count(table.rows,'fila','filas')} de ${count(table.furniture,'mueble','muebles')}. Pegala en Excel o Google Sheets.`);}
    catch{setNotice('No se pudo copiar la tabla. Probá de nuevo o descargá la vista previa.');}
    copyButton.current?.focus();
  }
  const fit=current?.error instanceof A4FitError?current.error:undefined,fixTarget=fit&&FIX_TARGETS[fit.kind];
  function fix(){
    const target=fixTarget?.();
    const index=fit?.furniture&&sheet?sheet.names.indexOf(fit.furniture):-1;
    if(index>=0&&sheet&&index!==shown){go(index);setNotice(`Mostrando la hoja ${index+1} · ${sheet.names[index]}`);}
    else if(!target)setNotice('El control para corregirlo no está en esta pantalla.');
    if(target){target.scrollIntoView?.({block:'center'});target.focus();}
  }
  return <section className="a4-sheet-preview" aria-label="Vista previa del PDF A4" aria-keyshortcuts={pages>1?'PageUp PageDown Alt+ArrowLeft Alt+ArrowRight':undefined} onKeyDown={keys}>
    <header><div><h2>Hoja A4 para imprimir</h2><p>297 × 210 mm · {project.furniture.length} {project.furniture.length===1?'mueble · 1 hoja':'muebles · una hoja por mueble'}</p></div>
      {!disabled&&pages>1&&sheet&&<div className="a4-sheet-pager" role="group" aria-label="Hojas" title="Cambiar de hoja: RePág / AvPág o Alt + ← / →">
        <button type="button" disabled={shown===0} aria-keyshortcuts="PageUp Alt+ArrowLeft" onClick={()=>go(shown-1)}><span aria-hidden="true">‹</span> Anterior</button>
        <select aria-label="Hoja visible" value={shown} onChange={e=>go(Number(e.target.value))}>{sheet.names.map((name,i)=><option key={sheet.ids[i]??i} value={i}>Hoja {i+1} de {pages} · {name}</option>)}</select>
        <button type="button" disabled={shown>=pages-1} aria-keyshortcuts="PageDown Alt+ArrowRight" onClick={()=>go(shown+1)}>Siguiente <span aria-hidden="true">›</span></button>
      </div>}
      <nav aria-label="Acciones de vista previa">{!disabled&&sheet&&(fresh?<><a href={sheet.url} target="_blank" rel="noreferrer">Abrir PDF</a><a href={sheet.url} download={sheet.fileName} title={sheet.fileName}>Descargar vista previa</a></>:<><a role="link" tabIndex={0} className="a4-link-disabled" aria-disabled="true" aria-describedby={blockedId}>Abrir PDF</a><a role="link" tabIndex={0} className="a4-link-disabled" aria-disabled="true" aria-describedby={blockedId}>Descargar vista previa</a></>)}
        <button ref={copyButton} type="button" className="a4-copy-table" disabled={!project.furniture.length} title="Copia el listado de piezas separado por tabulaciones" onClick={()=>void copy()}>Copiar tabla</button></nav>
      <div className="a4-sheet-meta">
        <div className="a4-order-state" data-order={references?(missing?'partial':'complete'):'none'}><p className="a4-order-pill"><span aria-hidden="true">{references?'✓':'○'}</span> {references?`Con placa y cantos del pedido · ${coverage.covered} de ${count(coverage.total,'pieza','piezas')}`:'Sin datos del pedido'}</p>{references&&missing>0&&<p className="a4-order-missing">{missing===1?'1 pieza excluida del pedido se imprime sin material.':`${missing} piezas excluidas del pedido se imprimen sin material.`}</p>}</div>
        <p className="a4-live-status" role="status" aria-live="polite">{live}</p>
        {!disabled&&sheet&&!fresh&&<small id={blockedId} className="a4-link-reason">Esperá a que la hoja esté actualizada</small>}
        {!disabled&&sheet&&<small className="a4-sheet-size" data-testid="a4-sheet-size">{summary}</small>}
        <p className="a4-copy-status" role="status" aria-live="polite">{notice}</p>
      </div>
    </header>
    {!disabled&&<>
      {current?.error!==undefined&&<FitProblem error={current.error} stale={!!sheet} onRetry={()=>setAttempt(n=>n+1)} onFix={fixTarget||(fit?.furniture&&sheet?.names.includes(fit.furniture))?fix:undefined}/>}
      {sheet&&<>
        {current?.error===undefined&&<p className="a4-preview-fidelity">PDF real del exportador, con tabla, cotas y notas completas. Si no se ve en SketchUp, usá Abrir PDF.</p>}
        <div className={`a4-sheet-frame${fresh?'':' is-stale'}`}>{!current&&<span className="a4-stale-badge" aria-hidden="true">Actualizando…</span>}<iframe key={`${sheet.url}#${shown}`} title="PDF A4 generado" src={`${sheet.url}#page=${shown+1}&view=FitH&toolbar=0`} data-pdf-bytes={sheet.bytes} data-stale={fresh?undefined:'true'}/></div>
      </>}
    </>}
  </section>;
}
