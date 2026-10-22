import {describe,it,expect} from 'vitest';
import {createDemo,box} from '../lib/demo';
import {nameSuggestions} from '../lib/nameSuggestions';
import {makeScene,layoutWarnings} from '../lib/scene';
import {pieceRows,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {presentationSchema} from '../lib/presentation';
import {orderProjection} from '../lib/orderPreview';
import {applySummary,blockedField,catalogComplete,catalogMissing,completeness,detailCodeWarning,edgeAmounts,edgeIncompatibility,edgeTotals,editedGroups,equivalentRows,followsModel,formatMetres,grainText,linkEdge,materialLabel,mergeNotice,plural,remapEdges,restoreProposal,rowEdgeBlockers,rowNotes,rowWarnings,sideFaces} from '../sketchup_offline/ui/workshopRules';
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

describe('Reglas del pedido a maderera (0.8.16: sin tildes)',()=>{
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
 it('avisa en vivo por campo sólo las reglas físicas que Ruby bloquea',()=>{
  // Sin canto fijo por placa: sólo cuenta que el canto no sea más angosto que el espesor.
  expect(edgeIncompatibility(e1,board,18)).toBeNull();expect(edgeIncompatibility(e2,board,18)).toBe('más angosto que el espesor de 18 mm');
  expect(edgeIncompatibility(e2,board,22)).toBe('más angosto que el espesor de 22 mm');expect(edgeIncompatibility(e2,board,15)).toBeNull();expect(edgeIncompatibility(e2,undefined,22)).toBe('más angosto que el espesor de 22 mm');
  expect(rowWarnings(row('a'),geo([600,720,18]),catalog)).toEqual({});
  const w=rowWarnings(row('a',{secondaryId:'e2',edgeMap:[1,2,0,0],principalId:null,grainPolicy:'rotate',detail:'x'.repeat(81)}),geo([2700,720,19.5]),catalog);
  expect(w.material?.[0]).toContain('mide 19,5 mm');expect(w.secondaryId?.[0]).toContain('más angosto que el espesor');expect(w.edgeMap?.[0]).toContain('Arriba');
  expect(w.grainPolicy?.[0]).toContain('asimétricos');expect(w.detail?.[0]).toContain('80 caracteres');expect(w.dimensions?.[0]).toBe('La pieza no entra en la placa: mide 2.700 × 720 mm y la placa es 2.600 × 1.830 mm.');
  const grained={...catalog,items:[{...board,grain:true},e1]};
  expect(rowWarnings(row('a',{grainPolicy:'rotate',edgeMap:[1,1,1,1]}),geo([600,720,18]),grained).grainPolicy?.[0]).toBe('La placa tiene veta: mantené la orientación (rota 0).');
  expect(rowWarnings(row('a'),geo([600,720,18]),{...catalog,items:[{...board,sku:''},e1]}).material).toEqual(['La ficha de «Blanco 18» está incompleta: falta SKU. Completala en la biblioteca.']);
  expect(rowWarnings(row('a',{materialId:''}),geo([600,720,18]),catalog).material).toEqual(['Elegí una placa de la biblioteca.']);
  expect(rowWarnings(row('a',{include:false,excludeReason:''}),geo([600,720,18]),catalog)).toEqual({});
 });
 it('la veta la decide la placa y se lee en la vista',()=>{
  expect(grainText({...board,grain:true},{axes:[1,0]})).toContain('eje Y');expect(grainText(board,{axes:[0,1]})).toBe('Placa sin veta.');expect(grainText(undefined,{axes:null})).toBe('Se define con la placa.');
 });
 it('al cambiar ejes, cara o inversión cada canto sigue en su cara física',()=>{
  const view={axes:[0,1] as [number,number],frontSign:1,flipX:false,flipY:false};
  expect(sideFaces(view,false)).toEqual(['1:1','1:0','0:0','0:1']);
  expect(remapEdges(view,{...view,flipX:true},[1,0,2,0],false)).toEqual([1,0,0,2]);
  expect(remapEdges(view,{...view,flipY:true},[1,0,2,0],false)).toEqual([0,1,2,0]);
  expect(remapEdges(view,{...view,axes:[1,0]},[1,0,2,0],false)).toEqual([0,2,1,0]);
  expect(remapEdges(view,{...view,frontSign:-1},[1,0,2,0],false)).toEqual([1,0,0,2]);
  // Otro eje de espesor: las caras de arriba y abajo son otras y quedan sin canto; el lateral sigue en su cara.
  expect(remapEdges(view,{...view,axes:[0,2]},[1,0,2,0],false)).toEqual([0,0,0,2]);
  expect(remapEdges({...view,axes:null},view,[1,0,2,0],false)).toEqual([1,0,2,0]);
 });
 it('reconoce piezas equivalentes por medidas ordenadas, espejado y forma',()=>{
  const source=row('a');
  const plan={rows:[source,row('b'),row('c',{axes:[1,0]}),row('d'),row('e'),row('f')],geometry:{a:geo([600,720,18]),b:geo([720.05,600,18]),c:geo([600,720,18]),d:geo([600,720,18],true),e:{...geo([600,720,18]),rectangular:false},f:geo([600,720.2,18])}};
  expect(equivalentRows(plan,source).map(r=>r.id)).toEqual(['b','c']);expect(equivalentRows({rows:plan.rows,geometry:{}},source)).toEqual([]);
 });
 it('anuncia lo que Ruby aplicó y salteó al copiar a otras piezas, sin confirmaciones',()=>{
  const base={applied:2,edgesSkipped:0,cutsSwapped:0,dimensionsSkipped:0};
  expect(applySummary(base)).toBe('Aplicado a 2 piezas.');expect(applySummary({...base,applied:1})).toBe('Aplicado a 1 pieza.');
  const all=applySummary({...base,edgesSkipped:1,cutsSwapped:2,dimensionsSkipped:1});
  expect(all).toContain(' Los cantos no se copiaron a 1 pieza con otros ejes, cara o inversión.');expect(all).toContain(' En 2 piezas con los ejes cruzados se intercambiaron base y altura de corte.');
  expect(all).toMatch(/ Las medidas de corte explícitas no se copiaron a 1 pieza que no es equivalente\.$/);
  expect(applySummary({...base,dimensionsSkipped:3})).toContain('a 3 piezas que no son equivalentes.');
 });
 it('la línea de base distingue lo propuesto por el modelo de lo editado a mano',()=>{
  const proposed=row('a'),plan={proposed:{a:{values:{...proposed},edgeBlockers:['La pieza tiene 3 cantos distintos pintados: el pedido admite como máximo 2 por pieza.'],notes:[{group:'edges',text:'Arriba: no se pudo leer el canto del modelo.'},{group:'orientation',text:'Instancia espejada en el modelo.'}]}}};
  expect(followsModel(plan,proposed,'edges')).toBe(true);expect(editedGroups(plan,proposed)).toEqual([]);
  expect(rowNotes(plan,proposed)).toHaveLength(2);expect(rowNotes(plan,proposed,'edges')).toEqual(['Arriba: no se pudo leer el canto del modelo.']);expect(rowEdgeBlockers(plan,proposed)).toHaveLength(1);
  const edited=row('a',{edgeMap:[1,0,0,0],detail:'A mano'});
  expect(editedGroups(plan,edited)).toEqual(['detail','edges']);expect(rowEdgeBlockers(plan,edited)).toEqual([]);expect(rowNotes(plan,edited)).toEqual(['Instancia espejada en el modelo.']);
  expect(restoreProposal(plan,edited,'edges')).toEqual({principalId:'e1',secondaryId:null,edgeMap:[1,1,0,0],edgeBindings:[]});
  expect({...edited,...restoreProposal(plan,edited)}).toEqual(proposed);
  expect(editedGroups({},edited)).toEqual([]);expect(restoreProposal({},edited)).toEqual({});
  // Girar la vista no convierte los cantos en «a mano»: el mapa sigue a las caras físicas.
  const model=row('m',{edgeMap:[1,0,2,0]}),planM={proposed:{m:{values:{...model},mirrored:false}}},turned={...model,frontSign:-1,edgeMap:remapEdges(model,{...model,frontSign:-1},model.edgeMap,false)};
  expect(turned.edgeMap).toEqual([1,0,0,2]);expect(followsModel(planM,turned,'edges')).toBe(true);expect(editedGroups(planM,turned)).toEqual(['orientation']);
  expect(followsModel(planM,{...turned,edgeMap:[1,0,2,0]},'edges')).toBe(false);
  expect(restoreProposal(planM,{...turned,edgeMap:[0,0,0,0]},'edges').edgeMap).toEqual([1,0,0,2]);
 });
 it('anuncia el cruce del borrador con la propuesta nueva sin descartarlo',()=>{
  expect(mergeNotice(null)).toBe('');expect(mergeNotice({kept:2,added:0,removed:0})).toBe('');
  expect(mergeNotice({kept:2,added:1,removed:3,stale:true})).toBe('El modelo, la biblioteca o el perfil cambiaron: el pedido se actualizó (se agregó 1 pieza nueva, se quitaron 3 piezas que ya no están, se conservaron tus cambios en 2 piezas).');
  expect(mergeNotice({kept:0,added:0,removed:0,stale:true})).toBe('El modelo, la biblioteca o el perfil cambiaron: el pedido se actualizó.');
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
 it('lleva cada problema de Ruby al campo correspondiente',()=>{
  expect(blockedField('Faltan los ejes de base y altura de la pieza: elegilos en la vista 2D.')).toBe('axes');
  expect(blockedField('Cantos asimétricos: no se puede girar la pieza; mantené la orientación (rota 0).')).toBe('grain');expect(blockedField('El canto principal (1) es más angosto que el espesor de la pieza: ancho 15 mm')).toBe('edges');
  expect(blockedField('La pieza no entra en la placa: mide 2650 × 600 mm')).toBe('dimensions');expect(blockedField('El espesor no coincide: el eje de espesor mide 18 mm')).toBe('material');expect(blockedField('Elegí una placa de la biblioteca.')).toBe('material');
  expect(blockedField('La ficha de la placa «Blanco» está incompleta: falta SKU, veta. Completala en la biblioteca.')).toBe('material');
  expect(blockedField('La ficha del canto «Fino» está incompleta: falta ancho. Completala en la biblioteca.')).toBe('edges');
  expect(blockedField('El canto secundario (2) es más angosto que el espesor de la pieza: ancho 15 mm y espesor 18 mm.')).toBe('secondaryEdge');
  expect(blockedField('Elegí un canto secundario (2) de la biblioteca.')).toBe('secondaryEdge');
  expect(blockedField('La pieza tiene 3 cantos distintos pintados (A, B, C): el pedido admite como máximo 2 por pieza (principal y secundario). Asigná los cantos a mano o repintá la pieza.')).toBe('edges');
  expect(blockedField('El detalle con código (M03·P07) supera 80 caracteres.')).toBe('detail');expect(blockedField('El detalle supera 80 caracteres: acortalo.')).toBe('detail');expect(blockedField('Falta el código módulo·pieza: completá módulo y código de pieza en la guía.')).toBe('detail');
  expect(blockedField('El código módulo·pieza se repite en otro mueble: corregí el módulo en la guía para que cada mueble tenga el suyo.')).toBe('detail');
  expect(blockedField('Arriba: vinculá «Canto de prueba» con un canto en «Cantos pintados sin vínculo».')).toBe('links');expect(blockedField('Pieza no rectangular: no se puede pedir como placa rectangular. Excluila o corregila en el modelo.')).toBe('include');
 });
});
