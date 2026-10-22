# frozen_string_literal: true
require_relative 'release'
require 'sketchup.rb'

module PlanosSanto
  # Keep startup failures visible even when the editor cannot create its menu.
  module Installation
    def self.start
      required = %w[offline.rb exporter.rb session.rb guide_store.rb names.rb p1_diagnostics.rb release.rb ocl_reader.rb catalog_store.rb material_resolver.rb material_library.rb photo_material.rb material_policy.rb native_paint.rb paint_materials.rb ocl_attributes.rb smart_paint.rb smart_paint_tool.rb material_sample_tool.rb quick_toolbar.rb bounded_zip.rb skm_import.rb piece_highlight_tool.rb supplier_order.rb workshop.rb order_proposal.rb ui/index.html ui/app.js ui/app.css ui/palette.html ui/palette.js ui/palette.css]
      required += %w[sheet edge remove_edge sample furniture order guides materials main].flat_map { |action| [24,32].map { |size| "icons/#{action}-#{size}.png" } }
      missing = required.reject { |name| File.file?(File.join(__dir__, name)) }
      raise LoadError, "Faltan archivos: #{missing.join(', ')}" unless missing.empty?
      require_relative 'offline'
      true
    rescue LoadError, SyntaxError, StandardError => error
      message = "Planos Santo #{Release::VERSION} no pudo abrirse.\n\n#{error.class}: #{error.message}\n\nCerrá todas las ventanas de SketchUp y reinstalá PlanosSanto-#{Release::VERSION}.rbz desde el Administrador de extensiones. Si persiste, copiá este mensaje y el error de la Consola Ruby."
      warn([message, *error.backtrace].join("\n"))
      UI.messagebox(message)
      unless @recovery_menu
        UI.menu('Extensions').add_item('Planos Santo · Error de instalación') { UI.messagebox(message) }
        @recovery_menu = true
      end
      false
    end
  end

  Installation.start
end
