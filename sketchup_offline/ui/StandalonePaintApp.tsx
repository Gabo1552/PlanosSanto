import {useCallback,useEffect,useRef,useState} from 'react';
import SmartPaintPalette,{type PaintTarget} from './SmartPaintPalette';
import PhotoMaterialPanel,{type PhotoMaterialResult} from './PhotoMaterialPanel';
import {request} from './bridge';
import {ensureRuntime} from './runtime';
import {isQuickIntent,type QuickIntent} from './quickActions';
import './smart-paint.css';
type Ready={intent?:unknown;toolState?:{active:boolean}};
// This entry deliberately imports no general App: opening Paint never scans or
// mounts the guide/catalog editor. The native controller owns the same session.
export default function StandalonePaintApp(){
 const [ready,setReady]=useState(false),[photo,setPhoto]=useState(false),[error,setError]=useState(''),[intent,setIntent]=useState<QuickIntent>(),[choice,setChoice]=useState<string>(),[autoStart,setAutoStart]=useState(false),[revision,setRevision]=useState(0),[photoTarget,setPhotoTarget]=useState<PaintTarget>();
 const mounted=useRef(true),lastSequence=useRef(0),photoDirty=useRef(false);
 const consume=useCallback(async(value?:unknown)=>{
  await ensureRuntime();if(!mounted.current)return;
  const state=await request<Ready>('palette_ready');if(!mounted.current)return;
  const candidate=isQuickIntent(value)?value:state.intent;
  if(isQuickIntent(candidate)&&candidate.sequence>lastSequence.current){
   lastSequence.current=candidate.sequence;
   // Native toolbar may already have armed the valid last material. Adopting
   // its state prevents activating a second tool or cancelling a pending batch.
   if(!state.toolState?.active)setIntent(candidate);
   void request('quick_action_ack',{sequence:candidate.sequence}).catch(()=>{});
  }
  setReady(true);
 },[]);
 useEffect(()=>{mounted.current=true;void consume().catch(value=>setError(value instanceof Error?value.message:String(value)));
  const quick=(event:Event)=>{void consume((event as CustomEvent).detail).catch(value=>{if(mounted.current)setError(value instanceof Error?value.message:String(value));});};
  window.addEventListener('planos-santo-quick-action',quick);
  return()=>{mounted.current=false;window.removeEventListener('planos-santo-quick-action',quick);};
 },[consume]);
 async function created(result:PhotoMaterialResult,options:{paint:boolean}){
  // Native photo creation has already updated the shared session. Reload the
  // palette from its source of truth; do not synthesize catalog approvals.
  await request('smart_palette_compact',{compact:true});setChoice(result.catalogId);setAutoStart(options.paint&&result.designReady);setIntent(undefined);setRevision(value=>value+1);setPhoto(false);setPhotoTarget(undefined);photoDirty.current=false;
 }
 if(!ready)return <main className="standalone-paint-status" aria-busy={!error}><h1>Pintura Inteligente</h1><p role={error?'alert':'status'}>{error||'Preparando la paleta…'}</p><button onClick={()=>void request('palette_close')}>Cerrar paleta</button></main>;
 return <div className="standalone-paint-app">{error&&<p role="alert">{error}</p>}{photo?<PhotoMaterialPanel replacement={photoTarget} initialKind={photoTarget?.kind} onClose={()=>{void request('smart_palette_compact',{compact:true}).catch(value=>setError(value instanceof Error?value.message:String(value)));setPhoto(false);setPhotoTarget(undefined);photoDirty.current=false;}} onDirtyChange={dirty=>{photoDirty.current=dirty;}} onCreated={created}/>:<SmartPaintPalette key={revision} quickMode initialCompact initialCatalogId={choice} autoStart={autoStart} quickIntent={intent} onClose={()=>{void request('palette_close').catch(value=>setError(value instanceof Error?value.message:String(value)));}} onManage={destination=>{void request('palette_manage',{destination}).catch(value=>setError(value instanceof Error?value.message:String(value)));}} onApplied={()=>{}} onCreateMaterial={()=>{void request('smart_palette_compact',{compact:false}).then(()=>{setAutoStart(false);setIntent(undefined);setPhotoTarget(undefined);setPhoto(true);}).catch(value=>setError(value instanceof Error?value.message:String(value)));}} onAssignPhoto={target=>{void request('smart_palette_compact',{compact:false}).then(()=>{setAutoStart(false);setIntent(undefined);setPhotoTarget(target);setPhoto(true);}).catch(value=>setError(value instanceof Error?value.message:String(value)));}}/>}</div>;
}
