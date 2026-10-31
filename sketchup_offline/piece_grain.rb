# frozen_string_literal: true
require_relative 'grain'
require_relative 'native_paint'
module PlanosSanto
  class PieceGrain
    def initialize(model,catalog:)
      @model=model;@catalog=catalog;@native=NativePaint.new(model,catalog:catalog)
    end
    def change(ids,mode)
      raise ExportError,'Elegí las piezas y un ajuste de veta válido.' unless ids.is_a?(Array) && ids.length.between?(1,500) && ids.uniq==ids && ids.all?(String) && %w[rotate auto].include?(mode)
      snapshot=NameManager.new(@model).inventory
      plans=ids.map do |id|
        node=snapshot[:index][id]
        raise ExportError,'La pieza ya no existe o contiene subgrupos.' unless node && node['role']=='piece'
        @native.ensure_unlocked!([node])
        axes=@native.automatic_axes(node);old=Grain.node_axis(node,@native)
        chosen=mode=='auto' ? Grain.node_axis(node,@native,false) : (axes-[old]).first
        raise ExportError,'No se puede aislar una pieza dentro de un componente compartido. Hacé único el contenedor primero.' unless @native.affected_paths(node,snapshot).length==1 || @native.unique_available?(node,snapshot)
        inherited=(node['_parents']+[node['_entity']]).reverse.find { |e| e.material }&.material
        operations=@native.faces(node).flat_map do |face|
          [true,false].filter_map do |front|
            material=(front ? face.material : face.back_material)||inherited
            binding=material && MaterialResolver.observe_binding(material)['binding']
            item=binding && @catalog.read['items'].find { |i| i['id']==binding['catalogId'] && i['kind']=='sheet' && i['grain']==true }
            next unless item
            @native.material_for('catalogId'=>item['id'],'materialUuid'=>binding['uuid'],'mode'=>'sheet')
            {face:face,front:front,material:material,mapping:Grain.mapping(face,material,node,chosen,front)}
          end
        end
        raise ExportError,'La pieza no tiene una placa con veta vinculada a Materiales.' if operations.empty?
        {node:node,axis:chosen,operations:operations}
      end
      started=false
      begin
        raise ExportError,'No se pudo iniciar la edición de veta.' unless @model.start_operation('Orientar veta Planos Santo',true)
        started=true
        plans.each do |plan|
          node=plan[:node];ops=plan[:operations]
          if @native.affected_paths(node,snapshot).length>1
            faces=ops.map { |o| o[:face] }.uniq;isolated=@native.isolate_faces(node,faces);map=faces.zip(isolated).to_h
            ops.each { |o| o[:face]=map.fetch(o[:face]) }
          end
          ops.each { |o| Grain.apply_mapping(o[:face],o[:material],o[:mapping],o[:front]) }
          node['_entity'].set_attribute(Grain::DICT,Grain::KEY,mode=='auto' ? -1 : plan[:axis])
        end
        raise ExportError,'No se pudo confirmar la veta.' unless @model.commit_operation
        started=false;{'changed'=>true,'pieces'=>plans.length}
      rescue StandardError
        @model.abort_operation if started
        raise
      end
    end
  end
end
