import {useCallback,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {request} from './bridge';
import {SIDES,buildSections,codeText,edgeDescription,edgeLabel,formatM2,formatMetres,formatMm,grainSymbol,grandTotals,sectionTitle,
  type CutlistData,type CutlistEdge,type CutlistPiece,type CutlistSection} from './cutlistModel';
import './cutlist.css';

// Pestaña «Piezas»: lista de corte de los muebles generados, por material y espesor.
// Esta etapa es de solo lectura. Los puntos de extensión (renderRowActions, toolbarExtra,
// onDataLoaded) quedan para la edición en línea y la exportación que se suman después.
export type CutlistViewProps={
  /** Hay guías generadas: sin ellas no se pide nada a Ruby. */
  ready:boolean;
  /** Fuente de datos; por defecto la acción Ruby `cutlist`. */
  load?:()=>Promise<CutlistData>;
  /** Clic en una fila: id de la primera instancia del grupo (para `piece_highlight`) y la fila completa. */
  onHighlight?:(pieceId:string,piece:CutlistPiece)=>void;
  onGoToFurniture?:()=>void;
  /** Columna extra de acciones por fila (por ejemplo, edición en línea). */
  renderRowActions?:(piece:CutlistPiece)=>ReactNode;
  /** Botones extra en la barra superior (por ejemplo, exportar). */
  toolbarExtra?:(context:{data:CutlistData;sections:CutlistSection[]})=>ReactNode;
  onDataLoaded?:(data:CutlistData)=>void;
};

const defaultLoad=()=>request<CutlistData>('cutlist');
const valid=(value:unknown):value is CutlistData=>!!value&&typeof value==='object'&&Array.isArray((value as CutlistData).pieces)&&Array.isArray((value as CutlistData).sections)&&Array.isArray((value as CutlistData).furniture);
const plural=(count:number,one:string,many:string)=>`${formatMm(count)} ${count===1?one:many}`;

function EdgeChip({edge}:{edge:CutlistEdge}){
  const description=edgeDescription(edge);
  if(edge.status==='none'||edge.status==='unknown')return <span className={`cutlist-dash is-${edge.status}`} title={description}><span aria-hidden="true">—</span><span className="sr-only">{description}</span></span>;
  return <span className={`cutlist-chip is-${edge.status}`} title={description}><span aria-hidden="true">{edgeLabel(edge)}</span><span className="sr-only">{description}</span></span>;
}

export default function CutlistView({ready,load=defaultLoad,onHighlight,onGoToFurniture,renderRowActions,toolbarExtra,onDataLoaded}:CutlistViewProps){
  const [data,setData]=useState<CutlistData>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [furnitureId,setFurnitureId]=useState(''),[query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set()),[selected,setSelected]=useState('');
  const sequence=useRef(0),uid=useId();
  const refresh=useCallback(async()=>{
    if(!ready)return;
    const current=++sequence.current;setLoading(true);setError('');
    try{
      const result=await load();
      if(current!==sequence.current)return;
      if(!valid(result))throw new Error('Respuesta de piezas incompatible: actualizá la extensión.');
      setData(result);onDataLoaded?.(result);
      setFurnitureId(id=>result.furniture.some(f=>f.id===id)?id:'');
    }catch(value){if(current===sequence.current)setError(value instanceof Error?value.message:String(value));}
    finally{if(current===sequence.current)setLoading(false);}
  },[ready,load,onDataLoaded]);
  useEffect(()=>{void refresh();},[refresh]);
  const sections=useMemo(()=>data?buildSections(data,{furnitureId:furnitureId||undefined,query}):[],[data,furnitureId,query]);
  const totals=useMemo(()=>grandTotals(sections),[sections]);
  const allKeys=sections.map(section=>section.info.key);
  const anyOpen=allKeys.some(key=>!collapsed.has(key)),anyClosed=allKeys.some(key=>collapsed.has(key));
  const toggle=(key:string)=>setCollapsed(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const activate=(piece:CutlistPiece)=>{setSelected(piece.id);onHighlight?.(piece.ids[0],piece);};
  const columns=11+(renderRowActions?1:0);

  if(!ready)return <section className="cutlist cutlist-empty" aria-labelledby={`${uid}-title`}><span className="eyebrow">LISTA DE PIEZAS</span><h2 id={`${uid}-title`}>Primero generá las guías en Muebles</h2><p>La lista de piezas se arma con los muebles generados: material, espesor, medidas y cantos de cada pieza.</p>{onGoToFurniture&&<button type="button" className="primary" onClick={onGoToFurniture}>Ir a Muebles</button>}</section>;

  return <section className="cutlist" aria-labelledby={`${uid}-title`} aria-busy={loading||undefined}>
    <header className="cutlist-head">
      <div className="cutlist-heading"><span className="eyebrow">LISTA DE PIEZAS</span><h2 id={`${uid}-title`}>Piezas por material y espesor</h2>
        <p className="cutlist-totals" role="status">{data?`${plural(totals.rows,'fila','filas')} · ${plural(totals.pieces,'pieza','piezas')} · ${plural(totals.sections,'material','materiales')} · ${formatM2(totals.areaM2)} m² · ${formatMetres(totals.edgeMetres)} m de canto`:loading?'Leyendo piezas del modelo…':''}</p></div>
      <div className="cutlist-tools">
        <div className="cutlist-field"><label htmlFor={`${uid}-furniture`}>Mueble</label><select id={`${uid}-furniture`} value={furnitureId} disabled={!data} onChange={event=>setFurnitureId(event.target.value)}><option value="">Todos los muebles</option>{data?.furniture.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div className="cutlist-field cutlist-search"><label htmlFor={`${uid}-search`}>Buscar</label><input id={`${uid}-search`} type="search" value={query} placeholder="Código o nombre" disabled={!data} onChange={event=>setQuery(event.target.value)}/></div>
        <div className="cutlist-tool-buttons" role="group" aria-label="Secciones de materiales">
          <button type="button" disabled={!anyClosed} onClick={()=>setCollapsed(new Set())}>Expandir todo</button>
          <button type="button" disabled={!anyOpen} onClick={()=>setCollapsed(new Set(allKeys))}>Plegar todo</button>
          <button type="button" disabled={loading} onClick={()=>void refresh()}>Actualizar</button>
          {data&&toolbarExtra?.({data,sections})}
        </div>
      </div>
    </header>
    <p className="cutlist-readonly">Solo lectura. Las medidas salen del modelo; la placa y los cantos, de lo pintado y de la biblioteca. Hacé clic en una fila para resaltar la pieza en SketchUp.</p>
    {error&&<div role="alert" className="cutlist-error"><span>{error}</span>{/generá las guías/i.test(error)&&onGoToFurniture?<button type="button" onClick={onGoToFurniture}>Ir a Muebles</button>:<button type="button" onClick={()=>void refresh()}>Reintentar</button>}</div>}
    {data&&!data.complete&&<p className="cutlist-warning" role="note">El recorrido del modelo quedó incompleto: algunas piezas pueden faltar o mostrar materiales sin leer.</p>}
    {data&&!sections.length&&<p className="cutlist-none">{data.pieces.length?'Ninguna pieza coincide con el filtro.':'Los muebles generados no tienen piezas.'}</p>}
    <span id={`${uid}-row-hint`} className="sr-only">Resalta la pieza en SketchUp.</span>
    {sections.map(({info,pieces,totals:sum},index)=>{
      const open=!collapsed.has(info.key),bodyId=`${uid}-body-${index}`,grain=info.grain===true?'Con veta':info.grain===false?'Sin veta':undefined;
      return <section key={info.key} className={`cutlist-section is-${info.source}`} aria-labelledby={`${uid}-head-${index}`}>
        <h3 className="cutlist-section-title"><button type="button" id={`${uid}-head-${index}`} aria-expanded={open} aria-controls={bodyId} onClick={()=>toggle(info.key)}>
          <span className="cutlist-caret" aria-hidden="true">{open?'▾':'▸'}</span><span className="cutlist-section-name">{info.name}</span><span className="cutlist-section-thickness">{formatMm(info.thicknessMm)} mm</span>
          <span className="cutlist-section-count">{plural(sum.pieces,'pieza','piezas')} · {formatM2(sum.areaM2)} m²</span></button></h3>
        <ul className="cutlist-meta" aria-label={`Datos de ${sectionTitle(info)}`}>
          {info.sku&&<li><span>SKU</span> {info.sku}</li>}
          {info.format&&<li><span>Formato</span> {formatMm(info.format[0])} × {formatMm(info.format[1])} mm</li>}
          {grain&&<li><span>Veta</span> {grain}</li>}
          {info.source==='model'&&<li className="cutlist-meta-note">Material del modelo sin ficha de biblioteca</li>}
          {info.source==='mixed'&&<li className="cutlist-meta-note">Caras grandes con materiales distintos</li>}
          {info.source==='none'&&<li className="cutlist-meta-note">Pintá las caras grandes con una placa de la biblioteca</li>}
          {info.catalogThicknessMm!=null&&Math.abs(info.catalogThicknessMm-info.thicknessMm)>0.1&&<li className="cutlist-meta-note">La ficha dice {formatMm(info.catalogThicknessMm)} mm</li>}
        </ul>
        <div id={bodyId} className="cutlist-table-wrap" hidden={!open}>
          <table className="cutlist-table">
            <caption className="sr-only">Piezas de {sectionTitle(info)}</caption>
            <thead><tr><th scope="col">Código</th><th scope="col">Nombre</th><th scope="col" className="num">Cant.</th><th scope="col" className="num">Largo</th><th scope="col" className="num">Ancho</th><th scope="col" className="num">Esp.</th>
              <th scope="col" className="edge"><abbr title="Canto arriba">Arr</abbr></th><th scope="col" className="edge"><abbr title="Canto abajo">Aba</abbr></th><th scope="col" className="edge"><abbr title="Canto izquierdo">Izq</abbr></th><th scope="col" className="edge"><abbr title="Canto derecho">Der</abbr></th>
              <th scope="col" className="grain">Veta</th>{renderRowActions&&<th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>{pieces.map(piece=>{const grainInfo=grainSymbol(piece.grain);const edges=SIDES.map(side=>piece.edges.find(edge=>edge.side===side)||{side,status:'unknown' as const,lengthMm:0});
              return <tr key={piece.id} className={selected===piece.id?'is-selected':undefined} aria-current={selected===piece.id?'true':undefined} onClick={()=>activate(piece)} data-piece-id={piece.id}>
                <td className="code">{codeText(piece)}</td>
                <td className="name"><button type="button" className="cutlist-row-button" title="Resaltar en SketchUp" aria-describedby={`${uid}-row-hint`} onClick={event=>{event.stopPropagation();activate(piece);}}>{piece.name}</button>
                  {piece.furnitureName&&!furnitureId&&<span className="cutlist-furniture">{piece.furnitureName}</span>}{!piece.rectangular&&<span className="cutlist-flag">No rectangular: medidas de la caja</span>}</td>
                <td className="num qty">{piece.quantity}</td><td className="num">{formatMm(piece.lengthMm)}</td><td className="num">{formatMm(piece.widthMm)}</td><td className="num">{formatMm(piece.thicknessMm)}</td>
                {edges.map(edge=><td key={edge.side} className="edge"><EdgeChip edge={edge}/></td>)}
                <td className="grain" title={grainInfo.label}><span aria-hidden="true">{grainInfo.symbol}</span><span className="sr-only">{grainInfo.label}</span></td>
                {renderRowActions&&<td className="actions" onClick={event=>event.stopPropagation()}>{renderRowActions(piece)}</td>}
              </tr>;})}</tbody>
            <tfoot><tr><td colSpan={columns}><strong>{plural(sum.pieces,'pieza','piezas')}</strong> · {formatM2(sum.areaM2)} m² netos
              {sum.edges.length?<> · Canto: {sum.edges.map((edge,i)=><span key={edge.key} className={`cutlist-edge-total${edge.linked?'':' is-observed'}`} title={edge.name}>{i>0?', ':''}{edge.label} {formatMetres(edge.metres)} m</span>)}</>:<> · Sin canto</>}</td></tr></tfoot>
          </table>
        </div>
      </section>;
    })}
  </section>;
}
