import {describe,it,expect} from 'vitest';
import {createDemo,box} from '../lib/demo';
import {nameSuggestions} from '../lib/nameSuggestions';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {presentationSchema} from '../lib/presentation';
import {orderProjection} from '../lib/orderPreview';
describe('Sugerencias auditables de nombres',()=>{
 it('se abstiene sin frente confirmado y no cambia nombres ni geometría',()=>{
  const f=createDemo().furniture[0],before=JSON.stringify(f),suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:false},true);
  expect(suggestions.every(s=>s.confidence==='unclassified')).toBe(true);expect(JSON.stringify(f)).toBe(before);
 });
 it('sugiere laterales pero deja horizontales y frentes para revisión explícita',()=>{
  const f=createDemo().furniture[0],suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true},true);
  expect(suggestions.filter(s=>s.base==='Lateral')).toHaveLength(2);expect(suggestions.filter(s=>s.base==='Lateral').every(s=>s.confidence==='high')).toBe(true);
  expect(suggestions.find(s=>s.ids.includes('m-estante'))?.confidence).toBe('review');
  expect(suggestions.find(s=>s.ids.includes('m-base'))?.confidence).toBe('review');
  expect(nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true})).toEqual([]);
 });
 it('grupos de iguales conservan un nombre y todas las identidades físicas',()=>{
  const f=createDemo().furniture[0];f.groupIdentical=true;
  const suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true},true);
  expect(suggestions.find(s=>s.ids.includes('m-lateral-izq'))?.ids).toEqual(['m-lateral-izq','m-lateral-der']);
  expect(suggestions.flatMap(s=>s.ids).sort()).toEqual(f.pieces.map(p=>p.id).sort());
 });
});
describe('Vista de corte 2D por ejes y cara',()=>{
 const mesh=box(700,450,18),geometry={lengths:[700,450,18],bounds:{min:[0,0,0],max:[700,450,18]},scales:[1,1,1],vertices:mesh.vertices,triangles:mesh.triangles};
 it('cambiar de cara invierte la lectura horizontal y conserva medidas/huecos sin ordenar dimensiones',()=>{
  const front=orderProjection(geometry,{axes:[0,1],frontSign:1,flipX:false,flipY:false});
  const back=orderProjection(geometry,{axes:[0,1],frontSign:-1,flipX:false,flipY:false});
  expect(front.points[0]).toEqual([0,450]);expect(back.points[0]).toEqual([700,450]);
  expect(front.triangles).toHaveLength(2);expect(back.triangles).toHaveLength(2);expect(front.triangles).not.toEqual(back.triangles);
  expect([front.width,front.height]).toEqual([700,450]);
 });
 it('intercambiar ejes respeta el sistema de referencia y las inversiones explícitas',()=>{
  const swapped=orderProjection(geometry,{axes:[1,0],frontSign:1,flipX:false,flipY:false});expect([swapped.width,swapped.height]).toEqual([450,700]);expect(swapped.effectiveFlipX).toBe(true);
  const flipped=orderProjection(geometry,{axes:[1,0],frontSign:1,flipX:true,flipY:true});expect(flipped.points[0]).toEqual([0,0]);
 });
});

describe('Plano compacto optativo para muebles densos',()=>{
 it('conserva geometría, medidas y todas las instancias, con referencias de tipo en la trasera',()=>{
  let f=createDemo().furniture[0];f.groupIdentical=true;f=synchronizeGroupedNames(f);f.presentation={compact:true};const before=JSON.stringify(f);
  const front=makeScene(f,{layout:'sheet'}),back=makeScene(f,{layout:'sheet',view:'back'});
  expect(front.labels).toHaveLength(0);expect(back.labels).toHaveLength(pieceRows(f).length);expect(back.labels.some(l=>l.quantity===2)).toBe(true);
  expect(new Set(front.faces.map(face=>face.pieceId)).size).toBe(f.pieces.length);expect(front.dimensions.length).toBeGreaterThan(0);
  for(const d of front.dimensions){expect(d.text).toContain(d.code);expect(d.text).toContain(d.role);expect(d.text).toContain('mm');}
  expect(layoutWarnings(f)).toEqual([]);expect(JSON.stringify(f)).toBe(before);expect(presentationSchema.parse(f.presentation)).toEqual({compact:true});
 });
 it('agrupa advertencias repetidas manteniendo todos los códigos y notas, sin omitirlas',()=>{
  const f=createDemo().furniture[0];f.pieces[0].warnings=['Revisar orientación'];f.pieces[1].warnings=['Revisar orientación'];
  const entries=sheetEntries(f).filter(line=>line.includes('Revisar orientación'));expect(entries).toHaveLength(1);expect(entries[0]).toContain(f.pieces[0].code);expect(entries[0]).toContain(f.pieces[1].code);
 });
});
