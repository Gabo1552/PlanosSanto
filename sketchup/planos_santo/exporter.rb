# frozen_string_literal: true
require 'json'
require 'time'
require 'digest'
require 'csv'

module PlanosSanto
  VERSION = '0.3.0'
  class ExportError < StandardError; end

  # Only reads entities/definitions. No operations, attributes, explode, transform!, or model save.
  class Exporter
    MM = 25.4
    MAX_VERTICES = 200_000
    MAX_TRIANGLES = 200_000
    MAX_FURNITURE = 500
    OCL_DICTIONARY = 'ladb_opencutlist'
    OCL_HARDWARE = '5'
    HARDWARE_WARNING = 'Herraje (material de tipo herraje en OpenCutList): no se tesela ni entra en el despiece.'
    attr_reader :model

    # cache: false keeps the uncached path (ARQ-01 equivalence test only).
    def initialize(model, cache: true)
      @model = model
      @cache = cache
      @vertices = 0
      @triangles = 0
      @nodes = 0
      @warnings = []
      reset_caches
    end

    def containers(entities)
      entities.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
    end

    def entities_of(entity)
      entity.is_a?(Sketchup::Group) ? entity.entities : entity.definition.entities
    end

    def definition_of(entity)
      entity.definition
    end

    def material(material)
      return nil unless material
      c = material.color
      { 'id' => "material-#{material.entityID}", 'name' => material.display_name.to_s,
        'color' => [c.red, c.green, c.blue], 'opacity' => material.alpha.to_f,
        'textured' => !material.texture.nil? }
    end

    def matrix_mm(transform)
      a = transform.to_a.map(&:to_f)
      [12, 13, 14].each { |i| a[i] *= MM }
      raise ExportError, 'Transformación inválida o no afín.' unless a.all?(&:finite?) && a.values_at(3, 7, 11).all? { |n| n.abs < 1e-8 } && (a[15] - 1).abs < 1e-8
      a
    end

    def axis_scales(transform)
      a = transform.to_a
      axes = [a[0, 3], a[4, 3], a[8, 3]]
      scales = axes.map { |axis| Math.sqrt(axis.sum { |v| v * v }) }
      raise ExportError, 'Pieza con escala cero.' if scales.any? { |s| s < 1e-8 }
      3.times do |i|
        3.times do |j|
          next if i == j
          dot = axes[i].zip(axes[j]).sum { |x, y| x * y } / scales[i] / scales[j]
          raise ExportError, 'Transformación sesgada: no permite medidas ortogonales fiables.' if dot.abs > 1e-5
        end
      end
      scales
    end

    def mesh_for(faces, inherited_material)
      vertices = []
      triangles = []
      materials = []
      index = {}
      faces.each do |face|
        # SketchUp tessellates face holes/concavity; never triangulate a face outline by fan.
        mesh = face.mesh(0)
        points = mesh.points.map { |p| p.to_a.map { |v| v.to_f * MM } }
        mesh.polygons.each do |polygon|
          raise ExportError, 'La API devolvió un polígono no triangulado.' unless polygon.length == 3
          tri = polygon.map do |signed|
            v = points.fetch(signed.abs - 1)
            key = v.map { |n| n.round(8) }
            index[key] ||= begin
              vertices << v
              vertices.length - 1
            end
          end
          a, b, c = tri.map { |i| vertices[i] }
          ab = b.zip(a).map { |x, y| x - y }; ac = c.zip(a).map { |x, y| x - y }
          normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
          raise ExportError, 'Triángulo degenerado en una cara.' if tri.uniq.length != 3 || normal.sum { |v| v*v } < 1e-20
          # Respect Face#normal even if polygon winding differs; signed indices mark hidden edges.
          tri.reverse! if normal.zip(face.normal.to_a).sum { |x, y| x*y } < 0
          triangles << tri
          materials << { 'front' => material(face.material || inherited_material), 'back' => material(face.back_material || inherited_material) }
        end
      end
      count_geometry(vertices.length, triangles.length)
      { 'vertices' => vertices, 'triangles' => triangles, 'faceMaterials' => materials }
    end

    def count_geometry(vertices, triangles)
      @vertices += vertices
      @triangles += triangles
      raise ExportError, 'El modelo supera 200.000 vértices o triángulos.' if @vertices > MAX_VERTICES || @triangles > MAX_TRIANGLES
    end

    # ARQ-01 (etapa S): the local mesh depends only on the definition's faces and
    # on the material each face inherits, never on the instance transform. Every
    # occurrence of a (definition, inherited material) pair reuses one mesh, and
    # still counts its geometry toward the limits as if it had been tessellated.
    # Errors are replayed too, so the result is identical with or without cache.
    def cached_mesh(definition, faces, inherited_material)
      return mesh_for(faces, inherited_material) unless @cache
      key = [identity(definition), identity(inherited_material)]
      entry = @meshes[key]
      if entry.nil?
        vertices = @vertices; triangles = @triangles
        begin
          mesh = mesh_for(faces, inherited_material)
        rescue ExportError => e
          @meshes[key] = [:error, e.message] unless e.message.include?('supera')
          raise
        end
        @meshes[key] = [:mesh, mesh, @vertices - vertices, @triangles - triangles]
        return mesh
      end
      raise ExportError, entry[1] if entry[0] == :error
      count_geometry(entry[2], entry[3])
      entry[1]
    end

    # SketchUp keeps entityID stable and unique within the session; doubles
    # without it fall back to Ruby identity, as the recursion guard in walk does.
    def identity(entity)
      return nil if entity.nil?
      entity.respond_to?(:entityID) ? [:entity, entity.entityID] : [:object, entity.object_id]
    end

    def reset_caches
      @meshes = {}
      @shapes = {}.compare_by_identity
      @hardware = {}.compare_by_identity
    end

    def hardware_material?(material)
      return false if material.nil?
      return @hardware[material] if @hardware.key?(material)
      @hardware[material] = material.respond_to?(:get_attribute) && material.get_attribute(OCL_DICTIONARY, 'type', nil).to_s == OCL_HARDWARE
    end

    # OpenCutList hardware is never a cut piece. As in OCL, a node is hardware
    # when every own face's effective material (face or inherited) is an OCL
    # hardware material; its faces are not tessellated. Children are still
    # walked and decided by their own faces, so a board painted as a sheet
    # inside a hardware-painted container is never dropped.
    def hardware?(faces, own_material)
      !faces.empty? && faces.all? { |face| hardware_material?(face.material || own_material) }
    end

    # Bounds, closed-edge check and volume only read the local mesh: one per mesh.
    def local_shape(mesh)
      return @shapes[mesh] if @cache && @shapes.key?(mesh)
      shape = compute_local_shape(mesh)
      @shapes[mesh] = shape if @cache
      shape
    end

    def bounds_and_shape(mesh, transform)
      # Transform errors first, as before the shape cache existed.
      scales = axis_scales(transform)
      shape = local_shape(mesh)
      min = shape[:min].dup; max = shape[:max].dup
      dimensions = 3.times.map { |i| (max[i] - min[i]) * scales[i] }.sort.reverse
      raise ExportError, 'Dimensiones fuera de rango (0,01–100.000 mm).' if dimensions.any? { |d| d < 0.01 || d > 100_000 }
      { 'localBounds' => { 'min' => min, 'max' => max }, 'dimensionsMm' => dimensions, 'rectangular' => shape[:rectangular] }
    end

    def compute_local_shape(mesh)
      vertices = mesh.fetch('vertices')
      min = 3.times.map { |i| vertices.map { |v| v[i] }.min }
      max = 3.times.map { |i| vertices.map { |v| v[i] }.max }
      edges = Hash.new(0)
      volume = 0.0
      planar = true
      mesh.fetch('triangles').each do |tri|
        a, b, c = tri.map { |i| vertices[i] }
        volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6.0
        planar &&= 3.times.any? { |i| [min[i], max[i]].any? { |plane| [a, b, c].all? { |v| (v[i] - plane).abs <= 0.01 } } }
        [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]].each { |pair| edges[pair.sort] += 1 }
      end
      box_volume = 3.times.map { |i| max[i] - min[i] }.inject(:*)
      rectangular = planar && edges.values.all? { |n| n == 2 } && (volume.abs-box_volume).abs <= [0.01, box_volume*0.001].max
      { min: min.freeze, max: max.freeze, rectangular: rectangular }
    end

    def tree
      @vertices = 0; @triangles = 0; @nodes = 0; @warnings = []
      reset_caches
      loose = model.entities.count { |e| e.is_a?(Sketchup::Face) }
      @warnings << "Hay #{loose} caras sueltas en la raíz, fuera de grupos/componentes. No se exportan como muebles." if loose.positive?
      roots = containers(model.entities).map { |e| walk(e, [], Geom::Transformation.new, true, nil, []) }
      raise ExportError, 'El modelo no tiene grupos/componentes para identificar muebles.' if roots.empty?
      { 'roots' => roots, 'warnings' => @warnings.dup, 'modelGuid' => model.guid.to_s, 'modelName' => model_name }
    end

    def model_name
      title = model.title.to_s
      title.empty? ? 'Modelo sin guardar' : title
    end

    def walk(entity, path, parent, visible, inherited_material, stack)
      @nodes += 1
      raise ExportError, 'El modelo supera 5.000 grupos/componentes.' if @nodes > 5000
      raise ExportError, 'El anidamiento supera 24 niveles.' if path.length >= 25
      definition = definition_of(entity)
      raise ExportError, 'Definición recursiva no soportada.' if stack.include?(definition.object_id)
      pid = entity.persistent_id.to_s
      route = path + [pid]
      # 0.8.26: veta de corte. El contenedor de primer nivel marca la vertical del mueble (aviso si está acostado).
      @grain_root = entity.transformation.to_a if path.empty?
      world = parent * entity.transformation
      tag = entity.layer
      effective = visible && !entity.hidden? && tag.visible?
      own_material = entity.material || inherited_material
      source = entities_of(entity)
      faces = source.select { |e| e.is_a?(Sketchup::Face) }
      hardware = hardware?(faces, own_material)
      faces = [] if hardware
      children = containers(source).map { |child| walk(child, route, world, effective, own_material, stack + [definition.object_id]) }
      original = entity.name.to_s
      def_name = definition.name.to_s
      name = original.empty? ? def_name : original
      warnings = []
      warnings << 'Instancia sin nombre: se usa el ID.' if original.empty? && def_name.empty?
      warnings << HARDWARE_WARNING if hardware
      warnings << 'Geometría oculta incluida; revisar antes de enviar.' unless effective
      warnings << 'Grupo con caras propias y subgrupos: revisar qué se considera pieza.' if !faces.empty? && !children.empty?
      mesh = nil; errors = []
      begin
        mesh = cached_mesh(definition, faces, own_material) unless faces.empty?
      rescue ExportError => e
        raise if e.message.include?('supera')
        errors << e.message
      end
      face_hidden = faces.count { |face| face.hidden? || !face.layer.visible? }
      warnings << "Incluye #{face_hidden} caras ocultas o en etiquetas no visibles; no se descartaron." if face_hidden.positive?
      metadata = { 'persistentId' => pid, 'instancePath' => route, 'originalName' => original, 'definitionName' => def_name,
                   'hidden' => entity.hidden?, 'effectiveVisible' => effective, 'tag' => tag.name.to_s,
                   'material' => material(own_material), 'worldTransform' => matrix_mm(world), 'warnings' => warnings, 'errors' => errors }
      if mesh
        begin
          metadata.merge!(bounds_and_shape(mesh, world))
          warnings << 'No es un sólido rectangular en sus ejes locales: medidas de caja, verificar orientación.' unless metadata['rectangular']
          # Eje local de la veta (Grain, solo en la extensión offline): automático o el elegido en Piezas.
          metadata.merge!(PlanosSanto::Grain.metadata(metadata['localBounds'], world.to_a, entity, @grain_root)) if metadata['rectangular'] && defined?(PlanosSanto::Grain)
        rescue ExportError => e
          errors << e.message
        end
      end
      node = { 'id' => route.join('/'), 'name' => (name.empty? ? "Sin nombre · #{pid}" : name)[0,80],
               'kind' => entity.is_a?(Sketchup::Group) ? 'group' : 'component',
               'definition' => definition.guid.to_s, 'transform' => matrix_mm(entity.transformation), 'metadata' => metadata, 'children' => children }
      node['mesh'] = mesh if mesh
      node
    end

    def self.each_node(nodes, &block)
      nodes.each { |n| block.call(n); each_node(n.fetch('children'), &block) }
    end

    def document(snapshot, selected_ids)
      raise ExportError, "Elegí entre 1 y #{MAX_FURNITURE} muebles." unless selected_ids.is_a?(Array) && selected_ids.length.between?(1,MAX_FURNITURE) && selected_ids.uniq.length == selected_ids.length
      ids = selected_ids.map(&:to_s)
      raise ExportError, 'No se puede elegir un mueble y también uno de sus descendientes.' if ids.any? { |a| ids.any? { |b| a != b && b.start_with?(a + '/') } }
      index = {}; self.class.each_node(snapshot.fetch('roots')) { |n| index[n['id']] = n }
      selected = ids.map { |id| raise ExportError, 'Selección desactualizada.' unless index[id]; Marshal.load(Marshal.dump(index[id])) }
      selected.each do |root|
        # A selected nested root becomes a furniture root; retain its original world placement.
        root['transform'] = root['metadata']['worldTransform']
        count = 0
        self.class.each_node([root]) do |n|
          errors = n.dig('metadata','errors') || []
          raise ExportError, "#{n['name']}: #{errors.join(' ')}" unless errors.empty?
          count += 1 if n['mesh']
        end
        raise ExportError, "#{root['name']}: no tiene piezas con geometría." if count.zero?
        raise ExportError, "#{root['name']}: supera 500 piezas." if count > 500
      end
      { 'version' => 1, 'units' => 'mm', 'name' => snapshot.fetch('modelName')[0,120], 'furniture' => selected,
        'exporter' => { 'name' => 'Planos Santo Ruby', 'version' => VERSION, 'sketchupVersion' => Sketchup.version.to_s,
                        'modelGuid' => snapshot.fetch('modelGuid'), 'modelName' => snapshot.fetch('modelName')[0,200],
                        'exportedAt' => Time.now.utc.iso8601, 'selectionPaths' => ids, 'reviewed' => true, 'warnings' => snapshot.fetch('warnings') } }
    end

    def self.write_bundle(document, target)
      data = JSON.pretty_generate(document)
      raise ExportError, 'La exportación supera 30 MB.' if data.bytesize > 30*1024*1024
      # Exclusive creation: never silently overwrite a previous export or user file.
      paths = [target, target.sub(/\.json\z/i, '') + '.medidas.csv', target.sub(/\.json\z/i, '') + '.informe.json']
      raise ExportError, 'Usá un nombre nuevo: ya existe un archivo de esta exportación.' if paths.any? { |p| File.exist?(p) }
      rows = [['mueble','pieza_id','nombre','largo_mm','ancho_mm','espesor_mm','rectangular','validacion_en_sketchup']]
      document['furniture'].each do |root|
        each_node([root]) do |node|
          next unless node['mesh']
          meta = node.fetch('metadata'); rows << [root['name'],node['id'],node['name'],*meta.fetch('dimensionsMm'),meta['rectangular'],'PENDIENTE VALIDACION MANUAL']
        end
      end
      report = { 'source' => 'SketchUp Ruby API', 'exporterVersion' => VERSION, 'sha256' => Digest::SHA256.hexdigest(data),
                 'modelGuid' => document.dig('exporter','modelGuid'), 'sketchupVersion' => document.dig('exporter','sketchupVersion'),
                 'furniture' => document['furniture'].map { |root| { 'id' => root['id'], 'name' => root['name'] } },
                 'pieces' => rows.length - 1, 'warnings' => document.dig('exporter','warnings'), 'manualValidation' => 'PENDIENTE VALIDACION MANUAL' }
      contents = [data, CSV.generate { |csv| rows.each { |row| csv << row } }, JSON.pretty_generate(report)]
      created = []
      begin
        paths.zip(contents).each { |file, content| File.open(file, File::WRONLY|File::CREAT|File::EXCL|File::BINARY, 0o600) { |io| created << file; io.write(content) } }
      rescue StandardError
        created.each { |file| File.delete(file) if File.exist?(file) }; raise
      end
      report
    end
  end
end
