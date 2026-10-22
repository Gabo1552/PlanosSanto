import {describe,expect,it} from 'vitest';
import {demoDocument} from '../lib/demo';
import {editsFor,mergeGuide,type Guide,type GuideFurniture} from '../sketchup_offline/ui/guide';
import {codePlan,referenceBoard,type CodePiece} from '../sketchup_offline/ui/names';

const material=(name:string)=>({material:{id:name.toLowerCase(),name,color:[1,1,1] as [number,number,number],opacity:1,textured:false}});
const piece=(id:string,code:string,dimensions:[number,number,number],board?:string,name=id):CodePiece=>({id,name,code,dimensions,...(board?{metadata:material(board)}:{})});
const CODE=/^P\d{2,4}$/;
function unique(rows:{after:string}[]){return new Set(rows.map(r=>r.after)).size===rows.length;}

describe('codePlan: orden placa → espesor → largo → ancho',()=>{
 const pieces=[
  piece('a','P01',[600,400,18],'Melamina Blanca'),
  piece('b','P02',[700,400,15],'Melamina Blanca'),
  piece('c','P03',[700,500,18],'Melamina Blanca'),
  piece('d','P04',[700,300,18],'Melamina Blanca'),
  piece('e','P05',[900,900,18]),
  piece('f','P06',[300,200,3],'Fibroplus'),
 ];
 it('ordena por placa (sin placa al final), espesor, largo y ancho descendentes',()=>{
  const rows=codePlan(pieces,{saved:[],renumber:true});
  expect(rows.map(r=>r.id)).toEqual(['f','c','d','a','b','e']);
  expect(rows.map(r=>r.after)).toEqual(['P01','P02','P03','P04','P05','P06']);
  expect(rows[0]).toMatchObject({board:'Fibroplus',before:'P06',changed:true,dimensions:[300,200,3]});
  expect(rows.at(-1)).toMatchObject({board:'',name:'e'});
 });
 it('usa la placa del pedido cuando hay referencias y desempata por código e id numérico',()=>{
  const board=referenceBoard({a:{text:'MDF 18',board:'Z Placa'},b:'A Placa'});
  const rows=codePlan([piece('p/10','P02',[100,100,18]),piece('p/9','P02',[100,100,18]),piece('a','P07',[10,10,18],'Mel'),piece('b','P08',[10,10,15])],{saved:[],renumber:true,board});
  expect(rows.map(r=>[r.id,r.board])).toEqual([['b','A Placa'],['a','Z Placa'],['p/9',''],['p/10','']]);
  expect(referenceBoard(undefined)).toBeUndefined();
 });
});

