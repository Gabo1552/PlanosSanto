import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {request} from './bridge';
import type {Catalog,CatalogItem} from './WorkshopPanel';
import './material-library.css';
import {SkmBatchKind,SkmRowKind} from './SkmTypedImport';
import {initialKinds,typedKinds} from './maderaRules';
import PhotoMaterialPanel,{TextureAdjustPanel,type PhotoMaterialResult,type PhotoMaterialTarget,type TextureApplyResult} from './PhotoMaterialPanel';
import {addThickness,addWidth,applyDraft,changeKind,chooseThickness,copyName,DEFAULT_THICKNESSES,DEFAULT_WIDTHS,draftChanged,draftFromItem,filterCounts,filterItems,formatMm,groupItems,hexColor,kindLabels,nameCollision,newDraft,removeThickness,removeWidth,rgbFromHex,searchText,setThickness,setWidth,standardThicknesses,thicknessSummary,type DraftErrors,type FichaDraft,type FichaItem,type GroupKey,type LibraryFilter,type StandardThicknesses} from './materialLibraryModel';
import {catalogComplete,catalogMissing} from './workshopRules';

type Suggestions={kind?:string;thicknessMm?:number|null;verified?:boolean};
export type SkmLibraryRow={catalogId:string;sha256?:string;assetHash?:string;name?:string;sourceName:string;thumbnail?:string|null;suggestions?:Suggestions;warnings?:string[]};
type NativeMaterial={id:string;name:string;color?:number[]|null;hasTexture?:boolean;binding?:{catalogId:string;kind:string;uuid:string}|null;issues?:string[]};
/** 0.8.17: a model material whose ficha cannot be chosen automatically (same name twice, or another OpenCutList type). */
export type LinkAmbiguity={materialId:string;name:string;reason:'name'|'ocl_type';message:string;candidates:{catalogId:string;name:string;kind:string;thicknessMm:number|null}[]};
export type VisualLibrary={catalog:Catalog;rows:SkmLibraryRow[];materials?:NativeMaterial[];visuals?:{catalogId:string;available:boolean;designReady:boolean}[];assetRevision?:number;ambiguous?:LinkAmbiguity[];autoLink?:{changed?:number};standardThicknessesMm?:StandardThicknesses;standardWidthsMm?:{edge:number[]}};
export type SkmPreviewRow={id:string;sha256:string;hash?:string;name:string;sourceName:string;bytes:number;thumbnail?:string|null;suggestions?:Suggestions;warnings:string[];status:'new'|'duplicate'|'conflict'};
export type SkmPreview={token:string;revision:number;rows:SkmPreviewRow[]};
type PreviewResult=SkmPreview|{cancelled:true};
type ImportResult={catalog:Catalog;imported:number;skipped?:number;duplicates?:number;rows?:SkmLibraryRow[]};
type Props={refreshKey?:number;onApplied?:(scan:unknown,warning?:string)=>void;onEdit:(catalogId?:string)=>void;onPaint?:(catalogId?:string,autoStart?:boolean)=>void;onManageModel?:()=>void;onClose?:()=>void;onChanged?:()=>void;onDirtyChange?:(dirty:boolean)=>void};
type Filter=LibraryFilter;
type ArchiveRow={catalogId:string;name:string;inModel:number;compatibleWith:number;warnings:string[]};
type OclChange={key:string;from?:unknown;to?:unknown;action:'write'|'update'|'remove'};
type OclMaterial={materialId:string;name:string;catalogId:string;status:'written'|'updated'|'unchanged'|'conflict'|'kept';changes:OclChange[];kept:{key:string;current?:unknown;proposed?:unknown}[]};
type OclPlan={catalogId?:string;dryRun:boolean;changed:number;planDigest?:string;materials:OclMaterial[]};
export type PackageRow={id:string;name:string;kind:string;status:'new'|'duplicate'|'conflict';thumbnail:string|null;files:number;warnings:string[]};
export type PackagePreview={token:string;revision:number;package:{items:number;files:number;bytes:number;createdAt?:string};rows:PackageRow[]};
type PhotoMeta={widthPx?:number;heightPx?:number;textureScale?:{verified?:boolean;widthMm?:number|null;heightMm?:number|null}};
type Ficha={mode:'edit';id:string;tab?:'general'|'texture'}|{mode:'create';kind:string};
type Menu=''|'create'|'import'|'more';
const oclValue=(value:unknown)=>value===undefined||value===null?'vacío':typeof value==='string'?value:JSON.stringify(value);
const filterLabels:[Filter,string][]=[['all','Todos'],['sheet','Placas'],['edge','Cantos'],['other','Otros'],['review','Por completar'],['archived','Archivados']];
const emptyCopy:Record<Filter,[string,string]>={all:['No hay materiales con estos filtros','Probá otro nombre o quitá los filtros.'],sheet:['No hay placas con estos filtros','Probá otra búsqueda o creá una placa desde una foto.'],edge:['No hay cantos con estos filtros','Probá otra búsqueda o importá los cantos del proveedor.'],other:['No hay otros materiales','Maciza, perfiles y láminas aparecen acá cuando los clasificás.'],review:['No hay fichas por completar','Todas las fichas visibles tienen los datos que necesita un pedido.'],archived:['No hay fichas archivadas','Archivar oculta una ficha sin borrarla ni borrar sus archivos. Podés restaurarla cuando quieras.']};
export function readyForDesign(item:CatalogItem){const observed=item.observed as Record<string,unknown>|undefined;const photo=observed?.photo as Record<string,unknown>|undefined;return ['sheet','edge'].includes(item.kind)&&photo?.schema===1&&photo?.designReady===true;}
const kindName=(kind:string)=>kindLabels[kind as keyof typeof kindLabels]||kind;
// Biblioteca v4: una placa muestra sus espesores («3 a 25 mm»); el resto, su espesor.
const summary=(item:CatalogItem)=>[kindName(item.kind),item.kind==='sheet'?thicknessSummary(standardThicknesses(item)):item.thicknessMm===null?'':formatMm(item.thicknessMm)].filter(Boolean).join(' · ');
const safeImage=(uri?:string|null):uri is string=>!!uri&&uri.length<=4*1024*1024&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(uri);

