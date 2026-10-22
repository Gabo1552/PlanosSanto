import {expect,it,describe} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {A4FitError,createOfflinePdf,exportTableTsv,listRows,referenceCoverage,edgeCode,type OrderReference} from '../sketchup_offline/ui/pdf';
import {createDemo,box} from '../lib/demo';
import type {Project} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
function sample(){
 const project=createDemo();project.furniture=[project.furniture[0]];
 project.furniture[0].presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations:''}};
 return project;
}
function text(bytes:Uint8Array,mode='-raw'){const dir=mkdtempSync(join(tmpdir(),'ps-a4-ux2-'));try{const path=join(dir,'guide.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',[mode,path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
const failure=async(project:Project,references?:Record<string,string|OrderReference>)=>{try{await createOfflinePdf(project,regular,mono,undefined,references);}catch(error){return error as A4FitError;}throw new Error('Se esperaba un bloqueo');};
/** Physical pieces made with groups (no component definition): identical grouping never joins them. */
function groupsProject(count:number,name='Lateral'){
 const project=sample(),f=project.furniture[0],template=f.pieces[0];
 f.pieces=Array.from({length:count},(_,i)=>({...template,definition:undefined,id:`grupo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name,mesh:box(18,560,720),dimensions:[720,560,18]}));
 return project;
}
const asymmetric:OrderReference={text:'TEST-18 / 18 mm · Arr:EDGE-P Aba:EDGE-P Izq:sin Der:EDGE-S',board:'TEST-18 / 18 mm',edgeMap:[1,1,0,2],principal:'EDGE-P',secondary:'EDGE-S',base:720,height:560};

describe('UX2 planos A4: cantos, agrupación por medidas, diagnóstico y tabla para copiar',()=>{
 it('imprime el código de cantos del TXT, la placa con su corte en una línea y la leyenda de la convención',async()=>{
  const project=sample(),f=project.furniture[0];
  const output=text(await createOfflinePdf(project,regular,mono,undefined,{[f.pieces[0].id]:asymmetric})).replace(/\s+/g,' ');
  expect(edgeCode(asymmetric)).toBe('1·1·0·2');
  expect(output).toContain('1·1·0·2 TEST-18 / 18 mm · corte 720 × 560');
  expect(output).toContain('Cantos: 1 = EDGE-P (principal) · 2 = EDGE-S (secundario) · 0 = sin canto · orden Arr·Aba·Izq·Der sobre base × altura del pedido.');
  expect(output).not.toContain('Arr:EDGE-P');
 });
 it('con el código de cantos entran muchas más filas que con el texto largo del pedido',async()=>{
  const project=groupsProject(12,'Estante'),ids=project.furniture[0].pieces.map(p=>p.id);
  const structured=Object.fromEntries(ids.map(id=>[id,asymmetric])),legacy=Object.fromEntries(ids.map(id=>[id,asymmetric.text+' · Lote y observación del proveedor']));
  await expect(createOfflinePdf(project,regular,mono,undefined,structured)).resolves.toBeInstanceOf(Uint8Array);
  const error=await failure(project,legacy);expect(error).toMatchObject({kind:'table'});
  expect(error.action).toMatch(/^Desactivá «Incluir materiales y cantos del pedido»/);expect(error.detail).toMatch(/^Necesita \d+ mm de 139 mm: (sobra 1 fila|sobran unas \d+ filas)\.$/);
 });
 it('agrupa por medidas seis laterales hechos con grupos y separa los que tienen otro canto',async()=>{
  const project=groupsProject(6),f=project.furniture[0];
  expect(listRows(f)).toHaveLength(6);
  f.presentation!.guide!.foldTable=true;
  const rows=listRows(f);expect(rows).toHaveLength(1);expect(rows[0].piece).toMatchObject({code:'P01',quantity:6});expect(rows[0].also).toEqual(['P02','P03','P04','P05','P06']);
  const output=text(await createOfflinePdf(project,regular,mono)).replace(/\s+/g,' ');expect(output).toContain('también P02, P03, P04, P05, P06');
  const references=Object.fromEntries(f.pieces.map((p,i)=>[p.id,i<4?asymmetric:{...asymmetric,edgeMap:[1,1,1,1],text:'otro'}]));
  const split=listRows(f,references);expect(split.map(r=>r.piece.quantity)).toEqual([4,2]);expect(split[1].piece.code).toBe('P05');
  expect(f.pieces.map(p=>p.code)).toEqual(['P01','P02','P03','P04','P05','P06']);
 });
 it('una fila de componentes iguales con asignaciones distintas da un bloqueo con mueble, piezas y acción',async()=>{
  const project=sample(),f=project.furniture[0],template=f.pieces[0];
  f.groupIdentical=true;f.pieces=[{...template,id:'c/1',code:'P03'},{...template,id:'c/2',code:'P05'}];
  const error=await failure(project,{'c/1':asymmetric,'c/2':{...asymmetric,edgeMap:[0,0,0,0]}});
  expect(error).toBeInstanceOf(A4FitError);
  expect(error).toMatchObject({kind:'order',furniture:f.name,reason:'P03 y P05 comparten el ID P03 pero tienen placa o cantos distintos en el pedido.',action:'Desactivá Agrupar componentes iguales en este mueble o igualá su asignación en Biblioteca y pedidos.'});
  expect(error.message).toBe(`${f.name}: ${error.reason} Qué hacer: ${error.action}`);
 });
 it('elige la acción según la causa cuando el listado no entra',async()=>{
  const groups=groupsProject(45);
  expect(await failure(groups)).toMatchObject({kind:'table',action:'Activá «Agrupar por medidas en el listado A4» en Vistas de la guía A4. También podés activar «Permitir hoja 2: despiece completo» en Vistas de la guía A4.'});
  groups.furniture[0].presentation!.guide!.foldTable=true;expect(listRows(groups.furniture[0])).toHaveLength(1);
  const folded=await createOfflinePdf(groups,regular,mono).then(()=>undefined,(error:A4FitError)=>error);expect(folded?.kind).not.toBe('table');
  const distinct=groupsProject(45);distinct.furniture[0].pieces.forEach((p,i)=>{p.name=`Pieza ${i}${i%5===0?' con un nombre bastante más largo que la columna':''}`;});
  const error=await failure(distinct);expect(error.action).toMatch(/^Acortá los nombres más largos: P\d+(, P\d+)*\. También podés activar «Permitir hoja 2: despiece completo» en Vistas de la guía A4\.$/);
 });
 it('copia la tabla en TSV con encabezado, coma decimal, nombres saneados y columnas del pedido',()=>{
  const project=sample(),f=project.furniture[0];f.pieces[0].name='Lateral\tizq.\nfrente';f.pieces[0].dimensions=[2400.5,560,18];
  const plain=exportTableTsv(project);const lines=plain.text.trimEnd().split('\r\n');
  expect(lines[0]).toBe('Mueble\tID\tNombre\tLargo\tAncho\tEsp.\tCant.');expect(plain).toMatchObject({rows:f.pieces.length,furniture:1});
  expect(lines[1].split('\t')).toEqual([f.name,f.pieces[0].code,'Lateral izq. frente','2400,5','560','18','1']);
  const withOrder=exportTableTsv(project,{[f.pieces[0].id]:asymmetric}).text.split('\r\n');
  expect(withOrder[0].endsWith('\tPlaca\tCantos')).toBe(true);expect(withOrder[1].split('\t').slice(-2)).toEqual(['TEST-18 / 18 mm','1·1·0·2']);expect(withOrder[2].split('\t').slice(-2)).toEqual(['','']);
  expect(referenceCoverage(project,{[f.pieces[0].id]:asymmetric})).toEqual({covered:1,total:f.pieces.length});expect(referenceCoverage(project)).toEqual({covered:0,total:f.pieces.length});
 });
 it('un proyecto sin muebles también es un bloqueo tipificado',async()=>{
  const project=sample();project.furniture=[];const error=await failure(project);
  expect(error).toMatchObject({kind:'empty',action:'Marcá al menos un mueble y generá su guía.'});
 });
});
