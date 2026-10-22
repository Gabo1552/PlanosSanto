// The legacy names_catalog/names_preview/names_apply controller (names.rb) remains as a
// tested API only; the UI flow is «Proponer nombres» and «Guardar guía» (renames on save, punto 20).
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
// reapplied: the geometric proposals of the new list were applied again by themselves (punto 21).
export function carryNotice({kept,lost,auto}:{kept:number;lost:number;auto:number},reapplied=false){
  if(!kept&&!lost&&!auto)return '';
  const parts=[kept?`Se ${kept===1?'conservó 1 nombre editado':`conservaron ${kept} nombres editados`}; las propuestas automáticas se recalcularon.`:reapplied?'Las propuestas automáticas se recalcularon con el nuevo frente.':'Las propuestas automáticas se recalcularon; volvé a seleccionarlas.'];
  if(lost)parts.push(`${lost===1?'1 edición quedó':`${lost} ediciones quedaron`} fuera de la lista y se ${lost===1?'descartó':'descartaron'}.`);
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
// DESPIECE-01 «Codificar despiece»: workshop order placa → espesor → largo → ancho.
// Pure: it proposes codes; the guide store decides whether saved codes may change.
export type CodePiece={id:string;name:string;code:string;dimensions:readonly number[];metadata?:{material?:{id:string;name:string}|null}};
export type CodePlanRow={id:string;name:string;board:string;dimensions:[number,number,number];before:string;after:string;changed:boolean};
const CODE_RE=/^P\d{2,4}$/u,formatCode=(n:number)=>`P${String(n).padStart(2,'0')}`;
const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
// Order reference board (supplier sheet) per piece id: a plain string or {board?,text}.
export function referenceBoard(references?:Record<string,string|{board?:string;text:string}>){
  if(!references)return undefined;
  return (id:string)=>{const value=references[id];return typeof value==='string'?value:value?(value.board||value.text):'';};
}
export function codePlan(pieces:readonly CodePiece[],{saved,renumber,board}:{saved:ReadonlySet<string>|readonly string[];renumber:boolean;board?:(pieceId:string)=>string}):CodePlanRow[]{
  const savedIds=new Set(saved);
  const rows=pieces.map(p=>({id:p.id,name:p.name,before:p.code,dimensions:[p.dimensions[0]||0,p.dimensions[1]||0,p.dimensions[2]||0] as [number,number,number],
    board:cleanName(board?.(p.id)||p.metadata?.material?.name||p.metadata?.material?.id||'')}));
  rows.sort((a,b)=>(!a.board!==!b.board?(a.board?-1:1):collator.compare(a.board,b.board))||b.dimensions[2]-a.dimensions[2]||b.dimensions[0]-a.dimensions[0]||b.dimensions[1]-a.dimensions[1]||collator.compare(a.before,b.before)||collator.compare(a.id,b.id));
  if(rows.length>9999)throw new Error('Se agotaron los códigos de la guía: un mueble admite hasta 9999 piezas.');
  // Saved, valid and not repeated codes stay (by number, so P001 also blocks P01); the rest get the lowest free number.
  const kept=new Set<number>(),keep=new Set<string>();
  if(!renumber)for(const row of rows){const n=Number(row.before.slice(1));if(savedIds.has(row.id)&&CODE_RE.test(row.before)&&n>0&&!kept.has(n)){kept.add(n);keep.add(row.id);}}
  let next=1;
  return rows.map(row=>{
    let after=row.before;
    if(!keep.has(row.id)){while(kept.has(next))next++;if(next>9999)throw new Error('Se agotaron los códigos de la guía. Usá «Renumerar todas las piezas».');after=formatCode(next++);}
    return {...row,after,changed:after!==row.before};
  });
}
