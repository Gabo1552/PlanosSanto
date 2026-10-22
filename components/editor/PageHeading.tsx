import type { Project } from '@/lib/model';

export type Summary=Pick<Project,'id'|'name'|'source'|'updatedAt'>;

export default function PageHeading({project,projects,listed,locked,onSelect}:{project:Project|null;projects:Summary[];listed:boolean;locked:boolean;onSelect:(id:string)=>void}){
  return <div className="page-heading"><div><p className="eyebrow">GUÍAS DE ARMADO / PROYECTO</p><h1>{project?project.name:'Tus planos de armado'}</h1><p className="subtitle">Subí tu proyecto, revisá las piezas y prepará tu guía.</p></div>
    <div className="project-picker"><label htmlFor="projects">Proyectos guardados</label><select id="projects" value={project?.id||''} disabled={locked} onChange={e=>{const id=e.target.value;if(id)onSelect(id);}}>
      <option value="" disabled>{!listed?'Cargando proyectos…':projects.length?'Elegí un proyecto':'Todavía no hay proyectos guardados'}</option>
      {projects.map(p=><option key={p.id} value={p.id}>{p.source==='demo'?'DEMO · ':''}{p.name} · {p.id.slice(0,6)}</option>)}
    </select></div>
  </div>;
}
