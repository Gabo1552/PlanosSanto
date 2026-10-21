import { mm,type RawDocument,type RawNode } from '@/lib/model';
function Node({node}:{node:RawNode}){
  return <li><strong>{node.name}</strong> <small>({node.kind})</small><p>ID {node.id} · Ruta {node.metadata?.instancePath.join(' / ')} · Tag: {node.metadata?.tag}{node.metadata?.material&&` · Material: ${node.metadata.material.name}`}</p>{node.metadata?.dimensionsMm&&<p>{node.metadata.dimensionsMm.map(mm).join(' × ')} mm · {node.metadata.rectangular?'Sólido rectangular':'Caja local: revisar forma/orientación'}</p>}{node.metadata?.warnings.map((w,i)=><p key={i} className="dimension-warning">{w}</p>)}{node.children.length>0&&<ul>{node.children.map(n=><Node key={n.id} node={n}/>)}</ul>}</li>;
}
export default function ImportTree({document}:{document:RawDocument}){
  return <details className="import-tree"><summary>Datos y jerarquía de la exportación Ruby</summary><p>SketchUp {document.exporter?.sketchupVersion} · Exportador {document.exporter?.version} · Validación de medidas en SketchUp: pendiente de confirmación del operador.</p><p>Se conserva la exportación original junto al proyecto. Cada nueva carga crea un proyecto separado y mantiene las anotaciones de los proyectos existentes.</p>{document.exporter?.warnings.map((w,i)=><p className="dimension-warning" key={i}>{w}</p>)}<ul>{document.furniture.map(n=><Node key={n.id} node={n}/>)}</ul></details>;
}
