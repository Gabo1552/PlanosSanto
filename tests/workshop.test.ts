import {describe,it,expect} from 'vitest';
import {createDemo,box} from '../lib/demo';
import {nameSuggestions} from '../lib/nameSuggestions';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {presentationSchema} from '../lib/presentation';
import {orderProjection} from '../lib/orderPreview';
import {applyEquivalent,blockedField,edgeIncompatibility,edgeTotals,equivalentRows,formatMetres,materialLabel,plural,rowWarnings} from '../sketchup_offline/ui/workshopRules';
import type {Catalog,CatalogItem,Geometry,OrderPlan,OrderRow} from '../sketchup_offline/ui/WorkshopPanel';
describe('Sugerencias auditables de nombres',()=>{
 it('se abstiene sin frente confirmado y no cambia nombres ni geometría',()=>{
  const f=createDemo().furniture[0],before=JSON.stringify(f),suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:false},true);
  expect(suggestions.every(s=>s.confidence==='unclassified')).toBe(true);expect(JSON.stringify(f)).toBe(before);
 });
 it('sugiere laterales pero deja horizontales y frentes para revisión explícita',()=>{
  const f=createDemo().furniture[0],suggestions=nameSuggestions(f,{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true},true);
  expect(suggestions.filter(s=>s.base==='Lateral')).toHaveLength(2);expect(suggestions.filter(s=>s.base==='Lateral').every(s=>s.confidence==='high')).toBe(true);
  expect(suggestions.find(s=>s.ids.includes('m-estante'))?.confidence).toBe('review');
  expect(suggestions.find(s=>s.ids.includes('m-base'))?.confidence).toBe('review');
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

describe('Reglas del pedido a maderera (UX2 taller)',()=>{
 const item=(patch:Partial<CatalogItem>):CatalogItem=>({id:'x',name:'Item',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:true,updatedAt:'',sourceHash:'',observed:{},...patch});
 const board=item({id:'b',name:'Blanco 18',sku:'BL18',thicknessMm:18,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:['e1']});
 const e1=item({id:'e1',name:'Canto blanco',kind:'edge',sku:'CB22',widthMm:22}),e2=item({id:'e2',name:'Canto fino',kind:'edge',sku:'',widthMm:15});
 const catalog:Catalog={schema:1,revision:1,items:[board,e1,e2]};
 const geo=(lengths:number[],mirrored=false):Geometry=>({lengths,bounds:{min:[0,0,0],max:lengths},scales:[1,1,1],mirrored,rectangular:true,vertices:[],triangles:[]});
 const row=(id:string,patch:Partial<OrderRow>={}):OrderRow=>({id,include:true,excludeReason:'',detail:id,axes:[0,1],flipX:false,flipY:false,frontSign:1,materialId:'b',principalId:'e1',secondaryId:null,edgeMap:[1,1,0,0],grainPolicy:'locked',grainAxis:'none',grainConfirmed:true,dimensionRule:'finished_accepted',cutBase:null,cutHeight:null,orientationConfirmed:true,materialConfirmed:true,dimensionsConfirmed:true,edgesConfirmed:true,reviewNote:'Nota',edgeResolution:'manual',edgeBindings:[],edgeOverrideReason:'',...patch});
 it('arma rótulos sin huecos y formatea metros y medidas con coma decimal',()=>{
  expect(materialLabel(board)).toBe('Blanco 18 · BL18 · 18 mm');expect(materialLabel(item({name:'Blanco',thicknessMm:null}))).toBe('Blanco · Sin SKU · espesor sin cargar');
  expect(materialLabel(e2)).toBe('Canto fino · Sin SKU · ancho 15 mm');expect(materialLabel(item({kind:'edge',widthMm:18.5}))).toBe('Item · Sin SKU · ancho 18,5 mm');
  expect(formatMetres(1234.5)).toBe('1.234,500');expect(plural(1,'pieza','piezas')).toBe('1 pieza');expect(plural(3,'pieza','piezas')).toBe('3 piezas');
 });
 it('suma metros de canto por SKU con la regla de Ruby y cuenta aparte lo que no se puede medir',()=>{
  const plan:Pick<OrderPlan,'rows'|'geometry'>={rows:[row('a'),row('b',{edgeMap:[0,0,1,1]}),row('c',{dimensionRule:'explicit_cut',cutBase:500,cutHeight:300,edgeMap:[1,0,2,0],secondaryId:'e2'}),row('d',{axes:null}),row('e',{principalId:null}),row('f',{include:false})],
   geometry:{a:geo([600,720,18]),b:geo([600,720,18]),c:geo([600,720,18]),d:geo([600,720,18]),e:geo([600,720,18]),f:geo([600,720,18])}};
  const totals=edgeTotals(plan,catalog),first=totals.lines.find(l=>l.id==='e1')!,second=totals.lines.find(l=>l.id==='e2')!;
  expect(first.metres).toBeCloseTo(0.6*2+0.72*2+0.5,6);expect(first.sides).toBe(5);expect(first.pieces).toBe(3);expect(first.sku).toBe('CB22');
  expect(second.metres).toBeCloseTo(0.3,6);expect(second.sku).toBe('Sin SKU');expect(totals.missing).toBe(1);expect(totals.unassigned).toBe(1);
 });
 it('marca cantos incompatibles y avisa por campo lo que Ruby bloquearía',()=>{
  expect(edgeIncompatibility(e1,board,18)).toBeNull();expect(edgeIncompatibility(e2,board,18)).toBe('sin compatibilidad cargada en la biblioteca');
  expect(edgeIncompatibility(e2,{...board,compatibleIds:['e2']},22)).toBe('ancho 15 mm < espesor 22 mm');expect(edgeIncompatibility(e2,undefined,22)).toBeNull();
  expect(rowWarnings(row('a'),geo([600,720,18]),catalog)).toEqual({});
  const w=rowWarnings(row('a',{secondaryId:'e2',edgeMap:[1,2,0,0],principalId:null,grainAxis:'v',grainPolicy:'rotate'}),geo([2700,720,19.5]),catalog);
  expect(w.material?.[0]).toContain('mide 19,5 mm');expect(w.secondaryId?.[0]).toContain('sin compatibilidad');expect(w.edgeMap?.[0]).toContain('Arriba');
  expect(w.grainAxis?.[0]).toContain('intercambiá los ejes');expect(w.grainPolicy?.[0]).toContain('asimétricos');expect(w.dimensions?.[0]).toBe('Mide 2.700 × 720 mm y la placa aprobada es 2.600 × 1.830 mm.');
  expect(rowWarnings(row('a',{grainAxis:'u'}),geo([600,720,18]),{...catalog,items:[{...board,grain:true},e1]}).grainAxis).toBeUndefined();
 });
 it('aplica a piezas equivalentes solo los grupos elegidos e invalida solo sus verificaciones',()=>{
  const source=row('a',{materialId:'b',principalId:'e1',edgeMap:[1,1,1,1],reviewNote:'Copiada'});
  const plan={rows:[source,row('b',{materialId:'',principalId:null,edgeMap:[0,0,0,0]}),row('c',{axes:[1,0]}),row('d')],geometry:{a:geo([600,720,18]),b:geo([720.05,600,18]),c:geo([600,720,18]),d:geo([600,720,18],true)}};
  expect(equivalentRows(plan,source).map(r=>r.id)).toEqual(['b','c']);
  const result=applyEquivalent(plan.rows,source,['b','c'],{material:true,edges:true,grain:false,dimensions:false});
  const b=result.rows[1],c=result.rows[2];expect(result.applied).toBe(2);expect(result.edgesSkipped).toBe(1);
  expect(b.materialId).toBe('b');expect(b.edgeMap).toEqual([1,1,1,1]);expect(b.materialConfirmed).toBe(false);expect(b.edgesConfirmed).toBe(false);expect(b.edgeResolution).toBeNull();
  expect(b.orientationConfirmed).toBe(true);expect(b.dimensionsConfirmed).toBe(true);expect(b.reviewNote).toBe('Nota');
  expect(c.edgeMap).toEqual([1,1,0,0]);expect(c.edgesConfirmed).toBe(true);expect(result.rows[3]).toBe(plan.rows[3]);
 });
 it('lleva cada motivo de bloqueo al campo correspondiente',()=>{
  expect(blockedField('Elegí ejes U/V distintos y la cara frontal de la vista 2D.')).toBe('axes');expect(blockedField('Falta confirmar orientación, cantos.')).toBe('checks');
  expect(blockedField('Cantos asimétricos: mantener rota=0 hasta validar la maderera.')).toBe('grain');expect(blockedField('El canto no cubre el espesor de la placa: ancho 15 mm')).toBe('edges');
  expect(blockedField('La pieza no entra en el formato de placa aprobado: mide 2650 × 600 mm')).toBe('dimensions');expect(blockedField('El espesor no coincide: el eje de espesor mide 18 mm')).toBe('material');
  expect(blockedField('Completá detalle y justificación de medidas de corte/terminadas.')).toBe('note');expect(blockedField('Indicá por qué se excluye esta pieza.')).toBe('exclude');
  expect(blockedField('Elegí cómo verificaste los cantos: caras observadas o inspección manual documentada.')).toBe('edgeResolution');
 });
});
