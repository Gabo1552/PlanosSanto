import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Catalog,CatalogItem} from './WorkshopPanel';
import {request} from './bridge';
import type {QuickIntent} from './quickActions';
import HelpPopover from './HelpPopover';
import './smart-paint.css';

type Mode='sheet'|'edge'|'remove_edge'|'replace';
type NativeMaterial={designReady?:boolean;id:string;name:string;color?:number[]|string;hasTexture:boolean;binding?:{uuid:string;catalogId:string;kind:string}|null;issues?:string[]};
type Sample={selectable?:boolean;catalogId?:string;kind?:'sheet'|'edge';materialUuid?:string;name?:string;issues?:string[]};
type ToolState={options?:Partial<Settings>&{materialUuid?:string};requiresSharedReview?:boolean;active:boolean;mode?:Mode|'sample';contextChanged?:boolean;contextRestored?:boolean;sampleSequence?:number;sample?:Sample|null;changed?:boolean;queuedCount?:number;hover?:{pieceId:string;faceId:string;name?:string;affectedPaths:string[];faceCount?:number;sharedCount?:number;side?:string}|null;message?:string;error?:string};
type Settings={immediate?:boolean;immediatePiece?:boolean;paintScope:'face'|'piece';edgeCount:1|2|4;mode:Mode;catalogId:string;sourceMaterialUuid:string;replacementKind:'sheet'|'edge';axes:[number,number];side:'front'|'back'|'both';scope:'all'|'unique';batch:boolean};
// Computed in Ruby (PaintMaterials, 0.8.8): the palette never re-derives readiness.
export type PaintState={state:'ready'|'installable'|'needs_visual'|'asset_missing'|'asset_corrupt'|'texture_mismatch'|'binding_conflict';message:string;action?:'assign_visual'|'library';materialUuid?:string};
type Loaded={catalog:Catalog;visuals:{materials:NativeMaterial[]};paintStates?:Record<string,PaintState>;thumbnails?:Record<string,string>;settings?:Partial<Settings>;toolState:ToolState};
type Prepared={catalogId:string;materialUuid:string;installed:boolean;message:string};
type PrepareResult={prepared:Prepared;paintStates?:Record<string,PaintState>;visuals?:{materials:NativeMaterial[]}};
type Result={toolState:ToolState;scan?:unknown;scanRequired?:boolean;refreshWarning?:string;prepared?:Prepared;paintStates?:Record<string,PaintState>;visuals?:{materials:NativeMaterial[]}};
export type PaintTarget={catalogId:string;name:string;kind:'sheet'|'edge';thicknessMm:number|null;assign?:boolean};
const immediateDefaults={immediate:true,immediatePiece:true,paintScope:'piece' as const,side:'both' as const,scope:'unique' as const,batch:false};
const defaults:Settings={paintScope:'face',edgeCount:1,mode:'sheet',catalogId:'',sourceMaterialUuid:'',replacementKind:'sheet',axes:[0,1],side:'front',scope:'all',batch:false};
const labels:[Mode,string][]=[['sheet','Placas'],['edge','Cantos'],['remove_edge','Quitar cantos'],['replace','Reemplazar']];
function designReady(item:CatalogItem){
 const photo=item.observed?.photo;
 return !!photo&&typeof photo==='object'&&!Array.isArray(photo)&&(photo as Record<string,unknown>).schema===1&&(photo as Record<string,unknown>).designReady===true;
}
const PAINTABLE=new Set(['ready','installable']);
// Ready (bound in this model) or installable on choice. Commercial approval is irrelevant.
function usableForPainting(item:CatalogItem,data?:{paintStates?:Record<string,PaintState>;visuals:{materials:NativeMaterial[]}}){
 if(item.kind!=='sheet'&&item.kind!=='edge')return false;
 const state=data?.paintStates?.[item.id];
 if(data?.paintStates)return !!state&&PAINTABLE.has(state.state);
 // Without Ruby states (older bridge), "ready" = a bound native material without design issues.
 return designReady(item)||!!data?.visuals.materials.some(material=>material.binding?.catalogId===item.id&&material.binding.kind===item.kind&&!material.issues?.length);
}
function rgb(hex:string){const value=/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);return value?[1,2,3].map(index=>parseInt(value[index],16)):undefined;}
function swatch(material:NativeMaterial){if(Array.isArray(material.color))return `rgb(${material.color.slice(0,3).join(',')})`;if(typeof material.color==='string'&&/^#[\da-f]{6}$/i.test(material.color))return material.color;return undefined;}
// Only embedded raster previews supplied by the local importer. Never render SVG,
// URLs or paths from SKM metadata, and never fabricate a wood texture.
function rasterPreview(value:unknown){return typeof value==='string'&&value.length<=2_000_000&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:undefined;}
function ModeGlyph({mode}:{mode:Mode|'sample'}){
 const paths:Record<Mode|'sample',string>={sheet:'M4 4h13v16H4zM8 8h5m-5 4h3m2 6 7-10',edge:'M4 4h16v16H4zM16 6v12',remove_edge:'M4 4h9v16H4zM12 15l5-5 5 5-5 5z',replace:'M4 7h14l-4-4m4 4-4 4M20 17H6l4 4m-4-4 4-4',sample:'m5 18 10-10 3 3L8 21H5zm8-12 7 7m-3-7 3-3 3 3-3 3'};
 return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[mode]}/></svg>;
}
export default function SmartPaintPalette({onClose,onManage,onApplied,quickIntent,initialCompact=false,initialCatalogId,onCreateMaterial,onAssignPhoto,autoStart=false,quickMode=false}:{quickMode?:boolean;autoStart?:boolean;onCreateMaterial?:()=>void;onAssignPhoto?:(target:PaintTarget)=>void;initialCatalogId?:string;initialCompact?:boolean;quickIntent?:QuickIntent;onClose:()=>void;onManage:(destination:'catalog'|'visuals')=>void;onApplied:(scan:unknown,warning?:string)=>void}){
 const [loaded,setLoaded]=useState<Loaded>(),[settings,setSettings]=useState<Settings>(quickMode?{...defaults,...immediateDefaults}:defaults),[tool,setTool]=useState<ToolState>({active:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[allowShared,setAllowShared]=useState(false),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[compact,setCompact]=useState(initialCompact),[restorePlate,setRestorePlate]=useState(false),[sampleMode,setSampleMode]=useState(false),[sampledMaterialUuid,setSampledMaterialUuid]=useState(''),[recentIds,setRecentIds]=useState<string[]>([]),[installing,setInstalling]=useState(''),[colors,setColors]=useState<Record<string,string>>({});
 // Latest palette data for callbacks that run after awaits (avoids stale closures).
 const loadedRef=useRef<Loaded|undefined>(undefined);useEffect(()=>{loadedRef.current=loaded;},[loaded]);
 const [libraryRevision,setLibraryRevision]=useState(0),appliedLibraryRevision=useRef(0),libraryRefreshError=useRef<string|undefined>(undefined);
 const hasLoaded=!!loaded;
 useEffect(()=>{
  const changed=()=>setLibraryRevision(value=>value+1);
  window.addEventListener('planos-santo-material-library-changed',changed);
  return()=>window.removeEventListener('planos-santo-material-library-changed',changed);
 },[]);
 useEffect(()=>{
  // Defer while this dialog is editing/installing; a remote change must not
  // replace its selection, UUID, colour/photo drafts, search or active Tool.
  if(!hasLoaded||busy||libraryRevision<=appliedLibraryRevision.current)return;
  let cancelled=false;const epoch=contextEpoch.current;let retryDelay=80;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{void request<Loaded>('smart_palette_load').then(result=>{
   if(cancelled||epoch!==contextEpoch.current)return;
   loadedRef.current=result;setLoaded(result);appliedLibraryRevision.current=libraryRevision;
   const previousError=libraryRefreshError.current;if(previousError){setError(current=>current===previousError?'':current);libraryRefreshError.current=undefined;}
  }).catch(value=>{
   if(cancelled||epoch!==contextEpoch.current)return;
   const message=value instanceof Error?value.message:String(value);
   // The OTHER HtmlDialog can hold the native controller busy (e.g. a picker).
   // Keep this invalidation pending, without polling hover or retrying failures
   // such as a corrupt catalog. Cleanup cancels timers and obsolete responses.
   if(message==='Esperá a que termine la operación actual.'){
    timer=setTimeout(refresh,retryDelay);retryDelay=Math.min(retryDelay*2,2000);
   }else{libraryRefreshError.current=message;setError(message);}
  });};
  timer=setTimeout(refresh,40);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[libraryRevision,busy,hasLoaded]);
 const applyPaintData=useCallback((states?:Record<string,PaintState>,visuals?:{materials:NativeMaterial[]})=>{
  const previous=loadedRef.current;if(!states||!previous)return;
  const next={...previous,paintStates:states,...(visuals?{visuals}:{})};loadedRef.current=next;setLoaded(next);
 },[]);
 const rememberRecent=useCallback((id:string)=>{setRecentIds(previous=>[id,...previous.filter(other=>other!==id)].slice(0,5));},[]);
 const appliedQuick=useRef(0),lastSample=useRef<number|null>(null),contextEpoch=useRef(0),initialChoice=useRef(initialCatalogId),initialAutoStart=useRef(autoStart),initialQuickMode=useRef(quickMode),autoStartDone=useRef(false),lastNativeChoice=useRef('');
 const acceptState=useCallback((state:ToolState)=>{
  const loaded=loadedRef.current;
  setTool(state);
  if(state.active)setSampleMode(state.mode==='sample');
  if(state.requiresSharedReview)setAllowShared(false);
  if(state.options&&state.mode!=='sample'){
   const options=state.options;
   if(options.catalogId&&lastNativeChoice.current!==options.catalogId&&loaded?.catalog.items.some(item=>item.id===options.catalogId&&usableForPainting(item,loaded))){lastNativeChoice.current=options.catalogId;rememberRecent(options.catalogId);}
   setSettings(previous=>({...previous,
    ...(['sheet','edge','remove_edge','replace'].includes(options.mode||'')?{mode:options.mode}:{}),
    ...(options.paintScope==='face'||options.paintScope==='piece'?{paintScope:options.paintScope}:{}),
    ...([1,2,4].includes(options.edgeCount||0)?{edgeCount:options.edgeCount}:{}),
    ...(options.scope==='unique'||options.scope==='all'?{scope:options.scope}:{}),
    ...(options.side==='front'||options.side==='back'||options.side==='both'?{side:options.side}:{}),
    ...(typeof options.batch==='boolean'?{batch:options.batch}:{}),
    ...(Array.isArray(options.axes)&&options.axes.length===2&&options.axes.every(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2)&&options.axes[0]!==options.axes[1]?{axes:options.axes}:{}),
    ...(typeof options.catalogId==='string'?{catalogId:loaded?.catalog.items.some(item=>item.id===options.catalogId&&usableForPainting(item,loaded))?options.catalogId:''}:{})
   }));
   if(options.materialUuid){const material=loaded?.visuals.materials.find(material=>material.binding?.uuid===options.materialUuid&&material.binding?.catalogId===options.catalogId&&!material.issues?.length);setSampledMaterialUuid(material?options.materialUuid:'');}
  }
  if(state.contextChanged){contextEpoch.current+=1;loadedRef.current=undefined;setLoaded(undefined);setError(state.error||'Cambió el modelo activo. Volvé a analizar.');setAllowShared(false);return;}
  if(state.contextRestored){const epoch=++contextEpoch.current;setAllowShared(false);setError('');void request<Loaded>('smart_palette_load').then(result=>{if(contextEpoch.current===epoch){loadedRef.current=result;setLoaded(result);setTool(result.toolState);setNotice('Modelo original recuperado. Revisá el material y autorizá nuevamente el alcance antes de pintar.');}}).catch(error=>{if(contextEpoch.current===epoch)setError(error instanceof Error?error.message:String(error));});return;}
  if(state.mode!=='sample'||!state.sample){lastSample.current=null;return;}
  if(state.sampleSequence===lastSample.current)return;lastSample.current=state.sampleSequence??null;
  const sample=state.sample;
  const item=loaded?.catalog.items.find(item=>item.id===sample.catalogId&&item.kind===sample.kind&&usableForPainting(item,loaded));
  const material=loaded?.visuals.materials.find(material=>material.binding?.uuid===sample.materialUuid&&material.binding?.catalogId===sample.catalogId&&material.binding?.kind===sample.kind&&!material.issues?.length);
  setAllowShared(false);
  if(sample.selectable===true&&item&&material){
   setSettings(previous=>({...previous,mode:sample.kind==='edge'?'edge':'sheet',catalogId:item.id,sourceMaterialUuid:''}));setSampledMaterialUuid(sample.materialUuid||'');rememberRecent(item.id);setRestorePlate(false);setQuery('');setFavorites(false);
   setNotice(`Material tomado: ${item.name}. No se pintó ninguna cara. Elegí Placas o Cantos y revisá el alcance antes de activar.`);
  }else{setSampledMaterialUuid('');setSettings(previous=>({...previous,catalogId:'',sourceMaterialUuid:''}));const message=sample.issues?.join(' ')||'Material sin asociación aprobada. Revisalo en la biblioteca antes de pintar.';if(quickMode)setError(message);else setNotice(message);}
 },[rememberRecent,quickMode]);
 const run=useCallback(async(operation:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await operation();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}},[]);
 const accept=useCallback(async(result:Result)=>{applyPaintData(result.paintStates,result.visuals);if(result.prepared?.installed)setNotice(result.prepared.message);acceptState(result.toolState);if(result.toolState.contextChanged)return;if(result.scan)onApplied(result.scan,result.refreshWarning);else if(result.scanRequired){try{onApplied(await request('scan'),result.refreshWarning);}catch(e){onApplied(undefined,`El modelo cambió. Volvé a analizar antes de exportar. ${e instanceof Error?e.message:String(e)}`);}}else if(result.refreshWarning)onApplied(undefined,result.refreshWarning);},[onApplied,acceptState,applyPaintData]);
 async function stop(){const result=await request<Result>('smart_tool_stop');await accept(result);return result;}
 useEffect(()=>{if(!initialCompact||quickIntent)return;let mounted=true;void request('smart_palette_compact',{compact:true}).then(()=>{if(mounted)setCompact(true);}).catch(error=>{if(mounted)setError(error instanceof Error?error.message:String(error));});return()=>{mounted=false;};},[initialCompact,quickIntent]);
 useEffect(()=>{let mounted=true;void request<Loaded>('smart_palette_load').then(result=>{if(mounted){loadedRef.current=result;setLoaded(result);
    const chosen=initialChoice.current?result.catalog.items.find(item=>item.id===initialChoice.current&&usableForPainting(item,result)):undefined;
    setSettings({...defaults,...result.settings,...(result.toolState.active?result.toolState.options:{}),...(initialQuickMode.current?immediateDefaults:{}),...(chosen?{mode:chosen.kind as 'sheet'|'edge',catalogId:chosen.id,sourceMaterialUuid:'',...(initialAutoStart.current?(initialQuickMode.current?{...immediateDefaults,edgeCount:1 as const}:{scope:'unique' as const,side:'front' as const,batch:false,paintScope:'face' as const,edgeCount:1 as const}):{})}:initialChoice.current?{mode:'sheet' as const,catalogId:'',sourceMaterialUuid:''}:{})});
    setRestorePlate(!chosen&&result.settings?.mode==='remove_edge'&&!!result.settings.catalogId);setTool(result.toolState);setAllowShared(false);if(result.toolState.active){autoStartDone.current=true;setSampleMode(result.toolState.mode==='sample');const uuid=result.toolState.options?.materialUuid;if(uuid)setSampledMaterialUuid(uuid);}
    if(initialChoice.current&&!chosen)setNotice('El material elegido no está listo para diseño ni aprobado para compra. Revisalo en la biblioteca antes de pintar.');}}).catch(e=>{if(mounted)setError(e instanceof Error?e.message:String(e));});return()=>{mounted=false;};},[]);
 useEffect(()=>{if(!tool.active||busy)return;let running=false,mounted=true;const timer=setInterval(()=>{if(running)return;running=true;void request<Result>('smart_tool_status').then(async result=>{if(mounted)await accept(result);}).catch(e=>{if(mounted)setError(e instanceof Error?e.message:String(e));}).finally(()=>{running=false;});},1000);return()=>{mounted=false;clearInterval(timer);};},[tool.active,busy,accept]);
 useEffect(()=>{function update(event:Event){const state=(event as CustomEvent<ToolState>).detail;if(state&&typeof state.active==='boolean')acceptState(state);}window.addEventListener('planos-santo-smart-paint',update);return()=>window.removeEventListener('planos-santo-smart-paint',update);},[acceptState]);
 useEffect(()=>{if(!loaded||!quickIntent||appliedQuick.current>=quickIntent.sequence)return;appliedQuick.current=quickIntent.sequence;
  void run(async()=>{
   setAllowShared(false);setQuery('');setFavorites(false);
   if(quickIntent.action==='sheet'||quickIntent.action==='edge'||quickIntent.action==='remove_edge'){
    const mode=quickIntent.action,kind=mode==='edge'?'edge':'sheet';if(mode!==settings.mode)setSampledMaterialUuid('');setSampleMode(false);setRestorePlate(false);
    setSettings(previous=>({...previous,mode,sourceMaterialUuid:'',catalogId:mode!=='remove_edge'&&loaded.catalog.items.some(item=>item.id===previous.catalogId&&usableForPainting(item,loaded)&&item.kind===kind)?previous.catalogId:''}));
   }else if(quickIntent.action==='sample'){setSampleMode(true);setSampledMaterialUuid('');}
   await request('smart_palette_compact',{compact:true});if(appliedQuick.current!==quickIntent.sequence)return;setCompact(true);
   const lastItem=loaded.catalog.items.find(item=>item.id===settings.catalogId&&usableForPainting(item,loaded)&&item.kind===(quickIntent.action==='edge'?'edge':'sheet'));
   const lastMaterial=lastItem&&loaded.visuals.materials.find(material=>material.binding?.catalogId===lastItem.id&&material.binding.kind===lastItem.kind&&!material.issues?.length&&(!sampledMaterialUuid||material.binding.uuid===sampledMaterialUuid));
   const canResume=(quickIntent.action==='sheet'||quickIntent.action==='edge')&&!quickIntent.toggleOff&&settings.scope==='unique'&&settings.axes.length===2&&settings.axes[0]!==settings.axes[1]&&settings.axes.every(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2)&&['face','piece'].includes(settings.paintScope)&&[1,2,4].includes(settings.edgeCount)&&lastItem&&lastMaterial?.binding;
   if(canResume){
    rememberRecent(lastItem.id);
    await accept(await request<Result>(quickMode?'smart_quick_start':'smart_tool_start',quickMode?{mode:quickIntent.action,catalogId:lastItem.id,materialUuid:lastMaterial.binding!.uuid,...immediateDefaults,immediatePiece:quickIntent.action==='sheet'}:{options:{...settings,mode:quickIntent.action,sourceMaterialUuid:'',scope:'unique',allowShared:false,confirmed:true,catalogId:lastItem.id,materialUuid:lastMaterial.binding!.uuid}}));
   }else if(quickIntent.action==='sample'&&!quickIntent.toggleOff){
    if(!quickMode&&settings.side==='both'){setNotice('Elegí Frente o Dorso en Cara del cuentagotas. No se tomó ningún material.');}
    else await accept(await request<Result>('smart_sample_start',{side:quickMode?'front':settings.side}));
   }else await accept(await request<Result>('smart_tool_status'));
   setNotice(quickIntent.action==='sample'&&!quickMode&&settings.side==='both'&&!quickIntent.toggleOff?'Elegí Frente o Dorso en Cara del cuentagotas. No se tomó ningún material.':quickIntent.message|| (quickIntent.toggleOff?'Herramienta detenida; se cancelaron las caras en espera.':(quickMode?'Elegí un material y pintá las piezas del modelo.':'Paleta rápida: revisá material, cara y alcance antes de activar.')));
  });
 },[loaded,quickIntent,run,accept,settings,sampledMaterialUuid,rememberRecent,quickMode]);
 async function change(patch:Partial<Settings>){
  autoStartDone.current=true;const wasActive=tool.active,queued=tool.queuedCount||0;
  if(!quickMode&&(tool.active||tool.changed))await stop();
  const changingMaterial=('catalogId' in patch&&patch.catalogId!==settings.catalogId)||('mode' in patch&&patch.mode!==settings.mode);
  if('mode' in patch||'catalogId' in patch||'sourceMaterialUuid' in patch){setSampleMode(false);if(changingMaterial)setSampledMaterialUuid('');}
  const next={...settings,...patch,...(quickMode?{...immediateDefaults,immediatePiece:(patch.mode||settings.mode)==='sheet'}:{})};setSettings(next);setAllowShared(false);
  if(!quickMode&&patch.catalogId&&loaded?.catalog.items.some(item=>item.id===patch.catalogId&&usableForPainting(item,loaded)))rememberRecent(patch.catalogId);
  if(!quickMode&&patch.catalogId&&loaded?.paintStates?.[patch.catalogId]?.state==='installable'){
   const chosen=loaded.catalog.items.find(item=>item.id===patch.catalogId);
   if(chosen&&(chosen.kind==='sheet'||chosen.kind==='edge')){setInstalling(`Instalando «${chosen.name}» en este modelo…`);try{const result=await request<PrepareResult>('smart_material_prepare',{catalogId:chosen.id,mode:chosen.kind});applyPaintData(result.paintStates,result.visuals);if(result.prepared.installed)setNotice(result.prepared.message);}finally{setInstalling('');}}
  }
  if(!quickMode||(!wasActive&&!('catalogId' in patch&&!!patch.catalogId)))return;
  if(queued)setNotice('Se canceló la selección pendiente antes de cambiar la pintura.');
  if(next.scope!=='unique'){setNotice('Herramienta detenida. Revisá y autorizá nuevamente las ocurrencias compartidas; la selección pendiente se canceló.');return;}
  const nextKind=next.mode==='edge'?'edge':'sheet',item=loaded?.catalog.items.find(item=>item.id===next.catalogId&&item.kind===nextKind&&usableForPainting(item,loaded));
  const state=item?loaded?.paintStates?.[item.id]:undefined,stateReady=!!state&&PAINTABLE.has(state.state);
  const visual=loaded?.visuals.materials.find(material=>material.binding?.catalogId===item?.id&&material.binding?.kind===nextKind&&!material.issues?.length&&(!sampledMaterialUuid||changingMaterial||material.binding.uuid===sampledMaterialUuid));
  const axesValid=next.axes.length===2&&next.axes[0]!==next.axes[1]&&next.axes.every(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2);
  // 0.8.8: an installable material is installed by Ruby on this same request.
  const hasMaterial=!!visual?.binding||stateReady;
  if(next.mode==='replace'||!axesValid||!['face','piece'].includes(next.paintScope)||![1,2,4].includes(next.edgeCount)||(next.mode!=='remove_edge'&&!hasMaterial)||(next.mode==='remove_edge'&&next.catalogId&&!hasMaterial)){
   if(quickMode&&'mode' in patch&&patch.mode!==settings.mode&&!next.catalogId){if(tool.active)await stop();setSettings(next);setSampleMode(false);setNotice('Elegí el material para este modo.');return;}
   if(quickMode){const chosen=loaded?.catalog.items.find(candidate=>candidate.id===next.catalogId),reason=chosen&&loaded?.paintStates?.[chosen.id];setSettings(settings);setSampledMaterialUuid(sampledMaterialUuid);setSampleMode(tool.mode==='sample');throw new Error(reason?.message||(chosen&&chosen.kind!==nextKind?`«${chosen.name}» es ${chosen.kind==='edge'?'un canto':'una placa'}; elegí el modo correspondiente.`:'Elegí un material de la paleta.'));}
   setNotice('Elegí un material asociado y revisá los ajustes antes de activar. La selección pendiente se canceló.');return;
  }
  if(item&&state?.state==='installable')setInstalling(`Instalando «${item.name}» en este modelo…`);
  try{await accept(await request<Result>('smart_quick_start',{mode:next.mode,catalogId:item?.id||'',materialUuid:visual?.binding?.uuid||'',paintScope:next.paintScope,edgeCount:next.edgeCount,side:next.side,axes:next.axes,batch:next.batch,...(quickMode?{immediate:true,immediatePiece:next.mode==='sheet'}:{})}));}
  catch(error){if(quickMode){setSettings(settings);setSampledMaterialUuid(sampledMaterialUuid);setSampleMode(tool.mode==='sample');}throw error;}
  finally{setInstalling('');}
  if(quickMode&&item)rememberRecent(item.id);
  if(queued)setNotice('Selección pendiente cancelada. Herramienta lista con la nueva pintura.');
 }
 async function sample(){if(!quickMode&&settings.side==='both')throw new Error('Elegí Frente o Dorso para tomar un material sin ambigüedad.');if(tool.active||tool.changed)await stop();setSampleMode(true);setAllowShared(false);await accept(await request<Result>('smart_sample_start',{side:quickMode?'front':settings.side}));}
 async function leave(destination?:'catalog'|'visuals'){await stop();if(compact&&!quickMode)await request('smart_palette_compact',{compact:false});if(destination)onManage(destination);else onClose();}
 const kind=settings.mode==='edge'?'edge':settings.mode==='remove_edge'?'sheet':settings.mode==='replace'?settings.replacementKind:'sheet';
 const materials=useMemo(()=>loaded?.catalog.items.filter(item=>usableForPainting(item,loaded)&&item.kind===kind&&(!favorites||item.favorite)&&`${item.name} ${item.sku} ${item.supplier}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).sort((a,b)=>Number(b.id===settings.catalogId)-Number(a.id===settings.catalogId)||Number(b.favorite)-Number(a.favorite))||[],[loaded,kind,favorites,query,settings.catalogId]);
 const recentItems=useMemo(()=>recentIds.flatMap(id=>{const item=loaded?.catalog.items.find(item=>item.id===id&&usableForPainting(item,loaded)&&item.kind===kind);return item?[item]:[];}),[recentIds,loaded,kind]);
 const showMaterials=settings.mode!=='remove_edge'||restorePlate;
 const selected=loaded?.catalog.items.find(item=>item.id===settings.catalogId&&usableForPainting(item,loaded)&&item.kind===kind);
 const bound=loaded?.visuals.materials.find(material=>material.binding?.catalogId===selected?.id&&material.binding?.kind===kind&&!material.issues?.length&&(!sampledMaterialUuid||material.binding.uuid===sampledMaterialUuid));
 const sources=loaded?.visuals.materials.filter(material=>material.binding?.kind===settings.replacementKind&&!material.issues?.length)||[];
 const source=sources.find(material=>material.binding?.uuid===settings.sourceMaterialUuid);
 const invalidSettings=!settings.axes.every(axis=>Number.isInteger(axis)&&axis>=0&&axis<=2)||!['face','piece'].includes(settings.paintScope)||((settings.mode==='edge'||settings.mode==='remove_edge')&&![1,2,4].includes(settings.edgeCount))||settings.axes[0]===settings.axes[1]||(settings.scope==='all'&&!allowShared)||(settings.mode==='replace'&&(!source||source.binding?.uuid===bound?.binding?.uuid));
 const selectedState=selected?loaded?.paintStates?.[selected.id]:undefined,selectedPaintable=!!bound?.binding||(!!selectedState&&PAINTABLE.has(selectedState.state));
 const invalid=invalidSettings||(showMaterials&&!bound);
 useEffect(()=>{
  if(!initialAutoStart.current||autoStartDone.current||!loaded||quickIntent)return;
  const chosenId=initialChoice.current||(quickMode?settings.catalogId:undefined);
  const chosen=loaded.catalog.items.find(item=>item.id===chosenId&&usableForPainting(item,loaded));
  if(!chosen){autoStartDone.current=true;setNotice('No se inició pintura: el material no está listo. Revisá su ficha.');return;}
  if(settings.catalogId!==chosen.id)return;
  autoStartDone.current=true;
  // 0.8.8: an installable material is installed here too (explicit choice from the library).
  if(!selectedPaintable||invalidSettings||settings.scope!=='unique'){
   setNotice('Material guardado. Revisá su asociación, ejes y alcance antes de activar la pintura.');return;
  }
  rememberRecent(chosen.id);lastNativeChoice.current=chosen.id;
  void run(async()=>{
   if(selectedState?.state==='installable')setInstalling(`Instalando «${chosen.name}» en este modelo…`);
   try{
    let materialUuid=bound?.binding?.uuid||'';
    if(!quickMode&&!materialUuid){const prepared=await request<PrepareResult>('smart_material_prepare',{catalogId:chosen.id,mode:chosen.kind});applyPaintData(prepared.paintStates,prepared.visuals);materialUuid=prepared.prepared.materialUuid;}
    await accept(await request<Result>(quickMode?'smart_quick_start':'smart_tool_start',quickMode?{mode:chosen.kind,catalogId:chosen.id,materialUuid,...immediateDefaults,immediatePiece:chosen.kind==='sheet'}:{options:{...settings,scope:'unique',allowShared:false,confirmed:true,batch:false,side:'front',catalogId:chosen.id,materialUuid}}));
   }finally{setInstalling('');}
   setNotice(quickMode?'Listo. Hacé clic en las piezas del modelo para pintarlas.':'Listo para pintar una ocurrencia. La cara y sus ejes se verifican al apuntar; el material sigue pendiente para maderera si no tiene ficha comercial.');
  });
 },[loaded,settings,bound,selectedPaintable,selectedState,invalidSettings,quickIntent,run,accept,rememberRecent,applyPaintData,quickMode]);
 const chooseQuick=async(item:CatalogItem)=>{await change({mode:item.kind==='edge'?'edge':'sheet',catalogId:item.id,sourceMaterialUuid:''});};
 // Catalog items of this kind that cannot paint yet, with their real cause.
 const attention=useMemo(()=>loaded?.paintStates?loaded.catalog.items.filter(item=>item.kind===kind&&loaded.paintStates?.[item.id]&&!PAINTABLE.has(loaded.paintStates[item.id].state)&&`${item.name} ${item.sku} ${item.supplier}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))):[],[loaded,kind,query]);
 async function assignColor(item:CatalogItem){
  const values=rgb(colors[item.id]||'#d9d4c7');if(!values)throw new Error('Elegí un color válido.');
  const result=await request<Result&{assigned?:unknown}>('smart_assign_color',{catalogId:item.id,rgb:values,confirmed:true});
  applyPaintData(result.paintStates,result.visuals);
  setNotice(`Color asignado a «${item.name}». Ya podés pintar con él.`);
 }
 const attentionRow=(item:CatalogItem)=>{const state=loaded?.paintStates?.[item.id];if(!state)return null;return <li key={item.id} className="paint-attention-row"><div><strong>{item.name}</strong><p>{state.message}</p></div><div className="paint-attention-actions">{state.action==='assign_visual'&&(item.kind==='sheet'||item.kind==='edge')?<>{onAssignPhoto&&<button type="button" aria-label={`Asignar foto a ${item.name}`} disabled={busy} onClick={()=>void run(async()=>{autoStartDone.current=true;await stop();onAssignPhoto({catalogId:item.id,name:item.name,kind:item.kind as 'sheet'|'edge',thicknessMm:item.thicknessMm??null,assign:true});})}>Asignar foto</button>}<label className="paint-color-field"><input type="color" aria-label={`Color para ${item.name}`} value={colors[item.id]||'#d9d4c7'} disabled={busy} onChange={event=>{const value=event.target.value;setColors(previous=>({...previous,[item.id]:value}));}}/></label><button type="button" aria-label={`Asignar color a ${item.name}`} disabled={busy} onClick={()=>void run(async()=>{await assignColor(item);})}>Asignar color</button></>:<button type="button" aria-label={`Abrir biblioteca para ${item.name}`} disabled={busy} onClick={()=>void run(()=>leave('catalog'))}>Abrir biblioteca</button>}</div></li>;};
 const quickCard=(item:CatalogItem)=>{const actual=loaded?.visuals.materials.find(material=>material.binding?.catalogId===item.id&&material.binding.kind===item.kind&&!material.issues?.length),preview=rasterPreview(loaded?.thumbnails?.[item.id]),color=actual&&swatch(actual);return <button type="button" key={item.id} title={item.name} className="immediate-material" aria-pressed={settings.catalogId===item.id} disabled={busy} onClick={()=>void run(()=>chooseQuick(item))}><span className="immediate-swatch" style={color?{backgroundColor:color}:undefined}>{preview?<img src={preview} alt=""/>:color?null:<span aria-hidden="true">▤</span>}</span><span>{item.name}</span>{loaded?.paintStates?.[item.id]?.state==='installable'&&<small className="immediate-install-hint">Se instala al elegir</small>}</button>;};
 if(quickMode)return <main className="smart-paint-palette quick-mode immediate-palette" aria-labelledby="smart-paint-title">
  <header><div><span className="smart-eyebrow">PLANOS SANTO</span><h1 id="smart-paint-title">Pintado directo</h1></div><div className="immediate-header-actions">{onCreateMaterial&&<button type="button" className="primary" disabled={busy} onClick={()=>void run(async()=>{autoStartDone.current=true;await stop();onCreateMaterial();})}>+ Material</button>}<button type="button" title="Cerrar paleta y terminar el pintado" aria-label="Cerrar paleta" disabled={busy} onClick={()=>void run(()=>leave())}>×</button></div></header>
  <div className="immediate-controls"><nav aria-label="Modos de pintado directo">{([['sheet','Pintar pieza'],['edge','Pintar canto']] as const).map(([mode,label])=><button type="button" key={mode} disabled={busy||!loaded} aria-pressed={!sampleMode&&settings.mode===mode} onClick={()=>void run(()=>change({mode,catalogId:loaded?.catalog.items.some(item=>item.id===settings.catalogId&&usableForPainting(item,loaded)&&item.kind===mode)?settings.catalogId:'',sourceMaterialUuid:''}))}><ModeGlyph mode={mode}/>{label}</button>)}</nav><label className="immediate-search"><span className="sr-only">Buscar material</span><input type="search" aria-label="Buscar material de pintado directo" placeholder="Buscar material…" value={query} onChange={event=>setQuery(event.target.value)}/></label><details className="immediate-more"><summary aria-label="Más herramientas de pintura">···</summary><div><button type="button" disabled={busy||!loaded} onClick={()=>void run(()=>sample())}>Tomar material</button><button type="button" disabled={busy||!loaded} onClick={()=>void run(()=>change({mode:'remove_edge',catalogId:'',sourceMaterialUuid:''}))}>Quitar canto</button><button type="button" disabled={busy} onClick={()=>void run(()=>leave('catalog'))}>Biblioteca</button><button type="button" disabled={busy} onClick={()=>void run(()=>leave('visuals'))}>Importar SKM / asociar</button></div></details></div>
  <section className="immediate-current" aria-label="Material activo en la paleta">{selected?<><span className="immediate-current-swatch">{rasterPreview(loaded?.thumbnails?.[selected.id])?<img src={rasterPreview(loaded?.thumbnails?.[selected.id])} alt=""/>:<span style={bound&&swatch(bound)?{backgroundColor:swatch(bound)}:undefined}/>}</span><strong>{selected.name}</strong></>:<strong>{sampleMode?'Tomá un material del modelo':settings.mode==='remove_edge'?'Quitar canto':'Elegí un material'}</strong>}<span className={tool.active?'immediate-active':'immediate-idle'}>{tool.active?'● Pintando':'○ Detenido'}</span>{selected&&!tool.active&&!sampleMode&&settings.mode!=='remove_edge'&&<button type="button" className="primary" disabled={busy||!selectedPaintable} onClick={()=>void run(()=>chooseQuick(selected))}>Pintar</button>}{tool.active&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{await stop();})}>Terminar</button>}</section>
  <section className="immediate-library" aria-label="Materiales disponibles para pintar">{loaded?materials.map(quickCard):<p role="status">Cargando materiales…</p>}{loaded&&!materials.length&&<p>No hay materiales de este tipo listos para pintar. Agregá uno desde una foto o importá un SKM.</p>}</section>
  {attention.length>0&&<section className="paint-attention" aria-label="Materiales que necesitan atención"><span>Necesitan atención</span><ul>{attention.map(attentionRow)}</ul></section>}
  {recentItems.length>1&&<section className="immediate-recents" aria-label="Materiales usados recientemente"><span>Recientes</span>{recentItems.map(item=><button type="button" key={item.id} disabled={busy} aria-pressed={settings.catalogId===item.id} onClick={()=>void run(()=>chooseQuick(item))}>{item.name}</button>)}</section>}
  <footer className="immediate-footer"><p role="status">{busy?(installing||'Preparando…'):sampleMode?'Clic para tomar el material.':settings.mode==='remove_edge'?'Clic en el canto para quitarlo.':tool.active?'Clic en las piezas para pintar · Esc termina.':'Seleccioná un material y pulsá Pintar.'}</p>{tool.hover&&<span title={tool.hover.pieceId}>{tool.hover.name||'Pieza sin nombre'}</span>}</footer>
  {(error||tool.error)&&<p role="alert" className="warning immediate-error">{error||tool.error}</p>}{!error&&!tool.error&&selected&&!bound&&selectedState&&!PAINTABLE.has(selectedState.state)&&<p role="alert" className="warning immediate-error">{selectedState.message}</p>}{notice&&<p className="immediate-notice">{notice}</p>}
 </main>;
 return <main className={`smart-paint-palette ${compact?'compact':''} ${quickMode?'quick-mode':''}`} aria-labelledby="smart-paint-title"><header><div><span className="smart-eyebrow">PINTURA INTELIGENTE</span><h1 id="smart-paint-title">Pintado directo</h1><p>El modelo se trabaja en SketchUp</p></div><button disabled={busy} onClick={()=>void run(()=>leave())}>Cerrar paleta</button></header>
 <div className="smart-paint-actions">{onCreateMaterial&&<button className="smart-create-material" disabled={busy} onClick={()=>void run(async()=>{autoStartDone.current=true;await stop();onCreateMaterial();})}>+ Material</button>}<button disabled={busy} aria-pressed={compact} onClick={()=>void run(async()=>{if(tool.active)await stop();await request('smart_palette_compact',{compact:!compact});setCompact(!compact);})}>{compact?'Ampliar paleta':'Paleta compacta'}</button><button disabled={busy} onClick={()=>void run(async()=>{await stop();const result=await request<Loaded>('smart_palette_load');setLoaded(result);setTool(result.toolState);setAllowShared(false);setNotice('Biblioteca actualizada. Revisá el material antes de activar.');})}>Actualizar biblioteca</button></div>
 <nav aria-label="Modos de pintado directo">{labels.map(([mode,label])=><button key={mode} disabled={busy||!loaded} aria-pressed={!sampleMode&&settings.mode===mode} onClick={()=>{setRestorePlate(false);void run(()=>change({mode,catalogId:mode!=='remove_edge'&&loaded?.catalog.items.some(item=>item.id===settings.catalogId&&usableForPainting(item,loaded)&&item.kind===(mode==='edge'?'edge':mode==='replace'?settings.replacementKind:'sheet'))?settings.catalogId:'',sourceMaterialUuid:''}));}} title={mode==='sheet'?'Pintar placa':mode==='edge'?'Pintar canto':mode==='remove_edge'?'Quitar canto de la cara verificada':'Reemplazar un material exacto'}><ModeGlyph mode={mode}/><span>{label}</span></button>)}<button disabled={busy||!loaded} aria-pressed={sampleMode} onClick={()=>void run(async()=>{if(sampleMode&&tool.active&&tool.mode==='sample')await stop();else await sample();})} title="Tomar material sin pintar ni modificar el modelo"><ModeGlyph mode="sample"/><span>Tomar material</span></button></nav>
 {!sampleMode&&settings.mode==='sheet'&&<div className="smart-apply-scope" role="group" aria-label="Superficie de pintura"><button disabled={busy||!loaded} aria-pressed={settings.paintScope==='face'} onClick={()=>void run(()=>change({paintScope:'face'}))}>Cara señalada</button><button disabled={busy||!loaded} aria-pressed={settings.paintScope==='piece'} onClick={()=>void run(()=>change({paintScope:'piece'}))}>Pieza · 2 caras</button></div>}
 {!sampleMode&&(settings.mode==='edge'||settings.mode==='remove_edge')&&<div className="smart-edge-count" role="group" aria-label="Cantidad de cantos">{([1,2,4] as const).map(count=><button key={count} disabled={busy||!loaded} aria-pressed={settings.edgeCount===count} onClick={()=>void run(()=>change({edgeCount:count}))}>{count===1?'1 canto':count===2?'2 cantos opuestos':'4 cantos'}</button>)}</div>}
 {busy&&<p role="status">{installing||'Procesando…'}</p>}{error&&<p role="alert" className="warning">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section className="smart-current" aria-label="Material activo en la paleta">
  {selected?<><span className="smart-current-preview" aria-hidden="true">{rasterPreview(loaded?.thumbnails?.[selected.id])?<img src={rasterPreview(loaded?.thumbnails?.[selected.id])} alt=""/>:<span style={bound&&swatch(bound)?{backgroundColor:swatch(bound)}:undefined}>{bound&&swatch(bound)?'':'Sin miniatura'}</span>}</span><div><small>{kind==='edge'?'CANTO':'PLACA'} · {tool.active?'HERRAMIENTA ACTIVA':'POR ACTIVAR'}</small><p className="smart-selected-material">Elegido: <strong>{selected.name}</strong> · {selected.sku||'Sin SKU'}<small className="smart-production-state">{selected.approved?'Ficha comercial aprobada · el pedido requiere preflight':'Listo para diseño · pendiente para maderera'}</small>{bound&&<small>Material nativo: {bound.name}</small>}</p>{!rasterPreview(loaded?.thumbnails?.[selected.id])&&<small>Sin miniatura SKM; color base si está asociado.</small>}</div></>:<><span className="smart-current-empty" aria-hidden="true">{sampleMode?'⌖':'▤'}</span><div><small>{sampleMode?'CUENTAGOTAS · SOLO LECTURA':settings.mode==='remove_edge'?'QUITAR CANTO · REVISAR RESTAURACIÓN':'SIN MATERIAL ELEGIDO'}</small><strong>{sampleMode?'Tomá una cara del modelo':settings.mode==='remove_edge'?'Alcance controlado por cara':'Elegí una placa o canto listo para diseño'}</strong><p>No se pinta hasta activar y hacer clic.</p></div></>}
 </section>
 {!sampleMode&&settings.mode==='replace'&&<><label>Tipo de material a reemplazar<select aria-label="Tipo de reemplazo" disabled={busy} value={settings.replacementKind} onChange={e=>{const value=e.target.value as 'sheet'|'edge';void run(()=>change({replacementKind:value,catalogId:'',sourceMaterialUuid:''}));}}><option value="sheet">Placa</option><option value="edge">Canto</option></select></label><label>Material nativo de origen<select aria-label="Material de origen a reemplazar" value={settings.sourceMaterialUuid} disabled={busy} onChange={e=>{const value=e.target.value;void run(()=>change({sourceMaterialUuid:value}));}}><option value="">Elegí el material exacto existente</option>{sources.map(material=><option key={material.id} value={material.binding?.uuid}>{material.name} · {material.binding?.uuid}</option>)}</select></label><p className="smart-help">Sólo reemplaza la vinculación exacta de origen. No compara colores ni nombres parecidos.</p></>}
 {!sampleMode&&settings.mode==='remove_edge'&&<><label className="smart-check"><input type="checkbox" aria-label="Elegir placa de restauración" checked={restorePlate} disabled={busy} onChange={e=>{const value=e.target.checked;setRestorePlate(value);void run(()=>change({catalogId:''}));}}/> Elegir placa de restauración</label><p className="smart-help">Limpiar un canto restaura la placa; no borra geometría ni limpia todas las caras. Sin selección explícita, restaura la placa sólo si se detecta una asociación unívoca. Si hay ambigüedad, elegí la placa aquí antes de activar.</p></>}
 {sampleMode&&<div className="smart-sample-help"><strong>Cuentagotas · solo lectura</strong><p>Hacé clic en una cara del modelo para consultar su material real. No pinta, no cambia nombres y no autoriza instancias compartidas.</p><label>Cara del cuentagotas<select aria-label="Cara del cuentagotas" disabled={busy} value={settings.side} onChange={e=>{const side=e.target.value as Settings['side'];void run(()=>change({side}));}}><option value="front">Frente</option><option value="back">Dorso</option><option value="both" disabled>Elegí Frente o Dorso</option></select></label></div>}
 {(showMaterials||sampleMode)&&recentItems.length>0&&<label className="smart-recents">Últimas selecciones de esta paleta<select aria-label="Materiales usados recientemente" value="" disabled={busy||!loaded} onChange={event=>{const id=event.target.value;if(recentItems.some(item=>item.id===id))void run(()=>change({catalogId:id}));}}><option value="">Volver a elegir un material…</option>{recentItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small className="smart-help">{quickMode?'Hasta 5 materiales. Una herramienta activa y aislada continúa con la nueva selección.':'Hasta 5 materiales. Elegir no activa pintura ni autoriza el alcance.'}</small></label>}
 {showMaterials||sampleMode?<><label>Buscar material<input aria-label="Buscar material de pintado directo" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="smart-check"><input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.target.checked)}/> Favoritos</label><div className="smart-materials" aria-label="Materiales disponibles para pintar">{materials.map(item=>{const actual=loaded?.visuals.materials.find(m=>m.binding?.catalogId===item.id&&m.binding.kind===kind&&!m.issues?.length),color=actual&&swatch(actual),preview=rasterPreview(loaded?.thumbnails?.[item.id]);return <button key={item.id} disabled={busy} aria-pressed={settings.catalogId===item.id} onClick={()=>void run(()=>change({catalogId:item.id}))}><span className="smart-swatch" style={color?{backgroundColor:color}:undefined} aria-hidden="true">{preview?<img src={preview} alt=""/>:color?'':'?'}</span><span>{item.name}<small>{item.sku||'Sin SKU'} · {item.supplier}{item.favorite?' · ★':''}</small><small>{loaded?.paintStates?.[item.id]?.state==='installable'?'Se instala en este modelo al elegirlo':preview?'Miniatura SKM real · verificar veta en el modelo':actual?actual.hasTexture?'Con textura real · color base en esta lista':'Material real asociado':'Sin visual: asociar o instalar SKM'}</small></span></button>;})}{loaded&&!materials.length&&<p>No hay materiales listos para diseño con este filtro.</p>}</div>{attention.length>0&&<section className="paint-attention" aria-label="Materiales que necesitan atención"><span>Necesitan atención</span><ul>{attention.map(attentionRow)}</ul></section>}{selected&&!bound&&!selectedPaintable&&<p className="warning">Este material necesita una asociación real. Abrí «Asociar visual / SKM».</p>}{bound?.hasTexture&&<p className="smart-help">La miniatura, si existe, viene del SKM. La textura aplicada y su veta se verifican en el modelo.</p>}</>:<p>El clic quita el material de las caras estrechas verificadas. No elimina materiales de la biblioteca.</p>}
 <details><summary>Ajustes de alcance y caras</summary><label>Definiciones compartidas<select aria-label="Alcance pintado directo" disabled={busy} value={settings.scope} onChange={e=>{const value=e.target.value as 'all'|'unique';void run(()=>change({scope:value}));}}><option value="all">Afectar todas las ocurrencias compartidas</option><option value="unique">Hacer única la ocurrencia elegida</option></select></label>{settings.scope==='all'&&<label className="smart-check"><input type="checkbox" aria-label="Autorizar todas las ocurrencias compartidas" checked={allowShared} disabled={busy||tool.active} onChange={e=>setAllowShared(e.target.checked)}/> Autorizo afectar todas las ocurrencias de la definición que toque</label>}<label>Lado de las caras<select aria-label="Lado pintado directo" disabled={busy} value={settings.side} onChange={e=>{const value=e.target.value as Settings['side'];void run(()=>change({side:value}));}}><option value="front">Frente</option><option value="back">Dorso</option><option value="both">Ambos</option></select></label><div className="smart-axis">{(['Base U','Altura V'] as const).map((label,index)=><label key={label}>{label}<select aria-label={`Pintado directo ${label}`} disabled={busy} value={settings.axes[index]} onChange={e=>{const value=Number(e.target.value);void run(()=>change({axes:settings.axes.map((axis,i)=>i===index?value:axis) as [number,number]}));}}>{['X','Y','Z'].map((axis,i)=><option key={axis} value={i}>{axis}</option>)}</select></label>)}</div>{settings.axes[0]===settings.axes[1]&&<p role="alert">U y V deben ser diferentes.</p>}<p className="smart-help">Ejes locales del plano de corte. La cámara A4 no cambia estos ejes.</p><label className="smart-check"><input type="checkbox" checked={settings.batch} disabled={busy} onChange={e=>{const value=e.target.checked;void run(()=>change({batch:value}));}}/> Agrupar clics en un lote antes de confirmar con Enter</label></details>
 {!sampleMode&&settings.scope==='all'&&!allowShared&&<p className="smart-help">Revisá y autorizá el alcance compartido en Ajustes antes de activar.</p>}
 <div className="smart-arm"><button className="primary" disabled={busy||!loaded||tool.active||(sampleMode?settings.side==='both':invalid)} onClick={()=>void run(async()=>{if(sampleMode){await sample();return;}const result=await request<Result>('smart_tool_start',{options:{...settings,confirmed:true,allowShared,catalogId:selected?.id||'',materialUuid:bound?.binding?.uuid||''}});await accept(result);})}>{sampleMode?'Activar cuentagotas':'Activar pintado en SketchUp'}</button><button disabled={busy||!tool.active} onClick={()=>void run(async()=>{await stop();})}>Detener herramienta</button></div>
 <section className={`smart-tool-state ${tool.active?'active':''}`} aria-label="Estado del pintado directo"><strong>{tool.active?'Herramienta activa':'Herramienta detenida'}</strong><p>{tool.message||'No se modifica el modelo hasta activar y hacer clic en SketchUp.'}</p>{tool.queuedCount!==undefined&&<p>{tool.queuedCount} piezas en espera</p>}{tool.error&&<p role="alert">{tool.error}</p>}</section>
 <section className="smart-hover" aria-label="Cara bajo el cursor">{tool.hover?<><strong>{tool.hover.name||'Pieza sin nombre'}</strong><p>Pieza: <code>{tool.hover.pieceId}</code> · Cara: <code>{tool.hover.faceId}</code></p><p>{tool.hover.faceCount??1} caras · {tool.hover.sharedCount??(tool.hover.affectedPaths||[]).length} ocurrencias · {tool.hover.side==='both'?'Frente y dorso':tool.hover.side==='back'?'Dorso':'Frente'}</p><strong>{tool.mode==='sample'?'Ruta de la cara consultada':'Rutas afectadas antes de hacer clic'}</strong><ul>{(tool.hover.affectedPaths||[]).map(path=><li key={path}>{path}</li>)}</ul></>:<p>Acercá el cursor al modelo para ver aquí la pieza, cara y rutas que afectaría el clic.</p>}</section>
 <p className="smart-help">{sampleMode?'El cuentagotas resalta la cara y lee su material. Escape lo detiene. Para pintar, elegí Placas o Cantos y activá ese modo.':'Con el foco en SketchUp: acercá el cursor para resaltar y hacé clic para aplicar. Tab, Mayús+Tab o Ctrl+Tab recorren Cara/Pieza o 1/2/4 cantos del modo compatible; las flechas cambian materiales del mismo tipo. Mayús agrega al lote; Enter confirma. Escape detiene la herramienta. En los campos de esta paleta, Tab conserva su navegación normal.'}</p><HelpPopover title="Pintado en el modelo"><p>Las caras se identifican por ruta de instancia. Cada aplicación o lote se revierte con Undo. Si una pieza no es rectangular o el alcance no se puede verificar, revisala con el pintado por caras.</p></HelpPopover>
 <footer><button disabled={busy} onClick={()=>void run(()=>leave('catalog'))}>Editar biblioteca</button><button disabled={busy} onClick={()=>void run(()=>leave('visuals'))}>Asociar visual / SKM</button></footer>
 </main>;
}
