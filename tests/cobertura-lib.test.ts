import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box,createDemo} from '../lib/demo';
import {applyEdit,identity,importDocument,mm,toEdit,type Furniture,type NodeMetadata,type RawDocument,type RawNode} from '../lib/model';
import {fullPieceName,moduleFromName,namingIssues,normalizeNaming,withNaming} from '../lib/naming';
import {groupedNameIssues,pieceCodeMap,pieceRows,renamePieceGroup,synchronizeGroupedNames} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {orderProjection} from '../lib/orderPreview';
import {diagramViewport} from '../lib/diagramViewport';
import {makeScene} from '../lib/scene';
import {fail,limitedBody,sameOrigin,BodyLimitError} from '../lib/http';
import release from '../sketchup_offline/version.json';

function node(id:string,size:[number,number,number],extra:Partial<RawNode>={}):RawNode{
 return {id,name:id,kind:'component',definition:size.join('x'),transform:identity(),mesh:box(...size),children:[],...extra};
}
function doc(children:RawNode[],root:Partial<RawNode>={}):RawDocument{
 return {version:1,units:'mm',name:'Prueba',furniture:[{id:'raiz',name:'Mueble',kind:'group',transform:identity(),children,...root}]};
}
function meta(extra:Partial<NodeMetadata>={}):NodeMetadata{
 return {persistentId:'1',instancePath:['1'],originalName:'',definitionName:'',hidden:false,effectiveVisible:true,tag:'',material:null,worldTransform:identity(),warnings:[],...extra};
}
const lateral=(id='lat',extra:Partial<RawNode>={})=>node(id,[18,450,700],extra);

