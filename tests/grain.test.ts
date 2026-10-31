import {describe,it,expect} from 'vitest';
import {optimizeBoards,type BoardGroup,type CutSettings} from '../sketchup_offline/ui/sheetOptimizer';
import {grainBaseBlock,rowDimensions} from '../sketchup_offline/ui/workshopRules';
import {grainCell,grainNotice,type CutlistPiece} from '../sketchup_offline/ui/cutlistModel';
import {createDemo} from '../lib/demo';
import {identicalGroups} from '../lib/pieceGroups';
import type {Catalog,CatalogItem,Geometry,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';

// 0.8.26 · Veta por pieza. Largo = medida a lo largo de la veta: la misma base que el TXT (rowDimensions) es la que el
// optimizador pone a lo largo de la placa, y con veta la pieza nunca se gira. Datos sintéticos.
const item=(patch:Partial<CatalogItem>&{id:string;kind:string}):CatalogItem=>({name:patch.id,sku:`SKU-${patch.id}`,supplier:'Prueba',thicknessMm:18,widthMm:1830,lengthMm:2750,grain:true,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},...patch});
const catalog:Catalog={schema:2,revision:1,items:[item({id:'roble',kind:'sheet'}),item({id:'canto',kind:'edge',widthMm:22,thicknessMm:0.45,grain:null})]};
const row=(id:string,axes:[number,number],patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:`Puerta ${id}`,axes,flipX:false,flipY:false,frontSign:1,materialId:'roble',principalId:'canto',secondaryId:null,edgeMap:[1,0,0,0],grainPolicy:'locked',dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,edgeBindings:[],...patch});
// Puerta de 2000 × 600: local 600 en X, 18 en Y, 2000 en Z. grainAxis lo manda Ruby (Grain) en la geometría del pedido.
const door=(grainAxis:number,height=2000):Geometry&{grainAxis:number}=>({lengths:[600,18,height],bounds:{min:[0,0,0],max:[600,18,height]},scales:[1,1,1],mirrored:false,rectangular:true,vertices:[],triangles:[],grainAxis});
const groups:BoardGroup[]=[{key:'roble|180',materialId:'roble',name:'Roble',sku:'SKU-roble',thicknessMm:18,rowIds:['a']}];
const general:CutSettings={trimMm:10,kerfMm:4,allowRotate:true};
const experto:CutSettings={method:'experto',trimMm:10,kerfMm:4.4,allowRotate:true};

describe('Veta por pieza en la optimización (General y Experto)',()=>{
 it('veta vertical: 2000 a lo largo de la placa, 600 a lo ancho, sin girar',()=>{
  const r=row('a',[2,0]),geometry=door(2);
  expect(rowDimensions(r,geometry)).toEqual([2000,600]);expect(grainBaseBlock(r,geometry,catalog.items[0])).toBeNull();
  for(const cut of [general,experto]){
   const m=optimizeBoards({rows:[r],geometry:{a:geometry}},catalog,groups,cut).materials[0];
   expect(m.status).toBe('ok');expect(m.rotatable).toBe(0);expect(m.legend[0]).toMatchObject({base:2000,height:600});
   expect(m.sheets[0].placements[0]).toMatchObject({id:'a',w:2000,h:600,rotated:false});
  }
 });
 it('veta girada a lo ancho: el largo es 600; 2000 a través de una placa de 1830 no entra (igual que el TXT)',()=>{
  const r=row('a',[0,2]),geometry=door(0);
  expect(rowDimensions(r,geometry)).toEqual([600,2000]);
  expect(optimizeBoards({rows:[r],geometry:{a:geometry}},catalog,groups,general).materials[0].oversize.map(o=>[o.base,o.height])).toEqual([[600,2000]]);
  const blocked=optimizeBoards({rows:[r],geometry:{a:geometry}},catalog,groups,experto).materials[0];
  expect(blocked.status).toBe('blocked');expect(blocked.sheets).toEqual([]);
  // Una puerta de 1500 con la veta girada sí entra: 600 a lo largo de la placa, sin girar.
  const shorter=optimizeBoards({rows:[r],geometry:{a:door(0,1500)}},catalog,groups,general).materials[0];
  expect(shorter.sheets[0].placements[0]).toMatchObject({w:600,h:1500,rotated:false});
 });
 it('una base que no sigue la veta de la pieza no se ubica y dice por qué',()=>{
  const r=row('a',[0,2]),geometry=door(2);
  expect(grainBaseBlock(r,geometry,catalog.items[0])).toMatch(/no sigue su veta/);
  expect(grainBaseBlock(r,geometry,{grain:false})).toBeNull();expect(grainBaseBlock(r,{lengths:[1,1,1]},catalog.items[0])).toBeNull();
  const m=optimizeBoards({rows:[r],geometry:{a:geometry}},catalog,groups,general).materials[0];
  expect(m).toMatchObject({pieces:0,unsized:1});expect(m.sheets).toEqual([]);expect(m.errors?.[0]).toMatch(/^Puerta a: La base de la pieza no sigue su veta/);
 });
});

