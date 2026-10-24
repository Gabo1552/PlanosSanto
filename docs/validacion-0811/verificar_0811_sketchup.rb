# frozen_string_literal: true
# Verificador de SOLO LECTURA para las candidatas 0.8.11 a 0.8.23 (Hitos 1 a 7) en SketchUp 2026.
# Parte del verificador 0.8.10 y suma: integridad del manifiesto (archivos sobrantes y
# módulos nuevos), estados de pintura con fichas archivadas, perfil de maderera si existe,
# ModelWatch registrado, cursores del pincel, costo de la huella y tiempos del pincel; y, tras
# integrar los Hitos 3 y 5, pincel avanzado y caché de malla: propuesta de pedido y confirmación
# en bloque sin guardar, referencias parciales, análisis con y sin caché, y ajustes del pincel.
# Cargarlo define un módulo y no ejecuta nada. Cada método se invoca a mano desde
# la consola Ruby, sobre una COPIA del modelo. Ninguno abre operaciones, escribe
# atributos, instala materiales ni modifica archivos.
require 'json'
require 'digest'

module PlanosSantoValidacion0811
  VERSION = '0.8.23'
  # Módulos que tiene que traer una candidata con los Hitos 1, 2, 3, 5, 6 y 7.
  MODULOS = %w[paint_materials.rb ocl_attributes.rb model_watch.rb bounded_zip.rb skm_import.rb
               smart_paint_tool.rb piece_highlight_tool.rb material_library.rb photo_material.rb
               order_proposal.rb order_references.rb exporter.rb].freeze
  CURSORES = %w[paint-piece.png paint-edge.png paint-remove.png paint-blocked.png paint-sample.png].freeze
  PNG = "\x89PNG\r\n\x1A\n".b.freeze

  def self.controller
    PlanosSanto.instance_variable_get(:@offline_controller) || raise('Planos Santo no está cargado.')
  end

  def self.directory
    ENV['PLANOS_SANTO_DATA_DIR'] || PlanosSanto::CatalogStore.default_directory
  end

  # Carpeta instalada planos_santo/ (la del controlador cargado, no la del repo).
  def self.carpeta
    File.dirname(File.expand_path(PlanosSanto::OfflineController.instance_method(:handle).source_location.first))
  end

  def self.unchanged!(model, modified)
    raise 'El modelo cambió durante la consulta (no debería ocurrir).' unless model.modified? == modified
  end

  def self.reloj
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def self.mediana(valores)
    return nil if valores.empty?
    valores.sort[valores.length / 2]
  end

  def self.percentil(valores, p)
    return nil if valores.empty?
    ordenados = valores.sort
    ordenados[[(p * ordenados.length).ceil - 1, 0].max]
  end

  # 1) Instalación: SketchUp 2026, versión, hashes del manifiesto, archivos
  #    sobrantes, módulos de los hitos nuevos y barra registrada.
  def self.integridad(version: VERSION)
    raise 'Usar SketchUp 2026.' unless defined?(Sketchup) && Sketchup.version.to_s.split('.').first == '26'
    model = Sketchup.active_model; modified = model.modified?
    folder = carpeta; root = File.dirname(folder)
    manifest = JSON.parse(File.read(File.join(folder, 'manifest.json')))
    files = manifest.fetch('files')
    mismatches = files.filter_map do |name, expected|
      raise 'Ruta inválida en manifiesto.' if name.split('/').include?('..') || name.start_with?('/') || name.include?('\\') || name.include?(':')
      path = File.join(root, name)
      name unless File.file?(path) && Digest::SHA256.file(path).hexdigest == expected
    end
    # Un .rb que no figura en el manifiesto es código ajeno a la candidata (resto de otra versión).
    extras = Dir.glob(File.join(folder, '**', '*.rb')).map { |path| path.delete_prefix("#{root}/") }.reject { |name| files.key?(name) }.sort
    faltantes = MODULOS.reject { |name| files.key?("planos_santo/#{name}") }
    faltantes += CURSORES.reject { |name| files.key?("planos_santo/cursors/#{name}") }.map { |name| "cursors/#{name}" }
    installed = PlanosSanto::Release::VERSION
    registry = PlanosSanto::QuickToolbar.registry
    unchanged!(model, modified)
    version_ok = installed == version && manifest['version'] == version
    { 'version' => installed, 'versionManifiesto' => manifest['version'], 'versionEsperada' => version, 'versionOk' => version_ok,
      'sketchupVersion' => Sketchup.version.to_s, 'rubyVersion' => RUBY_VERSION,
      'installedFiles' => files.length, 'mismatches' => mismatches, 'extras' => extras, 'faltantes' => faltantes,
      'toolbar' => registry && registry[:commands].keys.sort,
      'passed' => version_ok && mismatches.empty? && extras.empty? && faltantes.empty?, 'productionApproved' => false }
  end

  # 2) Estado de pintura de cada ficha EN ESTE MODELO (lo que verá la paleta),
  #    más las fichas archivadas del Hito 7 (siguen apareciendo en la paleta).
  def self.estados
    model = Sketchup.active_model; modified = model.modified?
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    states = PlanosSanto::PaintMaterials.new(model, catalog: catalog, directory: directory).states
    names = catalog.read['items'].to_h { |item| [item['id'], item['name']] }
    archived = begin
      PlanosSanto::MaterialLibrary.new(model, catalog: catalog, directory: directory).extras['archivedIds']
    rescue StandardError => error
      { 'error' => "#{error.class}: #{error.message}" }
    end
    unchanged!(model, modified)
    archived_ids = archived.is_a?(Array) ? archived : []
    { 'resumen' => states.values.group_by { |row| row['state'] }.transform_values(&:length),
      'archivadas' => archived.is_a?(Array) ? archived.length : archived,
      'fichas' => states.map do |id, row|
        { 'nombre' => names[id], 'estado' => row['state'], 'mensaje' => row['message'], 'archivada' => archived_ids.include?(id) }
      end }
  end

  # 3) Atributos OpenCutList en materiales vinculados por Planos Santo, con las
  #    claves que registró Planos Santo (MATERIALES-13, ocl_written_v1).
  def self.atributos_ocl
    model = Sketchup.active_model; modified = model.modified?
    rows = model.materials.filter_map do |material|
      binding = PlanosSanto::MaterialResolver.observe_binding(material)['binding']
      next unless binding
      keys = %w[type std_thicknesses std_sizes grained thickness std_widths]
      written = material.get_attribute('PlanosSantoMaterial', 'ocl_written_v1', nil)
      { 'material' => material.display_name, 'tipoPlanosSanto' => binding['kind'],
        'opencutlist' => keys.to_h { |key| [key, material.get_attribute('ladb_opencutlist', key, nil)] }.compact,
        'escritasPorPlanosSanto' => written.is_a?(String) ? (JSON.parse(written) rescue 'ilegible').then { |v| v.is_a?(Hash) ? v.keys.sort : v } : nil }
    end
    unchanged!(model, modified)
    rows
  end

  # 4) Perfil de maderera (Hito 4). Si la candidata no lo trae, lo informa sin
  #    fallar; nunca crea uno. Lista solo nombres de archivo, sin leer precios.
  def self.perfil_maderera
    constants = PlanosSanto.constants.map(&:to_s).grep(/Perfil|Profile/i).sort
    files = Dir.exist?(directory) ? Dir.children(directory).grep(/perfil|profile/i).sort : []
    { 'disponible' => !(constants.empty? && files.empty?), 'clases' => constants, 'archivos' => files,
      'nota' => constants.empty? && files.empty? ? 'Esta candidata no trae perfil de maderera (Hito 4 no implementado): marcar el hito como NO APLICA.' : 'Revisar a mano que el perfil esté aprobado.' }
  end

  # 5) ModelWatch (ARQ-03): debe haber uno solo, adjunto al modelo activo,
  #    cuando la ventana principal tiene un análisis abierto.
  def self.model_watch
    model = Sketchup.active_model
    watch = controller.instance_variable_get(:@model_watch)
    session = !controller.instance_variable_get(:@session).nil?
    unless watch
      return { 'registrado' => false, 'sesionAnalizada' => session,
               'ok' => !session, 'nota' => session ? 'Hay análisis abierto pero no hay ModelWatch.' : 'Sin análisis abierto: es correcto que no haya ModelWatch.' }
    end
    observers = watch.instance_variable_get(:@observers) || []
    { 'registrado' => true, 'sesionAnalizada' => session, 'adjunto' => watch.attached?, 'modeloActivo' => watch.model.equal?(model),
      'observadores' => observers.map { |_target, observer| observer.class.name.split('::').last }.sort,
      'pendientes' => watch.pending_kinds, 'demoraSegundos' => PlanosSanto::ModelWatch::DELAY,
      'ok' => watch.attached? && watch.model.equal?(model) && observers.length == 3 }
  end

  # 6) Costo de la huella liviana (ARQ-02, paso 2.8 del Hito 6). Solo lee.
  def self.huella(repeticiones: 3)
    model = Sketchup.active_model; modified = model.modified?
    digests = []
    times = Array.new(repeticiones) do
      started = reloj
      digests << PlanosSanto::ModelWatch.fingerprint(model)
      ((reloj - started) * 1000).round(1)
    end
    unchanged!(model, modified)
    { 'msPorHuella' => times, 'mediana' => mediana(times), 'estable' => digests.uniq.length == 1,
      'nota' => 'Si la mediana pasa de ~200 ms en el modelo grande, abrir ticket de caché por definición.' }
  end

  # 7) Cursores del pincel (Hito 2, PINTURA-12): archivos PNG válidos junto a
  #    smart_paint_tool.rb y API de cursores disponible. No crea cursores.
  def self.cursores
    folder = File.join(carpeta, 'cursors')
    expected = PlanosSanto::SmartPaintTool::CURSORS.values.sort
    rows = expected.map do |name|
      path = File.join(folder, name)
      head = File.file?(path) ? File.binread(path, 24) : ''
      valid = head.bytesize == 24 && head.start_with?(PNG) && head.byteslice(12, 4) == 'IHDR'
      width, height = valid ? head.byteslice(16, 8).unpack('NN') : [nil, nil]
      { 'archivo' => name, 'png' => valid, 'ancho' => width, 'alto' => height }
    end
    api = defined?(UI) && UI.respond_to?(:create_cursor) && UI.respond_to?(:set_cursor)
    { 'cursores' => rows, 'apiCursores' => api ? true : false, 'ok' => api && expected.sort == CURSORES.sort && rows.all? { |row| row['png'] } }
  end

  # 8) Tiempo de planificación del clic (sin aplicar), igual que en 0.8.10:
  #    seleccionar UNA pieza fuera de edición y pasar el catalogId de una ficha
  #    "ready". 'clic' = plan liviano del clic inmediato; 'vistaPrevia' = plan con firma.
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
        started = reloj
        smart.plan(data, light: light)
        ((reloj - started) * 1000).round(1)
      end
    end
    click = measure.call(true); full = measure.call(false)
    unchanged!(model, modified)
    { 'clic' => { 'msPorPlan' => click, 'mediana' => mediana(click) },
      'vistaPrevia' => { 'msPorPlan' => full, 'mediana' => mediana(full) },
      'objetivoMs' => 150, 'cumple' => mediana(click) < 150,
      'nota' => 'Plan de solo lectura (sin la escritura de caras). El clic real se mide con tiempos_pincel.' }
  end

  # 9) Tiempos reales del pincel (PINTURA-09): lee diagnostico/pincel-tiempos.jsonl
  #    que escribe la herramienta en cada clic. Solo lectura; líneas dañadas se cuentan.
  def self.tiempos_pincel(ultimos: 200)
    path = File.join(directory, 'diagnostico', 'pincel-tiempos.jsonl')
    return { 'registros' => 0, 'nota' => 'Todavía no hay clics registrados en esta biblioteca.' } unless File.file?(path)
    damaged = 0
    rows = File.readlines(path, chomp: true).last(ultimos).filter_map do |line|
      row = JSON.parse(line)
      row.is_a?(Hash) && row['ms'].is_a?(Numeric) ? row : (damaged += 1; nil)
    rescue JSON::ParserError
      damaged += 1; nil
    end
    stats = lambda do |subset|
      values = subset.map { |row| row['ms'] }
      { 'n' => values.length, 'p50' => percentil(values, 0.5), 'p95' => percentil(values, 0.95), 'max' => values.max }
    end
    by_mode = rows.group_by { |row| [row['mode'], row['edgeCount']].compact.join('/') }.transform_values { |subset| stats.call(subset) }
    total = stats.call(rows)
    { 'registros' => rows.length, 'dañados' => damaged, 'total' => total, 'porModo' => by_mode,
      'cambios' => rows.count { |row| row['changed'] }, 'rechazados' => rows.count { |row| row['ok'] == false },
      'objetivoMs' => 150, 'cumple' => total['p95'] ? total['p95'] < 150 : nil }
  end

  # 10) P1 (V1/V15): decodifica una foto con el MISMO código del producto, sin
  #     crear material, ficha ni archivos de biblioteca.
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

  # 11) P1 (V6): fichas instalables cuyo SKM trae un nombre que YA existe en el
  #     modelo. Desde 0.8.9 se instalan como material propio; el existente no cambia.
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

  # 12) Hito 7 (MATERIALES-07): valida un paquete .zip con el MISMO lector del
  #     producto (rutas, manifiesto y SHA-256) sin importarlo ni escribir nada.
  def self.paquete(ruta)
    model = Sketchup.active_model; modified = model.modified?
    catalog = PlanosSanto::CatalogStore.new(directory: directory)
    library = PlanosSanto::MaterialLibrary.new(model, catalog: catalog, directory: directory)
    reader = PlanosSanto::MaterialPackage.new(library: library, catalog: catalog, directory: directory)
    result = begin
      data = reader.read_package(ruta)
      existing = catalog.read['items'].map { |item| item['name'].to_s.downcase }
      items = data['manifest']['items']
      { 'valido' => true, 'fichas' => items.length, 'archivos' => data['files'].length, 'bytes' => data['bytes'], 'sha256' => data['sha256'],
        'nombresRepetidos' => items.map { |item| item['name'] }.select { |name| existing.include?(name.to_s.downcase) } }
    rescue PlanosSanto::ExportError => error
      { 'valido' => false, 'error' => error.message }
    end
    unchanged!(model, modified)
    result
  end

  # 13) Hito 3: propone el pedido y simula «Confirmar en bloque» sobre el borrador
  #     actual SIN guardarlo (las dos acciones devuelven un borrador nuevo y no
  #     escriben el modelo). Requiere un análisis abierto y la guía guardada.
  def self.pedido
    model = Sketchup.active_model; modified = model.modified?
    session = controller.instance_variable_get(:@session) || raise('Abrí Planos Santo y analizá el modelo antes de medir el pedido.')
    workshop = PlanosSanto::Workshop.new(model, session, directory: directory)
    started = reloj
    draft = workshop.plan(false)['plan']
    proposed = workshop.propose(draft, nil)
    propose_ms = ((reloj - started) * 1000).round(1)
    started = reloj
    bulk = workshop.confirm_bulk(proposed['plan'], nil)
    bulk_ms = ((reloj - started) * 1000).round(1)
    unchanged!(model, modified)
    included = draft['rows'].count { |row| row['include'] }
    reasons = bulk['review'].flat_map { |row| row['reasons'] }.tally.sort_by { |_reason, count| -count }.to_h
    share = included.zero? ? nil : (bulk['review'].length * 100.0 / included).round(1)
    { 'filasIncluidas' => included, 'propuesta' => proposed['proposal']['summary'], 'msProponer' => propose_ms,
      'confirmables' => bulk['confirmed'].length, 'enRevision' => bulk['review'].length, 'porcentajeRevision' => share,
      'motivosRevision' => reasons, 'msConfirmarEnBloque' => bulk_ms,
      'cumple' => share.nil? ? nil : share <= 20, 'nota' => 'Nada se guardó: el borrador propuesto se descarta. Objetivo del plan: revisión individual de 20 % o menos.' }
  end

  # 14) Hito 5 (F-DESP-B): filas del pedido guardado que ya validan (referencia
  #     impresa) y las que la A4 y las etiquetas marcarán «pendiente de pedido».
  def self.referencias_parciales
    model = Sketchup.active_model; modified = model.modified?
    session = controller.instance_variable_get(:@session) || raise('Abrí Planos Santo y analizá el modelo antes de leer las referencias.')
    workshop = PlanosSanto::Workshop.new(model, session, directory: directory)
    result = PlanosSanto::OrderReferences.partial(model, workshop)
    unchanged!(model, modified)
    lots = result['references'].values.map { |row| row['lot'] }.compact.uniq.sort
    { 'conReferencia' => result['references'].length, 'pendientes' => result['pending'].length, 'excluidas' => result['excluded'].length,
      'lotes' => lots, 'lotesDefinitivos' => result['pending'].empty? }
  end

  # 15) Hito 6 (ARQ-01 etapa S): árbol del análisis con y sin caché de malla.
  #     Mismo resultado salvo tiempo; cuenta los herrajes que quedan fuera.
  def self.analisis(repeticiones: 3)
    model = Sketchup.active_model; modified = model.modified?
    trees = {}
    measure = lambda do |cache|
      Array.new(repeticiones) do
        started = reloj
        trees[cache] = PlanosSanto::Exporter.new(model, cache: cache).tree
        ((reloj - started) * 1000).round(1)
      end
    end
    cached = measure.call(true); plain = measure.call(false)
    unchanged!(model, modified)
    warnings = trees[true]['warnings']
    { 'conCache' => { 'msPorArbol' => cached, 'mediana' => mediana(cached) },
      'sinCache' => { 'msPorArbol' => plain, 'mediana' => mediana(plain) },
      'equivalente' => JSON.generate(trees[true]) == JSON.generate(trees[false]),
      'avisosHerraje' => warnings.count { |text| text.to_s.start_with?('Herraje') },
      'muebles' => trees[true]['roots'].length,
      'nota' => 'Solo el árbol en Ruby: el scan de la UI suma la respuesta al diálogo (ver replyStats). Objetivo del scan: menos de 10 s.' }
  end

  # 16) Pincel avanzado: preferencias guardadas (recientes por modo, tecla del
  #     cuentagotas, cantos por clic). Usa el lector del producto; no escribe.
  def self.ajustes_pincel
    settings = controller.send(:smart_settings)
    recent = settings['recentMaterials'] || {}
    { 'recientes' => recent.transform_values(&:length), 'maximoPorModo' => recent.values.map(&:length).max.to_i <= 6,
      'teclaCuentagotas' => settings['eyedropperKey'] || 'alt (por defecto)', 'cantosPorClic' => settings['edgeCount'],
      'ultimos' => (settings['lastMaterials'] || {}).keys.sort }
  end

  # Resumen de los chequeos que no piden datos: pegar el JSON en el informe.
  def self.resumen
    checks = { 'integridad' => -> { integridad }, 'modelWatch' => -> { model_watch }, 'cursores' => -> { cursores },
               'perfilMaderera' => -> { perfil_maderera }, 'tiemposPincel' => -> { tiempos_pincel },
               'ajustesPincel' => -> { ajustes_pincel } }
    checks.transform_values do |check|
      check.call
    rescue StandardError => error
      { 'error' => "#{error.class}: #{error.message}" }
    end
  end
end
