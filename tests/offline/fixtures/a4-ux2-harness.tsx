import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createDemo} from '../../../lib/demo';
import A4SheetPreview from '../../../sketchup_offline/ui/A4SheetPreview';
import type {OrderReferences} from '../../../sketchup_offline/ui/pdf';

// Synthetic harness for UX2: order references, a sheet that does not fit and the copy of the list.
function Harness(){
  const [project,setProject]=useState(createDemo),[references,setReferences]=useState<OrderReferences>();
  const partial=()=>setReferences(Object.fromEntries(project.furniture.flatMap(f=>f.pieces.slice(1)).map((p,i)=>[p.id,{text:'TEST-18',board:'TEST-18 / 18 mm',edgeMap:i%2?[1,1,0,2]:[1,0,0,0],principal:'EDGE-P',secondary:'EDGE-S',base:700,height:450}])));
  const overflow=()=>setProject(p=>({...p,revision:p.revision+1,furniture:p.furniture.map((f,i)=>i===1?{...f,presentation:{guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:'Revisar las uniones y la alineación antes del montaje. '.repeat(35)}}}:f)}));
  return <main>
    <button type="button" onClick={partial}>Pedido parcial</button>
    <button type="button" onClick={overflow}>Desbordar segundo mueble</button>
    <textarea data-fix-target="legend" aria-label="Observaciones de armado" defaultValue=""/>
    <A4SheetPreview project={project} references={references}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
