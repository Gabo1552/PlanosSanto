/**
 * Antes y después de la hoja A4 (0.8.29) con un mueble SINTÉTICO de 17 piezas, en 1 y 2 vistas.
 * «antes» compila el exportador de d9533aa (0.8.28) leyendo sus fuentes con `git show`; «después», el del árbol.
 * Escribe en docs/validacion-0829/ux/ las capturas PNG, los PDF y MEDIDAS-A4.json. No abre SketchUp.
 * Uso: node docs/validacion-0829/capturas-a4.mjs
 */
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const BEFORE='d9533aa';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'docs/validacion-0829/ux');
const scratch=await mkdtemp(join(tmpdir(),'ps29-a4-'));
const entry=`
import {readFileSync} from 'node:fs';
import {composeA4,createOfflinePdfPages,metricFont} from './sketchup_offline/ui/pdf';
import {createA4Demo} from './lib/a4Demo';
const MM=72/25.4,mm=(v)=>+(v/MM).toFixed(1);
export async function run(){
 const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),logo=readFileSync('sketchup_offline/assets/santo-carpintero.png');
 const fonts={regular:metricFont(regular),mono:metricFont(mono)},results={};
 for(const mode of ['exterior','both']){
  // Sin «Agrupar componentes iguales»: la hoja de antes lista una fila por pieza.
  const p=createA4Demo(),f=p.furniture[0];f.groupIdentical=false;f.presentation.guide.mode=mode;
  const c=composeA4(p,f,fonts);
  const views=c.scenes.map(({view,scene,box})=>{
   const unit=box.width/scene.width,xs=[],ys=[];
   for(const face of scene.faces)for(const pair of face.points.split(' ')){const [x,y]=pair.split(',').map(Number);xs.push(x);ys.push(y);}
   return {view,cajaMm:{x:mm(box.x),arriba:mm(box.top),ancho:mm(box.width),alto:mm(box.height)},muebleDibujadoMm:{ancho:mm((Math.max(...xs)-Math.min(...xs))*unit),alto:mm((Math.max(...ys)-Math.min(...ys))*unit)},textoIdCotasPt:+(13*unit).toFixed(2)};
  });
  const rows=c.rows.length,quantity=c.rows.reduce((n,r)=>n+r.piece.quantity,0);
  const {bytes}=await createOfflinePdfPages(p,regular,mono,logo);
  results[mode==='exterior'?'1-vista':'2-vistas']={views,filasListado:rows,sumaCant:quantity,piezas:f.pieces.length,leyendaArribaMm:mm(c.legendTop),...(c.notesBox?{notasDelArmadorMm:{arriba:mm(c.notesBox.top),alto:mm(c.notesBox.height)}}:{}),bytes:Buffer.from(bytes).toString('base64')};
 }
 return results;
}`;
try{
 await mkdir(out,{recursive:true});
 const measures={};
 for(const variant of ['antes','despues']){
  const outfile=join(scratch,variant+'.cjs');
  const old=['sketchup_offline/ui/pdf.ts','lib/pieceGroups.ts','lib/scene.ts','lib/sheet.ts'];
  const plugin={name:'antes',setup(b){b.onLoad({filter:/\.(ts|tsx)$/},({path})=>{const rel=path.slice(root.length+1);if(!old.includes(rel))return undefined;return {contents:execFileSync('git',['show',`${BEFORE}:${rel}`],{cwd:root,encoding:'utf8'}),loader:'ts'};});}};
  await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},platform:'node',format:'cjs',bundle:true,outfile,logLevel:'silent',plugins:variant==='antes'?[plugin]:[]});
  const results=await createRequire(import.meta.url)(outfile).run();
  for(const [name,data] of Object.entries(results)){
   const base=join(out,`A4-${variant}-${name}-SINTETICO`),pdf=base+'.pdf';
   await writeFile(pdf,Buffer.from(data.bytes,'base64'));delete data.bytes;
   execFileSync('pdftoppm',['-png','-singlefile','-r','110','-f','1','-l','1',pdf,base]);
   // Header: top of the first text under the header strip (the «VISTA …» band), read from the real PDF.
   const bbox=execFileSync('pdftotext',['-bbox','-f','1','-l','1',pdf,'-'],{encoding:'utf8'});
   const vista=[...bbox.matchAll(/<word xMin="[\d.]+" yMin="([\d.]+)"[^>]*>VISTA<\/word>/g)].map(m=>Number(m[1]));
   data.bandaVistaArribaMm=+(Math.min(...vista)*25.4/72).toFixed(1);
   if(variant==='antes')await rm(pdf);
  }
  measures[variant]=results;
 }
 await writeFile(join(out,'MEDIDAS-A4.json'),JSON.stringify({nota:'SINTÉTICO: createA4Demo sin «Agrupar componentes iguales». Medidas en mm desde el borde superior izquierdo de la hoja.',antes:BEFORE,...measures},null,2)+'\n');
 console.log(JSON.stringify(measures,null,2));
}finally{await rm(scratch,{recursive:true,force:true});}
