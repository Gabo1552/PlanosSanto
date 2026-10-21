# frozen_string_literal: true
require 'json'
module PlanosSanto
  module Release
    # Source checkout uses version.json; installed RBZ uses the build manifest.
    path = [File.join(__dir__, 'manifest.json'), File.join(__dir__, 'version.json')].find { |file| File.file?(file) }
    raise LoadError, 'Falta la versión de Planos Santo.' unless path
    VERSION = JSON.parse(File.read(path)).fetch('version').freeze
    raise LoadError, 'Versión de Planos Santo inválida.' unless VERSION.match?(/\A\d+\.\d+\.\d+\z/)
  end
end
