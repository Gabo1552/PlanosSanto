import {describe,it,expect} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {createDemo,demoDocument} from '../lib/demo';
import {importDocument} from '../lib/model';
import {cameraBasis,makeScene,pickAnchor} from '../lib/scene';

describe('Dos axonometrías de la misma geometría',()=>{
  it('gira 180 grados alrededor de Z y muestra otras caras sin espejar ni mutar el mueble',()=>{
    const f=createDemo().furniture[0],snapshot=JSON.stringify(f);
    const front=makeScene(f),back=makeScene(f,{view:'back'}),rotate=new Matrix4().makeRotationZ(Math.PI);
    for(const axis of ['right','up','forward'] as const){
      expect(cameraBasis('front')[axis].clone().applyMatrix4(rotate).distanceTo(cameraBasis('back')[axis])).toBeLessThan(1e-12);
    }
    expect(new Set(back.faces.map(face=>face.key))).not.toEqual(new Set(front.faces.map(face=>face.key)));
    expect(back.labels.map(l=>[l.pieceId,l.code])).toEqual(front.labels.map(l=>[l.pieceId,l.code]));
    for(const [id,matrix] of front.transforms)expect(back.transforms.get(id)!.toArray()).toEqual(matrix.toArray());
    expect(JSON.stringify(f)).toBe(snapshot);
  });
  it('selecciona la misma coordenada local desde caras visibles de ambas cámaras, con rotación y espejo',()=>{
    const doc=structuredClone(demoDocument),node=doc.furniture[0].children[2];
    node.transform=new Matrix4().makeRotationZ(.43).multiply(new Matrix4().makeScale(-1.2,1,1)).toArray();
    doc.furniture=[{...doc.furniture[0],children:[node]}];
    const f=importDocument(doc,'demo').furniture[0],p=f.pieces[0];
    for(const view of ['front','back'] as const){
      const scene=makeScene(f,{view}),face=scene.faces[0];
      const tri=p.mesh.triangles[Number(face.key.slice(face.key.lastIndexOf('-')+1))];
      const local=new Vector3();for(const i of tri)local.add(new Vector3(...p.mesh.vertices[i]));local.divideScalar(3);
      const picked=pickAnchor(f,p,scene.anchor(p.id,local.toArray()),{view});
      expect(new Vector3(...picked).distanceTo(local)).toBeLessThan(1e-5);
    }
  });
  it('imprime ambos juegos de códigos y referencias, con cotas una sola vez y notas sin perder anclas',()=>{
    const f=createDemo().furniture[0];
    f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[18,200,350],position:[718,32],text:'Unión desde el dorso'}];
    const snapshot=JSON.stringify(f),front=makeScene(f,{layout:'sheet'}),back=makeScene(f,{layout:'sheet',view:'back'});
    expect(front.warnings).toEqual([]);expect(back.warnings).toEqual([]);
    expect(front.dimensions).toHaveLength(8);expect(back.dimensions).toHaveLength(0);
    for(const scene of [front,back]){
      expect(scene.labels.map(l=>l.code)).toEqual(f.pieces.map(p=>p.code));
      expect(scene.notes[0]).toMatchObject({marker:true,number:1,pieceId:f.notes[0].pieceId});
      expect(scene.notes[0].target).toEqual(scene.anchor(f.notes[0].pieceId,f.notes[0].anchor));
      for(const d of scene.dimensions){expect(d.label.rect.x+d.label.rect.w).toBeLessThanOrEqual(scene.width-9);expect(d.label.rect.y+d.label.rect.h).toBeLessThanOrEqual(scene.height-40);}
    }
    expect(front.notes[0].target).not.toEqual(back.notes[0].target);
    expect(JSON.stringify(f)).toBe(snapshot);
  });
});
