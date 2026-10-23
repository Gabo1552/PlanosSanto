import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ViewAdjustments,{shiftDimension,orbitCamera} from '../../components/ViewAdjustments';
import {withNaming,normalizeNaming,namingIssues,namingNotices,moduleFromName,autoModules,effectiveWorkCode} from '../../lib/naming';
import Diagram from '../../components/Diagram';
import DimensionControls from '../../components/DimensionControls';
import {setDimensionVisible} from '../../lib/dimensions';
import { mm, type Furniture, type Note, type Project, type RawNode, type RawDocument, type Vec3 } from '../../lib/model';
import {pieceRows,identicalGroups,pieceCodeMap} from '../../lib/pieceGroups';
import {dimensionCaption} from '../../lib/dimensions';
import { layoutWarnings, markedFront, type View } from '../../lib/scene';
import { request } from './bridge';
import {isQuickIntent,moduleShortcuts,noticeActionFor,shortcutFor,type QuickIntent} from './quickActions';
import {ensureRuntime,fitWindowOnce,setWindowFolded} from './runtime';
import { countPieces, editsFor, guideIssues, guideNotices, mergeGuide, modelGuidOf, withoutCodeHistory, type Generated, type Guide, type GuideFurniture } from './guide';
import { a4Furniture, createOfflinePdf, decode64, encode64, type OrderReferences, type PartialReferences } from './pdf';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import logo from '../assets/santo-carpintero.png?inline';
import HelpPopover from './HelpPopover';
import release from '../version.json';
import MaterialReview from './MaterialReview';
import PaintPanel from './PaintPanel';
import SmartPaintPalette,{type PaintTarget} from './SmartPaintPalette';
import WorkshopPanel from './WorkshopPanel';
import NameSuggestions from './NameSuggestions';
import CodePlanDialog from './CodePlanDialog';
import LabelsPanel from './LabelsPanel';
import {LABELS_ENABLED} from './labels';
import PieceViewer from './PieceViewer';
import A4SheetPreview,{a4ViewerScene} from './A4SheetPreview';
import CutlistView from './CutlistView';
import GuideViews,{ensureGuide} from './GuideViews';
import MaterialLibraryPanel from './MaterialLibraryPanel';
import PhotoMaterialPanel from './PhotoMaterialPanel';
import StaleBanner from './StaleBanner';
import './ux-shell.css';
const {version}=release;

type Scan={tree:{roots:RawNode[];warnings:string[];modelName:string};guide:Guide;selected:string[];path:string};
const DEFERRED_SCAN_ACTIONS=new Set(['materials','order']);
// Stable empty list: the code plan preview is memoized on it.
const NO_UNSAVED_CODES:string[]=[];
function deferredIntent(loading:unknown){const intent=loading&&typeof loading==='object'?(loading as {intent?:unknown}).intent:undefined;return isQuickIntent(intent)&&DEFERRED_SCAN_ACTIONS.has(intent.action);}
function allIds(nodes:RawNode[]):string[]{return nodes.flatMap(n=>[n.id,...allIds(n.children)]);}
function selectedFurnitureIds(paths:string[],nodes:RawNode[]):string[]{const containers:RawNode[]=[];function visit(items:RawNode[]){for(const node of items){if(node.children.length&&countPieces(node)>0)containers.push(node);visit(node.children);}}visit(nodes);const selected=[...new Set(paths.flatMap(path=>{const node=containers.filter(node=>path===node.id||path.startsWith(node.id+'/')).sort((a,b)=>b.id.length-a.id.length)[0];return node?[node.id]:[];}))];return selected.filter(id=>!selected.some(parent=>parent!==id&&id.startsWith(parent+'/')));}

