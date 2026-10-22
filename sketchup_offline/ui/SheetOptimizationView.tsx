import {mm} from '../../lib/model';
import {money,moneyTotals} from './maderaRules';
import {plural} from './workshopRules';
import {sheetCost,usable,type LayoutGroup,type MaterialOptimization,type OrderOptimization} from './sheetOptimizer';

const percent=new Intl.NumberFormat('es-AR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}),area=new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3});
/** Dónde salen refilado y kerf: el perfil en uso o, sin perfil, los valores sugeridos. */
export type CutSource={kind:'profile';name:string;version:number}|{kind:'suggested'};
const costLabels:Record<string,string>={stale_price:'precio desactualizado, fuera del total',future_price:'precio con fecha futura, fuera del total'};
function Cost({material,today,ageDays}:{material:MaterialOptimization;today:Date;ageDays:number}){
 const cost=sheetCost(material,today,ageDays);
 if(cost.amount===null||!cost.currency)return <td className="workshop-num is-pending">Precio pendiente</td>;
 return <td className={`workshop-num${cost.status==='current_price'?'':' is-pending'}`}>{money(cost.currency,cost.amount)}{cost.status!=='current_price'&&<small>{costLabels[cost.status]}</small>}</td>;
}
const usableOf=(m:MaterialOptimization)=>usable({lengthMm:m.lengthMm??0,widthMm:m.widthMm??0,trimMm:m.trimMm,kerfMm:m.kerfMm});
/** Cuántas piezas de cada letra quedaron ubicadas en placas. */
const placedCount=(m:MaterialOptimization)=>{const out=new Map<string,number>();for(const sheet of m.sheets)for(const p of sheet.placements){const key=m.keys[p.id];out.set(key,(out.get(key)||0)+1);}return out;};
const sheetNames=(numbers:number[])=>numbers.length===1?`Placa ${numbers[0]}`:`Placas ${numbers.join(', ')} (iguales, ×${numbers.length})`;
/** Diagrama de una placa: medida entera, zona de refilado y cada pieza con su letra de leyenda (y su medida si entra). */
function SheetDiagram({material,group,total}:{material:MaterialOptimization;group:LayoutGroup;total:number}){
 const L=material.lengthMm!,W=material.widthMm!,font=Math.max(L,W)/30,stroke=Math.max(L,W)/600,{length,width}=usableOf(material);
 const used=group.layout.usedMm2/(L*W),count=group.layout.placements.length,name=sheetNames(group.sheetNumbers);
 const label=`${name} de ${total}: ${plural(count,'pieza','piezas')}, aprovechamiento ${percent.format(used)}. Placa ${mm(L)} × ${mm(W)} mm${material.grain?', veta a lo largo':''}.`;
 return <figure className="workshop-sheet">
  <svg viewBox={`${-stroke} ${-stroke} ${L+2*stroke} ${W+2*stroke}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
   <rect width={L} height={W} fill="#e7e0cf" stroke="#7d735c" strokeWidth={stroke*1.5}/>
   <rect x={material.trimMm} y={material.trimMm} width={Math.max(0,length)} height={Math.max(0,width)} fill="#fbf9f3" stroke="#a89f88" strokeWidth={stroke} strokeDasharray={`${stroke*6} ${stroke*4}`}/>
   {group.layout.placements.map(p=>{const key=material.keys[p.id]||'?',size=Math.min(font,p.w/(key.length+1),p.h/2.2),dims=`${mm(p.rotated?p.h:p.w)} × ${mm(p.rotated?p.w:p.h)}`,small=Math.min(font*.7,p.w/(dims.length*.62)),showDims=small>=font*.35&&p.h>=size+small*2.4;
    return <g key={p.id}><rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.rotated?'#d5e3ea':'#d9e8dc'} stroke="#19483d" strokeWidth={stroke}/>
     {size>=font*.25&&<text x={p.x+p.w/2} y={p.y+p.h/2-(showDims?small*.6:0)} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight="700" fill="#14382f">{key}</text>}
     {showDims&&<text x={p.x+p.w/2} y={p.y+p.h/2+size*.55} textAnchor="middle" dominantBaseline="middle" fontSize={small} fill="#33463f">{dims}</text>}</g>;})}
  </svg>
  <figcaption><strong>{name}</strong> · {plural(count,'pieza','piezas')} · aprovechamiento {percent.format(used)}</figcaption>
 </figure>;
}
const listDetails=(details:string[])=>{const named=details.map(d=>d.trim()||'Sin detalle');return named.length>3?`${named.slice(0,3).join(', ')} y ${named.length-3} más`:named.join(', ');};
/** Lo que necesita la maderera, sin pieza por pieza: placas por material, aprovechamiento, costo, diagramas y avisos. */
export default function SheetOptimizationView({result,source,today,ageDays}:{result:OrderOptimization;source:CutSource;today:Date;ageDays:number}){
 const {materials,skipped}=result,ok=materials.filter(m=>m.status==='ok'),sheets=ok.reduce((sum,m)=>sum+m.sheets.length,0),net=ok.reduce((sum,m)=>sum+m.sheets.reduce((s,sheet)=>s+sheet.usedMm2,0)/1e6,0),bought=ok.reduce((sum,m)=>sum+m.boughtM2,0);
 const costs:Record<string,number>={};for(const m of ok){const cost=sheetCost(m,today,ageDays);if(cost.status==='current_price'&&cost.amount!==null&&cost.currency)costs[cost.currency]=(costs[cost.currency]||0)+cost.amount;}
 const skippedCount=skipped.noBoard+skipped.noSize+skipped.notRectangular;
 const notes=[
  ...materials.filter(m=>m.status==='no_format').map(m=>`«${m.name}»: falta el formato de la placa (largo y ancho) en la biblioteca; no se optimiza y el presupuesto usa m² más desperdicio.`),
  ...materials.filter(m=>m.status==='no_usable').map(m=>`«${m.name}»: el refilado de ${mm(m.trimMm)} mm por lado no deja medida útil; revisá el perfil de maderera.`),
  ...materials.filter(m=>m.oversize.length).map(m=>{const {length,width}=usableOf(m);return `«${m.name}»: ${plural(m.oversize.length,'pieza no entra','piezas no entran')} en la medida útil de ${mm(length)} × ${mm(width)} mm (después del refilado): ${m.oversize.slice(0,4).map(p=>`${p.detail.trim()||'Sin detalle'} ${mm(p.base)} × ${mm(p.height)} mm`).join('; ')}${m.oversize.length>4?` y ${m.oversize.length-4} más`:''}.`;}),
  ...(skippedCount?[`${plural(skippedCount,'pieza incluida queda','piezas incluidas quedan')} fuera de la optimización: ${[skipped.noBoard?plural(skipped.noBoard,'sin placa','sin placa'):'',skipped.noSize?plural(skipped.noSize,'sin ejes o medidas','sin ejes o medidas'):'',skipped.notRectangular?plural(skipped.notRectangular,'no rectangular','no rectangulares'):''].filter(Boolean).join(', ')}. Resolvelas en «Problemas del pedido».`]:[]),
 ];
 return <section className="workshop-optim" aria-labelledby="workshop-optim-title"><h3 id="workshop-optim-title">Optimización de placas</h3>
  <p className="workshop-optim-note"><strong>Optimización estimada.</strong> Cortes de lado a lado (guillotina), con refilado de {mm(result.trimMm)} mm por lado y disco (kerf) de {mm(result.kerfMm)} mm {source.kind==='profile'?`del perfil «${source.name}» v ${source.version}`:'sugeridos: no hay perfil de maderera en uso'}. Las piezas con veta o con «mantener orientación» no se giran. La maderera puede optimizar distinto: confirmá con ella la cantidad de placas.</p>
  {materials.length?<div className="material-review-table"><table className="workshop-optim-table"><caption className="workshop-sr-only">Optimización de placas por material</caption><thead><tr><th scope="col">Placa</th><th scope="col" className="workshop-num">Formato</th><th scope="col" className="workshop-num">Piezas</th><th scope="col" className="workshop-num">Placas</th><th scope="col" className="workshop-num">Aprovechamiento</th><th scope="col" className="workshop-num">m² netos</th><th scope="col" className="workshop-num">m² comprados</th><th scope="col" className="workshop-num">Costo estimado</th></tr></thead>
   <tbody>{materials.map(m=><tr key={m.materialId} className={m.status!=='ok'||m.oversize.length?'is-pending':undefined}><th scope="row">{m.name}<small>{m.sku||'Sin SKU'} · {m.thicknessMm===null?'espesor sin cargar':`${mm(m.thicknessMm)} mm`} · {m.grain?'con veta':m.grain===false?'sin veta':'veta sin cargar'}</small></th>
    <td className="workshop-num">{m.lengthMm&&m.widthMm?`${mm(m.lengthMm)} × ${mm(m.widthMm)} mm`:'Sin formato'}</td><td className="workshop-num">{m.pieces}</td>
    {m.status==='ok'?<><td className="workshop-num">{m.sheets.length}</td><td className="workshop-num">{m.utilization===null?'—':percent.format(m.utilization)}</td><td className="workshop-num">{area.format(m.sheets.reduce((s,sheet)=>s+sheet.usedMm2,0)/1e6)}</td><td className="workshop-num">{area.format(m.boughtM2)}</td><Cost material={m} today={today} ageDays={ageDays}/></>:<td colSpan={5} className="is-pending">{m.status==='no_format'?'Sin optimizar: falta el formato de la placa':'Sin optimizar: el refilado no deja medida útil'}</td>}</tr>)}</tbody>
   {ok.length>1&&<tfoot><tr><th scope="row">Total</th><td/><td className="workshop-num">{ok.reduce((sum,m)=>sum+m.pieces-m.oversize.length,0)}</td><td className="workshop-num">{sheets}</td><td className="workshop-num">{bought?percent.format(net/bought):'—'}</td><td className="workshop-num">{area.format(net)}</td><td className="workshop-num">{area.format(bought)}</td><td className="workshop-num">{moneyTotals(costs)||'Sin precios vigentes'}</td></tr></tfoot>}</table></div>
   :<p className="workshop-hint">Todavía no hay piezas con placa y medidas para optimizar.</p>}
  {!!notes.length&&<ul className="workshop-optim-warnings" aria-label="Avisos de la optimización">{notes.map(text=><li key={text}>{text}</li>)}</ul>}
  {ok.filter(m=>m.sheets.length).map(m=><section key={m.materialId} className="workshop-optim-material" aria-labelledby={`workshop-optim-${m.materialId}`}>
   <h4 id={`workshop-optim-${m.materialId}`}>Diagramas · {m.name} · {plural(m.sheets.length,'placa','placas')}</h4>
   <div className="workshop-sheets">{m.layouts.map(group=><SheetDiagram key={group.sheetNumbers[0]} material={m} group={group} total={m.sheets.length}/>)}</div>
   <div className="material-review-table"><table className="workshop-optim-table workshop-optim-legend"><caption>Leyenda de {m.name}: piezas iguales comparten letra</caption><thead><tr><th scope="col">Letra</th><th scope="col" className="workshop-num">Base × altura</th><th scope="col" className="workshop-num">Cantidad</th><th scope="col">Piezas</th></tr></thead>
    <tbody>{(placed=>m.legend.filter(entry=>placed.has(entry.key)).map(entry=><tr key={entry.key}><th scope="row">{entry.key}</th><td className="workshop-num">{mm(entry.base)} × {mm(entry.height)} mm</td><td className="workshop-num">{placed.get(entry.key)}</td><td>{listDetails(entry.details)}</td></tr>))(placedCount(m))}</tbody></table></div>
   {m.grain&&<p className="workshop-hint">Veta a lo largo de la placa ({mm(m.lengthMm!)} mm): las piezas mantienen su base en ese sentido. En celeste, las piezas giradas.</p>}
   {!m.grain&&<p className="workshop-hint">En celeste, las piezas giradas (solo las que permiten giro, sin veta y con cantos simétricos).</p>}
  </section>)}
 </section>;
}
