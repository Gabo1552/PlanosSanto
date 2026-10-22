import {useState} from 'react';
import {skmKinds} from './maderaRules';
import './madera.css';

/** Vista previa SKM: tipo en lote para los seleccionados y espesor sugerido por el nombre, editable después en la ficha. */
export function SkmBatchKind({selectedCount,busy,applySuggestions,onApply,onSuggestions}:{selectedCount:number;busy:boolean;applySuggestions:boolean;onApply:(kind:string)=>void;onSuggestions:(value:boolean)=>void}){
 const [kind,setKind]=useState('sheet'),[done,setDone]=useState('');
 return <div className="skm-typed-batch" role="group" aria-label="Tipo del lote"><label>Tipo para los seleccionados<select value={kind} disabled={busy} onChange={e=>setKind(e.target.value)}>{skmKinds.map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label><button disabled={busy||!selectedCount} onClick={()=>{onApply(kind);setDone(`Tipo «${skmKinds.find(([id])=>id===kind)?.[1]}» aplicado a ${selectedCount} ${selectedCount===1?'archivo':'archivos'}.`);}}>Aplicar tipo a los seleccionados ({selectedCount})</button><span role="status" className="skm-typed-done">{done}</span>
  <label><input type="checkbox" checked={applySuggestions} disabled={busy} onChange={e=>onSuggestions(e.target.checked)}/> Usar el espesor sugerido por el nombre del archivo como sugerencia (editable en la ficha)</label><small>Solo para placas y cantos. El tipo y el espesor quedan como sugerencias para revisar en la ficha.</small></div>;
}
export function SkmRowKind({name,value,busy,onChange}:{name:string;value:string;busy:boolean;onChange:(kind:string)=>void}){
 return <label className="skm-typed-row">Tipo<select aria-label={`Tipo de ${name}`} value={value} disabled={busy} onChange={e=>onChange(e.target.value)}>{skmKinds.map(([id,text])=><option key={id} value={id}>{text}</option>)}</select></label>;
}
