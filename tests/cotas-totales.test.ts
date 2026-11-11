import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box,createDemo,demoDocument} from '../lib/demo';
import {applyEdit,editSchema,importDocument,toEdit,type Furniture,type Mesh,type RawDocument,type RawNode} from '../lib/model';
import {furnitureEnvelope,makeScene,type Point} from '../lib/scene';
import {dimensionCaption,dimensionChoices,dimensionText,isDimensionNotice,makeDimensions,setDimensionVisible,showAllDimensions,onlyTotalDimensions,segmentHitsRect,type Dimension,type Rect} from '../lib/dimensions';
import {convexHull} from '../lib/paintOrder';
import {editsFor,mergeGuide,type Guide} from '../sketchup_offline/ui/guide';
import {bench,wardrobe} from './synthetic-furniture';
import {readFileSync} from 'node:fs';
import {a4ViewScene,metricFont} from '../sketchup_offline/ui/pdf';

const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');

// SYNTHETIC geometry only (never a customer's SKP). Mesa de luz 500 × 406 × 618 with a scaled top and a back panel
// drawn lying flat and rotated 90° into place: the totals must come from the real corners of every piece.
const node=(id:string,mesh:Mesh,transform:Matrix4):RawNode=>({id,name:id.split('/')[1],kind:'component',definition:id,transform:transform.toArray(),mesh,children:[]});
const at=(x:number,y:number,z:number)=>new Matrix4().makeTranslation(x,y,z);
function nightstand(root=new Matrix4()):Furniture{
  const doc:RawDocument={version:1,units:'mm',name:'SINTÉTICO',furniture:[{id:'MESA',name:'Mesa de luz',kind:'group',transform:root.toArray(),children:[
    node('MESA/lat-izq',box(18,400,600),at(0,0,0)),node('MESA/lat-der',box(18,400,600),at(482,0,0)),
    node('MESA/piso',box(464,400,18),at(18,0,0)),
    // 250 × 200 × 9 scaled ×2: 500 × 400 × 18 on top, from z 600 to 618.
    node('MESA/tapa',box(250,200,9),at(0,0,600).multiply(new Matrix4().makeScale(2,2,2))),
    // 464 × 600 × 6 rotated 90° about X: 464 wide, 6 deep (y 400 → 406), 600 tall.
    node('MESA/fondo',box(464,600,6),at(18,406,0).multiply(new Matrix4().makeRotationX(Math.PI/2))),
  ]}]};
  const f=importDocument(doc,'demo').furniture[0];
  f.explosion=0;f.naming={moduleCode:'',bases:[],reference:{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true}};
  f.presentation={guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}};
  return f;
}
const totalsOf=(dimensions:Dimension[])=>Object.fromEntries(dimensions.filter(d=>d.total).map(d=>[d.total,d.valueMm]));
/** Independent outline of the drawn furniture: convex hull of every visible face point. */
function silhouette(scene:ReturnType<typeof makeScene>):Point[]{
  return convexHull(scene.faces.flatMap(face=>face.points.split(' ').map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};})));
}
function hits(hull:Point[],r:Rect){
  const c={x:r.x+r.w/2,y:r.y+r.h/2};
  const inside=hull.every((a,i)=>{const b=hull[(i+1)%hull.length];return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>=0;})||hull.every((a,i)=>{const b=hull[(i+1)%hull.length];return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<=0;});
  return inside||hull.some((p,i)=>segmentHitsRect(p,hull[(i+1)%hull.length],r,0));
}

