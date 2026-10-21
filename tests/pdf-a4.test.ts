import {expect,it,describe} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {createOfflinePdf,pdfFaceColor} from '../sketchup_offline/ui/pdf';
import {createDemo,box} from '../lib/demo';
import {createA4Demo} from '../lib/a4Demo';
import {editSchema} from '../lib/model';
import type {Project} from '../lib/model';
const regular=readFileSync('sketchup_offline/assets/DejaVuSans.ttf');
const mono=readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf');
function sample(mode:'exterior'|'interior'|'both'='both'){
 const project=createDemo();project.furniture=[project.furniture[0]];
 project.furniture[0].presentation={guide:{mode,hiddenPieceIds:[],sharedCamera:true,observations:'Verificar escuadra antes del ajuste final.'}};
 return project;
}
function extract(bytes:Uint8Array,bbox=false){const dir=mkdtempSync(join(tmpdir(),'ps-a4-test-'));try{const path=join(dir,'guide.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',[bbox?'-bbox':'-layout',path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
async function exportPage(project:Project){const bytes=await createOfflinePdf(project,regular,mono);const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBe(project.furniture.length);for(const page of doc.getPages()){expect(page.getWidth()*25.4/72).toBeCloseTo(297,8);expect(page.getHeight()*25.4/72).toBeCloseTo(210,8);expect(page.getCropBox()).toEqual(page.getMediaBox());}const bbox=extract(bytes,true);for(const match of bbox.matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)"/g)){const [x1,y1,x2,y2]=match.slice(1).map(Number);expect(x1).toBeGreaterThanOrEqual(0);expect(y1).toBeGreaterThanOrEqual(0);expect(x2).toBeLessThanOrEqual(297*72/25.4);expect(y2).toBeLessThanOrEqual(210*72/25.4);}return {bytes,text:extract(bytes)};}
describe('Guía offline A4 horizontal sin páginas adicionales',()=>{
 it('conserva rellenos HSL/RGB del visor en el contenido del PDF en lugar de volverlos blancos',async()=>{
  const hsl=pdfFaceColor('hsl(37 27% 81%)');
  expect(hsl.red).toBeCloseTo(.8613,4);expect(hsl.green).toBeCloseTo(.82197,4);expect(hsl.blue).toBeCloseTo(.7587,4);
  const rgb=pdfFaceColor('rgb(128 64 32)');expect(rgb.red).toBeCloseTo(128/255,4);expect(rgb.green).toBeCloseTo(64/255,4);expect(rgb.blue).toBeCloseTo(32/255,4);
  const project=sample('exterior'),bytes=await createOfflinePdf(project,regular,mono),pdf=await PDFDocument.load(bytes);
  const commands=pdf.context.enumerateIndirectObjects().flatMap(([,object])=>object instanceof PDFRawStream?[Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')]:[]).join('\n');
  const fills=[...commands.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg\b/g)].map(match=>match.slice(1).map(Number));
  // The model has no assigned material: the viewer uses its warm neutral HSL faces.
  // Header, label backgrounds and text do not satisfy this warm, non-white fill.
  expect(fills.some(([r,g,b])=>r>.7&&r<.99&&g>.65&&b>.5&&r>g+.02&&g>b+.02)).toBe(true);
 });
 it('imprime una vista exterior, listado completo y observaciones',async()=>{
  const {text}=await exportPage(sample('exterior'));
  expect(text).toContain('VISTA EXTERIOR');expect(text).not.toContain('VISTA INTERIOR');expect(text).toContain('Verificar escuadra');expect(text).toContain('Lateral izquierdo');expect(text).toContain('764');expect(text).toContain('297 × 210 mm');
 });
 it('imprime interior con piezas ocultas conservadas en tabla y anotaciones ancladas visibles',async()=>{
  const project=sample('interior'),f=project.furniture[0];f.presentation!.guide!.hiddenPieceIds=[f.pieces[0].id];
  f.notes=[{id:'test-note',pieceId:f.pieces[1].id,anchor:[9,200,350],position:[500,100],text:'Atornillar desde adentro.'}];
  const original=JSON.stringify(project),{text}=await exportPage(project);
  expect(text).toContain('VISTA INTERIOR');expect(text).not.toContain('VISTA EXTERIOR');expect(text).toContain('Lateral izquierdo');expect(text).toContain('Atornillar desde adentro');expect(JSON.stringify(project)).toBe(original);
 });
 it('produce dos vistas y conserva referencias de materiales y cantos',async()=>{
  const project=sample(),f=project.furniture[0];const bytes=await createOfflinePdf(project,regular,mono,undefined,{[f.pieces[0].id]:'MDF 18 · Canto 1'}),text=extract(bytes);
  expect(text).toContain('VISTA EXTERIOR');expect(text).toContain('VISTA INTERIOR');expect(text).toContain('MDF 18');expect(text).toContain('Canto 1');
 });
 it('migra sólo para imprimir guías anteriores sin modificar el proyecto',async()=>{
  const project=sample();delete project.furniture[0].presentation;const original=JSON.stringify(project);const {text}=await exportPage(project);
  expect(text).toContain('VISTA EXTERIOR');expect(text).toContain('VISTA INTERIOR');expect(JSON.stringify(project)).toBe(original);
 });
 it('rechaza tablas extensas y textos largos con opciones de ajuste sin truncar ni agregar páginas',async()=>{
  const project=sample('exterior'),f=project.furniture[0];const template=f.pieces[0];f.pieces=Array.from({length:40},(_,i)=>({...template,id:`physical/${i}`,code:`P${String(i+1).padStart(2,'0')}`,name:`Pieza ${i+1}`,mesh:box(18,450,700)}));
  await expect(createOfflinePdf(project,regular,mono)).rejects.toThrow(/listado.*A4.*8 pt.*hoja adicional requiere aprobación/);
  const notes=sample('exterior');notes.furniture[0].presentation!.guide!.observations='Texto extenso de armado '.repeat(120);
  await expect(createOfflinePdf(notes,regular,mono)).rejects.toThrow(/notas y observaciones.*Acortá/);
 });
 it('resuelve el bajo mesada SINTÉTICO de 17 piezas en dos vistas con cotas completas e IDs agrupados',async()=>{
  const project=createA4Demo(),f=project.furniture[0];f.zoom=1;f.presentation!.cameras={front:{yaw:-30,pitch:45}};
  expect(f.pieces).toHaveLength(17);const original=JSON.stringify(project);
  expect(editSchema.safeParse({revision:project.revision,furniture:[{id:f.id,explosion:f.explosion,zoom:f.zoom,pieces:f.pieces.map(p=>({id:p.id,name:p.name})),notes:f.notes,presentation:f.presentation}]}).success).toBe(true);
  const {text}=await exportPage(project);
  expect(text).toContain('DEMOSTRACIÓN SINTÉTICA');expect(text).toContain('17 piezas');expect(text).toContain('VISTA EXTERIOR');expect(text).toContain('VISTA INTERIOR');expect(text).toContain('P09 ×6');expect(text).toContain('P11 ×3');expect(text.match(/1200/g)!.length).toBeGreaterThanOrEqual(3);expect(text).toContain('520 m');expect(text.match(/Observaciones de armado:/g)).toHaveLength(1);expect(JSON.stringify(project)).toBe(original);
 });
 it('no acepta proyectos vacíos ni nombres sin completar',async()=>{
  const project=sample();project.furniture=[];await expect(createOfflinePdf(project,regular,mono)).rejects.toThrow(/Seleccioná/);
  const blank=sample();blank.furniture[0].pieces[0].name='';await expect(createOfflinePdf(blank,regular,mono)).rejects.toThrow(/nombres vacíos/);
 });
});
