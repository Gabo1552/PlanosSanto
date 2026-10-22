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
/** Simplificación punto 22: only two letters make an obra; anything else names without obra (never blocks). */
export const effectiveWorkCode=(workCode:string)=>/^[A-Z]{2}$/.test(workCode)?workCode:'';
const MODULE_CODE=/^M\d{1,3}$/;
/** Punto 22: with an obra, a furniture without a valid module takes the next free M01, M02… in list order. */
export function autoModules(list:Furniture[],workCode:string):Furniture[]{
  if(!effectiveWorkCode(workCode))return list;
  const used=new Set(list.map(f=>f.naming?.moduleCode||'').filter(code=>MODULE_CODE.test(code)).map(code=>Number(code.slice(1))));
  let next=1;
  return list.map(f=>{
    if(MODULE_CODE.test(f.naming?.moduleCode||''))return f;
    while(used.has(next))next++;
    used.add(next);
    return withNaming(f,workCode,`M${String(next).padStart(2,'0')}`);
  });
}
/** Blocking issues: a name that cannot be saved. Obra and módulo are deduced (punto 22, autoModules before saving), so they never block. */
export function namingIssues(f:Furniture){
  const issues:string[]=groupedNameIssues(f);
  if(f.naming?.bases.some(b=>!b.base.trim()))issues.push('Completá el nombre de cada pieza, por ejemplo Lateral.');
  return issues;
}
/** Notices that never block: an incomplete obra is left out of the names until it has two letters. */
export function namingNotices(workCode:string){
  return workCode&&!effectiveWorkCode(workCode)?['La obra lleva dos letras (por ejemplo VF); mientras tanto los nombres se guardan sin obra.']:[];
}
