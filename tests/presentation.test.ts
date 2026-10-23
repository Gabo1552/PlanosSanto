import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {createDemo,demoDocument} from '../lib/demo';
import {makeScene,pickAnchor,cameraBasis} from '../lib/scene';
import {applyEdit,toEdit} from '../lib/model';
import {defaultCamera} from '../lib/presentation';
import {withNaming,moduleFromName} from '../lib/naming';
import {shiftDimension} from '../components/ViewAdjustments';
import {editsFor,mergeGuide,type Guide} from '../sketchup_offline/ui/guide';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

describe('Rotación, cotas e identificación persistentes',()=>{
  it('las cámaras son independientes, ortonormales y permiten seleccionar con ancla local sin tocar medidas',()=>{
    const f=createDemo().furniture[0],geometry=JSON.stringify(f.pieces);
    f.presentation={cameras:{front:{yaw:35,pitch:47}}};
    const scene=makeScene(f),back=makeScene(f,{view:'back'});
    expect(back.camera.forward.distanceTo(cameraBasis('back').forward)).toBeLessThan(1e-12);
    expect(scene.camera.forward.distanceTo(cameraBasis().forward)).toBeGreaterThan(.1);
    expect(scene.camera.right.dot(scene.camera.forward)).toBeCloseTo(0,12);
    expect(scene.camera.up.length()).toBeCloseTo(1,12);
    const face=scene.faces[0],p=f.pieces.find(p=>p.id===face.pieceId)!;
    const tri=p.mesh.triangles[Number(face.key.slice(face.key.lastIndexOf('-')+1))];
    const local=tri.reduce((v,i)=>v.add(new Vector3(...p.mesh.vertices[i])),new Vector3()).divideScalar(3);
    expect(new Vector3(...pickAnchor(f,p,scene.anchor(p.id,local.toArray()))).distanceTo(local)).toBeLessThan(1e-5);
    expect(JSON.stringify(f.pieces)).toBe(geometry);
  });
  it('mueve las cotas manteniendo anclas geométricas, valor y líneas conectadas; guarda también por vista',()=>{
    const f=createDemo().furniture[0];f.pieces=[f.pieces[0]];f.presentation={hideIds:true};
    const before=makeScene(f,{layout:'sheet'}),d=before.dimensions[0];
    f.presentation=shiftDimension(f,'front',d.pieceId,d.role,[8,6],[460,640]);
    const after=makeScene(f,{layout:'sheet'}),moved=after.dimensions.find(n=>n.role===d.role)!;
    expect(moved.label.center.x-d.label.center.x).toBeCloseTo(8,8);expect(moved.label.center.y-d.label.center.y).toBeCloseTo(6,8);
    expect(moved.localStart).toEqual(d.localStart);expect(moved.localEnd).toEqual(d.localEnd);expect(moved.valueMm).toBe(d.valueMm);
    const oldExtension=d.segments.find(s=>s.kind==='extension')!,newExtension=moved.segments.find(s=>s.kind==='extension')!;
    expect(newExtension.a).toEqual(oldExtension.a);expect(newExtension.b.x-oldExtension.b.x).toBeCloseTo(8);
    // A cota dragged off the paper comes back to the nearest free position on it (0.8.19), without a warning.
    const far=structuredClone(f);far.presentation!.dimensionOffsets![0].offset=[1,1];const back=makeScene(far,{layout:'sheet'}),r=back.dimensions.find(n=>n.role===d.role)!.label.rect;
    expect(back.warnings).toEqual([]);expect(r.x).toBeGreaterThanOrEqual(9);expect(r.y).toBeGreaterThanOrEqual(9);expect(r.x+r.w).toBeLessThanOrEqual(back.width-9);expect(r.y+r.h).toBeLessThanOrEqual(back.height-40);
    expect(makeScene(f,{view:'back',layout:'sheet'}).dimensions).toEqual([]);
  });
  it('web valida preferencias, conserva valores anteriores cuando se omiten y rechaza referencias ajenas',()=>{
    const p=createDemo();p.furniture[0].presentation={cameras:{front:defaultCamera},hideIds:true,dimensionOffsets:[{pieceId:p.furniture[0].pieces[0].id,role:'ancho',view:'front',offset:[.01,0]}]};
    const edit=toEdit(p),saved=applyEdit(p,edit);expect(saved.furniture[0].presentation).toEqual(p.furniture[0].presentation);
    delete edit.furniture[0].presentation;expect(applyEdit(p,edit).furniture[0].presentation).toEqual(p.furniture[0].presentation);
    edit.furniture[0].presentation={dimensionOffsets:[{pieceId:'foreign',role:'largo',view:'front',offset:[0,0]}]};expect(()=>applyEdit(p,edit)).toThrow(/desconocida/);
    edit.furniture[0].presentation={cameras:{front:{yaw:Infinity,pitch:90}}};expect(()=>applyEdit(p,edit)).toThrow();
  });
  it('compone VF M01 Lateral sin duplicar prefijos y toma un módulo cambiado externamente al reabrir',()=>{
    expect(moduleFromName('M01 Estantería izq. Util.')).toBe('M01');expect(moduleFromName('Estantería M02')).toBe('M02');expect(moduleFromName('ARM01X')).toBe('');
    const p=createDemo(),f=p.furniture[0];f.name='M01 Estantería izq. Util.';
    p.furniture[0]=withNaming(f,'VF','M01',{id:f.pieces[0].id,base:'Lateral'});
    expect(p.furniture[0].pieces[0].name).toBe('VF M01 Lateral');
    p.furniture[0]=withNaming(p.furniture[0],'AB','M02');expect(p.furniture[0].pieces[0].name).toBe('AB M02 Lateral');
    const guide:Guide={version:1,revision:1,workCode:'VF',selection:[f.id],furniture:editsFor(p,{})};
    const doc=structuredClone(demoDocument);doc.furniture[0].name='M03 Estantería izq. Util.';
    const merged=mergeGuide(doc,guide).project.furniture[0];expect(merged.pieces[0].name).toBe('VF M03 Lateral');expect(merged.pieces[0].code).toBe('P01');
    expect(withNaming({...f,naming:undefined},'VF','M01',{id:f.pieces[0].id,base:'AS - Lateral'}).pieces[0].name).toBe('VF M01 AS - Lateral');
    expect(merged.pieces.map(p=>p.dimensions)).toEqual(f.pieces.map(p=>p.dimensions));
  });
  it('reutiliza nombres importados VF M9 sin duplicarlos al completar obra y módulo después de generar',()=>{
    const f=createDemo().furniture[0],p=f.pieces[0];p.name='VF M9 Piso';
    p.metadata={persistentId:p.id,instancePath:[p.id],originalName:p.name,definitionName:'Pieza',hidden:false,effectiveVisible:true,tag:'',material:null,worldTransform:p.transform,warnings:[]};
    const initial=withNaming(f,'');
    const configured=withNaming(withNaming(initial,'VF',''),'VF','M9');
    expect(configured.pieces[0].name).toBe('VF M9 Piso');expect(configured.naming?.bases[0].base).toBe('Piso');
    expect(withNaming(configured,'AB','M02').pieces[0].name).toBe('AB M02 Piso');
    p.metadata.nameBase='Piso';
    expect(withNaming(withNaming(f,''),'VF','M9').pieces[0].name).toBe('VF M9 Piso');
    // Preserve a base intentionally recorded in our own metadata, including these words.
    p.metadata.nameBase='VF M9 Piso';
    expect(withNaming(f,'VF','M9').pieces[0].name).toBe('VF M9 VF M9 Piso');
  });
  it('al eliminar una pieza descarta solo su posición de cota y conserva las cámaras',()=>{
    const p=createDemo(),f=p.furniture[0];
    f.presentation={guide:{mode:'interior',hiddenPieceIds:[f.pieces[0].id,f.pieces[1].id],sharedCamera:false,observations:'Mantener'},cameras:{front:{yaw:12,pitch:35}},dimensionOffsets:[{pieceId:f.pieces[0].id,role:'largo',view:'front',offset:[.1,0]}]};
    const guide:Guide={version:1,revision:1,selection:[f.id],furniture:editsFor(p,{})};
    const doc=structuredClone(demoDocument);doc.furniture[0].children.shift();
    const merged=mergeGuide(doc,guide).project.furniture[0];
    expect(merged.presentation?.dimensionOffsets).toEqual([]);expect(merged.presentation?.cameras).toEqual(f.presentation.cameras);expect(merged.presentation?.guide).toEqual({...f.presentation.guide,hiddenPieceIds:[f.pieces[1].id]});
  });
  it('guarda y reabre vistas A4 por ruta física, cámara, zoom, observaciones y anotaciones sin tocar piezas',()=>{
    const p=createDemo(),f=p.furniture[0],hidden=f.pieces[1].id,geometry=JSON.stringify(f.pieces);
    expect(f.pieces[0].definition).toBe(f.pieces[1].definition);
    f.zoom=.9;f.presentation={guide:{mode:'both',hiddenPieceIds:[hidden],sharedCamera:true,observations:'Montar zócalo al final'},cameras:{front:{yaw:31,pitch:44}}};
    f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:[0,0,0],position:[718,32],text:'Alinear antes de fijar'}];
    const saved=applyEdit(p,toEdit(p));
    const guide:Guide={version:1,revision:1,selection:[f.id],furniture:editsFor(saved,{})};
    const reopened=mergeGuide(demoDocument,JSON.parse(JSON.stringify(guide))).project.furniture[0];
    expect(reopened.presentation).toEqual(f.presentation);expect(reopened.zoom).toBe(.9);expect(reopened.notes).toEqual(f.notes);
    const outside=makeScene(reopened,{view:'front'}),inside=makeScene(reopened,{view:'back'});
    expect(outside.faces.some(face=>face.pieceId===hidden)).toBe(true);expect(inside.faces.some(face=>face.pieceId===hidden)).toBe(false);
    expect(inside.faces.some(face=>face.pieceId===f.pieces[0].id)).toBe(true);expect(inside.camera.forward.distanceTo(outside.camera.forward)).toBeLessThan(1e-9);
    expect(reopened.pieces).toHaveLength(f.pieces.length);expect(JSON.stringify(f.pieces)).toBe(geometry);
    const edit=toEdit(saved);edit.furniture[0].presentation!.guide!.hiddenPieceIds=['foreign/physical/path'];expect(()=>applyEdit(saved,edit)).toThrow(/ruta de instancia desconocida/);
    edit.furniture[0].presentation!.guide!.hiddenPieceIds=[hidden,hidden];expect(()=>applyEdit(saved,edit)).toThrow(/duplicadas/);
  });
  it('el PDF A4 usa rotación y cotas guardadas, oculta IDs del dibujo y conserva todas las filas',async()=>{
    const p=createDemo();p.furniture=[p.furniture[0]];const f=p.furniture[0];f.pieces=[f.pieces[0]];
    f.presentation={hideIds:true,cameras:{front:{yaw:20,pitch:35},back:{yaw:-15,pitch:40}}};
    const d=makeScene(f,{layout:'sheet'}).dimensions[0];f.presentation=shiftDimension(f,'front',d.pieceId,d.role,[4,2],[460,640]);
    expect(makeScene(f,{layout:'sheet'}).labels).toEqual([]);
    const dir=await mkdtemp(join(tmpdir(),'planos-presentation-'));
    try{
      const file=join(dir,'ajustes.pdf');await writeFile(file,await createOfflinePdf(p,await readFile('sketchup_offline/assets/DejaVuSans.ttf'),await readFile('sketchup_offline/assets/DejaVuSansMono.ttf')));
      const diagram=execFileSync('pdftotext',['-x','22','-y','124','-W','504','-H','405','-raw',file,'-'],{encoding:'utf8'});
      const text=execFileSync('pdftotext',['-raw',file,'-'],{encoding:'utf8'});
      expect(diagram).not.toContain('P01');expect(text).toContain('P01');expect(text).toContain(f.pieces[0].name);expect(diagram).toMatch(/mm/);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
