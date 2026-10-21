# frozen_string_literal: true
require_relative 'p1_diagnostics'
require_relative 'release'

module PlanosSanto
  # Public SketchUp API only. No OCL require, UUID generation, defaults helper,
  # painting, setters, operations, price guesses or derived 2D edge assignment.
  module OclReader
    SCHEMA = 'planos-santo.material-review.v1'
    COMPATIBILITY = { 'version' => '7.1.0', 'build' => '202511301621',
                      'upstream_commit' => 'd03f4548e161ed25615b2ea828214a79e0f3e07a' }.freeze
    TYPES = { 0 => 'unknown', 1 => 'solid_wood', 2 => 'sheet', 3 => 'dimensional', 4 => 'edge', 5 => 'hardware', 6 => 'veneer' }.freeze
    EXTRA_KEYS = %w[thickness length_increase width_increase thickness_increase std_sections raw_estimated].freeze
    MAX_MATERIALS = 5000

    def self.capture(model)
      scanner = P1Diagnostics::Scanner.new(model)
      diagnostic = scanner.scan
      # Enumerate the actual library as well as applied materials; never purge it.
      library = model.respond_to?(:materials) ? model.materials.to_a : []
      raise P1Diagnostics::LimitError, 'La biblioteca supera 5000 materiales.' if library.size > MAX_MATERIALS
      library.each { |material| scanner.material(material) }
      diagnostic['materials'] = scanner.scan_materials
      library.each do |material|
        record = diagnostic['materials'].find { |row| row['id'] == "material:#{material.entityID}" }
        next unless record && material.respond_to?(:get_attribute)
        EXTRA_KEYS.each do |key|
          value = material.get_attribute('ladb_opencutlist', key, nil)
          next if value.nil?
          if (value.is_a?(String) && value.bytesize <= 20_000) || value == true || value == false || (value.is_a?(Numeric) && value.finite?)
            record['opencutlist_observed'][key] = value
          else
            record['attribute_warnings'] ||= []
            record['attribute_warnings'] << "Atributo #{key} omitido: tipo/tamaño no admitido."
          end
        end
      end
      diagnostic['complete'] = scanner.scan_complete?
      diagnostic['material_library_enumerated'] = model.respond_to?(:materials)
      from_diagnostic(diagnostic)
    end

    def self.from_diagnostic(diagnostic)
      raise ArgumentError, 'Diagnóstico incompatible.' unless diagnostic.is_a?(Hash) && diagnostic['schema'] == P1Diagnostics::SCHEMA
      status = diagnostic.fetch('opencutlist')
      compatible = status['namespace_present'] == true && status['version'] == COMPATIBILITY['version'] && status['build'] == COMPATIBILITY['build']
      reasons = []
      reasons << 'OpenCutList no está cargado.' unless status['namespace_present']
      reasons << 'Versión/build OpenCutList sin compatibilidad verificada; se conservan atributos sin interpretarlos.' unless compatible
      reasons << 'El recorrido está incompleto: revisar incidencias antes de continuar.' unless diagnostic['complete']
      materials = diagnostic.fetch('materials').map do |source|
        attrs = source.fetch('opencutlist_observed')
        raw_type = attrs['type']
        resolved = MaterialResolver.resolve(source, ocl_compatible: compatible)
        known = resolved['type_read']
        category = resolved['category']
        { 'id' => source.fetch('id'), 'name' => source.fetch('name'), 'color_rgb' => source['color_rgb'],
          'category' => category, 'type_observed' => raw_type, 'attributes_observed' => attrs,
          'confidence' => resolved['confidence'], 'native_status' => resolved['native_status'],
          'native_binding' => resolved['native_binding'],
          'capabilities' => { 'type_read' => !!known, 'grain_observed' => [true,false].include?(attrs['grained']),
                              'dimensions_mm_resolved' => false, 'prices_resolved' => false },
          'warnings' => (source['attribute_warnings'] || []) + resolved['warnings'],
          'physical_uses' => 0, 'catalog_approved' => false }
      end
      material_index = materials.to_h { |material| [material['id'], material] }
      definitions = diagnostic.fetch('definitions').to_h { |definition| [definition['id'], definition] }
      pieces = diagnostic.fetch('instances').filter_map do |instance|
        definition = definitions[instance['definition_id']]
        next unless definition && definition['geometry'] && !definition['geometry']['faces'].empty?
        face_materials = definition['geometry']['faces'].map do |face|
          front = face['front_material_id'] || instance['effective_material_id']
          back = face['back_material_id'] || instance['effective_material_id']
          { 'face_id' => face['id'], 'normal_local' => face['normal_local'],
            'vertices_mm' => face['vertices_mm'], 'loops' => face['loops'],
            'area_mm2_local' => face['area_mm2_local'], 'edge_ids' => face['edge_ids'],
            'front_material_id' => front, 'back_material_id' => back,
            'front_origin' => face['front_material_id'] ? 'painted_face' : (front ? 'inherited_instance' : 'unpainted'),
            'back_origin' => face['back_material_id'] ? 'painted_face' : (back ? 'inherited_instance' : 'unpainted'),
            'visible' => instance['visible'] && face['visible'] }
        end
        used = (face_materials.flat_map { |face| [face['front_material_id'], face['back_material_id']] } + [instance['effective_material_id']]).compact.uniq
        used.each { |id| material_index[id]['physical_uses'] += 1 if material_index[id] }
        sheets = used.select { |id| material_index[id] && material_index[id]['category'] == 'sheet' }
        edges = used.select { |id| material_index[id] && material_index[id]['category'] == 'edge' }
        unknown = used.any? { |id| !material_index[id] || material_index[id]['category'] == 'unknown' }
        warnings = []
        warnings << 'Material de placa sin resolver.' if sheets.empty?
        warnings << 'Hay más de un material de placa observado; requiere revisión.' if sheets.length > 1
        warnings << 'Hay caras sin material; no se asigna un material por defecto.' if face_materials.any? { |face| !face['front_material_id'] || !face['back_material_id'] }
        warnings << 'Existen materiales de tipo desconocido.' if unknown
        orientation = instance.fetch('orientation')
        warnings << 'Transformación singular o sesgada: no habilita medidas de fabricación.' if orientation['singular'] || orientation['sheared']
        warnings << 'Las caras pintadas con canto no establecen arriba/abajo/izquierda/derecha de la vista 2D.' unless edges.empty?
        warnings << 'Faltan confirmar orientación 2D, veta, espesor y medidas de corte/terminadas.'
        { 'path' => instance['path'], 'name' => instance['name'].empty? ? definition['name'] : instance['name'],
          'world_transform' => instance['world_transform'], 'local_transform' => instance['local_transform'],
          'bounds_local' => definition['geometry']['bounds_mm_local_direct_faces'],
          'definition_id' => instance['definition_id'], 'original_instance_name' => instance['name'],
          'visible' => instance['visible'], 'axis_lengths_mm' => instance['axis_lengths_mm'], 'orientation' => orientation,
          'direct_material_id' => instance['material_id'], 'effective_material_id' => instance['effective_material_id'],
          'sheet_material_candidates' => sheets, 'edge_material_candidates' => edges, 'faces' => face_materials,
          'confidence' => sheets.length == 1 && !unknown ? 'single_sheet_observed' : 'unresolved',
          'capabilities' => { 'geometry_observed' => true, 'sheet_candidate_unique' => sheets.length == 1,
                              'edge_faces_observed' => !edges.empty?, 'orientation_2d_confirmed' => false,
                              'cut_dimensions_confirmed' => false, 'supplier_export' => false },
          'warnings' => warnings, 'confirmed' => false }
      end
      # Container paints are library usage too, but do not count them as boards.
      instances = diagnostic.fetch('instances')
      geometries = definitions.values.map { |definition| definition['geometry'] } + [diagnostic['root_geometry']]
      geometry_material_ids = geometries.compact.flat_map { |geometry| geometry['faces'].flat_map { |face| [face['front_material_id'],face['back_material_id']] } + geometry['edges'].map { |edge| edge['material_id'] } }.compact.uniq
      materials.each do |material|
        material['applied'] = material['physical_uses'].positive? || geometry_material_ids.include?(material['id']) || instances.any? { |instance| instance['material_id'] == material['id'] }
      end
      { 'schema' => SCHEMA, 'extension_version' => Release::VERSION, 'sketchup_version' => diagnostic['sketchup_version'],
        'exported_at' => diagnostic['exported_at'], 'model_guid' => diagnostic['model_guid'],
        'complete' => diagnostic['complete'], 'opencutlist' => status, 'compatibility_reference' => COMPATIBILITY,
        'capabilities' => { 'public_api_read_only' => true, 'whole_material_library' => diagnostic['material_library_enumerated'] == true, 'material_types' => compatible || materials.any? { |material| material['native_status'] == 'valid' },
                            'catalog_storage' => false, 'supplier_export' => false, 'optimization' => false },
        'confidence' => (compatible || materials.any? { |material| material['native_status'] == 'valid' }) && diagnostic['complete'] ? 'observations_only' : 'unresolved',
        'materials' => materials, 'pieces' => pieces, 'warnings' => reasons, 'issues' => diagnostic['issues'],
        'production_ready' => false, 'manual_validation_pending' => true }
    end
    # Same handedness convention as orderProjection in the local UI. A camera
    # direction never establishes a manufacturing edge or a material binding.
    def self.projected_edges(report,row,geometry)
      axes=row['axes'];raise ExportError,'Elegí ejes distintos y cara antes de leer los cantos.' unless axes.is_a?(Array) && axes.size==2 && axes.uniq.size==2 && axes.all? { |v| v.is_a?(Integer) && v.between?(0,2) } && [-1,1].include?(row['frontSign'])
      piece=report['pieces'].find { |p| p['path'].join('/')==row['id'] }
      result={'pieceId'=>row['id'],'orientation'=>row.slice('axes','frontSign','flipX','flipY'),'mirrored'=>geometry['mirrored'],'sides'=>[],'confirmed'=>false,'complete'=>report['complete'],'materials'=>report['materials'].map { |m| m.slice('id','name','category','native_status','native_binding') }}
      u,v=axes;w=([0,1,2]-axes)[0]
      parity=[[0,1],[1,2],[2,0]].include?(axes) ? 1 : -1
      flip_x=(row['flipX']==true) ^ (row['frontSign']*parity*(geometry['mirrored'] ? -1 : 1)<0)
      sides=[[v,row['flipY'] ? 0 : 1],[v,row['flipY'] ? 1 : 0],[u,flip_x ? 1 : 0],[u,flip_x ? 0 : 1]]
      materials=report['materials'].to_h { |m| [m['id'],m] };bounds=geometry['bounds'];lengths=3.times.map { |i| bounds['max'][i]-bounds['min'][i] }
      sides.each_with_index do |(axis,high),index|
        plane=bounds[high==1 ? 'max' : 'min'][axis]
        faces=piece ? piece['faces'].select do |face|
          normal=face['normal_local'];vertices=face['vertices_mm']
          normal.is_a?(Array) && normal[axis].abs>0.999 && vertices.is_a?(Array) && vertices.size>=3 && vertices.all? { |point| (point[axis]-plane).abs<=0.01 }
        end : []
        expected=lengths[w]*lengths[axis==u ? v : u]
        covered=faces.sum { |face| face['area_mm2_local'].to_f }
        physical_edges=faces.map { |face| [face['front_material_id'],face['back_material_id']].compact.uniq.select { |id| materials[id] && materials[id]['category']=='edge' } }
        ids=physical_edges.flatten.uniq
        unknown=faces.any? { |face| [face['front_material_id'],face['back_material_id']].compact.empty? || [face['front_material_id'],face['back_material_id']].compact.any? { |id| !materials[id] || !%w[edge sheet].include?(materials[id]['category']) } }
        status='unresolved';reason='No hay evidencia suficiente: revisar caras, cobertura, tipo de material y geometría.'
        valid=piece && report['complete'] && geometry['rectangular'] && !piece['orientation']['singular'] && !piece['orientation']['sheared'] && !faces.empty? && (covered-expected).abs<=[0.1,expected*1e-5].max && !unknown
        if valid && ids.empty?
          status='observed_no_edge';reason='Caras perimetrales observadas sin material de tipo canto; revisar antes de confirmar 0.'
        elsif valid && ids.size==1 && physical_edges.all? { |face_ids| face_ids==ids }
          status='observed_edge';reason='Un canto compatible observado en todas las caras de este lado; vincular explícitamente con biblioteca.'
        end
        result['sides'] << {'side'=>%w[arr aba izq der][index],'axis'=>axis,'bound'=>high==1 ? 'max' : 'min','status'=>status,'materialIds'=>ids,
          'faceIds'=>faces.map { |face| face['face_id'] },'faceMaterials'=>faces.map { |face| face.slice('face_id','front_material_id','back_material_id','front_origin','back_origin') },'reason'=>reason}
      end
      used=result['sides'].flat_map { |side| side['faceMaterials'].flat_map { |face| [face['front_material_id'],face['back_material_id']] } }.compact.uniq
      result['materials'].select! { |material| used.include?(material['id']) }
      result
    end

    def self.verify_edge_mapping(report,row,geometry,catalog)
      observation=projected_edges(report,row,geometry)
      raise ExportError,'Cantos por cara sin resolver: revisá o documentá una inspección manual.' if observation['sides'].any? { |side| side['status']=='unresolved' }
      bindings=row['edgeBindings'].to_h { |r| [r['observedId'],r['catalogId']] }
      expected=observation['sides'].map do |side|
        next 0 if side['status']=='observed_no_edge'
        catalog_id=bindings[side['materialIds'].first]
        edge=catalog['items'].find { |item| item['id']==catalog_id && item['kind']=='edge' && item['approved'] }
        raise ExportError,'Vinculá cada canto observado con un canto aprobado de biblioteca.' unless edge
        material=observation['materials'].find { |entry| entry['id']==side['materialIds'].first }
        native=material && material['native_binding']
        if native
          raise ExportError,'El canto nativo pertenece a otro ítem de biblioteca; no se permite sustituir su SKU.' unless native['catalogId']==catalog_id && native['kind']=='edge'
          raise ExportError,'El canto de biblioteca cambió desde el pintado; revisá y volvé a vincularlo.' unless native['catalogFingerprint']==MaterialResolver.item_fingerprint(edge)
        end
        role=[row['principalId'],row['secondaryId']].index(catalog_id)
        raise ExportError,'El canto observado no está asignado como principal/secundario de este lote.' unless role
        role+1
      end
      raise ExportError,'El mapa de cuatro lados no coincide con las caras observadas. Volvé a revisar.' unless expected==row['edgeMap']
      observation
    end
  end
end
