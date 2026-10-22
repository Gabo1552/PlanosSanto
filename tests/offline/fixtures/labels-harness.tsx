import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createDemo} from '../../../lib/demo';
import LabelsPanel from '../../../sketchup_offline/ui/LabelsPanel';
import type {OrderReferences} from '../../../sketchup_offline/ui/pdf';

// Synthetic harness: the labels panel with the demo project and a reviewed order for every piece but the first.
function Harness(){
  const [project,setProject]=useState(()=>{const p=createDemo();p.furniture[0].naming={moduleCode:'M01',bases:[]};return p;});
  const [references]=useState<OrderReferences>(()=>Object.fromEntries(project.furniture.flatMap(f=>f.pieces.slice(1)).map((p,i)=>[p.id,{text:'TEST-18',board:'TEST-18 / 18 mm',edgeMap:i%2?[1,1,0,2]:[1,0,0,0],principal:'EDGE-P',secondary:'EDGE-S',base:700,height:450,lot:i%2+1,grain:i%2===0}])));
  const pending=useState(()=>[project.furniture[0].pieces[0].id])[0];
  return <main>
    <button type="button" onClick={()=>setProject(p=>({...p,revision:p.revision+1,furniture:p.furniture.map(f=>({...f,name:`${f.name} ·`}))}))}>Editar proyecto</button>
    <LabelsPanel project={project} references={references} pending={pending}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
