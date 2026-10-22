# frozen_string_literal: true
require_relative 'release'
require 'sketchup.rb'
require 'base64'
require 'tempfile'
require_relative 'exporter'
require_relative 'session'
require_relative 'names'
require_relative 'p1_diagnostics'
require_relative 'ocl_reader'
require_relative 'workshop'
require_relative 'material_library'
require_relative 'native_paint'
require_relative 'smart_paint'
require_relative 'smart_paint_tool'
require_relative 'material_sample_tool'
require_relative 'quick_toolbar'
require_relative 'skm_import'
require_relative 'piece_highlight_tool'
require_relative 'photo_material'
require_relative 'paint_materials'
require_relative 'model_watch'

module PlanosSanto
  if defined?(Sketchup::AppObserver)
    class QuickContextObserver < Sketchup::AppObserver
      def initialize(controller); @controller=controller; end
      def onActivateModel(model); @controller.context_changed(model); end
      def onNewModel(model); @controller.context_changed(model,replaced:true); end
      def onOpenModel(model); @controller.context_changed(model,replaced:true); end
    end
  end

  class OfflineController
    QUICK_ACTIONS=%w[sheet edge remove_edge sample furniture order guides materials home].freeze

    def observe_context
      return if @context_observer || !defined?(QuickContextObserver) || !Sketchup.respond_to?(:add_observer)
      @context_observer=QuickContextObserver.new(self)
      Sketchup.add_observer(@context_observer)
    end

    def context_changed(model,replaced:false)
      return unless @model
      if @model.equal?(model) && !replaced && !@context_invalid
        return unless @smart_state && @smart_state['contextChanged']
        smart_event('active'=>false,'queuedCount'=>0,'contextChanged'=>false,'contextRestored'=>true,'error'=>nil)
        return
      end
      @context_invalid=true if replaced && @model.equal?(model)
      unwatch_model!
      stop_smart_tool(refresh:false)
      @quick_intent=nil;@palette_intent=nil
      @photo_material=nil; @photo_preview_active=false
      smart_event('active'=>false,'queuedCount'=>0,'contextChanged'=>true,
                  'error'=>'Cambió el modelo activo. Volvé a analizar antes de continuar.')
    end

    # ARQ-03: one ModelWatch for the model of the open windows. Observers only
    # note the kind of change; the debounced flush runs here, outside callbacks.
    def watch_model!
      return @model_watch if @model_watch && @model_watch.model.equal?(@model) && @model_watch.attached?
      unwatch_model!
      return nil unless @model
      @model_watch=ModelWatch.new(@model,on_change:lambda { |kinds| model_watch_changed(kinds) }).attach
    rescue StandardError => error
      warn("Planos Santo: no se pudo observar el modelo: #{error.class}")
      @model_watch=nil
    end

    def unwatch_model!
      watch=@model_watch;@model_watch=nil
      watch&.detach
    rescue StandardError => error
      warn("Planos Santo: no se pudo dejar de observar el modelo: #{error.class}")
    end

    # Transactions opened while serving a window request belong to Planos Santo.
    def without_model_watch(&block)
      @model_watch ? @model_watch.suppress(&block) : yield
    end

    def model_watch_changed(kinds)
      return unless @model && Sketchup.active_model.equal?(@model) && !@context_invalid
      # MATERIALES-12: native browser edits refresh both palettes (cheap reread).
      notify_material_library_changed('model_watch') if kinds.include?('materials')
      check_analysis if kinds.include?('model') || kinds.include?('materials')
    end

    def quick_block_reason(action)
      return 'Acceso de herramientas desconocido.' unless QUICK_ACTIONS.include?(action)
      return 'Esperá a que termine la operación actual.' if @busy
      return 'Terminá o cancelá la vista previa de importación antes de cambiar de sección.' if @skm_preview_active || @photo_preview_active
      return 'Abrí un modelo de SketchUp antes de usar las herramientas.' unless Sketchup.respond_to?(:active_model) && Sketchup.active_model
      return 'Guardá los cambios de la guía antes de cambiar de herramienta o sección.' if @dirty
      return 'Guardá los cambios de biblioteca o pedido antes de cambiar de herramienta o sección.' if @workshop_dirty
      return 'Cambió el modelo activo. Volvé a analizar antes de continuar.' if @session && (@context_invalid || !Sketchup.active_model.equal?(@model))
      nil
    end

    def quick_validation(action)
      return Object.const_defined?(:MF_GRAYED) ? Object.const_get(:MF_GRAYED) : 1 if quick_block_reason(action)
      state=smart_state
      active=state['active']==true && state['mode']==action
      active ? (Object.const_defined?(:MF_CHECKED) ? Object.const_get(:MF_CHECKED) : 8) : (Object.const_defined?(:MF_UNCHECKED) ? Object.const_get(:MF_UNCHECKED) : 0)
    rescue StandardError
      Object.const_defined?(:MF_GRAYED) ? Object.const_get(:MF_GRAYED) : 1
    end

    def quick_selection_paths
      model=Sketchup.active_model
      path=(model.respond_to?(:active_path) && model.active_path) || []
      prefix=path.map { |entity| entity.persistent_id.to_s }
      model.selection.select { |entity| entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance) }
           .map { |entity| (prefix+[entity.persistent_id.to_s]).join('/') }
    end

    def quick_action(action,destination:nil)
      reason=quick_block_reason(action)
      raise ExportError,reason if reason
      toggle=smart_state['active']==true && smart_state['mode']==action
      queued=smart_state['queuedCount'].to_i
      stopped=stop_smart_tool(refresh:!%w[sheet edge remove_edge sample].include?(action))
      @quick_sequence=(@quick_sequence || 0)+1
      intent={'sequence'=>@quick_sequence,'action'=>action,'toggleOff'=>toggle,
              'selectionPaths'=>quick_selection_paths,
              'message'=>toggle ? 'Herramienta detenida; no se aplicaron las caras pendientes.' : queued>0 ? 'Se canceló la selección pendiente al cambiar de herramienta.' : %w[sheet edge remove_edge].include?(action) ? 'Elegí un material de la paleta para pintar.' : action=='sample' ? 'Cuentagotas de solo lectura. Hacé clic en una cara para tomar su material.' : action=='order' ? 'Revisá materiales, dimensiones y cantos antes de preparar el pedido.' : ''}
      intent['destination']=destination if destination
      intent.merge!(stopped.slice('scan','scanRequired','refreshWarning','stale'))
      if %w[sheet edge remove_edge sample].include?(action)
        ensure_palette_context!
        @palette_intent=intent
        unless toggle
          if action=='sample'
            dispatch('smart_sample_start',{'side'=>'front'})
          else
            remembered=smart_settings
            begin
              # Toolbar resume never installs: only an explicit palette choice does.
              quick_paint_start(remembered.except('scope',*(action=='remove_edge' ? ['catalogId'] : [])).merge('mode'=>action),install:false) if action=='remove_edge' || remembered['catalogId']
            rescue ExportError => error
              intent['message']=error.message
            end
          end
        end
        intent['message']='Herramienta lista. Hacé clic en una superficie del modelo; Escape cancela.' if !toggle && queued.zero? && smart_state['active']==true && action!='sample'
        show_palette
        emit_to(@palette_dialog,'planos-santo-quick-action',intent) if @palette_ready
        return intent
      end
      @quick_intent=intent
      show
      if @ui_ready && @dialog
        payload=JSON.generate(JSON.generate(intent))
        @dialog.execute_script("window.dispatchEvent(new CustomEvent('planos-santo-quick-action',{detail:JSON.parse(#{payload})}))")
      end
      intent
    rescue StandardError => error
      message=error.is_a?(ExportError) ? error.message : "No se pudo abrir la herramienta (#{error.class}). Volvé a analizar."
      UI.messagebox(message)
      {'error'=>message}
    end

    def open_main
      if @dialog && @ui_ready && !@dirty && !@workshop_dirty && !@busy
        quick_action('home')
      else
        show
      end
      @dialog.set_size(1440,920) if @dialog && @dialog.respond_to?(:set_size)
    end

    def show
      observe_context
      if @dialog && @dialog.visible?
        @dialog.bring_to_front
        return
      end
      @ui_ready=false
      @dialog = UI::HtmlDialog.new(dialog_title: 'Planos Santo', preferences_key: 'PlanosSantoOffline',
                                   scrollable: true, resizable: true, width: 1440, height: 920,
                                   min_width: 420, min_height: 480, style: UI::HtmlDialog::STYLE_DIALOG)
      @dialog.set_file(File.join(__dir__, 'ui', 'index.html'))
      @dialog.add_action_callback('request') do |_context, raw|
        source=@dialog
        UI.start_timer(0, false) { handle(raw,source:source) }
      end
      @dialog.set_can_close do
        (!@dirty && !@workshop_dirty) || UI.messagebox(@workshop_dirty ? 'Hay cambios de biblioteca o pedido sin guardar. ¿Cerrar igualmente?' : 'Hay cambios de la guía sin guardar. ¿Cerrar igualmente?', MB_YESNO) == IDYES
      end
      @dialog.set_on_closed do
        @dialog=nil;@ui_ready=false;@quick_intent=nil
        @dirty=false;@workshop_dirty=false
        unless @palette_dialog
          @skm_import=nil;@skm_preview_active=false;@photo_material=nil;@photo_preview_active=false
          stop_smart_tool(refresh:false);@session=nil
          unwatch_model!;forget_analysis!
        end
      end
      @dialog.show
      @dialog.set_size(1440,920) if @dialog.respond_to?(:set_size)
    end

    # This window is independent of the guide editor; opening it never scans or
    # replaces an already generated guide, and never constructs the large dialog.
    def ensure_palette_context!
      observe_context
      if @session
        active!
      else
        @model=Sketchup.active_model
        raise ExportError,'Abrí un modelo antes de pintar.' unless @model
        @context_invalid=false
        @session=NativeSession.new(@model)
      end
      watch_model!
      clean_for_paint!
    end

    def show_palette
      if @palette_dialog && @palette_dialog.visible?
        @palette_dialog.bring_to_front
        return
      end
      @palette_ready=false
      window=UI::HtmlDialog.new(dialog_title:'Planos Santo · Pintar',preferences_key:'PlanosSantoImmediatePaint087',
        scrollable:true,resizable:true,width:680,height:320,min_width:360,min_height:260,style:UI::HtmlDialog::STYLE_DIALOG)
      @palette_dialog=window
      window.set_file(File.join(__dir__,'ui','palette.html'))
      window.add_action_callback('request') { |_context,raw| UI.start_timer(0,false) { handle(raw,source:window) } }
      window.set_can_close { true }
      window.set_on_closed do
        next unless @palette_dialog.equal?(window)
        @palette_dialog=nil;@palette_ready=false;@palette_intent=nil
        @photo_material=nil;@photo_preview_active=false
        stop_smart_tool(refresh:false)
        unwatch_model! unless @dialog
      end
      window.show
      window.set_size(680,320) if window.respond_to?(:set_size)
    end

    def emit_to(window,event,data)
      window&.execute_script("window.dispatchEvent(new CustomEvent('#{event}',{detail:JSON.parse(#{JSON.generate(JSON.generate(data))})}))")
    end

    def paint_materials
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      PaintMaterials.new(@model,catalog:CatalogStore.new(directory:directory),directory:directory)
    end

    def paint_palette_state
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      {'paintStates'=>paint_materials.states,'visuals'=>MaterialLibrary.new(@model,catalog:CatalogStore.new(directory:directory),directory:directory).status}
    end

    # A quick gesture never reuses permission for shared instances, nor a native
    # UUID stored in another model. Choosing a catalog material is the explicit
    # intent to paint: PaintMaterials#prepare installs its verified visual in this
    # model when missing (0.8.8), then the current bound material is used.
    def quick_paint_start(data,install:true)
      active!;clean_for_paint!
      raise ExportError,'El pintado rápido usa una instancia. Revisá el alcance avanzado para afectar otras.' if data['scope'] && data['scope']!='unique'
      mode=data.fetch('mode','sheet')
      raise ExportError,'Modo rápido inválido.' unless %w[sheet edge remove_edge].include?(mode)
      # Daily painting is one safe occurrence, both physical sides of the board,
      # no deferred batch and no inherited face/XY/shared settings from old UI.
      # The service infers the local cutting axes from each clicked piece.
      options={'mode'=>mode,'side'=>'both','scope'=>'unique','axes'=>[0,1],
        'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>1,'batch'=>false,
        'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>false}
      if mode=='remove_edge' && data['catalogId'].to_s.empty? && !data['materialUuid'].to_s.empty?
        raise ExportError,'Elegí la placa de restauración completa o usá la detección de la pieza.'
      end
      # Validate tool options BEFORE any install, so a refused start never leaves
      # an installed material behind (0.8.8 review).
      options=validate_smart_options(options)
      prepared=nil
      if mode!='remove_edge' || !data['catalogId'].to_s.empty?
        raise ExportError,'Elegí un material de la paleta.' if data['catalogId'].to_s.empty?
        service=paint_materials
        unless install
          state=service.state(data['catalogId'])
          raise ExportError,'Elegí un material de la paleta.' unless state
          raise ExportError,state['message'] unless state['state']=='ready'
        end
        prepared=service.prepare(data['catalogId'],mode=='remove_edge' ? 'sheet' : mode)
        options.merge!('catalogId'=>prepared['catalogId'],'materialUuid'=>prepared['materialUuid'])
      end
      result=if smart_state['active']==true && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate?
        # Validate the new material BEFORE changing the active Tool. Normal
        # material changes neither deselect the Tool nor require reactivation.
        @smart_tool.update_options(options)
        remember_smart_settings(options)
        {'toolState'=>smart_state}
      else
        dispatch('smart_tool_start',{'options'=>options})
      end
      return result unless prepared
      result=result.merge('prepared'=>prepared.slice('catalogId','materialUuid','installed','message'))
      prepared['installed'] ? result.merge(paint_palette_state) : result
    end

    def reply(id, result: nil, error: nil)
      payload = JSON.generate({ 'version' => 1, 'id' => id, 'result' => result, 'error' => error })
      (@request_dialog || @dialog)&.execute_script("window.PlanosSantoBridge.receive(JSON.parse(#{JSON.generate(payload)}))")
    end

    # Only the human choice is unbounded. JS resumes its working deadline on return,
    # including cancellation/errors. Keep the progress separate from final replies.
    def with_user_dialog
      dialog_progress('waiting_user')
      begin
        yield
      ensure
        dialog_progress('working')
      end
    end

    def dialog_progress(phase)
      target=@request_dialog || @dialog
      return unless @request_id && target
      payload = JSON.generate({ 'version' => 1, 'id' => @request_id, 'phase' => phase })
      target.execute_script("window.PlanosSantoBridge.receive(JSON.parse(#{JSON.generate(payload)}))")
    end

    def handle(raw,source:nil)
      previous_dialog=@request_dialog
      @request_dialog=source || @dialog
      id = nil
      raise ExportError, 'Solicitud demasiado grande.' unless raw.is_a?(String) && raw.bytesize <= 45 * 1024 * 1024
      msg = JSON.parse(raw); id = msg['id']
      raise ExportError, 'Protocolo de extensión incompatible.' unless msg['version'] == 1 && id.is_a?(String) && id.length <= 100 && msg['action'].is_a?(String)
      data = msg['data'] || {}
      if msg['action'] == 'dirty' || msg['action'] == 'workshop_dirty'
        if msg['action']=='dirty';@dirty=data['value']==true;else;@workshop_dirty=data['value']==true;end
        reply(id, result: true)
        return
      end
      raise ExportError, 'Esperá a que termine la operación actual.' if @busy
      @busy = true
      @request_id = id
      begin
        result = without_model_watch { dispatch(msg['action'], data) }
        reply(id, result: result)
        if msg['action']=='save' && result['closeAfterSave']==true && @dialog
          dialog=@dialog; session=@session
          UI.start_timer(0.15,false) { dialog.close if @dialog.equal?(dialog) && @session.equal?(session) && !@dirty && !@workshop_dirty }
        end
      ensure
        @request_id = nil
        @busy = false
      end
    rescue StandardError => e
      warn("Planos Santo #{Release::VERSION}: #{e.class}: #{e.message}")
      reply(id, error: e.is_a?(ExportError) ? e.message : "No se pudo completar la operación (#{e.class}). Revisá el diagnóstico o la consola Ruby.")
    ensure
      @request_dialog=previous_dialog
    end

    def active!
      raise ExportError, 'Cambió el modelo activo. Volvé a analizar.' unless @session && !@context_invalid && Sketchup.active_model.equal?(@model)
    end

    def skm_importer
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      @skm_import ||= SkmImport.new(catalog:CatalogStore.new(directory:directory),directory:directory)
    end

    def skm_library
      active!
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      catalog=CatalogStore.new(directory:directory)
      native=MaterialLibrary.new(@model,catalog:catalog,directory:directory).status
      photos=photo_material.thumbnails
      status=skm_importer.status
      status['rows'].each { |row| row['thumbnail']=photos[row['catalogId']] if photos[row['catalogId']] }
      status['catalog']['items'].each do |item|
        next unless MaterialPolicy.photo?(item)
        row=status['rows'].find { |record| record['catalogId']==item['id'] }
        row ||= {'catalogId'=>item['id'],'name'=>item['name'],'sourceName'=>'Foto propia'}.tap { |record| status['rows'] << record }
        row['thumbnail']=photos[item['id']]
        row['designReady']=MaterialPolicy.paintable?(item,directory:directory)
      end
      status.merge('materials'=>native['materials'],'assetRevision'=>native['assetRevision'],'visuals'=>native['visuals'])
    end

    def photo_material
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      captured_model=@model
      @photo_material ||= PhotoMaterial.new(@model,catalog:CatalogStore.new(directory:directory),directory:directory,
        guard:lambda { active!; raise ExportError,'Cambió el modelo de la foto. Elegí nuevamente la imagen.' unless @model.equal?(captured_model) && Sketchup.active_model.equal?(captured_model) })
    end

    def material_thumbnails
      skm_importer.status['rows'].filter_map { |row| [row['catalogId'],row['thumbnail']] if row['thumbnail'] }.to_h.merge(photo_material.thumbnails)
    end

    # A lightweight invalidation for both HtmlDialogs. Receivers reread their
    # own palette data after the successful operation; never scan the model here.
    MATERIAL_LIBRARY_MUTATIONS=%w[catalog_save catalog_add catalog_import catalog_import_model
      catalog_bind catalog_install skm_commit skm_install material_photo_create
      material_photo_install smart_assign_color smart_material_prepare smart_quick_start].freeze
    def dispatch(action, data)
      result=dispatch_action(action,data)
      if MATERIAL_LIBRARY_MUTATIONS.include?(action) && result.is_a?(Hash) && result['cancelled']!=true && result['noChanges']!=true
        installed=%w[smart_material_prepare smart_quick_start].include?(action)
        notify_material_library_changed(action) if !installed || result.dig('prepared','installed')==true
      end
      result
    end

    def notify_material_library_changed(action)
      @material_library_revision=(@material_library_revision || 0)+1
      payload={'revision'=>@material_library_revision,'action'=>action}
      [@dialog,@palette_dialog].compact.uniq.each do |window|
        begin
          emit_to(window,'planos-santo-material-library-changed',payload)
        rescue StandardError => error
          # A closing window must not turn a committed mutation into a failure.
          warn("Planos Santo: no se pudo avisar la actualización de biblioteca: #{error.class}")
        end
      end
    end

    def dispatch_action(action, data)
      stop_smart_tool(refresh:false) if @smart_state && @smart_state['active'] && @smart_state['mode']=='highlight' && %w[generate save pdf names_apply names_preview].include?(action)
      if @smart_state && @smart_state['active'] && @smart_state['mode']!='highlight' && %w[material_photo_pick material_photo_create material_photo_install skm_preview skm_commit skm_install generate save pdf names_apply names_preview catalog_save catalog_add catalog_import catalog_import_model catalog_bind catalog_install order_save order_export paint_preview paint_apply].include?(action)
        raise ExportError,'Detené Pintura Inteligente antes de guardar, generar o cambiar la biblioteca.'
      end
      case action
      when 'palette_ready'
        active!
        @palette_ready=true
        {'ready'=>true,'intent'=>@palette_intent,'toolState'=>smart_state}
      when 'palette_close'
        stop_smart_tool(refresh:false)
        @palette_dialog&.close
        {'closed'=>true}
      when 'palette_manage'
        active!
        raise ExportError,'Destino de biblioteca inválido.' unless %w[catalog visuals].include?(data['destination'])
        clean_for_paint!
        stop_smart_tool(refresh:false)
        @palette_dialog&.close
        quick_action('materials',destination:data['destination'])
      when 'smart_quick_start'
        quick_paint_start(data)
      when 'guide_names_preview'
        active!
        @session.check_current!
        store=GuideStore.new(@model)
        raise ExportError,'La guía cambió. Volvé a analizar.' unless data['revision']==store.read['revision']
        edits=data.fetch('furniture')
        store.validate(@session.document,edits)
        manager=NameManager.new(@model)
        manager.guide_changes(edits,data.fetch('workCode','')) # Validate only: never execute the mutation lambda.
        index=manager.inventory[:index]
        rows=edits.flat_map do |furniture|
          items=furniture.fetch('pieces').map { |piece| [piece['id'],piece['name']] }
          items.unshift([furniture['id'],NameManager.clean(furniture['groupName'])]) if furniture.key?('groupName')
          items.filter_map do |id,name|
            node=index[id]
            next unless node
            {'id'=>id,'currentName'=>node['currentName'],'name'=>name,'role'=>node['role'],
             'changed'=>node['currentName']!=name,
             'affectedPaths'=>index.values.select { |other| other['_entity'].equal?(node['_entity']) }.map { |other| other['id'] }}
          end
        end
        {'rows'=>rows,'warnings'=>[],'blockers'=>[]}
      when 'ui_loading'
        @ui_ready=false
        {'ready'=>false}
      when 'quick_action_ack'
        sequence=data['sequence']
        raise ExportError,'Confirmación de acceso inválida.' unless sequence.is_a?(Integer) && sequence>0
        @quick_intent=nil if @quick_intent && @quick_intent['sequence']==sequence
        @palette_intent=nil if @palette_intent && @palette_intent['sequence']==sequence
        {'acknowledged'=>sequence}
      when 'ui_ready'
        active!
        @ui_ready=true
        {'ready'=>true,'intent'=>@quick_intent}
      when 'scan'
        stop_smart_tool(refresh:false)
        @smart_changed=false
        @smart_state=(@smart_state || {}).merge('contextChanged'=>false,'contextRestored'=>false,'error'=>nil)
        @model = Sketchup.active_model
        @context_invalid=false
        @session = NativeSession.new(@model)
        @naming = nil
        @paint = nil
        @photo_material=nil; @photo_preview_active=false
        result = @session.scan
        @dirty = false
        watch_model!
        mark_fresh!
        result
      when 'catalog_load','catalog_save','catalog_add','catalog_import','catalog_import_model','catalog_export','order_plan','order_save','order_check','order_export','order_references','order_edges','order_audit','ocl_open'
        active!
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        workshop=Workshop.new(@model,@session,directory:directory)
        case action
        when 'catalog_load' then workshop.catalog
        when 'catalog_save' then workshop.save_catalog(data.fetch('items'),data.fetch('revision'))
        when 'catalog_add' then workshop.add_item(data.fetch('item'),data.fetch('revision'))
        when 'catalog_import_model' then workshop.import_catalog(read_materials,data.fetch('revision'))
        when 'catalog_import'
          path= with_user_dialog { UI.openpanel('Importar biblioteca o candidatos JSON',nil,'JSON|*.json||') }
          return {'cancelled'=>true} unless path
          raise ExportError,'El archivo supera 8 MiB.' if File.size(path)>CatalogStore::MAX_BYTES
          workshop.import_catalog(JSON.parse(File.read(path)),data.fetch('revision'))
        when 'catalog_export'
          path= with_user_dialog { UI.savepanel('Exportar biblioteca del taller',nil,'biblioteca-planos-santo.json') }
          return {'cancelled'=>true} unless path
          path += '.json' unless path.downcase.end_with?('.json')
          workshop.export_catalog(path)
        when 'ocl_open' then OclGateway.open(data.fetch('tab'))
        else
          raise ExportError,'Guardá los cambios de la guía antes de preparar el pedido.' if @dirty
          case action
          when 'order_audit' then workshop.audit(data.fetch('plan'))
          when 'order_edges' then workshop.edge_observations(data.fetch('row'))
          when 'order_references' then workshop.references
          when 'order_plan' then workshop.plan(data['reset']==true)
          when 'order_save' then workshop.save_plan(data.fetch('plan'))
          when 'order_check' then workshop.check(data.fetch('plan'))
          when 'order_export'
            path= with_user_dialog { UI.select_directory(title:'Elegir carpeta para TXT y manifiesto') }
            return {'cancelled'=>true} unless path
            workshop.export_order(data.fetch('plan'),path)
          end
        end
      when 'material_photo_pick'
        active!
        clean_for_paint!
        path=with_user_dialog { UI.openpanel('Elegir foto JPG o PNG para material',nil,'Fotos JPG o PNG|*.jpg;*.jpeg;*.png||') }
        return {'cancelled'=>true} unless path
        active!; clean_for_paint!
        result=photo_material.pick(path)
        @photo_preview_active=true
        result
      when 'material_photo_create'
        active!; clean_for_paint!
        raise ExportError,'Elegí primero una foto en este modelo.' unless @photo_material && @photo_preview_active
        result=photo_material.create(data.fetch('token'),data.reject { |key,_| key=='token' })
        @photo_preview_active=false
        refresh_after_material_change(result).merge('library'=>skm_library)
      when 'material_photo_install'
        active!; clean_for_paint!
        raise ExportError,'Confirmá cargar el material de diseño en este modelo.' unless data['confirmed']==true
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        catalog=CatalogStore.new(directory:directory)
        item=catalog.read['items'].find { |record| record['id']==data['catalogId'] }
        raise ExportError,'Elegí una foto guardada de la biblioteca.' unless MaterialPolicy.photo?(item)
        result=MaterialLibrary.new(@model,catalog:catalog,directory:directory).install(data)
        refresh_after_material_change(result).merge('library'=>skm_library)
      when 'material_photo_cancel'
        @photo_material=nil; @photo_preview_active=false
        {'cancelled'=>true}
      when 'skm_library'
        skm_library
      when 'skm_preview'
        active!
        clean_for_paint!
        source=data.fetch('source')
        raise ExportError,'Elegí ZIP, carpeta o archivo SKM.' unless %w[zip folder file].include?(source)
        path=with_user_dialog do
          source=='folder' ? UI.select_directory(title:'Importar carpeta de materiales SKM') : UI.openpanel('Importar biblioteca de materiales',nil,source=='zip' ? 'Biblioteca ZIP o SKM|*.zip;*.skm||' : 'SketchUp Material|*.skm||')
        end
        return {'cancelled'=>true} unless path
        active!
        clean_for_paint!
        actual_source=source=='file' || (source=='zip' && File.extname(path).downcase=='.skm') ? 'files' : source
        result=skm_importer.preview(path,source:actual_source)
        @skm_preview_active=true
        result
      when 'skm_commit'
        active!
        result=skm_importer.commit(data.fetch('token'),data.fetch('selectedIds'),data.fetch('revision'),confirmed:data['confirmed']==true,renames:data.fetch('renames',{}))
        @skm_preview_active=false
        result.merge(skm_library)
      when 'skm_cancel'
        @skm_preview_active=false
        @skm_import=nil
        {'cancelled'=>true}
      when 'skm_install'
        active!
        clean_for_paint!
        raise ExportError,'Confirmá cargar el material aprobado en este modelo.' unless data['confirmed']==true
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        library=MaterialLibrary.new(@model,catalog:CatalogStore.new(directory:directory),directory:directory)
        path=skm_importer.asset_path(data.fetch('catalogId'))
        refresh_after_material_change(library.install(data,path:path))
      when 'piece_highlight'
        active!
        raise ExportError,'Detené Pintura Inteligente y actualizá el análisis antes de resaltar.' if @smart_changed || @analysis_stale
        stop_smart_tool(refresh:false)
        generation=@tool_generation || 0
        @smart_state={'active'=>false,'mode'=>'highlight','changed'=>false,'queuedCount'=>0,'message'=>''}
        @smart_tool=PieceHighlightTool.new(@model,piece_id:data.fetch('pieceId'),
          guard:lambda { raise ExportError,'El resaltado se canceló.' unless generation==(@tool_generation || 0);active! },
          on_event:lambda { |event| smart_event(event) if generation==(@tool_generation || 0) })
        begin
          @model.select_tool(@smart_tool)
        rescue StandardError
          @smart_tool.stop;@smart_tool=nil
          raise
        end
        {'toolState'=>smart_state}
      when 'smart_palette_load'
        active!
        # One paint palette at a time: opening Pintar in the main window closes the
        # separate palette and its Tool. Detach first: a deferred on_closed must
        # not stop the tool or drop the photo draft the main window starts next.
        # Only the initial load of Pintar claims painting; background reloads
        # (library-changed, context restored) never close the other palette.
        if data['claim']==true && @palette_dialog && @dialog && @request_dialog.equal?(@dialog)
          palette=@palette_dialog;@palette_dialog=nil;@palette_ready=false;@palette_intent=nil
          stop_smart_tool(refresh:false)
          begin
            palette.close
          rescue StandardError => error
            warn("Planos Santo: la paleta separada ya estaba cerrada: #{error.class}")
          end
        end
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        catalog=CatalogStore.new(directory:directory)
        {'catalog'=>catalog.read,'visuals'=>MaterialLibrary.new(@model,catalog:catalog,directory:directory).status,
         'paintStates'=>paint_materials.states,
         'settings'=>smart_settings,'toolState'=>smart_state,'thumbnails'=>material_thumbnails}
      when 'smart_material_prepare'
        # Advanced palette: install/verify the chosen material without starting a Tool.
        active!;clean_for_paint!
        raise ExportError,'Modo de material inválido.' unless %w[sheet edge].include?(data['mode'])
        prepared=paint_materials.prepare(data.fetch('catalogId'),data['mode'])
        {'prepared'=>prepared.slice('catalogId','materialUuid','installed','message')}.merge(paint_palette_state)
      when 'smart_assign_color'
        active!;clean_for_paint!
        raise ExportError,'Confirmá el color elegido.' unless data['confirmed']==true
        assigned=paint_materials.assign_color(data.fetch('catalogId'),data.fetch('rgb'))
        {'assigned'=>assigned}.merge(paint_palette_state)
      when 'smart_tool_start'
        active!
        clean_for_paint!
        options=validate_smart_options(data.fetch('options'))
        stop_smart_tool(refresh:false)
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        service=SmartPaint.new(@model,catalog:CatalogStore.new(directory:directory))
        @smart_state={'active'=>false,'mode'=>options['mode'],'changed'=>false,'queuedCount'=>0,'message'=>''}
        generation=@tool_generation || 0
        @smart_tool=SmartPaintTool.new(@model,service:service,options:options,
          guard:lambda { tool_guard!(generation) },on_event:lambda { |event| smart_event(event) if generation==(@tool_generation || 0) })
        begin
          @model.select_tool(@smart_tool)
          @smart_state['active']=true
        rescue StandardError
          @smart_tool.stop
          @smart_tool=nil
          raise
        end
        remember_smart_settings(options)
        {'toolState'=>smart_state}
      when 'smart_sample_start'
        active!
        clean_for_paint!
        side=data.fetch('side','front')
        raise ExportError,'Elegí Frente o Dorso para tomar una superficie física.' unless %w[front back].include?(side)
        stopped=stop_smart_tool
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        catalog=CatalogStore.new(directory:directory)
        library=MaterialLibrary.new(@model,catalog:catalog,directory:directory)
        @smart_state={'active'=>false,'mode'=>'sample','changed'=>false,'queuedCount'=>0,'message'=>''}
        generation=@tool_generation || 0
        @smart_tool=MaterialSampleTool.new(@model,library:library,side:side,
          guard:lambda { tool_guard!(generation) },on_event:lambda { |event| smart_event(event) if generation==(@tool_generation || 0) })
        begin
          @model.select_tool(@smart_tool)
          @smart_state['active']=true
        rescue StandardError
          @smart_tool.stop
          @smart_tool=nil
          raise
        end
        stopped.merge('toolState'=>smart_state)
      when 'smart_tool_status'
        @smart_state && !@smart_state['active'] && @smart_changed ? stop_smart_tool : {'toolState'=>smart_state}
      when 'smart_tool_stop'
        stop_smart_tool
      when 'smart_palette_compact'
        raise ExportError,'Tamaño de paleta inválido.' unless [true,false].include?(data['compact'])
        target=@request_dialog || @dialog
        if target && target.respond_to?(:set_size)
          target.set_size(*(target.equal?(@palette_dialog) ? (data['compact'] ? [680,320] : [680,760]) : data['compact'] ? [440,760] : [1440,920]))
        end
        {'compact'=>data['compact']}
      when 'paint_cancel'
        @paint ? @paint.cancel : {'cancelled'=>true}
      when 'catalog_visuals', 'catalog_bind', 'catalog_install', 'paint_status', 'paint_preview', 'paint_apply'
        active!
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        catalog=CatalogStore.new(directory:directory)
        library=MaterialLibrary.new(@model,catalog:catalog,directory:directory)
        @paint ||= NativePaint.new(@model,catalog:catalog)
        case action
        when 'catalog_visuals' then library.status
        when 'paint_status' then @paint.status(data['pieceId'],from_selection:data['fromSelection']==true)
        else
          clean_for_paint!
          case action
          when 'paint_preview' then @paint.preview(data)
          when 'paint_apply' then refresh_after_material_change(@paint.apply(data))
          when 'catalog_bind' then refresh_after_material_change(library.bind(data))
          when 'catalog_install'
            raise ExportError,'Confirmá la instalación del material.' unless data['confirmed']==true
            raise ExportError,'Origen de material inválido.' unless %w[saved file].include?(data['source'])
            path=nil
            if data['source']=='file'
              path= with_user_dialog { UI.openpanel('Elegir material SketchUp real',nil,'SketchUp Material|*.skm||') }
              return {'cancelled'=>true} unless path
              active!
              clean_for_paint!
            end
            refresh_after_material_change(library.install(data,path:path))
          end
        end
      when 'materials_review'
        active!
        read_materials
      when 'materials_report'
        active!
        target= with_user_dialog { UI.savepanel('Guardar informe local de materiales y cantos', nil, 'modelo.materiales-cantos.json') }
        return {'cancelled'=>true} unless target
        target += '.json' unless target.downcase.end_with?('.json')
        report=read_materials
        begin
          P1Diagnostics.write(report,target)
        rescue Errno::EEXIST
          raise ExportError, 'Ese informe ya existe. Elegí un nombre nuevo; no se sobrescribió.'
        end
        {'cancelled'=>false,'path'=>target,'production_ready'=>false}
      when 'names_catalog', 'names_preview', 'names_apply'
        active!
        raise ExportError, 'Guardá los cambios de la guía antes de renombrar instancias.' if @dirty
        @naming ||= NameManager.new(@model)
        if action == 'names_catalog'
          @naming.catalog
        elsif action == 'names_preview'
          @naming.preview(data.fetch('rootId'))
        else
          result = @naming.apply(data)
          unless result['noChanges']
            @session = NativeSession.new(@model)
            @naming = nil
            mark_stale('names')
            result['stale'] = true
          end
          result
        end
      when 'generate'
        active!
        @session.generate(data.fetch('ids'))
      when 'save'
        active!
        guide = @session.save(data.fetch('furniture'), data.fetch('revision'), sync_names: data['syncNames']==true, work_code: data['workCode'])
        @dirty = false
        saved = false
        if data['saveFile'] == true
          path = @model.path.to_s
          path = with_user_dialog { UI.savepanel('Guardar modelo con sus guías', nil, 'modelo.skp') } if path.empty?
          if path
            path += '.skp' unless path.downcase.end_with?('.skp')
            begin
              saved = @model.save(path)
            rescue StandardError => e
              warn("Planos Santo: guía guardada en memoria; no se pudo guardar SKP: #{e.class}: #{e.message}")
            end
          end
        end
        rebaseline_analysis!
        { 'guide' => guide, 'modelSaved' => saved == true, 'path' => @model.path.to_s, 'fingerprint' => @session.fingerprint, 'document' => @session.document, 'closeAfterSave' => data['closeAfterSave']==true && (data['saveFile']!=true || saved==true) }
      when 'pdf'
        active!
        @session.validate_export(data.fetch('furniture'))
        raise ExportError, 'Regenerá la guía antes de exportar.' unless data['fingerprint'] == @session.fingerprint
        save_pdf(data.fetch('base64'))
      when 'diagnostic'
        { 'extensionVersion' => Release::VERSION, 'sketchupVersion' => Sketchup.version.to_s, 'rubyVersion' => RUBY_VERSION,
          'platform' => RUBY_PLATFORM, 'htmlDialog' => defined?(UI::HtmlDialog) != nil,
          'layoutModulePresent' => Object.const_defined?(:Layout), 'pdfEngine' => 'pdf-lib local; no requiere LayOut',
          'runtimeBridgeResponded' => true, 'manualMeasurementsVerified' => false }
      else
        raise ExportError, 'Acción desconocida.'
      end
    end

    SMART_SETTING_KEYS=%w[edgeCount paintScope mode catalogId replacementKind axes side scope batch].freeze

    def smart_state
      (@smart_state || {'active'=>false,'changed'=>false,'queuedCount'=>0,'message'=>''}).merge('changed'=>@smart_changed==true)
    end

    # Some Windows read_default implementations evaluate string literals. Raw
    # JSON quotes fail there; keep the persisted representation ASCII and quote-free.
    SMART_SETTINGS_KEY='smart_paint_settings_v2'
    SMART_SETTINGS_PREFIX='ps2:'
    def smart_settings
      return {} unless Sketchup.respond_to?(:read_default)
      raw=Sketchup.read_default('PlanosSanto',SMART_SETTINGS_KEY,'')
      if raw==''
        # Read-only compatibility. Broken v1 data cannot be recovered through the
        # native API; never rewrite it merely by opening the palette.
        raw=Sketchup.read_default('PlanosSanto','smart_paint_settings_v1','{}')
        return {} unless raw.is_a?(String) && raw.bytesize<=4096
        parsed=JSON.parse(raw)
      else
        return {} unless raw.is_a?(String) && raw.bytesize<=8192 && raw.start_with?(SMART_SETTINGS_PREFIX)
        bytes=Base64.strict_decode64(raw.delete_prefix(SMART_SETTINGS_PREFIX))
        return {} if bytes.bytesize>4096
        envelope=JSON.parse(bytes.force_encoding(Encoding::UTF_8))
        return {} unless envelope.is_a?(Hash) && envelope.keys.sort==%w[schema settings] && envelope['schema']==2
        parsed=envelope['settings']
      end
      parsed.is_a?(Hash) ? parsed.slice(*SMART_SETTING_KEYS) : {}
    rescue JSON::ParserError, ArgumentError, SyntaxError
      {}
    end

    def remember_smart_settings(options)
      return unless Sketchup.respond_to?(:write_default)
      bytes=JSON.generate('schema'=>2,'settings'=>options.slice(*SMART_SETTING_KEYS))
      raise ExportError,'Preferencias de paleta demasiado grandes.' if bytes.bytesize>4096
      Sketchup.write_default('PlanosSanto',SMART_SETTINGS_KEY,SMART_SETTINGS_PREFIX+Base64.strict_encode64(bytes))
    rescue StandardError, SyntaxError => error
      warn("Planos Santo: no se pudo recordar la paleta: #{error.class}")
    end

    def validate_smart_options(options)
      valid=options.is_a?(Hash) && options['confirmed']==true && %w[sheet edge remove_edge replace].include?(options['mode']) &&
        %w[front back both].include?(options['side']) && %w[all unique].include?(options['scope']) &&
        options['axes'].is_a?(Array) && options['axes'].length==2 && options['axes'].uniq.length==2 && options['axes'].all? { |axis| axis.is_a?(Integer) && (0..2).include?(axis) }
      raise ExportError,'Elegí modo, superficie, alcance y ejes; activá explícitamente la herramienta.' unless valid
      if options['immediate']==true || options['immediatePiece']==true
        raise ExportError,'No se puede pintar esta instancia con seguridad.' unless options['scope']=='unique' && options['side']=='both' && options['batch']!=true && options['allowShared']!=true
      end
      raise ExportError,'Elegí1,2opuestos o4cantos.' if options.key?('edgeCount') && ![1,2,4].include?(options['edgeCount'])
      raise ExportError,'Elegí pieza o cara.' if options.key?('paintScope') && !%w[piece face].include?(options['paintScope'])
      %w[allowShared batch immediate immediatePiece].each do |key|
        raise ExportError,'Configuración de pintado inválida.' if options.key?(key) && ![true,false].include?(options[key])
      end
      JSON.parse(JSON.generate(options))
    end

    def smart_event(event)
      @smart_state=(@smart_state || {}).merge(event)
      if event['changed']==true
        @smart_changed=true
        @session=NativeSession.new(@model)
        @naming=nil
        @paint=nil
      end
      begin
      [@dialog,@palette_dialog].compact.uniq.each { |window| emit_to(window,'planos-santo-smart-paint',smart_state) }
      emit_to(@dialog,'planos-santo-document-invalidated',{'scanRequired'=>true}) if event['changed']==true
      rescue StandardError => error
        warn("Planos Santo: no se pudo actualizar la paleta: #{error.class}")
      end
    end

    def tool_guard!(generation)
      raise ExportError,'La herramienta se canceló. Volvé a activarla desde la paleta.' unless generation==(@tool_generation || 0)
      active!
      clean_for_paint!
    end

    def stop_smart_tool(refresh:true)
      tool=@smart_tool
      @smart_tool=nil
      if tool
        tool.stop
        @model.select_tool(nil) if @model && Sketchup.active_model.equal?(@model)
      end
      @tool_generation=(@tool_generation || 0)+1
      @smart_state=(@smart_state || {}).merge('active'=>false,'queuedCount'=>0,'hover'=>nil,'sample'=>nil)
      # ARQ-02: never rescan here. The session was already invalidated by the
      # change; the editor shows "Análisis desactualizado · Reanalizar".
      stale=refresh && @smart_changed
      @smart_changed=false if stale
      result={'toolState'=>smart_state}
      if stale
        result['stale']=true
        mark_stale('paint')
      end
      result
    end

    def clean_for_paint!
      raise ExportError,'Guardá los cambios de la guía antes de pintar o vincular materiales.' if @dirty
      raise ExportError,'Guardá los cambios de biblioteca o pedido antes de pintar o vincular materiales.' if @workshop_dirty
    end

    # ARQ-02: a material write invalidates the analysis instead of rescanning.
    def refresh_after_material_change(result)
      return result if result['noChanges']==true
      @naming=nil
      @paint=nil
      @session=NativeSession.new(@model)
      mark_stale('material')
      result.merge('stale'=>true)
    end

    ANALYSIS_REASONS={
      'paint'=>'Pintaste desde Planos Santo.','material'=>'Cambió un material del modelo.',
      'names'=>'Se aplicaron nombres en SketchUp.','model'=>'El modelo cambió en SketchUp (edición, Deshacer o Rehacer).'
    }.freeze

    def analysis_state
      {'stale'=>@analysis_stale==true,'reason'=>@analysis_stale ? ANALYSIS_REASONS[@analysis_reason] : nil,'source'=>@analysis_reason}
    end

    # Only an editor that analyzed this model shows the banner.
    def mark_stale(reason)
      return unless @analysis_session
      @analysis_stale=true;@analysis_reason=reason
      publish_analysis_state
    end

    def mark_fresh!
      @analysis_session=@session;@analysis_stale=false;@analysis_reason=nil
      @analysis_fingerprint=safe_fingerprint
    end

    def forget_analysis!
      @analysis_session=nil;@analysis_fingerprint=nil;@analysis_stale=false;@analysis_reason=nil
    end

    # Own writes that keep the analysis valid (saving the guide) re-baseline.
    def rebaseline_analysis!
      @analysis_fingerprint=safe_fingerprint if @analysis_session && @analysis_session.equal?(@session) && !@analysis_stale
    end

    # Runs from the debounced timer, never from an observer callback.
    def check_analysis
      return unless @analysis_session && @analysis_fingerprint && @dialog
      current=safe_fingerprint
      return unless current
      if current!=@analysis_fingerprint
        mark_stale('model') unless @analysis_stale
      elsif @analysis_stale && @analysis_session.equal?(@session)
        # Undo back to the analyzed state with the same session: fresh again.
        @analysis_stale=false;@analysis_reason=nil
        publish_analysis_state
      end
    end

    def safe_fingerprint
      ModelWatch.fingerprint(@model)
    rescue StandardError => error
      warn("Planos Santo: no se pudo calcular la huella del modelo: #{error.class}")
      nil
    end

    def publish_analysis_state
      emit_to(@dialog,'planos-santo-analysis-state',analysis_state)
    rescue StandardError => error
      warn("Planos Santo: no se pudo avisar el estado del análisis: #{error.class}")
    end

    def read_materials
      active!
      OclReader.capture(@model)
    rescue P1Diagnostics::LimitError, ArgumentError => error
      raise ExportError, error.message
    end

    def save_pdf(encoded)
      raise ExportError, 'PDF demasiado grande.' unless encoded.is_a?(String) && encoded.bytesize <= 40 * 1024 * 1024
      bytes = Base64.strict_decode64(encoded)
      raise ExportError, 'El documento PDF no es válido.' unless bytes.start_with?('%PDF-') && bytes.byteslice([bytes.bytesize - 1024, 0].max, 1024).to_s.include?('%%EOF') && bytes.bytesize <= 30 * 1024 * 1024
      target = with_user_dialog { UI.savepanel('Exportar guías PDF A4', nil, 'PlanosSanto-A4.pdf') }
      return { 'cancelled' => true } unless target
      target += '.pdf' unless target.downcase.end_with?('.pdf')
      Tempfile.create(['.planos-santo-', '.pdf'], File.dirname(target)) do |file|
        file.binmode; file.write(bytes); file.flush; file.fsync; file.close
        File.rename(file.path, target)
      end
      { 'path' => target, 'bytes' => bytes.bytesize }
    end
  end

  unless file_loaded?(__FILE__)
    @offline_controller = OfflineController.new
    @offline_controller.observe_context
    QuickToolbar.install(@offline_controller)
    file_loaded(__FILE__)
  end
end
