# frozen_string_literal: true
require 'json'
require 'time'
require 'fileutils'

module PlanosSanto
  # Public SketchUp Tool. Hover, picking and queued selection never write model
  # state. Only the service executes one confirmed, reversible operation.
  # Hover-time aptitude (PINTURA-08): geometry is evaluated once per definition,
  # transaction generation, mode, edge count, physical scale and pointed side.
  # It never writes, never reads the catalog and never hashes files.
  class PaintVerdict
    attr_reader :calls,:native
    def initialize(native);@native=native;@cache={};@calls=0;end
    def available?;!@native.nil?;end
    def node_for(target)
      instances=target['_instances'];{'_entity'=>instances.last,'_parents'=>instances[0...-1],'id'=>target['pieceId']}
    end
    def scales(instances)
      m=instances.inject(Geom::Transformation.new) { |world,entity| world*entity.transformation }.to_a
      [m[0,3],m[4,3],m[8,3]].map { |axis| Math.sqrt(axis.sum { |v| v*v }).round(3) }
    end
    NO_SHEET='Canto sin placa: pintá primero la placa de esta pieza.'
    LOCKED='La pieza o un contenedor está bloqueado.'
    def inherited(instances);instances.reverse.find { |entity| entity.respond_to?(:material) && entity.material }&.material;end
    def for(target,mode:,edge_count:,generation:)
      instances=target['_instances'];entity=instances.last
      return {'ok'=>false,'reason'=>LOCKED,'expandedFaceIds'=>[],'faces'=>[]} if instances.any? { |e| e.respond_to?(:locked?) && e.locked? }
      inherited=mode=='edge' ? inherited(instances) : nil
      key=[entity.definition.guid.to_s,generation,mode,edge_count,scales(instances),mode=='sheet' ? nil : target['faceIds'].first,inherited&.object_id]
      @cache.clear if @cache.length>500
      @frames={} unless @frames_generation==generation
      @frames_generation=generation
      @cache[key] ||= compute(node_for(target),target['_face'],mode,edge_count,inherited)
    end
    def sheet?(material)
      material && defined?(MaterialResolver) && MaterialResolver.observe_binding(material).dig('binding','kind')=='sheet'
    end
    def compute(node,face,mode,count,inherited)
      @calls+=1
      axes=@native.automatic_axes(node);memo=@frames ||= {}
      faces=@native.expanded_faces(node,[face],mode=='sheet' ? {'mode'=>'sheet','axes'=>axes,'paintScope'=>'piece',memo:memo} : {'mode'=>mode,'axes'=>axes,'edgeCount'=>count,memo:memo})
      if mode=='edge'
        # F-PINT-B: an edge needs a recognized sheet on a broad face (own or inherited).
        broad=begin
          @native.expanded_faces(node,[face],{'mode'=>'sheet','axes'=>axes,'paintScope'=>'piece',memo:memo})
        rescue ExportError
          @native.faces(node)-faces
        end
        raise ExportError,NO_SHEET unless broad.any? { |f| sheet?(f.material || inherited) || sheet?(f.back_material || inherited) }
      end
      {'ok'=>true,'reason'=>nil,'expandedFaceIds'=>faces.map { |f| @native.face_id(f) },'faces'=>faces,'axes'=>axes}
    rescue ExportError=>error
      {'ok'=>false,'reason'=>error.message,'expandedFaceIds'=>[],'faces'=>[]}
    end
  end

  # PINTURA-09: cost of each immediate click (hit + verdict + apply). A ring of
  # 200 entries in memory plus one JSONL line per click, rotated to .1 past 512 KB.
  class PaintTimingLog
    RING=200
    MAX_BYTES=512*1024
    attr_reader :entries
    def initialize(directory:);@directory=directory;@entries=[];end
    def path;@directory && File.join(@directory,'diagnostico','pincel-tiempos.jsonl');end
    def record(entry)
      @entries << entry;@entries.shift while @entries.length>RING
      write(entry);entry
    end
    def write(entry)
      return unless path
      FileUtils.mkdir_p(File.dirname(path))
      if File.file?(path) && File.size(path)>MAX_BYTES
        File.delete(path+'.1') if File.exist?(path+'.1')
        File.rename(path,path+'.1')
      end
      File.open(path,'a') { |file| file.write(JSON.generate(entry)+"\n") }
    rescue StandardError=>error
      warn("Planos Santo pincel: no se pudo registrar el tiempo del clic (#{error.class}).")
    end
    def summary
      values=@entries.map { |entry| entry['ms'] }.compact.sort
      return {'count'=>0,'p50'=>nil,'p95'=>nil,'max'=>nil,'last'=>nil} if values.empty?
      rank=lambda { |p| values[[(p*values.length).ceil-1,0].max] }
      {'count'=>values.length,'p50'=>rank.call(0.5),'p95'=>rank.call(0.95),'max'=>values.last,'last'=>@entries.last}
    end
  end

  # Minimal ModelObserver: only counts transactions, never walks the model.
  class PaintGenerationObserver
    def initialize(&block);@bump=block;end
    def onTransactionCommit(_model);@bump.call;end
    def onTransactionUndo(_model);@bump.call;end
    def onTransactionRedo(_model);@bump.call;end
    def onTransactionAbort(_model);@bump.call;end
    def onTransactionEmpty(_model);@bump.call;end
  end
  # Pintura en vista: SketchUp's Materials tray -> brush material. Duck-typed
  # MaterialsObserver (SketchUp calls onMaterialSetCurrent on any object).
  class PaintMaterialsObserver
    def initialize(&block);@callback=block;end
    def onMaterialSetCurrent(_materials,material);@callback.call(material);end
  end

  # Copies of each definition in the model, rebuilt once per transaction
  # generation. Walks instances only (never faces) and never writes.
  class OccurrenceIndex
    LIMIT=20000
    attr_reader :builds
    def initialize(model,limit:LIMIT);@model=model;@limit=limit;@builds=0;@truncated=false;end
    # Past the limit the index is partial: counts are a lower bound ("N+").
    def truncated?;@truncated;end
    def paths(definition,generation)
      build(generation) unless @paths && @generation==generation
      @paths[definition] || []
    end
    # F-PINT-C: every instance path of the generation, in model order.
    def all_paths(generation)
      build(generation) unless @paths && @generation==generation
      @paths.values.flatten(1)
    end
    def build(generation)
      @generation=generation;@builds+=1;@paths={}.compare_by_identity;@truncated=false;count=0
      walk=lambda do |entities,prefix|
        entities.each do |entity|
          next unless entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
          return @truncated=true if (count+=1)>@limit
          path=prefix+[entity];(@paths[entity.definition] ||= []) << path
          walk.call(entity.is_a?(Sketchup::Group) ? entity.entities : entity.definition.entities,path) if prefix.length<32
        end
      end
      walk.call(@model.entities,[])
    end
  end

  class SmartPaintTool
    SHIFT_MASK = Object.const_defined?(:CONSTRAIN_MODIFIER_MASK) ? Object.const_get(:CONSTRAIN_MODIFIER_MASK) : 4
    CTRL_MASK = Object.const_defined?(:COPY_MODIFIER_MASK) ? Object.const_get(:COPY_MODIFIER_MASK) : 8
    EDGE_COUNTS=[1,2,4].freeze
    attr_reader :queued_targets,:verdicts,:generation

    HOVER_INTERVAL=0.1
    # Hito 7 callbacks (nil = feature off): select_material.(catalog_id,'sheet'|'edge')
    # -> complete immediate options without installing (ExportError if not ready);
    # recents.(mode) -> up to 6 ready materials; eyedropper_key 'alt'|'shift'.
    # Pintura en vista (toolbar, no windows): swatches.(mode) -> library materials
    # usable for the mode (ready or installable); pick_material.(catalog_id,mode)
    # -> options, installing when needed (an explicit choice); native_material.(material)
    # -> options for a material chosen in SketchUp's Materials tray (ExportError if unusable).
    def initialize(model, service:, options:, on_event:, guard:, remember:nil, switch_mode:nil, clock:nil, timing:nil, select_material:nil, recents:nil, eyedropper_key:nil, swatches:nil, pick_material:nil, native_material:nil)
      @model=model;@service=service;@on_event=on_event;@guard=guard;@remember=remember;@switch_mode=switch_mode;@timing=timing
      @clock=clock || lambda { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      @options=copy(options);@queued_targets=[];@queued_overlays={};@active=false;@generation=0
      @verdicts=PaintVerdict.new(service.respond_to?(:native) ? service.native : nil);@occurrences=OccurrenceIndex.new(model)
      @copy_triangles=[]
      @select_material=select_material;@recents_source=recents;@recents=[];@eyedropper_key=self.class.eyedropper_key!(eyedropper_key || 'alt')
      @swatches_source=swatches;@pick_material=pick_material;@native_material=native_material;@strip_rows=[]
      @sampling=false;@depth=0;@stack_key=nil;@stack_count=1;@missing=false;@missing_state=nil;@hidden_by_tool=[]
    end
    COPY_DRAW_LIMIT=200
    def scope;@options['scope']=='all' && @options['allowShared']==true ? 'all' : 'unique';end
    def copies_of(target)
      @occurrences.paths(target['_instances'].last.definition,@generation)
    end
    def edge_count;@options['mode']=='sheet' ? 1 : @options.fetch('edgeCount',1);end
    def verdict_for(target)
      return nil unless immediate? && @verdicts.available?
      @verdicts.for(target,mode:@options['mode'],edge_count:edge_count,generation:@generation)
    end
    def copy(value);JSON.parse(JSON.generate(value));end
    def immediate?;@options['immediate']==true || @options['immediatePiece']==true;end
    def observe!
      observe_materials!
      return if @observer || !@model.respond_to?(:add_observer)
      @observer=PaintGenerationObserver.new { @generation+=1 }
      @model.add_observer(@observer)
    rescue StandardError
      @observer=nil
    end
    def unobserve!
      unobserve_materials!
      return unless @observer
      @model.remove_observer(@observer) if @model.respond_to?(:remove_observer)
      @observer=nil # only once removed: a failed removal is retried, never leaked
    rescue StandardError
      nil
    end
    # Pintura en vista: SketchUp's Materials tray chooses the brush material.
    def observe_materials!
      return if @materials_observer || !@native_material || !@model.respond_to?(:materials)
      materials=@model.materials
      return unless materials.respond_to?(:add_observer)
      observer=PaintMaterialsObserver.new { |material| native_material_chosen(material) }
      @materials_observer=observer if materials.add_observer(observer)
    rescue StandardError
      @materials_observer=nil
    end
    def unobserve_materials!
      return unless @materials_observer
      materials=@model.materials
      materials.remove_observer(@materials_observer) if materials.respond_to?(:remove_observer)
      @materials_observer=nil
    rescue StandardError
      nil
    end
    def in_view?;!@swatches_source.nil?;end
    def material_missing?;%w[sheet edge].include?(@options['mode']) && @options['materialUuid'].to_s.empty?;end
    NO_MATERIAL='Elegí un material: clic en una muestra de la tira de abajo o en la bandeja Materiales de SketchUp.'.freeze
    # 0.8.17 (cortes): choosing a material in SketchUp's Materials tray also
    # selects SketchUp's own Paint Bucket, which deactivates this Tool. The tray
    # choice is not «choosing another tool»: when it is a usable library material
    # the brush adopts it and selects itself again. TRAY_GRACE covers both orders
    # of SketchUp's callbacks (tray before or after the deactivation).
    TRAY_GRACE=1.5
    def tray_grace?
      !@stopped && @deactivated_at && @clock.call-@deactivated_at<=TRAY_GRACE
    end
    def native_material_chosen(material)
      return false unless @native_material && immediate? && material && (@active || tray_grace?)
      verify_guard!
      options=@native_material.call(material)
      raise ExportError,'No se pudo usar ese material para pintar.' unless options.is_a?(Hash) && %w[sheet edge].include?(options['mode'])
      adopt_options!(options)
      @tray_pick_at=@clock.call
      reselect! unless @active # the Paint Bucket already took over: come back
      name=(material.respond_to?(:display_name) ? material.display_name : material.name).to_s
      emit("Material activo: #{name} (bandeja Materiales). Hacé clic en una pieza.")
      invalidate(@model.active_view) if @model.respond_to?(:active_view)
      true
    rescue StandardError=>error
      emit('No se cambió el material.',error:error.is_a?(ExportError) ? error.message : 'No se pudo usar el material de la bandeja.')
      false
    end
    # Selects this same Tool again on the next tick (never from inside a
    # SketchUp callback), unless it was stopped or the model changed meanwhile.
    def reselect!
      return false if @stopped || @reselect_scheduled || !@model.respond_to?(:select_tool)
      action=lambda do
        @reselect_scheduled=false
        next if @stopped || @active
        next if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && !Sketchup.active_model.equal?(@model)
        @model.select_tool(self)
      end
      if defined?(UI) && UI.respond_to?(:start_timer)
        @reselect_scheduled=true;UI.start_timer(0,false) { action.call }
      else
        action.call
      end
      true
    rescue StandardError
      @reselect_scheduled=false;false
    end
    def activate
      @stopped=false;@deactivated_at=nil
      observe!
      @generation+=1 # transactions while inactive were not observed
      refresh_recents!
      @active=true
      return emit(NO_MATERIAL) if immediate? && in_view? && material_missing?
      emit(immediate? ? 'Hacé clic en una pieza para pintar. Escape termina.' : 'Elegí una cara. Mayús agrega caras; Enter aplica la selección. Esc cancela.')
    end
    def deactivate(view)
      @deactivated_at=@clock.call
      tray=!@stopped && @tray_pick_at && @deactivated_at-@tray_pick_at<=TRAY_GRACE
      # In the view the tray observer outlives the deactivation for TRAY_GRACE, so
      # a tray choice that arrives after SketchUp's tool switch is still seen.
      keep=in_view? && !@stopped && @materials_observer && defined?(UI) && UI.respond_to?(:start_timer)
      if keep
        @model.remove_observer(@observer) if @observer && @model.respond_to?(:remove_observer)
        @observer=nil
        UI.start_timer(TRAY_GRACE,false) { unobserve_materials! unless @active }
      else
        unobserve!
      end
      stop_sampling;@depth=0;@stack_key=nil;@active=false;@ui_hover=nil;@bar_hover=nil;@strip_hover=nil;clear
      release_textures(view)
      if tray
        @tray_pick_at=nil
        emit('Material elegido en la bandeja; el pincel vuelve a activarse.')
        reselect!
      else
        emit('Herramienta desactivada.')
      end
      invalidate(view)
    end
    def suspend(view)
      emit('Cuentagotas cerrado; volvé a sostener la tecla para tomar un material.') if stop_sampling
      invalidate(view)
    end
    def resume(view);invalidate(view);end
    def update_options(options)
      stop_sampling;@options=copy(options);clear;@last_error=nil;@missing_results=nil;refresh_recents!;emit(immediate? ? 'Material activo. Hacé clic en otra pieza; Escape termina.' : 'Configuración actualizada; elegí nuevamente las caras.')
    end
    def status
      {'active'=>@active,'mode'=>@options['mode'],'hover'=>@hover && copy(@hover),'queuedCount'=>@queued_targets.sum { |target| target['faceIds'].length },'options'=>@options.slice('mode','paintScope','edgeCount','immediate','immediatePiece','catalogId','materialUuid','side','scope','axes','batch'),
       'sampling'=>@sampling==true,'missing'=>missing_summary,'transparency'=>transparency,'recents'=>copy(@recents || []),'eyedropperKey'=>@eyedropper_key}
    end
    # hover:true -> limited (F-ARQ-B): only on a new signature and >=100 ms
    # after the previous hover event, else pending until a timer or the next
    # event. hover::clear -> deduplicated but immediate. Anything else
    # (clicks, errors, options, activate/stop) is sent at once and drops the pending.
    def emit(message,error:nil,changed:nil,hover:false,extra:nil)
      event=status.merge(extra || {}).merge('message'=>message)
      event['error']=error if error || immediate?
      event['changed']=changed unless changed.nil?
      @last_error=error if error && !hover
      status_text!
      return event unless @on_event
      signature=signature(event)
      if hover
        if signature==@sent_signature
          @pending=nil;return event
        end
        if hover==true
          now=@clock.call
          if @hover_sent_at && now-@hover_sent_at<HOVER_INTERVAL
            @pending=event;schedule_flush;return event
          end
          @hover_sent_at=now
        end
      end
      @pending=nil;@sent_signature=signature
      @on_event.call(event)
      event
    end
    def signature(event)
      hover=event['hover'] || {};verdict=hover['verdict'] || {}
      [event['message'],event['error'],hover['pieceId'],hover['faceId'],hover['sharedCount'],hover['sharedTruncated'],verdict['ok'],verdict['reason'],hover['edgeCount'],hover['scope'],event['mode'],
       event['sampling'],hover['depth'],(event['missing'] || {})['withoutSheet']]
    end
    def schedule_flush
      return if @flush_scheduled || !(defined?(UI) && UI.respond_to?(:start_timer))
      @flush_scheduled=true
      UI.start_timer(HOVER_INTERVAL,false) { @flush_scheduled=false;flush_pending }
    rescue StandardError
      @flush_scheduled=false
    end
    def flush_pending
      event=@pending;@pending=nil
      return unless event && @on_event
      @hover_sent_at=@clock.call;@sent_signature=signature(event)
      @on_event.call(event)
    end
    # ---- In-view feedback (ARQ-10 stage 1): status bar, tooltip, color, cursor.
    def scope_label(count=nil,truncated=false)
      return scope=='all' ? 'Todas las iguales' : 'Solo esta' unless count
      count="#{count}+" if truncated
      scope=='all' ? "Todas las iguales (#{count})" : "Solo esta (de #{count})"
    end
    def mode_short
      @options['mode']=='sheet' ? 'Pieza' : @options['mode']=='remove_edge' ? 'Quitar canto' : edge_label(edge_count)
    end
    # Name/color of the active native material by its UUID; no catalog I/O.
    def material_info
      uuid=@options['materialUuid']
      return nil if uuid.to_s.empty? || !@model.respond_to?(:materials) || !defined?(MaterialResolver)
      key=[uuid,@generation]
      return @material_info[1] if @material_info && @material_info[0]==key
      material=@model.materials.to_a.find { |m| MaterialResolver.observe_binding(m).dig('binding','uuid')==uuid }
      info=material && {'name'=>(material.respond_to?(:display_name) ? material.display_name : material.name).to_s,'color'=>material.color}
      @material_info=[key,info];info
    rescue StandardError
      nil
    end
    def status_text!
      return unless immediate? && defined?(Sketchup) && Sketchup.respond_to?(:status_text=)
      label=MODE_LABELS[@options['mode']].to_s
      label+=" · #{edge_label(edge_count)}" if @options['mode']=='edge'
      info=material_info
      parts=[label,info ? info['name'] : (@options['mode']=='remove_edge' ? 'Restaura la placa' : 'Sin material'),@hover ? scope_label(@hover['sharedCount'],@hover['sharedTruncated']) : scope_label(@shared_count,@shared_truncated)]
      parts << "último error: #{@last_error}" if @last_error
      text=parts.join(' · ')
      return if text==@status_text
      @status_text=text;Sketchup.status_text=text
    rescue StandardError
      nil
    end
    def rgba(color,alpha)
      rgb=color.respond_to?(:red) ? [color.red,color.green,color.blue] : color.to_a.first(3)
      begin
        Sketchup::Color.new(*rgb.map(&:to_i),alpha)
      rescue ArgumentError,TypeError
        rgb.map(&:to_i)+[alpha]
      end
    end
    def blocked?;@hover && @hover['verdict'] && @hover['verdict']['ok']==false;end
    def hover_color(alpha)
      return rgba([220,30,30],alpha) if blocked?
      info=material_info
      info && info['color'] ? rgba(info['color'],alpha) : 'orange'
    end
    def ui_scale;defined?(UI) && UI.respond_to?(:scale_factor) ? UI.scale_factor.to_f : 1.0;end
    def point_class;defined?(Geom::Point3d) ? Geom::Point3d : Sketchup::Point;end
    # 0.8.20: the tooltip is a dark box (the bar's colours) with light text, at
    # TEXT_SIZE, beside the cursor badge (34 logical px from the hot spot) and
    # kept inside the view. Without draw2d (doubles, very old API) only the
    # text is drawn, in the 0.8.19 dark colours.
    TIP_OFFSET=34
    TIP_PAD=8
    def tooltip_lines(boxed)
      plain=boxed ? LIGHT_TEXT : [30,30,30];good=boxed ? [134,222,146] : [0,128,0];bad_rgb=boxed ? [255,138,128] : [200,0,0]
      if @strip_hover && (row=@strip_rows[@strip_hover])
        text="#{row['name']} · clic#{@strip_hover<@recents.length ? " o #{@strip_hover+1}" : ''}"
        text+=' · se instala al elegirlo' if row['state']=='installable'
        return [[text,plain]]
      end
      return [[bar_hint(@bar_hover),plain]] if @bar_hover
      return [] unless @hover
      info=material_info;sample=@hover['sample']
      line1=[@hover['name'].to_s.empty? ? 'Pieza sin nombre' : @hover['name'],sample ? 'Cuentagotas' : mode_short]
      line1 << scope_label(@hover['sharedCount'],@hover['sharedTruncated']) unless sample
      line1=line1.join(' · ')
      depth=@hover['depth'];line1+=" (#{depth['index']+1} de #{depth['count']} · ↑/↓)" if depth # PINTURA-11
      bad=sample ? sample['status']!='valid' : blocked?
      line2=if sample then bad ? @sample_reason.to_s : "Tomar: #{sample['name']}"
            else blocked? ? @hover['verdict']['reason'].to_s : info ? info['name'] : (@options['mode']=='remove_edge' ? 'Restaura la placa' : 'Sin material')
            end
      lines=[[line1,plain],[line2,bad ? bad_rgb : good]]
      line3=missing_line(@hover['pieceId']) # F-PINT-C
      lines << [line3,line3.start_with?('Falta') ? bad_rgb : good] if line3
      lines
    end
    def draw_tooltip(view)
      return unless immediate? && @mouse && view.respond_to?(:draw_text)
      scale=ui_scale;klass=point_class;boxed=view.respond_to?(:draw2d)
      lines=tooltip_lines(boxed);return if lines.empty?
      line=(em_px(TEXT_SIZE)*1.45).round;pad=(TIP_PAD*scale).round # whole pixels: sharp text
      width=lines.map { |text,_| text_width(view,text) }.max.ceil
      x=(@mouse[0]+TIP_OFFSET*scale).round;y=(@mouse[1]+TIP_OFFSET*scale).round
      # Near the bottom strip or the right edge the tooltip goes above or left
      # of the cursor, inside the view.
      y=(@mouse[1]-12*scale).round-lines.length*line-pad if view.respond_to?(:vpheight) && y+lines.length*line+pad>view.vpheight.to_f
      x=(@mouse[0]-12*scale).round-width-pad if view.respond_to?(:vpwidth) && x+width+pad>view.vpwidth.to_f && @mouse[0]-12*scale-width-pad>=0
      if boxed
        box=[x-pad,y-pad/2,x+width+pad,y+lines.length*line+pad/2]
        fill(view,box,BAND,235);outline(view,box,BAND_LINE,line_px(1))
      end
      lines.each_with_index { |(text,rgb),index| view.draw_text(klass.new(x,y+index*line,0),text,text_options(view).merge(color:text_color(rgb))) }
    rescue StandardError
      nil
    end
    CURSORS={'piece'=>'paint-piece.png','edge'=>'paint-edge.png','remove'=>'paint-remove.png','blocked'=>'paint-blocked.png','sample'=>'paint-sample.png'}.freeze
    # 0.8.20 (cursor «chico y pixelado»): the hot spot of every cursor, in the
    # 32-unit grid of scripts/generate-paint-cursors.py (the crosshair centre).
    # Windows: the SVG (UI.create_cursor takes SVG there since SketchUp 2016,
    # hot spot in 32 units), sharp at any scaling. Without it, the 64 px PNG at
    # UI.scale_factor >= 1.5 (hot spot ×2) or the 32 px one. macOS wants PDF for
    # vectors and Retina handles the scale: the 32 px PNG.
    CURSOR_HOTSPOT=[7,7].freeze
    def self.cursor_file(name)
      base=CURSORS.fetch(name);folder=File.join(__dir__,'cursors');x,y=CURSOR_HOTSPOT
      windows=defined?(Sketchup) && Sketchup.respond_to?(:platform) && Sketchup.platform==:platform_win
      if windows
        svg=File.join(folder,base.sub(/\.png\z/,'.svg'))
        return [svg,x,y] if File.file?(svg)
        scale=defined?(UI) && UI.respond_to?(:scale_factor) ? UI.scale_factor.to_f : 1.0
        large=File.join(folder,base.sub(/\.png\z/,'-64.png'))
        return [large,2*x,2*y] if scale>=1.5 && File.file?(large)
      end
      [File.join(folder,base),x,y]
    end
    # One native cursor per file and per process; nil -> native cursor.
    def self.cursor_id(name)
      @cursor_ids||={}
      path,x,y=cursor_file(name)
      return @cursor_ids[path] if @cursor_ids.key?(path)
      @cursor_ids[path]=defined?(UI) && UI.respond_to?(:create_cursor) && File.file?(path) ? UI.create_cursor(path,x,y) : nil
    rescue StandardError
      @cursor_ids[path]=nil if path
      nil
    end
    def cursor_name
      return 'sample' if @sampling # PINTURA-07
      return 'blocked' if blocked?
      {'sheet'=>'piece','edge'=>'edge','remove_edge'=>'remove'}[@options['mode']]
    end
    def onSetCursor
      name=cursor_name;id=name && self.class.cursor_id(name)
      return false unless id && defined?(UI) && UI.respond_to?(:set_cursor)
      UI.set_cursor(id);true
    rescue StandardError
      false
    end
    def invalidate(view);view.invalidate if view && view.respond_to?(:invalidate);end
    def clear
      @service.cancel
      @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@pick_cache=nil;@triangles=[];@normal_line=[];@copy_triangles=[];@queued_targets=[];@queued_overlays={}
    end
    def verify_guard!
      raise ExportError,'El modelo o la guía cambió. Volvé a abrir el pintado.' if @guard && @guard.call==false
    end
    def instance?(entity)
      entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
    end
    def entities_for(entity)
      entity.is_a?(Sketchup::Group) ? entity.entities.to_a : entity.definition.entities.to_a
    end
    def persistent(entity)
      raise ExportError,'La entidad no tiene identificador persistente.' unless entity.respond_to?(:persistent_id) && entity.persistent_id.to_i>0
      entity.persistent_id.to_s
    end
    # Near a border PickHelper ranks the Edge before its Faces (0.8.8 native
    # V9), so a click there did nothing. The face is then one of THAT edge's own
    # faces: same entities, same instance path, never a neighbour piece behind.
    # Sheet mode paints the whole piece, so either face works; edge mode takes
    # the clearly narrower face only when the other one is a board face (a
    # corner between two board edges stays ambiguous: validation 0.8.10 R1).
    def face_of_edge(picker,path,edge)
      faces=edge.faces.to_a.select { |face| face.is_a?(Sketchup::Face) }
      return nil if faces.empty?
      count=picker.respond_to?(:count) ? picker.count : 1
      ranked=(1...count).filter_map do |index|
        other=picker.path_at(index);other=other.to_a if other.respond_to?(:to_a)
        face=picker.leaf_at(index)
        face if faces.include?(face) && other.is_a?(Array) && other.take_while { |entity| instance?(entity) }==path.take_while { |entity| instance?(entity) }
      end
      return ranked.first || faces.first if @options['mode']=='sheet'
      narrow=faces.min_by(&:area);wide=faces.max_by(&:area)
      owner=path.take_while { |entity| instance?(entity) }.last
      board=owner && entities_for(owner).grep(Sketchup::Face).map(&:area).max
      return narrow if faces.length>1 && board && wide.area>=board*0.5 && narrow.area<wide.area*0.5
      ranked.length==1 ? ranked.first : nil
    end
    STACK_PICKS=32
    DEPTH_CHANGED='Cambió lo que hay bajo el cursor; elegí de nuevo con ↑/↓.'
    # PINTURA-11 (immediate only): the stack of distinct pieces under the cursor,
    # front to back; @depth picks one. Non-immediate tools keep the front face.
    # A click with @depth>0 over a different stack than the last hover never guesses.
    def hit(view,x,y,click:false)
      picker=view.pick_helper;picker.do_pick(x,y)
      return nil if picker.respond_to?(:count) && picker.count.zero?
      active=((@model.respond_to?(:active_path) && @model.active_path) || []).to_a
      first=candidate(picker,0,active,edge:true)
      return first unless immediate?
      stack=first ? [first] : []
      if first && picker.respond_to?(:count)
        (1...[picker.count,STACK_PICKS].min).each do |index|
          next unless picker.leaf_at(index).is_a?(Sketchup::Face)
          target=begin
            candidate(picker,index,active)
          rescue StandardError
            nil
          end
          stack << target if target && stack.none? { |row| row['pieceId']==target['pieceId'] }
        end
      end
      key=stack.map { |row| row['pieceId'] }
      raise ExportError,DEPTH_CHANGED if click && @depth!=0 && key!=@stack_key
      (@stack_key=key;@depth=0) unless key==@stack_key
      @stack_count=[stack.length,1].max
      return nil if stack.empty?
      @depth%=stack.length
      stack[@depth]
    end
    def candidate(picker,index,active,edge:false)
      path=picker.path_at(index);leaf=picker.leaf_at(index)
      path=path.to_a if path.respond_to?(:to_a)
      return nil unless path.is_a?(Array)
      if edge && defined?(Sketchup::Edge) && leaf.is_a?(Sketchup::Edge)
        path=path.dup;path.pop if path.last.equal?(leaf)
        leaf=face_of_edge(picker,path,leaf)
      end
      return nil unless leaf.is_a?(Sketchup::Face)
      path=path.dup
      path << leaf unless path.last.equal?(leaf)
      return nil unless path.last.equal?(leaf) && path[0...-1].all? { |entity| instance?(entity) }
      cache_key=[path,active]
      if immediate? && @pick_cache && (cached=@pick_cache[cache_key])
        return cached if path.all? { |entity| !entity.respond_to?(:valid?) || entity.valid? }
      end
      roots=@model.entities.to_a
      unless roots.include?(path.first)
        raise ExportError,'La cara no tiene una ruta de instancia completa.' if active.empty?
        context=entities_for(active.last)
        raise ExportError,'La ruta seleccionada no pertenece al contexto abierto.' unless context.include?(path.first)
        path=active+path
      end
      if !active.empty? && path[0,active.length]!=active
        raise ExportError,'La cara está fuera del contexto de edición abierto.'
      end
      collection=roots
      path.each_with_index do |entity,index|
        raise ExportError,'Ruta ambigua o modificada; volvé a apuntar a la pieza.' unless collection.include?(entity)
        collection=entities_for(entity) if index<path.length-1
      end
      instances=path[0...-1]
      return nil if instances.empty?
      piece_id=instances.map { |entity| persistent(entity) }.join('/')
      name=instances.last.name.to_s
      name=instances.last.definition.name.to_s if name.empty?
      target={'pieceId'=>piece_id,'faceIds'=>[persistent(leaf)],'_face'=>leaf,'_instances'=>instances,'name'=>name}
      if immediate?
        @pick_cache={} if @pick_cache.nil? || @pick_cache.length>64
        @pick_cache[cache_key]=target
      end
      target
    end
    def service_options(targets)
      allowed=%w[mode side scope axes catalogId materialUuid replacementKind sourceMaterialUuid paintScope edgeCount immediate immediatePiece]
      allowed << 'allowShared' if immediate?
      @options.select { |key,_| allowed.include?(key) }.merge('targets'=>targets)
    end
    def target_data(target);target.slice('pieceId','faceIds');end
    def hover!(target)
      if immediate?
        return sample_hover!(target) if @sampling
        # Pick-local feedback only: no inventory, geometry classification,
        # catalog I/O, UUID validation or mutation until the actual click.
        @target=target;@preview=nil;@copy_triangles=[]
        copies=copies_of(target);@shared_count=[copies.length,1].max;@shared_truncated=@occurrences.truncated?
        @hover={'pieceId'=>target['pieceId'],'faceId'=>target['faceIds'].first,'name'=>target['name'],'side'=>@options['side'],'edgeCount'=>edge_count,'scope'=>scope,'sharedCount'=>@shared_count}
        @hover['sharedTruncated']=true if @shared_truncated
        @hover['depth']={'index'=>@depth,'count'=>@stack_count} if @stack_count>1
        verdict=verdict_for(target)
        if verdict
          @hover['expandedFaceIds']=verdict['expandedFaceIds'];@hover['verdict']={'ok'=>verdict['ok'],'reason'=>verdict['reason']}
          faces=verdict['ok'] ? verdict['faces'] : @options['mode']=='sheet' ? entities_for(target['_instances'].last).grep(Sketchup::Face) : [target['_face']]
          overlay_faces(target,faces)
          if verdict['ok'] && scope=='all'
            main=[@triangles,@normal_line];own=target['_instances']
            copies.reject { |path| path==own }.first(COPY_DRAW_LIMIT).each do |path|
              overlay_faces(target.merge('_instances'=>path),faces);@copy_triangles.concat(@triangles)
            end
            @triangles,@normal_line=main
          end
          emit(verdict['ok'] ? (@options['mode']=='sheet' ? 'Clic para pintar esta pieza. Escape termina.' : 'Clic para pintar este canto. Escape termina.') : 'No se puede pintar acá.',error:verdict['reason'],hover:true)
          return
        end
        if @options['mode']=='sheet'
          triangles=[]
          entities_for(target['_instances'].last).grep(Sketchup::Face).each do |face|
            build_overlay(target.merge('_face'=>face));triangles.concat(@triangles)
          end
          @triangles=triangles;@normal_line=[]
        else
          build_overlay(target)
        end
        emit(@options['mode']=='sheet' ? 'Clic para pintar esta pieza. Escape termina.' : 'Clic para pintar este canto. Escape termina.',hover:true)
        return
      end
      result=@service.preview(service_options([target_data(target)]))
      @target=target;@preview=result
      @hover={'pieceId'=>target['pieceId'],'faceId'=>target['faceIds'].first,'name'=>target['name'],
              'affectedPaths'=>result.fetch('affectedPaths',[]),'faceCount'=>result['faceCount'] || result.fetch('faces',[]).length,
              'sharedCount'=>result['sharedCount'] || result.fetch('affectedPaths',[]).length,'side'=>@options['side']}
      build_preview_overlay(target,result)
      emit((result['warnings'] || []).join(' ').empty? ? 'Cara preparada; revisá la ruta y hacé clic para aplicar.' : result['warnings'].join(' '),hover:true)
    end
    def overlay_faces(target,faces)
      triangles=[];normals=[]
      faces.each { |face| build_overlay(target.merge('_face'=>face));triangles.concat(@triangles);normals.concat(@normal_line) }
      @triangles=triangles;@normal_line=@options['mode']=='sheet' ? [] : normals
    end
    def build_preview_overlay(target,result)
      expanded=result.fetch('expandedTargets',[]).find { |row| row['pieceId']==target['pieceId'] }
      ids=expanded && expanded['faceIds']
      return build_overlay(target) unless ids.is_a?(Array) && !ids.empty?
      faces=entities_for(target['_instances'].last).grep(Sketchup::Face)
      triangles=[];normals=[]
      ids.each do |id|
        face=faces.find { |candidate| persistent(candidate)==id }
        raise ExportError,'Las caras de la vista previa cambiaron.' unless face
        build_overlay(target.merge('_face'=>face));triangles.concat(@triangles);normals.concat(@normal_line)
      end
      @triangles=triangles;@normal_line=normals
      @hover['expandedFaceIds']=ids if @hover
    end
    def onMouseMove(_flags,x,y,view)
      @mouse=[x,y];key=nil
      # Pintura en vista (0.8.17): the bars and the strip are resolved BEFORE the
      # guard and the model pick; over them there is no piece pick at all.
      if (item=ui_item(view,x,y))
        @ui_hover=item;@bar_hover=%i[tab count none nav].include?(item[0]) ? item[1] : nil;@strip_hover=item[0]==:cell ? item[1] : nil
        @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
        emit(ui_hint(item),hover: :clear)
        return invalidate(view)
      end
      @ui_hover=nil;@bar_hover=nil;@strip_hover=nil
      verify_guard!
      target=hit(view,x,y)
      unless target
        @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
        @service.cancel;emit('Apuntá a una cara de una pieza.',hover: :clear);invalidate(view);return
      end
      key=[target['pieceId'],immediate? && @options['mode']=='sheet' && !@sampling ? nil : target['faceIds'],@generation,@depth,@stack_count]
      # An unexpected failure is not recomputed on every move: only a new key retries.
      return invalidate(view) if key==@failed_key
      unless key==@hit_key
        @failed_key=nil;hover!(target);@hit_key=key
      end
      invalidate(view)
    rescue StandardError=>error
      @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
      @failed_key=error.is_a?(ExportError) ? nil : key
      @service.cancel;emit('No se puede preparar esta cara.',error:error.message,hover: :clear);invalidate(view)
    end
    def authorized!(result)
      raise ExportError,'Confirmá material, cara y alcance en la paleta antes de pintar.' unless @options['confirmed']==true
      shared=result['sharedCount'].to_i>1 || result.fetch('affectedPaths',[]).length>1
      if shared && @options['scope']=='all' && @options['allowShared']!=true
        raise ExportError,'Definición compartida: autorizá explícitamente el alcance en la paleta antes de pintar.'
      end
      if @options['authorizedPaths']
        paths=@options['authorizedPaths']
        raise ExportError,'Autorización de rutas inválida.' unless paths.is_a?(Array) && paths.all? { |path| path.is_a?(String) }
        raise ExportError,'El alcance cambió: revisá las rutas afectadas en la paleta.' unless (result.fetch('affectedPaths',[])-paths).empty?
      end
    end
    def queue(target)
      existing=@queued_targets.find { |row| row['pieceId']==target['pieceId'] }
      if existing;existing['faceIds']=(existing['faceIds']+target['faceIds']).uniq
      else;@queued_targets << target_data(target);end
      key=[target['pieceId'],target['faceIds'].first]
      @queued_overlays[key]={triangles:duplicate_points(@triangles),normal:duplicate_points(@normal_line)}
      emit('Cara agregada. Enter aplica todas las caras en una operación; Esc cancela.')
    end
    def apply_targets(targets)
      verify_guard!
      result=@service.preview(service_options(targets));authorized!(result)
      verify_guard!
      applied=@service.apply('token'=>result.fetch('token'),'confirmed'=>true)
      @queued_targets=[];@queued_overlays={};@hover=nil;@target=nil;@preview=nil;@hit_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
      emit(applied['changed'] ? 'Pintado aplicado. Podés deshacerlo con Undo.' : 'Las caras ya tenían ese material.',changed:applied['changed']==true)
    end
    def timed!(ok,changed)
      started=@click_started;@click_started=nil
      return unless @timing && started
      @timing.record('at'=>Time.now.utc.iso8601(3),'ms'=>((@clock.call-started)*1000).round(1),'mode'=>@options['mode'],'edgeCount'=>edge_count,
                     'scope'=>scope,'changed'=>changed==true,'ok'=>ok)
    rescue StandardError
      nil
    end
    def onLButtonDown(flags,x,y,view)
      if immediate?
        # Tabs, counts and material cells always win over the model pick (0.8.17).
        if (item=ui_item(view,x,y))
          ui_click(item);return invalidate(view)
        end
        if material_missing? && !(@sampling || sample_flag?(flags))
          emit(NO_MATERIAL);return invalidate(view)
        end
        # The held key also travels in the click flags: a lost keyUp/keyDown never turns a sample into paint.
        return sample_click(view,x,y) if @sampling || sample_flag?(flags)
        @click_started=@clock.call
        verify_guard!
        @pick_cache=nil
        target=hit(view,x,y,click:true)
        return unless target
        @shared_count=[copies_of(target).length,1].max;@shared_truncated=@occurrences.truncated?
        verdict=verdict_for(target)
        # The hover verdict only anticipates a refusal: the service validates everything again.
        raise ExportError,verdict['reason'] if verdict && !verdict['ok']
        applied=@service.apply_immediate(service_options([target_data(target)]))
        @generation+=1;@last_error=nil
        timed!(true,applied['changed'])
        clear
        emit(applied['changed'] ? 'Pieza pintada. Hacé clic en otra; Ctrl+Z deshace.' : 'La pieza ya tiene este material. Hacé clic en otra.',changed:applied['changed']==true)
        invalidate(view)
        return
      end
      onMouseMove(flags,x,y,view)
      return unless @target
      authorized!(@preview)
      if @options['batch']==true || (flags & SHIFT_MASK)!=0
        queue(@target)
      else
        apply_targets([target_data(@target)])
      end
      invalidate(view)
    rescue StandardError=>error
      timed!(false,false)
      @service.cancel;emit('No se aplicó el pintado.',error:error.message);invalidate(view)
    end
    def keyboard_submode(backwards=false)
      clear
      if immediate?
        emit('Elegí Pintar pieza o Pintar canto en la paleta. Escape termina.')
        return
      end
      if @options['mode']=='sheet'
        @options['paintScope']=@options.fetch('paintScope','face')=='face' ? 'piece' : 'face'
      elsif %w[edge remove_edge].include?(@options['mode'])
        values=[1,2,4];position=values.index(@options.fetch('edgeCount',1)) || 0
        @options['edgeCount']=values[(position+(backwards ? -1 : 1))%values.length]
      else
        emit('Este modo se configura en la paleta; no se cambió ningún material.')
        return
      end
      emit('Submodo actualizado; se cancelaron las caras pendientes. Revisá el resaltado antes de hacer clic.')
    end
    def edge_label(count);count==1 ? '1 canto' : "#{count} cantos";end
    # Ctrl+Tab (immediate): 1 -> 2 opposite -> 4 -> 1, Shift reverses. Remembered.
    def cycle_edge_count(backwards=false)
      return emit('Los cantos por clic se eligen en modo canto (Tab cambia de modo).') unless %w[edge remove_edge].include?(@options['mode'])
      position=EDGE_COUNTS.index(@options.fetch('edgeCount',1)) || 0
      clear;@last_error=nil;@options['edgeCount']=EDGE_COUNTS[(position+(backwards ? -1 : 1))%EDGE_COUNTS.length]
      @remember.call(copy(@options)) if @remember
      emit("#{edge_label(@options['edgeCount'])} por clic. Revisá el resaltado antes de hacer clic.")
    end
    MODE_LABELS={'sheet'=>'Pintar pieza','edge'=>'Pintar canto','remove_edge'=>'Quitar canto'}.freeze
    # Tab / Shift+Tab (immediate, PINTURA-06): sheet <-> edge with the last
    # material of the destination mode, resolved by the controller (never installs).
    # 0.8.17 (placa → canto): the controller REFUSES (ExportError) a remembered
    # material that is not ready in this model (e.g. an edge used in another
    # model: «se instala al elegirlo»). In the view that refusal used to cancel
    # the switch; now the mode always changes, without material, and the strip
    # of the new mode is shown to choose one. The palette brush keeps refusing.
    def switch_mode(destination=nil)
      destination ||= @options['mode']=='sheet' ? 'edge' : 'sheet'
      missing="Elegí #{destination=='edge' ? 'un canto' : 'una placa'} en la paleta para usar Tab."
      reason=nil
      options=if destination=='remove_edge'
                in_view? ? blank_options('remove_edge') : nil
              else
                begin
                  @switch_mode && @switch_mode.call(destination)
                rescue StandardError=>error
                  raise unless in_view?
                  reason=error.is_a?(ExportError) ? error.message : 'No se pudo preparar el último material de este modo.'
                  nil
                end
              end
      options=blank_options(destination) if !options.is_a?(Hash) && in_view?
      return emit(missing) unless options.is_a?(Hash)
      clear;@last_error=nil;@options=copy(options).merge('scope'=>'unique','allowShared'=>false);refresh_recents!
      return emit("#{MODE_LABELS[destination]}. Hacé clic en el canto de una pieza para restaurar su placa; Tab vuelve a Pintar pieza.") if destination=='remove_edge'
      if material_missing?
        return emit("#{MODE_LABELS[destination]}. #{NO_MATERIAL}#{reason ? " (El último #{destination=='edge' ? 'canto' : 'material'} usado no está listo en este modelo: #{reason})" : ''}")
      end
      emit("#{MODE_LABELS[destination]}. Hacé clic en una pieza; Tab vuelve al otro modo.")
    rescue ExportError=>error
      emit('No se cambió de modo.',error:error.message)
    end
    def keyboard_material(backwards=false)
      return emit('Elegí un material desde la paleta para este modo.') unless @service.respond_to?(:material_choices)
      choices=@service.material_choices(service_options([]))
      return emit('No hay otro material nativo listo para este modo. Revisá la biblioteca.') if choices.empty?
      index=choices.index { |choice| choice['materialUuid']==@options['materialUuid'] } || (backwards ? 0 : -1)
      chosen=choices[(index+(backwards ? -1 : 1))%choices.length]
      return emit('El material seleccionado ya está activo.') if chosen['materialUuid']==@options['materialUuid']
      clear;@last_error=nil
      @options.merge!(chosen.slice('catalogId','materialUuid'))
      @options['scope']='unique' if immediate?
      # Simplificación punto 26: the chosen scope is the authorization; a new
      # material keeps it (one Ctrl+Z per click) instead of asking again.
      @options['allowShared']=@options['scope']=='all'
      refresh_recents!
      # Instant, through the limiter: drops a stale pending hover and resets the signature.
      emit("Material activo: #{chosen['name']}. Hacé clic en otra pieza.")
    end
    def onKeyDown(key,repeat,flags,view)
      repeated=repeat.is_a?(Integer) && repeat>1
      # PINTURA-07: held key -> temporary eyedropper (true keeps Alt off the Windows menu).
      if immediate? && @select_material && eyedropper_codes.include?(key)
        start_sampling(view) unless @sampling || repeated
        return true
      end
      if key==27
        onCancel(0,view);true
      elsif key==13 && !@queued_targets.empty?
        apply_targets(copy(@queued_targets));invalidate(view);true
      elsif key==9
        verify_guard!
        return true if repeat.is_a?(Integer) && repeat>1
        # Shift as eyedropper key: Shift+Tab is a keyboard chord, not a sample.
        stop_sampling if @eyedropper_key=='shift'
        if immediate? && (flags & CTRL_MASK)!=0
          cycle_edge_count((flags & SHIFT_MASK)!=0)
        elsif immediate?
          switch_mode
        else
          keyboard_submode((flags & SHIFT_MASK)!=0)
        end
        invalidate(view);true
      elsif immediate? && [38,40].include?(key)
        verify_guard!
        return true if repeated
        change_depth(key==40 ? 1 : -1,view);invalidate(view);true
      elsif [37,38,39,40].include?(key)
        verify_guard!
        return true if repeated
        keyboard_material([37,38].include?(key));invalidate(view);true
      elsif immediate? && (49..54).include?(key) && recents_on?
        # PINTURA-04: 1..6 without modifiers = click on that recents square.
        return true if repeated || (flags.to_i & (SHIFT_MASK|CTRL_MASK|ALT_MASK))!=0
        verify_guard!
        choose_recent(key-49);invalidate(view);true
      end
    rescue StandardError=>error
      @service.cancel;emit('No se aplicó la selección.',error:error.message);invalidate(view)
    end
    # SketchUp reasons: 0 Escape, 1 tool reselected, 2 Undo. Ctrl+Z (which the
    # messages recommend) must keep the operator in the brush.
    def onCancel(reason,view)
      stop_sampling
      case reason
      when 2
        @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@pick_cache=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
        @generation+=1;invalidate(view)
      when 1 then nil
      else
        begin
          stop(view)
        ensure
          @model.select_tool(nil) if @model.respond_to?(:select_tool)
        end
      end
    end
    # Esc, the controller (toolbar again, another Planos Santo tool, closing the
    # model) or an explicit stop: never selected again by the tray grace.
    def stop(view=nil)
      @stopped=true;@tray_pick_at=nil
      unobserve!;stop_sampling;clear;release_textures(view);@active=false;emit('Pintado cancelado; no se aplicaron las caras pendientes.')
      invalidate(view)
    end
    # ---- Hito 7 (DISENO_AVANZADO.md §2): immediate mode only. Hover, drawing,
    # the open menu, the eyedropper and the recents strip never write the model;
    # hide/show/rename are the only writes, each in ONE operation.
    ALT_MASK = Object.const_defined?(:ALT_MODIFIER_MASK) ? Object.const_get(:ALT_MODIFIER_MASK) : 32
    MF_ON = Object.const_defined?(:MF_CHECKED) ? Object.const_get(:MF_CHECKED) : 8
    MF_OFF = Object.const_defined?(:MF_UNCHECKED) ? Object.const_get(:MF_UNCHECKED) : 0
    def self.eyedropper_key!(value)
      raise ExportError,'Elegí Alt o Mayús como tecla del cuentagotas.' unless %w[alt shift].include?(value)
      value
    end
    def eyedropper_key=(value)
      @eyedropper_key=self.class.eyedropper_key!(value);stop_sampling
      invalidate(@model.active_view) if @model.respond_to?(:active_view)
      emit("Cuentagotas: sostené #{key_label} y hacé clic en una cara para tomar su material.")
    end
    def sample_flag?(flags)
      return false unless @select_material && flags.is_a?(Integer)
      (flags & (@eyedropper_key=='shift' ? SHIFT_MASK : ALT_MASK))!=0
    end
    def key_label;@eyedropper_key=='shift' ? 'Mayús' : 'Alt';end
    def eyedropper_codes
      names=@eyedropper_key=='shift' ? %i[VK_SHIFT] : %i[VK_ALT VK_MENU]
      ([@eyedropper_key=='shift' ? 16 : 18]+names.filter_map { |name| Object.const_get(name) if Object.const_defined?(name) }).uniq
    end
    # PINTURA-07: temporary eyedropper while the key is held.
    def start_sampling(view)
      @sampling=true;@hover=nil;@target=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
      emit("Cuentagotas: hacé clic en una cara para tomar su material. Soltá #{key_label} para volver al pincel.")
      onMouseMove(0,*@mouse,view) if @mouse && view
      invalidate(view)
    end
    def stop_sampling
      return false unless @sampling
      @sampling=false;@hover=nil;@target=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[];true
    end
    def onKeyUp(key,_repeat,_flags,view)
      return false unless @sampling && eyedropper_codes.include?(key)
      stop_sampling;emit("#{MODE_LABELS[@options['mode']]}: hacé clic en una pieza. Escape termina.")
      onMouseMove(0,*@mouse,view) if @mouse && view
      invalidate(view);true
    rescue StandardError=>error
      emit('No se pudo volver al pincel.',error:error.message);true
    end
    # Face material: front, else back, else inherited from the containers. Read only.
    def sample_info(target)
      face=target['_face'];material=face.material || face.back_material || @verdicts.inherited(target['_instances'])
      return {'name'=>'Sin material','status'=>'unpainted','catalogId'=>nil,'kind'=>nil,'reason'=>'Esta cara no tiene material para tomar.'} unless material
      name=(material.respond_to?(:display_name) ? material.display_name : material.name).to_s
      observation=defined?(MaterialResolver) ? MaterialResolver.observe_binding(material) : {'status'=>'absent'}
      binding=observation['status']=='valid' ? observation['binding'] : nil
      reason=if observation['status']=='invalid' then observation['error'] || 'El vínculo de este material es inválido; revisalo en la biblioteca.'
             elsif !binding then 'El material de esta cara no está vinculado a una ficha de Planos Santo; vinculalo en la biblioteca.'
             elsif !%w[sheet edge].include?(binding['kind']) then 'Solo se pueden tomar placas o cantos.'
             end
      {'name'=>name,'status'=>observation['status'],'catalogId'=>binding && binding['catalogId'],'kind'=>binding && binding['kind'],'uuid'=>binding && binding['uuid'],'reason'=>reason}
    end
    def sample_hover!(target)
      @target=target;@preview=nil;@copy_triangles=[]
      info=sample_info(target);@sample_reason=info['reason']
      @hover={'pieceId'=>target['pieceId'],'faceId'=>target['faceIds'].first,'name'=>target['name'],'side'=>@options['side'],'sample'=>info.slice('name','status','catalogId','kind')}
      @hover['depth']={'index'=>@depth,'count'=>@stack_count} if @stack_count>1
      build_overlay(target)
      emit(info['reason'] ? 'No se puede tomar este material.' : "Clic para tomar «#{info['name']}»; no pinta.",error:info['reason'],hover:true)
    end
    def sample_click(view,x,y)
      verify_guard!
      @pick_cache=nil
      target=hit(view,x,y,click:true)
      return emit('Apuntá a una cara con material.') unless target
      take_sample!(target)
    rescue StandardError=>error
      emit('No se tomó el material; no se modificó el modelo.',error:error.message)
    ensure
      invalidate(view)
    end
    SAMPLE_MISMATCH='El material de esta cara no coincide con su ficha de biblioteca; revisalo en la biblioteca.'
    # Same flow for the eyedropper click and the context menu: never paints, never installs.
    def take_sample!(target)
      raise ExportError,'El cuentagotas no está disponible en esta herramienta.' unless @select_material
      info=sample_info(target)
      raise ExportError,info['reason'] if info['reason']
      options=@select_material.call(info['catalogId'],info['kind'])
      raise ExportError,'No se pudo preparar el material tomado. Elegilo en la paleta.' unless options.is_a?(Hash) && options['mode']==info['kind']
      raise ExportError,SAMPLE_MISMATCH unless options['materialUuid']==info['uuid']
      previous=@options['mode'];adopt_options!(options)
      # The next click changes meaning (e.g. Quitar canto -> Pintar canto): say it.
      changed=previous==@options['mode'] ? '' : " Modo: #{MODE_LABELS[@options['mode']]}."
      emit("Material tomado: #{info['name']}.#{changed} #{@sampling ? "Soltá #{key_label} para pintar con él." : 'Hacé clic en una pieza para pintar.'}")
    end
    def adopt_options!(options)
      clear;@last_error=nil;@options=copy(options).merge('scope'=>'unique','allowShared'=>false);refresh_recents!
    end
    # PINTURA-04: recents strip. The list is read only on activate/options/mode/material changes.
    RECENT_LIMIT=6
    STRIP_SIZE=28
    STRIP_GAP=6
    STRIP_MARGIN=12
    def material_mode;{'sheet'=>'sheet','edge'=>'edge'}[@options['mode']];end
    def recents_on?;immediate? && !@recents_source.nil? && !@select_material.nil? && !material_mode.nil?;end
    def refresh_recents!
      @recents=[];@strip_rows=[];@strip_page=0;@ui_layout=nil
      return unless recents_on?
      list=@recents_source.call(material_mode)
      @recents=(list.is_a?(Array) ? list : []).select { |row| row.is_a?(Hash) && row['catalogId'].is_a?(String) && !row['catalogId'].empty? }.first(RECENT_LIMIT).map do |row|
        {'catalogId'=>row['catalogId'],'materialUuid'=>row['materialUuid'].to_s,'name'=>row['name'].to_s,'color'=>row['color'].is_a?(Array) ? row['color'].first(3).map(&:to_i) : nil}
      end
      @strip_rows=@recents.map { |row| row.merge('state'=>'ready') }
      refresh_swatches!
    rescue StandardError
      @recents=[];@strip_rows=[]
    end
    # Pintura en vista: after the recents, the library materials of the mode, so
    # the strip is the material chooser (no palette). Read with the recents only.
    SWATCH_LIMIT=24
    def refresh_swatches!
      return unless in_view?
      list=@swatches_source.call(material_mode)
      seen=@strip_rows.map { |row| row['catalogId'] }
      (list.is_a?(Array) ? list : []).each do |row|
        break if @strip_rows.length>=SWATCH_LIMIT
        next unless row.is_a?(Hash) && row['catalogId'].is_a?(String) && !row['catalogId'].empty? && !seen.include?(row['catalogId'])
        seen << row['catalogId']
        @strip_rows << {'catalogId'=>row['catalogId'],'materialUuid'=>row['materialUuid'].to_s,'name'=>row['name'].to_s,
                        'color'=>row['color'].is_a?(Array) ? row['color'].first(3).map(&:to_i) : nil,'state'=>row['state']=='installable' ? 'installable' : 'ready'}
      end
    rescue StandardError
      nil
    end
    # Palette brush only (the view brush draws its own strip in draw_ui).
    def strip_rects(view)
      return [] unless recents_on? && !ui_on? && !@strip_rows.empty? && view.respond_to?(:draw2d) && view.respond_to?(:vpheight)
      size=(STRIP_SIZE*ui_scale).round;bottom=view.vpheight.to_i-STRIP_MARGIN # whole pixels
      count=@strip_rows.length
      count=[count,((view.vpwidth.to_f-2*STRIP_MARGIN+STRIP_GAP)/(size+STRIP_GAP)).floor].min if view.respond_to?(:vpwidth)
      (0...[count,0].max).map { |index| left=STRIP_MARGIN+index*(size+STRIP_GAP);[left,bottom-size,left+size,bottom] }
    rescue StandardError
      []
    end
    def strip_index(view,x,y)
      strip_rects(view).index { |left,top,right,bottom| x>=left && x<=right && y>=top && y<=bottom }
    end
    def draw_strip(view)
      rects=strip_rects(view);return if rects.empty?
      rects.each_with_index do |rect,index|
        row=@strip_rows[index];active=!row['materialUuid'].empty? && row['materialUuid']==@options['materialUuid']
        fill(view,rect,row['color'] || [200,200,200])
        outline(view,rect,active ? [0,0,0] : [128,128,128],active ? 2 : 1)
        # Not yet in this model: a corner mark says «se instala al elegirlo».
        corner_mark(view,rect) if row['state']=='installable'
      end
      label=in_view? ? 'Materiales · clic para elegir (1–6 recientes)' : 'Recientes · clic o 1–6'
      view.draw_text(point_class.new(STRIP_MARGIN,(rects.first[1]-em_px(TEXT_SIZE)*1.4).round,0),label,text_options(view)) if view.respond_to?(:draw_text)
    rescue StandardError
      nil
    end
    def choose_recent(index)
      row=recents_on? && @strip_rows[index]
      return false unless row
      verify_guard!
      install=row['state']=='installable' || row['materialUuid'].empty?
      options=install && @pick_material ? @pick_material.call(row['catalogId'],material_mode) : @select_material.call(row['catalogId'],material_mode)
      raise ExportError,'No se pudo preparar el material elegido.' unless options.is_a?(Hash) && options['mode']==material_mode
      adopt_options!(options)
      emit("Material activo: #{row['name']}. Hacé clic en una pieza.");true
    rescue StandardError=>error
      emit('No se cambió el material.',error:error.is_a?(ExportError) ? error.message : 'No se pudo preparar el material elegido.');true
    end
    # ---- Pintura en vista 0.8.17: interfaz dibujada en la vista, estilo taller.
    # Arriba, una barra oscura de pestañas (Pintar piezas · Pintar cantos · Quitar
    # canto) y, en los modos de canto, una franja clara «Cantos por clic 1 2 4».
    # Abajo, una tira oscura de materiales: «Ningún material» y una celda ancha por
    # material con su color y su nombre centrado; la activa lleva borde naranja.
    # Todo lo que cae dentro de estas bandas es interfaz: el clic y el hover se
    # resuelven ANTES que el pick del modelo y nunca eligen una pieza de abajo.
    # Escrito de cero (sin código ni recursos de OpenCutList).
    TABS=[['sheet','Pintar piezas'],['edge','Pintar cantos'],['remove_edge','Quitar canto']].freeze
    # 0.8.20 (Gabriel: «muy pixelado y chico»): sizes in logical pixels (×
    # UI.scale_factor, rounded to whole pixels); text in logical points.
    # 0.8.19 had a 30 px bar, 36 px strip and 10 px text.
    TOP_HEIGHT=40
    SUB_HEIGHT=38
    STRIP_HEIGHT=58 # cells 48 px high (5 px inset)
    STRIP_INSET=5
    TAB_MIN=150
    TAB_PAD=20
    COUNT_SIZE=30
    COUNT_GAP=8
    NONE_WIDTH=180
    CELL_MIN=170 # a usual name («Canto Roble Santana») fits at 13 pt
    CELL_MAX=260
    NAV_WIDTH=40
    UI_MARGIN=16
    TEXT_SIZE=13 # pt: tabs, cells, hints and tooltip (17 logical px)
    COUNT_TEXT=14 # pt: «1 2 4»
    NAV_TEXT=18 # pt: ‹ ›
    ORANGE=[240,128,20].freeze
    BAND=[56,50,45].freeze
    BAND_HOVER=[86,78,70].freeze
    BAND_LINE=[96,88,80].freeze
    SUB_BAND=[247,246,243].freeze
    LIGHT_TEXT=[238,234,228].freeze
    DARK_TEXT=[34,32,30].freeze
    def ui_on?;in_view? && immediate? && %w[sheet edge remove_edge].include?(@options['mode']);end
    def edge_modes?;%w[edge remove_edge].include?(@options['mode']);end
    def strip_on?;ui_on? && %w[sheet edge].include?(@options['mode']);end
    # ---- 0.8.20 (calidad: «muy pixelado y chico»). ONE adjustment point for
    # every label drawn by the tool: font_size(view,pt). Text sizes are logical
    # points; the wanted em in view pixels is pt × 4/3 × UI.scale_factor.
    # 0.8.18 assumed View#draw_text's :size to be physical pixels that SketchUp
    # does not scale; the API docs speak of points and of DPI scaling, and
    # reports differ by version and platform. So the tool does not assume: it
    # asks View#text_bounds (2020+) how wide ten tabular digits are at size 100
    # with the same font (≈ 5.6 em in Segoe UI, Arial or SF), which gives view
    # pixels per :size unit whatever SketchUp does with DPI, and divides. A
    # :size scaled twice (too big) or not at all (too small) cannot happen.
    # Without text_bounds it falls back to 0.8.18's pixels.
    PT_PX=4.0/3
    PROBE='0000000000'
    PROBE_EM=5.6
    def em_px(pt);pt*PT_PX*ui_scale;end
    def size_unit(view)
      key=[ui_scale,ui_font,view.object_id]
      return @size_unit[1] if @size_unit && @size_unit[0]==key
      unit=nil
      if view.respond_to?(:text_bounds)
        options={size:100};options[:font]=ui_font if ui_font
        bounds=view.text_bounds(point_class.new(0,0,0),PROBE,options)
        width=bounds.respond_to?(:width) ? bounds.width.to_f : 0.0
        unit=width/(PROBE_EM*100) if width.finite? && width>0
        unit=nil unless unit && unit.between?(0.25,8.0) # nonsense measures are ignored
      end
      @size_unit=[key,unit];unit
    rescue StandardError
      @size_unit=[key,nil];nil
    end
    def font_size(view,pt);[(em_px(pt)/(size_unit(view) || 1.0)).round,1].max;end
    def ui_font
      return @ui_font if defined?(@ui_font)
      @ui_font=defined?(Sketchup) && Sketchup.respond_to?(:platform) && Sketchup.platform==:platform_win ? 'Segoe UI' : nil
    end
    def text_options(view,pt=TEXT_SIZE,bold=false)
      options={size:font_size(view,pt)};options[:bold]=true if bold
      options[:font]=ui_font if ui_font
      options
    end
    def text_constant(name);Object.const_defined?(name) ? Object.const_get(name) : nil;end
    # Text width in pixels: View#text_bounds (SketchUp 2020+) measured with the
    # same options used to draw; an estimate (0.55 em per character) without it.
    def text_width(view,text,pt=TEXT_SIZE,bold=false)
      if view.respond_to?(:text_bounds)
        bounds=view.text_bounds(point_class.new(0,0,0),text.to_s,text_options(view,pt,bold))
        return bounds.width.to_f if bounds.respond_to?(:width)
      end
      text.to_s.length*em_px(pt)*0.55
    rescue StandardError
      text.to_s.length*em_px(pt)*0.55
    end
    # Longest prefix + «…» that fits: measured (binary search, cached per text,
    # width and scale; draw runs on every frame) with text_bounds, estimated without.
    def fit_text(view,text,width,pt=TEXT_SIZE)
      text=text.to_s
      return text if text_width(view,text,pt)<=width
      unless view.respond_to?(:text_bounds)
        chars=[(width/(em_px(pt)*0.55)).floor-1,1].max
        return text[0,chars].rstrip+'…'
      end
      @fit_cache=nil if @fit_cache && @fit_cache.length>256
      key=[text,width.round,pt,ui_scale,view.object_id];@fit_cache||={}
      return @fit_cache[key] if @fit_cache.key?(key)
      low=1;high=text.length-1
      while low<high
        middle=(low+high+1)/2
        text_width(view,text[0,middle].rstrip+'…',pt)<=width ? low=middle : high=middle-1
      end
      @fit_cache[key]=text[0,low].rstrip+'…'
    end
    # Line widths in logical pixels too: a 1 px border is 1/2/2 px at 100/150/200 %.
    def line_px(width);[(width*ui_scale).round,1].max;end
    # Bands and hit items for the current viewport, mode and strip page.
    # Item: [kind,key,rect,label]; kind :tab, :count, :none, :cell (key = row
    # index in @strip_rows), :nav (key 'prev'/'next'). Rect = [left,top,right,bottom].
    def ui_layout(view)
      return nil unless ui_on? && view.respond_to?(:draw2d) && view.respond_to?(:vpwidth) && view.respond_to?(:vpheight)
      s=ui_scale;width=view.vpwidth.to_f;height=view.vpheight.to_f;margin=UI_MARGIN*s
      key=[width,height,s,@options['mode'],edge_count,@strip_rows.map { |row| row['catalogId'] },@strip_page.to_i]
      return @ui_layout[1] if @ui_layout && @ui_layout[0]==key
      top_h=TOP_HEIGHT*s;items=[];bands={top:[0.0,0.0,width,top_h]}
      # Tabs, centred when there is room; the title and the hint only when they fit.
      widths=TABS.map { |_,label| [TAB_MIN*s,text_width(view,label)+2*TAB_PAD*s].max }
      title_w=text_width(view,'PINTAR',TEXT_SIZE,true)+2*margin
      hint='Tab cambia · Esc termina';hint_w=text_width(view,hint)+2*margin
      total=widths.sum
      if total>width-2*margin
        widths=widths.map { (width-2*margin)/TABS.length };total=widths.sum;title_w=0;hint_w=0
      elsif total>width-title_w-hint_w
        hint_w=0
        title_w=0 if total>width-title_w
      end
      left=[(width-total)/2,title_w].max
      left=[left,width-hint_w-total].min if hint_w>0
      left=[left,margin].max if title_w.zero?
      TABS.each_with_index do |(mode,label),index|
        right=left+widths[index]
        items << [:tab,mode,[left,0.0,right,top_h],label];left=right
      end
      bands[:title]=title_w>0 ? 'PINTAR' : nil;bands[:hint]=hint_w>0 ? hint : nil
      bottom=top_h
      if edge_modes?
        sub_h=SUB_HEIGHT*s;bands[:sub]=[0.0,top_h,width,top_h+sub_h];bottom=top_h+sub_h
        label='Cantos por clic';size=COUNT_SIZE*s;gap=COUNT_GAP*s
        group=text_width(view,label)+gap*2+EDGE_COUNTS.length*size+(EDGE_COUNTS.length-1)*gap
        left=[(width-group)/2,margin].max
        bands[:sub_label]=[label,left,top_h+sub_h/2]
        left+=text_width(view,label)+gap*2
        EDGE_COUNTS.each do |count|
          y=top_h+(sub_h-size)/2
          items << [:count,"count#{count}",[left,y,left+size,y+size],count.to_s];left+=size+gap
        end
      end
      bands[:top_bottom]=bottom
      if strip_on?
        strip_h=STRIP_HEIGHT*s;top=height-strip_h;inset=STRIP_INSET*s;bands[:strip]=[0.0,top,width,height]
        none_w=[NONE_WIDTH*s,width/3].min
        items << [:none,'none',[inset,top+inset,none_w,height-inset],'Ningún material']
        rows=@strip_rows.length;room=width-none_w-inset
        if rows>0
          cell=[[room/rows,CELL_MIN*s].max,CELL_MAX*s].min
          per_page=[(room/cell).floor,1].max
          if rows>per_page
            per_page=[((room-2*NAV_WIDTH*s)/cell).floor,1].max
            cell=[(room-2*NAV_WIDTH*s)/per_page,CELL_MAX*s].min # the page fills the strip
            pages=(rows.to_f/per_page).ceil
            @strip_page=@strip_page.to_i.clamp(0,pages-1)
            first=@strip_page*per_page
            nav_left=width-2*NAV_WIDTH*s
            items << [:nav,'prev',[nav_left,top+inset,nav_left+NAV_WIDTH*s-inset,height-inset],'‹'] if @strip_page>0
            items << [:nav,'next',[nav_left+NAV_WIDTH*s,top+inset,width-inset,height-inset],'›'] if @strip_page<pages-1
          else
            @strip_page=0;first=0
          end
          left=none_w+inset
          (first...[first+per_page,rows].min).each do |index|
            items << [:cell,index,[left,top+inset,left+cell-inset,height-inset],@strip_rows[index]['name']];left+=cell
          end
        else
          bands[:empty]=[none_w+3*inset,top+strip_h/2,"No hay #{@options['mode']=='edge' ? 'cantos' : 'placas'} en la biblioteca: agregalos desde Materiales."]
        end
      end
      layout=whole_pixels(bands,items)
      @ui_layout=[key,layout];layout
    rescue StandardError
      nil
    end
    # Every band and item edge on a whole pixel (UI.scale_factor 1.25 or 1.5
    # gives fractions): fills stay sharp and neighbours share the same edge.
    def whole_pixels(bands,items)
      rounded=bands.to_h do |name,value|
        case name
        when :top,:sub,:strip then [name,value.map(&:round)]
        when :sub_label then [name,[value[0],value[1].round,value[2].round]]
        when :empty then [name,[value[0].round,value[1].round,value[2]]]
        when :top_bottom then [name,value.round]
        else [name,value]
        end
      end
      {bands:rounded,items:items.map { |kind,key,rect,label| [kind,key,rect.map(&:round),label] }}
    end
    def inside?(rect,x,y)
      rect && x>=rect[0] && x<=rect[2] && y>=rect[1] && y<=rect[3]
    end
    # [kind,key] under the cursor, [:band,nil] on an empty part of a band, nil on the model.
    def ui_item(view,x,y)
      if (layout=ui_layout(view))
        item=layout[:items].find { |_kind,_key,rect,| inside?(rect,x,y) }
        return [item[0],item[1]] if item
        bands=layout[:bands]
        return [:band,nil] if y<=bands[:top_bottom] || inside?(bands[:strip],x,y)
        return nil
      end
      index=strip_index(view,x,y) # palette brush: the old squares
      index ? [:cell,index] : nil
    end
    def bar_active?(key)
      key==@options['mode'] || (edge_modes? && key=="count#{edge_count}")
    end
    def bar_hint(key)
      return "#{edge_label(key.delete_prefix('count').to_i)} por clic (Ctrl+Tab también cambia)." if key.start_with?('count')
      return 'Sin material: el pincel no pinta hasta que elijas uno en la tira.' if key=='none'
      return 'Ver más materiales.' if key=='next'
      return 'Ver los materiales anteriores.' if key=='prev'
      {'sheet'=>'Pintar piezas: pinta las dos caras grandes de la placa (Tab cambia de modo).',
       'edge'=>'Pintar cantos: pinta los cantos de la pieza (Tab cambia de modo).',
       'remove_edge'=>'Quitar canto: restaura la placa en el canto elegido; no necesita material.'}.fetch(key,'')
    end
    def cell_hint(index)
      row=@strip_rows[index] or return ''
      return "Reciente #{index+1}: #{row['name']}. Clic o tecla #{index+1} para usarlo; no pinta." if index<@recents.length
      "#{row['name']}. Clic para usarlo#{row['state']=='installable' ? ' (se instala en el modelo)' : ''}; no pinta."
    end
    def ui_hint(item)
      kind,key=item
      return cell_hint(key) if kind==:cell
      return 'Barra del pincel: elegí un modo o un material; no pinta.' if kind==:band
      bar_hint(key)
    end
    def ui_click(item)
      kind,key=item
      case kind
      when :tab,:count then bar_click(key)
      when :cell then choose_recent(key)
      when :none then clear_material!
      when :nav
        @strip_page=@strip_page.to_i+(key=='next' ? 1 : -1);@ui_layout=nil
        emit("Materiales · página #{@strip_page+1}.")
      end
    end
    def bar_click(key)
      verify_guard!
      key.start_with?('count') ? set_edge_count(key.delete_prefix('count').to_i) : switch_to(key)
    rescue StandardError=>error
      emit('No se cambió el modo.',error:error.is_a?(ExportError) ? error.message : 'No se pudo cambiar el modo.')
    end
    # «Ningún material»: the brush keeps its mode and stops painting until a
    # material is chosen. Tool state only; nothing is written.
    def clear_material!
      return emit('Este modo no usa material.') unless %w[sheet edge].include?(@options['mode'])
      return emit(NO_MATERIAL) if material_missing?
      clear;@last_error=nil;@options=blank_options(@options['mode']).merge('scope'=>'unique','allowShared'=>false)
      emit("Sin material. #{NO_MATERIAL}")
    end
    def switch_to(destination)
      return emit("#{MODE_LABELS[destination]} ya está activo.") if destination==@options['mode']
      switch_mode(destination)
    end
    # Same options with the destination mode and no material (in-view only).
    def blank_options(mode)
      copy(@options).reject { |key,_| %w[catalogId materialUuid].include?(key) }
        .merge('mode'=>mode,'paintScope'=>mode=='sheet' ? 'piece' : 'face','immediatePiece'=>mode=='sheet',
               'edgeCount'=>mode=='sheet' ? 1 : (EDGE_COUNTS.include?(@options['edgeCount']) ? @options['edgeCount'] : 1))
    end
    def gl(name,fallback);Object.const_defined?(name) ? Object.const_get(name) : fallback;end
    def corners(left,top,right,bottom)
      klass=point_class;[[left,top],[right,top],[right,bottom],[left,bottom]].map { |x,y| klass.new(x,y,0) }
    end
    # 0.8.18 (calidad visual): a fill covers whole pixels (GL_QUADS on integer
    # corners); a line of width w runs w/2 inside the edge, so a 1 px or 3 px line
    # sits on pixel centres (.5) and a 2 px one on pixel edges: never a line
    # smeared over two half-lit rows by the view's anti-aliasing.
    def fill(view,rect,rgb,alpha=255)
      view.drawing_color=rgba(rgb,alpha);view.draw2d(gl(:GL_QUADS,7),corners(*rect.map(&:round)))
    end
    def outline(view,rect,rgb,width=1)
      left,top,right,bottom=rect.map(&:round);inset=width/2.0
      view.line_width=width if view.respond_to?(:line_width=)
      view.drawing_color=rgba(rgb,255);view.draw2d(gl(:GL_LINE_LOOP,2),corners(left+inset,top+inset,right-inset,bottom-inset))
      view.line_width=1 if view.respond_to?(:line_width=)
    end
    # Vertical 1 px separator on the last pixel column left of x.
    def separator(view,x,top,bottom,rgb)
      view.line_width=1 if view.respond_to?(:line_width=)
      view.drawing_color=rgba(rgb,255)
      view.draw2d(gl(:GL_LINES,1),[point_class.new(x.round-0.5,top.round,0),point_class.new(x.round-0.5,bottom.round,0)])
    end
    # «Se instala al elegirlo»: a small white square in the top-right corner
    # (a quad, not a triangle with an anti-aliased diagonal).
    def corner_mark(view,rect)
      left,top,right,bottom=rect.map(&:round);size=[(12*ui_scale).round,[right-left,bottom-top].min/2].min
      fill(view,[right-size,top,right,top+size],[255,255,255],235)
    end
    # Readable text on any swatch colour (perceived luminance).
    def contrast(rgb)
      r,g,b=rgb.to_a.first(3).map(&:to_f)
      0.299*r+0.587*g+0.114*b>150 ? DARK_TEXT : [255,255,255]
    end
    def text_color(rgb)
      Sketchup::Color.new(*rgb)
    rescue StandardError
      rgb
    end
    # Label on whole pixels. With View#text_bounds (2020+) the centred text is
    # measured and drawn from its rounded left edge (TextAlignLeft), so the
    # glyphs never start on half a pixel; without it, TextAlignCenter at a
    # rounded centre; without both constants, an estimated left.
    def draw_label(view,text,cx,cy,rgb,size:TEXT_SIZE,bold:false,align: :center)
      return unless view.respond_to?(:draw_text)
      options=text_options(view,size,bold).merge(color:text_color(rgb))
      left_align=text_constant(:TextAlignLeft);center_align=text_constant(:TextAlignCenter);middle=text_constant(:TextVerticalAlignCenter)
      if middle && left_align && (align!=:center || view.respond_to?(:text_bounds))
        left=align==:center ? cx-text_width(view,text,size,bold)/2.0 : cx
        return view.draw_text(point_class.new(left.round,cy.round,0),text,options.merge(align:left_align,vertical_align:middle))
      end
      if middle && center_align
        return view.draw_text(point_class.new(cx.round,cy.round,0),text,options.merge(align:center_align,vertical_align:middle))
      end
      left=align==:center ? cx-text_width(view,text,size,bold)/2 : cx
      view.draw_text(point_class.new(left.round,(cy-em_px(size)*0.7).round,0),text,options)
    end
    # ---- 0.8.20: a swatch shows the material's own texture when SketchUp can
    # draw it in 2D (View#load_texture + draw2d texture:/uvs:, SketchUp 2020+),
    # the flat material colour otherwise (older API, no texture, an image too
    # large, or any failure). One texture per material and tool session, from
    # the material already in the model (Texture#image_rep); never scaled up
    # from a small preview. Released when the tool is deactivated.
    TEXTURE_MAX_PIXELS=2048*2048
    def swatch_texture(view,row)
      uuid=row['materialUuid'].to_s
      return nil if uuid.empty? || !view.respond_to?(:load_texture) || !defined?(MaterialResolver) || !@model.respond_to?(:materials)
      @textures||={}
      return @textures[uuid] if @textures.key?(uuid)
      @textures[uuid]=nil # a failure is not retried on every frame
      material=@model.materials.to_a.find { |m| MaterialResolver.observe_binding(m).dig('binding','uuid')==uuid }
      texture=material && material.respond_to?(:texture) ? material.texture : nil
      return nil unless texture && texture.respond_to?(:image_rep)
      if texture.respond_to?(:image_width) && texture.respond_to?(:image_height)
        return nil if texture.image_width.to_i*texture.image_height.to_i>TEXTURE_MAX_PIXELS
      end
      rep=texture.image_rep(false)
      return nil unless rep && rep.width.to_i>0 && rep.height.to_i>0
      id=view.load_texture(rep)
      return nil unless id
      @texture_view=view
      @textures[uuid]=[id,rep.width.to_f,rep.height.to_f]
    rescue StandardError
      nil
    end
    def release_textures(view=nil)
      view||=@texture_view
      (@textures || {}).each_value do |entry|
        next unless entry && view && view.respond_to?(:release_texture)
        begin
          view.release_texture(entry[0])
        rescue StandardError
          nil
        end
      end
      @textures={};@texture_view=nil
    end
    # The centre of the image covers the cell without stretching. Screen corners
    # top-left, top-right, bottom-right, bottom-left; image v=1 is its top row.
    def texture_uvs(rect,texture_w,texture_h)
      left,top,right,bottom=rect;cell=(right-left).to_f/[(bottom-top).to_f,1.0].max;image=texture_w/texture_h
      su=[1.0,cell/image].min;sv=[1.0,image/cell].min;u0=(1-su)/2;v0=(1-sv)/2
      [[u0,v0+sv,0],[u0+su,v0+sv,0],[u0+su,v0,0],[u0,v0,0]]
    end
    def draw_texture(view,rect,texture)
      id,texture_w,texture_h=texture;rect=rect.map(&:round)
      view.drawing_color=rgba([255,255,255],255) # no tint
      view.draw2d(gl(:GL_QUADS,7),corners(*rect),texture:id,uvs:texture_uvs(rect,texture_w,texture_h))
      true
    rescue StandardError
      false
    end
    # Over a texture the name sits on a plate of the material's mean colour, so
    # contrast() still picks a readable text colour.
    def label_plate(view,text,cx,cy,rgb,bold)
      s=ui_scale;half=(text_width(view,text,TEXT_SIZE,bold)/2.0+8*s).ceil;h=(em_px(TEXT_SIZE)*0.8).ceil
      fill(view,[cx.round-half,cy.round-h,cx.round+half,cy.round+h],rgb,215)
    end
    def draw_ui(view)
      layout=ui_layout(view);return unless layout
      bands=layout[:bands];s=ui_scale
      fill(view,bands[:top],BAND,245)
      draw_label(view,bands[:title],UI_MARGIN*s,bands[:top][3]/2,LIGHT_TEXT,bold:true,align: :left) if bands[:title]
      draw_label(view,bands[:hint],bands[:top][2]-UI_MARGIN*s-text_width(view,bands[:hint]),bands[:top][3]/2,[200,194,186],align: :left) if bands[:hint]
      if bands[:sub]
        fill(view,bands[:sub],SUB_BAND,240)
        label,x,y=bands[:sub_label];draw_label(view,label,x,y,DARK_TEXT,bold:true,align: :left)
      end
      if bands[:strip]
        fill(view,bands[:strip],BAND,245)
        empty=bands[:empty];draw_label(view,empty[2],empty[0],empty[1],LIGHT_TEXT,align: :left) if empty
      end
      layout[:items].each { |item| draw_item(view,*item) }
    rescue StandardError=>error
      callback_failed('draw (barra del pincel)',error)
    end
    def draw_item(view,kind,key,rect,label)
      left,top,right,bottom=rect;s=ui_scale;hover=@ui_hover==[kind,key]
      cx=(left+right)/2;cy=(top+bottom)/2;width=right-left
      case kind
      when :tab
        active=bar_active?(key)
        fill(view,rect,active ? ORANGE : hover ? BAND_HOVER : BAND,active ? 255 : 245)
        separator(view,right,top,bottom,BAND_LINE)
        draw_label(view,fit_text(view,label,width-16*s),cx,cy,active ? [255,255,255] : LIGHT_TEXT,bold:active)
      when :count
        active=bar_active?(key)
        fill(view,rect,active ? [255,255,255] : hover ? [232,229,224] : [236,234,230])
        outline(view,rect,active ? ORANGE : [200,196,190],line_px(active ? 2 : 1))
        draw_label(view,label,cx,cy,DARK_TEXT,size:COUNT_TEXT,bold:active)
      when :none
        active=material_missing?
        fill(view,rect,[250,250,250])
        outline(view,rect,active ? ORANGE : hover ? [255,255,255] : [120,112,104],line_px(active ? 3 : 1))
        draw_label(view,fit_text(view,label,width-16*s),cx,cy,DARK_TEXT)
      when :cell
        row=@strip_rows[key];color=row['color'] || [200,200,200]
        active=!row['materialUuid'].to_s.empty? && row['materialUuid']==@options['materialUuid']
        texture=swatch_texture(view,row)
        textured=texture && draw_texture(view,rect,texture)
        fill(view,rect,color) unless textured # one flat quad: the material colour, nothing tessellated
        corner_mark(view,rect) if row['state']=='installable' # not in this model yet
        outline(view,rect,active ? ORANGE : hover ? [255,255,255] : BAND_LINE,line_px(active ? 3 : hover ? 2 : 1))
        text=fit_text(view,label,width-24*s)
        label_plate(view,text,cx,cy,color,active) if textured
        draw_label(view,text,cx,cy,contrast(color),bold:active)
      when :nav
        fill(view,rect,hover ? BAND_HOVER : [70,64,58])
        draw_label(view,label,cx,cy,LIGHT_TEXT,size:NAV_TEXT,bold:true)
      end
    end
    # PINTURA-11: arrows down/up walk the stack; the hover event is sent at once.
    def change_depth(delta,view)
      return emit('No hay otra pieza bajo el cursor.') unless @mouse && @stack_count>1
      @depth+=delta;@hit_key=nil;@hover_sent_at=nil
      onMouseMove(0,*@mouse,view)
    end
    # PINTURA-13: only the immediate brush replaces SketchUp's context menu.
    def respond_to?(name,include_all=false)
      return false if name.to_s=='getMenu' && @options.is_a?(Hash) && !immediate?
      super
    end
    def getMenu(menu,_flags=0,x=nil,y=nil,view=nil)
      return false unless immediate?
      onMouseMove(0,x,y,view) if view && x && y && @mouse!=[x,y]
      target=@hover && @target && @hover['pieceId']==@target['pieceId'] ? @target : nil
      item=lambda do |text,checked=nil,&action|
        id=menu.add_item(text) { menu_action(view,&action) }
        menu.set_validation_proc(id) { checked.call ? MF_ON : MF_OFF } if checked && menu.respond_to?(:set_validation_proc)
      end
      separator=lambda { menu.add_separator if menu.respond_to?(:add_separator) }
      if target
        item.call('Tomar el material de esta cara') { take_sample!(target) } if @select_material
        item.call('Ocultar esta pieza') { hide_piece!(target) }
        item.call('Mostrar las piezas ocultadas desde el pincel') { show_hidden! } unless hidden_by_tool.empty?
        item.call('Renombrar pieza…') { rename_piece!(target) }
        if %w[edge remove_edge].include?(@options['mode'])
          separator.call
          {1=>'1 canto',2=>'2 cantos opuestos',4=>'4 cantos'}.each { |count,text| item.call(text,lambda { edge_count==count }) { set_edge_count(count) } }
        end
        separator.call
      end
      item.call('Resaltar lo que falta pintar',lambda { @missing==true }) { set_view_options('highlightMissing'=>!@missing) }
      item.call('Transparencia (rayos X)',lambda { transparency==true }) { toggle_view_transparency }
      true
    rescue StandardError=>error
      emit('No se pudo armar el menú del pincel.',error:error.message);false
    end
    def menu_action(view)
      verify_guard!;yield
    rescue StandardError=>error
      emit('No se aplicó la acción del menú.',error:error.message)
    ensure
      invalidate(view)
    end
    def piece_entity!(target,verb)
      instances=target['_instances']
      raise ExportError,'La pieza ya no existe; apuntala de nuevo.' unless instances.all? { |entity| !entity.respond_to?(:valid?) || entity.valid? }
      raise ExportError,"La pieza o un contenedor está bloqueado; no se #{verb}." if instances.any? { |entity| entity.respond_to?(:locked?) && entity.locked? }
      instances.last
    end
    def operation!(name)
      started=false
      @model.start_operation(name,true);started=true
      yield
      @model.commit_operation
    rescue StandardError
      @model.abort_operation if started
      raise
    end
    def after_write!(message)
      @generation+=1;@last_error=nil;clear;emit(message,changed:true)
    end
    def hide_piece!(target)
      entity=piece_entity!(target,'ocultó')
      operation!('Ocultar pieza Planos Santo') { entity.hidden=true }
      @hidden_by_tool << entity unless @hidden_by_tool.any? { |other| other.equal?(entity) }
      after_write!('Pieza oculta. «Mostrar las piezas ocultadas desde el pincel» la vuelve a mostrar; Ctrl+Z deshace.')
    end
    # Pieces this tool hid in this session that still exist and are still hidden.
    def hidden_by_tool
      @hidden_by_tool.select! { |entity| (!entity.respond_to?(:valid?) || entity.valid?) && entity.respond_to?(:hidden?) && entity.hidden? }
      @hidden_by_tool
    end
    def show_hidden!
      entities=hidden_by_tool.reject { |entity| entity.respond_to?(:locked?) && entity.locked? }
      return emit('No hay piezas ocultadas desde el pincel para mostrar.') if entities.empty?
      operation!('Mostrar piezas Planos Santo') { entities.each { |entity| entity.hidden=false } }
      @hidden_by_tool.reject! { |entity| entities.any? { |shown| shown.equal?(entity) } }
      after_write!("#{entities.length==1 ? 'Se mostró 1 pieza' : "Se mostraron #{entities.length} piezas"}. Ctrl+Z deshace.")
    end
    def rename_piece!(target)
      entity=piece_entity!(target,'renombró')
      raise ExportError,'Esta versión de SketchUp no permite pedir el nombre desde el pincel.' unless defined?(UI) && UI.respond_to?(:inputbox) && defined?(NameManager)
      current=entity.name.to_s;current=target['name'].to_s if current.empty?
      answer=UI.inputbox(['Nombre'],[current],'Renombrar pieza')
      return emit('Renombrado cancelado; no se modificó el modelo.') unless answer.is_a?(Array)
      name=NameManager.clean(answer.first,80)
      entity=piece_entity!(target,'renombró') # the dialog is modal: check again
      return emit('El nombre no cambió.') if name==entity.name.to_s
      operation!('Renombrar pieza Planos Santo') { entity.name=name }
      after_write!("Pieza renombrada: #{name}. Ctrl+Z deshace.")
    end
    def set_edge_count(count)
      return emit('Los cantos por clic se eligen en modo canto.') unless %w[edge remove_edge].include?(@options['mode']) && EDGE_COUNTS.include?(count)
      clear;@last_error=nil;@options['edgeCount']=count
      @remember.call(copy(@options)) if @remember
      emit("#{edge_label(count)} por clic. Revisá el resaltado antes de hacer clic.")
    end
    # PINTURA-14: a view option, no operation and no Undo; entities are untouched.
    def self.toggle_transparency(model)
      options=model.respond_to?(:rendering_options) ? model.rendering_options : nil
      raise ExportError,'Esta versión de SketchUp no permite cambiar la transparencia desde el pincel.' unless options && options.respond_to?(:[]) && options.respond_to?(:[]=)
      value=options['ModelTransparency']!=true
      options['ModelTransparency']=value
      value
    end
    def toggle_view_transparency
      value=self.class.toggle_transparency(@model)
      emit(value ? 'Transparencia activada: se ve a través de las piezas.' : 'Transparencia desactivada.')
    end
    def transparency
      return nil unless @model.respond_to?(:rendering_options)
      value=@model.rendering_options['ModelTransparency']
      value.nil? ? nil : value==true
    rescue StandardError
      nil
    end
    def set_view_options(options)
      raise ExportError,'Opciones de vista inválidas.' unless options.is_a?(Hash)
      if options.key?('highlightMissing')
        value=options['highlightMissing']
        raise ExportError,'«Resaltar lo que falta» debe ser verdadero o falso.' unless [true,false].include?(value)
        @missing=value;@missing_state=nil
      end
      invalidate(@model.active_view) if @model.respond_to?(:active_view) # the palette has no view: redraw now
      emit(@missing ? 'Resaltando en rojo las piezas sin placa.' : 'Resaltado de lo que falta pintar apagado.')
      status
    end
    # F-PINT-C: leaf pieces evaluated once per generation (never writes, never
    # reads the catalog); one geometry failure only marks that piece.
    MISSING_LIMIT=500
    MISSING_DRAW_LIMIT=300
    MISSING_BUDGET=0.15
    def missing_summary
      return {'enabled'=>false,'withoutSheet'=>0,'evaluated'=>0,'truncated'=>false} unless @missing && immediate?
      ensure_missing![:summary].dup
    rescue StandardError
      {'enabled'=>true,'withoutSheet'=>0,'evaluated'=>0,'truncated'=>true,'error'=>'No se pudo evaluar lo que falta pintar.'}
    end
    def ensure_missing!
      return @missing_state if @missing_state && @missing_state[:generation]==@generation
      @missing_state=begin
        compute_missing
      rescue StandardError
        # Cached for this generation: a broken model never retries on every emit/draw.
        {generation:@generation,summary:{'enabled'=>true,'withoutSheet'=>0,'evaluated'=>0,'truncated'=>true,'error'=>'No se pudo evaluar lo que falta pintar.'},pieces:{},triangles:[]}
      end
    end
    # Visible on screen: no hidden instance and no hidden tag on the path.
    def visible_path?(path)
      path.none? do |entity|
        (entity.respond_to?(:hidden?) && entity.hidden?) || (entity.respond_to?(:visible?) && !entity.visible?) ||
          (entity.respond_to?(:layer) && entity.layer.respond_to?(:visible?) && !entity.layer.visible?)
      end
    end
    # Results are kept per definition, inherited material, scale and face/material
    # fingerprint across generations, so a click only re-evaluates what changed;
    # the whole pass is bounded by MISSING_BUDGET seconds (partial -> truncated).
    def missing_fingerprint(entity)
      entities_for(entity).grep(Sketchup::Face).map { |face| [face.object_id,face.material&.object_id,face.back_material&.object_id] }.hash
    end
    def compute_missing
      summary={'enabled'=>true,'withoutSheet'=>0,'evaluated'=>0,'truncated'=>false};pieces={};triangles=[]
      state={generation:@generation,summary:summary,pieces:pieces,triangles:triangles}
      native=@verdicts.native
      return state unless native
      main=[@triangles,@normal_line];leaf={}.compare_by_identity;prints={}.compare_by_identity;drawn=0
      @missing_results={} if !@missing_results || @missing_results.length>2000
      started=@clock.call;memo={}
      paths=@occurrences.all_paths(@generation).select do |path|
        entity=path.last
        begin
          leaf.fetch(entity.definition) { leaf[entity.definition]=leaf_piece?(entity) } && visible_path?(path)
        rescue StandardError
          false
        end
      end
      limit=@missing_limit || MISSING_LIMIT
      summary['truncated']=paths.length>limit || @occurrences.truncated?
      paths.first(limit).each do |path|
        if @clock.call-started>MISSING_BUDGET
          summary['truncated']=true;break
        end
        begin
          inherited=@verdicts.inherited(path);definition=path.last.definition
          print=prints.fetch(definition) { prints[definition]=missing_fingerprint(path.last) }
          key=[definition.guid.to_s,inherited&.object_id,@verdicts.scales(path),print]
          result=@missing_results.key?(key) ? @missing_results[key] : (@missing_results[key]=evaluate_missing(native,path,inherited,memo))
          piece_id=path.map { |entity| persistent(entity) }.join('/')
          summary['evaluated']+=1;pieces[piece_id]=result
          next unless result['withoutSheet']
          summary['withoutSheet']+=1
          next if (drawn+=1)>MISSING_DRAW_LIMIT
          overlay=[]
          entities_for(path.last).grep(Sketchup::Face).each { |face| build_overlay({'_instances'=>path,'_face'=>face});overlay.concat(@triangles) }
          triangles.concat(overlay)
        rescue StandardError
          next
        end
      end
      state
    ensure
      @triangles,@normal_line=main if main
    end
    def leaf_piece?(entity)
      entities=entities_for(entity)
      entities.any? { |e| e.is_a?(Sketchup::Face) } && entities.none? { |e| instance?(e) }
    end
    def evaluate_missing(native,path,inherited,memo={})
      node={'_entity'=>path.last,'_parents'=>path[0...-1],'id'=>nil}
      faces=native.faces(node)
      edge=lambda { |face| native.edge_material?(face.material) || native.edge_material?(face.back_material) }
      axes=begin
        native.automatic_axes(node)
      rescue ExportError
        nil
      end
      broad=begin
        raise ExportError,'sin ejes' unless axes
        native.expanded_faces(node,[faces.first],{'mode'=>'sheet','axes'=>axes,'paintScope'=>'piece',memo:memo})
      rescue ExportError
        faces.reject(&edge)
      end
      without=broad.none? { |face| @verdicts.sheet?(face.material || inherited) || @verdicts.sheet?(face.back_material || inherited) }
      edges=begin
        frame=axes && native.boundary_frame(node,{'axes'=>axes,memo:memo})
        frame && {'done'=>frame[:axes].flat_map { |axis| [[axis,'min'],[axis,'max']] }.count { |side| (group=frame[:groups][side]) && !group.empty? && group.all?(&edge) },'total'=>4}
      rescue ExportError
        nil
      end
      {'withoutSheet'=>without==true,'edges'=>edges}
    end
    def missing_line(piece_id)
      result=@missing && immediate? && ensure_missing![:pieces][piece_id]
      return nil unless result
      edges=result['edges'];edge_text=edges ? "cantos #{edges['done']}/#{edges['total']}" : 'cantos sin evaluar'
      return "Falta: placa · #{edge_text}" if result['withoutSheet']
      return "Placa lista · #{edge_text}" unless edges
      edges['done']==edges['total'] ? "Completa: placa · #{edge_text}" : "Falta: #{edge_text}"
    end
    def draw_missing(view)
      return unless @missing && immediate?
      triangles=ensure_missing![:triangles]
      return if triangles.empty?
      view.drawing_color=rgba([220,30,30],70)
      view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,triangles)
    rescue StandardError
      nil
    end
    def world_point(point,matrix)
      a=point.to_a
      xyz=3.times.map { |row| matrix[row]*a[0]+matrix[4+row]*a[1]+matrix[8+row]*a[2]+matrix[12+row] }
      defined?(Geom::Point3d) ? Geom::Point3d.new(*xyz) : Sketchup::Point.new(*xyz)
    end
    def build_overlay(target)
      transformation=target['_instances'].inject(Geom::Transformation.new) { |world,entity| world*entity.transformation }.to_a
      mesh=target['_face'].mesh(0);points=mesh.points.map { |point| world_point(point,transformation) }
      @triangles=mesh.polygons.flat_map do |polygon|
        indices=polygon.map { |index| index.abs-1 }
        (1...(indices.length-1)).flat_map { |i| [points[indices[0]],points[indices[i]],points[indices[i+1]]] }
      end
      @normal_line=[]
      if @triangles.length>=3
        a,b,c=@triangles.first(3).map(&:to_a)
        m=transformation;aa,bb,cc=m[0],m[4],m[8];dd,ee,ff=m[1],m[5],m[9];gg,hh,ii=m[2],m[6],m[10]
        determinant=aa*(ee*ii-ff*hh)-bb*(dd*ii-ff*gg)+cc*(dd*hh-ee*gg)
        n=target['_face'].normal.to_a
        cofactors=[[ee*ii-ff*hh,ff*gg-dd*ii,dd*hh-ee*gg],[cc*hh-bb*ii,aa*ii-cc*gg,bb*gg-aa*hh],[bb*ff-cc*ee,cc*dd-aa*ff,aa*ee-bb*dd]]
        normal=determinant.abs>1e-12 ? cofactors.map { |row| row.zip(n).sum { |x,y| x*y }/determinant } : [0,0,0]
        length=Math.sqrt(normal.sum { |value| value*value })
        center=3.times.map { |axis| (a[axis]+b[axis]+c[axis])/3 }
        if length>0
          sign=@options['side']=='back' ? -1 : 1
          finish=3.times.map { |axis| center[axis]+sign*normal[axis]/length*0.5 }
          klass=defined?(Geom::Point3d) ? Geom::Point3d : Sketchup::Point
          @normal_line=[klass.new(*center),klass.new(*finish)]
        end
      end
    end
    def duplicate_points(points)
      klass=defined?(Geom::Point3d) ? Geom::Point3d : Sketchup::Point
      (points || []).map { |point| klass.new(*point.to_a) }
    end
    def draw(view)
      draw_missing(view)
      (@queued_overlays || {}).each_value do |overlay|
        view.drawing_color='cyan'
        view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,overlay[:triangles]) unless overlay[:triangles].empty?
        view.drawing_color='green'
        view.draw(Object.const_defined?(:GL_LINES) ? Object.const_get(:GL_LINES) : 1,overlay[:normal]) unless overlay[:normal].empty?
      end
      unless (@copy_triangles || []).empty?
        view.drawing_color=immediate? ? hover_color(60) : 'orange'
        view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,@copy_triangles)
      end
      unless @triangles.nil? || @triangles.empty?
        view.drawing_color=immediate? ? hover_color(110) : 'orange'
        view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,@triangles)
        view.drawing_color='blue'
        view.draw(Object.const_defined?(:GL_LINES) ? Object.const_get(:GL_LINES) : 1,@normal_line) unless @normal_line.empty?
      end
      # 2D interface last, over the overlays: bars, strip, tooltip.
      ui_on? ? draw_ui(view) : draw_strip(view)
      draw_tooltip(view)
    end
    # 0.8.17 (cortes): an exception that escapes a Tool callback goes to SketchUp,
    # which prints it, may leave the Tool half-updated and, in draw, repeats it on
    # every frame. Every callback below is wrapped: the error goes to the status
    # bar and the Ruby console, the Tool stays active and nothing else changes.
    def callback_failed(name,error)
      @last_error="#{error.class}: #{error.message}"[0,200]
      # draw repeats on every frame: one console line per distinct failure.
      signature=[name,error.class,error.message]
      warn("Planos Santo pincel: #{name} falló (#{error.class}: #{error.message}); la herramienta sigue activa.") unless signature==@last_failure
      @last_failure=signature
      text="Pincel: falló #{name} (#{error.class}). La herramienta sigue activa; Esc termina."
      if defined?(Sketchup) && Sketchup.respond_to?(:status_text=) && text!=@status_text
        @status_text=text;Sketchup.status_text=text
      end
      nil
    rescue StandardError
      nil
    end
  end

  module SafeToolCallbacks
    # Fallback answer to SketchUp when the callback failed. getMenu is left out:
    # it already answers false on any error and SketchUp reads its arity.
    FALLBACKS={activate:nil,deactivate:nil,suspend:nil,resume:nil,onMouseMove:nil,onLButtonDown:nil,onKeyDown:true,
               onKeyUp:false,onCancel:nil,draw:nil,onSetCursor:false}.freeze
    def self.wrap(klass)
      return if klass.instance_variable_get(:@safe_callbacks) # a reload keeps one wrapper
      klass.instance_variable_set(:@safe_callbacks,true)
      mod=Module.new
      FALLBACKS.each do |name,fallback|
        next unless klass.method_defined?(name)
        parameters=klass.instance_method(name).parameters
        next unless parameters.all? { |kind,_| kind==:req } # same arity as the original
        args=(0...parameters.length).map { |index| "a#{index}" }.join(',')
        mod.module_eval(<<~RUBY,__FILE__,__LINE__+1)
          def #{name}(#{args})
            super # always the current definition, also after a reload
          rescue StandardError=>error
            callback_failed('#{name}',error)
            #{fallback.inspect}
          end
        RUBY
      end
      klass.prepend(mod)
    end
  end
  SafeToolCallbacks.wrap(SmartPaintTool)
end
