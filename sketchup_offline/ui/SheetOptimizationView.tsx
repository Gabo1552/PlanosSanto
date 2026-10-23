import {mm} from '../../lib/model';
import {edgeToBuy,edgeTotals,formatMetres,plural} from './workshopRules';
import {usable,type BoardGroup,type LayoutGroup,type MaterialOptimization,type OrderOptimization} from './sheetOptimizer';
import type {Catalog,OrderPlan} from './WorkshopPanel';

// 0.8.20 «Maderera»: lo único que queda es lo que necesita la maderera, placa por placa (material + espesor real de la
// pieza): cuántas placas, aprovechamiento, diagramas, cantos y el botón que exporta su TXT. Sin presupuesto ni perfil.
export type BoardEdge={code:number;catalogId:string;name:string;sku:string;widthMm:number|null;metres:number};
export type BoardProblem={id:string;detail:string;reasons:string[]};
/** Placa del proyecto como la arma Ruby (SupplierOrder#boards + Workshop#boards). */
export type ProjectBoard=BoardGroup&{grain:boolean|null;edges:BoardEdge[];problems:BoardProblem[];blocker:string|null;edgeNotes:number;fileName:string};
export type OutsidePiece={id:string;detail:string;reason:'excluded'|'not_rectangular'|'no_board'|'no_axes'};