describe('Importación: medidas que llegan al plano y al pedido',()=>{
 it('ordena largo ≥ ancho ≥ espesor y numera P01… en orden de recorrido',()=>{
  const project=importDocument(doc([node('a',[450,18,700]),node('b',[18,700,450])]),'demo');
  const [a,b]=project.furniture[0].pieces;
  expect(a.dimensions).toEqual([700,450,18]);expect(b.dimensions).toEqual([700,450,18]);
  expect([a.code,b.code]).toEqual(['P01','P02']);
  expect(project.revision).toBe(0);expect(project.importedDocument).toBeUndefined();
 });
 it('aplica la escala de la instancia a cada eje local antes de ordenar',()=>{
  const scaled=lateral('s',{transform:new Matrix4().makeScale(2,1,0.5).toArray()});
  expect(importDocument(doc([scaled]),'demo').furniture[0].pieces[0].dimensions).toEqual([450,350,36]);
 });
 it('convierte pulgadas a mm también en la referencia del mueble',()=>{
  const d=doc([node('p',[1,10,20])],{transform:new Matrix4().makeTranslation(1,2,3).toArray()});d.units='in';
  const f=importDocument(d,'demo').furniture[0];
  expect(f.pieces[0].dimensions.map(v=>Number(v.toFixed(6)))).toEqual([508,254,25.4]);
  f.referenceTransform!.slice(12,15).forEach((v,i)=>expect(v).toBeCloseTo([25.4,50.8,76.2][i],9));
 });
 it('conserva el documento importado solo para el origen Ruby',()=>{
  expect(importDocument(doc([lateral()]),'sketchup-ruby').importedDocument?.name).toBe('Prueba');
 });
 it('nombra piezas y muebles sin nombre con valores de reemplazo',()=>{
  const f=importDocument(doc([lateral('x',{name:'  '})],{name:''}),'demo').furniture[0];
  expect(f.pieces[0].name).toBe('Pieza 1');expect(f.name).toBe('Mueble sin nombre');
 });
 // BUG-TS-04 (docs/qa/BUGS_ENCONTRADOS_TS.md): el nombre del mueble no se recorta como el de la pieza.
 it.skip('un mueble con nombre solo de espacios recibe el nombre de reemplazo (BUG-TS-04)',()=>{
  expect(importDocument(doc([lateral()],{name:'   '}),'demo').furniture[0].name).toBe('Mueble sin nombre');
 });
 it('avisa piezas gruesas, cuadradas, ocultas, no rectangulares y grupos con subgrupos sin duplicar avisos',()=>{
  const thick=node('cubo',[100,100,100],{children:[lateral('hijo')],metadata:meta({effectiveVisible:false,rectangular:false,warnings:['Aviso de Ruby','Aviso de Ruby']})});
  const w=importDocument(doc([thick]),'demo').furniture[0].pieces[0].warnings;
  expect(w).toEqual(['Aviso de Ruby','Pieza oculta o en etiqueta no visible: incluida para revisión.','Forma no rectangular: medidas de caja local; verificar en SketchUp.',
   'Confirmar orientación: la geometría no parece un tablón fino.','Largo y ancho equivalentes; se informan ejes locales ordenados.','Grupo con geometría propia y subgrupos: revisar clasificación.']);
 });
 it('descarta el aviso «Instancia sin nombre» solo si la definición tiene nombre',()=>{
  const warning='Instancia sin nombre: se usa la definición.';
  const named=importDocument(doc([lateral('a',{metadata:meta({definitionName:'Lateral',warnings:[warning]})})]),'demo').furniture[0].pieces[0];
  const unnamed=importDocument(doc([lateral('a',{metadata:meta({definitionName:'  ',warnings:[warning]})})]),'demo').furniture[0].pieces[0];
  expect(named.warnings).toEqual([]);expect(unnamed.warnings).toEqual([warning]);expect(named.metadata?.definitionName).toBe('Lateral');
 });
 it('rechaza medidas declaradas por Ruby que difieren de la geometría en más de 0,1 mm',()=>{
  expect(()=>importDocument(doc([lateral('a',{metadata:meta({dimensionsMm:[700.05,450,18]})})]),'demo')).not.toThrow();
  expect(()=>importDocument(doc([lateral('a',{metadata:meta({dimensionsMm:[700.2,450,18]})})]),'demo')).toThrow('Las medidas declaradas por la extensión difieren de la geometría.');
 });
 it('rechaza errores de exportación, materiales desalineados y modelos sin piezas',()=>{
  expect(()=>importDocument(doc([lateral('a',{metadata:meta({errors:['Sólido roto.']})})]),'demo')).toThrow('Sólido roto.');
  const mismatch=lateral('a');mismatch.mesh!.faceMaterials=[{front:null,back:null}];
  expect(()=>importDocument(doc([mismatch]),'demo')).toThrow('Los materiales no corresponden a los triángulos.');
  expect(()=>importDocument(doc([{...lateral('g'),mesh:undefined}]),'demo')).toThrow('El mueble «Mueble» no tiene piezas con geometría.');
 });
 it('rechaza transformaciones no afines, anidamiento excesivo y geometría degenerada o fuera de rango',()=>{
  const projective=identity();projective[3]=0.1;
  expect(()=>importDocument(doc([lateral('a',{transform:projective})]),'demo')).toThrow('Transformación no afín.');
  let deep:RawNode=lateral('hoja');for(let i=0;i<25;i++)deep={...node(`n${i}`,[1,1,1]),mesh:undefined,children:[deep]};
  expect(()=>importDocument(doc([deep]),'demo')).toThrow('El anidamiento supera 24 niveles.');
  const flat=lateral('a');flat.mesh!.vertices[2]=[...flat.mesh!.vertices[1]];
  expect(()=>importDocument(doc([flat]),'demo')).toThrow(/degenerados|Índices/);
  expect(()=>importDocument(doc([node('mini',[0.001,10,10])]),'demo')).toThrow('Dimensiones fuera de rango');
  expect(()=>importDocument(doc([node('enorme',[200000,10,10])]),'demo')).toThrow('Dimensiones fuera de rango');
 });
 it('rechaza un mueble de más de 500 piezas',()=>{
  // Cada grupo admite hasta 500 hijos: dos subgrupos suman 501 piezas en un mueble.
  const half=(n:number,from:number)=>({...node(`g${from}`,[1,1,1]),kind:'group' as const,mesh:undefined,children:Array.from({length:n},(_,i)=>lateral(`p${from+i}`))});
  expect(()=>importDocument(doc([half(250,0),half(251,250)]),'demo')).toThrow('Un mueble supera 500 piezas.');
 });
});

