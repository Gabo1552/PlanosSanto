import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {ruby} from './ruby-bin.mjs';

// Clean-environment runner: UTF-8 locale (fixtures use "Usuario José"), generated
// fixtures rebuilt from versioned sources, every file executed, one summary at the end.
const env={...process.env};
if(!/utf-?8/i.test(`${env.LC_ALL||''}${env.LC_CTYPE||''}${env.LANG||''}`)){env.LANG='C.UTF-8';env.LC_ALL='C.UTF-8';}
const run=(command,args)=>spawnSync(command,args,{stdio:'inherit',env});
const version=JSON.parse(readFileSync('sketchup_offline/version.json','utf8')).version;
// Legacy 0.3.0 package used by the update-over-legacy installation test: rebuilt
// from the real historical extension in sketchup/ by its reproducible packager.
if(!existsSync('artifacts/PlanosSanto-0.3.0.rbz')&&run('python3',['scripts/package-rbz.py']).status!==0)process.exit(1);
if((!existsSync('sketchup_offline/build/planos_santo/offline.rb')||!existsSync(`artifacts/PlanosSanto-${version}.rbz`))&&run(process.execPath,['scripts/build-offline.mjs']).status!==0)process.exit(1);
for(const file of ['sketchup_offline/planos_santo.rb','sketchup_offline/bootstrap.rb','sketchup_offline/offline.rb','sketchup_offline/session.rb','sketchup_offline/guide_store.rb','sketchup_offline/names.rb','sketchup_offline/p1_diagnostics.rb','sketchup_offline/release.rb','sketchup_offline/ocl_reader.rb','sketchup_offline/catalog_store.rb','sketchup_offline/material_resolver.rb','sketchup_offline/material_library.rb','sketchup_offline/photo_material.rb','sketchup_offline/material_policy.rb','sketchup_offline/native_paint.rb','sketchup_offline/smart_paint.rb','sketchup_offline/smart_paint_tool.rb','sketchup_offline/material_sample_tool.rb','sketchup_offline/quick_toolbar.rb','sketchup_offline/bounded_zip.rb','sketchup_offline/skm_import.rb','sketchup_offline/piece_highlight_tool.rb','sketchup_offline/supplier_order.rb','sketchup_offline/workshop.rb','sketchup_offline/paint_materials.rb','sketchup_offline/ocl_attributes.rb']){
  if(run(ruby,['-c',file]).status!==0)process.exit(1);
}
const failed=[];
for(const file of ['sketchup_offline/test/material_resolver_test.rb','sketchup_offline/test/paint_ready_test.rb','sketchup_offline/test/quick_install_controller_test.rb','sketchup_offline/test/material_library_test.rb','sketchup_offline/test/photo_material_test.rb','sketchup_offline/test/material_policy_test.rb','sketchup_offline/test/smart_edges_test.rb','sketchup_offline/test/immediate_piece_test.rb','sketchup_offline/test/photo_controller_test.rb','sketchup_offline/test/native_paint_test.rb','sketchup_offline/test/smart_paint_test.rb','sketchup_offline/test/smart_paint_tool_test.rb','sketchup_offline/test/smart_controller_test.rb','sketchup_offline/test/material_sample_tool_test.rb','sketchup_offline/test/quick_toolbar_test.rb','sketchup_offline/test/quick_controller_test.rb','sketchup_offline/test/direct_paint_test.rb','sketchup_offline/test/skm_import_test.rb','sketchup_offline/test/piece_highlight_tool_test.rb','sketchup_offline/test/skm_controller_test.rb','sketchup_offline/test/edge_sides_test.rb','sketchup_offline/test/workshop_test.rb','sketchup_offline/test/ocl_reader_test.rb','sketchup_offline/test/ocl_capture_test.rb','sketchup_offline/test/shared_occurrences_test.rb','sketchup_offline/test/p1_diagnostics_test.rb','sketchup_offline/test/installation_test.rb','sketchup_offline/test/warm_update_test.rb','sketchup_offline/test/adjustments_test.rb','sketchup_offline/test/grouped_pieces_test.rb','sketchup_offline/test/native_test.rb','sketchup_offline/test/controller_test.rb','sketchup_offline/test/names_test.rb','sketchup_offline/test/names_controller_test.rb','sketchup_offline/test/paint_controller_test.rb']){
  const result=run(ruby,[file]);if(result.status!==0)failed.push(file);
}
if(failed.length){console.error(`\nArchivos de prueba Ruby con fallas (${failed.length}):\n${failed.join('\n')}`);process.exit(1);}
console.log('\nTodas las pruebas Ruby offline pasaron.');