describe('Cotas totales del mueble (0.8.31)',()=>{
  it('mide alto, ancho y profundidad sobre todas las piezas en el frente del mueble, con piezas escaladas y rotadas',()=>{
    const expected={alto:618,ancho:500,profundidad:406};
    for(const root of [new Matrix4(),at(1500,-300,40).multiply(new Matrix4().makeRotationZ(.6)),new Matrix4().makeRotationZ(-2.2).multiply(new Matrix4().makeScale(-1,1,1))]){
      const f=nightstand(root),size=furnitureEnvelope(f)!.size;
      for(const [role,value] of Object.entries(expected))expect(size[role as keyof typeof size]).toBeCloseTo(value,6);
      const scene=makeScene(f,{layout:'sheet'});
      expect(scene.warnings).toEqual([]);
      expect(scene.dimensions.map(d=>d.total)).toEqual(['alto','ancho','profundidad']);
      for(const d of scene.dimensions){
        expect(d.valueMm).toBeCloseTo(expected[d.total!],6);expect(d.text).toBe(`${d.total} ${dimensionText(expected[d.total!])}`);
        // Extremes in world millimetres, exactly the length printed.
        expect(Math.hypot(...d.localEnd.map((v,i)=>v-d.localStart[i]))).toBeCloseTo(d.valueMm,6);
      }
    }
    // A root scaled ×2 doubles every total: the values follow the transforms, not the drawing.
    const doubled=furnitureEnvelope(nightstand(new Matrix4().makeScale(2,2,2)))!.size;
    expect([doubled.alto,doubled.ancho,doubled.profundidad].map(v=>Number(v.toFixed(6)))).toEqual([1236,1000,812]);
  });
  it('las cotas de pieza arrancan ocultas, se activan de a una y las totales se pueden ocultar',()=>{
    const f=nightstand();
    expect(dimensionChoices(f).every(c=>!c.visible)).toBe(true);
    expect(makeScene(f,{layout:'sheet'}).dimensions.some(d=>d.pieceId)).toBe(false);
    expect(dimensionCaption(f)).toBe('COTAS EN mm · TOTALES DEL MUEBLE · PIEZAS EN LA TABLA');
    const lateral=f.pieces.find(p=>p.id==='MESA/lat-der')!;
    f.dimensionDisplay=setDimensionVisible(f,{pieceId:lateral.id,role:'largo'},true);
    // Both laterals are equal: the cota is stored once, by the representative of the group.
    expect(f.dimensionDisplay).toEqual({shownPieces:[{pieceId:'MESA/lat-izq',role:'largo'}]});
    const shown=makeScene(f,{layout:'sheet'}).dimensions;
    expect(shown.filter(d=>!d.total).map(d=>[d.pieceId,d.role,d.valueMm])).toEqual([['MESA/lat-izq','largo',600]]);
    expect(shown.filter(d=>d.total)).toHaveLength(3);
    expect(dimensionCaption(f)).toBe('COTAS EN mm · TOTALES DEL MUEBLE · 1 DE PIEZA');
    f.dimensionDisplay=setDimensionVisible(f,{total:'profundidad'},false);
    expect(makeScene(f,{layout:'sheet'}).dimensions.map(d=>d.total||d.role)).toEqual(['alto','ancho','largo']);
    expect(dimensionCaption(f)).toBe('COTAS EN mm · 2 TOTALES · 1 DE PIEZA');
    f.dimensionDisplay=showAllDimensions(f);
    expect(makeScene(f,{layout:'sheet'}).dimensions.filter(d=>!d.total).length).toBeGreaterThan(1);
    f.dimensionDisplay=onlyTotalDimensions(f);expect(f.dimensionDisplay).toEqual({});
    expect(makeScene(f,{layout:'sheet'}).dimensions.map(d=>d.total)).toEqual(['alto','ancho','profundidad']);
  });
  it('ubica las totales por fuera del dibujo: el ancho abajo, el alto al costado, sin tapar notas ni otras cotas',()=>{
    for(const [yaw,pitch] of [[-15,25],[-40,30],[10,20]]){
      const f=wardrobe();f.presentation!.cameras={front:{yaw,pitch}};
      f.notes=[{id:'00000000-0000-4000-8000-000000000001',pieceId:'PLACARD/lat-izq',anchor:[18,300,1200],position:[40,40],text:'Fijar a la pared'}];
      const scene=makeScene(f,{view:'front',layout:'sheet'}),hull=silhouette(scene),totals=scene.dimensions.filter(d=>d.total);
      expect(scene.warnings).toEqual([]);expect(totals).toHaveLength(3);
      for(const d of totals){
        expect(d.issue).toBeUndefined();
        expect(hits(hull,d.label.rect),`${d.total} sobre el dibujo (yaw ${yaw})`).toBe(false);
        for(const s of d.segments)expect(segmentHitsRect(s.a,s.b,scene.notes[0].rect,0)).toBe(false);
      }
      const ys=hull.map(p=>p.y),xs=hull.map(p=>p.x),cy=(Math.min(...ys)+Math.max(...ys))/2,left=Math.min(...xs),right=Math.max(...xs);
      const ancho=totals.find(d=>d.total==='ancho')!,alto=totals.find(d=>d.total==='alto')!;
      expect(ancho.label.center.y,`ancho abajo (yaw ${yaw})`).toBeGreaterThan(cy);
      expect(alto.label.center.x<left+(right-left)*.25||alto.label.center.x>right-(right-left)*.25,`alto al costado (yaw ${yaw})`).toBe(true);
      for(const d of totals)for(const o of scene.dimensions)if(o!==d){const a=d.label.rect,b=o.label.rect;expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y).toBe(false);}
    }
  });
  it('en la hoja A4 real (IDs ocultos) las totales quedan libres y fuera del dibujo, en una o dos vistas',()=>{
    const metrics={regular:metricFont(regular),mono:metricFont(mono)};
    for(const make of [wardrobe,bench])for(const mode of ['both','exterior'] as const){
      const f=make();f.presentation!.guide!.mode=mode;
      const scene=a4ViewScene(f,'front',metrics),totals=scene.dimensions.filter(d=>d.total),hull=silhouette(scene);
      expect(scene.warnings,`${f.name} ${mode}`).toEqual([]);expect(scene.labels).toEqual([]);
      expect(totals.map(d=>d.total)).toEqual(['alto','ancho','profundidad']);
      for(const d of totals){expect(d.issue).toBeUndefined();expect(hits(hull,d.label.rect),`${f.name} ${mode} ${d.total}`).toBe(false);}
      const ys=hull.map(p=>p.y);
      expect(totals.find(d=>d.total==='ancho')!.label.center.y,`${f.name} ${mode}: ancho abajo`).toBeGreaterThan((Math.min(...ys)+Math.max(...ys))/2);
    }
  });
  it('mide el mueble armado: igual con despiece, y con las puertas ocultas en la vista interior',()=>{
    const f=wardrobe();
    expect(totalsOf(makeScene(f,{layout:'sheet'}).dimensions)).toEqual({alto:2400,ancho:1800,profundidad:624});
    // Both views: the totals go once, in the exterior; the interior (doors hidden) keeps its own cotas only.
    expect(makeScene(f,{view:'back',layout:'sheet'}).dimensions).toEqual([]);
    // Interior only: the totals move to it and still count the hidden doors (624 = 600 + fondo 6 + puerta 18).
    f.presentation!.guide!.mode='interior';
    const interior=makeScene(f,{view:'back',layout:'sheet'});
    expect(interior.faces.some(face=>face.pieceId==='PLACARD/puerta-izq')).toBe(false);
    expect(totalsOf(interior.dimensions)).toEqual({alto:2400,ancho:1800,profundidad:624});
    // Web editor with the explosion: the same values, drawn on the assembled box.
    const demo=createDemo().furniture[0],assembled=totalsOf(makeScene({...demo,explosion:0}).dimensions),exploded=makeScene({...demo,explosion:.8});
    expect(totalsOf(exploded.dimensions)).toEqual(assembled);
    expect(Object.keys(assembled)).toEqual(['alto','ancho','profundidad']);
  });
  it('una total movida queda donde se soltó y vuelve al lugar libre al restablecer',()=>{
    const f=nightstand(),before=makeScene(f,{layout:'sheet'}),ancho=before.dimensions.find(d=>d.total==='ancho')!;
    f.dimensionDisplay={totalOffsets:[{total:'ancho',view:'front',offset:[6/before.width,-4/before.height]}]};
    const moved=makeScene(f,{layout:'sheet'}).dimensions.find(d=>d.total==='ancho')!;
    expect(moved.label.center.x-ancho.label.center.x).toBeCloseTo(6,6);expect(moved.label.center.y-ancho.label.center.y).toBeCloseTo(-4,6);
    expect(moved.valueMm).toBe(ancho.valueMm);
    // Another view keeps its own position.
    expect(makeScene({...f,presentation:{...f.presentation,guide:{...f.presentation!.guide!,mode:'interior'}}},{view:'back',layout:'sheet'}).dimensions.find(d=>d.total==='ancho')!.label.center).not.toEqual(moved.label.center);
  });
  it('avisa sin bloquear cuando una total no entra, aclarando que no está en la tabla',()=>{
    const f=nightstand(),envelope=furnitureEnvelope(f)!;
    // A 120 × 90 sheet whose projection fills it: no cota has room.
    const project=(p:[number,number,number]):Point=>({x:10+p[0]*.2,y:80-p[2]*.11});
    const {dimensions,warnings}=makeDimensions(f,()=>({x:60,y:40}),[],[],[],{width:120,height:90},'front',{envelope,project});
    expect(dimensions.filter(d=>d.total).length).toBeLessThan(3);
    const notice=warnings.find(w=>w.startsWith('Cotas que no entran en la vista:'))!;
    expect(notice).toMatch(/total/);expect(notice).toContain('Las medidas totales no figuran en la tabla');expect(isDimensionNotice(notice)).toBe(true);
  });
});

