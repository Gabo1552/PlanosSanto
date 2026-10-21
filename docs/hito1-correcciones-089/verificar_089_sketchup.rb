# frozen_string_literal: true
# Verificador de SOLO LECTURA para la candidata 0.8.9 (Hito 1) en SketchUp 2026.
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
  #    ficha en estado "ready". Mide 5 planes completos de solo lectura.
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
    data = { 'mode' => 'sheet', 'immediatePiece' => true, 'catalogId' => catalog_id, 'materialUuid' => state['materialUuid'],
             'targets' => [{ 'pieceId' => path, 'faceIds' => [face.persistent_id.to_s] }] }
    smart = PlanosSanto::SmartPaint.new(model, catalog: catalog)
    times = Array.new(repeticiones) do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      smart.preview(data.merge('immediate' => true))
      smart.cancel
      ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(1)
    end
    unchanged!(model, modified)
    { 'msPorPlan' => times, 'mediana' => times.sort[times.length / 2],
      'nota' => 'Plan de solo lectura (sin la escritura de caras). El clic real agrega la operación nativa y el redibujo.' }
  end
end
