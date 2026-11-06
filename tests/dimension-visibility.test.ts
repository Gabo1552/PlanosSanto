import {describe,it,expect} from 'vitest';
import {createDemo,demoDocument} from '../lib/demo';
import {applyEdit,toEdit,TOTAL_DIMENSIONS} from '../lib/model';
import {pieceDimensionsOnly} from './helpers/cotas';
import {dimensionChoices,setDimensionVisible,dimensionCaption} from '../lib/dimensions';
import {makeScene} from '../lib/scene';
import {editsFor,mergeGuide,type Guide} from '../sketchup_offline/ui/guide';

describe('Visibilidad de cotas guardada sin alterar las medidas',()=>{
  it('oculta una cota compartida en ambas cámaras y PDF, y restaura por grupo sin afectar otra medida',()=>{
    // 0.8.31: piece cotas start hidden; this test is about them, so it turns them all on (totals off) first.
    const f=createDemo().furniture[0],original=JSON.stringify(f.pieces);f.dimensionDisplay=pieceDimensionsOnly(f);
    const count=makeScene(f).dimensions.length,shown=dimensionChoices(f).length;
    f.dimensionDisplay=setDimensionVisible(f,{pieceId:f.pieces[1].id,role:'largo'},false);
    for(const options of [{},{view:'back' as const},{layout:'sheet' as const}]){
      // The lateral's 700 also stood for the back panel (same height, same direction): that one is drawn now.
      const scene=makeScene(f,options);expect(scene.dimensions).toHaveLength(count);expect(scene.warnings).toEqual([]);
      expect(scene.dimensions.filter(d=>d.pieceId===f.pieces[0].id).map(d=>d.role)).toEqual(['ancho']);
      expect(scene.dimensions.find(d=>d.valueMm===700)!.pieceId).not.toMatch(/lateral/);
    }
    expect(dimensionCaption(f)).toBe(`COTAS EN mm · ${shown-1} DE PIEZA`);
    // Stable references remain effective if another equal-size instance becomes representative.
    [f.pieces[0].code,f.pieces[1].code]=[f.pieces[1].code,f.pieces[0].code];
    expect(dimensionChoices(f).find(c=>c.code==='P01'&&c.role==='largo')!.visible).toBe(false);
    f.dimensionDisplay=setDimensionVisible(f,{pieceId:f.pieces[1].id,role:'largo'},true);expect(makeScene(f).dimensions).toHaveLength(count);
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
    // 0.8.31: hiding everything is hiding the three totals (piece cotas are already hidden by default).
    const f=p.furniture[0];for(const total of TOTAL_DIMENSIONS)f.dimensionDisplay=setDimensionVisible(f,{total},false);
    expect(f.dimensionDisplay).toEqual({hiddenTotals:['alto','ancho','profundidad']});
    expect(makeScene(f).dimensions).toEqual([]);expect(makeScene(f).warnings).toEqual([]);expect(dimensionCaption(f)).toBe('COTAS OCULTAS · MEDIDAS EN LA TABLA');
  });
});
