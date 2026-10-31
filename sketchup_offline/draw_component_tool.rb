# frozen_string_literal: true
module PlanosSanto
  # «Dibujar pieza»: herramienta propia de tres pasos (primera esquina,
  # rectángulo y espesor) que crea un componente aislado en UNA operación de
  # Deshacer. La idea del flujo viene de OpenCutList; el código es propio.
  #
  # Coordenadas: InputPoint, View#pickray y las entidades del contexto abierto
  # se informan en coordenadas del mundo (la misma regla que usa
  # PieceHighlightTool#world_matrix), así que la transformación del componente
  # nuevo se escribe en mundo dentro de Model#active_entities, sin
  # edit_transform.inverse. Fuente: documentación oficial de la API
  # (sketchup-api-stubs, ModelObserver#onActivePathChanged): con una instancia
  # abierta, «positions and transformations… relative to global world
  # coordinates». edit_transform sólo aporta los ejes por defecto del grupo
  # abierto y la identidad del contexto. Probado sólo con dobles: se valida en
  # SketchUp real (pendiente).
  #
  # APIs (versión mínima): InputPoint#pick(view,x,y,ref), #copy!, #clear,
  # #degrees_of_freedom, #face, #transformation, #tooltip (6); View#pickray,
  # #tooltip=, #draw (6); Geom.intersect_line_plane, Geom.closest_points,
  # Transformation.axes, Vector3d#axes, Entities#clear! (6);
  # Model#start_operation con transparent (7); Group#to_component (7);
  # Model#active_path y #edit_transform (7); String#to_l, Sketchup.format_length,
  # Sketchup.vcb_label=/vcb_value= (6). Protegidas con respond_to?/defined?:
  # DefinitionList#unique_name, Model#axes (2016), Sketchup::RegionalSettings
  # (2017), constantes VK_* y GL_LINES.
  class DrawComponentTool
    MM = 1 / 25.4
    MIN = 0.1 * MM
    BOX_TOLERANCE = 1e-6
    MAX = 100_000 * MM
    DEFAULT_THICKNESS = 18 * MM
    NAME = 'Pieza'
    OPERATION = 'Dibujar pieza'
    PLANES = {x:'lateral (eje rojo)',y:'frente (eje verde)',z:'suelo (eje azul)'}.freeze
    COLORS = {x:'Red',y:'Green',z:'Blue'}.freeze

    attr_reader :phase,:width,:height,:thickness,:normal,:origin,:locked,:last

    def initialize(model)
      @model=model;@default_thickness=DEFAULT_THICKNESS;@locked=nil;@active=false;@phase=:corner
    end

    def active?;@active;end
    def enableVCB?;true;end

    def activate
      @active=true;@last=nil
      @input=Sketchup::InputPoint.new;@first=Sketchup::InputPoint.new
      remember_context;reset
      model_view&.invalidate
    rescue StandardError => error
      report(error,model_view)
    end

    # Salir (segundo Esc, otra herramienta, cerrar el modelo) nunca toca el modelo.
    def deactivate(view)
      @active=false;@last=nil;@phase=:corner
      Sketchup.status_text='';Sketchup.vcb_label='';Sketchup.vcb_value=''
      view&.invalidate
    end

    def resume(view)
      status(@message);view.invalidate
    rescue StandardError => error
      report(error,view)
    end
    def suspend(_view);end

    # reason: 0 Esc, 1 volver a elegir la herramienta, 2 Deshacer.
    def onCancel(reason,view)
      @last=nil
      return @model.select_tool(nil) if reason==0 && @phase==:corner
      reset;view.invalidate
    rescue StandardError => error
      report(error,view)
    end

    def onMouseMove(_flags,x,y,view)
      check_context!;track(x,y,view)
    rescue StandardError => error
      report(error,view)
    end

    def onLButtonDown(_flags,x,y,view)
      check_context!;track(x,y,view)
      case @phase
      when :corner
        raise ExportError,'Marcá un punto en el modelo para la primera esquina.' unless @input.valid?
        start_at(@input.position,face_normal(@input) || reference_axes[2]);@first.copy!(@input);@press=[x,y]
      when :rectangle then accept_rectangle!
      when :thickness then create!
      end
      view.invalidate
    rescue StandardError => error
      report(error,view)
    end

    # Arrastrar con el botón apretado también cierra el rectángulo.
    def onLButtonUp(flags,x,y,view)
      press=@press;@press=nil
      return unless @phase==:rectangle && press && (x-press[0])**2+(y-press[1])**2>=64
      onLButtonDown(flags,x,y,view)
    end

    # repeat: en SketchUp es el conteo de autorepetición (1 al apretar, más
    # mientras se mantiene): sólo la primera pulsación alterna el plano.
    def onKeyDown(key,repeat,_flags,view)
      axis=plane_keys[key]
      return false unless axis && @phase!=:thickness
      return true if repeat.is_a?(Integer) && repeat>1
      @locked=axis==:free || @locked==axis ? nil : axis
      if @phase==:rectangle
        frame(@locked ? locked_normal : @picked_normal);@width=@height=nil
      end
      status;view.invalidate
      true
    rescue StandardError => error
      report(error,view)
      true
    end

    def onUserText(text,view)
      check_context!
      values=parse_list(text)
      case @phase
      when :corner
        raise ExportError,'Marcá primero la esquina en el modelo; las medidas se escriben después.' unless @last
        redo_last!(values)
      when :rectangle
        @width=directed(values[0],@width,'el ancho');@height=directed(values[1],@height,'el alto')
        accept_rectangle!
        if values.length==3
          @thickness=directed(values[2],@thickness,'el espesor');create!
        end
      when :thickness
        raise ExportError,'Escribí sólo el espesor, por ejemplo 18mm.' unless values.length==1
        @thickness=directed(values[0],@thickness,'el espesor');create!
      end
      view.invalidate
    rescue StandardError => error
      report(error,view)
    end

    def draw(view)
      @input.draw(view) if @input&.valid? && (!@input.respond_to?(:display?) || @input.display?)
      lines=preview_lines
      return if lines.empty?
      view.line_width=2 if view.respond_to?(:line_width=)
      view.drawing_color=COLORS[@locked] || 'Magenta'
      view.draw(Object.const_defined?(:GL_LINES) ? Object.const_get(:GL_LINES) : 1,lines)
    rescue StandardError => error
      # Una sola vez por herramienta: draw corre en cada cuadro.
      warn("Planos Santo: no se pudo dibujar la vista previa (#{error.class}).") unless @draw_warned
      @draw_warned=true
    end

    def getExtents
      box=Geom::BoundingBox.new
      box.add(@input.position) if @input&.valid?
      box.add(@origin) if @origin && @phase!=:corner
      corners.each { |point| box.add(point) }
      box
    rescue StandardError
      Geom::BoundingBox.new
    end

    def corners
      return [] if @phase==:corner || !@width || !@height
      base=[@origin,@origin+scaled(@u,@width),@origin+scaled(@u,@width)+scaled(@v,@height),@origin+scaled(@v,@height)]
      @phase==:thickness ? base+base.map { |point| point+scaled(@normal,@thickness) } : base
    end

    private

    def model_view
      @model.respond_to?(:active_view) ? @model.active_view : nil
    end

    # Ninguna excepción de un evento llega a SketchUp: el motivo va a la barra de estado.
    def report(error,view)
      status(error.message)
      view&.invalidate
    rescue StandardError => failure
      warn("Planos Santo: Dibujar pieza no pudo informar un error (#{failure.class}).")
    end

    def track(x,y,view)
      case @phase
      when :corner then @input.pick(view,x,y)
      when :rectangle
        @input.pick(view,x,y,@first)
        point=plane_point(view,x,y)
        if point
          delta=point-@origin;@width=delta.dot(@u);@height=delta.dot(@v)
        end
      when :thickness
        @input.pick(view,x,y,@first)
        value=thickness_at(view,x,y);@thickness=value if value
      end
      Sketchup.vcb_value=vcb_value
      view.tooltip=@input.tooltip if @input.valid? && view.respond_to?(:tooltip=)
      view.invalidate
    end

    def plane_keys
      key=lambda { |name,fallback| Object.const_defined?(name) ? Object.const_get(name) : fallback }
      {key.call(:VK_RIGHT,39)=>:x,key.call(:VK_LEFT,37)=>:y,key.call(:VK_UP,38)=>:z,key.call(:VK_DOWN,40)=>:free}
    end

    def active_path
      path=@model.respond_to?(:active_path) ? @model.active_path : nil
      path.respond_to?(:to_a) ? path.to_a : []
    end

    def context_key;[active_path.map(&:object_id),@model.edit_transform.to_a];end
    def remember_context;@context=context_key;end

    # In the corner phase the tool adopts the current context; with a drawing in
    # progress any change of model or context cancels it without touching the model.
    def check_context!
      raise ExportError,'Cambiaste de modelo. Volvé a activar Dibujar pieza en este modelo.' unless Sketchup.active_model.equal?(@model)
      unless context_key==@context
        drawing=@phase!=:corner
        remember_context;@last=nil
        if drawing
          reset
          raise ExportError,'Cambió el contexto de edición: se canceló el dibujo sin tocar el modelo. Marcá de nuevo la primera esquina.'
        end
      end
      return unless active_path.any? { |entity| entity.respond_to?(:locked?) && entity.locked? }
      raise ExportError,'El grupo o componente abierto está bloqueado. Desbloquealo o salí de él para dibujar.'
    end

    def reset
      @phase=:corner;@origin=@corner=@width=@height=@picked_normal=@press=nil
      @thickness=@default_thickness
      @input&.clear;@first&.clear
      status
    end

    # natural: the plane of the face under the corner (or the floor); a locked
    # plane wins while it lasts and releasing it goes back to the natural one.
    def start_at(point,natural)
      @origin=point;@picked_normal=natural;frame(@locked ? locked_normal : natural);@width=@height=nil;@last=nil;@phase=:rectangle
      status
    end

    def accept_rectangle!
      raise ExportError,'Mové el mouse para abrir el rectángulo o escribí ancho;alto (ej. 600;400).' unless @width && @height
      check_size!(@width,'El ancho');check_size!(@height,'El alto')
      @corner=@origin+scaled(@u,@width)+scaled(@v,@height);@phase=:thickness
      status
    end

    def check_size!(value,label)
      return if value.is_a?(Numeric) && value.finite? && value.abs>=MIN && value.abs<=MAX
      raise ExportError,"#{label} tiene que estar entre 0,1 mm y 100 m."
    end

    # A typed value keeps the direction of the mouse; a negative one reverses it.
    def directed(value,current,label)
      return current if value.nil? && current
      raise ExportError,"Falta #{label}: escribilo o marcalo con el mouse." if value.nil?
      current && current<0 ? -value : value
    end

    def parse_list(text)
      raw=text.to_s.strip
      raise ExportError,'Escribí una medida, por ejemplo 600mm;400mm.' if raw.empty?
      parts=raw.split(separator,-1)
      raise ExportError,'Escribí hasta tres medidas: ancho;alto;espesor.' if parts.length>3
      parts.map { |part| part.strip.empty? ? nil : length(part.strip) }
    end

    # «;» always separates; «,» too when the decimal separator is the point.
    def separator
      decimal=defined?(Sketchup::RegionalSettings) && Sketchup::RegionalSettings.respond_to?(:decimal_separator) ? Sketchup::RegionalSettings.decimal_separator : ','
      decimal=='.' ? /[;,]/ : /;/
    end

    def length(text)
      value=text.to_l.to_f
      raise ArgumentError unless value.finite?
      value
    rescue ArgumentError,TypeError
      raise ExportError,"No entiendo «#{text}». Escribí un número con o sin unidad: 600, 600mm, 60cm o 0,6m."
    end

    def locked_normal
      x,y,z=reference_axes
      {x:x,y:y.reverse,z:z}.fetch(@locked)
    end

    # Exact world normal of the face, also for concave faces and scaled or
    # mirrored instances: two in-plane axes are transformed and crossed.
    def face_normal(input)
      face=input.face
      return nil unless face
      transformation=input.transformation || Geom::Transformation.new
      local=face.normal
      a,b=local.axes
      world=a.transform(transformation).cross(b.transform(transformation))
      return nil unless world.length>1e-9
      world=world.normalize
      world.dot(local.transform(transformation))<0 ? world.reverse : world
    end

    # Default axes follow the open group (edit_transform) or the drawing axes.
    def reference_axes
      transformation=active_path.empty? ? nil : @model.edit_transform
      if transformation
        orthonormal(transformation.xaxis,transformation.yaxis)
      elsif @model.respond_to?(:axes) && @model.axes
        orthonormal(@model.axes.xaxis,@model.axes.yaxis)
      else
        [Geom::Vector3d.new(1,0,0),Geom::Vector3d.new(0,1,0),Geom::Vector3d.new(0,0,1)]
      end
    end

    def orthonormal(x,y)
      x=x.normalize;z=x.cross(y).normalize;[x,z.cross(x).normalize,z]
    end

    # Horizontal planes: width along red, height along green. Upright planes:
    # width horizontal, height upwards. u, v, normal are right handed.
    def frame(normal)
      x,_y,z=reference_axes
      n=normal.normalize
      u=n.dot(z).abs>0.9 ? x-scaled(n,x.dot(n)) : z.cross(n)
      @normal=n;@u=u.normalize;@v=n.cross(@u).normalize
    end

    def scaled(vector,distance);Geom::Vector3d.new(vector.x*distance,vector.y*distance,vector.z*distance);end
    def project(point);point+scaled(@normal,-(point-@origin).dot(@normal));end

    # Snapped inferences (vertex, edge) are projected on the plane; free points
    # use the view ray so the rectangle follows the cursor over other faces.
    def plane_point(view,x,y)
      return project(@input.position) if @input.valid? && @input.degrees_of_freedom<=1
      ray=view.pickray(x,y)
      # Plane seen edge-on: the ray hit would fly away, the inference does not.
      hit=ray[1].normalize.dot(@normal).abs>0.02 ? Geom.intersect_line_plane(ray,[@origin,@normal]) : nil
      hit || (@input.valid? ? project(@input.position) : nil)
    end

    def thickness_at(view,x,y)
      if @input.valid? && @input.degrees_of_freedom==0
        distance=(@input.position-@origin).dot(@normal)
        return distance if distance.abs>=MIN
      end
      ray=view.pickray(x,y)
      # Looking along the normal (plan view of a floor piece) the mouse cannot
      # give a depth: keep the current value; typing or a snap still work.
      return nil if ray[1].normalize.dot(@normal).abs>0.99
      points=Geom.closest_points([@corner,@normal],ray)
      return nil unless points
      distance=(points[0]-@origin).dot(@normal)
      distance.abs>=MIN ? distance : nil
    end

    # Positive local box [0,w]x[0,h]x[0,t] in a right-handed frame, whatever the
    # direction of the mouse: never a mirrored instance.
    def placement
      sw=@width<0 ? -1 : 1;sh=@height<0 ? -1 : 1
      x=scaled(@u,sw);y=scaled(@v,sh);z=x.cross(y)
      depth=@thickness*sw*sh
      origin=depth<0 ? @origin+scaled(z,depth) : @origin
      {transformation:Geom::Transformation.axes(origin,x,y,z),size:[@width.abs,@height.abs,@thickness.abs]}
    end

    def create!
      check_context!
      check_size!(@width,'El ancho');check_size!(@height,'El alto');check_size!(@thickness,'El espesor')
      geometry=placement;component=nil
      operation(false) do
        group=@model.active_entities.add_group
        build_box(group.entities,geometry[:size])
        group.transformation=geometry[:transformation]
        component=group.to_component
        raise ExportError,'SketchUp no pudo convertir el dibujo en componente.' unless component&.valid?
        component.definition.name=unique_name
      end
      finish(component)
    end

    # VCB right after creating: retype w;h, w;h;t or just t to correct the same
    # piece. The change is a transparent operation: one Undo removes the piece.
    def redo_last!(values)
      last=@last;component=last[:component]
      unless component.valid?
        @last=nil
        raise ExportError,'La última pieza ya no se puede corregir. Marcá una esquina para dibujar otra.'
      end
      # Corregir borra y rehace la caja: sólo si nada cambió desde que se creó.
      unless piece_state(component)==last[:state]
        @last=nil
        raise ExportError,'La pieza ya cambió después de crearla (material, nombre, atributos, copias o geometría): no se corrige desde acá para no borrar ese trabajo. Corregila con las herramientas de SketchUp o marcá una esquina para dibujar otra.'
      end
      width,height,thickness=values.length==1 ? [nil,nil,values[0]] : values
      width=directed(width,last[:width],'el ancho');height=directed(height,last[:height],'el alto')
      thickness=directed(thickness,last[:thickness],'el espesor')
      check_size!(width,'El ancho');check_size!(height,'El alto');check_size!(thickness,'El espesor')
      @origin,@u,@v,@normal=last.values_at(:origin,:u,:v,:normal)
      @width,@height,@thickness=width,height,thickness
      geometry=placement
      begin
        operation(true) do
          entities=component.definition.entities
          entities.clear!
          build_box(entities,geometry[:size])
          component.transformation=geometry[:transformation]
        end
      rescue StandardError
        reset
        raise
      end
      finish(component)
    end

    # Cualquier excepción (no sólo StandardError) aborta: la bandera se pone
    # recién cuando commit_operation confirmó.
    def operation(transparent)
      raise ExportError,'SketchUp no pudo iniciar la operación.' unless @model.start_operation(OPERATION,true,false,transparent)
      committed=false
      begin
        yield
        raise ExportError,'SketchUp no pudo confirmar la operación.' unless @model.commit_operation
        committed=true
      rescue StandardError => error
        reason=error.is_a?(ExportError) ? error.message : 'SketchUp rechazó la geometría.'
        raise ExportError,"No se pudo crear la pieza: #{reason} El modelo quedó como estaba."
      ensure
        @model.abort_operation unless committed
      end
    end

    # Isolated by construction: the geometry lives in a new group, never in the
    # active entities, so it cannot merge with faces it touches.
    def build_box(entities,size)
      w,h,t=size
      face=entities.add_face(Geom::Point3d.new(0,0,0),Geom::Point3d.new(w,0,0),Geom::Point3d.new(w,h,0),Geom::Point3d.new(0,h,0))
      raise ExportError,'SketchUp no pudo dibujar el rectángulo.' unless face
      face.reverse! if face.normal.z<0
      face.pushpull(t)
      faces=entities.grep(Sketchup::Face)
      raise ExportError,'El empuje no generó una pieza cerrada.' unless faces.length==6
      check_box!(faces,size)
    end

    # placement espera la caja local positiva [0,w]x[0,h]x[0,t]: si SketchUp
    # extruyó hacia el otro lado, la pieza quedaría corrida y se aborta.
    def check_box!(faces,size)
      box=Geom::BoundingBox.new
      faces.each { |face| face.vertices.each { |vertex| box.add(vertex.position) } }
      inside=!box.empty? && [0,0,0,*size].zip([*box.min.to_a,*box.max.to_a]).all? { |want,got| (want.to_f-got.to_f).abs<=BOX_TOLERANCE }
      raise ExportError,'SketchUp extruyó la caja fuera de su lugar.' unless inside
    end

    def unique_name
      definitions=@model.definitions
      if definitions.respond_to?(:unique_name)
        name=begin
          definitions.unique_name(NAME)
        rescue StandardError
          nil
        end
        return name if name.is_a?(String) && !name.empty? && !definitions[name]
      end
      return NAME unless definitions[NAME]
      (1..9999).each { |index| candidate="#{NAME}##{index}";return candidate unless definitions[candidate] }
      raise ExportError,'No hay un nombre libre para la pieza.'
    end

    # Lo que una edición posterior cambiaría: acabados de las caras, material y
    # atributos de la instancia, nombre de la definición, copias y entidades.
    def piece_state(component)
      definition=component.definition
      entities=definition.entities.to_a
      painted=entities.grep(Sketchup::Face).any? { |face| face.material || face.back_material }
      [painted,component.material.nil?,attribute_names(component),definition.name.to_s,definition.instances.length,entities.length]
    end

    def attribute_names(entity)
      dictionaries=entity.respond_to?(:attribute_dictionaries) ? entity.attribute_dictionaries : nil
      return [] unless dictionaries
      dictionaries.map { |dictionary| [dictionary.name.to_s,dictionary.keys.map(&:to_s).sort] }.sort
    end

    def finish(component)
      @last={component:component,origin:@origin,u:@u,v:@v,normal:@normal,width:@width,height:@height,thickness:@thickness,state:piece_state(component)}
      @default_thickness=@thickness.abs
      begin
        @model.selection.clear;@model.selection.add(component)
      rescue StandardError => error
        warn("Planos Santo: no se pudo seleccionar la pieza dibujada (#{error.class}).")
      end
      reset
      size=[@last[:width],@last[:height],@last[:thickness]].map { |value| Sketchup.format_length(value.abs) }.join(' × ')
      status("Pieza «#{component.definition.name}» creada y seleccionada: #{size}. Escribí otras medidas para corregirla o marcá la próxima esquina. Esc sale.")
    end

    def status(message=nil)
      @message=message
      Sketchup.status_text=message || prompt
      Sketchup.vcb_label=vcb_label
      Sketchup.vcb_value=vcb_value
    end

    def prompt
      case @phase
      when :corner
        plane=@locked ? "#{PLANES[@locked]}, fijado" : 'el de la cara bajo el cursor (o el suelo)'
        "Dibujar pieza: marcá la primera esquina. Plano: #{plane}. Flechas: → lateral, ← frente, ↑ suelo, ↓ libre. Esc sale."
      when :rectangle
        'Marcá la esquina opuesta o escribí ancho;alto (ej. 600;400 o 60cm;40cm). Flechas cambian el plano. Esc vuelve a empezar.'
      else
        'Marcá el espesor con el mouse o escribilo (ej. 18 o 18mm). Negativo va hacia el otro lado. Esc vuelve a empezar.'
      end
    end

    def vcb_label
      {corner:@last ? 'Corregir' : 'Medidas',rectangle:'Ancho;alto',thickness:'Espesor'}.fetch(@phase)
    end

    def vcb_value
      case @phase
      when :rectangle then @width && @height ? [@width,@height].map { |value| Sketchup.format_length(value.abs) }.join(';') : ''
      when :thickness then Sketchup.format_length(@thickness.abs)
      else ''
      end
    end

    def preview_lines
      points=corners
      return [] if points.empty?
      edges=[[0,1],[1,2],[2,3],[3,0]]
      edges+=[[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]] if points.length==8
      edges.flat_map { |a,b| [points[a],points[b]] }
    end
  end
end
