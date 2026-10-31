#!/usr/bin/env node
// 0.8.26 (SketchUp 2022): reproducible Ruby 2.7 / SketchUp 2022 API check of every
// Ruby file that goes into the RBZ, plus every non-test sketchup_offline/*.rb.
//
//   node scripts/check-ruby27.mjs            (npm run check:ruby27)
//
// - Installs, once, the pinned gems parser (Ruby 2.7 grammar) and
//   sketchup-api-stubs (YARD "@version SketchUp 20xx" of each API method) into
//   node_modules/.cache/planos-ruby27 with the host Ruby (3.x is fine).
// - Runs scripts/check-ruby27.rb on the files (syntax, Ruby >= 3.0 methods,
//   SketchUp API 2023+ without a guard).
// - Checks that every require_relative of an RBZ file is itself in the RBZ.
// - With RUBY27_BIN=/path/to/ruby-2.7, also runs `ruby -wc` with that real
//   interpreter; node scripts/fetch-ruby27.mjs leaves one in node_modules/.cache/ruby-2.7,
//   which is used automatically.
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,dirname,relative,basename} from 'node:path';
import {ruby} from './ruby-bin.mjs';

const root=resolve(import.meta.dirname,'..');
const GEMS={parser:'3.3.13.0','sketchup-api-stubs':'0.7.11'};
const gemHome=resolve(root,'node_modules/.cache/planos-ruby27');
const env={...process.env,GEM_HOME:gemHome,GEM_PATH:gemHome};
if(!/utf-?8/i.test(`${env.LC_ALL||''}${env.LC_CTYPE||''}${env.LANG||''}`)){env.LANG='C.UTF-8';env.LC_ALL='C.UTF-8';}

function installed(name,version){return existsSync(resolve(gemHome,'gems',`${name}-${version}`));}
const missing=Object.entries(GEMS).filter(([name,version])=>!installed(name,version));
if(missing.length){
  mkdirSync(gemHome,{recursive:true});
  const result=spawnSync('gem',['install','--no-document','--install-dir',gemHome,...missing.map(([n,v])=>`${n}:${v}`)],{stdio:'inherit',env});
  if(result.status!==0){console.error(`No se pudieron instalar ${missing.map(([n,v])=>`${n} ${v}`).join(', ')} (rubygems.org). Instalalas en ${gemHome} y repetí.`);process.exit(1);}
}

// RBZ Ruby files: the `copies` map of build-offline.mjs (target -> source).
const build=readFileSync(resolve(root,'scripts/build-offline.mjs'),'utf8');
const copies=[...build.matchAll(/'(planos_santo[^']*\.rb)':'([^']+\.rb)'/g)].map(m=>({target:m[1],source:m[2]}));
if(copies.length<20){console.error('No se encontró la lista de archivos Ruby del RBZ en scripts/build-offline.mjs.');process.exit(1);}
const extra=readdirSync(resolve(root,'sketchup_offline')).filter(name=>name.endsWith('.rb')).map(name=>`sketchup_offline/${name}`);
const sources=[...new Set([...copies.map(c=>c.source),...extra])].filter(file=>existsSync(resolve(root,file)));
const builtExporter='sketchup_offline/build/planos_santo/exporter.rb';
const files=[...sources,...(existsSync(resolve(root,builtExporter))?[builtExporter]:[])];

let failed=false;
// Load chain: an RBZ file that require_relative's something outside the RBZ breaks the install.
const inRbz=new Set(copies.map(c=>c.target));
const notPackaged=extra.filter(file=>!copies.some(c=>c.source===file));
for(const {target,source} of copies){
  const text=readFileSync(resolve(root,source),'utf8');
  for(const match of text.matchAll(/^\s*require_relative\s+['"]([^'"]+)['"]/gm)){
    const wanted=relative(root,resolve(root,dirname(target),match[1].endsWith('.rb')?match[1]:`${match[1]}.rb`));
    if(!inRbz.has(wanted)){console.log(`ERROR ${source}: require_relative '${match[1]}' no está en el RBZ (agregalo a copies en scripts/build-offline.mjs)`);failed=true;}
  }
}
if(notPackaged.length)console.log(`aviso: fuera del RBZ (no se instalan): ${notPackaged.map(f=>basename(f)).join(', ')}`);

