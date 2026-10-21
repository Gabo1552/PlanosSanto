import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {importDocument} from '../lib/model';
import {createOfflinePdf} from '../sketchup_offline/ui/pdf';
import {makeScene} from '../lib/scene';

async function main(){
  const bytes=await readFile('fixtures/private/modelo.planos-santo.json');
  const report=JSON.parse(await readFile('fixtures/private/modelo.planos-santo.informe.json','utf8'));
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(report.sha256!==hash)throw new Error('El informe no corresponde al archivo real.');
  const project=importDocument(JSON.parse(bytes.toString()),'sketchup-ruby');
  if(project.furniture.length!==1||project.furniture[0].pieces.length!==8)throw new Error('La exportación ya no coincide con el caso real de regresión de ocho piezas.');
  const initial=JSON.stringify(project.furniture.map(f=>f.pieces));
  const fonts=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf'].map(name=>readFile('sketchup_offline/assets/'+name)));
  const logo=await readFile('sketchup_offline/assets/santo-carpintero.png');
  const scene=makeScene(project.furniture[0],{layout:'sheet'});
  if(scene.dimensions.length!==10||scene.warnings.length)throw new Error('No se pudieron colocar las 10 cotas reales de forma legible.');
  const output='artifacts/CA-AmSurrbac-DOS-VISTAS-A3.pdf';
  const pdfBytes=await createOfflinePdf(project,fonts[0],fonts[1],logo);await writeFile(output,pdfBytes);
  const pdf=await PDFDocument.load(pdfBytes);if(pdf.getPageCount()!==1)throw new Error('Cantidad incorrecta de hojas.');
  const page=pdf.getPage(0),width=page.getWidth()*25.4/72,height=page.getHeight()*25.4/72;
  if(Math.abs(width-420)>0.00001||Math.abs(height-297)>0.00001)throw new Error('El formato no es A3 exacto.');
  const text=execFileSync('pdftotext',['-layout',output,'-'],{encoding:'utf8'});
  for(const piece of project.furniture[0].pieces){if(!text.includes(piece.code)||!text.includes(piece.name))throw new Error('Falta una pieza en el PDF: '+piece.code);}
  // Independently inspect only the drawing region: numbers from the parts table do not count.
  const drawingText=execFileSync('pdftotext',['-x','28','-y','161','-W','395','-H','550','-raw',output,'-'],{encoding:'utf8'});
  const printedDimensions=[...drawingText.matchAll(/(\d+(?:,\d+)?)\s+mm\b/g)].map(m=>Number(m[1].replace(',','.'))).sort((a,b)=>a-b);
  // Independent expected representatives for this supplied eight-board model.
  const expectedCodes=['P01','P02','P04','P05','P06'];
  const actualCodes=[...new Set(scene.dimensions.map(d=>d.code))].sort();
  if(JSON.stringify(actualCodes)!==JSON.stringify(expectedCodes))throw new Error('Se acotó una pieza repetida o falta un tamaño.');
  const expectedDimensions=project.furniture[0].pieces.filter(p=>expectedCodes.includes(p.code)).flatMap(p=>p.dimensions.slice(0,2).map(v=>Number(v.toFixed(2)))).sort((a,b)=>a-b);
  if(JSON.stringify(printedDimensions)!==JSON.stringify(expectedDimensions))throw new Error('Las cotas impresas en la vista no coinciden con las 10 medidas reales.');
  const rearText=execFileSync('pdftotext',['-x','442','-y','161','-W','395','-H','550','-raw',output,'-'],{encoding:'utf8'});
  for(const p of project.furniture[0].pieces)if(!rearText.includes(p.code)||!drawingText.includes(p.code))throw new Error('Falta un código en una de las dos vistas.');
  if(/\d+\s+mm\b/.test(rearText))throw new Error('Se duplicaron cotas en la trasera.');
  if(!text.includes('DELANTERA')||!text.includes('TRASERA'))throw new Error('Falta identificar las vistas.');
  const tableText=execFileSync('pdftotext',['-x','866','-y','161','-W','310','-H','516','-raw',output,'-'],{encoding:'utf8'});
  if((tableText.match(/\b18\b/g)||[]).length!==8)throw new Error('Faltan espesores en la tabla del caso real.');
  const f=project.furniture[0];f.notes=[{id:crypto.randomUUID(),pieceId:f.pieces[0].id,anchor:f.pieces[0].mesh.vertices[0],position:[718,32],text:'PRUEBA OFFLINE: alinear antes de fijar'}];
  const notesOutput='artifacts/CA-AmSurrbac-DOS-VISTAS-PRUEBA-notas-A3.pdf';
  await writeFile(notesOutput,await createOfflinePdf(project,fonts[0],fonts[1],logo));
  const noteText=execFileSync('pdftotext',['-layout',notesOutput,'-'],{encoding:'utf8'});
  if(!noteText.includes('PRUEBA OFFLINE: alinear'))throw new Error('La nota de prueba falta en el PDF.');
  if(initial!==JSON.stringify(project.furniture.map(f=>f.pieces)))throw new Error('Las piezas o medidas cambiaron.');
  const hiddenProject=structuredClone(project),hiddenFurniture=hiddenProject.furniture[0];hiddenFurniture.notes=[];
  const target=hiddenFurniture.pieces.find(p=>p.code==='P02')!;
  hiddenFurniture.hiddenDimensions=[{pieceId:target.id,role:'largo'}];
  const hiddenOutput='artifacts/CA-AmSurrbac-COTA-OCULTA-A3.pdf';
  await writeFile(hiddenOutput,await createOfflinePdf(hiddenProject,fonts[0],fonts[1],logo));
  const readDrawing=(path:string)=>execFileSync('pdftotext',['-x','28','-y','161','-W','395','-H','550','-raw',path,'-'],{encoding:'utf8'});
  const readValues=(text:string)=>[...text.matchAll(/(\d+(?:,\d+)?)\s+mm\b/g)].map(m=>Number(m[1].replace(',','.'))).sort((a,b)=>a-b);
  const hiddenDrawing=readDrawing(hiddenOutput),hiddenValues=readValues(hiddenDrawing),expectedHidden=[...expectedDimensions];expectedHidden.splice(expectedHidden.indexOf(target.dimensions[0]),1);
  if(hiddenValues.length!==9||JSON.stringify(hiddenValues)!==JSON.stringify(expectedHidden)||!hiddenDrawing.includes('1 OCULTA'))throw new Error('La cota elegida no se ocultó correctamente en el PDF real.');
  const hiddenTable=execFileSync('pdftotext',['-x','866','-y','161','-W','310','-H','516','-raw',hiddenOutput,'-'],{encoding:'utf8'});
  if((hiddenTable.match(/1\.594/g)||[]).length!==2)throw new Error('Se alteraron las medidas originales en la tabla.');
  hiddenFurniture.hiddenDimensions=[];
  const restoredOutput='artifacts/CA-AmSurrbac-COTA-RESTAURADA-A3.pdf';await writeFile(restoredOutput,await createOfflinePdf(hiddenProject,fonts[0],fonts[1],logo));
  if(JSON.stringify(readValues(readDrawing(restoredOutput)))!==JSON.stringify(expectedDimensions))throw new Error('No se restauraron las diez cotas.');
  if(initial!==JSON.stringify(hiddenProject.furniture.map(f=>f.pieces)))throw new Error('Ocultar cotas alteró las piezas.');
  const result={source:'Exportación real aportada por el usuario; SketchUp no ejecutado en este host',sha256:hash,furniture:1,pieces:8,pages:1,widthMm:width,heightMm:height,
    engine:'pdf-lib y fuentes locales, sin Chromium ni servidor',allPieceCodesAndNames:true,sceneDimensions:scene.dimensions.length,diagramPdfDimensions:printedDimensions.length,dimensionValuesMatch:true,distinctSizes:5,dimensionedCodes:expectedCodes,duplicateCodes:['P03','P07','P08'],allEightPiecesRetained:true,thicknessInDrawing:false,thicknessInTable:true,twoViews:true,frontPieceCodes:8,rearPieceCodes:8,rearDimensions:0,dimensionFontPt:13*(139*72/25.4)/460,noteTextIncluded:true,piecesAndMeasuresUnchanged:true,sketchup2026Executed:false,manualMeasurementsVerified:false,visibility:{hiddenCode:'P02',hiddenRole:'largo',visibleDimensions:9,restoredDimensions:10,tableMeasuresUnchanged:true,files:[hiddenOutput,restoredOutput]},files:[output,notesOutput]};
  await writeFile('artifacts/validacion-offline-real.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
