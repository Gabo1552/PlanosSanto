# frozen_string_literal: true
require 'sketchup.rb'
require 'extensions.rb'

module PlanosSanto
  unless file_loaded?(__FILE__)
    extension = SketchupExtension.new('Planos Santo', 'planos_santo/main')
    extension.description = 'Revisar muebles y exportar geometría real a Planos Santo, sin modificar el modelo.'
    extension.version = '0.3.0'
    extension.creator = 'Planos Santo'
    Sketchup.register_extension(extension, true)
    file_loaded(__FILE__)
  end
end
