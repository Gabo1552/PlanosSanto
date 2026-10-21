import {groupedPieces,groupedNameIssues} from './pieceGroups';
import type {Furniture} from './model';
export type NamingReference={upAxis:number;upSign?:number;frontAxis:number;frontSign:number;confirmed:boolean};
export type PieceNaming={moduleCode:string;bases:{id:string;base:string}[];reference?:NamingReference;reviews?:{id:string;proposed:string;base:string}[]};
export const moduleFromName=(name:string)=>name.match(/(?:^|[^\p{L}\p{N}])(M\d{1,3})(?![\p{L}\p{N}])/iu)?.[1].toUpperCase()||'';
export const fullPieceName=(workCode:string,moduleCode:string,base:string)=>workCode?`${workCode} ${moduleCode} ${base}`.replace(/\s+/g,' ').trim():base;
export function withNaming(f:Furniture,workCode:string,moduleCode=f.naming?.moduleCode||moduleFromName(f.name),edit?:{id:string;base:string}):Furniture{
  const groups=groupedPieces(f);
  const editIds=new Set(edit?groups.find(group=>group.some(p=>p.id===edit.id))?.map(p=>p.id)||[edit.id]:[]);
  const bases=f.pieces.map(p=>{
    const saved=f.naming?.bases.find(b=>b.id===p.id)?.base;
    const prefix=workCode&&moduleCode?`${workCode} ${moduleCode} `:'';
    let base=edit&&editIds.has(p.id)?edit.base:saved??(workCode?p.metadata?.nameBase:undefined)??(prefix&&p.name.startsWith(prefix)?p.name.slice(prefix.length):p.name);
    // Imported SketchUp names may already use the workshop format before either
    // field was configured. Only split an untouched source name; owned bases and
    // arbitrary foreign prefixes remain intact.
    const original=p.metadata?.originalName||p.metadata?.definitionName||p.name;
    if(workCode&&moduleCode&&!editIds.has(p.id)&&base===original){
      if(p.metadata?.nameBase!==undefined)base=p.metadata.nameBase;
      else{
        const imported=base.match(/^[A-Z]{2}\s+M\d{1,3}\s+(.+)$/iu);
        if(imported)base=imported[1];
      }
    }
    return {id:p.id,base};
  });
  // Grouping changes row/ID presentation only. Each physical instance keeps
  // its own base unless the operator explicitly edits a grouped name above.
  return {...f,naming:{...f.naming,moduleCode,bases,...(f.naming?.reviews?{reviews:f.naming.reviews.filter(r=>f.pieces.some(p=>p.id===r.id))}:{})},pieces:f.pieces.map(p=>({...p,name:fullPieceName(workCode,moduleCode,bases.find(b=>b.id===p.id)!.base)}))};
}
export function normalizeNaming(f:Furniture,workCode:string){
  const prepared=withNaming(f,workCode);
  if(prepared.groupName!==undefined){prepared.groupName=prepared.groupName.normalize('NFC').replace(/\s+/g,' ').trim();prepared.name=prepared.groupName;}
  prepared.naming!.bases=prepared.naming!.bases.map(b=>({...b,base:b.base.normalize('NFC').replace(/\s+/g,' ').trim()}));
  return withNaming(prepared,workCode);
}
export function namingIssues(f:Furniture,workCode:string){
  const issues:string[]=groupedNameIssues(f);
  if(workCode&&!/^[A-Z]{2}$/.test(workCode))issues.push('Completá las dos letras de la obra, por ejemplo VF.');
  if(workCode&&!/^M\d{1,3}$/.test(f.naming?.moduleCode||''))issues.push('Completá el módulo de este mueble, por ejemplo M01, o agregalo al grupo y volvé a analizar.');
  if(f.naming?.bases.some(b=>!b.base.trim()))issues.push('Completá el nombre de cada pieza, por ejemplo Lateral.');
  return issues;
}
