import {explodedOffsets} from './explosion';
import { Matrix4, Ray, Vector3 } from 'three';
import { bounds, type Furniture, type Mesh, type Note, type Piece, type Vec3 } from './model';
import {defaultCamera,type CameraAngles,type Presentation} from './presentation';
import type {NamingReference} from './naming';
import {exteriorFromOrientation,proposeOrientation} from './nameSuggestions';
import {pieceCodeMap,pieceRows,groupedNameIssues,groupedPieces} from './pieceGroups';
import { makeDimensions } from './dimensions';
import {convexHull,paintOrder,type Solid} from './paintOrder';

export const WIDTH = 960, HEIGHT = 580;
export type View = 'front'|'back';
/**
 * `camera`, `offsets`, `explosion`, `zoom`, `pan` and `frame` serve the interactive viewer of Muebles: angles and
 * pieces moved only on screen (never stored). `labels`/`notes`/`dimensions` false skip that layer.
 * `frame: 'sphere'` fits the bounding sphere, so the drawing keeps its size while it turns.
 */
export type SceneOptions = {view?:View;layout?:'editor'|'sheet';width?:number;height?:number;camera?:CameraAngles;offsets?:ReadonlyMap<string,Vector3>;explosion?:number;zoom?:number;pan?:[number,number];frame?:'bounds'|'sphere';labels?:boolean;notes?:boolean;dimensions?:boolean};
export function cameraBasis(view:View='front',angles?:CameraAngles){
  const sign=view==='front'?1:-1;
  const right=new Vector3(sign,sign,0).normalize();
  const forward=new Vector3(sign,-sign,0.85).normalize();
  if(angles){
    right.applyAxisAngle(new Vector3(0,0,1),angles.yaw*Math.PI/180);
    const yaw=angles.yaw*Math.PI/180+(view==='front'?-Math.PI/4:3*Math.PI/4),pitch=angles.pitch*Math.PI/180;
    forward.set(Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch));
  }
  const up=new Vector3().crossVectors(forward,right).normalize();
  return {right,forward,up};
}
/** Front saved in Muebles («Proponer nombres»), in the group's local axes; a furniture never marked has none. */
export function markedFront(f:Furniture):NamingReference|undefined{
  const r=f.naming?.reference;
  return r&&r.frontAxis!==r.upAxis?r:undefined;
}
const wrapYaw=(yaw:number)=>((yaw+540)%360)-180;
export const oppositeCamera=(c:CameraAngles):CameraAngles=>({...c,yaw:wrapYaw(c.yaw+180)});
/**
 * Soft ¾ of the plans (0.8.20): the front faces the reader, turned 30° (instead of 45°) and tilted 25° so the
 * depth still reads. yaw is relative to the default camera, which looks at the −Y face from 45°.
 */
export const FRONT_VIEW:CameraAngles={yaw:-15,pitch:25};
// proposeOrientation reads every piece: cached per pieces array (pieces are replaced, never mutated, on edits).
const frontCache=new WeakMap<object,{marked:NamingReference|undefined;reference:Furniture['referenceTransform'];front:ReturnType<typeof exteriorFromOrientation>}>();
/** The front the plans look at: the one marked in Muebles or, when never marked, the proposed one (geometry, then axes). */
export function furnitureFront(f:Furniture){
  const hit=frontCache.get(f.pieces);
  if(hit&&hit.marked===f.naming?.reference&&hit.reference===f.referenceTransform)return hit.front;
  const front=exteriorFromOrientation(markedFront(f)||proposeOrientation(f).orientation,f.referenceTransform);
  frontCache.set(f.pieces,{marked:f.naming?.reference,reference:f.referenceTransform,front});
  return front;
}
/** Exterior camera of a guide: the soft ¾ turned by the front's yaw (marked, or proposed when never marked). */
export function frontCamera(f:Furniture):CameraAngles{
  return {yaw:wrapYaw(FRONT_VIEW.yaw+Math.round(furnitureFront(f).yaw)),pitch:FRONT_VIEW.pitch};
}
/** The camera sees the front face of the furniture: its horizontal direction within 80° of the front's normal. */
export function seesFront(f:Furniture,angles:CameraAngles):boolean{
  const forward=cameraBasis('front',angles).forward,[x,y]=furnitureFront(f).exterior.world,flat=Math.hypot(forward.x,forward.y),side=Math.hypot(x,y);
  if(flat<1e-6||side<1e-6)return true;
  return (forward.x*x+forward.y*y)/flat/side>Math.cos(80*Math.PI/180);
}
/**
 * Guide cameras (absolute angles): a stored camera wins; otherwise both views face the front. Since 0.8.20 the
 * interior also looks at the front, with the pieces that cover it hidden (interiorHidden). With a shared
 * orientation the interior uses the exterior camera.
 */
