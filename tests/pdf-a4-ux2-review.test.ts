import {expect,it,describe,afterEach,vi} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {A4FitError,createOfflinePdf,exportTableTsv,listRows,tsvCell,type OrderReference} from '../sketchup_offline/ui/pdf';
import {editsFor,mergeGuide,rememberFoldTable,type Guide} from '../sketchup_offline/ui/guide';
import {createDemo,demoDocument,box} from '../lib/demo';
import type {Project,RawDocument} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const asymmetric:OrderReference={text:'TEST-18 / 18 mm · Arr:EDGE-P Aba:EDGE-P Izq:sin Der:EDGE-S',board:'TEST-18 / 18 mm',edgeMap:[1,1,0,2],principal:'EDGE-P',secondary:'EDGE-S',base:720,height:560};
function groupsProject(count:number,name='Lateral'):Project{
 const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0],template=f.pieces[0];
 f.presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 f.pieces=Array.from({length:count},(_,i)=>({...template,definition:undefined,id:`grupo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name,mesh:box(18,560,720),dimensions:[720,560,18]}));
 return project;
}
function text(bytes:Uint8Array){const dir=mkdtempSync(join(tmpdir(),'ps-a4-review-'));try{const path=join(dir,'guide.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
const outcome=(project:Project,references?:Record<string,OrderReference>)=>createOfflinePdf(project,regular,mono,undefined,references).then(bytes=>({bytes,error:undefined}),(error:unknown)=>({bytes:undefined,error:error as A4FitError}));

describe('Revisión UX2 planos A4',()=>{
 it('«Copiar tabla» copia las mismas filas y cantidades que el listado impreso con «Agrupar por medidas»',()=>{
  const project=groupsProject(6),f=project.furniture[0];f.presentation!.guide!.foldTable=true;
  const table=exportTableTsv(project),lines=table.text.trimEnd().split('\r\n');
  expect(table.rows).toBe(listRows(f).length);expect(table.rows).toBe(1);
  expect(lines[0]).toBe('Mueble\tID\tNombre\tLargo\tAncho\tEsp.\tCant.\tTambién');
  expect(lines[1].split('\t')).toEqual([f.name,'P01','Lateral','720','560','18','6','P02, P03, P04, P05, P06']);
  const references=Object.fromEntries(f.pieces.map((p,i)=>[p.id,i<4?asymmetric:{...asymmetric,edgeMap:[1,1,1,1]}]));
  const split=exportTableTsv(project,references).text.trimEnd().split('\r\n').slice(1).map(line=>line.split('\t'));
  expect(split.map(cells=>cells[6])).toEqual(['4','2']);expect(split.map(cells=>cells.at(-1))).toEqual(['1·1·0·2','1·1·1·1']);
 });
 it('«Copiar tabla» aplica la validación del pedido del listado: asignaciones distintas en una fila no se copian',()=>{
  const project=createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0],template=f.pieces[0];
  f.groupIdentical=true;f.pieces=[{...template,id:'c/1',code:'P03'},{...template,id:'c/2',code:'P05'}];
  let error:unknown;try{exportTableTsv(project,{'c/1':asymmetric,'c/2':{...asymmetric,edgeMap:[0,0,0,0]}});}catch(value){error=value;}
  expect(error).toBeInstanceOf(A4FitError);expect(error).toMatchObject({kind:'order',furnitureId:f.id});
 });
 it('neutraliza fórmulas en las celdas de texto del TSV',()=>{
  expect(['=SUMA(A1)','+1','-x','@cmd','Lateral'].map(tsvCell)).toEqual(["'=SUMA(A1)","'+1","'-x","'@cmd",'Lateral']);
  const project=groupsProject(1,'=HYPERLINK("x")');project.furniture[0].name='@Mueble';
  expect(exportTableTsv(project).text.split('\r\n')[1].split('\t').slice(0,3)).toEqual(["'@Mueble",'P01',`'=HYPERLINK("x")`]);
 });
 it('la leyenda de cantos usa su forma compacta antes de bloquear y, si es la causa, lo dice con otra acción',async()=>{
  const words='Revisar escuadra y uniones antes del montaje final.'.split(' ');let compact=false,blamed=false;
  // Coarse steps until the bare guide is near the limit, then word by word through the last lines.
  for(let n=6;n<400;n+=n<150?16:1){
   const project=groupsProject(2),f=project.furniture[0];f.presentation!.guide!.observations=Array.from({length:n},(_,i)=>words[i%words.length]).join(' ');
   const bare=await outcome(project);if(bare.error)break;
   // 0.8.29: at 7 pt across the left column a one-board legend fits one line in full; two boards need its compact form.
   const withOrder=await outcome(project,{[f.pieces[0].id]:asymmetric,[f.pieces[1].id]:{...asymmetric,text:'OTRA / 18 mm',board:'OTRA / 18 mm',principal:'EDGE-Q',secondary:'EDGE-R'}});
   if(withOrder.error){
    // A guide that fits without the order never fails with the generic «acortá observaciones» lever alone.
    expect(withOrder.error).toMatchObject({kind:'legend',furnitureId:f.id});expect(withOrder.error.reason).toMatch(/leyenda de cantos/);
    expect(withOrder.error.action).toMatch(/«Incluir materiales y cantos del pedido»/);expect(withOrder.error.detail).toMatch(/^Necesita \d+ mm de 36 mm\.$/);blamed=true;
    break;
   }else if(!compact&&text(withOrder.bytes!).replace(/\s+/g,' ').includes('Cantos Arr·Aba·Izq·Der por placa: TEST-18 / 18 mm: 1 = EDGE-P, 2 = EDGE-S · OTRA / 18 mm: 1 = EDGE-Q, 2 = EDGE-R · 0 = sin canto.'))compact=true;
  }
  expect(compact).toBe(true);expect(blamed).toBe(true);
 },60000);
});

