import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {PDFDocument,PDFPage} from 'pdf-lib';
import {createA4Demo} from '../lib/a4Demo';
import {createDemo} from '../lib/demo';
import {makeScene} from '../lib/scene';
import {segmentHitsRect} from '../lib/dimensions';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';

describe('Texto de cotas protegido de los líderes del plano',()=>{
 // Before 0.8.19 this camera had the P06 leader crossing the P07 «760 mm» text. Equal measures are now drawn once and
 // the freed room keeps leaders off cota texts; the paint order below still protects them when they do cross.
 it('una escena sintética densa ya no cruza líderes de ID sobre textos de cota',()=>{
  const f=createA4Demo().furniture[0];f.zoom=1;f.presentation!.cameras={front:{yaw:-2,pitch:10}};
  const scene=makeScene(f,{view:'front',layout:'sheet'});
  expect(scene.warnings).toEqual([]);
  expect(scene.labels.length).toBeGreaterThan(0);
  expect(scene.dimensions.some(dimension=>scene.labels.some(label=>segmentHitsRect(label.anchor,{x:label.x+label.w/2,y:label.y+12},dimension.label.rect,0)))).toBe(false);
 });
 it.each(['17 piezas','nota con flecha'])('genera un PDF real y protege las cotas en ambas vistas: %s',async scenario=>{
  const project=scenario==='17 piezas'?createA4Demo():createDemo();project.furniture=[project.furniture[0]];const f=project.furniture[0];
  // IDs are hidden by default on the sheet; these scenarios choose to print them.
  if(scenario==='17 piezas'){f.zoom=1;f.presentation!.cameras={front:{yaw:-30,pitch:45}};f.presentation!.hideIds=false;}
  else{f.presentation={hideIds:false,guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:'Verificar escuadra.'}};f.notes=[{id:'occlusion-note',pieceId:f.pieces[1].id,anchor:[9,200,350],position:[500,100],text:'Atornillar desde adentro.'}];}
  const events:{kind:'text'|'line';value?:string}[]=[];
  const originalText=PDFPage.prototype.drawText,originalLine=PDFPage.prototype.drawLine;
  const textSpy=vi.spyOn(PDFPage.prototype,'drawText').mockImplementation(function(this:PDFPage,...args:Parameters<PDFPage['drawText']>){events.push({kind:'text',value:args[0]});return originalText.apply(this,args);});
  const lineSpy=vi.spyOn(PDFPage.prototype,'drawLine').mockImplementation(function(this:PDFPage,...args:Parameters<PDFPage['drawLine']>){events.push({kind:'line'});return originalLine.apply(this,args);});
  try{
   const bytes=await createOfflinePdf(project,readFileSync('sketchup_offline/assets/DejaVuSans.ttf'),readFileSync('sketchup_offline/assets/DejaVuSansMono.ttf'));
   const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);
   expect(pdf.getPage(0).getWidth()*25.4/72).toBeCloseTo(297,8);expect(pdf.getPage(0).getHeight()*25.4/72).toBeCloseTo(210,8);
   for(const heading of ['VISTA EXTERIOR','VISTA INTERIOR']){
    const start=events.findIndex(e=>e.value===heading);
    const end=events.findIndex((e,i)=>i>start&&!!e.value?.startsWith(heading==='VISTA EXTERIOR'?'COTAS EN mm':'INTERIOR ·'));
    expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start);
    const drawing=events.slice(start+1,end),dimensionIndices=drawing.flatMap((e,i)=>e.kind==='text'&&/^\d+(?:[,.]\d+)? mm$/.test(e.value||'')?[i]:[]);
    const idIndices=drawing.flatMap((e,i)=>e.kind==='text'&&/^P\d+(?: ×\d+)?$/.test(e.value||'')?[i]:[]);
    expect(idIndices.length).toBeGreaterThan(0);expect(dimensionIndices.length).toBeGreaterThan(0);
    const firstDimension=Math.min(...dimensionIndices);
    expect(Math.max(...idIndices)).toBeLessThan(firstDimension);
    expect(drawing.slice(firstDimension).some(e=>e.kind==='line')).toBe(false);
   }
  }finally{textSpy.mockRestore();lineSpy.mockRestore();}
 });
});
