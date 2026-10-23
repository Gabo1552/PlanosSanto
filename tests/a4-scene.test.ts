import {describe,it,expect} from 'vitest';
import {createDemo} from '../lib/demo';
import {applyEdit,toEdit} from '../lib/model';
import {makeScene,guideViews,sheetView,layoutWarnings} from '../lib/scene';
import {presentationSchema} from '../lib/presentation';
import {sheetEntries} from '../lib/sheet';
function guide(){const f=createDemo().furniture[0];f.presentation={guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}};return f;}
describe('Guías A4 configurables: representación separada de geometría',()=>{
 it('ensambla ambas vistas y preserva transforms, medidas y despiece legado',()=>{
  const f=guide(),before=JSON.stringify(f);for(const view of ['front','back'] as const){const s=makeScene(f,{view});expect([...s.offsets.values()].every(v=>v.length()===0)).toBe(true);for(const p of f.pieces)expect(s.transforms.get(p.id)?.toArray()).toEqual(p.transform);}
  expect(JSON.stringify(f)).toBe(before);const legacy={...f,presentation:{}};expect([...makeScene(legacy).offsets.values()].some(v=>v.length()>0)).toBe(true);
 });
 it('ofrece una exterior, una interior o dos vistas con ancho A4 adaptable',()=>{
  const f=guide();expect(guideViews(f)).toEqual(['front','back']);expect(sheetView(f).width).toBe(320);
  f.presentation!.guide!.mode='interior';expect(guideViews(f)).toEqual(['back']);expect(sheetView(f).width).toBe(640);
  f.presentation!.guide!.mode='exterior';expect(guideViews(f)).toEqual(['front']);
 });
 it('oculta una ruta física anidada sin ocultar otra instancia de igual definición ni quitar filas',()=>{
  const f=guide(),left=f.pieces[0],right=f.pieces[1];expect(left.definition).toBe(right.definition);f.presentation!.guide!.hiddenPieceIds=[left.id];const before=JSON.stringify(f);
  expect(makeScene(f,{view:'front'}).faces.some(face=>face.pieceId===left.id)).toBe(true);
  const interior=makeScene(f,{view:'back'});expect(interior.faces.some(face=>face.pieceId===left.id)).toBe(false);expect(interior.faces.some(face=>face.pieceId===right.id)).toBe(true);expect(interior.labels.some(label=>label.pieceId===left.id)).toBe(false);expect(interior.dimensions.some(d=>d.pieceId===left.id)).toBe(false);
  expect(f.pieces).toHaveLength(6);expect(JSON.stringify(f)).toBe(before);f.presentation!.guide!.hiddenPieceIds=[];expect(makeScene(f,{view:'back'}).faces.some(face=>face.pieceId===left.id)).toBe(true);
 });
 // Planos (0.8.20): with a shared orientation the interior uses the exterior camera; it looks from the front too.
 it('comparte orientación (interior desde el mismo frente), zoom y encuadre aunque se oculte la pieza extrema',()=>{
  const f=guide();f.presentation!.cameras={front:{yaw:49,pitch:27},back:{yaw:-25,pitch:64}};f.presentation!.guide!.hiddenPieceIds=[f.pieces[0].id];f.zoom=1.12;
  const exterior=makeScene(f),interior=makeScene(f,{view:'back'}),whole=makeScene({...f,presentation:{...f.presentation,guide:{...f.presentation!.guide!,hiddenPieceIds:[]}}},{view:'back'});
  expect(interior.camera.forward.distanceTo(exterior.camera.forward)).toBeLessThan(1e-9);expect(interior.scale).toBe(whole.scale);expect(interior.cx).toBe(whole.cx);expect(interior.cy).toBe(whole.cy);
  f.presentation!.guide!.sharedCamera=false;expect(makeScene(f,{view:'back'}).camera.forward.toArray()).not.toEqual(exterior.camera.forward.toArray());
 });
 it('interior independiente parte de la misma orientación exterior sin un giro implícito de 180 grados',()=>{
  const f=guide();f.presentation!.guide!.sharedCamera=false;f.presentation!.cameras={front:{yaw:36,pitch:28},back:{yaw:36,pitch:28}};
  expect(makeScene(f,{view:'back'}).camera.forward.toArray()).toEqual(makeScene(f,{view:'front'}).camera.forward.toArray());
 });
 it('avisa sobre notas ancladas a piezas ocultas y bloquea interiores vacíos',()=>{
  const f=guide();f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0],position:[100,100],text:'Fijar aquí'}];f.presentation!.guide!.hiddenPieceIds=f.pieces.map(p=>p.id);
  expect(makeScene(f,{view:'front'}).notes).toHaveLength(1);const interior=makeScene(f,{view:'back'});expect(interior.notes).toHaveLength(0);expect(interior.warnings.join()).toMatch(/anotaciones ancladas/);expect(interior.warnings.join()).toMatch(/no tiene piezas visibles/);expect(layoutWarnings(f).join()).toMatch(/Interior/);
 });
 it('persiste cámara, visibilidad y observaciones por mueble validando IDs y duplicados',()=>{
  const p=createDemo(),f=p.furniture[0];f.presentation={...guide().presentation,cameras:{front:{yaw:61,pitch:40}}};f.presentation!.guide!.hiddenPieceIds=[f.pieces[0].id];f.presentation!.guide!.observations='Presentar sin pegar.';
  const edit=toEdit(p),saved=applyEdit(p,edit);expect(saved.furniture[0].presentation).toEqual(f.presentation);expect(sheetEntries(saved.furniture[0]).join()).toContain('Presentar sin pegar.');
  edit.furniture[0].presentation!.guide!.hiddenPieceIds=['foreign/path'];expect(()=>applyEdit(p,edit)).toThrow(/ruta de instancia desconocida/);
  expect(presentationSchema.safeParse({guide:{...f.presentation!.guide,hiddenPieceIds:['same','same']}}).success).toBe(false);
 });
});

