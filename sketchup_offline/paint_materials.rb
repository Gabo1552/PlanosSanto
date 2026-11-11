# frozen_string_literal: true
require 'json'
require 'securerandom'
require_relative 'catalog_store'
require_relative 'material_resolver'
require_relative 'material_policy'
require_relative 'material_library'
require_relative 'ocl_attributes'

module PlanosSanto
  # Single source of truth for "can this catalog material paint in THIS model?"
  # (Hito 1, 0.8.8; audit causes C1-C5). The palette shows these states, and
  # choosing a material calls #prepare: the explicit intent to paint authorizes
  # installing the verified visual. No commercial data is involved.
  class PaintMaterials
    PAINT_STATES = %w[ready installable].freeze

    def initialize(model, catalog:, directory:)
      @model, @catalog, @directory = model, catalog, directory
      @library = MaterialLibrary.new(model, catalog: catalog, directory: directory)
    end

    # catalogId => {'state','message','action'?,'materialUuid'?,'materialId'?}
    def states
      catalog = @catalog.read
      duplicates = @library.duplicate_uuids
      bound = bound_materials
      pending = pending_links(catalog)
      catalog['items'].select { |item| %w[sheet edge].include?(item['kind']) }.to_h do |item|
        [item['id'], state_for(item, catalog, bound[item['id']] || [], duplicates, pending)]
      end
    end

    # State of a single item (toolbar resume needs only one).
    def state(catalog_id)
      catalog = @catalog.read
      item = catalog['items'].find { |row| row['id'] == catalog_id && %w[sheet edge].include?(row['kind']) }
      item && state_for(item, catalog, bound_materials[item['id']] || [], @library.duplicate_uuids, pending_links(catalog))
    end

    # Returns {'catalogId','materialUuid','materialId','installed','message'}.
    def prepare(catalog_id, mode)
      kind = mode == 'edge' ? 'edge' : 'sheet'
      catalog = @catalog.read
      item = catalog['items'].find { |row| row['id'] == catalog_id }
      raise ExportError, 'La ficha del material ya no existe en la biblioteca.' unless item
      unless %w[sheet edge].include?(item['kind'])
        raise ExportError, "«#{item['name']}» no está clasificada como placa ni canto. Clasificala en la biblioteca."
      end
      unless item['kind'] == kind
        raise ExportError, "«#{item['name']}» es #{item['kind'] == 'edge' ? 'un canto; usá Pintar canto' : 'una placa; usá Pintar pieza'}."
      end
      state = state_for(item, catalog, bound_materials[item['id']] || [], @library.duplicate_uuids, pending_links(catalog))
      linked = false
      if state['autoLink']
        # 0.8.17: choosing the material is enough; its link resolves itself first.
        linked = @library.auto_link!['changed'].to_i.positive?
        catalog = @catalog.read
        item = catalog['items'].find { |row| row['id'] == catalog_id } || item
        state = state_for(item, catalog, bound_materials[item['id']] || [], @library.duplicate_uuids, {})
      end
      case state['state']
      when 'ready'
        # Integrity at selection time (0.8.8 security review): if the library still
        # holds this photo's files they must be intact; if they are absent (model
        # opened on another PC) the installed material and its proof are enough.
        if MaterialPolicy.photo?(item) && MaterialPolicy.design_asset(item, directory: @directory)['status'] == 'corrupt'
          raise ExportError, "El archivo de textura de «#{item['name']}» en la biblioteca fue alterado o está dañado (no coincide su huella). Restaurá la copia de seguridad antes de pintar."
        end
        { 'catalogId' => item['id'], 'materialUuid' => state['materialUuid'], 'materialId' => state['materialId'],
          'installed' => linked, 'linked' => linked,
          'message' => linked ? "«#{item['name']}» se vinculó sola con su material del modelo. Hacé clic en las piezas para pintar." : "Material activo: #{item['name']}." }
      when 'installable'
        install(item, catalog)
      else
        raise ExportError, state['message']
      end
    end

    # Solid-colour visual for a catalog item that has none (or whose visual the
    # operator wants to replace by a plain colour). Commercial data untouched.
    def assign_color(catalog_id, rgb)
      unless rgb.is_a?(Array) && rgb.length == 3 && rgb.all? { |value| value.is_a?(Integer) && value.between?(0, 255) }
        raise ExportError, 'Elegí un color válido.'
      end
      catalog = @catalog.read
      result = @library.locked('revision' => catalog['revision'], 'confirmed' => true) do |current, index|
        item = current['items'].find { |row| row['id'] == catalog_id }
        raise ExportError, 'La ficha del material ya no existe en la biblioteca.' unless item
        raise ExportError, "«#{item['name']}» no está clasificada como placa ni canto." unless %w[sheet edge].include?(item['kind'])
        raise ExportError, "«#{item['name']}» tiene una foto propia; reemplazala desde la biblioteca." if MaterialPolicy.photo?(item)
        unless (bound_materials[item['id']] || []).empty?
          raise ExportError, "«#{item['name']}» ya tiene un material en este modelo; cambiá su color desde SketchUp o la biblioteca."
        end
        @library.mutate(index) do
          before = @model.materials.to_a
          material = @model.materials.add(item['name'])
          raise ExportError, 'SketchUp no pudo crear el material de color.' unless material && !before.include?(material)
          material.color = Sketchup::Color.new(*rgb)
          binding = MaterialResolver.binding_for(item)
          material.set_attribute(MaterialResolver::DICT, MaterialResolver::KEY, JSON.generate(binding))
          ocl = OclAttributes.write_missing(material, item)
          changed = @library.archive(material, item, index, true)
          raise ExportError, 'No se pudo guardar el color en la biblioteca para reutilizarlo en otros modelos.' unless changed
          [{ 'materialId' => @library.material_id(material), 'binding' => binding, 'opencutlist' => ocl }, true]
        end
      end
      { 'catalogId' => catalog_id, 'materialUuid' => result.dig('binding', 'uuid'), 'materialId' => result['materialId'], 'assigned' => true }
    end

    private

    def bound_materials
      @model.materials.to_a.each_with_object({}) do |material, map|
        catalog_id = MaterialResolver.observe_binding(material).dig('binding', 'catalogId')
        (map[catalog_id] ||= []) << material if catalog_id
      end
    end

    # catalogId => model material that #auto_link! would link or repair for that ficha.
    def pending_links(catalog)
      @library.link_plan(catalog)['actions'].each_with_object({}) do |action, map|
        map[action['item']['id']] ||= @library.display_name(action['material']) if action['item']
      end
    rescue ExportError
      {}
    end

    def state_for(item, catalog, bound, duplicates, pending = {})
      name = item['name']
      if pending.key?(item['id']) && bound.none? { |material| @library.binding_issues(material, catalog, duplicates).empty? }
        return { 'state' => 'installable', 'autoLink' => true,
                 'message' => "«#{name}» se vincula sola con «#{pending[item['id']]}» del modelo al elegirla." }
      end
      unless bound.empty?
        with_issues = bound.map { |material| [material, @library.binding_issues(material, catalog, duplicates)] }
        valid = with_issues.select { |_material, issues| issues.empty? }.map(&:first)
        unless valid.empty?
          # Copies of the same visual (e.g. pasted from another SKP) are equivalent:
          # pick deterministically instead of blocking the operator.
          chosen = valid.min_by { |material| material.entityID.to_i }
          binding = MaterialResolver.read_binding(chosen)
          return { 'state' => 'ready', 'message' => "Listo para pintar: #{name}.", 'materialUuid' => binding['uuid'], 'materialId' => @library.material_id(chosen) }
        end
        issues = with_issues.flat_map(&:last)
        if issues.any? { |issue| issue.include?('no coincide con su foto') }
          return { 'state' => 'texture_mismatch', 'action' => 'library',
                   'message' => "La textura de «#{name}» en este modelo no coincide con su foto: se cambió la imagen o el tamaño/escala en SketchUp. Reparala desde la biblioteca (Reemplazar foto / textura)." }
        end
        return { 'state' => 'binding_conflict', 'action' => 'library',
                 'message' => "Problema de vinculación de «#{name}»: #{issues.uniq.join(' ')}" }
      end
      if MaterialPolicy.photo?(item) && !MaterialPolicy.metadata_valid?(item)
        return { 'state' => 'asset_corrupt', 'action' => 'library',
                 'message' => "La ficha de foto de «#{name}» tiene datos de imagen inválidos. Volvé a cargar la foto desde la biblioteca." }
      end
      asset = MaterialPolicy.design_asset(item, directory: @directory)
      case asset['status']
      when 'ok'
        { 'state' => 'installable', 'message' => "«#{name}» todavía no está en este modelo; se instala automáticamente al elegirlo." }
      when 'corrupt'
        { 'state' => 'asset_corrupt', 'action' => 'library',
          'message' => "El archivo de textura de «#{name}» fue alterado o está dañado (no coincide su huella). Restaurá la copia de seguridad de la biblioteca o volvé a cargar la foto." }
      when 'missing'
        { 'state' => 'asset_missing', 'action' => 'library',
          'message' => "Falta el archivo de textura de «#{name}» en la biblioteca local. Restaurá la copia de seguridad o volvé a cargar la foto." }
      else
        { 'state' => 'needs_visual', 'action' => 'assign_visual',
          'message' => "«#{name}» no tiene imagen, textura ni color. Asignale una foto o un color para poder pintar." }
      end
    end

    def install(item, catalog)
      result = begin
        @library.install({ 'catalogId' => item['id'], 'revision' => catalog['revision'], 'confirmed' => true }, with_status: false)
      rescue ExportError
        raise
      rescue StandardError => error
        raise ExportError, "SketchUp no pudo instalar «#{item['name']}» en este modelo (#{error.class}: #{error.message}). No se modificó el modelo."
      end
      binding = result['binding']
      raise ExportError, "SketchUp no devolvió el material instalado de «#{item['name']}»." unless binding && binding['uuid']
      { 'catalogId' => item['id'], 'materialUuid' => binding['uuid'], 'materialId' => result['materialId'],
        'installed' => true, 'message' => "«#{item['name']}» se instaló en este modelo. Hacé clic en las piezas para pintar." }
    end
  end

  # 0.8.31: «Materiales del proyecto». The library is global (one per taller);
  # each SKP keeps the short list of fichas it works with, so the paint palette
  # shows those first and the rest of the library stays folded. Stored in the
  # MODEL, in its own dictionary (never in the guide, nor in OpenCutList keys).
  # Only catalog ids are written: no names, prices, paths or textures.
  class ProjectMaterials
    DICTIONARY = 'PlanosSantoProject'
    KEY = 'materials_v1'
    SCHEMA = 1
    MAX_IDS = 500
    MAX_BYTES = 64 * 1024
    ID_PATTERN = /\A[0-9A-Za-z_-]{1,64}\z/.freeze
    OPERATION = 'Materiales del proyecto Planos Santo'

    def self.id?(value)
      value.is_a?(String) && value.match?(ID_PATTERN)
    end

    def initialize(model)
      @model = model
    end

    # {'ids'=>[...], 'status'=>'empty'|'valid'|'damaged'|'newer'}. Never raises:
    # a damaged attribute reads as an empty list (the palette keeps working).
    # `existing` (catalog ids) drops fichas that are no longer in the library.
    def read(existing = nil)
      raw = @model.respond_to?(:get_attribute) ? @model.get_attribute(DICTIONARY, KEY) : nil
      return { 'ids' => [], 'status' => 'empty' } if raw.nil?
      data = parse(raw)
      return { 'ids' => [], 'status' => data } if data.is_a?(String)
      ids = data['ids'].select { |id| self.class.id?(id) }.uniq.first(MAX_IDS)
      ids &= existing.to_a if existing
      { 'ids' => ids, 'status' => 'valid' }
    rescue StandardError => error
      warn("Planos Santo: no se pudo leer la lista de materiales del proyecto: #{error.class}")
      { 'ids' => [], 'status' => 'damaged' }
    end

    def payload(existing)
      result = read(existing)
      { 'schema' => SCHEMA, 'ids' => result['ids'], 'status' => result['status'] }
    end

    # Adds/removes catalog ids as ONE named SketchUp operation (Ctrl+Z undoes
    # it). Added ids must exist in the library; ids that left the library are
    # dropped on every write. Returns {'projectMaterials'=>..., 'changed'=>n}.
    def change(add:, remove:, existing:)
      add = id_list!(add, 'agregar')
      remove = id_list!(remove, 'quitar')
      existing = existing.to_a
      missing = add - existing
      raise ExportError, 'Ese material ya no está en la biblioteca del taller. Actualizá la lista y volvé a elegirlo.' unless missing.empty?
      current = read(nil)
      raise ExportError, 'Este SKP guarda los materiales del proyecto con una versión más nueva de Planos Santo. No se modificó la lista.' if current['status'] == 'newer'
      before = current['ids'] & existing
      after = (before - remove + add).uniq
      raise ExportError, "Un proyecto admite hasta #{MAX_IDS} materiales." if after.length > MAX_IDS
      changed = (after - before).length + (before - after).length
      stored_ids = current['ids']
      if changed.zero? && stored_ids == before
        return { 'projectMaterials' => payload(existing), 'changed' => 0, 'noChanges' => true }
      end
      write(after)
      { 'projectMaterials' => payload(existing), 'changed' => changed }
    end

    private

    def parse(raw)
      return 'damaged' unless raw.is_a?(String) && raw.bytesize <= MAX_BYTES
      data = JSON.parse(raw)
      return 'damaged' unless data.is_a?(Hash)
      return 'newer' if data['schema'].is_a?(Integer) && data['schema'] > SCHEMA
      return 'damaged' unless data['schema'] == SCHEMA && data['ids'].is_a?(Array) && data['ids'].length <= MAX_IDS
      data
    rescue JSON::ParserError
      'damaged'
    end

    def id_list!(value, verb)
      value = [] if value.nil?
      unless value.is_a?(Array) && value.length <= MAX_IDS && value.all? { |id| self.class.id?(id) }
        raise ExportError, "Lista de materiales para #{verb} inválida."
      end
      value.uniq
    end

    def write(ids)
      json = JSON.generate({ 'schema' => SCHEMA, 'ids' => ids })
      raise ExportError, 'La lista de materiales del proyecto es demasiado grande.' if json.bytesize > MAX_BYTES
      started = false
      begin
        raise ExportError, 'No se pudo iniciar el cambio de materiales del proyecto.' unless @model.start_operation(OPERATION, true)
        started = true
        @model.set_attribute(DICTIONARY, KEY, json)
        raise ExportError, 'No se pudo confirmar el cambio de materiales del proyecto.' unless @model.commit_operation
        started = false
      rescue StandardError
        @model.abort_operation if started
        raise
      end
      ids
    end
  end
end