describe('Edición: renombrar y ocultar sin tocar medidas',()=>{
 it('toEdit completa opciones por defecto y applyEdit sube la revisión',()=>{
  const p=createDemo(),edit=toEdit(p);
  expect(edit.furniture[0]).toMatchObject({groupIdentical:false,hiddenDimensions:[],presentation:{}});
  const next=applyEdit(p,edit);expect(next.revision).toBe(1);expect(p.revision).toBe(0);
 });
 it('valida cotas ocultas, piezas ocultas y cotas movidas contra las piezas del mueble',()=>{
  const p=createDemo(),id=p.furniture[0].pieces[0].id;
  const ok=toEdit(p);ok.furniture[0].hiddenDimensions=[{pieceId:id,role:'largo'}];ok.furniture[0].presentation={guide:{mode:'both',hiddenPieceIds:[id],sharedCamera:true,observations:''},dimensionOffsets:[{pieceId:id,role:'ancho',view:'front',offset:[0.1,0]}]};ok.furniture[0].groupIdentical=true;
  const updated=applyEdit(p,ok).furniture[0];
  expect(updated.hiddenDimensions).toEqual([{pieceId:id,role:'largo'}]);expect(updated.presentation?.guide?.hiddenPieceIds).toEqual([id]);expect(updated.groupIdentical).toBe(true);
  const bad=(change:(e:ReturnType<typeof toEdit>)=>void)=>{const e=toEdit(p);change(e);return ()=>applyEdit(p,e);};
  expect(bad(e=>{e.furniture[0].hiddenDimensions=[{pieceId:'x',role:'largo'}];})).toThrow('Una cota oculta apunta a una pieza desconocida.');
  expect(bad(e=>{e.furniture[0].presentation={guide:{mode:'both',hiddenPieceIds:['x'],sharedCamera:true,observations:''}};})).toThrow('ruta de instancia desconocida');
  expect(bad(e=>{e.furniture[0].presentation={dimensionOffsets:[{pieceId:'x',role:'largo',view:'back',offset:[0,0]}]};})).toThrow('Una cota movida apunta a una pieza desconocida.');
  expect(bad(e=>{e.furniture[0].pieces[0].id='otra';})).toThrow('Pieza desconocida.');
  expect(bad(e=>{e.furniture[0].pieces[1].id=e.furniture[0].pieces[0].id;})).toThrow('Piezas inconsistentes.');
  expect(bad(e=>{e.furniture.pop();})).toThrow('No se puede alterar la estructura del modelo.');
  expect(bad(e=>{e.furniture[1].id=e.furniture[0].id;})).toThrow('No se puede alterar la estructura del modelo.');
  expect(bad(e=>{const n={id:crypto.randomUUID(),pieceId:id,anchor:[1,1,1] as [number,number,number],position:[100,100] as [number,number],text:'x'};e.furniture[0].notes=[n,n];})).toThrow('Notas duplicadas.');
 });
 it('mm usa coma decimal y punto de miles del formato argentino, con hasta 2 decimales',()=>{
  expect(mm(1234.5)).toBe('1.234,5');expect(mm(18)).toBe('18');expect(mm(0.125)).toBe('0,13');expect(mm(764.004)).toBe('764');
 });
});

