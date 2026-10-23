import {useState} from 'react';
import {request} from './bridge';
import type {Catalog,CatalogItem} from './WorkshopPanel';
import {suggestedSummary} from './maderaRules';
import './madera.css';

type Run=(operation:()=>Promise<void>,label?:string,action?:string)=>Promise<void>;
type Library={catalog:Catalog;conflicts:string[][]};
type Preset={id:string;label:string;kind:'sheet'|'edge';values:Record<string,number|boolean|null>};
type Changed=(next:Library,selectId:string|undefined,notice:string)=>void;
const added=(before:Catalog,next:Library)=>next.catalog.items.find(item=>!before.items.some(old=>old.id===item.id));
const kindNames:Record<string,string>={sheet:'Placa',edge:'Canto'};

/** MATERIALES-02: alta rápida desde los valores sugeridos del taller. La ficha queda incompleta hasta cargar el SKU. */
export default function CatalogV2Tools({catalog,busy,disabled,run,onChanged}:{catalog:Catalog;busy:boolean;disabled:boolean;run:Run;onChanged:Changed}){
 const [presets,setPresets]=useState<{note:string;presets:Preset[]}>(),[open,setOpen]=useState(false),[presetId,setPresetId]=useState(''),[name,setName]=useState('');
 const show=()=>{setOpen(true);if(!presets)void run(async()=>{const result=await request<{note:string;presets:Preset[]}>('catalog_presets');setPresets(result);setPresetId(result.presets[0]?.id||'');},'Cargando valores sugeridos…','catalog_presets');};
 const create=()=>void run(async()=>{const next=await request<Library>('catalog_add_preset',{presetId,name:name.trim()||undefined,revision:catalog.revision}),item=added(catalog,next);setOpen(false);setName('');
  onChanged(next,item?.id,`${item?`Material «${item.name}» creado`:"Material creado"} con valores sugeridos. Completá su SKU para usarlo en pedidos.`);},'Creando material sugerido…','catalog_add_preset');
 if(!open)return <button disabled={busy||disabled} onClick={show}>Alta rápida desde valores sugeridos</button>;
 return <div className="workshop-inline-create catalog-v2-presets" role="group" aria-label="Alta rápida desde valores sugeridos">
  {presets?<><label>Valor sugerido<select value={presetId} disabled={busy} onChange={e=>setPresetId(e.target.value)}>{presets.presets.map(preset=><option key={preset.id} value={preset.id}>{kindNames[preset.kind]} · {preset.label}</option>)}</select></label>
   <label>Nombre (opcional)<input value={name} maxLength={120} placeholder={presets.presets.find(p=>p.id===presetId)?.label} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <button className="workshop-primary" disabled={busy||disabled||!presetId} onClick={create}>Crear sugerido</button><button disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>
   <p className="workshop-hint">Con medidas sugeridas; completá el SKU. {presets.note}</p></>:<p className="workshop-hint">Cargando valores sugeridos…</p>}
 </div>;
}

/** Ficha: de dónde salieron los valores precargados (c) y variante de espesor para placas y cantos (b). */
export function ItemV2Tools({item,catalog,busy,disabled,run,onChanged}:{item:CatalogItem;catalog:Catalog;busy:boolean;disabled:boolean;run:Run;onChanged:Changed}){
 const [thickness,setThickness]=useState(''),[name,setName]=useState('');
 const base=item.variantOf?catalog.items.find(other=>other.id===item.variantOf):undefined,summary=item.suggested?suggestedSummary(item.suggested):null;
 const create=()=>void run(async()=>{const next=await request<Library>('catalog_variant',{id:item.id,thicknessMm:Number(thickness),name:name.trim()||undefined,revision:catalog.revision}),made=added(catalog,next);setThickness('');setName('');
  onChanged(next,made?.id,`${made?`Variante «${made.name}» creada`:"Variante creada"} sin SKU ni precio. Completá su SKU para usarla en pedidos.`);},'Creando variante de espesor…','catalog_variant');
 return <>
  {summary&&<p className="workshop-hint catalog-v2-suggested" role="note">Valores precargados desde {summary.source}: {summary.fields}. Corregilos si no coinciden con el producto.</p>}
  {base&&<p className="workshop-hint">Variante de espesor de «{base.name}».</p>}
  {['sheet','edge'].includes(item.kind)&&<details className="workshop-apply catalog-v2-variant"><summary>Crear variante de espesor</summary>
   <p className="workshop-hint">{item.kind==='sheet'?'Solo si ese espesor tiene SKU propio: la placa ya vale para todos sus espesores. ':''}Copia proveedor, formato y veta. SKU y precio quedan vacíos.{disabled?' Guardá la biblioteca antes de crear la variante.':''}</p>
   <label>Espesor de la variante (mm)<input type="number" min="0.001" step="any" value={thickness} disabled={busy} onChange={e=>setThickness(e.target.value)}/></label>
   <label>Nombre de la variante (opcional)<input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <button className="workshop-primary" disabled={busy||disabled||!(Number(thickness)>0)} onClick={create}>Crear variante</button></details>}
 </>;
}

