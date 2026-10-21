import {useState} from 'react';
import {request} from './bridge';
import type {Catalog,Geometry,OrderRow} from './WorkshopPanel';
type Side={side:string;axis:number;bound:string;status:string;materialIds:string[];faceIds:string[];faceMaterials:{face_id:string;front_material_id:string|null;back_material_id:string|null;front_origin:string;back_origin:string}[];reason:string};
type Observation={pieceId:string;sides:Side[];materials:{id:string;name:string;category:string;native_status?:string;native_binding?:{catalogId:string;uuid:string;kind:string;catalogFingerprint:string}}[];complete:boolean};
export default function EdgeReview({row,geometry,catalog,disabled,onChange}:{row:OrderRow;geometry:Geometry;catalog:Catalog;disabled:boolean;onChange:(patch:Partial<OrderRow>)=>void}){
 const [source,setSource]=useState<{key:string;observation:Observation}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=JSON.stringify([row.id,row.axes,row.frontSign,row.flipX,row.flipY,geometry.mirrored]),observation=source?.key===key?source.observation:undefined;
 const names=new Map(observation?.materials.map(m=>[m.id,m.name])||[]),ids=[...new Set(observation?.sides.flatMap(side=>side.materialIds)||[])];
 const edges=catalog.items.filter(item=>item.kind==='edge'&&item.approved);
 const labels:Record<string,string>={arr:'Arriba',aba:'Abajo',izq:'Izquierda',der:'Derecha'};
 async function read(){setBusy(true);setError('');try{setSource({key,observation:await request<Observation>('order_edges',{row})});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 function propose(){
  if(!observation)return;
  try{
   const map=observation.sides.map(side=>{if(side.status==='unresolved')throw Error('Hay lados sin resolver. Inspeccioná las caras o documentá revisión manual.');if(side.status==='observed_no_edge')return 0;
    const binding=row.edgeBindings.find(b=>b.observedId===side.materialIds[0]);if(!binding)throw Error('Vinculá cada material observado con un canto de biblioteca.');
    const index=[row.principalId,row.secondaryId].indexOf(binding.catalogId);if(index<0)throw Error('Elegí esos cantos como principal/secundario del pedido antes de usar la propuesta.');return index+1;
   });onChange({edgeMap:map,edgeResolution:'observed',edgesConfirmed:false});setError('');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 return <fieldset className="edge-review"><legend>Cantos observados y revisión de los lados</legend>
 <p>La lectura usa caras perimetrales y ejes locales; la cámara 3D no decide los lados. Vinculá los materiales observados con productos aprobados y revisá el mapa en la vista 2D.</p>
 <button disabled={disabled||busy||!row.axes||row.frontSign===null} onClick={()=>void read()}>Leer cantos de las caras</button>{busy&&<p role="status">Leyendo caras…</p>}{error&&<p role="alert">{error}</p>}
 {observation&&<><p>{observation.complete?'Recorrido completo':'Recorrido incompleto: no se certifican lados'}</p><table><thead><tr><th>Lado 2D</th><th>Pintura / evidencia</th></tr></thead><tbody>{observation.sides.map(side=><tr key={side.side}><td>{labels[side.side]}<small>{'XYZ'[side.axis]} {side.bound}</small></td><td>{side.materialIds.map(id=>names.get(id)||id).join(', ')||'Sin canto identificado'}<small>{side.reason}</small><details><summary>Ver caras de {labels[side.side].toLowerCase()}</summary>{side.faceMaterials.map(face=><p key={face.face_id}>Cara {face.face_id}: frente {names.get(face.front_material_id||'')||'sin pintar'} ({face.front_origin}); dorso {names.get(face.back_material_id||'')||'sin pintar'} ({face.back_origin}).</p>)}</details></td></tr>)}</tbody></table>
 {ids.map(id=><label key={id}>Producto para {names.get(id)||id}<select aria-label={`Vincular canto observado ${id}`} disabled={disabled||busy} value={row.edgeBindings.find(b=>b.observedId===id)?.catalogId||''} onChange={e=>onChange({edgeBindings:[...row.edgeBindings.filter(b=>b.observedId!==id),...(e.target.value?[{observedId:id,catalogId:e.target.value}]:[])],edgesConfirmed:false,edgeResolution:null})}><option value="">Sin vínculo confirmado</option>{edges.filter(edge=>{const native=observation.materials.find(m=>m.id===id)?.native_binding;return !native||edge.id===native.catalogId;}).map(edge=><option key={edge.id} value={edge.id}>{edge.name} · {edge.sku}</option>)}</select></label>)}
 <button disabled={disabled||busy||observation.sides.some(side=>side.status==='unresolved')} onClick={propose}>Usar propuesta de los cuatro lados</button></>}
 <label>Origen de la revisión de cantos<select aria-label="Origen de revisión de cantos" disabled={disabled||busy} value={row.edgeResolution||''} onChange={e=>onChange({edgeResolution:e.target.value||null,edgesConfirmed:false})}><option value="">Sin verificar</option><option value="observed">Caras observadas con vínculos revisados</option><option value="manual">Inspección manual documentada</option></select></label>
 {row.edgeResolution==='manual'&&<label>Motivo y fuente de la inspección manual<textarea aria-label="Justificación manual de cantos" disabled={disabled} value={row.edgeOverrideReason} onChange={e=>onChange({edgeOverrideReason:e.target.value,edgesConfirmed:false})}/></label>}
 <p>No se modifica la pintura del SKP. Al exportar se releen las caras para comprobar el mapa observado. Los vínculos propios funcionan sin OpenCutList. Los conflictos o cambios del SKU nativo bloquean el pedido incluso con una nota manual. Los datos heredados sin compatibilidad verificada requieren revisión.</p>
 </fieldset>;
}
