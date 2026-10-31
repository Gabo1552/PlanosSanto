// 0.8.26 (SketchUp 2022, CEF 88): the Chromium floor scan and the polyfills.
// Static and simulated evidence only; nothing here runs inside SketchUp 2022.
import {beforeAll,describe,expect,test} from 'vitest';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {scanJs,scanCss,checkBuild,targetOfBuild,FLOOR} from '../scripts/check-browser-floor.mjs';

const root=resolve(__dirname,'..');
type Finding={level:string;what:string};
const errors=(list:Finding[])=>list.filter(f=>f.level==='error').map(f=>f.what);

describe('escaneo del bundle contra Chromium 88',()=>{
  test('marca APIs de runtime posteriores a 88 sin polyfill',()=>{
    expect(errors(scanJs('a.toSorted();Promise.withResolvers();Object.groupBy(x,f)'))).toEqual([
      'Array.prototype.toSorted/toReversed/toSpliced','Object.groupBy / Map.groupBy','Promise.withResolvers']);
    expect(errors(scanJs('new RegExp("[a]","v")'))).toEqual(['RegExp flag d (90) or v (112)']);
    expect(errors(scanJs('el.checkVisibility()'))).toEqual(['Element.checkVisibility']);
  });
  test('acepta la detección de la función antes de usarla',()=>{
    expect(scanJs('typeof AbortSignal.timeout=="function"?AbortSignal.timeout(5):null')).toEqual([]);
    expect(scanJs('return typeof URL<"u"&&typeof URL.canParse=="function"?URL.canParse(e):(new URL(e),!0)')).toEqual([]);
  });
  test('las APIs con polyfill no se marcan',()=>{
    expect(scanJs('crypto.randomUUID();structuredClone(x);a.at(-1);a.findLast(f);Object.hasOwn(o,"k")')).toEqual([]);
  });
  test('CSS: marca lo que Chromium 88 no entiende y pide el respaldo de :has()',()=>{
    const found=errors(scanCss('.a{color:color-mix(in srgb,red,blue)}.b{height:100dvh}@layer x{.c{color:red}}.d{&:hover{color:red}}'));
    expect(found).toEqual(expect.arrayContaining(['color-mix()','dynamic/small/large viewport units','@layer','CSS nesting (&) not lowered']));
    expect(errors(scanCss('.x label:has(.raro){display:flex}'))[0]).toMatch(/without a fallback class/);
    expect(errors(scanCss('.x label:has(select){display:flex}'))[0]).toMatch(/without its fallback «\.x label\.ps-has-select»/);
    expect(errors(scanCss('.x label:has(select),.y label:has(>input[type=checkbox]){display:flex}.x label.ps-has-select,.y label.ps-has-direct-checkbox{display:flex}'))).toEqual([]);
  });
  test('avisos que degradan solos no fallan',()=>{
    expect(scanCss('.a{accent-color:red;text-wrap:balance}').map(f=>f.level)).toEqual(['warn','warn']);
  });
  test('el build apunta a chrome88 o menos',async()=>{
    const {targets}=await targetOfBuild(root);
    expect(targets.length).toBe(2);
    for(const target of targets)expect(Number(/^chrome(\d+)$/.exec(target??"")?.[1])).toBeLessThanOrEqual(FLOOR);
  });
  test.skipIf(!existsSync(resolve(root,'sketchup_offline/build/planos_santo/ui/app.js')))('el bundle compilado no tiene errores de piso',async()=>{
    expect(errors(await checkBuild(root))).toEqual([]);
  });
});

// The polyfills run in a fresh V8 context where the newer APIs are deleted first,
// as in Chromium 88; the test runner keeps its own native APIs.
async function polyfillBundle(){
  const result=await build({entryPoints:[resolve(root,'sketchup_offline/ui/polyfills.ts')],bundle:true,write:false,format:'iife',target:'chrome88',loader:{'.css':'empty'},logLevel:'silent'});
  return result.outputFiles[0].text;
}

describe('polyfills de ui/polyfills.ts (contexto sin las APIs nuevas)',()=>{
  let context:vm.Context;
  const run=<T,>(code:string)=>vm.runInContext(code,context) as T;
  beforeAll(async()=>{
    context=vm.createContext({crypto:{getRandomValues:(array:Uint8Array)=>webcrypto.getRandomValues(array)}});
    run(`delete Array.prototype.at;delete String.prototype.at;delete Object.getPrototypeOf(Int8Array.prototype).at;
      delete Array.prototype.findLast;delete Array.prototype.findLastIndex;delete Object.hasOwn;delete globalThis.structuredClone;`);
    expect(run('typeof [].at+typeof structuredClone+typeof crypto.randomUUID+typeof Object.hasOwn')).toBe('undefinedundefinedundefinedundefined');
    run(await polyfillBundle());
  });
  test('Array/String/TypedArray at, findLast, findLastIndex, Object.hasOwn',()=>{
    expect(run('JSON.stringify([[1,2,3,4].at(0),[1,2,3,4].at(-1),[1].at(9)===undefined,[1].at(-9)===undefined,"hola".at(-1),new Uint8Array([7,8]).at(-1)])')).toBe('[1,4,true,true,"a",8]');
    expect(run('[1,2,3,4].findLast(v=>v%2===1)+","+[1,2].findLastIndex(v=>v>10)')).toBe('3,-1');
    expect(run('Object.hasOwn({a:1},"a")+","+Object.hasOwn(Object.create({a:1}),"a")')).toBe('true,false');
    expect(run('Object.keys(Array.prototype).length+Object.keys(String.prototype).length')).toBe(0);
  });
  test('crypto.randomUUID versión 4',()=>{
    const ids=run<string>('[crypto.randomUUID(),crypto.randomUUID()].join(" ")').split(' ');
    for(const id of ids)expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
  test('structuredClone copia datos de la guía y conserva ciclos',()=>{
    expect(run(`(()=>{const source={notes:[{id:'n',position:[1,2]}],when:new Date(5),set:new Set(['a']),map:new Map([['k',{v:1}]]),bytes:new Uint8Array([1,2]),hole:[1,,3]};source.self=source;
      const copy=structuredClone(source);
      return [copy!==source,copy.notes[0]!==source.notes[0],JSON.stringify(copy.notes),copy.when.getTime(),[...copy.set].join(),copy.map.get('k').v,[...copy.bytes].join(),copy.self===copy,1 in copy.hole,copy.bytes.buffer!==source.bytes.buffer].join('|');})()`))
      .toBe('true|true|[{"id":"n","position":[1,2]}]|5|a|1|1,2|true|false|true');
    expect(()=>run('structuredClone({f:()=>1})')).toThrow(/could not be cloned/);
  });
  test('no reemplaza las APIs nativas cuando existen',async()=>{
    const native=vm.createContext({crypto:{getRandomValues:()=>{throw new Error('no');},randomUUID:()=>'nativo'}});
    vm.runInContext('globalThis.marker=Array.prototype.at;globalThis.structuredClone=()=>"nativo";',native);
    vm.runInContext(await polyfillBundle(),native);
    expect(vm.runInContext('[Array.prototype.at===marker,structuredClone(1),crypto.randomUUID()].join()',native)).toBe('true,nativo,nativo');
  });
});