describe('codePlan: códigos nuevos sin renumerar',()=>{
 it('solo codifica piezas sin código guardado, con los números libres más bajos',()=>{
  const pieces=[piece('a','P02',[500,400,18]),piece('b','P05',[900,400,18]),piece('c','P06',[800,400,18]),piece('d','P07',[100,100,18])];
  const rows=codePlan(pieces,{saved:new Set(['a','b']),renumber:false});
  const by=Object.fromEntries(rows.map(r=>[r.id,r]));
  expect(by.a).toMatchObject({before:'P02',after:'P02',changed:false});
  expect(by.b).toMatchObject({before:'P05',after:'P05',changed:false});
  // c (800) va antes que d (100): recibe P01, d recibe P03 (P02 lo conserva a).
  expect(by.c).toMatchObject({after:'P01',changed:true});
  expect(by.d).toMatchObject({after:'P03',changed:true});
  expect(unique(rows)).toBe(true);expect(rows.every(r=>CODE.test(r.after))).toBe(true);
 });
 it('sin piezas nuevas no cambia nada; repetir el plan es estable',()=>{
  const pieces=[piece('a','P01',[1,1,1]),piece('b','P02',[2,2,2])];
  expect(codePlan(pieces,{saved:['a','b'],renumber:false}).some(r=>r.changed)).toBe(false);
  const fresh=[piece('x','P09',[5,5,5]),piece('y','P01',[6,6,6])];
  const first=codePlan(fresh,{saved:[],renumber:false});
  const applied=fresh.map(p=>({...p,code:first.find(r=>r.id===p.id)!.after}));
  expect(codePlan(applied,{saved:[],renumber:false}).some(r=>r.changed)).toBe(false);
 });
 it('recodifica códigos guardados repetidos o inválidos para garantizar unicidad',()=>{
  const rows=codePlan([piece('a','P01',[9,9,9]),piece('b','P01',[8,8,8]),piece('c','X1',[7,7,7])],{saved:['a','b','c'],renumber:false});
  expect(rows.map(r=>r.after)).toEqual(['P01','P02','P03']);expect(unique(rows)).toBe(true);
 });
 it('formatea con al menos dos dígitos y falla después de P9999',()=>{
  const many=Array.from({length:120},(_,i)=>piece(`n${i}`,'P01',[1000-i,10,18]));
  const rows=codePlan(many,{saved:[],renumber:false});
  expect(rows[0].after).toBe('P01');expect(rows[99].after).toBe('P100');expect(unique(rows)).toBe(true);
  expect(rows.every(r=>CODE.test(r.after))).toBe(true);
  const full=[piece('k','P9999',[1,1,1]),...Array.from({length:9998},(_,i)=>piece(`s${i}`,`P${String(i+1).padStart(2,'0')}`,[1,1,1]))];
  expect(()=>codePlan([...full,piece('nueva','P01',[1,1,1])],{saved:full.map(p=>p.id),renumber:false})).toThrow('Se agotaron los códigos');
 });
});

describe('codePlan: renumerar todo',()=>{
 it('asigna P01..Pnn en orden y marca solo las filas que cambian',()=>{
  const rows=codePlan([piece('a','P01',[100,10,18]),piece('b','P02',[200,10,18]),piece('c','P03',[50,10,18])],{saved:['a','b','c'],renumber:true});
  expect(rows.map(r=>[r.id,r.before,r.after,r.changed])).toEqual([['b','P02','P01',true],['a','P01','P02',true],['c','P03','P03',false]]);
 });
});

function savedGuide(pieces:GuideFurniture['pieces']):Guide{return {version:1,revision:2,selection:['modulo'],furniture:[{id:'modulo',explosion:0.2,zoom:0.9,pieces,notes:[]}]};}
describe('guide.ts: piezas sin código guardado y bandera renumber',()=>{
 it('mergeGuide informa las piezas que no están en la guía guardada y tolera previousCode',()=>{
  const {project,unsaved}=mergeGuide(structuredClone(demoDocument),savedGuide([{id:'m-lateral-izq',name:'Lateral',code:'P04',previousCode:'P01'},{id:'m-base',name:'Base',code:'P02'}]));
  const modulo=project.furniture.find(f=>f.id==='modulo')!;
  expect(unsaved.modulo).toEqual(modulo.pieces.map(p=>p.id).filter(id=>!['m-lateral-izq','m-base'].includes(id)));
  expect(modulo.pieces.find(p=>p.id==='m-lateral-izq')!.code).toBe('P04');
  // A furniture without a saved guide has every piece without code.
  const mesa=project.furniture.find(f=>f.id==='mesa')!;
  expect(unsaved.mesa).toEqual(mesa.pieces.map(p=>p.id));
 });
 it('editsFor agrega renumber:true solo a los muebles renumerados y no envía previousCode',()=>{
  const {project,orphans}=mergeGuide(structuredClone(demoDocument),savedGuide([{id:'m-base',name:'Base',code:'P02',previousCode:'P01'}]));
  const plain=editsFor(project,orphans);expect(plain.some(f=>'renumber' in f)).toBe(false);
  const edits=editsFor(project,orphans,new Set(['modulo']));
  expect(edits.find(f=>f.id==='modulo')!.renumber).toBe(true);
  expect('renumber' in edits.find(f=>f.id==='mesa')!).toBe(false);
  expect(JSON.stringify(edits)).not.toContain('previousCode');
 });
});
