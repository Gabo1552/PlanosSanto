import {useEffect,useId,useState} from 'react';
import type {Project} from '../../lib/model';
import {decode64,type OrderReferences} from './pdf';
import {LABEL_DEFAULTS,LABEL_GRID,createLabelsPdf,labelsFileName,type LabelMargins,type LabelTemplate} from './labels';
import regularFont from '../assets/DejaVuSans.ttf';
import monoFont from '../assets/DejaVuSansMono.ttf';
import './labels.css';

const STORAGE_KEY='planos-santo.labels.v1';
const TEMPLATES:LabelTemplate[]=['3x7','2x5'];
const SIDES:[keyof LabelMargins,string][]=[['top','Margen superior'],['right','Margen derecho'],['bottom','Margen inferior'],['left','Margen izquierdo']];
type Fields=Record<keyof LabelMargins,string>;
type Saved={template:LabelTemplate;margins:Record<LabelTemplate,LabelMargins>};
type Inputs={project:Project;references?:OrderReferences;pending?:readonly string[];template:LabelTemplate;fields:Fields;guides:boolean};
type Result=Inputs&{url:string;labels:number;pages:number;fileName:string};
const fieldsOf=(m:LabelMargins):Fields=>({top:String(m.top),right:String(m.right),bottom:String(m.bottom),left:String(m.left)});
const templateName=(t:LabelTemplate)=>`${LABEL_GRID[t].cols} × ${LABEL_GRID[t].rows}`;
const count=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const validMargins=(m:unknown):m is LabelMargins=>!!m&&typeof m==='object'&&SIDES.every(([side])=>typeof (m as Record<string,unknown>)[side]==='number');
/** Remembered template and margins per template; storage may be blocked in SketchUp's CEF. */
function load():Saved{
  const fallback:Saved={template:'3x7',margins:{...LABEL_DEFAULTS}};
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null') as Partial<Saved>|null;
    if(!raw)return fallback;
    const template=TEMPLATES.includes(raw.template as LabelTemplate)?raw.template as LabelTemplate:'3x7';
    return {template,margins:Object.fromEntries(TEMPLATES.map(t=>[t,validMargins(raw.margins?.[t])?raw.margins![t]:LABEL_DEFAULTS[t]])) as Record<LabelTemplate,LabelMargins>};
  }catch{return fallback;}
}
const parse=(fields:Fields):LabelMargins=>({top:Number(fields.top.replace(',','.')),right:Number(fields.right.replace(',','.')),bottom:Number(fields.bottom.replace(',','.')),left:Number(fields.left.replace(',','.'))});
const sameInputs=(a:Inputs,b:Inputs)=>a.project===b.project&&a.references===b.references&&a.pending===b.pending&&a.template===b.template&&a.guides===b.guides&&SIDES.every(([s])=>a.fields[s]===b.fields[s]);

/** Labels for self-adhesive A4 sheets: one per physical piece, built in the browser from the reviewed order. */
export default function LabelsPanel({project,references,pending,disabled=false}:{project:Project;references?:OrderReferences;pending?:readonly string[];disabled?:boolean}){
  const [saved,setSaved]=useState(load),[fields,setFields]=useState<Fields>(()=>fieldsOf(saved.margins[saved.template])),[guides,setGuides]=useState(false);
  const [result,setResult]=useState<Result>(),[error,setError]=useState<{inputs:Inputs;message:string}>(),[busy,setBusy]=useState(false);
  const id=useId(),template=saved.template,inputs:Inputs={project,references,pending,template,fields,guides};
  // Any change of the project, the order or the options invalidates the generated file (its URL is released below).
  if(result&&!sameInputs(result,inputs))setResult(undefined);
  if(error&&!sameInputs(error.inputs,inputs))setError(undefined);
  useEffect(()=>{const url=result?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[result?.url]);
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));}catch{/* storage blocked: options last for this session */}},[saved]);
  function chooseTemplate(next:LabelTemplate){setSaved(s=>({...s,template:next}));setFields(fieldsOf(saved.margins[next]));}
  function setField(side:keyof LabelMargins,value:string){
    const next={...fields,[side]:value};setFields(next);
    const margins=parse(next);if(SIDES.every(([s])=>Number.isFinite(margins[s])))setSaved(s=>({...s,margins:{...s.margins,[template]:margins}}));
  }
  function reset(){setFields(fieldsOf(LABEL_DEFAULTS[template]));setSaved(s=>({...s,margins:{...s.margins,[template]:LABEL_DEFAULTS[template]}}));}
  async function generate(){
    const started=inputs;setBusy(true);setError(undefined);
    try{
      const blank=SIDES.find(([s])=>!fields[s].trim());if(blank)throw new Error(`Completá el ${blank[1].toLowerCase()}.`);
      const output=await createLabelsPdf(project,decode64(regularFont),decode64(monoFont),{template,margins:parse(fields),references,pending,guides});
      const url=URL.createObjectURL(new Blob([new Uint8Array(output.bytes)],{type:'application/pdf'}));
      setResult({...started,url,labels:output.labels,pages:output.pages,fileName:labelsFileName(project)});
    }catch(failure){setResult(undefined);setError({inputs:started,message:failure instanceof Error?failure.message:String(failure)});}
    finally{setBusy(false);}
  }
  return <section className="labels-panel" aria-label="Etiquetas para piezas" data-testid="labels-panel">
    <header><h2>Etiquetas de piezas</h2><p>Hojas A4 autoadhesivas · una etiqueta por pieza con código, medidas, lote y cantos del pedido.</p></header>
    <div className="labels-options">
      <fieldset role="radiogroup" aria-label="Plantilla" data-testid="labels-template"><legend>Plantilla</legend>
        {TEMPLATES.map(t=><label key={t}><input type="radio" name={`${id}-template`} value={t} checked={template===t} onChange={()=>chooseTemplate(t)} data-testid={`labels-template-${t}`}/> {templateName(t)} · {LABEL_GRID[t].cols*LABEL_GRID[t].rows} por hoja</label>)}
      </fieldset>
      <fieldset className="labels-margins"><legend>Márgenes de la hoja (mm)</legend>
        {SIDES.map(([side,label])=><label key={side}>{label}<input type="number" inputMode="decimal" min={0} max={25} step={0.5} value={fields[side]} onChange={e=>setField(side,e.target.value)} data-testid={`labels-margin-${side}`}/></label>)}
        <button type="button" onClick={reset} data-testid="labels-reset">Restablecer márgenes</button>
      </fieldset>
      <label className="labels-guides"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)} data-testid="labels-guides"/> Líneas de corte</label>
    </div>
    <div className="labels-actions">
      <button type="button" className="labels-generate" disabled={disabled||busy} aria-busy={busy||undefined} onClick={()=>void generate()} data-testid="labels-generate">{busy?'Generando…':'Generar etiquetas'}</button>
      {result&&<nav aria-label="Etiquetas generadas"><a href={result.url} target="_blank" rel="noreferrer" data-testid="labels-open">Abrir etiquetas</a><a href={result.url} download={result.fileName} title={result.fileName} data-testid="labels-download">Descargar etiquetas</a></nav>}
    </div>
    <p className="labels-status" role="status" aria-live="polite" data-testid="labels-status">{result?`${count(result.labels,'etiqueta','etiquetas')} · ${count(result.pages,'hoja','hojas')} · plantilla ${templateName(result.template)}`:''}</p>
    {error&&<p className="labels-error" role="alert" data-testid="labels-error">{error.message}</p>}
  </section>;
}
