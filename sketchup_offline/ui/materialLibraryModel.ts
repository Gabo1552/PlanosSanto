import type {CatalogItem} from './WorkshopPanel';
import {catalogComplete} from './workshopRules';

// Pure helpers of the material library (Hito 7). No bridge, no DOM: tested by vitest.
export type LibraryFilter='all'|'sheet'|'edge'|'other'|'review'|'archived';
export type Rotation=0|90|180|270;
export const searchText=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('es');
function matchesFilter(item:CatalogItem,filter:LibraryFilter,archived:ReadonlySet<string>){
 if(filter==='archived')return archived.has(item.id);
 if(archived.has(item.id))return false;
 if(filter==='review')return !catalogComplete(item);
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

// --- 0.8.17: grilla agrupada y ficha «Propiedades del material» ---------------
export type FichaItem=CatalogItem&{thicknessesMm?:number[]};
export type Kind='sheet'|'edge'|'solid_wood'|'dimensional'|'veneer'|'unknown';
export type StandardThicknesses={sheet:number[];edge:number[]};
/** Same values as presets-taller.json; only used when an older backend does not send them. */
export const DEFAULT_THICKNESSES:StandardThicknesses={sheet:[3,5,12,15,18,25],edge:[0.45,2]};
export const MAX_THICKNESSES=32;
export const kindLabels:Record<Kind,string>={sheet:'Placa',edge:'Canto',solid_wood:'Madera maciza',dimensional:'Perfil',veneer:'Lámina',unknown:'Sin tipo'};
export type GroupKey='sheet'|'edge'|'other'|'unknown';
export const groupLabels:Record<GroupKey,string>={sheet:'Placas',edge:'Cantos',other:'Otros materiales',unknown:'Sin tipo'};
export function groupOf(kind:string):GroupKey{return kind==='sheet'||kind==='edge'?kind:kind==='unknown'||!(kind in kindLabels)?'unknown':'other';}
/** Placa / Canto / Otros / Sin tipo, in that order, without empty groups and keeping the given order inside each one. */
export function groupItems<T extends {kind:string}>(items:T[]):{key:GroupKey;label:string;items:T[]}[]{
 return (['sheet','edge','other','unknown'] as GroupKey[]).map(key=>({key,label:groupLabels[key],items:items.filter(item=>groupOf(item.kind)===key)})).filter(group=>group.items.length>0);
}
const round3=(value:number)=>Math.round(value*1000)/1000;
const validMeasure=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100000;
export function defaultThicknesses(kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES){return kind==='sheet'||kind==='edge'?[...defaults[kind]]:[];}
/** The ficha's standard thicknesses; a v2 record (older backend) shows the defaults of its kind plus its own thickness. */
export function standardThicknesses(item:FichaItem,defaults:StandardThicknesses=DEFAULT_THICKNESSES):number[]{
 const list=Array.isArray(item.thicknessesMm)?item.thicknessesMm.filter(validMeasure):defaultThicknesses(item.kind,defaults);
 return [...new Set([...list,...(validMeasure(item.thicknessMm)?[item.thicknessMm]:[])].map(round3))].sort((a,b)=>a-b);
}
/** «18», «0,45», «0.45 mm» or «2mm» → millimetres; null for empty; NaN when it is not a measure. */
export function parseMeasure(text:string):number|null{
 const value=text.trim().replace(/\s*mm$/i,'').replace(',','.');
 if(!value)return null;
 if(!/^\d+(?:\.\d+)?$/.test(value))return Number.NaN;
 const number=Number(value);return number>0&&number<=100000?round3(number):Number.NaN;
}
export const formatMeasure=(value:number|null|undefined)=>value===null||value===undefined?'':new Intl.NumberFormat('es-AR',{maximumFractionDigits:3,useGrouping:false}).format(value);
export const formatMm=(value:number|null|undefined)=>value===null||value===undefined?'':`${formatMeasure(value)} mm`;
type Price=NonNullable<CatalogItem['price']>;
export type PriceDraft={amount:string;currency:string;unit:string;date:string;source:string};
export type FichaDraft={name:string;kind:string;sku:string;supplier:string;notes:string;thicknesses:string[];chosen:number|null;widthMm:string;lengthMm:string;grain:''|'true'|'false';price:PriceDraft};
export type DraftErrors=Partial<Record<'name'|'thicknesses'|'widthMm'|'lengthMm'|'price',string>>&{rows?:Record<number,string>};
const today=()=>new Date().toISOString().slice(0,10);
export function emptyPrice(kind:string):PriceDraft{return {amount:'',currency:'ARS',unit:kind==='edge'?'metro':'placa',date:today(),source:'Carga manual'};}
export function draftFromItem(item:FichaItem,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 const list=standardThicknesses(item,defaults);
 return {name:item.name,kind:item.kind,sku:item.sku,supplier:item.supplier,notes:item.notes||'',thicknesses:list.map(formatMeasure),
  chosen:validMeasure(item.thicknessMm)?list.findIndex(value=>value===round3(item.thicknessMm as number)):null,
  widthMm:formatMeasure(item.widthMm),lengthMm:formatMeasure(item.lengthMm),grain:item.grain===null?'':item.grain?'true':'false',
  price:item.price?{amount:formatMeasure(item.price.amount),currency:item.price.currency,unit:item.price.unit,date:item.price.date,source:item.price.source}:emptyPrice(item.kind)};
}
export function newDraft(kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 return {name:'',kind,sku:'',supplier:'',notes:'',thicknesses:defaultThicknesses(kind,defaults).map(formatMeasure),chosen:null,widthMm:'',lengthMm:'',grain:'',price:emptyPrice(kind)};
}
/** Changing the type brings that type's standard list when the ficha still had an empty or untouched default list. */
export function changeKind(draft:FichaDraft,kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 const previous=defaultThicknesses(draft.kind,defaults).map(formatMeasure),untouched=draft.thicknesses.length===0||(draft.thicknesses.join('|')===previous.join('|')&&draft.chosen===null);
 const price=draft.price.amount.trim()?draft.price:{...draft.price,unit:kind==='edge'?'metro':'placa'};
 if(!untouched)return {...draft,kind,price};
 return {...draft,kind,thicknesses:defaultThicknesses(kind,defaults).map(formatMeasure),chosen:null,price};
}
export function addThickness(draft:FichaDraft):FichaDraft{return draft.thicknesses.length>=MAX_THICKNESSES?draft:{...draft,thicknesses:[...draft.thicknesses,'']};}
export function removeThickness(draft:FichaDraft,index:number):FichaDraft{
 const thicknesses=draft.thicknesses.filter((_,row)=>row!==index);
 const chosen=draft.chosen===null||draft.chosen===index?null:draft.chosen>index?draft.chosen-1:draft.chosen;
 return {...draft,thicknesses,chosen};
}
export function setThickness(draft:FichaDraft,index:number,text:string):FichaDraft{return {...draft,thicknesses:draft.thicknesses.map((value,row)=>row===index?text:value)};}
export function chooseThickness(draft:FichaDraft,index:number|null):FichaDraft{return {...draft,chosen:index};}
function measureField(text:string,label:string,errors:DraftErrors,key:'widthMm'|'lengthMm'){const value=parseMeasure(text);if(Number.isNaN(value)){errors[key]=`${label}: escribí una medida en mm mayor que 0.`;return null;}return value;}
/** Validates the draft and returns the ficha to save. Missing order data never blocks: it only shows as «ficha incompleta». */
export function applyDraft(item:FichaItem,draft:FichaDraft):{item?:FichaItem;errors:DraftErrors}{
 const errors:DraftErrors={},rows:Record<number,string>={};
 const name=draft.name.trim();
 if(!name)errors.name='Escribí un nombre para el material.';else if(name.length>160)errors.name='El nombre admite hasta 160 caracteres.';
 const values=draft.thicknesses.map((text,index)=>{const value=parseMeasure(text);if(value===null){if(index===draft.chosen)rows[index]='Escribí el espesor elegido.';return null;}if(Number.isNaN(value)){rows[index]='Escribí un espesor en mm mayor que 0.';return null;}return value;});
 values.forEach((value,index)=>{if(value!==null&&values.findIndex(other=>other===value)!==index)rows[index]='Ese espesor ya está en la lista.';});
 if(Object.keys(rows).length){errors.rows=rows;errors.thicknesses='Revisá los espesores marcados.';}
 if(values.filter(value=>value!==null).length>MAX_THICKNESSES)errors.thicknesses=`Hasta ${MAX_THICKNESSES} espesores estándar.`;
 const sheet=draft.kind==='sheet';
 const widthMm=measureField(draft.widthMm,draft.kind==='edge'?'Ancho del canto':'Ancho',errors,'widthMm');
 const lengthMm=sheet?measureField(draft.lengthMm,'Largo',errors,'lengthMm'):item.lengthMm;
 let price:Price|null=null;
 if(draft.price.amount.trim()){
  const amount=Number(draft.price.amount.trim().replace(/\./g,'').replace(',','.'));
  if(!(Number.isFinite(amount)&&amount>0&&amount<=1e9))errors.price='Precio: escribí un importe mayor que 0.';
  else if(![draft.price.currency,draft.price.unit,draft.price.source].every(value=>value.trim()))errors.price='Precio: completá moneda, unidad y fuente.';
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.price.date)||Number.isNaN(Date.parse(`${draft.price.date}T00:00:00Z`)))errors.price='Precio: elegí una fecha válida.';
  else price={amount,currency:draft.price.currency.trim(),unit:draft.price.unit.trim(),date:draft.price.date,source:draft.price.source.trim()};
 }
 if(errors.name||errors.thicknesses||errors.widthMm||errors.lengthMm||errors.price)return {errors};
 const list=[...new Set(values.filter((value):value is number=>value!==null))].sort((a,b)=>a-b);
 const chosen=draft.chosen===null?null:values[draft.chosen]??null;
 return {errors,item:{...item,name,kind:draft.kind,sku:draft.sku.trim(),supplier:draft.supplier.trim(),notes:draft.notes.trim(),thicknessesMm:list,thicknessMm:chosen,
  widthMm,lengthMm,grain:sheet?(draft.grain===''?null:draft.grain==='true'):item.grain,price}};
}
/** True when the draft differs from what the ficha would show untouched. */
export function draftChanged(item:FichaItem,draft:FichaDraft,defaults:StandardThicknesses=DEFAULT_THICKNESSES){
 const base=draftFromItem(item,defaults);
 const samePrice=(!item.price&&!draft.price.amount.trim())||JSON.stringify(base.price)===JSON.stringify(draft.price);
 return !samePrice||JSON.stringify({...base,price:null})!==JSON.stringify({...draft,price:null});
}
/** Same normalised name as the backend's automatic link: two fichas that collide cannot be linked by name. */
export const linkName=(value:string)=>value.normalize('NFC').trim().replace(/^\[(.*)\]$/,'$1').replace(/\s+/g,' ').toLocaleLowerCase('es');
export function nameCollision(items:{id:string;name:string}[],id:string|undefined,name:string){const key=linkName(name);return !!key&&items.some(item=>item.id!==id&&linkName(item.name)===key);}
export const hexColor=(color?:number[]|null)=>color?.length===3&&color.every(value=>Number.isInteger(value)&&value>=0&&value<=255)?`#${color.map(value=>value.toString(16).padStart(2,'0')).join('')}`:null;
export function rgbFromHex(hex:string):[number,number,number]|null{const match=/^#?([0-9a-f]{6})$/i.exec(hex.trim());if(!match)return null;const value=parseInt(match[1],16);return [(value>>16)&255,(value>>8)&255,value&255];}
