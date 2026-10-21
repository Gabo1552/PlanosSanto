# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require_relative 'fake_api'
require_relative '../planos_santo/zip_bundle'
class ZipBundleTest < Minitest::Test
  def test_zip_is_readable_by_independent_reader_and_contains_all_three_files
    Dir.mktmpdir do |dir|
      target=File.join(dir,'proyecto.zip');exporter=PlanosSanto::Exporter.new(Fixture.model)
      doc=exporter.document(exporter.tree,['1','2']);report=PlanosSanto::ZipBundle.write(doc,target)
      script="import zipfile,json,sys,hashlib;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert len(z.namelist())==3;b=z.read('modelo.planos-santo.json');r=json.loads(z.read('modelo.planos-santo.informe.json'));assert hashlib.sha256(b).hexdigest()==r['sha256'];assert len(json.loads(b)['furniture'])==2;print(r['pieces'])"
      out,err,status=Open3.capture3('python3','-c',script,target)
      assert status.success?,err;assert_equal '4',out.strip;assert_equal 4,report['pieces']
      assert_raises(PlanosSanto::ExportError) { PlanosSanto::ZipBundle.write(doc,target) }
    end
  end
end
