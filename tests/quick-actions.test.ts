import {describe,expect,it} from 'vitest';
import {isQuickIntent,noticeActionFor,shortcutFor} from '../sketchup_offline/ui/quickActions';
describe('Atajos globales del shell',()=>{
 const base={key:'',ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false};
 it('Ctrl+S guarda, Ctrl+Shift+E exporta y Alt+1…5 cambian de módulo',()=>{
  expect(shortcutFor({...base,key:'s',ctrlKey:true})).toBe('save');expect(shortcutFor({...base,key:'S',metaKey:true})).toBe('save');
  expect(shortcutFor({...base,key:'E',ctrlKey:true,shiftKey:true})).toBe('export');
  expect(['1','2','3','4','5'].map(n=>shortcutFor({...base,key:n,code:`Digit${n}`,altKey:true}))).toEqual(['home','materials','furniture','order','guides']);
  expect(shortcutFor({...base,key:'¡',code:'Digit1',altKey:true})).toBe('home');
 });
 it('no confunde combinaciones parecidas',()=>{
  for(const event of [{key:'s'},{key:'s',ctrlKey:true,shiftKey:true},{key:'s',ctrlKey:true,altKey:true},{key:'e',ctrlKey:true},{key:'6',code:'Digit6',altKey:true},{key:'1',code:'Digit1',altKey:true,ctrlKey:true},{key:'1',code:'Digit1'}])expect(shortcutFor({...base,...event})).toBeUndefined();
 });
 it('respeta eventos ya atendidos, repeticiones, textareas, selects, listas y diálogos abiertos',()=>{
  const save={...base,key:'s',ctrlKey:true};
  expect(shortcutFor({...save,defaultPrevented:true})).toBeUndefined();expect(shortcutFor({...save,repeat:true})).toBeUndefined();expect(shortcutFor(save,true)).toBeUndefined();
  for(const target of [{tagName:'TEXTAREA'},{tagName:'select'},{tagName:'DIV',isContentEditable:true},{tagName:'DIV',getAttribute:(name:string)=>name==='role'?'listbox':null}])expect(shortcutFor({...save,target})).toBeUndefined();
  expect(shortcutFor({...save,target:{tagName:'INPUT',getAttribute:()=>null}})).toBe('save');
 });
});
describe('Ayuda de atajos y recuperación de errores',()=>{
 const base={key:'',ctrlKey:false,shiftKey:false,altKey:false,defaultPrevented:false};
 it('? abre la ayuda fuera de campos de texto, con o sin Shift según la distribución del teclado',()=>{
  expect(shortcutFor({...base,key:'?',shiftKey:true})).toBe('help');expect(shortcutFor({...base,key:'?'})).toBe('help');
  expect(shortcutFor({...base,key:'?',target:{tagName:'BUTTON',getAttribute:()=>null}})).toBe('help');
  for(const type of ['checkbox','radio','RADIO'])expect(shortcutFor({...base,key:'?',shiftKey:true,target:{tagName:'INPUT',type,getAttribute:()=>null}})).toBe('help');
 });
 it('? no se roba lo que se escribe ni actúa con modificadores o diálogos abiertos',()=>{
  for(const target of [{tagName:'INPUT',getAttribute:()=>null},{tagName:'INPUT',type:'text',getAttribute:()=>null},{tagName:'INPUT',type:'number',getAttribute:()=>null},{tagName:'INPUT',type:'search',getAttribute:()=>null},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}])expect(shortcutFor({...base,key:'?',shiftKey:true,target})).toBeUndefined();
  expect(shortcutFor({...base,key:'?',ctrlKey:true})).toBeUndefined();expect(shortcutFor({...base,key:'?',altKey:true})).toBeUndefined();expect(shortcutFor({...base,key:'?'},true)).toBeUndefined();expect(shortcutFor({...base,key:'/'})).toBeUndefined();
 });
 it('ofrece Analizar de nuevo tras un cuelgue de SketchUp o un análisis fallido',()=>{
  const action={label:'Analizar de nuevo',kind:'analyze'};
  expect(noticeActionFor('SketchUp no respondió. No vuelvas a guardar todavía: revisá si sigue trabajando y luego analizá el modelo para recuperar el estado.','Guardando guía…')).toEqual(action);
  expect(noticeActionFor('No se pudo leer el grupo 12.','Analizando modelo…')).toEqual(action);
 });
 it('no ofrece reintentos que no sirven y deja sin acción los errores de validación',()=>{
  expect(noticeActionFor('Actualización pendiente: la ventana es 0.8.10, pero SketchUp sigue usando la versión 0.8.9.','Analizando modelo…')).toBeUndefined();
  expect(noticeActionFor('Abrí Planos Santo desde el menú de SketchUp. Esta ventana necesita la extensión instalada.','Analizando modelo…')).toBeUndefined();
  expect(noticeActionFor('Mueble 1: falta la abreviatura de la obra.','Guardando guía…')).toBeUndefined();expect(noticeActionFor('Error')).toBeUndefined();
 });
});
describe('Native quick command event contract',()=>{
 it('accepts seven genuine navigation intents without granting paint permissions',()=>{
  for(const action of ['sheet','edge','remove_edge','sample','furniture','order','guides']){
   expect(isQuickIntent({sequence:1,action,selectionPaths:['22/50'],toggleOff:false})).toBe(true);
  }
 });
 it('rejects malformed or replay-counter values that cannot be compared reliably',()=>{
  for(const sequence of [undefined,null,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'2'])expect(isQuickIntent({action:'sheet',sequence})).toBe(false);
 });
 it('rejects unknown actions and payloads before UI routing',()=>{
  for(const value of [null,undefined,[],{},'sheet',{sequence:1,action:'export_pdf'},{sequence:1,action:'apply_names'}])expect(isQuickIntent(value)).toBe(false);
 });
 it('rejects invalid optional fields rather than crashing focus routing or pretending a toggle',()=>{
  for(const patch of [{selectionPaths:'22/50'},{selectionPaths:[42]},{toggleOff:'yes'},{message:{}},{refreshWarning:[]},{scanRequired:'true'}])expect(isQuickIntent({sequence:1,action:'furniture',...patch})).toBe(false);
 });
 it('preserves scan-required warnings and monotonic IDs across refresh/navigation',()=>{
  expect(isQuickIntent({sequence:Number.MAX_SAFE_INTEGER,action:'guides',scanRequired:true,refreshWarning:'Volvé a analizar.'})).toBe(true);
 });
});
