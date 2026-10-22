import type {CatalogItem} from './WorkshopPanel';

// Pure helpers of the material library (Hito 7). No bridge, no DOM: tested by vitest.
export type LibraryFilter='all'|'sheet'|'edge'|'other'|'review'|'archived';
export type Rotation=0|90|180|270;
export const searchText=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('es');
function matchesFilter(item:CatalogItem,filter:LibraryFilter,archived:ReadonlySet<string>){
 if(filter==='archived')return archived.has(item.id);
 if(archived.has(item.id))return false;
 if(filter==='review')return !item.approved;
 if(filter==='sheet'||filter==='edge')return item.kind===filter;
 if(filter==='other')return !['sheet','edge'].includes(item.kind);
 return true;
}
export function filterItems(items:CatalogItem[],{filter,query,archived,favorites=false}:{filter:LibraryFilter;query:string;archived:ReadonlySet<string>;favorites?:boolean}){
 const needle=searchText(query.trim());
 return items.filter(item=>matchesFilter(item,filter,archived)&&(!favorites||item.favorite)&&searchText(`${item.name} ${item.sku} ${item.supplier} ${item.thicknessMm??''}`).includes(needle))
  .sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'es'));
}
export function filterCounts(items:CatalogItem[],archived:ReadonlySet<string>):Record<LibraryFilter,number>{
 const filters:LibraryFilter[]=['all','sheet','edge','other','review','archived'];
 return Object.fromEntries(filters.map(filter=>[filter,items.filter(item=>matchesFilter(item,filter,archived)).length])) as Record<LibraryFilter,number>;
}
export function copyName(name:string,existing:string[]){
 const taken=new Set(existing.map(value=>searchText(value.trim())));
 const base=name.trim().replace(/\s*\(copia(?: \d+)?\)$/i,'')||'Material';
 for(let index=1;index<10000;index++){
  const suffix=index===1?' (copia)':` (copia ${index})`,candidate=`${base.slice(0,160-suffix.length)}${suffix}`;
  if(!taken.has(searchText(candidate)))return candidate;
 }
 return `${base.slice(0,140)} (copia ${Date.now()})`;
}
const round=(value:number,digits=3)=>Math.round(value*10**digits)/10**digits;
export function lockedHeight(widthMm:number,pixels:{widthPx:number;heightPx:number}){
 if(!(Number.isFinite(widthMm)&&widthMm>0&&pixels.widthPx>0&&pixels.heightPx>0))return null;
 return round(widthMm*pixels.heightPx/pixels.widthPx);
}
export function normalizeRotation(value:number):Rotation{return (((Math.round(value/90)*90)%360)+360)%360 as Rotation;}
export function rotateDimensions<T extends {widthMm:number;heightMm:number}>(size:T,rotation:Rotation){
 return rotation===90||rotation===270?{widthMm:size.heightMm,heightMm:size.widthMm}:{widthMm:size.widthMm,heightMm:size.heightMm};
}
export function textureRepeats(size:{widthMm:number;heightMm:number},sheet:{lengthMm:number;widthMm:number}|null|undefined){
 if(!sheet||![size.widthMm,size.heightMm,sheet.lengthMm,sheet.widthMm].every(value=>Number.isFinite(value)&&value>0))return null;
 return {alongLength:round(sheet.lengthMm/size.widthMm,2),alongWidth:round(sheet.widthMm/size.heightMm,2)};
}
