# frozen_string_literal: true
require_relative 'grain'
require_relative 'native_paint'
module PlanosSanto
  # «Girar veta 90°» y «Veta automática» de Piezas (0.8.26): guarda la veta de cada pieza en su instancia y
  # alinea la textura de sus caras con ella, todo en una sola operación que Ctrl+Z deshace. Antes de abrir la
  # operación valida todo (pieza rectangular, contenedores sin bloquear, placa con veta de la biblioteca,
  # textura no proyectada, componentes compartidos); si algo falla después, la operación se revierte entera.
  #
  # Qué caras se tocan: solo las que tienen una placa con veta de la biblioteca. Los cantos (material de canto)
  # y las testas (la cara cuya normal es la veta) no se tocan. Una cara sin material propio toma la placa del
  # contenedor y SketchUp no deja orientar esa textura: se pinta explícitamente con la MISMA placa solo el
  # frente de las caras anchas, que es lo mínimo para ver la veta; el material efectivo no cambia (Piezas y el
  # pedido leen lo mismo), el resultado lo avisa y Ctrl+Z lo deshace. Las caras angostas siguen heredando.
  #
  # Componentes compartidos: la textura vive en la definición. Si todas sus apariciones están en el pedido y
  # quieren la misma veta, se escribe la definición una vez. Si no, cada pieza elegida se hace única (como
  # «Hacer único» de SketchUp, verificando geometría y acabados) para no tocar las demás; si un contenedor
  # también es compartido no se puede aislar y no se cambia nada.
  class PieceGrain
    MODES=%w[rotate auto].freeze
    MAX_IDS=500
    def initialize(model,catalog:)
      @model=model;@catalog=catalog;@native=NativePaint.new(model,catalog:catalog);@manager=NameManager.new(model)
    end
    # Solo lectura (Piezas): por qué la fila no puede cambiar su veta, o nil. No abre operaciones.
    def blocker(ids,snapshot: nil)
      plan(snapshot || @manager.inventory(geometry:false),ids,'rotate',verify:false);nil
    rescue ExportError => error
      error.message
    end
    def change(ids,mode)
      raise ExportError,'Elegí un ajuste de veta válido: girar 90° o automática.' unless MODES.include?(mode)
      writes=plan(@manager.inventory,ids,mode)
      started=false;painted=[];isolated=0;oriented=0
      begin
        raise ExportError,'No se pudo iniciar la edición de veta.' unless @model.start_operation('Orientar veta Planos Santo',true)
        started=true
        writes.each do |write|
          ops=write[:ops]
          if write[:isolate]
            faces=ops.map { |op| op[:face] }.uniq
            replaced=faces.zip(@native.isolate_faces(write[:node],faces)).to_h.compare_by_identity
            ops=ops.map { |op| op.merge(face:replaced.fetch(op[:face])) };isolated+=1
          end
          scales=Grain.scales(Grain.world(write[:node]).to_a)
          ops.each do |op|
            if op[:paint]
              op[:face].material=op[:material]
              raise ExportError,'SketchUp no aceptó la placa en una cara; se revirtieron los cambios.' unless op[:face].material==op[:material]
              painted << op[:material]
            end
            oriented+=1 if Grain.apply_mapping(op[:face],op[:material],Grain.mapping(op[:face],op[:material],scales,write[:axis]),op[:front])
          end
          write[:entities].each do |entity,value|
            entity.set_attribute(Grain::DICT,Grain::KEY,value)
            raise ExportError,'No se pudo guardar la veta de la pieza; se revirtieron los cambios.' unless entity.get_attribute(Grain::DICT,Grain::KEY)==value
          end
        end
        raise ExportError,'No se pudo confirmar la veta.' unless @model.commit_operation
        started=false
      rescue StandardError
        @model.abort_operation if started
        raise
      end
      warnings=[]
      unless painted.empty?
        names=painted.map { |material| material.display_name.to_s }.uniq.map { |name| "«#{name}»" }.join(', ')
        warnings << "Se #{painted.length==1 ? 'pintó 1 cara' : "pintaron #{painted.length} caras"} con #{names}, que antes tomaba#{painted.length==1 ? '' : 'n'} la placa del contenedor, para poder orientar la veta. El material no cambia; Ctrl+Z lo deshace."
      end
      warnings << "Se hizo único el componente de #{isolated==1 ? '1 pieza' : "#{isolated} piezas"} para no cambiar la veta de las otras apariciones." if isolated>0
      {'changed'=>true,'mode'=>mode,'pieces'=>ids.length,'orientedFaces'=>oriented,'paintedFaces'=>painted.length,'isolated'=>isolated,'warnings'=>warnings}
    end

    private

    def plan(snapshot,ids,mode,verify: true)
      raise ExportError,'Elegí entre 1 y 500 piezas, sin repetir.' unless ids.is_a?(Array) && ids.length.between?(1,MAX_IDS) && ids.uniq==ids && ids.all? { |id| id.is_a?(String) }
      nodes=ids.map do |id|
        node=snapshot[:index][id]
        raise ExportError,'La pieza ya no está en el modelo o tiene subgrupos: volvé a generar Piezas.' unless node && node['role']=='piece'
        node
      end
      @native.ensure_unlocked!(nodes)
      catalog=@catalog.read
      infos=nodes.map { |node| info(node) }
      targets=infos.map { |found| mode=='auto' ? found['auto'] : (found['broad']-[found['axis']]).first }
      writes=[]
      nodes.each_with_index.group_by { |node,_| node['_entity'].definition.object_id }.each_value do |members|
        first=members.first[0]
        occurrences=@native.affected_paths(first,snapshot).map { |id| snapshot[:index].fetch(id) }
        outside!(first,snapshot)
        ops=members.map { |node,index| ops(node,infos[index]['thickness'],targets[index],catalog,verify) }
        inherited=occurrences.map { |node| inherited_material(node) }.uniq
        requested=members.map { |node,_| node['id'] }
        if (occurrences.map { |node| node['id'] }-requested).empty? && members.map { |_,index| targets[index] }.uniq.length==1 && (ops.flatten.none? { |op| op[:paint] } || inherited.length==1)
          @native.ensure_unlocked!(occurrences)
          entities=members.map { |node,index| [node['_entity'],value(mode,targets[index])] }.uniq { |entity,_| entity.object_id }
          writes << {node:first,axis:targets[members.first[1]],isolate:false,ops:ops.first,entities:entities}
          next
        end
        stuck=members.map(&:first).reject { |node| @native.unique_available?(node,snapshot) }
        unless stuck.empty?
          raise ExportError,"«#{stuck.first['displayName']}» es un componente compartido con #{occurrences.length} apariciones y un contenedor también compartido: no se puede aislar. Elegí todas sus apariciones con la misma veta o hacé único el mueble en SketchUp."
        end
        remaining=occurrences.length
        members.each_with_index do |(node,index),position|
          writes << {node:node,axis:targets[index],isolate:remaining>1,ops:ops[position],entities:[[node['_entity'],value(mode,targets[index])]]}
          remaining-=1
        end
      end
      writes
    end
    def value(mode,axis);mode=='auto' ? Grain::AUTO : axis;end
    def info(node)
      shape=@native.geometry(node)
      raise ExportError,'La veta solo se orienta en placas rectangulares: esta pieza no lo es.' unless shape['rectangular']
      world=Grain.world(node).to_a
      lengths=Grain.scales(world).each_with_index.map { |scale,axis| (shape['localBounds']['max'][axis]-shape['localBounds']['min'][axis])*scale }
      found=Grain.info(lengths,world,override:Grain.override(node['_entity']))
      raise ExportError,'No se distingue el espesor de la pieza: no hay una cara ancha donde orientar la veta.' unless found
      found
    end
    # Componentes de la misma definición fuera de la jerarquía del modelo (en definiciones sin colocar).
    def outside!(node,snapshot)
      definition=node['_entity'].definition
      return unless definition.respond_to?(:instances)
      raise ExportError,'Hay apariciones de esta pieza fuera de los muebles del modelo: revisalas antes de orientar la veta.' if definition.instances.any? { |e| @manager.valid?(e) && !snapshot[:occurrences].key?(e.persistent_id.to_s) }
    end
    def inherited_material(node)
      (node['_parents']+[node['_entity']]).reverse.find(&:material)&.material
    end
    def grain_item(material,catalog)
      observed=MaterialResolver.observe_binding(material)
      binding=observed['status']=='valid' ? observed['binding'] : nil
      binding && catalog['items'].find { |item| item['id']==binding['catalogId'] && item['kind']=='sheet' && item['grain']==true }
    end
    def ops(node,thin,axis,catalog,verify)
      inherited=inherited_material(node);found=false;ops=[];checked={}.compare_by_identity
      @native.faces(node).each do |face|
        normal=Grain.face_axis(face)
        [true,false].each do |front|
          own=front ? face.material : face.back_material
          material=own || inherited
          next unless material && !@native.edge_material?(material)
          item=grain_item(material,catalog)
          next unless item
          found=true
          next if normal.nil? || normal==axis
          next if own.nil? && (!front || normal!=thin)
          if material.texture && face.respond_to?(:texture_projected?) && face.texture_projected?(front)
            raise ExportError,'La textura de esta pieza está proyectada: quitá la proyección en SketchUp (clic derecho › Textura) antes de orientar la veta.'
          end
          unless checked[material]
            @native.material_for('catalogId'=>item['id'],'materialUuid'=>MaterialResolver.observe_binding(material)['binding']['uuid'],'mode'=>'sheet') if verify
            checked[material]=true
          end
          Grain.mapping(face,material,[1.0,1.0,1.0],axis)
          ops << {face:face,front:front,material:material,paint:own.nil?}
        end
      end
      raise ExportError,'La pieza no tiene una placa con veta de la biblioteca: no hay veta que orientar.' unless found
      ops
    end
  end
end
