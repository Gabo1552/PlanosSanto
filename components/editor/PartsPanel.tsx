import { renamePieceGroup, type pieceRows } from '@/lib/pieceGroups';
import { mm, type Furniture } from '@/lib/model';

type Row=ReturnType<typeof pieceRows>[number];

export default function PartsPanel({furniture:f,rows,pieceId,locked,onSelect,onEdit}:{furniture:Furniture;rows:Row[];pieceId:string;locked:boolean;onSelect:(id:string)=>void;onEdit:(fn:(f:Furniture)=>void)=>void}){
  return <section className="parts-panel">
    <div className="panel-heading"><div><p className="eyebrow">DESPIECE DEL MUEBLE</p><h2>Listado de piezas <span className="count">{f.pieces.length}</span></h2></div><label className="fine"><input type="checkbox" aria-label="Agrupar componentes iguales" checked={f.groupIdentical||false} disabled={locked} onChange={e=>onEdit(f=>{f.groupIdentical=e.target.checked;})}/> Agrupar componentes iguales</label></div>
    <div className="table-scroll"><table><thead><tr><th>ID</th><th>Pieza / nombre editable</th><th>Largo</th><th>Ancho</th><th>Espesor</th><th>Cant.</th></tr></thead><tbody>
      {rows.map(p=><tr key={p.id} className={p.memberIds.includes(pieceId)?'selected-row':''} onClick={()=>onSelect(p.id)}>
        <td><button className="piece-code" onClick={()=>onSelect(p.id)} aria-label={`Elegir ${p.code}`}>{p.code}</button></td>
        <td><input aria-label={`Nombre ${p.code}`} value={p.name} maxLength={80} onChange={e=>onEdit(f=>{Object.assign(f,renamePieceGroup(f,p.id,e.target.value));})}/>{p.warnings.map(w=><small className="dimension-warning" key={w}>{w}</small>)}</td>
        {p.dimensions.map((n,i)=><td key={i}>{mm(n)}</td>)}<td>{p.quantity}</td>
      </tr>)}
    </tbody></table></div>
    <p className="table-footnote">{f.groupIdentical?'Los componentes iguales comparten ID y un nombre de referencia en la tabla. Agrupar conserva los nombres originales; editar una fila cambia todas sus piezas.':'Cada código identifica una instancia física. Podés agrupar componentes de igual definición, medidas y material.'}</p>
  </section>;
}
