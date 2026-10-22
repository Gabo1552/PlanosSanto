'use client';
import { useEffect,useState } from 'react';
import {fetchJson} from './apiError';
export default function PairingPanel({onRefresh}:{onRefresh:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[key,setKey]=useState(''),[code,setCode]=useState(''),[expires,setExpires]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!code)return;
    const poll=setInterval(()=>{onRefresh().catch(()=>{});},5000);
    const timeout=setTimeout(()=>{setCode('');onRefresh().catch(()=>{});},Math.max(0,Date.parse(expires)-Date.now()));
    return()=>{clearInterval(poll);clearTimeout(timeout);};
  },[code,expires,onRefresh]);
  return <><button className="button outline" onClick={()=>setOpen(s=>!s)}>Vincular extensión</button>{open&&<div className="bridge-panel"><strong>Autorizar una entrega desde SketchUp</strong><p>Primero verificá el JSON local. Para el envío directo, el administrador debe configurar la clave privada PLANOS_BRIDGE_KEY en el servidor. Fuera de esta misma PC se requiere HTTPS.</p><form onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError('');setCode('');
    try{
      const data=await fetchJson<{token:string;expiresAt:string}>('/api/sketchup/pair',{method:'POST',headers:{'x-planos-bridge-key':key}});
      setKey('');setCode(data.token);setExpires(data.expiresAt);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }}><label>Clave de vinculación del taller <input aria-label="Clave de vinculación del taller" type="password" autoComplete="off" value={key} required onChange={e=>setKey(e.target.value)}/></label><button className="button dark" disabled={busy}>{busy?'Generando…':'Generar código temporal'}</button></form>{error&&<p className="error-text" role="alert">{error}</p>}{code&&<><p>Pegá este código en la extensión. Autoriza un intento de carga y vence a los cinco minutos. No lo compartas fuera del taller.</p><p className="bridge-code" aria-label="Código temporal">{code}</p><button className="text-button" onClick={()=>navigator.clipboard.writeText(code).catch(()=>setError('Copiá el código seleccionando su texto.'))}>Copiar código</button><p>Dirección para la extensión: <strong>{window.location.origin}</strong>. Si SketchUp está en otra PC, localhost no alcanza a este servidor; usá su dirección HTTPS accesible.</p><button className="text-button" onClick={()=>onRefresh().catch(e=>setError(e.message))}>Actualizar proyectos recibidos</button></>}</div>}</>;
}
