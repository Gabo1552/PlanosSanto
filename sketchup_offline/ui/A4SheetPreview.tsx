import {useEffect,useState} from 'react';
import type {Project} from '../../lib/model';
import {createOfflinePdf,decode64} from './pdf';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import logo from '../assets/santo-carpintero.png?inline';
import './a4SheetPreview.css';

type Prepared={project:Project;references?:Record<string,string>;url?:string;error?:string;bytes?:number};
/** Render the actual export bytes: never a second approximation of the printed sheet. */
export default function A4SheetPreview({project,references,disabled=false,pendingReason}:{project:Project;references?:Record<string,string>;disabled?:boolean;pendingReason?:string}){
  const [prepared,setPrepared]=useState<Prepared>();
  useEffect(()=>{
    if(disabled)return;
    let cancelled=false,url:string|undefined;
    const timer=setTimeout(()=>{
      void createOfflinePdf(project,decode64(regularFont),decode64(monoFont),decode64(logo),references).then(bytes=>{
        if(cancelled)return;
        url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
        setPrepared({project,references,url,bytes:bytes.length});
      }).catch((error:unknown)=>{if(!cancelled)setPrepared({project,references,error:error instanceof Error?error.message:String(error)});});
    },200);
    return()=>{cancelled=true;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
  },[project,references,disabled]);
  const current=prepared?.project===project&&prepared?.references===references?prepared:undefined;
  return <section className="a4-sheet-preview" aria-label="Vista previa del PDF A4" aria-busy={!disabled&&!current}>
    <header><div><h2>Hoja A4 para imprimir</h2><p>297 × 210 mm · {project.furniture.length} {project.furniture.length===1?'mueble · 1 hoja':'muebles · una hoja por mueble'}</p></div>{!disabled&&current?.url&&<nav aria-label="Acciones de vista previa"><a href={current.url} target="_blank" rel="noreferrer">Abrir PDF</a><a href={current.url} download="PlanosSanto-vista-previa-A4.pdf">Descargar vista previa</a></nav>}</header>
    {disabled?<p role="status">{pendingReason||'Aplicá o cancelá los cambios de visibilidad para preparar la hoja completa.'}</p>:!current?<p role="status">Componiendo la hoja con piezas, cotas y anotaciones…</p>:current.error?<div className="a4-preview-blocked" role="alert"><strong>La hoja necesita un ajuste</strong><p>{current.error}</p><p>Revisá las vistas, el zoom o los textos indicados. La vista previa no recorta información ni agrega hojas.</p></div>:<><p className="a4-preview-fidelity">Esta vista abre el PDF generado por el mismo exportador de la guía, con su tabla, cotas y notas completas. Si el visor integrado no está disponible en SketchUp, usá Abrir PDF.</p><iframe title="PDF A4 generado" src={`${current.url}#view=FitH&toolbar=0`} data-pdf-bytes={current.bytes}/></>}
  </section>;
}
