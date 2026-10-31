import type {Furniture,Piece} from './model';

export type PieceRow=Omit<Piece,'quantity'> & {quantity:number;memberIds:string[]};
const order=(a:Piece,b:Piece)=>a.code.localeCompare(b.code,undefined,{numeric:true})||a.id.localeCompare(b.id);

/** Only equivalent instances of one definition, inside this furniture. Physical IDs stay unique. */
export function identicalGroups(f:Furniture,acrossDefinitions=false):Piece[][]{
  const groups:{pieces:Piece[];signature:string;scales:number[];mirrored:boolean}[]=[];
  for(const p of [...f.pieces].sort(order)){
    const t=p.transform;
    const scales=[0,4,8].map(i=>Math.hypot(...t.slice(i,i+3)));
    const mirrored=t[0]*(t[5]*t[10]-t[6]*t[9])-t[4]*(t[1]*t[10]-t[2]*t[9])+t[8]*(t[1]*t[6]-t[2]*t[5])<0;
    const signature=JSON.stringify([acrossDefinitions?null:p.definition,p.mesh,p.metadata?.material||null,p.metadata?.grainAxis??null]);
    const match=(acrossDefinitions||p.definition)&&groups.find(g=>g.signature===signature&&g.mirrored===mirrored&&scales.every((v,i)=>Math.abs(v-g.scales[i])<=1e-8)&&p.dimensions.every((v,i)=>Math.abs(v-g.pieces[0].dimensions[i])<=1e-6));
    if(match)match.pieces.push(p);else groups.push({pieces:[p],signature,scales,mirrored});
  }
  return groups.map(g=>g.pieces);
}
export function groupedPieces(f:Furniture):Piece[][]{
  return f.groupIdentical?identicalGroups(f):f.pieces.map(p=>[p]);
}
export function pieceRows(f:Furniture):PieceRow[]{
  return groupedPieces(f).map(members=>({...members[0],quantity:members.length,memberIds:members.map(p=>p.id)}));
}
export function pieceCodeMap(f:Furniture):Map<string,string>{
  return new Map(groupedPieces(f).flatMap(group=>group.map(p=>[p.id,group[0].code] as const)));
}
export function renamePieceGroup(f:Furniture,id:string,name:string):Furniture{
  const members=new Set(groupedPieces(f).find(group=>group.some(p=>p.id===id))?.map(p=>p.id)||[id]);
  return {...f,pieces:f.pieces.map(p=>members.has(p.id)?{...p,name}:p)};
}
export function synchronizeGroupedNames(f:Furniture):Furniture{
  if(!f.groupIdentical)return f;
  const names=new Map(identicalGroups(f).flatMap(group=>group.map(p=>[p.id,group[0].name] as const)));
  return {...f,pieces:f.pieces.map(p=>({...p,name:names.get(p.id)!}))};
}
export function groupedNameIssues(f:Furniture):string[]{
  return f.groupIdentical&&pieceRows(f).some(row=>!row.name.trim()||row.name.length>80)?['Completá un nombre de referencia de hasta 80 caracteres para cada fila agrupada.']:[];
}
