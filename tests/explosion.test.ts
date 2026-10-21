import {describe,it,expect} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {box,createDemo} from '../lib/demo';
import {explodedOffsets} from '../lib/explosion';
import {makeScene,pickAnchor} from '../lib/scene';
import {type Furniture,type Piece,bounds} from '../lib/model';

function cabinet(length=3600):Furniture{
  const panel=(id:string,size:[number,number,number],position:[number,number,number]):Piece=>({id,name:id,code:id,quantity:1,warnings:[],dimensions:[...size].sort((a,b)=>b-a) as [number,number,number],mesh:box(...size),transform:new Matrix4().makeTranslation(...position).toArray()});
  return {id:'wide',name:'Mueble sintético largo',zoom:1,explosion:1,notes:[],pieces:[
    panel('left',[18,550,800],[0,0,0]),panel('right',[18,550,800],[length-18,0,0]),
    panel('base',[length-36,550,18],[18,0,0]),panel('top',[length-36,550,18],[18,0,782]),
    panel('divider',[18,550,764],[length/2-9,0,18]),panel('shelf',[length-36,530,18],[18,10,391]),
    panel('back',[length,6,800],[0,550,0])
  ]};
}
describe('Despiece por capas y normal del tablón',()=>{
  it('mantiene ensamblado exacto en cero y no modifica geometría ni medidas',()=>{
    const f=cabinet(),before=JSON.stringify(f);f.explosion=0;
    for(const offset of explodedOffsets(f).values())expect(offset.length()).toBe(0);
    f.explosion=1;makeScene(f);expect(JSON.stringify(f)).toBe(before);
  });
  it('separa laterales, tapa, base, fondo y divisores, incluso en un mueble largo',()=>{
    const offsets=explodedOffsets(cabinet());
    expect(offsets.get('left')!.x).toBeLessThan(-20);expect(offsets.get('right')!.x).toBeGreaterThan(20);
    expect(offsets.get('top')!.z).toBeGreaterThan(20);expect(offsets.get('base')!.z).toBeLessThan(-20);
    expect(Math.abs(offsets.get('divider')!.x)).toBeGreaterThan(15);
    expect(Math.abs(offsets.get('shelf')!.z)).toBeGreaterThan(15);
    expect(offsets.get('back')!.y).toBeGreaterThan(20);
  });
  it('alargar un mueble no dispara la separación en altura o profundidad',()=>{
    const normal=explodedOffsets(cabinet(1800)),long=explodedOffsets(cabinet(12000));
    for(const id of normal.keys()){
      expect(long.get(id)!.y).toBeCloseTo(normal.get(id)!.y,7);
      expect(long.get(id)!.z).toBeCloseTo(normal.get(id)!.z,7);
      expect(long.get(id)!.length()).toBeLessThan(200);
    }
  });
  it('es determinista al reordenar piezas y sigue la rotación del mueble',()=>{
    const f=cabinet(),before=explodedOffsets(f);f.pieces.reverse();
    for(const [id,offset] of explodedOffsets(f))expect(offset.distanceTo(before.get(id)!)).toBeLessThan(1e-7);
    const rotation=new Matrix4().makeRotationZ(.81),translation=new Matrix4().makeTranslation(12000,-8000,300);
    f.pieces=f.pieces.map(p=>({...p,transform:translation.clone().multiply(rotation).multiply(new Matrix4().fromArray(p.transform)).toArray()}));
    for(const [id,offset] of explodedOffsets(f))expect(offset.distanceTo(before.get(id)!.clone().applyMatrix4(rotation))).toBeLessThan(1e-7);
  });
  it('proyecta las mismas piezas y anclas en ambas cámaras y en el PDF',()=>{
    const f=cabinet();
    for(const view of ['front','back'] as const)for(const layout of ['editor','sheet'] as const){
      const scene=makeScene(f,{view,layout});
      expect(new Set(scene.faces.map(face=>face.pieceId)).size).toBe(7);
      for(const p of f.pieces){
        const center=bounds(p.mesh).getCenter(new Vector3()).toArray();
        const anchor=scene.anchor(p.id,center);
        expect(Number.isFinite(anchor.x)&&Number.isFinite(anchor.y)).toBe(true);
        const local=pickAnchor(f,p,anchor,{view,layout});
        expect(local.every(Number.isFinite)).toBe(true);
        expect(scene.transforms.get(p.id)!.elements.slice(12,15)).toEqual(new Matrix4().fromArray(p.transform).elements.slice(12,15).map((n,i)=>n+scene.offsets.get(p.id)!.getComponent(i)));
      }
    }
  });
  it('respeta intensidad progresiva y modelos de una sola pieza',()=>{
    const f=cabinet(),full=explodedOffsets(f);f.explosion=.5;
    for(const [id,offset] of explodedOffsets(f))expect(offset.distanceTo(full.get(id)!.clone().multiplyScalar(.5))).toBeLessThan(1e-7);
    const single=createDemo().furniture[0];single.pieces=single.pieces.slice(0,1);
    expect(explodedOffsets(single).get(single.pieces[0].id)!.length()).toBeGreaterThan(0);
  });
});
