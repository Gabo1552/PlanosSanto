import {describe,expect,it} from 'vitest';
import {edgeTotals,rotationBlock,rowDimensions} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';

// 0.8.20: el pedido ya no se edita pieza por pieza (avisos por campo, equivalentes, importes y saltos a campos se
// quitaron con su pantalla). Quedan las reglas que usa la optimización por placa y el total de cantos.
const item=(patch:Partial<CatalogItem>):CatalogItem=>({id:'x',name:'Item',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},...patch});
const board=item({id:'b',name:'Blanco 18',sku:'BL18',thicknessMm:18,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:['e1']});
const e1=item({id:'e1',name:'Canto blanco',kind:'edge',sku:'CB22',widthMm:22});
const catalog=(...items:CatalogItem[]):Catalog=>({schema:1,revision:1,items:items.length?items:[board,e1]});
const geo=(lengths:number[],patch:Partial<Geometry>={}):Geometry=>({lengths,bounds:{min:[0,0,0],max:lengths},scales:[1,1,1],mirrored:false,rectangular:true,vertices:[],triangles:[],...patch});
const row=(id:string,patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:id,axes:[0,1],flipX:false,flipY:false,frontSign:1,materialId:'b',principalId:'e1',secondaryId:null,edgeMap:[1,1,0,0],grainPolicy:'locked',dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,edgeBindings:[],...patch});
const panel=geo([720,450,18]);

describe('Medidas de la pieza que van al TXT',()=>{
 it('base y altura salen de los ejes; el corte explícito manda solo si es positivo y completo',()=>{
  expect(rowDimensions(row('a'),panel)).toEqual([720,450]);
  expect(rowDimensions(row('a',{axes:[1,0]}),panel)).toEqual([450,720]);
  expect(rowDimensions(row('a',{axes:null}),panel)).toBeNull();
  expect(rowDimensions(row('a',{dimensionRule:'explicit_cut',cutBase:716,cutHeight:446}),panel)).toEqual([716,446]);
  for(const [cutBase,cutHeight] of [[716,null],[null,446],[0,446],[716,-1]])expect(rowDimensions(row('a',{dimensionRule:'explicit_cut',cutBase,cutHeight}),panel)).toBeNull();
 });
 it('girar solo con placa sin veta y cantos simétricos',()=>{
  expect(rotationBlock({edgeMap:[1,1,1,1]},board)).toBeNull();
  expect(rotationBlock({edgeMap:[0,0,0,0]},undefined)).toBeNull();
  expect(rotationBlock({edgeMap:[1,1,0,0]},undefined)).toBe('Los cantos son asimétricos: mantené la orientación (rota 0).');
  expect(rotationBlock({edgeMap:[1,1,1,1]},{...board,grain:true})).toBe('La placa tiene veta: mantené la orientación (rota 0).');
  expect(rotationBlock({edgeMap:[1,1,1,1]},{...board,grain:null})).toBe('La ficha de la placa no tiene la veta cargada: mantené la orientación (rota 0).');
 });
});

describe('Total de cantos: casos borde',()=>{
 it('ignora filas sin geometría o sin cantos y cuenta producto inexistente como sin asignar',()=>{
  const plan={rows:[row('a',{principalId:'fantasma'}),row('b',{edgeMap:[0,0,0,0]}),row('c')],geometry:{a:panel,b:panel}};
  expect(edgeTotals(plan,catalog())).toEqual({lines:[],missing:1,unassigned:1});
 });
});
