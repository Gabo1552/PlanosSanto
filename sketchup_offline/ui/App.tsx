import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewAdjustments,{shiftDimension,orbitCamera} from '../../components/ViewAdjustments';
import {withNaming,normalizeNaming,namingIssues,moduleFromName} from '../../lib/naming';
import Diagram from '../../components/Diagram';
import DimensionControls from '../../components/DimensionControls';
import {setDimensionVisible} from '../../lib/dimensions';
import { mm, type Furniture, type Note, type Project, type RawNode, type RawDocument, type Vec3 } from '../../lib/model';
import {pieceRows,identicalGroups,pieceCodeMap} from '../../lib/pieceGroups';
import {dimensionCaption} from '../../lib/dimensions';
import { makeScene, layoutWarnings, type View } from '../../lib/scene';
import { request } from './bridge';
import {isQuickIntent,shortcutFor,type QuickIntent} from './quickActions';
import {ensureRuntime} from './runtime';
import { countPieces, editsFor, guideIssues, mergeGuide, type Generated, type Guide } from './guide';
import { createOfflinePdf, decode64, encode64 } from './pdf';
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
import NameBatchPreview,{type NameBatchCheck,type NameBatchRow} from './NameBatchPreview';
import A4SheetPreview from './A4SheetPreview';
import GuideViews,{ensureGuide} from './GuideViews';
import MaterialLibraryPanel from './MaterialLibraryPanel';
import PhotoMaterialPanel from './PhotoMaterialPanel';
import './ux-shell.css';
const {version}=release;

type Scan={tree:{roots:RawNode[];warnings:string[];modelName:string};guide:Guide;selected:string[];path:string};
function allIds(nodes:RawNode[]):string[]{return nodes.flatMap(n=>[n.id,...allIds(n.children)]);}
function selectedFurnitureIds(paths:string[],nodes:RawNode[]):string[]{const containers:RawNode[]=[];function visit(items:RawNode[]){for(const node of items){if(node.children.length&&countPieces(node)>0)containers.push(node);visit(node.children);}}visit(nodes);const selected=[...new Set(paths.flatMap(path=>{const node=containers.filter(node=>path===node.id||path.startsWith(node.id+'/')).sort((a,b)=>b.id.length-a.id.length)[0];return node?[node.id]:[];}))];return selected.filter(id=>!selected.some(parent=>parent!==id&&id.startsWith(parent+'/')));}

