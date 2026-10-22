import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {request} from './bridge';
import EdgeReview from './EdgeReview';
import {orderProjection} from '../../lib/orderPreview';
import {mm} from '../../lib/model';
import {applySummary,blockedField,boardOf,catalogComplete,catalogMissing,completeness,detailCodeWarning,edgeAmounts,edgeIncompatibility,edgePurchase,edgeTotals,editedGroups,equivalentRows,formatMetres,grainText,linkEdge,materialLabel,mergeNotice,plural,remapEdges,restoreProposal,rotationBlock,rowDimensions,rowNotes,rowThickness,rowWarnings,sameRows,type ApplyResult,type BlockField,type CopyGroups,type EdgeLink,type MergeStats,type ProposedEntry,type RowField,type CutProfile} from './workshopRules';
import MaderaProfilePanel,{BudgetView,UsableWarnings} from './MaderaProfilePanel';
import CatalogV2Tools,{ItemV2Tools,ThicknessOptions} from './CatalogV2Tools';
import {plain,thicknessMismatch,type Budget,type MaderaProfiles,type UsableWarning} from './maderaRules';
import {optimizeOrder} from './sheetOptimizer';
import SheetOptimizationView,{type CutSource} from './SheetOptimizationView';
import './workshop.css';

type Price={amount:number;currency:string;unit:string;date:string;source:string};
/** `approved` sigue en el JSON del catálogo por compatibilidad con 0.8.15; ya no filtra ni bloquea nada (0.8.16). */
export type CatalogItem={id:string;name:string;kind:string;sku:string;supplier:string;thicknessMm:number|null;widthMm:number|null;lengthMm:number|null;grain:boolean|null;compatibleIds:string[];price:Price|null;favorite:boolean;approved:boolean;updatedAt:string;sourceHash:string;observed:Record<string,unknown>;variantOf?:string|null;notes?:string;suggested?:{source:string;fields:string[];presetId:string|null}|null};
export type Catalog={schema:1|2;revision:number;items:CatalogItem[]};
type Library={catalog:Catalog;conflicts:string[][]};
/** Fila del pedido: solo datos. No hay tildes de revisión (0.8.16). */
export type OrderRow={id:string;include:boolean;excludeReason:string;detail:string;axes:[number,number]|null;flipX:boolean;flipY:boolean;frontSign:number|null;materialId:string;principalId:string|null;secondaryId:string|null;edgeMap:number[];grainPolicy:string|null;dimensionRule:string|null;cutBase:number|null;cutHeight:number|null;edgeBindings:{observedId:string;catalogId:string}[]};
export type Geometry={lengths:number[];bounds:{min:number[];max:number[]};scales:number[];mirrored:boolean;rectangular:boolean;vertices:number[][];triangles:number[][]};
export type OrderPlan={schema:1;fingerprint:string;catalogRevision:number;profile:{encoding:string;decimal:string;header:boolean};rows:OrderRow[];geometry:Record<string,Geometry>;edgeLinks?:EdgeLink[];detailCode?:'none'|'module_piece';codes?:Record<string,string>;maderera?:{id:string;version:number;contentHash:string}|null;proposed?:Record<string,ProposedEntry>};
type EdgeMaterial={observedId:string;name:string;native:boolean;catalogId:string|null;pieces:number};
type Proposal={rows:{id:string;detail:string;status:string;notes:string[]}[];edgeMaterials:EdgeMaterial[];summary:{proposed:number;abstained:number;withNotes:number}};
type Charge={amount:number|null;status:string;price:Price|null;materialId?:string;role?:'board'|'principal_edge'|'secondary_edge';quantity?:number;unit?:string};
type EstimateLine={id:string;detail:string;netAreaM2:number;boardAmount:number|null;status:string;charges?:Charge[]};
type Estimate={priceAgeDays?:number;totalsByCurrency:Record<string,number>;pending:number;outdated:number;outdatedTotalsByCurrency:Record<string,number>;lines:EstimateLine[];budget?:Budget|null;warnings?:UsableWarning[]};
type Blocked={id:string;detail:string;reason:string;reasons?:string[]};
/** Problemas en vivo del pedido guardado (punto 12): lo físico que bloquea, avisos de medida útil y, sin problemas, el costo neto. */
export type Audit={blocked:Blocked[];warnings:UsableWarning[];estimate?:Estimate;error?:string};
type PlanResult={plan:OrderPlan;catalog:Catalog;proposal:Proposal;audit:Audit;merge?:MergeStats|null;damagedDraft?:boolean};
type SaveResult={saved:boolean;changed:boolean;audit:Audit;plan?:OrderPlan;proposal?:Proposal;merge?:MergeStats|null};
const reasonsOf=(item:Blocked)=>item.reasons?.length?item.reasons:[item.reason];
const kinds:Record<string,string>={unknown:'Sin resolver',sheet:'Placa',edge:'Canto',solid_wood:'Madera maciza',dimensional:'Listón / perfil',veneer:'Lámina'};
const n=(value:string)=>value.trim()===''?null:Number(value);
const discardCatalog='Hay cambios de la biblioteca sin guardar. ¿Descartarlos?';
const discardOrder='No se pudieron guardar los últimos cambios del pedido. ¿Salir igualmente y perderlos?';
/** Espera antes de guardar el pedido después de un cambio (punto 11: autoguardado). */
export const AUTOSAVE_MS=600;
const decimal=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),area=new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3});
/** Importe en formato argentino (1.234,50) precedido por el código de moneda cargado en la biblioteca. */
export const money=(currency:string,value:number)=>`${currency} ${decimal.format(value)}`;
const totals=(values:Record<string,number>)=>Object.entries(values).map(([currency,value])=>money(currency,value)).join(' · ');
function lineState(line:EstimateLine){const statuses=line.charges?.map(c=>c.status)||[];if(line.boardAmount===null||statuses.includes('price_pending'))return 'pending';return statuses.some(s=>s==='stale_price'||s==='future_price')?'outdated':'current';}
/** Siempre con código de moneda; sin desglose no se sabe la moneda y queda pendiente. */
function lineAmount(line:EstimateLine){if(!line.charges?.length)return 'Pendiente';if(line.charges.some(c=>c.amount===null))return 'Pendiente';const sums:Record<string,number>={};for(const c of line.charges){const key=c.price?.currency||'';sums[key]=(sums[key]||0)+(c.amount||0);}return totals(sums);}
const lineLabels:Record<string,string>={pending:'Precio pendiente',outdated:'Precio desactualizado',current:'Vigente'};
const orientationKeys=['axes','frontSign','flipX','flipY'] as const;
/** Mismos valores sugeridos que MaderaProfile.template (Ruby) por si los perfiles no se pueden leer. */
const SUGGESTED={trimMm:10,kerfMm:3,dimensionRule:'finished',wastePercent:null as number|null};
type CutSettings=NonNullable<CutProfile>&{wastePercent:number|null;source:CutSource};

