import type {Furniture,Piece} from './model';

export type PieceRow=Omit<Piece,'quantity'> & {quantity:number;memberIds:string[]};
const order=(a:Piece,b:Piece)=>a.code.localeCompare(b.code,undefined,{numeric:true})||a.id.localeCompare(b.id);

/** Only equivalent instances of one definition, inside this furniture. Physical IDs stay unique. */
export function identicalGroups(f:Furniture):Piece[][]{
  const groups:{pieces:Piece[];signature:string;scales:number[];mirrored:boolean}[]=[];
  for(const p of [...f.pieces].sort(order)){
    const t=p.transform;
    const scales=axisScales(t);
    const mirrored=isMirrored(t);
    const signature=JSON.stringify([p.definition,p.mesh,p.metadata?.material||null,p.metadata?.grainAxis??null]);
    const match=p.definition&&groups.find(g=>g.signature===signature&&g.mirrored===mirrored&&scales.every((v,i)=>Math.abs(v-g.scales[i])<=1e-8)&&p.dimensions.every((v,i)=>Math.abs(v-g.pieces[0].dimensions[i])<=1e-6));
    if(match)match.pieces.push(p);else groups.push({pieces:[p],signature,scales,mirrored});
  }
  return groups.map(g=>g.pieces);
}
const axisScales=(t:number[])=>[0,4,8].map(i=>Math.hypot(...t.slice(i,i+3)));
const isMirrored=(t:number[])=>t[0]*(t[5]*t[10]-t[6]*t[9])-t[4]*(t[1]*t[10]-t[2]*t[9])+t[8]*(t[1]*t[6]-t[2]*t[5])<0;

/** Tolerances of the physical equivalence used to group name suggestions (0.8.26). */
export const PHYSICAL_TOLERANCE_MM=0.5,SHAPE_TOLERANCE=0.002;
type Physical={piece:Piece;scales:number[];mirrored:boolean;material:string;grain:number|null;rectangular:boolean|null;fill:number;skin:number};
/** Shape invariants in the piece's own scaled axes: how much of its box the solid fills and how much of the box
 *  surface it has. Rectangular boards give 1 and 1; a notch, a bevel or a hole lowers them. Independent of
 *  vertex order and of the local origin, so equal boards drawn as different definitions still match. */
function physical(p:Piece):Physical{
  const t=p.transform,scales=axisScales(t),v=p.mesh.vertices.map(x=>x.map((c,i)=>c*scales[i]));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const x of v)for(let i=0;i<3;i++){if(x[i]<min[i])min[i]=x[i];if(x[i]>max[i])max[i]=x[i];}
  const size=max.map((m,i)=>m-min[i]);
  let volume=0,area=0;
  for(const [a,b,c] of p.mesh.triangles){
    const [ax,ay,az]=v[a],[bx,by,bz]=v[b],[cx,cy,cz]=v[c];
    volume+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;
    const ux=bx-ax,uy=by-ay,uz=bz-az,wx=cx-ax,wy=cy-ay,wz=cz-az;
    area+=Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)/2;
  }
  const box=size[0]*size[1]*size[2],skin=2*(size[0]*size[1]+size[1]*size[2]+size[0]*size[2]);
  const faces=[...new Set((p.mesh.faceMaterials||[]).flatMap(m=>[m.front?.id,m.back?.id]).filter(Boolean))].sort();
  const axis=p.metadata?.grainAxis;
  return {piece:p,scales,mirrored:isMirrored(t),material:JSON.stringify([p.metadata?.material?.id??null,faces]),
    grain:axis===undefined?null:size[axis],rectangular:p.metadata?.rectangular??null,fill:box>0?Math.abs(volume)/box:0,skin:skin>0?area/skin:0};
}
function equivalent(a:Physical,b:Physical){
  const near=(x:number,y:number)=>Math.abs(x-y)<=PHYSICAL_TOLERANCE_MM;
  if(a.mirrored!==b.mirrored||a.material!==b.material||a.rectangular!==b.rectangular)return false;
  if(!a.piece.dimensions.every((v,i)=>near(v,b.piece.dimensions[i])))return false;
  if((a.grain===null)!==(b.grain===null)||(a.grain!==null&&!near(a.grain,b.grain!)))return false;
  // Instances of one definition with the same scale share their mesh: equal shape by construction.
  if(a.piece.definition&&a.piece.definition===b.piece.definition&&a.scales.every((v,i)=>Math.abs(v-b.scales[i])<=1e-8))return true;
  return Math.abs(a.fill-b.fill)<=SHAPE_TOLERANCE&&Math.abs(a.skin-b.skin)<=SHAPE_TOLERANCE;
}
/**
 * Physical equivalence for name suggestions (0.8.26), across definitions: sorted measures within ±0,5 mm,
 * the same material (piece and painted faces), the same length along the grain when the grain axis is known,
 * the same handedness (mirror) and the same shape. `units` are kept whole (guide groups that must share a name);
 * a unit joins the first group whose first unit is equivalent to it.
 */
export function physicalGroups(f:Furniture,units:Piece[][]=f.pieces.map(p=>[p])):Piece[][][]{
  const groups:{key:Physical;units:Piece[][]}[]=[];
  for(const unit of [...units].sort((a,b)=>order(a[0],b[0]))){
    const key=physical(unit[0]),match=groups.find(g=>equivalent(g.key,key));
    if(match)match.units.push(unit);else groups.push({key,units:[unit]});
  }
  return groups.map(g=>g.units);
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
