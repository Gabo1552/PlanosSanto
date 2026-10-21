import {describe,it,expect} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {createDemo,demoDocument} from '../lib/demo';
import {importDocument,mm,type Furniture} from '../lib/model';
import {makeScene} from '../lib/scene';
import {dimensionText,dimensionGroups,segmentHitsRect} from '../lib/dimensions';

function check(f:Furniture){
  const scene=makeScene(f);
  const representatives=f.pieces.filter((p,i)=>!f.pieces.slice(0,i).some(other=>other.dimensions.every((v,j)=>Math.abs(v-p.dimensions[j])<=1e-6)));
  expect(scene.warnings).toEqual([]);expect(scene.dimensions).toHaveLength(representatives.length*2);
  expect(scene.labels).toHaveLength(f.pieces.length);
  for(const piece of f.pieces){
    const dims=scene.dimensions.filter(d=>d.pieceId===piece.id);
    if(!dims.length)continue;
    expect(dims.map(d=>d.role).sort()).toEqual(['ancho','largo']);
    for(const [role,value] of (['largo','ancho'] as const).map((role,i)=>[role,piece.dimensions[i]] as const))expect(dims.find(d=>d.role===role)!.valueMm).toBeCloseTo(value,7);
    for(const d of dims){
      const a=new Vector3(...d.localStart).applyMatrix4(new Matrix4().fromArray(piece.transform));
      const b=new Vector3(...d.localEnd).applyMatrix4(new Matrix4().fromArray(piece.transform));
      expect(a.distanceTo(b)).toBeCloseTo(d.valueMm,7);
      const r=d.label.rect;expect(r.x).toBeGreaterThanOrEqual(9);expect(r.y).toBeGreaterThanOrEqual(9);expect(r.x+r.w).toBeLessThanOrEqual(951);expect(r.y+r.h).toBeLessThanOrEqual(540);
    }
  }
  for(let i=0;i<scene.dimensions.length;i++){
    const a=scene.dimensions[i].label.rect;
    for(const other of [...scene.dimensions.slice(i+1).map(d=>d.label.rect),...scene.labels,...scene.notes.map(n=>n.rect)])expect(a.x<other.x+other.w&&a.x+a.w>other.x&&a.y<other.y+other.h&&a.y+a.h>other.y).toBe(false);
  }
  return scene;
}
describe('Cotas por pieza calculadas en 3D, no sobre el dibujo',()=>{
  it('redondea como la tabla sin alterar la precisión del modelo',()=>{
    for(const n of [1.005,19.055,18.999,428.126])expect(dimensionText(n)).toBe(`${mm(n)} mm`);
    expect(dimensionText(1200)).toBe('1200 mm');
  });
  it('acota solo una instancia por tamaño, conserva espesores, todas las piezas y geometría',()=>{
    const p=createDemo(),before=JSON.stringify(p);
    for(const f of p.furniture)check(f);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('elige el mismo código al reordenar piezas y comparte cotas entre piezas rotadas',()=>{
    const f=createDemo().furniture[0],before=check(f);
    expect(before.dimensions.filter(d=>['m-lateral-izq','m-lateral-der'].includes(d.pieceId))).toHaveLength(2);
    expect(before.dimensions.filter(d=>['m-base','m-tapa'].includes(d.pieceId))).toHaveLength(2);
    const groups=dimensionGroups(f).map(g=>g.map(p=>p.code));
    f.pieces.reverse();
    expect(dimensionGroups(f).map(g=>g.map(p=>p.code))).toEqual(groups);
    expect(check(f).dimensions.map(d=>[d.pieceId,d.axis,d.valueMm])).toEqual(before.dimensions.map(d=>[d.pieceId,d.axis,d.valueMm]));
    const doc=structuredClone(demoDocument);const a=doc.furniture[0].children[0],b=doc.furniture[0].children[1];
    b.transform=new Matrix4().makeRotationZ(.72).multiply(new Matrix4().makeScale(-1,1,1)).toArray();
    doc.furniture=[{...doc.furniture[0],children:[a,b]}];
    expect(check(importDocument(doc,'demo').furniture[0]).dimensions).toHaveLength(2);
  });
  it('compara las tres medidas sin redondeo y reinicia los grupos en cada mueble',()=>{
    const f=createDemo().furniture[0],template=f.pieces[0];
    f.pieces=[[700,450,18],[700+1e-8,450,18],[700,451,18],[700,450,19],[700.001,450,18]].map((dimensions,i)=>({...template,id:`size-${i}`,code:`P0${i+1}`,dimensions:dimensions as [number,number,number]}));
    expect(dimensionGroups(f).map(g=>g.map(p=>p.id))).toEqual([['size-0','size-1'],['size-2'],['size-3'],['size-4']]);
    expect(dimensionGroups({...f,id:'otro-mueble',pieces:[f.pieces[1]]})[0][0].id).toBe('size-1');
  });
  it('conserva valores al cambiar zoom/despiece y reproyecta las líneas sobre los extremos locales',()=>{
    const f=createDemo().furniture[0],before=check(f);f.explosion=.8;f.zoom=.9;const after=check(f);
    expect(after.dimensions.map(d=>[d.pieceId,d.axis,d.valueMm])).toEqual(before.dimensions.map(d=>[d.pieceId,d.axis,d.valueMm]));
    expect(after.dimensions.map(d=>d.label.center)).not.toEqual(before.dimensions.map(d=>d.label.center));
    for(const d of after.dimensions.filter(d=>d.mode==='linear')){
      const [s0,s1]=d.segments.filter(s=>s.kind==='extension');
      const a=after.anchor(d.pieceId,d.localStart),b=after.anchor(d.pieceId,d.localEnd);
      // Extension starts are three drawing units away from the true projected endpoints.
      expect(Math.hypot(s0.a.x-a.x,s0.a.y-a.y)).toBeCloseTo(3,6);expect(Math.hypot(s1.a.x-b.x,s1.a.y-b.y)).toBeCloseTo(3,6);
    }
  });
  it('usa ejes físicos correctos con rotación, espejo y escala acumulada',()=>{
    const doc=structuredClone(demoDocument);doc.furniture=doc.furniture.slice(0,1);
    doc.furniture[0].transform=new Matrix4().makeRotationZ(.41).multiply(new Matrix4().makeScale(-2,2,3)).toArray();
    check(importDocument(doc,'demo').furniture[0]);
  });
  it('respeta las cajas de notas y sus textos al colocar líneas y etiquetas',()=>{
    const f=createDemo().furniture[0];f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0],position:[718,32],text:'Alinear antes de fijar'}];
    const scene=check(f);
    for(const d of scene.dimensions)for(const s of d.segments)expect(segmentHitsRect(s.a,s.b,scene.notes[0].rect)).toBe(false);
  });
  it('representa con llamada una medida dirigida a la cámara sin inventar una longitud proyectada',()=>{
    const doc=structuredClone(demoDocument);const board=doc.furniture[0].children[2];
    const forward=new Vector3(1,-1,.85).normalize(),right=new Vector3(1,1,0).normalize(),up=new Vector3().crossVectors(forward,right).normalize();
    board.transform=new Matrix4().makeBasis(right,forward,up.clone().negate()).toArray();
    doc.furniture=[{...doc.furniture[0],children:[board]}];
    const f=importDocument(doc,'demo').furniture[0],scene=check(f),depth=scene.dimensions.find(d=>d.mode==='depth')!;
    expect(depth).toBeDefined();expect(depth.valueMm).toBeCloseTo(450);expect(depth.text).toContain('ancho');expect(depth.segments.every(s=>s.kind==='leader')).toBe(true);
  });
});