export default function WorkshopPanel({onClose,initialTab='catalog',onDirtyChange,embedded=false,initialCatalogId}:{onClose:()=>void;initialTab?:'catalog'|'order';onDirtyChange?:(dirty:boolean)=>void;embedded?:boolean;initialCatalogId?:string}){
 const [tab,setTab]=useState<string>(initialTab),[busy,setBusy]=useState(false),[activity,setActivity]=useState({label:'',action:''}),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [library,setLibrary]=useState<Library>(),[selectedId,setSelectedId]=useState(initialCatalogId||''),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[creating,setCreating]=useState<string|null>(null),[createError,setCreateError]=useState('');
 const [plan,setPlanState]=useState<OrderPlan>(),[rowId,setRowId]=useState(''),[audit,setAudit]=useState<Audit>(),[proposal,setProposal]=useState<Proposal>(),[saving,setSaving]=useState(false),[orderDirty,setOrderDirty]=useState(false);
 const [profiles,setProfiles]=useState<MaderaProfiles|null>(null),[detailOpen,setDetailOpen]=useState(false);
 const [copy,setCopy]=useState<CopyGroups>({material:true,edges:true,grain:true,dimensions:true}),[skip,setSkip]=useState<{rowId:string;ids:string[]}>({rowId:'',ids:[]}),[extra,setExtra]=useState<{rowId:string;ids:string[]}>({rowId:'',ids:[]});
 const dialog=useRef<HTMLElement>(null),orderForm=useRef<HTMLDivElement>(null),problemsRef=useRef<HTMLElement>(null),newButton=useRef<HTMLButtonElement>(null),adding=useRef(false),restoreFocus=useRef<HTMLElement|null>(null);
 // Autosave bookkeeping: every local edit bumps `version`; a save only marks clean the version it sent.
 const planRef=useRef<OrderPlan|undefined>(undefined),version=useRef(0),savedVersion=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),inFlight=useRef<Promise<SaveResult|undefined>|null>(null);
 const setPlan=useCallback((next:OrderPlan|undefined)=>{planRef.current=next;setPlanState(next);},[]);
 const mark=useCallback((value:boolean)=>{setDirty(value);onDirtyChange?.(value);void request('workshop_dirty',{value}).catch(()=>{});},[onDirtyChange]);
 // Only transitions reach the app and Ruby (Ruby blocks painting while the order has unsaved edits).
 const orderDirtyRef=useRef(false);
 const markOrder=useCallback((value:boolean)=>{if(orderDirtyRef.current===value)return;orderDirtyRef.current=value;setOrderDirty(value);onDirtyChange?.(value);void request('workshop_dirty',{value}).catch(()=>{});},[onDirtyChange]);
 // Each process names itself in the status line and on the button that started it.
 const run=useCallback(async(operation:()=>Promise<void>,label='Procesando…',action='')=>{setBusy(true);setActivity({label,action});setError('');setNotice('');try{await operation();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);setActivity({label:'',action:''});}},[]);
 const load=useCallback(async()=>{setLibrary(await request<Library>('catalog_load'));},[]);
 const applyPlanResult=useCallback((result:PlanResult)=>{setPlan(result.plan);setLibrary({catalog:result.catalog,conflicts:[]});setAudit(result.audit);setProposal(result.proposal);setSkip({rowId:'',ids:[]});setExtra({rowId:'',ids:[]});
  version.current=0;savedVersion.current=0;markOrder(false);
  const summary=result.proposal.summary;
  setNotice(result.damagedDraft?'El pedido guardado en el modelo estaba dañado y no se pudo leer: se propuso de nuevo desde el modelo.':mergeNotice(result.merge)||`Pedido propuesto desde el modelo: ${plural(result.plan.rows.length,'pieza','piezas')}${summary.withNotes?`, ${plural(summary.withNotes,'con avisos','con avisos')}`:''}. Los cambios se guardan solos.`);},[setPlan,markOrder]);
 // Refilado, kerf y regla del perfil en uso para optimizar en vivo; si no se pueden leer, quedan los sugeridos.
 const loadProfiles=useCallback(()=>{void request<MaderaProfiles>('maderera_profiles_load').then(setProfiles,()=>setProfiles(null));},[]);
 const loadOrder=useCallback(async()=>{applyPlanResult(await request<PlanResult>('order_plan'));loadProfiles();},[applyPlanResult,loadProfiles]);
 useEffect(()=>{void run(initialTab==='order'?loadOrder:load,initialTab==='order'?'Proponiendo el pedido desde el modelo…':'Cargando biblioteca…');},[run,load,loadOrder,initialTab]);
 /** Guarda ya lo pendiente del pedido (o fuerza un guardado para cruzarlo con el modelo). Devuelve lo que respondió Ruby. */
 const flush=useCallback(async(force=false):Promise<SaveResult|undefined>=>{
  if(timer.current){clearTimeout(timer.current);timer.current=undefined;}
  while(inFlight.current)await inFlight.current.catch(()=>undefined);
  const sent=planRef.current,v=version.current;
  if(!sent||(!force&&v===savedVersion.current))return undefined;
  const job=(async()=>{
   setSaving(true);
   try{
    const result=await request<SaveResult>('order_save',{plan:sent});
    setAudit(result.audit);
    if(version.current===v){
     if(result.changed&&result.plan){setPlan(result.plan);if(result.proposal)setProposal(result.proposal);const text=mergeNotice(result.merge);if(text)setNotice(text);}
     savedVersion.current=v;markOrder(false);
    }
    return result;
   }finally{setSaving(false);}
  })();
  inFlight.current=job;
  try{return await job;}catch(e){setError(`No se pudo guardar el pedido: ${e instanceof Error?e.message:String(e)}`);throw e;}finally{inFlight.current=null;}
 },[setPlan,markOrder]);
 const schedule=useCallback(()=>{version.current++;markOrder(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=undefined;void flush().catch(()=>{});},AUTOSAVE_MS);},[flush,markOrder]);
 // Closing the panel some other way (the app changes section) still saves what was pending: nothing is lost.
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(version.current!==savedVersion.current&&planRef.current)void request('order_save',{plan:planRef.current}).catch(()=>{});},[]);
 /** Antes de salir del pedido se guarda lo pendiente. Solo si eso falla se pregunta (ahí sí se perderían datos). */
 const settle=useCallback(async()=>{if(version.current===savedVersion.current)return true;try{await flush();}catch{return window.confirm(discardOrder);}return version.current===savedVersion.current||window.confirm(discardOrder);},[flush]);
 async function close(){if(busy)return;if(dirty&&!window.confirm(discardCatalog))return;if(!(await settle()))return;mark(false);markOrder(false);onClose();}
 const closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{if(embedded)return;function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();void closeRef.current();}if(e.key==='Tab'){
  const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')||[])];const first=items[0],last=items[items.length-1];
  if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!dialog.current?.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first)?.focus();}
 }}document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[embedded]);
 async function navigate(next:string){if(next===tab&&next==='maderera')return false;if(dirty&&!window.confirm(discardCatalog))return false;if(!(await settle()))return false;mark(false);markOrder(false);setTab(next);setError('');setNotice('');setCreating(null);if(next==='catalog')void run(load,'Cargando biblioteca…');if(next==='order')void run(loadOrder,'Proponiendo el pedido desde el modelo…');return true;}
 // Consultar la ficha no cuesta el pedido: lo pendiente se guarda solo antes de salir.
 function openInCatalog(id:string){void navigate('catalog').then(done=>{if(done)setSelectedId(id);});}
 useEffect(()=>{if(initialCatalogId)setSelectedId(initialCatalogId);},[initialCatalogId]);
 const selected=library?.catalog.items.find(item=>item.id===selectedId);
 function updateItem(patch:Partial<CatalogItem>){if(!library||!selected)return;setLibrary({...library,catalog:{...library.catalog,items:library.catalog.items.map(item=>item.id===selected.id?{...item,...patch,updatedAt:new Date().toISOString()}:item)}});mark(true);}
 const row=plan?.rows.find(item=>item.id===rowId)||plan?.rows[0],geometry=row&&plan?.geometry[row.id];
 function changePlan(next:OrderPlan){if(busy)return;setPlan(next);schedule();}
 function updatePlan(patch:Partial<OrderPlan>){if(!plan)return;changePlan({...plan,...patch});}
 function updateRow(patch:Partial<OrderRow>){
  if(!plan||!row||busy)return;
  // Cambiar ejes, cara o inversión no borra nada: cada canto sigue en su lado físico (puntos 1 y 2).
  if(geometry&&orientationKeys.some(key=>key in patch)&&!('edgeMap' in patch))patch={...patch,edgeMap:remapEdges(row,{...row,...patch},row.edgeMap,geometry.mirrored)};
  changePlan({...plan,rows:plan.rows.map(item=>item.id===row.id?{...item,...patch}:item)});
 }
 const edges=library?.catalog.items.filter(item=>item.kind==='edge')||[],sheets=library?.catalog.items.filter(item=>item.kind==='sheet')||[];
 const rows=library?.catalog.items.filter(item=>(!favorites||item.favorite)&&`${item.name} ${item.sku} ${item.supplier}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))||[];
 const focusIndex=Math.max(0,rows.findIndex(item=>item.id===selectedId));
 const saveLibrary=()=>library&&void run(async()=>{setLibrary(await request<Library>('catalog_save',{revision:library.catalog.revision,items:library.catalog.items}));mark(false);setNotice('Biblioteca guardada con respaldo de la versión anterior.');},'Guardando biblioteca…','catalog_save');
 const blockedItems=audit?.blocked||[],problemCount=blockedItems.reduce((sum,item)=>sum+reasonsOf(item).length,0);
 // Un solo botón: guarda lo pendiente, vuelve a leer el modelo, mira los problemas en vivo y recién ahí pide la carpeta.
 const exportTxt=()=>plan&&void run(async()=>{
  const saved=await flush();
  if(saved?.changed){setNotice(`${mergeNotice(saved.merge)||'El pedido se actualizó con el modelo.'} Revisalo y volvé a exportar.`);return;}
  const fresh=await request<PlanResult>('order_plan'),current=planRef.current;
  if(!current||!sameRows(fresh.plan.rows,current.rows)||fresh.plan.fingerprint!==current.fingerprint){applyPlanResult(fresh);version.current=1;await flush();setNotice('El modelo cambió desde que abriste el pedido (pintura, piezas o biblioteca): el pedido se actualizó y se guardó. Revisalo y volvé a exportar.');return;}
  setAudit(fresh.audit);const live=fresh.audit;
  if(live?.error)throw new Error(live.error);
  if(live?.blocked.length){requestAnimationFrame(()=>problemsRef.current?.focus());throw new Error(`No se exportó: ${plural(live.blocked.length,'pieza tiene','piezas tienen')} problemas que impiden el pedido. Están en la lista «Problemas del pedido».`);}
  const result=await request<{cancelled?:boolean;directory:string}>('order_export',{plan:planRef.current});
  setNotice(result.cancelled?'Exportación cancelada.':`TXT y manifiesto (manifest.json) guardados en ${result.directory}. Elegí material, espesor y cantos según el manifiesto en el portal de la maderera.`);
 },'Exportando TXT…','order_export');
 const highlight=(id:string)=>{restoreFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;void run(async()=>{await request('piece_highlight',{pieceId:id});setNotice(`Pieza resaltada en SketchUp. Volvé a esta ventana para seguir.${embedded?'':' El panel del pedido queda abierto.'}`);},'Resaltando en SketchUp…','order_highlight');};
 // The pressed button is disabled while busy; give focus back to it once it is enabled again.
 useEffect(()=>{if(busy||!restoreFocus.current)return;const target=restoreFocus.current;restoreFocus.current=null;if(target.isConnected&&(document.activeElement===document.body||!document.activeElement))target.focus();},[busy]);
 const anyEdited=!!plan&&plan.rows.some(item=>editedGroups(plan,item).length>0);
 // Volver a proponer reemplaza lo editado a mano: es el único caso del pedido en que se pierden datos, por eso se pregunta.
 const reset=()=>{if(anyEdited&&!window.confirm('Volver a proponer todo desde el modelo reemplaza los cambios que hiciste a mano en el pedido. ¿Continuar?'))return;
  void run(async()=>{if(timer.current){clearTimeout(timer.current);timer.current=undefined;}const result=await request<PlanResult>('order_plan',{reset:true});applyPlanResult(result);version.current=1;await flush();setNotice('Pedido propuesto de nuevo desde el modelo y guardado.');},'Proponiendo de nuevo…','order_reset');};
 function updateLink(material:EdgeMaterial,catalogId:string){if(!plan||busy)return;changePlan({...plan,edgeLinks:linkEdge(plan.edgeLinks,material.observedId,material.name.slice(0,200),catalogId)});setNotice(`Vínculo de ${material.name} ${catalogId?'actualizado':'quitado'}: las piezas pintadas con ese material se vuelven a proponer solas.`);}
 // Lands on the field the first problem refers to (data-field), or on the first control.
 function goTo(id:string,field?:BlockField|null){setRowId(id);setDetailOpen(true);requestAnimationFrame(()=>{const form=orderForm.current,controls='input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])';const scope=field?form?.querySelector(`[data-field="${field}"]`)||dialog.current?.querySelector(`[data-field="${field}"]`):null;(scope&&!form?.contains(scope)?scope:form)?.scrollIntoView({block:'start'});
  (scope?.querySelector<HTMLElement>(controls)||form?.querySelector<HTMLElement>(controls))?.focus({preventScroll:true});});}
 const blockedIds=new Set(blockedItems.map(item=>item.id));
 function nextBlocked(){
  if(!plan||!blockedItems.length){setNotice('No hay piezas con problemas.');return;}
  const start=row?plan.rows.indexOf(row):-1,count=plan.rows.length;
  for(let i=1;i<=count;i++){const next=plan.rows[(start+i+count)%count];if(blockedIds.has(next.id)){setDetailOpen(true);const item=blockedItems.find(b=>b.id===next.id)!,first=reasonsOf(item)[0];goTo(next.id,blockedField(first));setNotice(`Con problemas · ${next.detail||next.id}: ${first}`);return;}}
 }
 function step(offset:number){if(!plan?.rows.length||!row)return;const start=plan.rows.indexOf(row),count=plan.rows.length,next=plan.rows[(start+offset+count)%count];setRowId(next.id);setDetailOpen(true);setNotice(`Pieza ${next.detail||next.id}${blockedIds.has(next.id)?' · con problemas':''}.`);}
 function shortcuts(e:ReactKeyboardEvent){
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();if(busy)return;if(tab==='catalog'){if(dirty)saveLibrary();else setNotice('No hay cambios para guardar en la biblioteca.');}else if(tab==='order')void flush().then(()=>setNotice('Pedido guardado en el modelo. Guardá el SKP para conservarlo al cerrar.')).catch(()=>{});return;}
  if(tab==='order'&&plan&&e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();nextBlocked();return;}
  if(tab==='order'&&plan&&e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();e.stopPropagation();step(e.key==='ArrowDown'?1:-1);}
 }
 function listKeys(e:ReactKeyboardEvent<HTMLDivElement>){
  const index={ArrowDown:focusIndex+1,ArrowUp:focusIndex-1,Home:0,End:rows.length-1}[e.key];if(index===undefined||!rows.length)return;e.preventDefault();
  const next=Math.min(rows.length-1,Math.max(0,index));setSelectedId(rows[next].id);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
 }
 function cancelCreate(){setCreating(null);setCreateError('');requestAnimationFrame(()=>newButton.current?.focus());}
 function create(){
  if(!library||creating===null||busy||adding.current)return;const name=creating.trim();
  if(!name){setCreateError('Escribí un nombre para el material.');return;}
  if(library.catalog.items.some(item=>item.name.trim().toLocaleLowerCase('es')===name.toLocaleLowerCase('es'))){setCreateError('Ya existe un material con ese nombre en la biblioteca.');return;}
  adding.current=true;void run(async()=>{const next=await request<Library>('catalog_add',{revision:library.catalog.revision,item:{name,kind:'unknown'}});const added=next.catalog.items.find(item=>!library.catalog.items.some(old=>old.id===item.id));setLibrary(next);if(added)setSelectedId(added.id);setCreating(null);setCreateError('');setNotice(`Material «${name}» creado. Completá tipo y datos de su ficha.`);},'Creando material…','catalog_add').finally(()=>{adding.current=false;});
 }
 const label=(action:string,text:string)=>activity.action===action?activity.label:text;
 // A library change from the order (thickness variant) is crossed with the order on the next save.
 const libraryChanged=(next:Library,id:string|undefined,text:string)=>{setLibrary(next);if(id&&tab==='catalog')setSelectedId(id);setNotice(text);if(tab==='order')void flush(true).catch(()=>{});};
 const excluded=plan?.rows.filter(item=>!item.include).length||0,included=(plan?.rows.length||0)-excluded,ready=plan?plan.rows.filter(item=>item.include&&!blockedIds.has(item.id)).length:0;
 const status=busy?activity.label||'Procesando…':notice;
 const catalogData=library?.catalog,board=row&&catalogData?boardOf(row,catalogData):undefined,thickness=row&&geometry?rowThickness(row,geometry):null;
 const warnings=row&&geometry&&catalogData?rowWarnings(row,geometry,catalogData):{};
 // aria-describedby/aria-invalid for a field with live warnings, plus the warning text itself.
 const warn=(field:RowField)=>warnings[field]?.length?{'aria-invalid':true as const,'aria-describedby':`workshop-warn-${field}`}:{};
 const warning=(field:RowField,action?:ReactNode)=>warnings[field]?.length?<small className="workshop-field-error" id={`workshop-warn-${field}`}>{warnings[field]!.join(' ')}{action}</small>:null;
 const edgeOptions=(current:string|null)=>{const graded=edges.map(edge=>({edge,missing:catalogMissing(edge),reason:edgeIncompatibility(edge,board,thickness)}));const ok=graded.filter(g=>!g.missing.length&&!g.reason),narrow=graded.filter(g=>!g.missing.length&&g.reason),incomplete=graded.filter(g=>g.missing.length);
  return <>{ok.map(({edge})=><option key={edge.id} value={edge.id}>{materialLabel(edge)}</option>)}{!!narrow.length&&<optgroup label="Más angostos que el espesor de la pieza">{narrow.map(({edge,reason})=><option key={edge.id} value={edge.id}>{materialLabel(edge)} · {reason}</option>)}</optgroup>}{!!incomplete.length&&<optgroup label="Fichas incompletas">{incomplete.map(({edge,missing})=><option key={edge.id} value={edge.id}>{materialLabel(edge)} · falta {missing.join(', ')}</option>)}</optgroup>}{current&&!edges.some(e=>e.id===current)&&<option value={current}>Canto eliminado de la biblioteca</option>}</>;};
 const libraryLink=(id:string|null|undefined)=>{const item=library?.catalog.items.find(entry=>entry.id===id);if(!item||catalogComplete(item))return null;
  return <button type="button" className="workshop-link workshop-field-action" disabled={busy} onClick={()=>openInCatalog(item.id)}>Completar la ficha de {item.name}</button>;};
 const rotation=row?rotationBlock(row,board):null;
 const equivalents=plan&&row?equivalentRows(plan,row):[],skipped=skip.rowId===row?.id?skip.ids:[],others=plan&&row?plan.rows.filter(item=>item.id!==row.id&&!equivalents.includes(item)):[],chosen=extra.rowId===row?.id?extra.ids:[];
 const targets=[...equivalents.filter(item=>!skipped.includes(item.id)).map(item=>item.id),...others.filter(item=>chosen.includes(item.id)).map(item=>item.id)];
 function applyCopies(){
  if(!plan||!row||!targets.length)return;const ids=targets,source=row.id;
  void run(async()=>{await flush();const result=await request<ApplyResult&{plan:OrderPlan}>('order_apply',{plan:planRef.current,sourceId:source,targetIds:ids,groups:copy});setPlan(result.plan);schedule();setNotice(applySummary(result));},'Aplicando a las piezas elegidas…','order_apply');
 }
 const code=row?plan?.codes?.[row.id]:undefined,codeMode=plan?.detailCode??'none',codeWarning=row?detailCodeWarning(row.detail,code,codeMode):null,missingCodes=plan?.rows.filter(item=>item.include&&plan.codes?.[item.id]===undefined).length||0,repeatedCodes=plan?.rows.filter(item=>item.include&&plan.codes?.[item.id]==='').length||0;
 const unlinked=proposal?.edgeMaterials.filter(material=>!material.native)||[];
 const notes=plan&&row?[...rowNotes(plan,row,'orientation'),...rowNotes(plan,row,'material')]:[],edited=plan&&row?editedGroups(plan,row):[];
 const saveState=saving?'Guardando…':orderDirty?'Cambios por guardar…':'Guardado en el modelo';
 // El presupuesto de Ruby trae el perfil con que se revisó; si no hay, el perfil en uso del pedido; si no, los sugeridos.
 const budgetProfile=audit?.estimate?.budget?.profile,boundId=plan?.maderera?.id,bound=boundId?profiles?.profiles.profiles.find(p=>p.id===boundId):undefined,template=profiles?.template;
 const cut:CutSettings=budgetProfile?{trimMm:budgetProfile.trimMm,kerfMm:budgetProfile.kerfMm,dimensionRule:budgetProfile.dimensionRule,wastePercent:budgetProfile.wastePercent,source:{kind:'profile',name:budgetProfile.name,version:budgetProfile.version}}
  :bound&&bound.trimMm!==null&&bound.kerfMm!==null?{trimMm:bound.trimMm,kerfMm:bound.kerfMm,dimensionRule:bound.dimensionRule,wastePercent:bound.wastePercent,source:{kind:'profile',name:bound.name,version:bound.version}}
  :{...SUGGESTED,trimMm:template?.trimMm??SUGGESTED.trimMm,kerfMm:template?.kerfMm??SUGGESTED.kerfMm,source:{kind:'suggested'}};
 const {trimMm,kerfMm,dimensionRule}=cut,optimization=useMemo(()=>tab==='order'&&plan&&library?optimizeOrder(plan,library.catalog,{trimMm,kerfMm,dimensionRule}):undefined,[tab,plan,library,trimMm,kerfMm,dimensionRule]);
 return <div className={embedded?"ux-workshop-embedded":"material-review-backdrop"}><section ref={dialog} className="material-review workshop-panel" role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-labelledby="workshop-title" onKeyDown={shortcuts}>
  <header><div><h2 id="workshop-title">Biblioteca y pedidos</h2><p>Datos del taller reutilizables entre modelos · {tab==='order'?saveState:dirty?'Cambios sin guardar':'Sin cambios pendientes'}</p></div><button autoFocus={!embedded} disabled={busy} onClick={()=>void close()}>{embedded?'Volver al inicio':'Cerrar biblioteca y pedidos'}</button></header>
  <div className="workshop-body"><nav aria-label="Secciones del taller" className="material-review-actions">{[['catalog','Biblioteca'],['order','Pedido maderera'],['maderera','Perfil de maderera'],['advanced','Optimización y presupuesto']].map(([id,text])=><button key={id} disabled={busy} aria-pressed={tab===id} onClick={()=>void navigate(id)}>{text}</button>)}</nav>
  <p role="status" aria-live="polite" className={`workshop-live${busy?' workshop-busy':''}`}>{status}</p>{error&&<div className="workshop-error-row"><p role="alert" className="workshop-error">{error}</p></div>}
  {tab==='catalog'&&!library&&<Loading busy={busy||!error} text="Cargando la biblioteca del taller…" retry={()=>void run(load,'Cargando biblioteca…')}/>}
  {tab==='catalog'&&library&&<>
   <p>Una placa sirve para pedidos cuando su ficha tiene SKU, espesor, largo, ancho y veta; un canto, cuando tiene ancho. Un precio vacío significa pendiente; guardar acá no pinta ni cambia materiales del SKP.</p>
   <div className="material-review-actions">{creating===null?<button ref={newButton} disabled={busy||dirty} onClick={()=>{setCreating('');setCreateError('');}}>Nuevo material</button>:
    <div className="workshop-inline-create" role="group" aria-label="Crear material nuevo"><label>Nombre del material nuevo<input autoFocus value={creating} maxLength={120} readOnly={busy} aria-disabled={busy||undefined} aria-invalid={!!createError} aria-describedby={createError?'workshop-create-error':undefined} onChange={e=>{setCreating(e.target.value);setCreateError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();create();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelCreate();}}}/></label><button className="workshop-primary" disabled={busy} onClick={create}>{label('catalog_add','Crear')}</button><button disabled={busy} onClick={cancelCreate}>Cancelar</button>{createError&&<p id="workshop-create-error" className="workshop-field-error">{createError}</p>}</div>}
    <button disabled={busy||dirty} onClick={()=>void run(async()=>{const result=await request<Library&{cancelled?:boolean}>('catalog_import',{revision:library.catalog.revision});if(!result.cancelled){setLibrary(result);setNotice('Candidatos importados. Completá las fichas a las que les falten datos y revisá los nombres repetidos.');}},'Importando candidatos…','catalog_import')}>{label('catalog_import','Importar JSON…')}</button>
    <button disabled={busy||dirty} onClick={()=>void run(async()=>{setLibrary(await request<Library>('catalog_import_model',{revision:library.catalog.revision}));setNotice('Materiales del modelo incorporados con las medidas que se pudieron leer.');},'Trayendo materiales del modelo…','catalog_import_model')}>{label('catalog_import_model','Traer materiales del modelo')}</button>
    <button disabled={busy||dirty} onClick={()=>void run(async()=>{const result=await request<{cancelled?:boolean}>('catalog_export');setNotice(result.cancelled?'Exportación cancelada.':'Copia de biblioteca exportada.');},'Exportando copia…','catalog_export')}>{label('catalog_export','Exportar copia…')}</button>
    <button className="workshop-primary" disabled={busy||!dirty} aria-keyshortcuts="Control+S Meta+S" onClick={saveLibrary}>{label('catalog_save','Guardar biblioteca')}<kbd aria-hidden="true">Ctrl+S</kbd></button></div>
   <CatalogV2Tools catalog={library.catalog} busy={busy} disabled={dirty} run={run} onChanged={libraryChanged}/>
   {dirty&&<p className="workshop-hint">Guardá la biblioteca (Ctrl+S) para crear, importar o exportar materiales.</p>}
   {!!library.conflicts.length&&<p className="warning">{library.conflicts.length} nombres repetidos con datos distintos. Se mantienen separados; conciliá manualmente sus SKU/proveedores.</p>}
   <div className="material-review-filters"><label>Buscar en biblioteca<input aria-label="Buscar en biblioteca" value={query} onChange={e=>setQuery(e.target.value)}/></label><label><input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.target.checked)}/> Solo favoritos</label></div>
   <div className="workshop-columns"><div className="workshop-list" role="group" aria-label="Materiales de biblioteca" aria-describedby="workshop-list-help" onKeyDown={listKeys}><p id="workshop-list-help" className="workshop-sr-only">Usá las flechas arriba y abajo para recorrer los materiales.</p>{rows.map((item,i)=><button key={item.id} tabIndex={i===focusIndex?0:-1} aria-pressed={selectedId===item.id} onClick={()=>setSelectedId(item.id)}>{item.favorite?'★ ':''}{item.name}{!catalogComplete(item)&&<span className="workshop-badge">Incompleta</span>}<small>{kinds[item.kind]} · {item.sku||'Sin SKU'}</small></button>)}{!rows.length&&<p>Biblioteca vacía o sin coincidencias. Importá candidatos o creá un material.</p>}</div>
    {selected&&<div className="workshop-form"><h3>Ficha de material</h3>
     <p className={catalogComplete(selected)?'workshop-hint workshop-complete':'warning workshop-incomplete'} id="workshop-item-complete" aria-live="polite">{catalogComplete(selected)?'Ficha completa: se puede usar en pedidos.':`${completeness(selected)}. Mientras falte, la ficha no se puede usar en un pedido.`}</p>
     <label>Nombre<input aria-label="Nombre de material de biblioteca" value={selected.name} onChange={e=>updateItem({name:e.target.value})}/></label>
     <label>Tipo<select aria-label="Tipo de material de biblioteca" value={selected.kind} onChange={e=>updateItem({kind:e.target.value})}>{Object.entries(kinds).map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>
     <label>SKU<input aria-label="SKU de biblioteca" value={selected.sku} onChange={e=>updateItem({sku:e.target.value})}/></label><label>Proveedor<input aria-label="Proveedor de biblioteca" value={selected.supplier} onChange={e=>updateItem({supplier:e.target.value})}/></label>
     {(['thicknessMm','widthMm','lengthMm'] as const).map((key,i)=><label key={key}>{['Espesor mm','Ancho mm','Largo mm'][i]}<input aria-label={['Espesor de biblioteca','Ancho de biblioteca','Largo de biblioteca'][i]} type="number" min="0.001" step="any" value={selected[key]??''} onChange={e=>updateItem({[key]:n(e.target.value)})}/></label>)}
     <label>Veta<select aria-label="Veta de biblioteca" value={selected.grain===null?'':String(selected.grain)} onChange={e=>updateItem({grain:e.target.value===''?null:e.target.value==='true'})}><option value="">Sin definir</option><option value="true">Con veta</option><option value="false">Sin veta</option></select></label>
     <label><input type="checkbox" checked={selected.favorite} onChange={e=>updateItem({favorite:e.target.checked})}/> Favorito</label>
     <ItemV2Tools key={selected.id} item={selected} catalog={library.catalog} busy={busy} disabled={dirty} run={run} onChanged={libraryChanged}/>
     <label><input type="checkbox" checked={!!selected.price} onChange={e=>updateItem({price:e.target.checked?{amount:0,currency:'ARS',unit:selected.kind==='edge'?'metro':'m2',date:new Date().toISOString().slice(0,10),source:''}:null})}/> Cargar precio opcional</label>
     {selected.price&&<fieldset><legend>Precio documentado</legend><label>Importe<input type="number" step="any" value={selected.price.amount} onChange={e=>updateItem({price:{...selected.price!,amount:Number(e.target.value)}})}/></label><label>Moneda<input value={selected.price.currency} onChange={e=>updateItem({price:{...selected.price!,currency:e.target.value}})}/></label><label>Unidad<select value={selected.price.unit} onChange={e=>updateItem({price:{...selected.price!,unit:e.target.value}})}><option value="m2">m² neto</option><option value="placa">Placa</option><option value="metro">Metro de canto</option></select></label><label>Fecha<input type="date" value={selected.price.date} onChange={e=>updateItem({price:{...selected.price!,date:e.target.value}})}/></label><label>Fuente del precio<input value={selected.price.source} onChange={e=>updateItem({price:{...selected.price!,source:e.target.value}})}/></label></fieldset>}
     <details><summary>Procedencia y datos sin interpretar</summary><pre>{JSON.stringify(selected.observed,null,2)}</pre></details>
    </div>}
   </div>
  </>}
  {tab==='order'&&!(plan&&library)&&<Loading busy={busy||!error} text="Proponiendo el pedido desde el modelo…" retry={()=>void run(loadOrder,'Proponiendo el pedido desde el modelo…')}/>}
  {tab==='order'&&plan&&library&&<>
   <p>El pedido se propone solo desde lo pintado en el modelo y los cambios se guardan solos. Acá ves lo que importa para la maderera: placas optimizadas, total de cantos y problemas; el detalle pieza por pieza queda plegado al final. Solo frenan la exportación los problemas físicos de cada pieza. Los TXT son pruebas para validar con la maderera.</p>
   <div className="workshop-order-actions"><div role="group" aria-label="Pedido" className="workshop-primary-actions"><button className="workshop-primary" disabled={busy} aria-busy={activity.action==='order_export'||undefined} aria-describedby="workshop-problems-summary" onClick={exportTxt}>{label('order_export','Exportar TXT…')}</button></div>
    <div role="group" aria-label="Otras acciones del pedido" className="workshop-secondary-actions"><span className="workshop-save-state" aria-live="polite">{saveState}</span><button disabled={busy} onClick={reset}>{label('order_reset','Volver a proponer todo desde el modelo')}</button></div></div>
   <section ref={problemsRef} tabIndex={-1} className="workshop-blocked" aria-labelledby="workshop-blocked-title"><div className="workshop-blocked-head"><h3 id="workshop-blocked-title">Problemas del pedido</h3>{!!blockedItems.length&&<button disabled={busy} aria-keyshortcuts="Alt+Shift+ArrowDown" onClick={nextBlocked}>Siguiente con problemas<kbd aria-hidden="true">Alt+Shift+↓</kbd></button>}</div>
    <p id="workshop-problems-summary" className={blockedItems.length||audit?.error?'warning':'workshop-hint'}>{audit?.error?audit.error:blockedItems.length?`${plural(blockedItems.length,'pieza',`piezas`)} con ${plural(problemCount,'problema','problemas')} que ${problemCount===1?'impide':'impiden'} exportar.`:'Sin problemas físicos: el pedido se puede exportar.'}{saving||orderDirty?' Actualizando…':''}</p>
    {!!blockedItems.length&&<ul aria-label="Piezas con problemas">{blockedItems.map(item=>{const reasons=reasonsOf(item);return <li key={item.id}><div><strong>{item.detail||'Sin detalle'} · {item.id}</strong><ul className="workshop-reasons" aria-label={`Problemas de ${item.detail||item.id}`}>{reasons.map(reason=><li key={reason} className="workshop-reason">{reason}</li>)}</ul></div><div className="workshop-blocked-actions"><button aria-label={`Ir a la pieza ${item.detail} · ${item.id}`} onClick={()=>goTo(item.id,blockedField(reasons[0]))}>Ir a la pieza</button><button disabled={busy} aria-label={`Ver en el modelo ${item.detail} · ${item.id}`} onClick={()=>highlight(item.id)}>Ver en el modelo</button></div></li>;})}</ul>}</section>
   {!!unlinked.length&&<section className="workshop-proposal workshop-links" data-field="links" aria-labelledby="workshop-links-title"><h3 id="workshop-links-title">Cantos pintados sin vínculo</h3>
    <p className="workshop-hint">Los cantos pintados con un material de la biblioteca se reconocen solos. Estos materiales del modelo no tienen ese vínculo: elegí a qué canto de la biblioteca corresponden y las piezas se vuelven a proponer solas.</p>
    <div className="material-review-table"><table className="workshop-estimate-table"><caption className="workshop-sr-only">Cantos pintados sin vínculo</caption><thead><tr><th scope="col">Material del modelo</th><th scope="col" className="workshop-num">Piezas</th><th scope="col">Canto de biblioteca</th></tr></thead><tbody>{unlinked.map(material=>{const linked=plan.edgeLinks?.find(link=>link.observedId===material.observedId)?.catalogId||'';
     return <tr key={material.observedId}><th scope="row">{material.name}<small>{material.observedId}</small></th><td className="workshop-num">{material.pieces}</td><td><select aria-label={`Canto de biblioteca para ${material.name}`} disabled={busy} value={linked} onChange={e=>updateLink(material,e.target.value)}><option value="">Sin vínculo</option>{edges.map(edge=><option key={edge.id} value={edge.id}>{materialLabel(edge)}{catalogComplete(edge)?'':' · ficha incompleta'}</option>)}{linked&&!edges.some(edge=>edge.id===linked)&&<option value={linked}>Canto eliminado de la biblioteca</option>}</select></td></tr>;})}</tbody></table></div></section>}
   {optimization&&<SheetOptimizationView result={optimization} source={cut.source} today={new Date()} ageDays={audit?.estimate?.priceAgeDays??90}/>}
   <EdgeTotalsView plan={plan} catalog={library.catalog} estimate={audit?.estimate} stale={saving||orderDirty} profile={cut}/>
   {audit?.estimate&&<BudgetView budget={audit.estimate.budget} materials={optimization?.materials} stale={saving||orderDirty} busy={busy} recheck={()=>void flush(true).catch(()=>{})} openProfiles={()=>void navigate('maderera')}/>}
   <UsableWarnings items={audit?.warnings} goTo={id=>goTo(id,'dimensions')}/>
   {/* 0.8.19: el detalle por pieza sigue disponible para editar, plegado y cerrado al abrir el pedido. «Ir a la pieza» lo abre. */}
   <details className="workshop-piece-detail" open={detailOpen} onToggle={e=>setDetailOpen(e.currentTarget.open)}><summary>Ver detalle por pieza · {plural(plan.rows.length,'pieza','piezas')}{blockedItems.length?` · ${plural(blockedItems.length,'con problemas','con problemas')}`:''}</summary>
   <div className="material-review-filters workshop-piece-nav"><p id="workshop-progress" className="workshop-progress"><strong>{ready} de {included} piezas listas</strong>{blockedItems.length?` · ${plural(blockedItems.length,'con problemas','con problemas')}`:''}{excluded?` · ${plural(excluded,'excluida','excluidas')}`:''}</p>
    <label>Pieza del pedido<select aria-label="Pieza del pedido" aria-describedby="workshop-progress" value={row?.id||''} onChange={e=>setRowId(e.target.value)}>{plan.rows.map(item=><option key={item.id} value={item.id}>{!item.include?'Excluida':blockedIds.has(item.id)?'Con problemas':'Lista'} · {item.detail} · {item.id}</option>)}</select></label>
    <div className="workshop-nav-buttons"><button disabled={busy||plan.rows.length<2} aria-keyshortcuts="Alt+ArrowUp" onClick={()=>step(-1)}>Pieza anterior<kbd aria-hidden="true">Alt+↑</kbd></button><button disabled={busy||plan.rows.length<2} aria-keyshortcuts="Alt+ArrowDown" onClick={()=>step(1)}>Pieza siguiente<kbd aria-hidden="true">Alt+↓</kbd></button></div></div>
   {row&&geometry&&<div className="workshop-columns workshop-order-columns"><div><div className="workshop-2d-head"><h3>Vista 2D de la pieza</h3><button disabled={busy} aria-label={`Ver en el modelo ${row.detail} · ${row.id}`} onClick={()=>highlight(row.id)}>Ver en el modelo</button></div>{geometry.mirrored&&<p className="workshop-hint">La instancia está espejada en el modelo.</p>}{!geometry.rectangular&&<p className="warning">Pieza no rectangular: no se puede pedir como placa rectangular. Excluila o corregila en el modelo.</p>}
     {row.axes?<Piece2D geometry={geometry} row={row} catalog={library.catalog}/>:<p>Elegí los ejes de base y altura y la cara para mostrar la vista real de la pieza.</p>}
     <p>Las medidas corresponden a los ejes locales escalados: {geometry.lengths.map(mm).join(' × ')} mm.</p>
    </div><div className="workshop-form" ref={orderForm} aria-busy={busy||undefined}>
     <label data-field="include"><input type="checkbox" checked={row.include} onChange={e=>updateRow({include:e.target.checked})}/> Incluir pieza física en el pedido</label>
     {!row.include?<label data-field="exclude">Nota de exclusión (opcional)<input value={row.excludeReason} maxLength={160} onChange={e=>updateRow({excludeReason:e.target.value})}/></label>:<>
      {!!notes.length&&<ul className="workshop-reasons workshop-notes" aria-label="Avisos de la propuesta del modelo">{notes.map(text=><li key={text} className="workshop-reason">{text}</li>)}</ul>}
      <label data-field="detail">Detalle<input aria-label="Detalle del pedido" value={row.detail} maxLength={80} aria-invalid={codeWarning||warnings.detail?true:undefined} aria-describedby="workshop-detail-code" onChange={e=>updateRow({detail:e.target.value})}/><small id="workshop-detail-code" aria-live="polite" className={codeWarning||warnings.detail?'workshop-field-error':'workshop-hint'}>{codeWarning||warnings.detail?.join(' ')||(code?(codeMode==='module_piece'?`Código ${code}: en el TXT queda «${code} ${row.detail}».`:`Código ${code}: no se agrega al detalle (activalo en el perfil del archivo).`):'')}</small></label>
      <label data-field="axes">Ejes de base / altura<select aria-label="Ejes de base / altura de la vista 2D" value={row.axes?.join(',')||''} onChange={e=>updateRow({axes:e.target.value?e.target.value.split(',').map(Number) as [number,number]:null})}>{!row.axes&&<option value="">Elegir ejes</option>}{[[0,1],[1,0],[0,2],[2,0],[1,2],[2,1]].map(pair=><option key={pair.join(',')} value={pair.join(',')}>{'XYZ'[pair[0]]} / {'XYZ'[pair[1]]}</option>)}</select></label>
      <label>Cara mostrada<select aria-label="Cara mostrada de la vista 2D" value={row.frontSign??''} onChange={e=>updateRow({frontSign:e.target.value?Number(e.target.value):null})}>{row.frontSign===null&&<option value="">Elegir cara</option>}<option value="1">Positiva del eje de espesor</option><option value="-1">Negativa del eje de espesor</option></select></label>
      <label><input type="checkbox" checked={row.flipX} onChange={e=>updateRow({flipX:e.target.checked})}/> Invertir horizontal</label><label><input type="checkbox" checked={row.flipY} onChange={e=>updateRow({flipY:e.target.checked})}/> Invertir vertical</label>
      <label data-field="material">Placa<select aria-label="Placa del pedido" {...warn('material')} value={row.materialId} onChange={e=>updateRow({materialId:e.target.value})}><option value="">Elegir placa</option>{sheets.filter(catalogComplete).map(item=><option key={item.id} value={item.id}>{materialLabel(item)}</option>)}{sheets.some(item=>!catalogComplete(item))&&<optgroup label="Fichas incompletas">{sheets.filter(item=>!catalogComplete(item)).map(item=><option key={item.id} value={item.id}>{materialLabel(item)} · falta {catalogMissing(item).join(', ')}</option>)}</optgroup>}{row.materialId&&!sheets.some(item=>item.id===row.materialId)&&<option value={row.materialId}>Placa eliminada de la biblioteca</option>}</select>{warning('material',libraryLink(row.materialId))}</label>
      {board&&thickness!==null&&thicknessMismatch(board,thickness)&&<ThicknessOptions board={board} thickness={thickness} catalog={library.catalog} busy={busy} run={run} onChanged={libraryChanged} onOtherBoard={()=>orderForm.current?.querySelector<HTMLElement>('[data-field="material"] select')?.focus()} onExclude={()=>{updateRow({include:false});setNotice('Pieza excluida del pedido.');goTo(row.id,'include');}}/>}
      {(['principalId','secondaryId'] as const).map((key,index)=><label key={key} data-field={index?'secondaryEdge':'edges'}>Canto {index?'secundario (2)':'principal (1)'}<select aria-label={index?'Canto secundario (2) del pedido':'Canto principal (1) del pedido'} {...warn(key)} value={row[key]||''} onChange={e=>updateRow({[key]:e.target.value||null})}><option value="">Sin canto asignado</option>{edgeOptions(row[key])}</select>{warning(key,libraryLink(row[key]))}</label>)}
      <fieldset aria-describedby={warnings.edgeMap?'workshop-warn-edgeMap':undefined}><legend>Cantos respecto de esta vista 2D</legend>{['Arriba','Abajo','Izquierda','Derecha'].map((side,index)=>{const lacking=row.edgeMap[index]>0&&!(row.edgeMap[index]===1?row.principalId:row.secondaryId);return <label key={side}>{side}<select aria-label={`${side} · canto del pedido`} aria-invalid={lacking||undefined} value={row.edgeMap[index]} onChange={e=>updateRow({edgeMap:row.edgeMap.map((v,i)=>i===index?Number(e.target.value):v)})}><option value="0">0 · Sin canto</option>{(['principalId','secondaryId'] as const).map((key,i)=>{const item=edges.find(edge=>edge.id===row[key]);return <option key={key} value={i+1} disabled={!row[key]}>{i+1} · {i?'Secundario':'Principal'} ({item?`${item.name} · ${item.sku.trim()||'Sin SKU'}`:'sin canto asignado'})</option>;})}</select></label>;})}{warning('edgeMap')}</fieldset>
      <EdgeReview plan={plan} row={row} disabled={busy} onChange={updateRow}/>
      <p data-field="grain" className="workshop-hint">Veta: {grainText(board,row)}</p>
      <label>Giro de la pieza<select aria-label="Veta / rotación del pedido" {...(warnings.grainPolicy?warn('grainPolicy'):rotation?{'aria-describedby':'workshop-rotation-help'}:{})} value={row.grainPolicy||'locked'} onChange={e=>updateRow({grainPolicy:e.target.value})}><option value="locked">Mantener orientación · rota 0</option><option value="rotate" disabled={!!rotation&&row.grainPolicy!=='rotate'}>Permitir giro · rota 1 (solo sin veta y cantos simétricos)</option></select>{warning('grainPolicy')||(rotation&&<small className="workshop-hint" id="workshop-rotation-help">Giro no disponible. {rotation}</small>)}</label>
      <label data-field="dimensions">Medidas que recibe la maderera<select aria-label="Medidas que recibe la maderera" {...warn('dimensions')} value={row.dimensionRule||'finished_accepted'} onChange={e=>updateRow({dimensionRule:e.target.value})}><option value="finished_accepted">Terminadas del modelo</option><option value="explicit_cut">Medidas de corte cargadas a mano</option></select>{warning('dimensions')}</label>
      {row.dimensionRule==='explicit_cut'&&<><label>Base de corte mm<input type="number" value={row.cutBase??''} onChange={e=>updateRow({cutBase:n(e.target.value)})}/></label><label>Altura de corte mm<input type="number" value={row.cutHeight??''} onChange={e=>updateRow({cutHeight:n(e.target.value)})}/></label></>}
      {!!edited.length&&<p className="workshop-hint">Cambiado a mano en esta pieza: {edited.map(group=>({detail:'detalle',orientation:'orientación',material:'placa',edges:'cantos',grain:'giro',dimensions:'medidas'} as Record<string,string>)[group]).join(', ')}. <button type="button" className="workshop-link" disabled={busy} onClick={()=>updateRow(restoreProposal(plan,row))}>Volver a la propuesta del modelo</button></p>}
     </>}
     {!!(equivalents.length||others.length)&&<details className="workshop-apply"><summary>Aplicar a otras piezas · {plural(equivalents.length,'equivalente','equivalentes')}</summary>
      <p className="workshop-hint">Equivalentes: mismas medidas (±0,1 mm), mismo espejado y misma forma. Se copian los datos elegidos de esta pieza.</p>
      <fieldset><legend>Qué copiar</legend>{([['material','Placa'],['edges','Cantos: principal, secundario y mapa (solo con los mismos ejes, cara e inversión)'],['grain','Giro de la pieza'],['dimensions','Regla de medidas (las medidas de corte cargadas a mano solo a equivalentes)']] as const).map(([key,text])=><label key={key}><input type="checkbox" checked={copy[key]} onChange={e=>setCopy({...copy,[key]:e.target.checked})}/> {text}</label>)}</fieldset>
      {equivalents.length?<fieldset><legend>Piezas destino equivalentes ({equivalents.length-skipped.filter(id=>equivalents.some(item=>item.id===id)).length} de {equivalents.length})</legend>{equivalents.map(item=><label key={item.id}><input type="checkbox" checked={!skipped.includes(item.id)} onChange={e=>setSkip({rowId:row.id,ids:e.target.checked?skipped.filter(id=>id!==item.id):[...skipped,item.id]})}/> {item.detail||'Sin detalle'} · {item.id}{item.include?'':' · excluida'}</label>)}</fieldset>:<p className="workshop-hint">Esta pieza no tiene equivalentes; elegí destinos en «Otras piezas del pedido».</p>}
      {!!others.length&&<details className="workshop-apply-others"><summary>Otras piezas del pedido ({plural(targets.length-equivalents.filter(item=>!skipped.includes(item.id)).length,'elegida','elegidas')} de {others.length})</summary><p className="workshop-hint">No son equivalentes: los cantos se copian solo con los mismos ejes, cara e inversión, y las medidas de corte cargadas a mano no se copian.</p>
       <fieldset><legend>Otras piezas del pedido</legend>{others.map(item=><label key={item.id}><input type="checkbox" checked={chosen.includes(item.id)} onChange={e=>setExtra({rowId:row.id,ids:e.target.checked?[...chosen,item.id]:chosen.filter(id=>id!==item.id)})}/> {item.detail||'Sin detalle'} · {item.id}{item.include?'':' · excluida'}</label>)}</fieldset></details>}
      <button className="workshop-primary" disabled={busy||!targets.length||!Object.values(copy).some(Boolean)} aria-busy={activity.action==='order_apply'||undefined} onClick={applyCopies}>{label('order_apply',`Aplicar a ${plural(targets.length,'pieza','piezas')}`)}</button></details>}
    </div></div>}
   {audit?.estimate&&<EstimateView estimate={audit.estimate} stale={saving||orderDirty} goTo={goTo}/>}
   </details>
   <details><summary>Perfil del archivo para la maderera</summary><label>Codificación<select disabled={busy} value={plan.profile.encoding} onChange={e=>updatePlan({profile:{...plan.profile,encoding:e.target.value}})}><option value="utf8">UTF-8 sin BOM</option><option value="windows1252">Windows-1252</option></select></label><label>Decimal<select disabled={busy} value={plan.profile.decimal} onChange={e=>updatePlan({profile:{...plan.profile,decimal:e.target.value}})}><option value=".">Punto</option><option value=",">Coma</option></select></label><label><input type="checkbox" disabled={busy} checked={plan.profile.header} onChange={e=>updatePlan({profile:{...plan.profile,header:e.target.checked}})}/> Encabezado (solo si lo pide la maderera)</label><label><input type="checkbox" disabled={busy} checked={codeMode==='module_piece'} aria-describedby="workshop-code-help" onChange={e=>updatePlan({detailCode:e.target.checked?'module_piece':'none'})}/> Agregar código módulo·pieza al detalle (ej. M03·P07)</label><small id="workshop-code-help" className="workshop-hint" aria-live="polite">El código sale de la guía guardada y se antepone al detalle; código, espacio y detalle no pueden superar 80 caracteres.{codeMode==='module_piece'&&missingCodes?` ${plural(missingCodes,'pieza incluida no tiene','piezas incluidas no tienen')} código: completá módulo y código en la guía.`:''}{codeMode==='module_piece'&&repeatedCodes?` ${plural(repeatedCodes,'pieza incluida tiene','piezas incluidas tienen')} un código módulo·pieza repetido en otro mueble: corregí el módulo en la guía.`:''}</small><p>Siempre nueve columnas TAB, izquierda antes de derecha, saltos CRLF. Material, espesor y cantos se eligen en el portal según el manifiesto (manifest.json).</p></details>
  </>}
  {tab==='maderera'&&<MaderaProfilePanel busy={busy} dirty={dirty} run={run} mark={mark} notify={setNotice} label={label}/>}
  {tab==='advanced'&&<><h3>Motor original de OpenCutList</h3><p>Se abre su interfaz real dentro de SketchUp. Allí generás listas, optimización 1D/2D, etiquetas y presupuestos con sus controles originales. Abrir esta ventana no significa que ya se haya optimizado un pedido.</p><div className="material-review-actions"><button disabled={busy} onClick={()=>void run(async()=>{await request('ocl_open',{tab:'cutlist'});setNotice('OpenCutList original abierto. Ejecutá allí la optimización o el presupuesto.');},'Abriendo OpenCutList…')}>Abrir listas, optimización y presupuesto OCL</button><button disabled={busy} onClick={()=>void run(async()=>{await request('ocl_open',{tab:'materials'});setNotice('Materiales de OpenCutList original abiertos.');},'Abriendo OpenCutList…')}>Abrir materiales y Smart Paint OCL</button></div><p>Compatibilidad inicial revisada: OpenCutList 7.1.0/build 202511301621. Otra versión se informa y no se fuerza.</p></>}
 </div></section></div>;
}
function Loading({busy,text,retry}:{busy:boolean;text:string;retry:()=>void}){
 return busy?<div className="workshop-loading" aria-hidden="true"><span/><span/><span/><p>{text}</p></div>:<div className="workshop-loading is-error"><p>No se pudo cargar esta sección. Revisá el mensaje de arriba y volvé a intentar.</p><button onClick={retry}>Reintentar</button></div>;
}
function EstimateView({estimate,stale,goTo}:{estimate:Estimate;stale:boolean;goTo:(id:string)=>void}){
 return <section className={`workshop-estimate${stale?' is-stale':''}`} aria-labelledby="workshop-estimate-title"><h3 id="workshop-estimate-title">Estimación neta de placas y cantos</h3>
  {stale&&<p className="workshop-stale">Actualizando con tus últimos cambios…</p>}
  <dl className="workshop-figures"><div><dt>Subtotal vigente</dt><dd>{totals(estimate.totalsByCurrency)||'Sin precios cargados'}</dd><small>Precios de hasta {estimate.priceAgeDays??90} días</small></div><div className={estimate.outdated?'is-warning':undefined}><dt>Precios desactualizados</dt><dd>{totals(estimate.outdatedTotalsByCurrency)||'Ninguno'}</dd><small>{estimate.outdated} {estimate.outdated===1?'consumo':'consumos'} con precio antiguo o fecha futura, separados</small></div><div className={estimate.pending?'is-warning':undefined}><dt>Consumos sin precio</dt><dd>{estimate.pending}</dd><small>Cargá el precio en la biblioteca</small></div></dl>
  {!!estimate.lines.length&&<div className="material-review-table"><table className="workshop-estimate-table"><caption className="workshop-sr-only">Estimación neta por pieza</caption><thead><tr><th scope="col">Pieza</th><th scope="col" className="workshop-num">m² neto</th><th scope="col" className="workshop-num">Importe</th><th scope="col">Estado</th></tr></thead><tbody>{estimate.lines.map(line=>{const state=lineState(line);return <tr key={line.id} className={state!=='current'?`is-${state}`:undefined}><th scope="row"><button className="workshop-link" aria-label={`Ir a la pieza ${line.detail||line.id}`} onClick={()=>goTo(line.id)}>{line.detail||line.id}</button><small>{line.id}</small></th><td className="workshop-num">{area.format(line.netAreaM2)}</td><td className="workshop-num">{lineAmount(line)}</td><td>{lineLabels[state]}</td></tr>;})}</tbody></table></div>}
  <p className="workshop-footnote">Estimación neta: sin optimización, desperdicio, impuestos ni mano de obra. Las placas optimizadas y el presupuesto con desperdicio están arriba.</p>
 </section>;
}
/** Total de cantos por SKU que factura la maderera: neto, con el margen del perfil y a comprar, visible antes de que el pedido completo valide. */
function EdgeTotalsView({plan,catalog,estimate,stale,profile}:{plan:OrderPlan;catalog:Catalog;estimate?:Estimate;stale:boolean;profile:CutSettings}){
 const {lines,missing,unassigned}=edgeTotals(plan,catalog,profile),waste=profile.source.kind==='profile'?profile.wastePercent:null,amounts=edgeAmounts(estimate?.lines.flatMap(line=>line.charges||[])||[]);
 // Same split as the estimate: outdated or future-dated prices are shown apart, never as a current amount.
 const amount=(id:string)=>{const entry=amounts.get(id);if(!entry)return 'Sin calcular';if(entry.pending)return 'Pendiente';const current=totals(entry.current),old=totals(entry.outdated);
  return <>{current}{old&&<span className="workshop-edge-outdated">{current?' · ':''}{old} con precio desactualizado, fuera del subtotal vigente</span>}{!current&&!old&&'Pendiente'}</>;};
 const outdated=(id:string)=>!!Object.keys(amounts.get(id)?.outdated||{}).length;
 return <section className="workshop-edges" aria-labelledby="workshop-edges-title"><h3 id="workshop-edges-title">Total de cantos del pedido</h3>
  {lines.length?<div className="material-review-table"><table className="workshop-estimate-table"><caption className="workshop-sr-only">Cantos del pedido: metros lineales por SKU, con margen y a comprar</caption><thead><tr><th scope="col">Canto</th><th scope="col" className="workshop-num">Metros netos</th><th scope="col" className="workshop-num">{waste?`Con margen (${plain(waste)} %)`:'Con margen'}</th><th scope="col" className="workshop-num">A comprar</th><th scope="col" className="workshop-num">Lados</th><th scope="col" className="workshop-num">Piezas</th>{estimate&&<th scope="col" className="workshop-num">Importe neto{stale?' (actualizando)':''}</th>}</tr></thead>
   <tbody>{lines.map(line=>{const buy=edgePurchase(line.metres,waste);return <tr key={line.id}><th scope="row">{line.label}<small>{line.sku}</small></th><td className="workshop-num">{formatMetres(line.metres)} m</td><td className="workshop-num">{formatMetres(buy.withMargin)} m</td><td className="workshop-num">{plural(buy.buy,'metro','metros')}</td><td className="workshop-num">{line.sides}</td><td className="workshop-num">{line.pieces}</td>{estimate&&<td className={`workshop-num${stale?' is-stale':''}${outdated(line.id)?' is-outdated':''}`}>{amount(line.id)}</td>}</tr>;})}</tbody></table></div>:<p className="workshop-hint">Todavía no hay lados con canto y producto asignado.</p>}
  {(!!missing||!!unassigned)&&<ul className="workshop-edges-notes">{!!missing&&<li>{plural(missing,'pieza con cantos marcados no se cuenta','piezas con cantos marcados no se cuentan')}: faltan ejes o medidas de corte.</li>}{!!unassigned&&<li>{plural(unassigned,'pieza tiene','piezas tienen')} lados con canto sin producto asignado en ese rol.</li>}</ul>}
  <p className="workshop-footnote">Metros netos de las medidas que recibe la maderera (base para arriba/abajo, altura para izquierda/derecha). {waste?`Margen: el desperdicio del ${plain(waste)} % del perfil en uso.`:'Sin perfil de maderera en uso: sin margen de desperdicio.'} A comprar: redondeado al metro entero.{estimate?'':' El importe aparece cuando el pedido no tiene problemas.'}</p>
 </section>;
}
function Piece2D({geometry,row,catalog}:{geometry:Geometry;row:OrderRow;catalog:Catalog}){
 const [u,v]=row.axes!,projection=orderProjection(geometry,{...row,axes:row.axes!}),width=projection.width,height=projection.height,scale=Math.min(320/width,320/height);
 const x0=55,y0=55,w=width*scale,h=height*scale,[base,tall]=rowDimensions(row,geometry)??[width,height];
 const points=projection.points.map(([x,y])=>[x0+x*scale,y0+y*scale]);
 const edges=[[x0,y0,x0+w,y0],[x0,y0+h,x0+w,y0+h],[x0,y0,x0,y0+h],[x0+w,y0,x0+w,y0+h]],sides=['arriba','abajo','izquierda','derecha'];
 const info=row.edgeMap.map((role,i)=>{const id=role===1?row.principalId:role===2?row.secondaryId:null,item=id?catalog.items.find(e=>e.id===id):undefined,length=i<2?base:tall;
  return {role,length,short:role?(item?item.sku.trim()||item.name:'sin producto'):'',text:role?`${item?item.sku.trim()||item.name:'Sin producto'} · ${mm(length)} mm`:'Sin canto'};});
 const summary=`Vista 2D orientada para maderera: base ${mm(base)} × altura ${mm(tall)} mm; ${info.map((s,i)=>`${sides[i]}: ${s.role?`canto ${s.role===1?'principal':'secundario'} ${s.short}, ${mm(s.length)} mm`:'sin canto'}`).join('; ')}.`;
 return <svg className="order-preview" viewBox={`0 0 ${w+110} ${h+110}`} role="img" aria-label={summary}><rect width={w+110} height={h+110} fill="white"/>{projection.triangles.map((triangle,i)=><polygon key={i} points={triangle.map(index=>points[index].join(',')).join(' ')} fill="#f1eadc" stroke="#b8ad95" strokeWidth=".4"/>)}
  {edges.map(([x1,y1,x2,y2],i)=>{const tx=(x1+x2)/2+(i===2?-14:i===3?14:0),ty=(y1+y2)/2+(i===0?-10:i===1?18:0);return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={['#60768a','#da7824','#1d7193'][row.edgeMap[i]]} strokeWidth={row.edgeMap[i]?5:1.5} strokeDasharray={row.edgeMap[i]===2?'9 5':undefined}/><text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="11" transform={i>1?`rotate(${i===2?-90:90} ${tx} ${ty})`:undefined}>{info[i].role?`${info[i].role} · `:''}{info[i].text}</text></g>;})}
  <text x={x0+w/2} y={h+100} textAnchor="middle" fontSize="13">{mm(width)} × {mm(height)} mm</text><text x={x0+w/2} y="20" textAnchor="middle" fontSize="12">Cara {row.frontSign===1?'+':row.frontSign===-1?'−':'sin elegir'} · U={'XYZ'[u]} / V={'XYZ'[v]}</text></svg>;
}
