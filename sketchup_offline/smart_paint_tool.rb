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
    attr_reader :calls,:summary_calls
    def initialize(native);@native=native;@cache={};@calls=0;@summary_calls=0;end
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
      @cache.clear if @cache.length>5000 # shared with the review summaries (up to 2000 pieces)
      @cache[key] ||= compute(node_for(target),target['_face'],mode,edge_count,inherited,key[0,2]+[key[4]])
    end
    def sheet?(material)
      material && defined?(MaterialResolver) && MaterialResolver.observe_binding(material).dig('binding','kind')=='sheet'
    end
    # Physical axes once per definition, generation and scale (verdict + summary).
    def axes(node,key)
      @axes.clear if (@axes ||= {}).length>5000
      found=(@axes[key] ||= begin
        @native.automatic_axes(node)
      rescue ExportError=>error
        error
      end)
      raise found if found.is_a?(ExportError)
      found
    end
    def compute(node,face,mode,count,inherited,axes_key)
      @calls+=1
      axes=axes(node,axes_key)
      faces=@native.expanded_faces(node,[face],mode=='sheet' ? {'mode'=>'sheet','axes'=>axes,'paintScope'=>'piece'} : {'mode'=>mode,'axes'=>axes,'edgeCount'=>count})
      if mode=='edge'
        # F-PINT-B: an edge needs a recognized sheet on a broad face (own or inherited).
        broad=begin
          @native.expanded_faces(node,[face],{'mode'=>'sheet','axes'=>axes,'paintScope'=>'piece'})
        rescue ExportError
          @native.faces(node)-faces
        end
        raise ExportError,NO_SHEET unless broad.any? { |f| sheet?(f.material || inherited) || sheet?(f.back_material || inherited) }
      end
      {'ok'=>true,'reason'=>nil,'expandedFaceIds'=>faces.map { |f| @native.face_id(f) },'faces'=>faces,'axes'=>axes}
    rescue ExportError=>error
      {'ok'=>false,'reason'=>error.message,'expandedFaceIds'=>[],'faces'=>[]}
    end
    # F-PINT-C: what the piece still lacks, same cache key family as the verdict.
    # {sheetName, edgeSides 0..4, state: ok|missingSheet|partialEdges}; never writes.
    def summary(instances,generation)
      inherited=inherited(instances)
      key=[:summary,instances.last.definition.guid.to_s,generation,scales(instances),inherited&.object_id]
      @cache.clear if @cache.length>5000
      @cache[key] ||= compute_summary({'_entity'=>instances.last,'_parents'=>instances[0...-1],'id'=>nil},inherited,key[1,3])
    end
    def compute_summary(node,inherited,axes_key)
      @summary_calls+=1;faces=@native.faces(node)
      frame=begin
        @native.boundary_frame(node,{'axes'=>axes(node,axes_key)})
      rescue ExportError
        nil # not a rectangular board: only the sheet is judged
      end
      broad=frame ? %w[min max].flat_map { |side| frame[:groups][[frame[:thickness],side]] } : faces
      sheet=broad.flat_map { |f| [f.material || inherited,f.back_material || inherited] }.compact.find { |m| sheet?(m) }
      sides=frame ? frame[:axes].flat_map { |axis| [[axis,'min'],[axis,'max']] }.map do |key|
        group=frame[:groups][key];with=group.count { |f| @native.edge_material?(f.material) || @native.edge_material?(f.back_material) }
        with.zero? ? :none : with==group.length ? :full : :mixed
      end : []
      count=sides.count(:full)
      state=!sheet ? 'missingSheet' : sides.include?(:mixed) || count.between?(1,3) ? 'partialEdges' : 'ok'
      {'sheetName'=>sheet && (sheet.respond_to?(:display_name) ? sheet.display_name : sheet.name).to_s,'edgeSides'=>count,'state'=>state}
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
    ALT_MASK = Object.const_defined?(:ALT_MODIFIER_MASK) ? Object.const_get(:ALT_MODIFIER_MASK) : 32
    # PINTURA-07: eyedropper key -> [virtual key, click flag]. SketchUp sends Shift as 16 and Alt as 18.
    SAMPLE_KEYS={'shift'=>[16,SHIFT_MASK],'alt'=>[18,ALT_MASK],'off'=>nil}.freeze
    EDGE_COUNTS=[1,2,4].freeze
    attr_reader :queued_targets,:verdicts,:generation

    HOVER_INTERVAL=0.1
    def initialize(model, service:, options:, on_event:, guard:, remember:nil, switch_mode:nil, clock:nil, timing:nil, sample:nil, sample_key:'shift')
      @sample=sample;@sample_key=SAMPLE_KEYS.key?(sample_key) ? sample_key : 'shift'
      @model=model;@service=service;@on_event=on_event;@guard=guard;@remember=remember;@switch_mode=switch_mode;@timing=timing
      @clock=clock || lambda { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      @options=copy(options);@queued_targets=[];@queued_overlays={};@active=false;@generation=0
      @verdicts=PaintVerdict.new(service.respond_to?(:native) ? service.native : nil);@occurrences=OccurrenceIndex.new(model)
      @copy_triangles=[]
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
      @active=true;emit(immediate? ? 'Hacé clic en una pieza para pintar. Escape termina.' : 'Elegí una cara. Mayús agrega caras; Enter aplica la selección. Esc cancela.')
    end
    def deactivate(view)
      unobserve!;@active=false;clear;emit('Herramienta desactivada.');invalidate(view)
    end
    def suspend(view);invalidate(view);end
    def resume(view);invalidate(view);end
    def update_options(options)
      @options=copy(options);clear;@last_error=nil;emit(immediate? ? 'Material activo. Hacé clic en otra pieza; Escape termina.' : 'Configuración actualizada; elegí nuevamente las caras.')
    end
    def status
      result={'active'=>@active,'mode'=>@options['mode'],'hover'=>@hover && copy(@hover),'queuedCount'=>@queued_targets.sum { |target| target['faceIds'].length },
              'options'=>@options.slice('mode','paintScope','edgeCount','immediate','immediatePiece','catalogId','materialUuid','side','scope','axes','batch').merge('sampleKey'=>@sample_key,'reviewMissing'=>@review==true)}
      result['sampling']=true if @sample_held
      result['review']=review_state[:data] if @review && immediate?
      result
    end
    # Palette options applied to the live tool without restarting it (§7).
    def tool_option(key,value)
      case key
      when 'sampleKey'
        raise ExportError,'Tecla del cuentagotas inválida.' unless value.is_a?(String) && SAMPLE_KEYS.key?(value)
        @sample_key=value;@sample_held=false;@sampled=nil
        emit(value=='off' ? 'Cuentagotas temporal desactivado.' : "Cuentagotas temporal: mantené #{sample_label} y hacé clic.")
      when 'reviewMissing'
        raise ExportError,'Valor de revisión inválido.' unless [true,false].include?(value)
        review!(value)
      else
        raise ExportError,'Opción de herramienta inválida.'
      end
    end
    def review!(value)
      @review=value;@review_cache=nil
      return emit('Revisión apagada.') unless value
      data=review_state[:data]
      emit("Revisar lo que falta: sin placa #{data['missingSheet']} · cantos parciales #{data['partialEdges']}#{data['truncated'] ? ' (parcial)' : ''}.")
    end
    REVIEW_LIMIT=2000
    def leaf?(entity)
      @leaf_cache ||= {}.compare_by_identity
      @leaf_cache.fetch(entity.definition) do
        items=entities_for(entity)
        @leaf_cache[entity.definition]=items.any? { |e| e.is_a?(Sketchup::Face) } && items.none? { |e| instance?(e) }
      end
    end
    # Every leaf piece (cap 2000) judged once per generation; hidden ones are skipped.
    def review_state
      return @review_cache if @review_cache && @review_cache[:generation]==@generation
      @leaf_cache=nil
      paths=@occurrences.all_paths(@generation).select { |path| path.none? { |e| e.respond_to?(:hidden?) && e.hidden? } && leaf?(path.last) }
      truncated=@occurrences.truncated? || paths.length>REVIEW_LIMIT;marks=[]
      paths.first(REVIEW_LIMIT).each do |path|
        state=begin
          @verdicts.summary(path,@generation)['state']
        rescue StandardError
          nil
        end
        marks << [path,state] if %w[missingSheet partialEdges].include?(state)
      end
      data={'active'=>true,'missingSheet'=>marks.count { |_,st| st=='missingSheet' },'partialEdges'=>marks.count { |_,st| st=='partialEdges' },'truncated'=>truncated}
      @review_cache={generation:@generation,data:data,marks:marks}
    end
    def review_triangles
      cache=review_state
      cache[:triangles] ||= cache[:marks].each_with_object({'missingSheet'=>[],'partialEdges'=>[]}) do |(path,state),out|
        entities_for(path.last).grep(Sketchup::Face).each { |face| out[state].concat(triangles_for(path,face)) }
      end
    end
    # ---- PINTURA-07: temporary eyedropper (read-only until the key is released).
    def sample_label;@sample_key=='alt' ? 'Alt' : 'Mayús';end
    def sample_code;(SAMPLE_KEYS[@sample_key] || [])[0];end
    def sample_flag?(flags);mask=(SAMPLE_KEYS[@sample_key] || [])[1];mask && flags.is_a?(Integer) && (flags & mask)!=0;end
    def sampling?(flags);immediate? && SAMPLE_KEYS[@sample_key] && (@sample_held || sample_flag?(flags));end
    def take_sample(view,x,y)
      verify_guard!
      target=hit(view,x,y)
      return emit('Apuntá a una pieza para tomar su material.') unless target
      raise ExportError,'El cuentagotas no está disponible en esta paleta.' unless @sample
      options=@sample.call(target)
      raise ExportError,'No se pudo tomar el material de esta pieza.' unless options.is_a?(Hash) && %w[sheet edge].include?(options['mode'])
      @sampled=copy(options)
      emit("Material tomado: #{options['sampleName'] || 'material de la pieza'}. Soltá #{sample_label} para pintar con él.")
    rescue ExportError=>error
      @sampled=nil;emit('No se tomó el material; no cambió nada.',error:error.message)
    end
    def commit_sample!
      options=@sampled;@sampled=nil
      return emit('Hacé clic en una pieza para pintar. Escape termina.') unless options
      name=options.delete('sampleName')
      clear;@last_error=nil;@options=options.merge('scope'=>'unique','allowShared'=>false)
      @remember.call(copy(@options)) if @remember
      emit("#{MODE_LABELS[@options['mode']]} · #{name || 'material tomado'}. Hacé clic en una pieza.")
    end
    def onKeyUp(key,_repeat,_flags,view)
      return false unless immediate? && sample_code && key==sample_code
      held=@sample_held;@sample_held=false
      held || @sampled ? commit_sample! : nil
      invalidate(view);true
    rescue StandardError=>error
      emit('No se aplicó el material tomado.',error:error.message);invalidate(view)
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
      [event['message'],event['error'],hover['pieceId'],hover['faceId'],hover['sharedCount'],hover['sharedTruncated'],verdict['ok'],verdict['reason'],hover['edgeCount'],hover['scope'],event['mode'],hover['depth'],hover['summary']]
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
    def draw_tooltip(view)
      return unless immediate? && @hover && @mouse && view.respond_to?(:draw_text)
      scale=ui_scale
      klass=defined?(Geom::Point3d) ? Geom::Point3d : Sketchup::Point
      x=@mouse[0]+18*scale;y=@mouse[1]+18*scale
      info=material_info
      depth=@hover['depth']
      line1=[@hover['name'].to_s.empty? ? 'Pieza sin nombre' : @hover['name'],mode_short,scope_label(@hover['sharedCount'],@hover['sharedTruncated']),depth && "#{depth['index']}/#{depth['count']} bajo el cursor"].compact.join(' · ')
      line2=@sample_held ? 'Clic toma el material de esta pieza' : blocked? ? @hover['verdict']['reason'].to_s : info ? info['name'] : (@options['mode']=='remove_edge' ? 'Restaura la placa' : 'Sin material')
      color=lambda { |rgb| Sketchup::Color.new(*rgb) rescue rgb }
      view.draw_text(klass.new(x,y,0),line1,{color:color.call([30,30,30]),size:11})
      view.draw_text(klass.new(x,y+16*scale,0),line2,{color:color.call(blocked? && !@sample_held ? [200,0,0] : [0,128,0]),size:11})
      summary=@hover['summary']
      view.draw_text(klass.new(x,y+32*scale,0),"Placa: #{summary['sheetName'] || 'sin placa'} · Cantos: #{summary['edgeSides']}/4",{color:color.call([30,30,30]),size:11}) if @review && summary
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
      return 'sample' if @sample_held && immediate?
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
    def hit(view,x,y)
      picker=view.pick_helper;picker.do_pick(x,y)
      count=picker.respond_to?(:count) ? picker.count : 1
      return (@stack_ids=nil) if count.zero?
      first=target_at(picker,0)
      return (@stack_ids=nil) unless first
      list=[first]
      # PINTURA-11: distinct pieces under the cursor, nearest first. A deeper
      # pick never replaces an unresolved nearest one (validation 0.8.10 R1).
      (1...count).each do |index|
        break if list.length>=16
        target=begin
          target_at(picker,index)
        rescue ExportError
          nil
        end
        list << target if target && list.none? { |row| row['pieceId']==target['pieceId'] }
      end if immediate?
      choose_depth(list,x,y)
    end
    def ui_scale;defined?(UI) && UI.respond_to?(:scale_factor) ? UI.scale_factor.to_f : 1.0;end
    DEPTH_PX=6
    # The chosen depth survives moves under 6 px (x UI scale) over the same pieces.
    def choose_depth(list,x,y)
      ids=list.map { |row| row['pieceId'] };@stack_ids=ids
      kept=@depth && @depth[:ids]==ids && Math.hypot(x-@depth[:at][0],y-@depth[:at][1])<DEPTH_PX*ui_scale
      @depth=nil unless kept
      index=kept ? @depth[:index] : 0
      list.length>1 ? list[index].merge('depth'=>{'index'=>index+1,'count'=>list.length}) : list[index]
    end
    def depth_step(step,view)
      ids=@stack_ids
      return emit('No hay otra pieza bajo el cursor.') unless ids && ids.length>1 && @mouse
      @depth={ids:ids,index:((@depth ? @depth[:index] : 0)+step)%ids.length,at:@mouse.dup}
      @instant_hover=true
      begin
        onMouseMove(0,@mouse[0],@mouse[1],view)
      ensure
        @instant_hover=false
      end
    end
    def target_at(picker,index)
      path=picker.path_at(index);leaf=picker.leaf_at(index)
      path=path.to_a if path.respond_to?(:to_a)
      return nil unless path.is_a?(Array)
      if defined?(Sketchup::Edge) && leaf.is_a?(Sketchup::Edge)
        path=path.dup;path.pop if path.last.equal?(leaf)
        leaf=face_of_edge(picker,path,leaf)
      end
      return nil unless leaf.is_a?(Sketchup::Face)
      path=path.dup
      path << leaf unless path.last.equal?(leaf)
      return nil unless path.last.equal?(leaf) && path[0...-1].all? { |entity| instance?(entity) }
      active=(@model.respond_to?(:active_path) && @model.active_path) || []
      active=active.to_a
      cache_key=[path,active]
      cached=immediate? && @pick_cache && @pick_cache[cache_key]
      return cached if cached && path.all? { |entity| !entity.respond_to?(:valid?) || entity.valid? }
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
        @pick_cache=nil if @pick_cache && @pick_cache.length>64
        (@pick_cache ||= {})[cache_key]=target
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
        # Pick-local feedback only: no inventory, geometry classification,
        # catalog I/O, UUID validation or mutation until the actual click.
        @target=target;@preview=nil;@copy_triangles=[]
        copies=copies_of(target);@shared_count=[copies.length,1].max;@shared_truncated=@occurrences.truncated?
        @hover={'pieceId'=>target['pieceId'],'faceId'=>target['faceIds'].first,'name'=>target['name'],'side'=>@options['side'],'edgeCount'=>edge_count,'scope'=>scope,'sharedCount'=>@shared_count}
        @hover['sharedTruncated']=true if @shared_truncated
        @hover['depth']=target['depth'] if target['depth']
        if @verdicts.available?
          summary=(@verdicts.summary(target['_instances'],@generation) rescue nil)
          @hover['summary']=summary.slice('sheetName','edgeSides') if summary
        end
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
          emit(verdict['ok'] ? (@options['mode']=='sheet' ? 'Clic para pintar esta pieza. Escape termina.' : 'Clic para pintar este canto. Escape termina.') : 'No se puede pintar acá.',error:verdict['reason'],hover:hover_kind)
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
        emit(@options['mode']=='sheet' ? 'Clic para pintar esta pieza. Escape termina.' : 'Clic para pintar este canto. Escape termina.',hover:hover_kind)
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
    # A depth change (keyboard) is instant; plain hovers go through the limiter.
    def hover_kind;@instant_hover ? :clear : true;end
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
    def onMouseMove(flags,x,y,view)
      @mouse=[x,y];key=nil
      commit_sample! if @sampled && !@sample_held && !sample_flag?(flags)
      verify_guard!
      target=hit(view,x,y)
      unless target
        @hover=nil;@target=nil;@preview=nil;@hit_key=nil;@failed_key=nil;@triangles=[];@normal_line=[];@copy_triangles=[]
        @service.cancel;emit('Apuntá a una cara de una pieza.',hover: :clear);invalidate(view);return
      end
      key=[target['pieceId'],immediate? && @options['mode']=='sheet' ? nil : target['faceIds'],@generation]
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
      if sampling?(flags)
        take_sample(view,x,y);invalidate(view);return
      end
      if immediate?
        @click_started=@clock.call
        verify_guard!
        @pick_cache=nil
        target=hit(view,x,y)
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
      clear;@last_error=nil;@options=copy(options).merge('scope'=>'unique','allowShared'=>false)
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
      # Instant, through the limiter: drops a stale pending hover and resets the signature.
      emit(immediate? ? "Material activo: #{chosen['name']}. Hacé clic en otra pieza." : "Material activo: #{chosen['name']}. Compartidos requieren revisar nuevamente el alcance.",extra:{'requiresSharedReview'=>!immediate?})
    end
    def onKeyDown(key,repeat,flags,view)
      if immediate? && sample_code && key==sample_code
        return true if @sample_held || (repeat.is_a?(Integer) && repeat>1)
        @sample_held=true;@sampled=nil
        emit("Cuentagotas: hacé clic en una pieza para tomar su material; soltá #{sample_label} para pintar con él.");invalidate(view);true
      elsif immediate? && key==82
        return true if repeat.is_a?(Integer) && repeat>1
        review!(!@review);invalidate(view);true
      elsif key==27
        onCancel(0,view);true
      elsif key==13 && !@queued_targets.empty?
        apply_targets(copy(@queued_targets));invalidate(view);true
      elsif key==9
        verify_guard!
        return true if repeat.is_a?(Integer) && repeat>1
        @sample_held=false;@sampled=nil # Shift+Tab is still Tab: it drops the eyedropper
        if immediate? && (flags & CTRL_MASK)!=0
          cycle_edge_count((flags & SHIFT_MASK)!=0)
        elsif immediate?
          switch_mode
        else
          keyboard_submode((flags & SHIFT_MASK)!=0)
        end
        invalidate(view);true
      elsif [37,38,39,40].include?(key)
        verify_guard!
        return true if repeat.is_a?(Integer) && repeat>1
        # Immediate: Up/Down pick the piece behind (PINTURA-11), Left/Right the material.
        if immediate? && [38,40].include?(key) then depth_step(key==40 ? 1 : -1,view)
        else keyboard_material([37,38].include?(key))
        end
        invalidate(view);true
      end
    rescue StandardError=>error
      @service.cancel;emit('No se aplicó la selección.',error:error.message);invalidate(view)
    end
    # ---- PINTURA-13: context menu (immediate brush). Choosing «Todas» here IS the
    # explicit consent, like the palette toggle, and resets with the same rules.
    MF=%i[MF_ENABLED MF_GRAYED MF_CHECKED MF_UNCHECKED].zip([0,1,8,0]).to_h { |name,fallback| [name,Object.const_defined?(name) ? Object.const_get(name) : fallback] }.freeze
    # Pieces hidden by the brush, per model, for the whole SketchUp session.
    def self.hidden_by_brush;@hidden_by_brush ||= {}.compare_by_identity;end
    def hidden_list;self.class.hidden_by_brush[@model] ||= [];end
    def getMenu(menu,_flags,x,y,view)
      return false unless immediate? && menu.respond_to?(:add_item)
      target=begin
        hit(view,x,y)
      rescue StandardError
        nil
      end
      shared=target ? [copies_of(target).length,1].max : nil
      item=lambda do |label,checked=nil,&action|
        id=menu.add_item(label) do
          begin
            action.call;invalidate(view)
          rescue StandardError=>error
            emit('No se aplicó la opción del menú.',error:error.message);invalidate(view)
          end
        end
        menu.set_validation_proc(id) { checked.call ? MF[:MF_CHECKED] : MF[:MF_UNCHECKED] } if checked && menu.respond_to?(:set_validation_proc)
      end
      separator=lambda { menu.add_separator if menu.respond_to?(:add_separator) }
      item.call('Solo esta',-> { scope=='unique' }) { menu_scope('unique') }
      item.call(shared ? "Todas las iguales (#{shared})" : 'Todas las iguales',-> { scope=='all' }) { menu_scope('all') }
      if %w[edge remove_edge].include?(@options['mode'])
        separator.call
        {1=>'1 canto',2=>'2 cantos opuestos',4=>'4 cantos'}.each { |count,label| item.call(label,-> { edge_count==count }) { menu_edge_count(count) } }
      end
      separator.call
      item.call('Pintar pieza',-> { @options['mode']=='sheet' }) { switch_mode unless @options['mode']=='sheet' }
      item.call('Pintar canto',-> { @options['mode']=='edge' }) { switch_mode unless @options['mode']=='edge' }
      separator.call
      item.call('Ocultar esta pieza') { hide_piece(target) }
      item.call('Mostrar piezas ocultadas por el pincel') { show_hidden }
      separator.call
      item.call('Revisar lo que falta',-> { @review==true }) { review!(!@review) }
      true
    end
    def menu_scope(value)
      clear;@last_error=nil;@options['scope']=value;@options['allowShared']=value=='all'
      @remember.call(copy(@options)) if @remember
      emit(value=='all' ? 'Todas las iguales: el clic pinta todas las copias con un solo Undo.' : 'Solo esta: el clic pinta solo la pieza apuntada.')
    end
    def menu_edge_count(count)
      clear;@last_error=nil;@options['edgeCount']=count
      @remember.call(copy(@options)) if @remember
      emit("#{edge_label(count)} por clic. Revisá el resaltado antes de hacer clic.")
    end
    def visibility_operation(name)
      raise ExportError,'No se pudo iniciar la operación.' unless @model.start_operation(name,true)
      begin
        yield
        raise ExportError,'No se pudo confirmar la operación.' unless @model.commit_operation
      rescue StandardError
        @model.abort_operation if @model.respond_to?(:abort_operation)
        raise
      end
      @generation+=1;clear
    end
    def hide_piece(target)
      verify_guard!
      raise ExportError,'Apuntá a una pieza para ocultarla.' unless target
      instances=target['_instances'];entity=instances.last
      raise ExportError,PaintVerdict::LOCKED if instances.any? { |e| e.respond_to?(:locked?) && e.locked? }
      raise ExportError,'Esta pieza no se puede ocultar.' unless entity.respond_to?(:hidden=)
      visibility_operation('Ocultar pieza (Planos Santo)') { entity.hidden=true }
      hidden_list << entity unless hidden_list.any? { |e| e.equal?(entity) }
      emit('Pieza oculta. Ctrl+Z o «Mostrar piezas ocultadas por el pincel» la vuelven a mostrar.',changed:true)
    end
    def show_hidden
      verify_guard!
      list=hidden_list.select { |e| (!e.respond_to?(:valid?) || e.valid?) && e.respond_to?(:hidden?) && e.hidden? }
      return (hidden_list.clear;emit('No hay piezas ocultadas por el pincel.')) if list.empty?
      visibility_operation('Mostrar piezas ocultadas (Planos Santo)') { list.each { |e| e.hidden=false } }
      hidden_list.clear # only after the commit: a refused operation keeps the list
      emit("Se mostraron #{list.length} #{list.length==1 ? 'pieza' : 'piezas'} ocultadas por el pincel.",changed:true)
    end
    # SketchUp reasons: 0 Escape, 1 tool reselected, 2 Undo. Ctrl+Z (which the
    # messages recommend) must keep the operator in the brush.
    def onCancel(reason,view)
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
      unobserve!;clear;@active=false;emit('Pintado cancelado; no se aplicaron las caras pendientes.')
      invalidate(view)
    end
    def world_point(point,matrix)
      a=point.to_a
      xyz=3.times.map { |row| matrix[row]*a[0]+matrix[4+row]*a[1]+matrix[8+row]*a[2]+matrix[12+row] }
      defined?(Geom::Point3d) ? Geom::Point3d.new(*xyz) : Sketchup::Point.new(*xyz)
    end
    def triangles_for(instances,face,transformation=nil)
      transformation ||= instances.inject(Geom::Transformation.new) { |world,entity| world*entity.transformation }.to_a
      mesh=face.mesh(0);points=mesh.points.map { |point| world_point(point,transformation) }
      mesh.polygons.flat_map do |polygon|
        indices=polygon.map { |index| index.abs-1 }
        (1...(indices.length-1)).flat_map { |i| [points[indices[0]],points[indices[i]],points[indices[i+1]]] }
      end
    end
    def build_overlay(target)
      transformation=target['_instances'].inject(Geom::Transformation.new) { |world,entity| world*entity.transformation }.to_a
      @triangles=triangles_for(target['_instances'],target['_face'],transformation)
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
      if @review && immediate?
        {'missingSheet'=>[220,30,30],'partialEdges'=>[230,150,20]}.each do |state,rgb|
          points=review_triangles[state]
          next if points.empty?
          view.drawing_color=rgba(rgb,70);view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,points)
        end
      end
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
      return if @triangles.nil? || @triangles.empty?
      view.drawing_color=immediate? ? hover_color(110) : 'orange'
      view.draw(Object.const_defined?(:GL_TRIANGLES) ? Object.const_get(:GL_TRIANGLES) : 4,@triangles)
      view.drawing_color='blue'
      view.draw(Object.const_defined?(:GL_LINES) ? Object.const_get(:GL_LINES) : 1,@normal_line) unless @normal_line.empty?
    end
  end
end