const piece=(patch:Partial<CutlistPiece>):CutlistPiece=>({id:'1/1',ids:['1/1'],code:'',codes:[],name:'Puerta',furnitureId:'1',furnitureName:'Placard',quantity:1,lengthMm:2000,widthMm:600,thicknessMm:18,rectangular:true,mirrored:false,material:null,sectionKey:'k',edges:[],strips:[],grain:'length',notes:[],...patch});
describe('Columna Veta de Piezas',()=>{
 it('↕ vertical o ↔ horizontal, auto o manual, con el aviso y el bloqueo de la fila',()=>{
  expect(grainCell(piece({grainAxis:2,grainSource:'auto',grainDirection:'vertical'}))).toEqual({symbol:'↕',direction:'vertical',source:'auto',label:'Veta vertical (a lo largo, automática)',review:null,block:null});
  expect(grainCell(piece({grainAxis:0,grainSource:'manual',grainDirection:'horizontal',grainReview:null,grainBlock:'La pieza o un contenedor está bloqueado.'})))
   .toMatchObject({symbol:'↔',source:'manual',label:'Veta horizontal (a lo largo, elegida a mano)',block:'La pieza o un contenedor está bloqueado.'});
  expect(grainCell(piece({grainAxis:2,grainSource:'auto',grainDirection:'vertical',grainReview:'Largo igual al ancho'}))?.review).toBe('Largo igual al ancho');
  expect(grainCell(piece({grain:'none'}))).toBeNull();expect(grainCell(piece({grain:null}))).toBeNull();
 });
 it('aviso después de girar o volver a automática',()=>{
  expect(grainNotice('rotate',2)).toBe('Veta girada 90° en 2 piezas. Ctrl+Z en SketchUp lo deshace.');
  expect(grainNotice('auto',1,['Se hizo único el componente de 1 pieza para no cambiar la veta de las otras apariciones.'])).toBe('Veta automática en 1 pieza. Ctrl+Z en SketchUp lo deshace. Se hizo único el componente de 1 pieza para no cambiar la veta de las otras apariciones.');
 });
});

describe('Piezas iguales con veta distinta',()=>{
 it('no se agrupan en la guía: la veta es parte de la firma',()=>{
  const f=createDemo().furniture[0];f.pieces=f.pieces.slice(0,1);
  const twin={...f.pieces[0],id:`${f.pieces[0].id}-b`,metadata:{...f.pieces[0].metadata!,grainAxis:0}};
  f.pieces=[{...f.pieces[0],metadata:{...f.pieces[0].metadata!,grainAxis:2}},twin];
  expect(identicalGroups(f).map(g=>g.length)).toEqual([1,1]);
  f.pieces[1]={...twin,metadata:{...twin.metadata!,grainAxis:2}};
  expect(identicalGroups(f).map(g=>g.length)).toEqual([2]);
 });
});