describe('Revisión UX2: «Agrupar por medidas» recordado por modelo',()=>{
 const store=new Map<string,string>();
 afterEach(()=>{store.clear();vi.unstubAllGlobals();});
 const stub=()=>vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}});
 const withGuid=(modelGuid:string):RawDocument=>({...demoDocument,exporter:{name:'Planos Santo Ruby',version:'0.8.10',sketchupVersion:'26',modelGuid,modelName:'Obra',exportedAt:'2026-10-22T00:00:00.000Z',selectionPaths:['modulo'],reviewed:true,warnings:[]}});
 const guide=(withOptions:boolean):Guide=>{const furniture=editsFor(createDemo(),{});if(!withOptions)furniture.forEach(f=>{f.presentation={};});return {version:1,revision:1,selection:['modulo','mesa'],furniture};};
 it('no se aplica a otro modelo con el mismo id de mueble y sí al mismo, aunque la guía no tenga opciones',()=>{
  stub();rememberFoldTable('guid-obra-x','modulo',true);
  const fold=(document:RawDocument,withOptions=true)=>mergeGuide(document,guide(withOptions)).project.furniture.find(f=>f.id==='modulo')!.presentation?.guide?.foldTable;
  expect(fold(withGuid('guid-obra-y'))).toBeUndefined();
  expect(fold(withGuid('guid-obra-x'))).toBe(true);
  expect(fold(withGuid('guid-obra-x'),false)).toBe(true);
  expect(fold(demoDocument)).toBeUndefined();
  // Not sent to SketchUp until guide_store.rb accepts the field.
  const merged=mergeGuide(withGuid('guid-obra-x'),guide(true));
  expect(JSON.stringify(editsFor(merged.project,merged.orphans))).not.toContain('foldTable');
  rememberFoldTable('guid-obra-x','modulo',false);expect(fold(withGuid('guid-obra-x'))).toBeUndefined();
  rememberFoldTable(undefined,'modulo',true);expect(store.size).toBe(1);expect(fold(withGuid('guid-obra-x'))).toBeUndefined();
 });
});
