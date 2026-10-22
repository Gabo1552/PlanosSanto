import {describe,it,expect} from 'vitest';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {Matrix4} from 'three';
import {makeScene} from '../lib/scene';
import {createDemo,demoDocument} from '../lib/demo';
import {editsFor,mergeGuide,guideIssues,guideNotices,type Guide} from '../sketchup_offline/ui/guide';
import {createOfflinePdf,createOfflinePdfPages} from '../sketchup_offline/ui/pdf';

function savedGuide():Guide{return {version:1,revision:1,selection:['modulo','mesa'],furniture:editsFor(createDemo(),{})};}
describe('Guías locales; fixtures sintéticos, sin ejecutar SketchUp',()=>{
  it('conserva nombres, códigos y notas al reordenar e insertar instancias',()=>{
    const guide=savedGuide();guide.furniture[0].pieces[0].name='Costado conservado';
    const doc=structuredClone(demoDocument);doc.furniture[0].children.reverse();
    doc.furniture[0].children.push({...structuredClone(doc.furniture[0].children[0]),id:'new-instance'});
    const merged=mergeGuide(doc,guide).project.furniture[0];
    expect(merged.pieces.find(p=>p.id==='m-lateral-izq')).toMatchObject({code:'P01',name:'Costado conservado'});
    expect(merged.pieces.find(p=>p.id==='new-instance')!.code).toBe('P07');
    expect(new Set(merged.pieces.map(p=>p.code)).size).toBe(7);
    expect(merged.pieces.every(p=>p.quantity===1)).toBe(true);
  });
  it('conserva una nota huérfana fuera de la escena y la avisa sin bloquear el PDF',()=>{
    const guide=savedGuide();const note={id:crypto.randomUUID(),pieceId:'removed-piece',anchor:[1,2,3] as [number,number,number],position:[718,32] as [number,number],text:'No reasignar automáticamente'};
    guide.furniture[0].notes=[note];
    const merged=mergeGuide(demoDocument,guide);
    expect(merged.project.furniture[0].notes).toEqual([]);expect(merged.orphans.modulo).toEqual([note]);
    expect(guideIssues(merged.project.furniture[0])).toEqual([]);expect(guideNotices(merged.orphans.modulo).join()).toMatch(/sin pieza/);
    expect(editsFor(merged.project,merged.orphans)[0].notes).toEqual([note]);
  });
  it('produce PDF vectorial exacto con todas las piezas y notas, sin servidor',async()=>{
    const project=createDemo(),before=JSON.stringify(project.furniture.map(f=>f.pieces));
    project.furniture[0].notes=[{id:crypto.randomUUID(),pieceId:project.furniture[0].pieces[0].id,anchor:[0,0,0],position:[718,32],text:'Alinear unión y después fijar'}];
    const bytes=await createOfflinePdf(project,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'));
    const pdf=await PDFDocument.load(bytes);expect(pdf.getPages()).toHaveLength(2);
    for(const page of pdf.getPages()){expect(page.getWidth()*25.4/72).toBeCloseTo(297,6);expect(page.getHeight()*25.4/72).toBeCloseTo(210,6);}
    const dir=await mkdtemp(join(tmpdir(),'planos-offline-pdf-'));
    try{
      const path=join(dir,'guide.pdf');await writeFile(path,bytes);
      const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
      for(const f of project.furniture)for(const p of f.pieces){expect(text).toContain(p.code);expect(text).toContain(p.name);}
      expect(text).toContain('VISTA EXTERIOR');expect(text).toContain('VISTA INTERIOR');
      expect(text).toContain('Alinear unión y después');expect(text).toContain('fijar');
    }finally{await rm(dir,{recursive:true,force:true});}
    expect(JSON.stringify(project.furniture.map(f=>f.pieces))).toBe(before);
  });
  it('reubica marcadores de notas conservando el texto y bloquea un listado extenso sin páginas extra',async()=>{
    const fonts=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf'].map(f=>readFile('sketchup_offline/assets/'+f)));
    const project=createDemo(),f=project.furniture[0];
    f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0],position:[718,528],text:'La tarjeta no entra'}];
    expect(makeScene(f).warnings.join()).toMatch(/fuera/);
    const positioned=await PDFDocument.load(await createOfflinePdf(project,fonts[0],fonts[1]));expect(positioned.getPageCount()).toBe(2);expect(f.notes[0].position).toEqual([718,528]);
    f.notes=[];f.pieces=Array.from({length:50},(_,i)=>({...f.pieces[i%6],id:`board-${i}`,code:`P${String(i+1).padStart(2,'0')}`}));
    await expect(createOfflinePdf(project,fonts[0],fonts[1])).rejects.toThrow(/listado|etiquetas/);
    expect(f.pieces).toHaveLength(50);
  });
  it('rechaza una leyenda de notas que excede el espacio junto a las dos vistas, sin omitirlas',async()=>{
    const project=createDemo();project.furniture=project.furniture.slice(0,1);const f=project.furniture[0];
    f.notes=Array.from({length:6},(_,i)=>({id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0] as [number,number,number],position:[718,32+i*80] as [number,number],text:`Indicación ${i+1} ${'Revisar unión y colocar herraje antes de montar. '.repeat(5)}`}));
    await expect(createOfflinePdf(project,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'))).rejects.toThrow(/notas y observaciones/);
    expect(f.notes).toHaveLength(6);
  });
  // Simplificación punto 29: el listado que no cabe sigue solo en la hoja 2 (1a, 1b), sin bloquear ni recortar.
  it('conserva treinta piezas y cotas compartidas y pasa a la hoja 2 un listado que no cabe en la A4',async()=>{
    const project=createDemo();project.furniture=project.furniture.slice(0,1);
    const f=project.furniture[0],template=f.pieces[2];
    f.pieces=Array.from({length:30},(_,i)=>({...template,id:`shelf-${i}`,name:`Estante ${i+1}`,code:`P${String(i+1).padStart(2,'0')}`,transform:new Matrix4().makeTranslation(0,0,i*60).toArray()}));
    const scene=makeScene(f);expect(scene.labels).toHaveLength(30);expect(scene.dimensions).toHaveLength(2);expect(scene.warnings).toEqual([]);
    const {pages}=await createOfflinePdfPages(project,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'));
    expect(pages[0].label).toBe('1a');expect(pages.slice(1).every((p,i)=>p.label===`1${String.fromCharCode(98+i)}`)).toBe(true);expect(pages.length).toBeGreaterThan(1);expect(pages[0].fit?.detail).toMatch(/^Necesita/);
    expect(f.pieces).toHaveLength(30);expect(new Set(f.pieces.map(p=>p.id)).size).toBe(30);
  });
});
