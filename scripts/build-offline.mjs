import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'sketchup_offline/build');
const {version}=JSON.parse(await readFile(resolve(root,'sketchup_offline/version.json'),'utf8'));
await rm(out,{recursive:true,force:true});await mkdir(resolve(out,'planos_santo/ui'),{recursive:true});
const bundle=await build({absWorkingDir:root,entryPoints:['sketchup_offline/ui/index.tsx'],outfile:resolve(out,'planos_santo/ui/app.js'),bundle:true,
  platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',minify:true,metafile:true,legalComments:'eof',
  define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64','.svg':'base64'}});
const palette=await build({absWorkingDir:root,entryPoints:['sketchup_offline/ui/palette.tsx'],outfile:resolve(out,'planos_santo/ui/palette.js'),bundle:true,
  platform:'browser',format:'iife',target:'chrome109',jsx:'automatic',minify:true,metafile:true,legalComments:'eof',
  define:{'process.env.NODE_ENV':'"production"'},loader:{'.ttf':'base64','.png':'base64','.svg':'base64'}});
const copies={
  'planos_santo.rb':'sketchup_offline/planos_santo.rb',
  'planos_santo/bootstrap.rb':'sketchup_offline/bootstrap.rb',
  'planos_santo/offline.rb':'sketchup_offline/offline.rb',
  'planos_santo/p1_diagnostics.rb':'sketchup_offline/p1_diagnostics.rb',
  'planos_santo/release.rb':'sketchup_offline/release.rb',
  'planos_santo/ocl_reader.rb':'sketchup_offline/ocl_reader.rb',
  'planos_santo/order_references.rb':'sketchup_offline/order_references.rb',
  'planos_santo/cutlist.rb':'sketchup_offline/cutlist.rb',
  'planos_santo/catalog_store.rb':'sketchup_offline/catalog_store.rb',
  'planos_santo/material_resolver.rb':'sketchup_offline/material_resolver.rb',
  'planos_santo/model_material_catalog.rb':'sketchup_offline/model_material_catalog.rb',
  'planos_santo/photo_material.rb':'sketchup_offline/photo_material.rb',
  'planos_santo/paint_materials.rb':'sketchup_offline/paint_materials.rb',
  'planos_santo/ocl_attributes.rb':'sketchup_offline/ocl_attributes.rb',
  'planos_santo/material_policy.rb':'sketchup_offline/material_policy.rb',
  'planos_santo/material_library.rb':'sketchup_offline/material_library.rb',
  'planos_santo/native_paint.rb':'sketchup_offline/native_paint.rb',
  'planos_santo/smart_paint.rb':'sketchup_offline/smart_paint.rb',
  'planos_santo/smart_paint_tool.rb':'sketchup_offline/smart_paint_tool.rb',
  'planos_santo/material_sample_tool.rb':'sketchup_offline/material_sample_tool.rb',
  'planos_santo/quick_toolbar.rb':'sketchup_offline/quick_toolbar.rb',
  'planos_santo/model_watch.rb':'sketchup_offline/model_watch.rb',
  'planos_santo/bounded_zip.rb':'sketchup_offline/bounded_zip.rb',
  'planos_santo/skm_import.rb':'sketchup_offline/skm_import.rb',
  'planos_santo/piece_highlight_tool.rb':'sketchup_offline/piece_highlight_tool.rb',
  'planos_santo/draw_component_tool.rb':'sketchup_offline/draw_component_tool.rb',
  'planos_santo/supplier_order.rb':'sketchup_offline/supplier_order.rb',
  'planos_santo/maderera_profile.rb':'sketchup_offline/maderera_profile.rb',
  'planos_santo/presets-taller.json':'sketchup_offline/presets-taller.json',
  'planos_santo/workshop.rb':'sketchup_offline/workshop.rb',
  'planos_santo/order_proposal.rb':'sketchup_offline/order_proposal.rb',
  'planos_santo/names.rb':'sketchup_offline/names.rb',
  'planos_santo/session.rb':'sketchup_offline/session.rb',
  'planos_santo/guide_store.rb':'sketchup_offline/guide_store.rb',
  'planos_santo/exporter.rb':'sketchup/planos_santo/exporter.rb',
  'planos_santo/ui/palette.html':'sketchup_offline/ui/palette.html',
  'planos_santo/ui/index.html':'sketchup_offline/ui/index.html',
  'planos_santo/icon-24.png':'sketchup/planos_santo/icon-24.png',
  'planos_santo/icon-32.png':'sketchup/planos_santo/icon-32.png',
};
for(const action of ['component','sheet','edge','remove_edge','sample','furniture','order','guides','materials','main']){
  for(const size of [24,32])copies[`planos_santo/icons/${action}-${size}.png`]=`sketchup_offline/icons/${action}-${size}.png`;
  // 0.8.18: vector icon, sharp at any Windows scaling; the PNGs stay as fallback.
  copies[`planos_santo/icons/${action}.svg`]=`sketchup_offline/icons/${action}.svg`;
}
// Own paint cursors (Hito 2, PINTURA-12); the Tool degrades to the native cursor if one is missing.
// 0.8.20: SVG (Windows, sharp at any scaling) and 64 px PNG (>= 150 % without the SVG) next to the 32 px PNG.
for(const key of ['piece','edge','remove','blocked','sample'])for(const name of [`paint-${key}.png`,`paint-${key}-64.png`,`paint-${key}.svg`])copies[`planos_santo/cursors/${name}`]=`sketchup_offline/cursors/${name}`;
await mkdir(resolve(out,'planos_santo/icons'),{recursive:true});
await mkdir(resolve(out,'planos_santo/cursors'),{recursive:true});
for(const [target,source] of Object.entries(copies)){
  if(target==='planos_santo/exporter.rb'){
    const original=await readFile(resolve(root,source),'utf8');
    await writeFile(resolve(out,target),original.replace("  VERSION = '0.3.0'","  VERSION = Release::VERSION").replace("require 'json'","require 'json'\nrequire_relative 'release'"));
  }else await copyFile(resolve(root,source),resolve(out,target));
}
const packages=new Set();
for(const input of [...Object.keys(bundle.metafile.inputs),...Object.keys(palette.metafile.inputs)]){
  const match=input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);if(match)packages.add(match[1]);
}
let licenses=`Planos Santo ${version} — dependencias distribuidas localmente\n\n`;
for(const name of [...packages].sort()){
  const packageRoot=resolve(root,'node_modules',name),pkg=JSON.parse(await readFile(resolve(packageRoot,'package.json'),'utf8'));
  let license;
  for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','COPYING']){
    try{license=await readFile(resolve(packageRoot,file),'utf8');break;}catch{}
  }
  if(!license&&name==='@pdf-lib/fontkit')license=await readFile(resolve(root,'sketchup_offline/licenses/fontkit-NOTICE.txt'),'utf8');
  if(!license)throw new Error(`Falta revisar la licencia de ${name}`);
  licenses+=`${name} ${pkg.version}\n${license}\n\n`;
}
licenses+='DejaVu Sans / DejaVu Sans Mono\n'+await readFile(resolve(root,'sketchup_offline/assets/FONT-LICENSE.txt'),'utf8');
await writeFile(resolve(out,'planos_santo/THIRD_PARTY_LICENSES.txt'),licenses);
const contents={};
for(const path of [...Object.keys(copies),'planos_santo/ui/app.js','planos_santo/ui/app.css','planos_santo/ui/palette.js','planos_santo/ui/palette.css','planos_santo/THIRD_PARTY_LICENSES.txt'].sort()){
  contents[path]=createHash('sha256').update(await readFile(resolve(out,path))).digest('hex');
}
await writeFile(resolve(out,'planos_santo/manifest.json'),JSON.stringify({name:'Planos Santo',version,target:'SketchUp 2026 Windows',
  validation:'PENDIENTE de ejecución y aceptación del operador en SketchUp 2026',pdf:'pdf-lib local vectorial',serverRequired:false,files:contents},null,2));
await mkdir(resolve(root,'artifacts'),{recursive:true});
await writeFile(resolve(root,'artifacts/offline-bundle-inputs.json'),JSON.stringify({packages:[...packages].sort(),files:Object.keys(contents),entries:{editorInputs:Object.keys(bundle.metafile.inputs),paletteInputs:Object.keys(palette.metafile.inputs)}},null,2));
const result=spawnSync('python3',['scripts/package-offline-rbz.py'],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(1);
console.log(`Editor local compilado en ${relative(root,dirname(resolve(out,'planos_santo/ui/app.js')))}; sin dependencias de red en ejecución.`);