export function guideCamera(f:Furniture,view:View):CameraAngles{
  const cameras=f.presentation?.cameras,exterior=cameras?.front||frontCamera(f);
  if(view==='front'||f.presentation?.guide?.sharedCamera)return exterior;
  return cameras?.back||exterior;
}
/**
 * Printed views whose stored camera does not face the front (saved before 0.8.20, or turned on purpose). They are
 * never reoriented silently: Planos offers «Mirar desde el frente». Views never turned have no stored camera and
 * always follow the front.
 */
export function camerasAwayFromFront(f:Furniture):View[]{
  const guide=f.presentation?.guide;if(!guide)return [];
  return guideViews(f).filter(view=>{const stored=view==='front'||guide.sharedCamera?f.presentation?.cameras?.front:f.presentation?.cameras?.back;return !!stored&&!seesFront(f,stored);});
}
/** Angles shown for `view`: guides use guideCamera, the web editor stores them relative to each view. */
export const viewCamera=(f:Furniture,view:View)=>f.presentation?.guide?guideCamera(f,view):f.presentation?.cameras?.[view]||defaultCamera;
/** Stores `angles` for `view`; a shared guide stores the same camera for both views. */
export function withViewCamera(f:Furniture,view:View,angles:CameraAngles):Presentation{
  const cameras=f.presentation?.cameras;
  if(!f.presentation?.guide?.sharedCamera)return {...f.presentation,cameras:{...cameras,[view]:angles}};
  return {...f.presentation,cameras:{...cameras,front:angles,back:angles}};
}
const FRONT_TOLERANCE=20;
/**
 * Pieces that cover the interior from the front: boards whose thickness faces the front, whose outer face lies on
 * the front plane of the furniture (within 20 mm) and that have a crosswise piece behind them (a shelf, a divider,
 * the sides of a drawer): doors and drawer fronts. A zócalo with nothing behind it, the laterals, the shelves and
 * the fondo stay. The interior hides them to be seen from the front.
 */
export function frontPieceIds(f:Furniture):string[]{
  if(!f.pieces.length)return [];
  const front=furnitureFront(f),outward=new Vector3(...front.exterior.world).normalize(),up=new Vector3(...front.up.world).normalize(),across=new Vector3().crossVectors(up,outward);
  const rows=f.pieces.map(p=>{
    const data=prepared(p),range=(axis:Vector3)=>{let min=Infinity,max=-Infinity;for(const v of data.world){const d=v.dot(axis);if(d<min)min=d;if(d>max)max=d;}return [min,max] as const;};
    return {id:p.id,depth:range(outward),up:range(up),across:range(across),facing:Math.abs(data.thin.dot(outward))>.9};
  });
  const plane=Math.max(...rows.map(r=>r.depth[1]));
  const overlaps=(a:readonly [number,number],b:readonly [number,number])=>Math.min(a[1],b[1])-Math.max(a[0],b[0])>1;
  return rows.filter(r=>r.facing&&r.depth[1]>=plane-FRONT_TOLERANCE&&rows.some(o=>o!==r&&!o.facing&&o.depth[1]<=r.depth[0]+1&&overlaps(o.up,r.up)&&overlaps(o.across,r.across))).map(r=>r.id);
}
/**
 * Pieces hidden in the interior view. The stored choice wins; a guide that never chose (empty list) hides the front
 * pieces by itself, since the interior looks from the front.
 */
