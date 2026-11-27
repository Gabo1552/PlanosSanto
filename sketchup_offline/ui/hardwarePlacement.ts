// Herrajes en 3D (0.8.37): dónde va cada bisagra (codo 0) y cada corredera en el mueble armado. Lógica pura sobre
// los muebles generados (mismas cotas totales que el A4: alto, ancho a la derecha mirando el frente y profundidad
// hacia afuera) y las filas de Piezas que ya suman herrajes (hardwareModel.ts). Ruby solo construye lo que esto
// calcula, en un grupo propio fuera de los muebles.
import {Matrix4,Vector3} from 'three';
import {bounds,type Furniture} from '../../lib/model';
import {furnitureEnvelope,type Envelope} from '../../lib/scene';
import type {CutlistPiece} from './cutlistModel';
import {computeHardware,hingeCount,type HardwareRoles} from './hardwareModel';

/** Bisagra codo 0 (puerta que tapa el lateral entero): cazoleta Ø35 a `cupCenterFromEdgeMm` del canto y la primera
 * y la última a `endMarginMm` de las puntas. Corredera: `aboveFrontBottomMm` sobre el borde inferior del frente. */
export const PLACEMENT_RULES={cupCenterFromEdgeMm:22,endMarginMm:100,runnerAboveFrontBottomMm:30,runnerHeightMm:35,runnerThicknessMm:12.5,sidePanelMaxMm:40} as const;

export type HingeSide='left'|'right';
/** `matrix`: local → mundo, column-major, mm (como el paquete de obra). Bisagra: origen en el canto de la bisagra,
 * cara interior de la puerta, a la altura de la bisagra; x hacia adentro de la puerta, y hacia el interior del
 * mueble. Corredera: origen en la cara del lateral (más medio espesor de corredera), frente del cuerpo y borde
 * inferior; x hacia el fondo, z arriba. */
export type HardwarePlacement={pieceId:string;kind:'hinge'|'runner';side:HingeSide;lengthMm:number|null;matrix:number[]};
export type DoorHinges={pieceId:string;name:string;code:string;suggested:HingeSide;side:HingeSide;hinges:number};
export type FurniturePlan={furnitureId:string;furnitureName:string;placements:HardwarePlacement[];doors:DoorHinges[];notes:string[]};

type Range=[number,number];
type Ranges={alto:Range;ancho:Range;profundidad:Range};
const AXES=['alto','ancho','profundidad'] as const;

function ranges(envelope:Envelope,f:Furniture,id:string):Ranges|null{
  const piece=f.pieces.find(p=>p.id===id);
  if(!piece)return null;
  const box=bounds(piece.mesh),matrix=new Matrix4().fromArray(piece.transform);
  const result={alto:[Infinity,-Infinity],ancho:[Infinity,-Infinity],profundidad:[Infinity,-Infinity]} as Ranges;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=new Vector3(x,y,z).applyMatrix4(matrix);
    for(const axis of AXES){const d=point.dot(envelope.axes[axis]);result[axis][0]=Math.min(result[axis][0],d);result[axis][1]=Math.max(result[axis][1],d);}
  }
  return result;
}
const round=(value:number,digits:number)=>{const factor=10**digits,result=Math.round(value*factor)/factor;return Object.is(result,-0)?0:result;};
/** Punto del mundo con coordenadas en los ejes del mueble (ortonormales). */
function point(envelope:Envelope,alto:number,ancho:number,profundidad:number){
  const {axes}=envelope;
  return new Vector3().addScaledVector(axes.alto,alto).addScaledVector(axes.ancho,ancho).addScaledVector(axes.profundidad,profundidad);
}
function matrix(x:Vector3,y:Vector3,z:Vector3,origin:Vector3):number[]{
  return new Matrix4().makeBasis(x,y,z).setPosition(origin).toArray().map((value,index)=>round(value,index>=12&&index<=14?2:6));
}
/** Alturas de las bisagras: la primera y la última a 100 mm de las puntas (menos en puertas muy bajas), el resto parejo. */
export function hingeHeights(bottom:number,top:number,count:number):number[]{
  const margin=Math.min(PLACEMENT_RULES.endMarginMm,(top-bottom)/4),span=top-bottom-2*margin;
  return Array.from({length:count},(_,i)=>bottom+margin+(count>1?span*i/(count-1):span/2));
}

/**
 * Herrajes de un mueble: `rows`, sus filas de Piezas; `sides`, el lado de las bisagras elegido por puerta (si no,
 * el sugerido: del lado del costado más cercano del mueble). Sin frente confirmado o sin geometría, no hay nada que colocar.
 */
