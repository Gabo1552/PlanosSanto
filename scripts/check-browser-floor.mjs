#!/usr/bin/env node
// 0.8.26 (SketchUp 2022): static scan of the built HtmlDialog bundles against the
// Chromium floor. SketchUp 2021.1-2023 ship CEF 88 (Ruby API docs, UI::HtmlDialog:
// "SketchUp 2021.1: CEF 88", next change "SketchUp 2024.0: CEF 112"). esbuild
// lowers syntax and CSS to BROWSER_TARGET; it does not add runtime APIs, and it
// keeps CSS selectors such as :has(), which Chromium 88 drops with their whole rule.
//
//   node scripts/check-browser-floor.mjs [--dir sketchup_offline/build/planos_santo/ui]
//
// Fails (exit 1) on an API or CSS feature above the floor that is neither
// polyfilled (sketchup_offline/ui/polyfills.ts) nor given a fallback
// (sketchup_offline/ui/compat-chromium88.css). Warnings are features that degrade
// alone in Chromium 88 (a dropped declaration) and are listed for manual review.
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FLOOR=88;

// Runtime APIs that ui/polyfills.ts provides. The scan checks that the polyfill
// itself is in each bundle (its marker), so these may appear freely.
export const POLYFILLED=[
  {name:'Array/String/TypedArray.prototype.at',chrome:92},
  {name:'Array.prototype.findLast/findLastIndex',chrome:97},
  {name:'Object.hasOwn',chrome:93},
  {name:'crypto.randomUUID',chrome:92},
  {name:'structuredClone',chrome:98},
  {name:'CSS :has() (label classes + compat-chromium88.css)',chrome:105},
];
const POLYFILL_MARKERS=['ps-has-direct-checkbox','DataCloneError','findLastIndex'];