export function interiorHidden(f:Furniture):string[]{
  const guide=f.presentation?.guide;if(!guide)return [];
  return guide.hiddenPieceIds.length?guide.hiddenPieceIds:frontPieceIds(f);
}
/** A stored interior (chosen for the view from behind) that hides no front piece: the doors cover the interior. */
export function interiorCovered(f:Furniture):string[]{
  const stored=f.presentation?.guide?.hiddenPieceIds||[],front=frontPieceIds(f);
  return stored.length&&!front.some(id=>stored.includes(id))?front:[];
}
export const SHEET_VIEW={width:320,height:450,widthMm:86,topMm:42,xMm:[8,99]} as const;
/** front/back are stable storage keys: exterior/interior in configurable guides. */
export function guideViews(f:Furniture):View[]{return f.presentation?.guide?.mode==='exterior'?['front']:f.presentation?.guide?.mode==='interior'?['back']:['front','back'];}
export function sheetView(f:Furniture){if(!f.presentation?.guide)return {width:460,height:640,widthMm:139,topMm:57,xMm:[10,156]};return guideViews(f).length===1?{width:640,height:450,widthMm:177,topMm:42,xMm:[8,8]}:SHEET_VIEW;}

export type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
export type Face = { key: string; pieceId: string; points: string; fill: string; depth: number; outline:string[] };
export type Label = Rect & { quantity?:number; pieceId: string; code: string; anchor: Point };
export const noteLines = (text: string): string[] => text.split('\n').flatMap(line => {
  const lines: string[] = []; let current = '';
  for (const word of line.split(/\s+/).filter(Boolean)) {
    for (const segment of word.match(/.{1,24}/gu) || []) {
      if ((current + ' ' + segment).trim().length > 24) { lines.push(current); current = segment; }
      else current = (current + ' ' + segment).trim();
    }
  }
  return [...lines, current || ''];
});
export const noteRect = (n: Note): Rect => ({ x:n.position[0], y:n.position[1], w:210, h:38+noteLines(n.text).length*17 });
const overlaps = (a: Rect,b: Rect,gap=5) => a.x < b.x+b.w+gap && a.x+a.w+gap > b.x && a.y < b.y+b.h+gap && a.y+a.h+gap > b.y;

/**
 * Camera-independent geometry of a piece, cached per piece (pieces are replaced, not mutated, by edits): world
 * vertices without offsets, oriented triangle normals and fills, the outline edges, the face normals that can
 * separate it from another piece, its thickness normal and whether the board is convex.
 */
