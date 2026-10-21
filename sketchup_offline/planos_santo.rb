# frozen_string_literal: true
require 'sketchup.rb'
require 'extensions.rb'

begin
  require File.file?(File.join(__dir__, 'release.rb')) ? File.join(__dir__, 'release.rb') : File.join(__dir__, 'planos_santo', 'release.rb')

module PlanosSanto
  unless file_loaded?(__FILE__)
    extension = SketchupExtension.new('Planos Santo', 'planos_santo/bootstrap')
    extension.description = 'Guías A4 configurables, materiales y cantos dentro de SketchUp. Candidata pendiente de validación en Windows.'
    extension.version = Release::VERSION
    extension.creator = 'Planos Santo'
    if Sketchup.register_extension(extension, true)
      file_loaded(__FILE__)
    else
      UI.messagebox("Planos Santo #{Release::VERSION} no pudo registrarse. Cerrá todas las ventanas de SketchUp, abrilo de nuevo y reinstalá el RBZ desde el Administrador de extensiones.")
    end
  end
end
rescue LoadError, SyntaxError, StandardError => error
  module PlanosSanto; end
  unless PlanosSanto.instance_variable_get(:@registration_error_reported)
    PlanosSanto.instance_variable_set(:@registration_error_reported,true)
    UI.messagebox("Planos Santo no pudo cargar su instalación: #{error.class}: #{error.message}. Cerrá SketchUp y reinstalá el RBZ completo desde el Administrador de extensiones.")
  end
end
