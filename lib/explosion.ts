import {Box3, Matrix3, Matrix4, Vector3} from 'three';
import {bounds, type Furniture} from './model';

// Millimetre gaps between assembly layers, plus separation along each board's
// own thickness normal. Never normalize a radial vector by the model diagonal:
// that collapses short axes and makes long wardrobes fan out around the middle.
// The viewer recomputes the scene on every frame of a drag: offsets are cached per pieces array and factor.
const cache=new WeakMap<object,Map<number,Map<string,Vector3>>>();
export function explodedOffsets(furniture:Furniture):Map<string,Vector3>{
  if(furniture.explosion===0)return new Map(furniture.pieces.map(piece=>[piece.id,new Vector3()]));
  const byFactor=cache.get(furniture.pieces)||new Map<number,Map<string,Vector3>>(),hit=byFactor.get(furniture.explosion);
  if(hit)return new Map([...hit].map(([id,offset])=>[id,offset.clone()]));
  const result=computeOffsets(furniture);
  byFactor.set(furniture.explosion,result);cache.set(furniture.pieces,byFactor);
  return new Map([...result].map(([id,offset])=>[id,offset.clone()]));
}
function computeOffsets(furniture:Furniture):Map<string,Vector3>{
  const pieces=furniture.pieces.map(piece=>{
    const transform=new Matrix4().fromArray(piece.transform),local=bounds(piece.mesh);
    const size=local.getSize(new Vector3()).toArray();
    const vertices=piece.mesh.vertices.map(v=>new Vector3(...v).applyMatrix4(transform));
    const center=new Box3().setFromPoints(vertices).getCenter(new Vector3());
    const axes=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(transform,i));
    const lengths=axes.map((a,i)=>a.length()*size[i]);
    const thin=lengths.indexOf(Math.min(...lengths));
    const normal=new Vector3().setComponent(thin,1).applyMatrix3(new Matrix3().getNormalMatrix(transform)).normalize();
    return {piece,vertices,center,transform,axes,lengths,normal,area:[...lengths].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a*b,1)};
  });
  const result=new Map<string,Vector3>();
  if(!pieces.length)return result;
  if(furniture.explosion===0){for(const p of pieces)result.set(p.piece.id,new Vector3());return result;}
  const reference=[...pieces].sort((a,b)=>b.area-a.area||a.piece.id.localeCompare(b.piece.id))[0];
  const x=reference.axes[0].clone().normalize();
  const z=new Vector3().crossVectors(x,reference.axes[1]).normalize();
  if(z.lengthSq()<.5)z.crossVectors(x,Math.abs(x.z)<.9?new Vector3(0,0,1):new Vector3(0,1,0)).normalize();
  const y=new Vector3().crossVectors(z,x).normalize(),frame=[x,y,z];
  const sortedThickness=pieces.map(p=>Math.min(...p.lengths)).filter(n=>n>0).sort((a,b)=>a-b);
  const thickness=sortedThickness[Math.floor(sortedThickness.length/2)]||18;
  const gap=Math.min(90,Math.max(32,thickness*2.5));
  const layers=frame.map(axis=>{
    const positions=pieces.map(p=>p.center.dot(axis)).sort((a,b)=>a-b);
    const levels:number[]=[];
    for(const n of positions)if(!levels.length||n-levels[levels.length-1]>Math.max(.01,thickness*.05))levels.push(n);
    let min=Infinity,max=-Infinity;
    for(const p of pieces)for(const vertex of p.vertices){const n=vertex.dot(axis);min=Math.min(min,n);max=Math.max(max,n);}
    const span=max-min;
    return {levels,center:(min+max)/2,spacing:Math.min(gap,Math.max(gap*2,span*.35)/Math.max(1,levels.length-1))};
  });
  for(const p of pieces){
    const offset=new Vector3();
    frame.forEach((axis,i)=>{
      const {levels,spacing}=layers[i],position=p.center.dot(axis);
      let rank=0;for(let j=1;j<levels.length;j++)if(Math.abs(levels[j]-position)<Math.abs(levels[rank]-position))rank=j;
      offset.addScaledVector(axis,(rank-(levels.length-1)/2)*spacing);
    });
    const assemblyCenter=new Vector3();frame.forEach((axis,i)=>assemblyCenter.addScaledVector(axis,layers[i].center));
    const displacement=p.center.clone().sub(assemblyCenter).dot(p.normal);
    // A centered divider also needs a thickness-normal gap to reveal its joints.
    const sign=displacement<-1e-6?-1:1;
    offset.addScaledVector(p.normal,sign*gap*.65).multiplyScalar(furniture.explosion);
    result.set(p.piece.id,offset);
  }
  return result;
}
