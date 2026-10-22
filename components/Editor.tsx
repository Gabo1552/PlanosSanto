'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import ViewAdjustments,{shiftDimension,orbitCamera} from './ViewAdjustments';
import Diagram from './Diagram';
import GuideViews,{ensureGuide} from '../sketchup_offline/ui/GuideViews';
import {pieceRows,pieceCodeMap,renamePieceGroup} from '@/lib/pieceGroups';
import DimensionControls from './DimensionControls';
import {setDimensionVisible} from '@/lib/dimensions';
import RubyImport from './RubyImport';
import ImportTree from './ImportTree';
import {ApiError,fetchJson,send} from './apiError';
import Link from 'next/link';
import { mm, toEdit, type Furniture, type Project, type Vec3 } from '@/lib/model';
import { layoutWarnings,sheetView, type View } from '@/lib/scene';

function ArrowIcon(){return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 19 19 5M5 5h14v14"/></svg>;}

type Summary=Pick<Project,'id'|'name'|'source'|'updatedAt'>;
const request=fetchJson;
const MISSING_LINK='No encontramos el proyecto de este enlace. Puede haber sido eliminado: elegí otro en «Proyectos guardados» o subí un archivo.';
export default function Editor(){
  const [project,setProject]=useState<Project|null>(null), [projects,setProjects]=useState<Summary[]>([]);
  const [furnitureId,setFurnitureId]=useState(''), [pieceId,setPieceId]=useState(''), [noteId,setNoteId]=useState('');
  const [status,setStatus]=useState('Sin proyecto'), [error,setError]=useState(''), [busy,setBusy]=useState(false), [reanchor,setReanchor]=useState(false);
  const [tick,setTick]=useState(0), [opening,setOpening]=useState(false), [listed,setListed]=useState(false);
  const [tool,setTool]=useState<'select'|'orbit'|'dimensions'>('select');
  const [view,setView]=useState<View>('front');
  const [draftHidden,setDraftHidden]=useState<string[]|null>(null);
  const current=useRef<Project|null>(null),serial=useRef(0),saved=useRef(0),saving=useRef<Promise<void>|null>(null),conflict=useRef(false);
  const upload=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=>{setProjects(await request<Summary[]>('/api/projects'));setListed(true);},[]);
  const open=useCallback((source:Project)=>{const migrated=source.furniture.some(f=>!f.presentation?.guide);const p={...source,furniture:source.furniture.map(ensureGuide)};current.current=p;serial.current=migrated?1:0;saved.current=0;setDraftHidden(null);if(migrated)setTick(n=>n+1);conflict.current=false;setProject(p);setFurnitureId(p.furniture[0].id);setPieceId(p.furniture[0].pieces[0].id);setNoteId('');setError('');setStatus(migrated?'Actualizando guía A4…':'Guardado');setReanchor(false);window.history.replaceState(null,'',`?proyecto=${p.id}`);},[]);
  useEffect(()=>{refresh().catch(e=>setError(e.message));const id=new URLSearchParams(window.location.search).get('proyecto');if(!id)return;setOpening(true);request<Project>(`/api/projects/${encodeURIComponent(id)}`).then(p=>{if(!current.current)open(p);}).catch(e=>{if(e instanceof ApiError&&e.status===404){window.history.replaceState(null,'',window.location.pathname);setError(MISSING_LINK);}else setError(e.message);}).finally(()=>setOpening(false));},[refresh,open]);
  function change(mutator:(p:Project)=>void){
    if(!current.current||conflict.current)return;
    const next=structuredClone(current.current);mutator(next);current.current=next;serial.current++;setProject(next);setTick(n=>n+1);setStatus('Cambios sin guardar');
  }
  const save=useCallback(async function persist():Promise<void>{
    if(saving.current){await saving.current;if(saved.current!==serial.current)return persist();return;}
    if(!current.current||serial.current===saved.current)return;
    if(conflict.current)throw new Error('Recargá el proyecto antes de seguir guardando.');
    const p=current.current,snapshot=serial.current;
    const job=(async()=>{
      setStatus('Guardando…');
      try{
        const next=await request<Project>(`/api/projects/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(toEdit(p))});
        if(current.current?.id===p.id){current.current={...current.current,revision:next.revision,updatedAt:next.updatedAt};setProject(current.current);saved.current=snapshot;setStatus(snapshot===serial.current?'Guardado':'Cambios sin guardar');}
      }catch(e){setStatus('No se pudo guardar');if((e as Error).message.includes('otra pestaña'))conflict.current=true;setError((e as Error).message);throw e;}
    })();saving.current=job;
    try{await job;}finally{saving.current=null;}
    if(saved.current!==serial.current)await persist();
  },[]);
  useEffect(()=>{if(!project||!tick)return;const t=setTimeout(()=>{save().catch(()=>{});},700);return()=>clearTimeout(t);},[tick,project?.id,save]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(saved.current!==serial.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
  const f=project?.furniture.find(f=>f.id===furnitureId);
  const preview=f&&draftHidden!==null?{...f,presentation:{...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}}}:f;
  useEffect(()=>{const mode=f?.presentation?.guide?.mode;if(mode==='exterior')setView('front');else if(mode==='interior')setView('back');},[f?.id,f?.presentation?.guide?.mode]);
  const rows=f?pieceRows(f):[],codes=f?pieceCodeMap(f):new Map<string,string>();
  const piece=f?.pieces.find(p=>p.id===pieceId),note=f?.notes.find(n=>n.id===noteId);
  const warnings=project?.furniture.flatMap(f=>layoutWarnings(f).map(w=>`${f.name}: ${w}`))||[];
  function editFurniture(fn:(f:Furniture)=>void){change(p=>{const f=p.furniture.find(f=>f.id===furnitureId)!;fn(f);});}
  function pick(id:string,anchor:Vec3){setPieceId(id);if(draftHidden!==null)return;if(reanchor&&note){editFurniture(f=>{const n=f.notes.find(n=>n.id===note.id)!;n.pieceId=id;n.anchor=anchor;});setReanchor(false);}}
  async function action(fn:()=>Promise<void>){setError('');setBusy(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function addNote(){setTool('select');if(!f||!piece)return;const id=crypto.randomUUID();editFurniture(f=>f.notes.push({id,pieceId:piece.id,anchor:piece.mesh.vertices[0],position:[718,Math.min(440,32+f.notes.length*120)],text:'Revisar unión antes de fijar.'}));setNoteId(id);setReanchor(true);}
  async function exportPdf(){if(draftHidden!==null)throw new Error('Aplicá o cancelá la previsualización de visibilidad antes de exportar.');await save();const response=await send(`/api/pdf/${current.current!.id}`);const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='planos-santo-A4.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="app-shell">
    <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">S</span><span>PLANOS<span className="brand-light"> SANTO</span><small>DEL MODELO AL TALLER</small></span></Link><div className="top-actions"><Link className="header-install" href="/instalar">Instalar extensión</Link><button className="button ghost" disabled={busy||draftHidden!==null} onClick={()=>action(async()=>{await save();open(await request<Project>('/api/projects',{method:'POST'}));await refresh();})}>Abrir demostración</button><button className="button dark" disabled={busy||draftHidden!==null} onClick={()=>upload.current?.click()}>↑ Subir archivo</button></div></header>
    <main>
      <div className="page-heading"><div><p className="eyebrow">GUÍAS DE ARMADO / PROYECTO</p><h1>{project?project.name:'Tus planos de armado'}</h1><p className="subtitle">Subí tu proyecto, revisá las piezas y prepará tu guía.</p></div><div className="project-picker"><label htmlFor="projects">Proyectos guardados</label><select id="projects" value={project?.id||''} disabled={busy||draftHidden!==null} onChange={e=>{const id=e.target.value;if(id)action(async()=>{await save();open(await request<Project>(`/api/projects/${id}`));});}}><option value="" disabled>{!listed?'Cargando proyectos…':projects.length?'Elegí un proyecto':'Todavía no hay proyectos guardados'}</option>{projects.map(p=><option key={p.id} value={p.id}>{p.source==='demo'?'DEMO · ':''}{p.name} · {p.id.slice(0,6)}</option>)}</select></div></div>
      <RubyImport compact={Boolean(project)} inputRef={upload} onImport={async p=>{await save();open(p);await refresh();}} onRefresh={refresh}/>
      {error&&<div className="alert error" role="alert">{error}<button aria-label="Cerrar error" onClick={()=>setError('')}>×</button></div>}
      {!project&&opening?<section className="opening-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/>Abriendo el proyecto guardado…</section>:!project?<section className="start-guide"><div><span>01</span><h3>Subí tu ZIP</h3><p>Un solo archivo con las piezas de tu mueble.</p></div><div><span>02</span><h3>Revisá y anotá</h3><p>Identificá las piezas y dejá instrucciones de armado.</p></div><div><span>03</span><h3>Llevá tu guía al taller</h3><p>Una hoja A4 por mueble, con medidas y notas.</p></div><button className="text-button" disabled={busy||draftHidden!==null} onClick={()=>action(async()=>{open(await request<Project>('/api/projects',{method:'POST'}));await refresh();})}>Explorar proyecto DEMO →</button></section>:<>
        <div className="project-strip"><div><strong>{project.name}</strong><span className={`badge ${project.source==='demo'?'demo':''}`}>{project.source==='demo'?'DEMO · DATOS SINTÉTICOS':project.source==='sketchup-ruby'?'SKETCHUP · EXTENSIÓN RUBY':'SKETCHUP'}</span></div><div className="save-status"><span role="status">{status}</span><button className="text-button" disabled={busy||draftHidden!==null} onClick={()=>action(save)}>Guardar ahora</button></div></div>
        {project.importedDocument&&<ImportTree document={project.importedDocument}/>}
        <div className="workspace">
          <aside className="furniture-sidebar"><div className="section-caption">MUEBLES <span>{project.furniture.length.toString().padStart(2,'0')}</span></div>{project.furniture.map((item,i)=><button key={item.id} className={`furniture-card ${item.id===furnitureId?'active':''}`} disabled={busy||draftHidden!==null} onClick={()=>{setFurnitureId(item.id);setPieceId(item.pieces[0].id);setNoteId('');setReanchor(false);}}><span className="furniture-icon" aria-hidden="true">{i+1===1?'▤':'⊓'}</span><span><strong>{item.name}</strong><small>{item.pieces.length} piezas · Hoja {i+1}</small></span><span aria-hidden="true">›</span></button>)}<div className="sidebar-help"><span><ArrowIcon/></span><strong>Listo para el banco</strong><p>Cada mueble sale en su propia hoja A4 horizontal.</p></div></aside>
          <div className="editor-main">{f&&<>
            <section className="viewer-panel"><div className="panel-heading"><div><p className="eyebrow">VISTA DE ARMADO</p><h2>{f.name}</h2></div><span className="view-tag"><ArrowIcon/> Axonometría ortográfica</span></div>
              <div className="view-tools"><div className="view-switch" role="group" aria-label="Vista del mueble">{(['front','back'] as const).map(v=><button className="text-button" key={v} aria-label={v==='front'?'Ver exterior':'Ver interior'} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='front'?'Exterior':'Interior'}</button>)}</div><label>Zoom <input aria-label="Zoom" disabled={busy||draftHidden!==null} type="range" min="0.35" max="1.4" step="0.05" value={f.zoom} onChange={e=>editFurniture(f=>{f.zoom=Number(e.target.value);})}/></label><button className="text-button" disabled={busy||draftHidden!==null} onClick={()=>editFurniture(f=>{f.zoom=1;f.presentation={...f.presentation,cameras:undefined};})}>Restablecer vista</button></div>
              {reanchor&&<div className="anchor-hint" role="status">Hacé clic sobre la pieza para ubicar la punta de la flecha. <button className="text-button" onClick={()=>setReanchor(false)}>Cancelar</button></div>}
              <ViewAdjustments furniture={f} view={view} mode={tool} onMode={setTool} disabled={busy||draftHidden!==null} onChange={presentation=>editFurniture(f=>{f.presentation=presentation;})}/><DimensionControls furniture={f} disabled={busy||draftHidden!==null} onChange={refs=>editFurniture(f=>{f.hiddenDimensions=refs;})}/>
              <Diagram onOrbit={tool==='orbit'&&draftHidden===null?delta=>editFurniture(f=>{f.presentation=orbitCamera(f,view,delta);}):undefined} onMoveDimension={tool==='dimensions'&&draftHidden===null?(id,role,delta)=>editFurniture(f=>{f.presentation=shiftDimension(f,view,id,role,delta,[sheetView(f).width,sheetView(f).height]);}):undefined} furniture={preview!} layout={tool==='dimensions'?'sheet':'editor'} view={view} onHideDimension={tool==='select'&&draftHidden===null?(id,role)=>editFurniture(f=>{f.hiddenDimensions=setDimensionVisible(f,id,role,false);}):undefined} selected={pieceId} onPick={pick} onMove={draftHidden!==null?undefined:(id,position)=>editFurniture(f=>{f.notes.find(n=>n.id===id)!.position=position;})} onNote={setNoteId}/>
              <GuideViews furniture={f} view={view} selectedId={pieceId} draftHidden={draftHidden} disabled={busy} onChange={next=>editFurniture(f=>{Object.assign(f,next);})} onSelect={setPieceId} onView={setView} onDraft={ids=>{setTool('select');setReanchor(false);setDraftHidden(ids);}} onApply={()=>{if(draftHidden!==null)editFurniture(f=>{f.presentation={...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}};});setDraftHidden(null);}} onCancel={()=>setDraftHidden(null)}/>
              <div className="viewer-footer"><span>● Una o dos vistas ensambladas · Cámara configurable</span><span>mm · Medidas originales protegidas</span></div>
              
            </section>
            <section className="parts-panel"><div className="panel-heading"><div><p className="eyebrow">DESPIECE DEL MUEBLE</p><h2>Listado de piezas <span className="count">{f.pieces.length}</span></h2></div><label className="fine"><input type="checkbox" aria-label="Agrupar componentes iguales" checked={f.groupIdentical||false} disabled={busy||draftHidden!==null} onChange={e=>editFurniture(f=>{f.groupIdentical=e.target.checked;})}/> Agrupar componentes iguales</label></div><div className="table-scroll"><table><thead><tr><th>ID</th><th>Pieza / nombre editable</th><th>Largo</th><th>Ancho</th><th>Espesor</th><th>Cant.</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} className={p.memberIds.includes(pieceId)?'selected-row':''} onClick={()=>setPieceId(p.id)}><td><button className="piece-code" onClick={()=>setPieceId(p.id)} aria-label={`Elegir ${p.code}`}>{p.code}</button></td><td><input aria-label={`Nombre ${p.code}`} value={p.name} maxLength={80} onChange={e=>editFurniture(f=>{Object.assign(f,renamePieceGroup(f,p.id,e.target.value));})}/>{p.warnings.map(w=><small className="dimension-warning" key={w}>{w}</small>)}</td>{p.dimensions.map((n,i)=><td key={i}>{mm(n)}</td>)}<td>{p.quantity}</td></tr>)}</tbody></table></div><p className="table-footnote">{f.groupIdentical?'Los componentes iguales comparten ID y un nombre de referencia en la tabla. Agrupar conserva los nombres originales; editar una fila cambia todas sus piezas.':'Cada código identifica una instancia física. Podés agrupar componentes de igual definición, medidas y material.'}</p></section>
          </>}</div>
          <aside className="notes-panel"><div className="panel-heading"><div><p className="eyebrow">INDICACIONES DEL TALLER</p><h2>Notas de armado</h2></div><span className="count">{f?.notes.length||0}</span></div><p className="fine">Flechas vinculadas a una pieza concreta. Arrastrá la tarjeta sobre la vista para moverla.</p><button className="button outline full" disabled={!piece||busy||draftHidden!==null||(f?.notes.length||0)>=40} onClick={addNote}>+ Agregar nota a {piece?codes.get(piece.id):undefined}</button>
            {!f?.notes.length&&<div className="notes-empty"><span><ArrowIcon/></span><strong>El detalle hace la diferencia</strong><p>Seleccioná una pieza y agregá una indicación para el armador.</p></div>}
            {f?.notes.map(n=><button key={n.id} className={`note-list-item ${n.id===noteId?'active':''}`} onClick={()=>{setNoteId(n.id);setReanchor(false);}}><span>{codes.get(n.pieceId)} ↗</span><p>{n.text}</p></button>)}
            {note&&<div className="note-editor"><label htmlFor="note-text">Comentario</label><textarea id="note-text" aria-label="Comentario" maxLength={200} rows={5} value={note.text} onChange={e=>editFurniture(f=>{f.notes.find(n=>n.id===noteId)!.text=e.target.value;})}/><small>{note.text.length}/200 caracteres</small><button className="text-button" onClick={()=>setReanchor(true)}>↗ Cambiar anclaje a una pieza</button><button className="text-button danger" onClick={()=>{editFurniture(f=>{f.notes=f.notes.filter(n=>n.id!==noteId);});setNoteId('');setReanchor(false);}}>Eliminar nota</button></div>}
            <div className="export-card"><p className="eyebrow">SALIDA DE TALLER</p><strong>Una hoja. Todo el mueble.</strong><p>Vistas configurables · Una tabla<br/>A4 horizontal · 297 × 210 mm<br/>{project.furniture.length} muebles = {project.furniture.length} hojas</p><button className="button dark full" disabled={busy||warnings.length>0||draftHidden!==null} onClick={()=>action(exportPdf)}>{busy?'Procesando…':'↓ Exportar PDF A4'}</button></div>
          </aside>
        </div>
        {warnings.length>0&&<div className="alert error" role="alert"><div><strong>Revisá la maquetación antes de exportar</strong>{warnings.map((w,i)=><p key={i}>{w}</p>)}<p>Ajustá las vistas, el zoom o las notas. No se recorta información ni se agregan hojas automáticamente.</p></div></div>}
      </>}
      <footer className="app-footer"><span>PLANOS SANTO</span><span>Hecho para construir con claridad.</span><span>A4 / ESCALA ILUSTRATIVA</span></footer>
    </main>
  </div>;
}
