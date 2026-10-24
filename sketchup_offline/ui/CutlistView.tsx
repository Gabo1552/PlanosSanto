import {useCallback,useEffect,useId,useMemo,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {request} from './bridge';
import HelpPopover from './HelpPopover';
import {DEFAULT_OPTIONS,KIND_LABELS,buildEdgeSections,buildSections,cutlistCsv,designationDetail,finalMm,focusLabel,formatM2,formatM3,formatMetres,formatMm,grainNote,
  highlightNotice,nextFocus,parseOptions,rowLetter,sectionTitle,stripDesignation,summaryRows,
  type CutlistData,type CutlistEdgeSection,type CutlistHighlight,type CutlistOptions,type CutlistPiece,type CutlistSection,type SummaryKind,type SummaryRow} from './cutlistModel';
import './cutlist.css';

// Pestaña «Piezas»: listado de partes de los muebles generados. Arriba, un resumen por material (placas,
// cantos y lo que no tiene tipo); debajo, una sección por material con sus piezas o sus tiras de canto.
// Solo lectura: Generar vuelve a leer, Imprimir usa la impresión del diálogo y Exportar escribe un CSV.
// 0.8.20: clic en una fila del resumen → su sección; clic en una pieza o tira → SketchUp la selecciona y la encuadra
// (todas las instancias de la fila; otro clic o ← → las recorre de a una) y «Volver a la vista anterior» deshace la vista.
export type CutlistViewProps={
  /** Hay guías generadas: sin ellas no se pide nada a Ruby. */
  ready:boolean;
  /** Fuente de datos; por defecto la acción Ruby `cutlist`. */
  load?:()=>Promise<CutlistData>;
  /** Guardado del CSV; por defecto la acción Ruby `cutlist_csv` (diálogo nativo para elegir el archivo). */
  saveCsv?:(csv:string,modelName:string)=>Promise<{path?:string;cancelled?:boolean}>;
  /** Clic en una pieza o tira: todas las instancias de la fila (o una, con `focus`). Por defecto la acción Ruby
   * `piece_highlight` con encuadre: selecciona, mueve la cámara y dibuja el contorno. */
  highlight?:(pieceIds:string[],focus:number|null)=>Promise<CutlistHighlight>;
  /** «Volver a la vista anterior»: cámara, grupo abierto y selección de antes de mirar piezas (`piece_highlight_restore`). */
  restoreView?:()=>Promise<{restored?:boolean}>;
  onGoToFurniture?:()=>void;
  /** Lápiz: abre la ficha de la biblioteca en Materiales. */
  onCreateMaterial?:(modelMaterialId:string)=>void;
  onEditMaterial?:(catalogId:string)=>void;
  onDataLoaded?:(data:CutlistData)=>void;
  /** 0.8.20: «Agregar 16 mm a la ficha» (espesor fuera de la lista); por defecto la acción Ruby `catalog_add_thickness`. */
  addThickness?:(catalogId:string,thicknessMm:number)=>Promise<unknown>;
};

const defaultLoad=()=>request<CutlistData>('cutlist');
const defaultAddThickness=(id:string,thicknessMm:number)=>request('catalog_add_thickness',{id,thicknessMm});
const defaultSave=(csv:string,modelName:string)=>request<{path?:string;cancelled?:boolean}>('cutlist_csv',{csv,modelName});
const defaultHighlight=(pieceIds:string[],focus:number|null)=>request<{highlight?:CutlistHighlight}>('piece_highlight',{pieceIds,...(focus==null?{}:{focus}),frame:true})
  .then(result=>{if(!result?.highlight)throw new Error('Respuesta de resaltado incompatible: actualizá la extensión.');return result.highlight;});
const defaultRestore=()=>request<{restored?:boolean}>('piece_highlight_restore');
/** Clic que cayó en un control propio de la fila (botones, panel de la pieza): no es un clic «en la fila». */
const onControl=(event:{target:EventTarget|null})=>event.target instanceof Element&&!!event.target.closest('button,a,input,select,.cutlist-look');
/** Alto de lo que la ventana deja fijo arriba al hacer scroll (barra de avisos), para no tapar la sección. */
const stickyTop=()=>[...document.querySelectorAll<HTMLElement>('.ux-notices')].reduce((sum,element)=>getComputedStyle(element).position==='sticky'?sum+element.getBoundingClientRect().height:sum,0);
const smooth=()=>{try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto' as const:'smooth' as const;}catch{return 'auto' as const;}};
/** Pieza mostrada en SketchUp: fila, sección, instancias, recorrido y aviso. */
type Look={key:string;group:string;name:string;ids:string[];focus:number|null;state:'busy'|'ok'|'restored'|'error';text:string};
const valid=(value:unknown):value is CutlistData=>!!value&&typeof value==='object'&&Array.isArray((value as CutlistData).pieces)&&Array.isArray((value as CutlistData).sections)
  &&Array.isArray((value as CutlistData).furniture)&&Array.isArray((value as CutlistData).edgeSections);
const plural=(count:number,one:string,many:string)=>`${formatMm(count)} ${count===1?one:many}`;
const OPTIONS_KEY='planos-santo.cutlist.options';
function readOptions(){try{return parseOptions(localStorage.getItem(OPTIONS_KEY));}catch{return {...DEFAULT_OPTIONS};}}

// Íconos propios, trazos simples a 16 px.
const PATHS:Record<string,ReactNode>={
  refresh:<><path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M12.5 1.5v3h-3"/></>,
  print:<><path d="M4.5 6V2h7v4"/><rect x="2" y="6" width="12" height="5.5" rx="1"/><path d="M4.5 9.5h7V14h-7z"/></>,
  export:<><path d="M8 10V2"/><path d="M5 4.5 8 1.5l3 3"/><path d="M3 8v5.5h10V8"/></>,
  options:<><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></>,
  eye:<><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></>,
  eyeOff:<><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><path d="M2.5 13.5 13.5 2.5"/></>,
  pencil:<><path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/></>,
  more:<><circle cx="8" cy="3.5" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="8" cy="12.5" r=".9"/></>,
  up:<path d="M3.5 10 8 5.5l4.5 4.5"/>,
  prev:<path d="M10 3.5 5.5 8l4.5 4.5"/>,
  next:<path d="M6 3.5 10.5 8 6 12.5"/>,
  back:<><path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7"/></>,
  summary:<><path d="M8 14V5.5"/><path d="M4.5 9 8 5.5 11.5 9"/><path d="M3 2h10"/></>,
  down:<path d="M3.5 6 8 10.5 12.5 6"/>,
  warn:<><path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/></>,
  grain:<><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M4.5 6.5h7M4.5 9.5h7"/></>,
};
function Icon({name}:{name:keyof typeof PATHS}){return <svg className="cutlist-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{PATHS[name]}</svg>;}
/** Tipo de la fila: placa (capas), canto (rollo) o «?». */
function TypeIcon({kind}:{kind:SummaryKind}){
  const label=KIND_LABELS[kind];
  return <span className={`cutlist-type is-${kind}`} title={label}>
    {kind==='unknown'?<span aria-hidden="true">?</span>:<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">{kind==='sheet'
      ?<><path d="M3 7.5 10 4l7 3.5-7 3.5z"/><path d="M3 10.5l7 3.5 7-3.5"/><path d="M3 13.5l7 3.5 7-3.5"/></>
      :<><circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="3.8"/><circle cx="10" cy="10" r="1.3"/></>}</svg>}
    <span className="sr-only">{label}</span></span>;
}
const Dot=({color}:{color:string|null})=><span className={`cutlist-dot${color?'':' is-empty'}`} style={color?{background:color}:undefined} aria-hidden="true"/>;
const Warnings=({items}:{items:string[]})=>items.length?<>{items.map(text=><span key={text} className="cutlist-warn"><Icon name="warn"/>{text}</span>)}</>:null;

/** Nombre del material con su medida: «Placa / 18 mm» o «Canto / 0,45 mm x 22 mm» (en rojo lo aproximado). */
function MaterialName({row}:{row:Pick<SummaryRow,'kind'|'name'|'thicknessMm'|'widthMm'|'widthApprox'>}){
  if(row.kind!=='edge')return <><span className="cutlist-material-name">{row.name}</span>{row.thicknessMm!=null&&<> / <strong>{formatMm(row.thicknessMm)} mm</strong></>}</>;
  const width=row.widthMm==null?null:<strong className={row.widthApprox?'is-approx':undefined} title={row.widthApprox?'Ancho aproximado: espesor de la pieza':undefined}>{formatMm(row.widthMm)} mm</strong>;
  return <><span className="cutlist-material-name">{row.name}</span>{(row.thicknessMm!=null||width)&&<> / {row.thicknessMm!=null&&<strong>{formatMm(row.thicknessMm)} mm</strong>}{row.thicknessMm!=null&&width&&' x '}{width}</>}</>;
}

type MenuItem={label:string;onSelect:()=>void};
/** Menú «⋮» de una sección: botón con lista de acciones, Escape y flechas. */
function SectionMenu({label,items}:{label:string;items:MenuItem[]}){
  const [open,setOpen]=useState(false),id=useId(),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const outside=(event:PointerEvent)=>{if(!list.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  const key=(event:ReactKeyboardEvent)=>{
    const entries=[...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]')||[])],index=entries.indexOf(document.activeElement as HTMLElement);
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();setOpen(false);trigger.current?.focus();}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();entries[(index+(event.key==='ArrowDown'?1:entries.length-1))%entries.length]?.focus();}
    else if(event.key==='Home'||event.key==='End'){event.preventDefault();entries[event.key==='Home'?0:entries.length-1]?.focus();}
  };
  return <span className="cutlist-menu"><button ref={trigger} type="button" className="cutlist-icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}><Icon name="more"/></button>
    {open&&<div ref={list} id={id} role="menu" aria-label={label} className="cutlist-menu-list" onKeyDown={key}>{items.map(item=><button key={item.label} type="button" role="menuitem" tabIndex={-1} onClick={()=>{setOpen(false);trigger.current?.focus();item.onSelect();}}>{item.label}</button>)}</div>}</span>;
}

export default function CutlistView({ready,load=defaultLoad,saveCsv=defaultSave,highlight=defaultHighlight,restoreView=defaultRestore,onGoToFurniture,onEditMaterial,onCreateMaterial,onDataLoaded,addThickness=defaultAddThickness}:CutlistViewProps){
  const [data,setData]=useState<CutlistData>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[notice,setNotice]=useState('');
  const [furnitureId,setFurnitureId]=useState(''),[query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set()),[hidden,setHidden]=useState<Set<string>>(()=>new Set());
  const [look,setLook]=useState<Look>(),[canRestore,setCanRestore]=useState(false),[announce,setAnnounce]=useState(''),[flash,setFlash]=useState('');
  const [options,setOptions]=useState<CutlistOptions>(readOptions),[showOptions,setShowOptions]=useState(false),[exporting,setExporting]=useState(false);
  const sequence=useRef(0),uid=useId(),optionsTrigger=useRef<HTMLButtonElement>(null),optionsPanel=useRef<HTMLDivElement>(null);
  const lookSequence=useRef(0),flashTimer=useRef<number|undefined>(undefined),summaryTable=useRef<HTMLTableElement>(null);
  useEffect(()=>()=>window.clearTimeout(flashTimer.current),[]);
  const refresh=useCallback(async()=>{
    if(!ready)return;
    const current=++sequence.current;setLoading(true);setError('');
    try{
      const result=await load();
      if(current!==sequence.current)return;
      if(!valid(result))throw new Error('Respuesta de piezas incompatible: actualizá la extensión.');
      setData(result);onDataLoaded?.(result);setLook(undefined);
      setFurnitureId(id=>result.furniture.some(f=>f.id===id)?id:'');
    }catch(value){if(current===sequence.current)setError(value instanceof Error?value.message:String(value));}
    finally{if(current===sequence.current)setLoading(false);}
  },[ready,load,onDataLoaded]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{try{localStorage.setItem(OPTIONS_KEY,JSON.stringify(options));}catch{/* almacenamiento bloqueado: las opciones duran esta sesión */}},[options]);
  useEffect(()=>{
    if(!showOptions)return;
    optionsPanel.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setShowOptions(false);optionsTrigger.current?.focus();}};
    const outside=(event:PointerEvent)=>{if(!optionsPanel.current?.contains(event.target as Node)&&!optionsTrigger.current?.contains(event.target as Node))setShowOptions(false);};
    document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
  },[showOptions]);

  const filter=useMemo(()=>({furnitureId:furnitureId||undefined,query}),[furnitureId,query]);
  const sections=useMemo(()=>data?buildSections(data,filter):[],[data,filter]);
  const edgeSections=useMemo(()=>data?buildEdgeSections(data,filter):[],[data,filter]);
  const nativeMaterialId=(key:string)=>{
    const section=sections.find(value=>value.info.key===key);
    const ids=section?section.pieces.flatMap(piece=>piece.material?.observedId?[piece.material.observedId]:piece.material?.observedIds||[]):edgeSections.find(value=>value.info.key===key)?.info.observedIds||[];
    const unique=[...new Set(ids)];return unique.length===1?unique[0]:undefined;
  };
  const summary=useMemo(()=>summaryRows(sections,edgeSections),[sections,edgeSections]);
  // Orden del listado = orden del resumen (placas, cantos, «?»).
  const groups=useMemo(()=>{
    const byKey=new Map<string,{kind:'sheet'|'edge';section:CutlistSection|CutlistEdgeSection}>([...sections.map(section=>[section.info.key,{kind:'sheet' as const,section}] as const),...edgeSections.map(section=>[section.info.key,{kind:'edge' as const,section}] as const)]);
    return summary.map(row=>({row,...byKey.get(row.key)!}));
  },[summary,sections,edgeSections]);
  const shown=groups.filter(group=>!hidden.has(group.row.key));
  const shownSheets=shown.filter(group=>group.kind==='sheet').map(group=>group.section as CutlistSection),shownEdges=shown.filter(group=>group.kind==='edge').map(group=>group.section as CutlistEdgeSection);
  const pieceCount=shownSheets.reduce((sum,section)=>sum+section.totals.pieces,0),area=shownSheets.reduce((sum,section)=>sum+section.totals.areaM2,0),edgeMetres=shownEdges.reduce((sum,section)=>sum+section.totals.lengthM,0);
  const allKeys=shown.map(group=>group.row.key);
  const anyOpen=allKeys.some(key=>!collapsed.has(key)),anyClosed=allKeys.some(key=>collapsed.has(key));
  const flip=(setter:typeof setCollapsed,key:string)=>setter(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const selected=look?.key;
  // El panel de la pieza solo se ve si su fila está a la vista; si no, «Volver a la vista anterior» pasa al encabezado.
  const lookVisible=!!look&&!hidden.has(look.group)&&!collapsed.has(look.group)&&(sections.some(s=>s.info.key===look.group&&s.pieces.some(p=>`${s.info.key}:${p.id}`===look.key))
    ||edgeSections.some(s=>s.info.key===look.group&&s.rows.some(r=>`${s.info.key}:${r.key}`===look.key)));
  const sigma=[options.length&&'length',options.area&&'area',options.volume&&'volume'].filter(Boolean) as ('length'|'area'|'volume')[];
  const groupId=(index:number)=>`${uid}-group-${index}`;

  /** Muestra la fila en SketchUp: todas sus instancias (focus null) o una («2 de 4»). */
  async function show(piece:CutlistPiece,key:string,group:string,name:string,focus:number|null){
    const current=++lookSequence.current,ids=piece.ids.length?piece.ids:[piece.id];
    setLook({key,group,name,ids,focus,state:'busy',text:'Mostrando en SketchUp…'});
    try{
      const result=await highlight(ids,focus);
      if(current!==lookSequence.current)return;
      const text=highlightNotice(result);
      setLook({key,group,name,ids,focus:result.focus??focus,state:'ok',text});setAnnounce(text);setCanRestore(result.canRestore!==false);
    }catch(value){
      if(current!==lookSequence.current)return;
      const text=`No se pudo mostrar en SketchUp: ${value instanceof Error?value.message:String(value)}`;
      setLook({key,group,name,ids,focus,state:'error',text});setAnnounce(text);
    }
  }
  // Primer clic: todas las instancias. Otro clic en la misma fila: la siguiente («1 de 4», «2 de 4»… y vuelve a todas).
  const activate=(piece:CutlistPiece,key:string,group:string,name:string)=>{
    const again=look?.key===key&&look.state==='ok'&&look.ids.length>1;
    void show(piece,key,group,name,again?nextFocus(look.focus,look.ids.length,1):null);
  };
  const step=(piece:CutlistPiece,key:string,group:string,name:string,direction:1|-1)=>{if(look?.key===key&&look.state!=='busy')void show(piece,key,group,name,nextFocus(look.focus,look.ids.length,direction));};
  const stepKey=(event:ReactKeyboardEvent,piece:CutlistPiece,key:string,group:string,name:string)=>{
    if((event.key!=='ArrowRight'&&event.key!=='ArrowLeft')||look?.key!==key||look.ids.length<2)return;
    event.preventDefault();step(piece,key,group,name,event.key==='ArrowRight'?1:-1);
  };
  async function restore(){
    const current=++lookSequence.current;
    try{
      const result=await restoreView();
      if(current!==lookSequence.current)return;
      const text=result?.restored===false?'No había una vista anterior guardada.':'Volviste a la vista anterior en SketchUp.';
      setCanRestore(false);setAnnounce(text);
      if(look&&lookVisible)setLook({...look,focus:null,state:'restored',text});else setNotice(text);
    }catch(value){
      if(current!==lookSequence.current)return;
      const text=`No se pudo volver a la vista anterior: ${value instanceof Error?value.message:String(value)}`;
      setAnnounce(text);if(look&&lookVisible)setLook({...look,state:'error',text});else setError(text);
    }
  }
  const restoreButton=<button type="button" className="cutlist-look-restore" title="Cámara, grupo abierto y selección de antes de mirar piezas" onClick={()=>void restore()}><Icon name="back"/>Volver a la vista anterior</button>;
  /** Panel bajo la designación de la fila mostrada: aviso, recorrido de instancias y vuelta a la vista anterior. */
  function lookPanel(piece:CutlistPiece,key:string,group:string,name:string){
    if(!look||look.key!==key)return null;
    return <div className={`cutlist-look is-${look.state}`}>
      <span className="cutlist-look-text">{look.state==='error'&&<Icon name="warn"/>}{look.text}</span>
      {look.ids.length>1&&<span className="cutlist-look-steps" role="group" aria-label={`Instancias de ${name}`}>
        <button type="button" className="cutlist-icon-button" aria-label="Instancia anterior" title="Instancia anterior (←)" disabled={look.state==='busy'} onClick={()=>step(piece,key,group,name,-1)}><Icon name="prev"/></button>
        <span className="cutlist-look-count">{focusLabel(look.focus,look.ids.length)}</span>
        <button type="button" className="cutlist-icon-button" aria-label="Instancia siguiente" title="Instancia siguiente (→)" disabled={look.state==='busy'} onClick={()=>step(piece,key,group,name,1)}><Icon name="next"/></button>
      </span>}
      {canRestore&&restoreButton}
    </div>;
  }

  /** Resumen → sección: la muestra si estaba oculta, la despliega, la sube arriba con scroll suave y la marca un instante. */
  function goTo(key:string,index:number){
    setHidden(old=>{if(!old.has(key))return old;const next=new Set(old);next.delete(key);return next;});
    setCollapsed(old=>{if(!old.has(key))return old;const next=new Set(old);next.delete(key);return next;});
    window.clearTimeout(flashTimer.current);setFlash(key);flashTimer.current=window.setTimeout(()=>setFlash(''),1600);
    requestAnimationFrame(()=>{
      const section=document.getElementById(groupId(index));
      // Los avisos de la ventana quedan fijos arriba: la sección se detiene debajo de ellos.
      if(section)section.style.scrollMarginTop=`${12+stickyTop()}px`;
      section?.scrollIntoView({block:'start',behavior:smooth()});
      document.getElementById(`${groupId(index)}-title`)?.focus({preventScroll:true});
    });
  }
  /** Sección → resumen: vuelve a la fila del material en la tabla de arriba. */
  function backToSummary(key:string){
    const link=summaryTable.current?.querySelector<HTMLElement>(`tr[data-key="${CSS.escape(key)}"] .cutlist-summary-link`);
    if(summaryTable.current)summaryTable.current.style.scrollMarginTop=`${12+stickyTop()}px`;
    summaryTable.current?.scrollIntoView({block:'start',behavior:smooth()});link?.focus({preventScroll:true});
  }
  function print(){
    document.body.classList.add('cutlist-printing');
    const done=()=>document.body.classList.remove('cutlist-printing');
    window.addEventListener('afterprint',done,{once:true});
    try{window.print();}finally{setTimeout(done,0);}
  }
  // 0.8.20: un espesor fuera de la lista de la ficha no bloquea; un clic lo agrega y el listado se vuelve a leer.
  async function addToFicha(info:CutlistSection['info']){
    if(!info.catalogId)return;
    setNotice('');setError('');
    try{await addThickness(info.catalogId,info.thicknessMm);setNotice(`${formatMm(info.thicknessMm)} mm agregado a los espesores de «${info.name}».`);await refresh();}
    catch(value){setError(value instanceof Error?value.message:String(value));}
  }
  async function exportCsv(only?:{sheets:CutlistSection[];edges:CutlistEdgeSection[]}){
    if(!data)return;
    setExporting(true);setNotice('');setError('');
    try{
      const result=await saveCsv(cutlistCsv(only?.sheets||shownSheets,only?.edges||shownEdges),data.modelName);
      if(!result?.cancelled)setNotice(`CSV guardado${result?.path?` en ${result.path}`:''}.`);
    }catch(value){setError(value instanceof Error?value.message:String(value));}
    finally{setExporting(false);}
  }

  if(!ready)return <section className="cutlist cutlist-empty" aria-labelledby={`${uid}-title`}><span className="eyebrow">LISTADO DE PIEZAS</span><h2 id={`${uid}-title`}>Primero generá las guías en Muebles</h2><p>El listado se arma con los muebles generados: material, espesor, medidas y cantos de cada pieza.</p>{onGoToFurniture&&<button type="button" className="primary" onClick={onGoToFurniture}>Ir a Muebles</button>}</section>;

  const sigmaCell=(row:SummaryRow,column:'length'|'area'|'volume')=>{
    if(row.kind==='unknown')return <td key={column} className="num is-hatched"><span className="sr-only">Sin dato: material sin tipo</span></td>;
    const value=column==='length'?row.lengthM:column==='area'?row.areaM2:row.volumeM3;
    const text=value==null?'—':column==='length'?formatMetres(value):column==='area'?formatM2(value):formatM3(value);
    return <td key={column} className="num">{text}{value==null&&<span className="sr-only">Sin espesor en la ficha</span>}</td>;
  };

  return <section className="cutlist" aria-labelledby={`${uid}-title`} aria-busy={loading||undefined}>
    <header className="cutlist-head">
      <h2 id={`${uid}-title`}>Listado de piezas</h2>
      <div className="cutlist-actions">
        <button type="button" className="cutlist-generate" disabled={loading} title="Volver a leer las piezas del modelo" onClick={()=>void refresh()}><Icon name="refresh"/>Generar</button>
        <button type="button" disabled={!data} title="Imprimir el listado que se ve" onClick={print}><Icon name="print"/>Imprimir</button>
        <button type="button" disabled={!data||exporting} title="Guardar un CSV con las piezas que se ven" onClick={()=>void exportCsv()}><Icon name="export"/>Exportar</button>
        {canRestore&&!lookVisible&&restoreButton}
        <span className="cutlist-options-anchor"><button ref={optionsTrigger} type="button" aria-expanded={showOptions} aria-controls={`${uid}-options`} onClick={()=>setShowOptions(value=>!value)}><Icon name="options"/>Opciones</button>
          <div ref={optionsPanel} id={`${uid}-options`} className="cutlist-options" role="group" aria-label="Opciones del listado" tabIndex={-1} hidden={!showOptions}>
            <fieldset><legend>Columnas Σ del resumen</legend>
              {([['length','Longitud'],['area','Área'],['volume','Volumen']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={options[key]} onChange={event=>setOptions(old=>({...old,[key]:event.target.checked}))}/>{label}</label>)}</fieldset>
            <fieldset><legend>Piezas</legend><label><input type="checkbox" checked={options.detail} onChange={event=>setOptions(old=>({...old,detail:event.target.checked}))}/>Detalle en la designación</label></fieldset>
            <p className="cutlist-options-unit"><span>Unidad</span> Milímetro (mm)</p>
            <button type="button" onClick={()=>setOptions({...DEFAULT_OPTIONS})}>Restablecer</button>
          </div></span>
        <HelpPopover title="Listado de piezas"><p>Arriba, el resumen por material: placas (cantidad de piezas, metros, m² y m³ netos), cantos (tiras, metros y m²) y lo que no tiene tipo («?»). Los avisos en rojo dicen qué le falta a la ficha.</p><p>Clic en una fila del resumen para ir a la sección de ese material; la flecha de la sección vuelve al resumen.</p><p>Debajo, una sección por material. Clic en una pieza o tira: SketchUp la selecciona, la encuadra y la marca con un contorno rojo. Si la fila tiene varias piezas iguales se muestran todas; otro clic (o ← →) las recorre de a una. «Volver a la vista anterior» deja la cámara como estaba. «~» marca medidas aproximadas (pieza no rectangular o canto sin ancho en la ficha).</p><p>Imprimir y Exportar toman lo que se ve: filtros y secciones ocultas con el ojo quedan afuera.</p></HelpPopover>
      </div>
    </header>
    <div className="cutlist-doc-tabs"><span className="cutlist-doc-tab"><strong>{data?.modelName||'Modelo'}</strong><span>Milímetro</span></span></div>
    <div className="cutlist-sheet">
      <div className="cutlist-filters">
        <div className="cutlist-field"><label htmlFor={`${uid}-furniture`}>Mueble</label><select id={`${uid}-furniture`} value={furnitureId} disabled={!data} onChange={event=>setFurnitureId(event.target.value)}><option value="">Todos los muebles</option>{data?.furniture.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div className="cutlist-field cutlist-search"><label htmlFor={`${uid}-search`}>Buscar</label><input id={`${uid}-search`} type="search" value={query} placeholder="Código o nombre" disabled={!data} onChange={event=>setQuery(event.target.value)}/></div>
        <div className="cutlist-tool-buttons" role="group" aria-label="Secciones de materiales">
          <button type="button" disabled={!anyClosed} onClick={()=>setCollapsed(new Set())}>Expandir todo</button>
          <button type="button" disabled={!anyOpen} onClick={()=>setCollapsed(new Set(allKeys))}>Plegar todo</button>
        </div>
        <p className="cutlist-totals" role="status">{data?`${plural(pieceCount,'pieza','piezas')} · ${plural(shownSheets.length,'material','materiales')} · ${formatM2(area)} · ${formatMetres(edgeMetres)} de canto`:loading?'Leyendo piezas del modelo…':''}</p>
      </div>
      {error&&<div role="alert" className="cutlist-error"><span>{error}</span>{/generá las guías/i.test(error)&&onGoToFurniture?<button type="button" onClick={onGoToFurniture}>Ir a Muebles</button>:<button type="button" onClick={()=>void refresh()}>Reintentar</button>}</div>}
      {notice&&<p className="cutlist-notice" role="status">{notice}</p>}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {data&&!data.complete&&<p className="cutlist-warning" role="note">El recorrido del modelo quedó incompleto: algunas piezas pueden faltar o mostrar materiales sin leer.</p>}
      {data&&!summary.length&&<p className="cutlist-none">{data.pieces.length?'Ninguna pieza coincide con el filtro.':'Los muebles generados no tienen piezas.'}</p>}
      {summary.length>0&&<table ref={summaryTable} className="cutlist-summary">
        <caption className="sr-only">Resumen por material</caption>
        <thead><tr><th scope="col" rowSpan={sigma.length?2:1} className="type">Tipo</th><th scope="col" rowSpan={sigma.length?2:1}>Espesor / Material</th><th scope="col" rowSpan={sigma.length?2:1} className="qty">Cantidad</th>{sigma.length>0&&<th scope="colgroup" colSpan={sigma.length}>Σ</th>}</tr>
          {sigma.length>0&&<tr>{sigma.map(column=><th key={column} scope="col" className="num">{column==='length'?'Longitud':column==='area'?'Área':'Volumen'}</th>)}</tr>}</thead>
        <tbody>{groups.map(({row},index)=>{const off=hidden.has(row.key),title=row.kind==='edge'?row.name:sectionTitle(row);
          // Toda la fila lleva a la sección; el nombre es el botón (teclado y lectores de pantalla).
          return <tr key={row.key} className={`is-${row.kind}${off?' is-off':''}`} data-key={row.key} title={`Ir a la sección ${title}`} onClick={event=>{if(!onControl(event))goTo(row.key,index);}}>
            <td className="type"><TypeIcon kind={row.kind}/></td>
            <td className="material"><div className="cutlist-material"><button type="button" className="cutlist-summary-link" aria-describedby={`${uid}-summary-hint`} onClick={()=>goTo(row.key,index)}><span className="sr-only">Ir a la sección </span><span className="cutlist-material-label"><Dot color={row.color}/><MaterialName row={row}/></span></button><Warnings items={row.warnings}/>
              <span className="cutlist-row-tools">
                {!row.catalogId&&onCreateMaterial&&nativeMaterialId(row.key)&&<button type="button" className="cutlist-icon-button" aria-label={`Crear ficha de ${row.name}`} title="Crear ficha desde el material del modelo" onClick={()=>onCreateMaterial(nativeMaterialId(row.key)!)}><Icon name="pencil"/></button>}
                {row.catalogId&&onEditMaterial&&<button type="button" className="cutlist-icon-button" aria-label={`Editar la ficha de ${row.name} en Materiales`} title="Editar la ficha en Materiales" onClick={()=>onEditMaterial(row.catalogId!)}><Icon name="pencil"/></button>}
                <button type="button" className="cutlist-icon-button" aria-pressed={!off} aria-label={`Mostrar la sección ${title}`} title={off?'Mostrar la sección':'Ocultar la sección'} onClick={()=>flip(setHidden,row.key)}><Icon name={off?'eyeOff':'eye'}/></button>
              </span></div></td>
            <td className="num qty">{row.count}</td>
            {sigma.map(column=>sigmaCell(row,column))}
          </tr>;})}</tbody>
      </table>}
      <span id={`${uid}-summary-hint`} className="sr-only">Lleva a la sección con el detalle de este material.</span>
      <span id={`${uid}-row-hint`} className="sr-only">La selecciona y la encuadra en SketchUp. Con varias piezas iguales, otro clic o las flechas izquierda y derecha las recorren de a una.</span>
      {groups.map(({row,kind,section},index)=>{
        if(hidden.has(row.key))return null;
        const open=!collapsed.has(row.key),bodyId=`${groupId(index)}-body`,titleId=`${groupId(index)}-title`,title=row.kind==='edge'?row.name:sectionTitle(row);
        const sheet=kind==='sheet'?section as CutlistSection:undefined,edge=kind==='edge'?section as CutlistEdgeSection:undefined;
        const note=sheet?grainNote(sheet.info,sheet.pieces):undefined;
        const menu:MenuItem[]=[{label:'Exportar CSV de esta sección',onSelect:()=>void exportCsv(sheet?{sheets:[sheet],edges:[]}:{sheets:[],edges:[edge!]})},
          ...(row.catalogId&&onEditMaterial?[{label:'Editar la ficha en Materiales',onSelect:()=>onEditMaterial(row.catalogId!)}]:[]),
          {label:'Ocultar la sección',onSelect:()=>flip(setHidden,row.key)}];
        return <section key={row.key} id={groupId(index)} className={`cutlist-group is-${row.kind}${flash===row.key?' is-flash':''}`} aria-labelledby={titleId}>
          <div className="cutlist-group-bar">
            <button type="button" className="cutlist-icon-button" aria-label={`Ocultar la sección ${title}`} title="Ocultar la sección" onClick={()=>flip(setHidden,row.key)}><Icon name="eye"/></button>
            <TypeIcon kind={row.kind}/>
            <h3 id={titleId} tabIndex={-1} className="cutlist-group-title"><Dot color={row.color}/><MaterialName row={row}/></h3>
            <Warnings items={row.warnings}/>
            {sheet?.info.thicknessInList===false&&<span className="cutlist-flag" role="note">Espesor fuera de la lista de la ficha</span>}
            {sheet?.info.thicknessInList===false&&sheet.info.catalogId&&<button type="button" disabled={loading} onClick={()=>void addToFicha(sheet.info)}>Agregar {formatMm(sheet.info.thicknessMm)} mm a la ficha</button>}
            {note&&<span className="cutlist-grain"><Icon name="grain"/>{note}</span>}
            <span className="cutlist-group-count">{sheet?plural(sheet.totals.pieces,'pieza','piezas'):plural(edge!.totals.strips,'tira','tiras')}</span>
            <span className="cutlist-group-tools">
              <button type="button" className="cutlist-icon-button" aria-label={`Volver al resumen desde ${title}`} title="Volver al resumen" onClick={()=>backToSummary(row.key)}><Icon name="summary"/></button>
              <SectionMenu label={`Más acciones de ${title}`} items={menu}/>
              <button type="button" className="cutlist-icon-button" aria-expanded={open} aria-controls={bodyId} aria-label={`${open?'Plegar':'Desplegar'} ${title}`} title={open?'Plegar':'Desplegar'} onClick={()=>flip(setCollapsed,row.key)}><Icon name={open?'up':'down'}/></button>
            </span>
          </div>
          <div id={bodyId} className="cutlist-table-wrap" hidden={!open}>
            {sheet&&<table className="cutlist-table">
              <caption className="sr-only">Piezas de {title}</caption>
              <thead><tr><th scope="col" rowSpan={2} className="no">No.</th><th scope="col" rowSpan={2}>Designación</th><th scope="col" rowSpan={2} className="qty">Cant.</th><th scope="colgroup" colSpan={row.kind==='unknown'?3:2}>Finales</th></tr>
                <tr><th scope="col" className="num"><abbr title="Longitud">L</abbr></th><th scope="col" className="num"><abbr title="Ancho">A</abbr></th>{row.kind==='unknown'&&<th scope="col" className="num"><abbr title="Espesor">E</abbr></th>}</tr></thead>
              <tbody>{sheet.pieces.map((piece,rowIndex)=>{const key=`${row.key}:${piece.id}`,approx=!piece.rectangular;
                return <tr key={piece.id} className={selected===key?'is-selected':undefined} aria-current={selected===key?'true':undefined} onClick={event=>{if(!onControl(event))activate(piece,key,row.key,piece.name);}} data-piece-id={piece.id}>
                  <td className="no">{rowLetter(rowIndex)}</td>
                  <td className="designation"><button type="button" className="cutlist-row-button" title="Ver en SketchUp" aria-describedby={`${uid}-row-hint`} onClick={()=>activate(piece,key,row.key,piece.name)} onKeyDown={event=>stepKey(event,piece,key,row.key,piece.name)}>{piece.name}</button>
                    {options.detail&&<small className="cutlist-detail"> ({designationDetail(piece,sheet.info)})</small>}
                    {piece.grain==='width'&&<span className="cutlist-flag">Fibra a lo ancho</span>}{approx&&<span className="cutlist-flag">No rectangular: medidas de la caja</span>}
                    {lookPanel(piece,key,row.key,piece.name)}</td>
                  <td className="num qty">{piece.quantity}</td>
                  <td className="num">{finalMm(piece.lengthMm,approx)}</td><td className="num">{finalMm(piece.widthMm,approx)}</td>{row.kind==='unknown'&&<td className="num">{finalMm(piece.thicknessMm,approx)}</td>}
                </tr>;})}</tbody>
            </table>}
            {edge&&<table className="cutlist-table">
              <caption className="sr-only">Tiras de {title}</caption>
              <thead><tr><th scope="col" rowSpan={2} className="no">No.</th><th scope="col" rowSpan={2}>Designación</th><th scope="col" rowSpan={2} className="qty">Cant.</th><th scope="col" className="num finals">Finales</th></tr>
                <tr><th scope="col" className="num"><abbr title="Longitud">L</abbr></th></tr></thead>
              <tbody>{edge.rows.map(({key:rowKey,letter,piece,strip})=>{const key=`${row.key}:${rowKey}`,name=stripDesignation(piece,strip);
                return <tr key={rowKey} className={selected===key?'is-selected':undefined} aria-current={selected===key?'true':undefined} onClick={event=>{if(!onControl(event))activate(piece,key,row.key,name);}} data-piece-id={piece.id} data-side={strip.side}>
                  <td className="no">{letter}</td>
                  <td className="designation"><button type="button" className="cutlist-row-button" title="Ver en SketchUp" aria-describedby={`${uid}-row-hint`} onClick={()=>activate(piece,key,row.key,name)} onKeyDown={event=>stepKey(event,piece,key,row.key,name)}>{name}</button>
                    {options.detail&&<small className="cutlist-detail"> ({designationDetail(piece)})</small>}
                    {lookPanel(piece,key,row.key,name)}</td>
                  <td className="num qty">{piece.quantity}</td>
                  <td className="num">{finalMm(strip.lengthMm,strip.approximate)}</td>
                </tr>;})}</tbody>
            </table>}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
