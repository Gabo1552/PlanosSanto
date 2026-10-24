/** Local-only audit of supplier JSON/PDF. Never copies private cuts to a fixture or contacts the supplier. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {packExperto} from '../sketchup_offline/ui/expertoOptimizer';
import type {SheetPiece} from '../sketchup_offline/ui/sheetOptimizer';

type Cut={id:number;cantidad:number;base:number;altura:number;descripcion:string;rota:boolean;tapacantos:number};
type SupplierCase={placa:{base:number;altura:number;espesor:number;veta:boolean};cortes:Cut[]};
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function auditExpertoCase(input:unknown,pdfText:string){
 const d=input as SupplierCase;
 if(!d?.placa||!Array.isArray(d.cortes)||!positive(d.placa.base)||!positive(d.placa.altura)||!positive(d.placa.espesor)||typeof d.placa.veta!=='boolean')throw new Error('Formato de placa o lista de cortes inválidos.');
 if(d.cortes.length>20000)throw new Error('Demasiadas filas para esta auditoría local.');
 const pieces:SheetPiece[]=[];
 let edgeNet=0;
 for(const [i,c] of d.cortes.entries()){
  if(!c||!Number.isInteger(c.cantidad)||c.cantidad<1||!positive(c.base)||!positive(c.altura)||typeof c.descripcion!=='string'||typeof c.rota!=='boolean'||!Number.isInteger(c.tapacantos)||c.tapacantos<0||c.tapacantos>15)throw new Error(`Fila ${i+1}: datos inválidos o codificación de cantos no soportada.`);
  if(pieces.length+c.cantidad>20000)throw new Error('Demasiadas piezas para esta auditoría local.');
  for(let j=0;j<c.cantidad;j++)pieces.push({id:`${i}/${j}`,detail:`Fila ${i+1}`,base:c.base,height:c.altura,rotate:!d.placa.veta&&c.rota});
  // Supplier bit pairs: 4/8 along base, 1/2 along height. This audit verifies aggregate metres,
  // not which bit is top/bottom/left/right: do not reuse as a physical-face import contract.
  edgeNet+=c.cantidad*((c.tapacantos&4?c.base:0)+(c.tapacantos&8?c.base:0)+(c.tapacantos&1?c.altura:0)+(c.tapacantos&2?c.altura:0))/1000;
 }
 const normalize=(s:string)=>s.trim().replace(/\s+/g,' ');
 const pdfRows=[...pdfText.matchAll(/\((\d+)\)\s+(\d+) de ([\d.]+) x ([\d.]+) ([^\r\n]+)/g)].map(m=>[+m[2],+m[3],+m[4],normalize(m[5])]);
 const jsonRows=d.cortes.map(c=>[c.cantidad,c.base,c.altura,normalize(c.descripcion)]);
 const canonical=(rows:unknown[][])=>rows.map(row=>JSON.stringify(row)).sort();
 const identicalCuts=JSON.stringify(canonical(pdfRows))===JSON.stringify(canonical(jsonRows));
 const extract=(pattern:RegExp)=>{const m=pdfText.match(pattern);return m?Number(m[1].replace(',','.')):null;};
 const formats=[...new Set([...pdfText.matchAll(/(?:^|\n)\s*\d+ de (\d+) x (\d+)\s*(?=\n|$)/g)].map(m=>`${+m[1]}x${+m[2]}`))];
 const formatMatches=formats.length===1&&formats[0]===`${d.placa.base}x${d.placa.altura}`;
 const supplier={boardFormats:formats,boards:extract(/Total Placas\s*=\s*(\d+)/),utilizationPercent:extract(/Aprovechamiento:\s*([\d.,]+)\s*%/),netM2:extract(/Cortados:\s*([\d.,]+)\s*m/),sawMetres:extract(/metros\s*=\s*([\d.,]+)\s*m/),edgeMetres:extract(/Tapacanto 1\s+[^=\n]+\s*=\s*([\d.,]+)\s*m/),sawSteps:extract(/Desplazamientos de la sierra\s*=\s*(\d+)/),kerfMm:extract(/Desperdicio de la Sierra\s*([\d.,]+)\s*mm/),trimMm:extract(/Refilados de la placa\s*([\d.,]+)\s*mm/)};
 const result=packExperto(pieces,{lengthMm:d.placa.base,widthMm:d.placa.altura,kerfMm:4.4,trimMm:10},d.placa.espesor);
 const area=pieces.reduce((sum,p)=>sum+p.base*p.height,0)/1e6;
 return {schema:1,scope:'Local comparison, not native SketchUp or commercial approval',jsonRows:d.cortes.length,pdfRows:pdfRows.length,pieces:pieces.length,identicalCuts,boardMm:[d.placa.base,d.placa.altura],thicknessMm:d.placa.espesor,grain:d.placa.veta,rotatable:pieces.filter(p=>p.rotate).length,supplier,local:{boards:result.sheets.length,netM2:area,utilizationPercent:result.sheets.length?100*area/(result.sheets.length*d.placa.base*d.placa.altura/1e6):null,sawMetres:result.sawMetres,sawSteps:result.estimatedSawSteps,edgeNetMetres:Math.round(edgeNet*1e6)/1e6,edgeWithWasteMetres:Math.round(edgeNet*1.15*1e6)/1e6,edgeDisplayMetres:Math.round(edgeNet*1.15*10)/10,edgeBuyMetres:Math.ceil(edgeNet*1.15-1e-9),errors:result.errors},comparable:identicalCuts&&formatMatches&&supplier.kerfMm===4.4&&supplier.trimMm===10,edgeDisplayMatches:supplier.edgeMetres===null?null:Math.round(edgeNet*1.15*10)/10===supplier.edgeMetres,boardCountMatches:supplier.boards===null?null:supplier.boards===result.sheets.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [jsonPath,pdfPath]=process.argv.slice(2);
 if(!jsonPath||!pdfPath)throw new Error('Uso: node --import tsx scripts/audit-experto-case.ts pedido.json resultado.pdf');
 const bytes=readFileSync(jsonPath),pdf=readFileSync(pdfPath);
 let text:string;
 try{text=execFileSync('pdftotext',['-layout',resolve(pdfPath),'-'],{encoding:'utf8',timeout:30000,maxBuffer:10*1024*1024});}
 catch{throw new Error('No se pudo leer el PDF con pdftotext. Comprobá instalación, permisos y formato. Se omite la salida del proceso para no volcar datos privados.');}
 console.log(JSON.stringify({...auditExpertoCase(JSON.parse(bytes.toString('utf8')),text),sourceHashes:{json:createHash('sha256').update(bytes).digest('hex'),pdf:createHash('sha256').update(pdf).digest('hex')}},null,2));
}
