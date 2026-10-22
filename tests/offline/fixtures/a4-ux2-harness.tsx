import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createDemo} from '../../../lib/demo';
import A4SheetPreview from '../../../sketchup_offline/ui/A4SheetPreview';
import type {OrderReferences} from '../../../sketchup_offline/ui/pdf';

// Synthetic harness for UX2: order references, a sheet that does not fit and the copy of the list.
// Like the editor, it shows the controls of the active furniture only.
function Harness(){
  const [project,setProject]=useState(createDemo),[references,setReferences]=useState<OrderReferences>(),[active,setActive]=useState(()=>project.furniture[0].id);
  const partial=()=>setReferences(Object.fromEntries(project.furniture.flatMap(f=>f.pieces.slice(1)).map((p,i)=>[p.id,{text:'TEST-18',board:'TEST-18 / 18 mm',edgeMap:i%2?[1,1,0,2]:[1,0,0,0],principal:'EDGE-P',secondary:'EDGE-S',base:700,height:450}])));
  const overflow=()=>setProject(p=>({...p,revision:p.revision+1,furniture:p.furniture.map((f,i)=>i===1?{...f,presentation:{guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:'Revisar las uniones y la alineación antes del montaje. '.repeat(35)}}}:f)}));
  const furniture=project.furniture.find(f=>f.id===active)!;
  return <main>
    <button type="button" onClick={partial}>Pedido parcial</button>
    <button type="button" onClick={overflow}>Desbordar segundo mueble</button>
    <nav aria-label="Muebles">{project.furniture.map(f=><button key={f.id} type="button" aria-pressed={f.id===active} onClick={()=>setActive(f.id)}>{f.name}</button>)}</nav>
    <p data-testid="active-furniture">{furniture.name}</p>
    <textarea key={active} data-fix-target="legend" data-furniture={active} aria-label="Observaciones de armado" defaultValue={furniture.presentation?.guide?.observations||''}/>
    <A4SheetPreview project={project} references={references} activeFurnitureId={active} onActivate={setActive}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