function ToolIcon({tool}:{tool:string}){
  const paths:Record<string,string>={select:'M5 3l13 9-6 1-3 6-4-16z',orbit:'M19 8a8 8 0 1 0 1 7M19 3v5h-5',dimensions:'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4'};
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={paths[tool]}/></svg>;
}
type Module='home'|'materials'|'furniture'|'pieces'|'order'|'guides';
const modules:[Module,string,string][]=[['home','Inicio','Trabajo actual y próximos pasos'],['materials','Materiales','Biblioteca visual del taller'],['furniture','Muebles','Frente, nombres y piezas para la maderera'],['pieces','Piezas','Lista de corte por material y espesor'],['order','Maderera','Placas optimizadas y TXT por placa'],['guides','Planos A4','Vistas, cotas y notas']];
function ModuleIcon({name}:{name:string}){
 const paths:Record<string,string>={home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',materials:'M4 5h13v16H4zM8 2h12v15M7 9h7M7 13h7M7 17h4',furniture:'M4 5h16v14H4zM4 12h16M12 5v14M6 19v3M18 19v3',order:'M6 3h12v19H6zM9 8h6M9 12h6M9 16h3',guides:'M5 2h10l4 4v16H5zM15 2v5h4M8 12l4-2 4 2v5l-4 2-4-2zM12 14v5M8 12l4 2 4-2',pieces:'M4 4h16v16H4zM4 9h16M4 14h16M10 4v16',paint:'M4 4h12v5H4zM16 6h4v6h-9v8H8v-8'};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.home}/></svg>;
}
type NoticeAction={label:string;kind:'analyze'|'generate'|'module'|'save'|'workshop';module?:Module};
type Tone='success'|'warning'|'info';
type Confirm={title:string;detail:string;confirmLabel:string;run:()=>void;opener?:HTMLElement|null};
type Block='save'|'export'|'paint'|'nav'|'tools';
const moduleLabel=(id:Module)=>modules.find(([value])=>value===id)![1];
const plural=(count:number,one:string,many:string)=>`${count} ${new Intl.PluralRules('es').select(count)==='one'?one:many}`;
const moduleSteps:Partial<Record<Module,string>>={materials:'Texturas reales, candidatos y fichas revisadas.',furniture:'Elegí los muebles, marcá el frente y proponé los nombres que van a la maderera.',pieces:'Todas las piezas por material y espesor, con cantos y veta.',order:'Revisá lotes, cantos y orientación antes de generar el TXT para la maderera.',guides:'Vistas exterior e interior orientadas solas, cotas, indicaciones y una A4 por mueble.'};
const NOTICE_TIMEOUT=20_000;
// Rows whose name still is the SketchUp default: Planos links back to «Proponer nombres».
const genericName=/^(?:sin nombre\b|grupo(?:#|\s|$)|group(?:#|\s|$)|componente(?:#|\s|$)|component(?:#|\s|$)|pieza\s+\d+$)/i;
const searchable=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');

export default function App(){
  const [destination,setDestination]=useState<Module>('home'),[materialsVisited,setMaterialsVisited]=useState(false),[libraryDirty,setLibraryDirty]=useState(false),[catalogFocus,setCatalogFocus]=useState<string>(),[catalogRefresh,setCatalogRefresh]=useState(0),[paintCatalogId,setPaintCatalogId]=useState<string>(),[paintAutoStart,setPaintAutoStart]=useState(false),[showPhotoMaterial,setShowPhotoMaterial]=useState(false),[photoTarget,setPhotoTarget]=useState<PaintTarget>();
  const [filter,setFilter]=useState<'all'|'selected'|'unselected'>('all');
  const [pieceQuery,setPieceQuery]=useState(''),[onlySelected,setOnlySelected]=useState(false),[editingPieceId,setEditingPieceId]=useState('');
  const [highlight,setHighlight]=useState(false);
  const [tool,setTool]=useState<'select'|'orbit'|'dimensions'>('select');
  // Punto 20: rows the last save kept in the guide without renaming them in SketchUp (id → reason).
  const [nameWarnings,setNameWarnings]=useState<Record<string,string>>({});
  const editSnapshot=useRef<{id:string;bases:{id:string;base:string}[];dirty:boolean}|undefined>(undefined);
  const highlightSequence=useRef(0);
  // DESPIECE-01: pieces without saved code per furniture and furniture renumbered since the last save (sent as renumber:true).
  const [showCodePlan,setShowCodePlan]=useState(false),[unsavedCodes,setUnsavedCodes]=useState<Record<string,string[]>>({}),[renumbered,setRenumbered]=useState<ReadonlySet<string>>(new Set()),codePlanTrigger=useRef<HTMLButtonElement>(null);
  const [showSuggestions,setShowSuggestions]=useState(false),[printMaterials,setPrintMaterials]=useState(false);
  const workshopTrigger=useRef<HTMLButtonElement>(null),suggestionsTrigger=useRef<HTMLButtonElement>(null);
  const [showWorkshop,setShowWorkshop]=useState(false),[workshopTab,setWorkshopTab]=useState<'catalog'|'order'>('catalog'),[workshopDirty,setWorkshopDirty]=useState(false);
  const materialTrigger=useRef<HTMLButtonElement>(null);
  const [showMaterials,setShowMaterials]=useState(false);
  const [showPaint,setShowPaint]=useState(false),[paintPieceId,setPaintPieceId]=useState<string>();
  const paintTrigger=useRef<HTMLButtonElement>(null),smartPaintTrigger=useRef<HTMLButtonElement>(null);
  const [showSmartPaint,setShowSmartPaint]=useState(false),[compactPaint,setCompactPaint]=useState(false),[quickIntent,setQuickIntent]=useState<QuickIntent>();
  const uiReady=useRef(false),lastQuick=useRef(0),quickHandler=useRef<(intent:QuickIntent)=>void>(()=>{});
  const [contextChanged,setContextChanged]=useState(false),[modelAnalysisStale,setModelAnalysisStale]=useState(false),[scanDeferred,setScanDeferred]=useState(false),[windowFolded,setWindowFoldedState]=useState(false);
  const restoreSmartFocus=useRef(false);
  useEffect(()=>{if(showSmartPaint)restoreSmartFocus.current=true;else if(restoreSmartFocus.current){restoreSmartFocus.current=false;smartPaintTrigger.current?.focus();}},[showSmartPaint]);
  // Punto 22: what the operator typed; names only use a complete obra (two letters).
  const [workCodeInput,setWorkCodeInput]=useState(''),workCode=effectiveWorkCode(workCodeInput),workCodeNow=useRef(workCode),workCodeTyped=useRef(false),[saveSkp,setSaveSkp]=useState(true),[syncNames,setSyncNames]=useState(true);
  workCodeNow.current=workCode;
  const [scan,setScan]=useState<Scan>();
  const heldScan=useRef<Scan|undefined>(undefined),currentScan=useRef<Scan|undefined>(undefined);currentScan.current=scan;
  const [ids,setIds]=useState<string[]>([]);
  const [project,setProject]=useState<Project>();
  const [orphans,setOrphans]=useState<Record<string,Note[]>>({});
  const [revision,setRevision]=useState(0),[fingerprint,setFingerprint]=useState('');
  const [furnitureId,setFurnitureId]=useState(''),[pieceId,setPieceId]=useState(''),[noteId,setNoteId]=useState('');
  const [picking,setPicking]=useState<string>();
  const [busy,setBusy]=useState(''),[error,setErrorText]=useState(''),[errorAction,setErrorAction]=useState<NoticeAction>(),[message,setMessageText]=useState(''),[messageAction,setMessageAction]=useState<NoticeAction>(),[messageTone,setMessageTone]=useState<Tone>('success'),[noticeHold,setNoticeHold]=useState(false),[elapsed,setElapsed]=useState(0),[lastNotice,setLastNotice]=useState<{text:string;tone:Tone|'error';time:string}>(),[lastOpen,setLastOpen]=useState(false);
  const remember=useCallback((text:string,tone:Tone|'error')=>{if(text)setLastNotice({text,tone,time:new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})});},[]);
  const setError=useCallback((text:string,action?:NoticeAction)=>{setErrorText(text);setErrorAction(action);remember(text,'error');},[remember]),setMessage=useCallback((text:string,action?:NoticeAction,tone:Tone='success')=>{setMessageText(text);setMessageAction(action);setMessageTone(tone);remember(text,tone);if(!text)setNoticeHold(false);},[remember]);
  const [pendingConfirm,setPendingConfirm]=useState<Confirm>();const confirmCancel=useRef<HTMLButtonElement>(null),shortcutHandler=useRef<(event:KeyboardEvent)=>void>(()=>{}),focusAfterBusy=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!message||messageAction||noticeHold||messageTone==='warning')return;const timer=setTimeout(()=>setMessage(''),NOTICE_TIMEOUT);return()=>clearTimeout(timer);},[message,messageAction,messageTone,noticeHold,setMessage]);
  useEffect(()=>{if(!busy)return;const start=Date.now(),timer=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>{clearInterval(timer);setElapsed(0);};},[busy]);
  useEffect(()=>{if(pendingConfirm)confirmCancel.current?.focus();},[pendingConfirm]);
  useEffect(()=>{const target=focusAfterBusy.current;if(busy||!target)return;focusAfterBusy.current=null;requestAnimationFrame(()=>{const active=document.activeElement;if(target.isConnected&&!(target as HTMLButtonElement).disabled&&target.getClientRects().length>0&&(!active||active===document.body))target.focus();});},[busy]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>shortcutHandler.current(event);document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
  const [dirty,setDirty]=useState(false),[diagnostic,setDiagnostic]=useState('');
  const [filePending,setFilePending]=useState(false);
  useEffect(()=>{if(!dirty)setPendingConfirm(undefined);},[dirty]);
  const [view,setView]=useState<View>('front');
  const [draftHidden,setDraftHidden]=useState<string[]|null>(null),[hideMode,setHideMode]=useState(false);
  const [previewReferences,setPreviewReferences]=useState<OrderReferences>(),[previewPending,setPreviewPending]=useState<string[]>(),[previewReferenceError,setPreviewReferenceError]=useState('');
  const noteInput=useRef<HTMLTextAreaElement>(null);
  const partsScroll=useRef<HTMLDivElement>(null);
  const furniture=project?.furniture.find(f=>f.id===furnitureId)||project?.furniture[0];
  const previewFurniture=useMemo(()=>furniture&&draftHidden!==null?{...furniture,presentation:{...furniture.presentation,guide:{...ensureGuide(furniture).presentation!.guide!,hiddenPieceIds:draftHidden}}}:furniture,[furniture,draftHidden]);
  useEffect(()=>{setDraftHidden(null);setHideMode(false);},[furniture?.id]);
  const sheetPreviewProject=useMemo(()=>project&&furniture?{...project,furniture:[furniture]}:undefined,[project,furniture]);
  useEffect(()=>{let current=true;setPreviewReferences(undefined);setPreviewPending(undefined);setPreviewReferenceError('');if(!printMaterials||destination!=='guides')return;void request<PartialReferences>('order_references_partial').then(result=>{if(current){setPreviewReferences(result.references);setPreviewPending(result.pending);}}).catch(value=>{if(current)setPreviewReferenceError(value instanceof Error?value.message:String(value));});return()=>{current=false;};},[printMaterials,destination,revision,fingerprint]);
  useEffect(()=>{const mode=furniture?.presentation?.guide?.mode;if(mode==='exterior')setView('front');else if(mode==='interior')setView('back');},[furniture?.id,furniture?.presentation?.guide?.mode]);
  const orphanNotes=furniture?orphans[furniture.id]||[]:[];
  const note=furniture?[...furniture.notes,...orphanNotes].find(n=>n.id===noteId):undefined;
  const piece=furniture?.pieces.find(p=>p.id===pieceId)||furniture?.pieces[0];
  const rows=useMemo(()=>furniture?pieceRows(furniture):[],[furniture]);
  const selectedRow=rows.find(row=>row.memberIds.includes(piece?.id||''));
  const codes=useMemo(()=>furniture?pieceCodeMap(furniture):new Map<string,string>(),[furniture]);
  const repeated=useMemo(()=>furniture?identicalGroups(furniture).filter(group=>group.length>1).length:0,[furniture]);
  const pieceIndex=rows.findIndex(row=>row.id===selectedRow?.id);
  const visiblePieces=rows.filter(p=>(!onlySelected||p.memberIds.includes(piece?.id||''))&&(p.memberIds.includes(editingPieceId)||searchable(`${p.code} ${p.name} ${furniture?.naming?.bases.find(b=>b.id===p.id)?.base||''}`).includes(searchable(pieceQuery.trim()))))||[];
  // Muebles names pieces and Planos draws them: each module only builds what it shows. The Planos viewer is the A4 itself.
  const planos=destination==='guides';
  const scene=useMemo(()=>planos&&previewFurniture?a4ViewerScene(previewFurniture,view,printMaterials?previewReferences:undefined,printMaterials?previewPending:undefined):undefined,[planos,previewFurniture,view,printMaterials,previewReferences,previewPending]);
  // Muebles only locates pieces: an interactive 3D viewer (PieceViewer) facing the front, every ID, no cotas or notes.
  const warnings=useMemo(()=>!furniture?[]:scene?[...new Set([...scene.warnings,...layoutWarnings(a4Furniture(furniture))]),...guideIssues(furniture),...namingIssues(furniture),...guideNotices(orphans[furniture.id]||[])]:namingIssues(furniture),[furniture,scene,orphans]);
  // Without a proposal, a piece whose SketchUp instance has no name of its own still counts as unnamed.
  const generic=(name:string)=>!name.trim()||genericName.test(name.trim());
  const unnamed=rows.filter(row=>generic(furniture?.naming?.bases.find(b=>b.id===row.id)?.base??row.name)||(!furniture?.naming?.reviews?.some(r=>row.memberIds.includes(r.id))&&row.memberIds.every(id=>generic(furniture?.pieces.find(p=>p.id===id)?.metadata?.originalName??'x')))).length;
  const [warningAnnouncement,setWarningAnnouncement]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setWarningAnnouncement(warnings.length?plural(warnings.length,'advertencia en la hoja','advertencias en la hoja'):''),600);return()=>clearTimeout(timer);},[warnings.length]);
  const selectionChanged=!!project&&JSON.stringify([...ids].sort())!==JSON.stringify(project.furniture.map(f=>f.id).sort());
  useEffect(()=>{if(noteId&&!picking)noteInput.current?.focus();},[noteId,picking]);
  useEffect(()=>{
    if(!picking)return;
    function cancel(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented)setPicking(undefined);}
    document.addEventListener('keydown',cancel);return()=>document.removeEventListener('keydown',cancel);
  },[picking]);

  async function run(label:string,operation:()=>Promise<void>){
    const active=document.activeElement;if(!focusAfterBusy.current&&active instanceof HTMLElement&&active!==document.body)focusAfterBusy.current=active;
    setBusy(label);setError('');setMessage('');
    try{await operation();return true;}catch(error){const text=error instanceof Error?error.message:String(error);setError(text,noticeActionFor(text,label));return false;}
    finally{setBusy('');}
  }
  // Edits by the operator since the last analysis or generation: only those block the automatic refresh.
  const userEdited=useRef(false);
  function markDirty(){userEdited.current=true;if(dirty)return;setDirty(true);void request('dirty',{value:true}).catch(()=>{});}
  function changeFurniture(change:(f:Furniture)=>Furniture){
    setProject(previous=>previous?{...previous,furniture:previous.furniture.map(f=>f.id===furniture?.id?change(f):f)}:previous);markDirty();
  }
  const acceptScan=useCallback((result:Scan,mode?:'all'|'selected')=>{
    heldScan.current=undefined;editSnapshot.current=undefined;userEdited.current=false;setNameWarnings({});setContextChanged(false);setModelAnalysisStale(false);// The obra typed for this model survives the automatic re-analysis; another model brings its own.
    const keepCode=workCodeTyped.current&&currentScan.current?.path===result.path;workCodeTyped.current=keepCode;if(!keepCode)setWorkCodeInput(result.guide.workCode||'');setPieceQuery('');setOnlySelected(false);setEditingPieceId('');setScan(result);setProject(undefined);setOrphans({});setRenumbered(new Set());setDirty(false);setPicking(undefined);
    const available=new Set(allIds(result.tree.roots));
    const stored=result.guide.selection.filter(id=>available.has(id));
    const roots=result.tree.roots.filter(n=>n.children.length>0&&countPieces(n)>0).map(n=>n.id);
    setIds(mode==='selected'?result.selected:mode==='all'?roots:stored.length?stored:result.selected.length?result.selected:roots);
    setRevision(result.guide.revision);
    setFilePending(!result.path&&result.guide.revision>0);
    if(mode==='selected'&&!result.selected.length)setMessage('No hay grupos o componentes seleccionados en SketchUp. Seleccionalos en el modelo y volvé a analizar.',undefined,'warning');
  },[setMessage]);
  function askDiscard(title:string,confirmLabel:string,run:()=>void){const count=project?.furniture.length||0;setPendingConfirm({title,confirmLabel,run,opener:document.activeElement as HTMLElement|null,detail:`Se pierden los nombres, notas y ajustes de vista que no guardaste${count?` en ${count} ${count===1?'mueble':'muebles'}`:''}. La guía guardada en el modelo no cambia.`});}
  function closeConfirm(confirmed:boolean){const current=pendingConfirm;setPendingConfirm(undefined);if(!current)return;const opener=current.opener,heading=document.querySelector<HTMLElement>('.ux-module-heading'),target=opener&&opener.isConnected&&opener!==document.body&&!opener.closest('.ux-confirm')?opener:heading;if(confirmed){focusAfterBusy.current=target;current.run();}
    // Without a usable opener focus lands on the module heading, never on body; a disabled opener waits for the busy effect.
    requestAnimationFrame(()=>{const active=document.activeElement;if(active&&active!==document.body)return;target?.focus();if(document.activeElement===target){if(focusAfterBusy.current===target)focusAfterBusy.current=null;}else if(!confirmed)heading?.focus();});}
  async function analyze(mode?:'all'|'selected',confirmed=false){
    if(dirty&&!confirmed){askDiscard('Descartar cambios y volver a analizar','Descartar y analizar',()=>void analyze(mode,true));return;}
    await run('Analizando modelo…',async()=>{
      await ensureRuntime();
      acceptScan(await request<Scan>('scan'),mode);
    });
  }
  // The analysis refreshes itself when the model changes (painting, native edits), like OpenCutList's
  // cutlist: no «Reanalizar» click. Guides that were open are generated again with the same pieces.
  // With edits made by the operator it waits: rescanning would discard them, so the banner stays.
  // A freshly generated guide that nobody touched counts as unsaved but not edited: it refreshes.
  const autoRefresh=useRef<()=>Promise<void>>(async()=>{});
  autoRefresh.current=async()=>{
    const hadGuides=!!project,pieces=ids,target=destination;
    await analyze(undefined,true);
    if(hadGuides&&pieces.length)await generate(pieces,target,true);
  };
  // Piezas works like OpenCutList's cutlist: opening it is enough. Without guides it generates them
  // once for the marked furniture (the stored selection, or every furniture group by default).
  const piecesAutoGenerated=useRef(false);
  useEffect(()=>{
    if(destination!=='pieces'){piecesAutoGenerated.current=false;return;}
    if(project||!scan||busy||contextChanged||!ids.length||piecesAutoGenerated.current)return;
    piecesAutoGenerated.current=true;void generate(ids,'pieces',true);
  },[destination,project,scan,busy,contextChanged,ids]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!modelAnalysisStale||userEdited.current||busy||contextChanged||!scan)return;
    const timer=window.setTimeout(()=>{if(!userEdited.current)void autoRefresh.current();},1200);
    return()=>window.clearTimeout(timer);
  },[modelAnalysisStale,dirty,busy,contextChanged,scan]);
  // Point 23: choosing other furniture regenerates the guides by itself, keeping the unsaved edits by id.
  // One attempt per choice: a failure stays on screen instead of retrying in a loop.
  const autoSelection=useRef<()=>Promise<void>>(async()=>{}),selectionAttempt=useRef('');
  autoSelection.current=async()=>{
    selectionAttempt.current=JSON.stringify([...ids].sort());
    await run('Actualizando guías…',async()=>{await ensureRuntime();await refreshGuides(ids,modelAnalysisStale);setMessage('Guías actualizadas con los muebles elegidos.',undefined,'info');});
  };
  useEffect(()=>{
    if(!project||!selectionChanged||!ids.length||busy||contextChanged||draftHidden!==null||!scan||pendingConfirm||selectionAttempt.current===JSON.stringify([...ids].sort()))return;
    const timer=window.setTimeout(()=>void autoSelection.current(),500);
    return()=>window.clearTimeout(timer);
  },[project,selectionChanged,ids,busy,contextChanged,draftHidden,scan,pendingConfirm]);
  useEffect(()=>{
    let mounted=true;setBusy('Analizando modelo…');
    // ARQ-07: opening Materiales or Maderera never scans; the banner offers Analizar.
    void ensureRuntime().then(()=>{void fitWindowOnce();return request<unknown>('ui_loading').catch(()=>undefined);}).then(loading=>deferredIntent(loading)?undefined:request<Scan>('scan')).then(result=>{if(!mounted)return;if(result)acceptScan(result);else setScanDeferred(true);}).catch(error=>{if(mounted){const text=error instanceof Error?error.message:String(error);setError(text,noticeActionFor(text,'Analizando modelo…'));}}).finally(()=>{if(mounted)setBusy('');});
    return()=>{mounted=false;};
  },[acceptScan,setError]);

  // ARQ-06: «Plegar» leaves a strip and returns focus to the model; the menu
  // «Restablecer ventanas» also unfolds.
  async function toggleWindowFold(){
    try{setWindowFoldedState(await setWindowFolded(!windowFolded));}
    catch(value){setError(`No se pudo ${windowFolded?'desplegar':'plegar'} la ventana: ${value instanceof Error?value.message:String(value)}`);}
  }
  useEffect(()=>{
    function reset(){setWindowFoldedState(false);}
    window.addEventListener('planos-santo-window-reset',reset);
    return()=>window.removeEventListener('planos-santo-window-reset',reset);
  },[]);
  const consumeQuick=useCallback((value:unknown)=>{
    if(!isQuickIntent(value))return;
    if(value.sequence>lastQuick.current){lastQuick.current=value.sequence;quickHandler.current(value);}
    void request('quick_action_ack',{sequence:value.sequence}).catch(()=>{});
  },[]);
  useEffect(()=>{
    function action(event:Event){consumeQuick((event as CustomEvent<unknown>).detail);}
    function state(event:Event){const state=(event as CustomEvent<{contextChanged?:boolean;contextRestored?:boolean;error?:string}>).detail;if(state?.contextChanged){if(!heldScan.current)heldScan.current=currentScan.current;setContextChanged(true);setScan(undefined);setError(state.error||'Cambió el modelo activo. Los cambios de esta guía siguen en la ventana: copialos o guardalos en el modelo original antes de analizar otro.');}else if(state?.contextRestored){setContextChanged(false);setScan(heldScan.current||currentScan.current);heldScan.current=undefined;setError('');setMessage('Volviste al modelo de la guía. Los cambios pendientes se conservaron; revisalos antes de guardar.');}}
    function invalidate(){setModelAnalysisStale(true);}
    window.addEventListener('planos-santo-document-invalidated',invalidate);window.addEventListener('planos-santo-quick-action',action);window.addEventListener('planos-santo-smart-paint',state);
    return()=>{window.removeEventListener('planos-santo-document-invalidated',invalidate);window.removeEventListener('planos-santo-quick-action',action);window.removeEventListener('planos-santo-smart-paint',state);};
  },[consumeQuick,setError,setMessage]);
  useEffect(()=>{
    if((!scan&&!scanDeferred)||uiReady.current)return;uiReady.current=true;
    void request<{intent?:unknown}>('ui_ready').then(result=>consumeQuick(result?.intent)).catch(()=>{uiReady.current=false;});
  },[scan,scanDeferred,consumeQuick]);

  function toggle(id:string){
    setIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current.filter(x=>!x.startsWith(id+'/')&&!id.startsWith(x+'/')),id]);
  }
  async function generate(selectedIds=ids,target:Module='furniture',confirmed=false){
    if(dirty&&!confirmed){askDiscard('Descartar cambios y regenerar las guías','Descartar y regenerar',()=>void generate(selectedIds,target,true));return;}
    await run('Generando guías…',async()=>{
      const result=await request<Generated>('generate',{ids:selectedIds});
      const merged=mergeGuide(result.document,result.guide);
      const code=workCodeNow.current;merged.project.furniture=autoModules(merged.project.furniture.map(f=>ensureGuide(withNaming(f,code))),code);
      userEdited.current=false;setNameWarnings({});setDestination(target);setIds(selectedIds);setProject(merged.project);setOrphans(merged.orphans);setUnsavedCodes(merged.unsaved);setRenumbered(new Set());setRevision(result.guide.revision);setFingerprint(result.fingerprint);
      const unsaved=editsFor(merged.project,merged.orphans).some(f=>JSON.stringify(f)!==JSON.stringify(withoutCodeHistory(result.guide.furniture.find(saved=>saved.id===f.id))));
      setPieceQuery('');setOnlySelected(false);setFurnitureId(merged.project.furniture[0].id);setPieceId('');setNoteId('');setPicking(undefined);setDirty(unsaved);
      await request('dirty',{value:unsaved});setMessage('Guías generadas. Revisá las piezas, agregá tus indicaciones y guardá la guía.');
    });
  }
  // Points 18 and 23: rebuilds the guides of `selection` from the live model keeping the unsaved edits by id
  // (names, codes, notes, views). Pieces that appeared get the next free code; a note whose piece is gone stays
  // only if it was already saved as orphan (the store never accepts a new one) and the rest is reported.
  type Fresh={project:Project;orphans:Record<string,Note[]>;fingerprint:string;revision:number;dropped:number};
  async function refreshGuides(selection:string[],rescan:boolean,source:Project|undefined=project,sourceOrphans=orphans):Promise<Fresh>{
    let chosen=selection;
    if(rescan){
      const fresh=await request<Scan>('scan'),available=new Set(allIds(fresh.tree.roots));
      chosen=selection.filter(id=>available.has(id));
      if(!chosen.length)throw new Error('Los muebles de la guía ya no están en el modelo. Elegilos de nuevo en Muebles.');
      setScan(fresh);setModelAnalysisStale(false);
    }
    const result=await request<Generated>('generate',{ids:chosen});
    const local:GuideFurniture[]=source?editsFor(source,sourceOrphans,renumbered).filter(f=>chosen.includes(f.id)):[];
    const merged=mergeGuide(result.document,{...result.guide,furniture:[...result.guide.furniture.filter(f=>!local.some(edit=>edit.id===f.id)),...local]});
    const pending=new Map(source?.furniture.filter(f=>f.groupName!==undefined).map(f=>[f.id,f.groupName!])||[]);
    const code=workCodeNow.current;merged.project.furniture=autoModules(merged.project.furniture.map(f=>{const groupName=pending.get(f.id);return ensureGuide(groupName===undefined?withNaming(f,code):withNaming({...f,name:groupName,groupName},code,moduleFromName(groupName)||f.naming?.moduleCode||''));}),code);
    let dropped=0;const kept:Record<string,Note[]>={};
    for(const [id,notes] of Object.entries(merged.orphans)){const saved=result.guide.furniture.find(f=>f.id===id)?.notes||[];kept[id]=notes.filter(note=>{const ok=saved.some(old=>old.id===note.id&&old.pieceId===note.pieceId&&JSON.stringify(old.anchor)===JSON.stringify(note.anchor));if(!ok)dropped++;return ok;});}
    const unsaved=Object.fromEntries(merged.project.furniture.map(f=>{const saved=result.guide.furniture.find(g=>g.id===f.id);return [f.id,f.pieces.filter(p=>!saved?.pieces.some(old=>old.id===p.id)).map(p=>p.id)];}));
    setIds(chosen);setProject(merged.project);setOrphans(kept);setUnsavedCodes(unsaved);setRenumbered(previous=>new Set([...previous].filter(id=>chosen.includes(id))));setRevision(result.guide.revision);setFingerprint(result.fingerprint);setNameWarnings({});
    if(!merged.project.furniture.some(f=>f.id===furniture?.id)){setFurnitureId(merged.project.furniture[0].id);setPieceId('');setNoteId('');}
    const changed=editsFor(merged.project,kept).some(f=>JSON.stringify(f)!==JSON.stringify(withoutCodeHistory(result.guide.furniture.find(saved=>saved.id===f.id))));
    setDirty(changed);void request('dirty',{value:changed}).catch(()=>{});
    return {project:merged.project,orphans:kept,fingerprint:result.fingerprint,revision:result.guide.revision,dropped};
  }
  const droppedNotice=(count:number)=>count?` ${count===1?'Se quitó 1 nota':`Se quitaron ${count} notas`} sin guardar cuya pieza ya no está en el modelo.`:'';
  async function save(closeAfterSave=false,replacement?:Furniture,projectOverride?:Project,saveFile=saveSkp){
    if(contextChanged){setError('Cambió el modelo activo. Volvé al modelo original para guardar esta guía o analizá el nuevo después de conservar tus cambios.');return false;}
    if(!project||draftHidden!==null)return false;
    return await run('Guardando guía…',async()=>{
      await ensureRuntime();
      let source=projectOverride||project;
      if(replacement)source={...source,furniture:source.furniture.map(f=>f.id===replacement.id?replacement:f)};
      let current={orphans,revision,dropped:0};
      // Point 18: with the analysis out of date the guide is saved anyway: it goes by id, so it is rebuilt on the live model first.
      if(modelAnalysisStale){const fresh=await refreshGuides(source.furniture.map(f=>f.id),true,source);source=fresh.project;current=fresh;}
      const code=workCodeNow.current,prepared={...source,furniture:autoModules(source.furniture.map(f=>ensureGuide(normalizeNaming(f,code))),code)};
      for(const f of prepared.furniture){const issues=[...guideIssues(f),...namingIssues(f)];if(issues.length)throw new Error(`${f.name}: ${issues.join(' ')}`);}
      const result=await request<{guide:Guide;modelSaved:boolean;path:string;fingerprint:string;document:RawDocument;skippedNames?:{id:string;reason:string}[]}>('save',{furniture:editsFor(prepared,current.orphans,renumbered),revision:current.revision,saveFile,syncNames,workCode:code,closeAfterSave});
      const stored=mergeGuide(result.document,result.guide);
      stored.project.furniture=stored.project.furniture.map(ensureGuide);setProject(stored.project);setOrphans(stored.orphans);setUnsavedCodes(stored.unsaved);setRenumbered(new Set());setFingerprint(result.fingerprint);setRevision(result.guide.revision);setDirty(false);setFilePending(!result.modelSaved);
      // Point 20: a row that could not be renamed keeps its name in SketchUp and shows why on the row.
      const skipped=result.skippedNames||[];setNameWarnings(Object.fromEntries(skipped.map(row=>[row.id,row.reason])));
      const notRenamed=skipped.length?` ${skipped.length===1?'1 nombre no se cambió':`${skipped.length} nombres no se cambiaron`} en SketchUp: mirá el aviso en ${skipped.length===1?'su fila':'cada fila'}.`:'';
      if(result.modelSaved&&!notRenamed&&!current.dropped)setMessage('Guía y archivo SketchUp guardados.');
      else if(result.modelSaved)setMessage(`Guía y archivo SketchUp guardados.${notRenamed}${droppedNotice(current.dropped)}`,undefined,'warning');
      else setMessage(`Guía guardada en el modelo abierto. Falta guardar el archivo .skp para conservarla al cerrar.${notRenamed}${droppedNotice(current.dropped)}`,{label:'Guardar SKP',kind:'save'},'warning');
    });
  }
  async function exportPdf(){
    if(contextChanged){setError('Cambió el modelo activo. Volvé a analizar antes de exportar.');return;}
    if(!project||draftHidden!==null)return;
    await run('Preparando PDF A4…',async()=>{
      await ensureRuntime();
      let source=project,print=fingerprint,dropped=0;
      // Points 18 and 23: an out-of-date analysis or a new choice of furniture regenerates the guides, keeping the edits.
      if(modelAnalysisStale||(selectionChanged&&ids.length)){const fresh=await refreshGuides(selectionChanged&&ids.length?ids:project.furniture.map(f=>f.id),modelAnalysisStale);source=fresh.project;print=fresh.fingerprint;dropped=fresh.dropped;}
      source={...source,furniture:autoModules(source.furniture,workCodeNow.current)};
      for(const f of source.furniture){const issues=[...guideIssues(f),...namingIssues(f)];if(issues.length)throw new Error(`${f.name}: ${issues.join(' ')}`);}
      // F-DESP-B: rows that validate print their order data; the rest print «pendiente de pedido».
      const order=printMaterials?await request<PartialReferences>('order_references_partial'):undefined;
      const bytes=await createOfflinePdf(source,decode64(regularFont),decode64(monoFont),decode64(logo),order?.references,{pending:order?.pending});
      // Orphan notes are a notice, not a blocker (point 22): they are not printed, so they stay out of the export check.
      const result=await request<{path?:string;cancelled?:boolean}>('pdf',{fingerprint:print,furniture:editsFor(source,{},renumbered),base64:encode64(bytes)});
      if(result.cancelled)setMessage('Exportación cancelada.',undefined,'info');else setMessage(`PDF A4 guardado: ${result.path}${droppedNotice(dropped)}`);
    });
  }
  function selectPiece(id:string,focus=false,fromDrawing=false){
    if(fromDrawing)setPieceQuery('');
    setPieceId(id);
    if(destination==='furniture'&&!picking)void highlightRoute(id);
    if(focus)requestAnimationFrame(()=>{
      const container=partsScroll.current;
      const rowId=rows.find(row=>row.memberIds.includes(id))?.id||id;
      const input=container?.querySelector<HTMLElement>(`[data-piece-name="${CSS.escape(rowId)}"]`);
      const row=input?.closest('tr');
      if(container&&row){
        const c=container.getBoundingClientRect(),r=row.getBoundingClientRect();
        if(r.top<c.top)container.scrollTop+=r.top-c.top;
        else if(r.bottom>c.bottom)container.scrollTop+=r.bottom-c.bottom;
        container.scrollLeft=0;
        if(input instanceof HTMLInputElement){input.focus({preventScroll:true});input.select();}
        const visible=input?.getBoundingClientRect();
        if(visible&&visible.bottom>window.innerHeight-16)window.scrollBy(0,visible.bottom-window.innerHeight+16);
        else if(visible&&visible.top<12)window.scrollBy(0,visible.top-12);
      }
    });
  }
  function startNameEdit(id:string){if(editSnapshot.current?.id===id)return;editSnapshot.current={id,bases:structuredClone(furniture?.naming?.bases||[]),dirty};setPieceId(id);setEditingPieceId(id);}
  function cancelNameEdit(id:string){const previous=editSnapshot.current;if(!previous||previous.id!==id||!furniture)return;const members=new Set(rows.find(row=>row.id===id)?.memberIds||[id]);setProject(project=>project?{...project,furniture:project.furniture.map(f=>f.id===furniture.id?withNaming({...f,naming:{...f.naming!,bases:f.naming!.bases.map(base=>members.has(base.id)?previous.bases.find(old=>old.id===base.id)||base:base)}},workCode):f)}:project);if(!previous.dirty){setDirty(false);void request('dirty',{value:false}).catch(()=>{});}editSnapshot.current=undefined;setEditingPieceId('');}
  function stepNameEdit(id:string){editSnapshot.current=undefined;setEditingPieceId('');const index=visiblePieces.findIndex(row=>row.id===id),next=visiblePieces[index+1];if(next)requestAnimationFrame(()=>partsScroll.current?.querySelector<HTMLInputElement>(`input[data-piece-name="${CSS.escape(next.id)}"]`)?.focus());}
  async function highlightRoute(id:string){if(!scan||contextChanged||modelAnalysisStale||busy||showSmartPaint||showPhotoMaterial||showPaint)return;const sequence=++highlightSequence.current;try{await request('piece_highlight',{pieceId:id});}catch(value){if(sequence===highlightSequence.current)setMessage(`No se pudo resaltar esta pieza: ${value instanceof Error?value.message:String(value)}`,undefined,'warning');}}
  function pick(id:string,anchor:Vec3){
    selectPiece(id,!picking,true);
    if(!picking||!furniture)return;
    if(picking==='new'){
      if(furniture.notes.length+orphanNotes.length>=40){setError('Cada mueble admite hasta 40 notas.');return;}
      const newNote:Note={id:crypto.randomUUID(),pieceId:id,anchor,position:[718,32+(furniture.notes.length%4)*110],text:'Nueva indicación'};
      changeFurniture(f=>({...f,notes:[...f.notes,newNote]}));setNoteId(newNote.id);
    }else{
      const target=[...furniture.notes,...orphanNotes].find(n=>n.id===picking);
      if(target){changeFurniture(f=>({...f,notes:[...f.notes.filter(n=>n.id!==target.id),{...target,pieceId:id,anchor}]}));setOrphans(o=>({...o,[furniture.id]:(o[furniture.id]||[]).filter(n=>n.id!==target.id)}));}
    }
    setPicking(undefined);
  }
  function updateNote(text:string){
    if(!note||!furniture)return;
    if(orphanNotes.some(n=>n.id===note.id)){setOrphans(o=>({...o,[furniture.id]:o[furniture.id].map(n=>n.id===note.id?{...n,text}:n)}));markDirty();}
    else changeFurniture(f=>({...f,notes:f.notes.map(n=>n.id===note.id?{...n,text}:n)}));
  }
  function removeNote(){
    if(!note||!furniture)return;
    changeFurniture(f=>({...f,notes:f.notes.filter(n=>n.id!==note.id)}));
    setOrphans(o=>({...o,[furniture.id]:(o[furniture.id]||[]).filter(n=>n.id!==note.id)}));setNoteId('');setPicking(undefined);
  }
  function setCode(value:string){
    const typed=value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2),code=effectiveWorkCode(typed);setWorkCodeInput(typed);workCodeNow.current=code;workCodeTyped.current=true;
    setProject(p=>p?{...p,furniture:autoModules(p.furniture.map(f=>withNaming(f,code)),code)}:p);if(project)markDirty();
  }
  function visibleTree(nodes:RawNode[]):RawNode[]{
    return nodes.flatMap(node=>{
      const selected=ids.some(id=>id===node.id||node.id.startsWith(id+'/'));
      const children=visibleTree(node.children);
      return filter==='all'||(filter==='selected'?selected:!selected)||children.length?[{...node,children:filter==='all'?node.children:children}]:[];
    });
  }
  function tree(nodes:RawNode[],depth=0):React.ReactNode{
    return nodes.map(node=>{
      const count=countPieces(node);
      return <div key={node.id} className="tree-node">
        <label><input type="checkbox" checked={ids.includes(node.id)} disabled={!!busy||count===0} onChange={()=>toggle(node.id)}/><span>{node.name}<small>{plural(count,'pieza','piezas')}{node.children.length===0&&node.mesh?' · pieza aislada':''}{!node.metadata?.effectiveVisible&&node.metadata?' · oculto':''}</small></span></label>
        {!!node.metadata?.errors?.length&&<p className="inline-error">{node.metadata.errors.join(' ')}</p>}
        {node.children.length>0&&<details><summary>Ver contenido</summary>{tree(node.children,depth+1)}</details>}
      </div>;
    });
  }
  function acceptPaintScan(result:unknown,warning?:string){setCatalogRefresh(value=>value+1);if(result){acceptScan(result as Scan);setMessage(warning||'Modelo actualizado. Generá las guías para refrescar las vistas; se conservan los ajustes guardados. Revisá y confirmá el pedido antes del TXT.');}else{setProject(undefined);setScan(undefined);setError(warning||'El modelo cambió, pero no se pudo refrescar el análisis. Volvé a analizar antes de generar guías o pedidos.',{label:'Analizar de nuevo',kind:'analyze'});}}
  function openPalette(compact=false,catalogId?:string,autoStart=false){
    const reason=blockReason('paint',autoStart);if(reason){setError(`No se puede pintar. ${reason}.`);return;}
    setQuickIntent(undefined);setPaintCatalogId(catalogId);setPaintAutoStart(compact?true:autoStart);setCompactPaint(compact);setShowSmartPaint(true);
  }
  function navigateModule(next:Module):boolean{
    if(busy){setError('Esperá a que termine la operación actual.');return false;}
    if(workshopDirty||(libraryDirty&&next!=='materials')){const owner:Module=libraryDirty&&next!=='materials'?'materials':'order';setError(`Hay cambios sin guardar en ${moduleLabel(owner)}. ${owner==='order'?'Guardá el borrador o descartalo':'Guardá o cancelá los cambios de la biblioteca'} antes de cambiar de sección.`,owner==='materials'&&!workshopDirty&&destination!=='materials'?{label:`Ir a ${moduleLabel(owner)}`,kind:'module',module:owner}:undefined);return false;}
    if(draftHidden!==null&&next!=='guides'){setError('Aplicá o cancelá la previsualización de piezas ocultas antes de cambiar de sección.');return false;}
    setError('');if(messageTone==='warning'||messageAction)setMessage('');setShowWorkshop(false);setShowPaint(false);setShowMaterials(false);setShowSuggestions(false);setPicking(undefined);
    setDestination(next);if(next==='furniture'&&scan&&!project&&!dirty){const roots=selectedFurnitureIds(scan.selected,scan.tree.roots);if(roots.length)void generate(roots,'furniture');}if(next==='materials')setMaterialsVisited(true);
    requestAnimationFrame(()=>{window.scrollTo(0,0);if(!document.querySelector('[aria-modal="true"]'))document.querySelector<HTMLElement>('.ux-module-heading')?.focus({preventScroll:true});});
    return true;
  }
  async function highlightNativePiece(){
    if(!piece)return;
    await run('Resaltando pieza en SketchUp…',async()=>{
      const result=await request<{message?:string}>('piece_highlight',{pieceId:piece.id});setMessage(result.message||'Pieza seleccionada en el modelo de SketchUp.');
    });
  }
  useLayoutEffect(()=>{quickHandler.current=intent=>{
    if(workshopDirty||libraryDirty){setError('Hay cambios de biblioteca, importación o pedido sin guardar. Guardalos o cancelalos antes de usar otro acceso rápido.');return;}
    if(busy){setError('Esperá a que termine la operación actual antes de usar otro acceso rápido.');return;}
    if((dirty||draftHidden!==null||contextChanged)&&!['furniture','guides'].includes(intent.action)){setError('Conservá los cambios pendientes y aplicá o cancelá la visibilidad antes de cambiar de herramienta.');return;}
    const refreshed=!!intent.scan&&!dirty&&draftHidden===null;
    if(refreshed)acceptPaintScan(intent.scan,intent.refreshWarning);
    else if(intent.scanRequired){setScan(undefined);setError(intent.refreshWarning||'El modelo cambió. Volvé a analizar antes de continuar.',{label:'Analizar de nuevo',kind:'analyze'});return;}
    setError('');setMessage(intent.message||'');
    if(['sheet','edge','remove_edge','sample'].includes(intent.action)){
      setShowWorkshop(false);setShowPaint(false);setShowMaterials(false);setShowSuggestions(false);setQuickIntent(intent);setPaintCatalogId(undefined);setCompactPaint(true);setShowSmartPaint(true);return;
    }
    setShowSmartPaint(false);setQuickIntent(undefined);setShowPaint(false);setShowMaterials(false);setShowSuggestions(false);
    void request('smart_palette_compact',{compact:false}).catch(()=>{});
    if(intent.action==='order'){setDestination('order');setWorkshopTab('order');setShowWorkshop(false);requestAnimationFrame(()=>window.scrollTo(0,0));return;}
    if(intent.action==='materials'){if(intent.destination==='visuals'){setPaintPieceId(piece?.id);setShowPaint(true);}else{setDestination('materials');setMaterialsVisited(true);}setShowWorkshop(false);requestAnimationFrame(()=>window.scrollTo(0,0));return;}
    if(intent.action==='home'){setDestination('home');setShowWorkshop(false);requestAnimationFrame(()=>window.scrollTo(0,0));return;}
    setDestination(intent.action==='furniture'?'furniture':'guides');
    setShowWorkshop(false);setPieceQuery('');setOnlySelected(false);
    const liveProject=refreshed?undefined:project,liveScan=(intent.scan||scan) as Scan|undefined;
    const paths=intent.selectionPaths?.length?intent.selectionPaths:liveScan?.selected||[];
    const selectedFurniture=liveProject?.furniture.find(f=>paths.some(path=>path===f.id||path.startsWith(f.id+'/')||f.id.startsWith(path+'/')));
    if(selectedFurniture){setFurnitureId(selectedFurniture.id);setPieceId(selectedFurniture.pieces.find(p=>paths.includes(p.id))?.id||'');setNoteId('');setPicking(undefined);}
    else if(!liveProject&&liveScan){const sourceScan=liveScan;const roots=selectedFurnitureIds(paths,sourceScan.tree.roots);if(roots.length){setIds(roots);if(!dirty)void generate(roots,intent.action==='furniture'?'furniture':'guides');}}
    setMessage(intent.message||(project?'Revisá el mueble y sus piezas. No se aplicaron nombres ni se exportó ningún archivo.':'Elegí el mueble y pulsá Generar guías para revisar nombres, vistas y notas.'));
    requestAnimationFrame(()=>{const target=document.querySelector<HTMLElement>(project?(intent.action==='furniture'?'.parts-config':'.assembly-drawing'):'#furniture-chooser');target?.scrollIntoView({block:'start'});if(intent.action==='furniture'&&project)target?.querySelector<HTMLInputElement>('input[aria-label="Nombre del grupo"]')?.focus({preventScroll:true});});
  };});
  function blockReason(kind:Block,allowLibrary=false):string|undefined{
    if(busy)return `Esperá a que termine «${busy.replace(/…$/,'')}»`;
    if(kind==='nav')return undefined;
    if(kind==='tools')return scan?undefined:'Esperá a que se analice el modelo abierto';
    // Painting works on the live model with its own per-click inventory, like OpenCutList: it never waits for the analysis or the guide.
    if(kind==='paint')return libraryDirty&&!allowLibrary?'Guardá o cancelá los cambios de Materiales':undefined;
    if(contextChanged)return 'Volvé al modelo original de la guía';
    // Point 18: saving and exporting rebuild the guide on the live model by id, so an old analysis never blocks them.
    if(draftHidden!==null)return 'Aplicá o cancelá las piezas ocultas';
    if(!project)return 'Primero generá las guías en Muebles';
    return undefined;
  }
  const saveBlock=blockReason('save'),exportBlock=blockReason('export'),paintBlock=blockReason('paint'),navBlock=blockReason('nav'),toolsBlock=blockReason('tools');
  const guidePending=contextChanged||modelAnalysisStale?'Análisis desactualizado':dirty?'Guía sin guardar':filePending?'Falta guardar el SKP':undefined;
  const pending:Record<Module,string|undefined>={home:undefined,materials:libraryDirty?'Cambios de biblioteca sin guardar':undefined,furniture:guidePending,pieces:undefined,order:workshopDirty?'Biblioteca o pedido sin guardar':undefined,guides:guidePending};
  const dialogOpen=showSmartPaint||showPhotoMaterial||showPaint||showMaterials||showWorkshop||showSuggestions||showCodePlan||!!pendingConfirm;
  function runNoticeAction(action:NoticeAction){setError('');setMessage('');if(action.kind==='analyze')void analyze();else if(action.kind==='generate')void generate();else if(action.kind==='save')void save(false,undefined,undefined,true);else if(action.kind==='workshop')openWorkshop('order');else if(action.module)navigateModule(action.module);}
  // Planos never edits names: its links open «Proponer nombres» in Muebles, where the front is marked too.
  function proposeNames(){if(navigateModule('furniture'))setShowSuggestions(true);}
  function openWorkshop(tab:'catalog'|'order'){if(toolsBlock){setError(`No se puede abrir la biblioteca del taller. ${toolsBlock}.`);return;}setWorkshopTab(tab);setShowWorkshop(true);}
  const helpTrigger=useRef<HTMLSpanElement>(null),diagnosticOutput=useRef<HTMLPreElement>(null),[copyStatus,setCopyStatus]=useState('');
  async function copyDiagnostic(){try{await navigator.clipboard.writeText(diagnostic);setCopyStatus('Diagnóstico copiado. Pegalo en el mensaje de soporte.');}catch{const target=diagnosticOutput.current,selection=window.getSelection();if(target&&selection){const range=document.createRange();range.selectNodeContents(target);selection.removeAllRanges();selection.addRange(range);}setCopyStatus('No se pudo copiar automáticamente: el diagnóstico quedó seleccionado, copialo con Ctrl+C.');}}
  useLayoutEffect(()=>{shortcutHandler.current=event=>{
    const action=shortcutFor(event,dialogOpen);if(!action)return;event.preventDefault();
    if(action==='save'){if(saveBlock)setError(`No se puede guardar. ${saveBlock}.`);else void save();}
    else if(action==='export'){if(exportBlock)setError(`No se puede exportar. ${exportBlock}.`);else void exportPdf();}
    else if(action==='help')helpTrigger.current?.querySelector<HTMLButtonElement>('.help-trigger')?.click();
    else navigateModule(action);
  };});
  const palette=showSmartPaint?<SmartPaintPalette quickMode={compactPaint} initialCatalogId={paintCatalogId} autoStart={paintAutoStart} onCreateMaterial={()=>{setQuickIntent(undefined);setPaintAutoStart(false);setShowSmartPaint(false);setPhotoTarget(undefined);setShowPhotoMaterial(true);}} onAssignPhoto={target=>{setQuickIntent(undefined);setPaintAutoStart(false);setShowSmartPaint(false);setPhotoTarget(target);setShowPhotoMaterial(true);}} initialCompact={compactPaint} quickIntent={quickIntent} onApplied={acceptPaintScan} onClose={()=>setShowSmartPaint(false)} onManage={destination=>{setShowSmartPaint(false);if(destination==='catalog'){setDestination('materials');setMaterialsVisited(true);}else{setPaintPieceId(piece?.id);setShowPaint(true);}}}/>:null;
  return <>{showPhotoMaterial&&<PhotoMaterialPanel replacement={photoTarget} initialKind={photoTarget?.kind} onClose={()=>{setShowPhotoMaterial(false);setPhotoTarget(undefined);setPaintAutoStart(false);setShowSmartPaint(true);}} onCreated={(result,options)=>{const assigned=photoTarget?.assign===true;setShowPhotoMaterial(false);setPhotoTarget(undefined);if(assigned&&!options.paint){setCatalogRefresh(value=>value+1);setShowSmartPaint(true);return;}if(result.scan)acceptPaintScan(result.scan,result.refreshWarning);else if(result.refreshWarning)acceptPaintScan(undefined,result.refreshWarning);else setCatalogRefresh(value=>value+1);if(options.paint&&(result.scan||(result as {stale?:boolean}).stale===true)){setQuickIntent(undefined);setPaintCatalogId(result.catalogId);setPaintAutoStart(true);setCompactPaint(true);setShowSmartPaint(true);}else{setShowSmartPaint(false);setDestination('materials');setMaterialsVisited(true);}}}/>} {palette}<div className={`ux-shell destination-${destination}`} hidden={showSmartPaint}>
    <a className="ux-skip" href="#module-content">Ir al contenido</a>
    <nav className="ux-rail" aria-label="Módulos de Planos Santo"><div className="ux-brand" title="Planos Santo">S<span>PLANOS</span></div>{modules.map(([id,label,description])=>{const shortcut=(moduleShortcuts as string[]).indexOf(id)+1,keys=shortcut?`Alt+${shortcut}`:undefined;return <button key={id} type="button" aria-current={destination===id?'page':undefined} aria-keyshortcuts={keys} aria-describedby={[pending[id]&&`rail-pending-${id}`,navBlock&&'rail-block-reason'].filter(Boolean).join(' ')||undefined} aria-disabled={navBlock?true:undefined} title={[description,pending[id],navBlock,keys].filter(Boolean).join(' · ')} onClick={()=>navigateModule(id)}><ModuleIcon name={id}/><span>{label}</span>{pending[id]&&<><span className="ux-rail-badge" aria-hidden="true"/><span id={`rail-pending-${id}`} hidden>{pending[id]}</span></>}</button>;})}<span id="rail-block-reason" className="sr-only">{navBlock}</span><div className="ux-rail-divider"/><button type="button" title={paintBlock?`Pintar: ${paintBlock}`:'Pintura Inteligente · paleta compacta'} aria-disabled={paintBlock?true:undefined} aria-describedby={paintBlock?'rail-paint-reason':undefined} onClick={()=>openPalette(true)}><ModuleIcon name="paint"/><span>Pintar</span><span id="rail-paint-reason" className="sr-only">{paintBlock}</span></button><span className="ux-offline">LOCAL<br/>SIN NUBE</span></nav>
    <div className="ux-stage"><header className="ux-topbar"><div><span className="ux-breadcrumb">Planos Santo <span aria-hidden="true">/</span> {modules.find(([id])=>id===destination)?.[1]}</span><h1 className="ux-module-heading" tabIndex={-1}>{modules.find(([id])=>id===destination)?.[1]}</h1></div><div className="ux-topbar-tools" style={{flexWrap:'wrap',minWidth:0,justifyContent:'flex-end'}}>{lastNotice&&<details className="ux-last-notice" open={lastOpen} onToggle={event=>setLastOpen(event.currentTarget.open)}><summary>Último aviso <span>{lastNotice.time}</span></summary>{lastOpen&&<p className={lastNotice.tone==='error'?'error':lastNotice.tone==='warning'?'warning':'success'}>{lastNotice.text}</p>}</details>}<button type="button" className="quiet ux-fold" aria-pressed={windowFolded} disabled={!!busy} title={windowFolded?'Volver al tamaño anterior de la ventana':'Achicar esta ventana y volver al modelo de SketchUp'} onClick={()=>void toggleWindowFold()}>{windowFolded?'Desplegar':'Plegar'}</button><span ref={helpTrigger} className="ux-help-shortcuts"><HelpPopover title="Atajos y diagnóstico"><h3>Atajos de teclado</h3><dl className="ux-shortcuts">{moduleShortcuts.map((id,index)=><div key={id}><dt><kbd>Alt</kbd>+<kbd>{index+1}</kbd></dt><dd>{moduleLabel(id)}</dd></div>)}<div><dt><kbd>Ctrl</kbd>+<kbd>S</kbd></dt><dd>Guardar guía</dd></div><div><dt><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd></dt><dd>Exportar PDF A4</dd></div><div><dt><kbd>Escape</kbd></dt><dd>Cancelar o cerrar</dd></div><div><dt><kbd>?</kbd></dt><dd>Abrir esta ayuda</dd></div></dl><p>No actúan con un diálogo abierto ni mientras escribís en notas, listas o menús. En un campo de una línea funcionan Ctrl+S, Ctrl+Shift+E y Alt+1 a Alt+5; ? no, para que puedas escribirlo.</p><h3>Si necesitás ayuda con un error</h3><p>El diagnóstico muestra la versión instalada. No envía tu modelo.</p><div className="ux-diagnostic-actions"><button type="button" disabled={!!busy} onClick={()=>{setCopyStatus('');void run('Comprobando instalación…',async()=>{const result=await request('diagnostic');setDiagnostic(JSON.stringify(result,null,2));});}}>Ver diagnóstico</button>{diagnostic&&<button type="button" onClick={()=>void copyDiagnostic()}>Copiar diagnóstico</button>}</div>{diagnostic&&<pre ref={diagnosticOutput} className="ux-diagnostic" tabIndex={0} aria-label="Diagnóstico de la instalación">{diagnostic}</pre>}<span role="status" className="ux-copy-status">{copyStatus}</span></HelpPopover></span></div><div className="ux-project-context"><span>{scan?.tree.modelName||project?.name||'Modelo de SketchUp'}</span><strong><em className="ux-version-chip" title={`Versión ${version} en prueba. Extensión candidata: instalación y revisión visual pendientes en SketchUp 2026 Windows.`}>v{version} · en prueba</em>{contextChanged?'Modelo cambiado':modelAnalysisStale?'Análisis desactualizado':dirty||libraryDirty||workshopDirty?'Cambios pendientes':filePending?'Falta guardar SKP':project?'Guía en revisión':'Elegí un mueble'}</strong></div></header>
    <div id="module-content" className="offline-app">


    {showCodePlan&&furniture&&<CodePlanDialog furniture={furniture} unsaved={unsavedCodes[furniture.id]||NO_UNSAVED_CODES} references={previewReferences} loadReferences={()=>request<PartialReferences>('order_references_partial').then(result=>result.references)} onClose={()=>{setShowCodePlan(false);codePlanTrigger.current?.focus();}} onApply={(codes,renumber)=>{changeFurniture(f=>({...f,pieces:f.pieces.map(p=>codes[p.id]?{...p,code:codes[p.id]}:p)}));if(renumber)setRenumbered(old=>new Set([...old,furniture.id]));setShowCodePlan(false);codePlanTrigger.current?.focus();setMessage('Códigos aplicados. Guardá la guía para conservarlos.');}}/>}
    {showSuggestions&&furniture&&<NameSuggestions furniture={furniture} workCode={workCode} onConfirm={f=>save(false,f)} busy={!!busy} error={error} syncNames={syncNames} onClose={()=>{setShowSuggestions(false);suggestionsTrigger.current?.focus();}}/>}
    {showWorkshop&&<WorkshopPanel initialCatalogId={catalogFocus} initialTab={workshopTab} onDirtyChange={setWorkshopDirty} onClose={()=>{setShowWorkshop(false);setCatalogRefresh(value=>value+1);workshopTrigger.current?.focus();}}/>}
    {showPaint&&<PaintPanel initialPieceId={paintPieceId} onClose={()=>{setShowPaint(false);paintTrigger.current?.focus();}} onApplied={acceptPaintScan}/>}
    {showMaterials&&<MaterialReview onClose={()=>{setShowMaterials(false);materialTrigger.current?.focus();}}/>}
    <header className="app-header"><img className="workshop-logo" src={`data:image/png;base64,${logo}`} alt="Santo Carpintero · Amoblamientos"/><div className="app-title"><strong>Planos Santo</strong><small>Guías de armado para el taller</small></div><div className="header-actions"><button ref={workshopTrigger} aria-disabled={toolsBlock?true:undefined} title={toolsBlock} onClick={()=>openWorkshop('catalog')}>Biblioteca del taller</button><button ref={smartPaintTrigger} aria-disabled={paintBlock?true:undefined} aria-describedby={paintBlock?'header-paint-reason':undefined} title={paintBlock?`Pintura avanzada: ${paintBlock}`:'Ajustes avanzados de caras, alcance y reemplazo de materiales'} onClick={()=>openPalette(false)}>Pintura avanzada</button><button ref={paintTrigger} aria-disabled={paintBlock?true:undefined} aria-describedby={paintBlock?'header-paint-reason':undefined} title={paintBlock?`Pintar placas y cantos: ${paintBlock}`:'Seleccionar caras y pintar materiales reales en SketchUp'} onClick={()=>{if(paintBlock){setError(`No se puede pintar. ${paintBlock}.`);return;}setPaintPieceId(piece?.id);setShowPaint(true);}}>Pintar placas y cantos</button><span id="header-paint-reason" className="sr-only">{paintBlock}</span><button ref={materialTrigger} aria-disabled={toolsBlock?true:undefined} title={toolsBlock} onClick={()=>{if(toolsBlock)setError(`No se puede abrir Materiales y cantos. ${toolsBlock}.`);else setShowMaterials(true);}}>Materiales y cantos</button><span className={`save-state ${dirty||filePending?'pending':''}`}>{dirty?'Guía sin guardar':filePending?'Falta guardar el SKP':project?'Sin cambios pendientes':''}</span><details className="save-options"><summary>Opciones de guardado</summary><label><input type="checkbox" checked={printMaterials} onChange={e=>setPrintMaterials(e.target.checked)}/> Incluir materiales y cantos del pedido revisado en el PDF</label><p>Requiere un borrador de pedido completo, guardado y vigente. Las piezas excluidas no reciben especificación de material.</p><label><input type="checkbox" disabled={!!busy} checked={saveSkp} onChange={e=>setSaveSkp(e.target.checked)}/> Guardar también el archivo SKP</label><label><input type="checkbox" disabled={!!busy} checked={syncNames} onChange={e=>{setSyncNames(e.target.checked);markDirty();}}/> Sincronizar nombres de grupos y piezas en SketchUp</label><p>Si una pieza aparece en varios cajones compartidos, todas sus apariciones deben tener el mismo nombre. Para usar nombres distintos solo en el plano, desactivá la sincronización.</p><p>Guardar SKP conserva también los demás cambios del modelo abierto. Ctrl+Z deshace el guardado de guía y nombres en el modelo.</p></details><div className="action-with-help"><button disabled={!!saveBlock} aria-keyshortcuts="Control+S" title={saveBlock?`Guardar guía: ${saveBlock}`:'Guardar guía · Ctrl+S'} onClick={()=>void save()}>Guardar guía<small aria-hidden="true">{saveSkp?' + SKP':' · modelo abierto'}</small></button><HelpPopover title="Guardar guía"><p>Guarda nombres, notas y ajustes dentro del archivo SketchUp, junto con los cambios que tenga el modelo abierto.</p><p>Si el archivo es nuevo, SketchUp te pide dónde guardarlo. Si cancelás, falta guardar el SKP para conservar la guía al cerrar.</p></HelpPopover></div><button disabled={!!saveBlock} title={saveBlock?`Guardar y cerrar: ${saveBlock}`:undefined} onClick={()=>void save(true)}>Guardar y cerrar</button><div className="ux-primary-action"><div className="action-with-help"><button className="primary" disabled={!!exportBlock} aria-keyshortcuts="Control+Shift+E" aria-describedby={exportBlock?'export-block-reason':undefined} title={exportBlock?`Exportar PDF A4: ${exportBlock}`:'Exportar PDF A4 · Ctrl+Shift+E'} onClick={()=>void exportPdf()}>Exportar PDF A4</button><HelpPopover title="PDF para imprimir"><p>Exporta todas las guías generadas: una hoja A4 horizontal por mueble, con piezas, medidas y flechas.</p><p>Si algo no cabe o una nota perdió su destino, te indica qué corregir. Al imprimir, elegí tamaño real o 100 %.</p></HelpPopover></div>{exportBlock&&<small id="export-block-reason" className="ux-block-reason">{exportBlock}</small>}</div></div></header>
    <StaleBanner stale={modelAnalysisStale&&!contextChanged} deferred={scanDeferred&&!scan&&!contextChanged&&!DEFERRED_SCAN_ACTIONS.has(destination)} busy={!!busy} onStaleChange={setModelAnalysisStale} onReanalyze={()=>void analyze()}/>
    <div className="ux-notices">{pendingConfirm&&<div role="alertdialog" aria-modal="false" aria-labelledby="ux-confirm-title" aria-describedby="ux-confirm-detail" className="ux-confirm" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeConfirm(false);}}}><div><strong id="ux-confirm-title">{pendingConfirm.title}</strong><p id="ux-confirm-detail">{pendingConfirm.detail}</p></div><div className="ux-confirm-actions"><button ref={confirmCancel} type="button" onClick={()=>closeConfirm(false)}>Seguir editando</button><button type="button" className="danger" onClick={()=>closeConfirm(true)}>{pendingConfirm.confirmLabel}</button></div></div>}
    {busy&&<div role="status" className="status ux-busy"><span className="ux-spinner" aria-hidden="true"/><span>{busy}</span>{elapsed>=2&&<span className="ux-busy-time" aria-hidden="true"> · {elapsed} s</span>}</div>}
    {error&&<div role="alert" className="error ux-notice"><span>{error}</span>{errorAction&&<button type="button" className="ux-notice-action" onClick={()=>runNoticeAction(errorAction)}>{errorAction.label}</button>}<button type="button" className="ux-notice-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={()=>setError('')}>×</button></div>}
    {message&&<div role="status" className={`${messageTone==='warning'?'warning':'success'} ux-notice`} data-tone={messageTone} onPointerEnter={()=>setNoticeHold(true)} onPointerLeave={()=>setNoticeHold(false)} onFocus={()=>setNoticeHold(true)} onBlur={()=>setNoticeHold(false)}><span>{message}</span>{messageAction&&<button type="button" className="ux-notice-action" onClick={()=>runNoticeAction(messageAction)}>{messageAction.label}</button>}<button type="button" className="ux-notice-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={()=>{setMessage('');setNoticeHold(false);}}>×</button></div>}</div>
    {materialsVisited&&<div className="ux-materials-content" hidden={destination!=='materials'}><MaterialLibraryPanel refreshKey={catalogRefresh} onApplied={acceptPaintScan} onEdit={id=>{setCatalogFocus(id);setWorkshopTab('catalog');setShowWorkshop(true);}} onPaint={(id,autoStart)=>openPalette(true,id,autoStart)} onManageModel={()=>{setPaintPieceId(piece?.id);setShowPaint(true);}} onDirtyChange={setLibraryDirty} onChanged={()=>setMessage('Biblioteca del taller actualizada. Revisá las fichas antes de usar materiales en producción.')} onClose={()=>navigateModule('home')}/></div>}
    {destination==='order'&&<section className="ux-order-content" aria-label="Maderera"><div className="ux-module-intro"><div><span className="eyebrow">DEL MUEBLE AL CORTE</span><h2>Placas del proyecto para la maderera</h2><p>Todas las piezas de los muebles analizados, optimizadas por placa (material y espesor). Exportá un TXT por placa.</p></div></div><WorkshopPanel embedded initialTab="order" onDirtyChange={setWorkshopDirty} onClose={()=>{setWorkshopDirty(false);setDestination('home');}}/></section>}
    {destination==='pieces'&&<CutlistView ready={!!project} onGoToFurniture={()=>navigateModule('furniture')} onEditMaterial={id=>{if(!navigateModule('materials'))return;setCatalogFocus(id);openWorkshop('catalog');}}/>}
    <main hidden={destination==='materials'||destination==='order'||destination==='pieces'} className={`editor-main ${planos&&project?'furniture-hidden':''}`}>
      <aside id="furniture-chooser" className="left-panel" hidden={planos&&!!project}><div className="section-heading"><h2><span>01</span> Elegí los muebles</h2><HelpPopover title="Elegir muebles"><p>Marcar todos propone los grupos padres que contienen piezas. Usar selección de SketchUp toma los grupos que marcaste en SketchUp, incluso dentro de otro grupo.</p><p>Abrí «Ver contenido» para elegir un mueble interno. No se incluye al mismo tiempo un grupo y su descendiente. Los ocultos quedan identificados para que los revises.</p></HelpPopover></div><div className="naming-settings"><label>Abreviatura de la obra<input aria-label="Abreviatura de la obra" value={workCodeInput} maxLength={2} placeholder="VF" onChange={e=>setCode(e.target.value)}/></label><p className="hint">Dos letras. Ejemplo: VF = Vestuarios de Futbol. El módulo se toma de M01, M02… en el nombre del grupo. Al cambiarla se recalculan los nombres propuestos.</p>{namingNotices(workCodeInput).map(text=><p className="warning" role="status" key={text}>{text}</p>)}</div><div className="project-card"><span>MODELO ABIERTO</span><p>{scan?.tree.modelName||'Leyendo SketchUp…'}</p></div><div className="scope-buttons"><button disabled={!!busy} onClick={()=>void analyze('all')}>Marcar todos</button><button disabled={!!busy} onClick={()=>void analyze('selected')}>Usar selección de SketchUp</button></div><p className="hint">Marcá los muebles que necesitás. Revisá los grupos internos antes de generar.</p>
        <label className="tree-filter">Mostrar en el listado<select aria-label="Filtrar muebles" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Todos</option><option value="selected">Seleccionados para generar</option><option value="unselected">No seleccionados para generar</option></select></label><div className="tree">{scan?scan.tree.roots.some(node=>countPieces(node)>0)?tree(visibleTree(scan.tree.roots)):<p className="hint tree-empty">No encontramos grupos ni componentes con piezas en este modelo. Agrupá las placas y volvé a analizar.</p>:busy?<p className="hint tree-empty">Analizando modelo…</p>:null}</div>
        {scan?.tree.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
        <button className="primary wide" disabled={!!busy||!ids.length} onClick={()=>void generate()}>Generar guías ({ids.length})</button>
        <button className="quiet wide" disabled={!!busy} onClick={()=>void analyze()}>Volver a analizar</button>
        <p className="hint">¿Un error? Abrí <strong>?</strong> arriba, en «Atajos y diagnóstico».</p>
      </aside>
      <section className="workspace">
        {destination==='home'?<div className="ux-home"><span className="eyebrow">TRABAJO DE TALLER</span><h2>Del modelo a una guía clara.</h2><p className="ux-home-lead">Elegí el mueble, revisá sus piezas y prepará lo que necesita el taller. Tu modelo original se conserva.</p><div className="ux-current-job"><span>TRABAJO ACTUAL</span><strong>{furniture?.name||scan?.tree.modelName||'Esperando el modelo abierto'}</strong><p>{project?`${plural(project.furniture.length,'mueble','muebles')} · ${plural(project.furniture.reduce((sum,f)=>sum+f.pieces.length,0),'pieza','piezas')} en revisión`:ids.length?`${plural(ids.length,'mueble seleccionado','muebles seleccionados')} para generar`:'Ningún mueble seleccionado'}</p><button className="primary" disabled={!!busy||!scan} onClick={()=>navigateModule(project?'guides':'furniture')}>{project?'Continuar con los planos':'Revisar muebles seleccionados'}</button></div><div className="ux-next-steps">{modules.filter(([id])=>id!=='home').map(([id,label],index)=><button key={id} type="button" onClick={()=>navigateModule(id)}><ModuleIcon name={id}/><strong>{index+1}. {label}</strong><span>{moduleSteps[id]}</span></button>)}</div><p className="ux-home-help">Para pintar directamente en SketchUp usá <strong>Pintar</strong> o la barra nativa. La paleta deja libre el modelo.</p></div>:furniture&&project?<>
          <nav className="furniture-tabs" aria-label="Guías por mueble">{project.furniture.map(f=><button className={f.id===furniture.id?'active':''} key={f.id} disabled={!!busy||draftHidden!==null} onClick={()=>{setDraftHidden(null);setFurnitureId(f.id);setPieceId('');setNoteId('');setPicking(undefined);setPieceQuery('');setOnlySelected(false);setEditingPieceId('');}}>{f.name}<small>{plural(f.pieces.length,'pieza','piezas')}</small></button>)}</nav>
          <div className="guide-heading"><div><span className="eyebrow">{destination==='furniture'?'MUEBLES Y PIEZAS':'FICHA DE ARMADO A4'}</span><h2>{furniture.name}</h2></div><div className="guide-actions"><span className="piece-count">{plural(furniture.pieces.length,'pieza','piezas')} · {project.furniture.length} {project.furniture.length===1?'guía':'guías'} en el PDF</span></div></div>
          {selectionChanged&&!ids.length&&<div className="selection-notice" role="status">No hay muebles elegidos: la guía conserva los anteriores hasta que marques alguno.</div>}
          <div className="assembly-layout">
            <div className="assembly-drawing">
              {planos?<><section className={`view ${picking?'picking':''}`} aria-label="Visor del mueble">
                <div className="view-toolbar"><div className="view-switch" role="group" aria-label="Vista del mueble">{(['front','back'] as const).map(v=><button key={v} aria-label={v==='front'?'Ver exterior':'Ver interior'} aria-pressed={view===v} disabled={!!busy} onClick={()=>setView(v)}>{v==='front'?'Exterior':'Interior'}</button>)}</div><HelpPopover title="Vistas configurables"><p>Las dos vistas miran el frente del mueble (el marcado en Muebles o, si no se marcó, el propuesto). Interior muestra el mismo frente sin puertas ni frentes de cajón para ver el armado, y permite ocultar otras piezas de forma individual. Elegí abajo qué vistas se imprimirán en la hoja A4.</p><p>Girar o quitar piezas en el plano nunca cambia la geometría ni la visibilidad del modelo original. Las notas ancladas a una pieza oculta requieren revisar su visibilidad antes de imprimir.</p></HelpPopover><button className="highlight-toggle" disabled={!!busy||!piece} aria-pressed={highlight} onClick={()=>setHighlight(v=>!v)}>Resaltar pieza</button><button disabled={!!busy||!piece||contextChanged||modelAnalysisStale} onClick={()=>void highlightNativePiece()}>Resaltar en SketchUp</button></div>
                <div className="viewer-tools" role="group" aria-label="Herramienta del plano">{([['select','Seleccionar piezas','Seleccionar'],['orbit','Rotar con el mouse','Rotar'],['dimensions','Mover cotas','Mover cotas']] as const).map(([value,label,text])=><button key={value} disabled={!!busy||(draftHidden!==null&&value!=='select')} aria-label={label} aria-pressed={tool===value&&!picking} onClick={()=>{setTool(value);setPicking(undefined);}}><ToolIcon tool={value}/>{text}</button>)}<button aria-label="Agregar nota" disabled={!!busy||draftHidden!==null} onClick={()=>{setTool('select');setPicking('new');}}>+ Agregar nota</button></div>
                {picking?<div className="pick-hint">Hacé clic sobre una superficie para anclar la flecha. <button onClick={()=>setPicking(undefined)}>Cancelar</button></div>:<p className="viewer-hint">{tool==='orbit'?'Arrastrá el dibujo para rotarlo. El giro de esta vista se guarda con la guía.':tool==='dimensions'?'Arrastrá una cota o usá las flechas del teclado. El visor es la hoja A4 tal como se imprime.':'Tocá una pieza o su ID para encontrar su nombre en el listado.'}</p>}
                <Diagram paper fit highlight={highlight} onOrbit={tool==='orbit'&&!busy&&draftHidden===null?delta=>changeFurniture(f=>({...f,presentation:orbitCamera(f,view,delta)})):undefined} onMoveDimension={tool==='dimensions'&&!busy&&draftHidden===null?(id,role,delta)=>changeFurniture(f=>({...f,presentation:shiftDimension(f,view,id,role,delta,[scene?.width||640,scene?.height||450])})):undefined} onHideDimension={busy||draftHidden!==null||tool!=='select'?undefined:(id,role)=>changeFurniture(f=>({...f,hiddenDimensions:setDimensionVisible(f,id,role,false)}))} layout="sheet" view={view} scene={scene} furniture={previewFurniture!} selected={piece?.id} onPick={busy||tool!=='select'?undefined:hideMode&&view==='back'&&draftHidden!==null?(id=>{selectPiece(id);setDraftHidden(previous=>previous===null?previous:previous.includes(id)?previous.filter(piece=>piece!==id):[...previous,id]);}):draftHidden!==null?(id=>selectPiece(id)):pick} onNote={busy?undefined:id=>setNoteId(id)} onMove={busy||draftHidden!==null||tool==='orbit'?undefined:(id,position)=>changeFurniture(f=>({...f,notes:f.notes.map(n=>n.id===id?{...n,position}:n)}))}/>
                <div className="viewer-sliders"><div className="control-with-help"><label>Zoom<input aria-label="Zoom" disabled={!!busy||draftHidden!==null} type="range" min="0.35" max="1.4" step="0.05" value={furniture.zoom} onChange={e=>changeFurniture(f=>({...f,zoom:Number(e.target.value)}))}/><output>{Math.round(furniture.zoom*100)}%</output></label><HelpPopover title="Zoom"><p>Ajusta el tamaño del dibujo en la guía y en el PDF. Si una pieza sale del encuadre, bajá el zoom antes de exportar.</p><p>El visor muestra la vista tal como sale en la hoja A4: lo que ves es lo que se imprime.</p></HelpPopover></div></div>
                <div className="viewer-caption"><span>{dimensionCaption(furniture)}</span><HelpPopover title="Cotas de las piezas"><p>Cada medida de largo o ancho se acota una sola vez por mueble aunque se repita en varias piezas. Todas las piezas y sus medidas se conservan en el listado. El espesor se consulta en la tabla.</p><p>Podés mover u ocultar cotas. Si no caben legiblemente en la A4, se indica qué corregir antes de exportar.</p></HelpPopover></div>
              </section>
              <ViewAdjustments furniture={furniture} view={view} mode={tool} showTools={false} idsHiddenByDefault disabled={!!busy||draftHidden!==null} onMode={setTool} onChange={presentation=>changeFurniture(f=>({...f,presentation}))}/>
              <DimensionControls furniture={furniture} disabled={!!busy} onChange={hiddenDimensions=>changeFurniture(f=>({...f,hiddenDimensions}))}/>
              <GuideViews modelGuid={modelGuidOf(project)} onMarkFront={proposeNames} hideMode={hideMode} onHideMode={()=>{setTool('select');setPicking(undefined);setHideMode(value=>!value);}} furniture={furniture} view={view} selectedId={piece?.id} draftHidden={draftHidden} disabled={!!busy} onChange={next=>changeFurniture(()=>next)} onSelect={id=>selectPiece(id)} onView={view=>{setView(view);if(view==='front')setHideMode(false);}} onDraft={ids=>{setTool('select');setPicking(undefined);setDraftHidden(ids);}} onApply={()=>{if(draftHidden!==null)changeFurniture(f=>({...f,presentation:{...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}}}));setDraftHidden(null);setHideMode(false);}} onCancel={()=>{setDraftHidden(null);setHideMode(false);}}/>
              {sheetPreviewProject&&<>{printMaterials&&previewReferenceError&&<div className="warning ux-sheet-notice" role="status"><span>Hoja sin materiales: el pedido no está guardado o quedó desactualizado. {previewReferenceError}</span><button type="button" onClick={()=>openWorkshop('order')}>Abrir Maderera</button></div>}<A4SheetPreview project={sheetPreviewProject} activeFurnitureId={furniture.id} references={printMaterials?previewReferences:undefined} pending={printMaterials?previewPending:undefined} disabled={draftHidden!==null||contextChanged||modelAnalysisStale||(printMaterials&&!previewReferences&&!previewReferenceError)} pendingReason={draftHidden!==null?'Aplicá o cancelá las piezas ocultas para actualizar la hoja.':contextChanged?'Volvé al modelo de la guía para revisar la hoja.':printMaterials&&!previewReferences&&!previewReferenceError?'Revisando referencias de materiales y cantos del pedido…':undefined}/>{LABELS_ENABLED&&<LabelsPanel project={project} references={printMaterials?previewReferences:undefined} pending={printMaterials?previewPending:undefined} disabled={draftHidden!==null||contextChanged||modelAnalysisStale||(printMaterials&&!previewReferences&&!previewReferenceError)}/>}</>}</>:<section className="view" aria-label="Visor del mueble">
                <div className="view-toolbar"><button className="highlight-toggle" disabled={!!busy||!piece} aria-pressed={highlight} onClick={()=>setHighlight(v=>!v)}>Resaltar pieza</button><button disabled={!!busy||!piece||contextChanged||modelAnalysisStale} onClick={()=>void highlightNativePiece()}>Resaltar en SketchUp</button></div>
                <p className="viewer-hint">Arrastrá para girar el mueble, usá la rueda para acercar y Mayús + arrastrar para desplazarlo. Con «Mover piezas» o «Separar piezas» ves el interior: solo cambia esta vista, nunca el modelo. Tocá una pieza o su ID para encontrar su nombre en el listado; las vistas, cotas y notas se arman en Planos A4.</p>
                <PieceViewer key={furniture.id} furniture={furniture} selected={piece?.id} highlight={highlight} disabled={!!busy} onSelect={id=>selectPiece(id,true,true)}/>
              </section>}
              {!!warnings.length&&<><div className="warnings">{warnings.map(w=><p key={w}>{w}</p>)}</div><span role="status" className="sr-only">{warningAnnouncement}</span></>}
            </div>
            <div className="assembly-inspector">
              {planos?<section className="parts-config parts-readonly" aria-label="Piezas del plano">
                <div className="table-heading"><h2><span>02</span> Piezas del plano</h2><HelpPopover title="Nombres en el plano"><p>El plano usa los nombres guardados en Muebles. Para cambiarlos, proponelos o editalos en Muebles.</p><p>Las medidas están en milímetros y se toman del modelo. Ocultar piezas en la vista interior no las quita del listado.</p></HelpPopover></div>
                {unnamed>0&&<p className="warning parts-unnamed" role="status">{plural(unnamed,'pieza sin nombre propio','piezas sin nombre propio')}. <button type="button" className="link-button" onClick={proposeNames}>Proponer nombres en Muebles</button></p>}
                <div className="table-scroll" ref={partsScroll}><table aria-label="Piezas del mueble"><thead><tr><th>ID</th><th>Pieza y medidas · mm</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} data-piece-row={p.id} aria-selected={p.memberIds.includes(piece?.id||'')} className={p.memberIds.includes(piece?.id||'')?'selected':''} onClick={()=>selectPiece(p.id)}><td><button className="piece-code-button" aria-label={`Elegir ${p.code}`} disabled={!!busy} onClick={e=>{e.stopPropagation();selectPiece(p.id,true);}}>{p.code}</button><small>×{p.quantity}</small></td><td><span className="piece-name" data-piece-name={p.id}>{p.name}</span><dl className="piece-measures">{p.dimensions.map((d,i)=><div key={i}><dt>{['Largo','Ancho','Espesor'][i]}</dt><dd>{mm(d)}</dd></div>)}</dl></td></tr>)}</tbody></table></div>
                <p className="parts-instructions">Los nombres se editan en Muebles. El PDF incluye todas las piezas.</p>
              </section>:<section className="parts-config" aria-label="Configuración de grupos y piezas">
                <div className="table-heading"><h2><span>02</span> Grupos y piezas</h2><HelpPopover title="Nombres y medidas"><p>Tocá una pieza del dibujo para encontrarla en el listado. También podés buscar por ID o nombre y usar las flechas para recorrer las piezas.</p><p>Escribí solo el nombre de la pieza, por ejemplo Lateral. Obra y módulo se agregan automáticamente. Al guardar la guía se renombran en SketchUp si Sincronizar nombres está activado, en una sola operación que Ctrl+Z deshace; si una fila no se puede renombrar (instancia compartida, bloqueada o con subgrupos), queda con un aviso y conserva su nombre en SketchUp.</p><p>Las medidas están en milímetros y no se editan acá. Buscar, filtrar o resaltar no quita piezas del PDF.</p></HelpPopover><button ref={suggestionsTrigger} className="suggest-names" aria-label="Proponer nombres por geometría…" disabled={!!busy||draftHidden!==null} onClick={()=>setShowSuggestions(true)}>Proponer nombres</button><button ref={codePlanTrigger} className="code-plan-open" aria-label="Codificar despiece…" disabled={!!busy||draftHidden!==null} onClick={()=>setShowCodePlan(true)}>Codificar despiece</button></div>
                <div className="group-configuration"><label>Nombre del grupo<input aria-label="Nombre del grupo" maxLength={80} disabled={!!busy} value={furniture.name} onChange={e=>{const name=e.target.value;changeFurniture(f=>withNaming({...f,name,groupName:name},workCode,moduleFromName(name)||f.naming?.moduleCode||''));}}/></label><div className="module-configuration"><label>Módulo<input aria-label="Módulo de este mueble" placeholder="M01" value={furniture.naming?.moduleCode||''} disabled={!!busy} maxLength={4} onChange={e=>changeFurniture(f=>withNaming(f,workCode,e.target.value.toUpperCase()))}/></label><p>Obra <strong>{workCode||'sin obra'}</strong><br/>Nombre: {workCode?`${workCode} ${furniture.naming?.moduleCode||'M01, M02… al guardar'} + pieza`:'pieza, sin obra ni módulo'}</p></div></div>
                <p className="hint front-status">{markedFront(furniture)?'Frente marcado: el visor y Planos A4 muestran el mueble de frente.':'Frente sin marcar: el visor y Planos A4 usan el frente propuesto. Marcalo en «Proponer nombres» para confirmarlo.'}</p>
                {piece&&<div className="selected-piece-summary" aria-live="polite"><span className="selected-code">{selectedRow?.code||piece.code}</span><div><strong>{selectedRow&&selectedRow.quantity>1?`${selectedRow.quantity} piezas iguales`:'Pieza seleccionada'}</strong><span>{piece.name}</span></div><div className="piece-navigation"><button aria-label="Pieza anterior" disabled={!!busy||pieceIndex<=0} onClick={()=>selectPiece(rows[pieceIndex-1].id,true,true)}>‹</button><small>{pieceIndex+1}/{rows.length}</small><button aria-label="Pieza siguiente" disabled={!!busy||pieceIndex>=rows.length-1} onClick={()=>selectPiece(rows[pieceIndex+1].id,true,true)}>›</button></div></div>}
                <div className="piece-grouping"><label><input type="checkbox" aria-label="Agrupar componentes iguales" disabled={!!busy||(!repeated&&!furniture.groupIdentical)} checked={furniture.groupIdentical||false} onChange={e=>{const groupIdentical=e.target.checked;setPieceQuery('');setEditingPieceId('');changeFurniture(f=>withNaming({...f,groupIdentical},workCode));}}/><span>Agrupar componentes iguales<small>{repeated?`${repeated} ${repeated===1?'grupo de repetidos':'grupos de repetidos'} · mismo componente, medidas y material`:'No hay componentes repetidos compatibles'}</small></span></label><HelpPopover title="Piezas iguales"><p>Una fila, un nombre y un ID para los componentes iguales de este mueble. La cantidad indica cuántas piezas hay y el ID se repite en cada una en ambas vistas.</p><p>Se muestra el nombre de la primera pieza como referencia. Agrupar no cambia los nombres de las instancias en SketchUp. Si editás el nombre de la fila, ese cambio sí se aplica a todas sus piezas al guardar. Se mantienen las medidas y todas las geometrías. Las notas siguen en la pieza física donde las anclaste.</p><p>Se exige misma definición, medidas y material. Las piezas con escalas locales distintas o espejadas en distinto sentido quedan separadas. Desactivar recupera los IDs y nombres individuales; si editaste el nombre de la fila, se conservan esos cambios explícitos.</p></HelpPopover></div><div className="parts-search"><label>Buscar piezas<div className="search-field"><input type="search" aria-label="Buscar piezas" placeholder="ID o nombre de la pieza" value={pieceQuery} onChange={e=>setPieceQuery(e.target.value)}/>{pieceQuery&&<button aria-label="Limpiar búsqueda" onClick={()=>setPieceQuery('')}>×</button>}</div></label><div className="parts-filter"><div role="group" aria-label="Filtrar piezas"><button aria-pressed={!onlySelected} onClick={()=>setOnlySelected(false)}>Todas</button><button aria-pressed={onlySelected} onClick={()=>setOnlySelected(true)}>Seleccionada</button></div><span role="status">{visiblePieces.length} de {rows.length}{furniture.groupIdentical?' tipos':''}</span></div></div>
                <div className="table-scroll" ref={partsScroll}><table aria-label="Piezas del mueble"><thead><tr><th>ID</th><th>Pieza y medidas · mm</th></tr></thead><tbody>{visiblePieces.map(p=><tr key={p.id} data-piece-row={p.id} aria-selected={p.memberIds.includes(piece?.id||'')} className={p.memberIds.includes(piece?.id||'')?'selected':''} onClick={()=>selectPiece(p.id)}><td><button className="piece-code-button" aria-label={`Elegir ${p.code}`} disabled={!!busy} onClick={e=>{e.stopPropagation();selectPiece(p.id,true);}}>{p.code}</button><small>×{p.quantity}</small></td><td><input data-piece-name={p.id} aria-label={`Nombre ${p.code}`} value={furniture.naming?.bases.find(b=>b.id===p.id)?.base??p.name} maxLength={70} disabled={!!busy} onFocus={()=>startNameEdit(p.id)} onBlur={()=>{editSnapshot.current=undefined;setEditingPieceId('');}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelNameEdit(p.id);event.currentTarget.blur();}else if(event.key==='Enter'||(event.key==='Tab'&&!event.shiftKey)){event.preventDefault();stepNameEdit(p.id);if(event.key==='Enter')event.currentTarget.blur();}}} onChange={e=>changeFurniture(f=>withNaming(f,workCode,undefined,{id:p.id,base:e.target.value}))}/>{p.name!==(furniture.naming?.bases.find(b=>b.id===p.id)?.base??p.name)&&<small className="composed-name">{p.name}</small>}<dl className="piece-measures">{p.dimensions.map((d,i)=><div key={i}><dt>{['Largo','Ancho','Espesor'][i]}</dt><dd>{mm(d)}</dd></div>)}</dl>{p.warnings.map(w=><small className="piece-warning" key={w}>{w}</small>)}{[...new Set(p.memberIds.map(id=>nameWarnings[id]).filter(Boolean))].map(reason=><small className="piece-warning name-not-synced" role="note" key={reason}>No se renombró en SketchUp: {reason}</small>)}</td></tr>)}</tbody></table>{!visiblePieces.length&&<div className="parts-empty"><strong>No hay piezas con ese filtro</strong><p>Probá otro nombre o volvé al listado completo.</p><button onClick={()=>{setPieceQuery('');setOnlySelected(false);}}>Mostrar todas las piezas</button></div>}</div>
                <p className="parts-instructions">Editá solo el nombre. Medidas del modelo protegidas.<br/>Los filtros afectan este listado; el PDF incluye todas las piezas.{furniture.groupIdentical&&<> Los IDs compartidos indican piezas iguales; la cantidad figura en cada fila.</>}</p>
              </section>}
      {planos&&<aside className="notes-panel"><div className="section-heading"><h2><span>03</span> Indicaciones</h2><HelpPopover title="Notas con flechas"><p>Elegí «Agregar nota» y hacé clic sobre la superficie de la pieza donde debe terminar la flecha. Después escribí la indicación.</p><p>Arrastrá la tarjeta para acomodarla. La punta sigue vinculada a esa pieza al cambiar la cámara. Escape cancela la elección del destino.</p></HelpPopover></div><p className="hint">Una indicación breve, una flecha y su pieza de destino.</p>
        {furniture&&<><button disabled={!!busy||draftHidden!==null} className="wide" onClick={()=>{setTool('select');setPicking('new');}}>Agregar nota con flecha</button><div className="note-list">{[...furniture.notes,...orphanNotes].map(n=><button key={n.id} className={noteId===n.id?'active':''} onClick={()=>{setNoteId(n.id);setPieceId(n.pieceId);}}><strong>{codes.get(n.pieceId)||'SIN DESTINO'}</strong><span>{n.text||'Nota vacía'}</span></button>)}</div>
          {note?<div className="note-editor"><label>Texto de la indicación<textarea ref={noteInput} aria-label="Texto de la nota" disabled={!!busy} maxLength={200} value={note.text} onChange={e=>updateNote(e.target.value)}/></label><small>{note.text.length}/200 caracteres</small><div className="action-with-help"><button disabled={!!busy} onClick={()=>{setTool('select');setPicking(note.id);}}>Cambiar destino de la flecha</button><HelpPopover title="Cambiar destino"><p>Elegí esta opción y hacé clic sobre la nueva pieza. Conserva el texto y la ubicación de la tarjeta.</p><p>Si borraste una pieza del modelo, su nota aparece «Sin destino». Reanclala o eliminala antes de exportar.</p></HelpPopover></div><button className="danger" disabled={!!busy} onClick={removeNote}>Eliminar nota</button><p className="hint">Para mover la tarjeta: arrastrala o seleccionala y usá las flechas del teclado.</p></div>:<p className="muted">Las notas que agregues aparecen acá. Elegí una para editarla.</p>}
          {piece&&<details className="piece-info"><summary>Información de {selectedRow?.code||piece.code}</summary><p>{piece.metadata?.originalName||piece.metadata?.definitionName||piece.name}</p><small>Instancia: {piece.id}</small><p>{piece.dimensions.map(mm).join(' × ')} mm</p><p>Las medidas se actualizan desde SketchUp; no se editan en la guía.</p></details>}
        </>}
      </aside>}
            </div>
          </div>
        </>:<div className="empty"><span className="eyebrow">DEL MODELO AL TALLER</span>{destination==='guides'?<><h2>Primero generá las guías en Muebles</h2><p className="empty-lead">Los planos A4 se arman a partir de las guías de cada mueble.</p></>:<><h2>Prepará una guía clara para armar.</h2><ol><li>Elegí los muebles del modelo abierto.</li><li>Pulsá <strong>Generar guías</strong> y revisá las piezas.</li><li>Agregá indicaciones y exportá el PDF A4.</li></ol></>}<div className="empty-actions">{ids.length?<button type="button" className="primary" disabled={!!busy} onClick={()=>void generate(ids,destination==='guides'?'guides':'furniture')}>Generar {plural(ids.length,'guía','guías')}</button>:scan?<><button type="button" className="primary" disabled={!!busy} onClick={()=>void analyze('selected')}>Tomar la selección de SketchUp</button><button type="button" disabled={!!busy} onClick={()=>void analyze()}>Volver a analizar el modelo</button></>:null}{destination==='guides'&&<button type="button" onClick={()=>navigateModule('furniture')}>Ir a Muebles</button>}</div><p>Usá los botones <strong>?</strong> si necesitás una explicación.</p></div>}
      </section>

    </main><footer><strong>SANTO CARPINTERO</strong><span>Una hoja A4 por mueble · Las medidas se conservan del modelo</span></footer>
  </div></div></div></>;
}
