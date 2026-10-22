import {describe,it,expect} from 'vitest';
import {createDemo,box} from '../lib/demo';
import {nameSuggestions} from '../lib/nameSuggestions';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {presentationSchema} from '../lib/presentation';
import {orderProjection} from '../lib/orderPreview';
import {applySummary,blockedField,bulkNotice,detailCodeWarning,edgeAmounts,edgeIncompatibility,edgeTotals,equivalentRows,formatMetres,linkEdge,materialLabel,plural,proposalNotice,proposalReview,proposalStatus,rowWarnings,type ProposalRow} from '../sketchup_offline/ui/workshopRules';
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
  // Sin canto fijo por placa: sólo cuenta que cubra el espesor, esté o no en compatibleIds.
  expect(edgeIncompatibility(e1,board,18)).toBeNull();expect(edgeIncompatibility(e2,board,18)).toBe('no cubre el espesor de 18 mm');
  expect(edgeIncompatibility(e2,{...board,compatibleIds:['e2']},22)).toBe('no cubre el espesor de 22 mm');expect(edgeIncompatibility(e2,board,15)).toBeNull();expect(edgeIncompatibility(e2,undefined,22)).toBeNull();
  expect(rowWarnings(row('a'),geo([600,720,18]),catalog)).toEqual({});
  const w=rowWarnings(row('a',{secondaryId:'e2',edgeMap:[1,2,0,0],principalId:null,grainAxis:'v',grainPolicy:'rotate'}),geo([2700,720,19.5]),catalog);
  expect(w.material?.[0]).toContain('mide 19,5 mm');expect(w.secondaryId?.[0]).toContain('no cubre el espesor');expect(w.edgeMap?.[0]).toContain('Arriba');
  expect(w.grainAxis?.[0]).toContain('intercambiá los ejes');expect(w.grainPolicy?.[0]).toContain('asimétricos');expect(w.dimensions?.[0]).toBe('Mide 2.700 × 720 mm y la placa aprobada es 2.600 × 1.830 mm.');
  expect(rowWarnings(row('a',{grainAxis:'u'}),geo([600,720,18]),{...catalog,items:[{...board,grain:true},e1]}).grainAxis).toBeUndefined();
 });
 it('reconoce piezas equivalentes por medidas ordenadas, espejado y forma',()=>{
  const source=row('a');
  const plan={rows:[source,row('b'),row('c',{axes:[1,0]}),row('d'),row('e'),row('f')],geometry:{a:geo([600,720,18]),b:geo([720.05,600,18]),c:geo([600,720,18]),d:geo([600,720,18],true),e:{...geo([600,720,18]),rectangular:false},f:geo([600,720.2,18])}};
  expect(equivalentRows(plan,source).map(r=>r.id)).toEqual(['b','c']);expect(equivalentRows({rows:plan.rows,geometry:{}},source)).toEqual([]);
 });
 it('anuncia lo que Ruby aplicó, salteó e invalidó al copiar a otras piezas',()=>{
  const base={applied:2,edgesSkipped:0,cutsSwapped:0,dimensionsSkipped:0,invalidated:{b:['materialConfirmed','edgesConfirmed'],c:['materialConfirmed']}};
  expect(applySummary(base,7)).toBe('Aplicado a 2 piezas; se invalidaron 3 confirmaciones y quedan 7 verificaciones por confirmar.');
  expect(applySummary({...base,applied:1,invalidated:{b:['grainConfirmed']}},1)).toBe('Aplicado a 1 pieza; se invalidó 1 confirmación y quedan 1 verificación por confirmar.');
  expect(applySummary({...base,invalidated:{}},0)).toBe('Aplicado a 2 piezas; no se invalidó ninguna confirmación y quedan 0 verificaciones por confirmar.');
  const all=applySummary({...base,edgesSkipped:1,cutsSwapped:2,dimensionsSkipped:1},4);
  expect(all).toContain(' Los cantos no se copiaron a 1 pieza con otros ejes, cara o inversión.');expect(all).toContain(' En 2 piezas con los ejes cruzados se intercambiaron base y altura de corte.');
  expect(all).toMatch(/ Las medidas de corte explícitas no se copiaron a 1 pieza que no es equivalente\.$/);
  expect(applySummary({...base,dimensionsSkipped:3},0)).toContain('a 3 piezas que no son equivalentes.');
 });
 it('resume la propuesta y la confirmación en bloque sin dar nada por confirmado',()=>{
  const rows:ProposalRow[]=[{id:'a',detail:'Lateral',status:'proposed',bulkReady:true,reasons:[]},{id:'b',detail:'Fondo',status:'proposed',bulkReady:false,reasons:['Largo igual al ancho: confirmá la orientación.']},{id:'c',detail:'Curva',status:'abstained',bulkReady:false,reasons:['Geometría no rectangular.']},{id:'d',detail:'Techo',status:'kept',bulkReady:false,reasons:[]}];
  expect(proposalReview(rows).map(r=>r.id)).toEqual(['b','c']);expect(proposalStatus.abstained).toBe('Sin propuesta');
  expect(proposalNotice({proposed:2,kept:1,abstained:1,bulkReady:1,review:2})).toBe('Propuesta lista: 2 piezas propuestas, 1 conservada por tener verificaciones y 1 sin propuesta. Nada quedó confirmado; 1 pieza se puede confirmar en bloque.');
  expect(proposalNotice({proposed:0,kept:0,abstained:3,bulkReady:0,review:3})).toContain('ninguna pieza se puede confirmar en bloque todavía');
  expect(bulkNotice(3,1)).toBe('Se confirmaron en bloque 3 piezas sin ambigüedad. Queda 1 pieza en revisión individual.');
  expect(bulkNotice(1,2)).toBe('Se confirmó en bloque 1 pieza sin ambigüedad. Quedan 2 piezas en revisión individual.');
  expect(bulkNotice(0,0)).toBe('No se confirmó ninguna pieza en bloque. No queda ninguna pieza en revisión individual.');
 });
 it('vincula un material de canto observado a un solo canto del borrador y lo quita sin canto',()=>{
  const links=linkEdge(undefined,'material:888','Canto de prueba','e1');expect(links).toEqual([{observedId:'material:888',catalogId:'e1',name:'Canto de prueba'}]);
  const both=linkEdge(links,'material:890','Canto secundario','e2');expect(both).toHaveLength(2);
  expect(linkEdge(both,'material:888','Canto de prueba','e2')).toEqual([{observedId:'material:890',catalogId:'e2',name:'Canto secundario'},{observedId:'material:888',catalogId:'e2',name:'Canto de prueba'}]);
  expect(linkEdge(both,'material:888','Canto de prueba','')).toEqual([{observedId:'material:890',catalogId:'e2',name:'Canto secundario'}]);expect(links).toHaveLength(1);
 });
 it('avisa si el código módulo·pieza falta o lleva el detalle a más de 80 caracteres',()=>{
  expect(detailCodeWarning('Lateral','M03·P07','none')).toBeNull();expect(detailCodeWarning('Lateral',undefined,undefined)).toBeNull();
  expect(detailCodeWarning('Lateral','M03·P07','module_piece')).toBeNull();expect(detailCodeWarning('Lateral',undefined,'module_piece')).toContain('Falta el código módulo·pieza');
  expect(detailCodeWarning('Lateral','','module_piece')).toBe('El código módulo·pieza se repite en otro mueble: corregí el módulo en la guía para que cada mueble tenga el suyo.');expect(detailCodeWarning('Lateral','','none')).toBeNull();
  expect(detailCodeWarning('x'.repeat(72),'M03·P07','module_piece')).toBeNull();
  expect(detailCodeWarning('x'.repeat(73),'M03·P07','module_piece')).toBe('Con el código M03·P07 el detalle ocupa 81 caracteres y el máximo es 80: acortalo 1 carácter.');
  expect(detailCodeWarning('ñ'.repeat(75),'M03·P07','module_piece')).toContain('ocupa 83 caracteres');expect(detailCodeWarning('ñ'.repeat(75),'M03·P07','module_piece')).toContain('acortalo 3 caracteres');
 });
 it('separa en los cantos los importes con precio desactualizado o futuro del vigente',()=>{
  const price=(currency:string)=>({currency});
  const amounts=edgeAmounts([{materialId:'e1',role:'principal_edge',amount:100,status:'current_price',price:price('ARS')},{materialId:'e1',role:'principal_edge',amount:1234,status:'stale_price',price:price('ARS')},
   {materialId:'e2',role:'secondary_edge',amount:5,status:'future_price',price:price('USD')},{materialId:'e3',role:'secondary_edge',amount:null,status:'price_pending',price:null},{materialId:'b',role:'board',amount:999,status:'current_price',price:price('ARS')}]);
  expect(amounts.get('e1')).toEqual({current:{ARS:100},outdated:{ARS:1234},pending:false});expect(amounts.get('e2')).toEqual({current:{},outdated:{USD:5},pending:false});
  expect(amounts.get('e3')?.pending).toBe(true);expect(amounts.has('b')).toBe(false);
 });
 it('lleva cada motivo de bloqueo al campo correspondiente',()=>{
  expect(blockedField('Elegí ejes U/V distintos y la cara frontal de la vista 2D.')).toBe('axes');expect(blockedField('Falta confirmar orientación, cantos.')).toBe('checks');
  expect(blockedField('Cantos asimétricos: mantener rota=0 hasta validar la maderera.')).toBe('grain');expect(blockedField('El canto no cubre el espesor de la placa: ancho 15 mm')).toBe('edges');
  expect(blockedField('La pieza no entra en el formato de placa aprobado: mide 2650 × 600 mm')).toBe('dimensions');expect(blockedField('El espesor no coincide: el eje de espesor mide 18 mm')).toBe('material');expect(blockedField('Elegí una placa aprobada de la biblioteca.')).toBe('material');
  expect(blockedField('Completá detalle y justificación de medidas de corte/terminadas.')).toBe('note');expect(blockedField('Indicá por qué se excluye esta pieza.')).toBe('exclude');
  expect(blockedField('Elegí cómo verificaste los cantos: caras observadas o inspección manual documentada.')).toBe('edgeResolution');
  expect(blockedField('El canto secundario (2) no cubre el espesor de la placa: ancho 15 mm y espesor 18 mm.')).toBe('secondaryEdge');
  expect(blockedField('Elegí un canto secundario (2) aprobado de la biblioteca.')).toBe('secondaryEdge');
  expect(blockedField('El detalle con código M03·P07 supera 80 caracteres.')).toBe('detail');expect(blockedField('Falta el código módulo·pieza: completá módulo y código de pieza en la guía.')).toBe('detail');
  expect(blockedField('El código módulo·pieza se repite en otro mueble: corregí el módulo en la guía para que cada mueble tenga el suyo.')).toBe('detail');
  expect(blockedField('Vinculá «Canto de prueba» con un canto en «Vínculos de cantos del borrador».')).toBe('links');expect(blockedField('Geometría no rectangular: verificala o excluila explícitamente.')).toBe('include');
 });
});
