import {describe,expect,it} from 'vitest';
import type {CatalogItem} from '../sketchup_offline/ui/WorkshopPanel';
import {copyName,filterCounts,filterItems,lockedHeight,rotateDimensions,normalizeRotation,searchText,textureRepeats} from '../sketchup_offline/ui/materialLibraryModel';

const item=(id:string,patch:Partial<CatalogItem>={}):CatalogItem=>({id,name:`Material ${id}`,kind:'sheet',sku:'',supplier:'',thicknessMm:18,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'2026-10-22T00:00:00Z',sourceHash:'0'.repeat(64),observed:{},...patch});
const items=[item('a',{name:'Roble Áspero',approved:true,sku:'R18',supplier:'Maderera Norte'}),item('b',{kind:'edge',name:'Canto roble',thicknessMm:0.45}),item('c',{kind:'unknown',name:'Herraje'}),item('d',{name:'Blanco viejo'}),item('e',{kind:'edge',name:'Canto blanco',approved:true})];
const archived=new Set(['d','e']);

describe('Filtros de la biblioteca de materiales',()=>{
 it('la búsqueda ignora acentos y mayúsculas sobre nombre, SKU, proveedor y espesor',()=>{
  expect(searchText('Áspero ROBLE')).toBe('aspero roble');
  expect(filterItems(items,{filter:'all',query:'aspero',archived}).map(row=>row.id)).toEqual(['a']);
  expect(filterItems(items,{filter:'all',query:'norte',archived}).map(row=>row.id)).toEqual(['a']);
  expect(filterItems(items,{filter:'all',query:'r18',archived}).map(row=>row.id)).toEqual(['a']);
  expect(filterItems(items,{filter:'all',query:'0.45',archived}).map(row=>row.id)).toEqual(['b']);
 });
 it('los archivados solo aparecen en el filtro Archivados',()=>{
  expect(filterItems(items,{filter:'all',query:'',archived}).map(row=>row.id).sort()).toEqual(['a','b','c']);
  expect(filterItems(items,{filter:'edge',query:'',archived}).map(row=>row.id)).toEqual(['b']);
  expect(filterItems(items,{filter:'review',query:'',archived}).map(row=>row.id).sort()).toEqual(['b','c']);
  expect(filterItems(items,{filter:'other',query:'',archived}).map(row=>row.id)).toEqual(['c']);
  expect(filterItems(items,{filter:'archived',query:'',archived}).map(row=>row.id).sort()).toEqual(['d','e']);
  expect(filterItems(items,{filter:'archived',query:'canto',archived}).map(row=>row.id)).toEqual(['e']);
 });
 it('favoritos primero y luego orden alfabético en español',()=>{
  const rows=filterItems([item('x',{name:'Zeta'}),item('y',{name:'Ála'}),item('z',{name:'Beta',favorite:true})],{filter:'all',query:'',archived:new Set()});
  expect(rows.map(row=>row.name)).toEqual(['Beta','Ála','Zeta']);
  expect(filterItems(items,{filter:'all',query:'',archived,favorites:true})).toEqual([]);
 });
 it('cuenta cada filtro sin mezclar archivados',()=>{
  expect(filterCounts(items,archived)).toEqual({all:3,sheet:1,edge:1,other:1,review:2,archived:2});
 });
});

describe('Duplicar ficha',()=>{
 it('propone un nombre de copia único sin distinguir acentos ni mayúsculas',()=>{
  expect(copyName('Roble',['Roble'])).toBe('Roble (copia)');
  expect(copyName('Roble',['Roble','ROBLE (copia)'])).toBe('Roble (copia 2)');
  expect(copyName('Roble (copia)',['Roble','Roble (copia)','Roble (copia 2)'])).toBe('Roble (copia 3)');
  expect(copyName('x'.repeat(160),[]).length).toBeLessThanOrEqual(160);
 });
});

describe('Escala y giro de textura',()=>{
 it('el candado conserva la proporción de los píxeles',()=>{
  expect(lockedHeight(600,{widthPx:2000,heightPx:1000})).toBe(300);
  expect(lockedHeight(1000,{widthPx:3,heightPx:1})).toBe(333.333);
  expect(lockedHeight(0,{widthPx:2,heightPx:1})).toBeNull();
  expect(lockedHeight(100,{widthPx:0,heightPx:1})).toBeNull();
 });
 it('girar 90/270 intercambia ancho y alto; 180 no',()=>{
  expect(normalizeRotation(-90)).toBe(270);expect(normalizeRotation(450)).toBe(90);
  expect(rotateDimensions({widthMm:600,heightMm:300},90)).toEqual({widthMm:300,heightMm:600});
  expect(rotateDimensions({widthMm:600,heightMm:300},180)).toEqual({widthMm:600,heightMm:300});
  expect(rotateDimensions({widthMm:600,heightMm:300},270)).toEqual({widthMm:300,heightMm:600});
 });
 it('repeticiones de la textura sobre el formato de la placa',()=>{
  expect(textureRepeats({widthMm:1300,heightMm:915},{lengthMm:2600,widthMm:1830})).toEqual({alongLength:2,alongWidth:2});
  expect(textureRepeats({widthMm:1000,heightMm:700},{lengthMm:2600,widthMm:1830})).toEqual({alongLength:2.6,alongWidth:2.61});
  expect(textureRepeats({widthMm:1000,heightMm:700},null)).toBeNull();
  expect(textureRepeats({widthMm:Number.NaN,heightMm:700},{lengthMm:2600,widthMm:1830})).toBeNull();
 });
});
