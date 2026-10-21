export type PreviewGeometry={mirrored?:boolean;lengths:number[];bounds:{min:number[];max:number[]};scales:number[];vertices:number[][];triangles:number[][]};
export type PreviewOrientation={axes:[number,number];flipX:boolean;flipY:boolean;frontSign:number|null};
export function orderProjection(geometry:PreviewGeometry,row:PreviewOrientation){
 const [u,v]=row.axes,w=[0,1,2].find(axis=>axis!==u&&axis!==v)!;
 const parity=(u===0&&v===1)||(u===1&&v===2)||(u===2&&v===0)?1:-1;
 const flipX=row.flipX!==((row.frontSign||1)*parity*(geometry.mirrored?-1:1)<0);
 const points=geometry.vertices.map(point=>[
  (flipX?geometry.bounds.max[u]-point[u]:point[u]-geometry.bounds.min[u])*geometry.scales[u],
  (row.flipY?point[v]-geometry.bounds.min[v]:geometry.bounds.max[v]-point[v])*geometry.scales[v]
 ]);
 const triangles=geometry.triangles.filter(triangle=>{
  const [a,b,c]=triangle.map(index=>geometry.vertices[index]);
  const first=b.map((value,i)=>value-a[i]),second=c.map((value,i)=>value-a[i]);
  const normal=[first[1]*second[2]-first[2]*second[1],first[2]*second[0]-first[0]*second[2],first[0]*second[1]-first[1]*second[0]];
  return normal[w]*(row.frontSign||1)>1e-8;
 });
 return {points,triangles,width:geometry.lengths[u],height:geometry.lengths[v],effectiveFlipX:flipX};
}
