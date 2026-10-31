import {describe,it,expect} from 'vitest';
import {Matrix4} from 'three';
import {createDemo,demoDocument} from '../lib/demo';
import {type Furniture,type Vec3,applyEdit,toEdit} from '../lib/model';
import {pieceRows,pieceCodeMap,identicalGroups} from '../lib/pieceGroups';
import {withNaming,normalizeNaming} from '../lib/naming';
import {makeScene} from '../lib/scene';
import {mergeGuide,editsFor,type Guide} from '../sketchup_offline/ui/guide';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
function furniture():Furniture{
 const f=createDemo().furniture[0];f.pieces=f.pieces.slice(0,2);f.groupIdentical=true;return f;
}
describe('Componentes iguales: identidad de fabricación compartida y anclas físicas independientes',()=>{
 it('agrupa por definición/medidas/material, conserva todas las instancias y acepta rotación/traslación',()=>{
  const f=furniture(),before=JSON.stringify(f.pieces);
  f.pieces[1].transform=new Matrix4().makeRotationZ(Math.PI/3).setPosition(100,200,0).toArray();
  const geometry=JSON.stringify(f.pieces.map(p=>[p.id,p.mesh,p.transform,p.dimensions,p.quantity]));
  const named=withNaming(f,'VF','M01',{id:f.pieces[1].id,base:'PT'});
  expect(pieceRows(named)).toHaveLength(1);expect(pieceRows(named)[0]).toMatchObject({code:'P01',name:'VF M01 PT',quantity:2});
  expect(named.pieces.map(p=>p.name)).toEqual(['VF M01 PT','VF M01 PT']);expect(new Set(named.pieces.map(p=>p.code)).size).toBe(2);
  expect(pieceCodeMap(named).get(f.pieces[1].id)).toBe('P01');expect(JSON.stringify(named.pieces.map(p=>[p.id,p.mesh,p.transform,p.dimensions,p.quantity]))).toBe(geometry);
  expect(before).not.toBe(JSON.stringify(f.pieces));
  named.pieces.reverse();expect(pieceRows(named)[0].code).toBe('P01');
 });
 it('separa otras definiciones, materiales, geometrías, espesores, escalas locales, espejados y datos sin definición',()=>{
  const changes=[
   (f:Furniture)=>{f.pieces[1].definition='otra definición';},
   (f:Furniture)=>{f.pieces[1].mesh.faceMaterials=f.pieces[1].mesh.triangles.map(()=>({front:{id:'otro',name:'Roble',color:[120,90,70] as Vec3,opacity:1,textured:false},back:null}));},
   (f:Furniture)=>{f.pieces[1].mesh.vertices[0][0]+=1;},
   (f:Furniture)=>{f.pieces[1].dimensions[2]+=1;},
   (f:Furniture)=>{f.pieces[1].transform=new Matrix4().makeScale(2,1,1).toArray();},
   (f:Furniture)=>{f.pieces[1].transform=new Matrix4().makeScale(-1,1,1).toArray();},
   (f:Furniture)=>{delete f.pieces[0].definition;delete f.pieces[1].definition;}
  ];
  for(const change of changes){const f=furniture();change(f);expect(identicalGroups(f)).toHaveLength(2);}
 });
 it('es optativo por mueble y desagrupar recupera códigos individuales sin perder nombres',()=>{
  let f=withNaming(furniture(),'','M01',{id:'m-lateral-izq',base:'M01 PT'});
  const other={...structuredClone(f),id:'otro',pieces:[structuredClone(f.pieces[1])]};
  expect(pieceRows(other)[0].quantity).toBe(1);expect(pieceRows(f)[0].quantity).toBe(2);
  f={...f,groupIdentical:false};expect(pieceRows(f).map(p=>p.code)).toEqual(['P01','P02']);expect(f.pieces.every(p=>p.name==='M01 PT')).toBe(true);
 });
 it('guarda/recupera la opción, nombres y referencias físicas de las notas; una pieza modificada deja de compartir ID',()=>{
  const doc=structuredClone(demoDocument);doc.furniture=doc.furniture.slice(0,1);doc.furniture[0].children=doc.furniture[0].children.slice(0,2);
  const p=createDemo();p.furniture=[withNaming(furniture(),'VF','M01',{id:'m-lateral-izq',base:'PT'})];
  p.furniture[0].notes=[{id:crypto.randomUUID(),pieceId:'m-lateral-der',anchor:[0,0,0],position:[718,32],text:'Indicación solo en esta instancia'}];
  const guide:Guide={version:1,revision:1,workCode:'VF',selection:[p.furniture[0].id],furniture:editsFor(p,{})};
  const merged=mergeGuide(doc,guide).project.furniture[0];expect(merged.groupIdentical).toBe(true);expect(pieceRows(merged)[0].quantity).toBe(2);expect(merged.notes).toEqual(p.furniture[0].notes);
  doc.furniture[0].children[1].definition='otra';const changed=mergeGuide(doc,guide).project.furniture[0];expect(pieceRows(changed).map(p=>p.code)).toEqual(['P01','P02']);
 });
 it('el contrato web permite nombres físicos distintos sin convertir la agrupación en renombrado',()=>{
  const p=createDemo();p.furniture=[withNaming(furniture(),'','M01',{id:'m-lateral-izq',base:'M01 PT'})];
  const patch=toEdit(p),updated=applyEdit(p,patch);expect(updated.furniture[0].groupIdentical).toBe(true);expect(updated.furniture[0].pieces).toHaveLength(2);
  patch.furniture[0].pieces[1].name='Otro';expect(applyEdit(p,patch).furniture[0].pieces.map(p=>p.name)).toEqual(['M01 PT','Otro']);expect(p.furniture[0].pieces[1].name).toBe('M01 PT');
 });
 it('PDF A4: una fila con cantidad 2, el mismo ID en las dos piezas de ambas vistas y todas las mallas',async()=>{
  const p=createDemo();p.furniture=[withNaming(furniture(),'VF','M01',{id:'m-lateral-izq',base:'PT'})];const f=p.furniture[0];
  const ungrouped=makeScene({...f,groupIdentical:false});
  for(const view of ['front','back'] as const){const scene=makeScene(f,{view,layout:'sheet'});expect(scene.labels.map(l=>l.code)).toEqual(['P01','P01']);expect(scene.faces).toHaveLength(makeScene({...f,groupIdentical:false},{view,layout:'sheet'}).faces.length);}
  expect(ungrouped.labels.map(l=>l.code)).toEqual(['P01','P02']);
  const bytes=await createOfflinePdf(p,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf'));
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPages()).toHaveLength(1);expect(pdf.getPage(0).getWidth()*25.4/72).toBeCloseTo(297,6);expect(pdf.getPage(0).getHeight()*25.4/72).toBeCloseTo(210,6);
  const dir=await mkdtemp(join(tmpdir(),'planos-grupos-'));
  try{const path=join(dir,'grupo.pdf');await writeFile(path,bytes);const text=execFileSync('pdftotext',['-raw',path,'-'],{encoding:'utf8'});const table=execFileSync('pdftotext',['-x','566','-y','70','-W','254','-H','484','-raw',path,'-'],{encoding:'utf8'});expect(text).not.toContain('P02');expect(table.match(/P01/g)).toHaveLength(1);expect(table.replace(/\s+/g,' ')).toContain('VF M01 PT');expect(table).toMatch(/\b2\b/);await writeFile('artifacts/componentes-iguales-064-SINTETICO-A4.pdf',bytes);}finally{await rm(dir,{recursive:true,force:true});}
 });
});

