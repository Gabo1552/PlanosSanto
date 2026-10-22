import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ruby} from './ruby-bin.mjs';
// Los tests leen CSV con acentos: sin locale UTF-8 Ruby falla con CSV::InvalidEncodingError.
if(!/utf-?8/i.test(`${process.env.LC_ALL||''}${process.env.LC_CTYPE||''}${process.env.LANG||''}`)){process.env.LANG='C.UTF-8';process.env.LC_ALL='C.UTF-8';}
for(const file of ['sketchup/planos_santo.rb','sketchup/planos_santo/exporter.rb','sketchup/planos_santo/main.rb','sketchup/planos_santo/transport.rb','sketchup/planos_santo/zip_bundle.rb']){
  const check=spawnSync(ruby,['-c',file],{stdio:'inherit'});
  if(check.status!==0){console.error('Se requiere Ruby 3.2+ para verificar la extensión. Configurá RUBY_BIN.');process.exit(1);}
}
const tests=['sketchup/test/exporter_test.rb','sketchup/test/zip_bundle_test.rb'];
if(process.argv.includes('--transport'))tests.push('sketchup/test/transport_test.rb');
for(const file of tests){const result=spawnSync(ruby,[file],{stdio:'inherit'});if(result.status!==0)process.exit(1);}
const fixture=spawnSync(ruby,['sketchup/test/write_fixture.rb'],{encoding:'utf8'});
if(fixture.status!==0){console.error(fixture.stderr);process.exit(1);}
mkdirSync('sketchup/build',{recursive:true});writeFileSync('sketchup/build/contract-fixture.json',fixture.stdout);
console.log('Fixture de contrato escrito. Es sintético; NO es una lectura de .skp.');
