import { notFound } from 'next/navigation';
import Image from 'next/image';
import Diagram from '@/components/Diagram';
import { getProject } from '@/lib/store';
import {pieceRows} from '@/lib/pieceGroups';
import { mm } from '@/lib/model';
import { sheetEntries } from '@/lib/sheet';
import { guideViews,layoutWarnings } from '@/lib/scene';
import './print.css';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function Print({params}:{params:Promise<{id:string}>}) {
  let project;
  try{project=await getProject((await params).id);}catch{notFound();}
  project.furniture=project.furniture.map(f=>f.presentation?.guide?f:{...f,presentation:{...f.presentation,guide:{mode:'both' as const,hiddenPieceIds:[],sharedCamera:true,observations:''}}});
  const warnings=project.furniture.flatMap(f=>layoutWarnings(f));
  if(warnings.length)return <div data-print-error>{warnings.join(' ')}</div>;
  return <div className="print-document" data-ready="true">{project.furniture.map((f,index)=><article className="sheet" key={f.id}>
    <header className="print-header"><Image unoptimized className="print-logo" src="/santo-carpintero.png" width={335} height={136} alt="Santo Carpintero · Amoblamientos"/><div className="print-identity"><div className="print-brand">GUÍA DE ARMADO</div><h1>{f.name}</h1><p>{project.name}</p></div><div className="print-meta"><span>FICHA DE MUEBLE</span>{project.source==='demo'&&<strong>DEMOSTRACIÓN · MODELO SINTÉTICO</strong>}<p>Hoja {index+1} de {project.furniture.length} · {f.pieces.length} piezas</p><p>A4 horizontal · Medidas en mm · Rev. {project.revision}</p></div></header>
    <div className={`print-content ${guideViews(f).length===1?'single-view':'dual-view'}`}>{guideViews(f).map((view,viewIndex)=><section className={`print-view print-${view}`} key={view}><h2>{`${viewIndex+1} / ${view==='front'?'EXTERIOR':'INTERIOR'} · AXONOMETRÍA`}</h2><Diagram furniture={f} print view={view} layout="sheet"/></section>)}
    <section className="print-parts"><h2>03 / LISTADO DE PIEZAS</h2><table className="print-table"><thead><tr><th>ID</th><th>Pieza</th><th>Largo</th><th>Ancho</th><th>Esp.</th><th>C.</th></tr></thead><tbody>{pieceRows(f).map(p=><tr key={p.id}><td><strong>{p.code}</strong></td><td>{p.name}</td>{p.dimensions.map((d,i)=><td key={i}>{mm(d)}</td>)}<td>{p.quantity}</td></tr>)}</tbody></table><p className="print-table-note">{f.pieces.length} instancias físicas · Medidas originales</p></section>
    <section className="print-instructions"><strong>04 / Notas y observaciones de armado</strong>{sheetEntries(f).map((entry,i)=><p key={i}>{entry}</p>)}</section></div>
    <footer className="print-footer"><strong>SANTO CARPINTERO · PLANOS SANTO</strong><span>297 × 210 mm · Imprimir al 100 % · No medir sobre el dibujo</span><span>{index+1} / {project.furniture.length}</span></footer>
  </article>)}</div>;
}
