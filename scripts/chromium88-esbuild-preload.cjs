// 0.8.26: loaded with --require only by scripts/test-chromium88.mjs. Several offline
// specs bundle their own harness with esbuild (target chrome109, without
// ui/polyfills.ts). For the Chromium 88 run, each browser bundle is lowered to
// chrome88 and gets the polyfills injected, like the real app.js/palette.js. The
// specs and the shipped bundles are not changed. esbuild's exports are read-only
// getters, so require('esbuild') returns a copy with a wrapped build().
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload for node --require */
const path=require('node:path');
const Module=require('node:module');
const polyfills=path.resolve(__dirname,'../sketchup_offline/ui/polyfills.ts');
const load=Module._load;
let wrapped;
Module._load=function(request){
  const exported=load.apply(this,arguments);
  if(request!=='esbuild')return exported;
  if(!wrapped){
    const build=exported.build;
    wrapped={...exported,build(options={}){
      const own=(options.entryPoints||[]).some(entry=>String(entry).endsWith('polyfills.ts'));
      if(options.platform==='browser'&&!own){
        // Without an output path esbuild cannot emit the CSS that polyfills.ts imports.
        const css=options.outfile||options.outdir?{}:{'.css':'empty'};
        options={...options,target:'chrome88',inject:[...(options.inject||[]),polyfills],loader:{...css,...(options.loader||{})}};
      }
      return build(options);
    }};
  }
  return wrapped;
};
