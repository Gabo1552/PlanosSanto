import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box} from '../lib/demo';
import type {Furniture} from '../lib/model';
import {frontPieceIds,interiorHidden,makeScene} from '../lib/scene';
import {bench,chest,wardrobe} from './synthetic-furniture';

// Synthetic geometry only: a projecting worktop is not a front panel.
const overhang=(f:Furniture):Furniture=>({...f,pieces:f.pieces.map(p=>p.id.endsWith('/tapa')?{...p,transform:p.transform.map((v,i)=>i===13?v-60:v)}:p)});
const fronts=(f:Furniture)=>f.pieces.filter(p=>p.id.includes('/puerta-')||p.id.endsWith('/frente')).map(p=>p.id);

describe('Autoocultamiento interior con elementos salientes',()=>{
  it.each([['banco',bench],['placard',wardrobe],['cajonera',chest]] as const)('la tapa saliente no tapa la vista interior del %s',(_name,make)=>{
    const f=overhang(make()),expected=fronts(f),before=JSON.stringify(f);
    expect(frontPieceIds(f)).toEqual(expected);
    expect(interiorHidden(f)).toEqual(expected);
    const interior=makeScene(f,{view:'back',dimensions:false}),exterior=makeScene(f,{view:'front',dimensions:false});
    expect(interior.faces.some(face=>expected.includes(face.pieceId))).toBe(false);
    expect(expected.every(id=>exterior.faces.some(face=>face.pieceId===id))).toBe(true);
    // All remaining boards (including the fondo and zócalo) keep their visibility and inventory identity.
    expect(f.pieces.filter(p=>!expected.includes(p.id)).every(p=>interior.faces.some(face=>face.pieceId===p.id))).toBe(true);
    expect(JSON.stringify(f)).toBe(before);
  });
  it('un tirador saliente con el espesor vertical no desplaza el plano de las puertas',()=>{
    const f=overhang(bench()),template=f.pieces[0];
    f.pieces=[...f.pieces,{...template,id:'BANCO/tirador',code:'P11',name:'Tirador',definition:undefined,mesh:box(128,35,10),dimensions:[128,35,10],transform:new Matrix4().makeTranslation(400,-53,350).toArray()}];
    expect(frontPieceIds(f)).toEqual(fronts(f));
    expect(interiorHidden(f)).not.toContain('BANCO/tirador');
  });
  it('respeta el frente local al girar y espejar el mueble con tapa saliente',()=>{
    const original=overhang(bench());
    const matrix=new Matrix4().makeRotationZ(Math.PI/2).multiply(new Matrix4().makeScale(-1,1,1));
    const f:Furniture={...original,referenceTransform:matrix.toArray(),naming:{moduleCode:'M01',bases:[],reference:{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true}},pieces:original.pieces.map(p=>({...p,transform:matrix.clone().multiply(new Matrix4().fromArray(p.transform)).toArray()}))};
    expect(frontPieceIds(f)).toEqual(fronts(f));
  });
  it('un mueble abierto mantiene el fondo y el zócalo, sin inventar puertas',()=>{
    const f=overhang(bench());f.pieces=f.pieces.filter(p=>!fronts(f).includes(p.id));
    expect(frontPieceIds(f)).toEqual([]);
  });
});
