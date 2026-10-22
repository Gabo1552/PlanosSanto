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
    def initialize(model, service:, options:, on_event:, guard:, remember:nil, switch_mode:nil, clock:nil, timing:nil, select_material:nil, recents:nil, eyedropper_key:nil)
      @model=model;@service=service;@on_event=on_event;@guard=guard;@remember=remember;@switch_mode=switch_mode;@timing=timing
      @clock=clock || lambda { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      @options=copy(options);@queued_targets=[];@queued_overlays={};@active=false;@generation=0
      @verdicts=PaintVerdict.new(service.respond_to?(:native) ? service.native : nil);@occurrences=OccurrenceIndex.new(model)
      @copy_triangles=[]
      @select_material=select_material;@recents_source=recents;@recents=[];@eyedropper_key=self.class.eyedropper_key!(eyedropper_key || 'alt')
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
      return if @observer || !@model.respond_to?(:add_observer)
      @observer=PaintGenerationObserver.new { @generation+=1 }
      @model.add_observer(@observer)
    rescue StandardError
      @observer=nil
    end
    def unobserve!
      return unless @observer
      @model.remove_observer(@observer) if @model.respond_to?(:remove_observer)
      @observer=nil # only once removed: a failed removal is retried, never leaked
    rescue StandardError
      nil
    end
    def activate
      observe!
      @generation+=1 # transactions while inactive were not observed
      refresh_recents!
      @active=true;emit(immediate? ? 'Hacé clic en una pieza para pintar. Escape termina.' : 'Elegí una cara. Mayús agrega caras; Enter aplica la selección. Esc cancela.')
    end
    def deactivate(view)
      unobserve!;stop_sampling;@depth=0;@stack_key=nil;@active=false;clear;emit('Herramienta desactivada.');invalidate(view)
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
    def draw_tooltip(view)
      return unless immediate? && @mouse && view.respond_to?(:draw_text)
      scale=ui_scale;klass=point_class
      x=@mouse[0]+18*scale;y=@mouse[1]+18*scale
      color=lambda { |rgb| Sketchup::Color.new(*rgb) rescue rgb }
      if @strip_hover && (row=@recents[@strip_hover])
        return view.draw_text(klass.new(x,y,0),"#{row['name']} · clic o #{@strip_hover+1}",{color:color.call([30,30,30]),size:11})
      end
      return unless @hover
      info=material_info;sample=@hover['sample']
      line1=[@hover['name'].to_s.empty? ? 'Pieza sin nombre' : @hover['name'],sample ? 'Cuentagotas' : mode_short]
      line1 << scope_label(@hover['sharedCount'],@hover['sharedTruncated']) unless sample
      line1=line1.join(' · ')
      depth=@hover['depth'];line1+=" (#{depth['index']+1} de #{depth['count']} · ↑/↓)" if depth # PINTURA-11
      bad=sample ? sample['status']!='valid' : blocked?
      line2=if sample then bad ? @sample_reason.to_s : "Tomar: #{sample['name']}"
            else blocked? ? @hover['verdict']['reason'].to_s : info ? info['name'] : (@options['mode']=='remove_edge' ? 'Restaura la placa' : 'Sin material')
            end
      view.draw_text(klass.new(x,y,0),line1,{color:color.call([30,30,30]),size:11})
      view.draw_text(klass.new(x,y+16*scale,0),line2,{color:color.call(bad ? [200,0,0] : [0,128,0]),size:11})
      line3=missing_line(@hover['pieceId']) # F-PINT-C
      view.draw_text(klass.new(x,y+32*scale,0),line3,{color:color.call(line3.start_with?('Falta') ? [200,0,0] : [0,128,0]),size:11}) if line3
    rescue StandardError
      nil
    end
    CURSORS={'piece'=>'paint-piece.png','edge'=>'paint-edge.png','remove'=>'paint-remove.png','blocked'=>'paint-blocked.png','sample'=>'paint-sample.png'}.freeze
    # One native cursor per file and per process; nil -> native cursor.
    def self.cursor_id(name)
      @cursor_ids||={}
      return @cursor_ids[name] if @cursor_ids.key?(name)
      path=File.join(__dir__,'cursors',CURSORS.fetch(name))
      @cursor_ids[name]=defined?(UI) && UI.respond_to?(:create_cursor) && File.file?(path) ? UI.create_cursor(path,3,3) : nil
    rescue StandardError
      @cursor_ids[name]=nil
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
      verify_guard!
      # PINTURA-04: over the recents strip there is no piece pick at all.
      if (index=strip_index(view,x,y))
        @strip_hover=index;@hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
        emit("Reciente #{index+1}: #{@recents[index]['name']}. Clic o tecla #{index+1} para usarlo; no pinta.",hover: :clear)
        return invalidate(view)
      end
      @strip_hover=nil
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
        if (index=strip_index(view,x,y))
          choose_recent(index);return invalidate(view)
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
    def switch_mode
      destination=@options['mode']=='sheet' ? 'edge' : 'sheet'
      missing="Elegí #{destination=='edge' ? 'un canto' : 'una placa'} en la paleta para usar Tab."
      options=@switch_mode && @switch_mode.call(destination)
      return emit(missing) unless options.is_a?(Hash)
      clear;@last_error=nil;@options=copy(options).merge('scope'=>'unique','allowShared'=>false);refresh_recents!
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
      @options['allowShared']=false
      @options['scope']='unique' if immediate?
      refresh_recents!
      # Instant, through the limiter: drops a stale pending hover and resets the signature.
      emit(immediate? ? "Material activo: #{chosen['name']}. Hacé clic en otra pieza." : "Material activo: #{chosen['name']}. Compartidos requieren revisar nuevamente el alcance.",extra:{'requiresSharedReview'=>!immediate?})
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
        stop(view)
        @model.select_tool(nil) if @model.respond_to?(:select_tool)
      end
    end
    def stop(view=nil)
      unobserve!;stop_sampling;clear;@active=false;emit('Pintado cancelado; no se aplicaron las caras pendientes.')
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
      @recents=[]
      return unless recents_on?
      list=@recents_source.call(material_mode)
      @recents=(list.is_a?(Array) ? list : []).select { |row| row.is_a?(Hash) && row['catalogId'].is_a?(String) && !row['catalogId'].empty? }.first(RECENT_LIMIT).map do |row|
        {'catalogId'=>row['catalogId'],'materialUuid'=>row['materialUuid'].to_s,'name'=>row['name'].to_s,'color'=>row['color'].is_a?(Array) ? row['color'].first(3).map(&:to_i) : nil}
      end
    rescue StandardError
      @recents=[]
    end
    def strip_rects(view)
      return [] unless recents_on? && !@recents.empty? && view.respond_to?(:draw2d) && view.respond_to?(:vpheight)
      size=STRIP_SIZE*ui_scale;bottom=view.vpheight.to_f-STRIP_MARGIN
      @recents.each_index.map { |index| left=STRIP_MARGIN+index*(size+STRIP_GAP);[left,bottom-size,left+size,bottom] }
    rescue StandardError
      []
    end
    def strip_index(view,x,y)
      strip_rects(view).index { |left,top,right,bottom| x>=left && x<=right && y>=top && y<=bottom }
    end
    def draw_strip(view)
      rects=strip_rects(view);return if rects.empty?
      klass=point_class;quads=Object.const_defined?(:GL_QUADS) ? Object.const_get(:GL_QUADS) : 7
      loop=Object.const_defined?(:GL_LINE_LOOP) ? Object.const_get(:GL_LINE_LOOP) : 2;width=view.respond_to?(:line_width=)
      rects.each_with_index do |(left,top,right,bottom),index|
        corners=[[left,top],[right,top],[right,bottom],[left,bottom]].map { |x,y| klass.new(x,y,0) }
        row=@recents[index];active=!row['materialUuid'].empty? && row['materialUuid']==@options['materialUuid']
        view.drawing_color=rgba(row['color'] || [200,200,200],255);view.draw2d(quads,corners)
        view.line_width=(active ? 2 : 1) if width
        view.drawing_color=rgba(active ? [0,0,0] : [128,128,128],255);view.draw2d(loop,corners)
      end
      view.line_width=1 if width
      view.draw_text(klass.new(STRIP_MARGIN,rects.first[1]-18*ui_scale,0),'Recientes · clic o 1–6',{size:10}) if view.respond_to?(:draw_text)
    rescue StandardError
      nil
    end
    def choose_recent(index)
      row=recents_on? && @recents[index]
      return false unless row
      verify_guard!
      options=@select_material.call(row['catalogId'],material_mode)
      raise ExportError,'No se pudo preparar el material reciente. Elegilo en la paleta.' unless options.is_a?(Hash) && options['mode']==material_mode
      adopt_options!(options)
      emit("Material activo: #{row['name']}. Hacé clic en una pieza.");true
    rescue StandardError=>error
      emit('No se cambió el material.',error:error.message);true
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
      draw_tooltip(view)
      draw_strip(view)
      return if @triangles.nil? || @triangles.empty?
      view.drawing_color=immediate? ? hover_color(110) : 'orange'
      view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,@triangles)
      view.drawing_color='blue'
      view.draw(Object.const_defined?(:GL_LINES) ? Object.const_get(:GL_LINES) : 1,@normal_line) unless @normal_line.empty?
    end
  end
end
