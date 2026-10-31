import {describe,expect,it} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Matrix4} from 'three';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {A4_LAYOUT,NOTES_TITLE,a4ViewScene,composeA4,createOfflinePdfPages,exportTableTsv,listRows,metricFont,type OrderReference} from '../sketchup_offline/ui/pdf';
import {physicalGroups,sheetGroups} from '../lib/pieceGroups';
import {sheetEntries} from '../lib/sheet';
import {createDemo,box} from '../lib/demo';
import {createA4Demo} from '../lib/a4Demo';
import {identity,type Furniture,type Project} from '../lib/model';

// 0.8.29 · Hoja A4: listado siempre agrupado, «Notas del armador» y encabezado bajo. Fixtures SINTÉTICOS; no es SketchUp.
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'),logo=readFileSync('sketchup_offline/assets/santo-carpintero.png');
const fonts={regular:metricFont(regular),mono:metricFont(mono)};
const MM=72/25.4,toMm=(pt:number)=>pt/MM;
/** Módulo bajo del demo: dos laterales de una misma definición, base, tapa, estante y fondo. */
function module(mode:'exterior'|'both'='exterior'):Project{
 const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0];
 f.presentation={guide:{mode,hiddenPieceIds:[],sharedCamera:true,observations:''}};
 f.pieces[0].name='Lateral';f.pieces[1].name='Lateral';
 return project;
}
const meta=()=>({persistentId:'1',instancePath:[],originalName:'',definitionName:'',hidden:false,effectiveVisible:true,tag:'',material:null,worldTransform:identity(),warnings:[]});
const paint=(f:Furniture,index:number,id:string)=>{const p=f.pieces[index];p.mesh={...p.mesh,faceMaterials:p.mesh.triangles.map(()=>({front:{id,name:id,color:[120,90,70] as [number,number,number],opacity:1,textured:false},back:null}))};};
const quantities=(f:Furniture,references?:Record<string,OrderReference>)=>listRows(f,references).map(r=>[r.piece.code,r.piece.name,r.piece.quantity]);
const edges=(edgeMap:number[]):OrderReference=>({text:'TEST-18 / 18 mm',board:'TEST-18 / 18 mm',edgeMap,principal:'EDGE-P',secondary:'EDGE-S',base:700,height:450});
function pdftotext(bytes:Uint8Array,args:string[]){const dir=mkdtempSync(join(tmpdir(),'ps-a4-0829-'));try{const path=join(dir,'hoja.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',[...args,path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
/** Words of one page with their box in mm (pdftotext -bbox). */
function words(bytes:Uint8Array,page=1){
 return [...pdftotext(bytes,['-bbox','-f',String(page),'-l',String(page)]).matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
  .map(m=>({x1:toMm(+m[1]),y1:toMm(+m[2]),x2:toMm(+m[3]),y2:toMm(+m[4]),text:m[5].replace(/&amp;/g,'&')}));
}

describe('0.8.29 · listado A4 siempre agrupado',()=>{
 it('dos laterales iguales van en una fila con Cant. 2 aunque no se agrupen componentes iguales',async()=>{
  const project=module(),f=project.furniture[0];expect(f.groupIdentical).toBeFalsy();
  expect(quantities(f)).toEqual([['P01','Lateral',2],['P03','Base',1],['P04','Tapa',1],['P05','Estante',1],['P06','Fondo',1]]);
  const {bytes}=await createOfflinePdfPages(project,regular,mono);
  const table=pdftotext(bytes,['-raw']).replace(/\s+/g,' ');
  expect(table).toContain('P01 Lateral 700 450 18 2');expect(table).not.toMatch(/\bP02\b/);
 });
 it('junta piezas iguales de definiciones distintas, también un tablero liso espejado',()=>{
  const f=module().furniture[0];
  f.pieces[1].definition='otra definición';expect(quantities(f)[0]).toEqual(['P01','Lateral',2]);
  // A plain board and its mirrored copy are cut the same.
  f.pieces[1].transform=new Matrix4().makeScale(-1,1,1).setPosition(800,0,0).toArray();expect(quantities(f)[0]).toEqual(['P01','Lateral',2]);
  // Name suggestions keep their own rule: the mirrored copy stays apart there.
  const together=(groups:{id:string}[][][])=>groups.some(g=>g.flat().filter(p=>p.id===f.pieces[0].id||p.id===f.pieces[1].id).length===2);
  expect(together(sheetGroups(f))).toBe(true);expect(together(physicalGroups(f))).toBe(false);
 });
 it('separa piezas con otro nombre, medida, material, pintura, veta o cantos del pedido',()=>{
  const separated=(change:(f:Furniture)=>void,references?:(f:Furniture)=>Record<string,OrderReference>)=>{const f=module().furniture[0];change(f);return quantities(f,references?.(f)).slice(0,2);};
  const apart=[['P01','Lateral',1],['P02','Lateral',1]];
  expect(separated(f=>{f.pieces[1].name='Lateral derecho';})).toEqual([['P01','Lateral',1],['P02','Lateral derecho',1]]);
  expect(separated(f=>{f.pieces[1].mesh=box(18,450,701);f.pieces[1].dimensions=[701,450,18];})).toEqual(apart);
  expect(separated(f=>{f.pieces[1].metadata={...meta(),material:{id:'roble',name:'Roble',color:[120,90,70],opacity:1,textured:false}};f.pieces[0].metadata=meta();})).toEqual(apart);
  expect(separated(f=>paint(f,1,'pintura-nogal'))).toEqual(apart);
  expect(separated(f=>{f.pieces[0].metadata={...meta(),grainAxis:2};f.pieces[1].metadata={...meta(),grainAxis:1};})).toEqual(apart);
  expect(separated(()=>undefined,f=>({[f.pieces[0].id]:edges([1,1,0,2]),[f.pieces[1].id]:edges([1,1,2,0])}))).toEqual(apart);
  // Same order row: one row; within ±0,5 mm and the same grain: one row too.
  expect(separated(()=>undefined,f=>({[f.pieces[0].id]:edges([1,1,0,2]),[f.pieces[1].id]:edges([1,1,0,2])}))[0]).toEqual(['P01','Lateral',2]);
  expect(separated(f=>{f.pieces[1].mesh=box(18,450,700.4);f.pieces[1].dimensions=[700.4,450,18];f.pieces[0].metadata={...meta(),grainAxis:2};f.pieces[1].metadata={...meta(),grainAxis:2};})[0]).toEqual(['P01','Lateral',2]);
 });
 it('la columna Cant. suma todas las piezas del mueble y «Copiar tabla» conserva los códigos agrupados',()=>{
  for(const project of [module(),createA4Demo()]){
   const f=project.furniture[0];f.groupIdentical=false;
   const rows=listRows(f);expect(rows.length).toBeLessThan(f.pieces.length);
   expect(rows.reduce((n,r)=>n+r.piece.quantity,0)).toBe(f.pieces.length);
   expect(new Set(rows.flatMap(r=>r.piece.memberIds)).size).toBe(f.pieces.length);
  }
  const tsv=exportTableTsv(module()).text.split('\r\n');
  expect(tsv[0]).toBe('Mueble\tID\tNombre\tLargo\tAncho\tEsp.\tCant.\tTambién');expect(tsv[1].split('\t').slice(1)).toEqual(['P01','Lateral','700','450','18','2','P02']);
 });
 it('con IDs a la vista la fila usa el ID de su primera pieza y el dibujo lo marca una vez con ×N, igual en el visor',async()=>{
  const project=module('both'),f=project.furniture[0];f.pieces[1].definition='otra definición';f.presentation!.hideIds=false;
  f.notes=[{id:'n1',pieceId:f.pieces[1].id,anchor:[9,200,350],position:[0,0],text:'Atornillar desde adentro'}];
  const composed=composeA4(project,f,fonts);
  for(const {view,scene} of composed.scenes){
   const lateral=scene.labels.filter(l=>l.code==='P01');expect(lateral).toHaveLength(1);
   if(view==='front')expect(lateral[0].quantity).toBe(2);
   expect(scene.labels.some(l=>l.code==='P02')).toBe(false);
   // The editor viewer composes the very same scene.
   expect(JSON.stringify(a4ViewScene(f,view,fonts).labels)).toBe(JSON.stringify(scene.labels));
  }
  expect(composed.legendLines.join(' ')).toContain('1 · P01 · Atornillar desde adentro');
  expect(composed.legendLines.join(' ')).toContain('ID compartido: piezas iguales en nombre, medidas, material y cantos.');
  const text=pdftotext((await createOfflinePdfPages(project,regular,mono)).bytes,['-raw']);expect(text).toContain('P01 ×2');expect(text).not.toMatch(/\bP02\b/);
  // Outside the A4 (web print, editor) the legend keeps the model codes.
  expect(sheetEntries(f).join(' ')).toContain('1 · P02 · Atornillar');
 });
});

describe('0.8.29 · «Notas del armador», encabezado bajo y vistas más grandes',()=>{
 it('el recuadro «Notas del armador» está debajo de la tabla, llega al pie del contenido y nunca baja de 35 mm',async()=>{
  const project=module(),f=project.furniture[0],composed=composeA4(project,f,fonts);
  expect(composed.notesBox.top).toBeGreaterThan(composed.tableBottom);
  expect(toMm(composed.notesBox.top+composed.notesBox.height)).toBeCloseTo(A4_LAYOUT.contentBottom,6);
  expect(toMm(composed.notesBox.height)).toBeGreaterThanOrEqual(A4_LAYOUT.notesMin);
  expect(toMm(composed.notesBox.x)).toBeCloseTo(A4_LAYOUT.tableX,6);expect(toMm(composed.notesBox.width)).toBeCloseTo(A4_LAYOUT.tableWidth,6);
  const {bytes}=await createOfflinePdfPages(project,regular,mono),page=words(bytes);
  const title=page.find(w=>w.text==='ARMADOR')!,lastRow=page.filter(w=>w.text==='Fondo'&&w.x1>A4_LAYOUT.tableX)[0];
  expect(title.y1).toBeGreaterThan(lastRow.y2);expect(title.x1).toBeGreaterThan(A4_LAYOUT.tableX);
  // The longest list that stays on page 1 still leaves notesMin.
  const long=module(),g=long.furniture[0],template=g.pieces[0];
  for(let count=10;count<60;count++){
   g.pieces=Array.from({length:count},(_,i)=>({...template,id:`p/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,300+i,700),dimensions:[700,300+i,18] as [number,number,number]}));
   const c=composeA4(long,g,fonts);if(c.detailSheets)break;
   expect(toMm(c.notesBox.height)).toBeGreaterThanOrEqual(A4_LAYOUT.notesMin-1e-9);
  }
 },60000);
 it('reemplaza la línea «Observaciones:» por el recuadro y conserva las notas automáticas compactas',async()=>{
  const project=module(),f=project.furniture[0];
  const text=pdftotext((await createOfflinePdfPages(project,regular,mono)).bytes,['-raw']).replace(/\s+/g,' ');
  expect(text).toContain(NOTES_TITLE);expect(text).toContain('NOTAS Y OBSERVACIONES DE ARMADO');expect(text).not.toContain('Observaciones:');
  f.presentation!.guide!.observations='Verificar escuadra antes del ajuste final.';
  const withObservations=pdftotext((await createOfflinePdfPages(project,regular,mono)).bytes,['-raw']).replace(/\s+/g,' ');
  expect(withObservations.match(/Observaciones de armado: Verificar escuadra/g)).toHaveLength(1);expect(withObservations).toContain(NOTES_TITLE);
 });
 it('el encabezado ocupa una franja de 10 mm (antes 25 mm) y nada impreso baja de 6 pt',async()=>{
  const project=module(),{bytes}=await createOfflinePdfPages(project,regular,mono,logo),page=words(bytes);
  const header=page.filter(w=>w.y2<A4_LAYOUT.headerRule);
  const strip=header.map(w=>w.text).join(' ');
  for(const value of ['Módulo bajo · 800','GUÍA DE ARMADO · Taller · Proyecto de demostración','Hoja 1 de 1 · 6 piezas','A4 horizontal · medidas en mm'])expect(strip).toContain(value);
  expect(Math.max(...header.map(w=>w.y2))).toBeLessThan(A4_LAYOUT.headerRule);expect(Math.min(...header.map(w=>w.y1))).toBeGreaterThanOrEqual(A4_LAYOUT.margin-1);
  // First content under the header: the «VISTA EXTERIOR» band at about 21 mm (0.8.28: 38,2 mm, docs/validacion-0829/ux/MEDIDAS-A4.json).
  const band=page.find(w=>w.text==='VISTA')!;expect(band.y1).toBeLessThan(23);expect(band.y1).toBeGreaterThan(A4_LAYOUT.headerRule);
  expect(page.some(w=>w.text==='FICHA')).toBe(false);
  // Side margins of at least 8 mm and a footer inside 202 mm.
  expect(Math.min(...page.map(w=>w.x1))).toBeGreaterThanOrEqual(A4_LAYOUT.margin-0.5);expect(Math.max(...page.map(w=>w.x2))).toBeLessThanOrEqual(297-A4_LAYOUT.margin+0.5);expect(Math.max(...page.map(w=>w.y2))).toBeLessThan(202);
  const pdf=await PDFDocument.load(bytes);
  const content=pdf.context.enumerateIndirectObjects().flatMap(([,object])=>object instanceof PDFRawStream?[Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')]:[]).join('\n');
  const sizes=[...content.matchAll(/\/[\w-]+ ([\d.]+) Tf/g)].map(m=>Number(m[1]));
  expect(sizes.length).toBeGreaterThan(0);expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6.99);
 });
 it('las vistas son más grandes que en 0.8.28, medidas en la escena: 1 vista +25 % y 2 vistas +6 % de mueble dibujado',()=>{
  // 0.8.28 (d9533aa), mismo mueble SINTÉTICO: cajas 177 × 124,7 mm y 86 × 125 mm; mueble dibujado 100,9 mm y 60,2 mm de ancho.
  const before={exterior:{box:[177,124.7],drawn:100.9},both:{box:[86,125],drawn:60.2}};
  for(const mode of ['exterior','both'] as const){
   const project=createA4Demo(),f=project.furniture[0];f.groupIdentical=false;f.presentation!.guide!.mode=mode;
   for(const {scene,box:frame} of composeA4(project,f,fonts).scenes){
    expect(toMm(frame.top)).toBeCloseTo(A4_LAYOUT.contentTop,6);
    expect(toMm(frame.width)).toBeGreaterThan(before[mode].box[0]);expect(toMm(frame.height)).toBeGreaterThan(before[mode].box[1]+25);
    const xs=scene.faces.flatMap(face=>face.points.split(' ').map(pair=>Number(pair.split(',')[0]))),drawn=toMm((Math.max(...xs)-Math.min(...xs))*frame.width/scene.width);
    // Two views are limited by their width (the scene fits 70 % of it): the height gained only helps one view.
    expect(drawn).toBeGreaterThan(before[mode].drawn*(mode==='exterior'?1.25:1.06));
    // IDs and cotas keep their printed size (9,9 pt).
    expect(13*frame.width/scene.width).toBeCloseTo(9.9,1);
   }
  }
 });
 it('una lista larga pasa a la hoja 2 y la hoja 1a deja «Notas del armador» bajo el aviso',async()=>{
  const project=module(),f=project.furniture[0],template=f.pieces[0];
  f.pieces=Array.from({length:26},(_,i)=>({...template,definition:undefined,id:`p/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,300+i,700),dimensions:[700,300+i,18] as [number,number,number]}));
  f.presentation={guide:{mode:'interior',hiddenPieceIds:f.pieces.slice(1).map(p=>p.id),sharedCamera:true,observations:''}};
  const composed=composeA4(project,f,fonts);expect(composed.detailSheets).toBeDefined();
  expect(toMm(composed.notesBox.height)).toBeGreaterThan(140);
  const {bytes,pages}=await createOfflinePdfPages(project,regular,mono);expect(pages.map(p=>p.label)).toEqual(['1a','1b']);
  const first=pdftotext(bytes,['-raw','-f','1','-l','1']).replace(/\s+/g,' ');
  expect(first).toContain('El despiece completo de 26 piezas sigue en la hoja 1b, agrupado por placa.');expect(first).toContain(NOTES_TITLE);
  // Hoja 2 starts under the same low header: its column titles at about 26 mm (0.8.28: 45 mm).
  const detail=words(bytes,2),header=detail.find(w=>w.text==='Corte')!;expect(header.y1).toBeLessThan(A4_LAYOUT.contentTop+5.5);
  expect(detail.filter(w=>/^P\d{2}$/.test(w.text))).toHaveLength(26);expect(Math.max(...detail.map(w=>w.y2))).toBeLessThan(202);
 },60000);
});