describe('Regresión 0.7.0 nativa: agrupar sin editar conserva nombres',()=>{
 it('conserva cada base al agrupar, normalizar, guardar y reabrir, incluso con prefijos',()=>{
  const p=createDemo();p.furniture=p.furniture.slice(0,1);p.furniture[0].pieces=p.furniture[0].pieces.slice(0,2);
  const original=p.furniture[0].pieces.map(p=>p.name);
  p.furniture[0]=normalizeNaming(withNaming({...p.furniture[0],groupIdentical:true},''),'');
  expect(pieceRows(p.furniture[0])).toHaveLength(1);expect(p.furniture[0].pieces.map(p=>p.name)).toEqual(original);
  const guide:Guide={version:1,revision:1,selection:['modulo'],furniture:editsFor(p,{})};
  const doc=structuredClone(demoDocument);doc.furniture=doc.furniture.slice(0,1);doc.furniture[0].children=doc.furniture[0].children.slice(0,2);
  const reopened=mergeGuide(doc,guide).project.furniture[0];expect(reopened.pieces.map(p=>p.name)).toEqual(original);
  const prefixed=withNaming(reopened,'VF','M01');expect(prefixed.pieces.map(p=>p.name)).toEqual(original.map(n=>'VF M01 '+n));
  expect(prefixed.naming!.bases.map(b=>b.base)).toEqual(original);
  const explicit=withNaming(prefixed,'VF','M01',{id:prefixed.pieces[0].id,base:'Lateral'});expect(explicit.pieces.map(p=>p.name)).toEqual(['VF M01 Lateral','VF M01 Lateral']);
 });
});
