import {describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {cpSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// scripts/release/bump-version.mjs: sube la versión en los cuatro archivos o no toca ninguno.
const FILES=['sketchup_offline/version.json','lib/model.ts','docs/validacion-0811/verificar_0811_sketchup.rb','sketchup_offline/test/verificador_0811_test.rb'];
const current=JSON.parse(readFileSync('sketchup_offline/version.json','utf8')).version as string;
const [major,minor,patch]=current.split('.').map(Number);
const next=`${major}.${minor}.${patch+1}`;

function copy(){
 const root=mkdtempSync(join(tmpdir(),'bump-'));
 for(const f of FILES)cpSync(f,join(root,f),{recursive:true});
 return root;
}
function bump(root:string,version:string){
 try{return {code:0,out:execFileSync('node',['scripts/release/bump-version.mjs',version,'--root',root],{encoding:'utf8',stdio:'pipe'})};}
 catch(e){const err=e as {status:number;stderr:string};return {code:err.status,out:err.stderr};}
}
const read=(root:string,f:string)=>readFileSync(join(root,f),'utf8');

describe('bump-version',()=>{
 it('updates every version location in one run',()=>{
  const root=copy();
  expect(bump(root,next).code).toBe(0);
  expect(JSON.parse(read(root,FILES[0])).version).toBe(next);
  expect(read(root,FILES[1])).toContain(`'${current}','${next}'])`);
  expect(read(root,FILES[2])).toContain(`candidatas 0.8.11 a ${next}`);
  expect(read(root,FILES[2])).toContain(`VERSION = '${next}'`);
  expect(read(root,FILES[3]).split(`'${next}'`)).toHaveLength(4);
  expect(read(root,FILES[3])).not.toContain(`'${current}'`);
 });
 it('works without --root, from the script location (the normal use)',()=>{
  const root=copy();
  cpSync('scripts/release/bump-version.mjs',join(root,'scripts/release/bump-version.mjs'),{recursive:true});
  execFileSync('node',[join(root,'scripts/release/bump-version.mjs'),next],{encoding:'utf8',stdio:'pipe'});
  expect(JSON.parse(read(root,FILES[0])).version).toBe(next);
 });
 it('rejects a version that is not newer',()=>{
  const root=copy();
  expect(bump(root,current).code).toBe(2);
  expect(bump(root,'0.0.1').code).toBe(2);
  expect(bump(root,'1.2').code).toBe(2);
  expect(JSON.parse(read(root,FILES[0])).version).toBe(current);
 });
 it('writes nothing when one file does not have what it expects',()=>{
  const root=copy();
  const test=join(root,FILES[3]);
  writeFileSync(test,read(root,FILES[3]).replace(`'${current}'`,"'otra'"));
  const result=bump(root,next);
  expect(result.code).toBe(1);
  expect(result.out).toContain('verificador_0811_test.rb');
  expect(JSON.parse(read(root,FILES[0])).version).toBe(current);
  expect(read(root,FILES[1])).not.toContain(`'${next}'`);
 });
});
