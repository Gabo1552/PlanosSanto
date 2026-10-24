/** Development-only comparison. Requires a separately downloaded public OpenCutList checkout.
 * node --import tsx scripts/compare-general-ocl.ts /path/to/ocl
 * No runtime dependency is added to Planos Santo. All inputs below are synthetic.
 */
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {packSheets} from '../sketchup_offline/ui/sheetOptimizer';
import {GENERAL_REFERENCE_CASES as cases} from '../tests/fixtures/general-reference-cases';

const reference=process.argv[2];
if(!reference)throw new Error('Usage: node --import tsx scripts/compare-general-ocl.ts /path/to/public/ocl/checkout');
const ruby=process.env.RUBY_BIN||'ruby';
type ReferenceResult={name:string;sheets:number|null;placedIds:string[];unplacedIds:string[];errorCode:number;elapsedMs:number};
const raw=execFileSync(ruby,[fileURLToPath(new URL('./compare-general-ocl.rb',import.meta.url)),reference],{input:JSON.stringify(cases),encoding:'utf8',timeout:60000});
const referenceResults:ReferenceResult[]=JSON.parse(raw);
const results=cases.map(testCase=>{
 const started=performance.now(),own=packSheets(testCase.pieces,testCase.spec),elapsed=performance.now()-started;
 const expected=referenceResults.find(item=>item.name===testCase.name)!;
 const ids=own.sheets.flatMap(s=>s.placements.map(p=>p.id)).sort(),unplaced=own.oversize.map(p=>p.id).sort();
 return {name:testCase.name,pieces:testCase.pieces.length,spec:testCase.spec,
  general:{sheets:own.sheets.length,placed:ids.length,unplaced:unplaced.length,elapsedMs:Math.round(elapsed*1000)/1000},
  reference:{sheets:expected.sheets,placed:expected.placedIds.length,unplaced:expected.unplacedIds.length,errorCode:expected.errorCode,elapsedMs:expected.elapsedMs},
  sameSheetCount:own.sheets.length===expected.sheets,sameOccurrences:JSON.stringify(ids)===JSON.stringify(expected.placedIds)&&JSON.stringify(unplaced)===JSON.stringify(expected.unplacedIds)};
});
console.log(JSON.stringify({scope:'Linux standalone, synthetic fixtures; not SketchUp and not full algorithm parity',referenceCommit:execFileSync('git',['-C',reference,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),referenceOptions:{optimization:'MEDIUM',stacking:'NONE',globalRotation:true},results},null,2));
