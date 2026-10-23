import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {request} from './bridge';
import {mm} from '../../lib/model';
import {catalogComplete,completeness,cutFields,parseCut,plural,type CutField} from './workshopRules';
import CatalogV2Tools,{ItemV2Tools} from './CatalogV2Tools';
import {optimizeBoards,type CutSettings} from './sheetOptimizer';
import SheetOptimizationView,{EdgeTotalsView,OutsideView,boardLabel,boardReady,type BoardEdge,type OutsidePiece,type ProjectBoard} from './SheetOptimizationView';
import './workshop.css';

type Price={amount:number;currency:string;unit:string;date:string;source:string};
/** `approved` sigue en el JSON del catálogo por compatibilidad con 0.8.15; ya no filtra ni bloquea nada (0.8.16). */
export type CatalogItem={id:string;name:string;kind:string;sku:string;supplier:string;thicknessMm:number|null;widthMm:number|null;lengthMm:number|null;grain:boolean|null;compatibleIds:string[];price:Price|null;favorite:boolean;approved:boolean;updatedAt:string;sourceHash:string;observed:Record<string,unknown>;variantOf?:string|null;notes?:string;suggested?:{source:string;fields:string[];presetId:string|null}|null};
export type Catalog={schema:1|2;revision:number;items:CatalogItem[]};
type Library={catalog:Catalog;conflicts:string[][]};
/** Fila de una pieza como la propone Ruby desde el modelo pintado (SupplierOrder): solo datos. */
export type OrderRow={id:string;include:boolean;excludeReason:string;detail:string;axes:[number,number]|null;flipX:boolean;flipY:boolean;frontSign:number|null;materialId:string;principalId:string|null;secondaryId:string|null;edgeMap:number[];grainPolicy:string|null;dimensionRule:string|null;cutBase:number|null;cutHeight:number|null;edgeBindings:{observedId:string;catalogId:string}[]};
export type Geometry={lengths:number[];bounds:{min:number[];max:number[]};scales:number[];mirrored:boolean;rectangular:boolean;vertices:number[][];triangles:number[][]};
export type OrderPlan={schema:1;fingerprint:string;catalogRevision:number;profile:{encoding:string;decimal:string;header:boolean};rows:OrderRow[];geometry:Record<string,Geometry>;detailCode?:'none'|'module_piece';codes?:Record<string,string>};
/** 0.8.20 «Maderera»: todas las piezas de los muebles analizados, por placa (Workshop#boards). */
type BoardsResult={plan:OrderPlan;catalog:Catalog;modelName:string;boards:ProjectBoard[];outside:OutsidePiece[]};
type TxtFile={key:string;name:string;sku:string;thicknessMm:number;edges:BoardEdge[];pieces:number;textRows:number;rotated:number};
type TxtResult={cancelled?:boolean;path:string}&TxtFile;
type AllResult={cancelled?:boolean;directory:string;files:(TxtFile&{file:string})[];skipped:{key:string;name:string;thicknessMm:number;reason:string}[]};
const kinds:Record<string,string>={unknown:'Sin resolver',sheet:'Placa',edge:'Canto',solid_wood:'Madera maciza',dimensional:'Listón / perfil',veneer:'Lámina'};
const n=(value:string)=>value.trim()===''?null:Number(value);
const discardCatalog='Hay cambios de la biblioteca sin guardar. ¿Descartarlos?';
/** Disco, refilado y giro elegidos: se recuerdan en esta computadora (solo una comodidad; sin almacenamiento valen los sugeridos). */
const CUT_KEY='planos-santo.maderera.corte.v1';
function storedCut():CutSettings{try{return parseCut(window.localStorage.getItem(CUT_KEY));}catch{return parseCut(null);}}
function storeCut(cut:CutSettings){try{window.localStorage.setItem(CUT_KEY,JSON.stringify(cut));}catch{/* sin almacenamiento local: vale para esta sesión */}}
/** Qué elegir en el portal de la maderera para un TXT: la placa y, si lleva, sus cantos 1 y 2. */
const portalHint=(file:Pick<TxtFile,'name'|'thicknessMm'|'edges'>)=>`En el portal elegí ${file.name} de ${mm(file.thicknessMm)} mm${file.edges.length?`, ${file.edges.map(edge=>`canto ${edge.code} ${edge.sku||edge.name}`).join(' y ')}`:' sin cantos'}.`;

