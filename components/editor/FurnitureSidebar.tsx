import ArrowIcon from './ArrowIcon';
import type { Furniture } from '@/lib/model';

export default function FurnitureSidebar({furniture,selectedId,locked,onSelect}:{furniture:Furniture[];selectedId:string;locked:boolean;onSelect:(item:Furniture)=>void}){
  return <aside className="furniture-sidebar" aria-label="Muebles del proyecto"><div className="section-caption">MUEBLES <span>{furniture.length.toString().padStart(2,'0')}</span></div>
    {furniture.map((item,i)=><button key={item.id} className={`furniture-card ${item.id===selectedId?'active':''}`} aria-current={item.id===selectedId?'true':undefined} disabled={locked} onClick={()=>onSelect(item)}><span className="furniture-icon" aria-hidden="true">{i===0?'▤':'⊓'}</span><span><strong>{item.name}</strong><small>{item.pieces.length} piezas · Hoja {i+1}</small></span><span aria-hidden="true">›</span></button>)}
    <div className="sidebar-help"><span><ArrowIcon/></span><strong>Listo para el banco</strong><p>Cada mueble sale en su propia hoja A4 horizontal.</p></div>
  </aside>;
}
