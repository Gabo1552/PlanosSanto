import {describe,expect,it} from 'vitest';
import {Matrix4,Ray,Vector3} from 'three';
import {box} from '../lib/demo';
import {identity,importDocument,type Furniture} from '../lib/model';
import {frontPieceIds,interiorHidden,makeScene,type View} from '../lib/scene';
import {convexHull,hullsOverlap,occlusion,paintOrder} from '../lib/paintOrder';
import {bench,chest,wardrobe,wardrobeRun} from './synthetic-furniture';

type Scene=ReturnType<typeof makeScene>;
const polygon=(points:string)=>points.split(' ').map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};});
function inside(p:{x:number;y:number},poly:{x:number;y:number}[]){
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}
  return hit;
}
function nearEdge(p:{x:number;y:number},polys:{x:number;y:number}[][],tolerance:number){
  return polys.some(poly=>poly.some((a,i)=>{const b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<tolerance;}));
}
/**
 * Compares, on a grid of screen points, the piece painted last with the piece a ray from the viewer actually hits
 * first. Points within 1.5 units of any drawn edge are skipped (antialiasing, shared borders).
 */
function mismatches(f:Furniture,scene:Scene){
  const {right,up,forward}=scene.camera,polys=scene.faces.map(face=>polygon(face.points)),hidden=new Set(scene.view==='back'?interiorHidden(f):[]);
  const pieces=f.pieces.filter(p=>!hidden.has(p.id));
  const wrong:string[]=[];
  for(let x=4;x<scene.width;x+=6)for(let y=4;y<scene.height;y+=6){
    const p={x,y};
    let top=-1;for(let i=polys.length-1;i>=0;i--)if(inside(p,polys[i])){top=i;break;}
    if(top<0||nearEdge(p,polys,1.5))continue;
    const origin=right.clone().multiplyScalar((x-scene.origin.x)/scene.scale+scene.cx).add(up.clone().multiplyScalar((scene.origin.y-y)/scene.scale+scene.cy)).add(forward.clone().multiplyScalar(1e6));
    let nearest:{id:string;distance:number}|undefined;
    for(const piece of pieces){
      const m=scene.transforms.get(piece.id)!,ray=new Ray(origin.clone(),forward.clone().negate()).applyMatrix4(m.clone().invert());
      for(const tri of piece.mesh.triangles){
        const hit=ray.intersectTriangle(...tri.map(i=>new Vector3(...piece.mesh.vertices[i])) as [Vector3,Vector3,Vector3],false,new Vector3());
        if(!hit)continue;const distance=hit.applyMatrix4(m).distanceTo(origin);
        if(!nearest||distance<nearest.distance)nearest={id:piece.id,distance};
      }
    }
    if(nearest&&nearest.id!==scene.faces[top].pieceId)wrong.push(`${x},${y}: ${scene.faces[top].pieceId} sobre ${nearest.id}`);
  }
  return wrong;
}

