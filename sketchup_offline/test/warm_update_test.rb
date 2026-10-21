# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require 'json'
require 'rbconfig'
class WarmUpdateTest < Minitest::Test
  ROOT=File.expand_path('../..',__dir__)
  VERSION=JSON.parse(File.read(File.join(ROOT,'sketchup_offline/version.json')))['version']
  def test_installing_new_archive_does_not_replace_classes_already_loaded_until_restart
    Dir.mktmpdir('planos-warm-update-') do |plugins|
      _,error,status=Open3.capture3('python3','-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',File.join(ROOT,'artifacts/PlanosSanto-0.5.3.rbz'),plugins)
      assert status.success?,error
      output,error,status=Open3.capture3(RbConfig.ruby,File.join(__dir__,'warm_update_driver.rb'),plugins,File.join(ROOT,"artifacts/PlanosSanto-#{VERSION}.rbz"))
      assert status.success?,error
      report=JSON.parse(output)
      assert_equal '0.5.3',report['loadedVersion'];assert_equal VERSION,report['installedVersion']
      assert_equal 'La edición contiene campos no permitidos.',report['saveError']
      assert_empty report['operations'];assert_empty report['attributes']
    end
  end
end
