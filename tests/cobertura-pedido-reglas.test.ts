import {describe,expect,it} from 'vitest';
import {blockedField,boardOf,edgeAmounts,edgeTotals,equivalentRows,rotationBlock,rowDimensions,rowThickness,rowWarnings} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';

const item=(patch:Partial<CatalogItem>):CatalogItem=>({id:'x',name:'Item',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},...patch});
const board=item({id:'b',name:'Blanco 18',sku:'BL18',thicknessMm:18,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:['e1']});
const e1=item({id:'e1',name:'Canto blanco',kind:'edge',sku:'CB22',widthMm:22});
const catalog=(...items:CatalogItem[]):Catalog=>({schema:1,revision:1,items:items.length?items:[board,e1]});
const geo=(lengths:number[],patch:Partial<Geometry>={}):Geometry=>({lengths,bounds:{min:[0,0,0],max:lengths},scales:[1,1,1],mirrored:false,rectangular:true,vertices:[],triangles:[],...patch});
const row=(id:string,patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:id,axes:[0,1],flipX:false,flipY:false,frontSign:1,materialId:'b',principalId:'e1',secondaryId:null,edgeMap:[1,1,0,0],grainPolicy:'locked',dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,edgeBindings:[],...patch});
const panel=geo([720,450,18]);

describe('Medidas que recibe la maderera',()=>{
 it('base y altura salen de los ejes elegidos; el corte explícito manda solo si es positivo y completo',()=>{
  expect(rowDimensions(row('a'),panel)).toEqual([720,450]);
  expect(rowDimensions(row('a',{axes:[1,0]}),panel)).toEqual([450,720]);
  expect(rowDimensions(row('a',{axes:null}),panel)).toBeNull();
  expect(rowDimensions(row('a',{dimensionRule:'explicit_cut',cutBase:716,cutHeight:446}),panel)).toEqual([716,446]);
  for(const [cutBase,cutHeight] of [[716,null],[null,446],[0,446],[716,-1]])expect(rowDimensions(row('a',{dimensionRule:'explicit_cut',cutBase,cutHeight}),panel)).toBeNull();
 });
 it('el espesor es el eje que no es ni base ni altura',()=>{
  expect(rowThickness(row('a'),panel)).toBe(18);expect(rowThickness(row('a',{axes:[2,0]}),panel)).toBe(450);expect(rowThickness(row('a',{axes:null}),panel)).toBeNull();
 });
 it('cualquier ficha de tipo placa cuenta como placa del pedido; la casilla aprobada ya no filtra',()=>{
  expect(boardOf(row('a'),catalog())).toBe(board);
  expect(boardOf(row('a'),catalog({...board,approved:false},e1))?.id).toBe('b');
  expect(boardOf(row('a',{materialId:'e1'}),catalog())).toBeUndefined();
  expect(boardOf(row('a',{materialId:''}),catalog())).toBeUndefined();
 });
});

