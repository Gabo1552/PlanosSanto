import {useEffect,useState} from 'react';

// ARQ-02: SketchUp never rescans by itself after painting, naming or a native
// edit. Ruby publishes the analysis state and the operator decides when.
export type AnalysisState={stale:boolean;reason?:string|null;source?:string|null};
export const ANALYSIS_EVENT='planos-santo-analysis-state';
export function isAnalysisState(value:unknown):value is AnalysisState{
  if(!value||typeof value!=='object')return false;
  const state=value as Record<string,unknown>;
  return typeof state.stale==='boolean'&&(state.reason===undefined||state.reason===null||typeof state.reason==='string')
    &&(state.source===undefined||state.source===null||typeof state.source==='string');
}

type Props={stale:boolean;deferred?:boolean;busy?:boolean;onStaleChange:(stale:boolean)=>void;onReanalyze:()=>void};
export default function StaleBanner({stale,deferred=false,busy=false,onStaleChange,onReanalyze}:Props){
  const [reason,setReason]=useState('');
  useEffect(()=>{
    function listen(event:Event){
      const detail=(event as CustomEvent<unknown>).detail;
      if(!isAnalysisState(detail))return;
      setReason(detail.stale?detail.reason||'':'');onStaleChange(detail.stale);
    }
    window.addEventListener(ANALYSIS_EVENT,listen);
    return()=>window.removeEventListener(ANALYSIS_EVENT,listen);
  },[onStaleChange]);
  if(!stale&&!deferred)return null;
  const title=stale?'Análisis desactualizado':'Modelo sin analizar';
  const detail=stale?`${reason?`${reason} `:''}La guía y el pedido usan el análisis anterior.`:'Se abrió sin analizar para no demorar Materiales ni Maderera.';
  return <div className="warning ux-sheet-notice ux-stale-banner" role="status" aria-label={title}>
    <span><strong>{title}</strong> · {detail}</span>
    <button type="button" className="primary" disabled={busy} onClick={onReanalyze}>{stale?'Reanalizar':'Analizar'}</button>
  </div>;
}
