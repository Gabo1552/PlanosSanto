# frozen_string_literal: true
require 'sketchup.rb'
require_relative 'exporter'
require_relative 'zip_bundle'

module PlanosSanto
  class Controller
    def show
      @dialog ||= begin
        dialog = UI::HtmlDialog.new(dialog_title: 'Planos Santo · Revisar exportación', preferences_key: 'PlanosSantoReview',
                                    scrollable: true, resizable: true, width: 1060, height: 760, style: UI::HtmlDialog::STYLE_DIALOG)
        dialog.set_file(File.join(__dir__, 'review.html'))
        dialog.add_action_callback('scan') { |_context| guard { scan } }
        dialog.add_action_callback('export_local') { |_context, ids| guard { export_local(JSON.parse(ids)) } }
        dialog.add_action_callback('send_web') { |_context, options| guard { send_web(JSON.parse(options)) } }
        dialog
      end
      @dialog.show
    end

    def emit(type, data)
      payload = JSON.generate({ 'type' => type, 'data' => data })
      # Encode as a JS string then JSON.parse; never interpolate model text as executable HTML/JS.
      @dialog.execute_script("window.receive(JSON.parse(#{JSON.generate(payload)}))")
    end

    def guard
      yield
    rescue StandardError => e
      emit('error', e.is_a?(ExportError) ? e.message : "No se pudo completar la operación (#{e.class}). Abrí la consola Ruby para revisar el error.")
      warn("Planos Santo: #{e.class}: #{e.message}")
    end

    def scan
      @model = Sketchup.active_model
      @exporter = Exporter.new(@model)
      @snapshot = @exporter.tree
      @local = nil
      emit('tree', @snapshot)
    end

    def export_local(ids)
      raise ExportError, 'Volvé a analizar el modelo activo.' unless @snapshot && Sketchup.active_model.equal?(@model)
      # Re-read to detect changes between preview and export, including unsaved edits.
      current = Exporter.new(@model).tree
      raise ExportError, 'El modelo cambió después de la revisión. Analizalo nuevamente.' unless current == @snapshot
      document = @exporter.document(@snapshot, ids)
      base = @model.path.to_s.empty? ? nil : File.dirname(@model.path)
      target = UI.savepanel('Guardar ZIP para Planos Santo', base, 'modelo.planos-santo.zip')
      unless target
        emit('cancelled', nil)
        return
      end
      target += '.zip' unless target.downcase.end_with?('.zip','.json')
      report = target.downcase.end_with?('.zip') ? ZipBundle.write(document,target) : Exporter.write_bundle(document,target)
      @local = { 'document' => document, 'path' => target, 'ids' => ids, 'sha256' => Digest::SHA256.file(target).hexdigest }
      emit('exported', { 'path' => target, 'report' => report })
    end

    def send_web(options)
      raise ExportError, 'Primero revisá y guardá una exportación local.' unless @local
      raise ExportError, 'Confirmá que verificaste el JSON local y sus medidas.' unless options['confirmed'] == true
      raise ExportError, 'La selección cambió: exportala localmente otra vez.' unless options['ids'] == @local['ids']
      raise ExportError, 'Cambió el modelo activo. Volvé a analizar y exportar.' unless Sketchup.active_model.equal?(@model)
      raise ExportError, 'El modelo cambió: exportá nuevamente antes de enviar.' unless Exporter.new(@model).tree == @snapshot
      raise ExportError, 'El archivo local cambió; volvé a exportar.' unless Digest::SHA256.file(@local['path']).hexdigest == @local['sha256']
      require_relative 'transport'
      url = Transport.destination(options.fetch('url'))
      text = "Se enviará la geometría seleccionada a:\n#{url.scheme}://#{url.host}:#{url.port}\n\nNo se envía el archivo .skp original. ¿Continuar?"
      unless UI.messagebox(text, MB_YESNO) == IDYES
        emit('cancelled', nil)
        return
      end
      emit('sending', 'Enviando la exportación revisada…')
      result = Transport.send_document(url, options.fetch('token'), @local['document'])
      emit('sent', result)
    end
  end

  unless file_loaded?(__FILE__)
    @controller = Controller.new
    command = UI::Command.new('Enviar a Planos Santo') { @controller.show }
    command.tooltip = 'Enviar a Planos Santo'
    command.status_bar_text = 'Revisar muebles, exportar localmente y enviar con autorización a la web.'
    command.small_icon = File.join(__dir__, 'icon-24.png')
    command.large_icon = File.join(__dir__, 'icon-32.png')
    menu = UI.menu('Extensions').add_submenu('Planos Santo')
    menu.add_item(command)
    menu.add_item('Abrir archivo .skp…') { Sketchup.send_action('openDocument:') }
    @toolbar = UI::Toolbar.new('Planos Santo')
    @toolbar.add_item(command)
    @toolbar.restore
    file_loaded(__FILE__)
  end
end
