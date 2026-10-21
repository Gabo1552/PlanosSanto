# frozen_string_literal: true
# Test harness read-only. Load AFTER installing/restarting candidate; never reload product files.
require 'json'
require 'digest'
require 'time'
module PlanosSantoA4Validation
  VERSION = '0.7.1'
  def self.canonical(value)
    case value
    when Hash then value.keys.sort.to_h { |k| [k, canonical(value[k])] }
    when Array then value.map { |item| canonical(item) }
    else value
    end
  end
  def self.digest(value); Digest::SHA256.hexdigest(JSON.generate(canonical(value))); end
  def self.capture
    raise 'Instalá la candidata y reiniciá SketchUp.' unless defined?(PlanosSanto::Release::VERSION) && PlanosSanto::Release::VERSION == VERSION
    manifest_path = Sketchup.find_support_file('planos_santo/manifest.json', 'Plugins')
    raise 'No se encontró manifest.json instalado.' unless manifest_path
    manifest = JSON.parse(File.read(manifest_path))
    raise 'Manifest de otra versión.' unless manifest['version'] == VERSION
    plugin_root = File.dirname(File.dirname(manifest_path))
    manifest.fetch('files').each do |name, expected|
      file = File.join(plugin_root, name)
      raise "Archivo instalado alterado: #{name}" unless File.file?(file) && Digest::SHA256.file(file).hexdigest == expected
    end
    report = PlanosSanto::P1Diagnostics::Scanner.new(Sketchup.active_model).scan
    raise 'Diagnóstico incompleto. No se puede certificar conservación.' unless report['complete']
    raise 'Regresión de contador.' unless report['counts'].keys.all? { |k| k.is_a?(String) } && report['counts']['instances'] == report['instances'].length
    definitions = report['definitions'].to_h { |d| [d.fetch('id'), digest(d.fetch('geometry'))] }
    instances = report['instances'].sort_by { |i| i['path'].join('/') }.map do |i|
      i.reject { |k,_| %w[name definition_id].include?(k) }.merge('definition_geometry' => definitions.fetch(i['definition_id']))
    end
    guide = PlanosSanto::GuideStore.new(Sketchup.active_model).read
    model_path = Sketchup.active_model.path.to_s
    { 'version' => VERSION, 'sketchup' => Sketchup.version.to_s, 'ruby' => RUBY_VERSION,
      'captured_at' => Time.now.utc.iso8601, 'model_path' => model_path,
      'skp_sha256' => File.file?(model_path) ? Digest::SHA256.file(model_path).hexdigest : nil,
      'geometry_and_visibility_sha256' => digest([instances, report['root_geometry']]),
      'instance_names' => report['instances'].sort_by { |i| i['path'].join('/') }.to_h { |i| [i['path'].join('/'), i['name']] },
      'instances' => report['instances'].length, 'definitions' => report['definitions'].length,
      'materials' => report['materials'].length, 'guide' => guide,
      'native_execution' => true, 'acceptance' => false,
      'note' => 'Captura real de solo lectura. No aprueba interacción, PDF ni aceptación completa.' }
  end
  def self.write_new(path, value)
    File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |file| file.write(JSON.pretty_generate(value)) }
    path
  end
  def self.before(path)
    write_new(path, capture)
  end
  def self.after(before_path, output_path)
    baseline = JSON.parse(File.read(before_path)); result = capture
    result['geometry_and_visibility_unchanged'] = baseline.fetch('geometry_and_visibility_sha256') == result.fetch('geometry_and_visibility_sha256')
    result['name_changes'] = result.fetch('instance_names').filter_map { |path, name| { 'path' => path, 'before' => baseline.fetch('instance_names', {})[path], 'after' => name } if baseline.fetch('instance_names', {})[path] != name }
    result['same_instance_count'] = baseline.fetch('instances') == result.fetch('instances')
    write_new(output_path, result)
    raise 'Cambió geometría o visibilidad: revisar antes de continuar.' unless result['geometry_and_visibility_unchanged'] && result['same_instance_count']
    result
  end
end
