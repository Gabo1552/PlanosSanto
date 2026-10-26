import {useEffect,useRef,useState,type ReactNode} from 'react';
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
const usableOf=(m:MaterialOptimization)=>m.trimMode==='total'?{length:(m.lengthMm??0)-m.trimMm,width:(m.widthMm??0)-m.trimMm}:usable({lengthMm:m.lengthMm??0,widthMm:m.widthMm??0,trimMm:m.trimMm,kerfMm:m.kerfMm});
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
     {size>=font*.25&&<text x={p.x+p.w/2} y={p.y+p.h/2-(showDims?small*.6:0)} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight="700" fill="#14382f">{key}{p.rotated?' ↻':''}</text>}
     {showDims&&<text x={p.x+p.w/2} y={p.y+p.h/2+size*.55} textAnchor="middle" dominantBaseline="middle" fontSize={small} fill="#33463f">{dims}</text>}</g>;})}
  </svg>
  <figcaption><strong>{name}</strong> · {plural(count,'pieza','piezas')} · aprovechamiento {percent.format(used)}</figcaption>
 </figure>;
}

type BoardProps={material:MaterialOptimization;board:ProjectBoard;busy:boolean;exporting:boolean;onExport:(board:ProjectBoard)=>void;onHighlight:(id:string)=>void};
/** Una placa del proyecto: cifras, cantos para el portal, avisos, su TXT y sus diagramas. */
function BoardSection({material:m,board,busy,exporting,onExport,onHighlight}:BoardProps){
 const [layoutIndex,setLayoutIndex]=useState(0),[zoom,setZoom]=useState(1);
 const activeIndex=Math.min(layoutIndex,Math.max(0,m.layouts.length-1));
 const id=domId(board.key),label=boardLabel(board),ready=boardReady(board)&&!(m.method==='experto'&&m.status!=='ok'),{length,width}=usableOf(m);
 const notes=[
  ...(m.errors||[]),...(m.warnings||[]),
  ...(m.status==='no_format'?['Falta el formato de la placa (largo y ancho) en Materiales: no se optimiza.']:[]),
  ...(m.status==='no_usable'?[`El refilado de ${mm(m.trimMm)} mm ${m.trimMode==='total'?'total por eje':'por lado'} no deja medida útil en esta placa.`]:[]),
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
   {m.status==='ok'&&m.method==='experto'&&m.sawMetres!==undefined&&<div><dt>Recorrido de sierra estimado</dt><dd>{formatMetres(m.sawMetres)} m<small>{m.estimatedSawSteps!==undefined?`${m.estimatedSawSteps} pasos estimados`:''} · confirmar con la maderera</small></dd></div>}
  </dl>
  <div className="workshop-board-edges"><strong>Cantos de esta placa</strong>{board.edges.length?<ul aria-label={`Cantos de ${label}`}>{board.edges.map(edge=><li key={edge.catalogId}><span className="workshop-badge is-ok">Canto {edge.code}</span> {edge.name} · {edge.sku||'Sin SKU'}{edge.widthMm?` · ancho ${mm(edge.widthMm)} mm`:''} · {formatMetres(edge.metres)} m</li>)}</ul>:<p className="workshop-hint">Sin cantos: en el TXT todos los lados van con 0.</p>}
   {!!board.edges.length&&<small className="workshop-hint">En el TXT, 1 y 2 son estos cantos de la placa: elegilos así en el portal de la maderera.</small>}</div>
  {board.blocker&&<p className="warning workshop-board-blocker">{board.blocker}</p>}
  {!!board.problems.length&&<div className="workshop-blocked"><p className="warning">{plural(board.problems.length,'pieza tiene problemas que impiden','piezas tienen problemas que impiden')} exportar esta placa. Corregilos en el modelo o en Materiales y tocá «Actualizar desde el modelo».</p>
   <ul aria-label={`Problemas de ${label}`}>{board.problems.map(problem=><li key={problem.id}><div><strong>{problem.detail||'Sin detalle'} · {problem.id}</strong><ul className="workshop-reasons">{problem.reasons.map(reason=><li key={reason} className="workshop-reason">{reason}</li>)}</ul></div><div className="workshop-blocked-actions"><button disabled={busy} aria-label={`Ver en el modelo ${problem.detail} · ${problem.id}`} onClick={()=>onHighlight(problem.id)}>Ver en el modelo</button></div></li>)}</ul></div>}
  {!!notes.length&&<ul className="workshop-optim-warnings" aria-label={`Avisos de ${label}`}>{notes.map(text=><li key={text}>{text}</li>)}</ul>}
  {m.status==='ok'&&!!m.sheets.length&&<>
   <p className="workshop-utilization" aria-label="Área aprovechada y desperdicio"><span style={{width:`${Math.max(0,Math.min(100,(m.utilization??0)*100))}%`}}/><strong>{percent.format(m.utilization??0)} aprovechado · {percent.format(1-(m.utilization??0))} sobrante y corte</strong></p><h4>Diagramas · {plural(m.sheets.length,'placa','placas')}</h4>
   <div className="workshop-diagram-tools" aria-label="Navegar placas"><button disabled={activeIndex===0} onClick={()=>setLayoutIndex(activeIndex-1)} aria-label="Placa anterior">← Anterior</button><label>Distribución <select aria-label="Distribución de placas" value={activeIndex} onChange={e=>setLayoutIndex(Number(e.target.value))}>{m.layouts.map((group,index)=><option key={index} value={index}>{index+1} de {m.layouts.length} · placas {group.sheetNumbers.join(', ')}</option>)}</select></label><button disabled={activeIndex===m.layouts.length-1} onClick={()=>setLayoutIndex(activeIndex+1)} aria-label="Placa siguiente">Siguiente →</button><label>Vista <select aria-label="Ampliación del diagrama" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Ajustar</option><option value={1.5}>150 %</option><option value={2}>200 %</option></select></label></div>
   <div className={`workshop-diagram-viewport${zoom===1?' is-fit':''}`} tabIndex={0} aria-label="Diagrama de corte, desplazable al ampliar"><div className="workshop-sheets" style={{width:`${zoom*100}%`}}>{m.layouts[activeIndex]&&<SheetDiagram material={m} group={m.layouts[activeIndex]} total={m.sheets.length}/>}</div></div>
   <div className="material-review-table"><table className="workshop-optim-table workshop-optim-legend"><caption>Leyenda de {label}: piezas iguales comparten letra</caption><thead><tr><th scope="col">Letra</th><th scope="col" className="workshop-num">Base × altura</th><th scope="col" className="workshop-num">Cantidad</th><th scope="col">Piezas</th></tr></thead>
    <tbody>{(placed=>m.legend.filter(entry=>placed.has(entry.key)).map(entry=><tr key={entry.key}><th scope="row">{entry.key}</th><td className="workshop-num">{mm(entry.base)} × {mm(entry.height)} mm</td><td className="workshop-num">{placed.get(entry.key)}</td><td>{names(entry.details)} <button className="workshop-piece-link" onClick={()=>{const id=m.sheets.flatMap(s=>s.placements).find(p=>m.keys[p.id]===entry.key)?.id;if(id)onHighlight(id);}} disabled={busy} aria-label={`Ver pieza ${entry.key} en SketchUp`}>Ver en el modelo</button></td></tr>))(placedCount(m))}</tbody></table></div>
   <p className="workshop-hint">{m.grain?`Veta a lo largo de la placa (${mm(m.lengthMm!)} mm): las piezas mantienen su base en ese sentido.`:'Las piezas giradas se indican en celeste y con ↻ en el diagrama.'}</p>
  </>}
 </section>;
}

type Props={result:OrderOptimization;boards:ProjectBoard[];busy:boolean;exporting:string;onExport:(board:ProjectBoard)=>void;onHighlight:(id:string)=>void;renderSettings?:(materialKey:string)=>ReactNode;methodLabel?:string;outsideCount?:number;target?:{catalogId:string;thicknessMm:number;sequence:number}};
/** Resumen por material y espesor; solo se abre el despiece elegido. */
export default function SheetOptimizationView({result,boards,busy,exporting,onExport,onHighlight,renderSettings,methodLabel='General',outsideCount=0,target}:Props){
 const [query,setQuery]=useState(''),[targetNotice,setTargetNotice]=useState('');
 const handledTarget=useRef<number|undefined>(undefined);
 const [selected,setSelected]=useState<string|null>(null),back=useRef<HTMLButtonElement>(null),cards=useRef(new Map<string,HTMLButtonElement>());
 const byKey=new Map(boards.map(board=>[board.key,board])),materials=result.materials.filter(m=>byKey.has(m.key)),ok=materials.filter(m=>m.status==='ok');
 const visibleMaterials=materials.filter(m=>`${m.name} ${m.sku} ${m.thicknessMm}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
 const current=materials.find(m=>m.key===selected),sheets=ok.reduce((sum,m)=>sum+m.sheets.length,0),net=ok.reduce((sum,m)=>sum+m.sheets.reduce((s,sheet)=>s+sheet.usedMm2,0)/1e6,0),bought=ok.reduce((sum,m)=>sum+m.boughtM2,0);
 useEffect(()=>{
  if(!target||busy||handledTarget.current===target.sequence)return;
  const match=result.materials.find(m=>m.materialId===target.catalogId&&Math.abs(m.thicknessMm-target.thicknessMm)<0.01);
  handledTarget.current=target.sequence;
  if(match){setSelected(match.key);requestAnimationFrame(()=>back.current?.focus());setTargetNotice('');}
  else setTargetNotice('Ese material y espesor todavía no tiene una optimización. Actualizá desde el modelo y revisá su ficha.');
 },[target,busy,result]);
 function open(key:string){setSelected(key);requestAnimationFrame(()=>back.current?.focus());}
 function close(){const key=selected;setSelected(null);requestAnimationFrame(()=>key&&cards.current.get(key)?.focus());}
 return <section className="workshop-optim" aria-labelledby="workshop-optim-title" aria-busy={busy}>
  <div className="workshop-optim-heading"><div><h3 id="workshop-optim-title">Placas del proyecto</h3><p className="workshop-hint">{current?'Revisá las placas, piezas y cantos de este material.':'Elegí un material para ver su optimización y preparar su TXT.'}</p></div><span className="workshop-badge">{methodLabel}</span></div>
  {targetNotice&&<p role="status">{targetNotice}</p>}
  {busy&&<p className="workshop-loading" role="status">Actualizando medidas y validaciones…</p>}
  {current?<><button ref={back} className="workshop-back" onClick={close}>← Volver a materiales</button>{renderSettings?.(current.key)}<BoardSection key={current.key} material={current} board={byKey.get(current.key)!} busy={busy} exporting={exporting===current.key} onExport={onExport} onHighlight={onHighlight}/></>:<>
   {!!materials.length&&<dl className="workshop-figures workshop-project-totals" aria-label="Totales del proyecto"><div><dt>Materiales y espesores</dt><dd>{materials.length}</dd></div><div><dt>Placas calculadas</dt><dd>{sheets}<small>{(outsideCount>0||materials.some(m=>m.status!=='ok'||m.unsized||m.oversize.length))?'Total parcial · hay piezas sin ubicar':'Según la configuración actual'}</small></dd></div><div><dt>Aprovechamiento total</dt><dd>{bought?percent.format(net/bought):'—'}<small>{area.format(net)} m² ubicados / {area.format(bought)} m² de placas</small></dd></div></dl>}
   {outsideCount>0&&<p className="workshop-hint">{plural(outsideCount,'pieza fuera del cálculo','piezas fuera del cálculo')}. Revisá los motivos en «Piezas fuera de las placas».</p>}
   {materials.length>1&&<label className="workshop-material-search">Buscar material o SKU<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, código o espesor"/></label>}
   {!!materials.length&&!visibleMaterials.length&&<p role="status">No hay materiales con esa búsqueda. <button onClick={()=>setQuery('')}>Limpiar búsqueda</button></p>}
   {materials.length?<ul className="workshop-material-grid" aria-label="Materiales y espesores del proyecto">{visibleMaterials.map(m=>{const board=byKey.get(m.key)!,ready=boardReady(board)&&!(m.method==='experto'&&m.status!=='ok'),pending=m.status!=='ok'||m.oversize.length>0||m.unsized>0||!!m.errors?.length;return <li key={m.key}><button ref={node=>{if(node)cards.current.set(m.key,node);else cards.current.delete(m.key);}} className={`workshop-material-card${m.status==='blocked'?' is-blocked':''}`} onClick={()=>open(m.key)} aria-label={`Ver optimización de ${boardLabel(m)}`}>
    <span className="workshop-material-card-top"><strong>{boardLabel(m)}</strong><span className={`workshop-badge ${!ready||pending?'is-warning':'is-ok'}`}>{!ready?'TXT bloqueado':pending?'Revisar optimización':'TXT listo'}</span></span>
    <span className="workshop-hint">{m.sku||'Sin SKU'} · {m.grain?'con veta':m.grain===false?'sin veta':'veta sin cargar'}</span>
    <span className="workshop-material-format">{m.lengthMm&&m.widthMm?`${mm(m.lengthMm)} × ${mm(m.widthMm)} mm`:'Falta el formato de placa'}</span>
    <span className="workshop-material-metrics"><span><strong>{m.pieces+m.unsized}</strong> piezas</span><span><strong>{m.status==='ok'?m.sheets.length:'—'}</strong> placas</span><span><strong>{m.utilization===null?'—':percent.format(m.utilization)}</strong> aprovechamiento</span></span>
    {(!ready||pending)&&<span className="workshop-material-reason">{board.blocker||m.errors?.[0]||(m.status==='no_format'?'Completá largo y ancho en Materiales':m.status==='no_usable'?'Revisá el refilado':m.unsized?`${plural(m.unsized,'pieza sin medidas','piezas sin medidas')}`:board.problems.length?`${plural(board.problems.length,'pieza requiere','piezas requieren')} corrección`:m.oversize.length?`${plural(m.oversize.length,'pieza sin ubicar','piezas sin ubicar')}`:'Revisá los avisos de la optimización')}</span>}
    <span className="workshop-material-open">Ver optimización y TXT <span aria-hidden="true">→</span></span>
   </button></li>;})}</ul>:<p className="workshop-hint">Todavía no hay piezas pintadas con placas de Materiales. Pintalas y tocá «Actualizar desde el modelo».</p>}
  </>}
  <details className="workshop-optim-help"><summary>Cómo leer esta estimación</summary><p className="workshop-optim-note"><strong>Optimización estimada · {methodLabel}.</strong> El cálculo respeta la veta y la configuración del material. La maderera puede optimizar distinto: confirmá con ella la cantidad de placas. El TXT lleva las medidas de las piezas, no las del diagrama.</p></details>
 </section>;
}

/** Total de cantos de todo el proyecto por material de canto: metros netos de las piezas y metros enteros a comprar. */
export function EdgeTotalsView({plan,catalog,wasteFactor=1}:{plan:Pick<OrderPlan,'rows'|'geometry'>;catalog:Catalog;wasteFactor?:number}){
 const {lines,missing,unassigned}=edgeTotals(plan,catalog);
 return <section className="workshop-edges" aria-labelledby="workshop-edges-title"><h3 id="workshop-edges-title">Total de cantos del proyecto</h3>
  {lines.length?<div className="material-review-table"><table className="workshop-estimate-table"><caption className="workshop-sr-only">Cantos del proyecto: metros por material de canto</caption><thead><tr><th scope="col">Canto</th><th scope="col" className="workshop-num">Metros netos</th><th scope="col" className="workshop-num">A comprar</th><th scope="col" className="workshop-num">Lados</th><th scope="col" className="workshop-num">Piezas</th></tr></thead>
   <tbody>{lines.map(line=><tr key={line.id}><th scope="row">{line.label}<small>{line.sku}</small></th><td className="workshop-num">{formatMetres(line.metres)} m</td><td className="workshop-num">{plural(edgeToBuy(line.metres*wasteFactor),'metro','metros')}</td><td className="workshop-num">{line.sides}</td><td className="workshop-num">{line.pieces}</td></tr>)}</tbody></table></div>:<p className="workshop-hint">Todavía no hay lados con un canto de Materiales.</p>}
  {(!!missing||!!unassigned)&&<ul className="workshop-edges-notes">{!!missing&&<li>{plural(missing,'pieza con cantos no se cuenta','piezas con cantos no se cuentan')}: faltan sus medidas.</li>}{!!unassigned&&<li>{plural(unassigned,'pieza tiene','piezas tienen')} lados con canto sin producto de Materiales.</li>}</ul>}
  <p className="workshop-footnote">Metros netos con las medidas de las piezas: arriba y abajo suman la base, izquierda y derecha la altura. {wasteFactor>1?`Incluye ${Math.round((wasteFactor-1)*100)} % de margen; a comprar, redondeado al metro entero.`:'Sin margen de desperdicio; a comprar, redondeado al metro entero.'}</p>
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