describe('Nombres de taller: obra, módulo y base',()=>{
 it('detecta el módulo M## como palabra suelta',()=>{
  expect(moduleFromName('Bajo M04')).toBe('M04');expect(moduleFromName('m7 alacena')).toBe('M7');expect(moduleFromName('Módulo·M123·cocina')).toBe('M123');
  for(const name of ['BM01','M01A','M1234','Mueble'])expect(moduleFromName(name)).toBe('');
 });
 it('el nombre completo solo lleva prefijo si hay código de obra',()=>{
  expect(fullPieceName('VF','M01','Lateral')).toBe('VF M01 Lateral');expect(fullPieceName('','M01','Lateral')).toBe('Lateral');
  expect(fullPieceName('VF','','Lateral')).toBe('VF Lateral');
 });
 it('withNaming separa nombres importados que ya traen obra y módulo, y respeta nameBase de Ruby',()=>{
  const f=createDemo().furniture[0];
  f.pieces[0].name='AB M09 Lateral izquierdo';f.pieces[0].metadata={...meta({originalName:'AB M09 Lateral izquierdo'})};
  f.pieces[1].metadata={...meta({originalName:f.pieces[1].name,nameBase:'Lat der'})};
  const named=withNaming(f,'VF','M01');
  expect(named.pieces[0].name).toBe('VF M01 Lateral izquierdo');expect(named.pieces[1].name).toBe('VF M01 Lat der');
  expect(named.naming?.bases[0]).toEqual({id:f.pieces[0].id,base:'Lateral izquierdo'});
  // Sin obra no se tocan los nombres de origen.
  expect(withNaming(f,'','M01').pieces[0].name).toBe('AB M09 Lateral izquierdo');
 });
 it('una edición de grupo renombra a todos sus miembros y descarta revisiones de piezas inexistentes',()=>{
  const f=createDemo().furniture[0];f.groupIdentical=true;f.naming={moduleCode:'M01',bases:[],reviews:[{id:f.pieces[0].id,proposed:'Lateral',base:'Lat'},{id:'borrada',proposed:'x',base:'x'}]};
  const named=withNaming(f,'VF','M01',{id:f.pieces[1].id,base:'Lateral'});
  expect(named.pieces.slice(0,2).map(p=>p.name)).toEqual(['VF M01 Lateral','VF M01 Lateral']);
  expect(named.naming?.reviews?.map(r=>r.id)).toEqual([f.pieces[0].id]);
 });
 it('normalizeNaming limpia espacios y Unicode en bases y nombre de grupo',()=>{
  const f=createDemo().furniture[0];f.groupName='  Bajo   mesada ';f.naming={moduleCode:'M02',bases:[{id:f.pieces[0].id,base:' Latéral   izq '}]};
  const n=normalizeNaming(f,'VF');
  expect(n.groupName).toBe('Bajo mesada');expect(n.name).toBe('Bajo mesada');expect(n.pieces[0].name).toBe('VF M02 Lat\u00e9ral izq');expect(n.naming!.bases[0].base.normalize('NFC')).toBe(n.naming!.bases[0].base);
 });
 it('namingIssues pide obra de dos letras, módulo válido y bases completas',()=>{
  const f=withNaming(createDemo().furniture[0],'VF','M01');
  expect(namingIssues(f,'VF')).toEqual([]);expect(namingIssues(f,'')).toEqual([]);
  expect(namingIssues(f,'vf')).toEqual(['Completá las dos letras de la obra, por ejemplo VF.']);
  const noModule={...f,naming:{...f.naming!,moduleCode:'X1'}};
  expect(namingIssues(noModule,'VF')).toEqual(['Completá el módulo de este mueble, por ejemplo M01, o agregalo al grupo y volvé a analizar.']);
  const blank={...f,naming:{...f.naming!,bases:[{id:'a',base:'  '}]}};
  expect(namingIssues(blank,'VF')).toEqual(['Completá el nombre de cada pieza, por ejemplo Lateral.']);
 });
});

