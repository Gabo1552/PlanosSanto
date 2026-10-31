import {Box3,Matrix3,Matrix4,Triangle,Vector3} from 'three';
import {bounds,type Furniture,type Piece,type Vec3} from './model';
import {groupedPieces,identicalGroups} from './pieceGroups';
import type {NamingReference} from './naming';
export type NamingOrientation=NamingReference;
export type NameSuggestion={ids:string[];code:string;previous:string;base:string;confidence:'high'|'review'|'unclassified';reason:string;position?:string;proposed?:string};
const generic=/^(sin nombre\b|grupo(?:#|\s|$)|group(?:#|\s|$)|componente(?:#|\s|$)|component(?:#|\s|$)|pieza\s+\d+)/i;
// Tolerances in mm: contact between boards, how far a piso may sit above its zócalo and the tallest zócalo.
const TOUCH=2,SEAT=20,PLINTH=150,THIN_BACK=10;
export function namingFrame(f:Furniture){return new Matrix4().fromArray(f.referenceTransform||new Matrix4().toArray()).invert();}
export function frontFromPick(f:Furniture,id:string,anchor:Vec3,upAxis:number){
 const p=f.pieces.find(piece=>piece.id===id);if(!p)throw Error('Pieza desconocida.');
 const point=new Vector3(...anchor),triangle=p.mesh.triangles.map(indices=>new Triangle(...indices.map(i=>new Vector3(...p.mesh.vertices[i])) as [Vector3,Vector3,Vector3])).sort((a,b)=>a.closestPointToPoint(point,new Vector3()).distanceToSquared(point)-b.closestPointToPoint(point,new Vector3()).distanceToSquared(point))[0];
 if(!triangle||triangle.closestPointToPoint(point,new Vector3()).distanceTo(point)>.1)throw Error('Tocá una cara vertical del frente.');
 const normal=triangle.getNormal(new Vector3()).applyMatrix3(new Matrix3().getNormalMatrix(namingFrame(f).multiply(new Matrix4().fromArray(p.transform)))).normalize();
 const axis=normal.toArray().map(Math.abs).indexOf(Math.max(...normal.toArray().map(Math.abs)));
 if(axis===upAxis||Math.abs(normal.getComponent(axis))<.95)throw Error('Elegí una cara vertical alineada con los ejes del grupo.');
 return {frontAxis:axis,frontSign:normal.getComponent(axis)>0?1:-1};
}
// Every piece in the furniture's own axes (the group's frame), with its thin-axis normal.
function pieceContexts(f:Furniture){
 const frame=namingFrame(f);
 return f.pieces.map(p=>{
  const m=frame.clone().multiply(new Matrix4().fromArray(p.transform)),box=bounds(p.mesh).applyMatrix4(m);
  const sizes=bounds(p.mesh).getSize(new Vector3()).toArray().map((size,i)=>size*new Vector3().setFromMatrixColumn(m,i).length()),thin=sizes.indexOf(Math.min(...sizes));
  return {p,m,box,sizes,ordered:[...sizes].sort((a,b)=>b-a),center:box.getCenter(new Vector3()),normal:new Vector3().setComponent(thin,1).applyMatrix3(new Matrix3().getNormalMatrix(m)).normalize(),
   irregular:p.metadata?.rectangular===false||p.warnings.some(w=>/subgrupos|caras propias/i.test(w)),parent:p.id.includes('/')?p.id.slice(0,p.id.lastIndexOf('/')):f.id};
 });
}
const corners=(box:Box3)=>[...Array(8)].map((_,i)=>new Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));
const range=(box:Box3,axis:Vector3)=>{const values=corners(box).map(p=>p.dot(axis));return [Math.min(...values),Math.max(...values)];};
const span=(box:Box3,axis:Vector3)=>{const [a,b]=range(box,axis);return b-a;};
const unit=(axis:number,sign=1)=>new Vector3().setComponent(axis,sign);
const nearestAxis=(v:Vector3,skip?:number)=>{const values=v.toArray(),axis=[0,1,2].filter(i=>i!==skip).sort((a,b)=>Math.abs(values[b])-Math.abs(values[a]))[0];return {axis,sign:values[axis]<0?-1:1,cos:Math.abs(values[axis])};};
const localOf=(f:Furniture,world:Vector3)=>world.clone().applyMatrix3(new Matrix3().setFromMatrix4(namingFrame(f))).normalize();
const worldOf=(transform:number[]|undefined,local:Vector3)=>local.clone().applyMatrix3(new Matrix3().setFromMatrix4(new Matrix4().fromArray(transform||new Matrix4().toArray()))).normalize();
/**
 * Vertical by default: SketchUp's blue axis (world +Z) expressed in the group's axes.
 * Criterion «claramente rotado»: the blue axis is more than 10° away from every
 * axis of the group (an oblique group). Only then the vertical is asked (null).
 * A group turned in 90° steps keeps an automatic vertical on the matching axis.
 */
export function uprightFromTransform(f:Furniture){
 const up=nearestAxis(localOf(f,new Vector3(0,0,1)));
 return up.cos>=Math.cos(Math.PI/18)?{upAxis:up.axis,upSign:up.sign}:null;
}
export type FrontCue='fondo'|'frentes';
/**
 * Proposes the front only when the geometry says so without contradiction: the side
 * opposite a thin back (≤10 mm, covering half the width and 40% of the height) and/or
 * the side with flush boards (doors, drawer fronts) that has no flush boards opposite
 * (two laterales cancel each other). Any disagreement returns null: the operator marks it.
 */
export function proposeFront(f:Furniture,upAxis:number):{frontAxis:number;frontSign:number;cue:FrontCue}|null{
 // Extremes come from the vertical boards: an overhanging tapa does not hide flush doors.
 const all=pieceContexts(f).filter(c=>!c.irregular),total=new Box3();all.filter(c=>Math.abs(c.normal.getComponent(upAxis))<.95).forEach(c=>total.union(c.box));
 if(total.isEmpty())return null;
 const votes=new Map<string,{frontAxis:number;frontSign:number;cue:FrontCue}>();
 const height=span(total,unit(upAxis))||1;
 for(const axis of [0,1,2].filter(a=>a!==upAxis)){
  const other=3-axis-upAxis,[lo,hi]=[total.min.getComponent(axis),total.max.getComponent(axis)],depth=hi-lo||1,width=span(total,unit(other))||1;
  const facing=all.filter(c=>Math.abs(c.normal.getComponent(axis))>.95);
  const side=(c:typeof all[number],sign:number)=>sign<0?c.center.getComponent(axis)-lo<=depth*.15:hi-c.center.getComponent(axis)<=depth*.15;
  const flush=(c:typeof all[number],sign:number)=>sign<0?c.box.min.getComponent(axis)-lo<=TOUCH:hi-c.box.max.getComponent(axis)<=TOUCH;
  const back=(sign:number)=>facing.some(c=>side(c,sign)&&c.ordered[2]<=THIN_BACK&&span(c.box,unit(other))>=width*.5&&span(c.box,unit(upAxis))>=height*.4);
  const covers=(sign:number)=>facing.some(c=>flush(c,sign)&&c.ordered[2]>THIN_BACK);
  for(const sign of [-1,1]){
   if(back(-sign)&&!back(sign))votes.set(`${axis},${sign}`,{frontAxis:axis,frontSign:sign,cue:votes.get(`${axis},${sign}`)?.cue||'fondo'});
   if(covers(sign)&&!covers(-sign))votes.set(`${axis},${sign}`,{frontAxis:axis,frontSign:sign,cue:'frentes'});
  }
 }
 return votes.size===1?[...votes.values()][0]:null;
}
export type OrientationSource='guardado'|FrontCue|'ejes';
/**
 * Initial orientation for «Proponer nombres»: the front saved in the guide (marked once),
 * otherwise the geometric proposal, otherwise the group axes (front −Y, vertical +Z).
 * Always confirmed: marking only the front is enough. askUp: the group is oblique to the blue axis.
 */
export function proposeOrientation(f:Furniture):{orientation:NamingOrientation;source:OrientationSource;askUp:boolean}{
 const saved=f.naming?.reference;
 if(saved&&saved.upAxis!==saved.frontAxis)return {orientation:{...saved,confirmed:true},source:'guardado',askUp:false};
 const upright=uprightFromTransform(f),up=upright||{upAxis:2,upSign:1},cue=proposeFront(f,up.upAxis);
 const axes=nearestAxis(localOf(f,new Vector3(0,-1,0)),up.upAxis),fallback=upright?{frontAxis:axes.axis,frontSign:axes.sign}:{frontAxis:1,frontSign:-1};
 // upSign is only written when negative: the saved reference keeps the 0.8.18 shape.
 return {orientation:{upAxis:up.upAxis,...(up.upSign<0?{upSign:-1}:{}),...(cue?{frontAxis:cue.frontAxis,frontSign:cue.frontSign}:fallback),confirmed:true},source:cue?.cue||'ejes',askUp:!upright};
}
export type ViewSide={axis:number;sign:number;world:Vec3};
/**
 * The front marked when naming, reused by the plans: the exterior view looks at the
 * front and the interior view at the opposite side. axis/sign are the group's axes;
 * world is the outward direction in SketchUp's axes. yaw (degrees, −180..180) is what
 * the default 'front' camera (which looks at the world −Y face) must turn around the
 * blue axis to look at this front; the 'back' camera turns the same angle.
 */
export function exteriorFromOrientation(orientation:NamingOrientation,referenceTransform?:number[]):{exterior:ViewSide;interior:ViewSide;up:ViewSide;yaw:number}{
 const side=(axis:number,sign:number):ViewSide=>({axis,sign,world:worldOf(referenceTransform,unit(axis,sign)).toArray() as Vec3});
 const exterior=side(orientation.frontAxis,orientation.frontSign),interior=side(orientation.frontAxis,-orientation.frontSign),up=side(orientation.upAxis,orientation.upSign||1);
 const flat=Math.hypot(exterior.world[0],exterior.world[1]);
 let yaw=flat<1e-6?0:Math.atan2(exterior.world[1],exterior.world[0])*180/Math.PI+90;
 if(yaw>180)yaw-=360;if(yaw<=-180)yaw+=360;
 return {exterior,interior,up,yaw:Math.abs(yaw)<1e-9?0:yaw};
}
/** Same, from the furniture: its saved front, or the proposal when it was never marked. */
export function furnitureExterior(f:Furniture){
 const proposal=proposeOrientation(f);
 return {...exteriorFromOrientation(proposal.orientation,f.referenceTransform),saved:proposal.source==='guardado'};
}
export function nameSuggestions(f:Furniture,orientation:NamingOrientation,includeNamed=false,groupEqual=false):NameSuggestion[]{
 const mirrored=new Matrix4().fromArray(f.referenceTransform||new Matrix4().toArray()).determinant()<0;
 const up=unit(orientation.upAxis,orientation.upSign||1),front=unit(orientation.frontAxis,orientation.frontSign),right=new Vector3().crossVectors(up,front).normalize().multiplyScalar(mirrored?-1:1);
 const contexts=pieceContexts(f);
 const total=new Box3();contexts.forEach(c=>total.union(c.box));
 type Context=typeof contexts[number];
 const zRange=range(total,up),xRange=range(total,right),yRange=range(total,front),width=xRange[1]-xRange[0],depth=yRange[1]-yRange[0];
 const horizontal=(c:Context)=>Math.abs(c.normal.dot(up))>.95,flat=contexts.filter(c=>!c.irregular&&horizontal(c));
 const inside=(outer:Context,inner:Context)=>[right,front].every(axis=>{const [a,b]=range(outer.box,axis),v=inner.center.dot(axis);return v>=a-TOUCH&&v<=b+TOUCH;});
 // Zócalo: low vertical strips standing on the floor of the box, longer than tall, with
 // a horizontal board seated on them and none below their top (a drawer front at floor
 // level has the piso behind or under it). The bands of the body start above it.
 const plinth=new Set(contexts.filter(c=>{
  if(c.irregular||Math.abs(c.normal.dot(up))>.05)return false;
  const [z0,z1]=range(c.box,up),h=z1-z0;
  return z0-zRange[0]<=TOUCH&&h<=Math.min(PLINTH,(zRange[1]-zRange[0])*.35)&&Math.max(span(c.box,right),span(c.box,front))>h&&flat.every(o=>range(o.box,up)[0]>=z1-TOUCH)&&flat.some(o=>{const seat=range(o.box,up)[0];return seat>=z1-TOUCH&&seat<=z1+SEAT&&inside(o,c);});
 }));
 const plinthTop=plinth.size?Math.max(...[...plinth].map(c=>range(c.box,up)[1])):zRange[0],body=[plinthTop,zRange[1]],bodyHeight=body[1]-body[0];
 function drawer(context:Context){
  const siblings=contexts.filter(c=>c.parent===context.parent);if(context.parent===f.id||siblings.length<3)return false;
  const siblingBox=new Box3();siblings.forEach(c=>siblingBox.union(c.box));
  return span(siblingBox,up)<(zRange[1]-zRange[0])*.45;
 }
 // Levels of the body's horizontal boards: the lowest is the piso, the highest the tapa.
 const levels=flat.filter(c=>!plinth.has(c)&&!drawer(c)),lowest=Math.min(...levels.map(c=>range(c.box,up)[0])),highest=Math.max(...levels.map(c=>range(c.box,up)[1]));
 const structural=bodyHeight>100&&new Set(levels.map(c=>Math.round(range(c.box,up)[0]))).size>1;
 function classify(p:Piece){
  if(!orientation.confirmed||orientation.upAxis===orientation.frontAxis)return {base:'Sin clasificar',confidence:'unclassified' as const,reason:'Falta confirmar vertical y frente del mueble.',position:'Sin frente confirmado'};
  const context=contexts.find(c=>c.p.id===p.id)!,{center,normal,ordered,irregular}=context;
  const pos=(axis:Vector3,r:number[])=>((center.dot(axis)-r[0])/(r[1]-r[0]||1));
  const x=pos(right,xRange),z=pos(up,body),y=pos(front,yRange),position=`${x<.2?'Izquierda':x>.8?'Derecha':'Centro'} · ${z<.2?'abajo':z>.8?'arriba':'intermedio'} · ${y<.2?'atrás':y>.8?'adelante':'interior'}`;
  const result=(base:string,confidence:'high'|'review'|'unclassified',reason:string)=>({base,confidence,reason,position});
  if(plinth.has(context))return result('Zócalo','high','Pieza baja apoyada en el piso con el piso del mueble encima; las franjas del mueble se miden sin el zócalo.');
  // A long piece is a listón even when its section is not thin (40×18): check it before the thin-board filter.
  if(!irregular&&ordered[0]/ordered[1]>8)return result('Listón','review','Pieza alargada; confirmar listón/travesaño/refuerzo (List).');
  if(irregular||ordered[2]/ordered[1]>.2)return result('Sin clasificar','unclassified','Geometría irregular o proporciones ajenas a un tablón fino; revisar sin adivinar su función.');
  const inDrawer=drawer(context);
  if(horizontal(context)){
   if(inDrawer)return result('Fondo cajón','review','Panel horizontal en conjunto anidado bajo; podría ser piso/fondo de cajón. Confirmar con las piezas vecinas.');
   const [z0,z1]=range(context.box,up),bottom=Math.abs(z0-lowest)<=TOUCH,top=Math.abs(z1-highest)<=TOUCH,wide=span(context.box,right)>=width*.6&&span(context.box,front)>=depth*.6;
   if(z<.15||(structural&&bottom&&!top&&z<.35)){
    // Seated on the zócalo, at the bottom of the body or between laterales that reach it.
    const sides=[-1,1].every(s=>contexts.some(c=>c!==context&&Math.abs(c.normal.dot(right))>.95&&(c.center.dot(right)-center.dot(right))*s>0&&range(c.box,up)[0]<=z0+TOUCH&&range(c.box,up)[1]>z1));
    const seated=plinth.size?z0<=plinthTop+SEAT:z0-body[0]<=SEAT+5||sides;
    return bottom&&wide&&seated?result('Piso','high',`Panel horizontal más bajo del mueble, apoyado ${plinth.size?'sobre el zócalo':'en la base o entre laterales'}.`):result('Piso','review','Panel horizontal inferior; confirmar Piso/base y relación con zócalo.');
   }
   if(z>.85||(structural&&top&&!bottom&&z>.65))return top&&wide?result('Tapa','high','Panel horizontal más alto del mueble y del ancho del mueble.'):result('Tapa','review','Panel horizontal superior; confirmar tapa o techo.');
   return result('Estante','review','Panel horizontal intermedio (Est); también puede ser piso de otro módulo. Requiere revisión.');
  }
  if(Math.abs(normal.dot(right))>.95){if(inDrawer)return result('Lateral cajón','review','Panel vertical en conjunto anidado bajo con vecinos; revisar si es lateral de cajón.');return result(x<.15||x>.85?'Lateral':'Divisor','high',x<.15||x>.85?'Panel vertical extremo (Lat) con frente confirmado; posición referida al mueble.':'Panel vertical interior que divide el ancho, con frente confirmado.');}
  if(Math.abs(normal.dot(front))>.95){
   if(inDrawer)return result('Frente cajón','review','Panel frontal de conjunto anidado bajo; confirmar frente/trasera de cajón (Fte / Del Caj).');
   if(y<.15)return ordered[2]<=THIN_BACK&&span(context.box,right)>=width*.5&&span(context.box,up)>=bodyHeight*.4?result('Fondo','high','Panel delgado detrás, opuesto al frente elegido.'):result('Fondo','review','Panel posterior respecto al frente elegido; confirmar Fondo o respaldo.');
   return result(span(context.box,up)>bodyHeight*.45?'Puerta':'Frente cajón','review','Panel paralelo al frente; puerta, frente de cajón o revestimiento son alternativas. Requiere revisión, no se decide solo por tamaño.');
  }
  return result('Sin clasificar','unclassified','Pieza oblicua respecto a los ejes elegidos; no hay clasificación confiable.');
 }
 return (groupEqual?identicalGroups(f,true):groupedPieces(f)).filter(group=>includeNamed||group.some(p=>!f.naming?.reviews?.some(r=>r.id===p.id)&&((p.metadata?.originalName??f.naming?.bases.find(b=>b.id===p.id)?.base??p.name)===''||generic.test(p.metadata?.originalName??f.naming?.bases.find(b=>b.id===p.id)?.base??p.name)))).map(group=>{
  const proposals=group.map(classify),same=proposals.every(p=>p.base===proposals[0].base);
  const proposal:NameSuggestion={ids:group.map(p=>p.id),code:group[0].code,previous:group[0].name,base:same?proposals[0].base:'Panel',confidence:same&&proposals.every(p=>p.confidence==='high')?'high':same?proposals[0].confidence:'review',reason:same?proposals[0].reason:'Componentes iguales en posiciones con funciones distintas; mantener nombre común requiere revisión.',position:[...new Set(proposals.map(p=>p.position))].join(' / ')};
  proposal.proposed=proposal.base;
  const source=group.map(p=>p.metadata?.definitionName||p.name).join(' ');
  const vocabulary=[{pattern:/\bLat\b/i,base:'Lat',roles:['Lateral']},{pattern:/\bPiso\b/i,base:'Piso',roles:['Piso']},{pattern:/\bList\b/i,base:'List',roles:['Listón']},{pattern:/\bFondo\b/i,base:'Fondo',roles:['Fondo']},{pattern:/\bEst\b/i,base:'Est',roles:['Estante']},{pattern:/\bPuerta\b/i,base:'Puerta',roles:['Puerta']},{pattern:/\bDel\s+Caj\b/i,base:'Del Caj',roles:['Frente cajón']},{pattern:/\bFte\b/i,base:'Fte',roles:['Frente cajón']},{pattern:/(?<![\p{L}\p{N}])Z[oó]calo(?![\p{L}\p{N}])/iu,base:'Zócalo',roles:['Zócalo']}].find(v=>v.pattern.test(source));
  if(orientation.confirmed&&vocabulary){if(vocabulary.roles.includes(proposal.base)){proposal.base=vocabulary.base;proposal.reason+=' Se conserva abreviatura observada del taller: '+vocabulary.base+'.';}else{proposal.confidence='review';proposal.reason+=' Abreviatura observada '+vocabulary.base+' sin coincidencia geométrica suficiente; no se impone como función.';}}
  if(/\b(PT|Banq|Ranu)\b/i.test(source)){proposal.confidence=orientation.confirmed?'review':'unclassified';proposal.reason+=' PT/Banq/Ranu son abreviaturas ambiguas del taller; no se expanden automáticamente.';}
  const reviews=(f.naming?.reviews||[]).filter(r=>r.proposed===proposal.proposed),own=reviews.filter(r=>group.some(p=>p.id===r.id));
  // Position-specific edits belong to their physical piece. Only known generic
  // workshop vocabulary can be proposed for a different instance.
  const portable=/^(Lat|Lateral|Divisor|Piso|Tapa|Est|Estante|Fondo|List|Listón|Puerta|Fte|Frente|Del Caj|Frente cajón|Lateral cajón|Fondo cajón|Zócalo|Zocalo|Zoc)$/iu;
  const corrections=[...new Set((own.length?own:proposal.confidence==='unclassified'?[]:reviews.filter(r=>portable.test(r.base))).map(r=>r.base))];
  if(orientation.confirmed&&corrections.length===1){proposal.base=corrections[0];proposal.confidence='review';proposal.reason+=' Vocabulario corregido anteriormente en este mueble; revisar antes de aplicar.';}
  return proposal;
 });
}
