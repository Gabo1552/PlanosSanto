import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createDemo,box} from '../../../lib/demo';
import type {Furniture,Project} from '../../../lib/model';
import type {View} from '../../../lib/scene';
import A4SheetPreview from '../../../sketchup_offline/ui/A4SheetPreview';
import GuideViews from '../../../sketchup_offline/ui/GuideViews';
import type {OrderReferences} from '../../../sketchup_offline/ui/pdf';

// Synthetic harness for OPT-14 and F-DESP-B: a furniture whose list does not fit (45 stacked pieces, interior view shows one)
// before a small one, the real guide controls of the active furniture and an order with rows still under review.
function initial():Project{
  const project=createDemo(),big=project.furniture[0],template=big.pieces[0];
  big.pieces=Array.from({length:45},(_,i)=>({...template,definition:undefined,id:`grupo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,300+i,700),dimensions:[700,300+i,18]}));
  big.presentation={guide:{mode:'interior',hiddenPieceIds:big.pieces.slice(1).map(p=>p.id),sharedCamera:true,observations:''}};
  return project;
}
function Harness(){
  const [project,setProject]=useState(initial),[active,setActive]=useState(()=>project.furniture[0].id),[view,setView]=useState<View>('back');
  const [references,setReferences]=useState<OrderReferences>(),[pending,setPending]=useState<string[]>();
  const furniture=project.furniture.find(f=>f.id===active)!;
  const change=(next:Furniture)=>setProject(p=>({...p,revision:p.revision+1,furniture:p.furniture.map(f=>f.id===next.id?next:f)}));
  const order=()=>{const pieces=project.furniture[1].pieces;setReferences(Object.fromEntries(pieces.slice(1).map(p=>[p.id,{text:'TEST-18',board:'TEST-18 / 18 mm',edgeMap:[1,1,0,2],principal:'EDGE-P',secondary:'EDGE-S',base:700,height:450,lot:1}])));setPending([pieces[0].id]);};
  return <main>
    <button type="button" onClick={order}>Pedido con pendientes</button>
    <nav aria-label="Muebles">{project.furniture.map(f=><button key={f.id} type="button" aria-pressed={f.id===active} onClick={()=>setActive(f.id)}>{f.name}</button>)}</nav>
    <GuideViews key={active} furniture={furniture} view={view} draftHidden={null} disabled={false} onChange={change} onSelect={()=>undefined} onView={setView} onDraft={()=>undefined} onApply={()=>undefined} onCancel={()=>undefined}/>
    <A4SheetPreview project={project} references={references} pending={pending} activeFurnitureId={active} onActivate={setActive}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