describe('Agrupación de componentes iguales en la tabla',()=>{
 const grouped=():Furniture=>{const f=createDemo().furniture[0];f.groupIdentical=true;return f;};
 it('los laterales iguales comparten fila y código; las demás piezas quedan solas',()=>{
  const f=grouped(),rows=pieceRows(f);
  expect(rows.map(r=>[r.code,r.quantity])).toEqual([['P01',2],['P03',2],['P05',1],['P06',1]]);
  expect(pieceCodeMap(f).get('m-lateral-der')).toBe('P01');expect(pieceCodeMap(f).get('m-tapa')).toBe('P03');
 });
 it('renombrar un grupo renombra a sus miembros y sin agrupar solo a la pieza',()=>{
  const f=grouped();
  expect(renamePieceGroup(f,'m-lateral-der','Lateral').pieces.slice(0,2).map(p=>p.name)).toEqual(['Lateral','Lateral']);
  expect(renamePieceGroup({...f,groupIdentical:false},'m-lateral-der','Lateral').pieces.slice(0,2).map(p=>p.name)).toEqual(['Lateral izquierdo','Lateral']);
  expect(renamePieceGroup(f,'inexistente','X').pieces.map(p=>p.name)).toEqual(f.pieces.map(p=>p.name));
 });
 it('sincroniza nombres de grupo con el primer miembro solo si la agrupación está activa',()=>{
  const f=grouped();
  expect(synchronizeGroupedNames(f).pieces[1].name).toBe('Lateral izquierdo');
  const plain={...f,groupIdentical:false};expect(synchronizeGroupedNames(plain)).toBe(plain);
 });
 it('exige un nombre de referencia de hasta 80 caracteres por fila agrupada',()=>{
  const f=grouped();expect(groupedNameIssues(f)).toEqual([]);
  f.pieces[0].name=' ';expect(groupedNameIssues(f)).toHaveLength(1);
  f.pieces[0].name='x'.repeat(81);expect(groupedNameIssues(f)).toHaveLength(1);
  expect(groupedNameIssues({...f,groupIdentical:false})).toEqual([]);
 });
});

describe('Leyenda de la hoja',()=>{
 it('agrupa avisos por texto con los códigos afectados y usa el código compartido',()=>{
  const f=createDemo().furniture[0];f.groupIdentical=true;
  f.pieces[1].warnings=['Revisar veta.'];f.pieces[2].warnings=['Revisar veta.'];
  f.notes=[{id:'n',pieceId:f.pieces[1].id,anchor:[0,0,0],position:[100,100],text:'Atornillar'},{id:'m',pieceId:'borrada',anchor:[0,0,0],position:[100,100],text:'Huérfana'}];
  const entries=sheetEntries(f);
  expect(entries).toContain('1 · P01 · Atornillar');expect(entries).toContain('2 · ? · Huérfana');expect(entries).toContain('P01, P03: Revisar veta.');
  expect(entries[0]).toMatch(/^ID compartido/);
 });
 it('guía A4: pie por defecto, piezas ocultas en interior y observaciones recortadas',()=>{
  const f=createDemo().furniture[0];
  f.presentation={guide:{mode:'both',hiddenPieceIds:[f.pieces[0].id],sharedCamera:true,observations:'  Pegar con cola  '}};
  expect(sheetEntries(f)).toEqual(['Las piezas ocultas en la vista interior permanecen incluidas en el listado.','Observaciones de armado: Pegar con cola','Guía de armado · medidas en mm · no medir a escala.']);
  f.presentation.guide!.mode='exterior';
  expect(sheetEntries(f)).not.toContain('Las piezas ocultas en la vista interior permanecen incluidas en el listado.');
 });
 it('plano clásico: textos compacto, IDs ocultos y por defecto',()=>{
  const f=createDemo().furniture[0];
  expect(sheetEntries(f)).toEqual(['Mismos códigos en ambas vistas. Cotas en la delantera; espesor en la tabla. Despiece ilustrativo: no medir a escala.']);
  f.presentation={compact:true};expect(sheetEntries(f)[0]).toMatch(/^Plano compacto: cotas por referencia de ID; una etiqueta/);
  f.presentation={compact:true,hideIds:true};expect(sheetEntries(f)).toEqual(['Plano compacto: cotas por referencia de ID de la tabla; IDs ocultos en las vistas.','IDs ocultos en el dibujo. Códigos y medidas en la tabla. Despiece ilustrativo: no medir a escala.']);
  f.presentation={};f.groupIdentical=true;expect(sheetEntries(f)[0]).toMatch(/^ID compartido: piezas iguales/);
 });
});

