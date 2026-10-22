import {Box3,Matrix3,Matrix4,Triangle,Vector3} from 'three';
import {bounds,type Furniture,type Piece,type Vec3} from './model';
import {groupedPieces} from './pieceGroups';
import type {NamingReference} from './naming';
export type NamingOrientation=NamingReference;
export type NameSuggestion={ids:string[];code:string;previous:string;base:string;confidence:'high'|'review'|'unclassified';reason:string;position?:string;proposed?:string};
const generic=/^(sin nombre\b|grupo(?:#|\s|$)|group(?:#|\s|$)|componente(?:#|\s|$)|component(?:#|\s|$)|pieza\s+\d+)/i;
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
export function nameSuggestions(f:Furniture,orientation:NamingOrientation,includeNamed=false):NameSuggestion[]{
 const frame=namingFrame(f),mirrored=new Matrix4().fromArray(f.referenceTransform||new Matrix4().toArray()).determinant()<0;
 const up=new Vector3().setComponent(orientation.upAxis,orientation.upSign||1),front=new Vector3().setComponent(orientation.frontAxis,orientation.frontSign),right=new Vector3().crossVectors(up,front).normalize().multiplyScalar(mirrored?-1:1);
 const contexts=f.pieces.map(p=>{const m=frame.clone().multiply(new Matrix4().fromArray(p.transform)),box=bounds(p.mesh).applyMatrix4(m);return {p,m,box,center:box.getCenter(new Vector3()),parent:p.id.includes('/')?p.id.slice(0,p.id.lastIndexOf('/')):f.id};});
 const total=new Box3();contexts.forEach(c=>total.union(c.box));
 const corners=(box:Box3)=>[...Array(8)].map((_,i)=>new Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));
 const range=(box:Box3,axis:Vector3)=>{const values=corners(box).map(p=>p.dot(axis));return [Math.min(...values),Math.max(...values)];};
 const zRange=range(total,up),xRange=range(total,right),yRange=range(total,front);
 function classify(p:Piece){
  if(!orientation.confirmed||orientation.upAxis===orientation.frontAxis)return {base:'Sin clasificar',confidence:'unclassified' as const,reason:'Falta confirmar vertical y frente del mueble.',position:'Sin frente confirmado'};
  const context=contexts.find(c=>c.p.id===p.id)!,{m,center}=context;
  const local=bounds(p.mesh).getSize(new Vector3()).toArray(),sizes=local.map((size,i)=>size*new Vector3().setFromMatrixColumn(m,i).length()),ordered=[...sizes].sort((a,b)=>b-a);
  const thin=sizes.indexOf(Math.min(...sizes)),normal=new Vector3().setComponent(thin,1).applyMatrix3(new Matrix3().getNormalMatrix(m)).normalize();
  const pos=(axis:Vector3,r:number[])=>((center.dot(axis)-r[0])/(r[1]-r[0]||1));
  const x=pos(right,xRange),z=pos(up,zRange),y=pos(front,yRange),position=`${x<.2?'Izquierda':x>.8?'Derecha':'Centro'} · ${z<.2?'abajo':z>.8?'arriba':'intermedio'} · ${y<.2?'atrás':y>.8?'adelante':'interior'}`;
  const result=(base:string,confidence:'high'|'review'|'unclassified',reason:string)=>({base,confidence,reason,position});
  const irregular=p.metadata?.rectangular===false||p.warnings.some(w=>/subgrupos|caras propias/i.test(w));
  // A long piece is a listón even when its section is not thin (40×18): check it before the thin-board filter.
  if(!irregular&&ordered[0]/ordered[1]>8)return result('Listón','review','Pieza alargada; confirmar listón/travesaño/refuerzo (List).');
  if(irregular||ordered[2]/ordered[1]>.2)return result('Sin clasificar','unclassified','Geometría irregular o proporciones ajenas a un tablón fino; revisar sin adivinar su función.');
  const siblings=contexts.filter(c=>c.parent===context.parent),nested=context.parent!==f.id&&siblings.length>=3;
  const siblingBox=new Box3();siblings.forEach(c=>siblingBox.union(c.box));
  const nestedHeight=range(siblingBox,up),drawer=nested&&(nestedHeight[1]-nestedHeight[0])<(zRange[1]-zRange[0])*.45;
  if(Math.abs(normal.dot(up))>.95){
   if(drawer)return result('Fondo cajón','review','Panel horizontal en conjunto anidado bajo; podría ser piso/fondo de cajón. Confirmar con las piezas vecinas.');
   if(z<.15)return result('Piso','review','Panel horizontal inferior; confirmar Piso/base y relación con zócalo.');
   if(z>.85)return result('Tapa','review','Panel horizontal superior; confirmar tapa o techo.');
   return result('Estante','review','Panel horizontal intermedio (Est); también puede ser piso de otro módulo. Requiere revisión.');
  }
  if(Math.abs(normal.dot(right))>.95){if(drawer)return result('Lateral cajón','review','Panel vertical en conjunto anidado bajo con vecinos; revisar si es lateral de cajón.');return result(x<.15||x>.85?'Lateral':'Divisor','high',x<.15||x>.85?'Panel vertical extremo (Lat) con frente confirmado; posición referida al mueble.':'Panel vertical interior que divide el ancho, con frente confirmado.');}
  if(Math.abs(normal.dot(front))>.95){
   if(drawer)return result('Frente cajón','review','Panel frontal de conjunto anidado bajo; confirmar frente/trasera de cajón (Fte / Del Caj).');
   if(y<.15)return result('Fondo','review','Panel posterior respecto al frente elegido; confirmar Fondo o respaldo.');
   const height=range(context.box,up);return result((height[1]-height[0])>(zRange[1]-zRange[0])*.45?'Puerta':'Frente cajón','review','Panel paralelo al frente; puerta, frente de cajón o revestimiento son alternativas. Requiere revisión, no se decide solo por tamaño.');
  }
  return result('Sin clasificar','unclassified','Pieza oblicua respecto a los ejes elegidos; no hay clasificación confiable.');
 }
 return groupedPieces(f).filter(group=>includeNamed||group.some(p=>!f.naming?.reviews?.some(r=>r.id===p.id)&&((p.metadata?.originalName??f.naming?.bases.find(b=>b.id===p.id)?.base??p.name)===''||generic.test(p.metadata?.originalName??f.naming?.bases.find(b=>b.id===p.id)?.base??p.name)))).map(group=>{
  const proposals=group.map(classify),same=proposals.every(p=>p.base===proposals[0].base);
  const proposal:NameSuggestion={ids:group.map(p=>p.id),code:group[0].code,previous:group[0].name,base:same?proposals[0].base:'Panel',confidence:same&&proposals.every(p=>p.confidence==='high')?'high':same?proposals[0].confidence:'review',reason:same?proposals[0].reason:'Componentes iguales en posiciones con funciones distintas; mantener nombre común requiere revisión.',position:[...new Set(proposals.map(p=>p.position))].join(' / ')};
  proposal.proposed=proposal.base;
  const source=group.map(p=>p.metadata?.definitionName||p.name).join(' ');
  const vocabulary=[{pattern:/\bLat\b/i,base:'Lat',roles:['Lateral']},{pattern:/\bPiso\b/i,base:'Piso',roles:['Piso']},{pattern:/\bList\b/i,base:'List',roles:['Listón']},{pattern:/\bFondo\b/i,base:'Fondo',roles:['Fondo']},{pattern:/\bEst\b/i,base:'Est',roles:['Estante']},{pattern:/\bPuerta\b/i,base:'Puerta',roles:['Puerta']},{pattern:/\bDel\s+Caj\b/i,base:'Del Caj',roles:['Frente cajón']},{pattern:/\bFte\b/i,base:'Fte',roles:['Frente cajón']}].find(v=>v.pattern.test(source));
  if(orientation.confirmed&&vocabulary){if(vocabulary.roles.includes(proposal.base)){proposal.base=vocabulary.base;proposal.reason+=' Se conserva abreviatura observada del taller: '+vocabulary.base+'.';}else{proposal.confidence='review';proposal.reason+=' Abreviatura observada '+vocabulary.base+' sin coincidencia geométrica suficiente; no se impone como función.';}}
  if(/\b(PT|Banq|Ranu)\b/i.test(source)){proposal.confidence=orientation.confirmed?'review':'unclassified';proposal.reason+=' PT/Banq/Ranu son abreviaturas ambiguas del taller; no se expanden automáticamente.';}
  const reviews=(f.naming?.reviews||[]).filter(r=>r.proposed===proposal.proposed),own=reviews.filter(r=>group.some(p=>p.id===r.id));
  // Position-specific edits belong to their physical piece. Only known generic
  // workshop vocabulary can be proposed for a different instance.
  const portable=/^(Lat|Lateral|Divisor|Piso|Tapa|Est|Estante|Fondo|List|Listón|Puerta|Fte|Frente|Del Caj|Frente cajón|Lateral cajón|Fondo cajón)$/iu;
  const corrections=[...new Set((own.length?own:proposal.confidence==='unclassified'?[]:reviews.filter(r=>portable.test(r.base))).map(r=>r.base))];
  if(orientation.confirmed&&corrections.length===1){proposal.base=corrections[0];proposal.confidence='review';proposal.reason+=' Vocabulario corregido anteriormente en este mueble; revisar antes de aplicar.';}
  return proposal;
 });
}