const stubs=resolve(gemHome,'gems',`sketchup-api-stubs-${GEMS['sketchup-api-stubs']}`,'lib/sketchup-api-stubs/stubs');
const analyze=list=>spawnSync(ruby,[resolve(root,'scripts/check-ruby27.rb'),'--stubs',stubs,...list],{cwd:root,encoding:'utf8',env});

// Self-test first: each «espera:» line of the fixtures must be reported, and no
// other line; each sintaxis_*.rb must fail to parse as Ruby 2.7.
const fixtures=resolve(root,'scripts/fixtures/ruby27');
const fixtureFiles=readdirSync(fixtures).filter(name=>name.endsWith('.rb')).map(name=>relative(root,resolve(fixtures,name)));
const self=analyze(fixtureFiles);
const reported=(self.stdout||'').split('\n').map(text=>/^(?:ERROR|aviso) (.+?):(\d+): (.*)$/.exec(text)).filter(Boolean).map(m=>({file:m[1],line:Number(m[2]),message:m[3]}));
const selfErrors=[];
for(const file of fixtureFiles){
  const lines=readFileSync(resolve(root,file),'utf8').split('\n');
  const mine=reported.filter(r=>r.file===file);
  if(basename(file).startsWith('sintaxis_')){
    if(!mine.some(r=>r.message.startsWith('sintaxis Ruby 2.7')))selfErrors.push(`${file}: se esperaba un error de sintaxis Ruby 2.7`);
    continue;
  }
  lines.forEach((text,index)=>{
    const expected=/# espera: (.+)$/.exec(text)?.[1];
    const here=mine.filter(r=>r.line===index+1);
    if(expected&&!here.some(r=>r.message.includes(expected)))selfErrors.push(`${file}:${index+1}: falta «${expected}» (${here.map(r=>r.message).join(' | ')||'sin hallazgos'})`);
    if(!expected&&here.length)selfErrors.push(`${file}:${index+1}: hallazgo inesperado: ${here.map(r=>r.message).join(' | ')}`);
  });
}
if(self.status===0||selfErrors.length){
  console.log(`ERROR la autoprueba de scripts/check-ruby27.rb falló:\n${selfErrors.join('\n')||self.stderr||'el chequeo no reportó las violaciones de prueba'}`);
  process.exit(1);
}
console.log(`Autoprueba del chequeo: ${fixtureFiles.length} archivos de prueba, ${reported.length} hallazgos esperados.`);

const check=analyze(files);
process.stdout.write(check.stdout||'');process.stderr.write(check.stderr||'');
if(check.status!==0)failed=true;

const cachedRuby27=resolve(root,'node_modules/.cache/ruby-2.7/ruby27');
const ruby27=process.env.RUBY27_BIN||(existsSync(cachedRuby27)?cachedRuby27:'');
if(ruby27){
  process.env.RUBY27_BIN=ruby27;
  const version=spawnSync(process.env.RUBY27_BIN,['-e','print RUBY_VERSION'],{encoding:'utf8',env:process.env}).stdout;
  if(!/^2\.7\./.test(version||'')){console.log(`ERROR RUBY27_BIN no es Ruby 2.7 (${version||'sin respuesta'})`);failed=true;}
  else for(const file of files){
    const result=spawnSync(process.env.RUBY27_BIN,['-wc',file],{cwd:root,encoding:'utf8',env:process.env});
    if(result.status!==0){console.log(`ERROR ruby ${version} -wc ${file}\n${result.stderr}`);failed=true;}
  }
  if(!failed)console.log(`Ruby ${version} real: sintaxis OK en ${files.length} archivos.`);
}else console.log('Sin Ruby 2.7 real (RUBY27_BIN o node scripts/fetch-ruby27.mjs): sintaxis 2.7 comprobada sólo con parser (Parser::Ruby27).');

process.exit(failed?1:0);
