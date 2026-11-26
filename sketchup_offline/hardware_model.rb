# frozen_string_literal: true
module PlanosSanto
  # Herrajes en 3D (0.8.37): bisagras codo 0 y correderas dibujadas en el modelo donde las calculó Piezas
  # (sketchup_offline/ui/hardwarePlacement.ts). Cada mueble tiene su grupo propio en la raíz del modelo, con la
  # etiqueta «Planos Santo · Herrajes» y el diccionario PlanosSantoHerrajes: nunca se escribe dentro de un mueble ni
  # se toca una pieza, y el exportador saltea esos grupos (no son muebles ni piezas). Colocar reemplaza los herrajes
  # anteriores de ese mueble; colocar y quitar son UNA operación de Deshacer. Formas esquemáticas propias (cajas y
  # un cilindro), sin modelos de fabricantes. Probado sólo con dobles de la API: se valida en SketchUp real.
  module HardwareModel
    DICTIONARY = 'PlanosSantoHerrajes'
    TAG = 'Planos Santo · Herrajes'
    VERSION = 1
    MM = 1 / 25.4
    MAX_PLACEMENTS = 400
    KINDS = %w[hinge runner].freeze
    SIDES = %w[left right].freeze
    # Medidas de las formas, en mm, en los ejes locales que manda la UI (ver hardwarePlacement.ts).
    HINGE_CUP = { center: [22.0, 0.0, 0.0], radius: 17.5, depth: 12.0 }.freeze
    HINGE_ARM = [[21.0, 0.0, -8.0], [40.0, 45.0, 8.0]].freeze
    HINGE_PLATE = [[18.0, 20.0, -20.0], [21.0, 60.0, 20.0]].freeze
    RUNNER = { half: 6.25, height: 35.0 }.freeze

    module_function

    def group?(entity)
      entity.is_a?(Sketchup::Group) && entity.respond_to?(:get_attribute) && entity.get_attribute(DICTIONARY, 'role') == 'group'
    end

    def groups(model)
      model.entities.select { |entity| group?(entity) && (!entity.respond_to?(:valid?) || entity.valid?) }
    end

    def items(group)
      group.entities.select { |entity| entity.is_a?(Sketchup::ComponentInstance) && entity.get_attribute(DICTIONARY, 'role') == 'item' }
    end

    # Lo colocado, por mueble: cantidad de bisagras y correderas y el lado de las bisagras de cada puerta.
    def status(model)
      groups(model).map do |group|
        found = items(group)
        sides = {}
        found.each { |item| sides[item.get_attribute(DICTIONARY, 'pieceId')] = item.get_attribute(DICTIONARY, 'side') if item.get_attribute(DICTIONARY, 'kind') == 'hinge' }
        { 'furnitureId' => group.get_attribute(DICTIONARY, 'furnitureId'), 'furnitureName' => group.get_attribute(DICTIONARY, 'furnitureName'),
          'hinges' => found.count { |item| item.get_attribute(DICTIONARY, 'kind') == 'hinge' },
          'runners' => found.count { |item| item.get_attribute(DICTIONARY, 'kind') == 'runner' }, 'sides' => sides }
      end
    end

    # `request`: [{'id'=>mueble, 'placements'=>[{pieceId, kind, side, lengthMm, matrix}]}] contra los muebles generados.
    def place(model, document, request)
      plan = validate(document, request)
      count = 0
      operation(model, 'Colocar herrajes') do
        layer = tag(model)
        plan.each do |entry|
          groups(model).select { |group| group.get_attribute(DICTIONARY, 'furnitureId') == entry[:id] }.each(&:erase!)
          next if entry[:placements].empty?
          group = model.entities.add_group
          group.name = "Herrajes · #{entry[:name]}"
          group.layer = layer
          { 'role' => 'group', 'version' => VERSION, 'furnitureId' => entry[:id], 'furnitureName' => entry[:name] }.each { |key, value| group.set_attribute(DICTIONARY, key, value) }
          entry[:placements].each do |placement|
            instance = group.entities.add_instance(definition(model, placement['kind'], placement['lengthMm']), transformation(placement['matrix']))
            raise ExportError, 'SketchUp no pudo colocar un herraje.' unless instance
            instance.layer = layer
            { 'role' => 'item', 'pieceId' => placement['pieceId'], 'kind' => placement['kind'], 'side' => placement['side'],
              'lengthMm' => placement['lengthMm'] }.each { |key, value| instance.set_attribute(DICTIONARY, key, value) unless value.nil? }
            count += 1
          end
        end
      end
      { 'placed' => count, 'status' => status(model) }
    end

    # Quita los herrajes de esos muebles (todos si `ids` es nil). Sin nada que quitar no abre operación.
    def remove(model, ids = nil)
      raise ExportError, 'Elegí qué muebles.' unless ids.nil? || (ids.is_a?(Array) && ids.all? { |id| id.is_a?(String) })
      found = groups(model).select { |group| ids.nil? || ids.include?(group.get_attribute(DICTIONARY, 'furnitureId')) }
      removed = found.sum { |group| items(group).length }
      operation(model, 'Quitar herrajes') { found.each(&:erase!) } unless found.empty?
      { 'removed' => removed, 'status' => status(model) }
    end

    def validate(document, request)
      raise ExportError, 'Primero generá las guías en Muebles.' unless document.is_a?(Hash) && document['furniture'].is_a?(Array)
      raise ExportError, 'Elegí qué muebles.' unless request.is_a?(Array) && !request.empty? && request.length <= Exporter::MAX_FURNITURE
      roots = document['furniture'].map { |root| [root['id'], root] }.to_h
      total = 0
      plan = request.map do |entry|
        raise ExportError, 'Pedido de herrajes inválido.' unless entry.is_a?(Hash) && entry['id'].is_a?(String) && entry['placements'].is_a?(Array)
        root = roots[entry['id']]
        raise ExportError, 'Ese mueble ya no está en Piezas: volvé a generar.' unless root
        pieces = []
        Exporter.each_node([root]) { |node| pieces << node['id'] if node['mesh'] }
        total += entry['placements'].length
        raise ExportError, "Son más de #{MAX_PLACEMENTS} herrajes de una vez: colocalos por mueble." if total > MAX_PLACEMENTS
        entry['placements'].each { |placement| check_placement!(placement, pieces) }
        { id: entry['id'], name: root['name'].to_s[0, 80], placements: entry['placements'] }
      end
      raise ExportError, 'Hay un mueble repetido en el pedido.' unless plan.map { |entry| entry[:id] }.uniq.length == plan.length
      plan
    end

    def check_placement!(placement, pieces)
      raise ExportError, 'Pedido de herrajes inválido.' unless placement.is_a?(Hash) && KINDS.include?(placement['kind']) && SIDES.include?(placement['side'])
      raise ExportError, 'Esa pieza ya no está en Piezas: volvé a generar.' unless pieces.include?(placement['pieceId'])
      length = placement['lengthMm']
      if placement['kind'] == 'runner'
        raise ExportError, 'Largo de corredera inválido.' unless length.is_a?(Numeric) && length.finite? && length.between?(100, 1000)
      else
        raise ExportError, 'Pedido de herrajes inválido.' unless length.nil?
      end
      raise ExportError, 'Ubicación de herraje inválida.' unless matrix?(placement['matrix'])
    end

    # Rotación pura (ejes unitarios, perpendiculares y derechos) y traslación en rango, como arma la UI.
    def matrix?(value)
      return false unless value.is_a?(Array) && value.length == 16 && value.all? { |n| n.is_a?(Numeric) && n.finite? }
      return false unless value.values_at(3, 7, 11).all? { |n| n.abs < 1e-6 } && (value[15] - 1).abs < 1e-6
      x, y, z = [0, 4, 8].map { |i| value[i, 3] }
      dot = ->(a, b) { a.zip(b).sum { |p, q| p * q } }
      return false unless [x, y, z].all? { |axis| (dot.call(axis, axis) - 1).abs < 1e-3 }
      return false unless [[x, y], [y, z], [x, z]].all? { |a, b| dot.call(a, b).abs < 1e-3 }
      cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
      dot.call(cross, z) > 0 && value[12, 3].all? { |n| n.abs <= 1_000_000 }
    end

    def transformation(matrix)
      Geom::Transformation.new(matrix[0, 12].map(&:to_f) + matrix[12, 3].map { |n| n.to_f * MM } + [1.0])
    end

    def tag(model)
      model.layers[TAG] || model.layers.add(TAG)
    end

    # Una definición por forma y largo, reutilizada entre muebles y colocaciones.
    def definition(model, kind, length)
      key = kind == 'hinge' ? 'hinge-codo0' : "runner-#{length.round}"
      found = model.definitions.find { |item| item.respond_to?(:get_attribute) && item.get_attribute(DICTIONARY, 'definition') == key && item.get_attribute(DICTIONARY, 'version') == VERSION }
      return found if found
      created = model.definitions.add(kind == 'hinge' ? 'Planos Santo · Bisagra codo 0' : "Planos Santo · Corredera #{length.round} mm")
      created.set_attribute(DICTIONARY, 'definition', key)
      created.set_attribute(DICTIONARY, 'version', VERSION)
      if kind == 'hinge'
        cylinder(created.entities, HINGE_CUP[:center], HINGE_CUP[:radius], HINGE_CUP[:depth])
        box(created.entities, *HINGE_ARM)
        box(created.entities, *HINGE_PLATE)
      else
        box(created.entities, [0.0, -RUNNER[:half], 0.0], [length.to_f, RUNNER[:half], RUNNER[:height]])
      end
      created
    end

    def point(values)
      Geom::Point3d.new(*values.map { |n| n * MM })
    end

    # Cada sólido en su propio grupo para que las caras que se tocan no se fundan.
    def box(entities, min, max)
      solid = entities.add_group.entities
      z = min[2]
      face = solid.add_face(point([min[0], min[1], z]), point([max[0], min[1], z]), point([max[0], max[1], z]), point([min[0], max[1], z]))
      raise ExportError, 'SketchUp no pudo dibujar un herraje.' unless face
      face.reverse! if face.normal.z < 0
      face.pushpull((max[2] - min[2]) * MM)
    end

    # Cazoleta: cilindro desde la cara interior de la puerta (y = 0) hacia adentro de la puerta (-y).
    def cylinder(entities, center, radius, depth)
      solid = entities.add_group.entities
      edges = solid.add_circle(point(center), Geom::Vector3d.new(0, 1, 0), radius * MM, 24)
      face = solid.add_face(edges)
      raise ExportError, 'SketchUp no pudo dibujar un herraje.' unless face
      face.reverse! if face.normal.y > 0
      face.pushpull(depth * MM)
    end

    # Cualquier error aborta: el modelo queda como estaba.
    def operation(model, name)
      raise ExportError, 'SketchUp no pudo iniciar la operación.' unless model.start_operation(name, true)
      committed = false
      begin
        yield
        raise ExportError, 'SketchUp no pudo confirmar la operación.' unless model.commit_operation
        committed = true
      rescue StandardError => error
        reason = error.is_a?(ExportError) ? error.message : 'SketchUp rechazó la geometría.'
        raise ExportError, "#{name}: #{reason} El modelo quedó como estaba."
      ensure
        model.abort_operation unless committed
      end
    end
  end
end
