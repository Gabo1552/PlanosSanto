import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {demoDocument} from '../lib/demo';
import type {RawDocument} from '../lib/model';
import {countPieces,editsFor,guideIssues,mergeGuide,modelGuidOf,rememberFoldTable,type Guide,type GuideFurniture} from '../sketchup_offline/ui/guide';
import {carryEdits,carryNotice,compositeCode,FULL_NAME_LIMIT,nameChangeKind,nameDiff} from '../sketchup_offline/ui/names';
import {isQuickIntent,noticeActionFor,shortcutFor} from '../sketchup_offline/ui/quickActions';

const GUID='guid-modelo-1';
function documentWith(guid?:string):RawDocument{
 const doc=structuredClone(demoDocument);
 if(guid)doc.exporter={name:'Planos Santo Ruby',version:'0.8.10',sketchupVersion:'26',modelGuid:guid,modelName:'Cocina',exportedAt:'2026-10-01T10:00:00.000Z',selectionPaths:['modulo'],reviewed:true,warnings:[]};
 return doc;
}
function saved(pieces:GuideFurniture['pieces'],extra:Partial<GuideFurniture>={}):Guide{
 return {version:1,revision:3,selection:['modulo'],furniture:[{id:'modulo',explosion:0.2,zoom:0.9,pieces,notes:[],...extra}]};
}
class MemoryStorage{
 data=new Map<string,string>();
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){this.data.set(key,value);}
}
const FOLD_KEY='planos-santo.a4.foldTable.v2';

describe('Guía guardada: códigos, notas y opciones al volver a abrir el modelo',()=>{
 it('respeta códigos guardados y numera piezas nuevas después del mayor código usado',()=>{
  const {project}=mergeGuide(documentWith(),saved([{id:'m-lateral-izq',name:'Lateral',code:'P07'},{id:'m-base',name:'Base',code:'P03'},{id:'borrada',name:'X',code:'P08'}]));
  const codes=Object.fromEntries(project.furniture[0].pieces.map(p=>[p.id,p.code]));
  expect(codes['m-lateral-izq']).toBe('P07');expect(codes['m-base']).toBe('P03');
  // P08 lo usó una pieza borrada: no se reutiliza para evitar confundir pedidos viejos.
  expect(Object.values(codes).filter(code=>!['P07','P03'].includes(code))).toEqual(['P09','P10','P11','P12']);
  expect(project.furniture[0].explosion).toBe(0.2);expect(project.furniture[0].zoom).toBe(0.9);
  // El otro mueble no estaba en la guía: conserva la numeración de importación.
  expect(project.furniture[1].pieces.map(p=>p.code)).toEqual(['P01','P02','P03','P04']);
 });
 it('salta códigos libres que ya existen aunque tengan formato inusual',()=>{
  const {project}=mergeGuide(documentWith(),saved([{id:'m-lateral-izq',name:'Lateral',code:'P01'},{id:'m-base',name:'Base',code:'P02'},{id:'otra',name:'X',code:'Px'}]));
  expect(project.furniture[0].pieces.map(p=>p.code)).toEqual(['P01','P03','P02','P04','P05','P06']);
 });
 it('rechaza una guía guardada con forma incompatible sin sobrescribirla',()=>{
  const broken={version:1,revision:0,selection:[],furniture:[{id:'modulo',explosion:0.4,zoom:1,pieces:null,notes:[]}]} as unknown as Guide;
  expect(()=>mergeGuide(documentWith(),broken)).toThrow('La guía guardada es incompatible. No se sobrescribió.');
 });
 it('se niega a seguir numerando cuando se agotan los códigos',()=>{
  expect(()=>mergeGuide(documentWith(),saved([{id:'vieja',name:'X',code:'P9999'}]))).toThrow('Se agotaron los códigos de la guía');
 });
 it('filtra piezas ocultas, cotas movidas y cotas ocultas que ya no existen',()=>{
  const guide=saved([],{presentation:{guide:{mode:'both',hiddenPieceIds:['m-base','fantasma'],sharedCamera:true,observations:''},dimensionOffsets:[{pieceId:'m-base',role:'largo',offset:[1,2]},{pieceId:'fantasma',role:'ancho',offset:[0,0]}]} as never,
   hiddenDimensions:[{pieceId:'m-tapa',role:'largo'},{pieceId:'fantasma',role:'ancho'}]});
  const f=mergeGuide(documentWith(),guide).project.furniture[0];
  expect(f.presentation?.guide?.hiddenPieceIds).toEqual(['m-base']);
  expect(f.presentation?.dimensionOffsets?.map(d=>d.pieceId)).toEqual(['m-base']);
  expect(f.hiddenDimensions).toEqual([{pieceId:'m-tapa',role:'largo'}]);
 });
 it('aplica el código de obra y toma el módulo del nombre del mueble cuando existe',()=>{
  const doc=documentWith();doc.furniture[0].name='Bajo M04';
  const guide={...saved([{id:'m-base',name:'VF M02 Base',code:'P03'}],{naming:{moduleCode:'M02',bases:[{id:'m-base',base:'Base'}]}}),workCode:'VF'};
  const f=mergeGuide(doc,guide).project.furniture[0];
  expect(f.naming?.moduleCode).toBe('M04');expect(f.pieces.find(p=>p.id==='m-base')!.name).toBe('VF M04 Base');
 });
});

