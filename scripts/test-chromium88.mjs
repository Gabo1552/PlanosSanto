#!/usr/bin/env node
// 0.8.26 (SketchUp 2022): runs the offline Playwright suite on a real Chromium 88,
// the engine of UI::HtmlDialog in SketchUp 2021.1-2023 (CEF 88). It is the closest
// check of the built UI available off Windows; it is NOT SketchUp 2022: no CEF
// embedding, no sketchup.* bridge (the specs use their usual bridge drivers),
// Linux fonts and no Windows scaling.
//
//   node scripts/test-chromium88.mjs [playwright test arguments]
//
// Chromium: CHROMIUM88_PATH, or the Chromium snapshot of revision 827102
// (88.0.4324.0, the M88 branch point) downloaded once into node_modules/.cache.
// Playwright 1.56 calls Element.checkVisibility (Chromium 105) inside its own
// injected script; for this run only, that call is guarded in node_modules and
// restored afterwards. The app bundle is never touched. Specs that build their own
// harness bundle get chrome88 + polyfills (scripts/chromium88-esbuild-preload.cjs).
// Known Playwright 1.56 limits on Chromium 88, not app faults: mouse.move needs
// Input.setInterceptDrags, page.clock and the "download" event do not work.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const REVISION='827102';
let chrome=process.env.CHROMIUM88_PATH;
if(!chrome){
  const folder=resolve(root,`node_modules/.cache/chromium-${REVISION}`);
  chrome=resolve(folder,'chrome-linux/chrome');
  if(!existsSync(chrome)){
    mkdirSync(folder,{recursive:true});
    const zip=resolve(folder,'chrome-linux.zip');
    const url=`https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${REVISION}/chrome-linux.zip`;
    console.log(`Descargando Chromium 88 (r${REVISION}) de ${url}`);
    if(spawnSync('curl',['-fsSL','-o',zip,url],{stdio:'inherit'}).status!==0)process.exit(1);
    if(spawnSync('python3',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',zip,folder],{stdio:'inherit'}).status!==0)process.exit(1);
    spawnSync('chmod',['-R','u+x',resolve(folder,'chrome-linux')]);
    rmSync(zip,{force:true});
  }
}
const version=spawnSync(chrome,['--version'],{encoding:'utf8'}).stdout.trim();
if(!/Chromium 88\./.test(version)){console.error(`Se esperaba Chromium 88 y se encontró «${version||chrome}».`);process.exit(1);}
console.log(`Navegador: ${version} (${chrome})`);

const bundle=resolve(root,'node_modules/playwright-core/lib/coreBundle.js');
const original=readFileSync(bundle,'utf8');
const needle='if (!element.checkVisibility() && !isWebKitListBoxOptionVisible(element, style))';
const guarded='if (typeof element.checkVisibility === "function" && !element.checkVisibility() && !isWebKitListBoxOptionVisible(element, style))';
const backup=`${bundle}.chromium88-backup`;
let patched=false;
if(original.includes(needle)){
  copyFileSync(bundle,backup);writeFileSync(bundle,original.split(needle).join(guarded));patched=true;
}else if(!original.includes(guarded))console.log('aviso: no se encontró la llamada a checkVisibility de Playwright; se corre sin parche.');
const restore=()=>{if(patched){copyFileSync(backup,bundle);rmSync(backup,{force:true});patched=false;}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{restore();process.exit(130);});
let status=1;
try{
  const args=process.argv.slice(2);
  const result=spawnSync('npx',['playwright','test','--config','playwright.offline.config.ts',...(args.length?args:['--reporter=line'])],
    {cwd:root,stdio:'inherit',env:{...process.env,CHROMIUM_PATH:chrome,PLANOS_CHROMIUM88:'1',
      // Harness bundles built inside the specs also go to chrome88 with the polyfills.
      NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --require ${resolve(root,'scripts/chromium88-esbuild-preload.cjs')}`.trim()}});
  status=result.status??1;
}finally{restore();}
console.log(`Chromium 88: Playwright terminó con código ${status}. Esto es Chromium 88 suelto, no SketchUp 2022.`);
process.exit(status);
