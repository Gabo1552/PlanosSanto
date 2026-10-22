import {describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
import {
 A4FitError,A4_LANDSCAPE_MM,boardLine,createOfflinePdf,decode64,edgeCode,encode64,exportTableTsv,hasEdgeMap,
 listRows,orderReference,previewFileName,referenceCoverage,tsvCell,type OrderReference,
} from '../sketchup_offline/ui/pdf';
import {createDemo} from '../lib/demo';
import type {Furniture,Project} from '../lib/model';

const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
const logo=readFileSync('sketchup_offline/assets/santo-carpintero.png');
/** OPT-14: every list that does not fit also offers the hoja 2 consent. */
const HOJA2=' También podés activar «Permitir hoja 2: despiece completo» en Vistas de la guía A4.';

/** Módulo bajo del demo, solo, con guía de una vista y sin observaciones. */
function single(observations=''):Project{
 const project=createDemo();project.furniture=[project.furniture[0]];
 project.furniture[0].presentation={guide:{mode:'exterior',hiddenPieceIds:[],sharedCamera:true,observations}};
 return project;
}
/** Laterales iguales (misma definición) agrupados en una fila. */
function laterales():Furniture{
 const f=createDemo().furniture[0];f.pieces=f.pieces.slice(0,2);f.groupIdentical=true;return f;
}
const placa:OrderReference={text:'MDF 18',board:'MDF Blanco 18 mm',edgeMap:[1,1,0,2],principal:'PVC 0,45 blanco',secondary:'ABS 2 mm',base:720,height:450};
async function fitError(project:Project,references?:Parameters<typeof createOfflinePdf>[4]){
 try{await createOfflinePdf(project,regular,mono,undefined,references);}catch(error){if(error instanceof A4FitError)return error;throw error;}
 throw new Error('Se esperaba A4FitError');
}

describe('Referencia de pedido: qué se le pide a la maderera',()=>{
 it('acepta el contrato de texto heredado y descarta referencias vacías',()=>{
  expect(orderReference(undefined)).toBeUndefined();expect(orderReference(null)).toBeUndefined();expect(orderReference('')).toBeUndefined();
  expect(orderReference('MDF 18 · Canto 1')).toEqual({text:'MDF 18 · Canto 1'});
  expect(orderReference(placa)).toBe(placa);
 });
 it('solo reconoce mapas de cantos de cuatro lados con roles 0, 1 o 2',()=>{
  expect(hasEdgeMap(placa)).toBe(true);
  for(const edgeMap of [[1,1,0],[1,1,0,2,0],[1,1,0,3],[1,1,0,-1],[1,1,0,0.5]])expect(hasEdgeMap({text:'x',edgeMap})).toBe(false);
  expect(hasEdgeMap(undefined)).toBe(false);expect(hasEdgeMap({text:'x'})).toBe(false);
  expect(edgeCode(placa)).toBe('1·1·0·2');expect(edgeCode({text:'x',edgeMap:[9,9,9,9]})).toBe('');expect(edgeCode()).toBe('');
 });
 it('la línea de placa muestra el corte base × altura con coma decimal y sin separador de miles',()=>{
  expect(boardLine(placa)).toBe('MDF Blanco 18 mm · corte 720 × 450');
  expect(boardLine({text:'Melamina',base:1234.5,height:0.125})).toBe('Melamina · corte 1234,5 × 0,13');
  // Sin altura no se inventa el corte: solo la placa.
  expect(boardLine({text:'Melamina',base:720})).toBe('Melamina');
  expect(boardLine({text:'Melamina',board:'',base:720,height:300})).toBe('Melamina · corte 720 × 300');
 });
});

describe('Filas del listado A4 y pedido',()=>{
 it('una fila agrupada con piezas de distinta placa bloquea con el código compartido',()=>{
  const f=laterales(),[a,b]=f.pieces;
  let error:unknown;try{listRows(f,{[a.id]:placa,[b.id]:{...placa,edgeMap:[0,0,0,0]}});}catch(value){error=value;}
  expect(error).toBeInstanceOf(A4FitError);
  const fit=error as A4FitError;
  expect(fit.kind).toBe('order');expect(fit.furniture).toBe(f.name);expect(fit.furnitureId).toBe(f.id);
  expect(fit.reason).toBe(`${a.code} y ${b.code} comparten el ID ${a.code} pero tienen placa o cantos distintos en el pedido.`);
  expect(fit.message).toContain('Qué hacer: Desactivá Agrupar componentes iguales');
 });
 it('si las piezas agrupadas ya comparten código físico el mensaje no repite el ID',()=>{
  const f=laterales(),[a,b]=f.pieces;b.code=a.code;
  expect(()=>listRows(f,{[a.id]:placa,[b.id]:'MDF crudo'})).toThrow(`${a.code}: las piezas agrupadas tienen placa o cantos distintos en el pedido.`);
 });
 it('una pieza agrupada sin asignación y otra con asignación tampoco se mezclan',()=>{
  const f=laterales();expect(()=>listRows(f,{[f.pieces[0].id]:placa})).toThrow(A4FitError);
  // La misma asignación por texto o por objeto equivalente sí comparte fila.
  const rows=listRows(f,{[f.pieces[0].id]:'MDF 18',[f.pieces[1].id]:{text:'MDF 18'}});
  expect(rows).toHaveLength(1);expect(rows[0].piece.quantity).toBe(2);expect(rows[0].reference).toEqual({text:'MDF 18'});
 });
 it('agrupar por medidas suma cantidades, conserva IDs físicos y no muta la pieza original',()=>{
  const f=createDemo().furniture[0];
  const [izq,der]=f.pieces;der.name=' lateral   IZQUIERDO ';
  const before=JSON.stringify(f);
  const rows=listRows(f,undefined,true);
  const folded=rows.find(r=>r.piece.code===izq.code)!;
  expect(folded.piece.quantity).toBe(2);expect(folded.piece.memberIds).toEqual([izq.id,der.id]);expect(folded.also).toEqual([der.code]);
  expect(rows).toHaveLength(f.pieces.length-1);
  expect(JSON.stringify(f)).toBe(before);
 });
 it('agrupar por medidas no junta piezas de distinto material, nombre o asignación',()=>{
  const mat=(id:string)=>({id,name:id,color:[1,2,3] as [number,number,number],opacity:1,textured:false});
  const withMaterial=createDemo().furniture[0];
  withMaterial.pieces[0].metadata={...metadata(),material:mat('roble')};withMaterial.pieces[1].metadata={...metadata(),material:mat('pino')};
  withMaterial.pieces[1].name=withMaterial.pieces[0].name;
  expect(listRows(withMaterial,undefined,true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(1);
  const named=createDemo().furniture[0];
  expect(listRows(named,undefined,true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(1);
  const assigned=createDemo().furniture[0];assigned.pieces[1].name=assigned.pieces[0].name;
  expect(listRows(assigned,{[assigned.pieces[0].id]:'MDF 18'},true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(1);
  expect(listRows(assigned,{[assigned.pieces[0].id]:'MDF 18',[assigned.pieces[1].id]:'MDF 18'},true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(2);
 });
 it('agrupar por medidas tolera diferencias de redondeo menores a 0,05 mm',()=>{
  const f=createDemo().furniture[0];f.pieces[1].name=f.pieces[0].name;
  f.pieces[1].dimensions=[f.pieces[1].dimensions[0]+0.04,f.pieces[1].dimensions[1],f.pieces[1].dimensions[2]];
  expect(listRows(f,undefined,true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(2);
  f.pieces[1].dimensions=[f.pieces[0].dimensions[0]+1,f.pieces[1].dimensions[1],f.pieces[1].dimensions[2]];
  expect(listRows(f,undefined,true).find(r=>r.piece.code==='P01')!.piece.quantity).toBe(1);
 });
});
function metadata(){
 return {persistentId:'1',instancePath:['1'],originalName:'',definitionName:'Lateral',hidden:false,effectiveVisible:true,tag:'',material:null,worldTransform:Array.from({length:16},(_,i)=>i%5===0?1:0),warnings:[]};
}

describe('Planilla TSV para la maderera',()=>{
 it('neutraliza tabulaciones, saltos y fórmulas sin tocar texto común',()=>{
  expect(tsvCell(' Lateral\tizq\r\nfrente ')).toBe('Lateral izq frente');
  expect(tsvCell('  =1+1')).toBe("'=1+1");
  expect(tsvCell('18 mm')).toBe('18 mm');expect(tsvCell('')).toBe('');
 });
 it('exporta medidas con coma decimal, una fila por grupo y columnas de pedido',()=>{
  const project=single(),f=project.furniture[0];f.pieces[0].dimensions=[1234.5,450,18];
  const {text,rows,furniture}=exportTableTsv(project,{[f.pieces[0].id]:placa,[f.pieces[1].id]:'MDF crudo'});
  const lines=text.split('\r\n');
  expect(text.endsWith('\r\n')).toBe(true);expect(rows).toBe(f.pieces.length);expect(furniture).toBe(1);
  expect(lines[0].split('\t')).toEqual(['Mueble','ID','Nombre','Largo','Ancho','Esp.','Cant.','Placa','Cantos']);
  expect(lines[1].split('\t')).toEqual([f.name,'P01',f.pieces[0].name,'1234,5','450','18','1','MDF Blanco 18 mm','1·1·0·2']);
  expect(lines[2].split('\t').slice(-2)).toEqual(['MDF crudo','']);
  expect(lines[3].split('\t').slice(-2)).toEqual(['','']);
 });
 it('sin pedido no agrega Placa ni Cantos; con filas plegadas agrega También',()=>{
  const project=single(),f=project.furniture[0];
  expect(exportTableTsv(project).text.split('\r\n')[0]).toBe('Mueble\tID\tNombre\tLargo\tAncho\tEsp.\tCant.');
  f.pieces[1].name=f.pieces[0].name;f.presentation!.guide!.foldTable=true;
  const lines=exportTableTsv(project).text.split('\r\n');
  expect(lines[0].split('\t')).toContain('También');
  expect(lines[1].split('\t').slice(6)).toEqual(['2','P02']);
 });
 it('cubre todas las piezas de todos los muebles al contar asignaciones',()=>{
  const project=createDemo(),ids=project.furniture.flatMap(f=>f.pieces.map(p=>p.id));
  expect(referenceCoverage(project)).toEqual({covered:0,total:ids.length});
  expect(referenceCoverage(project,{[ids[0]]:'MDF',[ids[1]]:'',[ids.at(-1)!]:placa,ajena:'MDF'})).toEqual({covered:2,total:ids.length});
 });
});

describe('Nombre del archivo descargado',()=>{
 const day=new Date(2026,9,5);
 it('usa obra y mueble cuando hay uno solo, sin caracteres prohibidos',()=>{
  expect(previewFileName({name:'Obra: Pérez/Gómez',furniture:[{name:'Bajo * mesada?'}] as Project['furniture']},day)).toBe('Obra-Pérez-Gómez-Bajo-mesada-A4-2026-10-05.pdf');
 });
 it('con varios muebles usa solo la obra y sin nombres cae en PlanosSanto',()=>{
  const two=createDemo();
  expect(previewFileName(two,day)).toBe('Taller-·-Proyecto-de-demostración-A4-2026-10-05.pdf');
  expect(previewFileName({name:' ... ',furniture:[]},day)).toBe('PlanosSanto-A4-2026-10-05.pdf');
  expect(previewFileName({name:'',furniture:[{name:''}] as Project['furniture']},day)).toBe('PlanosSanto-A4-2026-10-05.pdf');
 });
 it('limita la base a 80 caracteres sin terminar en guion o punto',()=>{
  const name=previewFileName({name:'A'.repeat(79)+'-B',furniture:[]},day);
  expect(name).toBe(`${'A'.repeat(79)}-A4-2026-10-05.pdf`);
 });
 // BUG-TS-02 (docs/qa/BUGS_ENCONTRADOS_TS.md): corregido; el corte es por puntos de código.
 it('no parte un emoji en el corte de 80 caracteres (BUG-TS-02)',()=>{
  const name=previewFileName({name:'A'.repeat(79)+'😀',furniture:[]},day);
  expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  expect(name).toBe(`${'A'.repeat(79)}😀-A4-2026-10-05.pdf`);
 });
});

describe('Errores de encaje A4: causa, acción y detalle',()=>{
 it('compone mueble, causa, detalle y acción por tipo',()=>{
  const error=new A4FitError(undefined,{furniture:'Alacena',reason:'No entra.',kind:'table',detail:'Necesita 150 mm de 139 mm.'});
  expect(error.name).toBe('A4FitError');
  expect(error.message).toBe('Alacena: No entra. Necesita 150 mm de 139 mm. Qué hacer: Agrupá piezas iguales o acortá sus nombres.');
  expect(new A4FitError('Texto fijo',{reason:'x',kind:'size'}).message).toBe('Texto fijo');
  expect(new A4FitError(undefined,{reason:'Falta glifo.',kind:'glyph',character:'漢'}).action).toBe('Reemplazá el carácter «漢».');
  expect(new A4FitError(undefined,{reason:'Falta glifo.',kind:'glyph'}).action).toBeUndefined();
  expect(new A4FitError(undefined,{reason:'Raro.',kind:'scale',action:'Hacé otra cosa.'}).compose()).toBe('Raro. Qué hacer: Hacé otra cosa.');
 });
 it('sin muebles marcados no genera PDF',async()=>{
  const project=single();project.furniture=[];
  const error=await fitError(project);expect(error.kind).toBe('empty');expect(error.action).toBe('Marcá al menos un mueble y generá su guía.');
 });
 it('una pieza sin nombre bloquea la hoja de ese mueble',async()=>{
  const project=single();project.furniture[0].pieces[2].name='   ';
  const error=await fitError(project);
  expect(error.kind).toBe('names');expect(error.furniture).toBe(project.furniture[0].name);expect(error.furnitureId).toBe(project.furniture[0].id);
 });
 it('un carácter sin glifo en la tabla nombra el carácter y el mueble',async()=>{
  const project=single();project.furniture[0].pieces[0].name='Lateral 漢';
  const error=await fitError(project);
  expect(error.kind).toBe('glyph');expect(error.character).toBe('漢');
  expect(error.message).toBe(`${project.furniture[0].name}: El PDF no puede representar el carácter «漢». Qué hacer: Reemplazá el carácter «漢».`);
 });
 // BUG-TS-01 (docs/qa/BUGS_ENCONTRADOS_TS.md): corregido; tabulación y CR se imprimen como espacio.
 it('una tabulación pegada en observaciones no bloquea el PDF con «» invisible (BUG-TS-01)',async()=>{
  await expect(createOfflinePdf(single('Tornillos\t4 × 50'),regular,mono)).resolves.toBeInstanceOf(Uint8Array);
  await expect(createOfflinePdf(single('Línea 1\r\nLínea 2'),regular,mono)).resolves.toBeInstanceOf(Uint8Array);
  const project=single();project.furniture[0].pieces[0].name='Lateral\tizq';
  await expect(createOfflinePdf(project,regular,mono)).resolves.toBeInstanceOf(Uint8Array);
 });
 it('un código de pieza demasiado ancho para la columna ID bloquea con su acción',async()=>{
  const project=single();project.furniture[0].pieces[0].code='P0000001';
  const error=await fitError(project);
  expect(error.kind).toBe('table');expect(error.reason).toBe('P0000001: el identificador no entra en la columna ID.');expect(error.action).toBe('Acortá el código de la pieza.');
 });
 it('una medida que no entra en su columna bloquea en lugar de pisar la vecina',async()=>{
  const project=single();project.furniture[0].pieces[0].dimensions=[123456789.12,450,18];
  const error=await fitError(project);
  expect(error.reason).toBe('P01: una medida o cantidad no entra en su columna.');
 });
 it('un nombre de mueble o de proyecto de más de una línea no entra en el encabezado',async()=>{
  const project=single();project.furniture[0].name='Bajo mesada con cajonera, especiero extraíble y cesto de residuos de la cocina principal';
  expect((await fitError(project)).kind).toBe('header');
  const long=single();long.name='Proyecto de cocina integral con isla central, alacenas superiores, despensa, lavadero, vestidor y placard del dormitorio principal';
  expect((await fitError(long)).action).toBe('Acortá el nombre del mueble o del proyecto.');
 });
 it('un logotipo vertical se rechaza antes de dibujarlo',async()=>{
  const probe=await PDFDocument.create(),png=await probe.embedPng(logo);
  expect(png.height/png.width).toBeLessThan(22/43);
  await expect(createOfflinePdf(single(),regular,mono,verticalPng())).rejects.toThrow('El logotipo supera el espacio del encabezado A4');
 });
 it('un PDF con logotipo horizontal sigue siendo una sola A4',async()=>{
  const bytes=await createOfflinePdf(single(),regular,mono,logo);
  const doc=await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getPage(0).getWidth()*25.4/72).toBeCloseTo(A4_LANDSCAPE_MM.width,6);
 });
 it('una leyenda de cantos que no entra completa cae a su forma compacta y, si aun así no entra, culpa a las notas',async()=>{
  const project=single('Revisar escuadra.\n'.repeat(9).trim()),f=project.furniture[0];
  const references=Object.fromEntries(f.pieces.map(p=>[p.id,placa]));
  const legend=await fitError(project,references);
  expect(legend.kind).toBe('legend');
  expect(legend.reason).toBe('Las notas y observaciones no dejan lugar a la leyenda de cantos del pedido debajo de las vistas.');
  expect(legend.detail).toMatch(/^Necesita \d+ mm de 42 mm\.$/);
  // Sin pedido entra: la leyenda de cantos era la que sobraba.
  await expect(createOfflinePdf(project,regular,mono)).resolves.toBeInstanceOf(Uint8Array);
 });
 it('un listado largo con pedido sugiere quitar el pedido o plegar por medidas',async()=>{
  const project=single(),f=project.furniture[0],template=f.pieces[0];
  f.pieces=Array.from({length:16},(_,i)=>({...template,id:`fila/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,definition:`def-${i}`}));
  const references=Object.fromEntries(f.pieces.map(p=>[p.id,{...placa,board:'Melamina Blanco Nieve 18 mm de primera calidad con veta horizontal'}]));
  const error=await fitError(project,references);
  expect(error.kind).toBe('table');
  expect(error.action).toBe('Desactivá «Incluir materiales y cantos del pedido» en Opciones de guardado o activá «Agrupar por medidas en el listado A4».'+HOJA2);
 });
 it('un listado largo de componentes iguales sugiere agruparlos antes que acortar nombres',async()=>{
  const project=single(),f=project.furniture[0],template=f.pieces[0];
  f.pieces=Array.from({length:30},(_,i)=>({...template,id:`igual/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Lateral ${i+1}`}));
  expect((await fitError(project)).action).toBe('Activá Agrupar componentes iguales en este mueble.'+HOJA2);
 });
 it('un listado largo de piezas distintas con medidas repetidas sugiere plegar por medidas',async()=>{
  const project=single(),f=project.furniture[0],template=f.pieces[0];
  f.pieces=Array.from({length:30},(_,i)=>({...template,id:`medida/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:'Lateral',definition:`def-${i}`}));
  expect((await fitError(project)).action).toBe('Activá «Agrupar por medidas en el listado A4» en Vistas de la guía A4.'+HOJA2);
 });
 it('un listado largo sin otra palanca nombra las filas de nombres más largos o sugiere separar el mueble',async()=>{
  const project=single(),f=project.furniture[0],template=f.pieces[0];
  f.pieces=Array.from({length:22},(_,i)=>({...template,id:`largo/${i}`,code:`P${String(i+1).padStart(2,'0')}`,definition:`def-${i}`,
   name:i<3?`Lateral con nombre muy descriptivo del taller número ${i+1}`:`Pieza ${i+1}`,dimensions:[100+i,450,18] as [number,number,number]}));
  expect((await fitError(project)).action).toBe('Acortá los nombres más largos: P01, P02, P03.'+HOJA2);
  const short=single(),g=short.furniture[0];
  g.pieces=Array.from({length:40},(_,i)=>({...template,id:`corto/${i}`,code:`P${String(i+1).padStart(2,'0')}`,definition:`def-${i}`,name:`P ${i+1}`,dimensions:[100+i,450,18] as [number,number,number]}));
  expect((await fitError(short)).action).toBe('Separá el mueble en dos grupos de SketchUp para imprimir cada uno en su hoja.'+HOJA2);
 });
});

describe('Base64 del puente con SketchUp',()=>{
 it('ida y vuelta binaria exacta, incluso por encima de un bloque de 32 KiB',()=>{
  const bytes=Uint8Array.from({length:0x8000*2+17},(_,i)=>(i*31+7)%256);
  const encoded=encode64(bytes);
  expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
  expect(decode64(encoded)).toEqual(bytes);
  expect(encode64(new Uint8Array())).toBe('');expect(decode64('')).toEqual(new Uint8Array());
 });
});

/** PNG RGBA 1×4 (vertical) armado a mano: alcanza para probar la regla de altura del logotipo. */
function verticalPng():Uint8Array{
 const width=1,height=4,raw=Buffer.alloc(height*(1+width*4));
 for(let y=0;y<height;y++)raw[y*(1+width*4)]=0;
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=(buf:Buffer)=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type:string,data:Buffer)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const sum=Buffer.alloc(4);sum.writeUInt32BE(crc(body));return Buffer.concat([len,body,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 return new Uint8Array(Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

describe('Contenido impreso de la tabla con pedido',()=>{
 const pdfText=(bytes:Uint8Array,bbox=false)=>{const dir=mkdtempSync(join(tmpdir(),'ps-cov-'));try{const path=join(dir,'a4.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',[bbox?'-bbox':'-layout',path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}};
 it('un nombre de una sola palabra más ancho que la columna se corta por caracteres sin perder letras',async()=>{
  const project=single(),word='Contrafrentecajonerainferiorizquierda';project.furniture[0].pieces[0].name=word;
  const words=[...pdfText(await createOfflinePdf(project,regular,mono),true).matchAll(/<word [^>]*>([^<]+)<\/word>/g)].map(m=>m[1]);
  const start=words.findIndex(w=>word.startsWith(w));
  expect(start).toBeGreaterThanOrEqual(0);expect(words[start]).not.toBe(word);
  expect(words[start]+words[start+1]).toBe(word);
 });
 it('cantos con rol sin producto asignado se leen «sin asignar» en la leyenda',async()=>{
  const project=single(),f=project.furniture[0];
  const text=pdfText(await createOfflinePdf(project,regular,mono,undefined,{[f.pieces[0].id]:{...placa,principal:null,secondary:null}}));
  expect(text).toContain('1 = sin asignar');expect(text).toContain('2 = sin asignar');expect(text).toContain('1·1·0·2');
 });
 it('el glifo de cantos admite piezas altas, apaisadas y sin base × altura del pedido',async()=>{
  const project=single(),[a,b,c]=project.furniture[0].pieces;
  const references={[a.id]:{...placa,base:100,height:2400},[b.id]:{...placa,base:2400,height:60},[c.id]:{...placa,base:undefined,height:undefined}};
  const text=pdfText(await createOfflinePdf(project,regular,mono,undefined,references));
  expect(text).toContain('corte 100 × 2400');expect(text).toContain('corte 2400 × 60');
 });
 it('una vista interior sin piezas visibles bloquea la hoja aunque la tabla las conserve',async()=>{
  const project=single(),f=project.furniture[0];
  f.presentation!.guide={...f.presentation!.guide!,mode:'interior',hiddenPieceIds:f.pieces.map(p=>p.id)};
  const error=await fitError(project);
  expect(error.kind).toBe('view');expect(error.reason).toMatch(/^Vista interior: La vista interior no tiene piezas visibles\./);
  expect(error.action).toBe('Corregí lo indicado en el editor de la guía y volvé a revisar la hoja.');
 });
});