describe('Render 3D: orden de pintado por pieza, sin superposiciones',()=>{
  // Before 0.8.20 the triangles were sorted by the depth of their centroid: a door's big triangles lay "behind" the
  // shelves they cover, and the shelves were painted over the closed doors (and the fondo, seen from behind).
  it.each([['banco',bench],['placard',wardrobe],['cajonera',chest]] as const)('pinta delante lo que está delante: %s',(_name,make)=>{
    const f=make();
    for(const view of ['front','back'] as View[]){
      const scene=makeScene(f,{view,layout:'sheet',width:480,height:450});
      expect(mismatches(f,scene),view).toEqual([]);
    }
  });
  it('también con cámaras libres, piezas separadas y piezas movidas a mano',()=>{
    const f=wardrobe();
    for(const camera of [{yaw:0,pitch:31},{yaw:120,pitch:20},{yaw:-150,pitch:70},{yaw:75,pitch:10}]){
      expect(mismatches(f,makeScene(f,{camera,width:600,height:600,frame:'sphere',labels:false,dimensions:false,notes:false}))).toEqual([]);
    }
    // Pieces moved apart, never through another board: a board dragged across another is not split.
    const moved=new Map([['PLACARD/puerta-izq',new Vector3(-300,-400,0)],['PLACARD/estante-der-1',new Vector3(0,-1500,100)]]);
    expect(mismatches(f,makeScene(f,{camera:{yaw:-15,pitch:25},explosion:1,offsets:moved,width:600,height:600,frame:'sphere',labels:false,dimensions:false,notes:false}))).toEqual([]);
  });
  it('resuelve tablas que se penetran (una ranura) por el eje de menor penetración',()=>{
    const board=(id:string,size:[number,number,number],at:[number,number,number])=>({id,name:id,kind:'component' as const,definition:id,transform:new Matrix4().makeTranslation(...at).toArray(),mesh:box(...size),children:[]});
    const f=importDocument({version:1,units:'mm',name:'Ranura',furniture:[{id:'R',name:'Ranura',kind:'group',transform:identity(),children:[
      board('R/lat',[18,500,700],[582,0,0]),board('R/estante',[570,480,18],[18,10,300]),board('R/lat-izq',[18,500,700],[0,0,0])]}]},'demo').furniture[0];
    // The shelf enters 6 mm into the right lateral (dado): the lateral is nearer from the right.
    expect(mismatches(f,makeScene(f,{camera:{yaw:0,pitch:30},width:500,height:500,frame:'sphere',labels:false,dimensions:false}))).toEqual([]);
  });
  it('ordena por planos separadores y rompe ciclos por profundidad',()=>{
    const cube=(x:number,y:number,z:number,s=10)=>{const vertices=[0,1].flatMap(i=>[0,1].flatMap(j=>[0,1].map(k=>new Vector3(x+i*s,y+j*s,z+k*s))));return vertices;};
    const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)],forward=new Vector3(1,-1,1).normalize();
    const solid=(v:Vector3[])=>({vertices:v,axes,hull:convexHull(v.map(p=>({x:p.x+p.y,y:p.z-p.x*.3}))),depth:v.reduce((s,p)=>s+p.dot(forward),0)/v.length});
    const far=solid(cube(0,10,0)),near=solid(cube(10,0,0));
    expect(occlusion(far,near,forward)).toBe(1);expect(occlusion(near,far,forward)).toBe(-1);
    expect(paintOrder([near,far],forward)).toEqual([1,0]);
    expect(hullsOverlap([{x:0,y:0},{x:1,y:0},{x:1,y:1}],[{x:1,y:0},{x:2,y:0},{x:2,y:1}])).toBe(false);
  });
});

describe('Vista interior desde el frente',()=>{
  it('oculta sola las puertas y los frentes que tapan el interior, y respeta lo elegido',()=>{
    expect(frontPieceIds(wardrobe()).sort()).toEqual(['PLACARD/puerta-der','PLACARD/puerta-izq']);
    expect(frontPieceIds(chest())).toEqual([1,2,3,4].map(i=>`CAJONERA/cajon-${i}/frente`));
    // The bench's zócalo is recessed 40 mm: only the doors are hidden.
    expect(frontPieceIds(bench()).sort()).toEqual(['BANCO/puerta-der','BANCO/puerta-izq']);
    const f=wardrobe();expect(interiorHidden(f)).toEqual(frontPieceIds(f));
    f.presentation!.guide!.hiddenPieceIds=['PLACARD/puerta-izq'];expect(interiorHidden(f)).toEqual(['PLACARD/puerta-izq']);
    const scene=makeScene(f,{view:'back',layout:'sheet'});
    expect(scene.faces.some(face=>face.pieceId==='PLACARD/puerta-der')).toBe(true);expect(scene.faces.some(face=>face.pieceId==='PLACARD/puerta-izq')).toBe(false);
  });
});

describe('Tiempo del render con 300 piezas',()=>{
  it('ordena y proyecta cada vista en menos de 300 ms',()=>{
    const f=wardrobeRun();expect(f.pieces).toHaveLength(300);
    makeScene(f,{labels:false,dimensions:false,notes:false});
    for(const view of ['front','back'] as View[]){
      const start=performance.now();const scene=makeScene(f,{view,layout:'sheet',width:640,height:450,labels:false,dimensions:false,notes:false});const elapsed=performance.now()-start;
      expect(scene.faces.length).toBeGreaterThan(300);
      expect(elapsed,`${view}: ${elapsed.toFixed(0)} ms`).toBeLessThan(300);
    }
  });
});
