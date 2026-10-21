import {explodedOffsets} from './explosion';
import { Matrix4, Ray, Vector3 } from 'three';
import { bounds, type Furniture, type Note, type Piece, type Vec3 } from './model';
import {type CameraAngles} from './presentation';
import {pieceCodeMap,pieceRows,groupedNameIssues,groupedPieces} from './pieceGroups';
import { makeDimensions } from './dimensions';

export const WIDTH = 960, HEIGHT = 580;
export type View = 'front'|'back';
export type SceneOptions = {view?:View;layout?:'editor'|'sheet';width?:number;height?:number};
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

export function makeScene(f: Furniture,options:SceneOptions={}) {
  const codes=pieceCodeMap(f);
  const view=options.view||'front',sheet=options.layout==='sheet';
  const config=sheetView(f);
  const width=options.width??(sheet?config.width:WIDTH),height=options.height??(sheet?config.height:HEIGHT);
  const guide=f.presentation?.guide;
  const hidden=new Set(view==='back'?guide?.hiddenPieceIds:[]);
  const visiblePieces=f.pieces.filter(p=>!hidden.has(p.id));
  const visibleFurniture={...f,pieces:visiblePieces};
  const compact=!!f.presentation?.compact&&!guide,compactFront=compact&&view==='front';
  const origin={x:sheet?width/2:350,y:compactFront?105:sheet?height/2-10:290};
  const {right,forward,up}=cameraBasis(guide?'front':view,guide?.sharedCamera?f.presentation?.cameras?.front:f.presentation?.cameras?.[view]);
  const offsets = explodedOffsets(guide?{...f,explosion:0}:f);
  const transforms = new Map<string,Matrix4>();
  const points: Vector3[] = [];
  for (const p of f.pieces) {
    const offset = offsets.get(p.id)!;
    const m = new Matrix4().makeTranslation(...offset.toArray()).multiply(new Matrix4().fromArray(p.transform));
    transforms.set(p.id,m);
    for(const v of p.mesh.vertices)points.push(new Vector3(...v).applyMatrix4(m));
  }
  const projected = points.map(p => ({x:p.dot(right),y:p.dot(up)}));
  const minX = projected.reduce((v,p)=>Math.min(v,p.x),Infinity), maxX = projected.reduce((v,p)=>Math.max(v,p.x),-Infinity);
  const minY = projected.reduce((v,p)=>Math.min(v,p.y),Infinity), maxY = projected.reduce((v,p)=>Math.max(v,p.y),-Infinity);
  const scale = Math.min((sheet?(guide?width*.70:compact?400:270):540)/(maxX-minX || 1),(compactFront?180:sheet?(guide?height*.72:460):420)/(maxY-minY || 1)) * f.zoom;
  const cx = (minX+maxX)/2, cy=(minY+maxY)/2;
  function project(world: Vector3): Point { return {x:origin.x+(world.dot(right)-cx)*scale,y:origin.y-(world.dot(up)-cy)*scale}; }
  function anchor(pieceId: string, local: Vec3) { return project(new Vector3(...local).applyMatrix4(transforms.get(pieceId)!)); }
  const faces: Face[] = [];
  const edges: { pieceId:string; a:Point; b:Point }[] = [];
  for (const p of visiblePieces) {
    const vertices = p.mesh.vertices.map(v => new Vector3(...v).applyMatrix4(transforms.get(p.id)!));
    const edgeMap = new Map<string,{a:number;b:number;normals:Vector3[];visible:boolean;faceKeys:string[]}>();
    const pieceFaces = new Map<string,Face>();
    const handedness=Math.sign(transforms.get(p.id)!.determinant());
    p.mesh.triangles.forEach((tri,i) => {
      const [a,b,c] = tri.map(j=>vertices[j]);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize().multiplyScalar(handedness);
      const visible = normal.dot(forward) > 0.00001;
      if (visible) {
        const shade = Math.round(81 + normal.dot(new Vector3(-0.3,-0.5,1).normalize())*9);
        const material=p.mesh.faceMaterials?.[i].front;
        const light=0.82+normal.dot(new Vector3(-0.3,-0.5,1).normalize())*0.15;
        const fill=material?`rgb(${material.color.map(v=>Math.round(Math.max(0,Math.min(255,v*light)))).join(' ')})`:`hsl(37 27% ${shade}%)`;
        const screen = [a,b,c].map(project);
        const face={key:`${p.id}-${i}`,pieceId:p.id,points:screen.map(q=>`${q.x},${q.y}`).join(' '),fill,depth:a.clone().add(b).add(c).dot(forward)/3,outline:[] as string[]};
        faces.push(face);pieceFaces.set(face.key,face);
      }
      for (const [j,k] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]) {
        const key = [j,k].sort((a,b)=>a-b).join('-');
        const e = edgeMap.get(key) || {a:j,b:k,normals:[],visible:false,faceKeys:[]};
        e.normals.push(normal); e.visible ||= visible;e.faceKeys.push(`${p.id}-${i}`); edgeMap.set(key,e);
      }
    });
    for (const edge of edgeMap.values()) {
      if (edge.visible && (edge.normals.length===1 || edge.normals.some(n => n.dot(edge.normals[0]) < 0.999))) {
        const a=project(vertices[edge.a]),b=project(vertices[edge.b]);
        edges.push({pieceId:p.id,a,b});
        for(const key of edge.faceKeys)pieceFaces.get(key)?.outline.push(`M${a.x},${a.y} L${b.x},${b.y}`);
      }
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  const markerRects:Rect[]=[];
  const hiddenNotes=f.notes.filter(n=>hidden.has(n.pieceId));
  const notes=f.notes.flatMap((n,index)=>{
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
  for (const p of (f.presentation?.hideIds||compactFront?[]:compact||groupedSheet?pieceRows(visibleFurniture):visiblePieces)) {
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
  if (projected.some(p=> {const x=origin.x+(p.x-cx)*scale,y=origin.y-(p.y-cy)*scale; return x<8 || x>width-8 || y<8 || y>height-(sheet?40:8);})) warnings.push('La vista queda fuera de la hoja. Reducí el zoom.');
  for(let i=0;i<notes.length;i++) {
    const a=notes[i].rect;
    if(a.x<8 || a.y<8 || a.x+a.w>width-8 || a.y+a.h>height-8) warnings.push('Una nota queda fuera de la vista. Movela hacia adentro.');
    if(notes.slice(i+1).some(b=>overlaps(a,b.rect,0))) warnings.push('Hay notas superpuestas. Separalas antes de imprimir.');
  }
  const dimensionLayout=sheet&&view==='back'&&!guide?{dimensions:[],warnings:[]}:makeDimensions(visibleFurniture,anchor,[...notes.map(n=>n.rect),...labels],notes.map(n=>({a:{x:n.rect.x+(n.marker?12:0),y:n.rect.y+(n.marker?12:20)},b:n.target,kind:'leader'})),notes.map(n=>n.rect),{width,height},view);
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
