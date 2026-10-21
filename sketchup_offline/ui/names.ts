export type NameRow={id:string;depth:number;role:'piece'|'container'|'empty'|'mixed';currentName:string;displayName:string;base:string|null};
export type NameNode=Omit<NameRow,'base'|'depth'> & {kind:'group'|'component';children:NameNode[]};
export type NamePreview={token:string;rootId:string;currentName:string;name:string;prefix:string;rows:NameRow[];pieceCount:number;warnings:string[];blockers:string[];blocked:boolean};
export function cleanName(value:string){return value.normalize('NFC').replace(/\s+/gu,' ').trim();}
export function suggestPrefix(name:string){
  const text=cleanName(name),code=text.match(/(?:^|[^\p{L}\p{N}])(M\d+)(?![\p{L}\p{N}])/iu);
  if(code)return code[1].toUpperCase();
  const stop=new Set(['de','del','la','las','el','los','y','en','un','una','para']);
  return (text.match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>!stop.has(w.toLowerCase())).map(w=>Array.from(w)[0].toUpperCase()).join('').slice(0,20)||'M';
}
export function proposals(preview:NamePreview,name:string,prefix:string,bases:Record<string,string>){
  const normalizedName=cleanName(name),normalizedPrefix=cleanName(prefix);
  const rows=preview.rows.map(row=>({...row,proposed:row.role==='piece'?`${normalizedPrefix} - ${cleanName(bases[row.id]||'')}`:row.currentName}));
  const errors:string[]=[];
  if(!normalizedName||normalizedName.length>80)errors.push('El nombre del mueble debe tener entre 1 y 80 caracteres.');
  if(!normalizedPrefix||normalizedPrefix.length>20)errors.push('La abreviatura debe tener entre 1 y 20 caracteres.');
  if([name,prefix,...Object.values(bases)].some(v=>/[\u0000-\u001f\u007f]/u.test(v)))errors.push('Los nombres no admiten caracteres de control.');
  if(rows.some(r=>r.role==='piece'&&(!cleanName(bases[r.id]||'')||r.proposed.length>80)))errors.push('Completá los nombres base; cada nombre final admite hasta 80 caracteres.');
  const changes=Number(normalizedName!==preview.currentName)+rows.filter(row=>row.role==='piece'&&row.proposed!==row.currentName).length;
  return {name:normalizedName,prefix:normalizedPrefix,rows,errors,changes};
}
