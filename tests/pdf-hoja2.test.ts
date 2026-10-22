import {expect,it,describe,afterEach,vi} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {A4FitError,createOfflinePdf,createOfflinePdfPages,type OrderReference} from '../sketchup_offline/ui/pdf';
import {editsFor,mergeGuide,rememberDetailSheet,type Guide} from '../sketchup_offline/ui/guide';
import {presentationSchema} from '../lib/presentation';
import {createDemo,demoDocument,box} from '../lib/demo';
import type {Project,RawDocument} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const HOJA2='«Permitir hoja 2: despiece completo»';
/** Distinct physical pieces made with groups: identical grouping and «Agrupar por medidas» never join them. */
function many(count:number,consent=false):Project{
 const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0],template=f.pieces[0];
 f.pieces=Array.from({length:count},(_,i)=>({...template,definition:undefined,id:`grupo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,300+i,700),dimensions:[700,300+i,18]}));
 // Stacked synthetic pieces: the interior view shows one, so the drawing stays legible and only the list grows.
 f.presentation={guide:{mode:'interior',hiddenPieceIds:f.pieces.slice(1,500).map(p=>p.id),sharedCamera:true,observations:'',...(consent?{detailSheet:true}:{})}};
 return project;
}
function pageText(bytes:Uint8Array,page:number){const dir=mkdtempSync(join(tmpdir(),'ps-a4-hoja2-'));try{const path=join(dir,'guide.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',['-f',String(page),'-l',String(page),'-raw',path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');}finally{rmSync(dir,{recursive:true,force:true});}}
const failure=async(project:Project,references?:Record<string,OrderReference>)=>{try{await createOfflinePdf(project,regular,mono,undefined,references);}catch(error){return error as A4FitError;}throw new Error('Se esperaba un bloqueo');};
const board=(name:string,lot:number):OrderReference=>({text:name,board:name,edgeMap:[1,1,0,2],principal:'EDGE-P',secondary:'EDGE-S',base:700,height:300,lot});

describe('OPT-14 hoja 2: despiece completo con consentimiento por mueble',()=>{
 it('sin consentimiento un listado de más de 40 piezas bloquea y ofrece la hoja 2 como opción',async()=>{
  const error=await failure(many(45));
  expect(error).toBeInstanceOf(A4FitError);expect(error.kind).toBe('table');
  expect(error.action).toContain(HOJA2);expect(error.message).toContain(HOJA2);
 });
 it('con consentimiento imprime 1a con vistas y leyenda, y 1b, 1c… con cada código exactamente una vez',async()=>{
  const project=many(45,true),f=project.furniture[0];
  const {bytes,pages}=await createOfflinePdfPages(project,regular,mono);
  expect(pages.length).toBeGreaterThanOrEqual(2);expect(pages.length).toBeLessThanOrEqual(3);
  expect(pages.map(p=>p.label)).toEqual(['1a','1b','1c'].slice(0,pages.length));
  expect(pages.every(p=>p.furnitureId===f.id&&p.name===f.name)).toBe(true);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages.length);
  const first=pageText(bytes,1);
  expect(first).toContain('Hoja 1a de 1 · 45 piezas');expect(first).toContain('VISTA INTERIOR');expect(first).toContain('LISTADO COMPLETO DE PIEZAS');
  expect(first).toContain('El despiece completo de 45 piezas sigue en la hoja 1b, agrupado por placa.');
  expect(first).toContain('NOTAS Y OBSERVACIONES DE ARMADO');expect(first).toContain('1a / 1');
  const detail=pages.slice(1).map((page,i)=>{const value=pageText(bytes,i+2);expect(value).toContain(`Hoja ${page.label} de 1 · 45 piezas`);expect(value).toContain(`${page.label} / 1`);expect(value).toContain('Corte');expect(value).toContain('Cantos');return value;}).join(' ');
  const codes=[...detail.matchAll(/\bP\d{2}\b/g)].map(m=>m[0]);
  expect(codes.sort()).toEqual(f.pieces.map(p=>p.code).sort());
  expect(detail).toContain('Sin pedido · 45 piezas');expect(detail).toContain('Pieza 45');
 },60000);
 it('agrupa por placa ordenando por lote, con corte y cantos, y deja al final las pendientes y las sin pedido',async()=>{
  const project=many(45,true),ids=project.furniture[0].pieces.map(p=>p.id);
  const references=Object.fromEntries(ids.slice(0,30).map((id,i)=>[id,i<10?board('Zeta Melamina 18 mm',1):board('Alfa MDF 15 mm',2)]));
  const {bytes,pages}=await createOfflinePdfPages(project,regular,mono,undefined,references,{pending:ids.slice(30,40)});
  const detail=pages.slice(1).map((_,i)=>pageText(bytes,i+2)).join(' ');
  const order=['Placa: Zeta Melamina 18 mm · 10 piezas','Placa: Alfa MDF 15 mm · 20 piezas','Pendiente de pedido · 10 piezas','Sin pedido · 5 piezas'].map(header=>detail.indexOf(header));
  expect(order.every(i=>i>=0)).toBe(true);expect([...order].sort((a,b)=>a-b)).toEqual(order);
  expect(detail).toContain('700 × 300');expect(detail).toContain('1·1·0·2');
  const codes=[...detail.matchAll(/\bP\d{2}\b/g)].map(m=>m[0]);expect(new Set(codes).size).toBe(45);expect(codes).toHaveLength(45);
  // Page 1a keeps the order legends (edges and pending rows).
  const first=pageText(bytes,1);expect(first).toMatch(/Cantos/);expect(first).toContain('Pendiente de pedido');
 },60000);
 it('si el listado entra la hoja no cambia aunque haya consentimiento; varios muebles numeran 1, 2a, 2b',async()=>{
  const small=many(6,true);const single=await createOfflinePdfPages(small,regular,mono);
  expect(single.pages).toEqual([{furnitureId:small.furniture[0].id,name:small.furniture[0].name,label:'1'}]);
  expect(pageText(single.bytes,1)).toContain('Hoja 1 de 1 · 6 piezas');expect(pageText(single.bytes,1)).not.toContain('despiece completo');
  const project=many(6,true),big=many(45,true).furniture[0];project.furniture.push({...big,id:'otro',name:'Alacena grande'});
  const {bytes,pages}=await createOfflinePdfPages(project,regular,mono);
  expect(pages.map(p=>p.label).slice(0,3)).toEqual(['1','2a','2b']);expect(pages.filter(p=>p.furnitureId==='otro').every(p=>p.label.startsWith('2'))).toBe(true);
  expect(pageText(bytes,2)).toContain('Hoja 2a de 2 · 45 piezas');
  // The plain wrapper keeps returning the same bytes' page count for App.tsx.
  expect((await PDFDocument.load(await createOfflinePdf(project,regular,mono))).getPageCount()).toBe(pages.length);
 },60000);
 it('más de 20 hojas de despiece por mueble es un bloqueo de tamaño, sin PDF incompleto',async()=>{
  const project=many(700,true);project.furniture[0].pieces.forEach((p,i)=>{p.code=`P${String(i+1).padStart(3,'0')}`;});
  const error=await failure(project);expect(error.kind).toBe('size');expect(error.reason).toMatch(/20 hojas/);
 },60000);
});

describe('OPT-14: el consentimiento es local y nunca viaja a SketchUp',()=>{
 const store=new Map<string,string>();
 afterEach(()=>{store.clear();vi.unstubAllGlobals();});
 const stub=()=>vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}});
 const withGuid=(modelGuid:string):RawDocument=>({...demoDocument,exporter:{name:'Planos Santo Ruby',version:'0.8.10',sketchupVersion:'26',modelGuid,modelName:'Obra',exportedAt:'2026-10-22T00:00:00.000Z',selectionPaths:['modulo'],reviewed:true,warnings:[]}});
 const guide=():Guide=>({version:1,revision:1,selection:['modulo','mesa'],furniture:editsFor(createDemo(),{})});
 it('se recuerda por modelo, mergeGuide lo aplica y editsFor lo quita',()=>{
  stub();rememberDetailSheet('guid-obra-x','modulo',true);
  const detail=(document:RawDocument)=>mergeGuide(document,guide()).project.furniture.find(f=>f.id==='modulo')!.presentation?.guide?.detailSheet;
  expect(detail(withGuid('guid-obra-y'))).toBeUndefined();expect(detail(withGuid('guid-obra-x'))).toBe(true);expect(detail(demoDocument)).toBeUndefined();
  const merged=mergeGuide(withGuid('guid-obra-x'),guide());
  expect(JSON.stringify(editsFor(merged.project,merged.orphans))).not.toContain('detailSheet');
  expect(presentationSchema.safeParse(merged.project.furniture.find(f=>f.id==='modulo')!.presentation).success).toBe(true);
  rememberDetailSheet('guid-obra-x','modulo',false);expect(detail(withGuid('guid-obra-x'))).toBeUndefined();
  expect([...store.keys()]).not.toContain('planos-santo.a4.foldTable.v2');
 });
});