describe('Preferencia local «Agrupar por medidas»',()=>{
 let storage:MemoryStorage;
 beforeEach(()=>{storage=new MemoryStorage();(globalThis as {localStorage?:unknown}).localStorage=storage;});
 afterEach(()=>{delete (globalThis as {localStorage?:unknown}).localStorage;});
 it('se recuerda por modelo y mueble, se aplica aunque la guía no tenga opciones y no viaja a SketchUp',()=>{
  rememberFoldTable(GUID,'modulo',true);
  expect(JSON.parse(storage.getItem(FOLD_KEY)!)).toEqual({[JSON.stringify([GUID,'modulo'])]:true});
  const {project,orphans}=mergeGuide(documentWith(GUID),saved([]));
  expect(project.furniture[0].presentation?.guide).toEqual({mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:'',foldTable:true});
  expect(project.furniture[1].presentation?.guide?.foldTable).toBeUndefined();
  expect(modelGuidOf(project)).toBe(GUID);
  expect(JSON.stringify(editsFor(project,orphans))).not.toContain('foldTable');
  // Otro modelo con la misma ruta de instancia no hereda la preferencia.
  expect(mergeGuide(documentWith('otro-guid'),saved([])).project.furniture[0].presentation?.guide).toBeUndefined();
 });
 it('desactivar borra la preferencia; sin GUID no se guarda nada',()=>{
  rememberFoldTable(GUID,'modulo',true);rememberFoldTable(GUID,'modulo',false);
  expect(storage.getItem(FOLD_KEY)).toBe('{}');
  rememberFoldTable(undefined,'modulo',true);expect(storage.getItem(FOLD_KEY)).toBe('{}');
  expect(modelGuidOf(undefined)).toBeUndefined();expect(modelGuidOf({})).toBeUndefined();
 });
 it('tolera almacenamiento corrupto o inaccesible sin romper la apertura',()=>{
  for(const value of ['no-json','[true]','null','7']){
   storage.setItem(FOLD_KEY,value);
   expect(mergeGuide(documentWith(GUID),saved([])).project.furniture[0].presentation?.guide).toBeUndefined();
  }
  (globalThis as {localStorage?:unknown}).localStorage={getItem(){throw new Error('bloqueado');},setItem(){throw new Error('bloqueado');}};
  expect(()=>rememberFoldTable(GUID,'modulo',true)).not.toThrow();
  expect(()=>mergeGuide(documentWith(GUID),saved([]))).not.toThrow();
 });
});

