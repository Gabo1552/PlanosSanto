import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from './bridge';
import type {Catalog} from './WorkshopPanel';
import './photo-material.css';
import {lockedHeight,normalizeRotation,rotateDimensions,textureRepeats,type Rotation} from './materialLibraryModel';

export type PhotoMaterialPick={token:string;revision:number;sourceHash:string;name:string;widthPx:number;heightPx:number;preview:string;duplicates:{catalogId:string;name:string}[];warnings?:string[];scaleVerified:false};
export type PhotoMaterialResult={catalogId:string;materialUuid:string;catalog?:Catalog;binding?:unknown;thumbnail?:string;created?:boolean;reused?:boolean;designReady:boolean;scan?:unknown;library?:unknown;refreshWarning?:string};
// assign: the item has no visual yet ("Asignar foto"), so there is nothing to confirm replacing.
export type PhotoMaterialTarget={catalogId:string;name:string;kind:'sheet'|'edge';thicknessMm:number|null;assign?:boolean};
type Props={onClose:()=>void;onCreated:(result:PhotoMaterialResult,options:{paint:boolean})=>void|Promise<void>;onDirtyChange?:(dirty:boolean)=>void;replacement?:PhotoMaterialTarget;initialKind?:'sheet'|'edge'};
type DuplicateAction='new'|'existing'|'variant'|'replace';
const imageUri=(value:string)=>value.length<=18*1024*1024&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
const normalize=(value:string)=>value.normalize('NFC').trim().toLocaleLowerCase('es');
const numberValue=(value:string)=>value.trim()===''?null:Number(value);
const validNumber=(value:number|null)=>value===null||(Number.isFinite(value)&&value>0&&value<=100000);
export default function PhotoMaterialPanel({onClose,onCreated,onDirtyChange,replacement,initialKind='sheet'}:Props){
 const [pick,setPick]=useState<PhotoMaterialPick>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[name,setName]=useState(replacement?.name||''),[kind,setKind]=useState<'sheet'|'edge'>(replacement?.kind||initialKind),[thickness,setThickness]=useState(replacement?.thicknessMm?.toString()||'');
 const [action,setAction]=useState<DuplicateAction>(replacement?'replace':'new'),[existingId,setExistingId]=useState(replacement?.catalogId||''),[replaceConfirmed,setReplaceConfirmed]=useState(!!replacement?.assign),[scaleConfirmed,setScaleConfirmed]=useState(false),[textureWidth,setTextureWidth]=useState(''),[textureHeight,setTextureHeight]=useState(''),[scaleLocked,setScaleLocked]=useState(true),[failed,setFailed]=useState<'choose'|''>('');
 const panel=useRef<HTMLElement>(null),nameInput=useRef<HTMLInputElement>(null),chooseButton=useRef<HTMLButtonElement>(null),mounted=useRef(true);
 const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
 const cancel=useCallback(async()=>{await request('material_photo_cancel');onCloseRef.current();},[]);
 const cancelRef=useRef(cancel);cancelRef.current=cancel;
 useEffect(()=>{mounted.current=true;panel.current?.focus();return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onDirtyChange?.(!!pick||!!busy);return()=>onDirtyChange?.(false);},[pick,busy,onDirtyChange]);
 const run=useCallback(async(label:string,operation:()=>Promise<void>,kind:'choose'|''='')=>{setBusy(label);setError('');setFailed('');try{await operation();}catch(value){if(mounted.current){setError(value instanceof Error?value.message:String(value));setFailed(kind);}}finally{if(mounted.current)setBusy('');}},[]);
 useEffect(()=>{
  function key(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy){void run('Cerrando material…',()=>cancelRef.current());}return;}
   if(event.key!=='Tab')return;
   const items=[...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')||[])],first=items[0],last=items[items.length-1];
   if(!first){event.preventDefault();panel.current?.focus();return;}
   if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)||!panel.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
  }
  document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
 },[busy,run]);
 async function choose(){
  const result=await request<PhotoMaterialPick|{cancelled:true}>('material_photo_pick');
  if('cancelled' in result)return;
  if(!imageUri(result.preview))throw new Error('La imagen no tiene una vista previa JPG/PNG válida. Elegí otra foto.');
  setPick(result);setReplaceConfirmed(!!replacement?.assign);setScaleConfirmed(false);setTextureWidth('');setTextureHeight('');
  if(!replacement){setName(result.name);setAction(result.duplicates.length?'existing':'new');setExistingId(result.duplicates[0]?.catalogId||'');}
  else{setAction('replace');setExistingId(replacement.catalogId);}
  requestAnimationFrame(()=>nameInput.current?.focus());
 }
 function changeAction(next:DuplicateAction){
  setAction(next);setReplaceConfirmed(false);
  if(next==='variant'&&pick&&(!name.trim()||pick.duplicates.some(item=>normalize(item.name)===normalize(name))))setName(`${(pick.name||'Material').slice(0,145)} (variante)`);
 }
 function changeWidth(value:string){setTextureWidth(value);if(scaleLocked&&pick){const height=lockedHeight(Number(value),pick);setTextureHeight(height===null?'':String(height));}}
 const numericThickness=numberValue(thickness),numericWidth=numberValue(textureWidth),numericHeight=numberValue(textureHeight),reusing=action==='existing';
 const nameConflict=action==='variant'&&pick?.duplicates.some(item=>normalize(item.name)===normalize(name));
 const scaleInvalid=scaleConfirmed&&(numericWidth===null||numericHeight===null||!validNumber(numericWidth)||!validNumber(numericHeight));
 const invalid=!pick||!!busy||(reusing?!existingId:!name.trim()||!validNumber(numericThickness)||!!nameConflict||scaleInvalid)||(action==='replace'&&(!existingId||!replaceConfirmed));
 const nameInvalid=!!pick&&!reusing&&!name.trim(),thicknessInvalid=!reusing&&!validNumber(numericThickness);
 async function save(paint:boolean){
  if(!pick||invalid)return;
  const result=await request<PhotoMaterialResult>('material_photo_create',{token:pick.token,revision:pick.revision,action,existingId:action==='existing'||action==='replace'?existingId:undefined,name:reusing?undefined:name.trim(),kind:reusing?undefined:kind,thicknessMm:reusing?undefined:numericThickness,confirmed:true,replaceConfirmed:action==='replace'?replaceConfirmed:undefined,textureWidthMm:!reusing&&scaleConfirmed?numericWidth:undefined,textureHeightMm:!reusing&&scaleConfirmed?numericHeight:undefined});
  if(paint&&result.designReady!==true)throw new Error('El material se guardó, pero su textura todavía no está lista para pintar. Revisalo desde Materiales.');
  await onCreated(result,{paint});
 }
 return <div className="photo-material-backdrop"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="photo-material-title" className="photo-material-panel" aria-busy={!!busy}>
  <header><div><span className="photo-eyebrow">FOTO PROPIA · MATERIAL REAL</span><h2 id="photo-material-title">{replacement?.assign?'Asignar foto al material':replacement?'Reemplazar textura del material':'Material desde una foto'}</h2><p>{replacement?`Material elegido: ${replacement.name}`:'Elegí una foto, poné un nombre y empezá a diseñar. Los datos de compra pueden esperar.'}</p></div><button disabled={!!busy} onClick={()=>void run('Cerrando material…',cancel)} aria-label="Cerrar material desde foto">Cerrar</button></header>
  <div className="photo-material-content"><div className="photo-material-preview">{pick?<><img src={pick.preview} alt="Foto elegida para la textura y miniatura del material"/><p>{pick.widthPx} × {pick.heightPx} píxeles · {reusing?'Esta foto no se usará al reutilizar el material existente.':'La foto se usará para la textura real y su miniatura.'}</p><button ref={chooseButton} disabled={!!busy} onClick={()=>void run('Validando la nueva foto…',choose,'choose')}>Elegir otra foto</button></>:<div className="photo-material-empty"><span aria-hidden="true">▧</span><strong>Una foto para ver y pintar</strong><p>JPG o PNG local. Se guarda una copia privada para no depender de la carpeta Descargas.</p><button ref={chooseButton} className="primary" disabled={!!busy} onClick={()=>void run('Validando la foto…',choose,'choose')}>Elegir foto (JPG/PNG)</button></div>}</div>
   <div className="photo-material-fields">{reusing?<div className="photo-existing-summary"><strong>{pick?.duplicates.find(item=>item.catalogId===existingId)?.name}</strong><p>Se conservan el tipo, el espesor y todos los datos del material existente.</p></div>:<><label>Nombre del material<input ref={nameInput} aria-label="Nombre del material desde foto" value={name} maxLength={160} disabled={!pick||!!busy||reusing} aria-invalid={nameInvalid||!!nameConflict} aria-describedby={nameInvalid?'photo-name-error':undefined} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!invalid)void run('Guardando material y su archivo visual…',()=>save(false));}}} placeholder="Por ejemplo: Roble del taller"/></label>{nameInvalid&&<p id="photo-name-error" className="photo-error">Escribí un nombre para el material.</p>}<div className="photo-material-basic"><label>Tipo<select aria-label="Tipo de material desde foto" value={kind} disabled={!pick||!!busy||reusing||!!replacement} onChange={event=>setKind(event.target.value as 'sheet'|'edge')}><option value="sheet">Placa</option><option value="edge">Canto</option></select></label><label>Espesor · mm<input type="number" aria-label="Espesor del material desde foto" value={thickness} min="0.001" max="100000" step="any" disabled={!pick||!!busy||reusing} aria-invalid={thicknessInvalid} aria-describedby={thicknessInvalid?'photo-thickness-error':'photo-thickness-help'} onChange={event=>setThickness(event.target.value)} placeholder="Sin verificar"/></label></div>{thicknessInvalid&&<p id="photo-thickness-error" className="photo-error">El espesor debe ser un número positivo en milímetros, o quedar vacío.</p>}<p id="photo-thickness-help" className="photo-help">El espesor puede quedar pendiente para diseño. No se deduce de la foto ni de sus píxeles.</p></>}
    {pick&&!replacement&&pick.duplicates.length>0&&<fieldset className="photo-duplicate"><legend>Encontramos materiales coincidentes</legend><p>Elegí qué hacer. No se sobrescribe ninguna ficha automáticamente.</p>{([['existing','Usar existente'],['variant','Crear variante'],['replace','Reemplazar textura']] as const).map(([value,label])=><label key={value}><input type="radio" name="photo-duplicate-action" checked={action===value} disabled={!!busy} onChange={()=>changeAction(value)}/>{label}</label>)}{(action==='existing'||action==='replace')&&<label>Material del taller<select aria-label="Material coincidente" value={existingId} disabled={!!busy} onChange={event=>{setExistingId(event.target.value);setReplaceConfirmed(false);}}>{pick.duplicates.map(item=><option key={item.catalogId} value={item.catalogId}>{item.name}</option>)}</select></label>}{reusing&&<p>Se utilizará el material existente tal como está, con su propia textura. No se cambiará su nombre ni su ficha.</p>}{nameConflict&&<p className="photo-error" role="alert">La variante necesita un nombre diferente para no confundirse con la ficha existente.</p>}</fieldset>}
    {action==='replace'&&!replacement?.assign&&<div className="photo-replace-confirm"><strong>Reemplazo con alcance explícito</strong><p>Se crea una nueva versión de textura para esta ficha. Las piezas ya pintadas conservan su imagen; repintalas explícitamente si querés cambiarlas. La miniatura y el archivo visual del taller se actualizarán. Revisá la compra antes de enviarlo a maderera.</p><label><input type="checkbox" aria-label="Confirmar reemplazo de textura" checked={replaceConfirmed} disabled={!!busy||!pick} onChange={event=>setReplaceConfirmed(event.target.checked)}/> Confirmo reemplazar la textura del material elegido</label></div>}
    {!reusing&&<details className="photo-material-advanced"><summary>Escala de textura (opcional)</summary><p>Estas medidas son el tamaño real que cubre la foto; no son el formato de la placa ni se calculan a partir de los píxeles.</p><label className="photo-check"><input type="checkbox" aria-label="Confirmar escala física de la textura" checked={scaleConfirmed} disabled={!pick||!!busy} onChange={event=>setScaleConfirmed(event.target.checked)}/> Conozco el tamaño físico de esta textura</label><label className="photo-check"><input type="checkbox" aria-label="Mantener la proporción de la foto" checked={scaleLocked} disabled={!pick||!!busy||!scaleConfirmed} onChange={event=>{setScaleLocked(event.target.checked);if(event.target.checked&&pick&&textureWidth){const height=lockedHeight(Number(textureWidth),pick);setTextureHeight(height===null?'':String(height));}}}/> Mantener la proporción de la foto{pick?` (${pick.widthPx} × ${pick.heightPx} px)`:''}</label><div className="photo-material-basic"><label>Ancho de textura · mm<input type="number" aria-label="Ancho físico de textura" value={textureWidth} disabled={!pick||!!busy||!scaleConfirmed} min="0.001" max="100000" step="any" aria-invalid={scaleInvalid} aria-describedby={scaleInvalid?'photo-scale-error':undefined} onChange={event=>changeWidth(event.target.value)}/></label><label>Alto de textura · mm<input type="number" aria-label="Alto físico de textura" value={textureHeight} disabled={!pick||!!busy||!scaleConfirmed} readOnly={scaleLocked&&!!pick} min="0.001" max="100000" step="any" aria-invalid={scaleInvalid} aria-describedby={scaleInvalid?'photo-scale-error':undefined} onChange={event=>setTextureHeight(event.target.value)}/></label></div>{scaleInvalid&&<p id="photo-scale-error" className="photo-error">Completá ambas medidas físicas con valores positivos o desmarcá la escala.</p>}</details>}
    <details className="photo-purchase"><summary>Detalles de compra, después</summary><p>SKU, proveedor, formato de placa, veta y cantos compatibles se completan en «Revisar ficha». No hacen falta para diseñar; sí deben verificarse antes de exportar a maderera.</p></details>
   </div></div>
  <div className="photo-material-feedback">{busy&&<p role="status">{busy}</p>}{error&&<div role="alert" className="photo-error"><p>{error}</p>{failed==='choose'&&<button disabled={!!busy} onClick={()=>void run('Validando la foto…',choose,'choose')}>Reintentar elegir foto</button>}</div>}{pick?.warnings?.map(warning=><p className="photo-warning" key={warning}>{warning}</p>)}{pick&&!reusing&&<p className="photo-warning">{scaleConfirmed?'Escala física indicada por el encargado.':'Escala sin verificar: se usa el tamaño de textura por defecto para diseño.'} Una foto puede repetir su patrón y la veta requiere revisión.</p>}<p className="photo-state"><strong>Listo para diseño al guardar</strong><span>Pendiente para maderera · no se aprueba la compra automáticamente</span></p></div>
  <footer><button disabled={!!busy} onClick={()=>void run('Cerrando material…',cancel)}>Cancelar</button><button disabled={invalid} onClick={()=>void run('Guardando material y su archivo visual…',()=>save(false))}>Guardar material</button><button className="primary" disabled={invalid} onClick={()=>void run('Guardando material para pintar…',()=>save(true))}>Guardar y pintar</button></footer>
 </section></div>;
}

