import { useEffect, useRef } from 'react';
import ArrowIcon from './ArrowIcon';
import type { Furniture, Piece, Project } from '@/lib/model';

type Note=Furniture['notes'][number];
type Props={
  project:Project; furniture?:Furniture; piece?:Piece; note?:Note; noteId:string; codes:Map<string,string>; locked:boolean; busy:boolean; exportBlocked:boolean;
  onAdd:()=>void; onSelect:(id:string)=>void; onText:(text:string)=>void; onReanchor:()=>void; onDelete:()=>void; onExport:()=>void;
};

export default function NotesPanel({project,furniture:f,piece,note,noteId,codes,locked,busy,exportBlocked,onAdd,onSelect,onText,onReanchor,onDelete,onExport}:Props){
  const notes=f?.notes||[];
  const addButton=useRef<HTMLButtonElement>(null),text=useRef<HTMLTextAreaElement>(null),count=useRef(notes.length),heading=useRef<HTMLHeadingElement>(null),items=useRef(new Map<string,HTMLButtonElement>());
  // Al eliminar, el botón con foco desaparece: se pasa a la nota siguiente (o la anterior) y, si no queda ninguna, a «Agregar nota».
  const refocus=useRef<string|null|undefined>(undefined);
  // Al crear una nota, el foco va al comentario con el texto sugerido seleccionado para reemplazarlo al tipear.
  useEffect(()=>{
    const added=notes.length>count.current;count.current=notes.length;
    if(added&&text.current){text.current.focus();text.current.select();return;}
    if(refocus.current===undefined)return;
    const target=refocus.current?items.current.get(refocus.current):addButton.current;refocus.current=undefined;
    if(target&&!target.disabled)target.focus();else heading.current?.focus();
  },[notes.length]);
  function remove(){const i=notes.findIndex(n=>n.id===noteId),rest=notes.filter(n=>n.id!==noteId);refocus.current=rest[Math.min(i,rest.length-1)]?.id??null;onDelete();}
  return <aside className="notes-panel" aria-label="Notas de armado"><div className="panel-heading"><div><p className="eyebrow">INDICACIONES DEL TALLER</p><h2 ref={heading} tabIndex={-1}>Notas de armado</h2></div><span className="count">{notes.length}</span></div>
    <p className="fine">Flechas vinculadas a una pieza concreta. Arrastrá la tarjeta sobre la vista para moverla.</p>
    <button ref={addButton} className="button outline full" disabled={!piece||locked||notes.length>=40} onClick={onAdd}>+ Agregar nota a {piece?codes.get(piece.id):undefined}</button>
    {!notes.length&&<div className="notes-empty"><span><ArrowIcon/></span><strong>El detalle hace la diferencia</strong><p>Seleccioná una pieza y agregá una indicación para el armador.</p></div>}
    {notes.map(n=><button key={n.id} ref={el=>{if(el)items.current.set(n.id,el);else items.current.delete(n.id);}} className={`note-list-item ${n.id===noteId?'active':''}`} aria-current={n.id===noteId?'true':undefined} onClick={()=>onSelect(n.id)}><span>{codes.get(n.pieceId)} ↗</span><p>{n.text}</p></button>)}
    {note&&<div className="note-editor"><label htmlFor="note-text">Comentario</label><textarea ref={text} id="note-text" aria-label="Comentario" maxLength={200} rows={5} value={note.text} onChange={e=>onText(e.target.value)}/><small>{note.text.length}/200 caracteres</small><button className="text-button" onClick={onReanchor}>↗ Cambiar anclaje a una pieza</button><button className="text-button danger" onClick={remove}>Eliminar nota</button></div>}
    <div className="export-card"><p className="eyebrow">SALIDA DE TALLER</p><strong>Una hoja. Todo el mueble.</strong><p>Vistas configurables · Una tabla<br/>A4 horizontal · 297 × 210 mm<br/>{project.furniture.length} muebles = {project.furniture.length} hojas</p><button className="button dark full" disabled={exportBlocked} onClick={onExport}>{busy?'Procesando…':'↓ Exportar PDF A4'}</button></div>
  </aside>;
}
