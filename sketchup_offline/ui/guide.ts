import {withNaming,moduleFromName} from '../../lib/naming';
import type {PieceNaming} from '../../lib/naming';
import type {Presentation} from '../../lib/presentation';
import { importDocument, type Furniture, type Note, type Project, type HiddenDimension, type RawDocument } from '../../lib/model';

export type GuideFurniture = {
  groupIdentical?:boolean;groupName?:string;id:string; explosion:number; zoom:number; hiddenDimensions?:HiddenDimension[];presentation?:Presentation;naming?:PieceNaming;
  pieces:{id:string;name:string;code:string;previousCode?:string}[]; notes:Note[];
  // One-shot permission to change saved codes (DESPIECE-01); guide_store.rb keeps previousCode and never stores it.
  renumber?:true;
};
export type Guide = {workCode?:string;version:1;revision:number;selection:string[];furniture:GuideFurniture[]};
export type Generated = {document:RawDocument;guide:Guide;fingerprint:string};
// unsaved: piece ids per furniture that have no code in the saved guide yet («sin código»).
export type LocalGuide = {project:Project;orphans:Record<string,Note[]>;unsaved:Record<string,string[]>};

// «Agrupar por medidas» is a per-workstation convenience until guide_store.rb accepts the field: never sent to SketchUp.
// Instance paths such as '1/13/12' repeat between models, so the preference is keyed by the model GUID as well;
// without a GUID it lasts only for this session. The v2 key drops the old preferences keyed by the path alone.
const FOLD_KEY='planos-santo.a4.foldTable.v2';
const foldId=(modelGuid:string,id:string)=>JSON.stringify([modelGuid,id]);
function foldPreferences(storageKey=FOLD_KEY):Record<string,boolean>{try{const value:unknown=JSON.parse(globalThis.localStorage?.getItem(storageKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,boolean>:{};}catch{return {};}}
export const modelGuidOf=(project?:{importedDocument?:RawDocument})=>project?.importedDocument?.exporter?.modelGuid;
function remember(storageKey:string,modelGuid:string|undefined,id:string,value:boolean){if(!modelGuid)return;try{const all=foldPreferences(storageKey),key=foldId(modelGuid,id);if(value)all[key]=true;else delete all[key];globalThis.localStorage?.setItem(storageKey,JSON.stringify(all));}catch{/* storage unavailable: the option lasts for this session */}}
export function rememberFoldTable(modelGuid:string|undefined,id:string,value:boolean){remember(FOLD_KEY,modelGuid,id,value);}
const DEFAULT_GUIDE={mode:'both' as const,hiddenPieceIds:[] as string[],sharedCamera:true,observations:''};
// detailSheet was the «Permitir hoja 2» consent until 0.8.15: the A4 now adds hoja 2 by itself (punto 29), and a stale value is never sent.
function withoutLocalOptions(presentation:Presentation):Presentation{
  if(!presentation.guide||!('foldTable' in presentation.guide||'detailSheet' in presentation.guide))return presentation;
  const {foldTable:_omit,detailSheet:_local,...guide}=presentation.guide;void _omit;void _local;return {...presentation,guide};
}

export function mergeGuide(document:RawDocument,guide:Guide):LocalGuide {
  const project=importDocument(document,'sketchup-ruby');
  const orphans:Record<string,Note[]>={},unsaved:Record<string,string[]>={};
  for(const furniture of project.furniture){
    const previous=guide.furniture.find(f=>f.id===furniture.id);
    if(!previous){unsaved[furniture.id]=furniture.pieces.map(p=>p.id);continue;}
    if(!Array.isArray(previous.pieces)||!Array.isArray(previous.notes))throw new Error('La guía guardada es incompatible. No se sobrescribió.');
    furniture.groupIdentical=previous.groupIdentical;
    furniture.presentation=structuredClone(previous.presentation);
    if(furniture.presentation?.guide)furniture.presentation.guide.hiddenPieceIds=furniture.presentation.guide.hiddenPieceIds.filter(id=>furniture.pieces.some(p=>p.id===id));
    if(furniture.presentation?.dimensionOffsets)furniture.presentation.dimensionOffsets=furniture.presentation.dimensionOffsets.filter(ref=>furniture.pieces.some(p=>p.id===ref.pieceId));
    furniture.naming=structuredClone(previous.naming);
    furniture.hiddenDimensions=structuredClone((previous.hiddenDimensions||[]).filter(ref=>furniture.pieces.some(p=>p.id===ref.pieceId)));
    furniture.explosion=previous.explosion;furniture.zoom=previous.zoom;
    const codes=new Set(previous.pieces.map(p=>p.code));
    let next=Math.max(0,...previous.pieces.map(p=>Number(p.code.slice(1))||0))+1;
    unsaved[furniture.id]=[];
    for(const piece of furniture.pieces){
      const saved=previous.pieces.find(p=>p.id===piece.id);
      if(!saved)unsaved[furniture.id].push(piece.id);
      if(saved){piece.name=saved.name;piece.code=saved.code;}
      else{
        while(codes.has(`P${String(next).padStart(2,'0')}`))next++;
        if(next>9999)throw new Error('Se agotaron los códigos de la guía. Revisá el historial del mueble.');
        piece.code=`P${String(next++).padStart(2,'0')}`;codes.add(piece.code);
      }
    }
    const pieceIds=new Set(furniture.pieces.map(p=>p.id));
    furniture.notes=structuredClone(previous.notes.filter(n=>pieceIds.has(n.pieceId)));
    orphans[furniture.id]=structuredClone(previous.notes.filter(n=>!pieceIds.has(n.pieceId)));
  }
  const modelGuid=document.exporter?.modelGuid,folds=modelGuid?foldPreferences():{};
  // A remembered fold applies even when the saved guide has no options yet for that furniture.
  if(modelGuid)for(const furniture of project.furniture)if(folds[foldId(modelGuid,furniture.id)])furniture.presentation={...furniture.presentation,guide:{...(furniture.presentation?.guide||DEFAULT_GUIDE),foldTable:true}};
  project.furniture=project.furniture.map(f=>withNaming({...f,naming:f.naming?{...f.naming,moduleCode:moduleFromName(f.name)||f.naming.moduleCode}:undefined},guide.workCode||''));
  return {project,orphans,unsaved};
}

export function editsFor(project:Project,orphans:Record<string,Note[]>,renumbered?:ReadonlySet<string>):GuideFurniture[]{
  return project.furniture.map(f=>({...(renumbered?.has(f.id)?{renumber:true as const}:{}),id:f.id,groupName:f.groupName,groupIdentical:f.groupIdentical||false,explosion:f.explosion,zoom:f.zoom,presentation:withoutLocalOptions(f.presentation||{}),naming:f.naming,hiddenDimensions:f.hiddenDimensions||[],
    pieces:f.pieces.map(p=>({id:p.id,name:p.name,code:p.code})),notes:[...f.notes,...(orphans[f.id]||[])]}));
}

// Stored code history (previousCode) is owned by guide_store.rb and never sent back: compare without it.
export function withoutCodeHistory(f?:GuideFurniture){return f&&{...f,pieces:f.pieces.map(({previousCode:_omit,...p})=>{void _omit;return p;})};}

export function countPieces(node:{mesh?:unknown;children:typeof node[]}):number{
  return (node.mesh?1:0)+node.children.reduce((sum,n)=>sum+countPieces(n),0);
}

/** What cannot be saved or printed. Orphan notes are only a notice (guideNotices, punto 22). */
export function guideIssues(f:Furniture):string[]{
  const issues:string[]=[];
  if(f.groupName!==undefined&&(!f.groupName.trim()||f.groupName.length>80))issues.push('Completá un nombre de grupo de hasta 80 caracteres.');
  if(f.pieces.some(p=>!p.name.trim()||p.name.length>80))issues.push('Cada pieza necesita un nombre de hasta 80 caracteres.');
  return issues;
}
/** Notices that never block: notes whose piece is gone stay in the guide and are left out of the PDF. */
export function guideNotices(orphans:Note[]):string[]{
  return orphans.length?[`${orphans.length===1?'Hay 1 nota':`Hay ${orphans.length} notas`} sin pieza de destino: no se imprime${orphans.length===1?'':'n'}. Reanclala${orphans.length===1?'':'s'} o eliminala${orphans.length===1?'':'s'} cuando quieras.`]:[];
}