export type TextureScale={widthMm:number|null;heightMm:number|null;verified:boolean};
export type TexturePreviewResult={catalogId:string;current?:TextureScale;proposed:{widthMm:number;heightMm:number;rotation:Rotation};pixels?:{widthPx:number;heightPx:number};thumbnail?:string|null;affected:{materialId:string;name:string}[];materialIds?:string[];revision?:number;assetRevision?:number;repeats?:{alongLength:number;alongWidth:number}|null;warnings:string[]};
export type TextureApplyResult={catalogId:string;noChanges?:boolean;applied?:{materialId:string;name:string;widthMm:number;heightMm:number}[];textureScale?:unknown;rotation?:Rotation;verification?:{ok:boolean;checked:number};warnings?:string[];scan?:unknown};
type TextureProps={catalogId:string;name:string;thumbnail?:string|null;widthPx?:number;heightPx?:number;current?:TextureScale;sheet?:{lengthMm:number;widthMm:number}|null;revision:number;assetRevision:number;onClose:()=>void;onApplied:(result:TextureApplyResult)=>void|Promise<void>};
const decimal=(value:number)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(value);
// MATERIALES-10/11: scale and 90° turns of the SAME material; the server
// verifies the native texture after applying it in one undoable operation.
export function TextureAdjustPanel({catalogId,name,thumbnail,widthPx,heightPx,current,sheet,revision,assetRevision,onClose,onApplied}:TextureProps){
 const [width,setWidth]=useState(current?.verified&&current.widthMm?String(current.widthMm):''),[height,setHeight]=useState(current?.verified&&current.heightMm?String(current.heightMm):'');
 const pixelsKnown=!!widthPx&&!!heightPx,[locked,setLocked]=useState(pixelsKnown),[rotation,setRotation]=useState<Rotation>(0);
 const [checked,setChecked]=useState<TexturePreviewResult>(),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const panel=useRef<HTMLElement>(null),mounted=useRef(true),onCloseRef=useRef(onClose);onCloseRef.current=onClose;
 const pixels=pixelsKnown?rotateDimensions({widthMm:widthPx!,heightMm:heightPx!},rotation):undefined;
 const numericWidth=numberValue(width),numericHeight=numberValue(height);
 const sizeInvalid=numericWidth===null||numericHeight===null||!validNumber(numericWidth)||!validNumber(numericHeight);
 const repeats=sizeInvalid?null:textureRepeats({widthMm:numericWidth!,heightMm:numericHeight!},sheet);
 const stale=!checked||checked.proposed.rotation!==rotation||checked.proposed.widthMm!==numericWidth||checked.proposed.heightMm!==numericHeight;
 const thumb=checked?.thumbnail&&!stale&&imageUri(checked.thumbnail)?checked.thumbnail:thumbnail&&imageUri(thumbnail)?thumbnail:undefined;
 useEffect(()=>{mounted.current=true;panel.current?.focus();return()=>{mounted.current=false;};},[]);
 const run=useCallback(async(label:string,operation:()=>Promise<void>)=>{setBusy(label);setError('');try{await operation();}catch(value){if(mounted.current)setError(value instanceof Error?value.message:String(value));}finally{if(mounted.current)setBusy('');}},[]);
 useEffect(()=>{
  function key(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)onCloseRef.current();return;}
   if(event.key!=='Tab')return;
   const items=[...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')||[])],first=items[0],last=items[items.length-1];
   if(!first){event.preventDefault();panel.current?.focus();return;}
   if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)||!panel.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
  }
  document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
 },[busy]);
 function changeWidth(value:string){setWidth(value);if(locked&&pixels){const next=lockedHeight(Number(value),{widthPx:pixels.widthMm,heightPx:pixels.heightMm});setHeight(next===null?'':String(next));}}
 function turn(delta:90|-90){
  setRotation(previous=>normalizeRotation(previous+delta));
  // A 90° turn swaps which physical side the image width covers.
  setWidth(height);setHeight(width);
 }
 const payload=()=>({catalogId,widthMm:numericWidth,heightMm:numericHeight,rotation});
 async function verify(){setChecked(await request<TexturePreviewResult>('material_texture_preview',payload()));}
 async function apply(){
  if(!checked||stale)throw new Error('Verificá la vista previa antes de aplicar.');
  // Apply exactly what the verified preview showed: same materials and revisions.
  const result=await request<TextureApplyResult>('material_texture_apply',{...payload(),materialIds:checked.materialIds??checked.affected.map(row=>row.materialId),revision:checked.revision??revision,assetRevision:checked.assetRevision??assetRevision,confirmed:true});
  if(result.verification&&result.verification.ok!==true)throw new Error('SketchUp no confirmó la textura ajustada. Revisá el material antes de seguir pintando.');
  await onApplied(result);
 }
 return <div className="photo-material-backdrop"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="texture-adjust-title" aria-describedby="texture-adjust-help" className="photo-material-panel texture-adjust-panel" aria-busy={!!busy}>
  <header><div><span className="photo-eyebrow">MISMO MATERIAL · SE ACTUALIZA LO YA PINTADO</span><h2 id="texture-adjust-title">Ajustar escala y giro de textura</h2><p id="texture-adjust-help">{name}. El cambio se aplica al material del modelo y a la ficha, en una sola operación que Ctrl+Z deshace. La veta de corte se confirma por pieza.</p></div><button disabled={!!busy} onClick={onClose} aria-label="Cerrar ajuste de textura">Cerrar</button></header>
  <div className="photo-material-content"><div className="photo-material-preview texture-adjust-preview">{thumb?<img src={thumb} alt={`Vista previa de la textura de ${name}, girada ${rotation}°`} style={checked?.thumbnail&&!stale?undefined:{transform:`rotate(${rotation}deg)`}}/>:<div className="photo-material-empty"><span aria-hidden="true">▧</span><p>Sin miniatura disponible</p></div>}<p role="status">Giro: {rotation}°{repeats?` · Sobre la placa de ${decimal(sheet!.lengthMm)} × ${decimal(sheet!.widthMm)} mm, la foto se repite ${decimal(repeats.alongLength)} veces a lo largo y ${decimal(repeats.alongWidth)} a lo ancho.`:''}</p><div className="texture-turns" role="group" aria-label="Girar textura"><button disabled={!!busy} onClick={()=>turn(-90)}>Girar 90° a la izquierda</button><button disabled={!!busy} onClick={()=>turn(90)}>Girar 90° a la derecha</button></div></div>
   <div className="photo-material-fields"><p className="photo-help">{current?.verified&&current.widthMm&&current.heightMm?`Escala actual verificada: ${decimal(current.widthMm)} × ${decimal(current.heightMm)} mm.`:'Escala actual sin verificar.'} Indicá el tamaño físico que cubre una repetición de la foto.</p>
    <label className="photo-check"><input type="checkbox" aria-label="Mantener proporción de la textura" checked={locked} disabled={!!busy||!pixelsKnown} onChange={event=>{setLocked(event.target.checked);if(event.target.checked&&pixels&&width){const next=lockedHeight(Number(width),{widthPx:pixels.widthMm,heightPx:pixels.heightMm});setHeight(next===null?'':String(next));}}}/> Mantener la proporción de la foto{pixels?` (${pixels.widthMm} × ${pixels.heightMm} px)`:''}</label>
    <div className="photo-material-basic"><label>Ancho de textura · mm<input type="number" aria-label="Ancho de textura ajustada" value={width} min="0.001" max="100000" step="any" disabled={!!busy} aria-invalid={!!width&&sizeInvalid} aria-describedby="texture-size-error" onChange={event=>changeWidth(event.target.value)}/></label><label>Alto de textura · mm<input type="number" aria-label="Alto de textura ajustada" value={height} min="0.001" max="100000" step="any" disabled={!!busy} readOnly={locked&&!!pixels} aria-invalid={!!height&&sizeInvalid} aria-describedby="texture-size-error" onChange={event=>setHeight(event.target.value)}/></label></div>
    <p id="texture-size-error" className={sizeInvalid?'photo-error':'photo-help'}>{sizeInvalid?'Completá ancho y alto con números positivos en milímetros.':'Las medidas no cambian el formato de la placa ni su despiece.'}</p>
    {checked&&!stale&&<div className="texture-check" role="group" aria-label="Resultado de la verificación"><strong>Vista previa verificada</strong><p>{checked.affected.length?`Se actualizarán ${checked.affected.length} ${checked.affected.length===1?'material':'materiales'} de este modelo: ${checked.affected.map(row=>row.name).join(', ')}.`:'No hay materiales de esta ficha en el modelo: se actualiza solo la biblioteca.'}</p>{checked.warnings.map(warning=><p className="photo-warning" key={warning}>{warning}</p>)}</div>}
   </div></div>
  <div className="photo-material-feedback">{busy&&<p role="status">{busy}</p>}{error&&<p role="alert" className="photo-error">{error}</p>}{stale&&!sizeInvalid&&<p className="photo-help">Verificá la vista previa antes de aplicar.</p>}</div>
  <footer><button disabled={!!busy} onClick={onClose}>Cancelar</button><button disabled={!!busy||sizeInvalid} onClick={()=>void run('Verificando la vista previa…',verify)}>Verificar vista previa</button><button className="primary" disabled={!!busy||sizeInvalid||stale} onClick={()=>void run('Aplicando y verificando la textura…',apply)}>Aplicar al material</button></footer>
 </section></div>;
}