export default function WorkshopPanel({onClose,initialTab='catalog',onDirtyChange,embedded=false,initialCatalogId}:{onClose:()=>void;initialTab?:'catalog'|'order';onDirtyChange?:(dirty:boolean)=>void;embedded?:boolean;initialCatalogId?:string}){
 const boards=initialTab==='order';
 const [busy,setBusy]=useState(false),[activity,setActivity]=useState({label:'',action:''}),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const dialog=useRef<HTMLElement>(null),restoreFocus=useRef<HTMLElement|null>(null);
 const mark=useCallback((value:boolean)=>{setDirty(value);onDirtyChange?.(value);void request('workshop_dirty',{value}).catch(()=>{});},[onDirtyChange]);
 // Each process names itself in the status line and on the button that started it.
 const run=useCallback(async(operation:()=>Promise<void>,label='Procesando…',action='')=>{setBusy(true);setActivity({label,action});setError('');setNotice('');try{await operation();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);setActivity({label:'',action:''});}},[]);
 function close(){if(busy)return;if(dirty&&!window.confirm(discardCatalog))return;mark(false);onClose();}
 const closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{if(embedded)return;function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();closeRef.current();}if(e.key==='Tab'){
  const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')||[])];const first=items[0],last=items[items.length-1];
  if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!dialog.current?.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first)?.focus();}
 }}document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[embedded]);
 // The pressed button is disabled while busy; give focus back to it once it is enabled again.
 useEffect(()=>{if(busy||!restoreFocus.current)return;const target=restoreFocus.current;restoreFocus.current=null;if(target.isConnected&&(document.activeElement===document.body||!document.activeElement))target.focus();},[busy]);
 const keepFocus=()=>{restoreFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;};
 const label=(action:string,text:string)=>activity.action===action?activity.label:text;
 const status=busy?activity.label||'Procesando…':notice;
 const title=boards?'Optimización de placas':'Biblioteca del taller';
 const subtitle=boards?'Todas las piezas de los muebles analizados, por placa: material y espesor real de la pieza':`Fichas reutilizables entre modelos · ${dirty?'Cambios sin guardar':'Sin cambios pendientes'}`;
 return <div className={embedded?"ux-workshop-embedded":"material-review-backdrop"}><section ref={dialog} className="material-review workshop-panel" role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-labelledby="workshop-title">
  <header><div><h2 id="workshop-title">{title}</h2><p>{subtitle}</p></div><button autoFocus={!embedded} disabled={busy} onClick={close}>{embedded?'Volver al inicio':boards?'Cerrar':'Cerrar biblioteca'}</button></header>
  <div className="workshop-body">
   <p role="status" aria-live="polite" className={`workshop-live${busy?' workshop-busy':''}`}>{status}</p>{error&&<div className="workshop-error-row"><p role="alert" className="workshop-error">{error}</p></div>}
   {boards?<BoardsSection busy={busy} run={run} label={label} notify={setNotice} keepFocus={keepFocus} current={busy?activity.action:''}/>:<CatalogSection busy={busy} dirty={dirty} mark={mark} run={run} label={label} notify={setNotice} initialCatalogId={initialCatalogId}/>}
  </div></section></div>;
}

type Run=(operation:()=>Promise<void>,label?:string,action?:string)=>Promise<void>;
type SectionProps={busy:boolean;run:Run;label:(action:string,text:string)=>string;notify:(text:string)=>void};

