# frozen_string_literal: true
# Verificador de SOLO LECTURA para la candidata 0.8.9 (Hito 1, correcciones de la validación nativa 0.8.8) en SketchUp 2026.
# Cargarlo define un módulo y no ejecuta nada. Cada método se invoca a mano desde
# la consola Ruby, sobre una COPIA del modelo. Ninguno abre operaciones, escribe
# atributos, instala materiales ni modifica archivos.
require 'json'
require 'digest'

module PlanosSantoValidacion089
  VERSION = '0.8.9'

  def self.controller
    PlanosSanto.instance_variable_get(:@offline_controller) || raise('Planos Santo no está cargado.')
  end

  def self.directory
    ENV['PLANOS_SANTO_DATA_DIR'] || PlanosSanto::CatalogStore.default_directory
  end

  def self.unchanged!(model, modified)
    raise 'El modelo cambió durante la consulta (no debería ocurrir).' unless model.modified? == modified
  end

  # 1) Instalación: versión, inventario y hashes del manifiesto, barra registrada.
  def self.integridad
    raise 'Usar SketchUp 2026.' unless defined?(Sketchup) && Sketchup.version.to_s.split('.').first == '26'
    raise "Versión instalada: #{PlanosSanto::Release::VERSION}" unless PlanosSanto::Release::VERSION == VERSION
    model = Sketchup.active_model; modified = model.modified?
    source = PlanosSanto::OfflineController.instance_method(:handle).source_location.first
    folder = File.dirname(source); root = File.dirname(folder)
    manifest = JSON.parse(File.read(File.join(folder, 'manifest.json')))
    raise 'Manifiesto de otra versión.' unless manifest['version'] == VERSION
    files = manifest.fetch('files')
    mismatches = files.filter_map do |name, expected|
      raise 'Ruta inválida en manifiesto.' if name.split('/').include?('..') || name.start_with?('/') || name.include?('\\')
      path = File.join(root, name)
      name unless File.file?(path) && Digest::SHA256.file(path).hexdigest == expected
    end
    registry = PlanosSanto::QuickToolbar.registry
    unchanged!(model, modified)
    { 'version' => VERSION, 'sketchupVersion' => Sketchup.version.to_s, 'rubyVersion' => RUBY_VERSION,
      'installedFiles' => files.length, 'mismatches' => mismatches, 'toolbar' => registry && registry[:commands].keys.sort,
      'paintModules' => %w[paint_materials.rb ocl_attributes.rb].all? { |name| files.key?("planos_santo/#{name}") },
      'passed' => mismatches.empty?, 'productionApproved' => false }
  end

  # 2) Estado de pintura de cada ficha EN ESTE MODELO (lo que verá la paleta).
  def self.estados
    model = Sketchup.active_model; modified = model.modified?
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    states = PlanosSanto::PaintMaterials.new(model, catalog: catalog, directory: directory).states
    names = catalog.read['items'].to_h { |item| [item['id'], item['name']] }
    unchanged!(model, modified)
    { 'resumen' => states.values.group_by { |row| row['state'] }.transform_values(&:length),
      'fichas' => states.map { |id, row| { 'nombre' => names[id], 'estado' => row['state'], 'mensaje' => row['message'] } } }
  end

  # 3) Atributos OpenCutList en materiales vinculados por Planos Santo.
  def self.atributos_ocl
    model = Sketchup.active_model; modified = model.modified?
    rows = model.materials.filter_map do |material|
      binding = PlanosSanto::MaterialResolver.observe_binding(material)['binding']
      next unless binding
      keys = %w[type std_thicknesses std_sizes grained thickness std_widths]
      { 'material' => material.display_name, 'tipoPlanosSanto' => binding['kind'],
        'opencutlist' => keys.to_h { |key| [key, material.get_attribute('ladb_opencutlist', key, nil)] }.compact }
    end
    unchanged!(model, modified)
    rows
  end

  # 4) Tiempo de planificación del clic (sin aplicar): seleccionar UNA pieza
  #    (grupo/componente con caras) fuera de edición y pasar el catalogId de una
  #    ficha en estado "ready". 'clic' mide el plan que usa el clic inmediato
  #    0.8.9 (un recorrido, sin huella geométrica); 'vistaPrevia' mide el plan
  #    completo con firma (el que medía 0.8.8). Ninguno escribe caras.
  def self.tiempo_clic(catalog_id, repeticiones: 5)
    model = Sketchup.active_model; modified = model.modified?
    piece = model.selection.find { |entity| entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance) }
    raise 'Seleccioná una pieza (grupo o componente) fuera de la edición.' unless piece
    face = (piece.is_a?(Sketchup::Group) ? piece.entities : piece.definition.entities).grep(Sketchup::Face).first
    raise 'La pieza seleccionada no tiene caras propias.' unless face
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    state = PlanosSanto::PaintMaterials.new(model, catalog: catalog, directory: directory).states[catalog_id]
    raise "La ficha no está lista en este modelo: #{state && state['message']}" unless state && state['state'] == 'ready'
    path = ((model.active_path || []) + [piece]).map { |entity| entity.persistent_id.to_s }.join('/')
    data = { 'mode' => 'sheet', 'immediatePiece' => true, 'immediate' => true, 'catalogId' => catalog_id, 'materialUuid' => state['materialUuid'],
             'targets' => [{ 'pieceId' => path, 'faceIds' => [face.persistent_id.to_s] }] }
    smart = PlanosSanto::SmartPaint.new(model, catalog: catalog)
    measure = lambda do |light|
      Array.new(repeticiones) do
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        smart.plan(data, light: light)
        ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(1)
      end
    end
    click = measure.call(true); full = measure.call(false)
    unchanged!(model, modified)
    median = ->(times) { times.sort[times.length / 2] }
    { 'clic' => { 'msPorPlan' => click, 'mediana' => median.call(click) },
      'vistaPrevia' => { 'msPorPlan' => full, 'mediana' => median.call(full) },
      'nota' => 'Plan de solo lectura (sin la escritura de caras). El clic real agrega la operación nativa y el redibujo.' }
  end

  # 5) P1 (V1/V15): decodifica una foto con el MISMO código del producto, sin
  #    crear material, ficha ni archivos de biblioteca. Usa una copia temporal.
  def self.foto(ruta)
    model = Sketchup.active_model; modified = model.modified?
    rep = Sketchup::ImageRep.new; returned = rep.load_file(ruta)
    native = { 'loadReturn' => returned.inspect, 'width' => rep.width, 'height' => rep.height, 'bitsPerPixel' => rep.bits_per_pixel,
               'rowPadding' => rep.row_padding, 'size' => rep.size, 'dataBytes' => rep.data.bytesize }
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    service = PlanosSanto::PhotoMaterial.new(model, catalog: catalog, directory: directory)
    product = begin
      result = service.pick(ruta)
      result.slice('name', 'widthPx', 'heightPx', 'sourceHash').merge('aceptada' => true, 'vistaPrevia' => result['preview'].to_s.start_with?('data:image/png;base64,'))
    rescue PlanosSanto::ExportError => error
      { 'aceptada' => false, 'error' => error.message }
    ensure
      service.cancel
    end
    unchanged!(model, modified)
    { 'imageRep' => native, 'producto' => product }
  end

  # 6) P1 (V6): fichas instalables cuyo SKM trae un nombre que YA existe en el
  #    modelo. En 0.8.9 se instalan como material propio; el existente no cambia.
  def self.colisiones
    model = Sketchup.active_model; modified = model.modified?
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    index = PlanosSanto::MaterialLibrary.new(model, catalog: catalog, directory: directory).assets['records']
    names = model.materials.map { |material| material.name.to_s }
    states = PlanosSanto::PaintMaterials.new(model, catalog: catalog, directory: directory).states
    rows = catalog.read['items'].filter_map do |item|
      record = index.find { |row| row['catalogId'] == item['id'] }
      next unless record && states.dig(item['id'], 'state') == 'installable' && names.include?(record['sourceName'])
      { 'ficha' => item['name'], 'nombreEnSkm' => record['sourceName'] }
    end
    unchanged!(model, modified)
    rows
  end
end
