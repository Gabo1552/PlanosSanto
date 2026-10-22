// The legacy names_catalog/names_preview/names_apply controller (names.rb) remains as a
// tested API only; the UI flow is «Proponer nombres» + «Aplicar renombrado».
export function cleanName(value:string){return value.normalize('NFC').replace(/\s+/gu,' ').trim();}
// Visual-only composite code (F-DESP-C): piece codes restart at P01 in every furniture,
// so screens that mix furniture show 'M03·P07'. It never changes the TXT or the guide.
export function compositeCode(moduleCode:string|undefined,code:string){
  const mod=cleanName(moduleCode||'').toUpperCase();
  if(!mod)return code;
  return /^P\d{2,4}$/u.test(code)?`${mod}·${code}`:`${code} ${mod}`;
}
// Final SketchUp name limit shared with the guide (lib/pieceGroups.ts, guide_store.rb).
export const FULL_NAME_LIMIT=80;
// Re-orienting or widening the proposal list recalculates automatic proposals.
// Manual edits (value different from the previous base) survive when their row still
// exists; accepted automatic proposals are dropped so they are recalculated.
type Proposal={ids:string[];base:string};
export function carryEdits(chosen:Record<string,string>,before:Proposal[],after:{ids:string[]}[]){
  const bases=new Map(before.map(s=>[s.ids[0],s.base])),present=new Set(after.map(s=>s.ids[0])),next:Record<string,string>={};let kept=0,lost=0,auto=0;
  for(const [id,value] of Object.entries(chosen)){const manual=!bases.has(id)||value!==bases.get(id);if(!manual)auto++;else if(present.has(id)){next[id]=value;kept++;}else lost++;}
  return {chosen:next,kept,lost,auto};
}
export function carryNotice({kept,lost,auto}:{kept:number;lost:number;auto:number}){
  if(!kept&&!lost&&!auto)return '';
  const parts=[kept?`Se ${kept===1?'conservó 1 nombre editado':`conservaron ${kept} nombres editados`}; las propuestas automáticas se recalcularon.`:'Las propuestas automáticas se recalcularon; volvé a seleccionarlas.'];
  if(lost)parts.push(`${lost===1?'1 edición quedó':`${lost} ediciones quedaron`} fuera de la lista y se descartó${lost===1?'':'n'}.`);
  return parts.join(' ');
}
// Pure, code-point based diff for review screens: common prefix/suffix of the
// cleaned names and the changed middle of `after`. It never touches the model.
export type NameDiff={prefix:string;changed:string;suffix:string;removed:string;same:boolean};
export function nameDiff(before:string,after:string):NameDiff{
  const a=Array.from(cleanName(before)),b=Array.from(cleanName(after));let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  return {prefix:b.slice(0,start).join(''),changed:b.slice(start,b.length-end).join(''),suffix:b.slice(b.length-end).join(''),removed:a.slice(start,a.length-end).join(''),same:a.join('')===b.join('')};
}
// Review summary heuristic: a change that keeps the final words intact (whole words,
// so 'Lateral' -> 'M1 Lateral' counts) touches the obra/módulo prefix; anything that
// reaches the end of the name changes the base name.
export function nameChangeKind(before:string,after:string):'same'|'prefix'|'base'{
  const diff=nameDiff(before,after);if(diff.same)return 'same';
  return cleanName(before)&&diff.suffix&&(/^\s/u.test(diff.suffix)||/\s$/u.test(diff.changed||diff.removed))?'prefix':'base';
}