/** 0.8.20 «Maderera»: optimización de todas las placas del proyecto y un TXT por placa. Nada se edita pieza por pieza. */
function BoardsSection({busy,run,label,notify,keepFocus,current}:SectionProps&{keepFocus:()=>void;current:string}){
 const [data,setData]=useState<BoardsResult>(),[cut,setCut]=useState<CutSettings>(storedCut);
 const [texts,setTexts]=useState<Record<CutField,string>>(()=>({kerfMm:String(cut.kerfMm),trimMm:String(cut.trimMm)}));
 const load=useCallback(async()=>{setData(await request<BoardsResult>('maderera_boards'));},[]);
 useEffect(()=>{void run(load,'Leyendo las piezas de los muebles analizados…','refresh');},[run,load]);
 const choose=(next:CutSettings)=>{setCut(next);storeCut(next);};
 const edit=(field:CutField,value:string)=>{setTexts(current=>({...current,[field]:value}));const number=Number(value),[min,max]=cutFields[field].range;if(value.trim()!==''&&Number.isFinite(number)&&number>=min&&number<=max)choose({...cut,[field]:number});};
 const invalid=(field:CutField)=>{const value=texts[field],number=Number(value),[min,max]=cutFields[field].range;return value.trim()===''||!Number.isFinite(number)||number<min||number>max;};
 const reset=()=>{const next=parseCut(null);choose(next);setTexts({kerfMm:String(next.kerfMm),trimMm:String(next.trimMm)});notify(`Valores sugeridos: disco de ${mm(next.kerfMm)} mm, refilado de ${mm(next.trimMm)} mm por lado y sin girar.`);};
 const optimization=useMemo(()=>data?optimizeBoards(data.plan,data.catalog,data.boards,cut):undefined,[data,cut]);
 const ready=data?.boards.filter(boardReady)||[];
 // Si el modelo cambió entre la lista y la exportación, Ruby frena: la lista se vuelve a leer para mostrar lo vigente.
 const refreshAfter=async(operation:()=>Promise<void>)=>{try{await operation();}catch(e){try{await load();}catch{/* el error original es el que se muestra */}throw e;}};
 const exportBoard=(board:ProjectBoard)=>{keepFocus();void run(()=>refreshAfter(async()=>{
  const result=await request<TxtResult>('maderera_txt',{key:board.key,rotate:cut.allowRotate});
  notify(result.cancelled?'Exportación cancelada.':`TXT de ${boardLabel(board)} guardado en ${result.path}: ${plural(result.pieces,'pieza','piezas')} en ${plural(result.textRows,'línea','líneas')}. ${portalHint(result)}`);
 }),`Exportando el TXT de ${boardLabel(board)}…`,board.key);};
 const exportAll=()=>void run(()=>refreshAfter(async()=>{
  const result=await request<AllResult>('maderera_txt',{all:true,rotate:cut.allowRotate});
  if(result.cancelled){notify('Exportación cancelada.');return;}
  notify(`${plural(result.files.length,'TXT guardado','TXT guardados')} en ${result.directory}: ${result.files.map(file=>file.file).join(', ')}.${result.skipped.length?` Sin exportar por problemas: ${result.skipped.map(item=>`${boardLabel(item)}`).join(', ')}.`:''}`);
 }),'Exportando un TXT por placa…','all');
 const highlight=(id:string)=>{keepFocus();void run(async()=>{await request('piece_highlight',{pieceId:id});notify('Pieza resaltada en SketchUp. Volvé a esta ventana para seguir.');},'Resaltando en SketchUp…','highlight');};
 return <>
  <fieldset className="workshop-cut" aria-describedby="workshop-cut-help"><legend>Corte de la seccionadora</legend>
   {(Object.keys(cutFields) as CutField[]).map(field=><label key={field}>{cutFields[field].label}<input type="number" inputMode="decimal" min={cutFields[field].range[0]} max={cutFields[field].range[1]} step="any" value={texts[field]} aria-invalid={invalid(field)||undefined} aria-describedby={invalid(field)?`workshop-cut-${field}`:undefined} onChange={e=>edit(field,e.target.value)}/>{invalid(field)&&<small id={`workshop-cut-${field}`} className="workshop-field-error">Entre {cutFields[field].range[0]} y {cutFields[field].range[1]} mm. Se sigue usando {mm(cut[field])} mm.</small>}</label>)}
   <label className="workshop-cut-rotate"><input type="checkbox" checked={cut.allowRotate} onChange={e=>choose({...cut,allowRotate:e.target.checked})}/> Girar piezas en placas sin veta (rota 1)</label>
   <button type="button" disabled={busy} onClick={reset}>Valores sugeridos</button>
   <small id="workshop-cut-help" className="workshop-hint">Sugeridos: disco de 4 mm y 10 mm de refilado por lado, como una seccionadora de maderera. Girar solo afecta placas sin veta y piezas con cantos simétricos; con veta nunca se gira. Se recuerdan en esta computadora.</small>
  </fieldset>
  <div className="workshop-order-actions"><div role="group" aria-label="Exportar" className="workshop-primary-actions"><button className="workshop-primary" disabled={busy||!ready.length} aria-busy={current==='all'||undefined} onClick={exportAll}>{label('all','Exportar todos los TXT…')}</button></div>
   <div role="group" aria-label="Otras acciones" className="workshop-secondary-actions"><button disabled={busy} onClick={()=>void run(load,'Leyendo las piezas de los muebles analizados…','refresh')}>{label('refresh','Actualizar desde el modelo')}</button></div></div>
  {data&&optimization?<>
   <p className="workshop-hint">{plural(data.boards.length,'placa','placas')} en {data.modelName}: {plural(data.boards.reduce((sum,board)=>sum+board.rowIds.length,0),'pieza','piezas')}. «Exportar todos» guarda un TXT por placa en una carpeta nueva; cada placa también tiene su botón.</p>
   <SheetOptimizationView result={optimization} boards={data.boards} busy={busy} exporting={current} onExport={exportBoard} onHighlight={highlight}/>
   <EdgeTotalsView plan={data.plan} catalog={data.catalog}/>
   <OutsideView items={data.outside}/>
  </>:<Loading busy={busy} text="Leyendo las piezas de los muebles analizados…" retry={()=>void run(load,'Leyendo las piezas de los muebles analizados…','refresh')}/>}
 </>;
}

