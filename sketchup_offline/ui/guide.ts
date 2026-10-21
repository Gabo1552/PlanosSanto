import {withNaming,moduleFromName} from '../../lib/naming';
import type {PieceNaming} from '../../lib/naming';
import type {Presentation} from '../../lib/presentation';
import { importDocument, type Furniture, type Note, type Project, type HiddenDimension, type RawDocument } from '../../lib/model';

export type GuideFurniture = {
  groupIdentical?:boolean;groupName?:string;id:string; explosion:number; zoom:number; hiddenDimensions?:HiddenDimension[];presentation?:Presentation;naming?:PieceNaming;
  pieces:{id:string;name:string;code:string}[]; notes:Note[];
};
export type Guide = {workCode?:string;version:1;revision:number;selection:string[];furniture:GuideFurniture[]};
export type Generated = {document:RawDocument;guide:Guide;fingerprint:string};
export type LocalGuide = {project:Project;orphans:Record<string,Note[]>};

export function mergeGuide(document:RawDocument,guide:Guide):LocalGuide {
  const project=importDocument(document,'sketchup-ruby');
  const orphans:Record<string,Note[]>={};
  for(const furniture of project.furniture){
    const previous=guide.furniture.find(f=>f.id===furniture.id);
    if(!previous)continue;
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
    for(const piece of furniture.pieces){
      const saved=previous.pieces.find(p=>p.id===piece.id);
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
  project.furniture=project.furniture.map(f=>withNaming({...f,naming:f.naming?{...f.naming,moduleCode:moduleFromName(f.name)||f.naming.moduleCode}:undefined},guide.workCode||''));
  return {project,orphans};
}

export function editsFor(project:Project,orphans:Record<string,Note[]>):GuideFurniture[]{
  return project.furniture.map(f=>({id:f.id,groupName:f.groupName,groupIdentical:f.groupIdentical||false,explosion:f.explosion,zoom:f.zoom,presentation:f.presentation||{},naming:f.naming,hiddenDimensions:f.hiddenDimensions||[],
    pieces:f.pieces.map(p=>({id:p.id,name:p.name,code:p.code})),notes:[...f.notes,...(orphans[f.id]||[])]}));
}

export function countPieces(node:{mesh?:unknown;children:typeof node[]}):number{
  return (node.mesh?1:0)+node.children.reduce((sum,n)=>sum+countPieces(n),0);
}

export function guideIssues(f:Furniture,orphans:Note[]):string[]{
  const issues:string[]=[];
  if(f.groupName!==undefined&&(!f.groupName.trim()||f.groupName.length>80))issues.push('Completá un nombre de grupo de hasta 80 caracteres.');
  if(orphans.length)issues.push('Hay notas sin pieza de destino. Reanclalas o eliminalas antes de exportar.');
  if(f.pieces.some(p=>!p.name.trim()||p.name.length>80))issues.push('Cada pieza necesita un nombre de hasta 80 caracteres.');
  return issues;
}
