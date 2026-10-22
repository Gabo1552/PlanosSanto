'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureGuide } from '../../sketchup_offline/ui/GuideViews';
import { fetchJson } from '../apiError';
import { toEdit, type Project } from '@/lib/model';

// Proyecto abierto, autoguardado a los 700 ms y protección contra cerrar la pestaña con cambios.
export function useProjectSession(){
  const [project,setProject]=useState<Project|null>(null);
  const [status,setStatus]=useState('Sin proyecto'), [error,setError]=useState(''), [tick,setTick]=useState(0);
  const current=useRef<Project|null>(null),serial=useRef(0),saved=useRef(0),saving=useRef<Promise<void>|null>(null),conflict=useRef(false);
  const load=useCallback((source:Project)=>{
    const migrated=source.furniture.some(f=>!f.presentation?.guide);
    const p={...source,furniture:source.furniture.map(ensureGuide)};
    current.current=p;serial.current=migrated?1:0;saved.current=0;if(migrated)setTick(n=>n+1);conflict.current=false;
    setProject(p);setError('');setStatus(migrated?'Actualizando guía A4…':'Guardado');
    return p;
  },[]);
  const change=useCallback((mutator:(p:Project)=>void)=>{
    if(!current.current||conflict.current)return;
    const next=structuredClone(current.current);mutator(next);current.current=next;serial.current++;setProject(next);setTick(n=>n+1);setStatus('Cambios sin guardar');
  },[]);
  const save=useCallback(async function persist():Promise<void>{
    if(saving.current){await saving.current;if(saved.current!==serial.current)return persist();return;}
    if(!current.current||serial.current===saved.current)return;
    if(conflict.current)throw new Error('Recargá el proyecto antes de seguir guardando.');
    const p=current.current,snapshot=serial.current;
    const job=(async()=>{
      setStatus('Guardando…');
      try{
        const next=await fetchJson<Project>(`/api/projects/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(toEdit(p))});
        if(current.current?.id===p.id){current.current={...current.current,revision:next.revision,updatedAt:next.updatedAt};setProject(current.current);saved.current=snapshot;setStatus(snapshot===serial.current?'Guardado':'Cambios sin guardar');}
      }catch(e){setStatus('No se pudo guardar');if((e as Error).message.includes('otra pestaña'))conflict.current=true;setError((e as Error).message);throw e;}
    })();saving.current=job;
    try{await job;}finally{saving.current=null;}
    if(saved.current!==serial.current)await persist();
  },[]);
  useEffect(()=>{if(!project||!tick)return;const t=setTimeout(()=>{save().catch(()=>{});},700);return()=>clearTimeout(t);},[tick,project?.id,save]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(saved.current!==serial.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
  return {project,status,error,setError,load,change,save,hasProject:()=>current.current!==null,currentId:()=>current.current?.id};
}