describe('Ediciones que vuelven a SketchUp y validación previa al PDF',()=>{
 it('editsFor completa valores por defecto y reincorpora notas huérfanas a su mueble',()=>{
  const {project}=mergeGuide(documentWith(),saved([]));
  const orphan={id:'00000000-0000-4000-8000-000000000001',pieceId:'borrada',anchor:[0,0,0] as [number,number,number],position:[100,100] as [number,number],text:'Revisar'};
  const edits=editsFor(project,{modulo:[orphan]});
  expect(edits[0]).toMatchObject({id:'modulo',groupIdentical:false,presentation:{},hiddenDimensions:[],notes:[orphan]});
  expect(edits[1].notes).toEqual([]);
  expect(edits[0].pieces[0]).toEqual({id:'m-lateral-izq',name:'Lateral izquierdo',code:'P01'});
 });
 it('cuenta solo nodos con geometría propia en todo el árbol',()=>{
  expect(countPieces({children:[]})).toBe(0);
  expect(countPieces(demoDocument.furniture[0] as never)).toBe(6);
  expect(countPieces({mesh:{},children:[{mesh:{},children:[]},{children:[{mesh:{},children:[]}]}]})).toBe(3);
 });
 it('guideIssues bloquea grupo sin nombre, nombres vacíos o de más de 80 caracteres y notas huérfanas',()=>{
  const f=mergeGuide(documentWith(),saved([])).project.furniture[0];
  expect(guideIssues(f,[])).toEqual([]);
  const note={id:'n',pieceId:'x',anchor:[0,0,0] as [number,number,number],position:[100,100] as [number,number],text:'t'};
  expect(guideIssues({...f,groupName:'  '},[note])).toEqual(['Completá un nombre de grupo de hasta 80 caracteres.','Hay notas sin pieza de destino. Reanclalas o eliminalas antes de exportar.']);
  expect(guideIssues({...f,groupName:'x'.repeat(81)},[])).toHaveLength(1);
  expect(guideIssues({...f,groupName:'x'.repeat(80)},[])).toEqual([]);
  expect(guideIssues({...f,pieces:f.pieces.map((p,i)=>i?p:{...p,name:'x'.repeat(FULL_NAME_LIMIT+1)})},[])).toEqual(['Cada pieza necesita un nombre de hasta 80 caracteres.']);
 });
});

describe('Nombres: casos borde de revisión',()=>{
 it('el código compuesto solo antepone el módulo a códigos P de 2 a 4 dígitos',()=>{
  expect(compositeCode('m03','P1234')).toBe('M03·P1234');
  expect(compositeCode('M03','P1')).toBe('P1 M03');expect(compositeCode('M03','P12345')).toBe('P12345 M03');
  expect(compositeCode('   ','P07')).toBe('P07');
 });
 it('una edición sin propuesta previa es manual y se conserva si la fila sigue',()=>{
  expect(carryEdits({nueva:'Zócalo'},[],[{ids:['nueva']}])).toEqual({chosen:{nueva:'Zócalo'},kept:1,lost:0,auto:0});
  expect(carryEdits({},[{ids:['a'],base:'Lat'}],[{ids:['a']}])).toEqual({chosen:{},kept:0,lost:0,auto:0});
  expect(carryNotice({kept:0,lost:2,auto:0})).toMatch(/^Las propuestas automáticas se recalcularon; volvé a seleccionarlas\. 2 ediciones quedaron fuera de la lista/);
 });
 // BUG-TS-03 (docs/qa/BUGS_ENCONTRADOS_TS.md): corregido; regresión del plural.
 it('el aviso de varias ediciones descartadas dice «se descartaron» (BUG-TS-03)',()=>{
  expect(carryNotice({kept:0,lost:2,auto:0})).toBe('Las propuestas automáticas se recalcularon; volvé a seleccionarlas. 2 ediciones quedaron fuera de la lista y se descartaron.');
 });
 it('clasifica los cambios que ve el operador antes de renombrar',()=>{
  expect(nameChangeKind('Lateral','VF M01 Lateral')).toBe('prefix');
  expect(nameChangeKind('VF M01 Lateral','VF M02 Lateral')).toBe('prefix');
  expect(nameChangeKind('VF M01 Lateral','VF M01 Lateral izq')).toBe('base');
  expect(nameChangeKind('Lat','Lateral')).toBe('base');
  expect(nameChangeKind('','Lateral')).toBe('base');
  expect(nameChangeKind(' Lateral ','Lateral')).toBe('same');
  expect(nameDiff('Lateral','')).toEqual({prefix:'',changed:'',suffix:'',removed:'Lateral',same:false});
 });
});

