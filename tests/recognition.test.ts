import {describe,it,expect} from 'vitest';
import {Matrix4} from 'three';
import {demoDocument,createDemo,box} from '../lib/demo';
import {importDocument,type RawNode} from '../lib/model';
import {nameSuggestions,frontFromPick} from '../lib/nameSuggestions';
import {withNaming} from '../lib/naming';
import {orderProjection} from '../lib/orderPreview';
const orientation={upAxis:2,frontAxis:1,frontSign:-1,confirmed:true};
function unnamed(){const document=structuredClone(demoDocument);function visit(node:RawNode){if(node.mesh)node.name='Componente#1';node.children.forEach(visit);}document.furniture.forEach(visit);return document;}
describe('Reconocimiento contextual en el marco de cada mueble',()=>{
 it('detecta piezas originalmente genéricas y mantiene posición/rol al rotar y trasladar el mueble',()=>{
  const raw=unnamed(),before=importDocument(raw,'demo').furniture[0],expected=nameSuggestions(before,orientation);
  raw.furniture[0].transform=new Matrix4().makeTranslation(4000,-1200,600).multiply(new Matrix4().makeRotationZ(1.137)).toArray();
  const f=importDocument(raw,'demo').furniture[0],original=JSON.stringify(f),result=nameSuggestions(f,orientation);
  expect(result.map(s=>[s.base,s.position,s.confidence])).toEqual(expected.map(s=>[s.base,s.position,s.confidence]));expect(result).toHaveLength(6);expect(JSON.stringify(f)).toBe(original);
 });
 it('invierte izquierda/derecha de un grupo espejado sin confundir sus IDs físicos',()=>{
  const raw=unnamed(),plain=nameSuggestions(importDocument(raw,'demo').furniture[0],orientation);raw.furniture[0].transform=new Matrix4().makeScale(-1,1,1).toArray();
  const mirrored=nameSuggestions(importDocument(raw,'demo').furniture[0],orientation);
  expect(plain.find(s=>s.ids.includes('m-lateral-izq'))?.position).toContain('Izquierda');expect(mirrored.find(s=>s.ids.includes('m-lateral-izq'))?.position).toContain('Derecha');expect(mirrored.flatMap(s=>s.ids)).toEqual(plain.flatMap(s=>s.ids));
 });
 it('marcar una cara da el frente local incluso con la raíz girada, y rechaza una cara horizontal',()=>{
  const raw=unnamed();raw.furniture[0].transform=new Matrix4().makeRotationZ(.94).toArray();const f=importDocument(raw,'demo').furniture[0];
  expect(frontFromPick(f,'m-fondo',[400,0,350],2)).toEqual({frontAxis:1,frontSign:-1});expect(()=>frontFromPick(f,'m-base',[200,100,18],2)).toThrow(/vertical/);
 });
 it('conserva referencia y correcciones editables, sin volver a seleccionar piezas revisadas',()=>{
  let f=importDocument(unnamed(),'demo').furniture[0];f=withNaming(f,'VF','M01');f.naming!.reference=orientation;f.naming!.reviews=[{id:'m-lateral-izq',proposed:'Lateral',base:'Lat'}];
  const proposals=nameSuggestions(f,orientation);expect(proposals.some(s=>s.ids.includes('m-lateral-izq'))).toBe(false);expect(proposals.find(s=>s.ids.includes('m-lateral-der'))?.base).toBe('Lat');
  const changed=withNaming(f,'AB','M03',{id:'m-lateral-izq',base:'Lat'});expect(changed.naming?.reference).toEqual(orientation);expect(changed.naming?.reviews).toEqual(f.naming!.reviews);expect(changed.pieces[0].name).toBe('AB M03 Lat');
 });
 it('usa Lat observado como vocabulario cuando coincide con la geometría, sin cambiar la definición',()=>{
  const f=importDocument(unnamed(),'demo').furniture[0];f.pieces[0].name='Lat';const before=JSON.stringify(f);const proposal=nameSuggestions(f,orientation,true).find(s=>s.ids.includes(f.pieces[0].id))!;
  expect(proposal.base).toBe('Lat');expect(proposal.proposed).toBe('Lateral');expect(proposal.reason).toContain('abreviatura observada');expect(JSON.stringify(f)).toBe(before);
 });
 it('no traslada una corrección izquierda/derecha a otra pieza',()=>{
  let f=importDocument(unnamed(),'demo').furniture[0];f=withNaming(f,'VF','M01');f.naming!.reviews=[{id:'m-lateral-izq',proposed:'Lateral',base:'Lat izq'}];
  expect(nameSuggestions(f,orientation).find(s=>s.ids.includes('m-lateral-der'))?.base).toBe('Lateral');
  expect(nameSuggestions(f,orientation,true).find(s=>s.ids.includes('m-lateral-izq'))?.base).toBe('Lat izq');
 });
 it('permite una vertical local negativa sin invertir piso/tapa silenciosamente',()=>{
  const f=importDocument(unnamed(),'demo').furniture[0];const positive=nameSuggestions(f,orientation),negative=nameSuggestions(f,{...orientation,upSign:-1});
  expect(positive.find(s=>s.ids.includes('m-base'))?.base).toBe('Piso');expect(negative.find(s=>s.ids.includes('m-base'))?.base).toBe('Tapa');expect(negative.find(s=>s.ids.includes('m-tapa'))?.base).toBe('Piso');
 });
 it('PT/Banq/Ranu no se expanden a un nombre supuesto, incluso con rol geométrico fuerte',()=>{
  for(const word of ['PT','Banq','Ranu']){const f=createDemo().furniture[0];f.pieces[0].name=word;const proposal=nameSuggestions(f,orientation,true).find(s=>s.ids.includes(f.pieces[0].id))!;expect(proposal.confidence).toBe('review');expect(proposal.reason).toContain('ambiguas');}
 });
 it('usa vecinos anidados para proponer un cajón pero exige revisión de su función',()=>{
  const f=createDemo().furniture[0],template=f.pieces[0];f.pieces.push(...[
   {id:'modulo/cajon/lat',mesh:box(18,350,120),transform:new Matrix4().makeTranslation(50,0,200).toArray()},
   {id:'modulo/cajon/fte',mesh:box(450,18,120),transform:new Matrix4().makeTranslation(50,-18,200).toArray()},
   {id:'modulo/cajon/piso',mesh:box(450,350,6),transform:new Matrix4().makeTranslation(50,0,200).toArray()}
  ].map(data=>({...template,...data,name:'Grupo#1',definition:data.id})));
  const proposals=nameSuggestions(f,orientation);expect(proposals.map(s=>s.base)).toEqual(['Lateral cajón','Frente cajón','Fondo cajón']);expect(proposals.every(s=>s.confidence==='review')).toBe(true);
 });
 it('propone Listón para listones comunes de 40×18 y 70×18, pero no para geometría irregular (BUG-TS-05)',()=>{
  const f=createDemo().furniture[0],template=f.pieces[0];f.pieces.push(...[
   {id:'modulo/liston-40',mesh:box(700,40,18),transform:new Matrix4().makeTranslation(50,0,300).toArray()},
   {id:'modulo/liston-70',mesh:box(900,70,18),transform:new Matrix4().makeTranslation(50,100,300).toArray()}
  ].map(data=>({...template,...data,name:'Grupo#1',definition:data.id})));
  const base=(id:string)=>nameSuggestions(f,orientation).find(s=>s.ids.includes(id))?.base;
  expect(base('modulo/liston-40')).toBe('Listón');expect(base('modulo/liston-70')).toBe('Listón');
  f.pieces.find(p=>p.id==='modulo/liston-40')!.metadata={...f.pieces.find(p=>p.id==='modulo/liston-40')!.metadata,rectangular:false};
  expect(base('modulo/liston-40')).toBe('Sin clasificar');
 });
 it('un frente no confirmado u oblicuo no habilita roles automáticos',()=>{
  const f=importDocument(unnamed(),'demo').furniture[0];expect(nameSuggestions(f,{...orientation,confirmed:false}).every(s=>s.confidence==='unclassified')).toBe(true);
  f.pieces[0].transform=new Matrix4().makeRotationZ(.55).toArray();expect(nameSuggestions(f,orientation).find(s=>s.ids.includes(f.pieces[0].id))?.base).toBe('Sin clasificar');
 });
});
describe('Vista física espejada, ejes y cara',()=>{
 const mesh=box(700,450,18),geometry={lengths:[700,450,18],bounds:{min:[0,0,0],max:[700,450,18]},scales:[1,1,1],vertices:mesh.vertices,triangles:mesh.triangles,mirrored:true};
 it('incorpora la paridad del espejo en la lectura de la misma cara',()=>{
  const front=orderProjection(geometry,{axes:[0,1],frontSign:1,flipX:false,flipY:false});expect(front.points[0]).toEqual([700,450]);
  const back=orderProjection(geometry,{axes:[0,1],frontSign:-1,flipX:false,flipY:false});expect(back.points[0]).toEqual([0,450]);
  expect(front.width).toBe(700);expect(back.height).toBe(450);
 });
});
