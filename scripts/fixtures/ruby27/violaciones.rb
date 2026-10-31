# frozen_string_literal: true
# Self-test of scripts/check-ruby27.rb: every line marked «espera:» must be reported
# with that text, and no unmarked line may be. Not part of the RBZ.
module Violaciones
  class Ejemplo
    private attr_reader :oculto # espera: attr_* devuelve nil
    def hash_except(h) h.except('a') end # espera: Hash#except
    def interseccion(a, b) a.intersect?(b) end # espera: Array#intersect?
    def division(a) a.ceildiv(2) end # espera: Integer#ceildiv
    def conteo(a) a.tally({}) end # espera: Enumerable#tally(hash)
    def claves(h) h.transform_keys({ 'a' => 'b' }) end # espera: Hash#transform_keys(hash)
    def claves_bloque(h) h.transform_keys(&:to_s) end
    def dato; Data.define(:x); end # espera: Data.define
    def conjunto; Set.new([1]); end # espera: Set sin require
    def perezoso(a) a.lazy.compact end # espera: Enumerable#compact
    def json(x) JSON.generate(x, script_safe: true) end # espera: opción JSON
    def archivo; JSON.load_file('x.json'); end # espera: JSON.load_file
    def lista; Dir.glob('*', sort: false); end # espera: Dir.glob(sort:)
    def patron(x)
      case x # espera: pattern matching
      in [a, b] then a + b
      end
    end
    def implicito(list) list.map { it * 2 } end # espera: `it` como parámetro
    def mutado(name)
      text = "#{name}!"
      text << '?' # espera: sobre un String interpolado
    end
    def mutado_bien(name)
      text = +"#{name}!"
      text << '?'
    end
    def escala(view) UI.scale_factor(view) end # espera: UI.scale_factor(view)
    def overlay(model) model.overlays.add(Sketchup::Overlay.new('a', 'b')) end # espera: Sketchup::Overlay
    def overlay_protegido(model)
      return unless defined?(Sketchup::Overlay) && model.respond_to?(:overlays)
      model.overlays.add(Sketchup::Overlay.new('a', 'b'))
    end
    def pbr(material) material.roughness_factor = 0.5 end # espera: Material#roughness_factor= (SketchUp 2025.0)
    def pbr_protegido(material)
      material.roughness_factor = 0.5 if material.respond_to?(:roughness_factor=)
    end
    def revisado(h) h.except('a') end # ruby27: ok (fixture of the escape hatch)
  end
end
