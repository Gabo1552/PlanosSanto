import { expect,it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import { importRubyDocument } from '../lib/ruby-import';
import { createDemo } from '../lib/demo';
import { applyEdit,toEdit,type RawDocument } from '../lib/model';
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
export function rubyFixture():RawDocument{
  return JSON.parse(execFileSync(ruby,['sketchup/test/write_fixture.rb'],{encoding:'utf8'}));
}
it('importa salida del exportador Ruby ejecutado con dobles de API conservando metadatos y medidas',()=>{
  const doc=rubyFixture(),p=importRubyDocument(doc);
  expect(p.source).toBe('sketchup-ruby');expect(p.furniture).toHaveLength(2);
  expect(p.furniture[0].pieces).toHaveLength(2);
  expect(p.furniture[0].pieces[1].id).toBe('1/13/12');
  expect(p.furniture[1].pieces[1].id).toBe('2/13/12');
  expect(p.furniture[0].pieces[0].dimensions[0]).toBeCloseTo(609.6,7);
  expect(p.furniture[0].pieces[1].dimensions[1]).toBeCloseTo(406.4,7);
  expect(p.furniture[0].pieces[0].metadata?.persistentId).toBe('11');
  expect(p.furniture[0].pieces[0].mesh.faceMaterials?.[0].front?.name).toBe('Jade synthetic');
  expect(p.furniture[0].pieces[1].warnings.join()).toMatch(/oculta/);
  expect(p.importedDocument?.furniture[0].children[1].children[0].metadata?.instancePath).toEqual(['1','13','12']);
  const edit=toEdit(p);edit.furniture[0].pieces[0].name='Renombrado';
  expect(applyEdit(p,edit).importedDocument).toEqual(doc);
  expect(createDemo().source).toBe('demo');
});
it('rechaza un fixture sin procedencia Ruby o sin revisión y medidas adulteradas',()=>{
  const doc=rubyFixture();delete doc.exporter;
  expect(()=>importRubyDocument(doc)).toThrow(/exportación revisada/);
  const unreviewed=rubyFixture();Object.assign(unreviewed.exporter!,{reviewed:false});
  expect(()=>importRubyDocument(unreviewed)).toThrow();
  const bad=rubyFixture();bad.furniture[0].children[0].metadata!.dimensionsMm![0]=1;
  expect(()=>importRubyDocument(bad)).toThrow(/difieren/);
});

it('acepta la versión actual de la extensión offline al generar una guía',()=>{
  const doc=rubyFixture(),release=JSON.parse(readFileSync(new URL('../sketchup_offline/version.json',import.meta.url),'utf8'));
  Object.assign(doc.exporter!,{version:release.version});
  expect(importRubyDocument(doc).source).toBe('sketchup-ruby');
});
