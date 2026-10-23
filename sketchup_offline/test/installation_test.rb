# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require 'json'
require 'rbconfig'
require 'fileutils'
class InstallationTest < Minitest::Test
  ROOT = File.expand_path('../..', __dir__)
  VERSION = JSON.parse(File.read(File.join(ROOT, 'sketchup_offline/version.json')))['version']
  def setup
    @temp = Dir.mktmpdir('planos-instalar-')
    @plugins = File.join(@temp, 'Usuario José', 'SketchUp 2026', 'Plugins')
    FileUtils.mkdir_p(@plugins)
  end
  def teardown; FileUtils.remove_entry(@temp); end
  def extract(version)
    _, error, status = Open3.capture3('python3', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', File.join(ROOT, "artifacts/PlanosSanto-#{version}.rbz"), @plugins)
    assert status.success?, error
  end
  def boot(mode = '')
    output, error, status = Open3.capture3({'INSTALL_MODE' => mode}, RbConfig.ruby, File.join(__dir__, 'installation_driver.rb'), @plugins, chdir: @temp)
    assert status.success?, error
    JSON.parse(output)
  end
  def assert_editor(result)
    assert_equal VERSION, result['version']
    assert_empty result['messages']
    assert_equal ['Planos Santo','Materiales','Pintar','Pintar canto','Quitar canto','Tomar material (cuentagotas)','Muebles','Maderera','Planos'], result['commands']
    assert_includes result['menus'], 'Planos Santo'
    assert_includes result['menus'], 'Diagnóstico de integración (solo lectura)…'
    assert_equal [true], result['restored']
    assert_equal 1, result['dialogs'].length
    assert result['dialogs'][0]['visible']
    assert_equal ['request'], result['dialogs'][0]['callbacks']
    assert_equal File.join(@plugins, 'planos_santo/ui/index.html'), result['dialogs'][0]['file']
    refute result['legacyLoaded']
  end
  def test_fresh_rbz_registers_menu_toolbar_and_opens_dialog_from_other_directory_and_unicode_path
    extract(VERSION)
    assert_editor(boot)
  end
  def test_archive_manifest_covers_exact_payload_including_all_native_paint_modules
    output, error, status = Open3.capture3('python3', '-c', <<~PYTHON, File.join(ROOT, "artifacts/PlanosSanto-#{VERSION}.rbz"), VERSION)
      import zipfile,sys,json,hashlib
      with zipfile.ZipFile(sys.argv[1]) as z:
        entries = [i.filename for i in z.infolist() if not i.is_dir()]
        assert len(entries) == len(set(entries)) == 85
        manifest = json.loads(z.read('planos_santo/manifest.json'))
        assert manifest['version'] == sys.argv[2]
        assert set(entries) == set(manifest['files']) | {'planos_santo/manifest.json'}
        for name,digest in manifest['files'].items():
          assert hashlib.sha256(z.read(name)).hexdigest() == digest, name
        for name in ('material_resolver.rb','material_library.rb','native_paint.rb','smart_paint.rb','smart_paint_tool.rb','material_sample_tool.rb','quick_toolbar.rb','bounded_zip.rb','skm_import.rb','piece_highlight_tool.rb','paint_materials.rb','ocl_attributes.rb','model_watch.rb','order_proposal.rb','order_references.rb','cutlist.rb','maderera_profile.rb','presets-taller.json'):
          assert 'planos_santo/' + name in manifest['files'], name
        assert all(not p.lower().endswith(('.skp','.skm','.csv','.jsonl')) for p in entries)
        for action in ('sheet','edge','remove_edge','sample','furniture','order','guides','materials','main'):
          for name in (action + '-24.png', action + '-32.png', action + '.svg'):
            assert 'planos_santo/icons/' + name in manifest['files'], name
          assert z.read('planos_santo/icons/' + action + '.svg').startswith(b'<?xml'), action
        for key in ('piece','edge','remove','blocked','sample'):
          for name in ('paint-' + key + '.png', 'paint-' + key + '-64.png', 'paint-' + key + '.svg'):
            assert 'planos_santo/cursors/' + name in manifest['files'], name
          assert z.read('planos_santo/cursors/paint-' + key + '.svg').startswith(b'<?xml'), key
          assert z.read('planos_santo/cursors/paint-' + key + '-64.png')[16:24] == (64).to_bytes(4,'big') * 2, key
    PYTHON
    assert status.success?, error + output
  end
  def test_archive_supports_extraction_without_implicit_parent_creation
    output, error, status = Open3.capture3('python3', '-c', <<~PYTHON, File.join(ROOT, "artifacts/PlanosSanto-#{VERSION}.rbz"), @plugins)
      import zipfile,sys,pathlib
      with zipfile.ZipFile(sys.argv[1]) as z:
        for entry in z.infolist():
          assert entry.create_system == 0
          path = pathlib.Path(sys.argv[2]) / entry.filename
          assert path.parent.is_dir(), entry.filename
          if entry.is_dir():
            assert entry.external_attr & 0x10
            path.mkdir()
          else:
            path.write_bytes(z.read(entry))
    PYTHON
    assert status.success?, error
    assert_editor(boot)
  end
  def test_update_over_legacy_files_loads_new_editor_after_restart
    extract('0.3.0'); extract(VERSION)
    assert File.file?(File.join(@plugins, 'planos_santo/main.rb'))
    assert_editor(boot)
  end
  def test_missing_payload_is_reported_and_recovery_menu_exists
    extract(VERSION)
    File.delete(File.join(@plugins, 'planos_santo/ui/app.js'))
    result = boot
    assert_empty result['commands']
    assert_equal 1, result['messages'].length
    assert_includes result['messages'][0], 'Faltan archivos: ui/app.js'
    assert_includes result['menus'], 'Planos Santo · Error de instalación'
  end
  def test_missing_native_material_payload_is_reported_before_editor_start
    %w[material_resolver.rb material_library.rb native_paint.rb smart_paint.rb smart_paint_tool.rb material_sample_tool.rb quick_toolbar.rb bounded_zip.rb skm_import.rb piece_highlight_tool.rb model_watch.rb].each do |name|
      extract(VERSION)
      File.delete(File.join(@plugins, 'planos_santo', name))
      result = boot
      assert_empty result['commands']
      assert_equal 1, result['messages'].length
      assert_includes result['messages'][0], "Faltan archivos: #{name}"
      assert_includes result['menus'], 'Planos Santo · Error de instalación'
    end
  end
  def test_runtime_failure_is_visible_instead_of_silent_missing_menu
    extract(VERSION)
    File.write(File.join(@plugins, 'planos_santo/offline.rb'), "raise 'synthetic startup failure'\n")
    result = boot
    assert_includes result['messages'][0], 'synthetic startup failure'
    assert_includes result['menus'], 'Planos Santo · Error de instalación'
  end
  def test_installed_manifest_wins_over_stale_source_version_and_all_reports_agree
    extract(VERSION)
    File.write(File.join(@plugins,'planos_santo/version.json'),JSON.generate({'version'=>'0.0.1'}))
    assert_editor(boot)
    output,error,status=Open3.capture3(RbConfig.ruby,'-e',<<~RUBYCODE,File.join(ROOT,'sketchup/test/fake_api.rb'),@plugins,File.join(@temp,'informe-nuevo.json'))
      require ARGV[0]
      require File.join(ARGV[1],'planos_santo/exporter.rb')
      reader=PlanosSanto::Exporter.new(Fixture.model)
      document=reader.document(reader.tree,['1'])
      report=PlanosSanto::Exporter.write_bundle(document,ARGV[2])
      puts JSON.generate([PlanosSanto::VERSION,document['exporter']['version'],report['exporterVersion']])
    RUBYCODE
    assert status.success?,error
    assert_equal [VERSION,VERSION,VERSION],JSON.parse(output)
  end
  def test_missing_release_file_reports_error_even_before_registration
    extract(VERSION)
    File.delete(File.join(@plugins, 'planos_santo/release.rb'))
    result=boot
    assert_nil result['version'];assert_equal 1,result['messages'].length
    assert_includes result['messages'][0],'no pudo cargar su instalación'
    assert_empty result['commands']
  end
  def test_failed_registration_reports_actionable_error
    extract(VERSION)
    result = boot('registration_failure')
    assert_empty result['commands']
    assert_includes result['messages'][0], 'no pudo registrarse'
  end
end
