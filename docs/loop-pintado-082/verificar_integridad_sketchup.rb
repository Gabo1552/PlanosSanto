# frozen_string_literal: true
# Read-only installation check. Loading defines a module; runs nothing, patches
# nothing, writes nothing. Invoke .integridad manually in the Ruby console.
require 'json'
require 'digest'
module PlanosSantoValidacion082
  def self.integridad
    raise 'Usar SketchUp 2026 con candidata 0.8.2 instalada.' unless defined?(Sketchup) && Sketchup.version.to_s.split('.').first=='26' && defined?(PlanosSanto::Release::VERSION) && PlanosSanto::Release::VERSION=='0.8.2'
    model=Sketchup.active_model;modified=model.modified?
    source=PlanosSanto::OfflineController.instance_method(:handle).source_location.first
    directory=File.dirname(source);root=File.dirname(directory)
    manifest=JSON.parse(File.read(File.join(directory,'manifest.json')))
    raise 'Manifiesto de otra versión.' unless manifest['version']=='0.8.2'
    files=manifest.fetch('files');raise 'Inventario inesperado.' unless files.is_a?(Hash) && files.length==24
    errors=files.filter_map do |name,expected|
      parts=name.split('/')
      raise 'Ruta inválida en manifiesto.' if parts.include?('..') || name.start_with?('/') || name.include?('\\')
      path=File.join(root,name)
      name unless File.file?(path) && Digest::SHA256.file(path).hexdigest==expected
    end
    raise 'El modelo cambió durante consulta.' unless model.modified? == modified
    {'version'=>'0.8.2','nativeExecuted'=>true,'sketchupVersion'=>Sketchup.version.to_s,
     'rubyVersion'=>RUBY_VERSION,'installedFiles'=>files.length,'mismatches'=>errors,
     'passed'=>errors.empty?,'modelModifiedUnchanged'=>true,'productionApproved'=>false}
  end
end
