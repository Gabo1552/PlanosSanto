import {describe,it,expect} from 'vitest';
import {cellAmount,initialKinds,moneyTotals,profileContent,profileState,quantity,suggestedSummary,thicknessMismatch,typedKinds,variantThickness,type MaderaProfile} from '../sketchup_offline/ui/maderaRules';

const profile:MaderaProfile={id:'p1',version:3,approved:true,approvedAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',contentHash:'abc',name:'Maderera Sur',supplier:'Sur SA',trimMm:10,kerfMm:3,dimensionRule:'finished',wastePercent:15,cutPrice:null,edgingPrice:null,encoding:'utf8',decimal:'.',header:false,notes:''};
describe('Perfil de maderera en la UI',()=>{
 it('el cliente manda solo id y contenido: nunca versión, aprobación ni huella',()=>{
  const sent=profileContent(profile);
  expect(Object.keys(sent).sort()).toEqual(['cutPrice','decimal','dimensionRule','edgingPrice','encoding','header','id','kerfMm','name','notes','supplier','trimMm','wastePercent']);
  expect(sent).not.toHaveProperty('approved');expect(sent).not.toHaveProperty('version');expect(sent).not.toHaveProperty('contentHash');
 });
 // Simplificación punto 24: sin aprobación; un perfil viejo con approved se muestra igual que uno nuevo.
 it('estado legible: versión y en uso, sin aprobación',()=>{
  expect(profileState(profile,'p1')).toEqual(['v 3','En uso en pedidos']);
  expect(profileState({...profile,approved:false,version:4},null)).toEqual(['v 4']);
  const {approved:_a,approvedAt:_b,...fresh}=profile;void _a;void _b;
  expect(profileState(fresh,'p1')).toEqual(['v 3','En uso en pedidos']);
 });
});
describe('Presupuesto estimado',()=>{
 it('cantidades en formato argentino por unidad',()=>{
  expect(quantity(1.2345,'m2')).toBe('1,235 m²');expect(quantity(3,'placa')).toBe('3 placas');expect(quantity(1,'placa')).toBe('1 placa');
  expect(quantity(12.5,'metro')).toBe('12,50 m');expect(quantity(null,'placa')).toBe('Medida pendiente');
 });
 it('solo los precios vigentes cuentan; pendientes sin importe y desactualizados fuera del total',()=>{
  expect(cellAmount(1234.5,'ARS','current_price')).toEqual({text:'ARS 1.234,50',counted:true});
  expect(cellAmount(10,'ARS','stale_price')).toEqual({text:'ARS 10,00',counted:false});
  expect(cellAmount(null,'ARS','price_pending')).toEqual({text:'Pendiente',counted:false});
  expect(cellAmount(10,'ARS','size_pending')).toEqual({text:'ARS 10,00',counted:false});
  expect(cellAmount(null,'ARS','size_pending').text).toBe('Pendiente');
  expect(moneyTotals({ARS:1000,USD:2})).toBe('ARS 1.000,00 · USD 2,00');
 });
});
describe('Catálogo v2',()=>{
 it('campos sugeridos legibles con su origen',()=>{
  expect(suggestedSummary({source:'preset',fields:['lengthMm','thicknessMm','widthMm'],presetId:'x'})).toEqual({fields:'largo, espesor y ancho',source:'valores sugeridos del taller'});
  expect(suggestedSummary({source:'skm',fields:['thicknessMm'],presetId:null}).fields).toBe('espesor');
 });
 it('espesor distinto con la misma tolerancia que el aviso en vivo y redondeo de la variante',()=>{
  expect(thicknessMismatch({thicknessMm:18},18.05)).toBe(false);expect(thicknessMismatch({thicknessMm:18},15)).toBe(true);
  expect(thicknessMismatch({thicknessMm:null},15)).toBe(false);expect(thicknessMismatch(undefined,15)).toBe(false);
  // Biblioteca v4: «fuera de la lista» de la placa, que no bloquea; con 15 y 18 en la lista, ninguno lo está.
  expect(thicknessMismatch({thicknessMm:null,thicknessesMm:[15,18]},15)).toBe(false);expect(thicknessMismatch({thicknessMm:null,thicknessesMm:[15,18]},17.95)).toBe(false);
  expect(thicknessMismatch({thicknessMm:null,thicknessesMm:[15,18]},16)).toBe(true);expect(thicknessMismatch({thicknessMm:null,thicknessesMm:[]},16)).toBe(false);
  expect(variantThickness(14.999999)).toBe(15);expect(variantThickness(5.555)).toBe(5.56);
 });
 it('tipos del lote SKM: sugerencia prellenada y solo filas seleccionadas',()=>{
  const kinds=initialKinds([{id:'1',suggestions:{kind:'edge'}},{id:'2'},{id:'3',suggestions:{kind:'raro'}}]);
  expect(kinds).toEqual({'1':'edge','2':'unknown','3':'unknown'});
  expect(typedKinds(['1','3'],{...kinds,'3':'sheet'})).toEqual({'1':'edge','3':'sheet'});
 });
});