/** Own simple icons (inline SVG). */
const iconPaths:Record<string,ReactNode>={
 sheet:<><path d="M3 9.5 12 5l9 4.5-9 4.5z"/><path d="m3 13.5 9 4.5 9-4.5"/></>,
 edge:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/></>,
 other:<><path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></>,
 unknown:<><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.1-1.5 2.1V15"/><path d="M12 18.5v.5"/></>,
 pencil:<><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></>,
 star:<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/>,
 trash:<><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/><path d="M10.5 10.5v6M13.5 10.5v6"/></>,
 restore:<><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></>,
 copy:<><rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4H15"/></>,
 export:<><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/></>,
 import:<><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 13v6h14v-6"/></>,
 refresh:<><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.6h-3.6M6.5 20.5v-3.6h3.6"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 minus:<path d="M5 12h14"/>,
 more:<><circle cx="12" cy="5.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18.5" r="1.2"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 search:<><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>,
 warning:<><path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.5"/></>,
 model:<><path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="M12 12v8M4 8l8 4 8-4"/></>,
 texture:<><path d="M4 20 20 4M4 14 14 4M10 20 20 10M4 8l4-4M16 20l4-4"/></>,
};
function Icon({name,className}:{name:string;className?:string}){return <svg className={`material-icon ${className||''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{iconPaths[name]}</svg>;}
const kindIcon=(kind:string)=>kind==='sheet'||kind==='edge'?kind:kind==='unknown'||!(kind in kindLabels)?'unknown':'other';
const groupIcon:Record<GroupKey,string>={sheet:'sheet',edge:'edge',other:'other',unknown:'unknown'};

function Thumbnail({uri,name}:{uri?:string|null;name:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[uri]);
 return safeImage(uri)&&!failed?<img className="material-card-image" src={uri} alt={`Miniatura real de ${name}`} onError={()=>setFailed(true)} loading="lazy" decoding="async"/>:<div className="material-card-placeholder"><span aria-hidden="true">▧</span><span>Sin miniatura disponible</span></div>;
}
function nativeColor(color?:number[]|null){return color?.length===3&&color.every(value=>Number.isFinite(value)&&value>=0&&value<=255)?`rgb(${color.join(',')})`:undefined;}

/** Focus trap + Escape for a modal surface (WAI-ARIA dialog pattern). */
function useModal(ref:RefObject<HTMLElement|null>,active:boolean,onEscape:()=>void){
 const escape=useRef(onEscape);escape.current=onEscape;
 useEffect(()=>{
  if(!active)return;
  function key(event:KeyboardEvent){
   const dialog=ref.current;if(!dialog)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();escape.current();return;}
   if(event.key!=='Tab')return;
   const focusable=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element=>!element.closest('[hidden]'));
   const first=focusable[0],last=focusable[focusable.length-1];
   if(!first){event.preventDefault();dialog.focus();return;}
   if((event.shiftKey&&(document.activeElement===first||document.activeElement===dialog))||(!event.shiftKey&&document.activeElement===last)||!dialog.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
  }
  document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
 },[active,ref]);
}

type ModelInfo={bound:NativeMaterial[];installed:boolean;canInstall:boolean;designReady:boolean;photoMissing:boolean;photoAvailable:boolean;thumbnail?:string|null;photo?:PhotoMeta;issues:string[]};
type PropertiesProps={ficha:Ficha;item?:FichaItem;items:FichaItem[];defaults:StandardThicknesses;info?:ModelInfo;archived:boolean;busy:string;error:string;canPaint:boolean;
 onCancel:()=>void;onApply:(item:FichaItem,color?:[number,number,number])=>void;onCreate:(draft:FichaDraft)=>void;onArchive:(value:boolean)=>void;onDuplicate:(name:string)=>void;onExport:()=>void;
 onPaint:(autoStart:boolean)=>void;onInstall:()=>void;onSync:()=>void;onReplacePhoto:()=>void;onAdjustTexture:()=>void;onWorkshop:()=>void;onDirty:(dirty:boolean)=>void;oclResult?:OclPlan;onCloseOcl:()=>void};

/** «Propiedades del material»: General (datos y formatos) y Textura (foto y uso en el modelo). */
function MaterialProperties(props:PropertiesProps){
 const {ficha,item,items,defaults,info,archived,busy,error}=props;
 const creating=ficha.mode==='create';
 const base=useMemo<FichaItem|undefined>(()=>item,[item?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 const [draft,setDraft]=useState<FichaDraft>(()=>item?draftFromItem(item,defaults):newDraft(ficha.mode==='create'?ficha.kind:'sheet',defaults));
 const [tab,setTab]=useState<'general'|'texture'>(ficha.mode==='edit'&&ficha.tab==='texture'?'texture':'general'),[sub,setSub]=useState<'formats'|'price'>('formats');
 const [errors,setErrors]=useState<DraftErrors>({}),[color,setColor]=useState(''),[copy,setCopy]=useState<string>();
 const dialog=useRef<HTMLElement>(null),nameInput=useRef<HTMLInputElement>(null),copyInput=useRef<HTMLInputElement>(null),oclPanel=useRef<HTMLDivElement>(null);
 const dirty=(base?draftChanged(base,draft,defaults):true)||!!color;
 const onDirty=props.onDirty;
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 useEffect(()=>()=>onDirty(false),[onDirty]);
 useEffect(()=>{if(tab==='general')nameInput.current?.focus();else dialog.current?.focus();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(copy!==undefined)copyInput.current?.focus();},[copy!==undefined]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(props.oclResult)oclPanel.current?.focus();},[props.oclResult]);
 // «+» leaves the cursor in the new row, ready to type the thickness.
 const focusNewRow=useRef(false);
 useEffect(()=>{if(!focusNewRow.current)return;focusNewRow.current=false;const inputs=dialog.current?.querySelectorAll<HTMLInputElement>('.material-thickness-list:not(.is-widths) .material-thickness-row .material-mm-input input');inputs?.[inputs.length-1]?.focus();},[draft.thicknesses.length]);
 const focusNewWidth=useRef(false);
 useEffect(()=>{if(!focusNewWidth.current)return;focusNewWidth.current=false;const inputs=dialog.current?.querySelectorAll<HTMLInputElement>('.material-thickness-list.is-widths .material-mm-input input');inputs?.[inputs.length-1]?.focus();},[draft.widths.length]);
 useModal(dialog,true,()=>{if(busy)return;if(copy!==undefined){setCopy(undefined);return;}props.onCancel();});
 const missing=useMemo(()=>{const preview=applyDraft(base||({id:'',name:'',kind:draft.kind,sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{}} as FichaItem),draft).item;return preview?catalogMissing(preview):null;},[base,draft]);
 const collision=nameCollision(items,base?.id,draft.name);
 const nativeHex=hexColor(info?.bound.find(material=>material.color)?.color);
 const hasVisual=!!info&&(info.bound.length>0||info.photoAvailable||safeImage(info.thumbnail)||info.canInstall);
 const colorEditable=!creating&&['sheet','edge'].includes(draft.kind)&&!hasVisual&&!readyForDesign(base as CatalogItem);
 const title=creating?'Nueva ficha de material':`Propiedades del material «${base?.name||''}»`;
 function update(next:FichaDraft){setDraft(next);if(Object.keys(errors).length)setErrors({});}
 function submit(){
  const target=base||({id:'',name:'',kind:draft.kind,sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{}} as FichaItem);
  const result=applyDraft(target,draft);setErrors(result.errors);
  if(!result.item){
   const field=result.errors.name?'name':result.errors.thicknesses||result.errors.widths||result.errors.widthMm||result.errors.lengthMm?'formats':'price';
   setTab('general');if(field!=='name')setSub(field);
   requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return;
  }
  if(creating){props.onCreate(draft);return;}
  props.onApply(result.item,color?rgbFromHex(color)||undefined:undefined);
 }
 const disabled=!!busy;
 const tabKey=(event:React.KeyboardEvent,current:'general'|'texture')=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=current==='general'?'texture':'general';setTab(next);requestAnimationFrame(()=>document.getElementById(`material-tab-${next}`)?.focus());};
 const subKey=(event:React.KeyboardEvent,current:'formats'|'price')=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=current==='formats'?'price':'formats';setSub(next);requestAnimationFrame(()=>document.getElementById(`material-subtab-${next}`)?.focus());};
 const thicknessRows=draft.thicknesses.map((value,index)=>({value,index})),sheetKind=draft.kind==='sheet';
 return <div className="material-import-backdrop material-properties-backdrop">
  <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="material-properties-title" aria-describedby="material-properties-status" className="material-properties" aria-busy={!!busy}>
   <header className="material-properties-header">
    <div><h2 id="material-properties-title">{title}</h2>
     <p id="material-properties-status" className={`material-properties-status ${missing&&missing.length?'incomplete':'complete'}`}>{missing===null?'Revisá los datos marcados.':missing.length?<>Ficha incompleta · para pedidos falta: {missing.join(', ')}</>:'Ficha completa: se puede usar en pedidos.'}{archived&&' · Archivada'}</p></div>
    <button type="button" className="material-icon-button" aria-label="Cerrar propiedades" disabled={disabled} onClick={props.onCancel}><Icon name="close"/></button>
   </header>
   <div className="material-tabs" role="tablist" aria-label="Secciones de la ficha">
    <button type="button" role="tab" id="material-tab-general" aria-selected={tab==='general'} aria-controls="material-panel-general" tabIndex={tab==='general'?0:-1} onClick={()=>setTab('general')} onKeyDown={event=>tabKey(event,'general')}>General</button>
    <button type="button" role="tab" id="material-tab-texture" aria-selected={tab==='texture'} aria-controls="material-panel-texture" tabIndex={tab==='texture'?0:-1} onClick={()=>setTab('texture')} onKeyDown={event=>tabKey(event,'texture')}><Icon name="texture"/>Textura</button>
   </div>
   <div className="material-properties-body">
    <div role="tabpanel" id="material-panel-general" aria-labelledby="material-tab-general" hidden={tab!=='general'}>
     <div className="material-form">
      <label htmlFor="material-field-name">Nombre</label>
      <div><input ref={nameInput} id="material-field-name" value={draft.name} maxLength={160} disabled={disabled} aria-invalid={!!errors.name} aria-describedby={errors.name?'material-error-name':collision?'material-name-collision':undefined} onChange={event=>update({...draft,name:event.target.value})}/>
       {errors.name&&<p id="material-error-name" className="material-field-error">{errors.name}</p>}
       {!errors.name&&collision&&<p id="material-name-collision" className="material-field-hint warning">Ya hay otra ficha con este nombre: el vínculo automático con el modelo te va a pedir que elijas.</p>}</div>
      <span className="material-form-label" id="material-color-label">Color</span>
      <div className="material-color-field" role="group" aria-labelledby="material-color-label">
       {colorEditable?<><input type="color" aria-label="Elegir color del material" value={color||'#c8b79a'} disabled={disabled} onChange={event=>setColor(event.target.value)}/><input aria-label="Color en hexadecimal" value={color} placeholder="#c8b79a" maxLength={7} disabled={disabled} onChange={event=>setColor(event.target.value)}/>{color&&!rgbFromHex(color)&&<p className="material-field-error">Escribí el color como #rrggbb.</p>}<p className="material-field-hint">Sin foto ni material en el modelo: al aplicar se crea su color en este modelo y queda para los demás.</p></>
        :<><span className="material-color-swatch" style={nativeHex?{backgroundColor:nativeHex}:safeImage(info?.thumbnail)?{backgroundImage:`url("${info?.thumbnail}")`}:undefined} aria-hidden="true"/><span className="material-color-value">{nativeHex||(safeImage(info?.thumbnail)?'Textura':'Sin color')}</span><span className="material-field-hint">{creating?'Se elige después de crear la ficha.':nativeHex?'Color del material en el modelo (se cambia en SketchUp).':hasVisual?'La apariencia la da su textura (pestaña Textura).':'Solo placas y cantos llevan color o foto.'}</span></>}
      </div>
      <label htmlFor="material-field-notes">Descripción</label>
      <textarea id="material-field-notes" value={draft.notes} maxLength={500} rows={2} disabled={disabled} onChange={event=>update({...draft,notes:event.target.value})}/>
      <label htmlFor="material-field-sku">SKU</label>
      <input id="material-field-sku" value={draft.sku} maxLength={160} disabled={disabled} onChange={event=>update({...draft,sku:event.target.value})}/>
      <label htmlFor="material-field-supplier">Proveedor</label>
      <input id="material-field-supplier" value={draft.supplier} maxLength={160} disabled={disabled} onChange={event=>update({...draft,supplier:event.target.value})}/>
      <label htmlFor="material-field-kind">Tipo</label>
      <div className="material-kind-field"><Icon name={kindIcon(draft.kind)}/><select id="material-field-kind" value={draft.kind} disabled={disabled} onChange={event=>update(changeKind(draft,event.target.value,defaults))}>{(['sheet','edge','solid_wood','dimensional','veneer','unknown'] as const).map(kind=><option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select></div>
     </div>
     <div className="material-subtabs" role="tablist" aria-label="Datos para pedidos">
      <button type="button" role="tab" id="material-subtab-formats" aria-selected={sub==='formats'} aria-controls="material-subpanel-formats" tabIndex={sub==='formats'?0:-1} onClick={()=>setSub('formats')} onKeyDown={event=>subKey(event,'formats')}>Formatos</button>
      <button type="button" role="tab" id="material-subtab-price" aria-selected={sub==='price'} aria-controls="material-subpanel-price" tabIndex={sub==='price'?0:-1} onClick={()=>setSub('price')} onKeyDown={event=>subKey(event,'price')}>Precio</button>
     </div>
     <div role="tabpanel" id="material-subpanel-formats" aria-labelledby="material-subtab-formats" hidden={sub!=='formats'} className="material-form">
      {draft.kind==='sheet'&&<><label htmlFor="material-field-grain">Dirección de fibra</label>
       <select id="material-field-grain" value={draft.grain} disabled={disabled} onChange={event=>update({...draft,grain:event.target.value as FichaDraft['grain']})}><option value="">Sin definir</option><option value="true">La fibra sigue el largo (con veta)</option><option value="false">Sin veta (se puede girar)</option></select></>}
      {/* 0.8.20: una placa vale para todos sus espesores (sin elegir uno); el canto marca el suyo, que se descuenta del corte. */}
      <span className="material-form-label" id="material-thicknesses-label">{sheetKind?'Espesores disponibles':'Espesores estándar'}</span>
      <div>
       <div role={sheetKind?'group':'radiogroup'} aria-labelledby="material-thicknesses-label" aria-describedby="material-thicknesses-help" className={`material-thickness-list${sheetKind?' is-plain':''}`}>
        {thicknessRows.map(({value,index})=><div className="material-thickness-row" key={index}>
         {!sheetKind&&<input type="radio" name="material-thickness-chosen" checked={draft.chosen===index} disabled={disabled} aria-label={`Usar ${value?`${value} mm`:'este espesor'} como espesor de la ficha`} onChange={()=>update(chooseThickness(draft,index))}/>}
         <span className="material-mm-input"><input inputMode="decimal" value={value} disabled={disabled} aria-label={`${sheetKind?'Espesor disponible':'Espesor estándar'} ${index+1} (mm)`} aria-invalid={!!errors.rows?.[index]} onChange={event=>update(setThickness(draft,index,event.target.value))}/><span aria-hidden="true">mm</span></span>
         <button type="button" className="material-icon-button" disabled={disabled} aria-label={`Quitar espesor ${value?`${value} mm`:index+1}`} onClick={()=>update(removeThickness(draft,index))}><Icon name="minus"/></button>
         {errors.rows?.[index]&&<p className="material-field-error">{errors.rows[index]}</p>}
        </div>)}
        {!draft.thicknesses.length&&<p className="material-field-hint">{sheetKind?'Sin espesores: agregá al menos uno para pedir la placa.':'Sin espesores estándar.'}</p>}
       </div>
       <div className="material-thickness-tools"><button type="button" className="material-icon-button" disabled={disabled||draft.thicknesses.length>=32} aria-label="Agregar espesor" onClick={()=>{focusNewRow.current=true;update(addThickness(draft));}}><Icon name="plus"/></button>
        {!sheetKind&&draft.chosen!==null&&<button type="button" className="material-link-button" disabled={disabled} onClick={()=>update(chooseThickness(draft,null))}>Dejar sin espesor elegido</button>}</div>
       <p id="material-thicknesses-help" className="material-field-hint">{sheetKind?'Todos valen: al pintar es el mismo material y el listado de piezas lo separa por el espesor real de cada pieza. Un espesor que no está acá se lista igual y se marca para agregarlo.':draft.kind==='edge'?'Marcá el espesor del canto (se descuenta del corte); el resto queda como opciones del material.':'Marcá el espesor de esta ficha; el resto queda como opciones del material.'} {errors.thicknesses&&<span className="material-field-error">{errors.thicknesses}</span>}</p>
      </div>
      {draft.kind==='sheet'&&<><span className="material-form-label" id="material-size-label">Tamaño de panel</span>
       <div><div className="material-size-field" role="group" aria-labelledby="material-size-label"><span className="material-mm-input"><input inputMode="decimal" aria-label="Largo del panel (mm)" placeholder="Largo" value={draft.lengthMm} disabled={disabled} aria-invalid={!!errors.lengthMm} onChange={event=>update({...draft,lengthMm:event.target.value})}/><span aria-hidden="true">mm</span></span><span aria-hidden="true">×</span><span className="material-mm-input"><input inputMode="decimal" aria-label="Ancho del panel (mm)" placeholder="Ancho" value={draft.widthMm} disabled={disabled} aria-invalid={!!errors.widthMm} onChange={event=>update({...draft,widthMm:event.target.value})}/><span aria-hidden="true">mm</span></span></div>
        {(errors.lengthMm||errors.widthMm)&&<p className="material-field-error">{errors.lengthMm||errors.widthMm}</p>}</div></>}
      {draft.kind==='edge'&&<><span className="material-form-label" id="material-widths-label">Anchos estándar</span>
       <div>
        <div role="group" aria-labelledby="material-widths-label" aria-describedby="material-widths-help" className="material-thickness-list is-plain is-widths">
         {draft.widths.map((value,index)=><div className="material-thickness-row" key={index}>
          <span className="material-mm-input"><input inputMode="decimal" value={value} disabled={disabled} aria-label={`Ancho estándar ${index+1} (mm)`} aria-invalid={!!errors.widthRows?.[index]} onChange={event=>update(setWidth(draft,index,event.target.value))}/><span aria-hidden="true">mm</span></span>
          <button type="button" className="material-icon-button" disabled={disabled} aria-label={`Quitar ancho ${value?`${value} mm`:index+1}`} onClick={()=>update(removeWidth(draft,index))}><Icon name="minus"/></button>
          {errors.widthRows?.[index]&&<p className="material-field-error">{errors.widthRows[index]}</p>}
         </div>)}
         {!draft.widths.length&&<p className="material-field-hint">Sin anchos: agregá al menos uno para pedir el canto.</p>}
        </div>
        <div className="material-thickness-tools"><button type="button" className="material-icon-button" disabled={disabled||draft.widths.length>=32} aria-label="Agregar ancho" onClick={()=>{focusNewWidth.current=true;update(addWidth(draft));}}><Icon name="plus"/></button></div>
        <p id="material-widths-help" className="material-field-hint">El canto se refila: el ancho no se compara con el espesor de la pieza mientras alguno la cubra. {errors.widths&&<span className="material-field-error">{errors.widths}</span>}</p>
       </div></>}
      {!creating&&base&&['sheet','edge'].includes(draft.kind)&&<><span/><p className="material-field-hint">Cantos compatibles y variantes de espesor con SKU propio: <button type="button" className="material-link-button" disabled={disabled||dirty} onClick={props.onWorkshop}>abrir en Taller</button></p></>}
     </div>
     <div role="tabpanel" id="material-subpanel-price" aria-labelledby="material-subtab-price" hidden={sub!=='price'} className="material-form">
      <label htmlFor="material-field-price">Precio (opcional)</label>
      <div><input id="material-field-price" inputMode="decimal" value={draft.price.amount} disabled={disabled} aria-invalid={!!errors.price} aria-describedby={errors.price?'material-error-price':undefined} onChange={event=>update({...draft,price:{...draft.price,amount:event.target.value}})}/>{errors.price&&<p id="material-error-price" className="material-field-error">{errors.price}</p>}</div>
      <label htmlFor="material-field-currency">Moneda</label>
      <input id="material-field-currency" value={draft.price.currency} maxLength={12} disabled={disabled} onChange={event=>update({...draft,price:{...draft.price,currency:event.target.value}})}/>
      <label htmlFor="material-field-unit">Unidad</label>
      <input id="material-field-unit" value={draft.price.unit} maxLength={40} disabled={disabled} onChange={event=>update({...draft,price:{...draft.price,unit:event.target.value}})}/>
      <label htmlFor="material-field-date">Fecha</label>
      <input id="material-field-date" type="date" value={draft.price.date} disabled={disabled} onChange={event=>update({...draft,price:{...draft.price,date:event.target.value}})}/>
      <label htmlFor="material-field-source">Fuente</label>
      <input id="material-field-source" value={draft.price.source} maxLength={160} disabled={disabled} onChange={event=>update({...draft,price:{...draft.price,source:event.target.value}})}/>
      <span/><p className="material-field-hint">Vacío no bloquea nada: el pedido muestra «sin precio».</p>
     </div>
    </div>
    <div role="tabpanel" id="material-panel-texture" aria-labelledby="material-tab-texture" hidden={tab!=='texture'} className="material-texture-panel">
     {creating||!base||!info?<p className="material-field-hint">Creá la ficha para cargarle una foto o usarla en el modelo.</p>:<>
      <div className="material-texture-preview" style={!safeImage(info.thumbnail)&&nativeHex?{backgroundColor:nativeHex}:undefined}>{safeImage(info.thumbnail)?<Thumbnail uri={info.thumbnail} name={base.name}/>:<span>{nativeHex?'Color del material en el modelo':'Sin foto ni textura'}</span>}</div>
      <div className="material-texture-info">
       {info.photo&&<p>Foto propia{info.photo.widthPx&&info.photo.heightPx?` · ${info.photo.widthPx} × ${info.photo.heightPx} px`:''} · {info.photo.textureScale?.verified&&info.photo.textureScale.widthMm&&info.photo.textureScale.heightMm?`tamaño físico ${formatMm(info.photo.textureScale.widthMm)} × ${formatMm(info.photo.textureScale.heightMm)}`:'tamaño físico sin cargar (opcional)'}</p>}
       {info.photoMissing&&<p role="alert">No se verificaron todos los archivos privados de este material. Restaurá sus archivos antes de cargarlo o pintar.</p>}
       <div className="material-texture-actions">
        {['sheet','edge'].includes(base.kind)&&<button type="button" disabled={disabled||dirty} onClick={props.onReplacePhoto}>{readyForDesign(base)?'Reemplazar foto / textura':'Asignar foto / textura'}</button>}
        {readyForDesign(base)&&<button type="button" disabled={disabled||dirty||info.photoMissing} onClick={props.onAdjustTexture}>Ajustar escala y giro</button>}
       </div>
       {dirty&&<p className="material-field-hint">Aplicá o cancelá los cambios de la ficha para cambiar su textura o pintar.</p>}
      </div>
      <section className="material-model-section" aria-labelledby="material-model-title">
       <h3 id="material-model-title"><Icon name="model"/>En este modelo</h3>
       <p><span>{info.bound.length?`${info.bound.length} ${info.bound.length===1?'material vinculado':'materiales vinculados'}`:'No cargado en este modelo'}</span>{info.bound.length>0&&<span className="material-field-hint"> · el vínculo se resuelve solo</span>}</p>
       {info.issues.map(issue=><p key={issue} className="material-card-warning">{issue}</p>)}
       <div className="material-texture-actions">
        {info.canInstall&&!info.installed&&<button type="button" disabled={disabled} aria-describedby="material-install-help" onClick={props.onInstall}>Cargar SKM en este modelo</button>}
        <button type="button" disabled={disabled||dirty||archived||!props.canPaint} onClick={()=>props.onPaint(true)}>Pintar en el modelo</button>
        <button type="button" disabled={disabled||dirty||!props.canPaint} onClick={()=>props.onPaint(false)}>Abrir paleta de pintura</button>
        <button type="button" disabled={disabled||dirty||!info.bound.length||!['sheet','edge'].includes(base.kind)} title={info.bound.length?undefined:'Cargá el material en este modelo para sincronizarlo'} onClick={props.onSync}>Sincronizar con OpenCutList</button>
       </div>
       {info.canInstall&&!info.installed&&<small id="material-install-help">No pinta piezas ni modifica el archivo original; Ctrl+Z en SketchUp lo deshace.</small>}
       {props.oclResult&&<div ref={oclPanel} tabIndex={-1} className="material-ocl-plan" role="group" aria-label="Cambios en OpenCutList">{props.oclResult.materials.map(row=><div key={row.materialId}><strong>{row.name}</strong>{row.status==='conflict'&&<p role="alert">El material ya tiene otro tipo en OpenCutList. No se cambió nada; revisalo en OpenCutList.</p>}{row.changes.length>0&&<ul aria-label={`Cambios en ${row.name}`}>{row.changes.map(change=><li key={change.key}><code>{change.key}</code>: {oclValue(change.from)} → {change.action==='remove'?'se quitó':oclValue(change.to)}</li>)}</ul>}{row.kept.length>0&&<ul aria-label={`Valores del usuario conservados en ${row.name}`}>{row.kept.map(entry=><li key={entry.key}><code>{entry.key}</code>: se conservó {oclValue(entry.current)} (la ficha diría {oclValue(entry.proposed)})</li>)}</ul>}</div>)}<p>Solo se escriben claves vacías o que Planos Santo escribió antes; Ctrl+Z en SketchUp deshace la sincronización.</p><button type="button" disabled={disabled} onClick={props.onCloseOcl}>Cerrar</button></div>}
      </section>
     </>}
    </div>
   </div>
   {(busy||error)&&<div className="material-properties-messages">{busy&&<p role="status"><span className="material-progress" aria-hidden="true"/>{busy}</p>}{error&&<p role="alert" className="material-field-error">{error}</p>}</div>}
   <footer className="material-properties-footer">
    {!creating&&base&&(copy===undefined?<div className="material-footer-tools">
     <button type="button" className="material-danger" disabled={disabled||dirty} aria-label={archived?'Restaurar ficha':'Archivar ficha'} title={archived?'Restaurar ficha':'Archivar ficha: la oculta sin borrar nada'} onClick={()=>props.onArchive(!archived)}><Icon name={archived?'restore':'trash'}/></button>
     <button type="button" disabled={disabled||dirty} onClick={()=>setCopy(copyName(base.name,items.map(row=>row.name)))}><Icon name="copy"/>Duplicar…</button>
     <button type="button" disabled={disabled||dirty} onClick={props.onExport}><Icon name="export"/>Exportar (.zip)…</button>
    </div>:<form className="material-inline-form" aria-label="Duplicar ficha" onSubmit={event=>{event.preventDefault();if(copy.trim())props.onDuplicate(copy.trim());}}>
     <label>Nombre de la copia<input ref={copyInput} value={copy} maxLength={160} required disabled={disabled} aria-invalid={!copy.trim()} aria-describedby="material-duplicate-help" onChange={event=>setCopy(event.target.value)}/></label>
     <p id="material-duplicate-help">La copia conserva la textura y los datos comerciales.</p>
     <button className="primary" type="submit" disabled={disabled||!copy.trim()}>Crear copia</button><button type="button" disabled={disabled} onClick={()=>setCopy(undefined)}>Cancelar copia</button>
    </form>)}
    <div className="material-footer-main"><button type="button" disabled={disabled} onClick={props.onCancel}>Cancelar</button><button type="button" className="primary" disabled={disabled||copy!==undefined||(!creating&&!dirty)} onClick={submit}>{creating?'Crear ficha':'Aplicar'}</button></div>
   </footer>
  </section>
 </div>;
}

export default function MaterialLibraryPanel({onEdit,onPaint,onManageModel,onClose,onChanged,onDirtyChange,onApplied,refreshKey}:Props){
 const [library,setLibrary]=useState<VisualLibrary>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [scope,setScope]=useState<'workshop'|'model'>('workshop'),[filter,setFilter]=useState<Filter>('all'),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[selectedId,setSelectedId]=useState('');
 const [menu,setMenu]=useState<Menu>(''),[preview,setPreview]=useState<SkmPreview>(),[selectedRows,setSelectedRows]=useState<string[]>([]),[renames,setRenames]=useState<Record<string,string>>({});
 const [kinds,setKinds]=useState<Record<string,string>>({}),[applySuggestions,setApplySuggestions]=useState(false);
 const [photoOpen,setPhotoOpen]=useState(false),[photoTarget,setPhotoTarget]=useState<PhotoMaterialTarget>();
 const [archivedIds,setArchivedIds]=useState<string[]>([]),[statesRevision,setStatesRevision]=useState<number>(),[oclResult,setOclResult]=useState<OclPlan>(),[textureId,setTextureId]=useState('');
 const [packagePreview,setPackagePreview]=useState<PackagePreview>(),[packageRows,setPackageRows]=useState<string[]>([]),[packageRenames,setPackageRenames]=useState<Record<string,string>>({}),[gridFocus,setGridFocus]=useState('');
 const [ficha,setFicha]=useState<Ficha>(),[fichaDirty,setFichaDirty]=useState(false),[fichaKey,setFichaKey]=useState(0);
 const paintAfterClose=useRef<string|undefined>(undefined),onPaintRef=useRef(onPaint);onPaintRef.current=onPaint;
 const lastRefresh=useRef(refreshKey),pendingFocus=useRef<'import'|'search'|'package'|'create'|{card:string}|null>(null),returnToFicha=useRef<string|undefined>(undefined);
 const importTrigger=useRef<HTMLButtonElement>(null),createTrigger=useRef<HTMLButtonElement>(null),packagePanel=useRef<HTMLElement>(null),grid=useRef<HTMLDivElement>(null),previewPanel=useRef<HTMLElement>(null),searchInput=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{
  const next=await request<VisualLibrary>('skm_library');let archived:string[]=[],states:number|undefined;
  // Extras live outside the catalog schema; an older backend simply has none.
  try{const extras=await request<{archivedIds?:unknown;statesRevision?:unknown}>('material_extras');if(Array.isArray(extras?.archivedIds))archived=extras.archivedIds.filter((id):id is string=>typeof id==='string');if(Number.isInteger(extras?.statesRevision))states=extras.statesRevision as number;}catch{archived=[];}
  setLibrary(next);setArchivedIds(archived);setStatesRevision(states);
  return next;
 },[]);
 const archived=useMemo(()=>new Set(archivedIds),[archivedIds]);
 const modal=!!preview||!!packagePreview||!!textureId;
 const run=useCallback(async(label:string,operation:()=>Promise<void>,preserveNotice=false)=>{setBusy(label);setError('');if(!preserveNotice)setNotice('');try{await operation();}catch(value){setError(value instanceof Error?value.message:String(value));}finally{setBusy('');}},[]);
 useEffect(()=>{void run('Cargando biblioteca del taller…',async()=>{const next=await load();const linked=next.autoLink?.changed||0;if(linked)setNotice(`${linked} ${linked===1?'material del modelo se vinculó solo':'materiales del modelo se vincularon solos'} con su ficha. Ctrl+Z en SketchUp lo deshace.`);});},[run,load]);
 useEffect(()=>{onDirtyChange?.(modal||!!busy||photoOpen||(!!ficha&&fichaDirty));return()=>{onDirtyChange?.(false);};},[modal,busy,photoOpen,ficha,fichaDirty,onDirtyChange]);
 useEffect(()=>{if(lastRefresh.current===refreshKey||modal||busy||photoOpen||(ficha&&fichaDirty))return;lastRefresh.current=refreshKey;void run('Actualizando fichas…',async()=>{await load();},true);},[refreshKey,modal,busy,photoOpen,ficha,fichaDirty,run,load]);
 useEffect(()=>{if(preview)previewPanel.current?.focus();},[preview]);
 useEffect(()=>{if(packagePreview)packagePanel.current?.focus();},[packagePreview]);
 useEffect(()=>{
  if(busy||modal||photoOpen||ficha||!pendingFocus.current)return;
  const target=pendingFocus.current;pendingFocus.current=null;
  if(typeof target==='object'){requestAnimationFrame(()=>grid.current?.querySelector<HTMLElement>(`.material-card-select[data-catalog-id="${target.card}"]`)?.focus());return;}
  ({import:importTrigger,package:importTrigger,create:createTrigger,search:searchInput}[target].current)?.focus();
 },[busy,modal,photoOpen,ficha]);
 useEffect(()=>{if(photoOpen||busy||modal||ficha||!paintAfterClose.current)return;let secondFrame=0;const frame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{const id=paintAfterClose.current;paintAfterClose.current=undefined;if(id)onPaintRef.current?.(id,true);});});return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(secondFrame);};},[photoOpen,busy,modal,ficha]);
 // Closing a photo or texture panel opened from a ficha returns to that ficha.
 useEffect(()=>{if(photoOpen||textureId||busy||!returnToFicha.current)return;const id=returnToFicha.current;returnToFicha.current=undefined;if(library?.catalog.items.some(item=>item.id===id)){setFicha({mode:'edit',id,tab:'texture'});setFichaKey(key=>key+1);}},[photoOpen,textureId,busy,library]);
 useEffect(()=>{if(!menu)return;function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();const trigger=menu==='create'?createTrigger:menu==='import'?importTrigger:null;setMenu('');trigger?.current?.focus();}}document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[menu]);
 async function photoCreated(result:PhotoMaterialResult,{paint}:{paint:boolean}){if(result.scan)onApplied?.(result.scan,result.refreshWarning);else if(result.refreshWarning)onApplied?.(undefined,result.refreshWarning);try{await load();}catch(value){setError(`El material se guardó, pero no se pudo actualizar la biblioteca: ${value instanceof Error?value.message:String(value)}`);}setSelectedId(result.catalogId);setPhotoOpen(false);setPhotoTarget(undefined);onChanged?.();setNotice('Material guardado para diseño. Sus datos para pedidos no cambiaron.');if(paint){returnToFicha.current=undefined;paintAfterClose.current=result.catalogId;}else if(!returnToFicha.current)pendingFocus.current={card:result.catalogId};}
 function openPhoto(target?:PhotoMaterialTarget){setPhotoTarget(target);setPhotoOpen(true);setMenu('');}
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
 // 0.8.20: los anchos estándar del canto llegan aparte (standardWidthsMm); un backend viejo no los manda.
 const defaults=useMemo<StandardThicknesses>(()=>({...(library?.standardThicknessesMm||DEFAULT_THICKNESSES),edgeWidths:library?.standardWidthsMm?.edge||DEFAULT_WIDTHS}),[library?.standardThicknessesMm,library?.standardWidthsMm]);
 const nativeMaterials=useMemo(()=>library?.materials||[],[library?.materials]);
 const catalogIds=useMemo(()=>new Set(library?.catalog.items.map(item=>item.id)||[]),[library]);
 const modelCatalogIds=useMemo(()=>new Set(nativeMaterials.flatMap(material=>material.binding?.catalogId?[material.binding.catalogId]:[])),[nativeMaterials]);
 const scoped=useMemo(()=>library?.catalog.items.filter(item=>scope!=='model'||modelCatalogIds.has(item.id))||[],[library,scope,modelCatalogIds]);
 const filtered=useMemo(()=>filterItems(scoped,{filter,query,archived,favorites}),[scoped,filter,query,archived,favorites]);
 const groups=useMemo(()=>groupItems(filtered),[filtered]);
 const ordered=useMemo(()=>groups.flatMap(group=>group.items),[groups]);
 const counts=useMemo(()=>filterCounts(scoped,archived),[scoped,archived]);
 // Materials of the model without a ficha in this library (unbound, or bound to a ficha of another library).
 const nativeOnly=scope==='model'&&['all','other','review'].includes(filter)&&!favorites?nativeMaterials.filter(material=>!(material.binding?.catalogId&&catalogIds.has(material.binding.catalogId))&&searchText(material.name).includes(searchText(query.trim()))):[];
 const ambiguous=library?.ambiguous||[];
 const items=(library?.catalog.items||[]) as FichaItem[];
 function infoFor(item:CatalogItem):ModelInfo{
  const bound=nativeMaterials.filter(material=>material.binding?.catalogId===item.id);
  const asset=library?.rows.find(row=>row.catalogId===item.id&&(row.sha256||row.assetHash)),photo=library?.visuals?.find(row=>row.catalogId===item.id);
  const designReady=['sheet','edge'].includes(item.kind)&&photo?.available===true&&photo.designReady===true,photoMissing=readyForDesign(item)&&!designReady;
  return {bound,installed:bound.some(material=>!material.issues?.length),canInstall:designReady||!!(asset&&!photoMissing),designReady,photoMissing,photoAvailable:photo?.available===true,
   thumbnail:library?.rows.find(row=>row.catalogId===item.id)?.thumbnail,photo:item.observed?.photo as PhotoMeta|undefined,issues:[...new Set(bound.flatMap(material=>material.issues||[]))]};
 }
 const fichaItem=ficha?.mode==='edit'?items.find(item=>item.id===ficha.id):undefined;
 const activeCard=ordered.some(item=>item.id===gridFocus)?gridFocus:ordered.some(item=>item.id===selectedId)?selectedId:ordered[0]?.id;
 function gridKey(event:React.KeyboardEvent<HTMLDivElement>){
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...(grid.current?.querySelectorAll<HTMLButtonElement>('.material-card-select')||[])],index=buttons.findIndex(button=>button===document.activeElement);
  if(index<0)return;
  const current=buttons[index],rect=current.getBoundingClientRect();
  let next=index;
  if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;
  else if(event.key==='ArrowRight')next=Math.min(buttons.length-1,index+1);else if(event.key==='ArrowLeft')next=Math.max(0,index-1);
  else{
   // Up/down: the nearest card of the next visual row (groups break the grid into rows of different lengths).
   const down=event.key==='ArrowDown',candidates=buttons.map((button,position)=>({position,box:button.getBoundingClientRect()})).filter(({box})=>down?box.top>rect.top+4:box.top<rect.top-4);
   if(candidates.length){const rowTop=down?Math.min(...candidates.map(({box})=>box.top)):Math.max(...candidates.map(({box})=>box.top));next=candidates.filter(({box})=>Math.abs(box.top-rowTop)<4).sort((a,b)=>Math.abs(a.box.left-rect.left)-Math.abs(b.box.left-rect.left))[0].position;}
  }
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
 function openFicha(id:string,tab:'general'|'texture'='general'){setSelectedId(id);setGridFocus(id);setOclResult(undefined);setFicha({mode:'edit',id,tab});setFichaKey(key=>key+1);setMenu('');}
 function closeFicha(focusId?:string){const id=focusId||(ficha?.mode==='edit'?ficha.id:undefined);setFicha(undefined);setFichaDirty(false);setOclResult(undefined);pendingFocus.current=id?{card:id}:'create';}
 async function exportPackage(ids?:string[]){
  const result=await request<{cancelled:true}|{fileName:string;items:number;files:number;bytes:number}>('material_package_export',ids?{catalogIds:ids,includeArchived:true}:{includeArchived:false});
  if('cancelled' in result){setNotice('Exportación cancelada. No se creó ningún archivo.');return;}
  setNotice(`Paquete «${result.fileName}» exportado: ${result.items} ${result.items===1?'ficha':'fichas'} y ${result.files} ${result.files===1?'archivo verificado':'archivos verificados'}.${ids?'':' Las fichas archivadas no se incluyen.'}`);
 }
 async function openPackage(){
  setMenu('');
  const result=await request<PackagePreview|{cancelled:true}>('material_package_preview');
  if('cancelled' in result){setNotice('Selección cancelada. La biblioteca no cambió.');return;}
  setPackagePreview(result);setPackageRows(result.rows.filter(row=>row.status==='new').map(row=>row.id));setPackageRenames({});
 }
 async function cancelPackage(){await request('material_package_cancel');pendingFocus.current='package';setPackagePreview(undefined);setPackageRows([]);setPackageRenames({});setNotice('Importación de paquete cancelada. La biblioteca no cambió.');}
 async function commitPackage(){
  if(!packagePreview)return;
  const result=await request<{imported:number;skipped:number}>('material_package_commit',{token:packagePreview.token,revision:packagePreview.revision,selectedIds:packageRows,renames:Object.fromEntries(Object.entries(packageRenames).filter(([id,name])=>packageRows.includes(id)&&name.trim()).map(([id,name])=>[id,name.trim()])),confirmed:true});
  pendingFocus.current='package';setPackagePreview(undefined);setPackageRows([]);setPackageRenames({});await load();onChanged?.();
  setNotice(`${result.imported} ${result.imported===1?'ficha importada':'fichas importadas'} del paquete. ${result.skipped} omitidas.`);
 }
 async function duplicate(item:CatalogItem,name:string){
  if(!library)return;
  const result=await request<{catalogId:string;name:string;warnings?:string[]}>('material_duplicate',{catalogId:item.id,revision:library.catalog.revision,name,confirmed:true});
  await load();onChanged?.();setSelectedId(result.catalogId);setGridFocus(result.catalogId);
  setFicha({mode:'edit',id:result.catalogId});setFichaKey(key=>key+1);setFichaDirty(false);
  setNotice([`Copia creada: «${result.name}». Conserva la textura y los datos comerciales.`,...(result.warnings||[])].join(' '));
 }
 // Punto 27: archivar no borra nada y se deshace con «Restaurar ficha»: un clic, sin paso de confirmación.
 async function archive(item:CatalogItem,value:boolean){
  if(!library)return;
  const id=item.id,name=item.name;
  const result=await request<{archivedIds?:string[];rows?:ArchiveRow[]}>('material_archive',{catalogIds:[id],archived:value,revision:library.catalog.revision,statesRevision,confirmed:true});
  if(Array.isArray(result.archivedIds))setArchivedIds(result.archivedIds);await load();onChanged?.();
  if(!value&&filter==='archived')setFilter('all');
  closeFicha(value?undefined:id);if(value)pendingFocus.current='search';
  const row=result.rows?.find(entry=>entry.catalogId===id),inModel=row?.inModel?` Sigue vinculada a ${row.inModel} ${row.inModel===1?'material':'materiales'} de este modelo, que se ven y pintan igual.`:'';
  setNotice(value?`«${name}» archivada: no se borró la ficha ni sus archivos; la encontrás en Archivados y se restaura con un clic.${inModel}`:`«${name}» restaurada en la biblioteca activa.`);
 }
 // Punto 27: sincronizar aplica en un clic. Solo escribe claves vacías o que escribió Planos Santo, en una operación que Ctrl+Z deshace.
 async function syncOcl(item:CatalogItem){
  const id=item.id,name=item.name;
  const result={...await request<OclPlan>('material_ocl_sync',{catalogId:id,dryRun:false}),catalogId:id};
  if(result.changed){await load();onChanged?.();}
  const kept=result.materials.reduce((sum,row)=>sum+row.kept.length,0),conflict=result.materials.some(row=>row.status==='conflict');
  setNotice(result.changed?`OpenCutList sincronizado: ${result.changed} ${result.changed===1?'cambio':'cambios'} en una sola operación (Ctrl+Z la deshace).${kept?` Se conservaron ${kept} ${kept===1?'valor cargado':'valores cargados'} por el usuario.`:''}`:`OpenCutList ya estaba sincronizado para «${name}».${kept?' Se conservan valores que cargó el usuario.':''}`);
  if(result.changed||kept||conflict)setOclResult(result);
 }
 async function textureApplied(result:TextureApplyResult){
  setTextureId('');if(result.scan)onApplied?.(result.scan);
  if(result.noChanges){setNotice('La textura ya tenía esa escala y ese giro. No se cambió nada.');return;}
  await load();onChanged?.();
  setNotice(`Textura ajustada y verificada en ${result.verification?.checked??result.applied?.length??0} ${(result.verification?.checked??result.applied?.length??0)===1?'material':'materiales'} del modelo. ${result.warnings?.join(' ')||''}`.trim());
 }
 async function openPreview(source:'zip'|'folder'){
  setMenu('');
  const result=await request<PreviewResult>('skm_preview',{source});
  if('cancelled' in result){setNotice('Selección cancelada. La biblioteca no cambió.');return;}
  setPreview(result);setSelectedRows(result.rows.filter(row=>row.status==='new').map(row=>row.id));setRenames({});setKinds(initialKinds(result.rows));setApplySuggestions(false);
 }
 async function favorite(item:CatalogItem){
  if(!library)return;
  await request('catalog_save',{revision:library.catalog.revision,items:library.catalog.items.map(row=>row.id===item.id?{...row,favorite:!row.favorite}:row)});
  await load();onChanged?.();
 }
 async function applyFicha(updated:FichaItem,color?:[number,number,number]){
  if(!library)return;
  const saved=await request<{catalog:Catalog}>('catalog_save',{revision:library.catalog.revision,items:library.catalog.items.map(row=>row.id===updated.id?{...updated,updatedAt:new Date().toISOString()}:row)});
  let colorNote='';
  if(color){try{await request('smart_assign_color',{catalogId:updated.id,rgb:color,confirmed:true});colorNote=' Su color quedó cargado en este modelo y en la biblioteca.';}catch(value){colorNote=` No se pudo cargar el color: ${value instanceof Error?value.message:String(value)}`;}}
  await load();onChanged?.();
  const stored=(saved.catalog.items.find(row=>row.id===updated.id)||updated) as CatalogItem,missing=catalogMissing(stored);
  closeFicha(updated.id);
  setNotice(`Ficha «${stored.name}» guardada.${missing.length?` Para pedidos falta: ${missing.join(', ')}.`:' Ficha completa.'}${colorNote}`);
 }
 async function createFicha(draft:FichaDraft){
  if(!library)return;
  const added=await request<{catalog:Catalog}>('catalog_add',{revision:library.catalog.revision,item:{name:draft.name.trim(),kind:draft.kind}});
  const item=added.catalog.items.find(row=>!library.catalog.items.some(old=>old.id===row.id)) as FichaItem|undefined;
  if(!item)throw new Error('La ficha se creó, pero no se encontró en la biblioteca. Volvé a cargarla.');
  const result=applyDraft(item,draft);
  if(result.item)await request('catalog_save',{revision:added.catalog.revision,items:added.catalog.items.map(row=>row.id===item.id?result.item:row)});
  await load();onChanged?.();setSelectedId(item.id);
  closeFicha(item.id);
  const missing=result.item?catalogMissing(result.item):[];
  setNotice(`Ficha «${item.name}» creada.${missing.length?` Para pedidos falta: ${missing.join(', ')}.`:''}`);
 }
 async function install(item:CatalogItem,info:ModelInfo){
  if(!library||!info.canInstall)return;
  const result=await request<{scan?:unknown;refreshWarning?:string}>(readyForDesign(item)&&info.designReady?'material_photo_install':'skm_install',{catalogId:item.id,revision:library.catalog.revision,assetRevision:library.assetRevision,confirmed:true,replaceVisual:false});
  if(result.scan)onApplied?.(result.scan,result.refreshWarning);else if(result.refreshWarning)onApplied?.(undefined,result.refreshWarning);
  await load();onChanged?.();setNotice('SKM cargado en el modelo. No se pintó ninguna cara; revisá el material en la paleta antes de aplicarlo.');
 }
 async function resolve(entry:LinkAmbiguity,catalogId:string){
  if(!library)return;
  const result=await request<{scan?:unknown;stale?:boolean}>('material_link_resolve',{materialId:entry.materialId,catalogId,revision:library.catalog.revision});
  if(result.scan)onApplied?.(result.scan);
  await load();onChanged?.();
  const chosen=entry.candidates.find(candidate=>candidate.catalogId===catalogId);
  setNotice(`«${entry.name}» del modelo quedó vinculado a «${chosen?.name||'la ficha elegida'}». Ctrl+Z en SketchUp lo deshace.`);
 }
 async function commit(){
  if(!preview)return;
  const result=await request<ImportResult>('skm_commit_typed',{token:preview.token,revision:preview.revision,selectedIds:selectedRows,renames,confirmed:true,kinds:typedKinds(selectedRows,kinds),applySuggestions});
  pendingFocus.current='search';setPreview(undefined);setSelectedRows([]);setRenames({});await load();onChanged?.();
  setNotice(`${result.imported} materiales importados. ${result.skipped??result.duplicates??0} duplicados u omitidos. Completá las fichas a las que les falten datos para usarlas en pedidos.`);
 }
 const blocked=!!busy||!!preview||!!packagePreview;
 const fichaInfo=fichaItem?infoFor(fichaItem):undefined;
 const card=(item:FichaItem)=>{
  const info=infoFor(item),inModel=modelCatalogIds.has(item.id),complete=catalogComplete(item),isArchived=archived.has(item.id);
  const visual=safeImage(info.thumbnail)?undefined:nativeColor(info.bound.find(material=>material.color)?.color);
  const status=info.photoMissing?'revisar archivos':complete?'ficha completa':'ficha incompleta';
  return <article className={`material-tile ${selectedId===item.id?'selected':''} ${isArchived?'archived':''}`} key={item.id} aria-label={`Material ${item.name}`}>
   <button type="button" className="material-card-select" data-catalog-id={item.id} tabIndex={activeCard===item.id?0:-1} onFocus={()=>setGridFocus(item.id)} disabled={blocked} aria-label={`${item.name}: ${summary(item)}, ${status}${inModel?', en este modelo':''}. Abrir propiedades`} onClick={()=>openFicha(item.id)}>
    <span className={`material-tile-visual kind-${kindIcon(item.kind)}${visual?' has-color':''}`} style={visual?{backgroundColor:visual}:undefined}>{safeImage(info.thumbnail)&&<Thumbnail uri={info.thumbnail} name={item.name}/>}</span>
    <span className={`material-tile-kind kind-${kindIcon(item.kind)}`} title={kindName(item.kind)}><Icon name={kindIcon(item.kind)}/></span>
    <span className="material-tile-name">{item.name}</span>
   </button>
   <div className="material-tile-footer">
    <span className="material-tile-meta">{summary(item)}{!complete&&<span className="material-tile-flag incomplete" title={`Para pedidos falta: ${catalogMissing(item).join(', ')}`}> · Incompleta</span>}{inModel&&<span className="material-tile-flag model"> · En el modelo</span>}{isArchived&&<span className="material-tile-flag"> · Archivada</span>}</span>
    <span className="material-tile-actions">
     {(info.issues.length>0||info.photoMissing)&&<span className="material-tile-issue" role="img" aria-label={info.photoMissing?'Faltan archivos de la foto':info.issues.join(' ')} title={info.photoMissing?'Faltan archivos de la foto':info.issues.join(' ')}><Icon name="warning"/></span>}
     <button type="button" className="material-star material-icon-button" disabled={blocked} aria-label={`${item.favorite?'Quitar favorito':'Marcar favorito'} ${item.name}`} aria-pressed={item.favorite} title={item.favorite?'Quitar de favoritos':'Añadir a favoritos'} onClick={()=>void run('Guardando favorito…',()=>favorite(item))}><Icon name="star" className={item.favorite?'filled':''}/></button>
     <button type="button" className="material-icon-button" disabled={blocked} aria-label={`Editar ficha ${item.name}`} title="Editar ficha" onClick={()=>openFicha(item.id)}><Icon name="pencil"/></button>
    </span>
   </div>
  </article>;
 };
 return <section className="visual-material-library" aria-labelledby="materials-library-title" aria-busy={!!busy}>
  <header className="material-library-heading">
   <div><h1 id="materials-library-title">Materiales del taller</h1><p>Placas y cantos disponibles en todos tus proyectos. Se vinculan solos con los materiales del modelo.</p></div>
   <div className="material-library-main-actions">
    <button type="button" className="material-refresh" disabled={blocked} onClick={()=>void run('Actualizando biblioteca…',async()=>{const next=await load();const linked=next.autoLink?.changed||0;setNotice(linked?`Biblioteca actualizada. ${linked} ${linked===1?'material se vinculó solo':'materiales se vincularon solos'} con su ficha.`:'Biblioteca actualizada.');})}><Icon name="refresh"/>Actualizar</button>
    <div className="material-menu"><button ref={createTrigger} type="button" disabled={blocked} aria-expanded={menu==='create'} aria-haspopup="true" onClick={()=>setMenu(value=>value==='create'?'':'create')}><Icon name="plus"/>Crear</button>
     {menu==='create'&&<div className="material-menu-list" role="group" aria-label="Crear material"><button type="button" onClick={()=>{setMenu('');setFicha({mode:'create',kind:'sheet'});setFichaKey(key=>key+1);}}>Ficha nueva…</button><button type="button" onClick={()=>openPhoto()}>Material desde una foto…</button></div>}</div>
    <div className="material-menu"><button ref={importTrigger} type="button" disabled={blocked} aria-expanded={menu==='import'} aria-haspopup="true" onClick={()=>setMenu(value=>value==='import'?'':'import')}><Icon name="import"/>Importar</button>
     {menu==='import'&&<div className="material-menu-list" role="group" aria-label="Importar materiales"><button type="button" onClick={()=>void run('Analizando ZIP de materiales…',()=>openPreview('zip'))}>SKM: ZIP o archivo .skm…</button><button type="button" onClick={()=>void run('Analizando carpeta de materiales…',()=>openPreview('folder'))}>SKM: carpeta…</button><button type="button" onClick={()=>void run('Analizando paquete de materiales…',openPackage)}>Paquete de biblioteca (.zip)…</button></div>}</div>
    <div className="material-menu"><button type="button" className="material-icon-button" disabled={blocked} aria-label="Más acciones" aria-expanded={menu==='more'} aria-haspopup="true" onClick={()=>setMenu(value=>value==='more'?'':'more')}><Icon name="more"/></button>
     {menu==='more'&&<div className="material-menu-list" role="group" aria-label="Más acciones"><button type="button" disabled={!library?.catalog.items.length} onClick={()=>{setMenu('');void run('Exportando paquete de materiales…',()=>exportPackage());}}>Exportar paquete .zip…</button>{onClose&&<button type="button" onClick={()=>{setMenu('');onClose();}}>Volver a Inicio</button>}</div>}</div>
   </div>
  </header>
  {busy&&!library&&<div className="material-library-skeleton" aria-hidden="true">{[0,1,2,3].map(index=><span key={index}/>)}</div>}{busy&&!preview&&!packagePreview&&!ficha&&<p className="material-library-status" role="status"><span className="material-progress" aria-hidden="true"/>{busy}</p>}{error&&!preview&&!packagePreview&&!ficha&&<div className="material-library-error" role="alert"><strong>No se pudo completar la acción.</strong><p>{error}</p><button type="button" disabled={blocked} onClick={()=>void run('Recargando biblioteca…',async()=>{await load();})}>Volver a cargar</button></div>}{notice&&<p className="material-library-notice" role="status">{notice}</p>}
  {ambiguous.length>0&&<section className="material-link-choices" aria-labelledby="material-link-choices-title"><h2 id="material-link-choices-title"><Icon name="warning"/>Elegí la ficha de {ambiguous.length===1?'este material':'estos materiales'} del modelo</h2>
   {ambiguous.map(entry=><div className="material-link-choice" key={entry.materialId}><p>{entry.message}</p><div role="group" aria-label={`Ficha para ${entry.name}`}>{entry.candidates.map(candidate=><button type="button" key={candidate.catalogId} disabled={blocked} onClick={()=>void run('Vinculando material…',()=>resolve(entry,candidate.catalogId))}>Es «{candidate.name}» · {[kindName(candidate.kind),formatMm(candidate.thicknessMm)].filter(Boolean).join(' ')}</button>)}</div></div>)}
  </section>}
  <div className="material-library-toolbar">
   <div className="material-library-search-field"><label className="material-library-search"><span className="sr-only">Buscar material</span><Icon name="search"/><input ref={searchInput} type="search" aria-label="Buscar materiales del taller" aria-describedby="material-search-help" placeholder="Buscar por nombre, SKU, proveedor o espesor" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&query){event.preventDefault();event.stopPropagation();setQuery('');}}}/></label>{query&&<button type="button" className="material-search-clear material-icon-button" aria-label="Limpiar búsqueda" onClick={()=>{setQuery('');searchInput.current?.focus();}}><Icon name="close"/></button>}<span id="material-search-help" className="sr-only">Escape limpia la búsqueda. Usá las flechas para recorrer las tarjetas.</span></div>
   <div className="material-library-scopes" role="group" aria-label="Origen de materiales"><button type="button" aria-pressed={scope==='workshop'} onClick={()=>setScope('workshop')}>Todo el taller</button><button type="button" aria-pressed={scope==='model'} onClick={()=>setScope('model')}>En este modelo</button></div>
   <label className="material-favorites-filter"><input type="checkbox" checked={favorites} onChange={event=>setFavorites(event.target.checked)}/> Solo favoritos</label>
  </div>
  <nav className="material-library-filters" aria-label="Filtrar biblioteca">{filterLabels.map(([value,label])=><button type="button" key={value} aria-describedby={library?`material-filter-count-${value}`:undefined} aria-pressed={filter===value} title={`${label}: ${counts[value]}`} onClick={()=>setFilter(value)}>{label}{library&&<span aria-hidden="true">{counts[value]}</span>}</button>)}{library&&filterLabels.map(([value])=><span key={value} id={`material-filter-count-${value}`} className="sr-only">{counts[value]} {counts[value]===1?'material':'materiales'}</span>)}<span className="material-library-count" role="status">{filtered.length+nativeOnly.length} materiales</span></nav>
  {filter==='archived'&&<p className="material-library-context">Fichas archivadas: no aparecen en la biblioteca activa ni en los paquetes exportados. Sus archivos y vínculos se conservan.</p>}{scope==='model'&&<p className="material-library-context">Materiales ya cargados en el modelo abierto. Importar a la biblioteca del taller no los carga ni los pinta aquí.</p>}
  <div ref={grid} className="material-library-grid" role="group" aria-label="Materiales visuales del taller" onKeyDown={gridKey}>
   {groups.map(group=><section key={group.key} className="material-group" aria-labelledby={`material-group-${group.key}`}>
    <h2 id={`material-group-${group.key}`} className="material-group-title"><span className={`material-group-icon kind-${groupIcon[group.key]}`}><Icon name={groupIcon[group.key]}/></span>{group.label}<span className="material-group-count">{group.items.length}</span></h2>
    <div className="material-tiles">{group.items.map(item=>card(item as FichaItem))}</div>
   </section>)}
   {nativeOnly.length>0&&<section className="material-group" aria-labelledby="material-group-native"><h2 id="material-group-native" className="material-group-title"><span className="material-group-icon kind-model"><Icon name="model"/></span>En el modelo, sin ficha<span className="material-group-count">{nativeOnly.length}</span></h2>
    <div className="material-tiles">{nativeOnly.map(material=>{const pending=ambiguous.find(entry=>entry.materialId===material.id);return <article className="material-tile native-only" key={`native-${material.id}`} aria-label={`Material del modelo ${material.name}`}>
     <div className="material-tile-visual" style={nativeColor(material.color)?{backgroundColor:nativeColor(material.color)}:undefined}><span className="material-tile-name">{material.name}</span></div>
     <div className="material-tile-footer column"><span className="material-tile-meta">{material.hasTexture?'Color base · textura en el modelo':'Color nativo'}</span>
      {pending?<p className="material-card-warning">{pending.message}</p>:<p className="material-tile-note">Sin ficha con este nombre en la biblioteca.</p>}
      {onManageModel&&!pending&&<button type="button" disabled={blocked} onClick={onManageModel}>Asociar a una ficha…</button>}</div>
    </article>;})}</div>
   </section>}
  </div>
  {library&&!busy&&!filtered.length&&!nativeOnly.length&&<div className="material-library-empty" role="status"><strong>{!library.catalog.items.length?'Tu biblioteca empieza acá':query.trim()&&filter!=='archived'?`Ningún material coincide con «${query.trim()}»`:emptyCopy[filter][0]}</strong><p>{library.catalog.items.length?query.trim()&&filter!=='archived'?'Probá otro nombre, SKU o espesor, o quitá los filtros.':emptyCopy[filter][1]:'Creá una ficha, importá materiales SKM o un paquete .zip de otra biblioteca.'}</p><button type="button" onClick={()=>{setQuery('');setFilter('all');setFavorites(false);setScope('workshop');}}>Mostrar todos</button></div>}
  <p className="material-library-footnote">Biblioteca local del taller · Las miniaturas provienen del SKM o de la foto propia cuando están disponibles. No se usa el nombre del archivo para deducir propiedades.</p>
  {ficha&&(ficha.mode==='create'||fichaItem)&&<MaterialProperties key={fichaKey} ficha={ficha} item={fichaItem} items={items} defaults={defaults} info={fichaInfo} archived={!!fichaItem&&archived.has(fichaItem.id)} busy={busy} error={error} canPaint={!!fichaItem&&!!fichaInfo&&['sheet','edge'].includes(fichaItem.kind)&&(fichaInfo.installed||fichaInfo.photoAvailable)&&!!onPaint}
   onDirty={setFichaDirty} oclResult={oclResult} onCloseOcl={()=>setOclResult(undefined)}
   onCancel={()=>closeFicha()}
   onApply={(updated,color)=>void run('Guardando ficha…',()=>applyFicha(updated,color))}
   onCreate={draft=>void run('Creando ficha…',()=>createFicha(draft))}
   onArchive={value=>fichaItem&&void run(value?'Archivando ficha…':'Restaurando ficha…',()=>archive(fichaItem,value))}
   onDuplicate={name=>fichaItem&&void run('Duplicando ficha…',()=>duplicate(fichaItem,name))}
   onExport={()=>fichaItem&&void run('Exportando ficha…',()=>exportPackage([fichaItem.id]))}
   onInstall={()=>fichaItem&&fichaInfo&&void run('Cargando SKM en este modelo…',()=>install(fichaItem,fichaInfo))}
   onSync={()=>fichaItem&&void run('Sincronizando con OpenCutList…',()=>syncOcl(fichaItem))}
   onPaint={autoStart=>{if(!fichaItem)return;const id=fichaItem.id;setFicha(undefined);setFichaDirty(false);onPaint?.(id,autoStart);}}
   onReplacePhoto={()=>{if(!fichaItem)return;returnToFicha.current=fichaItem.id;setFicha(undefined);openPhoto({catalogId:fichaItem.id,name:fichaItem.name,kind:fichaItem.kind as 'sheet'|'edge',thicknessMm:fichaItem.thicknessMm,assign:!readyForDesign(fichaItem)});}}
   onAdjustTexture={()=>{if(!fichaItem)return;returnToFicha.current=fichaItem.id;setFicha(undefined);setTextureId(fichaItem.id);}}
   onWorkshop={()=>{if(!fichaItem)return;const id=fichaItem.id;setFicha(undefined);onEdit(id);}}/>}
  {textureId&&(()=>{const item=items.find(row=>row.id===textureId);if(!item)return null;const photo=item.observed?.photo as PhotoMeta|undefined;return <TextureAdjustPanel catalogId={item.id} name={item.name} thumbnail={library?.rows.find(row=>row.catalogId===item.id)?.thumbnail} widthPx={photo?.widthPx} heightPx={photo?.heightPx} current={photo?.textureScale?{widthMm:photo.textureScale.widthMm??null,heightMm:photo.textureScale.heightMm??null,verified:photo.textureScale.verified===true}:undefined} sheet={item.kind==='sheet'&&item.lengthMm&&item.widthMm?{lengthMm:item.lengthMm,widthMm:item.widthMm}:null} revision={library?.catalog.revision??0} assetRevision={library?.assetRevision??0} onClose={()=>{setTextureId('');if(!returnToFicha.current)pendingFocus.current='search';}} onApplied={result=>void run('Actualizando biblioteca…',()=>textureApplied(result),true)}/>;})()}
  {packagePreview&&<div className="material-import-backdrop"><section ref={packagePanel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="material-package-title" className="material-import-preview"><header><div><span className="material-eyebrow">PAQUETE .ZIP · ARCHIVOS VERIFICADOS</span><h2 id="material-package-title">Revisar paquete de materiales</h2><p>{packagePreview.package.items} fichas y {packagePreview.package.files} archivos con huella verificada ({new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(packagePreview.package.bytes/1024/1024)} MB). No se cargan en el modelo.</p></div><button type="button" disabled={!!busy} onClick={()=>void run('Cerrando vista previa…',cancelPackage)} aria-label="Cerrar vista previa del paquete">Cerrar</button></header><div className="material-import-summary"><span>{packagePreview.rows.filter(row=>row.status==='new').length} nuevas</span><span>{packagePreview.rows.filter(row=>row.status==='duplicate').length} ya en la biblioteca</span><span>{packagePreview.rows.filter(row=>row.status==='conflict').length} conflictos</span><button type="button" disabled={!!busy} onClick={()=>setPackageRows(packagePreview.rows.filter(row=>row.status==='new').map(row=>row.id))}>Seleccionar nuevas</button><button type="button" disabled={!!busy} onClick={()=>setPackageRows([])}>Ninguna</button></div><div className="material-import-rows">{packagePreview.rows.map(row=><article className={`material-import-row ${row.status}`} key={row.id} aria-label={`Ficha del paquete ${row.name}`}><label className="material-import-selection"><input type="checkbox" disabled={!!busy||row.status==='duplicate'} checked={packageRows.includes(row.id)} aria-label={`Importar ficha ${row.name}`} onChange={event=>setPackageRows(previous=>event.target.checked?[...previous,row.id]:previous.filter(id=>id!==row.id))}/></label><Thumbnail uri={row.thumbnail} name={row.name}/><div className="material-import-row-copy"><strong>{row.name}</strong><span className="material-import-filename">{kindName(row.kind)} · {row.files} {row.files===1?'archivo':'archivos'}</span><span className={`material-status-chip ${row.status==='duplicate'?'duplicate':'pending'}`}>{row.status==='duplicate'?'Ya está en la biblioteca':row.status==='conflict'?'Nombre en conflicto':'Nueva · pendiente'}</span>{row.warnings.map(warning=><p key={warning} className="material-card-warning">{warning}</p>)}{row.status==='conflict'&&<label className="material-conflict-name">Nombre nuevo para esta ficha<input aria-label={`Resolver nombre de ${row.name}`} maxLength={160} value={packageRenames[row.id]||''} disabled={!!busy} onChange={event=>setPackageRenames(previous=>({...previous,[row.id]:event.target.value}))}/><small>O desmarcala. No se sobrescribe la ficha existente.</small></label>}</div></article>)}</div><footer><div><strong>{packageRows.length} seleccionadas</strong><p>{packageUnresolved.length?'Resolvé los nombres en conflicto o desmarcá esas fichas.':packageRepeated?'Hay nombres repetidos en la selección.':'No se cargarán materiales ni se pintarán caras del modelo.'}</p>{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}</div><button type="button" disabled={!!busy} onClick={()=>void run('Cancelando importación…',cancelPackage)}>Cancelar paquete</button><button type="button" className="primary" disabled={!!busy||!packageRows.length||!!packageUnresolved.length||packageRepeated} onClick={()=>void run('Importando paquete y verificando archivos…',commitPackage)}>Importar {packageRows.length} {packageRows.length===1?'ficha':'fichas'}</button></footer></section></div>}
  {photoOpen&&<PhotoMaterialPanel replacement={photoTarget} onClose={()=>{setPhotoOpen(false);setPhotoTarget(undefined);if(!returnToFicha.current)pendingFocus.current='create';}} onCreated={photoCreated}/>}
  {preview&&<div className="material-import-backdrop"><section ref={previewPanel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="material-import-title" className="material-import-preview"><header><div><span className="material-eyebrow">VISTA PREVIA · SIN CAMBIAR EL MODELO</span><h2 id="material-import-title">Revisar importación de materiales</h2><p>{preview.rows.length} archivos analizados. Se importan como fichas para completar, sin cambiar el modelo.</p></div><button type="button" disabled={!!busy} onClick={()=>void run('Cerrando vista previa…',cancelPreview)} aria-label="Cerrar vista previa de importación">Cerrar</button></header><div className="material-import-summary"><span>{preview.rows.filter(row=>row.status==='new').length} nuevos</span><span>{preview.rows.filter(row=>row.status==='duplicate').length} duplicados</span><span>{preview.rows.filter(row=>row.status==='conflict').length} conflictos</span><button type="button" disabled={!!busy} onClick={()=>setSelectedRows(preview.rows.filter(row=>row.status==='new').map(row=>row.id))}>Seleccionar nuevos</button><button type="button" disabled={!!busy} onClick={()=>setSelectedRows([])}>Ninguno</button></div><SkmBatchKind selectedCount={selectedRows.length} busy={!!busy} applySuggestions={applySuggestions} onApply={kind=>setKinds(previous=>({...previous,...Object.fromEntries(selectedRows.map(id=>[id,kind]))}))} onSuggestions={setApplySuggestions}/><div className="material-import-rows">{preview.rows.map(row=><article className={`material-import-row ${row.status}`} key={row.id}><label className="material-import-selection"><input type="checkbox" disabled={!!busy||row.status==='duplicate'} checked={selectedRows.includes(row.id)} aria-label={`Importar ${row.sourceName}`} onChange={event=>setSelectedRows(previous=>event.target.checked?[...previous,row.id]:previous.filter(id=>id!==row.id))}/><span className="sr-only">Seleccionar {row.sourceName}</span></label><Thumbnail uri={row.thumbnail} name={row.name}/><div className="material-import-row-copy"><strong>{row.name}</strong><span className="material-import-filename">{row.sourceName} · {new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(row.bytes/1024)} KB</span><span className={`material-status-chip ${row.status==='duplicate'?'duplicate':'pending'}`}>{row.status==='duplicate'?'Ya está en la biblioteca':row.status==='conflict'?'Nombre en conflicto':'Nuevo · pendiente'}</span>{row.suggestions&&<p className="material-import-suggestion">Sugerencia sin verificar: {row.suggestions.kind&&row.suggestions.kind!=='unknown'?kindName(row.suggestions.kind):'Tipo pendiente'}{row.suggestions.thicknessMm?` · ${row.suggestions.thicknessMm} mm`:''}. {applySuggestions?'El espesor se precarga en la ficha; corregilo si no coincide.':'No se aplica como medida.'}</p>}{row.status!=='duplicate'&&<SkmRowKind name={row.sourceName} value={kinds[row.id]||'unknown'} busy={!!busy} onChange={kind=>setKinds(previous=>({...previous,[row.id]:kind}))}/>}{row.warnings?.map(warning=><p key={warning} className="material-card-warning">{warning}</p>)}{row.status==='conflict'&&<label className="material-conflict-name">Nombre nuevo para este candidato<input aria-label={`Resolver nombre ${row.sourceName}`} maxLength={160} value={renames[row.id]||''} disabled={!!busy} onChange={event=>setRenames(previous=>({...previous,[row.id]:event.target.value}))}/><small>O desmarcalo. No se sobrescribe la ficha existente.</small></label>}</div></article>)}</div><footer><div><strong>{selectedRows.length} seleccionados</strong><p>{unresolved.length?'Resolvé los nombres en conflicto o desmarcá esos archivos.':repeatedNames?'Hay nombres repetidos en la selección. Cambialos o quitá los duplicados.':'No se cargarán materiales ni se pintarán caras del modelo.'}</p>{busy&&<p role="status">{busy}</p>}{error&&<p role="alert">{error}</p>}</div><button type="button" disabled={!!busy} onClick={()=>void run('Cancelando importación…',cancelPreview)}>Cancelar importación</button><button type="button" className="primary" disabled={!!busy||!selectedRows.length||!!unresolved.length||repeatedNames} onClick={()=>void run('Importando candidatos y guardando biblioteca…',commit)}>Importar {selectedRows.length} {selectedRows.length===1?'material':'materiales'}</button></footer></section></div>}
 </section>;
}
