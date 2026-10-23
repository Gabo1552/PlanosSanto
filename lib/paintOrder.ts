import {Vector3} from 'three';

/**
 * Painter's order of the pieces of an orthographic drawing (shared by the viewers and the vector PDF).
 *
 * Sorting triangles by the depth of their centroid fails as soon as a big face (a door, a fondo) and a small piece
 * overlap on screen: the door's centroid can lie farther than a shelf behind it, so the shelf was painted over the
 * door. Here the unit is the piece: a board is a convex solid, whose visible faces never cover each other, so the
 * order between two pieces that overlap on screen decides everything. That order comes from a plane that separates
 * them in 3D (a face normal of either piece, or the cross product of their edges): the piece on the viewer's side of
 * that plane is painted last. Boards that touch (a shelf against a lateral, coplanar contact faces) separate with a
 * tolerance; boards that interpenetrate (a dado, a modelling overlap) are separated along the axis of least
 * penetration. The pairwise relations are sorted topologically, far to near; a cycle (three boards in a pinwheel,
 * very rare in furniture) is broken by depth.
 */
export type Point={x:number;y:number};
export type Solid={vertices:readonly Vector3[];axes:readonly Vector3[];hull:readonly Point[];depth:number};

/** Convex hull (monotone chain), counter-clockwise in screen coordinates, without the closing point. */
export function convexHull(points:readonly Point[]):Point[]{
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(sorted.length<3)return sorted;
  const cross=(o:Point,a:Point,b:Point)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower:Point[]=[],upper:Point[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
/** Two convex outlines share more than a border (`eps` in drawing units): separating-axis test in 2D. */
export function hullsOverlap(a:readonly Point[],b:readonly Point[],eps=0.25):boolean{
  for(const hull of [a,b]){
    for(let i=0;i<hull.length;i++){
      const p=hull[i],q=hull[(i+1)%hull.length],nx=q.y-p.y,ny=p.x-q.x,length=Math.hypot(nx,ny);
      if(length<1e-9)continue;
      let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
      for(const v of a){const d=(v.x*nx+v.y*ny)/length;if(d<aMin)aMin=d;if(d>aMax)aMax=d;}
      for(const v of b){const d=(v.x*nx+v.y*ny)/length;if(d<bMin)bMin=d;if(d>bMax)bMax=d;}
      if(aMax-bMin<=eps||bMax-aMin<=eps)return false;
    }
  }
  return a.length>2&&b.length>2;
}
function interval(vertices:readonly Vector3[],axis:Vector3):[number,number]{
  let min=Infinity,max=-Infinity;
  for(const v of vertices){const d=v.dot(axis);if(d<min)min=d;if(d>max)max=d;}
  return [min,max];
}
/**
 * 1 when `a` lies behind `b` (paint `a` first), -1 when `b` lies behind `a`, 0 when no axis that faces the viewer
 * orders them. `forward` points from the drawing towards the viewer; `eps` (mm) absorbs boards that only touch.
 */
export function occlusion(a:Solid,b:Solid,forward:Vector3,eps=0.05):-1|0|1{
  let best:{gap:number;facing:number;sign:-1|1}|undefined;
  const test=(axis:Vector3)=>{
    const facing=axis.dot(forward);
    if(Math.abs(facing)<1e-3)return;
    const [a0,a1]=interval(a.vertices,axis),[b0,b1]=interval(b.vertices,axis);
    // b beyond a along +axis (gap ≥ 0 separates): b is nearer when the axis faces the viewer.
    for(const [gap,sign] of [[b0-a1,facing>0?1:-1],[a0-b1,facing>0?-1:1]] as const){
      if(gap<-eps)continue;
      if(!best||gap>best.gap+1e-6||(Math.abs(gap-best.gap)<=1e-6&&Math.abs(facing)>best.facing))best={gap,facing:Math.abs(facing),sign};
    }
  };
  for(const axis of a.axes)test(axis);
  for(const axis of b.axes)test(axis);
  if(!best){
    // Edge against edge (boards rotated against each other): the cross products of their directions.
    const cross=new Vector3();
    for(const u of a.axes)for(const v of b.axes){cross.crossVectors(u,v);if(cross.lengthSq()>1e-6)test(cross.clone().normalize());}
  }
  if(best)return best.sign;
  // Interpenetrating boards: the axis of least penetration among those that face the viewer.
  let least:{overlap:number;sign:-1|1}|undefined;
  for(const axis of [...a.axes,...b.axes]){
    const facing=axis.dot(forward);if(Math.abs(facing)<.05)continue;
    const [a0,a1]=interval(a.vertices,axis),[b0,b1]=interval(b.vertices,axis);
    const up=a1-b0,down=b1-a0,overlap=Math.min(up,down);
    // up < down: b sits on the +axis side of a.
    const sign:-1|1=(up<=down)===(facing>0)?1:-1;
    if(!least||overlap<least.overlap)least={overlap,sign};
  }
  return least?.sign??0;
}
/**
 * Indices of `solids` from the farthest to the nearest. Only solids whose outlines overlap on screen are compared
 * (sweep on x); ties and cycles fall back to depth (`depth`: larger is nearer).
 */
export function paintOrder(solids:readonly Solid[],forward:Vector3,eps=0.05):number[]{
  const n=solids.length,after:number[][]=solids.map(()=>[]),incoming=new Array<number>(n).fill(0);
  const boxes=solids.map(s=>{let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of s.hull){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}return {x0,x1,y0,y1};});
  const byX=solids.map((_,i)=>i).sort((i,j)=>boxes[i].x0-boxes[j].x0);
  for(let k=0;k<n;k++){
    const i=byX[k],bi=boxes[i];
    for(let m=k+1;m<n;m++){
      const j=byX[m],bj=boxes[j];
      if(bj.x0>=bi.x1)break;
      if(bj.y0>=bi.y1||bi.y0>=bj.y1||!hullsOverlap(solids[i].hull,solids[j].hull))continue;
      const relation=occlusion(solids[i],solids[j],forward,eps);
      if(relation>0){after[i].push(j);incoming[j]++;}
      else if(relation<0){after[j].push(i);incoming[i]++;}
    }
  }
  const order:number[]=[],done=new Array<boolean>(n).fill(false);
  // Ready solids are emitted farthest first; a cycle releases its farthest member.
  const ready=new Set<number>(solids.map((_,i)=>i).filter(i=>!incoming[i]));
  const farthest=(pool:Iterable<number>)=>{let pick=-1;for(const i of pool)if(pick<0||solids[i].depth<solids[pick].depth||(solids[i].depth===solids[pick].depth&&i<pick))pick=i;return pick;};
  while(order.length<n){
    let next=farthest(ready);
    if(next<0)next=farthest(solids.map((_,i)=>i).filter(i=>!done[i]));
    ready.delete(next);done[next]=true;order.push(next);
    for(const j of after[next])if(!done[j]&&--incoming[j]===0)ready.add(j);
  }
  return order;
}