type Prepared={world:Vector3[];normals:Vector3[];fills:string[];planes:string[];edges:{a:number;b:number;tris:number[];feature:boolean}[];axes:Vector3[];thin:Vector3;convex:boolean};
const preparedCache=new WeakMap<Piece,{transform:number[];mesh:Mesh;data:Prepared}>();
const LIGHT=new Vector3(-0.3,-0.5,1).normalize();
function prepared(p:Piece):Prepared{
  const hit=preparedCache.get(p);
  if(hit&&hit.transform===p.transform&&hit.mesh===p.mesh)return hit.data;
  const m=new Matrix4().fromArray(p.transform),handedness=Math.sign(m.determinant())||1;
  const world=p.mesh.vertices.map(v=>new Vector3(...v).applyMatrix4(m));
  const area:number[]=[];
  const normals=p.mesh.triangles.map(([i,j,k])=>{const n=world[j].clone().sub(world[i]).cross(world[k].clone().sub(world[i]));area.push(n.length());return n.normalize().multiplyScalar(handedness);});
  const fills=normals.map((normal,i)=>{
    const shade=Math.round(81+normal.dot(LIGHT)*9),material=p.mesh.faceMaterials?.[i].front,light=0.82+normal.dot(LIGHT)*0.15;
    return material?`rgb(${material.color.map(v=>Math.round(Math.max(0,Math.min(255,v*light)))).join(' ')})`:`hsl(37 27% ${shade}%)`;
  });
  // Coplanar triangles with the same fill are drawn as one polygon (no hairline seams, half the SVG nodes).
  const planes=normals.map((n,i)=>`${n.toArray().map(v=>Math.round(v*1e4)).join(',')}|${Math.round(world[p.mesh.triangles[i][0]].dot(n)*100)}|${fills[i]}`);
  const edgeMap=new Map<string,{a:number;b:number;tris:number[];feature:boolean}>();
  p.mesh.triangles.forEach((tri,i)=>{
    for(const [j,k] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]){
      const key=j<k?`${j}-${k}`:`${k}-${j}`,edge=edgeMap.get(key)||{a:j,b:k,tris:[],feature:false};
      edge.tris.push(i);edgeMap.set(key,edge);
    }
  });
  for(const edge of edgeMap.values())edge.feature=edge.tris.length===1||edge.tris.some(t=>normals[t].dot(normals[edge.tris[0]])<0.999);
  // Separating axes: the distinct face directions, largest faces first (a board has three).
  const directions:{axis:Vector3;area:number}[]=[];
  normals.forEach((n,i)=>{const same=directions.find(d=>Math.abs(d.axis.dot(n))>0.9999);if(same)same.area+=area[i];else directions.push({axis:n.clone(),area:area[i]});});
  directions.sort((a,b)=>b.area-a.area);
  const axes=directions.slice(0,12).map(d=>d.axis);
  const size=Math.max(1,...world.map(v=>v.length()))*1e-7;
  const convex=p.mesh.triangles.every((tri,i)=>{const d=world[tri[0]].dot(normals[i]);return world.every(v=>v.dot(normals[i])-d<=Math.max(1e-4,size));});
  // Thickness normal: the box axis along which the piece is thinnest.
  const local=bounds(p.mesh).getSize(new Vector3()).toArray(),columns=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(m,i));
  const lengths=columns.map((c,i)=>c.length()*local[i]),thinAxis=lengths.indexOf(Math.min(...lengths));
  const data={world,normals,fills,planes,edges:[...edgeMap.values()],axes,thin:columns[thinAxis].clone().normalize(),convex};
  preparedCache.set(p,{transform:p.transform,mesh:p.mesh,data});
  return data;
}
/** Boundary loop of a set of coplanar triangles; undefined when it is not a single loop (a hole, a split face). */
function outlineLoop(triangles:readonly (readonly number[])[]):number[]|undefined{
  if(triangles.length===1)return [...triangles[0]];
  const count=new Map<string,number>(),next=new Map<number,number>();
  for(const [a,b,c] of triangles)for(const [i,j] of [[a,b],[b,c],[c,a]]){const key=i<j?`${i}-${j}`:`${j}-${i}`;count.set(key,(count.get(key)||0)+1);}
  for(const [a,b,c] of triangles)for(const [i,j] of [[a,b],[b,c],[c,a]]){
    if(count.get(i<j?`${i}-${j}`:`${j}-${i}`)!==1)continue;
    if(next.has(i))return undefined;next.set(i,j);
  }
  const start=next.keys().next().value;if(start===undefined)return undefined;
  const loop:number[]=[];let at:number|undefined=start;
  while(at!==undefined&&loop.length<=next.size){loop.push(at);at=next.get(at);if(at===start)break;}
  return at===start&&loop.length===next.size?loop:undefined;
}