describe('Visibilidad de cotas guardada (0.8.31): esquema aditivo y guías anteriores',()=>{
  it('la web valida y normaliza dimensionDisplay sin tocar hiddenDimensions',()=>{
    const project=createDemo(),f=project.furniture[0],id=f.pieces[0].id;f.hiddenDimensions=[{pieceId:id,role:'ancho'}];
    const edit=toEdit(project);expect(edit.furniture[0]).not.toHaveProperty('dimensionDisplay');
    edit.furniture[0].dimensionDisplay={shownPieces:[{pieceId:id,role:'ancho'}],hiddenTotals:[],totalOffsets:[{total:'alto',view:'front',offset:[.1,-.1]}]};
    const saved=applyEdit(project,edit).furniture[0];
    expect(saved.dimensionDisplay).toEqual({shownPieces:[{pieceId:id,role:'ancho'}],totalOffsets:[{total:'alto',view:'front',offset:[.1,-.1]}]});
    // The list of the earlier default stays as stored; the piece cota is shown because it was turned on.
    expect(saved.hiddenDimensions).toEqual([{pieceId:id,role:'ancho'}]);
    expect(dimensionChoices(saved).find(c=>c.pieceIds.includes(id)&&c.role==='ancho')!.visible).toBe(true);
    const cleared=toEdit({...project,revision:1,furniture:[saved,...project.furniture.slice(1)]});cleared.furniture[0].dimensionDisplay={};
    expect(applyEdit({...project,revision:1,furniture:[saved,...project.furniture.slice(1)]},cleared).furniture[0]).not.toHaveProperty('dimensionDisplay');
    const bad=(change:(e:ReturnType<typeof toEdit>)=>void)=>{const e=toEdit(project);change(e);return ()=>applyEdit(project,e);};
    expect(bad(e=>{e.furniture[0].dimensionDisplay={shownPieces:[{pieceId:'fantasma',role:'largo'}]};})).toThrow('Una cota mostrada apunta a una pieza desconocida.');
    for(const display of [{hiddenTotals:['espesor']},{hiddenTotals:['alto','alto']},{totalOffsets:[{total:'alto',view:'front',offset:[2,0]}]},{shownPieces:[{pieceId:id,role:'espesor'}]},{otra:true}])
      expect(editSchema.safeParse({...toEdit(project),furniture:[{...toEdit(project).furniture[0],dimensionDisplay:display}]}).success,JSON.stringify(display)).toBe(false);
  });
  it('una guía anterior abre con el nuevo default, conserva hiddenDimensions y no gana campos si nadie toca las cotas',()=>{
    const p=createDemo(),id=p.furniture[0].pieces[0].id,g:Guide={version:1,revision:3,selection:['modulo'],furniture:editsFor(p,{})};
    g.furniture[0].hiddenDimensions=[{pieceId:id,role:'largo'}];expect(g.furniture[0]).not.toHaveProperty('dimensionDisplay');
    const old=mergeGuide(demoDocument,structuredClone(g)).project.furniture[0];
    expect(old.dimensionDisplay).toBeUndefined();expect(old.hiddenDimensions).toEqual([{pieceId:id,role:'largo'}]);
    expect(makeScene(old).dimensions.map(d=>d.total)).toEqual(['alto','ancho','profundidad']);
    const again=editsFor({...p,furniture:[old]},{})[0];
    expect(again).not.toHaveProperty('dimensionDisplay');expect(again.hiddenDimensions).toEqual([{pieceId:id,role:'largo'}]);
    // A stored choice comes back defined (so that clearing it is sent explicitly), minus deleted pieces.
    g.furniture[0].dimensionDisplay={shownPieces:[{pieceId:id,role:'largo'},{pieceId:'borrada',role:'ancho'}],hiddenTotals:['ancho']};
    const reopened=mergeGuide(demoDocument,structuredClone(g)).project.furniture[0];
    expect(reopened.dimensionDisplay).toEqual({shownPieces:[{pieceId:id,role:'largo'}],hiddenTotals:['ancho']});
    reopened.dimensionDisplay=onlyTotalDimensions(reopened);
    expect(editsFor({...p,furniture:[reopened]},{})[0].dimensionDisplay).toEqual({});
  });
});