describe('Bajo mesada de 17 piezas SINTÉTICO, no confundir con el SKP privado',()=>{
 it('conserva las 17 ocurrencias, los cajones anidados y ambas puertas en el listado aunque se oculten',async()=>{
  const {createA4Demo}=await import('../lib/a4Demo');const {groupedNameIssues}=await import('../lib/pieceGroups');const p=createA4Demo(),f=p.furniture[0];expect(p.source).toBe('demo');expect(p.name).toContain('SINTÉTICA');expect(f.pieces).toHaveLength(17);expect(f.pieces.filter(piece=>piece.id.includes('/drawer-'))).toHaveLength(9);expect(groupedNameIssues(f)).toEqual([]);
  const before=JSON.stringify(p),exterior=makeScene(f,{layout:'sheet'}),interior=makeScene(f,{layout:'sheet',view:'back'});
  expect(exterior.labels).toHaveLength(8);expect(interior.labels).toHaveLength(7);expect(exterior.labels.reduce((n,label)=>n+(label.quantity||1),0)).toBe(17);expect(interior.labels.reduce((n,label)=>n+(label.quantity||1),0)).toBe(15);expect(makeScene(f).labels).toHaveLength(17);expect(exterior.faces.filter(face=>face.pieceId.includes('/door-')).length).toBeGreaterThan(0);expect(interior.faces.some(face=>face.pieceId.includes('/door-'))).toBe(false);
  // Since 0.8.19 equal measures are drawn once and overlaps are resolved: every cota fits.
  expect(JSON.stringify(p)).toBe(before);expect(layoutWarnings(f).join()).not.toMatch(/cotas/i);
 });
});

it('agrupa etiquetas impresas por tipo y cuenta visibles sin cambiar el código si se oculta su representante',async()=>{
 const {createA4Demo}=await import('../lib/a4Demo');const {pieceCodeMap}=await import('../lib/pieceGroups');const f=createA4Demo().furniture[0],representative=f.pieces.find(p=>p.id==='DEMO17/drawer-1/side-left')!,code=pieceCodeMap(f).get(representative.id)!;
 f.presentation!.guide!.hiddenPieceIds.push(representative.id);const before=JSON.stringify(f),interior=makeScene(f,{view:'back',layout:'sheet'}),group=interior.labels.find(label=>label.code===code)!;
 expect(group.quantity).toBe(5);expect(group.pieceId).not.toBe(representative.id);expect(interior.labels.filter(label=>label.code===code)).toHaveLength(1);expect(interior.labels.reduce((n,label)=>n+(label.quantity||1),0)).toBe(14);expect(f.pieces.filter(p=>p.definition===representative.definition)).toHaveLength(6);expect(makeScene(f,{view:'back'}).labels).toHaveLength(14);expect(sheetEntries(f).join()).toContain('instancias visibles');expect(JSON.stringify(f)).toBe(before);
});
