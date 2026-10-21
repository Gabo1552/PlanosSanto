import {useState} from 'react';
import {request} from './bridge';
import type {Catalog,Geometry,OrderRow} from './WorkshopPanel';
type Side={side:string;axis:number;bound:string;status:string;materialIds:string[];faceIds:string[];faceMaterials:{face_id:string;front_material_id:string|null;back_material_id:string|null;front_origin:string;back_origin:string}[];reason:string};
export type Observation={pieceId:string;sides:Side[];materials:{id:string;name:string;category:string;native_status?:string;native_binding?:{catalogId:string;uuid:string;kind:string;catalogFingerprint:string}}[];complete:boolean};
export type EdgeIssue={side:string;kind:'unresolved'|'unbound'|'unassigned';materialId?:string;message:string};
const labels:Record<string,string>={arr:'Arriba',aba:'Abajo',izq:'Izquierda',der:'Derecha'};
const sideStatus:Record<string,string>={observed_edge:'Observado',observed_no_edge:'Sin canto',unresolved:'Sin resolver'};
/** Todos los faltantes de la propuesta de cantos, por lado, en lugar de cortar en el primero. */
export function edgeIssues(observation:Observation,row:Pick<OrderRow,'edgeBindings'|'principalId'|'secondaryId'>):EdgeIssue[]{
 const names=new Map(observation.materials.map(m=>[m.id,m.name]));
 return observation.sides.flatMap<EdgeIssue>(side=>{const label=labels[side.side]||side.side;
  if(side.status==='unresolved')return [{side:side.side,kind:'unresolved',message:`${label}: lado sin resolver. Inspeccioná las caras o documentá una revisión manual.`}];
  if(side.status==='observed_no_edge')return [];
  if(!side.materialIds.length)return [{side:side.side,kind:'unresolved',message:`${label}: hay canto pero no se identificó su material. Pintá el canto con un material del modelo y volvé a leer, o documentá una revisión manual.`}];
  const id=side.materialIds[0],name=names.get(id)||id,binding=row.edgeBindings.find(b=>b.observedId===id);
  if(!binding)return [{side:side.side,kind:'unbound',materialId:id,message:`${label}: vinculá ${name} con un canto de biblioteca.`}];
  if(![row.principalId,row.secondaryId].includes(binding.catalogId))return [{side:side.side,kind:'unassigned',materialId:id,message:`${label}: usá el canto vinculado a ${name} como principal (1) o secundario (2) del pedido.`}];
  return [];
 });
}
export default function EdgeReview({row,geometry,catalog,disabled,onChange}:{row:OrderRow;geometry:Geometry;catalog:Catalog;disabled:boolean;onChange:(patch:Partial<OrderRow>)=>void}){
 const [source,setSource]=useState<{key:string;rowId:string;observation:Observation}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=JSON.stringify([row.id,row.axes,row.frontSign,row.flipX,row.flipY,geometry.mirrored]),observation=source?.key===key?source.observation:undefined,outdated=!!source&&source.rowId===row.id&&!observation;
 const names=new Map(observation?.materials.map(m=>[m.id,m.name])||[]),ids=[...new Set(observation?.sides.flatMap(side=>side.materialIds)||[])];
 const edges=catalog.items.filter(item=>item.kind==='edge'&&item.approved),edgeName=(id:string|null)=>catalog.items.find(item=>item.id===id)?.name;
 const issues=observation?edgeIssues(observation,row):[],canRead=!!row.axes&&row.frontSign!==null;
 async function read(){setBusy(true);setError('');try{setSource({key,rowId:row.id,observation:await request<Observation>('order_edges',{row})});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 function propose(){
  if(!observation||issues.length)return;
  const map=observation.sides.map(side=>{if(side.status==='observed_no_edge')return 0;const binding=row.edgeBindings.find(b=>b.observedId===side.materialIds[0])!;return [row.principalId,row.secondaryId].indexOf(binding.catalogId)+1;});
  onChange({edgeMap:map,edgeResolution:'observed',edgesConfirmed:false});setError('');
 }
 return <fieldset className="edge-review"><legend>Cantos observados y revisión de los lados</legend>
 <p>La lectura usa caras perimetrales y ejes locales; la cámara 3D no decide los lados. Vinculá los materiales observados con productos aprobados y revisá el mapa en la vista 2D.</p>
 {outdated&&<p className="workshop-stale">La lectura anterior era de otra orientación. Volvé a leer.</p>}
 <button disabled={disabled||busy||!canRead} aria-describedby={canRead?undefined:'edge-read-reason'} onClick={()=>void read()}>Leer cantos de las caras</button>{!canRead&&<small id="edge-read-reason" className="workshop-hint">Elegí ejes y cara para leer cantos.</small>}{busy&&<p role="status">Leyendo caras…</p>}{error&&<p role="alert">{error}</p>}
 {observation&&<><p>{observation.complete?'Recorrido completo':'Recorrido incompleto: no se certifican lados'}</p><table><thead><tr><th>Lado 2D</th><th>Estado</th><th>Pintura / evidencia</th></tr></thead><tbody>{observation.sides.map(side=><tr key={side.side}><td>{labels[side.side]}<small>{'XYZ'[side.axis]} {side.bound}</small></td><td><span className={`workshop-badge edge-${side.status}`}>{sideStatus[side.status]||side.status}</span></td><td>{side.materialIds.map(id=>names.get(id)||id).join(', ')||'Sin canto identificado'}<small>{side.reason}</small><details><summary>Ver caras de {labels[side.side].toLowerCase()}</summary>{side.faceMaterials.map(face=><p key={face.face_id}>Cara {face.face_id}: frente {names.get(face.front_material_id||'')||'sin pintar'} ({face.front_origin}); dorso {names.get(face.back_material_id||'')||'sin pintar'} ({face.back_origin}).</p>)}</details></td></tr>)}</tbody></table>
 {ids.map(id=>{const bound=row.edgeBindings.find(b=>b.observedId===id)?.catalogId;return <div key={id} className="edge-binding"><label>Producto para {names.get(id)||id}<select aria-label={`Vincular canto observado ${id}`} disabled={disabled||busy} value={bound||''} onChange={e=>onChange({edgeBindings:[...row.edgeBindings.filter(b=>b.observedId!==id),...(e.target.value?[{observedId:id,catalogId:e.target.value}]:[])],edgesConfirmed:false,edgeResolution:null})}><option value="">Sin vínculo confirmado</option>{edges.filter(edge=>{const native=observation.materials.find(m=>m.id===id)?.native_binding;return !native||edge.id===native.catalogId;}).map(edge=><option key={edge.id} value={edge.id}>{edge.name} · {edge.sku}</option>)}</select></label>
  {bound&&<div role="group" aria-label={`Rol de ${edgeName(bound)||bound} en el pedido`} className="edge-binding-roles"><button type="button" disabled={disabled||busy} aria-pressed={row.principalId===bound} onClick={()=>onChange({principalId:bound,edgesConfirmed:false})}>Usar como principal (1)</button><button type="button" disabled={disabled||busy} aria-pressed={row.secondaryId===bound} onClick={()=>onChange({secondaryId:bound,edgesConfirmed:false})}>Usar como secundario (2)</button></div>}</div>;})}
 {issues.length?<div className="edge-issues"><p id="edge-issues-title"><strong>Para usar la propuesta faltan {issues.length} {issues.length===1?'paso':'pasos'}:</strong></p><ul role="list" aria-labelledby="edge-issues-title">{issues.map(issue=><li key={issue.side}>{issue.message}</li>)}</ul></div>:<p className="workshop-hint">Los cuatro lados tienen evidencia y vínculo. Revisá la propuesta en la vista 2D.</p>}
 <button disabled={disabled||busy||!!issues.length} aria-describedby={issues.length?'edge-issues-title':undefined} onClick={propose}>Usar propuesta de los cuatro lados</button></>}
 <label>Origen de la revisión de cantos<select aria-label="Origen de revisión de cantos" disabled={disabled||busy} value={row.edgeResolution||''} onChange={e=>onChange({edgeResolution:e.target.value||null,edgesConfirmed:false})}><option value="">Sin verificar</option><option value="observed">Caras observadas con vínculos revisados</option><option value="manual">Inspección manual documentada</option></select></label>
 {row.edgeResolution==='manual'&&<label>Motivo y fuente de la inspección manual<textarea aria-label="Justificación manual de cantos" disabled={disabled} value={row.edgeOverrideReason} onChange={e=>onChange({edgeOverrideReason:e.target.value,edgesConfirmed:false})}/></label>}
 <p>No se modifica la pintura del SKP. Al exportar se releen las caras para comprobar el mapa observado. Los vínculos propios funcionan sin OpenCutList. Los conflictos o cambios del SKU nativo bloquean el pedido incluso con una nota manual. Los datos heredados sin compatibilidad verificada requieren revisión.</p>
 </fieldset>;
}
