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