function ToolIcon({tool}:{tool:string}){
  const paths:Record<string,string>={select:'M5 3l13 9-6 1-3 6-4-16z',orbit:'M19 8a8 8 0 1 0 1 7M19 3v5h-5',dimensions:'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4'};
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={paths[tool]}/></svg>;
}
type Module='home'|'materials'|'furniture'|'order'|'guides';
const modules:[Module,string,string][]=[['home','Inicio','Trabajo actual y próximos pasos'],['materials','Materiales','Biblioteca visual del taller'],['furniture','Muebles','Piezas, medidas y nombres'],['order','Maderera','Lotes, cantos y pedido TXT'],['guides','Planos A4','Vistas, cotas y notas']];
function ModuleIcon({name}:{name:string}){
 const paths:Record<string,string>={home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',materials:'M4 5h13v16H4zM8 2h12v15M7 9h7M7 13h7M7 17h4',furniture:'M4 5h16v14H4zM4 12h16M12 5v14M6 19v3M18 19v3',order:'M6 3h12v19H6zM9 8h6M9 12h6M9 16h3',guides:'M5 2h10l4 4v16H5zM15 2v5h4M8 12l4-2 4 2v5l-4 2-4-2zM12 14v5M8 12l4 2 4-2',paint:'M4 4h12v5H4zM16 6h4v6h-9v8H8v-8'};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.home}/></svg>;
}
type NoticeAction={label:string;kind:'analyze'|'generate'|'module';module?:Module};
type Confirm={title:string;detail:string;confirmLabel:string;run:()=>void;opener?:HTMLElement|null};
type Block='save'|'export'|'paint'|'nav'|'tools';
const moduleLabel=(id:Module)=>modules.find(([value])=>value===id)![1];
const searchable=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');

export default function App(){
  const [destination,setDestination]=useState<Module>('home'),[materialsVisited,setMaterialsVisited]=useState(false),[libraryDirty,setLibraryDirty]=useState(false),[catalogFocus,setCatalogFocus]=useState<string>(),[catalogRefresh,setCatalogRefresh]=useState(0),[paintCatalogId,setPaintCatalogId]=useState<string>(),[paintAutoStart,setPaintAutoStart]=useState(false),[showPhotoMaterial,setShowPhotoMaterial]=useState(false),[photoTarget,setPhotoTarget]=useState<PaintTarget>();
  const [filter,setFilter]=useState<'all'|'selected'|'unselected'>('all');
  const [pieceQuery,setPieceQuery]=useState(''),[onlySelected,setOnlySelected]=useState(false),[editingPieceId,setEditingPieceId]=useState('');
  const [highlight,setHighlight]=useState(false),[hideFurniture,setHideFurniture]=useState(false);
  const [tool,setTool]=useState<'select'|'orbit'|'dimensions'>('select');
  const [nameBatch,setNameBatch]=useState<{rows:NameBatchRow[];check:NameBatchCheck;source:Project}>();
  const editSnapshot=useRef<{id:string;bases:{id:string;base:string}[];dirty:boolean}|undefined>(undefined);
  const highlightSequence=useRef(0);
  const [showSuggestions,setShowSuggestions]=useState(false),[printMaterials,setPrintMaterials]=useState(false);
  const workshopTrigger=useRef<HTMLButtonElement>(null),suggestionsTrigger=useRef<HTMLButtonElement>(null);
  const [showWorkshop,setShowWorkshop]=useState(false),[workshopTab,setWorkshopTab]=useState<'catalog'|'order'>('catalog'),[workshopDirty,setWorkshopDirty]=useState(false);
  const materialTrigger=useRef<HTMLButtonElement>(null);
  const [showMaterials,setShowMaterials]=useState(false);
  const [showPaint,setShowPaint]=useState(false),[paintPieceId,setPaintPieceId]=useState<string>();
  const paintTrigger=useRef<HTMLButtonElement>(null),smartPaintTrigger=useRef<HTMLButtonElement>(null);
  const [showSmartPaint,setShowSmartPaint]=useState(false),[compactPaint,setCompactPaint]=useState(false),[quickIntent,setQuickIntent]=useState<QuickIntent>();
  const uiReady=useRef(false),lastQuick=useRef(0),quickHandler=useRef<(intent:QuickIntent)=>void>(()=>{});
  const [contextChanged,setContextChanged]=useState(false),[modelAnalysisStale,setModelAnalysisStale]=useState(false);
  const restoreSmartFocus=useRef(false);
  useEffect(()=>{if(showSmartPaint)restoreSmartFocus.current=true;else if(restoreSmartFocus.current){restoreSmartFocus.current=false;smartPaintTrigger.current?.focus();}},[showSmartPaint]);
  const [workCode,setWorkCode]=useState(''),[saveSkp,setSaveSkp]=useState(true),[syncNames,setSyncNames]=useState(true);
  const [scan,setScan]=useState<Scan>();
  const heldScan=useRef<Scan|undefined>(undefined),currentScan=useRef<Scan|undefined>(undefined);currentScan.current=scan;
  const [ids,setIds]=useState<string[]>([]);
  const [project,setProject]=useState<Project>();
  const [orphans,setOrphans]=useState<Record<string,Note[]>>({});
  const [revision,setRevision]=useState(0),[fingerprint,setFingerprint]=useState('');
  const [furnitureId,setFurnitureId]=useState(''),[pieceId,setPieceId]=useState(''),[noteId,setNoteId]=useState('');
  const [picking,setPicking]=useState<string>();
  const [busy,setBusy]=useState(''),[error,setErrorText]=useState(''),[errorAction,setErrorAction]=useState<NoticeAction>(),[message,setMessageText]=useState(''),[messageAction,setMessageAction]=useState<NoticeAction>(),[noticeHold,setNoticeHold]=useState(false),[elapsed,setElapsed]=useState(0);
  const setError=useCallback((text:string,action?:NoticeAction)=>{setErrorText(text);setErrorAction(action);},[]),setMessage=useCallback((text:string,action?:NoticeAction)=>{setMessageText(text);setMessageAction(action);},[]);
  const [pendingConfirm,setPendingConfirm]=useState<Confirm>();const confirmCancel=useRef<HTMLButtonElement>(null),shortcutHandler=useRef<(event:KeyboardEvent)=>void>(()=>{});
  useEffect(()=>{if(!message||messageAction||noticeHold)return;const timer=setTimeout(()=>setMessage(''),6000);return()=>clearTimeout(timer);},[message,messageAction,noticeHold,setMessage]);
  useEffect(()=>{if(!busy)return;const start=Date.now(),timer=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>{clearInterval(timer);setElapsed(0);};},[busy]);
  useEffect(()=>{if(pendingConfirm)confirmCancel.current?.focus();},[pendingConfirm]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>shortcutHandler.current(event);document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
  const [dirty,setDirty]=useState(false),[diagnostic,setDiagnostic]=useState('');
  const [filePending,setFilePending]=useState(false);
  const [view,setView]=useState<View>('front');
  const [draftHidden,setDraftHidden]=useState<string[]|null>(null),[hideMode,setHideMode]=useState(false);
  const [previewReferences,setPreviewReferences]=useState<Record<string,string>>(),[previewReferenceError,setPreviewReferenceError]=useState('');
  const noteInput=useRef<HTMLTextAreaElement>(null);
  const partsScroll=useRef<HTMLDivElement>(null);
  const furniture=project?.furniture.find(f=>f.id===furnitureId)||project?.furniture[0];
  const previewFurniture=useMemo(()=>furniture&&draftHidden!==null?{...furniture,presentation:{...furniture.presentation,guide:{...ensureGuide(furniture).presentation!.guide!,hiddenPieceIds:draftHidden}}}:furniture,[furniture,draftHidden]);
  useEffect(()=>{setDraftHidden(null);setHideMode(false);},[furniture?.id]);
  const sheetPreviewProject=useMemo(()=>project&&furniture?{...project,furniture:[furniture]}:undefined,[project,furniture]);
  useEffect(()=>{let current=true;setPreviewReferences(undefined);setPreviewReferenceError('');if(!printMaterials||destination!=='guides')return;void request<Record<string,string>>('order_references').then(result=>{if(current)setPreviewReferences(result);}).catch(value=>{if(current)setPreviewReferenceError(value instanceof Error?value.message:String(value));});return()=>{current=false;};},[printMaterials,destination,revision,fingerprint]);
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
  const scene=useMemo(()=>previewFurniture?makeScene(previewFurniture,{view,layout:tool==='dimensions'?'sheet':'editor'}):undefined,[previewFurniture,view,tool]);
  const warnings=useMemo(()=>furniture&&scene?[...new Set([...scene.warnings,...layoutWarnings(furniture)]),...guideIssues(furniture,orphans[furniture.id]||[]),...namingIssues(furniture,workCode)]:[],[furniture,scene,orphans,workCode]);
  const selectionChanged=!!project&&JSON.stringify([...ids].sort())!==JSON.stringify(project.furniture.map(f=>f.id).sort());
  useEffect(()=>{if(noteId&&!picking)noteInput.current?.focus();},[noteId,picking]);
  useEffect(()=>{
    if(!picking)return;
    function cancel(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented)setPicking(undefined);}
    document.addEventListener('keydown',cancel);return()=>document.removeEventListener('keydown',cancel);
  },[picking]);

  async function run(label:string,operation:()=>Promise<void>){
    setBusy(label);setError('');setMessage('');
    try{await operation();return true;}catch(error){setError(error instanceof Error?error.message:String(error));return false;}
    finally{setBusy('');}
  }
  function markDirty(){if(dirty)return;setDirty(true);void request('dirty',{value:true}).catch(()=>{});}
  function changeFurniture(change:(f:Furniture)=>Furniture){
    setProject(previous=>previous?{...previous,furniture:previous.furniture.map(f=>f.id===furniture?.id?change(f):f)}:previous);markDirty();
  }
  const acceptScan=useCallback((result:Scan,mode?:'all'|'selected')=>{
    heldScan.current=undefined;editSnapshot.current=undefined;setNameBatch(undefined);setContextChanged(false);setModelAnalysisStale(false);setWorkCode(result.guide.workCode||'');setPieceQuery('');setOnlySelected(false);setEditingPieceId('');setHideFurniture(false);setScan(result);setProject(undefined);setOrphans({});setDirty(false);setPicking(undefined);
    const available=new Set(allIds(result.tree.roots));
    const stored=result.guide.selection.filter(id=>available.has(id));
    const roots=result.tree.roots.filter(n=>n.children.length>0&&countPieces(n)>0).map(n=>n.id);
    setIds(mode==='selected'?result.selected:mode==='all'?roots:stored.length?stored:result.selected.length?result.selected:roots);
    setRevision(result.guide.revision);
    setFilePending(!result.path&&result.guide.revision>0);
    if(mode==='selected'&&!result.selected.length)setMessage('No hay grupos o componentes seleccionados en SketchUp. Seleccionalos en el modelo y volvé a analizar.');
  },[setMessage]);
  function askDiscard(title:string,confirmLabel:string,run:()=>void){const count=project?.furniture.length||0;setPendingConfirm({title,confirmLabel,run,opener:document.activeElement as HTMLElement|null,detail:`Se pierden los nombres, notas y ajustes de vista que no guardaste${count?` en ${count} ${count===1?'mueble':'muebles'}`:''}. La guía guardada en el modelo no cambia.`});}
  function closeConfirm(confirmed:boolean){const current=pendingConfirm;setPendingConfirm(undefined);if(!current)return;if(confirmed)current.run();else requestAnimationFrame(()=>current.opener?.focus());}
  async function analyze(mode?:'all'|'selected',confirmed=false){
    if(dirty&&!confirmed){askDiscard('Descartar cambios y volver a analizar','Descartar y analizar',()=>void analyze(mode,true));return;}
    await run('Analizando modelo…',async()=>{
      await ensureRuntime();
      acceptScan(await request<Scan>('scan'),mode);
    });
  }
  useEffect(()=>{
    let mounted=true;setBusy('Analizando modelo…');
    void ensureRuntime().then(()=>request('ui_loading').catch(()=>{})).then(()=>request<Scan>('scan')).then(result=>{if(mounted)acceptScan(result);}).catch(error=>{if(mounted)setError(error instanceof Error?error.message:String(error));}).finally(()=>{if(mounted)setBusy('');});
    return()=>{mounted=false;};
  },[acceptScan,setError]);

  const consumeQuick=useCallback((value:unknown)=>{
    if(!isQuickIntent(value))return;
    if(value.sequence>lastQuick.current){lastQuick.current=value.sequence;quickHandler.current(value);}
    void request('quick_action_ack',{sequence:value.sequence}).catch(()=>{});
  },[]);
  useEffect(()=>{
    function action(event:Event){consumeQuick((event as CustomEvent<unknown>).detail);}
    function state(event:Event){const state=(event as CustomEvent<{contextChanged?:boolean;contextRestored?:boolean;error?:string}>).detail;if(state?.contextChanged){if(!heldScan.current)heldScan.current=currentScan.current;setContextChanged(true);setScan(undefined);setError(state.error||'Cambió el modelo activo. Los cambios de esta guía siguen en la ventana: copialos o guardalos en el modelo original antes de analizar otro.');}else if(state?.contextRestored){setContextChanged(false);setScan(heldScan.current||currentScan.current);heldScan.current=undefined;setError('');setMessage('Volviste al modelo de la guía. Los cambios pendientes se conservaron; revisalos antes de guardar.');}}
    function invalidate(){setModelAnalysisStale(true);setMessage('Cambió el material del modelo desde Pintura Inteligente. Los cambios de la guía se conservan; volvé a analizar y generar antes de guardar o exportar.',{label:'Analizar de nuevo',kind:'analyze'});}
    window.addEventListener('planos-santo-document-invalidated',invalidate);window.addEventListener('planos-santo-quick-action',action);window.addEventListener('planos-santo-smart-paint',state);
    return()=>{window.removeEventListener('planos-santo-document-invalidated',invalidate);window.removeEventListener('planos-santo-quick-action',action);window.removeEventListener('planos-santo-smart-paint',state);};
  },[consumeQuick,setError,setMessage]);
  useEffect(()=>{
    if(!scan||uiReady.current)return;uiReady.current=true;
    void request<{intent?:unknown}>('ui_ready').then(result=>consumeQuick(result?.intent)).catch(()=>{uiReady.current=false;});
  },[scan,consumeQuick]);

  function toggle(id:string){
    setIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current.filter(x=>!x.startsWith(id+'/')&&!id.startsWith(x+'/')),id]);
  }
  async function generate(selectedIds=ids,target:Module='furniture',confirmed=false){
    if(dirty&&!confirmed){askDiscard('Descartar cambios y regenerar las guías','Descartar y regenerar',()=>void generate(selectedIds,target,true));return;}
    await run('Generando guías…',async()=>{
      const result=await request<Generated>('generate',{ids:selectedIds});
      const merged=mergeGuide(result.document,result.guide);
      merged.project.furniture=merged.project.furniture.map(f=>ensureGuide(withNaming(f,workCode)));
      setDestination(target);setIds(selectedIds);setProject(merged.project);setOrphans(merged.orphans);setRevision(result.guide.revision);setFingerprint(result.fingerprint);
      const unsaved=editsFor(merged.project,merged.orphans).some(f=>JSON.stringify(f)!==JSON.stringify(result.guide.furniture.find(saved=>saved.id===f.id)));
      setPieceQuery('');setOnlySelected(false);setFurnitureId(merged.project.furniture[0].id);setPieceId('');setNoteId('');setPicking(undefined);setDirty(unsaved);
      await request('dirty',{value:unsaved});setMessage('Guías generadas. Revisá las piezas, agregá tus indicaciones y guardá la guía.');
    });
  }
  async function save(closeAfterSave=false,replacement?:Furniture,projectOverride?:Project){
    if(modelAnalysisStale){setError('El material del modelo cambió. Volvé a analizar y generar las guías antes de guardar o exportar.',{label:'Analizar de nuevo',kind:'analyze'});return false;}
    if(contextChanged){setError('Cambió el modelo activo. Volvé al modelo original para guardar esta guía o analizá el nuevo después de conservar tus cambios.');return false;}
    if(!project||draftHidden!==null)return false;
    return await run('Guardando guía…',async()=>{
      await ensureRuntime();
      const source=projectOverride||project;
      const prepared={...source,furniture:source.furniture.map(f=>ensureGuide(normalizeNaming(replacement?.id===f.id?replacement:f,workCode)))};
      for(const f of prepared.furniture){const issues=namingIssues(f,workCode);if(issues.length)throw new Error(`${f.name}: ${issues.join(' ')}`);}
      const result=await request<{guide:Guide;modelSaved:boolean;path:string;fingerprint:string;document:RawDocument}>('save',{furniture:editsFor(prepared,orphans),revision,saveFile:saveSkp,syncNames,workCode,closeAfterSave});
      const stored=mergeGuide(result.document,result.guide);
      stored.project.furniture=stored.project.furniture.map(ensureGuide);setProject(stored.project);setOrphans(stored.orphans);setFingerprint(result.fingerprint);setRevision(result.guide.revision);setDirty(false);setFilePending(!result.modelSaved);
      setMessage(result.modelSaved?'Guía y archivo SketchUp guardados.':'Guía guardada en el modelo abierto. Falta guardar el archivo .skp para conservarla al cerrar.');
    });
  }
  async function exportPdf(){
    if(modelAnalysisStale){setError('El material del modelo cambió. Volvé a analizar y generar las guías antes de exportar.',{label:'Analizar de nuevo',kind:'analyze'});return;}
    if(contextChanged){setError('Cambió el modelo activo. Volvé a analizar antes de exportar.');return;}
    if(!project||draftHidden!==null)return;
    await run('Preparando PDF A4…',async()=>{
      await ensureRuntime();
      for(const f of project.furniture){const issues=[...guideIssues(f,orphans[f.id]||[]),...namingIssues(f,workCode)];if(issues.length)throw new Error(`${f.name}: ${issues.join(' ')}`);}
      if(selectionChanged){setError('La selección cambió. Pulsá Generar guías para actualizar los muebles del PDF.',{label:'Regenerar guías',kind:'generate'});return;}
      const references=printMaterials?await request<Record<string,string>>('order_references'):undefined;
      const bytes=await createOfflinePdf(project,decode64(regularFont),decode64(monoFont),decode64(logo),references);
      const result=await request<{path?:string;cancelled?:boolean}>('pdf',{fingerprint,furniture:editsFor(project,orphans),base64:encode64(bytes)});
      setMessage(result.cancelled?'Exportación cancelada.':`PDF A4 guardado: ${result.path}`);
    });
  }
  function batchRows(source:Project,native?:{id:string;currentName:string;name:string;affectedPaths?:string[];changed?:boolean}[]):NameBatchRow[]{
    const current=new Map<string,string>();function visit(nodes:RawNode[]){for(const node of nodes){current.set(node.id,node.metadata?.originalName??node.name);visit(node.children);}}visit(scan?.tree.roots||[]);
    const changes:{id:string;currentName:string;name:string;affectedPaths?:string[];changed?:boolean}[]=native||source.furniture.flatMap(f=>[...(f.groupName!==undefined?[{id:f.id,currentName:current.get(f.id)||'',name:f.groupName}]:[]),...f.pieces.map(p=>({id:p.id,currentName:current.get(p.id)??p.metadata?.originalName??p.name,name:p.name}))]);
    return changes.filter(row=>row.currentName!==row.name&&row.changed!==false).map(row=>{const f=source.furniture.find(f=>f.id===row.id||f.pieces.some(p=>p.id===row.id))!,prefix=workCode?`${workCode} ${f.naming?.moduleCode||''} `:'',isRoot=f.id===row.id,canExclude=!!row.currentName.trim()&&(isRoot||!prefix||row.currentName.startsWith(prefix)&&!!row.currentName.slice(prefix.length).trim());return {id:row.id,currentName:row.currentName,name:row.name,furniture:f.name,code:isRoot?'Grupo':pieceCodeMap(f).get(row.id)||'Pieza',canExclude,warning:(row.affectedPaths?.length||0)>1?`Instancia compartida: ${row.affectedPaths!.length} rutas afectadas. Deben mantener nombres compatibles.`:undefined};});
  }
  function selectedBatch(ids:string[]){if(!nameBatch)return project!;const included=new Set(ids);return {...nameBatch.source,furniture:nameBatch.source.furniture.map(f=>{const originals=new Map(nameBatch.rows.filter(row=>!included.has(row.id)).map(row=>[row.id,row.currentName])),prefix=workCode?`${workCode} ${f.naming?.moduleCode||''} `:'';return withNaming({...f,...(originals.has(f.id)?{name:originals.get(f.id)!,groupName:originals.get(f.id)!}:{}),naming:f.naming?{...f.naming,bases:f.naming.bases.map(base=>originals.has(base.id)?{...base,base:prefix?originals.get(base.id)!.slice(prefix.length):originals.get(base.id)!}:base)}:undefined},workCode);})};}
  async function checkNameBatch(source:Project){return await request<NameBatchCheck&{rows?:{id:string;currentName:string;name:string;affectedPaths?:string[];changed?:boolean}[]}>('guide_names_preview',{furniture:editsFor(source,orphans),revision,workCode});}
  async function openNameBatch(){if(!project||!syncNames||contextChanged||modelAnalysisStale||draftHidden!==null)return;await run('Revisando lote de nombres…',async()=>{const source={...project,furniture:project.furniture.map(f=>ensureGuide(normalizeNaming(f,workCode)))};try{const result=await checkNameBatch(source);setNameBatch({source,rows:batchRows(source,result.rows),check:{...result,blocked:!!result.blockers?.length}});}catch(value){setNameBatch({source,rows:batchRows(source),check:{blocked:true,blockers:[value instanceof Error?value.message:String(value)]}});}});}
  async function reviewNameBatch(ids:string[]){await run('Revisando selección del lote…',async()=>{try{const check=await checkNameBatch(selectedBatch(ids));setNameBatch(previous=>previous?{...previous,check:{...check,blocked:!!check.blockers?.length}}:previous);}catch(value){setNameBatch(previous=>previous?{...previous,check:{blocked:true,blockers:[value instanceof Error?value.message:String(value)]}}:previous);}});}
  async function confirmNameBatch(ids:string[]){const source=selectedBatch(ids);let checked=false;await run('Verificando nombres antes de guardar…',async()=>{const result=await checkNameBatch(source);if(result.blockers?.length)throw new Error(result.blockers.join(' '));checked=true;});if(!checked)return false;return await save(false,undefined,source);}
  function selectPiece(id:string,focus=false,fromDrawing=false){
    if(fromDrawing)setPieceQuery('');
    setPieceId(id);
    if(destination==='furniture'&&!picking)void highlightRoute(id);
    if(focus)requestAnimationFrame(()=>{
      const container=partsScroll.current;
      const rowId=rows.find(row=>row.memberIds.includes(id))?.id||id;
      const input=container?.querySelector<HTMLInputElement>(`input[data-piece-name="${CSS.escape(rowId)}"]`);
      const row=input?.closest('tr');
      if(container&&row){
        const c=container.getBoundingClientRect(),r=row.getBoundingClientRect();
        if(r.top<c.top)container.scrollTop+=r.top-c.top;
        else if(r.bottom>c.bottom)container.scrollTop+=r.bottom-c.bottom;
        container.scrollLeft=0;
        input?.focus({preventScroll:true});input?.select();
        const visible=input?.getBoundingClientRect();
        if(visible&&visible.bottom>window.innerHeight-16)window.scrollBy(0,visible.bottom-window.innerHeight+16);
        else if(visible&&visible.top<12)window.scrollBy(0,visible.top-12);
      }
    });
  }
  function startNameEdit(id:string){if(editSnapshot.current?.id===id)return;editSnapshot.current={id,bases:structuredClone(furniture?.naming?.bases||[]),dirty};setPieceId(id);setEditingPieceId(id);}
  function cancelNameEdit(id:string){const previous=editSnapshot.current;if(!previous||previous.id!==id||!furniture)return;const members=new Set(rows.find(row=>row.id===id)?.memberIds||[id]);setProject(project=>project?{...project,furniture:project.furniture.map(f=>f.id===furniture.id?withNaming({...f,naming:{...f.naming!,bases:f.naming!.bases.map(base=>members.has(base.id)?previous.bases.find(old=>old.id===base.id)||base:base)}},workCode):f)}:project);if(!previous.dirty){setDirty(false);void request('dirty',{value:false}).catch(()=>{});}editSnapshot.current=undefined;setEditingPieceId('');}
  function stepNameEdit(id:string){editSnapshot.current=undefined;setEditingPieceId('');const index=visiblePieces.findIndex(row=>row.id===id),next=visiblePieces[index+1];if(next)requestAnimationFrame(()=>partsScroll.current?.querySelector<HTMLInputElement>(`input[data-piece-name="${CSS.escape(next.id)}"]`)?.focus());}
  async function highlightRoute(id:string){if(!scan||contextChanged||modelAnalysisStale||busy||showSmartPaint||showPhotoMaterial||showPaint)return;const sequence=++highlightSequence.current;try{await request('piece_highlight',{pieceId:id});}catch(value){if(sequence===highlightSequence.current)setMessage(`No se pudo resaltar esta pieza: ${value instanceof Error?value.message:String(value)}`);}}
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
    const code=value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);setWorkCode(code);
    setProject(p=>p?{...p,furniture:p.furniture.map(f=>withNaming(f,code))}:p);if(project)markDirty();
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
        <label><input type="checkbox" checked={ids.includes(node.id)} disabled={!!busy||count===0} onChange={()=>toggle(node.id)}/><span>{node.name}<small>{count} piezas{node.children.length===0&&node.mesh?' · pieza aislada':''}{!node.metadata?.effectiveVisible&&node.metadata?' · oculto':''}</small></span></label>
        {!!node.metadata?.errors?.length&&<p className="inline-error">{node.metadata.errors.join(' ')}</p>}
        {node.children.length>0&&<details><summary>Ver contenido</summary>{tree(node.children,depth+1)}</details>}
      </div>;
    });
  }
  function acceptPaintScan(result:unknown,warning?:string){setCatalogRefresh(value=>value+1);if(result){acceptScan(result as Scan);setMessage(warning||'Modelo actualizado. Generá las guías para refrescar las vistas; se conservan los ajustes guardados. Revisá y confirmá el pedido antes del TXT.');}else{setProject(undefined);setScan(undefined);setError(warning||'El modelo cambió, pero no se pudo refrescar el análisis. Volvé a analizar antes de generar guías o pedidos.',{label:'Analizar de nuevo',kind:'analyze'});}}
  function openPalette(compact=false,catalogId?:string,autoStart=false){
    if(!scan||busy||dirty||(libraryDirty&&!autoStart)||workshopDirty||draftHidden!==null||contextChanged||modelAnalysisStale){setError(`${blockReason('paint')||'Guardá los cambios pendientes y aplicá o cancelá la visibilidad'} antes de pintar.`);return;}
    setQuickIntent(undefined);setPaintCatalogId(catalogId);setPaintAutoStart(compact?true:autoStart);setCompactPaint(compact);setShowSmartPaint(true);
  }
  function navigateModule(next:Module){
    if(busy){setError('Esperá a que termine la operación actual.');return;}
    if(libraryDirty||workshopDirty){const owner:Module=libraryDirty?'materials':'order';setError(`Hay cambios sin guardar en ${moduleLabel(owner)} (biblioteca, importación o pedido). Guardalos o cancelalos antes de cambiar de sección.`,owner==='materials'&&destination!=='materials'?{label:`Ir a ${moduleLabel(owner)}`,kind:'module',module:owner}:undefined);return;}
    if(draftHidden!==null&&!['furniture','guides'].includes(next)){setError('Aplicá o cancelá la previsualización de piezas ocultas antes de cambiar de sección.');return;}
    setError('');setShowWorkshop(false);setShowPaint(false);setShowMaterials(false);setShowSuggestions(false);
    setDestination(next);if(next==='furniture'&&scan&&!project&&!dirty){const roots=selectedFurnitureIds(scan.selected,scan.tree.roots);if(roots.length)void generate(roots,'furniture');}if(next==='materials')setMaterialsVisited(true);
    requestAnimationFrame(()=>{window.scrollTo(0,0);document.querySelector<HTMLElement>('.ux-module-heading')?.focus({preventScroll:true});});
  }
  async function highlightNativePiece(){
    if(!piece)return;
    await run('Resaltando pieza en SketchUp…',async()=>{
      const result=await request<{message?:string}>('piece_highlight',{pieceId:piece.id});setMessage(result.message||'Pieza seleccionada en el modelo de SketchUp.');
    });
  }
  quickHandler.current=intent=>{
    if(workshopDirty||libraryDirty){setError('Hay cambios de biblioteca, importación o pedido sin guardar. Guardalos o cancelalos antes de usar otro acceso rápido.');return;}
    if(busy){setError('Esperá a que termine la operación actual antes de usar otro acceso rápido.');return;}
    if((dirty||draftHidden!==null||contextChanged||modelAnalysisStale)&&!['furniture','guides'].includes(intent.action)){setError('Conservá los cambios pendientes y aplicá o cancelá la visibilidad antes de cambiar de herramienta.');return;}
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
    setShowWorkshop(false);setHideFurniture(false);setPieceQuery('');setOnlySelected(false);
    const liveProject=refreshed?undefined:project,liveScan=(intent.scan||scan) as Scan|undefined;
    const paths=intent.selectionPaths?.length?intent.selectionPaths:liveScan?.selected||[];
    const selectedFurniture=liveProject?.furniture.find(f=>paths.some(path=>path===f.id||path.startsWith(f.id+'/')||f.id.startsWith(path+'/')));
    if(selectedFurniture){setFurnitureId(selectedFurniture.id);setPieceId(selectedFurniture.pieces.find(p=>paths.includes(p.id))?.id||'');setNoteId('');setPicking(undefined);}
    else if(!liveProject&&liveScan){const sourceScan=liveScan;const roots=selectedFurnitureIds(paths,sourceScan.tree.roots);if(roots.length){setIds(roots);if(!dirty)void generate(roots,intent.action==='furniture'?'furniture':'guides');}}
    setMessage(intent.message||(project?'Revisá el mueble y sus piezas. No se aplicaron nombres ni se exportó ningún archivo.':'Elegí el mueble y pulsá Generar guías para revisar nombres, vistas y notas.'));
    requestAnimationFrame(()=>{const target=document.querySelector<HTMLElement>(project?(intent.action==='furniture'?'.parts-config':'.assembly-drawing'):'#furniture-chooser');target?.scrollIntoView({block:'start'});if(intent.action==='furniture'&&project)target?.querySelector<HTMLInputElement>('input[aria-label="Nombre del grupo"]')?.focus({preventScroll:true});});
  };
  function blockReason(kind:Block):string|undefined{
    if(busy)return `Esperá: ${busy}`;
    if(kind==='nav')return undefined;
    if(kind==='tools')return scan?undefined:'Esperá a que se analice el modelo abierto';
    if(contextChanged)return 'Volvé al modelo original de la guía';
    if(modelAnalysisStale)return 'El material cambió: volvé a analizar y generar las guías';
    if(draftHidden!==null)return 'Aplicá o cancelá las piezas ocultas';
    if(kind==='paint')return !scan?'Esperá a que se analice el modelo abierto':dirty?'Guardá la guía antes de pintar':libraryDirty?'Guardá o cancelá los cambios de Materiales':workshopDirty?'Guardá o cancelá los cambios de biblioteca o pedido':undefined;
    if(!project)return 'Primero generá las guías en Muebles';
    if(kind==='export'&&selectionChanged)return 'Cambiaste los muebles: pulsá Generar guías';
    return undefined;
  }
  const saveBlock=blockReason('save'),exportBlock=blockReason('export'),paintBlock=blockReason('paint'),navBlock=blockReason('nav'),toolsBlock=blockReason('tools');
  const guidePending=contextChanged||modelAnalysisStale?'Análisis desactualizado':dirty?'Guía sin guardar':filePending?'Falta guardar el SKP':undefined;
  const pending:Record<Module,string|undefined>={home:undefined,materials:libraryDirty?'Cambios de biblioteca sin guardar':undefined,furniture:guidePending,order:workshopDirty?'Biblioteca o pedido sin guardar':undefined,guides:guidePending};
  const dialogOpen=showSmartPaint||showPhotoMaterial||showPaint||showMaterials||showWorkshop||showSuggestions||!!nameBatch||!!pendingConfirm;
  function runNoticeAction(action:NoticeAction){setError('');setMessage('');if(action.kind==='analyze')void analyze();else if(action.kind==='generate')void generate();else if(action.module){setDestination(action.module);if(action.module==='materials')setMaterialsVisited(true);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.ux-module-heading')?.focus({preventScroll:true}));}}
  shortcutHandler.current=event=>{
    const action=shortcutFor(event,dialogOpen);if(!action)return;event.preventDefault();
    if(action==='save'){if(saveBlock)setError(`No se puede guardar: ${saveBlock}.`);else void save();}
    else if(action==='export'){if(exportBlock)setError(`No se puede exportar: ${exportBlock}.`);else void exportPdf();}
    else navigateModule(action);
  };
  const palette=showSmartPaint?<SmartPaintPalette quickMode={compactPaint} initialCatalogId={paintCatalogId} autoStart={paintAutoStart} onCreateMaterial={()=>{setQuickIntent(undefined);setPaintAutoStart(false);setShowSmartPaint(false);setPhotoTarget(undefined);setShowPhotoMaterial(true);}} onAssignPhoto={target=>{setQuickIntent(undefined);setPaintAutoStart(false);setShowSmartPaint(false);setPhotoTarget(target);setShowPhotoMaterial(true);}} initialCompact={compactPaint} quickIntent={quickIntent} onApplied={acceptPaintScan} onClose={()=>setShowSmartPaint(false)} onManage={destination=>{setShowSmartPaint(false);if(destination==='catalog'){setDestination('materials');setMaterialsVisited(true);}else{setPaintPieceId(piece?.id);setShowPaint(true);}}}/>:null;
  return <>{showPhotoMaterial&&<PhotoMaterialPanel replacement={photoTarget} initialKind={photoTarget?.kind} onClose={()=>{setShowPhotoMaterial(false);setPhotoTarget(undefined);setPaintAutoStart(false);setShowSmartPaint(true);}} onCreated={(result,options)=>{const assigned=photoTarget?.assign===true;setShowPhotoMaterial(false);setPhotoTarget(undefined);if(assigned&&!options.paint){setCatalogRefresh(value=>value+1);setShowSmartPaint(true);return;}if(result.scan)acceptPaintScan(result.scan,result.refreshWarning);else if(result.refreshWarning)acceptPaintScan(undefined,result.refreshWarning);else setCatalogRefresh(value=>value+1);if(options.paint&&result.scan){setQuickIntent(undefined);setPaintCatalogId(result.catalogId);setPaintAutoStart(true);setCompactPaint(true);setShowSmartPaint(true);}else{setShowSmartPaint(false);setDestination('materials');setMaterialsVisited(true);}}}/>} {palette}<div className={`ux-shell destination-${destination}`} hidden={showSmartPaint}>
    <a className="ux-skip" href="#module-content">Ir al contenido</a>
    <nav className="ux-rail" aria-label="Módulos de Planos Santo"><div className="ux-brand" title="Planos Santo">S<span>PLANOS</span></div>{modules.map(([id,label,description],index)=><button key={id} type="button" aria-current={destination===id?'page':undefined} aria-keyshortcuts={`Alt+${index+1}`} aria-describedby={pending[id]?`rail-pending-${id}`:undefined} title={[description,pending[id],navBlock,`Alt+${index+1}`].filter(Boolean).join(' · ')} disabled={!!navBlock} onClick={()=>navigateModule(id)}><ModuleIcon name={id}/><span>{label}</span>{pending[id]&&<><span className="ux-rail-badge" aria-hidden="true"/><span id={`rail-pending-${id}`} hidden>{pending[id]}</span></>}</button>)}<div className="ux-rail-divider"/><button type="button" title={paintBlock?`Pintar: ${paintBlock}`:'Pintura Inteligente · paleta compacta'} disabled={!!paintBlock} onClick={()=>openPalette(true)}><ModuleIcon name="paint"/><span>Pintar</span></button><span className="ux-offline">LOCAL<br/>SIN NUBE</span></nav>
    <div className="ux-stage"><header className="ux-topbar"><div><span className="ux-breadcrumb">Planos Santo <span aria-hidden="true">/</span> {modules.find(([id])=>id===destination)?.[1]}</span><h1 className="ux-module-heading" tabIndex={-1}>{modules.find(([id])=>id===destination)?.[1]}</h1></div><div className="ux-project-context"><span>{scan?.tree.modelName||project?.name||'Modelo de SketchUp'}</span><strong><em className="ux-version-chip" title={`Versión ${version} en prueba. Extensión candidata: instalación y revisión visual pendientes en SketchUp 2026 Windows.`}>v{version} · en prueba</em>{contextChanged?'Modelo cambiado':modelAnalysisStale?'Análisis desactualizado':dirty||libraryDirty||workshopDirty?'Cambios pendientes':filePending?'Falta guardar SKP':project?'Guía en revisión':'Elegí un mueble'}</strong></div></header>
    <div id="module-content" className="offline-app" aria-busy={!!busy}>

    {nameBatch&&<NameBatchPreview rows={nameBatch.rows} check={nameBatch.check} busy={!!busy} error={error} onReview={reviewNameBatch} onConfirm={confirmNameBatch} onClose={()=>{setNameBatch(undefined);suggestionsTrigger.current?.focus();}}/>}
    {showSuggestions&&furniture&&<NameSuggestions furniture={furniture} workCode={workCode} onConfirm={f=>save(false,f)} busy={!!busy} error={error} syncNames={syncNames} onClose={()=>{setShowSuggestions(false);suggestionsTrigger.current?.focus();}}/>}
    {showWorkshop&&<WorkshopPanel initialCatalogId={catalogFocus} initialTab={workshopTab} onDirtyChange={setWorkshopDirty} onClose={()=>{setShowWorkshop(false);setCatalogRefresh(value=>value+1);workshopTrigger.current?.focus();}}/>}
    {showPaint&&<PaintPanel initialPieceId={paintPieceId} onClose={()=>{setShowPaint(false);paintTrigger.current?.focus();}} onApplied={acceptPaintScan}/>}
    {showMaterials&&<MaterialReview onClose={()=>{setShowMaterials(false);materialTrigger.current?.focus();}}/>}
    <header className="app-header"><img className="workshop-logo" src={`data:image/png;base64,${logo}`} alt="Santo Carpintero · Amoblamientos"/><div className="app-title"><strong>Planos Santo</strong><small>Guías de armado para el taller</small></div><div className="header-actions"><button ref={workshopTrigger} disabled={!!toolsBlock} title={toolsBlock} onClick={()=>{setWorkshopTab('catalog');setShowWorkshop(true);}}>Biblioteca y pedidos</button><button ref={smartPaintTrigger} disabled={!!busy||!scan||dirty||draftHidden!==null} title={dirty||draftHidden!==null?'Guardá primero los cambios pendientes de la guía.':'Ajustes avanzados de caras, alcance y reemplazo de materiales'} onClick={()=>openPalette(false)}>Pintura avanzada</button><button ref={paintTrigger} title={dirty||draftHidden!==null?'Guardá primero los cambios de la guía y aplicá o cancelá la visibilidad pendiente.':'Seleccionar caras y pintar materiales reales en SketchUp'} disabled={!!busy||!scan||dirty||draftHidden!==null} onClick={()=>{setPaintPieceId(piece?.id);setShowPaint(true);}}>Pintar placas y cantos</button><button ref={materialTrigger} disabled={!!toolsBlock} title={toolsBlock} onClick={()=>setShowMaterials(true)}>Materiales y cantos</button><span className={`save-state ${dirty||filePending?'pending':''}`}>{dirty?'Guía sin guardar':filePending?'Falta guardar el SKP':project?'Sin cambios pendientes':''}</span><details className="save-options"><summary>Opciones de guardado</summary><label><input type="checkbox" checked={printMaterials} onChange={e=>setPrintMaterials(e.target.checked)}/> Incluir materiales y cantos del pedido revisado en el PDF</label><p>Requiere un borrador de pedido completo, guardado y vigente. Las piezas excluidas no reciben especificación de material.</p><label><input type="checkbox" disabled={!!busy} checked={saveSkp} onChange={e=>setSaveSkp(e.target.checked)}/> Guardar también el archivo SKP</label><label><input type="checkbox" disabled={!!busy} checked={syncNames} onChange={e=>{setSyncNames(e.target.checked);markDirty();}}/> Sincronizar nombres de grupos y piezas en SketchUp</label><p>Si una pieza aparece en varios cajones compartidos, todas sus apariciones deben tener el mismo nombre. Para usar nombres distintos solo en el plano, desactivá la sincronización.</p><p>Guardar SKP conserva también los demás cambios del modelo abierto. Ctrl+Z deshace el guardado de guía y nombres en el modelo.</p></details><div className="action-with-help"><button disabled={!!saveBlock} aria-keyshortcuts="Control+S" title={saveBlock?`Guardar guía: ${saveBlock}`:'Guardar guía · Ctrl+S'} onClick={()=>void save()}>Guardar guía<small aria-hidden="true">{saveSkp?' + SKP':' · modelo abierto'}</small></button><HelpPopover title="Guardar guía"><p>Guarda nombres, notas y ajustes dentro del archivo SketchUp, junto con los cambios que tenga el modelo abierto.</p><p>Si el archivo es nuevo, SketchUp te pide dónde guardarlo. Si cancelás, falta guardar el SKP para conservar la guía al cerrar.</p></HelpPopover></div><button disabled={!!saveBlock} title={saveBlock?`Guardar y cerrar: ${saveBlock}`:undefined} onClick={()=>void save(true)}>Guardar y cerrar</button><div className="ux-primary-action"><div className="action-with-help"><button className="primary" disabled={!!exportBlock} aria-keyshortcuts="Control+Shift+E" aria-describedby={exportBlock?'export-block-reason':undefined} title={exportBlock?`Exportar PDF A4: ${exportBlock}`:'Exportar PDF A4 · Ctrl+Shift+E'} onClick={()=>void exportPdf()}>Exportar PDF A4</button><HelpPopover title="PDF para imprimir"><p>Exporta todas las guías generadas: una hoja A4 horizontal por mueble, con piezas, medidas y flechas.</p><p>Si algo no cabe o una nota perdió su destino, te indica qué corregir. Al imprimir, elegí tamaño real o 100 %.</p></HelpPopover></div>{exportBlock&&<small id="export-block-reason" className="ux-block-reason">{exportBlock}</small>}</div></div></header>
    {pendingConfirm&&<div role="alertdialog" aria-modal="false" aria-labelledby="ux-confirm-title" aria-describedby="ux-confirm-detail" className="ux-confirm" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeConfirm(false);}}}><div><strong id="ux-confirm-title">{pendingConfirm.title}</strong><p id="ux-confirm-detail">{pendingConfirm.detail}</p></div><div className="ux-confirm-actions"><button ref={confirmCancel} type="button" onClick={()=>closeConfirm(false)}>Seguir editando</button><button type="button" className="danger" onClick={()=>closeConfirm(true)}>{pendingConfirm.confirmLabel}</button></div></div>}
    {busy&&<div role="status" className="status ux-busy"><span className="ux-spinner" aria-hidden="true"/><span>{busy}</span>{elapsed>=2&&<span className="ux-busy-time" aria-hidden="true"> · {elapsed} s</span>}</div>}
    {error&&<div role="alert" className="error ux-notice"><span>{error}</span>{errorAction&&<button type="button" className="ux-notice-action" onClick={()=>runNoticeAction(errorAction)}>{errorAction.label}</button>}<button type="button" className="ux-notice-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={()=>setError('')}>×</button></div>}
    {message&&<div role="status" className="success ux-notice" onPointerEnter={()=>setNoticeHold(true)} onPointerLeave={()=>setNoticeHold(false)} onFocus={()=>setNoticeHold(true)} onBlur={()=>setNoticeHold(false)}><span>{message}</span>{messageAction&&<button type="button" className="ux-notice-action" onClick={()=>runNoticeAction(messageAction)}>{messageAction.label}</button>}<button type="button" className="ux-notice-close" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={()=>{setMessage('');setNoticeHold(false);}}>×</button></div>}
    {materialsVisited&&<div className="ux-materials-content" hidden={destination!=='materials'}><MaterialLibraryPanel refreshKey={catalogRefresh} onApplied={acceptPaintScan} onEdit={id=>{setCatalogFocus(id);setWorkshopTab('catalog');setShowWorkshop(true);}} onPaint={(id,autoStart)=>openPalette(true,id,autoStart)} onManageModel={()=>{setPaintPieceId(piece?.id);setShowPaint(true);}} onDirtyChange={setLibraryDirty} onChanged={()=>setMessage('Biblioteca del taller actualizada. Revisá las fichas antes de usar materiales en producción.')} onClose={()=>navigateModule('home')}/></div>}
    {destination==='order'&&<section className="ux-order-content" aria-label="Pedido a maderera"><div className="ux-module-intro"><div><span className="eyebrow">DEL MUEBLE AL CORTE</span><h2>Prepará un pedido claro</h2><p>Revisá material, espesor, orientación y cantos. El TXT se genera solo después del preflight y tu confirmación.</p></div></div><WorkshopPanel embedded initialTab="order" onDirtyChange={setWorkshopDirty} onClose={()=>{setWorkshopDirty(false);setDestination('home');}}/></section>}
    <main hidden={destination==='materials'||destination==='order'} className={`editor-main ${project&&hideFurniture?'furniture-hidden':''}`}>
      <aside id="furniture-chooser" className="left-panel" hidden={!!project&&hideFurniture}><div className="section-heading"><h2><span>01</span> Elegí los muebles</h2><HelpPopover title="Elegir muebles"><p>Marcar todos propone los grupos padres que contienen piezas. Usar selección de SketchUp toma los grupos que marcaste en SketchUp, incluso dentro de otro grupo.</p><p>Abrí «Ver contenido» para elegir un mueble interno. No se incluye al mismo tiempo un grupo y su descendiente. Los ocultos quedan identificados para que los revises.</p></HelpPopover></div><div className="naming-settings"><label>Abreviatura de la obra<input aria-label="Abreviatura de la obra" value={workCode} maxLength={2} placeholder="VF" disabled={!!busy} onChange={e=>setCode(e.target.value)}/></label><p className="hint">Dos letras. Ejemplo: VF = Vestuarios de Futbol. El módulo se toma de M01, M02… en el nombre del grupo.</p></div><div className="project-card"><span>MODELO ABIERTO</span><p>{scan?.tree.modelName||'Leyendo SketchUp…'}</p></div><div className="scope-buttons"><button disabled={!!busy} onClick={()=>void analyze('all')}>Marcar todos</button><button disabled={!!busy} onClick={()=>void analyze('selected')}>Usar selección de SketchUp</button></div><p className="hint">Marcá los muebles que necesitás. Revisá los grupos internos antes de generar.</p>
        <label className="tree-filter">Mostrar en el listado<select aria-label="Filtrar muebles" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Todos</option><option value="selected">Seleccionados para generar</option><option value="unselected">No seleccionados para generar</option></select></label><div className="tree">{scan&&tree(visibleTree(scan.tree.roots))}</div>
        {scan?.tree.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
        <button className="primary wide" disabled={!!busy||!ids.length} onClick={()=>void generate()}>Generar guías ({ids.length})</button>
        <button className="quiet wide" disabled={!!busy} onClick={()=>void analyze()}>Volver a analizar</button>
        <details className="diagnostics"><summary>Si necesitás ayuda con un error</summary><p>Este diagnóstico muestra la versión instalada. No envía tu modelo.</p><button disabled={!!busy} onClick={()=>void run('Comprobando instalación…',async()=>{const result=await request('diagnostic');setDiagnostic(JSON.stringify(result,null,2));})}>Ver diagnóstico</button><pre>{diagnostic}</pre></details>
      </aside>
      <section className="workspace">
        {destination==='home'?<div className="ux-home"><span className="eyebrow">TRABAJO DE TALLER</span><h2>Del modelo a una guía clara.</h2><p className="ux-home-lead">Elegí el mueble, revisá sus piezas y prepará lo que necesita el taller. Tu modelo original se conserva.</p><div className="ux-current-job"><span>TRABAJO ACTUAL</span><strong>{furniture?.name||scan?.tree.modelName||'Esperando el modelo abierto'}</strong><p>{project?`${project.furniture.length} muebles · ${project.furniture.reduce((sum,f)=>sum+f.pieces.length,0)} piezas en revisión`:`${ids.length} muebles seleccionados para generar`}</p><button className="primary" disabled={!!busy||!scan} onClick={()=>navigateModule(project?'guides':'furniture')}>{project?'Continuar con los planos':'Revisar muebles seleccionados'}</button></div><div className="ux-next-steps"><button onClick={()=>navigateModule('materials')}><ModuleIcon name="materials"/><strong>1. Materiales del taller</strong><span>Texturas reales, candidatos y fichas revisadas.</span></button><button onClick={()=>navigateModule('furniture')}><ModuleIcon name="furniture"/><strong>2. Muebles y nombres</strong><span>Encontrá cada pieza y editá su nombre con las medidas protegidas.</span></button><button onClick={()=>navigateModule('guides')}><ModuleIcon name="guides"/><strong>3. Plano de armado</strong><span>Elegí vistas, agregá indicaciones y exportá una A4 por mueble.</span></button></div><p className="ux-home-help">Para pintar directamente en SketchUp usá <strong>Pintar</strong> o la barra nativa. La paleta deja libre el modelo.</p></div>:furniture&&project?<>
          <nav className="furniture-tabs" aria-label="Guías por mueble">{project.furniture.map(f=><button className={f.id===furniture.id?'active':''} key={f.id} disabled={!!busy||draftHidden!==null} onClick={()=>{setDraftHidden(null);setFurnitureId(f.id);setPieceId('');setNoteId('');setPicking(undefined);setPieceQuery('');setOnlySelected(false);setEditingPieceId('');}}>{f.name}<small>{f.pieces.length} piezas</small></button>)}</nav>
          <div className="guide-heading"><div><span className="eyebrow">{destination==='furniture'?'MUEBLES Y PIEZAS':'FICHA DE ARMADO A4'}</span><h1>{furniture.name}</h1></div><div className="guide-actions"><button className="quiet" aria-expanded={!hideFurniture} aria-controls="furniture-chooser" onClick={()=>setHideFurniture(v=>!v)}>{hideFurniture?'Mostrar muebles':'Ocultar muebles'}</button><span className="piece-count">{furniture.pieces.length} piezas · {project.furniture.length} {project.furniture.length===1?'guía':'guías'} en el PDF</span></div></div>
          {selectionChanged&&<div className="selection-notice" role="status">Cambiaste los muebles elegidos. Pulsá <strong>Generar guías</strong> para actualizar la vista y habilitar el PDF.</div>}
          <div className="assembly-layout">
            <div className="assembly-drawing">
              <section className={`view ${picking?'picking':''}`} aria-label="Visor del mueble">
                <div className="view-toolbar"><div className="view-switch" role="group" aria-label="Vista del mueble">{(['front','back'] as const).map(v=><button key={v} aria-label={v==='front'?'Ver exterior':'Ver interior'} aria-pressed={view===v} disabled={!!busy} onClick={()=>setView(v)}>{v==='front'?'Exterior':'Interior'}</button>)}</div><HelpPopover title="Vistas configurables"><p>Exterior muestra el mueble armado. Interior conserva la cámara y permite ocultar piezas de forma individual. Elegí arriba qué vistas se imprimirán en la hoja A4.</p><p>Girar o quitar piezas en el plano nunca cambia la geometría ni la visibilidad del modelo original. Las notas ancladas a una pieza oculta requieren revisar su visibilidad antes de imprimir.</p></HelpPopover><button className="highlight-toggle" disabled={!!busy||!piece} aria-pressed={highlight} onClick={()=>setHighlight(v=>!v)}>Resaltar pieza</button><button disabled={!!busy||!piece||contextChanged||modelAnalysisStale} onClick={()=>void highlightNativePiece()}>Resaltar en SketchUp</button></div>
                <div className="viewer-tools" role="group" aria-label="Herramienta del plano">{([['select','Seleccionar piezas','Seleccionar'],['orbit','Rotar con el mouse','Rotar'],['dimensions','Mover cotas','Mover cotas']] as const).map(([value,label,text])=><button key={value} disabled={!!busy||(draftHidden!==null&&value!=='select')} aria-label={label} aria-pressed={tool===value&&!picking} onClick={()=>{setTool(value);setPicking(undefined);}}><ToolIcon tool={value}/>{text}</button>)}<button aria-label="Agregar nota" disabled={!!busy||draftHidden!==null} onClick={()=>{setTool('select');setPicking('new');}}>+ Agregar nota</button></div>
                {picking?<div className="pick-hint">Hacé clic sobre una superficie para anclar la flecha. <button onClick={()=>setPicking(undefined)}>Cancelar</button></div>:<p className="viewer-hint">{tool==='orbit'?'Arrastrá el dibujo para rotarlo. El giro de esta vista se guarda con la guía.':tool==='dimensions'?'Arrastrá una cota o usá las flechas del teclado. Estás viendo el encuadre de impresión.':'Tocá una pieza o su ID para encontrar su nombre en el listado.'}</p>}
                <Diagram paper fit highlight={highlight} onOrbit={tool==='orbit'&&!busy&&draftHidden===null?delta=>changeFurniture(f=>({...f,presentation:orbitCamera(f,view,delta)})):undefined} onMoveDimension={tool==='dimensions'&&!busy&&draftHidden===null?(id,role,delta)=>changeFurniture(f=>({...f,presentation:shiftDimension(f,view,id,role,delta,[scene?.width||640,scene?.height||450])})):undefined} onHideDimension={busy||draftHidden!==null||tool!=='select'?undefined:(id,role)=>changeFurniture(f=>({...f,hiddenDimensions:setDimensionVisible(f,id,role,false)}))} layout={tool==='dimensions'?'sheet':'editor'} view={view} scene={scene} furniture={previewFurniture!} selected={piece?.id} onPick={busy||tool!=='select'?undefined:hideMode&&view==='back'&&draftHidden!==null?(id=>{selectPiece(id);setDraftHidden(previous=>previous===null?previous:previous.includes(id)?previous.filter(piece=>piece!==id):[...previous,id]);}):draftHidden!==null?(id=>selectPiece(id)):pick} onNote={busy?undefined:id=>setNoteId(id)} onMove={busy||draftHidden!==null||tool==='orbit'?undefined:(id,position)=>changeFurniture(f=>({...f,notes:f.notes.map(n=>n.id===id?{...n,position}:n)}))}/>
                <div className="viewer-sliders"><div className="control-with-help"><label>Zoom<input aria-label="Zoom" disabled={!!busy||draftHidden!==null} type="range" min="0.35" max="1.4" step="0.05" value={furniture.zoom} onChange={e=>changeFurniture(f=>({...f,zoom:Number(e.target.value)}))}/><output>{Math.round(furniture.zoom*100)}%</output></label><HelpPopover title="Zoom"><p>Ajusta el tamaño del dibujo en la guía y en el PDF. Si una pieza sale del encuadre, bajá el zoom antes de exportar.</p><p>El visor aprovecha el espacio libre alrededor del mueble. El encuadre de impresión se ve al elegir Mover cotas.</p></HelpPopover></div></div>
                <div className="viewer-caption"><span>{dimensionCaption(furniture)}</span><HelpPopover title="Cotas de las piezas"><p>El largo y el ancho se acotan en una pieza por tamaño dentro de cada mueble. Todas las piezas se conservan en el listado. El espesor se consulta en la tabla.</p><p>Podés mover u ocultar cotas. Si no caben legiblemente en la A4, se indica qué corregir antes de exportar.</p></HelpPopover></div>
              </section>
              <ViewAdjustments furniture={furniture} view={view} mode={tool} showTools={false} disabled={!!busy||draftHidden!==null} onMode={setTool} onChange={presentation=>changeFurniture(f=>({...f,presentation}))}/>
              <DimensionControls furniture={furniture} disabled={!!busy} onChange={hiddenDimensions=>changeFurniture(f=>({...f,hiddenDimensions}))}/>
              <GuideViews hideMode={hideMode} onHideMode={()=>{setTool('select');setPicking(undefined);setHideMode(value=>!value);}} furniture={furniture} view={view} selectedId={piece?.id} draftHidden={draftHidden} disabled={!!busy} onChange={next=>changeFurniture(()=>next)} onSelect={id=>selectPiece(id)} onView={view=>{setView(view);if(view==='front')setHideMode(false);}} onDraft={ids=>{setTool('select');setPicking(undefined);setDraftHidden(ids);}} onApply={()=>{if(draftHidden!==null)changeFurniture(f=>({...f,presentation:{...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}}}));setDraftHidden(null);setHideMode(false);}} onCancel={()=>{setDraftHidden(null);setHideMode(false);}}/>
              {destination==='guides'&&sheetPreviewProject&&<A4SheetPreview project={sheetPreviewProject} references={printMaterials?previewReferences:undefined} disabled={draftHidden!==null||contextChanged||modelAnalysisStale||(printMaterials&&!previewReferences)} pendingReason={draftHidden!==null?'Aplicá o cancelá las piezas ocultas para actualizar la hoja.':contextChanged?'Volvé al modelo de la guía para revisar la hoja.':previewReferenceError||(printMaterials&&!previewReferences?'Revisando referencias de materiales y cantos del pedido…':undefined)}/>}
              {!!warnings.length&&<div className="warnings" role="status">{warnings.map(w=><p key={w}>{w}</p>)}</div>}
            </div>
            <div className="assembly-inspector">
              <section className="parts-config" aria-label="Configuración de grupos y piezas">
                <div className="table-heading"><h2><span>02</span> Grupos y piezas</h2><HelpPopover title="Nombres y medidas"><p>Tocá una pieza del dibujo para encontrarla en el listado. También podés buscar por ID o nombre y usar las flechas para recorrer las piezas.</p><p>Escribí solo el nombre de la pieza, por ejemplo Lateral. Obra y módulo se agregan automáticamente. Al guardar se actualizan en SketchUp si Sincronizar nombres está activado.</p><p>Las medidas están en milímetros y no se editan acá. Buscar, filtrar o resaltar no quita piezas del PDF.</p></HelpPopover><button disabled={!!busy||draftHidden!==null||!syncNames||contextChanged||modelAnalysisStale} onClick={()=>void openNameBatch()}>Aplicar renombrado</button><button ref={suggestionsTrigger} className="suggest-names" aria-label="Proponer nombres por geometría…" disabled={!!busy||draftHidden!==null} onClick={()=>setShowSuggestions(true)}>Proponer nombres</button></div>
                <div className="group-configuration"><label>Nombre del grupo<input aria-label="Nombre del grupo" maxLength={80} disabled={!!busy} value={furniture.name} onChange={e=>{const name=e.target.value;changeFurniture(f=>withNaming({...f,name,groupName:name},workCode,moduleFromName(name)||f.naming?.moduleCode||''));}}/></label><div className="module-configuration"><label>Módulo<input aria-label="Módulo de este mueble" placeholder="M01" value={furniture.naming?.moduleCode||''} disabled={!!busy} maxLength={4} onChange={e=>changeFurniture(f=>withNaming(f,workCode,e.target.value.toUpperCase()))}/></label><p>Obra <strong>{workCode||'sin completar'}</strong><br/>Nombre: {workCode||'[obra]'} {furniture.naming?.moduleCode||'[módulo]'} + pieza</p></div></div>
                {piece&&<div className="selected-piece-summary" aria-live="polite"><span className="selected-code">{selectedRow?.code||piece.code}</span><div><strong>{selectedRow&&selectedRow.quantity>1?`${selectedRow.quantity} piezas iguales`:'Pieza seleccionada'}</strong><span>{piece.name}</span></div><div className="piece-navigation"><button aria-label="Pieza anterior" disabled={!!busy||pieceIndex<=0} onClick={()=>selectPiece(rows[pieceIndex-1].id,true,true)}>‹</button><small>{pieceIndex+1}/{rows.length}</small><button aria-label="Pieza siguiente" disabled={!!busy||pieceIndex>=rows.length-1} onClick={()=>selectPiece(rows[pieceIndex+1].id,true,true)}>›</button></div></div>}
                <div className="piece-grouping"><label><input type="checkbox" aria-label="Agrupar componentes iguales" disabled={!!busy||(!repeated&&!furniture.groupIdentical)} checked={furniture.groupIdentical||false} onChange={e=>{const groupIdentical=e.target.checked;setPieceQuery('');setEditingPieceId('');changeFurniture(f=>withNaming({...f,groupIdentical},workCode));}}/><span>Agrupar componentes iguales<small>{repeated?`${repeated} ${repeated===1?'grupo de repetidos':'grupos de repetidos'} · mismo componente, medidas y material`:'No hay componentes repetidos compatibles'}</small></span></label><HelpPopover title="Piezas iguales"><p>Una fila, un nombre y un ID para los componentes iguales de este mueble. La cantidad indica cuántas piezas hay y el ID se repite en cada una en ambas vistas.</p><p>Se muestra el nombre de la primera pieza como referencia. Agrupar no cambia los nombres de las instancias en SketchUp. Si editás el nombre de la fila, ese cambio sí se aplica a todas sus piezas al guardar. Se mantienen las medidas y todas las geometrías. Las notas siguen en la pieza física donde las anclaste.</p><p>Se exige misma definición, medidas y material. Las piezas con escalas locales distintas o espejadas en distinto sentido quedan separadas. Desactivar recupera los IDs y nombres individuales; si editaste el nombre de la fila, se conservan esos cambios explícitos.</p></HelpPopover></div><div className="parts-search"><label>Buscar piezas<div className="search-field"><input type="search" aria-label="Buscar piezas" placeholder="ID o nombre de la pieza" value={pieceQuery} onChange={e=>setPieceQuery(e.target.value)}/>{pieceQuery&&<button aria-label="Limpiar búsqueda" onClick={()=>setPieceQuery('')}>×</button>}</div></label><div className="parts-filter"><div role="group" aria-label="Filtrar piezas"><button aria-pressed={!onlySelected} onClick={()=>setOnlySelected(false)}>Todas</button><button aria-pressed={onlySelected} onClick={()=>setOnlySelected(true)}>Seleccionada</button></div><span role="status">{visiblePieces.length} de {rows.length}{furniture.groupIdentical?' tipos':''}</span></div></div>
                <div className="table-scroll" ref={partsScroll}><table aria-label="Piezas del mueble"><thead><tr><th>ID</th><th>Pieza y medidas · mm</th></tr></thead><tbody>{visiblePieces.map(p=><tr key={p.id} data-piece-row={p.id} aria-selected={p.memberIds.includes(piece?.id||'')} className={p.memberIds.includes(piece?.id||'')?'selected':''} onClick={()=>selectPiece(p.id)}><td><button className="piece-code-button" aria-label={`Elegir ${p.code}`} disabled={!!busy} onClick={e=>{e.stopPropagation();selectPiece(p.id,true);}}>{p.code}</button><small>×{p.quantity}</small></td><td><input data-piece-name={p.id} aria-label={`Nombre ${p.code}`} value={furniture.naming?.bases.find(b=>b.id===p.id)?.base??p.name} maxLength={70} disabled={!!busy} onFocus={()=>startNameEdit(p.id)} onBlur={()=>{editSnapshot.current=undefined;setEditingPieceId('');}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelNameEdit(p.id);event.currentTarget.blur();}else if(event.key==='Enter'||(event.key==='Tab'&&!event.shiftKey)){event.preventDefault();stepNameEdit(p.id);if(event.key==='Enter')event.currentTarget.blur();}}} onChange={e=>changeFurniture(f=>withNaming(f,workCode,undefined,{id:p.id,base:e.target.value}))}/>{p.name!==(furniture.naming?.bases.find(b=>b.id===p.id)?.base??p.name)&&<small className="composed-name">{p.name}</small>}<dl className="piece-measures">{p.dimensions.map((d,i)=><div key={i}><dt>{['Largo','Ancho','Espesor'][i]}</dt><dd>{mm(d)}</dd></div>)}</dl>{p.warnings.map(w=><small className="piece-warning" key={w}>{w}</small>)}</td></tr>)}</tbody></table>{!visiblePieces.length&&<div className="parts-empty"><strong>No hay piezas con ese filtro</strong><p>Probá otro nombre o volvé al listado completo.</p><button onClick={()=>{setPieceQuery('');setOnlySelected(false);}}>Mostrar todas las piezas</button></div>}</div>
                <p className="parts-instructions">Editá solo el nombre. Medidas del modelo protegidas.<br/>Los filtros afectan este listado; el PDF incluye todas las piezas.{furniture.groupIdentical&&<> Los IDs compartidos indican piezas iguales; la cantidad figura en cada fila.</>}</p>
              </section>
      <aside className="notes-panel"><div className="section-heading"><h2><span>03</span> Indicaciones</h2><HelpPopover title="Notas con flechas"><p>Elegí «Agregar nota» y hacé clic sobre la superficie de la pieza donde debe terminar la flecha. Después escribí la indicación.</p><p>Arrastrá la tarjeta para acomodarla. La punta sigue vinculada a esa pieza al cambiar la cámara. Escape cancela la elección del destino.</p></HelpPopover></div><p className="hint">Una indicación breve, una flecha y su pieza de destino.</p>
        {furniture&&<><button disabled={!!busy||draftHidden!==null} className="wide" onClick={()=>{setTool('select');setPicking('new');}}>Agregar nota con flecha</button><div className="note-list">{[...furniture.notes,...orphanNotes].map(n=><button key={n.id} className={noteId===n.id?'active':''} onClick={()=>{setNoteId(n.id);setPieceId(n.pieceId);}}><strong>{codes.get(n.pieceId)||'SIN DESTINO'}</strong><span>{n.text||'Nota vacía'}</span></button>)}</div>
          {note?<div className="note-editor"><label>Texto de la indicación<textarea ref={noteInput} aria-label="Texto de la nota" disabled={!!busy} maxLength={200} value={note.text} onChange={e=>updateNote(e.target.value)}/></label><small>{note.text.length}/200 caracteres</small><div className="action-with-help"><button disabled={!!busy} onClick={()=>{setTool('select');setPicking(note.id);}}>Cambiar destino de la flecha</button><HelpPopover title="Cambiar destino"><p>Elegí esta opción y hacé clic sobre la nueva pieza. Conserva el texto y la ubicación de la tarjeta.</p><p>Si borraste una pieza del modelo, su nota aparece «Sin destino». Reanclala o eliminala antes de exportar.</p></HelpPopover></div><button className="danger" disabled={!!busy} onClick={removeNote}>Eliminar nota</button><p className="hint">Para mover la tarjeta: arrastrala o seleccionala y usá las flechas del teclado.</p></div>:<p className="muted">Las notas que agregues aparecen acá. Elegí una para editarla.</p>}
          {piece&&<details className="piece-info"><summary>Información de {selectedRow?.code||piece.code}</summary><p>{piece.metadata?.originalName||piece.metadata?.definitionName||piece.name}</p><small>Instancia: {piece.id}</small><p>{piece.dimensions.map(mm).join(' × ')} mm</p><p>Las medidas se actualizan desde SketchUp; no se editan en la guía.</p></details>}
        </>}
      </aside>
            </div>
          </div>
        </>:<div className="empty"><span className="eyebrow">DEL MODELO AL TALLER</span><h1>Prepará una guía clara para armar.</h1><ol><li>Elegí los muebles del modelo abierto.</li><li>Pulsá <strong>Generar guías</strong> y revisá las piezas.</li><li>Agregá indicaciones y exportá el PDF A4.</li></ol><p>Usá los botones <strong>?</strong> si necesitás una explicación.</p></div>}
      </section>

    </main><footer><strong>SANTO CARPINTERO</strong><span>Una hoja A4 por mueble · Las medidas se conservan del modelo</span></footer>
  </div></div></div></>;
}
