import {describe,it,expect} from 'vitest';
import {createDemo,box} from '../lib/demo';
import {nameSuggestions} from '../lib/nameSuggestions';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {presentationSchema} from '../lib/presentation';
import {orderProjection} from '../lib/orderPreview';
import {catalogComplete,catalogMissing,completeness,edgeTotals,formatMetres,materialLabel,plural} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';
describe('Sugerencias auditables de nombres',()=>{
 it('se abstiene sin frente confirmado y no cambia nombres ni geometría',()=>{
  const f=createDemo().furniture[0],before=JSON.stringify(f),suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:false},true);
  expect(suggestions.every(s=>s.confidence==='unclassified')).toBe(true);expect(JSON.stringify(f)).toBe(before);
 });
 it('sugiere laterales, piso y tapa estructurales pero deja estantes y frentes para revisión explícita',()=>{
  const f=createDemo().furniture[0],suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true},true);
  expect(suggestions.filter(s=>s.base==='Lateral')).toHaveLength(2);expect(suggestions.filter(s=>s.base==='Lateral').every(s=>s.confidence==='high')).toBe(true);
  expect(suggestions.find(s=>s.ids.includes('m-estante'))?.confidence).toBe('review');
  // 0.8.19: el piso apoyado en la base, entre laterales, es geométrico; el estante sigue en revisión.
  expect(suggestions.find(s=>s.ids.includes('m-base'))?.confidence).toBe('high');
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

describe('Reglas de biblioteca y cantos de la maderera',()=>{
 const item=(patch:Partial<CatalogItem>):CatalogItem=>({id:'x',name:'Item',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{},...patch});
 const board=item({id:'b',name:'Blanco 18',sku:'BL18',thicknessMm:18,widthMm:1830,lengthMm:2600,grain:false});
 const e1=item({id:'e1',name:'Canto blanco',kind:'edge',sku:'CB22',widthMm:22}),e2=item({id:'e2',name:'Canto fino',kind:'edge',sku:'',widthMm:15});
 const catalog:Catalog={schema:2,revision:1,items:[board,e1,e2]};
 const geo=(lengths:number[],mirrored=false):Geometry=>({lengths,bounds:{min:[0,0,0],max:lengths},scales:[1,1,1],mirrored,rectangular:true,vertices:[],triangles:[]});
 const row=(id:string,patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:id,axes:[0,1],flipX:false,flipY:false,frontSign:1,materialId:'b',principalId:'e1',secondaryId:null,edgeMap:[1,1,0,0],grainPolicy:'locked',dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,edgeBindings:[],...patch});
 it('arma rótulos sin huecos y formatea metros y medidas con coma decimal',()=>{
  expect(materialLabel(board)).toBe('Blanco 18 · BL18 · 18 mm');expect(materialLabel(item({name:'Blanco',thicknessMm:null}))).toBe('Blanco · Sin SKU · espesor sin cargar');
  expect(materialLabel(e2)).toBe('Canto fino · Sin SKU · ancho 15 mm');expect(materialLabel(item({kind:'edge',widthMm:18.5}))).toBe('Item · Sin SKU · ancho 18,5 mm');
  expect(formatMetres(1234.5)).toBe('1.234,500');expect(plural(1,'pieza','piezas')).toBe('1 pieza');expect(plural(3,'pieza','piezas')).toBe('3 piezas');
 });
 it('la ficha está completa o dice qué le falta: placa con SKU, espesor, largo, ancho y veta; canto con ancho',()=>{
  expect(catalogComplete(board)).toBe(true);expect(completeness(board)).toBe('Ficha completa');
  expect(catalogMissing(item({}))).toEqual(['SKU','espesor','largo','ancho','veta']);expect(completeness(item({sku:'X',thicknessMm:18,lengthMm:2600,widthMm:1830}))).toBe('Falta: veta');
  expect(catalogMissing({...board,grain:true})).toEqual([]);expect(catalogMissing({...board,sku:'  '})).toEqual(['SKU']);
  expect(catalogComplete(e2)).toBe(true);expect(catalogMissing(item({kind:'edge'}))).toEqual(['ancho']);expect(catalogMissing(item({kind:'unknown'}))).toEqual(['tipo']);
  const unapproved:CatalogItem={...board,approved:false},stale:CatalogItem={...item({}),approved:true};
  expect(catalogComplete(unapproved)).toBe(true);expect(catalogComplete(stale)).toBe(false);
 });
 it('suma metros de canto por SKU con la regla de Ruby y cuenta aparte lo que no se puede medir',()=>{
  const plan:Pick<OrderPlan,'rows'|'geometry'>={rows:[row('a'),row('b',{edgeMap:[0,0,1,1]}),row('c',{dimensionRule:'explicit_cut',cutBase:500,cutHeight:300,edgeMap:[1,0,2,0],secondaryId:'e2'}),row('d',{axes:null}),row('e',{principalId:null}),row('f',{include:false})],
   geometry:{a:geo([600,720,18]),b:geo([600,720,18]),c:geo([600,720,18]),d:geo([600,720,18]),e:geo([600,720,18]),f:geo([600,720,18])}};
  const totals=edgeTotals(plan,catalog),first=totals.lines.find(l=>l.id==='e1')!,second=totals.lines.find(l=>l.id==='e2')!;
  expect(first.metres).toBeCloseTo(0.6*2+0.72*2+0.5,6);expect(first.sides).toBe(5);expect(first.pieces).toBe(3);expect(first.sku).toBe('CB22');
  expect(second.metres).toBeCloseTo(0.3,6);expect(second.sku).toBe('Sin SKU');expect(totals.missing).toBe(1);expect(totals.unassigned).toBe(1);
 });
 // 0.8.20: avisos por campo, vista 2D editable, aplicar a otras, vínculos y saltos a campos se quitaron con la pantalla del pedido.
});
