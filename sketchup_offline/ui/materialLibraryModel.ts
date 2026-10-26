import type {CatalogItem} from './WorkshopPanel';
import {catalogComplete} from './workshopRules';

// Pure helpers of the material library (Hito 7). No bridge, no DOM: tested by vitest.
export type LibraryFilter='hardware'|'all'|'sheet'|'edge'|'other'|'review'|'archived';
export type Rotation=0|90|180|270;
export const searchText=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('es');
function matchesFilter(item:CatalogItem,filter:LibraryFilter,archived:ReadonlySet<string>){
 if(filter==='archived')return archived.has(item.id);
 if(archived.has(item.id))return false;
 if(filter==='review')return !catalogComplete(item);
 if(filter==='sheet'||filter==='edge'||filter==='hardware')return item.kind===filter;
 if(filter==='other')return !['sheet','edge','hardware'].includes(item.kind);
 return true;
}
export function filterItems(items:CatalogItem[],{filter,query,archived,favorites=false}:{filter:LibraryFilter;query:string;archived:ReadonlySet<string>;favorites?:boolean}){
 const needle=searchText(query.trim());
 return items.filter(item=>matchesFilter(item,filter,archived)&&(!favorites||item.favorite)&&searchText(`${item.name} ${item.sku} ${item.supplier} ${item.thicknessMm??''} ${((item as FichaItem).thicknessesMm||[]).map(value=>`${value} ${formatMeasure(value)}`).join(' ')}`).includes(needle))
  .sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'es'));
}
export function filterCounts(items:CatalogItem[],archived:ReadonlySet<string>):Record<LibraryFilter,number>{
 const filters:LibraryFilter[]=['all','sheet','edge','hardware','other','review','archived'];
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
// --- 0.8.20: biblioteca v4 -------------------------------------------------
// Una placa no tiene «el» espesor: vale para todos los de su lista y el despiece la separa por el espesor real
// de cada pieza (thicknessMm queda null). Un canto conserva su espesor (el que se descuenta del corte) y tiene
// anchos estándar (widthsMm, 22 y 45 mm de fábrica; widthMm queda null): se refila, nunca bloquea.
export type FichaItem=CatalogItem&{thicknessesMm?:number[];widthsMm?:number[]};
export type Kind='hardware'|'sheet'|'edge'|'solid_wood'|'dimensional'|'veneer'|'unknown';
/** Standard lists of presets-taller.json. `edgeWidths` (standardWidthsMm) is optional: an older backend does not send it. */
export type StandardThicknesses={sheet:number[];edge:number[];edgeWidths?:number[]};
/** Same values as presets-taller.json; only used when an older backend does not send them. */
export const DEFAULT_THICKNESSES:StandardThicknesses={sheet:[3,5,12,15,18,25],edge:[0.45,2]};
export const DEFAULT_WIDTHS=[22,45];
export const MAX_THICKNESSES=32;
export const kindLabels:Record<Kind,string>={hardware:'Herraje',sheet:'Placa',edge:'Canto',solid_wood:'Madera maciza',dimensional:'Perfil',veneer:'Lámina',unknown:'Sin tipo'};
export type GroupKey='hardware'|'sheet'|'edge'|'other'|'unknown';
export const groupLabels:Record<GroupKey,string>={hardware:'Herrajes',sheet:'Placas',edge:'Cantos',other:'Otros materiales',unknown:'Sin tipo'};
export function groupOf(kind:string):GroupKey{return kind==='sheet'||kind==='edge'||kind==='hardware'?kind:kind==='unknown'||!(kind in kindLabels)?'unknown':'other';}
/** Placa / Canto / Otros / Sin tipo, in that order, without empty groups and keeping the given order inside each one. */
export function groupItems<T extends {kind:string}>(items:T[]):{key:GroupKey;label:string;items:T[]}[]{
 return (['sheet','edge','hardware','other','unknown'] as GroupKey[]).map(key=>({key,label:groupLabels[key],items:items.filter(item=>groupOf(item.kind)===key)})).filter(group=>group.items.length>0);
}
const round3=(value:number)=>Math.round(value*1000)/1000;
const validMeasure=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100000;
export function defaultThicknesses(kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES){return kind==='sheet'||kind==='edge'?[...defaults[kind]]:[];}
export function defaultWidths(kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES){return kind==='edge'?[...(defaults.edgeWidths||DEFAULT_WIDTHS)]:[];}
const merged=(list:number[],single:unknown)=>[...new Set([...list,...(validMeasure(single)?[single]:[])].map(round3))].sort((a,b)=>a-b);
/** The ficha's standard thicknesses; a v2 record (older backend) shows the defaults of its kind plus its own thickness. */
export function standardThicknesses(item:FichaItem,defaults:StandardThicknesses=DEFAULT_THICKNESSES):number[]{
 return merged(Array.isArray(item.thicknessesMm)?item.thicknessesMm.filter(validMeasure):defaultThicknesses(item.kind,defaults),item.thicknessMm);
}
/** An edge's standard widths; a v3 record (older backend) shows 22 and 45 mm plus its own width. Other kinds: none. */
export function standardWidths(item:FichaItem,defaults:StandardThicknesses=DEFAULT_THICKNESSES):number[]{
 if(item.kind!=='edge')return [];
 return merged(Array.isArray(item.widthsMm)?item.widthsMm.filter(validMeasure):defaultWidths('edge',defaults),item.widthMm);
}
/** True when the measured thickness of a piece is one of the ficha's (±0,1 mm, the geometry reads 17,999). */
export const inList=(list:number[],value:number)=>list.some(item=>Math.abs(item-value)<=0.1);
/** Card summary of the thicknesses: «18 mm», «15 y 18 mm» or «3 a 25 mm» when there are more than three. */
export function thicknessSummary(list:number[]):string{
 if(!list.length)return '';
 if(list.length>3)return `${formatMeasure(list[0])} a ${formatMeasure(list[list.length-1])} mm`;
 const text=list.map(formatMeasure);
 return `${text.length>1?`${text.slice(0,-1).join(', ')} y ${text[text.length-1]}`:text[0]} mm`;
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
/** `chosen`: only an edge (and the other kinds) has one thickness; a sheet never does. `widths`: an edge's standard widths. */
export type FichaDraft={name:string;kind:string;sku:string;supplier:string;notes:string;thicknesses:string[];chosen:number|null;widths:string[];widthMm:string;lengthMm:string;grain:''|'true'|'false';price:PriceDraft};
export type DraftErrors=Partial<Record<'name'|'thicknesses'|'widths'|'widthMm'|'lengthMm'|'price',string>>&{rows?:Record<number,string>;widthRows?:Record<number,string>};
const today=()=>new Date().toISOString().slice(0,10);
export function emptyPrice(kind:string):PriceDraft{return {amount:'',currency:'ARS',unit:kind==='hardware'?'unidad':kind==='edge'?'metro':'placa',date:today(),source:'Carga manual'};}
export function draftFromItem(item:FichaItem,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 const list=standardThicknesses(item,defaults);
 return {name:item.name,kind:item.kind,sku:item.sku,supplier:item.supplier,notes:item.notes||'',thicknesses:list.map(formatMeasure),
  chosen:item.kind!=='sheet'&&validMeasure(item.thicknessMm)?list.findIndex(value=>value===round3(item.thicknessMm as number)):null,
  widths:standardWidths(item,defaults).map(formatMeasure),widthMm:item.kind==='edge'?'':formatMeasure(item.widthMm),lengthMm:formatMeasure(item.lengthMm),grain:item.grain===null?'':item.grain?'true':'false',
  price:item.price?{amount:formatMeasure(item.price.amount),currency:item.price.currency,unit:item.price.unit,date:item.price.date,source:item.price.source}:emptyPrice(item.kind)};
}
export function newDraft(kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 return {name:'',kind,sku:'',supplier:'',notes:'',thicknesses:defaultThicknesses(kind,defaults).map(formatMeasure),chosen:null,widths:defaultWidths(kind,defaults).map(formatMeasure),widthMm:'',lengthMm:'',grain:'',price:emptyPrice(kind)};
}
/** Changing the type brings that type's standard lists when the ficha still had empty or untouched default lists. A sheet never keeps a chosen thickness. */
export function changeKind(draft:FichaDraft,kind:string,defaults:StandardThicknesses=DEFAULT_THICKNESSES):FichaDraft{
 if(kind==='hardware')return {...draft,kind,thicknesses:[],chosen:null,widths:[],widthMm:'',lengthMm:'',grain:'',price:{...draft.price,unit:'unidad'}};
 const previous=defaultThicknesses(draft.kind,defaults).map(formatMeasure),untouched=draft.thicknesses.length===0||(draft.thicknesses.join('|')===previous.join('|')&&draft.chosen===null);
 const previousWidths=defaultWidths(draft.kind,defaults).map(formatMeasure),widthsUntouched=draft.widths.length===0||draft.widths.join('|')===previousWidths.join('|');
 const price=draft.price.amount.trim()?draft.price:{...draft.price,unit:kind==='hardware'?'unidad':kind==='edge'?'metro':'placa'};
 const widths=widthsUntouched?defaultWidths(kind,defaults).map(formatMeasure):draft.widths;
 const chosen=kind==='sheet'?null:draft.chosen;
 if(!untouched)return {...draft,kind,price,widths,chosen};
 return {...draft,kind,thicknesses:defaultThicknesses(kind,defaults).map(formatMeasure),chosen:null,widths,price};
}
export function addThickness(draft:FichaDraft):FichaDraft{return draft.thicknesses.length>=MAX_THICKNESSES?draft:{...draft,thicknesses:[...draft.thicknesses,'']};}
export function removeThickness(draft:FichaDraft,index:number):FichaDraft{
 const thicknesses=draft.thicknesses.filter((_,row)=>row!==index);
 const chosen=draft.chosen===null||draft.chosen===index?null:draft.chosen>index?draft.chosen-1:draft.chosen;
 return {...draft,thicknesses,chosen};
}
export function setThickness(draft:FichaDraft,index:number,text:string):FichaDraft{return {...draft,thicknesses:draft.thicknesses.map((value,row)=>row===index?text:value)};}
export function chooseThickness(draft:FichaDraft,index:number|null):FichaDraft{return {...draft,chosen:draft.kind==='sheet'?null:index};}
export function addWidth(draft:FichaDraft):FichaDraft{return draft.widths.length>=MAX_THICKNESSES?draft:{...draft,widths:[...draft.widths,'']};}
export function removeWidth(draft:FichaDraft,index:number):FichaDraft{return {...draft,widths:draft.widths.filter((_,row)=>row!==index)};}
export function setWidth(draft:FichaDraft,index:number,text:string):FichaDraft{return {...draft,widths:draft.widths.map((value,row)=>row===index?text:value)};}
function measureField(text:string,label:string,errors:DraftErrors,key:'widthMm'|'lengthMm'){const value=parseMeasure(text);if(Number.isNaN(value)){errors[key]=`${label}: escribí una medida en mm mayor que 0.`;return null;}return value;}
/** Parses a list of measures: empty rows are dropped, bad and repeated ones are marked by row. */
function measureList(texts:string[],what:string,chosen:number|null){
 const rows:Record<number,string>={};
 const values=texts.map((text,index)=>{const value=parseMeasure(text);if(value===null){if(index===chosen)rows[index]=`Escribí el ${what} elegido.`;return null;}if(Number.isNaN(value)){rows[index]=`Escribí un ${what} en mm mayor que 0.`;return null;}return value;});
 values.forEach((value,index)=>{if(value!==null&&values.findIndex(other=>other===value)!==index)rows[index]=`Ese ${what} ya está en la lista.`;});
 return {values,rows};
}
/** Validates the draft and returns the ficha to save. Missing order data never blocks: it only shows as «ficha incompleta». */
export function applyDraft(item:FichaItem,draft:FichaDraft):{item?:FichaItem;errors:DraftErrors}{
 const errors:DraftErrors={};
 const name=draft.name.trim();
 if(!name)errors.name='Escribí un nombre para el material.';else if(name.length>160)errors.name='El nombre admite hasta 160 caracteres.';
 const sheet=draft.kind==='sheet',edge=draft.kind==='edge';
 const {values,rows}=measureList(draft.thicknesses,'espesor',sheet?null:draft.chosen);
 if(Object.keys(rows).length){errors.rows=rows;errors.thicknesses='Revisá los espesores marcados.';}
 if(values.filter(value=>value!==null).length>MAX_THICKNESSES)errors.thicknesses=`Hasta ${MAX_THICKNESSES} espesores estándar.`;
 const widthList=measureList(edge?draft.widths:[],'ancho',null);
 if(Object.keys(widthList.rows).length){errors.widthRows=widthList.rows;errors.widths='Revisá los anchos marcados.';}
 const widthMm=edge?null:measureField(draft.widthMm,'Ancho',errors,'widthMm');
 const lengthMm=sheet?measureField(draft.lengthMm,'Largo',errors,'lengthMm'):item.lengthMm;
 let price:Price|null=null;
 if(draft.price.amount.trim()){
  const amount=Number(draft.price.amount.trim().replace(/\./g,'').replace(',','.'));
  if(!(Number.isFinite(amount)&&amount>0&&amount<=1e9))errors.price='Precio: escribí un importe mayor que 0.';
  else if(![draft.price.currency,draft.price.unit,draft.price.source].every(value=>value.trim()))errors.price='Precio: completá moneda, unidad y fuente.';
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.price.date)||Number.isNaN(Date.parse(`${draft.price.date}T00:00:00Z`)))errors.price='Precio: elegí una fecha válida.';
  else price={amount,currency:draft.price.currency.trim(),unit:draft.price.unit.trim(),date:draft.price.date,source:draft.price.source.trim()};
 }
 if(errors.name||errors.thicknesses||errors.widths||errors.widthMm||errors.lengthMm||errors.price)return {errors};
 const sorted=(list:(number|null)[])=>[...new Set(list.filter((value):value is number=>value!==null))].sort((a,b)=>a-b);
 const chosen=sheet||draft.chosen===null?null:values[draft.chosen]??null;
 if(widthList.values.filter(value=>value!==null).length>MAX_THICKNESSES)return {errors:{...errors,widths:`Hasta ${MAX_THICKNESSES} anchos estándar.`}};
 return {errors,item:{...item,name,kind:draft.kind,sku:draft.sku.trim(),supplier:draft.supplier.trim(),notes:draft.notes.trim(),thicknessesMm:sorted(values),thicknessMm:chosen,
  widthsMm:sorted(widthList.values),widthMm,lengthMm,grain:sheet?(draft.grain===''?null:draft.grain==='true'):item.grain,price}};
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
