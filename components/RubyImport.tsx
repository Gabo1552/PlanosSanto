'use client';
import { useRef,useState,type RefObject } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/model';
import type { UploadResult } from '@/lib/archive';
import PairingPanel from './PairingPanel';
import {fetchJson} from './apiError';
type Props={onImport:(p:Project)=>Promise<void>;onRefresh:()=>Promise<void>;inputRef?:RefObject<HTMLInputElement|null>;compact?:boolean};
export default function RubyImport({onImport,onRefresh,inputRef,compact=false}:Props){
  const internalRef=useRef<HTMLInputElement>(null),file=inputRef||internalRef;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false),[name,setName]=useState('');
  const [conversion,setConversion]=useState<Extract<UploadResult,{state:'needs-sketchup'}>|null>(null);
  async function load(selected:File){
    if(busy)return;
    setError('');setConversion(null);setName(selected.name);setBusy(true);
    try{
      if(selected.size>50*1024*1024)throw new Error('El archivo supera 50 MB. Elegí uno más pequeño.');
      const form=new FormData();form.append('file',selected);
      const result=await fetchJson<UploadResult>('/api/import/file',{method:'POST',body:form});
      if(result.state==='needs-sketchup')setConversion(result);
      else await onImport(result.project);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section id="subir" className={`upload-hub ${compact?'upload-compact':''}`} aria-label="Subir proyecto"><div className="upload-copy"><p className="eyebrow">DEL ARCHIVO A LA GUÍA</p><h2>{compact?'Cargá otro proyecto.':'Tu próximo mueble empieza acá.'}</h2><p>Subí el ZIP de Planos Santo para ver las piezas y preparar tu plano de armado.</p><Link className="install-link" href="/instalar/web">¿Primera vez? Instalá la extensión en SketchUp →</Link></div>
    <div className={`upload-drop ${dragging?'drag-over':''} ${busy?'upload-busy':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length!==1){setError('Subí un solo ZIP por vez.');return;}void load(e.dataTransfer.files[0]);}} aria-busy={busy}>
      <svg aria-hidden="true" width="38" height="38" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 22v5h20v-5M16 23V5m-7 7 7-7 7 7"/></svg>
      <strong>{busy?'Revisando tu archivo…':'Arrastrá tu ZIP hasta acá'}</strong><span>{busy?name:'o elegilo desde tu computadora'}</span>
      <button className="button dark" disabled={busy} onClick={()=>file.current?.click()}>{busy?'Procesando…':'Elegir archivo'}</button><small>ZIP, SKP o exportación anterior · Hasta 50 MB</small>
      <input ref={file} className="sr-only" aria-label="Archivo del proyecto" type="file" accept=".zip,.skp,.json" onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void load(selected);}}/>
    </div>
    {error&&<div className="upload-result error" role="alert"><strong>No pudimos cargar el archivo</strong><p>{error}</p><button className="text-button" onClick={()=>file.current?.click()}>Elegir otro archivo</button></div>}
    {conversion&&<div className="upload-result conversion" role="status"><div className="result-icon">1</div><div><h3>Encontramos tu modelo. Falta prepararlo en SketchUp.</h3><p>{conversion.models.map(m=>m.name.split('/').pop()).join(', ')}</p><p>Este archivo todavía no incluye las piezas exportadas. Abrilo en SketchUp y elegí <strong>Planos Santo → Guardar ZIP para la web</strong>. Después subí ese ZIP acá.</p><p>No se generó un plano todavía: esta versión necesita ese paso en SketchUp para leer el modelo.</p><Link href="/instalar/web" className="button dark">Descargar e instalar la extensión</Link></div></div>}
    <details className="upload-help"><summary>Otras formas de importar</summary><p>También podés subir el archivo .json de versiones anteriores. El archivo .informe.json es un comprobante y no contiene la geometría del mueble.</p><PairingPanel onRefresh={onRefresh}/></details>
  </section>;
}
