#!/usr/bin/env node
// 0.8.26 (SketchUp 2022): a real Ruby 2.7 for Linux x86_64 checks, without
// compiling. Downloads the Ubuntu 20.04 (focal) packages ruby2.7, libruby2.7 and
// libssl1.1 (Digest/OpenSSL need it) from archive.ubuntu.com, unpacks them into
// node_modules/.cache/ruby-2.7 with dpkg-deb, adds minitest (pure Ruby) and
// writes a wrapper:
//
//   node scripts/fetch-ruby27.mjs
//   RUBY_BIN=node_modules/.cache/ruby-2.7/ruby27 npm run test:offline:ruby
//   RUBY27_BIN=node_modules/.cache/ruby-2.7/ruby27 npm run check:ruby27   (used automatically when present)
//
// It is Ruby 2.7.0 with Ubuntu's security patches, not SketchUp 2022's 2.7.2,
// and it runs on Linux: same language and standard library line, not SketchUp.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const folder=resolve(root,'node_modules/.cache/ruby-2.7');
const files=resolve(folder,'root');
const ARCHIVE='http://archive.ubuntu.com/ubuntu/pool/main';
const PACKAGES=[
  `${ARCHIVE}/r/ruby2.7/libruby2.7_2.7.0-5ubuntu1.18_amd64.deb`,
  `${ARCHIVE}/r/ruby2.7/ruby2.7_2.7.0-5ubuntu1.18_amd64.deb`,
  `${ARCHIVE}/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb`,
];
const MINITEST='5.25.4';
const run=(command,args)=>{const result=spawnSync(command,args,{stdio:'inherit'});if(result.status!==0){console.error(`Falló: ${command} ${args.join(' ')}`);process.exit(1);}};

mkdirSync(files,{recursive:true});
for(const url of PACKAGES){
  const deb=resolve(folder,url.split('/').pop());
  if(!existsSync(deb))run('curl',['-fsSL','-o',deb,url]);
  run('dpkg-deb',['-x',deb,files]);
}
const gems=resolve(folder,'gems');
if(!existsSync(resolve(gems,'gems',`minitest-${MINITEST}`)))run('gem',['install','--no-document','--ignore-dependencies','--install-dir',gems,'minitest','-v',MINITEST]);
const lib=`${files}/usr/lib`;
const wrapper=resolve(folder,'ruby27');
writeFileSync(wrapper,`#!/bin/sh
# Ruby 2.7.0 (Ubuntu focal ruby2.7 2.7.0-5ubuntu1.18), written by scripts/fetch-ruby27.mjs.
export LD_LIBRARY_PATH="${lib}/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export RUBYLIB="${gems}/gems/minitest-${MINITEST}/lib:${lib}/ruby/2.7.0:${lib}/x86_64-linux-gnu/ruby/2.7.0:${lib}/ruby/vendor_ruby/2.7.0:${lib}/x86_64-linux-gnu/ruby/vendor_ruby/2.7.0\${RUBYLIB:+:\$RUBYLIB}"
exec "${files}/usr/bin/ruby2.7" "$@"
`);
chmodSync(wrapper,0o755);
const check=spawnSync(wrapper,['-rdigest','-rjson','-rminitest','-e','print RUBY_VERSION," json ",JSON::VERSION," ",Digest::SHA256.hexdigest("")[0,8]'],{encoding:'utf8'});
if(check.status!==0){console.error(check.stderr);process.exit(1);}
console.log(`Ruby ${check.stdout} listo: ${wrapper}`);
