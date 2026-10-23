import {describe,it,expect} from 'vitest';
import {initialKinds,suggestedSummary,typedKinds} from '../sketchup_offline/ui/maderaRules';

// 0.8.20: el perfil de maderera, el presupuesto y la variante de espesor del pedido dejaron de mostrarse; sus reglas
// de presentación se quitaron y con ellas sus pruebas. Quedan las del catálogo v2 que usa Materiales.
describe('Catálogo v2',()=>{
 it('campos sugeridos legibles con su origen',()=>{
  expect(suggestedSummary({source:'preset',fields:['lengthMm','thicknessMm','widthMm'],presetId:'x'})).toEqual({fields:'largo, espesor y ancho',source:'valores sugeridos del taller'});
  expect(suggestedSummary({source:'skm',fields:['thicknessMm'],presetId:null}).fields).toBe('espesor');
 });
 it('tipos del lote SKM: sugerencia prellenada y solo filas seleccionadas',()=>{
  const kinds=initialKinds([{id:'1',suggestions:{kind:'edge'}},{id:'2'},{id:'3',suggestions:{kind:'raro'}}]);
  expect(kinds).toEqual({'1':'edge','2':'unknown','3':'unknown'});
  expect(typedKinds(['1','3'],{...kinds,'3':'sheet'})).toEqual({'1':'edge','3':'sheet'});
 });
});