const percent=new Intl.NumberFormat('es-AR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}),area=new Intl.NumberFormat('es-AR',{minimumFractionDigits:3,maximumFractionDigits:3});
/** «Melamina Blanca · 18 mm»: así se nombra una placa en pantalla, en los avisos y en el botón de su TXT. */
export const boardLabel=(board:{name:string;thicknessMm:number})=>`${board.name} · ${mm(board.thicknessMm)} mm`;
const usableOf=(m:MaterialOptimization)=>usable({lengthMm:m.lengthMm??0,widthMm:m.widthMm??0,trimMm:m.trimMm,kerfMm:m.kerfMm});
/** Cuántas piezas de cada letra quedaron ubicadas en placas. */
const placedCount=(m:MaterialOptimization)=>{const out=new Map<string,number>();for(const sheet of m.sheets)for(const p of sheet.placements){const key=m.keys[p.id];out.set(key,(out.get(key)||0)+1);}return out;};
const sheetNames=(numbers:number[])=>numbers.length===1?`Placa ${numbers[0]}`:`Placas ${numbers.join(', ')} (iguales, ×${numbers.length})`;
const names=(list:string[],max=3)=>{const named=list.map(d=>d.trim()||'Sin detalle');return named.length>max?`${named.slice(0,max).join(', ')} y ${named.length-max} más`:named.join(', ');};
const domId=(key:string)=>`workshop-board-${key.replace(/[^a-zA-Z0-9-]/g,'-')}`;
/** Una placa sin problemas ni bloqueo exporta su TXT. */
export const boardReady=(board:Pick<ProjectBoard,'problems'|'blocker'>)=>!board.problems.length&&!board.blocker;

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

type BoardProps={material:MaterialOptimization;board:ProjectBoard;busy:boolean;exporting:boolean;onExport:(board:ProjectBoard)=>void;onHighlight:(id:string)=>void};
/** Una placa del proyecto: cifras, cantos para el portal, avisos, su TXT y sus diagramas. */
function BoardSection({material:m,board,busy,exporting,onExport,onHighlight}:BoardProps){
 const id=domId(board.key),label=boardLabel(board),ready=boardReady(board),{length,width}=usableOf(m);
 const notes=[
  ...(m.status==='no_format'?['Falta el formato de la placa (largo y ancho) en Materiales: no se optimiza.']:[]),
  ...(m.status==='no_usable'?[`El refilado de ${mm(m.trimMm)} mm por lado no deja medida útil en esta placa.`]:[]),
  ...(m.oversize.length?[`${plural(m.oversize.length,'pieza no entra','piezas no entran')} en la medida útil de ${mm(length)} × ${mm(width)} mm (después del refilado): ${m.oversize.slice(0,4).map(p=>`${p.detail.trim()||'Sin detalle'} ${mm(p.base)} × ${mm(p.height)} mm`).join('; ')}${m.oversize.length>4?` y ${m.oversize.length-4} más`:''}. Confirmalo con la maderera.`]:[]),
  ...(m.unsized?[`${plural(m.unsized,'pieza no tiene','piezas no tienen')} base y altura: no se optimiza${m.unsized===1?'':'n'}.`]:[]),
  ...(board.edgeNotes?[`${plural(board.edgeNotes,'pieza tiene','piezas tienen')} algún canto pintado que no se pudo leer o que no está vinculado a un canto de Materiales: ese lado va sin canto en el TXT. Revisalo en Piezas.`]:[]),
 ];
 return <section className="workshop-board" aria-labelledby={`${id}-title`}>
  <div className="workshop-board-head"><div><h3 id={`${id}-title`}>{label}</h3><p className="workshop-hint">{board.sku||'Sin SKU'} · {m.lengthMm&&m.widthMm?`placa de ${mm(m.lengthMm)} × ${mm(m.widthMm)} mm`:'sin formato'} · {m.grain?'con veta a lo largo':m.grain===false?'sin veta':'veta sin cargar'}</p></div>
   <div className="workshop-board-export"><button className="workshop-primary" disabled={busy||!ready} aria-label={`Exportar TXT de ${label}`} aria-describedby={`${id}-file`} aria-busy={exporting||undefined} onClick={()=>onExport(board)}>{exporting?'Exportando TXT…':'Exportar TXT…'}</button><small id={`${id}-file`}>{ready?`Archivo: ${board.fileName}`:'No se puede exportar: resolvé los problemas de abajo.'}</small></div></div>
  <dl className="workshop-figures">
   <div><dt>Placas</dt><dd>{m.status==='ok'?m.sheets.length:'—'}<small>{m.lengthMm&&m.widthMm?`de ${mm(m.lengthMm)} × ${mm(m.widthMm)} mm`:'Sin formato'}</small></dd></div>
   <div><dt>Aprovechamiento</dt><dd>{m.utilization===null?'—':percent.format(m.utilization)}<small>{area.format(m.netM2)} m² netos de {area.format(m.boughtM2)} m²</small></dd></div>
   <div><dt>Piezas</dt><dd>{m.pieces+m.unsized}<small>{m.rotatable?`${plural(m.rotatable,'se puede girar','se pueden girar')} (rota 1)`:'Todas con rota 0'}</small></dd></div>
  </dl>
  <div className="workshop-board-edges"><strong>Cantos de esta placa</strong>{board.edges.length?<ul aria-label={`Cantos de ${label}`}>{board.edges.map(edge=><li key={edge.catalogId}><span className="workshop-badge is-ok">Canto {edge.code}</span> {edge.name} · {edge.sku||'Sin SKU'}{edge.widthMm?` · ancho ${mm(edge.widthMm)} mm`:''} · {formatMetres(edge.metres)} m</li>)}</ul>:<p className="workshop-hint">Sin cantos: en el TXT todos los lados van con 0.</p>}
   {!!board.edges.length&&<small className="workshop-hint">En el TXT, 1 y 2 son estos cantos de la placa: elegilos así en el portal de la maderera.</small>}</div>
  {board.blocker&&<p className="warning workshop-board-blocker">{board.blocker}</p>}
  {!!board.problems.length&&<div className="workshop-blocked"><p className="warning">{plural(board.problems.length,'pieza tiene problemas que impiden','piezas tienen problemas que impiden')} exportar esta placa. Corregilos en el modelo o en Materiales y tocá «Actualizar desde el modelo».</p>
   <ul aria-label={`Problemas de ${label}`}>{board.problems.map(problem=><li key={problem.id}><div><strong>{problem.detail||'Sin detalle'} · {problem.id}</strong><ul className="workshop-reasons">{problem.reasons.map(reason=><li key={reason} className="workshop-reason">{reason}</li>)}</ul></div><div className="workshop-blocked-actions"><button disabled={busy} aria-label={`Ver en el modelo ${problem.detail} · ${problem.id}`} onClick={()=>onHighlight(problem.id)}>Ver en el modelo</button></div></li>)}</ul></div>}
  {!!notes.length&&<ul className="workshop-optim-warnings" aria-label={`Avisos de ${label}`}>{notes.map(text=><li key={text}>{text}</li>)}</ul>}
  {m.status==='ok'&&!!m.sheets.length&&<>
   <h4>Diagramas · {plural(m.sheets.length,'placa','placas')}</h4>
   <div className="workshop-sheets">{m.layouts.map(group=><SheetDiagram key={group.sheetNumbers[0]} material={m} group={group} total={m.sheets.length}/>)}</div>
   <div className="material-review-table"><table className="workshop-optim-table workshop-optim-legend"><caption>Leyenda de {label}: piezas iguales comparten letra</caption><thead><tr><th scope="col">Letra</th><th scope="col" className="workshop-num">Base × altura</th><th scope="col" className="workshop-num">Cantidad</th><th scope="col">Piezas</th></tr></thead>
    <tbody>{(placed=>m.legend.filter(entry=>placed.has(entry.key)).map(entry=><tr key={entry.key}><th scope="row">{entry.key}</th><td className="workshop-num">{mm(entry.base)} × {mm(entry.height)} mm</td><td className="workshop-num">{placed.get(entry.key)}</td><td>{names(entry.details)}</td></tr>))(placedCount(m))}</tbody></table></div>
   <p className="workshop-hint">{m.grain?`Veta a lo largo de la placa (${mm(m.lengthMm!)} mm): las piezas mantienen su base en ese sentido.`:'En celeste, las piezas giradas.'}</p>
  </>}
 </section>;
}

type Props={result:OrderOptimization;boards:ProjectBoard[];busy:boolean;exporting:string;onExport:(board:ProjectBoard)=>void;onHighlight:(id:string)=>void};
/** Resumen de todas las placas del proyecto y una sección por placa. */
export default function SheetOptimizationView({result,boards,busy,exporting,onExport,onHighlight}:Props){
 const byKey=new Map(boards.map(board=>[board.key,board])),materials=result.materials.filter(m=>byKey.has(m.key)),ok=materials.filter(m=>m.status==='ok');
 const sheets=ok.reduce((sum,m)=>sum+m.sheets.length,0),net=ok.reduce((sum,m)=>sum+m.sheets.reduce((s,sheet)=>s+sheet.usedMm2,0)/1e6,0),bought=ok.reduce((sum,m)=>sum+m.boughtM2,0);
 return <section className="workshop-optim" aria-labelledby="workshop-optim-title"><h3 id="workshop-optim-title">Placas del proyecto</h3>
  <p className="workshop-optim-note"><strong>Optimización estimada.</strong> Cortes de lado a lado (guillotina), con disco de {mm(result.kerfMm)} mm y refilado de {mm(result.trimMm)} mm por lado. Las piezas de placas con veta no se giran{result.allowRotate?'; en las placas sin veta se giran las piezas con cantos simétricos':''}. La maderera puede optimizar distinto: confirmá con ella la cantidad de placas. El TXT lleva las medidas de las piezas, no las del diagrama.</p>
  {materials.length?<div className="material-review-table"><table className="workshop-optim-table"><caption className="workshop-sr-only">Resumen por placa: material y espesor</caption><thead><tr><th scope="col">Placa</th><th scope="col" className="workshop-num">Formato</th><th scope="col" className="workshop-num">Piezas</th><th scope="col" className="workshop-num">Placas</th><th scope="col" className="workshop-num">Aprovechamiento</th><th scope="col" className="workshop-num">m² netos</th><th scope="col" className="workshop-num">m² comprados</th><th scope="col">TXT</th></tr></thead>
   <tbody>{materials.map(m=>{const board=byKey.get(m.key)!,ready=boardReady(board);return <tr key={m.key} className={m.status!=='ok'||m.oversize.length||!ready?'is-pending':undefined}><th scope="row">{boardLabel(m)}<small>{m.sku||'Sin SKU'} · {m.grain?'con veta':m.grain===false?'sin veta':'veta sin cargar'}</small></th>
    <td className="workshop-num">{m.lengthMm&&m.widthMm?`${mm(m.lengthMm)} × ${mm(m.widthMm)} mm`:'Sin formato'}</td><td className="workshop-num">{m.pieces+m.unsized}</td>
    {m.status==='ok'?<><td className="workshop-num">{m.sheets.length}</td><td className="workshop-num">{m.utilization===null?'—':percent.format(m.utilization)}</td><td className="workshop-num">{area.format(m.sheets.reduce((s,sheet)=>s+sheet.usedMm2,0)/1e6)}</td><td className="workshop-num">{area.format(m.boughtM2)}</td></>:<td colSpan={4} className="is-pending">{m.status==='no_format'?'Sin optimizar: falta el formato de la placa':'Sin optimizar: el refilado no deja medida útil'}</td>}
    <td>{ready?'Listo':'Con problemas'}</td></tr>;})}</tbody>
   {ok.length>1&&<tfoot><tr><th scope="row">Total</th><td/><td className="workshop-num">{materials.reduce((sum,m)=>sum+m.pieces+m.unsized,0)}</td><td className="workshop-num">{sheets}</td><td className="workshop-num">{bought?percent.format(net/bought):'—'}</td><td className="workshop-num">{area.format(net)}</td><td className="workshop-num">{area.format(bought)}</td><td/></tr></tfoot>}</table></div>
   :<p className="workshop-hint">Todavía no hay piezas pintadas con placas de Materiales. Pintalas y tocá «Actualizar desde el modelo».</p>}
  {materials.map(m=><BoardSection key={m.key} material={m} board={byKey.get(m.key)!} busy={busy} exporting={exporting===m.key} onExport={onExport} onHighlight={onHighlight}/>)}
 </section>;
}

/** Total de cantos de todo el proyecto por material de canto: metros netos de las piezas y metros enteros a comprar. */
export function EdgeTotalsView({plan,catalog}:{plan:Pick<OrderPlan,'rows'|'geometry'>;catalog:Catalog}){
 const {lines,missing,unassigned}=edgeTotals(plan,catalog);
 return <section className="workshop-edges" aria-labelledby="workshop-edges-title"><h3 id="workshop-edges-title">Total de cantos del proyecto</h3>
  {lines.length?<div className="material-review-table"><table className="workshop-estimate-table"><caption className="workshop-sr-only">Cantos del proyecto: metros por material de canto</caption><thead><tr><th scope="col">Canto</th><th scope="col" className="workshop-num">Metros netos</th><th scope="col" className="workshop-num">A comprar</th><th scope="col" className="workshop-num">Lados</th><th scope="col" className="workshop-num">Piezas</th></tr></thead>
   <tbody>{lines.map(line=><tr key={line.id}><th scope="row">{line.label}<small>{line.sku}</small></th><td className="workshop-num">{formatMetres(line.metres)} m</td><td className="workshop-num">{plural(edgeToBuy(line.metres),'metro','metros')}</td><td className="workshop-num">{line.sides}</td><td className="workshop-num">{line.pieces}</td></tr>)}</tbody></table></div>:<p className="workshop-hint">Todavía no hay lados con un canto de Materiales.</p>}
  {(!!missing||!!unassigned)&&<ul className="workshop-edges-notes">{!!missing&&<li>{plural(missing,'pieza con cantos no se cuenta','piezas con cantos no se cuentan')}: faltan sus medidas.</li>}{!!unassigned&&<li>{plural(unassigned,'pieza tiene','piezas tienen')} lados con canto sin producto de Materiales.</li>}</ul>}
  <p className="workshop-footnote">Metros netos con las medidas de las piezas: arriba y abajo suman la base, izquierda y derecha la altura. Sin margen de desperdicio; a comprar, redondeado al metro entero.</p>
 </section>;
}

const outsideText:Record<OutsidePiece['reason'],[string,string]>={
 no_board:['pieza sin placa de Materiales','piezas sin placa de Materiales'],
 not_rectangular:['pieza no rectangular','piezas no rectangulares'],
 no_axes:['pieza sin base ni altura','piezas sin base ni altura'],
 excluded:['pieza excluida','piezas excluidas'],
};
const outsideHelp:Record<OutsidePiece['reason'],string>={no_board:'Pintalas con una sola placa de Materiales.',not_rectangular:'No se pueden pedir como placa rectangular.',no_axes:'Revisalas en Piezas.',excluded:'Se excluyeron a mano en una versión anterior.'};
/** Piezas de los muebles analizados que no van a ninguna placa, con el motivo. */
export function OutsideView({items}:{items:OutsidePiece[]}){
 if(!items.length)return null;
 const reasons=(Object.keys(outsideText) as OutsidePiece['reason'][]).filter(reason=>items.some(item=>item.reason===reason));
 return <section className="workshop-outside" aria-labelledby="workshop-outside-title"><h3 id="workshop-outside-title">Piezas fuera de las placas</h3>
  <ul className="workshop-optim-warnings" aria-label="Piezas fuera de las placas">{reasons.map(reason=>{const list=items.filter(item=>item.reason===reason);return <li key={reason}>{list.length} {outsideText[reason][list.length===1?0:1]}: {names(list.map(item=>item.detail),4)}. {outsideHelp[reason]}</li>;})}</ul>
 </section>;
}
