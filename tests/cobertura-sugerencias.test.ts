import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box,createDemo,demoDocument} from '../lib/demo';
import {importDocument,type Furniture,type RawNode} from '../lib/model';
import {frontFromPick,nameSuggestions} from '../lib/nameSuggestions';

// Frente del módulo demo: -Y; vertical: Z.
const orientation={upAxis:2,frontAxis:1,frontSign:-1,confirmed:true};
const byId=(f:Furniture,id:string,confirmed=orientation)=>nameSuggestions(f,confirmed,true).find(s=>s.ids.includes(id))!;
function board(id:string,name:string,size:[number,number,number],pos:[number,number,number]):RawNode{
 return {id,name,kind:'component',definition:`${id}-def`,transform:new Matrix4().makeTranslation(...pos).toArray(),mesh:box(...size),children:[]};
}
function module(children:RawNode[]):Furniture{
 const doc=structuredClone(demoDocument);doc.furniture=[{...doc.furniture[0],children:[...doc.furniture[0].children,...children]}];
 return importDocument(doc,'demo').furniture[0];
}

describe('Frente elegido con un clic',()=>{
 it('rechaza piezas desconocidas y clics lejos de la pieza',()=>{
  const f=createDemo().furniture[0];
  expect(()=>frontFromPick(f,'no-existe',[0,0,0],2)).toThrow('Pieza desconocida.');
  expect(()=>frontFromPick(f,'m-fondo',[5000,5000,5000],2)).toThrow('Tocá una cara vertical del frente.');
  expect(frontFromPick(f,'m-lateral-izq',[0,200,350],2)).toEqual({frontAxis:0,frontSign:-1});
 });
});

describe('Propuestas de nombre por posición en el mueble',()=>{
 it('sin frente confirmado, o con vertical igual al frente, no clasifica',()=>{
  const f=createDemo().furniture[0];
  for(const o of [{...orientation,confirmed:false},{...orientation,frontAxis:2}]){
   const all=nameSuggestions(f,o,true);
   expect(all.every(s=>s.base==='Sin clasificar')).toBe(true);
   expect(all.filter(s=>s.ids[0]!=='m-fondo').every(s=>s.confidence==='unclassified')).toBe(true);
  }
 });
 it('clasifica laterales, piso, tapa, estante y fondo del módulo demo',()=>{
  const f=createDemo().furniture[0];
  expect(byId(f,'m-lateral-izq')).toMatchObject({base:'Lateral',confidence:'high'});
  expect(byId(f,'m-lateral-izq').position).toBe('Izquierda · intermedio · interior');
  expect(byId(f,'m-base').base).toBe('Piso');expect(byId(f,'m-tapa').base).toBe('Tapa');
  expect(byId(f,'m-estante')).toMatchObject({base:'Estante',confidence:'review'});
  expect(byId(f,'m-fondo').base).toBe('Fondo');
 });
 it('sin includeNamed solo propone para nombres genéricos o vacíos',()=>{
  const f=createDemo().furniture[0];
  expect(nameSuggestions(f,orientation)).toEqual([]);
  f.pieces[0].name='Pieza 1';f.pieces[1].name='Componente#3';f.pieces[2].name='';
  expect(nameSuggestions(f,orientation).map(s=>s.ids[0])).toEqual(['m-lateral-izq','m-lateral-der','m-base']);
  // Una revisión ya hecha saca la pieza de la lista.
  f.naming={moduleCode:'M01',bases:[],reviews:[{id:'m-lateral-izq',proposed:'Lateral',base:'Lat'}]};
  expect(nameSuggestions(f,orientation).map(s=>s.ids[0])).toEqual(['m-lateral-der','m-base']);
 });
 it('divisor interior, listón, panel grueso y frente alto o bajo',()=>{
  const f=module([
   board('div','Componente',[18,430,640],[391,10,20]),
   board('liston','Componente',[1000,100,18],[18,410,600]),
   board('cubo','Componente',[200,200,200],[300,100,100]),
   board('puerta','Componente',[390,18,680],[5,-20,10]),
   board('cajon','Componente',[390,18,150],[405,-20,10]),
  ]);
  expect(byId(f,'div')).toMatchObject({base:'Divisor',confidence:'high'});
  expect(byId(f,'liston')).toMatchObject({base:'Listón',confidence:'review'});
  expect(byId(f,'cubo')).toMatchObject({base:'Sin clasificar',confidence:'unclassified'});
  expect(byId(f,'puerta').base).toBe('Puerta');expect(byId(f,'cajon').base).toBe('Frente cajón');
 });
 // BUG-TS-05 (docs/qa/BUGS_ENCONTRADOS_TS.md): el filtro de «tablón fino» descarta los listones antes de la regla de Listón.
 it.skip('un listón de sección 40 × 18 se propone como Listón (BUG-TS-05: hoy queda «Sin clasificar»)',()=>{
  const f=module([board('liston','Componente',[764,40,18],[18,410,600])]);
  expect(byId(f,'liston')).toMatchObject({base:'Listón',confidence:'review'});
 });
 it('en un conjunto anidado bajo propone piezas de cajón',()=>{
  const drawer:RawNode={id:'caj',name:'Cajón',kind:'group',transform:new Matrix4().makeTranslation(18,0,30).toArray(),children:[
   board('caj/piso','Componente',[300,400,12],[20,20,0]),board('caj/lat','Componente',[12,400,150],[0,20,0]),
   board('caj/fte','Componente',[340,12,150],[0,0,0]),board('caj/lat2','Componente',[12,400,150],[328,20,0]),
  ]};
  const f=module([drawer]);
  expect(byId(f,'caj/piso').base).toBe('Fondo cajón');expect(byId(f,'caj/lat').base).toBe('Lateral cajón');expect(byId(f,'caj/fte').base).toBe('Frente cajón');
 });
 it('una pieza oblicua no se clasifica',()=>{
  const tilted=board('obl','Componente',[18,430,500],[300,10,100]);
  tilted.transform=new Matrix4().makeRotationZ(Math.PI/4).setPosition(300,100,100).toArray();
  expect(byId(module([tilted]),'obl')).toMatchObject({base:'Sin clasificar',confidence:'unclassified'});
 });
});

