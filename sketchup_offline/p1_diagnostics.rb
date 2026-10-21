# frozen_string_literal: true
require 'json'
require 'time'
require_relative 'material_resolver'

module PlanosSanto
  # Independent observations via public SketchUp Ruby API. Never instantiate OCL
  # attribute helpers: their readers can generate/persist UUIDs as a side effect.
  module P1Diagnostics
    SCHEMA = 'planos-santo.diagnostic.v1'
    OCL_KEYS = %w[type grained std_sizes std_thicknesses std_widths std_lengths edge_decremented].freeze
    LIMITS = { instances: 20_000, definitions: 10_000, faces: 100_000, points: 600_000,
               edges: 300_000, triangles: 200_000, depth: 64, bytes: 30 * 1024 * 1024 }.freeze
    class LimitError < StandardError; end

    def self.run
      target = UI.savepanel('Diagnóstico local · No modifica el modelo', nil, 'modelo.planos-santo.diagnostico.json')
      return { 'cancelled' => true } unless target
      target += '.json' unless target.downcase.end_with?('.json')
      report = Scanner.new(Sketchup.active_model).scan
      write(report, target)
      UI.messagebox("Diagnóstico guardado. #{report['counts']['instances']} instancias.\n#{report['complete'] ? 'Recorrido completo.' : 'Recorrido incompleto: revisar incidencias.'}\nEs un informe privado y no se envió a ningún servidor. No confirma medidas ni cantos para producción.")
      { 'cancelled' => false, 'complete' => report['complete'] }
    rescue StandardError => error
      UI.messagebox("No se pudo guardar el diagnóstico: #{error.message}")
      { 'error' => error.class.name }
    end

    def self.write(report, target, max_bytes: LIMITS[:bytes])
      raise ArgumentError, 'Elegí un archivo .json nuevo; el diagnóstico no reemplaza archivos.' unless File.extname(target).downcase == '.json'
      bytes = JSON.pretty_generate(report, allow_nan: false)
      raise LimitError, 'El informe supera el límite de tamaño; no se guardó.' if bytes.bytesize > max_bytes
      created = false
      begin
        File.open(target, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |file|
          created = true
          file.binmode; file.write(bytes); file.flush; file.fsync
        end
      rescue StandardError
        File.delete(target) if created && File.file?(target)
        raise
      end
    end

    class Scanner
      def initialize(model, limits: {})
        @model = model
        @limits = LIMITS.merge(limits)
        @counts = Hash.new(0)
        @issues = []
        @definitions = {}
        @materials = {}
        @instances = []
        @complete = true
      end

      def scan
        begin
          # Root geometry is retained, even when it is outside any component.
          @root_geometry = geometry(@model.entities)
          walk(@model.entities, Geom::Transformation.new, [], [], nil, true, 0)
        rescue LimitError => error
          issue('limit', error.message)
        end
        materials = @materials.values
        { 'schema' => SCHEMA, 'exported_at' => Time.now.utc.iso8601,
          'sketchup_version' => Sketchup.version.to_s, 'ruby_version' => RUBY_VERSION,
          'units' => { 'positions' => 'mm', 'matrix_translation' => 'mm', 'matrix_basis' => 'dimensionless',
                       'area' => 'mm2_local_unscaled', 'matrix_order' => 'column_major' },
          'model_guid' => @model.guid.to_s, 'scope' => 'whole_model_including_hidden',
          'selection_paths' => selection_paths, 'complete' => @complete, 'counts' => @counts.transform_keys(&:to_s),
          'opencutlist' => ocl_status, 'issues' => @issues,
          'instances' => @instances, 'definitions' => @definitions.values, 'root_geometry' => @root_geometry,
          'materials' => materials,
          'production_ready' => false, 'requires_confirmation' => %w[furniture_roots board_classification manual_dimensions furniture_front grain edge_mapping] }
      end

      def scan_complete?; @complete; end

      def scan_materials; @materials.values; end

      def consume(kind, amount = 1)
        raise LimitError, "#{kind}: máximo #{@limits.fetch(kind)}" if @counts[kind] + amount > @limits.fetch(kind)
        @counts[kind] += amount
      end

      def issue(code, detail)
        @complete = false
        @issues << { 'code' => code, 'detail' => detail.to_s[0, 300] } if @issues.length < 500
      end

      def identity(entity)
        id = entity.respond_to?(:persistent_id) ? entity.persistent_id : nil
        return id.to_s if id && id.to_i.positive?
        issue('missing_persistent_id', entity.class.name)
        "session:#{entity.object_id}"
      end

      def instance?(entity)
        entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
      end

      def selection_paths
        ancestors = @model.respond_to?(:active_path) ? (@model.active_path || []) : []
        selected = @model.respond_to?(:selection) ? @model.selection.to_a : []
        selected.select { |e| instance?(e) }.map { |e| (ancestors + [e]).map { |a| identity(a) } }
      end

      def walk(entities, parent_transform, path, stack, inherited_material, parent_visible, depth)
        raise LimitError, "depth: máximo #{@limits[:depth]}" if depth > @limits[:depth]
        entities.each do |entity|
          next unless instance?(entity)
          consume(:instances)
          route = path + [identity(entity)]
          definition = entity.definition
          key = "definition:#{definition.object_id}"
          # Keys are local to this report. A GUID can change when a definition is edited.
          unless @definitions.key?(key)
            consume(:definitions)
            @definitions[key] = { 'id' => key, 'guid_revision' => definition.guid.to_s,
                                  'name' => definition.name.to_s, 'geometry' => geometry(definition.entities) }
          end
          local = matrix(entity.transformation)
          world_transform = parent_transform * entity.transformation
          world = matrix(world_transform)
          direct = material(entity.material)
          effective = direct || inherited_material
          visible = parent_visible && visible?(entity)
          dimensions = dimensions(@definitions[key]['geometry'], world)
          children = definition.entities.any? { |e| instance?(e) }
          @instances << { 'path' => route, 'parent_path' => path, 'persistent_id' => route.last,
                          'definition_id' => key, 'name' => entity.name.to_s,
                          'kind' => entity.is_a?(Sketchup::Group) ? 'group' : 'component',
                          'local_transform' => local, 'world_transform' => world,
                          'axis_lengths_mm' => dimensions, 'axis_lengths_meaning' => 'direct_geometry_local_axes_scaled; not_cut_dimensions',
                          'orientation' => orientation(world), 'material_id' => direct,
                          'inherited_material_id' => inherited_material, 'effective_material_id' => effective,
                          'visible' => visible, 'hidden' => entity.hidden?, 'tag' => tag(entity),
                          'candidate' => children ? 'container_requires_review' : 'unclassified_leaf',
                          'edge_mapping_confirmed' => false }
          if stack.include?(definition.object_id)
            issue('recursive_definition', route.join('/'))
          else
            walk(definition.entities, world_transform, route, stack + [definition.object_id], effective, visible, depth + 1) if children
          end
        end
      end

      def matrix(transform)
        result = transform.to_a.map { |n| Float(n) }
        raise ArgumentError, 'Transformación no finita o inválida.' unless result.length == 16 && result.all?(&:finite?)
        result[12, 3] = result[12, 3].map { |n| n * 25.4 }
        result
      end

      def point(p)
        consume(:points)
        xyz = p.to_a.first(3).map { |n| Float(n) * 25.4 }
        raise ArgumentError, 'Coordenada no finita.' unless xyz.length == 3 && xyz.all?(&:finite?)
        xyz
      end

      def tag(entity)
        entity.respond_to?(:layer) && entity.layer ? entity.layer.name.to_s : nil
      end

      def visible?(entity)
        !entity.hidden? && (!entity.respond_to?(:layer) || !entity.layer || entity.layer.visible?)
      end

      def geometry(entities)
        faces = []; edges = []; bounds = nil
        entities.each do |entity|
          if entity.is_a?(Sketchup::Face)
            consume(:faces)
            mesh = entity.mesh(0)
            vertices = mesh.points.map { |p| point(p) }
            vertices.each do |xyz|
              bounds ||= [xyz.dup, xyz.dup]
              3.times { |i| bounds[0][i] = [bounds[0][i], xyz[i]].min; bounds[1][i] = [bounds[1][i], xyz[i]].max }
            end
            triangles = mesh.polygons.map do |polygon|
              consume(:triangles)
              raise ArgumentError, 'La API no devolvió triangulación; no se aproxima la cara.' unless polygon.length == 3
              ids = polygon.map { |i| i.abs - 1 }
              raise ArgumentError, 'Índice de malla inválido.' unless ids.all? { |i| i.between?(0, vertices.length - 1) }
              ids
            end
            loops = entity.loops.map { |loop| { 'outer' => loop.outer?, 'vertices_mm' => loop.vertices.map { |v| point(v.position) } } }
            faces << { 'id' => identity(entity), 'vertices_mm' => vertices, 'triangles' => triangles,
                       'loops' => loops, 'edge_ids' => entity.edges.map { |e| identity(e) },
                       'normal_local' => entity.normal.to_a.map(&:to_f),
                       'area_mm2_local' => triangles.sum { |t| triangle_area(*t.map { |i| vertices[i] }) },
                       'front_material_id' => material(entity.material), 'back_material_id' => material(entity.back_material),
                       'hidden' => entity.hidden?, 'tag' => tag(entity), 'visible' => visible?(entity) }
          elsif defined?(Sketchup::Edge) && entity.is_a?(Sketchup::Edge)
            consume(:edges)
            edges << { 'id' => identity(entity), 'start_mm' => point(entity.start.position), 'end_mm' => point(entity.end.position),
                       'face_ids' => entity.faces.map { |f| identity(f) }, 'material_id' => material(entity.material),
                       'soft' => entity.soft?, 'smooth' => entity.smooth?, 'hidden' => entity.hidden?, 'tag' => tag(entity) }
          end
        end
        { 'faces' => faces, 'edges' => edges, 'bounds_mm_local_direct_faces' => bounds,
          'interpretation' => 'painted faces and edges are observations; no board or edge band classification' }
      end

      def triangle_area(a, b, c)
        u = b.zip(a).map { |v, w| v - w }; v = c.zip(a).map { |n, w| n - w }
        cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        Math.sqrt(cross.sum { |n| n*n }) / 2.0
      end

      def orientation(world)
        axes = 3.times.map { |i| world[i*4, 3] }
        scales = axes.map { |a| Math.sqrt(a.sum { |v| v*v }) }
        determinant = axes[0][0]*(axes[1][1]*axes[2][2]-axes[1][2]*axes[2][1]) - axes[1][0]*(axes[0][1]*axes[2][2]-axes[0][2]*axes[2][1]) + axes[2][0]*(axes[0][1]*axes[1][2]-axes[0][2]*axes[1][1])
        shear = [[0,1],[0,2],[1,2]].any? { |i,j| axes[i].zip(axes[j]).sum { |a,b| a*b }.abs > 1e-8 * scales[i] * scales[j] }
        { 'scales' => scales, 'mirrored' => determinant < 0, 'singular' => determinant.abs < 1e-12, 'sheared' => shear }
      end

      def dimensions(geometry, world)
        bounds = geometry['bounds_mm_local_direct_faces']
        return nil unless bounds
        scales = orientation(world)['scales']
        3.times.map { |i| (bounds[1][i] - bounds[0][i]) * scales[i] }
      end

      def material(value)
        return nil unless value
        key = "material:#{value.entityID}"
        unless @materials.key?(key)
          attrs = {}
          if value.respond_to?(:get_attribute)
            OCL_KEYS.each do |name|
              observed = value.get_attribute('ladb_opencutlist', name, nil)
              if observed.is_a?(String) && observed.bytesize > 20_000
                issue('material_attribute_limit', name)
              elsif observed.nil? || observed == true || observed == false || observed.is_a?(String) || (observed.is_a?(Numeric) && observed.finite?)
                attrs[name] = observed unless observed.nil?
              else
                issue('unsupported_material_attribute', name)
              end
            end
          end
          @materials[key] = { 'id' => key, 'name' => value.display_name.to_s,
                               'color_rgb' => [value.color.red, value.color.green, value.color.blue],
                               'alpha' => value.alpha, 'has_texture' => !value.texture.nil?,
                               'opencutlist_observed' => attrs, 'planos_santo_observed' => MaterialResolver.observe_binding(value), 'catalog_approved' => false }
        end
        key
      end

      def ocl_status
        loaded = Object.const_defined?(:Ladb, false) && ::Ladb.const_defined?(:OpenCutList, false)
        mod = loaded ? ::Ladb.const_get(:OpenCutList, false) : nil
        { 'namespace_present' => !!loaded,
          'version' => mod && mod.const_defined?(:EXTENSION_VERSION, false) ? mod.const_get(:EXTENSION_VERSION, false).to_s : nil,
          'build' => mod && mod.const_defined?(:EXTENSION_BUILD, false) ? mod.const_get(:EXTENSION_BUILD, false).to_s : nil,
          'integration' => 'observations_only_no_internal_calls', 'dictionary' => 'ladb_opencutlist' }
      end
    end
  end
end
