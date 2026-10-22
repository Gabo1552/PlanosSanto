import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// ruby-local.spec lee el fixture de contrato que genera `npm run test:ruby`; si falta, se genera antes de las e2e.
export default function globalSetup(){
  if(existsSync('sketchup/build/contract-fixture.json'))return;
  execFileSync(process.execPath,['scripts/test-ruby.mjs','--transport'],{stdio:'inherit'});
}
