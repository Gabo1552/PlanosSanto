import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createDemo} from '../../../lib/demo';
import A4SheetPreview from '../../../sketchup_offline/ui/A4SheetPreview';

// Synthetic harness: the sheet preview with two furniture, outside the app (which previews one at a time).
function Harness(){
  const [project,setProject]=useState(createDemo),[active,setActive]=useState<string|undefined>(()=>project.furniture[0].id);
  return <main>
    <button type="button" onClick={()=>setProject(p=>({...p,revision:p.revision+1,furniture:p.furniture.map(f=>({...f,name:`${f.name} ·`}))}))}>Editar proyecto</button>
    <button type="button" onClick={()=>setActive(project.furniture[1].id)}>Activar segundo mueble</button>
    <button type="button" onClick={()=>setProject(p=>({...p,id:`${p.id}-otro`,furniture:[...p.furniture].reverse()}))}>Otro proyecto</button>
    <A4SheetPreview project={project} activeFurnitureId={active}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
