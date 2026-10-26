/** Local audit: output only aggregates and hashes, never private cut lists/names. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {packExperto,packExpertoReference} from '../sketchup_offline/ui/expertoOptimizer';
import {auditExpertoCase} from './audit-experto-case';
import {verifyExpertoLayout} from '../tests/helpers/experto-invariants';
import observed from '../docs/auditoria-experto-0822/MULTICASO.json';

const sources=process.argv.slice(2);
if(!sources.length)throw new Error('Uso: node --import tsx scripts/verify-experto-search.ts caso1.json caso2.json ...');
const cases=sources.map(path=>{
 const bytes=readFileSync(path),sha256=createHash('sha256').update(bytes).digest('hex');
 const input=JSON.parse(bytes.toString('utf8'));
 // Validate supplier schema and physical quantities before expanding input.
 const audit=auditExpertoCase(input,'');
 const pieces=input.cortes.flatMap((c:{cantidad:number;base:number;altura:number;rota:boolean},row:number)=>Array.from({length:c.cantidad},(_,i)=>({id:`${row}/${i}`,detail:'',base:c.base,height:c.altura,rotate:!input.placa.veta&&c.rota})));
 const spec={lengthMm:input.placa.base,widthMm:input.placa.altura,trimMm:10,kerfMm:4.4};
 const baseline=packExpertoReference(pieces,spec,input.placa.espesor);
 const start=performance.now(),result=packExperto(pieces,spec,input.placa.espesor),elapsedMs=performance.now()-start;
 verifyExpertoLayout(pieces,spec,result);
 if(result.sheets.length>baseline.sheets.length)throw new Error('Regresión en placas');
 const previous=observed.cases.find(c=>c.sourceHashes.json===sha256);
 return {caseId:previous?.caseId??'unmatched',sourceSha256:sha256,pieces:pieces.length,boardMm:audit.boardMm,grain:audit.grain,
  baseline:{boards:baseline.sheets.length,sawMetres:baseline.sawMetres,sawSteps:baseline.estimatedSawSteps},
  current:{boards:result.sheets.length,sawMetres:result.sawMetres,sawSteps:result.estimatedSawSteps,utilizationPercent:100*audit.local.netM2/(result.sheets.length*spec.lengthMm*spec.widthMm/1e6)},
  supplier:previous?.supplier??null,boardCountMatches:previous?result.sheets.length===previous.supplier.boards:null,
  invariantsPassed:true,elapsedMs:Math.round(elapsedMs*100)/100,search:result.search};
});
console.log(JSON.stringify({version:'0.8.24',scope:'Aggregate local audit against previously recorded supplier PDFs; not commercial or native SketchUp approval',cases},null,2));
