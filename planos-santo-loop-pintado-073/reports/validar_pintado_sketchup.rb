# frozen_string_literal: true
# LOCAL ONLY: load manually in SketchUp Ruby Console. Loading performs no test,
# installs nothing and patches no product class. Does not save any SKP.
require 'json'
require 'digest'
require 'time'

module PlanosSantoValidacionPintado074
  EXPECTED_VERSION = '0.7.4'

  def self.require_native!
    raise 'Ejecutar dentro de SketchUp 2026.' unless defined?(Sketchup) && Sketchup.respond_to?(:active_model)
    raise 'Versión candidata incorrecta; reiniciá SketchUp después de instalar.' unless defined?(PlanosSanto::Release::VERSION) && PlanosSanto::Release::VERSION == EXPECTED_VERSION
    %i[NativePaint MaterialLibrary MaterialResolver CatalogStore NameManager].each do |name|
      raise "Falta API instalada #{name}; no cargar fuentes sueltas." unless PlanosSanto.const_defined?(name)
    end
    raise 'Se requiere SketchUp 2026.' unless Sketchup.version.to_s.split('.').first == '26'
    Sketchup.active_model
  end

  def self.catalog
    directory = ENV['PLANOS_SANTO_DATA_DIR'] || PlanosSanto::CatalogStore.default_directory
    [PlanosSanto::CatalogStore.new(directory: directory), directory]
  end

  def self.normalize(value)
    case value
    when Hash then value.to_a.sort_by { |key, _| key.to_s }.to_h.transform_values { |v| normalize(v) }
    when Array then value.map { |v| normalize(v) }
    when String, Integer, TrueClass, FalseClass, NilClass then value
    when Numeric then value.to_f
    else value.respond_to?(:to_a) ? normalize(value.to_a) : value.to_s
    end
  end

  def self.attributes(entity)
    dictionaries = entity.respond_to?(:attribute_dictionaries) && entity.attribute_dictionaries
    return {} unless dictionaries
    dictionaries.to_a.sort_by(&:name).to_h do |dictionary|
      entries = {}; dictionary.each_pair { |key, value| entries[key.to_s] = normalize(value) }
      [dictionary.name, normalize(entries)]
    end
  end

  def self.material_id(material)
    material && material.entityID.to_s
  end

  def self.face_geometry(face)
    mesh = face.mesh(0)
    { 'id' => face.persistent_id.to_s, 'pointsInches' => mesh.points.map { |p| p.to_a.map(&:to_f) },
      'polygons' => mesh.polygons, 'normal' => face.normal.to_a.map(&:to_f),
      'hidden' => face.hidden?, 'layer' => [face.layer.name, face.layer.visible?] }
  end

  # Includes all traversed occurrences, even hidden/shared ones, all own
  # dictionaries (including read-only OCL), and material appearances/bindings.
  def self.snapshot(model)
    inventory = PlanosSanto::NameManager.new(model).inventory
    geometry = {}; face_materials = {}; dictionaries = { 'model' => attributes(model) }
    nodes = inventory[:index].values.sort_by { |node| node['id'] }
    sources = [['loose-root', model.entities]]
    nodes.each do |node|
      entity = node['_entity']; path = node['id']
      geometry[path] = { 'definition' => entity.definition.entityID.to_s, 'name' => entity.name.to_s,
        'transform' => entity.transformation.to_a.map(&:to_f), 'hidden' => entity.hidden?,
        'layer' => [entity.layer.name, entity.layer.visible?], 'material' => material_id(entity.material) }
      dictionaries[path] = attributes(entity)
      dictionaries["definition/#{entity.definition.entityID}"] = attributes(entity.definition)
      source = PlanosSanto::Exporter.new(model).entities_of(entity)
      sources << [path, source]
    end
    sources.each do |path, source|
      faces = source.grep(Sketchup::Face).sort_by(&:persistent_id)
      geometry["#{path}/faces"] = faces.map { |face| face_geometry(face) }
      faces.each do |face|
        key = "#{path}/face/#{face.persistent_id}"
        face_materials[key] = [material_id(face.material), material_id(face.back_material)]
        dictionaries[key] = attributes(face)
      end
    end
    materials = model.materials.to_a.sort_by(&:entityID).map do |material|
      color = material.color; texture = material.texture
      { 'id' => material_id(material), 'name' => material.name.to_s,
        'color' => [color.red, color.green, color.blue], 'alpha' => material.alpha.to_f,
        'texture' => texture && [texture.filename.to_s, texture.width.to_f, texture.height.to_f],
        'attributes' => attributes(material) }
    end
    normalize('geometry' => geometry, 'faceMaterials' => face_materials,
              'attributes' => dictionaries, 'materials' => materials)
  end

  def self.digest(value)
    Digest::SHA256.hexdigest(JSON.generate(normalize(value)))
  end

  # Strictly read-only. Contains private model/catalog metadata: keep local.
  def self.preflight(piece_id: nil)
    model = require_native!
    store, directory = catalog
    before = snapshot(model)
    modified_before = model.modified?
    status = PlanosSanto::NativePaint.new(model, catalog: store).status(piece_id)
    library = PlanosSanto::MaterialLibrary.new(model, catalog: store, directory: directory).status
    data = store.read
    raise 'Preflight alteró el modelo.' unless snapshot(model) == before && model.modified? == modified_before
    { 'stage' => 'readonly_preflight', 'passed' => true, 'time' => Time.now.utc.iso8601,
      'extensionVersion' => PlanosSanto::Release::VERSION, 'sketchupVersion' => Sketchup.version,
      'rubyVersion' => RUBY_VERSION, 'modelPath' => model.path.to_s,
      'snapshotHash' => digest(before), 'paint' => status, 'library' => library,
      'catalogRevision' => data['revision'], 'catalog' => data['items'] }
  end

  def self.checked_copy!(model, copy_path, original_path)
    raise 'Completá copy_path y original_path con archivos existentes.' unless [copy_path, original_path].all? { |path| path.is_a?(String) && File.file?(path) && File.extname(path).downcase == '.skp' }
    raise 'La copia y el original son el mismo archivo.' if File.identical?(copy_path, original_path)
    raise 'El modelo activo no es la copia indicada.' unless !model.path.to_s.empty? && File.identical?(model.path.to_s, copy_path)
    raise 'Guardá primero la copia y resolvé cambios pendientes; no se guardará desde el runner.' if model.modified?
    raise 'Salí del modo de edición antes del ensayo.' if model.active_path && !model.active_path.empty?
    raise 'Terminá operaciones abiertas antes del ensayo.' if model.respond_to?(:active_operation_name) && !model.active_operation_name.to_s.empty?
  end

  # Opt-in exercise. Scope is deliberately limited to ALL with its full reviewed
  # affectedPaths list; make_unique is reserved for separate supervised tests.
  # expected_paths must be copied from readonly preview so scope is explicit.
  def self.exercise(piece_id:, face_ids:, catalog_id:, material_uuid:, axes:, mode:,
                    scope: 'all', side: 'front', confirm: false, copy_path:, original_path:,
                    expected_paths:)
    model = require_native!
    raise 'El ensayo requiere confirm: true explícito.' unless confirm == true
    raise 'Este runner solo admite scope: all; probar Hacer único manualmente.' unless scope == 'all'
    checked_copy!(model, copy_path, original_path)
    store, = catalog
    catalog_before = store.read
    before = snapshot(model)
    copy_hash = Digest::SHA256.file(copy_path).hexdigest
    original_hash = Digest::SHA256.file(original_path).hexdigest
    painter = PlanosSanto::NativePaint.new(model, catalog: store)
    request = { 'pieceId' => piece_id, 'faceIds' => face_ids, 'catalogId' => catalog_id,
                'materialUuid' => material_uuid, 'axes' => axes, 'mode' => mode,
                'scope' => scope, 'side' => side }
    preview = painter.preview(request)
    raise 'La vista previa alteró el modelo.' unless snapshot(model) == before && !model.modified?
    raise 'La vista previa alteró el catálogo.' unless store.read == catalog_before
    raise 'Alcance no confirmado: compará expected_paths con preview affectedPaths.' unless expected_paths.is_a?(Array) && expected_paths.sort == preview.fetch('affectedPaths').sort
    materials = model.materials.to_a.select do |material|
      observation = PlanosSanto::MaterialResolver.observe_binding(material)
      observation['status'] == 'valid' && observation.dig('binding', 'uuid') == material_uuid
    end
    raise 'UUID nativo no unívoco.' unless materials.length == 1
    target_material = material_id(materials.first)
    # An assignment that already matches may create no native Undo entry.
    # Reject no-op exercises so Undo cannot consume an older operator action.
    needs_change = preview.fetch('affectedPaths').any? do |path|
      face_ids.any? do |face_id|
        current = before['faceMaterials'].fetch("#{path}/face/#{face_id}")
        (%w[front both].include?(side) && current[0] != target_material) ||
          (%w[back both].include?(side) && current[1] != target_material)
      end
    end
    raise 'Todas las caras ya tienen ese material/lado. Elegí un cambio real para probar Undo.' unless needs_change
    applied = false; undo_done = false
    begin
      result = painter.apply('token' => preview.fetch('token'), 'confirmed' => true)
      applied = result['changed'] == true
      raise 'El producto no informó el pintado confirmado.' unless applied
      raise 'Cambió el modelo activo durante el pintado.' unless Sketchup.active_model.equal?(model)
      after = snapshot(model)
      %w[geometry attributes materials].each do |key|
        raise "Pintado alteró #{key}; revisar antes de aprobar." unless after[key] == before[key]
      end
      expected = JSON.parse(JSON.generate(before['faceMaterials']))
      preview.fetch('affectedPaths').each do |path|
        face_ids.each do |face_id|
          key = "#{path}/face/#{face_id}"
          raise "No está la cara esperada #{key}." unless expected.key?(key)
          expected[key][0] = target_material if %w[front both].include?(side)
          expected[key][1] = target_material if %w[back both].include?(side)
        end
      end
      raise 'Asignación frontal/posterior o alcance inesperados.' unless after['faceMaterials'] == expected
      raise 'El pintado alteró la biblioteca comercial.' unless store.read == catalog_before
      undo_done = true
      Sketchup.undo
      restored = snapshot(model)
      raise 'Undo no restauró geometría/materiales/atributos completos.' unless restored == before
      raise 'El ensayo sobrescribió un SKP.' unless Digest::SHA256.file(copy_path).hexdigest == copy_hash && Digest::SHA256.file(original_path).hexdigest == original_hash
      { 'stage' => 'native_face_paint_and_undo', 'passed' => true, 'time' => Time.now.utc.iso8601,
        'extensionVersion' => PlanosSanto::Release::VERSION, 'sketchupVersion' => Sketchup.version,
        'rubyVersion' => RUBY_VERSION, 'request' => request, 'preview' => preview,
        'apply' => result, 'beforeHash' => digest(before), 'paintedHash' => digest(after),
        'restoredHash' => digest(restored), 'copySHA256' => copy_hash,
        'originalSHA256' => original_hash, 'savedByRunner' => false,
        'productionApproved' => false }
    ensure
      # Undo belongs ONLY to the operation that this runner successfully applied.
      # Do not retry Undo on failure; it could reverse an unrelated operator action.
      if applied && !undo_done && Sketchup.active_model.equal?(model)
        undo_done = true
        Sketchup.undo
        warn 'Se ejecutó Undo de seguridad por fallo del ensayo. Revisá el modelo y compará el snapshot antes de continuar.'
      end
      painter.cancel
    end
  end

  # Exclusive write: never overwrite evidence. Private reports stay on local disk.
  def self.write_report(result, path)
    raise 'El resultado debe ser un Hash de una prueba ejecutada.' unless result.is_a?(Hash) && result['stage']
    File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |file| file.write(JSON.pretty_generate(result)) }
    path
  end
end
