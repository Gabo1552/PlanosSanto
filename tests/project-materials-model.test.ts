import {describe,expect,it} from 'vitest';
import {boundIds,foldOpen,paletteSections,projectIds,splitProject} from '../sketchup_offline/ui/materialLibraryModel';

// 0.8.31: «Materiales del proyecto». Pure logic shared by Materiales and the paint palette.
const rows=(...ids:string[])=>ids.map(id=>({id}));
const ids=(list:{id:string}[])=>list.map(row=>row.id);
const natives=[{binding:{catalogId:'pintado'}},{binding:null},{},{binding:{catalogId:''}}];

describe('Materiales del proyecto: qué cuenta como del proyecto',()=>{
 it('suma la lista guardada y lo ya pintado en el modelo, sin duplicar',()=>{
  expect([...projectIds({ids:['elegido','pintado']},natives)!].sort()).toEqual(['elegido','pintado']);
  expect([...boundIds(natives)]).toEqual(['pintado']);
 });
 it('un SKP viejo (lista vacía) igual tiene los materiales que ya usa',()=>{
  expect([...projectIds({ids:[]},natives)!]).toEqual(['pintado']);
 });
 it('sin lista del backend (versión anterior) no hay proyecto: null',()=>{
  expect(projectIds(undefined,natives)).toBeNull();
  expect(projectIds({ids:'x'} as unknown as {ids:string[]},natives)).toBeNull();
 });
 it('ignora ids que no son texto',()=>{
  expect([...projectIds({ids:['a',3,null,''] as unknown as string[]},[])!]).toEqual(['a']);
 });
});

describe('Materiales del proyecto: división de la biblioteca',()=>{
 it('separa conservando el orden',()=>{
  const split=splitProject(rows('a','b','c','d'),new Set(['c','a']));
  expect(ids(split.project)).toEqual(['a','c']);expect(ids(split.others)).toEqual(['b','d']);
  expect(ids(splitProject(rows('a'),null).others)).toEqual(['a']);
 });
 it('el bloque plegado se abre al buscar o si el proyecto no tiene nada; si no, respeta al usuario',()=>{
  expect(foldOpen(true,'')).toBe(false);
  expect(foldOpen(false,'')).toBe(true);
  expect(foldOpen(true,'  roble ')).toBe(true);
  expect(foldOpen(true,'',true)).toBe(true);
  expect(foldOpen(false,'',false)).toBe(false);
  expect(foldOpen(true,'x',false)).toBe(true);
 });
});

describe('Paleta de pintura: qué materiales lista',()=>{
 const all=rows('roble','blanco','nogal','gris');
 it('con proyecto: solo los del proyecto y el resto plegado en Otros de la biblioteca',()=>{
  const sections=paletteSections(all,all,new Set(['nogal','roble']),'');
  expect(ids(sections.main)).toEqual(['roble','nogal']);
  expect(ids(sections.folded)).toEqual(['blanco','gris']);
  expect(sections.invite).toBe(false);expect(sections.enabled).toBe(true);
  expect([...sections.marked].sort()).toEqual(['blanco','gris']);
 });
 it('al buscar incluye los otros que coinciden, después de los del proyecto y marcados',()=>{
  const visible=rows('blanco','roble');
  const sections=paletteSections(visible,all,new Set(['roble']),'o');
  expect(ids(sections.main)).toEqual(['roble','blanco']);
  expect(sections.folded).toEqual([]);
  expect(sections.marked.has('blanco')).toBe(true);expect(sections.marked.has('roble')).toBe(false);
 });
 it('sin materiales del proyecto de este tipo: biblioteca desplegada e invitación',()=>{
  const sections=paletteSections(all,all,new Set(['canto-del-proyecto']),'');
  expect(ids(sections.main)).toEqual(ids(all));
  expect(sections.folded).toEqual([]);
  expect(sections.invite).toBe(true);
  expect(sections.marked.size).toBe(0);
 });
 it('decide con todos los del tipo, no con el filtro: favoritos/búsqueda sin coincidencias no muestran la invitación',()=>{
  const sections=paletteSections([],all,new Set(['roble']),'zzz');
  expect(sections.invite).toBe(false);expect(sections.main).toEqual([]);
 });
 it('un backend sin lista del proyecto muestra todo como antes',()=>{
  const sections=paletteSections(all,all,null,'');
  expect(ids(sections.main)).toEqual(ids(all));expect(sections.folded).toEqual([]);expect(sections.enabled).toBe(false);expect(sections.invite).toBe(false);
 });
});
