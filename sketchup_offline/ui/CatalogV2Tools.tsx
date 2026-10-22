import {useState} from 'react';
import {request} from './bridge';
import type {Catalog,CatalogItem} from './WorkshopPanel';
import {suggestedSummary,variantThickness} from './maderaRules';
import {mm} from '../../lib/model';
import './madera.css';

type Run=(operation:()=>Promise<void>,label?:string,action?:string)=>Promise<void>;
type Library={catalog:Catalog;conflicts:string[][]};
type Preset={id:string;label:string;kind:'sheet'|'edge';values:Record<string,number|boolean|null>};
type Changed=(next:Library,selectId:string|undefined,notice:string)=>void;
const added=(before:Catalog,next:Library)=>next.catalog.items.find(item=>!before.items.some(old=>old.id===item.id));
const kindNames:Record<string,string>={sheet:'Placa',edge:'Canto'};

/** MATERIALES-02: alta rápida desde los valores sugeridos del taller. Queda sin aprobar. */
export default function CatalogV2Tools({catalog,busy,disabled,run,onChanged}:{catalog:Catalog;busy:boolean;disabled:boolean;run:Run;onChanged:Changed}){
 const [presets,setPresets]=useState<{note:string;presets:Preset[]}>(),[open,setOpen]=useState(false),[presetId,setPresetId]=useState(''),[name,setName]=useState('');
 const show=()=>{setOpen(true);if(!presets)void run(async()=>{const result=await request<{note:string;presets:Preset[]}>('catalog_presets');setPresets(result);setPresetId(result.presets[0]?.id||'');},'Cargando valores sugeridos…','catalog_presets');};
 const create=()=>void run(async()=>{const next=await request<Library>('catalog_add_preset',{presetId,name:name.trim()||undefined,revision:catalog.revision}),item=added(catalog,next);setOpen(false);setName('');
  onChanged(next,item?.id,`Material «${item?.name??''}» creado con valores sugeridos, sin aprobar. Completá SKU y proveedor y revisá la ficha antes de aprobarla.`);},'Creando material sugerido…','catalog_add_preset');
 if(!open)return <button disabled={busy||disabled} onClick={show}>Alta rápida desde valores sugeridos</button>;
 return <div className="workshop-inline-create catalog-v2-presets" role="group" aria-label="Alta rápida desde valores sugeridos">
  {presets?<><label>Valor sugerido<select value={presetId} disabled={busy} onChange={e=>setPresetId(e.target.value)}>{presets.presets.map(preset=><option key={preset.id} value={preset.id}>{kindNames[preset.kind]} · {preset.label}</option>)}</select></label>
   <label>Nombre (opcional)<input value={name} maxLength={120} placeholder={presets.presets.find(p=>p.id===presetId)?.label} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <button className="workshop-primary" disabled={busy||disabled||!presetId} onClick={create}>Crear sugerido</button><button disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>
   <p className="workshop-hint">Sugerido, sin aprobar; completá SKU y proveedor. {presets.note}</p></>:<p className="workshop-hint">Cargando valores sugeridos…</p>}
 </div>;
}

/** Ficha: origen de los campos sugeridos (c) y variante de espesor para placas y cantos (b). */
export function ItemV2Tools({item,catalog,busy,disabled,run,onChanged}:{item:CatalogItem;catalog:Catalog;busy:boolean;disabled:boolean;run:Run;onChanged:Changed}){
 const [thickness,setThickness]=useState(''),[name,setName]=useState('');
 const base=item.variantOf?catalog.items.find(other=>other.id===item.variantOf):undefined,summary=item.suggested?suggestedSummary(item.suggested):null;
 const create=()=>void run(async()=>{const next=await request<Library>('catalog_variant',{id:item.id,thicknessMm:Number(thickness),name:name.trim()||undefined,revision:catalog.revision}),made=added(catalog,next);setThickness('');setName('');
  onChanged(next,made?.id,`Variante «${made?.name??''}» creada sin aprobar, sin SKU ni precio. Completá su ficha antes de aprobarla.`);},'Creando variante de espesor…','catalog_variant');
 return <>
  {summary&&<p className="warning catalog-v2-suggested" role="note">Campos sugeridos sin revisar ({summary.source}): {summary.fields}. La ficha no se puede aprobar sin revisarlos; al marcarla como aprobada se confirman.</p>}
  {base&&<p className="workshop-hint">Variante de espesor de «{base.name}».</p>}
  {['sheet','edge'].includes(item.kind)&&<details className="workshop-apply catalog-v2-variant"><summary>Crear variante de espesor</summary>
   <p className="workshop-hint">Copia proveedor, formato, veta{item.kind==='sheet'?' y cantos compatibles':''} como sugeridos. SKU y precio quedan vacíos.{disabled?' Guardá la biblioteca antes de crear la variante.':''}</p>
   <label>Espesor de la variante (mm)<input type="number" min="0.001" step="any" value={thickness} disabled={busy} onChange={e=>setThickness(e.target.value)}/></label>
   <label>Nombre de la variante (opcional)<input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <button className="workshop-primary" disabled={busy||disabled||!(Number(thickness)>0)} onClick={create}>Crear variante</button></details>}
 </>;
}

/** Pedido: la pieza no tiene el espesor de la placa elegida. Tres salidas explícitas, ninguna automática. */
export function ThicknessOptions({board,thickness,catalog,busy,run,onChanged,onOtherBoard,onExclude}:{board:CatalogItem;thickness:number;catalog:Catalog;busy:boolean;run:Run;onChanged:Changed;onOtherBoard:()=>void;onExclude:()=>void}){
 const value=variantThickness(thickness);
 const variant=()=>{if(!window.confirm(`Se crea en la biblioteca la variante de «${board.name}» de ${mm(value)} mm, sin aprobar. Cambiar la biblioteca obliga a «Preparar de nuevo» el pedido y se pierden los cambios sin guardar. ¿Continuar?`))return;
  void run(async()=>{const next=await request<Library>('catalog_variant',{id:board.id,thicknessMm:value,revision:catalog.revision}),made=added(catalog,next);onChanged(next,made?.id,`Variante «${made?.name??''}» creada sin aprobar. Completá y aprobá su ficha en la biblioteca y usá «Preparar de nuevo» en el pedido.`);},'Creando variante de espesor…','catalog_variant');};
 return <div className="thickness-options" role="group" aria-label="Opciones por espesor distinto"><p className="workshop-hint">La pieza mide {mm(value)} mm de espesor. Elegí una salida:</p>
  <button disabled={busy} onClick={variant}>Crear variante de {board.name} de {mm(value)} mm</button><button disabled={busy} onClick={onOtherBoard}>Elegir otra placa</button><button disabled={busy} onClick={onExclude}>Excluir la pieza</button>
  <small className="workshop-hint">La variante cambia la biblioteca: después hay que «Preparar de nuevo» el pedido.</small></div>;
}
