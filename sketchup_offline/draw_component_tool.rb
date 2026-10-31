# frozen_string_literal: true
module PlanosSanto
  # Original three-stage tool: rectangle, thickness, one isolated component/Undo.
  # Coordinates shown by InputPoint are world coordinates; creation uses the active edit frame.
  class DrawComponentTool
    attr_reader :phase
    def initialize(model,on_created:nil)
      @model=model;@on_created=on_created;@thickness=18.0/25.4
    end
    def activate
      @input=Sketchup::InputPoint.new;@context=context;reset
    end
    def context
      [(@model.active_path||[]).map(&:persistent_id),@model.edit_transform.to_a]
    end
    def valid_context!
      raise ExportError,'Cambió el contexto de edición. Reiniciá Dibujar componente.' unless Sketchup.active_model.equal?(@model) && context==@context
      raise ExportError,'El contenedor está bloqueado.' if (@model.active_path||[]).any?(&:locked?)
    end
    def reset
      @phase=0;@origin=nil;@corner=nil;@width=nil;@height=nil;@locked_plane=nil
      status;@model.active_view.invalidate
    end
    def status(message=nil)
      Sketchup.status_text=message || ['Dibujar componente: marcá la primera esquina. ↑ suelo · ← lateral · → frente.',
        'Marcá la esquina opuesta o escribí ancho;alto (ej. 600mm;400mm). Esc cancela.',
        'Definí el espesor con un clic o escribí una medida (ej. 18mm). Esc cancela.'][@phase]
      Sketchup.vcb_label=@phase==1 ? 'Ancho;alto' : 'Espesor'
      Sketchup.vcb_value=@phase==2 ? Sketchup.format_length(@thickness) : ''
    end
    def enableVCB?;true;end
    def plane
      return @locked_plane if @locked_plane
      if @input.face
        points=@input.face.vertices.first(3).map { |v| v.position.transform(@input.transformation) }
        n=(points[1]-points[0]).cross(points[2]-points[0]);return n.normalize if n.length>1e-8
      end
      Geom::Vector3d.new(0,0,1)
    end
    def frame(normal)
      @normal=normal.normalize
      seed=@normal.z.abs>0.9 ? Geom::Vector3d.new(1,0,0) : Geom::Vector3d.new(0,0,1)
      @u=seed.cross(@normal).normalize;@v=@normal.cross(@u).normalize
      # Horizontal plane: X then Y; upright planes: horizontal then vertical.
      if @normal.z.abs>0.9
        @u=Geom::Vector3d.new(1,0,0);@v=@normal.cross(@u).normalize
      end
    end
    def onMouseMove(_flags,x,y,view)
      valid_context!;@input.pick(view,x,y)
      if @phase==1
        hit=Geom.intersect_line_plane(view.pickray(x,y),[@origin,@normal])
        if hit
          delta=hit-@origin;@width=delta.dot(@u);@height=delta.dot(@v)
          Sketchup.vcb_value=[@width.abs,@height.abs].map { |v| Sketchup.format_length(v) }.join(';')
        end
      elsif @phase==2
        points=Geom.closest_points([@origin,@normal],view.pickray(x,y))
        if points
          distance=(points[0]-@origin).dot(@normal)
          @thickness=distance if distance.abs>0.1/25.4
          Sketchup.vcb_value=Sketchup.format_length(@thickness)
        end
      end
      view.invalidate
    rescue StandardError => error
      status(error.message)
    end
    def onLButtonDown(flags,x,y,view)
      onMouseMove(flags,x,y,view);valid_context!
      if @phase==0
        return unless @input.valid?
        @origin=@input.position;frame(plane);@phase=1
      elsif @phase==1
        dimensions!;@phase=2
      else
        create
      end
      status;view.invalidate
    rescue StandardError => error
      status(error.message)
    end
    def onUserText(text,view)
      valid_context!
      if @phase==1
        parts=text.split(';');raise ExportError,'Escribí ancho;alto, por ejemplo 600mm;400mm.' unless parts.length==2
        @width=parts[0].to_l.to_f;@height=parts[1].to_l.to_f;dimensions!;@phase=2
      elsif @phase==2
        @thickness=text.to_l.to_f;create
      else
        raise ExportError,'Marcá primero una esquina en el modelo.'
      end
      status;view.invalidate
    rescue StandardError => error
      status(error.message)
    end
    def dimensions!
      raise ExportError,'Ancho y alto deben ser mayores que cero y menores que 100 m.' unless [@width,@height].all? { |v| v && v.finite? && v.abs>0.1/25.4 && v.abs<=100_000/25.4 }
    end
    def create
      valid_context!;dimensions!
      raise ExportError,'El espesor debe ser mayor que cero y menor que el ancho y el alto.' unless @thickness.finite? && @thickness.abs>0.1/25.4 && @thickness.abs<[@width.abs,@height.abs].min
      started=false
      begin
        raise ExportError,'No se pudo iniciar el dibujo.' unless @model.start_operation('Dibujar componente Planos Santo',true)
        started=true
        group=@model.active_entities.add_group
        world=Geom::Transformation.axes(@origin,@u,@v,@normal)
        group.transformation=@model.edit_transform.inverse*world
        face=group.entities.add_face([[0,0,0],[@width,0,0],[@width,@height,0],[0,@height,0]])
        raise ExportError,'No se pudo dibujar el rectángulo.' unless face
        face.reverse! if face.normal.z<0
        face.pushpull(@thickness)
        component=group.to_component;component.definition.name='Pieza';component.name='Pieza'
        raise ExportError,'No se pudo confirmar el componente.' unless @model.commit_operation
        started=false;@model.selection.clear;@model.selection.add(component)
        reset
        @on_created&.call(component)
      rescue StandardError
        @model.abort_operation if started
        raise
      end
    end
    def onKeyDown(key,_repeat,_flags,view)
      return if @phase==2
      normal={38=>[0,0,1],37=>[1,0,0],39=>[0,-1,0]}[key]
      return unless normal
      @locked_plane=Geom::Vector3d.new(*normal);frame(@locked_plane) if @origin
      @width=@height=nil;view.invalidate
    end
    def onCancel(_reason,view);reset;view.invalidate;end
    def deactivate(view);view.invalidate;end
    def points
      return [] unless @origin && @width && @height
      base=[@origin,@origin.offset(@u,@width),@origin.offset(@u,@width).offset(@v,@height),@origin.offset(@v,@height)]
      @phase==2 ? base+base.map { |p| p.offset(@normal,@thickness) } : base
    end
    def draw(view)
      @input.draw(view) if @input&.valid?
      corners=points;return if corners.empty?
      edges=[[0,1],[1,2],[2,3],[3,0]]
      edges+=[[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]] if corners.length==8
      view.drawing_color='DarkGreen';view.line_width=2;view.draw(GL_LINES,edges.flat_map { |a,b| [corners[a],corners[b]] })
    end
    def getExtents
      box=Geom::BoundingBox.new;points.each { |point| box.add(point) };box
    end
  end
end
