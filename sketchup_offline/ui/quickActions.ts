export type QuickAction='sheet'|'edge'|'remove_edge'|'sample'|'furniture'|'order'|'guides'|'home'|'materials';
export type QuickIntent={destination?:'catalog'|'visuals';sequence:number;action:QuickAction;toggleOff?:boolean;message?:string;selectionPaths?:string[];scan?:unknown;scanRequired?:boolean;refreshWarning?:string};
const actions=new Set<QuickAction>(['sheet','edge','remove_edge','sample','furniture','order','guides','home','materials']);
export function isQuickIntent(value:unknown):value is QuickIntent{
 if(!value||typeof value!=='object')return false;
 const intent=value as Partial<QuickIntent>;
 return typeof intent.sequence==='number'&&Number.isSafeInteger(intent.sequence)&&intent.sequence>0&&actions.has(intent.action as QuickAction)
  &&(intent.toggleOff===undefined||typeof intent.toggleOff==='boolean')
  &&(intent.destination===undefined||intent.destination==='catalog'||intent.destination==='visuals')
  &&(intent.message===undefined||typeof intent.message==='string')
  &&(intent.selectionPaths===undefined||(Array.isArray(intent.selectionPaths)&&intent.selectionPaths.every(path=>typeof path==='string')))
  &&(intent.scanRequired===undefined||typeof intent.scanRequired==='boolean')
  &&(intent.refreshWarning===undefined||typeof intent.refreshWarning==='string');
}
export type ShellModule='home'|'materials'|'furniture'|'order'|'guides';
export type Shortcut='save'|'export'|'help'|ShellModule;
export type ShortcutEvent={key:string;code?:string;ctrlKey:boolean;metaKey?:boolean;shiftKey:boolean;altKey:boolean;defaultPrevented:boolean;repeat?:boolean;target?:unknown};
export const moduleShortcuts:ShellModule[]=['home','materials','furniture','order','guides'];
/** Global shell shortcuts. Pure: the caller still checks that the matching button is enabled. */
export function shortcutFor(event:ShortcutEvent,dialogOpen=false):Shortcut|undefined{
 if(event.defaultPrevented||dialogOpen||event.repeat)return undefined;
 const target=(event.target||{}) as {tagName?:string;type?:string;isContentEditable?:boolean;getAttribute?:(name:string)=>string|null};
 const tag=String(target.tagName||'').toUpperCase(),role=target.getAttribute?.('role')||'',typing=tag==='INPUT'&&!['checkbox','radio','button','submit','reset','range','color','file'].includes(String(target.type||'text').toLowerCase());
 if(tag==='TEXTAREA'||tag==='SELECT'||target.isContentEditable||['listbox','combobox','menu','option'].includes(role))return undefined;
 const key=event.key.toLowerCase(),command=event.ctrlKey||!!event.metaKey;
 if(event.key==='?'&&!command&&!event.altKey&&!typing)return 'help';
 if(command&&!event.altKey&&!event.shiftKey&&key==='s')return 'save';
 if(command&&!event.altKey&&event.shiftKey&&key==='e')return 'export';
 if(event.altKey&&!command&&!event.shiftKey){const digit=/^Digit([1-5])$/.exec(event.code||'')?.[1]||(/^[1-5]$/.test(event.key)?event.key:undefined);if(digit)return moduleShortcuts[Number(digit)-1];}
 return undefined;
}
export type ShellNoticeAction={label:string;kind:'analyze'};
/** Recovery offered next to an error. Pure: reanalyzing helps after a hang or a failed scan, never after an outdated install or a window opened outside SketchUp. */
export function noticeActionFor(message:string,operation=''):ShellNoticeAction|undefined{
 if(/^Actualización pendiente|^Abrí Planos Santo desde el menú/.test(message))return undefined;
 if(/SketchUp no respondió/.test(message)||/^Analizando modelo/.test(operation))return {label:'Analizar de nuevo',kind:'analyze'};
 return undefined;
}
