import {expect,it,describe} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {LABEL_DEFAULTS,createLabelsPdf,labelItems,labelLayout,labelsFileName} from '../sketchup_offline/ui/labels';
import {A4FitError,type OrderReferences} from '../sketchup_offline/ui/pdf';
import {box} from '../lib/demo';
import type {Furniture,Piece,Project,Vec3} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const piece=(id:string,code:string,name:string,dimensions:Vec3=[720,560,18]):Piece=>({id,code,name,mesh:box(dimensions[2],dimensions[1],dimensions[0]),transform:IDENTITY,dimensions,quantity:1,warnings:[]});
const furniture=(id:string,name:string,moduleCode:string,pieces:Piece[]):Furniture=>({id,name,pieces,notes:[],explosion:0,zoom:1,naming:{moduleCode,bases:[]}});
const project=(furniture:Furniture[],name='Obra Pérez'):Project=>({id:'p',name,source:'demo',createdAt:'',updatedAt:'',revision:1,furniture});
function many(n:number){return project([furniture('f1','Bajo mesada','M01',Array.from({length:n},(_,i)=>piece(`f1/${i}`,`P${String(i+1).padStart(2,'0')}`,`Pieza ${i+1}`)))]);}
function extract(bytes:Uint8Array){const dir=mkdtempSync(join(tmpdir(),'ps-labels-test-'));try{const path=join(dir,'labels.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
const options={template:'3x7' as const,margins:LABEL_DEFAULTS['3x7']};

describe('Etiquetas autoadhesivas A4',()=>{
 it('reparte la hoja A4 vertical según plantilla y márgenes',()=>{
  const a=labelLayout('3x7',LABEL_DEFAULTS['3x7']);
  expect(a.cells).toHaveLength(21);expect(a.cols).toBe(3);expect(a.rows).toBe(7);
  expect(a.cells[0]).toEqual({x:0,y:4.5,w:70,h:expect.closeTo(41.1428,3)});
  expect(a.cells[1].x).toBeCloseTo(70,6);expect(a.cells[3].y).toBeCloseTo(4.5+288/7,6);expect(a.cells[20].x+a.cells[20].w).toBeCloseTo(210,6);expect(a.cells[20].y+a.cells[20].h).toBeCloseTo(292.5,6);
  const b=labelLayout('2x5',LABEL_DEFAULTS['2x5']);
  expect(b.cells).toHaveLength(10);expect(b.cells[0]).toEqual({x:4,y:6,w:101,h:57});expect(b.cells[1].x).toBe(105);expect(b.cells[2].y).toBe(63);
  const c=labelLayout('2x5',{top:10,right:5,bottom:20,left:15});expect(c.cells[0]).toEqual({x:15,y:10,w:95,h:53.4});
 });
 it('rechaza márgenes fuera de rango o celdas demasiado chicas',()=>{
  expect(()=>labelLayout('3x7',{...LABEL_DEFAULTS['3x7'],top:-1})).toThrow(/Margen superior.*entre 0 y 25 mm/);
  expect(()=>labelLayout('3x7',{...LABEL_DEFAULTS['3x7'],left:25.5})).toThrow(/Margen izquierdo/);
  expect(()=>labelLayout('3x7',{...LABEL_DEFAULTS['3x7'],right:Number.NaN})).toThrow(/Margen derecho/);
  expect(()=>labelLayout('3x7',{top:25,bottom:25,left:0,right:0})).not.toThrow();
  expect(()=>labelLayout('nope' as never,LABEL_DEFAULTS['3x7'])).toThrow(/Plantilla/);
 });
 it('una etiqueta por pieza física, con copias y código compuesto',()=>{
  const p=project([furniture('f1','Alacena','M03',[piece('a/2','P07','Estante'),piece('a/1','P07','Estante'),piece('a/3','P01','Lateral')])]);
  const items=labelItems(p);
  expect(items.map(i=>[i.code,i.copy,i.copies,i.pieceId])).toEqual([['M03·P01',1,1,'a/3'],['M03·P07',1,2,'a/1'],['M03·P07',2,2,'a/2']]);
  expect(items[0]).toMatchObject({furnitureId:'f1',furnitureName:'Alacena',name:'Lateral',measures:[720,560,18],oriented:false,state:'none'});
 });
 it('ordena por mueble, lote, código numérico e ID; medidas y estado del pedido',()=>{
  const p=project([
   furniture('f2','Torre','M02',[piece('t/1','P10','Lateral',[2000,580,18]),piece('t/2','P05','Puerta',[700,400,18]),piece('t/3','P03','Fondo',[1990,590,3])]),
   furniture('f1','Bajo','',[piece('b/1','P01','Piso')]),
  ]);
  const references:OrderReferences={'t/1':{text:'MEL-18',edgeMap:[1,0,0,2],base:580,height:2000,lot:2,grain:false},'t/3':{text:'FIB-3',base:1990,height:590,lot:1,grain:true},'t/2':'legado'};
  const items=labelItems(p,references,['b/1']);
  expect(items.map(i=>i.code)).toEqual(['M02·P03','M02·P10','M02·P05','P01']);
  expect(items[0]).toMatchObject({lot:1,grain:true,measures:[1990,590,3],oriented:true,state:'order'});
  expect(items[1]).toMatchObject({lot:2,grain:false,edgeMap:[1,0,0,2],measures:[580,2000,18],oriented:true});
  expect(items[2]).toMatchObject({state:'order',oriented:false,measures:[700,400,18]});expect(items[2].lot).toBeUndefined();
  expect(items[3]).toMatchObject({state:'pending',furnitureName:'Bajo'});
 });
 it('arma una hoja por cada 21 etiquetas con código compuesto, lote, medidas y pendientes',async()=>{
  const p=many(25),ids=p.furniture[0].pieces.map(x=>x.id);
  const references:OrderReferences={[ids[0]]:{text:'MEL-18',board:'MEL-18 / 18 mm',edgeMap:[1,1,0,2],principal:'C-P',secondary:'C-S',base:700,height:450,lot:1,grain:true}};
  const result=await createLabelsPdf(p,regular,mono,{...options,references,pending:[ids[1]]});
  expect(result).toMatchObject({labels:25,pages:2});
  const doc=await PDFDocument.load(result.bytes);expect(doc.getPageCount()).toBe(2);
  expect(doc.getPage(0).getWidth()*25.4/72).toBeCloseTo(210,6);expect(doc.getPage(0).getHeight()*25.4/72).toBeCloseTo(297,6);
  expect(doc.getTitle()).toBe('Planos Santo · Etiquetas · Obra Pérez');
  const text=extract(result.bytes);
  expect(text).toContain('M01·P01');expect(text).toContain('M01·P25');expect(text).toContain('Bajo mesada');
  expect(text).toContain('700 × 450 × 18 mm');expect(text).toContain('base × altura del pedido');expect(text).toContain('Lote 01');expect(text).toContain('1·1·0·2');expect(text).toContain('veta');
  expect(text).toContain('PENDIENTE DE PEDIDO');expect(text).toContain('720 × 560 × 18 mm');
  const two=await createLabelsPdf(p,regular,mono,{template:'2x5',margins:LABEL_DEFAULTS['2x5'],guides:true});expect(two.pages).toBe(3);
 });
 it('usa coma decimal sin separador de miles y no trunca nombres que no entran',async()=>{
  const p=project([furniture('f1','Mueble','M01',[piece('x','P01','Tapa',[1234.5,600,18])])]);
  expect(extract((await createLabelsPdf(p,regular,mono,options)).bytes)).toContain('1234,5 × 600 × 18 mm');
  p.furniture[0].pieces[0].name='Nombre larguísimo de una pieza '.repeat(8);
  const error=await createLabelsPdf(p,regular,mono,options).catch((e:unknown)=>e);
  expect(error).toBeInstanceOf(A4FitError);expect((error as Error).message).toMatch(/M01·P01/);
 });
 it('rechaza proyectos sin piezas y márgenes inválidos',async()=>{
  await expect(createLabelsPdf(project([]),regular,mono,options)).rejects.toThrow('No hay piezas para etiquetar.');
  await expect(createLabelsPdf(many(1),regular,mono,{template:'3x7',margins:{...LABEL_DEFAULTS['3x7'],bottom:30}})).rejects.toThrow(/Margen inferior/);
 });
 it('propone un nombre de descarga por obra y fecha',()=>{
  const date=new Date(2026,9,21);
  expect(labelsFileName({name:'Obra Pérez / Cocina'},date)).toBe('Obra-Pérez-Cocina-etiquetas-2026-10-21.pdf');
  expect(labelsFileName({name:' ?<> '},date)).toBe('PlanosSanto-etiquetas-2026-10-21.pdf');
 });
});
