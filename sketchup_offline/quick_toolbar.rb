# frozen_string_literal: true

module PlanosSanto
  # Registers native SketchUp commands only. Controller retains all selection,
  # permission, painting and export logic. UI state is queried, never persisted
  # here, so a checked button always describes the actual controller/tool state.
  module QuickToolbar
    ACTIONS = [
      ['materials', 'Materiales', 'Abrir la biblioteca visual del taller y revisar materiales antes de usarlos.'],
      ['sheet', 'Pintar', 'Pintar placas en el modelo: elegí el material en la tira de la vista o en la bandeja Materiales.'],
      ['edge', 'Pintar canto', 'Pintar cantos en el modelo: elegí el canto en la tira de la vista o en la bandeja Materiales.'],
      ['remove_edge', 'Quitar canto', 'Restaurar la placa de una cara estrecha con alcance controlado.'],
      ['sample', 'Tomar material (cuentagotas)', 'Consultar el material de una cara sin modificar el modelo.'],
      ['furniture', 'Muebles', 'Revisar muebles, piezas y nombres antes de confirmar cambios.'],
      ['order', 'Maderera', 'Preparar y revisar pedidos; no exporta ni guarda automáticamente.'],
      ['guides', 'Planos', 'Configurar vistas, cotas y notas; exportar PDF requiere una acción adicional.']
    ].map(&:freeze).freeze unless const_defined?(:ACTIONS, false)

    PRIMARY_ACTIONS = %w[sheet edge furniture order guides materials].freeze unless const_defined?(:PRIMARY_ACTIONS, false)
    # Pintura en vista: these start the brush in the 3D view and never open a window.
    PAINT_ACTIONS = %w[sheet edge remove_edge].freeze unless const_defined?(:PAINT_ACTIONS, false)

    class << self
      attr_reader :registry

      def install(controller)
        # Command closures deliberately use this instance variable, allowing a
        # reloaded controller to replace the receiver without adding UI entries.
        @controller = controller
        return @registry if @registry

        commands = {}
        menu = UI.menu('Extensions').add_submenu('Planos Santo')
        main = UI::Command.new('Planos Santo') do
          @controller.respond_to?(:open_main) ? @controller.open_main : @controller.show
        end
        main.tooltip = 'Planos Santo · Trabajo de taller'
        main.status_bar_text = 'Abrir la interfaz completa de Planos Santo.'
        main.small_icon = File.join(__dir__, 'icons', 'main-24.png')
        main.large_icon = File.join(__dir__, 'icons', 'main-32.png')
        main.set_validation_proc { unchecked }
        commands['main'] = main
        menu.add_item(main)
        main_toolbar = UI::Toolbar.new('Planos Santo')
        ACTIONS.each do |key, label, description|
          command = UI::Command.new(label) { in_view?(key) ? @controller.paint_in_view(key) : @controller.quick_action(key) }
          command.tooltip = label
          command.status_bar_text = description
          command.small_icon = File.join(__dir__, 'icons', "#{key}-24.png")
          command.large_icon = File.join(__dir__, 'icons', "#{key}-32.png")
          command.set_validation_proc do
            if in_view?(key)
              reason = @controller.paint_block_reason(key)
              command.status_bar_text = reason || description
              next @controller.paint_validation(key)
            end
            reason = @controller.quick_block_reason(key) if @controller.respond_to?(:quick_block_reason)
            command.status_bar_text = reason || description
            @controller.quick_validation(key)
          rescue StandardError => error
            command.status_bar_text = 'No se pudo verificar el contexto. Volvé a abrir Planos Santo.'
            warn("Planos Santo: no se pudo consultar el estado de #{key}: #{error.message}")
            Object.const_defined?(:MF_GRAYED) ? Object.const_get(:MF_GRAYED) : 1
          end
          menu.add_item(command)
          commands[key] = command
        end
        PRIMARY_ACTIONS.each { |key| main_toolbar.add_item(commands.fetch(key)) }
        # The full paint palette is still available; painting itself never opens it.
        menu.add_item('Paleta de pintura…') do
          @controller.respond_to?(:open_paint_palette) ? @controller.open_paint_palette : @controller.quick_action('sheet')
        end
        menu.add_item('Mostrar / ocultar barra rápida') do
          main_toolbar.visible? ? main_toolbar.hide : main_toolbar.show
        end
        # ARQ-06: recover a window left off-screen or too small.
        menu.add_item('Restablecer ventanas') { @controller.reset_windows if @controller.respond_to?(:reset_windows) }
        menu.add_item('Diagnóstico de integración (solo lectura)…') { P1Diagnostics.run }
        menu.add_item('Abrir archivo .skp…') { Sketchup.send_action('openDocument:') }
        restore_if_visible(main_toolbar)
        @registry = { main_toolbar: main_toolbar, tools_toolbar: main_toolbar, menu: menu, commands: commands }
      end

      private

      def in_view?(key)
        PAINT_ACTIONS.include?(key) && @controller.respond_to?(:paint_in_view)
      end

      def unchecked
        Object.const_defined?(:MF_UNCHECKED) ? Object.const_get(:MF_UNCHECKED) : 0
      end

      def restore_if_visible(toolbar)
        # SketchUp owns dock position and independent visibility preferences.
        # Do not show a toolbar that the operator hid in a previous session.
        hidden = Object.const_defined?(:TB_HIDDEN) ? Object.const_get(:TB_HIDDEN) : 0
        toolbar.restore unless toolbar.get_last_state == hidden
      end
    end
  end
end
