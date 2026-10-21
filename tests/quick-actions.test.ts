import {describe,expect,it} from 'vitest';
import {isQuickIntent} from '../sketchup_offline/ui/quickActions';
describe('Native quick command event contract',()=>{
 it('accepts seven genuine navigation intents without granting paint permissions',()=>{
  for(const action of ['sheet','edge','remove_edge','sample','furniture','order','guides']){
   expect(isQuickIntent({sequence:1,action,selectionPaths:['22/50'],toggleOff:false})).toBe(true);
  }
 });
 it('rejects malformed or replay-counter values that cannot be compared reliably',()=>{
  for(const sequence of [undefined,null,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'2'])expect(isQuickIntent({action:'sheet',sequence})).toBe(false);
 });
 it('rejects unknown actions and payloads before UI routing',()=>{
  for(const value of [null,undefined,[],{},'sheet',{sequence:1,action:'export_pdf'},{sequence:1,action:'apply_names'}])expect(isQuickIntent(value)).toBe(false);
 });
 it('rejects invalid optional fields rather than crashing focus routing or pretending a toggle',()=>{
  for(const patch of [{selectionPaths:'22/50'},{selectionPaths:[42]},{toggleOff:'yes'},{message:{}},{refreshWarning:[]},{scanRequired:'true'}])expect(isQuickIntent({sequence:1,action:'furniture',...patch})).toBe(false);
 });
 it('preserves scan-required warnings and monotonic IDs across refresh/navigation',()=>{
  expect(isQuickIntent({sequence:Number.MAX_SAFE_INTEGER,action:'guides',scanRequired:true,refreshWarning:'Volvé a analizar.'})).toBe(true);
 });
});