export function planFurniture(f:Furniture,rows:CutlistPiece[],sides:Record<string,HingeSide>={},roles:HardwareRoles={}):FurniturePlan{
  const plan:FurniturePlan={furnitureId:f.id,furnitureName:rows[0]?.furnitureName||f.name,placements:[],doors:[],notes:[]};
  const envelope=furnitureEnvelope(f);
  if(!envelope)return plan;
  const {axes}=envelope,middle=(envelope.min.ancho+envelope.max.ancho)/2;
  const {lines}=computeHardware({pieces:rows},[f],[],roles);
  // Piezas físicas con bisagras y con correderas (por nombre o elegidas en Piezas), con su fila del listado.
  const doors=new Map<string,CutlistPiece>(),drawers=new Map<string,{row:CutlistPiece;length:number}>();
  for(const line of lines){
    if(line.kind==='hinge')line.sources.forEach(source=>source.ids.forEach(id=>doors.set(id,source.piece)));
    if(line.kind==='runner'&&line.lengthMm)line.sources.forEach(source=>source.ids.forEach(id=>drawers.set(id,{row:source.piece,length:line.lengthMm!})));
  }
  for(const [id,row] of doors){
    const index=row.ids.indexOf(id);
    const r=ranges(envelope,f,id);
    if(!r)continue;
    const center=(r.ancho[0]+r.ancho[1])/2,suggested:HingeSide=center>middle+1?'right':'left',side=sides[id]||suggested;
    const count=hingeCount(r.alto[1]-r.alto[0]),code=row.idCodes?.[index]||(row.ids.length===1?row.code:'');
    plan.doors.push({pieceId:id,name:row.name,code,suggested,side,hinges:count});
    // Codo 0: la bisagra queda en el canto del lado elegido. Ejes derechos en los dos lados (la bisagra es simétrica en z).
    const left=side==='left',edge=left?r.ancho[0]:r.ancho[1];
    const x=axes.ancho.clone().multiplyScalar(left?1:-1),y=axes.profundidad.clone().negate(),z=axes.alto.clone().multiplyScalar(left?1:-1);
    for(const height of hingeHeights(r.alto[0],r.alto[1],count))
      plan.placements.push({pieceId:id,kind:'hinge',side,lengthMm:null,matrix:matrix(x,y,z,point(envelope,height,edge,r.profundidad[0]))});
  }
  // Laterales y divisores del cuerpo: piezas finas en el ancho, de alto y profundidad de tablero. Las piezas de la caja
  // del cajón («Lateral cajón», «Del Caj») quedan afuera: la corredera va entre el cuerpo y la caja.
  const names=new Map(rows.flatMap(row=>row.ids.map(id=>[id,row.name] as const))),drawerBox=/caj(?:[oó]n)?(?![\p{L}\p{N}])/iu;
  const panels=f.pieces.filter(p=>!drawerBox.test(names.get(p.id)||p.name)).map(p=>({id:p.id,r:ranges(envelope,f,p.id)!})).filter(({r})=>r.ancho[1]-r.ancho[0]<=PLACEMENT_RULES.sidePanelMaxMm&&r.alto[1]-r.alto[0]>100&&r.profundidad[1]-r.profundidad[0]>100);
  for(const [id,{row,length}] of drawers){
    const r=ranges(envelope,f,id);
    if(!r)continue;
    const inner=r.profundidad[0],center=(r.ancho[0]+r.ancho[1])/2;
    const bottom=Math.max(r.alto[0],Math.min(r.alto[0]+PLACEMENT_RULES.runnerAboveFrontBottomMm,r.alto[1]-PLACEMENT_RULES.runnerHeightMm));
    // Paneles detrás del frente que cubren la altura de la corredera.
    const behind=panels.filter(({id:other,r:p})=>other!==id&&p.profundidad[1]<=inner+2&&p.profundidad[1]>=inner-100&&p.alto[0]<=bottom&&p.alto[1]>=bottom+PLACEMENT_RULES.runnerHeightMm);
    const leftFaces=behind.filter(({r:p})=>p.ancho[1]<=center).map(({r:p})=>p.ancho[1]),rightFaces=behind.filter(({r:p})=>p.ancho[0]>=center).map(({r:p})=>p.ancho[0]);
    if(!leftFaces.length||!rightFaces.length){plan.notes.push(`${row.name} (${plan.furnitureName}): no encontré los laterales a los costados del cajón; sus correderas no se colocan.`);continue;}
    const half=PLACEMENT_RULES.runnerThicknessMm/2,x=axes.profundidad.clone().negate(),y=axes.ancho.clone().negate(),z=axes.alto.clone();
    for(const [side,face] of [['left',Math.max(...leftFaces)+half],['right',Math.min(...rightFaces)-half]] as const)
      plan.placements.push({pieceId:id,kind:'runner',side,lengthMm:length,matrix:matrix(x,y,z,point(envelope,bottom,face,inner))});
  }
  plan.notes=[...new Set(plan.notes)];
  return plan;
}
