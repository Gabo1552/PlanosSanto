// 0.8.26 (SketchUp 2022): UI::HtmlDialog in SketchUp 2021.1 to 2023 runs CEF 88
// (Chromium 88); SketchUp 2024 uses CEF 112 and 2025 uses CEF 128. esbuild lowers
// syntax to chrome88 (scripts/build-offline.mjs), but it does not add runtime
// APIs. This file adds only the ones the bundle uses above Chromium 88, and only
// when they are missing, so SketchUp 2024-2026 keep their native versions.
// scripts/check-browser-floor.mjs fails the build when the bundle uses another
// API above the floor that is not covered here.
// Each polyfill is a no-op where the native API exists.
import './compat-chromium88.css';

type Indexable<T>={length:number;[index:number]:T};

function define(target:object,name:string,value:unknown){
  if(name in target)return;
  try{Object.defineProperty(target,name,{value,writable:true,configurable:true,enumerable:false});}catch{/* frozen intrinsic: leave it */}
}

// Array/String/TypedArray.prototype.at: Chromium 92.
function at<T>(this:Indexable<T>,index:number):T|undefined{
  const length=this.length>>>0;let i=Math.trunc(Number(index))||0;if(i<0)i+=length;
  return i<0||i>=length?undefined:this[i];
}
define(Array.prototype,'at',at);
define(String.prototype,'at',function(this:string,index:number){return at.call(String(this) as unknown as Indexable<string>,index);});
const typedArray=Object.getPrototypeOf(Int8Array.prototype) as object|null;
if(typedArray)define(typedArray,'at',at);

// Array.prototype.findLast / findLastIndex: Chromium 97.
define(Array.prototype,'findLastIndex',function<T>(this:T[],predicate:(value:T,index:number,array:T[])=>unknown,thisArg?:unknown){
  for(let i=(this.length>>>0)-1;i>=0;i--)if(predicate.call(thisArg,this[i],i,this))return i;
  return -1;
});
define(Array.prototype,'findLast',function<T>(this:T[],predicate:(value:T,index:number,array:T[])=>unknown,thisArg?:unknown){
  for(let i=(this.length>>>0)-1;i>=0;i--)if(predicate.call(thisArg,this[i],i,this))return this[i];
  return undefined;
});

// Object.hasOwn: Chromium 93.
define(Object,'hasOwn',(object:object,key:PropertyKey)=>Object.prototype.hasOwnProperty.call(Object(object),key));

// crypto.randomUUID: Chromium 92. RFC 4122 version 4 from getRandomValues (Chromium 11).
const cryptoObject=(globalThis as {crypto?:Crypto}).crypto;
if(cryptoObject&&typeof cryptoObject.getRandomValues==='function'&&typeof (cryptoObject as {randomUUID?:unknown}).randomUUID!=='function'){
  const randomUUID=()=>{
    const bytes=cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
  // Crypto.prototype keeps the native this-check; set it on the instance.
  define(cryptoObject,'randomUUID',randomUUID);
}

// structuredClone: Chromium 98. The UI clones plain guide data (objects, arrays,
// strings, numbers, booleans, null, Date); Map, Set, RegExp, ArrayBuffer and typed
// arrays are copied too, and cycles are kept. Functions, DOM nodes and symbols
// throw a DataCloneError like the native one.
function cloneValue(value:unknown,seen:Map<object,unknown>):unknown{
  if(value===null||typeof value!=='object'){
    if(typeof value==='function'||typeof value==='symbol')throw cloneError(value);
    return value;
  }
  const known=seen.get(value);if(known!==undefined)return known;
  if(value instanceof Date){const copy=new Date(value.getTime());seen.set(value,copy);return copy;}
  if(value instanceof RegExp){const copy=new RegExp(value.source,value.flags);seen.set(value,copy);return copy;}
  if(value instanceof ArrayBuffer){const copy=value.slice(0);seen.set(value,copy);return copy;}
  if(ArrayBuffer.isView(value)){
    const view=value as ArrayBufferView&{constructor:new(buffer:ArrayBuffer,offset:number,length:number)=>ArrayBufferView};
    const buffer=cloneValue(view.buffer,seen) as ArrayBuffer;
    const length=value instanceof DataView?value.byteLength:(value as unknown as {length:number}).length;
    const copy=new view.constructor(buffer,view.byteOffset,length);seen.set(value,copy);return copy;
  }
  if(value instanceof Map){const copy=new Map();seen.set(value,copy);value.forEach((item,key)=>copy.set(cloneValue(key,seen),cloneValue(item,seen)));return copy;}
  if(value instanceof Set){const copy=new Set();seen.set(value,copy);value.forEach(item=>copy.add(cloneValue(item,seen)));return copy;}
  if(typeof Node!=='undefined'&&value instanceof Node)throw cloneError(value);
  if(Array.isArray(value)){
    const copy:unknown[]=new Array(value.length);seen.set(value,copy);
    for(let i=0;i<value.length;i++)if(i in value)copy[i]=cloneValue(value[i],seen);
    return copy;
  }
  if(value instanceof Error){
    const copy=new (value.constructor as ErrorConstructor)(value.message);seen.set(value,copy);
    if(value.stack)copy.stack=value.stack;
    return copy;
  }
  const copy:Record<string,unknown>={};seen.set(value,copy);
  for(const key of Object.keys(value))copy[key]=cloneValue((value as Record<string,unknown>)[key],seen);
  return copy;
}
function cloneError(value:unknown){
  const message=`${Object.prototype.toString.call(value)} could not be cloned.`;
  try{return new DOMException(message,'DataCloneError');}catch{return new Error(message);}
}
define(globalThis,'structuredClone',(value:unknown)=>cloneValue(value,new Map()));

// CSS :has() is Chromium 105. Without it, the few label layouts that depend on it
// get classes from this observer and the fallback rules in compat-chromium88.css.
// It only runs where :has() is unsupported.
function supportsHas(){
  try{return typeof CSS!=='undefined'&&typeof CSS.supports==='function'&&CSS.supports('selector(:has(*))');}catch{return false;}
}
const HAS_CLASSES:[string,string][]=[
  ['ps-has-select','select'],
  ['ps-has-non-checkbox','input:not([type=checkbox])'],
  ['ps-has-radio','input[type=radio]'],
  ['ps-has-direct-checkbox',':scope>input[type=checkbox]'],
  ['ps-has-checked','input:checked'],
];
function markLabel(label:Element){
  for(const [name,selector] of HAS_CLASSES){
    let found=false;try{found=label.querySelector(selector)!==null;}catch{found=false;}
    if(label.classList.contains(name)!==found)label.classList.toggle(name,found);
  }
}
function markAll(root:ParentNode){
  if(root instanceof Element&&root.tagName==='LABEL')markLabel(root);
  root.querySelectorAll('label').forEach(markLabel);
}
function startHasFallback(){
  if(typeof document==='undefined'||typeof MutationObserver==='undefined'||supportsHas())return;
  document.documentElement.classList.add('ps-no-has');
  let scheduled=false;
  const refresh=()=>{scheduled=false;if(document.body)markAll(document.body);};
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}};
  const start=()=>{
    refresh();
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['checked','type','class']});
    document.addEventListener('change',event=>{const label=(event.target as Element|null)?.closest?.('label');if(label)markLabel(label);schedule();},true);
  };
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
}
startHasFallback();

export {};
