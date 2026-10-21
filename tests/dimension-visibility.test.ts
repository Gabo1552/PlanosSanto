import {describe,it,expect} from 'vitest';
import {createDemo,demoDocument} from '../lib/demo';
import {applyEdit,toEdit} from '../lib/model';
import {dimensionChoices,setDimensionVisible,dimensionCaption} from '../lib/dimensions';
import {makeScene} from '../lib/scene';
import {editsFor,mergeGuide,type Guide} from '../sketchup_offline/ui/guide';

describe('Visibilidad de cotas guardada sin alterar las medidas',()=>{
  it('oculta una cota compartida en ambas cámaras y PDF, y restaura por grupo sin afectar otra medida',()=>{
    const f=createDemo().furniture[0],original=JSON.stringify(f.pieces),count=makeScene(f).dimensions.length;
    f.hiddenDimensions=setDimensionVisible(f,f.pieces[1].id,'largo',false);
    for(const options of [{},{view:'back' as const},{layout:'sheet' as const}]){
      const scene=makeScene(f,options);expect(scene.dimensions).toHaveLength(count-1);expect(scene.warnings).toEqual([]);
      expect(scene.dimensions.filter(d=>d.pieceId===f.pieces[0].id).map(d=>d.role)).toEqual(['ancho']);
    }
    expect(dimensionCaption(f)).toContain('1 OCULTA');
    // Stable references remain effective if another equal-size instance becomes representative.
    [f.pieces[0].code,f.pieces[1].code]=[f.pieces[1].code,f.pieces[0].code];
    expect(dimensionChoices(f).find(c=>c.code==='P01'&&c.role==='largo')!.visible).toBe(false);
    f.hiddenDimensions=setDimensionVisible(f,f.pieces[1].id,'largo',true);expect(makeScene(f).dimensions).toHaveLength(count);
    [f.pieces[0].code,f.pieces[1].code]=[f.pieces[1].code,f.pieces[0].code];expect(JSON.stringify(f.pieces)).toBe(original);
  });
  it('guarda selecciones válidas, conserva preferencias con clientes anteriores y rechaza referencias adulteradas',()=>{
    const project=createDemo(),edit=toEdit(project);edit.furniture[0].hiddenDimensions=[{pieceId:project.furniture[0].pieces[0].id,role:'ancho'}];
    const saved=applyEdit(project,edit);expect(saved.furniture[0].hiddenDimensions).toEqual(edit.furniture[0].hiddenDimensions);expect(saved.furniture[0].pieces).toEqual(project.furniture[0].pieces);
    const legacy=toEdit(saved);delete legacy.furniture[0].hiddenDimensions;expect(applyEdit(saved,legacy).furniture[0].hiddenDimensions).toEqual(saved.furniture[0].hiddenDimensions);
    const wrong=toEdit(project);wrong.furniture[0].hiddenDimensions=[{pieceId:'inexistente',role:'largo'}];expect(()=>applyEdit(project,wrong)).toThrow(/desconocida/);
    const duplicate=toEdit(project);duplicate.furniture[0].hiddenDimensions=[edit.furniture[0].hiddenDimensions![0],edit.furniture[0].hiddenDimensions![0]];expect(()=>applyEdit(project,duplicate)).toThrow(/duplicadas/);
    const invalid=toEdit(project);Object.assign(invalid.furniture[0],{hiddenDimensions:[{pieceId:project.furniture[0].pieces[0].id,role:'espesor'}]});expect(()=>applyEdit(project,invalid)).toThrow();
  });
  it('reabre guías antiguas y nuevas, elimina referencias de piezas borradas y permite ocultar todas explícitamente',()=>{
    const p=createDemo(),g:Guide={version:1,revision:1,selection:['modulo'],furniture:editsFor(p,{})};
    delete g.furniture[0].hiddenDimensions;expect(mergeGuide(demoDocument,g).project.furniture[0].hiddenDimensions).toEqual([]);
    g.furniture[0].hiddenDimensions=[{pieceId:p.furniture[0].pieces[0].id,role:'largo'}];
    const merged=mergeGuide(demoDocument,JSON.parse(JSON.stringify(g)));expect(editsFor(merged.project,{})[0].hiddenDimensions).toEqual(g.furniture[0].hiddenDimensions);
    const removed=structuredClone(demoDocument);removed.furniture[0].children.shift();expect(mergeGuide(removed,g).project.furniture[0].hiddenDimensions).toEqual([]);
    const f=p.furniture[0];f.hiddenDimensions=dimensionChoices(f).map(c=>({pieceId:c.pieceId,role:c.role}));
    expect(makeScene(f).dimensions).toEqual([]);expect(makeScene(f).warnings).toEqual([]);expect(dimensionCaption(f)).toContain('MEDIDAS EN LA TABLA');
  });
});
