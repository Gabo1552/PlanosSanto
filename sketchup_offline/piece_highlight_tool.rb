# frozen_string_literal: true
require_relative 'smart_paint_tool'

module PlanosSanto
  # A transient native viewport overlay for one complete instance occurrence.
  # It shares SmartPaintTool's transformed mesh drawing, never its paint service.
  class PieceHighlightTool < SmartPaintTool
    class ReadOnlyContext
      def cancel; end
    end

    def initialize(model, piece_id:, guard:, on_event:)
      raise ExportError, 'Elegí una pieza con ruta de instancia completa.' unless piece_id.is_a?(String) && piece_id.bytesize <= 2048 && /\A[1-9]\d*(?:\/[1-9]\d*){0,63}\z/.match?(piece_id)
      @piece_id = piece_id
      super(model, service: ReadOnlyContext.new, options: {'mode'=>'highlight','side'=>'front'}, guard:guard, on_event:on_event)
      @instances = resolve_path
      own_faces(@instances.last)
    end

    def valid_entity?(entity)
      (!entity.respond_to?(:valid?) || entity.valid?) && (!entity.respond_to?(:deleted?) || !entity.deleted?)
    end

    def resolve_path
      entities = @model.entities.to_a
      @piece_id.split('/').map do |id|
        matches = entities.select { |entity| instance?(entity) && valid_entity?(entity) && persistent(entity)==id }
        raise ExportError, 'La pieza cambió o la ruta de instancia no es completa. Volvé a analizar.' unless matches.length==1
        entity = matches.first
        matrix = entity.transformation.to_a
        unless matrix.is_a?(Array) && matrix.length==16 && matrix.all? { |value| value.is_a?(Numeric) && value.finite? }
          raise ExportError, 'La pieza tiene una transformación inválida.'
        end
        entities = entities_for(entity)
        entity
      end
    end

    def own_faces(instance)
      faces = entities_for(instance).grep(Sketchup::Face).select { |face| valid_entity?(face) }
      raise ExportError, 'Elegí una pieza con caras propias, no un mueble o grupo contenedor.' if faces.empty?
      faces
    end

    def current!
      verify_guard!
      raise ExportError, 'La pieza cambió. Volvé a analizar.' unless resolve_path==@instances
      own_faces(@instances.last)
    end

    def activate
      faces = current!
      triangles = []; normals = []
      faces.each do |face|
        build_overlay('_instances'=>@instances,'_face'=>face)
        triangles.concat(@triangles); normals.concat(@normal_line)
      end
      @triangles=triangles;@normal_line=normals;@active=true
      name=@instances.last.name.to_s
      name=@instances.last.definition.name.to_s if name.empty?
      @hover={'pieceId'=>@piece_id,'name'=>name,'affectedPaths'=>[@piece_id],'faceCount'=>faces.length,'sharedCount'=>1,'side'=>'front'}
      emit('Pieza resaltada en SketchUp. Esc o clic finaliza; no modifica el modelo.')
      invalidate(@model.active_view) if @model.respond_to?(:active_view)
    end

    def status
      super.merge('mode'=>'highlight','pieceId'=>@piece_id)
    end

    def draw(view)
      return unless @active
      current!
      super
    rescue StandardError => error
      fail_readonly(error,view)
    end

    def onMouseMove(_flags,_x,_y,view)
      return unless @active
      current!
      invalidate(view)
    rescue StandardError => error
      fail_readonly(error,view)
    end

    def fail_readonly(error,view)
      clear;@active=false
      emit('No se puede mantener el resaltado. Volvé a analizar.',error:error.message)
      invalidate(view)
    end

    def onLButtonDown(_flags,_x,_y,view);onCancel(0,view);end
    def onKeyDown(key,_repeat,_flags,view);onCancel(0,view) if key==27;end
    def stop(view=nil)
      clear;@active=false
      emit('Resaltado finalizado. No se modificó el modelo.')
      invalidate(view)
    end

    def apply_targets(_targets)
      raise ExportError, 'El resaltado es de solo lectura.'
    end
    def queue(_target)
      raise ExportError, 'El resaltado no acumula caras para pintar.'
    end
  end
end
