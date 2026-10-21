import {useEffect,useState,type KeyboardEvent} from 'react';
import type {Project} from '../../lib/model';
import {A4FitError,createOfflinePdf,decode64,previewFileName} from './pdf';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import logo from '../assets/santo-carpintero.png?inline';
import './a4SheetPreview.css';

type Composed={project:Project;references?:Record<string,string>;attempt:number;error?:unknown};
type Sheet={url:string;bytes:number;pages:number;names:string[];ids:string[];fileName:string};
const SIZE=new Intl.NumberFormat('es-AR',{maximumFractionDigits:1});
export function formatBytes(bytes:number){return bytes>=1024*1024?`${SIZE.format(bytes/1024/1024)} MB`:`${SIZE.format(Math.max(1,Math.round(bytes/1024)))} KB`;}
function FitProblem({error,onRetry,stale}:{error:unknown;onRetry:()=>void;stale:boolean}){
  const fit=error instanceof A4FitError?error:undefined,message=error instanceof Error?error.message:String(error);
  return <div className="a4-preview-blocked" role="alert" data-fit-kind={fit?.kind}>
    <strong>{fit?.furniture?`No entra en la hoja: ${fit.furniture}`:'La hoja necesita un ajuste'}</strong>
    <p className="a4-fit-reason">{fit?fit.reason:message}</p>
    {fit?.action&&<p className="a4-fit-action"><span>Qué hacer:</span> {fit.action}</p>}
    <p className="a4-fit-note">No se recortó información ni se agregaron hojas.{stale?' Se muestra la última versión que entraba.':''}</p>
    <button type="button" onClick={onRetry}>Reintentar</button>
  </div>;
}
/** Render the actual export bytes: never a second approximation of the printed sheet. */
export default function A4SheetPreview({project,references,disabled=false,pendingReason,activeFurnitureId}:{project:Project;references?:Record<string,string>;disabled?:boolean;pendingReason?:string;activeFurnitureId?:string}){
  const [composed,setComposed]=useState<Composed>(),[sheet,setSheet]=useState<Sheet>(),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0);
  useEffect(()=>{
    if(disabled)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void createOfflinePdf(project,decode64(regularFont),decode64(monoFont),decode64(logo),references).then(bytes=>{
        if(cancelled)return;
        const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
        setSheet({url,bytes:bytes.length,pages:project.furniture.length,names:project.furniture.map(f=>f.name),ids:project.furniture.map(f=>f.id),fileName:previewFileName(project)});
        setComposed({project,references,attempt});
      }).catch((error:unknown)=>{if(!cancelled)setComposed({project,references,attempt,error});});
    },200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[project,references,disabled,attempt]);
  // The previous sheet stays on screen until its replacement exists; only then is its URL released.
  useEffect(()=>{const url=sheet?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[sheet?.url]);
  useEffect(()=>{const index=activeFurnitureId?project.furniture.findIndex(f=>f.id===activeFurnitureId):-1;if(index>=0)setPage(index);},[activeFurnitureId,project.furniture]);
  const current=composed?.project===project&&composed?.references===references&&composed?.attempt===attempt?composed:undefined;
  const fresh=!!current&&!current.error,pages=sheet?.pages||project.furniture.length,shown=Math.min(page,Math.max(0,pages-1));
  const go=(next:number)=>setPage(Math.max(0,Math.min(pages-1,next)));
  function keys(event:KeyboardEvent<HTMLElement>){
    if(pages<2||(event.target as HTMLElement).closest('textarea,input'))return;
    const back=event.key==='PageUp'||(event.altKey&&event.key==='ArrowLeft'),forward=event.key==='PageDown'||(event.altKey&&event.key==='ArrowRight');
    if(back||forward){event.preventDefault();go(shown+(back?-1:1));}
  }
  const summary=sheet&&`PDF · ${formatBytes(sheet.bytes)} · ${sheet.pages} ${sheet.pages===1?'hoja':'hojas'}`;
  return <section className="a4-sheet-preview" aria-label="Vista previa del PDF A4" aria-busy={!disabled&&!current} aria-keyshortcuts={pages>1?'PageUp PageDown Alt+ArrowLeft Alt+ArrowRight':undefined} onKeyDown={keys}>
    <header><div><h2>Hoja A4 para imprimir</h2><p>297 × 210 mm · {project.furniture.length} {project.furniture.length===1?'mueble · 1 hoja':'muebles · una hoja por mueble'}</p></div>
      {!disabled&&pages>1&&sheet&&<div className="a4-sheet-pager" role="group" aria-label="Hojas" title="Cambiar de hoja: RePág / AvPág o Alt + ← / →">
        <button type="button" disabled={shown===0} aria-keyshortcuts="PageUp Alt+ArrowLeft" onClick={()=>go(shown-1)}><span aria-hidden="true">‹</span> Anterior</button>
        <select aria-label="Hoja visible" value={shown} onChange={e=>go(Number(e.target.value))}>{sheet.names.map((name,i)=><option key={sheet.ids[i]??i} value={i}>Hoja {i+1} de {pages} · {name}</option>)}</select>
        <button type="button" disabled={shown>=pages-1} aria-keyshortcuts="PageDown Alt+ArrowRight" onClick={()=>go(shown+1)}>Siguiente <span aria-hidden="true">›</span></button>
      </div>}
      {!disabled&&sheet&&<nav aria-label="Acciones de vista previa">{fresh?<><a href={sheet.url} target="_blank" rel="noreferrer">Abrir PDF</a><a href={sheet.url} download={sheet.fileName} title={sheet.fileName}>Descargar vista previa</a></>:<><span className="a4-link-disabled" aria-disabled="true" title="Esperá a que la hoja esté actualizada">Abrir PDF</span><span className="a4-link-disabled" aria-disabled="true" title="Esperá a que la hoja esté actualizada">Descargar vista previa</span></>}<small className="a4-sheet-size" data-testid="a4-sheet-size">{summary}</small></nav>}
    </header>
    {disabled?<p role="status">{pendingReason||'Aplicá o cancelá los cambios de visibilidad para preparar la hoja completa.'}</p>:<>
      {current?.error!==undefined&&<FitProblem error={current.error} stale={!!sheet} onRetry={()=>setAttempt(n=>n+1)}/>}
      {!sheet?(!current&&<p role="status">Componiendo la hoja con piezas, cotas y anotaciones…</p>):<>
        {current?.error===undefined&&<p className="a4-preview-fidelity">Esta vista abre el PDF generado por el mismo exportador de la guía, con su tabla, cotas y notas completas. Si el visor integrado no está disponible en SketchUp, usá Abrir PDF.</p>}
        <div className={`a4-sheet-frame${fresh?'':' is-stale'}`}>{!current&&<span className="a4-stale-badge" role="status" aria-live="polite">Actualizando…</span>}<iframe key={`${sheet.url}#${shown}`} title="PDF A4 generado" src={`${sheet.url}#page=${shown+1}&view=FitH&toolbar=0`} data-pdf-bytes={sheet.bytes} data-stale={fresh?undefined:'true'}/></div>
      </>}
    </>}
  </section>;
}
