import { describe,expect,it } from 'vitest';
import { Matrix4,Vector3 } from 'three';
import { createDemo,demoDocument } from '../lib/demo';
import { applyEdit,bounds,importDocument,toEdit } from '../lib/model';
import { layoutWarnings,makeScene,noteLines,pickAnchor } from '../lib/scene';

describe('Geometría y piezas',()=>{
  it('detecta muebles, grupos anidados e instancias repetidas sin colapsarlas',()=>{
    const p=createDemo();expect(p.furniture).toHaveLength(2);
    const f=p.furniture[0];expect(f.pieces).toHaveLength(6);
    expect(f.pieces.map(p=>p.code)).toEqual(['P01','P02','P03','P04','P05','P06']);
    expect(f.pieces[0].definition).toBe(f.pieces[1].definition);
    expect(f.pieces[0].id).not.toBe(f.pieces[1].id);
    expect(f.pieces.every(p=>p.quantity===1)).toBe(true);
    expect(f.pieces[4].dimensions).toEqual([764,430,18]);
  });
  it('conserva dimensiones locales bajo rotación, escala y transformaciones padre',()=>{
    const doc=structuredClone(demoDocument);
    doc.furniture[0].transform=new Matrix4().makeRotationZ(Math.PI/4).multiply(new Matrix4().makeScale(2,2,2)).toArray();
    const p=importDocument(doc,'demo');
    expect(p.furniture[0].pieces[0].dimensions).toEqual([1400,900,36]);
    expect(p.furniture[1].pieces[3].dimensions).toEqual([450,100,18]);
    expect(p.furniture[1].pieces[3].transform[12]).toBe(1825);
  });
  it('convierte pulgadas a milímetros una sola vez incluyendo traslaciones',()=>{
    const doc=structuredClone(demoDocument);doc.units='in';
    const piece=importDocument(doc,'demo').furniture[1].pieces[0];
    expect(piece.dimensions[0]).toBeCloseTo(15240);
    expect(piece.transform[12]).toBeCloseTo(1300*25.4);
    expect(piece.mesh.vertices[1][0]).toBe(600*25.4);
  });
  it('admite instancias espejadas manteniendo medidas y caras exteriores visibles',()=>{
    const doc=structuredClone(demoDocument);
    const normal=makeScene(createDemo().furniture[0]);
    doc.furniture[0].transform=new Matrix4().makeScale(-1,1,1).toArray();
    const mirrored=importDocument(doc,'demo').furniture[0];
    expect(mirrored.pieces[0].dimensions).toEqual([700,450,18]);
    expect(makeScene(mirrored).faces.length).toBe(normal.faces.length);
  });
  it('rechaza cizallamiento, escalas degeneradas, geometría inválida e IDs repetidos',()=>{
    const doc=structuredClone(demoDocument);doc.furniture[0].transform[4]=0.2;
    expect(()=>importDocument(doc,'demo')).toThrow(/sesgada/);
    doc.furniture[0].transform=new Matrix4().makeScale(0,1,1).toArray();
    expect(()=>importDocument(doc,'demo')).toThrow(/escala cero/);
    const invalid=structuredClone(demoDocument);invalid.furniture[0].children[0].mesh!.triangles[0][0]=999;
    expect(()=>importDocument(invalid,'demo')).toThrow(/Índices/);
    const duplicate=structuredClone(demoDocument);duplicate.furniture[0].children[0].id=duplicate.furniture[0].id;
    expect(()=>importDocument(duplicate,'demo')).toThrow(/único/);
  });
});
describe('Edición protegida y anotaciones',()=>{
  it('renombra sin aceptar cambios de dimensiones ni geometría',()=>{
    const p=createDemo(),edit=toEdit(p);
    edit.furniture[0].pieces[0].name='Costado';
    Object.assign(edit.furniture[0].pieces[0],{dimensions:[1,2,3],quantity:99});
    const updated=applyEdit(p,edit);
    expect(updated.furniture[0].pieces[0].name).toBe('Costado');
    expect(updated.furniture[0].pieces[0].dimensions).toEqual([700,450,18]);
    expect(updated.furniture[0].pieces[0].quantity).toBe(1);
    expect(()=>applyEdit(updated,edit)).toThrow('CONFLICT');
  });
  it('persiste anclas locales y las reproyecta al cambiar zoom y despiece sin modificar medidas',()=>{
    const p=createDemo(),f=p.furniture[0],piece=f.pieces[0];
    const local=bounds(piece.mesh).getCenter(new Vector3()).toArray();
    const a=makeScene(f).anchor(piece.id,local);
    const edit=toEdit(p);edit.furniture[0].notes=[{id:crypto.randomUUID(),pieceId:piece.id,anchor:local,position:[718,32],text:'Unión con tarugo'}];
    edit.furniture[0].explosion=1;edit.furniture[0].zoom=0.9;
    const result=applyEdit(p,edit),b=makeScene(result.furniture[0]).notes[0].target;
    expect(a).not.toEqual(b);
    expect(result.furniture[0].notes[0].anchor).toEqual(local);
    expect(result.furniture[0].pieces).toEqual(f.pieces);
  });
  it('rechaza notas huérfanas, anclas exteriores y estructura adulterada',()=>{
    const p=createDemo(),edit=toEdit(p);
    edit.furniture[0].notes=[{id:crypto.randomUUID(),pieceId:'missing',anchor:[0,0,0],position:[50,50],text:'Test'}];
    expect(()=>applyEdit(p,edit)).toThrow(/ancla/);
    edit.furniture[0].notes[0].pieceId=p.furniture[0].pieces[0].id;
    edit.furniture[0].notes[0].anchor=[9999,0,0];
    expect(()=>applyEdit(p,edit)).toThrow(/ancla/);
    edit.furniture[0].notes=[];edit.furniture[0].pieces.pop();
    expect(()=>applyEdit(p,edit)).toThrow(/inconsistentes/);
  });
  it('selecciona un punto local sobre la pieza mediante intersección 3D',()=>{
    const f=createDemo().furniture[0],p=f.pieces[0],scene=makeScene(f);
    const center=bounds(p.mesh).getCenter(new Vector3()).toArray();
    const hit=pickAnchor(f,p,scene.anchor(p.id,center));
    expect(bounds(p.mesh).containsPoint(new Vector3(...hit))).toBe(true);
    expect(hit).not.toEqual(center);
  });
});
describe('Maquetación legible',()=>{
  it('mantiene etiquetas completas y detecta notas que se solapan o se salen',()=>{
    const f=createDemo().furniture[0];expect(layoutWarnings(f)).toEqual([]);
    const scene=makeScene(f);expect(scene.labels.map(l=>l.code)).toEqual(f.pieces.map(p=>p.code));
    const note={id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0] as [number,number,number],position:[718,32] as [number,number],text:'W'.repeat(200)};
    f.notes=[note];expect(noteLines(note.text).every(l=>l.length<=24)).toBe(true);expect(layoutWarnings(f)).toEqual([]);
    f.notes.push({...note,id:crypto.randomUUID()});expect(layoutWarnings(f).join()).toMatch(/superpuestas/);
    f.notes=[{...note,position:[718,528]}];expect(layoutWarnings(f).join()).toMatch(/fuera/);
  });
  it('avisa si la tabla no cabe en A4 en lugar de achicar o quitar filas',()=>{
    const f=createDemo().furniture[0];f.pieces=Array.from({length:60},(_,i)=>({...f.pieces[0],id:`p-${i}`,code:`P${i}`}));
    expect(layoutWarnings(f).join()).toMatch(/listado/);
    expect(f.pieces).toHaveLength(60);
  });
});
