import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from './bridge';

type Material={id:string;name:string;category:string;confidence:string;applied:boolean;physical_uses:number;attributes_observed:Record<string,unknown>;native_status?:string;native_binding?:{catalogId:string;uuid:string;kind:string;catalogFingerprint:string};warnings:string[]};
type Piece={path:string[];name:string;visible:boolean;axis_lengths_mm:number[]|null;sheet_material_candidates:string[];edge_material_candidates:string[];warnings:string[];orientation:{mirrored:boolean;sheared:boolean};faces:{face_id:string;front_material_id:string|null;back_material_id:string|null;front_origin:string;back_origin:string}[]};
export type Review={schema:string;extension_version:string;complete:boolean;opencutlist:{version:string|null;build:string|null};capabilities:{material_types:boolean;whole_material_library:boolean};materials:Material[];pieces:Piece[];warnings:string[]};
const category:Record<string,string>={unknown:'Sin resolver',solid_wood:'Madera maciza',sheet:'Placa',dimensional:'Listón / perfil',edge:'Canto',hardware:'Herraje',veneer:'Lámina'};
const origin:Record<string,string>={painted_face:'Cara pintada',inherited_instance:'Heredado',unpainted:'Sin pintar'};
export default function MaterialReview({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLElement>(null);
 const [review,setReview]=useState<Review>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[piecePath,setPiecePath]=useState('');
 const reload=useCallback(async()=>{setBusy(true);setError('');setNotice('');try{setReview(await request<Review>('materials_review'));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}},[]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{function close(e:KeyboardEvent){
   if(e.key==='Escape'&&!busy){e.preventDefault();e.stopPropagation();onClose();}
   if(e.key==='Tab'){
    const elements=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary')||[])];
    const first=elements[0],last=elements[elements.length-1];
    if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!dialog.current?.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first)?.focus();}
   }
  }document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[busy,onClose]);
 const names=new Map(review?.materials.map(m=>[m.id,m.name])||[]);
 const materials=review?.materials.filter(m=>(filter==='all'||(filter==='unused'?!m.applied:m.category===filter))&&`${m.name} ${category[m.category]}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))||[];
 const selected=review?.pieces.find(p=>p.path.join('/')===piecePath);
 return <div className="material-review-backdrop"><section ref={dialog} className="material-review" role="dialog" aria-modal="true" aria-labelledby="materials-title">
  <header><div><h2 id="materials-title">Materiales y cantos</h2><p>Revisión del modelo abierto · Solo lectura</p></div><button disabled={busy} onClick={onClose} autoFocus>Cerrar revisión</button></header>
  <p className="material-review-explanation">Leemos vínculos propios de Planos Santo y tipos heredados compatibles de OpenCutList. No pintamos caras, no cambiamos materiales y no asignamos cantos arriba/abajo/izquierda/derecha.</p>
  <div className="material-review-actions"><button disabled={busy} onClick={()=>void reload()}>Volver a leer modelo</button><button disabled={busy||!review} onClick={()=>{setBusy(true);setError('');setNotice('');void request<{cancelled:boolean}>('materials_report').then(result=>setNotice(result.cancelled?'Guardado cancelado.':'Informe guardado localmente. No se envió a ningún servidor.')).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false));}}>Guardar informe local…</button></div>
  {busy&&<p role="status">Leyendo materiales y caras… Puede demorar en modelos grandes.</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {review&&<><p>OpenCutList {review.opencutlist.version||'sin versión disponible'} · {review.complete?'Recorrido completo':'Recorrido incompleto'} · {review.materials.length} materiales · {review.pieces.length} piezas con caras</p>
   <p className="warning">Observaciones pendientes de revisión. Esta pantalla todavía no genera pedidos a la maderera ni confirma medidas de corte, veta, precios o catálogo.</p>
   {review.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
   <div className="material-review-filters"><label>Buscar material<input aria-label="Buscar material OCL" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Mostrar<select aria-label="Filtrar materiales OCL" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos</option><option value="sheet">Placas</option><option value="edge">Cantos</option><option value="unknown">Sin resolver</option><option value="unused">Sin aplicar</option></select></label></div>
   <div className="material-review-table"><table><thead><tr><th>Material</th><th>Tipo observado</th><th>Uso</th><th>Datos observados</th></tr></thead><tbody>{materials.map(m=><tr key={m.id}><td>{m.name}<small>{m.confidence==='native_binding'?'Vínculo propio Planos Santo':m.confidence==='version_matched_attribute'?'Atributo compatible con versión/build revisados':m.native_status==='conflict'?'Conflicto de tipos: resolver antes de exportar':'Requiere verificar tipo/versión'}</small></td><td>{category[m.category]||'Sin resolver'}</td><td>{m.applied?`${m.physical_uses} piezas · aplicado`:'Sin aplicar'}</td><td><details><summary>Ver atributos</summary><pre>{JSON.stringify(m.attributes_observed,null,2)}</pre>{m.native_binding&&<p>Ítem de biblioteca: {m.native_binding.catalogId}<br/>Material persistente: {m.native_binding.uuid}</p>}{m.warnings.map(w=><p key={w}>{w}</p>)}</details></td></tr>)}</tbody></table>{!materials.length&&<p>No hay materiales con ese filtro.</p>}</div>
   <label className="material-review-piece">Revisar una pieza<select aria-label="Pieza para revisar materiales" value={piecePath} onChange={e=>setPiecePath(e.target.value)}><option value="">Elegí una pieza para revisar caras y herencia</option>{review.pieces.map(p=><option key={p.path.join('/')} value={p.path.join('/')}>{p.name||'Sin nombre'} · {p.path.join('/')}{p.visible?'':' · oculta'}</option>)}</select></label>
   {selected&&<section><h3>Materiales de la pieza</h3><p>XYZ locales escalados: {selected.axis_lengths_mm?.map(n=>`${Number(n.toFixed(2))} mm`).join(' × ')||'Sin medidas'}{selected.orientation.mirrored?' · Espejada':''}{selected.orientation.sheared?' · Sesgada':''}</p><p>Placas observadas: {selected.sheet_material_candidates.map(id=>names.get(id)||id).join(', ')||'Sin resolver'}</p><p>Cantos observados: {selected.edge_material_candidates.map(id=>names.get(id)||id).join(', ')||'Ninguno'}</p>{selected.warnings.map(w=><p key={w} className="warning">{w}</p>)}
    <div className="material-review-table"><table><thead><tr><th>Cara</th><th>Frente</th><th>Dorso</th></tr></thead><tbody>{selected.faces.map(face=><tr key={face.face_id}><td>{face.face_id}</td><td>{names.get(face.front_material_id||'')||'Sin material'}<small>{origin[face.front_origin]}</small></td><td>{names.get(face.back_material_id||'')||'Sin material'}<small>{origin[face.back_origin]}</small></td></tr>)}</tbody></table></div></section>}
  </>}
 </section></div>;
}
