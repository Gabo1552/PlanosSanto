import {useEffect,useMemo,useRef,useState} from 'react';
import {request} from './bridge';
import {cleanName,proposals,suggestPrefix,type NameNode,type NamePreview} from './names';
import type {Guide} from './guide';
import type {RawNode} from '../../lib/model';

type Scan={tree:{roots:RawNode[];warnings:string[];modelName:string};guide:Guide;selected:string[];path:string};
type Applied={changed:number;noChanges:boolean;guideNamesUpdated:boolean;preview:NamePreview;scan?:Scan;refreshWarning?:string};
export default function NamePanel({initialId,onClose,onApplied}:{initialId:string;onClose:()=>void;onApplied:(scan:Scan|undefined,changed:boolean)=>void}){
  const [nodes,setNodes]=useState<NameNode[]>([]),[selected,setSelected]=useState(initialId);
  const [preview,setPreview]=useState<NamePreview>(),[name,setName]=useState(''),[prefix,setPrefix]=useState('');
  const [bases,setBases]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),alive=useRef(true),serial=useRef(0);
  function accept(p:NamePreview){setPreview(p);setName(p.name);setPrefix(p.prefix);setBases(Object.fromEntries(p.rows.filter(r=>r.role==='piece').map(r=>[r.id,r.base||''])));}
  function flatten(roots:NameNode[],depth=0):{node:NameNode;depth:number}[]{return roots.flatMap(node=>[{node,depth},...flatten(node.children,depth+1)]);}
  const flat=useMemo(()=>flatten(nodes),[nodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const proposed=useMemo(()=>preview?proposals(preview,name,prefix,bases):undefined,[preview,name,prefix,bases]);
  async function load(id?:string){
    const ticket=++serial.current;setBusy(true);setError('');setMessage('');setPreview(undefined);
    try{
      const catalog=await request<{roots:NameNode[]}>('names_catalog');
      if(!alive.current||ticket!==serial.current)return;
      setNodes(catalog.roots);
      const candidates=flatten(catalog.roots);const choice=id&&candidates.some(r=>r.node.id===id)?id:candidates.find(r=>r.node.children.length)?.node.id||candidates[0]?.node.id;
      if(!choice)throw new Error('El modelo no tiene grupos o componentes para renombrar.');
      setSelected(choice);const p=await request<NamePreview>('names_preview',{rootId:choice});
      if(alive.current&&ticket===serial.current)accept(p);
    }catch(e){if(alive.current&&ticket===serial.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current&&ticket===serial.current)setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;dialog.current?.showModal();void load(initialId);
    return()=>{alive.current=false;};
  },[]); // eslint-disable-line react-hooks/exhaustive-deps
  async function apply(){
    if(!preview||!proposed||busy||preview.blocked||proposed.errors.length)return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await request<Applied>('names_apply',{token:preview.token,name:proposed.name,prefix:proposed.prefix,bases:Object.fromEntries(Object.entries(bases).map(([id,value])=>[id,cleanName(value)]))});
      if(!alive.current)return;
      accept(result.preview);onApplied(result.scan,!result.noChanges);
      setMessage(result.refreshWarning|| (result.noChanges?'Sin cambios. No se inició otra operación.':'Nombres confirmados en SketchUp. Guardá el SKP con Ctrl+S. Ctrl+Z deshace toda la operación.'));
      if(result.scan)setNodes(result.scan.tree.roots.map(function convert(node):NameNode{return {id:node.id,currentName:node.metadata?.originalName||node.name,displayName:node.name,kind:node.kind,role:node.mesh?(node.children.length?'mixed':'piece'):(node.children.length?'container':'empty'),children:node.children.map(convert)};}));
    }catch(e){if(alive.current)setError((e as Error).message);}
    finally{if(alive.current)setBusy(false);}
  }
  return <dialog ref={dialog} className="names-dialog" aria-labelledby="names-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <div className="names-header"><div><h2 id="names-title">Nombres de grupos y piezas</h2><p>Revisá los nombres propuestos. Solo se aplican al confirmar.</p></div><button disabled={busy} aria-label="Cerrar nombres" onClick={onClose}>×</button></div>
    <div className="names-body">
      <div className="names-chooser"><label>Mueble / grupo<select aria-label="Mueble para renombrar" value={selected} disabled={busy} onChange={e=>void load(e.target.value)}>{flat.map(({node,depth})=><option key={node.id} value={node.id}>{'· '.repeat(depth)}{node.displayName} [{node.id}]</option>)}</select></label><button disabled={busy} onClick={()=>void load(selected)}>Actualizar vista previa</button></div>
      {busy&&<p role="status">Revisando nombres…</p>}
      {error&&<p role="alert" className="error">{error} Usá Actualizar vista previa si el modelo cambió.</p>}
      {message&&<p role="status" className="success">{message}</p>}
      {preview&&proposed&&<>
        <div className="names-fields"><label>Nombre del mueble<input aria-label="Nombre del mueble" maxLength={80} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setPrefix(suggestPrefix(e.target.value));setMessage('');}}/></label><label>Abreviatura<input aria-label="Abreviatura" maxLength={20} value={prefix} disabled={busy} onChange={e=>{setPrefix(e.target.value);setMessage('');}}/></label></div>
        <p className="hint">La abreviatura se recalcula al editar el mueble y podés sobrescribirla. Se usan nombres de instancias; las definiciones y medidas se conservan.</p>
        <p><strong>{preview.pieceCount} piezas · {proposed.changes?`${proposed.changes} nombres por cambiar`:'Sin cambios'}</strong></p>
        <p className="names-parent">Mueble: {preview.currentName||'(sin nombre)'} → <strong>{proposed.name||'(completar)'}</strong></p>
        {preview.blockers.map((warning,i)=><p key={i} role="alert" className="error">{warning}</p>)}
        {preview.warnings.map((warning,i)=><p key={i} className="warning">{warning}</p>)}
        {proposed.errors.map(e=><p key={e} className="warning">{e}</p>)}
        <div className="names-table"><table aria-label="Vista previa de nombres"><thead><tr><th>Ruta / nivel</th><th>Nombre actual</th><th>Nombre base editable</th><th>Nombre nuevo</th></tr></thead><tbody>{proposed.rows.map(row=><tr key={row.id} data-name-row={row.id}><td style={{paddingLeft:10+row.depth*14}}><code>{row.id}</code><small>{row.role==='piece'?'Pieza':row.role==='empty'?'Grupo vacío':row.role==='mixed'?'Geometría mixta':'Contenedor · no se prefija'}</small></td><td>{row.currentName||`(sin nombre) · ${row.displayName}`}</td><td>{row.role==='piece'?<input aria-label={`Nombre base ${row.id}`} value={bases[row.id]||''} disabled={busy} onChange={e=>{setBases(b=>({...b,[row.id]:e.target.value}));setMessage('');}}/>:'Se conserva'}</td><td data-proposed={row.id}>{row.proposed||'(sin nombre)'}</td></tr>)}</tbody></table></div>
        <details className="names-help"><summary>Cómo se protegen los nombres y los componentes compartidos</summary><p>Solo se reemplaza un prefijo que esta extensión haya guardado como propio. Los nombres preexistentes con guiones se conservan completos como base. La primera confirmación registra esa base para futuros cambios.</p><p>Si una definición padre o interior comparte las mismas instancias hijas con otro mueble, la confirmación se bloquea. Revisá qué grupos comparten definición en SketchUp. Esta herramienta no ejecuta Hacer único ni cambia identificadores.</p><p>Se actualizan también los nombres de las filas correspondientes en las guías guardadas. Códigos, notas y anclas se conservan. Cancelar cierra la vista previa sin aplicar nuevos cambios; los ya confirmados se deshacen con Ctrl+Z.</p></details>
      </>}
    </div>
    <div className="names-actions"><button disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy||!preview||preview.blocked||!proposed||!!proposed.errors.length} onClick={()=>void apply()}>Confirmar cambios</button></div>
  </dialog>;
}
