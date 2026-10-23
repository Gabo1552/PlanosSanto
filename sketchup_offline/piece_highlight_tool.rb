# frozen_string_literal: true
require_relative 'smart_paint_tool'

module PlanosSanto
  # A transient native viewport overlay for one or more complete instance
  # occurrences (a cutlist row groups identical pieces). It shares
  # SmartPaintTool's helpers, never its paint service, and never writes the model.
  #
  # 0.8.20 («Piezas → ver en SketchUp»): before, the overlay was the only cue.
  # It did not move the camera (a piece off screen or inside a closed carcass
  # stayed invisible), it showed only the first instance of a grouped row, it
  # was drawn coplanar with the faces (hidden behind any other board) and the
  # click that brings SketchUp to the front ended it. Now `show!` also selects
  # the occurrences and frames the camera on them; the overlay adds an outline
  # drawn in 2D over everything, and only Esc, another tool or «Volver a la
  # vista anterior» end it. `snapshot`/`restore` keep the camera, the open
  # context and the selection from before the first look.
  #
  # Nested pieces: SketchUp shows a selection only inside the open context
  # (Model#active_path). When every shown occurrence has the same parent path
  # the tool opens that context (active_path=, SketchUp 2020+) and selects the
  # pieces; when their parents differ the selection is left as it was and the
  # overlay plus the framing show them all (stepping one by one selects each).
  class PieceHighlightTool < SmartPaintTool
    class ReadOnlyContext
      def cancel; end
    end

    MAX_PIECES = 500
    PATH = /\A[1-9]\d*(?:\/[1-9]\d*){0,63}\z/.freeze
    # Seconds of the camera transition (View#camera= [camera, seconds]).
    TRANSITION = 0.4
    # Room around the pieces when framing: 1 = touching the borders.
    MARGIN = 1.3
    FOCUS_RGB = [255,120,0].freeze
    OTHER_RGB = [255,190,60].freeze
    OUTLINE_RGB = [200,40,20].freeze
    # Box edges by corner index (bit 0 = x, bit 1 = y, bit 2 = z).
    BOX_EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]].freeze

    def self.valid_id?(id)
      id.is_a?(String) && id.bytesize <= 2048 && PATH.match?(id)
    end

    attr_reader :piece_ids, :missing_ids, :focus

    def initialize(model, guard:, on_event:, piece_id: nil, piece_ids: nil, focus: nil)
      ids = piece_ids.nil? ? [piece_id] : piece_ids
      unless ids.is_a?(Array) && !ids.empty? && ids.length <= MAX_PIECES && ids.all? { |id| self.class.valid_id?(id) }
        raise ExportError, 'Elegí una pieza con ruta de instancia completa.'
      end
      ids = ids.uniq
      raise ExportError, 'La instancia pedida no es de esta fila.' unless focus.nil? || (focus.is_a?(Integer) && focus >= 0 && focus < ids.length)
      @piece_ids = ids; @focus = focus
      super(model, service: ReadOnlyContext.new, options: {'mode'=>'highlight','side'=>'front'}, guard:guard, on_event:on_event)
      @shown = []; @missing_ids = []
      ids.each do |id|
        instances = resolve_path(id)
        own_faces(instances.last)
        @shown << {'id'=>id,'instances'=>instances}
      rescue ExportError
        # One id keeps the exact reason; in a group the others are still shown.
        raise if ids.length == 1 || (focus && ids[focus] == id)
        @missing_ids << id
      end
      raise ExportError, 'Ninguna de estas piezas sigue en el modelo: cambió o se borró. Tocá Generar para volver a leer.' if @shown.empty?
      @piece_id = focus ? ids[focus] : @shown.first['id']
      @instances = @shown.find { |row| row['id'] == @piece_id }['instances']
      @overlays = []; @overlay_key = nil
    end

    def valid_entity?(entity)
      (!entity.respond_to?(:valid?) || entity.valid?) && (!entity.respond_to?(:deleted?) || !entity.deleted?)
    end

    def resolve_path(piece_id = @piece_id)
      entities = @model.entities.to_a
      piece_id.split('/').map do |id|
        matches = entities.select { |entity| instance?(entity) && valid_entity?(entity) && persistent(entity) == id }
        raise ExportError, 'La pieza cambió o la ruta de instancia no es completa. Volvé a analizar.' unless matches.length == 1
        entity = matches.first
        matrix = entity.transformation.to_a
        unless matrix.is_a?(Array) && matrix.length == 16 && matrix.all? { |value| value.is_a?(Numeric) && value.finite? }
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

    # Occurrences that get the strong colour, the selection and the framing.
    def targets
      @focus ? @shown.select { |row| row['id'] == @piece_id } : @shown
    end

    def current!
      verify_guard!
      @shown.each do |row|
        raise ExportError, 'La pieza cambió. Volvé a analizar.' unless resolve_path(row['id']) == row['instances']
        own_faces(row['instances'].last)
      end
    end

    def active_list
      path = @model.respond_to?(:active_path) ? @model.active_path : nil
      path.respond_to?(:to_a) ? path.to_a : []
    end

    # World matrix (array of 16) of a complete path. Inside an open context
    # SketchUp reports the instances of the active entities already in world
    # coordinates, so the open ancestors are not multiplied a second time.
    def world_matrix(instances)
      active = active_list
      inside = !active.empty? && instances.length > active.length && instances.first(active.length).zip(active).all? { |a,b| a.equal?(b) }
      chain = inside ? instances.drop(active.length) : instances
      chain.inject(Geom::Transformation.new) { |world,entity| world*entity.transformation }.to_a
    end

    def overlay_for(row)
      matrix = world_matrix(row['instances'])
      triangles = []; local = []
      own_faces(row['instances'].last).each do |face|
        mesh = face.mesh(0); points = mesh.points
        local.concat(points.map(&:to_a))
        world = points.map { |point| world_point(point,matrix) }
        mesh.polygons.each do |polygon|
          indices = polygon.map { |index| index.abs-1 }
          (1...(indices.length-1)).each { |i| triangles.push(world[indices[0]],world[indices[i]],world[indices[i+1]]) }
        end
      end
      low = 3.times.map { |axis| local.map { |xyz| xyz[axis] }.min }
      high = 3.times.map { |axis| local.map { |xyz| xyz[axis] }.max }
      corners = 8.times.map { |bits| world_point(point_class.new(*3.times.map { |axis| bits[axis] == 1 ? high[axis] : low[axis] }),matrix) }
      {'id'=>row['id'],'triangles'=>triangles,'corners'=>corners,'focus'=>targets.include?(row)}
    end

    # Rebuilt when the open context changes (the world coordinates change with it).
    def overlays
      key = active_list.map(&:object_id)
      return @overlays if key == @overlay_key && !@overlays.empty?
      @overlay_key = key
      @overlays = @shown.map { |row| overlay_for(row) }
    end

    def activate
      current!
      @overlay_key = nil
      list = overlays
      @triangles = list.flat_map { |overlay| overlay['triangles'] }; @normal_line = []; @active = true
      name = @instances.last.name.to_s
      name = @instances.last.definition.name.to_s if name.empty?
      faces = targets.sum { |row| own_faces(row['instances'].last).length }
      @hover = {'pieceId'=>@piece_id,'name'=>name,'affectedPaths'=>@shown.map { |row| row['id'] },'faceCount'=>faces,'sharedCount'=>@shown.length,'side'=>'front'}
      emit('Pieza resaltada en SketchUp. Esc o la barra espaciadora terminan; no modifica el modelo.')
      invalidate(@model.active_view) if @model.respond_to?(:active_view)
    end

    def status
      super.merge('mode'=>'highlight','pieceId'=>@piece_id,'pieceIds'=>@shown.map { |row| row['id'] },'focus'=>@focus)
    end

    # Selection and framing for «ver en SketchUp». Never an operation: neither
    # the selection, the open context nor the camera are undo steps.
    def show!(view = (@model.respond_to?(:active_view) ? @model.active_view : nil))
      current!
      context = select!
      @overlay_key = nil
      framed = frame!(view)
      invalidate(view)
      {'pieceIds'=>@shown.map { |row| row['id'] },'missing'=>@missing_ids.dup,'count'=>@shown.length,'total'=>@piece_ids.length,
       'focus'=>@focus,'selected'=>context[:selected],'context'=>context[:context],'framed'=>framed}
    end

    def same_path?(a,b)
      a.length == b.length && a.zip(b).all? { |x,y| x.equal?(y) }
    end

    def select!
      leaves = targets.map { |row| row['instances'].last }
      parents = targets.map { |row| row['instances'][0...-1] }
      return {selected:0,context:'mixed'} unless parents.all? { |parent| same_path?(parent,parents.first) }
      parent = parents.first; context = 'kept'
      unless same_path?(parent,active_list)
        return {selected:0,context:'unavailable'} unless @model.respond_to?(:active_path=)
        begin
          @model.active_path = parent.empty? ? nil : parent
        rescue StandardError
          return {selected:0,context:'unavailable'}
        end
        context = 'opened'
      end
      selection = @model.respond_to?(:selection) ? @model.selection : nil
      return {selected:0,context:context} unless selection.respond_to?(:clear)
      selection.clear
      selection.respond_to?(:add) ? selection.add(leaves) : selection.concat(leaves)
      {selected:leaves.length,context:context}
    end

    # Same direction and kind of camera, centred on the box of the pieces.
    def frame!(view)
      return false unless view.respond_to?(:camera) && view.respond_to?(:camera=) && defined?(Sketchup::Camera)
      camera = view.camera
      points = overlays.select { |overlay| overlay['focus'] }.flat_map { |overlay| overlay['corners'].map(&:to_a) }
      return false if points.empty?
      low = 3.times.map { |axis| points.map { |xyz| xyz[axis] }.min }
      high = 3.times.map { |axis| points.map { |xyz| xyz[axis] }.max }
      center = 3.times.map { |axis| (low[axis]+high[axis])/2.0 }
      radius = [Math.sqrt(3.times.sum { |axis| (high[axis]-low[axis])**2 })/2.0,1.0].max
      eye = camera.eye.to_a; target = camera.target.to_a
      direction = 3.times.map { |axis| target[axis]-eye[axis] }
      length = Math.sqrt(direction.sum { |value| value*value })
      direction = length > 1e-9 ? direction.map { |value| value/length } : [0.0,1.0,0.0]
      aspect = view.respond_to?(:vpwidth) && view.respond_to?(:vpheight) && view.vpheight.to_f > 0 ? view.vpwidth.to_f/view.vpheight.to_f : 1.0
      perspective = !camera.respond_to?(:perspective?) || camera.perspective?
      if perspective
        half = camera.fov.to_f*Math::PI/360.0
        vertical = !camera.respond_to?(:fov_is_height?) || camera.fov_is_height? ? half : Math.atan(Math.tan(half)/aspect)
        horizontal = Math.atan(Math.tan(vertical)*aspect)
        distance = radius*MARGIN/Math.sin([[vertical,horizontal].min,0.01].max)
      else
        distance = radius*4.0
      end
      klass = point_class
      framed = Sketchup::Camera.new(klass.new(*3.times.map { |axis| center[axis]-direction[axis]*distance }),klass.new(*center),camera.up,perspective,camera.fov)
      framed.height = 2.0*radius*MARGIN/[aspect,1.0].min unless perspective
      view.camera = [framed,TRANSITION]
      true
    end

    # Camera, open context and selection before the first look («Volver a la vista anterior»).
    def self.snapshot(model)
      view = model.respond_to?(:active_view) ? model.active_view : nil
      camera = view.respond_to?(:camera) ? copy_camera(view.camera) : nil
      path = model.respond_to?(:active_path) ? model.active_path : nil
      selection = model.respond_to?(:selection) && model.selection.respond_to?(:to_a) ? model.selection.to_a : []
      {model:model,camera:camera,active_path:path.respond_to?(:to_a) ? path.to_a : [],selection:selection}
    end

    def self.copy_camera(camera)
      return nil unless camera && defined?(Sketchup::Camera)
      perspective = !camera.respond_to?(:perspective?) || camera.perspective?
      copy = Sketchup::Camera.new(camera.eye,camera.target,camera.up,perspective,camera.fov)
      copy.height = camera.height if !perspective && camera.respond_to?(:height)
      copy
    end

    def self.alive?(entity)
      (!entity.respond_to?(:valid?) || entity.valid?) && (!entity.respond_to?(:deleted?) || !entity.deleted?)
    end

    def self.restore(model, snap)
      result = {'camera'=>false,'context'=>false,'selection'=>false}
      path = snap[:active_path]
      current = model.respond_to?(:active_path) && model.active_path.respond_to?(:to_a) ? model.active_path.to_a : []
      if model.respond_to?(:active_path=) && path.all? { |entity| alive?(entity) }
        same = current.length == path.length && current.zip(path).all? { |a,b| a.equal?(b) }
        begin
          model.active_path = path.empty? ? nil : path unless same
          result['context'] = true
        rescue StandardError
          result['context'] = false
        end
      end
      selection = model.respond_to?(:selection) ? model.selection : nil
      if selection.respond_to?(:clear)
        selection.clear
        kept = snap[:selection].select { |entity| alive?(entity) }
        selection.respond_to?(:add) ? selection.add(kept) : selection.concat(kept) unless kept.empty?
        result['selection'] = true
      end
      view = model.respond_to?(:active_view) ? model.active_view : nil
      if snap[:camera] && view.respond_to?(:camera=)
        view.camera = [snap[:camera],TRANSITION]
        result['camera'] = true
      end
      view.invalidate if view.respond_to?(:invalidate)
      result
    end

    def draw(view)
      return unless @active
      current!
      triangles = gl(:GL_TRIANGLES,4)
      list = overlays
      # Others first, the shown piece last (on top of a shared face).
      list.sort_by { |overlay| overlay['focus'] ? 1 : 0 }.each do |overlay|
        next if overlay['triangles'].empty?
        view.drawing_color = rgba(overlay['focus'] ? FOCUS_RGB : OTHER_RGB,overlay['focus'] ? 170 : 110)
        view.draw(triangles,overlay['triangles'])
      end
      outline(view,list)
    rescue StandardError => error
      fail_readonly(error,view)
    end

    # Box of each piece drawn in 2D: visible even behind doors or other boards.
    def outline(view,list)
      return unless view.respond_to?(:draw2d) && view.respond_to?(:screen_coords)
      list.each do |overlay|
        screen = overlay['corners'].map { |corner| view.screen_coords(corner) }
        view.line_width = overlay['focus'] ? 3 : 2 if view.respond_to?(:line_width=)
        view.drawing_color = rgba(overlay['focus'] ? OUTLINE_RGB : OTHER_RGB,255)
        view.draw2d(gl(:GL_LINES,1),BOX_EDGES.flat_map { |a,b| [screen[a],screen[b]] }.map { |point| point_class.new(point.x,point.y,0) })
      end
      view.line_width = 1 if view.respond_to?(:line_width=)
    end

    # Clipping planes include what the tool draws.
    def getExtents
      return nil unless defined?(Geom::BoundingBox)
      box = Geom::BoundingBox.new
      (@active ? overlays : []).each { |overlay| overlay['corners'].each { |corner| box.add(corner) } }
      box
    rescue StandardError
      Geom::BoundingBox.new
    end

    def onMouseMove(_flags,_x,_y,view)
      return unless @active
      current!
      invalidate(view)
    rescue StandardError => error
      fail_readonly(error,view)
    end

    def fail_readonly(error,view)
      clear;@active=false;@overlays=[]
      emit('No se puede mantener el resaltado. Volvé a analizar.',error:error.message)
      invalidate(view)
    end

    # A click does not end it: the click that brings SketchUp to the front
    # used to erase the highlight before it could be seen.
    def onLButtonDown(_flags,_x,_y,view);invalidate(view);end
    def onKeyDown(key,_repeat,_flags,view);onCancel(0,view) if key==27;end
    def stop(view=nil)
      clear;@active=false;@overlays=[]
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
