import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {request} from './bridge';
import type {Catalog,CatalogItem} from './WorkshopPanel';
import './material-library.css';
import PhotoMaterialPanel,{TextureAdjustPanel,type PhotoMaterialResult,type PhotoMaterialTarget,type TextureApplyResult} from './PhotoMaterialPanel';
import {copyName,filterCounts,filterItems,searchText,type LibraryFilter} from './materialLibraryModel';

type Suggestions={kind?:string;thicknessMm?:number|null;verified?:boolean};
export type SkmLibraryRow={catalogId:string;sha256?:string;assetHash?:string;name?:string;sourceName:string;thumbnail?:string|null;suggestions?:Suggestions;warnings?:string[]};
type NativeMaterial={id:string;name:string;color?:number[]|null;hasTexture?:boolean;binding?:{catalogId:string;kind:string;uuid:string}|null;issues?:string[]};
export type VisualLibrary={catalog:Catalog;rows:SkmLibraryRow[];materials?:NativeMaterial[];visuals?:{catalogId:string;available:boolean;designReady:boolean}[];assetRevision?:number};
export type SkmPreviewRow={id:string;sha256:string;hash?:string;name:string;sourceName:string;bytes:number;thumbnail?:string|null;suggestions?:Suggestions;warnings:string[];status:'new'|'duplicate'|'conflict'};
export type SkmPreview={token:string;revision:number;rows:SkmPreviewRow[]};
type PreviewResult=SkmPreview|{cancelled:true};
type ImportResult={catalog:Catalog;imported:number;skipped?:number;duplicates?:number;rows?:SkmLibraryRow[]};
type Props={refreshKey?:number;onApplied?:(scan:unknown,warning?:string)=>void;onEdit:(catalogId?:string)=>void;onPaint?:(catalogId?:string,autoStart?:boolean)=>void;onManageModel?:()=>void;onClose?:()=>void;onChanged?:()=>void;onDirtyChange?:(dirty:boolean)=>void};
type Filter=LibraryFilter;
type ArchiveRow={catalogId:string;name:string;inModel:number;compatibleWith:number;warnings:string[]};
type ArchivePlan={catalogId:string;archived:boolean;rows:ArchiveRow[]};
type OclChange={key:string;from?:unknown;to?:unknown;action:'write'|'update'|'remove'};
type OclMaterial={materialId:string;name:string;catalogId:string;status:'written'|'updated'|'unchanged'|'conflict'|'kept';changes:OclChange[];kept:{key:string;current?:unknown;proposed?:unknown}[]};
type OclPlan={catalogId?:string;dryRun:boolean;changed:number;planDigest?:string;materials:OclMaterial[]};
export type PackageRow={id:string;name:string;kind:string;status:'new'|'duplicate'|'conflict';thumbnail:string|null;files:number;warnings:string[]};
export type PackagePreview={token:string;revision:number;package:{items:number;files:number;bytes:number;createdAt?:string};rows:PackageRow[]};
type PhotoMeta={widthPx?:number;heightPx?:number;textureScale?:{verified?:boolean;widthMm?:number|null;heightMm?:number|null}};
const oclValue=(value:unknown)=>value===undefined||value===null?'vacío':typeof value==='string'?value:JSON.stringify(value);
const filterLabels:[Filter,string][]=[['all','Todos'],['sheet','Placas'],['edge','Cantos'],['other','Otros'],['review','Por revisar'],['archived','Archivados']];
const emptyCopy:Record<Filter,[string,string]>={all:['No hay materiales con estos filtros','Probá otro nombre o quitá los filtros.'],sheet:['No hay placas con estos filtros','Probá otra búsqueda o creá una placa desde una foto.'],edge:['No hay cantos con estos filtros','Probá otra búsqueda o importá los cantos del proveedor.'],other:['No hay otros materiales','Maciza, perfiles y láminas aparecen acá cuando los clasificás.'],review:['No hay fichas por revisar','Todas las fichas visibles están validadas para maderera.'],archived:['No hay fichas archivadas','Archivar oculta una ficha sin borrarla ni borrar sus archivos. Podés restaurarla cuando quieras.']};
export function readyForDesign(item:CatalogItem){const observed=item.observed as Record<string,unknown>|undefined;const photo=observed?.photo as Record<string,unknown>|undefined;return ['sheet','edge'].includes(item.kind)&&photo?.schema===1&&photo?.designReady===true;}
const kindNames:Record<string,string>={unknown:'Tipo pendiente',sheet:'Placa',edge:'Canto',solid_wood:'Madera maciza',dimensional:'Perfil',veneer:'Lámina'};
const dimension=(value:number|null)=>value===null?'Espesor pendiente':`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(value)} mm`;
function Thumbnail({uri,name}:{uri?:string|null;name:string}){
 const safe=uri&&uri.length<=4*1024*1024&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(uri);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[uri]);
 return safe&&!failed?<img className="material-card-image" src={uri} alt={`Miniatura real de ${name}`} onError={()=>setFailed(true)} loading="lazy"/>:<div className="material-card-placeholder"><span aria-hidden="true">▧</span><span>Sin miniatura disponible</span></div>;
}
function nativeColor(color?:number[]|null){return color?.length===3&&color.every(value=>Number.isFinite(value)&&value>=0&&value<=255)?`rgb(${color.join(',')})`:undefined;}
export default function MaterialLibraryPanel({onEdit,onPaint,onManageModel,onClose,onChanged,onDirtyChange,onApplied,refreshKey}:Props){
 const [library,setLibrary]=useState<VisualLibrary>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [scope,setScope]=useState<'workshop'|'model'>('workshop'),[filter,setFilter]=useState<Filter>('all'),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[selectedId,setSelectedId]=useState('');
 const [newName,setNewName]=useState(''),[creating,setCreating]=useState(false),[importSources,setImportSources]=useState(false),[installConfirm,setInstallConfirm]=useState(false),[preview,setPreview]=useState<SkmPreview>(),[selectedRows,setSelectedRows]=useState<string[]>([]),[renames,setRenames]=useState<Record<string,string>>({});
 const [photoOpen,setPhotoOpen]=useState(false),[photoTarget,setPhotoTarget]=useState<PhotoMaterialTarget>();
 const [archivedIds,setArchivedIds]=useState<string[]>([]),[statesRevision,setStatesRevision]=useState<number>(),[duplicateName,setDuplicateName]=useState<string>(),[archivePlan,setArchivePlan]=useState<ArchivePlan>(),[oclPlan,setOclPlan]=useState<OclPlan>(),[textureOpen,setTextureOpen]=useState(false);
 const [packagePreview,setPackagePreview]=useState<PackagePreview>(),[packageRows,setPackageRows]=useState<string[]>([]),[packageRenames,setPackageRenames]=useState<Record<string,string>>({}),[gridFocus,setGridFocus]=useState('');
 const paintAfterClose=useRef<string|undefined>(undefined),onPaintRef=useRef(onPaint);onPaintRef.current=onPaint;
 const lastRefresh=useRef(refreshKey),pendingFocus=useRef<'import'|'search'|'package'|null>(null);
 const importTrigger=useRef<HTMLButtonElement>(null),packageTrigger=useRef<HTMLButtonElement>(null),packagePanel=useRef<HTMLElement>(null),grid=useRef<HTMLDivElement>(null),duplicateInput=useRef<HTMLInputElement>(null),newInput=useRef<HTMLInputElement>(null),previewPanel=useRef<HTMLElement>(null),searchInput=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{
  const next=await request<VisualLibrary>('skm_library');let archived:string[]=[],states:number|undefined;
  // Extras live outside the catalog schema; an older backend simply has none.
  try{const extras=await request<{archivedIds?:unknown;statesRevision?:unknown}>('material_extras');if(Array.isArray(extras?.archivedIds))archived=extras.archivedIds.filter((id):id is string=>typeof id==='string');if(Number.isInteger(extras?.statesRevision))states=extras.statesRevision as number;}catch{archived=[];}
  setLibrary(next);setArchivedIds(archived);setStatesRevision(states);
 },[]);
 const archived=useMemo(()=>new Set(archivedIds),[archivedIds]);
 const modal=!!preview||!!packagePreview||textureOpen;
 const run=useCallback(async(label:string,operation:()=>Promise<void>,preserveNotice=false)=>{setBusy(label);setError('');if(!preserveNotice)setNotice('');try{await operation();}catch(value){setError(value instanceof Error?value.message:String(value));}finally{setBusy('');}},[]);
 useEffect(()=>{void run('Cargando biblioteca del taller…',load);},[run,load]);
 const editing=duplicateName!==undefined||!!archivePlan||!!oclPlan;
 useEffect(()=>{onDirtyChange?.(modal||!!busy||creating||photoOpen||editing);return()=>{onDirtyChange?.(false);};},[modal,busy,creating,photoOpen,editing,onDirtyChange]);
 useEffect(()=>{if(creating)newInput.current?.focus();},[creating]);
 const selectedIdRef=useRef(selectedId);selectedIdRef.current=selectedId;
 const planPanel=useRef<HTMLDivElement>(null),selectionHeading=useRef<HTMLHeadingElement>(null),hadPlan=useRef(false);
 useEffect(()=>{setInstallConfirm(false);setDuplicateName(undefined);setArchivePlan(undefined);setOclPlan(undefined);},[selectedId]);
 // A confirmation replaces its trigger: move focus into it, and back to the selection when it closes.
 useEffect(()=>{const open=!!archivePlan||!!oclPlan;if(open)planPanel.current?.focus();else if(hadPlan.current)selectionHeading.current?.focus();hadPlan.current=open;},[archivePlan,oclPlan]);
 const duplicateOpen=duplicateName!==undefined;
 useEffect(()=>{if(duplicateOpen)duplicateInput.current?.focus();},[duplicateOpen]);
 useEffect(()=>{if(lastRefresh.current===refreshKey||modal||busy||creating||photoOpen)return;lastRefresh.current=refreshKey;void run('Actualizando fichas revisadas…',load,true);},[refreshKey,modal,busy,creating,photoOpen,run,load]);
 useEffect(()=>{if(preview)previewPanel.current?.focus();},[preview]);
 useEffect(()=>{if(packagePreview)packagePanel.current?.focus();},[packagePreview]);
 useEffect(()=>{if(busy||modal||photoOpen||!pendingFocus.current)return;const target=pendingFocus.current==='import'?importTrigger.current:pendingFocus.current==='package'?packageTrigger.current:searchInput.current;pendingFocus.current=null;target?.focus();},[busy,modal,photoOpen]);
 useEffect(()=>{if(photoOpen||busy||modal||creating||!paintAfterClose.current)return;let secondFrame=0;const frame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{const id=paintAfterClose.current;paintAfterClose.current=undefined;if(id)onPaintRef.current?.(id,true);});});return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(secondFrame);};},[photoOpen,busy,modal,creating]);
 async function photoCreated(result:PhotoMaterialResult,{paint}:{paint:boolean}){if(result.scan)onApplied?.(result.scan,result.refreshWarning);else if(result.refreshWarning)onApplied?.(undefined,result.refreshWarning);try{await load();}catch(value){setError(`El material se guardó, pero no se pudo actualizar la biblioteca: ${value instanceof Error?value.message:String(value)}`);}setSelectedId(result.catalogId);setPhotoOpen(false);setPhotoTarget(undefined);onChanged?.();setNotice('Material guardado para diseño. Los datos de maderera conservan su estado de revisión.');if(paint)paintAfterClose.current=result.catalogId;else pendingFocus.current='search';}
 function openPhoto(target?:PhotoMaterialTarget){setPhotoTarget(target);setPhotoOpen(true);setImportSources(false);}
 async function cancelPreview(){await request('skm_cancel');pendingFocus.current='import';setPreview(undefined);setSelectedRows([]);setRenames({});setNotice('Importación cancelada. No se cambiaron los materiales del modelo.');}
 useEffect(()=>{
  if(!preview&&!packagePreview)return;
  const dialog=preview?previewPanel:packagePanel;
  function key(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)void run('Cerrando vista previa…',preview?cancelPreview:cancelPackage);return;}
   if(event.key==='Tab'){
    const focusable=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')||[])];const first=focusable[0],last=focusable[focusable.length-1];
    if(!first){event.preventDefault();dialog.current?.focus();return;}
    if(first&&((event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current))||(!event.shiftKey&&document.activeElement===last)||!dialog.current?.contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first)?.focus();}
   }
  }
  document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
 },[preview,packagePreview,busy,run]);
 const nativeMaterials=useMemo(()=>library?.materials||[],[library?.materials]);
 const modelCatalogIds=useMemo(()=>new Set(nativeMaterials.flatMap(material=>material.binding?.catalogId?[material.binding.catalogId]:[])),[nativeMaterials]);
 const scoped=useMemo(()=>library?.catalog.items.filter(item=>scope!=='model'||modelCatalogIds.has(item.id))||[],[library,scope,modelCatalogIds]);
 const filtered=useMemo(()=>filterItems(scoped,{filter,query,archived,favorites}),[scoped,filter,query,archived,favorites]);
 const counts=useMemo(()=>filterCounts(scoped,archived),[scoped,archived]);
 const nativeOnly=scope==='model'&&['all','other','review'].includes(filter)&&!favorites?nativeMaterials.filter(material=>!material.binding?.catalogId&&searchText(material.name).includes(searchText(query.trim()))):[];
 const selected=library?.catalog.items.find(item=>item.id===selectedId);
 const selectedNative=selected&&nativeMaterials.filter(material=>material.binding?.catalogId===selected.id);
 const selectedAsset=selected&&library?.rows.find(row=>row.catalogId===selected.id&&(row.sha256||row.assetHash));
 const selectedPhoto=selected&&library?.visuals?.find(row=>row.catalogId===selected.id);
 const selectedDesignReady=!!selected&&['sheet','edge'].includes(selected.kind)&&selectedPhoto?.available===true&&selectedPhoto.designReady===true;
 const selectedPhotoMissing=!!selected&&readyForDesign(selected)&&!selectedDesignReady;
 const canInstall=selectedDesignReady||!!(selected?.approved&&selectedAsset&&!selectedPhotoMissing);
 const installed=selectedNative?.some(material=>!material.issues?.length); 
 const selectedArchived=!!selected&&archived.has(selected.id);
 const photoMeta=selected?.observed?.photo as PhotoMeta|undefined;
 const activeCard=filtered.some(item=>item.id===gridFocus)?gridFocus:filtered.some(item=>item.id===selectedId)?selectedId:filtered[0]?.id;
 function gridKey(event:React.KeyboardEvent<HTMLDivElement>){
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...(grid.current?.querySelectorAll<HTMLButtonElement>('.material-card-select')||[])],index=buttons.findIndex(button=>button===document.activeElement);
  if(index<0)return;
  const columns=Math.max(1,buttons.filter(button=>button.offsetTop===buttons[0].offsetTop).length);
  const step:Record<string,number>={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns};
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.min(buttons.length-1,Math.max(0,index+step[event.key]));
  event.preventDefault();const id=buttons[next]?.dataset.catalogId;if(id)setGridFocus(id);buttons[next]?.focus();
 }
 const selectedPreview=preview?.rows.filter(row=>selectedRows.includes(row.id))||[];
 const unresolved=selectedPreview.filter(row=>row.status==='conflict'&&(!renames[row.id]?.trim()||searchText(renames[row.id].trim())===searchText(row.name)));
 const renamedNames=selectedPreview.map(row=>searchText((renames[row.id]||row.name).trim()));
 const repeatedNames=renamedNames.some((name,index)=>renamedNames.indexOf(name)!==index);
 const packageSelected=packagePreview?.rows.filter(row=>packageRows.includes(row.id))||[];
 const packageUnresolved=packageSelected.filter(row=>row.status==='conflict'&&(!packageRenames[row.id]?.trim()||searchText(packageRenames[row.id].trim())===searchText(row.name)));
 const packageNames=packageSelected.map(row=>searchText((packageRenames[row.id]||row.name).trim()));
 const packageRepeated=packageNames.some((name,index)=>packageNames.indexOf(name)!==index);
 async function exportPackage(){
  const result=await request<{cancelled:true}|{fileName:string;items:number;files:number;bytes:number}>('material_package_export',{includeArchived:false});
  if('cancelled' in result){setNotice('Exportación cancelada. No se creó ningún archivo.');return;}
  setNotice(`Paquete «${result.fileName}» exportado: ${result.items} ${result.items===1?'ficha':'fichas'} y ${result.files} ${result.files===1?'archivo verificado':'archivos verificados'}. Las fichas archivadas no se incluyen.`);
 }
 async function openPackage(){
  const result=await request<PackagePreview|{cancelled:true}>('material_package_preview');
  if('cancelled' in result){setNotice('Selección cancelada. La biblioteca no cambió.');return;}
  setPackagePreview(result);setPackageRows(result.rows.filter(row=>row.status==='new').map(row=>row.id));setPackageRenames({});
 }
 async function cancelPackage(){await request('material_package_cancel');pendingFocus.current='package';setPackagePreview(undefined);setPackageRows([]);setPackageRenames({});setNotice('Importación de paquete cancelada. La biblioteca no cambió.');}
 async function commitPackage(){
  if(!packagePreview)return;
  const result=await request<{imported:number;skipped:number}>('material_package_commit',{token:packagePreview.token,revision:packagePreview.revision,selectedIds:packageRows,renames:Object.fromEntries(Object.entries(packageRenames).filter(([id,name])=>packageRows.includes(id)&&name.trim()).map(([id,name])=>[id,name.trim()])),confirmed:true});
  pendingFocus.current='package';setPackagePreview(undefined);setPackageRows([]);setPackageRenames({});await load();onChanged?.();
  setNotice(`${result.imported} ${result.imported===1?'ficha importada':'fichas importadas'} del paquete, sin aprobar para maderera. ${result.skipped} omitidas. Revisalas antes de producir.`);
 }
 async function duplicate(){
  if(!library||!selected||duplicateName===undefined||!duplicateName.trim())return;
  const result=await request<{catalogId:string;name:string;warnings?:string[]}>('material_duplicate',{catalogId:selected.id,revision:library.catalog.revision,name:duplicateName.trim(),confirmed:true});
  setDuplicateName(undefined);await load();onChanged?.();setSelectedId(result.catalogId);setGridFocus(result.catalogId);
  setNotice([`Copia creada: «${result.name}». Conserva la textura y los datos comerciales, y queda pendiente de aprobación para maderera.`,...(result.warnings||[])].join(' '));
 }
 async function planArchive(value:boolean){
  if(!library||!selected)return;
  const id=selected.id;
  const result=await request<{rows?:ArchiveRow[]}>('material_archive',{catalogIds:[id],archived:value,revision:library.catalog.revision,statesRevision,dryRun:true,confirmed:true});
  if(selectedIdRef.current!==id)return;
  setArchivePlan({catalogId:id,archived:value,rows:result.rows||[]});
 }
 async function confirmArchive(){
  if(!library||!selected||!archivePlan)return;
  const value=archivePlan.archived;
  const result=await request<{archivedIds?:string[]}>('material_archive',{catalogIds:[archivePlan.catalogId],archived:value,revision:library.catalog.revision,statesRevision,confirmed:true});
  setArchivePlan(undefined);if(Array.isArray(result.archivedIds))setArchivedIds(result.archivedIds);await load();onChanged?.();
  if(!value&&filter==='archived')setFilter('all');
  setNotice(value?`«${selected.name}» archivada. No se borró la ficha ni sus archivos; la encontrás en Archivados.`:`«${selected.name}» restaurada en la biblioteca activa.`);
 }
 async function planOcl(){
  if(!selected)return;
  const id=selected.id;
  const result={...await request<OclPlan>('material_ocl_sync',{catalogId:id,dryRun:true}),catalogId:id};
  if(selectedIdRef.current!==id)return;
  if(!result.changed){setOclPlan(undefined);setNotice(`OpenCutList ya está sincronizado para «${selected.name}».${result.materials.some(row=>row.kept.length)?' Se conservan valores que cargó el usuario.':''}`);if(result.materials.some(row=>row.kept.length))setOclPlan(result);return;}
  setOclPlan(result);
 }
 async function applyOcl(){
  if(!selected||!oclPlan?.planDigest||!oclPlan.catalogId)throw new Error('Volvé a revisar los cambios para OpenCutList antes de aplicarlos.');
  let result:OclPlan;
  try{result=await request<OclPlan>('material_ocl_sync',{catalogId:oclPlan.catalogId,dryRun:false,confirmed:true,planDigest:oclPlan.planDigest});}
  catch(value){setOclPlan(undefined);throw value;}
  setOclPlan(undefined);await load();onChanged?.();
  const kept=result.materials.reduce((sum,row)=>sum+row.kept.length,0);
  setNotice(`OpenCutList sincronizado: ${result.changed} ${result.changed===1?'cambio':'cambios'} en una sola operación (Ctrl+Z la deshace).${kept?` Se conservaron ${kept} ${kept===1?'valor cargado':'valores cargados'} por el usuario.`:''}`);
 }
 async function textureApplied(result:TextureApplyResult){
  setTextureOpen(false);pendingFocus.current='search';if(result.scan)onApplied?.(result.scan);
  if(result.noChanges){setNotice('La textura ya tenía esa escala y ese giro. No se cambió nada.');return;}
  await load();onChanged?.();
  setNotice(`Textura ajustada y verificada en ${result.verification?.checked??result.applied?.length??0} ${(result.verification?.checked??result.applied?.length??0)===1?'material':'materiales'} del modelo. ${result.warnings?.join(' ')||''}`.trim());
 }
 async function openPreview(source:'zip'|'folder'){
  setImportSources(false);
  const result=await request<PreviewResult>('skm_preview',{source});
  if('cancelled' in result){setNotice('Selección cancelada. La biblioteca no cambió.');return;}
  setPreview(result);setSelectedRows(result.rows.filter(row=>row.status==='new').map(row=>row.id));setRenames({});
 }
 async function favorite(item:CatalogItem){
  if(!library)return;
  await request('catalog_save',{revision:library.catalog.revision,items:library.catalog.items.map(row=>row.id===item.id?{...row,favorite:!row.favorite}:row)});
  await load();onChanged?.();
 }
 async function addMaterial(){
  if(!library||!newName.trim())return;
  const result=await request<{catalog:Catalog}>('catalog_add',{revision:library.catalog.revision,item:{name:newName.trim(),kind:'unknown'}});
  setCreating(false);setNewName('');await load();onChanged?.();
  const item=result.catalog.items[result.catalog.items.length-1];if(item)setSelectedId(item.id);
  setNotice('Material creado como pendiente. Completá y revisá su ficha antes de aprobarlo.');
 }
 async function install(){
  if(!library||!selected||!canInstall)return;
  const result=await request<{scan?:unknown;refreshWarning?:string}>(readyForDesign(selected)&&selectedDesignReady?'material_photo_install':'skm_install',{catalogId:selected.id,revision:library.catalog.revision,assetRevision:library.assetRevision,confirmed:true,replaceVisual:false});
  setInstallConfirm(false);
  if(result.scan)onApplied?.(result.scan,result.refreshWarning);else if(result.refreshWarning)onApplied?.(undefined,result.refreshWarning);
  await load();onChanged?.();setNotice('SKM cargado en el modelo. No se pintó ninguna cara; revisá el material en la paleta antes de aplicarlo.');
 }
 async function commit(){
  if(!preview)return;
  const result=await request<ImportResult>('skm_commit',{token:preview.token,revision:preview.revision,selectedIds:selectedRows,renames,confirmed:true});
  pendingFocus.current='search';setPreview(undefined);setSelectedRows([]);setRenames({});await load();onChanged?.();
  setNotice(`${result.imported} materiales importados como pendientes. ${result.skipped??result.duplicates??0} duplicados u omitidos. Revisá las fichas antes de usarlos en producción.`);
 }
 return <section className="visual-material-library" aria-labelledby="materials-library-title" aria-busy={!!busy}>
  <header className="material-library-heading"><div><span className="material-eyebrow">BIBLIOTECA PERMANENTE</span><h1 id="materials-library-title">Materiales del taller</h1><p>Placas y cantos disponibles en todos tus proyectos.</p></div><div className="material-library-main-actions"><button className="primary" disabled={!!busy||!!preview||creating} onClick={()=>openPhoto()}>+ Material</button><button disabled={!!busy||!!preview} onClick={()=>setCreating(value=>!value)} aria-expanded={creating}>Nuevo material</button><button ref={packageTrigger} disabled={!!busy||creating||modal} onClick={()=>void run('Analizando paquete de materiales…',openPackage)}>Importar paquete .zip</button><button disabled={!!busy||creating||modal||!library?.catalog.items.length} onClick={()=>void run('Exportando paquete de materiales…',exportPackage)}>Exportar paquete .zip</button><div className="material-import-selector"><button ref={importTrigger} disabled={!!busy||creating||!!preview} aria-expanded={importSources} onClick={()=>setImportSources(value=>!value)}>Importar biblioteca</button>{importSources&&<div className="material-import-choices"><button onClick={()=>void run('Analizando ZIP de materiales…',()=>openPreview('zip'))}>Desde ZIP o archivo SKM</button><button onClick={()=>void run('Analizando carpeta de materiales…',()=>openPreview('folder'))}>Desde carpeta</button><button onClick={()=>{setImportSources(false);importTrigger.current?.focus();}}>Cancelar</button></div>}</div>{onClose&&<button className="material-library-close" onClick={onClose} disabled={!!busy||!!preview||creating}>Volver a Inicio</button>}</div></header>
  {busy&&!library&&<div className="material-library-skeleton" aria-hidden="true">{[0,1,2,3].map(index=><span key={index}/>)}</div>}{busy&&!preview&&!packagePreview&&<p className="material-library-status" role="status"><span className="material-progress" aria-hidden="true"/>{busy}</p>}{error&&!preview&&!packagePreview&&<div className="material-library-error" role="alert"><strong>No se pudo completar la acción.</strong><p>{error}</p><button disabled={!!busy||!!preview} onClick={()=>void run('Recargando biblioteca…',load)}>Volver a cargar</button></div>}{notice&&<p className="material-library-notice" role="status">{notice}</p>}
  {creating&&<form className="material-new-form" onSubmit={event=>{event.preventDefault();void run('Creando material pendiente…',addMaterial);}}><label>Nombre del material<input ref={newInput} value={newName} onChange={event=>setNewName(event.target.value)} maxLength={160} required disabled={!!busy}/></label><p>No se asignan tipo, medidas ni aprobación automáticamente.</p><button className="primary" disabled={!!busy||!newName.trim()} type="submit">Crear pendiente</button><button disabled={!!busy} type="button" onClick={()=>{setCreating(false);setNewName('');}}>Cancelar</button></form>}
  <div className="material-library-toolbar"><div className="material-library-scopes" role="group" aria-label="Origen de materiales"><button aria-pressed={scope==='workshop'} onClick={()=>setScope('workshop')}>Todo el taller</button><button aria-pressed={scope==='model'} onClick={()=>setScope('model')}>En este modelo</button></div><div className="material-library-search-field"><label className="material-library-search">Buscar material<input ref={searchInput} type="search" aria-label="Buscar materiales del taller" aria-describedby="material-search-help" placeholder="Nombre, SKU, proveedor o espesor" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&query){event.preventDefault();event.stopPropagation();setQuery('');}}}/></label>{query&&<button type="button" className="material-search-clear" aria-label="Limpiar búsqueda" onClick={()=>{setQuery('');searchInput.current?.focus();}}>×</button>}<span id="material-search-help" className="sr-only">Escape limpia la búsqueda. Usá las flechas para recorrer las tarjetas.</span></div><label className="material-favorites-filter"><input type="checkbox" checked={favorites} onChange={event=>setFavorites(event.target.checked)}/> Solo favoritos</label></div>
  <nav className="material-library-filters" aria-label="Filtrar biblioteca">{filterLabels.map(([value,label])=><button key={value} aria-label={label} aria-pressed={filter===value} title={`${label}: ${counts[value]}`} onClick={()=>setFilter(value)}>{label}{library&&<span aria-hidden="true">{counts[value]}</span>}</button>)}<span className="material-library-count" role="status">{filtered.length+nativeOnly.length} materiales</span></nav>
  {filter==='archived'&&<p className="material-library-context">Fichas archivadas: no aparecen en la biblioteca activa ni en los paquetes exportados. Sus archivos y vínculos se conservan.</p>}{scope==='model'&&<p className="material-library-context">Materiales ya cargados en el modelo abierto. Importar a la biblioteca del taller no los carga ni los pinta aquí.</p>}
  <div className="material-library-layout"><div ref={grid} className="material-library-grid" role="group" aria-label="Materiales visuales del taller" onKeyDown={gridKey}>{filtered.map(item=>{
   const photo=library?.visuals?.find(row=>row.catalogId===item.id),designReady=['sheet','edge'].includes(item.kind)&&photo?.available===true&&photo.designReady===true,photoMissing=readyForDesign(item)&&!designReady;
   const visual=library?.rows.find(row=>row.catalogId===item.id),inModel=modelCatalogIds.has(item.id),issues=nativeMaterials.filter(material=>material.binding?.catalogId===item.id).flatMap(material=>material.issues||[]);
   return <article className={`material-library-card ${selectedId===item.id?'selected':''} ${archived.has(item.id)?'archived':''}`} key={item.id} aria-label={`Material ${item.name}`}><button className="material-card-select" data-catalog-id={item.id} tabIndex={activeCard===item.id?0:-1} onFocus={()=>setGridFocus(item.id)} onClick={()=>{setSelectedId(item.id);setGridFocus(item.id);}} aria-pressed={selectedId===item.id}><Thumbnail uri={visual?.thumbnail} name={item.name}/><span className="material-card-title">{item.name}</span><span className="material-card-meta">{kindNames[item.kind]||item.kind} · {dimension(item.thicknessMm)}</span><span className={`material-status-chip ${photoMissing?'missing':item.approved?'approved':'pending'}`}>{photoMissing?'Revisar archivos':item.approved?'Validado para maderera':designReady?'Listo para diseño':'Pendiente de revisar'}</span>{designReady&&!item.approved&&<span className="material-commercial-pending">Pendiente para maderera</span>}{inModel&&<span className="material-model-chip">En este modelo</span>}{archived.has(item.id)&&<span className="material-archived-chip">Archivada</span>}</button><div className="material-card-bottom"><span>{item.sku||'SKU pendiente'}</span><button className="material-star" disabled={!!busy||!!preview} aria-label={`${item.favorite?'Quitar favorito':'Marcar favorito'} ${item.name}`} aria-pressed={item.favorite} title={item.favorite?'Quitar de favoritos':'Añadir a favoritos'} onClick={()=>void run('Guardando favorito…',()=>favorite(item))}>{item.favorite?'★':'☆'}</button></div>{issues.length>0&&<p className="material-card-warning">Revisá la vinculación de este material en el modelo.</p>}<button className="material-review-button" disabled={!!busy||!!preview||creating} onClick={()=>{setSelectedId(item.id);onEdit(item.id);}}>Revisar ficha</button></article>;
  })}{nativeOnly.map(material=><article className="material-library-card native-only" key={`native-${material.id}`}><div className="material-native-swatch" style={nativeColor(material.color)?{backgroundColor:nativeColor(material.color)}:undefined}>{material.hasTexture?'Color base · textura en el modelo':'Color nativo'}</div><h2>{material.name}</h2><span className="material-status-chip pending">Sin vínculo aprobado</span><p>La apariencia no verifica tipo, medidas ni compatibilidad.</p>{material.issues?.map(issue=><p className="material-card-warning" key={issue}>{issue}</p>)}{onManageModel&&<button disabled={!!busy||!!preview||creating} onClick={onManageModel}>Asociar material del modelo</button>}</article>)}</div>
   {selected&&<aside className="material-selection-panel" aria-label="Material seleccionado"><span className="material-eyebrow">MATERIAL SELECCIONADO</span><h2 ref={selectionHeading} tabIndex={-1}>{selected.name}</h2><p>{kindNames[selected.kind]||selected.kind} · {dimension(selected.thicknessMm)}</p><span className={`material-status-chip ${selectedPhotoMissing?'missing':selected.approved?'approved':'pending'}`}>{selectedPhotoMissing?'Revisar archivos':selected.approved?'Validado para maderera':selectedDesignReady?'Listo para diseño':'Pendiente de revisar'}</span><dl><div><dt>SKU</dt><dd>{selected.sku||'Pendiente de completar'}</dd></div><div><dt>Proveedor</dt><dd>{selected.supplier||'Pendiente de completar'}</dd></div><div><dt>Formato</dt><dd>{selected.widthMm&&selected.lengthMm?`${selected.widthMm} × ${selected.lengthMm} mm`:'Pendiente de completar'}</dd></div><div><dt>Veta</dt><dd>{selected.grain===null?'Pendiente de completar':selected.grain?'Con veta':'Sin veta'}</dd></div><div><dt>En el modelo</dt><dd>{selectedNative?.length?`${selectedNative.length} ${selectedNative.length===1?'material vinculado':'materiales vinculados'}`:'No cargado en este modelo'}</dd></div></dl><button className="primary" disabled={!!busy||!!preview||creating} onClick={()=>onEdit(selected.id)}>Completar / revisar ficha</button>{onPaint&&<button disabled={!!busy||modal||creating||selectedArchived||!(installed||selectedPhoto?.available===true)||!['sheet','edge'].includes(selected.kind)} onClick={()=>onPaint(selected.id,true)}>Pintar en el modelo</button>}{onPaint&&<button disabled={!!busy||!!preview||creating||!(installed||selectedPhoto?.available===true)||!['sheet','edge'].includes(selected.kind)} onClick={()=>onPaint(selected.id)}>Abrir paleta de pintura</button>}{['sheet','edge'].includes(selected.kind)&&<button disabled={!!busy||!!preview||creating} onClick={()=>openPhoto({catalogId:selected.id,name:selected.name,kind:selected.kind as 'sheet'|'edge',thicknessMm:selected.thicknessMm})}>Reemplazar foto / textura</button>}{readyForDesign(selected)&&<button disabled={!!busy||modal||creating||selectedPhotoMissing} onClick={()=>setTextureOpen(true)}>Ajustar escala y giro</button>}
    <div className="material-manage-actions" role="group" aria-label="Gestionar ficha">{duplicateName===undefined?<button disabled={!!busy||modal||creating||editing} onClick={()=>setDuplicateName(copyName(selected.name,library?.catalog.items.map(item=>item.name)||[]))}>Duplicar ficha</button>:<form className="material-inline-form" aria-label="Duplicar ficha" onSubmit={event=>{event.preventDefault();void run('Duplicando ficha…',duplicate);}}><label>Nombre de la copia<input ref={duplicateInput} value={duplicateName} maxLength={160} required disabled={!!busy} aria-invalid={!duplicateName.trim()} aria-describedby="material-duplicate-help" onChange={event=>setDuplicateName(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDuplicateName(undefined);}}}/></label><p id="material-duplicate-help">La copia conserva la textura y los datos comerciales, sin aprobación para maderera.</p><button className="primary" type="submit" disabled={!!busy||!duplicateName.trim()}>Crear copia</button><button type="button" disabled={!!busy} onClick={()=>setDuplicateName(undefined)}>Cancelar copia</button></form>}
     {!archivePlan&&<button disabled={!!busy||modal||creating||editing} onClick={()=>void run(selectedArchived?'Revisando restauración…':'Revisando qué implica archivar…',()=>planArchive(!selectedArchived))}>{selectedArchived?'Restaurar ficha':'Archivar ficha'}</button>}
     {archivePlan&&<div ref={planPanel} tabIndex={-1} className="material-confirm" role="group" aria-label={archivePlan.archived?'Confirmar archivado':'Confirmar restauración'}><p>{archivePlan.archived?'La ficha se oculta de la biblioteca activa y de los paquetes. No se borra, ni se borran sus archivos ni sus cantos compatibles.':'La ficha vuelve a la biblioteca activa con sus datos y archivos.'}</p>{archivePlan.rows.map(row=><ul key={row.catalogId}>{row.inModel>0&&<li>En este modelo: {row.inModel} {row.inModel===1?'material vinculado':'materiales vinculados'} (se siguen viendo y pintando como hasta ahora).</li>}{row.compatibleWith>0&&<li>Compatible con {row.compatibleWith} {row.compatibleWith===1?'ficha':'fichas'} activas.</li>}{row.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>)}<button className="primary" disabled={!!busy} onClick={()=>void run(archivePlan.archived?'Archivando ficha…':'Restaurando ficha…',confirmArchive)}>{archivePlan.archived?'Sí, archivar':'Sí, restaurar'}</button><button disabled={!!busy} onClick={()=>setArchivePlan(undefined)}>Cancelar</button></div>}
     {!oclPlan&&<button disabled={!!busy||modal||creating||editing||!selectedNative?.length||!['sheet','edge'].includes(selected.kind)} title={selectedNative?.length?undefined:'Cargá el material en este modelo para sincronizarlo'} onClick={()=>void run('Comparando con OpenCutList…',planOcl)}>Sincronizar con OpenCutList</button>}
     {oclPlan&&<div ref={planPanel} tabIndex={-1} className="material-confirm material-ocl-plan" role="group" aria-label="Cambios para OpenCutList">{oclPlan.materials.map(row=><div key={row.materialId}><strong>{row.name}</strong>{row.status==='conflict'&&<p role="alert">El material ya tiene otro tipo en OpenCutList. No se cambia nada; revisalo en OpenCutList.</p>}{row.changes.length>0&&<ul aria-label={`Cambios en ${row.name}`}>{row.changes.map(change=><li key={change.key}><code>{change.key}</code>: {oclValue(change.from)} → {change.action==='remove'?'se quita':oclValue(change.to)}</li>)}</ul>}{row.kept.length>0&&<ul aria-label={`Valores del usuario conservados en ${row.name}`}>{row.kept.map(entry=><li key={entry.key}><code>{entry.key}</code>: se conserva {oclValue(entry.current)} (la ficha diría {oclValue(entry.proposed)})</li>)}</ul>}</div>)}{oclPlan.changed>0?<><p>Solo se escriben claves vacías o que Planos Santo escribió antes. Lo que cargaste a mano en OpenCutList no se pisa.</p><button className="primary" disabled={!!busy} onClick={()=>void run('Sincronizando con OpenCutList…',applyOcl)}>Aplicar {oclPlan.changed} {oclPlan.changed===1?'cambio':'cambios'}</button></>:null}<button disabled={!!busy} onClick={()=>setOclPlan(undefined)}>{oclPlan.changed>0?'Cancelar':'Cerrar'}</button></div>}
    </div>{canInstall&&!installed&&<div className="material-install-action">{installConfirm?<div role="group" aria-label="Confirmar carga de SKM"><p>Se cargará el SKM de este material en el modelo abierto. Su aprobación para maderera conserva su estado. No se pintan piezas ni se modifica el archivo original.</p><button className="primary" disabled={!!busy||!!preview} onClick={()=>void run('Cargando SKM en el modelo…',install)}>Sí, cargar SKM</button><button disabled={!!busy} onClick={()=>setInstallConfirm(false)}>Cancelar carga</button></div>:<button disabled={!!busy||!!preview||creating} onClick={()=>setInstallConfirm(true)}>Cargar SKM en este modelo</button>}</div>}{selectedDesignReady&&!installed&&<p>Cargá este material guardado en el modelo abierto antes de usar la paleta.</p>}{selectedPhotoMissing&&<p role="alert">No se verificaron todos los archivos privados de este material. Restaurá sus archivos antes de cargarlo o pintar.</p>}{!selected.approved&&<p>Para producir, completá tipo, SKU, proveedor, medidas y veta. La importación conserva las sugerencias sin aprobarlas.</p>}{selected.approved&&!selectedNative?.length&&<p>La ficha está aprobada. Asociá o cargá su material nativo antes de pintar.</p>}</aside>}
  </div>
  {library&&!busy&&!filtered.length&&!nativeOnly.length&&<div className="material-library-empty" role="status"><strong>{!library.catalog.items.length?'Tu biblioteca empieza acá':query.trim()&&filter!=='archived'?`Ningún material coincide con «${query.trim()}»`:emptyCopy[filter][0]}</strong><p>{library.catalog.items.length?query.trim()&&filter!=='archived'?'Probá otro nombre, SKU o espesor, o quitá los filtros.':emptyCopy[filter][1]:'Importá un ZIP/carpeta con materiales SKM o un paquete .zip de otra biblioteca, o creá una ficha para revisar.'}</p><button onClick={()=>{setQuery('');setFilter('all');setFavorites(false);setScope('workshop');}}>Mostrar todos</button></div>}
  <p className="material-library-footnote">Biblioteca local del taller · Las miniaturas provienen del SKM o de la foto propia cuando están disponibles. No se usa el nombre del archivo para aprobar propiedades.</p>
  {textureOpen&&selected&&<TextureAdjustPanel catalogId={selected.id} name={selected.name} thumbnail={library?.rows.find(row=>row.catalogId===selected.id)?.thumbnail} widthPx={photoMeta?.widthPx} heightPx={photoMeta?.heightPx} current={photoMeta?.textureScale?{widthMm:photoMeta.textureScale.widthMm??null,heightMm:photoMeta.textureScale.heightMm??null,verified:photoMeta.textureScale.verified===true}:undefined} sheet={selected.kind==='sheet'&&selected.lengthMm&&selected.widthMm?{lengthMm:selected.lengthMm,widthMm:selected.widthMm}:null} revision={library?.catalog.revision??0} assetRevision={library?.assetRevision??0} onClose={()=>{setTextureOpen(false);pendingFocus.current='search';}} onApplied={result=>void run('Actualizando biblioteca…',()=>textureApplied(result),true)}/>}
  {packagePreview&&<div className="material-import-backdrop"><section ref={packagePanel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="material-package-title" className="material-import-preview"><header><div><span className="material-eyebrow">PAQUETE .ZIP · ARCHIVOS VERIFICADOS</span><h2 id="material-package-title">Revisar paquete de materiales</h2><p>{packagePreview.package.items} fichas y {packagePreview.package.files} archivos con huella verificada ({new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(packagePreview.package.bytes/1024/1024)} MB). Se importan sin aprobar para maderera y no se cargan en el modelo.</p></div><button disabled={!!busy} onClick={()=>void run('Cerrando vista previa…',cancelPackage)} aria-label="Cerrar vista previa del paquete">Cerrar</button></header><div className="material-import-summary"><span>{packagePreview.rows.filter(row=>row.status==='new').length} nuevas</span><span>{packagePreview.rows.filter(row=>row.status==='duplicate').length} ya en la biblioteca</span><span>{packagePreview.rows.filter(row=>row.status==='conflict').length} conflictos</span><button disabled={!!busy} onClick={()=>setPackageRows(packagePreview.rows.filter(row=>row.status==='new').map(row=>row.id))}>Seleccionar nuevas</button><button disabled={!!busy} onClick={()=>setPackageRows([])}>Ninguna</button></div><div className="material-import-rows">{packagePreview.rows.map(row=><article className={`material-import-row ${row.status}`} key={row.id} aria-label={`Ficha del paquete ${row.name}`}><label className="material-import-selection"><input type="checkbox" disabled={!!busy||row.status==='duplicate'} checked={packageRows.includes(row.id)} aria-label={`Importar ficha ${row.name}`} onChange={event=>setPackageRows(previous=>event.target.checked?[...previous,row.id]:previous.filter(id=>id!==row.id))}/></label><Thumbnail uri={row.thumbnail} name={row.name}/><div className="material-import-row-copy"><strong>{row.name}</strong><span className="material-import-filename">{kindNames[row.kind]||row.kind} · {row.files} {row.files===1?'archivo':'archivos'}</span><span className={`material-status-chip ${row.status==='duplicate'?'duplicate':'pending'}`}>{row.status==='duplicate'?'Ya está en la biblioteca':row.status==='conflict'?'Nombre en conflicto':'Nueva · pendiente'}</span>{row.warnings.map(warning=><p key={warning} className="material-card-warning">{warning}</p>)}{row.status==='conflict'&&<label className="material-conflict-name">Nombre nuevo para esta ficha<input aria-label={`Resolver nombre de ${row.name}`} maxLength={160} value={packageRenames[row.id]||''} disabled={!!busy} onChange={event=>setPackageRenames(previous=>({...previous,[row.id]:event.target.value}))}/><small>O desmarcala. No se sobrescribe la ficha existente.</small></label>}</div></article>)}</div><footer><div><strong>{packageRows.length} seleccionadas</strong><p>{packageUnresolved.length?'Resolvé los nombres en conflicto o desmarcá esas fichas.':packageRepeated?'Hay nombres repetidos en la selección.':'No se cargarán materiales ni se pintarán caras del modelo.'}</p>{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}</div><button disabled={!!busy} onClick={()=>void run('Cancelando importación…',cancelPackage)}>Cancelar paquete</button><button className="primary" disabled={!!busy||!packageRows.length||!!packageUnresolved.length||packageRepeated} onClick={()=>void run('Importando paquete y verificando archivos…',commitPackage)}>Importar {packageRows.length} {packageRows.length===1?'ficha':'fichas'}</button></footer></section></div>}
  {photoOpen&&<PhotoMaterialPanel replacement={photoTarget} onClose={()=>{setPhotoOpen(false);setPhotoTarget(undefined);pendingFocus.current='search';}} onCreated={photoCreated}/> }
  {preview&&<div className="material-import-backdrop"><section ref={previewPanel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="material-import-title" className="material-import-preview"><header><div><span className="material-eyebrow">VISTA PREVIA · SIN CAMBIAR EL MODELO</span><h2 id="material-import-title">Revisar importación de materiales</h2><p>{preview.rows.length} archivos analizados. Se importan como candidatos pendientes, sin tipo ni medidas verificadas.</p></div><button disabled={!!busy} onClick={()=>void run('Cerrando vista previa…',cancelPreview)} aria-label="Cerrar vista previa de importación">Cerrar</button></header><div className="material-import-summary"><span>{preview.rows.filter(row=>row.status==='new').length} nuevos</span><span>{preview.rows.filter(row=>row.status==='duplicate').length} duplicados</span><span>{preview.rows.filter(row=>row.status==='conflict').length} conflictos</span><button disabled={!!busy} onClick={()=>setSelectedRows(preview.rows.filter(row=>row.status==='new').map(row=>row.id))}>Seleccionar nuevos</button><button disabled={!!busy} onClick={()=>setSelectedRows([])}>Ninguno</button></div><div className="material-import-rows">{preview.rows.map(row=><article className={`material-import-row ${row.status}`} key={row.id}><label className="material-import-selection"><input type="checkbox" disabled={!!busy||row.status==='duplicate'} checked={selectedRows.includes(row.id)} aria-label={`Importar ${row.sourceName}`} onChange={event=>setSelectedRows(previous=>event.target.checked?[...previous,row.id]:previous.filter(id=>id!==row.id))}/><span className="sr-only">Seleccionar {row.sourceName}</span></label><Thumbnail uri={row.thumbnail} name={row.name}/><div className="material-import-row-copy"><strong>{row.name}</strong><span className="material-import-filename">{row.sourceName} · {new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(row.bytes/1024)} KB</span><span className={`material-status-chip ${row.status==='duplicate'?'duplicate':'pending'}`}>{row.status==='duplicate'?'Ya está en la biblioteca':row.status==='conflict'?'Nombre en conflicto':'Nuevo · pendiente'}</span>{row.suggestions&&<p className="material-import-suggestion">Sugerencia sin verificar: {kindNames[row.suggestions.kind||'unknown']||'Tipo pendiente'}{row.suggestions.thicknessMm?` · ${row.suggestions.thicknessMm} mm`:''}. No se aprueba ni se aplica como medida.</p>}{row.warnings?.map(warning=><p key={warning} className="material-card-warning">{warning}</p>)}{row.status==='conflict'&&<label className="material-conflict-name">Nombre nuevo para este candidato<input aria-label={`Resolver nombre ${row.sourceName}`} maxLength={160} value={renames[row.id]||''} disabled={!!busy} onChange={event=>setRenames(previous=>({...previous,[row.id]:event.target.value}))}/><small>O desmarcalo. No se sobrescribe la ficha existente.</small></label>}</div></article>)}</div><footer><div><strong>{selectedRows.length} seleccionados</strong><p>{unresolved.length?'Resolvé los nombres en conflicto o desmarcá esos archivos.':repeatedNames?'Hay nombres repetidos en la selección. Cambialos o quitá los duplicados.':'No se cargarán materiales ni se pintarán caras del modelo.'}</p>{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}</div><button disabled={!!busy} onClick={()=>void run('Cancelando importación…',cancelPreview)}>Cancelar importación</button><button className="primary" disabled={!!busy||!selectedRows.length||!!unresolved.length||repeatedNames} onClick={()=>void run('Importando candidatos y guardando biblioteca…',commit)}>Importar {selectedRows.length} pendientes</button></footer></section></div>}
 </section>;
}