export function makeScene(f: Furniture,options:SceneOptions={}) {
  const codes=pieceCodeMap(f);
  const view=options.view||'front',sheet=options.layout==='sheet';
  const config=sheetView(f);
  const width=options.width??(sheet?config.width:WIDTH),height=options.height??(sheet?config.height:HEIGHT);
  const guide=f.presentation?.guide;
  const hidden=new Set(view==='back'?interiorHidden(f):[]);
  const visiblePieces=f.pieces.filter(p=>!hidden.has(p.id));
  const visibleFurniture={...f,pieces:visiblePieces};
  const compact=!!f.presentation?.compact&&!guide,compactFront=compact&&view==='front';
  const pan=options.pan||[0,0];
  const origin={x:(sheet?width/2:options.frame==='sphere'?width/2:350)+pan[0],y:(compactFront?105:sheet?height/2-10:options.frame==='sphere'?height/2:290)+pan[1]};
  const {right,forward,up}=options.camera?cameraBasis('front',options.camera):cameraBasis(guide?'front':view,guide?guideCamera(f,view):f.presentation?.cameras?.[view]);
  const offsets = explodedOffsets(options.explosion!==undefined?{...f,explosion:options.explosion}:guide?{...f,explosion:0}:f);
  const transforms = new Map<string,Matrix4>();
  const world=new Map<string,Vector3[]>();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const fitted:Vector3[]=[];
  for (const p of f.pieces) {
    const offset = offsets.get(p.id)!.clone(),moved=options.offsets?.get(p.id);
    if(moved)offset.add(moved);
    transforms.set(p.id,new Matrix4().makeTranslation(...offset.toArray()).multiply(new Matrix4().fromArray(p.transform)));
    const base=prepared(p).world,vertices=offset.lengthSq()?base.map(v=>v.clone().add(offset)):base;
    world.set(p.id,vertices);
    // The fit ignores pieces moved by hand: the drawing never rescales under the pointer.
    const framed=moved?base.map(v=>v.clone().add(offsets.get(p.id)!)):vertices;
    for(const v of framed){const x=v.dot(right),y=v.dot(up);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(options.frame==='sphere')fitted.push(v);}
  }
  let scale:number,cx:number,cy:number;
  if(options.frame==='sphere'&&fitted.length){
    // Rotation-invariant fit: the bounding sphere of the assembly.
    const lo=fitted.reduce((m,v)=>m.min(v),fitted[0].clone()),hi=fitted.reduce((m,v)=>m.max(v),fitted[0].clone()),center=lo.clone().add(hi).multiplyScalar(.5),radius=Math.max(1,hi.distanceTo(lo)/2);
    scale=Math.min(width,height)*.46/radius*(options.zoom??1);cx=center.dot(right);cy=center.dot(up);
  }else{
    scale = Math.min((sheet?(guide?width*.70:compact?400:270):540)/(maxX-minX || 1),(compactFront?180:sheet?(guide?height*.72:460):420)/(maxY-minY || 1)) * (options.zoom??f.zoom);
    cx = (minX+maxX)/2;cy=(minY+maxY)/2;
  }
  function project(world: Vector3): Point { return {x:origin.x+(world.dot(right)-cx)*scale,y:origin.y-(world.dot(up)-cy)*scale}; }
  function anchor(pieceId: string, local: Vec3) { return project(new Vector3(...local).applyMatrix4(transforms.get(pieceId)!)); }
  const edges: { pieceId:string; a:Point; b:Point }[] = [];
  // Faces of each piece, then the pieces in painter's order (lib/paintOrder): the same order for viewer and PDF.
  const pieceFaces:Face[][]=[],solids:Solid[]=[];
  for (const p of visiblePieces) {
    const data=prepared(p),vertices=world.get(p.id)!,screen=vertices.map(project);
    const visible=data.normals.map(n=>n.dot(forward)>0.00001);
    const groups=new Map<string,number[]>();
    p.mesh.triangles.forEach((_,i)=>{if(!visible[i])return;const list=groups.get(data.planes[i]);if(list)list.push(i);else groups.set(data.planes[i],[i]);});
    const faces:Face[]=[],faceOf=new Map<number,Face>();
    for(const list of groups.values()){
      const loop=outlineLoop(list.map(i=>p.mesh.triangles[i]));
      const parts=loop?[{tris:list,ring:loop}]:list.map(i=>({tris:[i],ring:[...p.mesh.triangles[i]]}));
      for(const part of parts){
        const depth=part.tris.reduce((sum,i)=>sum+p.mesh.triangles[i].reduce((s,j)=>s+vertices[j].dot(forward),0)/3,0)/part.tris.length;
        const face:Face={key:`${p.id}-${part.tris[0]}`,pieceId:p.id,points:part.ring.map(j=>`${screen[j].x},${screen[j].y}`).join(' '),fill:data.fills[part.tris[0]],depth,outline:[]};
        faces.push(face);for(const i of part.tris)faceOf.set(i,face);
      }
    }
    for(const edge of data.edges){
      if(!edge.feature||!edge.tris.some(i=>visible[i]))continue;
      const a=screen[edge.a],b=screen[edge.b];
      edges.push({pieceId:p.id,a,b});
      for(const face of new Set(edge.tris.map(i=>faceOf.get(i))))face?.outline.push(`M${a.x},${a.y} L${b.x},${b.y}`);
    }
    if(!faces.length)continue;
    // A convex board never covers itself; another mesh keeps the depth order among its own faces.
    if(!data.convex)faces.sort((a,b)=>a.depth-b.depth);
    pieceFaces.push(faces);
    solids.push({vertices,axes:data.axes,hull:convexHull(screen),depth:vertices.reduce((s,v)=>s+v.dot(forward),0)/vertices.length});
  }
  const faces:Face[]=paintOrder(solids,forward).flatMap(i=>pieceFaces[i]);
  const markerRects:Rect[]=[];
  const hiddenNotes=f.notes.filter(n=>hidden.has(n.pieceId));
  const notes=options.notes===false?[]:f.notes.flatMap((n,index)=>{
    if(hidden.has(n.pieceId))return []; 
    const target=anchor(n.pieceId,n.anchor);
    let rect=noteRect(n);
    if(sheet){
      let found:Rect|undefined;
      for(let radius=20;radius<260&&!found;radius+=18)for(let a=0;a<Math.PI*2;a+=Math.PI/8){
        const r={x:target.x+Math.cos(a)*radius-12,y:target.y+Math.sin(a)*radius-12,w:24,h:24};
        if(r.x>=12&&r.y>=12&&r.x+r.w<=width-12&&r.y+r.h<=height-40&&!markerRects.some(other=>overlaps(r,other))){found=r;break;}
      }
      rect=found||{x:-30,y:-30,w:24,h:24};markerRects.push(rect);
    }
    return [{...n,number:index+1,marker:sheet,rect,lines:noteLines(n.text),target}];
  });
  const occupied: Rect[] = notes.map(n=>n.rect);
  const labels: Label[] = [];
  let labelsFit = true;
  const groupedSheet=!!guide&&sheet&&!!f.groupIdentical;
  // A sheet labels one visible occurrence of each interchangeable type; the table retains total quantity.
  const quantities=new Map(groupedPieces(groupedSheet?visibleFurniture:f).map(group=>[group[0].id,group.length]));
  for (const p of (options.labels===false||f.presentation?.hideIds||compactFront?[]:compact||groupedSheet?pieceRows(visibleFurniture):visiblePieces)) {
    const quantity=compact||groupedSheet?quantities.get(p.id)||1:1,labelWidth=quantity>1?70:46;
    const a = anchor(p.id,bounds(p.mesh).getCenter(new Vector3()).toArray());
    let best: Rect | undefined;
    for (let radius=25;radius<430 && !best;radius+=22) {
      for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8) {
        const candidate = {x:a.x+Math.cos(angle)*radius-labelWidth/2,y:a.y+Math.sin(angle)*radius-12,w:labelWidth,h:24};
        if(candidate.x>=12 && candidate.x+labelWidth<=width-12 && candidate.y>=12 && candidate.y+24<=(compactFront?205:height-(sheet?40:12)) && !occupied.some(r=>overlaps(candidate,r))) {best=candidate;break;}
      }
    }
    if(!best&&compact){
      const candidates:Rect[]=[];
      for(let y=12;y+24<=(compactFront?205:height-(sheet?40:12));y+=4)for(let x=12;x+labelWidth<=width-12;x+=4){
        const candidate={x,y,w:labelWidth,h:24};if(!occupied.some(r=>overlaps(candidate,r)))candidates.push(candidate);
      }
      best=candidates.sort((left,right)=>Math.hypot(left.x+left.w/2-a.x,left.y+12-a.y)-Math.hypot(right.x+right.w/2-a.x,right.y+12-a.y))[0];
    }
    if (!best) { labelsFit=false; best={x:12,y:12,w:labelWidth,h:24}; }
    occupied.push(best);labels.push({...best,pieceId:p.id,code:codes.get(p.id)!,quantity,anchor:a});
  }
  if(!labelsFit&&compact){
    // Retry on a regular lattice instead of retaining a fragmented greedy pack.
    const used=notes.map(n=>n.rect),cells:Point[]=[];
    for(let y=12;y+24<=(compactFront?205:height-(sheet?40:12));y+=30)for(let x=12;x+70<=width-12;x+=82)cells.push({x,y});
    labelsFit=true;
    for(const label of labels){
      const cell=cells.filter(p=>!used.some(r=>overlaps({...p,w:label.w,h:24},r))).sort((a,b)=>Math.hypot(a.x+label.w/2-label.anchor.x,a.y+12-label.anchor.y)-Math.hypot(b.x+label.w/2-label.anchor.x,b.y+12-label.anchor.y))[0];
      if(!cell){labelsFit=false;break;}label.x=cell.x;label.y=cell.y;used.push({...cell,w:label.w,h:24});
    }
  }
  const warnings: string[] = [];
  if(guide&&visiblePieces.length===0)warnings.push('La vista interior no tiene piezas visibles. Restaurá al menos una pieza.');
  if(hiddenNotes.length)warnings.push('Hay anotaciones ancladas a piezas ocultas en la vista interior. Restaurá esas piezas, mové sus notas a una pieza visible o elegí solo la vista exterior.');
  if(!labelsFit) warnings.push('No hay espacio legible para todas las etiquetas.');
  if (Number.isFinite(minX)&&(origin.x+(minX-cx)*scale<8||origin.x+(maxX-cx)*scale>width-8||origin.y-(maxY-cy)*scale<8||origin.y-(minY-cy)*scale>height-(sheet?40:8))) warnings.push('La vista queda fuera de la hoja. Reducí el zoom.');
  for(let i=0;i<notes.length;i++) {
    const a=notes[i].rect;
    if(a.x<8 || a.y<8 || a.x+a.w>width-8 || a.y+a.h>height-8) warnings.push('Una nota queda fuera de la vista. Movela hacia adentro.');
    if(notes.slice(i+1).some(b=>overlaps(a,b.rect,0))) warnings.push('Hay notas superpuestas. Separalas antes de imprimir.');
  }
  const dimensionLayout=options.dimensions===false||(sheet&&view==='back'&&!guide)?{dimensions:[],warnings:[]}:makeDimensions(visibleFurniture,anchor,[...notes.map(n=>n.rect),...labels],notes.map(n=>({a:{x:n.rect.x+(n.marker?12:0),y:n.rect.y+(n.marker?12:20)},b:n.target,kind:'leader'})),notes.map(n=>n.rect),{width,height},view);
  warnings.push(...dimensionLayout.warnings);
  return {view,width,height,sheet,origin,camera:{right,forward,up},faces,edges,labels,notes,dimensions:dimensionLayout.dimensions,warnings:[...new Set(warnings)],anchor,transforms,scale,cx,cy,offsets};
}
export function pickAnchor(f: Furniture,p: Piece,screen:Point,options:SceneOptions={}): Vec3 {
  const scene=makeScene(f,options),{right,forward,up}=scene.camera;
  const origin=right.clone().multiplyScalar((screen.x-scene.origin.x)/scene.scale+scene.cx).add(up.clone().multiplyScalar((scene.origin.y-screen.y)/scene.scale+scene.cy)).add(forward.clone().multiplyScalar(1e7));
  const ray=new Ray(origin,forward.clone().negate()).applyMatrix4(scene.transforms.get(p.id)!.clone().invert());
  let nearest: Vector3 | undefined;
  for(const tri of p.mesh.triangles) {
    const hit=ray.intersectTriangle(...tri.map(i=>new Vector3(...p.mesh.vertices[i])) as [Vector3,Vector3,Vector3],false,new Vector3());
    if(hit && (!nearest || hit.distanceTo(ray.origin)<nearest.distanceTo(ray.origin))) nearest=hit.clone();
  }
  return (nearest || bounds(p.mesh).getCenter(new Vector3())).toArray();
}
export function layoutWarnings(f: Furniture): string[] {
  const warnings=[...groupedNameIssues(f),...(!f.presentation?.guide?makeScene(f).warnings:[]),...guideViews(f).flatMap(view=>makeScene(f,{view,layout:'sheet'}).warnings.map(w=>`${f.presentation?.guide?(view==='front'?'Exterior':'Interior'):(view==='front'?'Delantera':'Trasera')}: ${w}`))];
  // A4 leaves 145 mm for the table; names wrap at approximately 26 characters at 9 pt.
  const tableHeight=pieceRows(f).reduce((h,p)=>h+Math.max(f.presentation?.guide?6:7,Math.ceil(p.name.length/(f.presentation?.guide?26:24))*4.3+2),12);
  if(tableHeight>(f.presentation?.guide?145:226)) warnings.push('El listado no cabe con texto legible en una sola hoja A4. Abreviá nombres, agrupá piezas iguales o ajustá la composición. Una hoja adicional requiere aprobación.');
  return warnings;
}