// error: missing in Chromium 88 and breaks the feature; warn: degrades alone.
// A match preceded by `typeof` (feature detection) is ignored.
export const JS_RULES=[
  {re:/\.to(?:Sorted|Reversed|Spliced)\(/g,chrome:110,what:'Array.prototype.toSorted/toReversed/toSpliced'},
  {re:/\b(?:Object|Map)\.groupBy\b/g,chrome:117,what:'Object.groupBy / Map.groupBy'},
  {re:/\bPromise\.withResolvers\b/g,chrome:119,what:'Promise.withResolvers'},
  {re:/\bPromise\.try\b/g,chrome:128,what:'Promise.try'},
  {re:/\bArray\.fromAsync\b/g,chrome:121,what:'Array.fromAsync'},
  {re:/\bAbortSignal\.(?:timeout|any)\b/g,chrome:103,what:'AbortSignal.timeout / any'},
  {re:/\.(?:isWellFormed|toWellFormed)\(/g,chrome:111,what:'String.prototype.isWellFormed / toWellFormed'},
  {re:/\.(?:symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/g,chrome:122,what:'Set methods (ES2025)'},
  {re:/\bIterator\.(?:from|prototype)\b/g,chrome:122,what:'Iterator helpers'},
  {re:/\.checkVisibility\(/g,chrome:105,what:'Element.checkVisibility'},
  {re:/\.roundRect\(/g,chrome:99,what:'CanvasRenderingContext2D.roundRect'},
  {re:/\.showPicker\(/g,chrome:99,what:'HTMLInputElement.showPicker'},
  {re:/\.(?:showPopover|hidePopover|togglePopover)\(/g,chrome:114,what:'Popover API'},
  {re:/\bnavigator\.userAgentData\b/g,chrome:90,what:'navigator.userAgentData'},
  {re:/\bdocument\.startViewTransition\b/g,chrome:111,what:'View Transitions'},
  {re:/\bURL\.(?:canParse|parse)\(/g,chrome:120,what:'URL.canParse / URL.parse'},
  {re:/\bIntl\.DurationFormat\b/g,chrome:129,what:'Intl.DurationFormat'},
  {re:/\bIntl\.supportedValuesOf\b/g,chrome:99,what:'Intl.supportedValuesOf'},
  {re:/\b(?:EyeDropper|CloseWatcher|DisposableStack|AsyncDisposableStack|Float16Array)\b/g,chrome:95,what:'EyeDropper / CloseWatcher / explicit resource management / Float16Array'},
  {re:/\bSymbol\.(?:dispose|asyncDispose)\b/g,chrome:125,what:'Symbol.dispose'},
  {re:/\bRegExp\.escape\b/g,chrome:136,what:'RegExp.escape'},
  {re:/\bUint8Array\.fromBase64\b|\.toBase64\(/g,chrome:140,what:'Uint8Array base64'},
  {re:/\.requestClose\(/g,chrome:134,what:'HTMLDialogElement.requestClose'},
  {re:/\.inert\s*=[^=]/g,chrome:102,what:'HTMLElement.inert'},
  {re:/\bCSS\.highlights\b/g,chrome:105,what:'CSS Custom Highlight API'},
  // esbuild turns regex literals with flags it cannot lower into new RegExp(...).
  {re:/new RegExp\([^;]{0,400}?,\s*["'`][a-z]*[dv][a-z]*["'`]\)/g,chrome:90,what:'RegExp flag d (90) or v (112)'},
  {re:/\.hasIndices\b/g,chrome:90,what:'RegExp hasIndices'},
  {re:/\b(?:roundingMode|roundingIncrement|roundingPriority|trailingZeroDisplay)\s*:/g,chrome:106,what:'Intl.NumberFormat v3 options (ignored in 88)',level:'warn'},
  {re:/\.formatRange(?:ToParts)?\(/g,chrome:106,what:'Intl.NumberFormat formatRange (DateTimeFormat is 76)',level:'warn'},
];

// Each :has() argument the UI uses and the class polyfills.ts gives its label.
export const HAS_FALLBACKS={
  'select':'ps-has-select',
  'input:not([type=checkbox])':'ps-has-non-checkbox',
  'input[type=radio]':'ps-has-radio',
  '>input[type=checkbox]':'ps-has-direct-checkbox',
  'input:checked':'ps-has-checked',
};

export const CSS_RULES=[
  {re:/@container\b|\bcontainer-(?:type|name)\s*:|\b\d*\.?\d+cq(?:w|h|i|b|min|max)\b/g,chrome:105,what:'container queries'},
  {re:/\bcolor-mix\(/g,chrome:111,what:'color-mix()'},
  {re:/\b(?:oklch|oklab|lab|lch|hwb)\(/g,chrome:101,what:'CSS Color 4 functions'},
  {re:/\blight-dark\(/g,chrome:123,what:'light-dark()'},
  {re:/\b\d*\.?\d+(?:dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|dvi|svi|lvi|dvb|svb|lvb)\b/g,chrome:108,what:'dynamic/small/large viewport units'},
  {re:/\b\d*\.?\d+r?lh\b/g,chrome:109,what:'lh / rlh units'},
  {re:/@layer\b/g,chrome:99,what:'@layer'},
  {re:/@scope\b/g,chrome:118,what:'@scope'},
  {re:/@starting-style\b/g,chrome:117,what:'@starting-style'},
  {re:/\bsubgrid\b/g,chrome:117,what:'subgrid'},
  {re:/[{;](?:translate|rotate|scale)\s*:/g,chrome:104,what:'individual transform properties'},
  {re:/\((?:min-|max-)?(?:width|height|aspect-ratio)\s*[<>]=?|[<>]=?\s*(?:width|height)\s*[<>)]/g,chrome:104,what:'media query range syntax'},
  {re:/\bfield-sizing\s*:/g,chrome:123,what:'field-sizing'},
  {re:/\banchor-name\s*:|\bposition-anchor\s*:|\banchor\(/g,chrome:125,what:'anchor positioning'},
  {re:/:(?:user-valid|user-invalid|popover-open|modal|open|state\()/g,chrome:105,what:'newer pseudo-classes (:modal 105, :popover-open 114, :user-invalid 119)'},
  {re:/\b(?:round|mod|rem)\((?!\s*\))/g,chrome:125,what:'CSS stepped value functions'},
  {re:/\binterpolate-size\s*:|\btransition-behavior\s*:|\btext-box\s*:/g,chrome:117,what:'interpolate-size / transition-behavior / text-box'},
  {re:/\btext-wrap(?:-mode|-style)?\s*:/g,chrome:114,what:'text-wrap (dropped: plain wrapping)',level:'warn'},
  {re:/\baccent-color\s*:/g,chrome:93,what:'accent-color (native control colour)',level:'warn'},
  {re:/\bscrollbar-gutter\s*:/g,chrome:94,what:'scrollbar-gutter (no reserved gutter)',level:'warn'},
  {re:/\boverflow(?:-x|-y)?\s*:\s*clip\b/g,chrome:90,what:'overflow: clip',level:'warn'},
  {re:/\btext-decoration-thickness\s*:/g,chrome:89,what:'text-decoration-thickness',level:'warn'},
];

function line(text,index){
  const start=Math.max(0,index-70),end=Math.min(text.length,index+90);
  return text.slice(start,end).replace(/\s+/g,' ');
}

// Feature detection: `typeof X.y` right before the use, or earlier in the same
// expression (`typeof URL.canParse=="function"?URL.canParse(e):...`).
function guarded(text,index,matched){
  const before=text.slice(Math.max(0,index-160),index);
  if(/typeof\s*\(?\s*[\w.]*$/.test(before))return true;
  const name=matched.replace(/^\./,'').replace(/[\s(=]+$/,'');
  return name.length>3&&before.includes('typeof '+name);
}

export function scanJs(text,file='bundle.js'){
  const findings=[];
  for(const rule of JS_RULES){
    for(const match of text.matchAll(rule.re)){
      if(guarded(text,match.index,match[0]))continue;
      findings.push({file,level:rule.level||'error',chrome:rule.chrome,what:rule.what,at:line(text,match.index)});
    }
  }
  return findings;
}

// Selectors in minified CSS: :has(...) with one level of nested parentheses.
const HAS=/:has\(((?:[^()]|\([^()]*\))*)\)/g;

export function scanCss(text,file='bundle.css'){
  const findings=[];
  const css=text.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g,'url()').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const rule of CSS_RULES){
    for(const match of css.matchAll(rule.re))findings.push({file,level:rule.level||'error',chrome:rule.chrome,what:rule.what,at:line(css,match.index)});
  }
  // Nesting: esbuild lowers it for the target; an & left means it could not.
  for(const match of css.matchAll(/&/g))findings.push({file,level:'error',chrome:112,what:'CSS nesting (&) not lowered',at:line(css,match.index)});
  // :has(): each rule must have the class-based copy from compat-chromium88.css.
  for(const block of css.matchAll(/([^{}]*:has\([^{}]*)\{/g)){
    for(const selector of block[1].split(/,(?![^()]*\))/)){
      if(!selector.includes(':has('))continue;
      let unknown=false;
      const fallback=selector.replace(HAS,(_all,arg)=>{const name=HAS_FALLBACKS[arg.trim()];if(!name){unknown=true;return _all;}return '.'+name;}).trim();
      if(unknown){findings.push({file,level:'error',chrome:105,what:':has() without a fallback class: add it to HAS_CLASSES (ui/polyfills.ts), HAS_FALLBACKS here and compat-chromium88.css',at:selector.trim()});continue;}
      const present=css.split(/[{}]/).some(part=>part.split(/,(?![^()]*\))/).some(other=>other.trim()===fallback));
      if(!present)findings.push({file,level:'error',chrome:105,what:`:has() rule without its fallback «${fallback}» in compat-chromium88.css`,at:selector.trim()});
    }
  }
  return findings;
}

export async function targetOfBuild(root){
  const source=await readFile(resolve(root,'scripts/build-offline.mjs'),'utf8');
  const constant=source.match(/const BROWSER_TARGET\s*=\s*'([^']+)'/);
  const targets=[...source.matchAll(/target:\s*(?:'([^']+)'|(BROWSER_TARGET))/g)].map(m=>m[1]||constant?.[1]);
  return {targets,constant:constant?.[1]};
}

export async function checkBuild(root,dir=resolve(root,'sketchup_offline/build/planos_santo/ui')){
  const findings=[];
  const {targets}=await targetOfBuild(root);
  if(!targets.length)findings.push({file:'scripts/build-offline.mjs',level:'error',chrome:FLOOR,what:'no esbuild target found',at:''});
  for(const target of targets){
    const version=Number(/^chrome(\d+)$/.exec(target||'')?.[1]);
    if(!(version<=FLOOR))findings.push({file:'scripts/build-offline.mjs',level:'error',chrome:version||0,what:`esbuild target ${target} is above chrome${FLOOR} (SketchUp 2022)`,at:target});
  }
  for(const name of ['app.js','palette.js']){
    const path=resolve(dir,name);
    if(!existsSync(path)){findings.push({file:name,level:'error',chrome:FLOOR,what:'bundle missing: run npm run build:offline',at:path});continue;}
    const text=await readFile(path,'utf8');
    findings.push(...scanJs(text,name));
    for(const marker of POLYFILL_MARKERS)if(!text.includes(marker))findings.push({file:name,level:'error',chrome:FLOOR,what:`polyfills.ts is not in this bundle (marker ${marker}); import './polyfills' first in its entry`,at:''});
  }
  for(const name of ['app.css','palette.css']){
    const path=resolve(dir,name);
    if(existsSync(path))findings.push(...scanCss(await readFile(path,'utf8'),name));
  }
  return findings;
}

async function main(){
  const root=resolve(import.meta.dirname,'..');
  const at=process.argv.indexOf('--dir');
  const dir=at>0?resolve(process.argv[at+1]):undefined;
  const findings=await checkBuild(root,dir);
  const errors=findings.filter(f=>f.level==='error'),warnings=findings.filter(f=>f.level==='warn');
  const seen=new Set();
  for(const f of findings){
    const key=`${f.level}|${f.file}|${f.what}`;if(seen.has(key))continue;seen.add(key);
    const count=findings.filter(o=>`${o.level}|${o.file}|${o.what}`===key).length;
    console.log(`${f.level==='error'?'ERROR':'aviso'} ${f.file}: ${f.what} (Chromium ${f.chrome}) ×${count}\n    ${f.at}`);
  }
  console.log(`Piso Chromium ${FLOOR} (SketchUp 2022): ${errors.length} errores, ${warnings.length} avisos; polyfills: ${POLYFILLED.map(p=>p.name).join(', ')}.`);
  if(errors.length)process.exit(1);
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href)await main();
