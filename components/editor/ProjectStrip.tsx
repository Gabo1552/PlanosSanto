import type { Project } from '@/lib/model';

const SOURCE_LABEL:Record<string,string>={demo:'DEMO · DATOS SINTÉTICOS','sketchup-ruby':'SKETCHUP · EXTENSIÓN RUBY'};

export default function ProjectStrip({project,status,locked,onSave}:{project:Project;status:string;locked:boolean;onSave:()=>void}){
  return <div className="project-strip"><div><strong>{project.name}</strong><span className={`badge ${project.source==='demo'?'demo':''}`}>{SOURCE_LABEL[project.source]||'SKETCHUP'}</span></div>
    <div className="save-status"><span role="status">{status}</span><button className="text-button" disabled={locked} onClick={onSave}>Guardar ahora</button></div>
  </div>;
}
