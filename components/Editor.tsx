'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureGuide } from '../sketchup_offline/ui/GuideViews';
import { pieceRows, pieceCodeMap } from '@/lib/pieceGroups';
import RubyImport from './RubyImport';
import ImportTree from './ImportTree';
import { ApiError, fetchJson as request, send } from './apiError';
import { useProjectSession } from './editor/useProjectSession';
import TopBar from './editor/TopBar';
import PageHeading, { type Summary } from './editor/PageHeading';
import StartGuide from './editor/StartGuide';
import ProjectStrip from './editor/ProjectStrip';
import FurnitureSidebar from './editor/FurnitureSidebar';
import ViewerPanel, { type Tool } from './editor/ViewerPanel';
import PartsPanel from './editor/PartsPanel';
import NotesPanel from './editor/NotesPanel';
import type { Furniture, Project, Vec3 } from '@/lib/model';
import { layoutWarnings, type View } from '@/lib/scene';

const MISSING_LINK='No encontramos el proyecto de este enlace. Puede haber sido eliminado: elegí otro en «Proyectos guardados» o subí un archivo.';
export default function Editor(){
  const {project,status,error,setError,load,change,save,hasProject,currentId}=useProjectSession();
  const [projects,setProjects]=useState<Summary[]>([]);
  const [furnitureId,setFurnitureId]=useState(''), [pieceId,setPieceId]=useState(''), [noteId,setNoteId]=useState('');
  const [busy,setBusy]=useState(false), [reanchor,setReanchor]=useState(false);
  const [opening,setOpening]=useState(false), [listed,setListed]=useState(false);
  const [tool,setTool]=useState<Tool>('select');
  const [view,setView]=useState<View>('front');
  const [draftHidden,setDraftHidden]=useState<string[]|null>(null);
  const upload=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=>{setProjects(await request<Summary[]>('/api/projects'));setListed(true);},[]);
  const open=useCallback((source:Project)=>{const p=load(source);setDraftHidden(null);setFurnitureId(p.furniture[0].id);setPieceId(p.furniture[0].pieces[0].id);setNoteId('');setReanchor(false);window.history.replaceState(null,'',`?proyecto=${p.id}`);},[load]);
  useEffect(()=>{refresh().catch(e=>setError(e.message));const id=new URLSearchParams(window.location.search).get('proyecto');if(!id)return;setOpening(true);request<Project>(`/api/projects/${encodeURIComponent(id)}`).then(p=>{if(!hasProject())open(p);}).catch(e=>{if(e instanceof ApiError&&e.status===404){window.history.replaceState(null,'',window.location.pathname);setError(MISSING_LINK);}else setError(e.message);}).finally(()=>setOpening(false));},[refresh,open]); // eslint-disable-line react-hooks/exhaustive-deps
  const f=project?.furniture.find(f=>f.id===furnitureId);
  const preview=f&&draftHidden!==null?{...f,presentation:{...f.presentation,guide:{...ensureGuide(f).presentation!.guide!,hiddenPieceIds:draftHidden}}}:f;
  useEffect(()=>{if(!reanchor)return;const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setReanchor(false);};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[reanchor]);
  useEffect(()=>{const mode=f?.presentation?.guide?.mode;if(mode==='exterior')setView('front');else if(mode==='interior')setView('back');},[f?.id,f?.presentation?.guide?.mode]);
  const rows=f?pieceRows(f):[],codes=f?pieceCodeMap(f):new Map<string,string>();
  const piece=f?.pieces.find(p=>p.id===pieceId),note=f?.notes.find(n=>n.id===noteId);
  const warnings=project?.furniture.flatMap(f=>layoutWarnings(f).map(w=>`${f.name}: ${w}`))||[];
  const locked=busy||draftHidden!==null;
  function editFurniture(fn:(f:Furniture)=>void){change(p=>{const f=p.furniture.find(f=>f.id===furnitureId)!;fn(f);});}
  function pick(id:string,anchor:Vec3){setPieceId(id);if(draftHidden!==null)return;if(reanchor&&note){editFurniture(f=>{const n=f.notes.find(n=>n.id===note.id)!;n.pieceId=id;n.anchor=anchor;});setReanchor(false);}}
  async function action(fn:()=>Promise<void>){setError('');setBusy(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function addNote(){setTool('select');if(!f||!piece)return;const id=crypto.randomUUID();editFurniture(f=>f.notes.push({id,pieceId:piece.id,anchor:piece.mesh.vertices[0],position:[718,Math.min(440,32+f.notes.length*120)],text:'Revisar unión antes de fijar.'}));setNoteId(id);setReanchor(true);}
  function deleteNote(){editFurniture(f=>{f.notes=f.notes.filter(n=>n.id!==noteId);});setNoteId('');setReanchor(false);}
  function selectFurniture(item:Furniture){setFurnitureId(item.id);setPieceId(item.pieces[0].id);setNoteId('');setReanchor(false);}
  async function exportPdf(){if(draftHidden!==null)throw new Error('Aplicá o cancelá la previsualización de visibilidad antes de exportar.');await save();const response=await send(`/api/pdf/${currentId()!}`);const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='planos-santo-A4.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="app-shell">
    <TopBar locked={locked} onDemo={()=>action(async()=>{await save();open(await request<Project>('/api/projects',{method:'POST'}));await refresh();})} onUpload={()=>upload.current?.click()}/>
    <main>
      <PageHeading project={project} projects={projects} listed={listed} locked={locked} onSelect={id=>action(async()=>{await save();open(await request<Project>(`/api/projects/${id}`));})}/>
      <RubyImport compact={Boolean(project)} inputRef={upload} onImport={async p=>{await save();open(p);await refresh();}} onRefresh={refresh}/>
      {error&&<div className="alert error" role="alert">{error}<button aria-label="Cerrar error" onClick={()=>setError('')}>×</button></div>}
      {!project&&opening?<section className="opening-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/>Abriendo el proyecto guardado…</section>
      :!project?<StartGuide locked={locked} onDemo={()=>action(async()=>{open(await request<Project>('/api/projects',{method:'POST'}));await refresh();})}/>
      :<>
        <ProjectStrip project={project} status={status} locked={locked} onSave={()=>action(save)}/>
        {project.importedDocument&&<ImportTree document={project.importedDocument}/>}
        <div className="workspace">
          <FurnitureSidebar furniture={project.furniture} selectedId={furnitureId} locked={locked} onSelect={selectFurniture}/>
          <div className="editor-main">{f&&<>
            <ViewerPanel furniture={f} preview={preview!} view={view} tool={tool} pieceId={pieceId} draftHidden={draftHidden} busy={busy} reanchor={reanchor}
              onView={setView} onTool={setTool} onEdit={editFurniture} onPick={pick} onSelect={setPieceId} onNote={setNoteId} onCancelReanchor={()=>setReanchor(false)}
              onDraft={ids=>{setTool('select');setReanchor(false);setDraftHidden(ids);}} onCancelDraft={()=>setDraftHidden(null)}/>
            <PartsPanel furniture={f} rows={rows} pieceId={pieceId} locked={locked} onSelect={setPieceId} onEdit={editFurniture}/>
          </>}</div>
          <NotesPanel project={project} furniture={f} piece={piece} note={note} noteId={noteId} codes={codes} locked={locked} busy={busy} exportBlocked={busy||warnings.length>0||draftHidden!==null}
            onAdd={addNote} onSelect={id=>{setNoteId(id);setReanchor(false);}} onText={text=>editFurniture(f=>{f.notes.find(n=>n.id===noteId)!.text=text;})} onReanchor={()=>setReanchor(true)} onDelete={deleteNote} onExport={()=>action(exportPdf)}/>
        </div>
        {warnings.length>0&&<div className="alert error" role="alert"><div><strong>Revisá la maquetación antes de exportar</strong>{warnings.map((w,i)=><p key={i}>{w}</p>)}<p>Ajustá las vistas, el zoom o las notas. No se recorta información ni se agregan hojas automáticamente.</p></div></div>}
      </>}
      <footer className="app-footer"><span>PLANOS SANTO</span><span>Hecho para construir con claridad.</span><span>A4 / ESCALA ILUSTRATIVA</span></footer>
    </main>
  </div>;
}
