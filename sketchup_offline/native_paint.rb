# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'
require_relative 'names'
require_relative 'material_resolver'
require_relative 'material_policy'

module PlanosSanto
  # Native face setters only. Preview and cancel are strictly read-only; no OCL writes.
  class NativePaint
    def initialize(model, catalog:)
      @model=model;@catalog=catalog;@manager=NameManager.new(model)
    end
    def cancel
      @draft=nil
      {'cancelled'=>true}
    end
    def faces(node)
      Exporter.new(@model).entities_of(node.fetch('_entity')).select { |e| e.is_a?(Sketchup::Face) }
    end
    def face_id(face)
      raise ExportError,'Esta cara no tiene identificador persistente; actualizá SketchUp.' unless face.respond_to?(:persistent_id)
      face.persistent_id.to_s
    end
    def face_data(face)
      mesh=Exporter.new(@model).mesh_for([face],nil)
      {'id'=>face_id(face),'verticesMm'=>mesh['vertices'],'triangles'=>mesh['triangles'],
       'normal'=>face.normal.to_a.map(&:to_f),'frontMaterialId'=>face.material && "material-#{face.material.entityID}",
       'backMaterialId'=>face.back_material && "material-#{face.back_material.entityID}",
       'areaMm2'=>mesh['triangles'].sum { |t| a,b,c=t.map { |i| mesh['vertices'][i] };u=b.zip(a).map { |x,y| x-y };v=c.zip(a).map { |x,y| x-y };Math.sqrt([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]].sum { |x| x*x })/2 }}
    end
    def selection_ids(snapshot)
      return [] unless @model.respond_to?(:selection)
      selection=@model.selection.to_a
      selected=snapshot[:index].values.select { |n| selection.include?(n['_entity']) }.map { |n| n['id'] }
      # Face selection is accepted only when its active edit path identifies ONE occurrence.
      if @model.respond_to?(:active_path) && @model.active_path
        route=@model.active_path.map { |e| e.persistent_id.to_s }.join('/')
        node=snapshot[:index][route]
        selected << route if node && faces(node).any? { |f| selection.include?(f) }
      end
      selected.uniq
    end
    def status(piece_id=nil, from_selection:false)
      snapshot=@manager.inventory
      if from_selection
        ids=selection_ids(snapshot)
        raise ExportError,'Seleccioná una sola pieza o entrá a editarla para seleccionar sus caras.' unless ids.length==1
        piece_id=ids.first
      end
      pieces=snapshot[:index].values.select { |n| n['role']=='piece' }.map { |n| {'id'=>n['id'],'name'=>n['displayName'],'role'=>n['role']} }
      node=piece_id && snapshot[:index][piece_id]
      raise ExportError,'La pieza ya no existe.' if piece_id && !node
      result={'pieces'=>pieces,'piece'=>nil}
      if node
        raise ExportError,'Elegí una pieza hoja, sin subcomponentes.' unless node['role']=='piece'
        selected=@model.respond_to?(:selection) ? @model.selection.to_a : []
        active=@model.respond_to?(:active_path) && @model.active_path
        active_route=active && active.map { |e| e.persistent_id.to_s }.join('/')
        result['piece']={'id'=>node['id'],'name'=>node['displayName'],'faces'=>faces(node).map { |face| face_data(face) },
                         'selectedFaceIds'=>active_route==node['id'] ? faces(node).select { |f| selected.include?(f) }.map { |f| face_id(f) } : [],
                         'affectedPaths'=>affected_paths(node,snapshot),'uniqueAvailable'=>unique_available?(node,snapshot)}
      end
      result
    end
    def affected_paths(node,snapshot)
      snapshot[:index].values.select { |n| n['_entity'].definition.equal?(node['_entity'].definition) }.map { |n| n['id'] }.sort
    end
    def unique_available?(node,snapshot)
      chain=node['_parents']+[node['_entity']]
      node['_entity'].respond_to?(:make_unique) && chain.all? { |e| snapshot[:occurrences][e.persistent_id.to_s].length==1 } && node['_parents'].all? { |e| snapshot[:definitions][e.definition.guid.to_s]==1 }
    end
    def ensure_unlocked!(nodes)
      raise ExportError,'La pieza o un contenedor está bloqueado.' if nodes.any? { |n| (n['_parents']+[n['_entity']]).any? { |e| @manager.locked?(e) || !@manager.valid?(e) } }
    end
    # Design-only check, run on every click: no library file is hashed here and
    # commercial fields (SKU, supplier, price, format, approval) are ignored.
    # Files were verified when the material was installed or bound.
    def material_for(data)
      catalog=@catalog.read
      item=catalog['items'].find { |i| i['id']==data['catalogId'] }
      raise ExportError,'La ficha del material ya no existe en la biblioteca. Elegí otro material.' unless item
      raise ExportError,"«#{item['name']}» es #{item['kind']=='edge' ? 'un canto' : 'una placa'}; elegí el modo de pintura correspondiente." unless item['kind']==data['mode']
      matches=@model.materials.to_a.select do |m|
        observation=MaterialResolver.observe_binding(m)
        observation['status']=='valid' && observation['binding']['uuid']==data['materialUuid']
      end
      raise ExportError,"«#{item['name']}» no está instalado en este modelo o su vínculo está duplicado. Elegilo de nuevo en la paleta para instalarlo." unless matches.length==1
      material=matches.first;binding=MaterialResolver.read_binding(material)
      raise ExportError,'Problema de vinculación: el material del modelo pertenece a otra ficha. Elegilo de nuevo en la paleta.' unless binding['catalogId']==item['id'] && binding['kind']==item['kind']
      raise ExportError,"La textura de «#{item['name']}» en este modelo no coincide con su foto (imagen o escala cambiadas en SketchUp). Reparala desde la biblioteca." unless MaterialPolicy.native_valid?(item,material,directory:MaterialPolicy.directory(@catalog),require_source:false)
      [material,Digest::SHA256.hexdigest(JSON.generate(catalog)),binding]
    end
    def material_signature(material)
      texture=material.texture
      appearance=Exporter.new(@model).material(material)
      details=texture && %i[filename width height].to_h { |key| [key,texture.respond_to?(key) ? texture.public_send(key).to_s : nil] }
      Digest::SHA256.hexdigest(JSON.generate([appearance,details]))
    end
    def geometry(node)
      reader=Exporter.new(@model)
      world=(node['_parents']+[node['_entity']]).inject(Geom::Transformation.new) { |t,e| t*e.transformation }
      reader.bounds_and_shape(reader.mesh_for(faces(node),nil),world)
    end
    def physical_sizes(node,bounds)
      reader=Exporter.new(@model)
      world=(node['_parents']+[node['_entity']]).inject(Geom::Transformation.new) { |transform,entity| transform*entity.transformation }
      scales=reader.axis_scales(world)
      3.times.map { |axis| (bounds['max'][axis]-bounds['min'][axis])*scales[axis] }
    end
    def validate_edge!(node,selected,data)
      axes=data['axes']
      raise ExportError,'Confirmá base y altura en dos ejes locales distintos.' unless axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |a| [0,1,2].include?(a) }
      shape=geometry(node)
      raise ExportError,'Canto requiere un sólido rectangular ortogonal; revisá la pieza manualmente.' unless shape['rectangular']
      w=([0,1,2]-axes).first
      bounds=shape['localBounds'];size=physical_sizes(node,bounds)
      raise ExportError,'El plano de corte no identifica un espesor menor que base y altura.' unless axes.all? { |a| size[w]<size[a] }
      selected.each do |face|
        fd=face_data(face);normal=fd['normal'];n=Math.sqrt(normal.sum { |x| x*x })
        axis=axes.find { |a| n>0 && (normal[a].abs/n-1).abs<1e-5 }
        planar=axis && [bounds['min'][axis],bounds['max'][axis]].any? { |p| fd['verticesMm'].all? { |v| (v[axis]-p).abs<=0.01 } }
        raise ExportError,'La selección contiene una cara amplia o ambigua; elegí solamente caras de canto.' unless planar
      end
    end
    # Local axes are explicitly chosen by the operator. Cardinal expansion is
    # allowed only when each physical boundary has one unambiguous planar face.
    def boundary_frame(node,data)
      axes=data['axes']
      valid=axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |axis| axis.is_a?(Integer) && (0..2).include?(axis) }
      raise ExportError,'Revisá base y altura: hacen falta dos ejes locales distintos.' unless valid
      shape=geometry(node)
      raise ExportError,'No se pueden identificar lados de una pieza no rectangular; revisá los ejes.' unless shape['rectangular']
      bounds=shape['localBounds'];thickness=([0,1,2]-axes).first
      sizes=physical_sizes(node,bounds)
      raise ExportError,'El espesor no es menor que base y altura; revisá los ejes antes de expandir lados.' unless axes.all? { |axis| sizes[thickness]<sizes[axis] }
      groups=Hash.new { |hash,key| hash[key]=[] }
      faces(node).each do |face|
        fd=face_data(face);normal=fd['normal'];length=Math.sqrt(normal.sum { |value| value*value })
        axis=(0..2).find { |index| length>0 && (normal[index].abs/length-1).abs<1e-5 }
        next unless axis
        position=%w[min max].find { |side| fd['verticesMm'].all? { |point| (point[axis]-bounds[side][axis]).abs<=0.01 } }
        groups[[axis,position]] << face if position
      end
      {axes:axes,thickness:thickness,groups:groups}
    end

    # Immediate tools derive the local cutting plane from the physical piece,
    # including instance scale. This is evaluated on click, never on hover.
    def automatic_axes(node)
      shape=geometry(node)
      raise ExportError,'No se puede pintar esta pieza con seguridad: no es una placa rectangular. No se aplicaron cambios.' unless shape['rectangular']
      sizes=physical_sizes(node,shape['localBounds'])
      thickness=(0..2).min_by { |axis| sizes[axis] }
      axes=[0,1,2]-[thickness]
      raise ExportError,'No se puede identificar el espesor de esta pieza sin ambigüedad. No se aplicaron cambios.' unless sizes.all? { |size| size.finite? && size>0 } && axes.all? { |axis| sizes[axis]-sizes[thickness]>0.01 }
      axes
    end

    # Never turn a recognized edge into sheet material, even if its assignment
    # is on an unexpected broad side. Unknown narrow-face finishes are also
    # preserved, because immediate sheet selection never includes narrow faces.
    def edge_material?(material)
      return false unless material
      observation=MaterialResolver.observe_binding(material)
      return true if observation.dig('binding','kind')=='edge'
      material.respond_to?(:get_attribute) && material.get_attribute('ladb_opencutlist','type',nil).to_s=='4'
    end

    def expanded_faces(node,selected,data)
      if %w[edge remove_edge].include?(data['mode'])
        count=data.fetch('edgeCount',1)
        raise ExportError,'Elegí 1, 2 opuestos o 4 cantos.' unless count.is_a?(Integer) && [1,2,4].include?(count)
        validate_edge!(node,selected,data)
        return selected if count==1
        frame=boundary_frame(node,data);groups=frame[:groups]
        keys=frame[:axes].flat_map { |axis| [[axis,'min'],[axis,'max']] }
        raise ExportError,'Los cuatro lados no son caras físicas únicas. Revisá la pieza manualmente.' unless keys.all? { |key| groups[key].length==1 }
        return keys.map { |key| groups[key].first } if count==4
        selected.flat_map do |face|
          key=keys.find { |entry| groups[entry].include?(face) }
          raise ExportError,'El lado señalado no pertenece al marco local de cantos.' unless key
          [groups[[key[0],'min']].first,groups[[key[0],'max']].first]
        end.uniq
      elsif data['mode']=='sheet'
        scope=data.fetch('paintScope','face')
        raise ExportError,'Elegí pintar Pieza o Cara.' unless %w[face piece].include?(scope)
        return selected if scope=='face'
        frame=boundary_frame(node,data)
        broad=%w[min max].map { |side| frame[:groups][[frame[:thickness],side]] }
        raise ExportError,'Las dos caras amplias no se identifican sin ambigüedad. Usá pintar Cara.' unless broad.all? { |group| group.length==1 }
        broad.map(&:first)
      else
        selected
      end
    end

    def preview(data, snapshot: nil)
      @draft=nil
      raise ExportError,'Solicitud de pintado inválida.' unless data.is_a?(Hash) && %w[front back both].include?(data['side']) && %w[sheet edge].include?(data['mode']) && %w[all unique].include?(data['scope'])
      snapshot ||= @manager.inventory
      node=snapshot[:index][data['pieceId']]
      raise ExportError,'Elegí una pieza hoja válida.' unless node && node['role']=='piece'
      ids=data['faceIds'];all=faces(node)
      raise ExportError,'Elegí caras identificadas sin duplicados.' unless ids.is_a?(Array) && !ids.empty? && ids.length<=2000 && ids.uniq==ids && ids.all? { |id| id.is_a?(String) }
      selected=ids.map { |id| all.find { |face| face_id(face)==id } || (raise ExportError,'La cara ya no pertenece a esta pieza.') }
      # Even sheet painting validates nonzero/orthogonal geometry; ambiguous solids are never auto-classified.
      geometry(node)
      validate_edge!(node,selected,data) if data['mode']=='edge'
      affected=affected_paths(node,snapshot);unique=unique_available?(node,snapshot)
      raise ExportError,'No se puede aislar esta aparición con seguridad. Usá Hacer único en SketchUp y volvé a analizar.' if data['scope']=='unique' && !unique
      targets=data['scope']=='all' ? affected.map { |id| snapshot[:index].fetch(id) } : [node]
      ensure_unlocked!(targets)
      # Definitions referenced inside unplaced definitions cannot be enumerated as model paths.
      # Conservatively require the operator to resolve those references before either scope.
      targets.each do |target|
        (target['_parents']+[target['_entity']]).each do |entity|
          definition=entity.definition
          next unless definition.respond_to?(:instances)
          raise ExportError,'Hay instancias fuera de la jerarquía activa. Revisalas antes de pintar.' if definition.instances.any? { |e| @manager.valid?(e) && !snapshot[:occurrences].key?(e.persistent_id.to_s) }
        end
      end
      material,cat_hash,binding=material_for(data)
      token=SecureRandom.hex(24)
      @draft={token:token,data:JSON.parse(JSON.generate(data)),signature:snapshot[:signature],catalog:cat_hash,binding:binding,material:material,appearance:material_signature(material),
              affected:data['scope']=='all' ? affected : [node['id']]}
      {'token'=>token,'affectedPaths'=>@draft[:affected],'sharedCount'=>affected.length,'faces'=>selected.map { |f| face_data(f) },
       'warnings'=>(affected.length>1 ? ['Definición compartida: revisá todas las rutas afectadas antes de confirmar.'] : [])+MaterialPolicy.warnings(@catalog.read['items'].find { |item| item['id']==data['catalogId'] }),'uniqueAvailable'=>unique,
       'material'=>{'catalogId'=>data['catalogId'],'uuid'=>binding['uuid'],'name'=>material.display_name.to_s}}
    end
    # Read-only plan for the atomic multi-target painter. No operation is opened.
    def prepare_application(data, snapshot: nil)
      public_result=preview(data, snapshot: snapshot)
      plan=@draft
      @draft=nil
      plan.merge(public:public_result)
    end
    def isolate_faces(node,selected)
      old_faces=faces(node)
      original_transform=node['_entity'].transformation.to_a
      expected=old_faces.map { |f| topology(f) }.sort
      selected_keys=selected.map { |f| topology(f) }
      raise ExportError,'Hay caras coincidentes; no se puede aislar la pieza sin ambigüedad.' unless expected.uniq==expected
      finishes=old_faces.to_h { |face| [topology(face),[face.material,face.back_material]] }
      old_definition=node['_entity'].definition
      node['_entity'].make_unique
      raise ExportError,'SketchUp no aisló la definición; se revirtió la operación.' if node['_entity'].definition.equal?(old_definition)
      replacement=faces(node)
      raise ExportError,'Hacer único alteró la geometría; se revirtió la operación.' unless replacement.map { |f| topology(f) }.sort==expected && node['_entity'].transformation.to_a==original_transform
      raise ExportError,'Hacer único alteró los acabados o cantos; se revirtió la operación.' unless replacement.all? { |face| finishes.fetch(topology(face))==[face.material,face.back_material] }
      selected_keys.map { |key| replacement.find { |f| topology(f)==key } }
    end
    def topology(face)
      d=face_data(face)
      JSON.generate([d['verticesMm'].map { |v| v.map { |x| x.round(8) } }.sort,d['normal'].map { |x| x.round(8) }])
    end
    def apply(data)
      draft=@draft;@draft=nil
      raise ExportError,'Confirmá una vista previa vigente antes de pintar.' unless draft && data.is_a?(Hash) && data['token']==draft[:token] && data['confirmed']==true
      raise ExportError,'Hay otra operación de pintado en curso.' if @applying
      @applying=true;started=false
      begin
        snapshot=@manager.inventory
        raise ExportError,'El modelo cambió; volvé a previsualizar.' unless snapshot[:signature]==draft[:signature]
        material,hash,binding=material_for(draft[:data])
        raise ExportError,'El material o la biblioteca cambió; volvé a previsualizar.' unless hash==draft[:catalog] && binding==draft[:binding] && material.equal?(draft[:material]) && material_signature(material)==draft[:appearance]
        node=snapshot[:index].fetch(draft[:data]['pieceId']);ensure_unlocked!(draft[:affected].map { |id| snapshot[:index].fetch(id) })
        old_faces=faces(node);selected=draft[:data]['faceIds'].map { |id| old_faces.find { |f| face_id(f)==id } || (raise ExportError,'Las caras cambiaron; volvé a previsualizar.') }
        # SketchUp may omit an Undo entry for identical assignments. Do not
        # report a committed edit or let the next Undo consume an older action.
        isolation=draft[:data]['scope']=='unique' && affected_paths(node,snapshot).length>1
        already_matches=selected.all? do |face|
          (!%w[front both].include?(draft[:data]['side']) || face.material==material) &&
            (!%w[back both].include?(draft[:data]['side']) || face.back_material==material)
        end
        if already_matches && !isolation
          return {'changed'=>false,'noChanges'=>true,'affectedPaths'=>draft[:affected],'faceCount'=>selected.length,
                  'message'=>'Sin cambios: las caras ya tienen ese material. No se creó una operación Undo.'}
        end
        raise ExportError,'No se pudo iniciar la operación de pintado.' unless @model.start_operation('Pintar materiales Planos Santo',true)
        started=true
        if draft[:data]['scope']=='unique' && affected_paths(node,snapshot).length>1
          selected=isolate_faces(node,selected)
        end
        selected.each do |face|
          if %w[front both].include?(draft[:data]['side'])
            face.material=material
            raise ExportError,'SketchUp no aceptó el material frontal.' unless face.material==material
          end
          if %w[back both].include?(draft[:data]['side'])
            face.back_material=material
            raise ExportError,'SketchUp no aceptó el material posterior.' unless face.back_material==material
          end
        end
        raise ExportError,'No se pudo confirmar el pintado.' unless @model.commit_operation
        started=false
        {'changed'=>true,'affectedPaths'=>draft[:affected],'faceCount'=>selected.length,'unique'=>draft[:data]['scope']=='unique'}
      rescue StandardError
        @model.abort_operation if started
        raise
      ensure
        @applying=false
      end
    end
  end
end