describe('Vista previa de corte del pedido',()=>{
 const geometry={lengths:[700,450,18],bounds:{min:[0,0,0],max:[700,450,18]},scales:[1,1,1],vertices:box(700,450,18).vertices,triangles:box(700,450,18).triangles};
 it('proyecta base × altura y conserva solo las caras que miran al frente elegido',()=>{
  const front=orderProjection(geometry,{axes:[0,1],flipX:false,flipY:false,frontSign:1});
  expect([front.width,front.height,front.effectiveFlipX]).toEqual([700,450,false]);
  expect(front.triangles).toHaveLength(2);
  expect(front.points[0]).toEqual([0,450]);
  const back=orderProjection(geometry,{axes:[0,1],flipX:false,flipY:true,frontSign:-1});
  expect(back.effectiveFlipX).toBe(true);expect(back.points[0]).toEqual([700,0]);expect(back.triangles).toHaveLength(2);
 });
 it('una pieza espejada o con ejes impares invierte el sentido horizontal',()=>{
  expect(orderProjection({...geometry,mirrored:true},{axes:[0,1],flipX:false,flipY:false,frontSign:null}).effectiveFlipX).toBe(true);
  expect(orderProjection(geometry,{axes:[1,0],flipX:false,flipY:false,frontSign:null}).effectiveFlipX).toBe(true);
  expect(orderProjection(geometry,{axes:[2,0],flipX:true,flipY:false,frontSign:1}).effectiveFlipX).toBe(true);
 });
});

describe('Recorte del visor',()=>{
 it('con notas reserva toda la escena; sin elementos usa la escena completa',()=>{
  const f=createDemo().furniture[0],scene=makeScene(f);
  const viewport=diagramViewport(scene).split(' ').map(Number);
  expect(viewport[2]).toBeGreaterThanOrEqual(80);expect(viewport[2]).toBeLessThanOrEqual(scene.width+60);
  expect(diagramViewport({...scene,notes:[{} as never]})).toBe(`0 0 ${scene.width} ${scene.height}`);
  expect(diagramViewport({...scene,faces:[],labels:[],dimensions:[]})).toBe(`0 0 ${scene.width} ${scene.height}`);
 });
});

describe('HTTP local y versión del runtime',()=>{
 it('limita el cuerpo, acepta cuerpos vacíos y traduce errores a respuestas',async()=>{
  expect(await limitedBody(new Request('http://x',{method:'POST',body:'hola'}),10)).toEqual(new TextEncoder().encode('hola'));
  expect(await limitedBody(new Request('http://x'),10)).toEqual(new Uint8Array());
  await expect(limitedBody(new Request('http://x',{method:'POST',body:'x'.repeat(11)}),10)).rejects.toBeInstanceOf(BodyLimitError);
  expect(fail(new Error('CONFLICT')).status).toBe(409);
  expect(fail(Object.assign(new Error('x'),{code:'ENOENT'})).status).toBe(404);
  expect(fail(new BodyLimitError('grande')).status).toBe(413);
  expect(fail(new SyntaxError('json')).status).toBe(400);
  const original=console.error;console.error=()=>{};try{expect(fail(new Error('otro')).status).toBe(500);}finally{console.error=original;}
 });
 it('sameOrigin acepta sin Origin o mismo host y rechaza esquemas u orígenes inválidos',()=>{
  const req=(origin?:string,host='localhost:3000')=>new Request('http://localhost:3000/api',{headers:{...(origin?{origin}:{}),host}});
  expect(sameOrigin(req())).toBe(true);expect(sameOrigin(req('http://localhost:3000'))).toBe(true);
  expect(sameOrigin(req('http://evil.test'))).toBe(false);expect(sameOrigin(req('file://localhost:3000'))).toBe(false);expect(sameOrigin(req('no es url'))).toBe(false);
 });
 it('bloquea operar con una extensión cargada de otra versión',async()=>{
  // runtime.ts importa el puente, que se registra en window al cargarse.
  const scope=globalThis as {window?:unknown};const previous=scope.window;scope.window=scope;
  const {assertRuntimeVersion,ensureRuntime}=await import('../sketchup_offline/ui/runtime');
  await expect(ensureRuntime()).rejects.toThrow('Abrí Planos Santo desde el menú de SketchUp.');
  scope.window=previous;
  expect(()=>assertRuntimeVersion({extensionVersion:release.version})).not.toThrow();
  expect(()=>assertRuntimeVersion({extensionVersion:'0.0.1'})).toThrow(`Actualización pendiente: la ventana es ${release.version}, pero SketchUp sigue usando la versión 0.0.1.`);
  expect(()=>assertRuntimeVersion({})).toThrow('versión desconocida');
 });
});
