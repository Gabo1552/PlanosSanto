# frozen_string_literal: true
require_relative 'native_paint'
require_relative 'ocl_reader'

module PlanosSanto
  # Entire gestures/batches are validated before opening ONE native operation.
  # It never calls NativePaint#apply in a loop and never changes OCL attributes.
  class SmartPaint
    attr_reader :native
    def initialize(model,catalog:)
      @model=model;@catalog=catalog;@native=NativePaint.new(model,catalog:catalog)
    end
    def cancel;@draft=nil;{'cancelled'=>true};end
    def material_choices(data)
      kind=data['mode']=='edge' ? 'edge' : data['mode']=='sheet' ? 'sheet' : nil
      return [] unless kind
      @model.materials.to_a.filter_map do |material|
        binding=MaterialResolver.observe_binding(material)['binding']
        next unless binding && binding['kind']==kind
        begin
          @native.material_for('catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid'],'mode'=>kind)
          {'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid'],'name'=>material.respond_to?(:display_name) ? material.display_name.to_s : material.name.to_s}
        rescue ExportError
          nil
        end
      end
    end
    def source_category(material)
      return 'unknown' unless material
      own=MaterialResolver.observe_binding(material)
      raw=material.respond_to?(:get_attribute) ? material.get_attribute('ladb_opencutlist','type',nil) : nil
      status=P1Diagnostics::Scanner.new(@model).ocl_status
      compatible=status['namespace_present'] && status['version']==OclReader::COMPATIBILITY['version'] && status['build']==OclReader::COMPATIBILITY['build']
      resolved=MaterialResolver.resolve({'planos_santo_observed'=>own,'opencutlist_observed'=>{'type'=>raw}},ocl_compatible:compatible)
      kind=resolved['category']
      if resolved['confidence']=='native_binding'
        binding=own['binding']
        @native.material_for({'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid'],'mode'=>binding['kind']})
      end
      kind
    end
    def source_stamp(material)
      return nil unless material
      [material.entityID.to_s,@native.material_signature(material),MaterialResolver.observe_binding(material),
       material.respond_to?(:get_attribute) ? material.get_attribute('ladb_opencutlist','type',nil) : nil]
    end
    def inherited(node)
      (node['_parents']+[node['_entity']]).reverse.find { |e| e.material }&.material
    end
    def sheet_explicit?(data)
      [data['catalogId'],data['materialUuid']].any? { |value| !value.nil? && value!='' }
    end
    def sheet_for(node,data)
      if sheet_explicit?(data)
        material,=@native.material_for(data.merge('mode'=>'sheet'))
        return material
      end
      inherited_material=inherited(node)
      candidates=@native.faces(node).flat_map { |f| [f.material || inherited_material,f.back_material || inherited_material] }.compact.uniq
      candidates.select! { |m| source_category(m)=='sheet' && MaterialResolver.observe_binding(m)['status']=='valid' }
      raise ExportError,'Placa de restauración ambigua o ausente. Elegí explícitamente una placa aprobada de la biblioteca.' unless candidates.length==1
      candidates.first
    end
    def texture_uv(face,point,front,helper)
      uvq=front ? helper.get_front_UVQ(point) : helper.get_back_UVQ(point)
      values=uvq.to_a.map(&:to_f)
      raise ExportError,'Coordenadas de textura no válidas; revisá el mapeo en SketchUp.' unless values.length==3 && values.all?(&:finite?) && values[2].abs>1e-10
      [values[0]/values[2],values[1]/values[2]]
    end
    def texture_helper(face,front)
      face.get_UVHelper(front,!front,Sketchup.create_texture_writer)
    end
    def texture_mapping(operation)
      face=operation[:face];front=operation[:side]=='front'
      source=(front ? face.material : face.back_material) || inherited(operation[:node])
      destination=operation[:material]
      return nil unless source&.texture || destination.texture
      raise ExportError,'No se puede comprobar el posicionamiento de textura con esta API; revisalo manualmente.' unless face.respond_to?(:texture_positioned?) && face.respond_to?(:texture_projected?)
      raise ExportError,'Textura proyectada: requiere revisión manual; no se modificó el mapeo.' if face.respond_to?(:texture_projected?) && face.texture_projected?(front)
      return nil unless face.texture_positioned?(front)
      supported=source&.texture && destination.texture && face.respond_to?(:texture_projected?) && face.respond_to?(:get_UVHelper) && face.respond_to?(:position_material) && Sketchup.respond_to?(:create_texture_writer) && defined?(Geom::Point3d)
      raise ExportError,'No se puede preservar este posicionamiento de textura; elegí una textura compatible o revisá la cara manualmente.' unless supported
      old_size=[source.texture.width.to_f,source.texture.height.to_f]
      new_size=[destination.texture.width.to_f,destination.texture.height.to_f]
      raise ExportError,'Escala de textura inválida; no se modificó la pieza.' unless (old_size+new_size).all? { |v| v.finite? && v>0 }
      mesh=face.mesh(0);points=mesh.points
      triangle=mesh.polygons.find { |p| p.length==3 }
      raise ExportError,'La textura necesita una cara planar triangulable.' unless triangle
      indices=triangle.map { |i| i.abs-1 };basis=indices.map { |i| points[i].to_a.map(&:to_f) }
      a,b,c=basis;u=b.zip(a).map { |x,y| x-y };v=c.zip(a).map { |x,y| x-y }
      uu=u.sum { |x| x*x };vv=v.sum { |x| x*x };uv=u.zip(v).sum { |x,y| x*y };den=uu*vv-uv*uv
      raise ExportError,'No hay tres puntos de textura independientes.' unless den.abs>1e-14
      helper=texture_helper(face,front);coords=points.map { |point| texture_uv(face,point,front,helper) }
      base_uv=indices.map { |i| coords[i] }
      points.each_with_index do |point,i|
        d=point.to_a.zip(a).map { |x,y| x-y };du=d.zip(u).sum { |x,y| x*y };dv=d.zip(v).sum { |x,y| x*y }
        s=(du*vv-dv*uv)/den;t=(dv*uu-du*uv)/den
        expected=2.times.map { |axis| base_uv[0][axis]+s*(base_uv[1][axis]-base_uv[0][axis])+t*(base_uv[2][axis]-base_uv[0][axis]) }
        raise ExportError,'Mapeo de textura no afín o distorsionado; requiere revisión manual.' unless expected.zip(coords[i]).all? { |x,y| (x-y).abs<=1e-5 }
      end
      {'points'=>basis,'uv'=>base_uv.map { |pair| 2.times.map { |axis| pair[axis]*old_size[axis]/new_size[axis] } },'oldSize'=>old_size,'newSize'=>new_size,'sourceUV'=>coords}
    end
    def restore_texture(operation)
      mapping=operation[:textureMapping]
      return unless mapping
      front=operation[:side]=='front';face=operation[:face]
      pairs=mapping['points'].zip(mapping['uv']).flat_map { |point,uv| [Geom::Point3d.new(*point),Geom::Point3d.new(uv[0],uv[1],0)] }
      result=face.position_material(operation[:material],pairs,front)
      raise ExportError,'SketchUp no pudo preservar el posicionamiento de textura; se revirtió el lote.' if result==false
      helper=texture_helper(face,front)
      mapping['points'].zip(mapping['uv']).each do |point,expected|
        actual=texture_uv(face,Geom::Point3d.new(*point),front,helper)
        raise ExportError,'El posicionamiento de textura cambió inesperadamente; se revirtió el lote.' unless actual.zip(expected).all? { |x,y| (x-y).abs<=1e-5 }
      end
    end
    # light: only for apply_immediate, which validates and commits in the same
    # call; a preview token that is applied later keeps the full signature.
    def plan(data,light:false)
      if data.is_a?(Hash) && (data['immediate']==true || data['immediatePiece']==true)
        raise ExportError,'Modo de pintura inmediata inválido.' unless %w[sheet edge remove_edge].include?(data['mode'])
        # Hito 2 (PINTURA-02): every copy of the definition only with the
        # authorization in the SAME request; otherwise one isolated occurrence.
        data=data.merge('immediate'=>true,'side'=>'both','scope'=>data['scope']=='all' && data['allowShared']==true ? 'all' : 'unique')
        data=data.merge('immediatePiece'=>true,'paintScope'=>'piece') if data['mode']=='sheet'
      end
      raise ExportError,'Solicitud de pintura inteligente inválida.' unless data.is_a?(Hash) && %w[sheet edge remove_edge replace].include?(data['mode']) && %w[front back both].include?(data['side']) && %w[all unique].include?(data['scope'])
      targets=data['targets']
      raise ExportError,'Elegí entre 1 y 500 piezas con sus caras.' unless targets.is_a?(Array) && targets.length.between?(1,500)
      snapshot=NameManager.new(@model).inventory(geometry:!light);operations={};proofs=[];warnings=[];paths=[];sources=[]
      targets.each do |target|
        raise ExportError,'Destino de pintado inválido.' unless target.is_a?(Hash) && target['pieceId'].is_a?(String) && target['faceIds'].is_a?(Array) && !target['faceIds'].empty? && target['faceIds'].length<=2000 && target['faceIds'].uniq==target['faceIds']
        node=snapshot[:index][target['pieceId']]
        raise ExportError,'Elegí una pieza hoja válida.' unless node && node['role']=='piece'
        request_data=data['immediate']==true ? data.merge('axes'=>@native.automatic_axes(node)) : data
        faces=target['faceIds'].map { |id| @native.faces(node).find { |f| @native.face_id(f)==id } || (raise ExportError,'La cara ya no pertenece a la pieza.') }
        faces=@native.expanded_faces(node,faces,request_data)
        mode=data['mode']=='replace' ? data['replacementKind'] : data['mode']
        raise ExportError,'Elegí el mismo tipo de material para el reemplazo.' if data['mode']=='replace' && !%w[sheet edge].include?(mode)
        if mode=='remove_edge'
          @native.validate_edge!(node,faces,request_data)
          material=sheet_for(node,data);mode='sheet'
          if data['scope']=='all' && !sheet_explicit?(data)
            @native.affected_paths(node,snapshot).each do |path|
              candidate=sheet_for(snapshot[:index].fetch(path),data)
              raise ExportError,'Las apariciones compartidas tienen placas de restauración distintas. Elegí una placa explícita o aislá las piezas.' unless candidate.equal?(material)
            end
          end
        else
          material,=@native.material_for(data.merge('mode'=>mode))
        end
        source=nil
        if data['mode']=='replace'
          raise ExportError,'Elegí el UUID exacto del material de origen.' unless data['sourceMaterialUuid'].is_a?(String)
          matches=@model.materials.to_a.select { |m| MaterialResolver.observe_binding(m).dig('binding','uuid')==data['sourceMaterialUuid'] }
          raise ExportError,'El material de origen está ausente o duplicado.' unless matches.length==1
          source=matches.first
          raise ExportError,'El material de origen y el reemplazo deben ser del mismo tipo aprobado.' unless source_category(source)==mode
          sources << source_stamp(source)
        end
        binding=MaterialResolver.read_binding(material)
        sides=data['side']=='both' ? %w[front back] : [data['side']]
        sides.each do |side|
          eligible=faces.select do |face|
            current=(side=='front' ? face.material : face.back_material) || inherited(node)
            sources << source_stamp(current)
            next false if data['immediatePiece']==true && @native.edge_material?(current)
            if data['mode']=='remove_edge'
              next false if data['immediate']==true && source_category(current)!='edge'
              raise ExportError,'La cara/lado no tiene un canto reconocido. Revisá la selección; no se quitarán materiales desconocidos.' unless source_category(current)=='edge'
            end
            data['mode']!='replace' || current.equal?(source)
          end
          next if eligible.empty? || (data['mode']=='replace' && source.equal?(material))
          if data['scope']=='all' && %w[remove_edge replace].include?(data['mode'])
            @native.affected_paths(node,snapshot).each do |path|
              occurrence=snapshot[:index].fetch(path)
              eligible.each do |face|
                effective=(side=='front' ? face.material : face.back_material) || inherited(occurrence)
                sources << source_stamp(effective)
                valid=data['mode']=='remove_edge' ? source_category(effective)=='edge' : effective.equal?(source)
                raise ExportError,'Las apariciones compartidas no tienen el mismo origen en esa cara/lado. Aislá las piezas antes de quitar o reemplazar materiales.' unless valid
              end
            end
          end
          request={'pieceId'=>node['id'],'faceIds'=>eligible.map { |f| @native.face_id(f) },'side'=>side,'scope'=>data['scope'],
                   'mode'=>mode,'axes'=>request_data['axes'],'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}
          prepared=@native.prepare_application(request,snapshot:snapshot);proofs << prepared
          paths.concat(prepared[:affected])
          warnings.concat(prepared[:public]['warnings']) unless data['immediate']==true
          eligible.each do |face|
            # All occurrences share the same underlying face; unique targets must
            # keep their per-instance plans independent until make_unique.
            key=[data['scope']=='unique' ? node['_entity'].object_id : nil,face.object_id,side]
            existing=operations[key]
            raise ExportError,'El lote contiene planes contradictorios para la misma cara compartida.' if existing && !existing[:material].equal?(material)
            operations[key]={face:face,node:node,side:side,material:material,prepared:prepared} unless existing
          end
        end
      end
      operations.each_value { |operation| operation[:textureMapping]=texture_mapping(operation) }
      # Empty replacement remains a validated no-op, never an empty Undo entry.
      {data:JSON.parse(JSON.generate(data)),signature:snapshot[:signature],catalog:Digest::SHA256.hexdigest(JSON.generate(@catalog.read)),
       operations:operations.values,proofs:proofs,paths:paths.uniq.sort,warnings:warnings.uniq,sources:sources,snapshot:snapshot}
    end
    def public_plan(prepared)
      {'affectedPaths'=>prepared[:paths],'faceCount'=>prepared[:operations].map { |o| [o[:node]['id'],@native.face_id(o[:face])] }.uniq.length,
       'warnings'=>prepared[:warnings],'operationCount'=>prepared[:operations].length,
       'expandedTargets'=>prepared[:operations].group_by { |operation| operation[:node]['id'] }.map { |id,ops| {'pieceId'=>id,'faceIds'=>ops.map { |operation| @native.face_id(operation[:face]) }.uniq} },
       'sharedCount'=>prepared[:proofs].map { |p| p[:public]['sharedCount'] }.max || 0,
       'uniqueAvailable'=>!prepared[:proofs].empty? && prepared[:proofs].all? { |p| p[:public]['uniqueAvailable'] }}
    end
    def preview(data,light:false)
      @draft=nil;prepared=plan(data,light:light);token=SecureRandom.hex(24)
      @draft=prepared.merge(token:token)
      public_plan(prepared).merge('token'=>token)
    end
    # One safe native gesture. Planning and commit run in the same synchronous
    # call, so the plan is committed directly: re-planning (a second full
    # inventory and material validation) could not observe any change (0.8.8).
    def apply_immediate(data)
      raise ExportError,'Solicitud de pintura inmediata inválida.' unless data.is_a?(Hash)
      preview(data.merge('immediate'=>true),light:true)
      draft=@draft;@draft=nil
      raise ExportError,'No se pudo preparar el pintado.' unless draft
      raise ExportError,'Hay otra aplicación de pintura en curso.' if @applying
      @applying=true
      begin
        commit(draft,draft)
      ensure
        @applying=false
      end
    end
    def unchanged?(operation)
      current=operation[:side]=='front' ? operation[:face].material : operation[:face].back_material
      current.equal?(operation[:material])
    end
    def apply(data)
      draft=@draft;@draft=nil
      raise ExportError,'Confirmá una vista previa vigente de pintura inteligente.' unless draft && data.is_a?(Hash) && data['token']==draft[:token] && data['confirmed']==true
      raise ExportError,'Hay otra aplicación de pintura en curso.' if @applying
      @applying=true
      begin
        current=plan(draft[:data])
        raise ExportError,'El modelo, la biblioteca o los materiales cambiaron; volvé a previsualizar.' unless current[:signature]==draft[:signature] && current[:catalog]==draft[:catalog] && current[:sources]==draft[:sources] && current[:paths]==draft[:paths] && current[:operations].map { |o| o[:textureMapping] }==draft[:operations].map { |o| o[:textureMapping] }
        raise ExportError,'El material de destino cambió; volvé a previsualizar.' unless current[:proofs].map { |p| [p[:catalog],p[:binding],p[:appearance]] }==draft[:proofs].map { |p| [p[:catalog],p[:binding],p[:appearance]] }
        commit(current,draft)
      ensure
        @applying=false
      end
    end
    # Opens exactly one native operation for a validated plan.
    def commit(current,draft)
      started=false
      begin
        operations=current[:operations]
        snapshot=current[:snapshot]
        # Every target face already has its material: isolating a shared piece
        # would only add a definition and an empty Undo entry (audit F-PINT-A).
        if operations.all? { |o| unchanged?(o) }
          return public_plan(current).merge('changed'=>false,'noChanges'=>true,'message'=>'Sin cambios: no se creó una operación Undo.')
        end
        raise ExportError,'No se pudo iniciar la operación de pintura inteligente.' unless @model.start_operation('Pintura inteligente Planos Santo',true)
        started=true
        if draft[:data]['scope']=='unique'
          operations.group_by { |o| o[:node]['_entity'].object_id }.each_value do |group|
            node=group.first[:node]
            next unless @native.affected_paths(node,snapshot).length>1
            original=group.map { |o| o[:face] }.uniq
            isolated=@native.isolate_faces(node,original)
            mapping=original.zip(isolated).to_h
            group.each { |o| o[:face]=mapping.fetch(o[:face]) }
          end
        end
        operations.each do |operation|
          face=operation[:face];material=operation[:material]
          operation[:side]=='front' ? face.material=material : face.back_material=material
          raise ExportError,'SketchUp no aceptó el material de una cara; se revirtió el lote.' unless unchanged?(operation)
          restore_texture(operation)
        end
        raise ExportError,'No se pudo confirmar el lote de pintura.' unless @model.commit_operation
        started=false
        public_plan(current).merge('changed'=>true,'noChanges'=>false,'unique'=>draft[:data]['scope']=='unique')
      rescue StandardError
        @model.abort_operation if started
        raise
      end
    end
  end
end
