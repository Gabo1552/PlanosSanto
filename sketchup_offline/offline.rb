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
require_relative 'order_references'
require_relative 'cutlist'
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
        # Back on the analyzed model: observe it again and catch what changed meanwhile.
        if @model_watch.nil? && @session
          watch_model!
          check_analysis
        end
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

    # Pintura en vista: «Pintar», «Pintar canto» and «Quitar canto» from the
    # toolbar start the immediate brush with no window. The material is chosen
    # in the view (strip of swatches) or in SketchUp's Materials tray. Painting
    # needs no analysis and no saved guide; only open library/order edits block.
    PAINT_IN_VIEW=%w[sheet edge remove_edge].freeze
    def paint_block_reason(action)
      return 'Acceso de herramientas desconocido.' unless PAINT_IN_VIEW.include?(action)
      return 'Esperá a que termine la operación actual.' if @busy
      return 'Terminá o cancelá la vista previa de importación antes de pintar.' if @skm_preview_active || @photo_preview_active
      return 'Abrí un modelo de SketchUp antes de pintar.' unless Sketchup.respond_to?(:active_model) && Sketchup.active_model
      return 'Guardá los cambios de biblioteca o pedido antes de pintar.' if @workshop_dirty
      nil
    end

    def paint_validation(action)
      return Object.const_defined?(:MF_GRAYED) ? Object.const_get(:MF_GRAYED) : 1 if paint_block_reason(action)
      state=smart_state
      active=state['active']==true && state['mode']==action
      active ? (Object.const_defined?(:MF_CHECKED) ? Object.const_get(:MF_CHECKED) : 8) : (Object.const_defined?(:MF_UNCHECKED) ? Object.const_get(:MF_UNCHECKED) : 0)
    rescue StandardError
      Object.const_defined?(:MF_GRAYED) ? Object.const_get(:MF_GRAYED) : 1
    end

    def paint_in_view(action)
      reason=paint_block_reason(action)
      raise ExportError,reason if reason
      if smart_state['active']==true && smart_state['mode']==action && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate?
        result=stop_smart_tool
        paint_status('Pintura terminada.')
        return result.merge('toggleOff'=>true)
      end
      stop_smart_tool(refresh:false)
      ensure_paint_context!
      options=paint_in_view_options(action)
      result=start_smart_tool(options,in_view:true)
      @quick_options=options
      result
    rescue StandardError => error
      message=error.is_a?(ExportError) ? error.message : "No se pudo activar la pintura (#{error.class})."
      paint_status(message)
      {'error'=>message}
    end

    # The palette stays available from the menu; painting never opens it.
    def open_paint_palette
      ensure_palette_context!
      show_palette
      {'opened'=>true}
    rescue StandardError => error
      message=error.is_a?(ExportError) ? error.message : "No se pudo abrir la paleta (#{error.class})."
      paint_status(message)
      {'error'=>message}
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
    end

    def show
      observe_context
      if @dialog && @dialog.visible?
        @dialog.bring_to_front
        return
      end
      @ui_ready=false
      # ARQ-06: no forced size. SketchUp remembers the user's size and position
      # (preferences_key); the first open is fitted to 80 % of the screen by the UI.
      @dialog = UI::HtmlDialog.new(dialog_title: 'Planos Santo', preferences_key: 'PlanosSantoOffline',
                                   scrollable: true, resizable: true, width: MAIN_INITIAL_SIZE[0], height: MAIN_INITIAL_SIZE[1],
                                   min_width: MAIN_FOLDED_SIZE[0], min_height: MAIN_FOLDED_SIZE[1], style: UI::HtmlDialog::STYLE_DIALOG)
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
          # 0.8.17 (cortes): the brush of the toolbar does not depend on this window.
          unless in_view_brush?
            stop_smart_tool(refresh:false);@session=nil
            unwatch_model!
          end
        end
        forget_analysis! # the analysis state belongs to the editor window
      end
      @folded_size=nil;@compact_size=nil
      @dialog.show
    end

    MAIN_INITIAL_SIZE=[1100,680].freeze # fits 1366x768 before the first fit
    MAIN_FOLDED_SIZE=[420,120].freeze
    MAIN_COMPACT_SIZE=[440,760].freeze
    PALETTE_SIZE=[680,320].freeze
    WINDOW_LAYOUT_KEY='window_layout_v1'

    # Screen = [width,height,left,top] of the monitor holding the window
    # (availLeft/availTop place it on a secondary monitor).
    def window_screen(data)
      width=data['screenWidth'];height=data['screenHeight']
      valid=[width,height].all? { |value| value.is_a?(Integer) && value.between?(320,16_384) }
      raise ExportError,'Pantalla inválida para ajustar la ventana.' unless valid
      left,top=%w[screenLeft screenTop].map { |key| data[key].is_a?(Integer) && data[key].abs<=65_536 ? data[key] : 0 }
      [width,height,left,top]
    end

    # Size reported by the UI (outerWidth/outerHeight): HtmlDialog#get_size may
    # be missing, so it is the fallback to restore the operator's size.
    def reported_window_size(data)
      size=[data['windowWidth'],data['windowHeight']]
      size.all? { |value| value.is_a?(Integer) && value.between?(100,16_384) } ? size : nil
    end

    def current_window_size(window,data)
      (window.respond_to?(:get_size) && window.get_size) || reported_window_size(data)
    end

    def fit_window(window,screen)
      return unless window
      size=screen ? screen[0,2].map { |value| (value*0.8).round } : MAIN_INITIAL_SIZE
      window.set_size(*size) if window.respond_to?(:set_size)
      return unless screen && window.respond_to?(:set_position)
      window.set_position(*[0,1].map { |i| screen[i+2]+((screen[i]-size[i])/2.0).round })
    end

    def window_fitted?
      Sketchup.respond_to?(:read_default) && Sketchup.read_default('PlanosSanto',WINDOW_LAYOUT_KEY,'')=='fitted'
    end

    def remember_window_fitted(value)
      Sketchup.write_default('PlanosSanto',WINDOW_LAYOUT_KEY,value) if Sketchup.respond_to?(:write_default)
    end

    # First open only: later opens keep what SketchUp remembered for the user.
    def window_fit(data)
      @screen=window_screen(data)
      return {'fitted'=>false} unless @request_dialog && @request_dialog.equal?(@dialog)
      # Closed while folded: SketchUp remembers the strip, so refit on reopen.
      size=reported_window_size(data)
      reopened_folded=size && size[1]<=MAIN_FOLDED_SIZE[1]+60
      return {'fitted'=>false} if window_fitted? && !reopened_folded
      fit_window(@dialog,@screen)
      remember_window_fitted('fitted')
      {'fitted'=>true}
    end

    # «Plegar» leaves a small strip and gives the keyboard back to the model.
    def window_fold(folded,data={})
      raise ExportError,'Estado de plegado inválido.' unless [true,false].include?(folded)
      window=@dialog
      return {'folded'=>false} unless window
      if folded
        @folded_size ||= current_window_size(window,data)
        window.set_size(*MAIN_FOLDED_SIZE) if window.respond_to?(:set_size)
        Sketchup.focus if Sketchup.respond_to?(:focus)
      else
        size=@folded_size;@folded_size=nil
        size ? window.set_size(*size) : fit_window(window,@screen)
      end
      {'folded'=>folded}
    end

    # Menu «Restablecer ventanas»: forget remembered layout and refit open windows.
    def reset_windows
      remember_window_fitted('')
      @folded_size=nil;@compact_size=nil
      if @dialog
        fit_window(@dialog,@screen)
        remember_window_fitted('fitted') if @screen
        emit_to(@dialog,'planos-santo-window-reset',{'screen'=>!@screen.nil?})
      end
      @palette_dialog.set_size(*PALETTE_SIZE) if @palette_dialog && @palette_dialog.respond_to?(:set_size)
      true
    rescue StandardError => error
      warn("Planos Santo: no se pudieron restablecer las ventanas: #{error.class}")
      false
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

    # ARQ-07: Materiales and Maderera open without scanning. The editor gets a
    # model context like the palette does; an existing session is never replaced.
    def ensure_editor_context!
      observe_context
      if @session
        # The palette may have closed alone and detached the watch (QA integración).
        watch_model! if !@context_invalid && Sketchup.active_model.equal?(@model)
        return
      end
      model=Sketchup.active_model
      return unless model
      @model=model;@context_invalid=false
      @session=NativeSession.new(@model)
      watch_model!
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
        stop_smart_tool(refresh:false) unless in_view_brush?
        unwatch_model! unless @dialog || in_view_brush?
      end
      window.show
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
    # Builds and validates immediate options; resolves the material (installing
    # only when install:true). Returns [options, prepared or nil].
    def smart_quick_options(data,install:true,allow_empty:false)
      # Hito 2 (PINTURA-02) · simplificación punto 26: choosing «Todas las
      # iguales» (scope all) in this same request is the authorization; there is
      # no separate checkbox, one Ctrl+Z undoes it, and it is never remembered.
      scope=data['scope'] || 'unique'
      raise ExportError,'Alcance de pintado inválido.' unless %w[unique all].include?(scope)
      raise ExportError,'Configuración de pintado inválida.' if data.key?('allowShared') && ![true,false].include?(data['allowShared'])
      raise ExportError,'Para pintar todas las copias, elegí «Todas las iguales» en la paleta.' if scope=='all' && data['allowShared']==false
      mode=data.fetch('mode','sheet')
      raise ExportError,'Modo rápido inválido.' unless %w[sheet edge remove_edge].include?(mode)
      # Hito 2 (PINTURA-01): 1, 2 opposite or 4 edges per click, exact Integer;
      # absent -> remembered -> 1. Sheet always paints the two broad faces.
      if data.key?('edgeCount')
        raise ExportError,'Elegí 1, 2 opuestos o 4 cantos.' unless data['edgeCount'].is_a?(Integer) && [1,2,4].include?(data['edgeCount'])
        count=data['edgeCount']
      else
        count=smart_settings['edgeCount'] || 1
      end
      count=1 if mode=='sheet'
      # Daily painting is one safe occurrence, both physical sides of the board,
      # no deferred batch and no inherited face/XY/shared settings from old UI.
      # The service infers the local cutting axes from each clicked piece.
      options={'mode'=>mode,'side'=>'both','scope'=>scope,'axes'=>[0,1],
        'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>count,'batch'=>false,
        'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>scope=='all'}
      if mode=='remove_edge' && data['catalogId'].to_s.empty? && !data['materialUuid'].to_s.empty?
        raise ExportError,'Elegí la placa de restauración completa o usá la detección de la pieza.'
      end
      # Validate tool options BEFORE any install, so a refused start never leaves
      # an installed material behind (0.8.8 review).
      options=validate_smart_options(options)
      prepared=nil
      # Pintura en vista (allow_empty): the brush starts without material and the
      # operator chooses it in the view or in SketchUp's Materials tray.
      if (mode!='remove_edge' || !data['catalogId'].to_s.empty?) && !(allow_empty && data['catalogId'].to_s.empty?)
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
      [options,prepared]
    end

    def start_smart_tool(options,in_view:false)
      stop_smart_tool(refresh:false)
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      service=SmartPaint.new(@model,catalog:CatalogStore.new(directory:directory))
      @smart_state={'active'=>false,'mode'=>options['mode'],'changed'=>false,'queuedCount'=>0,'message'=>''}
      generation=@tool_generation || 0
      # Hito 7 (PINTURA-04/07): recientes y cuentagotas de la vista eligen sin instalar.
      advanced={select_material:lambda { |catalog_id,mode| tool_guard!(generation,in_view);smart_select_material(catalog_id,mode) },
        recents:lambda { |mode| generation==(@tool_generation || 0) ? smart_recent_materials(mode) : [] },
        eyedropper_key:smart_settings['eyedropperKey'] || 'alt'}
      if in_view
        # Pintura en vista: the strip lists the library and the Materials tray chooses too.
        advanced.merge!(swatches:lambda { |mode| generation==(@tool_generation || 0) ? smart_swatches(mode) : [] },
          pick_material:lambda { |catalog_id,mode| tool_guard!(generation,true,install:true);smart_pick_material(catalog_id,mode) },
          native_material:lambda { |material| tool_guard!(generation,true);smart_native_material(material) })
      end
      @smart_tool=SmartPaintTool.new(@model,service:service,options:options,
        guard:lambda { tool_guard!(generation,in_view) },on_event:lambda { |event| smart_event(event) if generation==(@tool_generation || 0) },
        remember:lambda { |changed| remember_smart_settings(changed) if generation==(@tool_generation || 0) },
        switch_mode:lambda { |mode| tool_guard!(generation,in_view);smart_switch_mode(mode) },timing:smart_timing,**advanced)
      @smart_in_view=in_view
      begin
        @model.select_tool(@smart_tool)
        @smart_state['active']=true
      rescue StandardError
        @smart_tool.stop
        @smart_tool=nil
        raise
      end
      remember_smart_settings(options) unless options['catalogId'].to_s.empty? && options['mode']!='remove_edge'
      {'toolState'=>smart_state}
    end

    def quick_paint_start(data,install:true)
      active!;clean_for_paint!
      options,prepared=smart_quick_options(data,install:install)
      result=if smart_state['active']==true && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate?
        # Validate the new material BEFORE changing the active Tool. Normal
        # material changes neither deselect the Tool nor require reactivation.
        # A different material or mode drops the «Todas las iguales» consent.
        current=(@smart_tool.respond_to?(:status) && @smart_tool.status['options']) || @quick_options || {}
        options.merge!('scope'=>'unique','allowShared'=>false) if current['mode']!=options['mode'] || current['catalogId']!=options['catalogId']
        @smart_tool.update_options(options)
        remember_smart_settings(options)
        {'toolState'=>smart_state}
      else
        dispatch('smart_tool_start',{'options'=>options})
      end
      @quick_options=options
      return result unless prepared
      result=result.merge('prepared'=>prepared.slice('catalogId','materialUuid','installed','message'))
      prepared['installed'] ? result.merge(paint_palette_state) : result
    end

    # F-ARQ-A: every reply is measured; above the cap it becomes a clear error,
    # and large ones travel in parts (one execute_script each) so CEF never
    # receives a single huge script. bridge.ts rebuilds and validates them.
    REPLY_CHUNK_BYTES=1024*1024
    REPLY_MAX_BYTES=48*1024*1024
    REPLY_WARN_BYTES=8*1024*1024
    REPLY_STATS_LIMIT=20
    def reply_chunk_bytes;REPLY_CHUNK_BYTES;end
    def reply_max_bytes;REPLY_MAX_BYTES;end

    def reply(id, result: nil, error: nil)
      payload = JSON.generate({ 'version' => 1, 'id' => id, 'result' => result, 'error' => error })
      bytes=payload.bytesize
      capped=bytes>reply_max_bytes
      if capped
        payload=JSON.generate({ 'version' => 1, 'id' => id, 'result' => nil,
          'error' => "La respuesta de SketchUp supera el tope de #{reply_mib(reply_max_bytes)} MB (#{reply_mib(bytes)} MB). Generá menos muebles a la vez o revisá herrajes con mucha geometría." })
      end
      parts=deliver_reply(@request_dialog || @dialog,id,payload)
      record_reply(bytes,parts,capped)
    end

    def deliver_reply(target,id,payload)
      return 0 unless target
      if payload.bytesize<=reply_chunk_bytes
        target.execute_script("window.PlanosSantoBridge.receive(JSON.parse(#{JSON.generate(payload)}))")
        return 1
      end
      parts=reply_parts(payload)
      parts.each_with_index do |data,index|
        chunk=JSON.generate({ 'version' => 1, 'id' => id, 'index' => index, 'total' => parts.length, 'data' => data })
        target.execute_script("window.PlanosSantoBridge.receiveChunk(JSON.parse(#{JSON.generate(chunk)}))")
      end
      parts.length
    end

    # Byte slices that never cut a UTF-8 character.
    def reply_parts(payload)
      limit=[reply_chunk_bytes,16].max;parts=[];offset=0
      while offset<payload.bytesize
        size=[limit,payload.bytesize-offset].min
        size-=1 until payload.byteslice(offset,size).valid_encoding?
        parts << payload.byteslice(offset,size);offset+=size
      end
      parts
    end

    def reply_mib(bytes);(bytes/1024.0/1024).round(1);end

    def record_reply(bytes,parts,capped)
      started=@request_started
      ms=started ? ((Process.clock_gettime(Process::CLOCK_MONOTONIC)-started)*1000).round : nil
      (@reply_stats ||= []) << {'action'=>@request_action,'bytes'=>bytes,'ms'=>ms,'parts'=>parts,'capped'=>capped}
      @reply_stats.shift while @reply_stats.length>REPLY_STATS_LIMIT
      warn("Planos Santo: respuesta #{@request_action} de #{reply_mib(bytes)} MB en #{ms} ms (#{parts} partes).") if bytes>REPLY_WARN_BYTES
    rescue StandardError => error
      warn("Planos Santo: no se pudo medir la respuesta: #{error.class}")
    end

    # F-ARQ-A: the scan tree only needs to know which nodes are pieces. Meshes
    # travel with generate, for the chosen furniture only; the session keeps them.
    DEFERRED_MESH={'vertices'=>[].freeze,'triangles'=>[].freeze,'deferred'=>true}.freeze
    def light_scan(result)
      tree=result['tree']
      result.merge('tree'=>tree.merge('roots'=>light_nodes(tree['roots'])))
    end

    def light_nodes(nodes)
      nodes.map do |node|
        copy=node.merge('children'=>light_nodes(node.fetch('children',[]) || []))
        copy['mesh']=DEFERRED_MESH if node['mesh']
        copy
      end
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
      @request_started=Process.clock_gettime(Process::CLOCK_MONOTONIC);@request_action=nil
      msg = JSON.parse(raw); id = msg['id']
      @request_action=msg['action'].to_s[0,40] if msg.is_a?(Hash)
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
      material_photo_install smart_assign_color smart_material_prepare smart_quick_start
      material_duplicate material_archive material_package_commit material_texture_apply material_ocl_sync].freeze
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
      # 0.8.17 (punto 2 de Gabriel): these used to answer «Detené Pintura
      # Inteligente…». Now the brush stops by itself and the action goes on.
      stop_brush_for!(action) if BRUSH_STOPPING_ACTIONS.include?(action)
      case action
      when *MATERIAL_MANAGEMENT_ACTIONS
        material_management(action,data)
      when 'palette_ready'
        active!
        @palette_ready=true
        {'ready'=>true,'intent'=>@palette_intent,'toolState'=>smart_state}
      when 'palette_close'
        stop_smart_tool(refresh:false) unless in_view_brush?
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
        {'rows'=>rows,'warnings'=>[],'blockers'=>[],'skipped'=>manager.skipped}
      when 'ui_loading'
        @ui_ready=false
        ensure_editor_context!
        # Peek only: ui_ready/quick_action_ack consume the intent.
        {'ready'=>false,'intent'=>@quick_intent}
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
        # 0.8.17 (cortes): App.tsx reanalyzes by itself 1.2 s after each click of
        # the brush. That scan used to stop the brush: painting «se detenía de vez
        # en cuando». A brush painting this same model keeps working.
        stop_smart_tool(refresh:false) unless brush_running? && Sketchup.active_model.equal?(@model)
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
        light_scan(result)
      when 'catalog_load','catalog_save','catalog_add','catalog_import','catalog_import_model','catalog_export','order_plan','order_save','order_check','order_export','order_references','order_references_partial','order_edges','order_audit','order_propose','order_confirm_bulk','order_apply','ocl_open'
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
          when 'order_references_partial' then OrderReferences.partial(@model,workshop)
          when 'order_plan' then workshop.plan(data['reset']==true)
          when 'order_save' then workshop.save_plan(data.fetch('plan'))
          when 'order_check' then workshop.check(data.fetch('plan'))
          when 'order_propose' then workshop.propose(data.fetch('plan'),data['ids'])
          when 'order_confirm_bulk' then workshop.confirm_bulk(data.fetch('plan'),data['ids'])
          when 'order_apply' then workshop.apply_rows(data.fetch('plan'),data.fetch('sourceId'),data.fetch('targetIds'),data.fetch('groups'))
          when 'order_export'
            path= with_user_dialog { UI.select_directory(title:'Elegir carpeta para TXT y manifiesto') }
            return {'cancelled'=>true} unless path
            workshop.export_order(data.fetch('plan'),path)
          end
        end
      when 'cutlist'
        # Vista «Piezas»: solo lectura, no escribe el modelo ni el pedido.
        active!
        Cutlist.for_model(@model,@session,directory:ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory)
      # --- Hito 4 · perfil de maderera y catálogo v2 (bloque aislado) ---
      when 'maderera_profiles_load','maderera_profile_save','maderera_profile_approve','maderera_profile_activate','catalog_presets','catalog_add_preset','catalog_variant','skm_commit_typed'
        active!
        mutating=%w[maderera_profile_save maderera_profile_approve maderera_profile_activate catalog_add_preset catalog_variant skm_commit_typed].include?(action)
        stop_brush_for!(action) if mutating
        directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
        workshop=Workshop.new(@model,@session,directory:directory)
        result=case action
        when 'maderera_profiles_load' then workshop.maderera_profiles
        when 'maderera_profile_save' then workshop.save_maderera_profile(data.fetch('profile'),data.fetch('revision'))
        when 'maderera_profile_approve' then workshop.approve_maderera_profile(data.fetch('id'),data.fetch('version'),data.fetch('revision'))
        when 'maderera_profile_activate' then workshop.activate_maderera_profile(data['id'],data.fetch('revision'))
        when 'catalog_presets' then workshop.presets
        when 'catalog_add_preset' then workshop.add_preset(data.fetch('presetId'),data['name'],data.fetch('revision'))
        when 'catalog_variant' then workshop.add_variant(data.fetch('id'),data.fetch('thicknessMm'),data.fetch('revision'),name:data['name'])
        when 'skm_commit_typed'
          committed=skm_importer.commit(data.fetch('token'),data.fetch('selectedIds'),data.fetch('revision'),confirmed:data['confirmed']==true,renames:data.fetch('renames',{}),
            kinds:data.fetch('kinds',{}),apply_suggestions:data['applySuggestions']==true)
          @skm_preview_active=false
          committed.merge(skm_library)
        end
        notify_material_library_changed(action) if %w[catalog_add_preset catalog_variant skm_commit_typed].include?(action)
        result
      # --- fin Hito 4 ---
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
        # 0.8.17: no «Detené…» and no wait for the analysis: the brush stops by
        # itself and a path that changed is refused by the highlight tool itself.
        stop_brush_for!(action)
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
        visuals=MaterialLibrary.new(@model,catalog:catalog,directory:directory).status
        {'catalog'=>without_archived(catalog.read,visuals),'visuals'=>visuals,
         'paintStates'=>paint_materials.states,
         'settings'=>smart_settings,'toolState'=>smart_view_state,'thumbnails'=>material_thumbnails}
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
        start_smart_tool(validate_smart_options(data.fetch('options')))
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
        # A brush that SketchUp just swapped for its Paint Bucket (tray choice) comes back by itself.
        returning=@smart_tool.respond_to?(:tray_grace?) && @smart_tool.tray_grace?
        (@smart_state && !@smart_state['active'] && @smart_changed && !returning ? stop_smart_tool : {'toolState'=>smart_state}).merge('timings'=>smart_timing.summary)
      when 'smart_tool_stop'
        stop_smart_tool
      # Hito 7: opciones de vista del pincel inmediato. No detienen la herramienta,
      # no escriben entidades y no marcan el análisis como desactualizado.
      when 'smart_tool_view'
        active!
        raise ExportError,'Opción de vista inválida.' unless data.is_a?(Hash) && data.keys==['highlightMissing'] && [true,false].include?(data['highlightMissing'])
        @smart_tool.set_view_options('highlightMissing'=>data['highlightMissing']) if smart_state['active']==true && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate? && @smart_tool.respond_to?(:set_view_options)
        {'toolState'=>smart_state}
      when 'smart_toggle_transparency'
        active! # PINTURA-14: opción de vista, sin operación ni Undo.
        raise ExportError,'Esta versión de SketchUp no permite cambiar la transparencia desde el pincel.' unless SmartPaintTool.respond_to?(:toggle_transparency)
        value=SmartPaintTool.toggle_transparency(@model)==true
        @smart_state=(@smart_state || {}).merge('transparency'=>value)
        {'transparency'=>value,'toolState'=>smart_state}
      when 'smart_eyedropper_key'
        active! # PINTURA-07: tecla sostenida del cuentagotas.
        key=data.is_a?(Hash) ? data['key'] : nil
        raise ExportError,'Elegí Alt o Mayús para el cuentagotas.' unless %w[alt shift].include?(key)
        remember_smart_settings(smart_settings.merge('eyedropperKey'=>key))
        @smart_tool.eyedropper_key=key if smart_state['active']==true && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate? && @smart_tool.respond_to?(:eyedropper_key=)
        # A stopped tool's last state still carries the old key: the palette would adopt it and undo the choice.
        @smart_state=@smart_state.merge('eyedropperKey'=>key) if @smart_state&.key?('eyedropperKey')
        {'settings'=>smart_settings,'toolState'=>smart_state}
      when 'smart_palette_compact'
        raise ExportError,'Tamaño de paleta inválido.' unless [true,false].include?(data['compact'])
        target=@request_dialog || @dialog
        if target && target.respond_to?(:set_size)
          if target.equal?(@palette_dialog)
            target.set_size(*(data['compact'] ? PALETTE_SIZE : [680,760]))
          elsif data['compact']
            @compact_size ||= current_window_size(target,data)
            target.set_size(*MAIN_COMPACT_SIZE)
          else
            # ARQ-06: back to the operator's size, never a fixed 1440x920.
            size=@compact_size;@compact_size=nil
            size ? target.set_size(*size) : fit_window(target,@screen)
          end
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
        { 'guide' => guide, 'modelSaved' => saved == true, 'path' => @model.path.to_s, 'fingerprint' => @session.fingerprint, 'document' => @session.document, 'skippedNames' => @session.skipped_names || [], 'closeAfterSave' => data['closeAfterSave']==true && (data['saveFile']!=true || saved==true) }
      when 'pdf'
        active!
        @session.validate_export(data.fetch('furniture'))
        raise ExportError, 'Regenerá la guía antes de exportar.' unless data['fingerprint'] == @session.fingerprint
        save_pdf(data.fetch('base64'))
      when 'window_fit'
        window_fit(data)
      when 'window_fold'
        window_fold(data['folded'],data)
      when 'diagnostic'
        { 'extensionVersion' => Release::VERSION, 'sketchupVersion' => Sketchup.version.to_s, 'rubyVersion' => RUBY_VERSION,
          'platform' => RUBY_PLATFORM, 'htmlDialog' => defined?(UI::HtmlDialog) != nil,
          'layoutModulePresent' => Object.const_defined?(:Layout), 'pdfEngine' => 'pdf-lib local; no requiere LayOut',
          'runtimeBridgeResponded' => true, 'manualMeasurementsVerified' => false, 'replyStats' => (@reply_stats || []).last(10), 'paintClicks' => smart_timing.summary }
      else
        raise ExportError, 'Acción desconocida.'
      end
    end

    SMART_SETTING_KEYS=%w[edgeCount paintScope mode catalogId replacementKind axes side scope batch lastMaterials recentMaterials eyedropperKey].freeze
    RECENT_MATERIALS_MAX=6

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
      return {} unless parsed.is_a?(Hash)
      settings=parsed.slice(*SMART_SETTING_KEYS)
      settings.delete('edgeCount') if settings.key?('edgeCount') && !(settings['edgeCount'].is_a?(Integer) && [1,2,4].include?(settings['edgeCount']))
      if settings.key?('lastMaterials')
        last=settings['lastMaterials'];last=last.is_a?(Hash) ? last.slice('sheet','edge').select { |_,id| id.is_a?(String) && !id.empty? && id.length<=200 } : {}
        last.empty? ? settings.delete('lastMaterials') : settings['lastMaterials']=last
      end
      # Hito 7 (PINTURA-04): hasta 6 ids de catálogo únicos por modo; lo demás se descarta.
      if settings.key?('recentMaterials')
        recent=settings['recentMaterials']
        recent=recent.is_a?(Hash) ? recent.slice('sheet','edge').filter_map { |mode,ids| ids=ids.is_a?(Array) ? ids.select { |id| id.is_a?(String) && !id.empty? && id.length<=200 }.uniq.first(RECENT_MATERIALS_MAX) : [];[mode,ids] unless ids.empty? }.to_h : {}
        recent.empty? ? settings.delete('recentMaterials') : settings['recentMaterials']=recent
      end
      settings.delete('eyedropperKey') if settings.key?('eyedropperKey') && !%w[alt shift].include?(settings['eyedropperKey'])
      settings
    rescue JSON::ParserError, ArgumentError, SyntaxError
      {}
    end

    def remember_smart_settings(options)
      return unless Sketchup.respond_to?(:write_default)
      settings=options.slice(*SMART_SETTING_KEYS)
      settings['scope']='unique' if settings.key?('scope') # consent for every copy never survives
      previous=smart_settings;last=previous['lastMaterials'] || {};recent=previous['recentMaterials'] || {}
      # The recents list and the eyedropper key are never taken blindly from options.
      settings.delete('recentMaterials');settings['eyedropperKey']=previous['eyedropperKey'] unless %w[alt shift].include?(settings['eyedropperKey'])
      settings.delete('eyedropperKey') unless settings['eyedropperKey']
      if options['immediate']==true || options['immediatePiece']==true
        # Sheet forces one edge per click; it must not forget the edge preference.
        settings['edgeCount']=previous['edgeCount'] || 1 if options['mode']=='sheet'
        # Tab (PINTURA-06): last catalog id per mode; the UUID belongs to the model.
        if %w[sheet edge].include?(options['mode']) && options['catalogId'].is_a?(String) && !options['catalogId'].empty? && options['catalogId'].length<=200
          last=last.merge(options['mode']=>options['catalogId'])
          # PINTURA-04: a new id enters at the front (at most 6 per mode); a known one
          # keeps its slot, so the strip square and key 1–6 always mean the same material.
          list=recent[options['mode']] || []
          recent=recent.merge(options['mode']=>list.include?(options['catalogId']) ? list : ([options['catalogId']]+list).first(RECENT_MATERIALS_MAX))
        end
      end
      settings['lastMaterials']=last unless last.empty?
      settings['recentMaterials']=recent unless recent.empty?
      bytes=JSON.generate('schema'=>2,'settings'=>settings)
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
      # Punto 26: the chosen scope carries its own authorization when absent.
      options=options.merge('allowShared'=>options['scope']=='all') unless options.key?('allowShared')
      if options['immediate']==true || options['immediatePiece']==true
        scoped=(options['scope']=='unique' && options['allowShared']!=true) || (options['scope']=='all' && options['allowShared']==true)
        raise ExportError,'No se puede pintar esta instancia con seguridad.' unless scoped && options['side']=='both' && options['batch']!=true
      end
      raise ExportError,'Elegí 1, 2 opuestos o 4 cantos.' if options.key?('edgeCount') && !(options['edgeCount'].is_a?(Integer) && [1,2,4].include?(options['edgeCount']))
      raise ExportError,'Elegí pieza o cara.' if options.key?('paintScope') && !%w[piece face].include?(options['paintScope'])
      %w[allowShared batch immediate immediatePiece].each do |key|
        raise ExportError,'Configuración de pintado inválida.' if options.key?(key) && ![true,false].include?(options[key])
      end
      JSON.parse(JSON.generate(options))
    end

    # Tab in the immediate Tool: last catalog material of the destination mode,
    # resolved to this model's UUID without installing. nil when none is known.
    def smart_switch_mode(mode)
      raise ExportError,'Modo rápido inválido.' unless %w[sheet edge].include?(mode)
      last=(smart_settings['lastMaterials'] || {})[mode]
      return nil if last.to_s.empty?
      options,=smart_quick_options({'mode'=>mode,'catalogId'=>last},install:false)
      remember_smart_settings(options);@quick_options=options
      options
    end

    # QA integración (Hito 7 × Hito 2): an archived item leaves the paint palette
    # unless this model already uses it. A broken archive index never hides the palette.
    def without_archived(catalog,visuals)
      archived=begin
        management_library.archived_ids
      rescue StandardError => error
        warn("Planos Santo: no se pudo leer el índice de fichas archivadas: #{error.class}")
        []
      end
      return catalog if archived.empty? || !catalog['items'].is_a?(Array)
      used=(visuals['materials'] || []).filter_map { |material| material.is_a?(Hash) ? material.dig('binding','catalogId') : nil }
      catalog.merge('items'=>catalog['items'].reject { |item| archived.include?(item['id']) && !used.include?(item['id']) })
    end

    # Hito 7 (PINTURA-04/07): material chosen from the view (recents strip or
    # eyedropper). Same validation as the palette, but never installs.
    # PINTURA-14: the palette shows the model's real X-ray state even without a Tool.
    def smart_view_state
      state=smart_state
      return state if state.key?('transparency') || !@model.respond_to?(:rendering_options)
      value=@model.rendering_options['ModelTransparency']
      [true,false].include?(value) ? state.merge('transparency'=>value) : state
    rescue StandardError
      state
    end

    def smart_select_material(catalog_id,mode)
      raise ExportError,'Modo rápido inválido.' unless %w[sheet edge].include?(mode)
      raise ExportError,'Elegí un material de la paleta.' unless catalog_id.is_a?(String) && !catalog_id.empty?
      options,=smart_quick_options({'mode'=>mode,'catalogId'=>catalog_id},install:false)
      remember_smart_settings(options);@quick_options=options
      options
    end

    # Pintura en vista: a session for the active model without scanning. If the
    # operator moved to another model, the brush follows it (the guide editor is
    # told its analysis is out of date) unless that guide has unsaved edits.
    def ensure_paint_context!
      observe_context
      model=Sketchup.active_model
      raise ExportError,'Abrí un modelo antes de pintar.' unless model
      moved=@session && (@context_invalid || !model.equal?(@model))
      if @session.nil? || moved
        raise ExportError,'Cambió el modelo activo y la guía tiene cambios sin guardar. Guardala o descartala antes de pintar en este modelo.' if moved && @dirty
        @model=model;@context_invalid=false;@session=NativeSession.new(@model)
        if moved
          @naming=nil;@paint=nil
          emit_to(@dialog,'planos-santo-document-invalidated',{'scanRequired'=>true}) if @dialog
        end
      end
      watch_model!
    end

    def paint_status(text)
      Sketchup.status_text=text if Sketchup.respond_to?(:status_text=)
    rescue StandardError
      nil
    end

    # The last material of the mode when it is ready in this model (never
    # installs); otherwise the brush starts without material.
    def paint_in_view_options(action)
      remembered=smart_settings
      if action=='remove_edge'
        options,=smart_quick_options(remembered.except('scope','catalogId').merge('mode'=>'remove_edge'),install:false)
        return options
      end
      data={'mode'=>action}
      data['edgeCount']=remembered['edgeCount'] if action=='edge' && [1,2,4].include?(remembered['edgeCount'])
      last=(remembered['lastMaterials'] || {})[action]
      last=remembered['catalogId'] if last.to_s.empty? && remembered['mode']==action
      unless last.to_s.empty?
        begin
          options,=smart_quick_options(data.merge('catalogId'=>last),install:false)
          return options
        rescue ExportError
          nil # not ready in this model: chosen again in the view
        end
      end
      options,=smart_quick_options(data,install:false,allow_empty:true)
      options
    end

    # Library materials of the mode that the brush can use: ready (bound in this
    # model) first, then installable ones. Archived items stay out unless used here.
    def smart_swatches(mode)
      return [] unless %w[sheet edge].include?(mode)
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      natives=@model.respond_to?(:materials) ? @model.materials.to_a : []
      by_uuid={};used=[]
      natives.each do |material|
        binding=MaterialResolver.observe_binding(material)['binding']
        next unless binding
        by_uuid[binding['uuid']]=material;used << {'binding'=>{'catalogId'=>binding['catalogId']}}
      end
      catalog=without_archived(CatalogStore.new(directory:directory).read,{'materials'=>used})
      states=paint_materials.states
      rows=(catalog['items'] || []).filter_map do |item|
        next unless item.is_a?(Hash) && item['kind']==mode
        state=states[item['id']]
        next unless state.is_a?(Hash) && %w[ready installable].include?(state['state'])
        ready=state['state']=='ready'
        native=ready && by_uuid[state['materialUuid'].to_s]
        color=native && native.respond_to?(:color) && native.color
        rgb=color && (color.respond_to?(:red) ? [color.red,color.green,color.blue] : color.to_a.first(3))
        {'catalogId'=>item['id'],'materialUuid'=>ready ? state['materialUuid'].to_s : '','name'=>item['name'].to_s,
         'color'=>rgb.is_a?(Array) && rgb.length==3 ? rgb.map { |value| value.to_i.clamp(0,255) } : nil,'state'=>state['state']}
      end
      rows.sort_by { |row| [row['state']=='ready' ? 0 : 1,row['name'].downcase] }
    rescue StandardError => error
      warn("Planos Santo: no se pudieron leer las muestras de la vista: #{error.class}")
      []
    end

    # A swatch click is the explicit choice: installs in this model when needed
    # (Hito 1 auto-install), without opening any window.
    def smart_pick_material(catalog_id,mode)
      raise ExportError,'Modo rápido inválido.' unless %w[sheet edge].include?(mode)
      raise ExportError,'Elegí un material.' unless catalog_id.is_a?(String) && !catalog_id.empty?
      options,prepared=without_model_watch { smart_quick_options({'mode'=>mode,'catalogId'=>catalog_id},install:true) }
      remember_smart_settings(options);@quick_options=options
      notify_material_library_changed('paint_install') if prepared && prepared['installed']
      options
    end

    # SketchUp's Materials tray: a material bound to a library item becomes the
    # brush material (switching to its mode); anything else explains why not.
    def smart_native_material(material)
      name=(material.respond_to?(:display_name) ? material.display_name : material.name).to_s
      observed=MaterialResolver.observe_binding(material)
      binding=observed['binding']
      unless observed['status']=='valid' && binding.is_a?(Hash) && binding['catalogId'].is_a?(String)
        raise ExportError,"«#{name}» tiene un vínculo dañado con la biblioteca; revisalo en Materiales." if observed['status']=='invalid'
        raise ExportError,"«#{name}» no está en la biblioteca de Planos Santo; elegí una muestra de la tira o agregalo en Materiales."
      end
      mode=binding['kind']
      raise ExportError,"«#{name}» no es una placa ni un canto." unless %w[sheet edge].include?(mode)
      smart_select_material(binding['catalogId'],mode)
    end

    # Recents strip: remembered ids of the mode that are ready in THIS model, with
    # the catalog name and the native colour [r,g,b]. Never installs; a failing
    # item is skipped so one broken entry never hides the others.
    def smart_recent_materials(mode)
      return [] unless %w[sheet edge].include?(mode)
      ids=(smart_settings['recentMaterials'] || {})[mode] || []
      return [] if ids.empty?
      directory=ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      service=paint_materials;items=CatalogStore.new(directory:directory).read['items'] || []
      natives=@model.respond_to?(:materials) ? @model.materials.to_a : []
      ids.filter_map do |id|
        state=service.state(id)
        next unless state.is_a?(Hash) && state['state']=='ready' && !state['materialUuid'].to_s.empty?
        item=items.find { |row| row['id']==id && row['kind']==mode }
        next unless item
        native=natives.find { |material| MaterialResolver.observe_binding(material).dig('binding','uuid')==state['materialUuid'] }
        next unless native && native.respond_to?(:color) && native.color
        color=native.color;rgb=color.respond_to?(:red) ? [color.red,color.green,color.blue] : color.to_a.first(3)
        next unless rgb.length==3 && rgb.all? { |value| value.is_a?(Numeric) }
        {'catalogId'=>id,'materialUuid'=>state['materialUuid'].to_s,'name'=>item['name'].to_s,'color'=>rgb.map { |value| value.to_i.clamp(0,255) }}
      rescue StandardError
        nil
      end
    rescue StandardError => error
      warn("Planos Santo: no se pudieron leer los materiales recientes: #{error.class}")
      []
    end

    # One click-time log per process; its folder is the Planos Santo data folder.
    def smart_timing
      @smart_timing ||= PaintTimingLog.new(directory:begin
        ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
      rescue StandardError
        nil # memory only; diagnostics must never fail because of the log
      end)
    end

    def smart_event(event)
      @smart_state=(@smart_state || {}).merge(event)
      if event['changed']==true
        @smart_changed=true
        @session=NativeSession.new(@model)
        @naming=nil
        @paint=nil
        # QA integración: the Tool commits outside handle(), so ModelWatch sees
        # it. Mark the own write now: the debounced check then skips the walk
        # and the banner says «Pintaste…», not «El modelo cambió en SketchUp».
        mark_stale('paint') unless @analysis_stale && @analysis_reason=='paint'
      end
      begin
      [@dialog,@palette_dialog].compact.uniq.each { |window| emit_to(window,'planos-santo-smart-paint',smart_state) }
      emit_to(@dialog,'planos-santo-document-invalidated',{'scanRequired'=>true}) if event['changed']==true
      rescue StandardError => error
        warn("Planos Santo: no se pudo actualizar la paleta: #{error.class}")
      end
    end

    # in_view: the toolbar brush never waits for the guide to be saved.
    # 0.8.17 (cortes): nor for open library/order edits while it only paints
    # with a material already in the model (the guard runs on every mouse move,
    # so an unsaved library edit froze the brush). Installing a material from
    # the strip (install:true) writes the library and still waits for them.
    def tool_guard!(generation,in_view=false,install:false)
      raise ExportError,'La herramienta se canceló. Volvé a activarla desde la paleta.' unless generation==(@tool_generation || 0)
      active!
      return clean_for_paint! unless in_view
      raise ExportError,'Guardá los cambios de biblioteca o pedido antes de instalar un material.' if install && @workshop_dirty
    end

    # The immediate brush (toolbar or palette) is painting right now.
    def brush_running?
      smart_state['active']==true && @smart_tool.respond_to?(:immediate?) && @smart_tool.immediate? && !(defined?(PieceHighlightTool) && @smart_tool.is_a?(PieceHighlightTool))
    rescue StandardError
      false
    end

    def in_view_brush?
      @smart_in_view==true && brush_running?
    end

    # Actions that write the model or the library: the brush stops by itself
    # (0.8.17). Read-only ones (generate, pdf, names_preview) keep it painting,
    # so the automatic refresh of the guides after a click never stops it.
    BRUSH_STOPPING_ACTIONS=%w[material_photo_pick material_photo_create material_photo_install skm_preview skm_commit skm_install
      save names_apply catalog_save catalog_add catalog_import catalog_import_model catalog_bind catalog_install order_save
      order_export paint_preview paint_apply].freeze
    def stop_brush_for!(action)
      return nil unless @smart_state && @smart_state['active'] && @smart_state['mode']!='highlight'
      result=stop_smart_tool
      paint_status('Pintura detenida para continuar con lo que pediste. Volvé a tocar Pintar cuando quieras.')
      warn("Planos Santo: pincel detenido automáticamente para #{action}.") if $VERBOSE
      result
    end

    def stop_smart_tool(refresh:true)
      tool=@smart_tool
      @smart_tool=nil;@smart_in_view=false
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

    # --- Hito 7: gestión de materiales (bloque aislado del dispatch) ----------
    # Duplicate/archive/package/texture/OCL-sync/focus. Never paints or touches
    # the smart paint tool; mutations are refused while it is active.
    MATERIAL_MANAGEMENT_ACTIONS=%w[material_extras material_duplicate material_archive
      material_package_export material_package_preview material_package_commit material_package_cancel
      material_texture_preview material_texture_apply material_ocl_sync viewport_focus].freeze
    MATERIAL_MANAGEMENT_READONLY=%w[material_extras material_package_cancel viewport_focus].freeze
    def material_management_directory
      ENV['PLANOS_SANTO_DATA_DIR'] || CatalogStore.default_directory
    end
    def management_library
      directory=material_management_directory
      MaterialLibrary.new(@model,catalog:CatalogStore.new(directory:directory),directory:directory)
    end
    def material_package
      directory=material_management_directory
      catalog=CatalogStore.new(directory:directory)
      @material_package ||= MaterialPackage.new(library:MaterialLibrary.new(@model,catalog:catalog,directory:directory),catalog:catalog,directory:directory)
    end
    def material_management(action,data)
      raise ExportError,'Datos de la acción inválidos.' unless data.is_a?(Hash)
      stop_brush_for!(action) unless MATERIAL_MANAGEMENT_READONLY.include?(action)
      case action
      when 'viewport_focus'
        # Best effort (MATERIALES-19): Sketchup.focus exists only in recent APIs.
        if defined?(Sketchup) && Sketchup.respond_to?(:focus)
          Sketchup.focus
          {'focused'=>true,'method'=>'Sketchup.focus'}
        else
          {'focused'=>false,'method'=>'unsupported'}
        end
      when 'material_extras'
        active!
        management_library.extras
      when 'material_duplicate'
        active!;clean_for_paint!
        management_library.duplicate(data)
      when 'material_archive'
        active!;clean_for_paint!
        management_library.archive_items(data)
      when 'material_package_export'
        active!
        ids=data['catalogIds']
        raise ExportError,'Selección de fichas inválida.' unless ids.nil? || ids.is_a?(Array)
        target=with_user_dialog { UI.savepanel('Exportar paquete de materiales',nil,'PlanosSanto-materiales.zip') }
        return {'cancelled'=>true} unless target
        target+='.zip' unless target.downcase.end_with?('.zip')
        material_package.export(target,catalog_ids:ids,include_archived:data['includeArchived']==true)
      when 'material_package_preview'
        active!;clean_for_paint!
        path=with_user_dialog { UI.openpanel('Importar paquete de materiales',nil,'Paquete de materiales ZIP|*.zip||') }
        return {'cancelled'=>true} unless path
        active!
        @material_package=nil
        material_package.preview(path)
      when 'material_package_commit'
        active!;clean_for_paint!
        raise ExportError,'Elegí primero un paquete para revisar.' unless @material_package
        result=material_package.commit(data['token'],data['selectedIds'],data['revision'],confirmed:data['confirmed']==true,renames:data.fetch('renames',{}))
        @material_package=nil
        result
      when 'material_ocl_sync'
        active!
        clean_for_paint! unless data['dryRun']==true
        result=management_library.ocl_sync(data)
        result['changed'].to_i>0 ? refresh_after_material_change(result) : result
      when 'material_texture_preview'
        active!
        photo_material.texture_preview(data)
      when 'material_texture_apply'
        active!;clean_for_paint!
        refresh_after_material_change(photo_material.texture_apply(data))
      when 'material_package_cancel'
        @material_package&.cancel
        @material_package=nil
        {'cancelled'=>true}
      else
        raise ExportError,'Acción de materiales no disponible.'
      end
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
      return unless @analysis_session && @dialog
      # No baseline (fingerprint failed at scan): be conservative on any change.
      return mark_stale('model') unless @analysis_fingerprint || @analysis_stale
      return unless @analysis_fingerprint
      # Already stale and the analyzed session was replaced (own write): it can
      # only become fresh by reanalyzing, so skip the walk (painting bursts).
      return if @analysis_stale && !@analysis_session.equal?(@session)
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
