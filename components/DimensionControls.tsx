'use client';
import {dimensionChoices,dimensionText,setDimensionVisible} from '@/lib/dimensions';
import type {Furniture,HiddenDimension} from '@/lib/model';

export default function DimensionControls({furniture:f,disabled=false,onChange}:{furniture:Furniture;disabled?:boolean;onChange:(refs:HiddenDimension[])=>void}){
  const choices=dimensionChoices(f),shown=choices.filter(c=>c.visible).length;
  return <details className="dimension-controls">
    <summary>Mostrar u ocultar cotas <span>{shown} de {choices.length} visibles</span></summary>
    <div className="dimension-controls-body"><p>Desmarcá la cota que querés ocultar. También podés hacer clic sobre su medida en el dibujo. La elección se guarda con la guía y se respeta en el PDF; las medidas de la tabla se conservan.</p>
      <button type="button" disabled={disabled||!(f.hiddenDimensions||[]).length} onClick={()=>onChange([])}>Mostrar todas las cotas</button>
      <div className="dimension-choice-list">{choices.map(c=><label key={JSON.stringify([c.pieceId,c.role])}>
        <input type="checkbox" aria-label={`Mostrar cota ${c.code} ${c.role}`} checked={c.visible} disabled={disabled} onChange={e=>onChange(setDimensionVisible(f,c.pieceId,c.role,e.target.checked))}/>
        <span><strong>{c.code} · {c.role==='largo'?'Largo':'Ancho'}</strong> · {dimensionText(c.valueMm)}{c.codes.length>1&&<small>Compartida con {c.codes.slice(1).join(', ')}</small>}</span>
      </label>)}</div>
    </div>
  </details>;
}