describe('Acciones rápidas: casos borde',()=>{
 const base={key:'',ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false};
 it('los campos de texto bloquean ? pero no Ctrl+S; casillas y botones no bloquean ?',()=>{
  expect(shortcutFor({...base,key:'?',target:{tagName:'input',type:'text'}})).toBeUndefined();
  expect(shortcutFor({...base,key:'?',target:{tagName:'INPUT'}})).toBeUndefined();
  for(const type of ['checkbox','RADIO','button','range'])expect(shortcutFor({...base,key:'?',target:{tagName:'INPUT',type}})).toBe('help');
  expect(shortcutFor({...base,key:'s',ctrlKey:true,target:{tagName:'INPUT',type:'search'}})).toBe('save');
  for(const role of ['combobox','menu','option'])expect(shortcutFor({...base,key:'s',ctrlKey:true,target:{tagName:'DIV',getAttribute:()=>role}})).toBeUndefined();
 });
 it('Alt+número sin code usa la tecla y el teclado numérico; no acepta Alt+Shift',()=>{
  expect(shortcutFor({...base,key:'3',altKey:true})).toBe('furniture');
  expect(shortcutFor({...base,key:'5',code:'Numpad5',altKey:true})).toBe('guides');
  expect(shortcutFor({...base,key:'2',code:'Digit2',altKey:true,shiftKey:true})).toBeUndefined();
  expect(shortcutFor({...base,key:'0',code:'Digit0',altKey:true})).toBeUndefined();
  expect(shortcutFor({...base,key:'?',altKey:true})).toBeUndefined();
 });
 it('valida cada campo opcional de la intención de navegación',()=>{
  const ok={sequence:1,action:'order'};
  expect(isQuickIntent(ok)).toBe(true);
  expect(isQuickIntent({...ok,destination:'visuals',toggleOff:false,message:'',selectionPaths:[],scanRequired:true,refreshWarning:'Reanalizá',scan:{any:1}})).toBe(true);
  for(const bad of [null,'order',1,{...ok,sequence:0},{...ok,sequence:1.5},{...ok,sequence:Number.MAX_SAFE_INTEGER+1},{...ok,destination:'paint'},
   {...ok,message:3},{...ok,selectionPaths:'1/2'},{...ok,selectionPaths:[1]},{...ok,scanRequired:'yes'},{...ok,refreshWarning:false},{...ok,toggleOff:1}])expect(isQuickIntent(bad)).toBe(false);
 });
 it('ofrece reanalizar solo cuando sirve',()=>{
  expect(noticeActionFor('Algo falló','Analizando modelo…')).toEqual({label:'Analizar de nuevo',kind:'analyze'});
  expect(noticeActionFor('Actualización pendiente: SketchUp no respondió')).toBeUndefined();
  expect(noticeActionFor('Abrí Planos Santo desde el menú Extensiones','Analizando modelo')).toBeUndefined();
  expect(noticeActionFor('Nombre inválido','Guardando')).toBeUndefined();
 });
});