describe('Avisos por fila antes de exportar el pedido',()=>{
 it('una fila excluida no genera avisos',()=>{
  expect(rowWarnings(row('a',{include:false,principalId:'borrado',materialId:''}),panel,catalog())).toEqual({});
 });
 it('placa con la ficha incompleta y canto borrado de la biblioteca',()=>{
  const w=rowWarnings(row('a',{secondaryId:'e2',edgeMap:[1,2,0,0]}),panel,catalog({...board,thicknessMm:null},e1));
  expect(w.material).toEqual(['La ficha de «Blanco 18» está incompleta: falta espesor. Completala en la biblioteca.']);
  expect(w.secondaryId).toEqual(['El canto ya no está en la biblioteca.']);
  expect(rowWarnings(row('a',{edgeMap:[1,0,0,0]}),panel,catalog(board,{...e1,widthMm:null})).principalId).toEqual(['La ficha de «Canto blanco» está incompleta: falta ancho.']);
  expect(rowWarnings(row('a',{edgeMap:[0,0,0,0],principalId:'borrado'}),panel,catalog()).principalId).toEqual(['El canto ya no está en la biblioteca.']);
 });
 it('un canto secundario usado sin producto nombra los lados afectados',()=>{
  const w=rowWarnings(row('a',{edgeMap:[1,2,2,0]}),panel,catalog());
  expect(w.edgeMap).toEqual(['Abajo, Izquierda: lleva canto secundario (2) y no hay producto asignado en ese rol.']);
 });
 it('principal y secundario iguales se marcan en el secundario',()=>{
  expect(rowWarnings(row('a',{secondaryId:'e1',edgeMap:[1,2,0,0]}),panel,catalog()).secondaryId).toContain('El canto secundario debe ser distinto del principal.');
 });
 it('la veta sale de la placa: no hay dirección que confirmar, solo una ficha sin veta definida avisa',()=>{
  const veteada=catalog({...board,grain:true},e1),lisa=catalog(),dudosa=catalog({...board,grain:null},e1);
  expect(rowWarnings(row('a'),panel,veteada)).toEqual({});expect(rowWarnings(row('a'),panel,lisa)).toEqual({});
  expect(rowWarnings(row('a'),panel,dudosa).material).toEqual(['La ficha de «Blanco 18» está incompleta: falta veta. Completala en la biblioteca.']);
 });
 it('permitir giro solo con placa sin veta y cantos simétricos',()=>{
  expect(rotationBlock({edgeMap:[1,1,1,1]},board)).toBeNull();
  expect(rotationBlock({edgeMap:[0,0,0,0]},undefined)).toBeNull();
  expect(rotationBlock({edgeMap:[1,1,0,0]},undefined)).toBe('Los cantos son asimétricos: mantené la orientación (rota 0).');
  expect(rotationBlock({edgeMap:[1,1,1,1]},{...board,grain:true})).toBe('La placa tiene veta: mantené la orientación (rota 0).');
  expect(rotationBlock({edgeMap:[1,1,1,1]},{...board,grain:null})).toBe('La ficha de la placa no tiene la veta cargada: mantené la orientación (rota 0).');
  expect(rowWarnings(row('a',{grainPolicy:'rotate',edgeMap:[1,1,1,1]}),panel,catalog()).grainPolicy).toBeUndefined();
 });
 it('una pieza que solo entra girada pasa si se permite giro y avisa si no',()=>{
  const largo=geo([1800,2500,18]);
  expect(rowWarnings(row('a',{edgeMap:[1,1,1,1]}),largo,catalog()).dimensions).toEqual(['La pieza no entra en la placa: mide 1.800 × 2.500 mm y la placa es 2.600 × 1.830 mm.']);
  expect(rowWarnings(row('a',{edgeMap:[1,1,1,1],grainPolicy:'rotate'}),largo,catalog()).dimensions).toBeUndefined();
  // Tolerancia de 0,1 mm sobre el formato de placa.
  expect(rowWarnings(row('a'),geo([2600.1,1830.1,18]),catalog()).dimensions).toBeUndefined();
  expect(rowWarnings(row('a'),geo([2600.2,1830,18]),catalog()).dimensions).toHaveLength(1);
  // Sin formato de placa cargado no se puede juzgar.
  expect(rowWarnings(row('a'),geo([5000,3000,18]),catalog({...board,lengthMm:null},e1)).dimensions).toBeUndefined();
 });
});

describe('Totales de canto, equivalentes e importes: casos borde',()=>{
 it('ignora filas sin geometría o sin cantos y cuenta producto inexistente como sin asignar',()=>{
  const plan={rows:[row('a',{principalId:'fantasma'}),row('b',{edgeMap:[0,0,0,0]}),row('c')],geometry:{a:panel,b:panel}};
  const totals=edgeTotals(plan,catalog());
  expect(totals).toEqual({lines:[],missing:1,unassigned:1});
 });
 it('equivalentes exigen geometría, mismo espejado y misma rectangularidad',()=>{
  const source=row('a');
  expect(equivalentRows({rows:[source,row('b')],geometry:{}},source)).toEqual([]);
  const plan={rows:[source,row('b'),row('c'),row('d'),row('e')],geometry:{a:panel,b:geo([18,720,450]),c:geo([720,450,18],{rectangular:false}),d:geo([720,450,18.2]),e:geo([720,450,18],{mirrored:true})}};
  expect(equivalentRows(plan,source).map(r=>r.id)).toEqual(['b']);
 });
 // Copiar a piezas equivalentes pasó a Ruby con el Hito 3 (OrderProposal#apply): lo cubre order_proposal_test.rb.
 it('los importes de canto ignoran cargos sin producto y suman monedas por separado',()=>{
  const amounts=edgeAmounts([{amount:5,status:'current_price',price:{currency:'ARS'},role:'principal_edge'},
   {materialId:'e1',role:'principal_edge',amount:10,status:'current_price',price:{currency:'ARS'}},{materialId:'e1',role:'secondary_edge',amount:2,status:'current_price',price:{currency:'USD'}},
   {materialId:'e1',role:'principal_edge',amount:7,status:'current_price',price:null}]);
  expect([...amounts.keys()]).toEqual(['e1']);expect(amounts.get('e1')).toEqual({current:{ARS:10,USD:2},outdated:{},pending:true});
 });
 it('un motivo de bloqueo desconocido no lleva a ningún campo; uno de placa lleva a Material',()=>{
  expect(blockedField('Elegí una placa de la biblioteca.')).toBe('material');
  expect(blockedField('Error inesperado del servidor.')).toBeNull();
 });
});
