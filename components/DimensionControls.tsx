'use client';
import {dimensionChoices,dimensionText,onlyTotalDimensions,setDimensionVisible,showAllDimensions,totalChoices} from '@/lib/dimensions';
import {furnitureEnvelope} from '@/lib/scene';
import type {DimensionDisplay,Furniture} from '@/lib/model';

const TOTAL_LABEL={alto:'Alto total',ancho:'Ancho total',profundidad:'Profundidad total'} as const;

/**
 * 0.8.31: the plan draws the alto, ancho and profundidad of the whole furniture by default; the cotas of each piece
 * start hidden and are turned on here one by one. The choice is stored with the guide (dimensionDisplay).
 */
export default function DimensionControls({furniture:f,disabled=false,onChange}:{furniture:Furniture;disabled?:boolean;onChange:(display:DimensionDisplay)=>void}){
  const choices=dimensionChoices(f),shown=choices.filter(c=>c.visible).length;
  const totals=totalChoices(f,furnitureEnvelope(f)?.size),totalsShown=totals.filter(c=>c.visible).length;
  const isDefault=!shown&&totalsShown===totals.length;
  return <details className="dimension-controls">
    <summary>Mostrar u ocultar cotas <span>{totalsShown} de {totals.length} totales · {shown} de {choices.length} por pieza</span></summary>
    <div className="dimension-controls-body"><p>Por defecto el plano acota el alto, el ancho y la profundidad totales del mueble armado. Las cotas de cada pieza empiezan ocultas: marcá las que quieras ver. Para ocultar una cota también podés hacer clic sobre su medida en el dibujo. La elección se guarda con la guía y se respeta en el PDF; las medidas de la tabla se conservan. Si dos piezas tienen la misma medida en la misma dirección, se acota una sola vez.</p>
      <button type="button" disabled={disabled||(shown===choices.length&&totalsShown===totals.length)} onClick={()=>onChange(showAllDimensions(f))}>Mostrar todas las cotas</button>{' '}
      <button type="button" disabled={disabled||isDefault} onClick={()=>onChange(onlyTotalDimensions(f))}>Solo medidas totales</button>
      <div className="dimension-choice-list" role="group" aria-label="Medidas totales del mueble">{totals.map(c=><label key={c.total}>
        <input type="checkbox" aria-label={`Mostrar cota total ${c.total}`} checked={c.visible} disabled={disabled} onChange={e=>onChange(setDimensionVisible(f,{total:c.total},e.target.checked))}/>
        <span><strong>{TOTAL_LABEL[c.total]}</strong>{c.valueMm!==undefined&&<> · {dimensionText(c.valueMm)}</>}<small>Mueble armado, todas sus piezas</small></span>
      </label>)}</div>
      <div className="dimension-choice-list" role="group" aria-label="Cotas de las piezas">{choices.map(c=><label key={JSON.stringify([c.pieceId,c.role])}>
        <input type="checkbox" aria-label={`Mostrar cota ${c.code} ${c.role}`} checked={c.visible} disabled={disabled} onChange={e=>onChange(setDimensionVisible(f,{pieceId:c.pieceId,role:c.role},e.target.checked))}/>
        <span><strong>{c.code} · {c.role==='largo'?'Largo':'Ancho'}</strong> · {dimensionText(c.valueMm)}{c.codes.length>1&&<small>Compartida con {c.codes.slice(1).join(', ')}</small>}</span>
      </label>)}</div>
    </div>
  </details>;
}