/** Biblioteca del taller (la ficha que abre Materiales). Sin pestañas: la maderera ya no vive acá. */
function CatalogSection({busy,dirty,mark,run,label,notify,initialCatalogId}:SectionProps&{dirty:boolean;mark:(dirty:boolean)=>void;initialCatalogId?:string}){
 const [library,setLibrary]=useState<Library>(),[selectedId,setSelectedId]=useState(initialCatalogId||''),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[creating,setCreating]=useState<string|null>(null),[createError,setCreateError]=useState('');
 const newButton=useRef<HTMLButtonElement>(null),adding=useRef(false);
 const load=useCallback(async()=>{setLibrary(await request<Library>('catalog_load'));},[]);
 useEffect(()=>{void run(load,'Cargando biblioteca…');},[run,load]);
 useEffect(()=>{if(initialCatalogId)setSelectedId(initialCatalogId);},[initialCatalogId]);
 const selected=library?.catalog.items.find(item=>item.id===selectedId);
 function updateItem(patch:Partial<CatalogItem>){if(!library||!selected)return;setLibrary({...library,catalog:{...library.catalog,items:library.catalog.items.map(item=>item.id===selected.id?{...item,...patch,updatedAt:new Date().toISOString()}:item)}});mark(true);}
 const rows=library?.catalog.items.filter(item=>(!favorites||item.favorite)&&`${item.name} ${item.sku} ${item.supplier}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))||[];
 const focusIndex=Math.max(0,rows.findIndex(item=>item.id===selectedId));
 const saveLibrary=()=>library&&void run(async()=>{setLibrary(await request<Library>('catalog_save',{revision:library.catalog.revision,items:library.catalog.items}));mark(false);notify('Biblioteca guardada con respaldo de la versión anterior.');},'Guardando biblioteca…','catalog_save');
 function shortcuts(e:ReactKeyboardEvent){if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();if(busy)return;if(dirty)saveLibrary();else notify('No hay cambios para guardar en la biblioteca.');}}
 function listKeys(e:ReactKeyboardEvent<HTMLDivElement>){
  const index={ArrowDown:focusIndex+1,ArrowUp:focusIndex-1,Home:0,End:rows.length-1}[e.key];if(index===undefined||!rows.length)return;e.preventDefault();
  const next=Math.min(rows.length-1,Math.max(0,index));setSelectedId(rows[next].id);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
 }
 function cancelCreate(){setCreating(null);setCreateError('');requestAnimationFrame(()=>newButton.current?.focus());}
 function create(){
  if(!library||creating===null||busy||adding.current)return;const name=creating.trim();
  if(!name){setCreateError('Escribí un nombre para el material.');return;}
  if(library.catalog.items.some(item=>item.name.trim().toLocaleLowerCase('es')===name.toLocaleLowerCase('es'))){setCreateError('Ya existe un material con ese nombre en la biblioteca.');return;}
  adding.current=true;void run(async()=>{const next=await request<Library>('catalog_add',{revision:library.catalog.revision,item:{name,kind:'unknown'}});const added=next.catalog.items.find(item=>!library.catalog.items.some(old=>old.id===item.id));setLibrary(next);if(added)setSelectedId(added.id);setCreating(null);setCreateError('');notify(`Material «${name}» creado. Completá tipo y datos de su ficha.`);},'Creando material…','catalog_add').finally(()=>{adding.current=false;});
 }
 const libraryChanged=(next:Library,id:string|undefined,text:string)=>{setLibrary(next);if(id)setSelectedId(id);notify(text);};
 if(!library)return <Loading busy={busy} text="Cargando la biblioteca del taller…" retry={()=>void run(load,'Cargando biblioteca…')}/>;
 return <div onKeyDown={shortcuts}>
  <p>Una placa sirve para la maderera cuando su ficha tiene SKU, espesor, largo, ancho y veta; un canto, cuando tiene ancho. Un precio vacío significa pendiente; guardar acá no pinta ni cambia materiales del SKP.</p>
  <div className="material-review-actions">{creating===null?<button ref={newButton} disabled={busy||dirty} onClick={()=>{setCreating('');setCreateError('');}}>Nuevo material</button>:
   <div className="workshop-inline-create" role="group" aria-label="Crear material nuevo"><label>Nombre del material nuevo<input autoFocus value={creating} maxLength={120} readOnly={busy} aria-disabled={busy||undefined} aria-invalid={!!createError} aria-describedby={createError?'workshop-create-error':undefined} onChange={e=>{setCreating(e.target.value);setCreateError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();create();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelCreate();}}}/></label><button className="workshop-primary" disabled={busy} onClick={create}>{label('catalog_add','Crear')}</button><button disabled={busy} onClick={cancelCreate}>Cancelar</button>{createError&&<p id="workshop-create-error" className="workshop-field-error">{createError}</p>}</div>}
   <button disabled={busy||dirty} onClick={()=>void run(async()=>{const result=await request<Library&{cancelled?:boolean}>('catalog_import',{revision:library.catalog.revision});if(!result.cancelled){setLibrary(result);notify('Candidatos importados. Completá las fichas a las que les falten datos y revisá los nombres repetidos.');}},'Importando candidatos…','catalog_import')}>{label('catalog_import','Importar JSON…')}</button>
   <button disabled={busy||dirty} onClick={()=>void run(async()=>{setLibrary(await request<Library>('catalog_import_model',{revision:library.catalog.revision}));notify('Materiales del modelo incorporados con las medidas que se pudieron leer.');},'Trayendo materiales del modelo…','catalog_import_model')}>{label('catalog_import_model','Traer materiales del modelo')}</button>
   <button disabled={busy||dirty} onClick={()=>void run(async()=>{const result=await request<{cancelled?:boolean}>('catalog_export');notify(result.cancelled?'Exportación cancelada.':'Copia de biblioteca exportada.');},'Exportando copia…','catalog_export')}>{label('catalog_export','Exportar copia…')}</button>
   <button className="workshop-primary" disabled={busy||!dirty} aria-keyshortcuts="Control+S Meta+S" onClick={saveLibrary}>{label('catalog_save','Guardar biblioteca')}<kbd aria-hidden="true">Ctrl+S</kbd></button></div>
  <CatalogV2Tools catalog={library.catalog} busy={busy} disabled={dirty} run={run} onChanged={libraryChanged}/>
  {dirty&&<p className="workshop-hint">Guardá la biblioteca (Ctrl+S) para crear, importar o exportar materiales.</p>}
  {!!library.conflicts.length&&<p className="warning">{library.conflicts.length} nombres repetidos con datos distintos. Se mantienen separados; conciliá manualmente sus SKU/proveedores.</p>}
  <div className="material-review-filters"><label>Buscar en biblioteca<input aria-label="Buscar en biblioteca" value={query} onChange={e=>setQuery(e.target.value)}/></label><label><input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.target.checked)}/> Solo favoritos</label></div>
  <div className="workshop-columns"><div className="workshop-list" role="group" aria-label="Materiales de biblioteca" aria-describedby="workshop-list-help" onKeyDown={listKeys}><p id="workshop-list-help" className="workshop-sr-only">Usá las flechas arriba y abajo para recorrer los materiales.</p>{rows.map((item,i)=><button key={item.id} tabIndex={i===focusIndex?0:-1} aria-pressed={selectedId===item.id} onClick={()=>setSelectedId(item.id)}>{item.favorite?'★ ':''}{item.name}{!catalogComplete(item)&&<span className="workshop-badge">Incompleta</span>}<small>{kinds[item.kind]} · {item.sku||'Sin SKU'}</small></button>)}{!rows.length&&<p>Biblioteca vacía o sin coincidencias. Importá candidatos o creá un material.</p>}</div>
   {selected&&<div className="workshop-form"><h3>Ficha de material</h3>
    <p className={catalogComplete(selected)?'workshop-hint workshop-complete':'warning workshop-incomplete'} id="workshop-item-complete" aria-live="polite">{catalogComplete(selected)?'Ficha completa: se puede usar para la maderera.':`${completeness(selected)}. Mientras falte, la placa no se puede exportar para la maderera.`}</p>
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
 </div>;
}
function Loading({busy,text,retry}:{busy:boolean;text:string;retry:()=>void}){
 return busy?<div className="workshop-loading" aria-hidden="true"><span/><span/><span/><p>{text}</p></div>:<div className="workshop-loading is-error"><p>No se pudo cargar esta sección. Revisá el mensaje de arriba y volvé a intentar.</p><button onClick={retry}>Reintentar</button></div>;
}