describe('Vocabulario del taller',()=>{
 it('conserva la abreviatura observada si coincide con la función',()=>{
  const f=createDemo().furniture[0];f.pieces[0].name='Lat';
  expect(byId(f,'m-lateral-izq')).toMatchObject({base:'Lat',confidence:'high'});
 });
 it('no impone una abreviatura que contradice la geometría',()=>{
  const f=createDemo().furniture[0];f.pieces[2].name='Puerta';
  const s=byId(f,'m-base');expect(s.base).toBe('Piso');expect(s.confidence).toBe('review');expect(s.reason).toContain('no se impone como función');
 });
 it('PT, Banq y Ranu nunca se expanden solos',()=>{
  const f=createDemo().furniture[0];f.pieces[0].name='PT';
  expect(byId(f,'m-lateral-izq').confidence).toBe('review');
  expect(byId(f,'m-lateral-izq',{...orientation,confirmed:false}).confidence).toBe('unclassified');
 });
 it('una corrección anterior del mismo mueble se ofrece para otra pieza del mismo rol',()=>{
  const f=createDemo().furniture[0];f.naming={moduleCode:'M01',bases:[],reviews:[{id:'m-lateral-izq',proposed:'Lateral',base:'Lat'}]};
  expect(byId(f,'m-lateral-der')).toMatchObject({base:'Lat',confidence:'review'});
  // Una corrección por posición (no es vocabulario genérico) no viaja a otra pieza.
  f.naming.reviews=[{id:'m-lateral-izq',proposed:'Lateral',base:'Lateral junto a heladera'}];
  expect(byId(f,'m-lateral-der').base).toBe('Lateral');
 });
 it('componentes iguales con funciones distintas quedan como Panel para revisar',()=>{
  const f=createDemo().furniture[0];f.groupIdentical=true;
  // Base y tapa comparten definición pero una es piso y la otra tapa.
  expect(byId(f,'m-base')).toMatchObject({base:'Panel',confidence:'review'});
  expect(byId(f,'m-base').ids).toEqual(['m-base','m-tapa']);
 });
});
