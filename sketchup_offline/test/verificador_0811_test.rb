# frozen_string_literal: true
# Lógica del verificador de solo lectura 0.8.11 (docs/validacion-0811) con dobles
# de la API de SketchUp y de Planos Santo; nunca abre SketchUp. ModelWatch es el real.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'digest'

module Sketchup
  class Group;end unless const_defined?(:Group, false)
  class ComponentInstance;end unless const_defined?(:ComponentInstance, false)
  class Face;end unless const_defined?(:Face, false)
  class << self
    attr_accessor :fake_version, :fake_model
    def version;fake_version;end
    def active_model;fake_model;end
  end
end

module UI
  def self.create_cursor(*_args);raise 'el verificador no debe crear cursores';end
  def self.set_cursor(*_args);raise 'el verificador no debe cambiar el cursor';end
end

require_relative '../model_watch'

module PlanosSanto
  class ExportError < StandardError;end unless const_defined?(:ExportError, false)
  module Release;VERSION = '0.8.24';end
  module QuickToolbar
    def self.registry;{ commands: { 'paint' => 1, 'materials' => 2 } };end
  end
  class OfflineController
    def handle(*_args);end
  end
  class CatalogStore
    class << self;attr_accessor :items;end
    def self.default_directory;'/no/usar';end
    def initialize(directory:);@directory = directory;end
    def read;{ 'items' => CatalogStore.items };end
  end
  class PaintMaterials
    class << self;attr_accessor :rows;end
    def initialize(_model, catalog:, directory:);end
    def states;PaintMaterials.rows;end
  end
  class MaterialLibrary
    class << self;attr_accessor :archived, :records;end
    def initialize(_model, catalog:, directory:);end
    def extras
      raise ExportError, 'Índice de fichas archivadas dañado.' if MaterialLibrary.archived == :broken
      { 'archivedIds' => MaterialLibrary.archived, 'statesRevision' => 1 }
    end
    def assets;{ 'records' => MaterialLibrary.records };end
  end
  class MaterialPackage
    class << self;attr_accessor :result;end
    def initialize(library:, catalog:, directory:);end
    def read_package(_path)
      raise ExportError, 'Paquete de materiales inválido: falta manifest.json.' if MaterialPackage.result.nil?
      MaterialPackage.result
    end
  end
  class SmartPaint
    class << self;attr_accessor :calls;end
    def initialize(_model, catalog:);end
    def plan(data, light:);SmartPaint.calls << [data, light];{ 'ok' => true };end
  end
  class SmartPaintTool
    CURSORS = { 'piece' => 'paint-piece.png', 'edge' => 'paint-edge.png', 'remove' => 'paint-remove.png', 'blocked' => 'paint-blocked.png', 'sample' => 'paint-sample.png' }.freeze
  end
  module MaterialResolver
    def self.observe_binding(material);{ 'binding' => material.binding };end
  end
  # Hito 3: el doble devuelve borradores nuevos y registra si alguien intentó guardar.
  class Workshop
    class << self;attr_accessor :rows, :saved;end
    def initialize(_model, _session, directory:);end
    def plan(_reset);{ 'plan' => { 'rows' => Workshop.rows } };end
    def save_plan(_plan);Workshop.saved = true;end
    def propose(draft, _ids)
      rows = draft['rows'].select { |row| row['include'] }
      { 'plan' => draft.merge('proposed' => true),
        'proposal' => { 'summary' => { 'proposed' => rows.length, 'kept' => 0, 'abstained' => 0, 'bulkReady' => rows.count { |row| row['ok'] }, 'review' => rows.count { |row| !row['ok'] } } } }
    end
    def confirm_bulk(draft, _ids)
      raise 'confirmar sin proponer' unless draft['proposed']
      rows = draft['rows'].select { |row| row['include'] }
      { 'plan' => draft, 'confirmed' => rows.select { |row| row['ok'] }.map { |row| row['id'] },
        'review' => rows.reject { |row| row['ok'] }.map { |row| { 'id' => row['id'], 'reasons' => row['reasons'] } } }
    end
  end
  module OrderReferences
    class << self;attr_accessor :result;end
    def self.partial(_model, _workshop);result;end
  end
  # ARQ-01: con y sin caché el árbol tiene que ser el mismo; el doble permite romperlo.
  class Exporter
    class << self;attr_accessor :calls, :diverge;end
    def initialize(_model, cache:);@cache = cache;end
    def tree
      Exporter.calls << @cache
      warnings = ['Herraje (material de tipo herraje en OpenCutList): no se tesela ni entra en el despiece.'] * 2
      { 'roots' => [{ 'id' => 'M01' }, { 'id' => 'M02' }], 'warnings' => warnings + (Exporter.diverge && @cache ? ['distinto'] : []) }
    end
  end
end

load File.expand_path('../../docs/validacion-0811/verificar_0811_sketchup.rb', __dir__)

class VerifyTimers
  def start_timer(*_args);1;end
  def stop_timer(_id);end
end
class VerifyCollection
  attr_reader :observers
  def initialize(items = []);@items = items;@observers = [];end
  def add_observer(o);@observers << o;true;end
  def remove_observer(o);@observers.delete(o);true;end
  def each(&blk);@items.each(&blk);end
  def map(&blk);@items.map(&blk);end
  def filter_map(&blk);@items.filter_map(&blk);end
  def find(&blk);@items.find(&blk);end
end
class VerifyMaterial
  attr_reader :name, :display_name, :binding
  def initialize(name, binding: nil, attrs: {});@name = name;@display_name = name;@binding = binding;@attrs = attrs;end
  def get_attribute(dict, key, default = nil);@attrs.fetch([dict, key], default);end
end
class VerifyFace < Sketchup::Face
  def persistent_id;77;end
end
class VerifyEntities
  def initialize(items);@items = items;end
  def grep(klass);@items.grep(klass);end
end
class VerifyGroup < Sketchup::Group
  def initialize(faces);@entities = VerifyEntities.new(faces);end
  attr_reader :entities
  def persistent_id;12;end
end
# Modelo que falla ante cualquier escritura y puede simular cambios durante la consulta.
class VerifyModel
  attr_accessor :modified, :flip
  attr_reader :materials, :selection, :entities
  def initialize(materials: [], selection: [])
    @modified = false;@flip = false
    @materials = VerifyCollection.new(materials);@selection = VerifyCollection.new(selection);@entities = []
  end
  def modified?
    value = @modified
    @modified = !@modified if @flip
    value
  end
  def active_path;nil;end
  def get_attribute(*_args);nil;end
  def add_observer(o);(@observers ||= []) << o;true;end
  def remove_observer(o);(@observers ||= []).delete(o);true;end
  def start_operation(*_args);raise 'escritura prohibida';end
  def commit_operation(*_args);raise 'escritura prohibida';end
  def set_attribute(*_args);raise 'escritura prohibida';end
end
class VerifyController
  def initialize(watch: nil, session: nil, settings: {});@model_watch = watch;@session = session;@settings = settings;end

  private

  def smart_settings;@settings;end
end

class Verificador0811Test < Minitest::Test
  V = PlanosSantoValidacion0811
  ID_A = '11111111-1111-4111-8111-111111111111'
  ID_B = '22222222-2222-4222-8222-222222222222'

  def setup
    @tmp = Dir.mktmpdir('verificador-0811')
    @data = File.join(@tmp, 'datos');FileUtils.mkdir_p(@data)
    @root = File.join(@tmp, 'Plugins');@folder = File.join(@root, 'planos_santo')
    build_install
    @previous_env = ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR'] = @data
    folder = @folder
    V.singleton_class.send(:alias_method, :carpeta_original, :carpeta)
    V.define_singleton_method(:carpeta) { folder }
    Sketchup.fake_version = '26.2.243'
    @model = VerifyModel.new
    Sketchup.fake_model = @model
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new)
    PlanosSanto::CatalogStore.items = [{ 'id' => ID_A, 'name' => 'Melamina Blanca 18' }, { 'id' => ID_B, 'name' => 'Caju 18mm' }]
    PlanosSanto::PaintMaterials.rows = { ID_A => { 'state' => 'ready', 'message' => 'Lista', 'materialUuid' => 'u-1' },
                                         ID_B => { 'state' => 'installable', 'message' => 'Se instala al elegir' } }
    PlanosSanto::MaterialLibrary.archived = [ID_B]
    PlanosSanto::MaterialLibrary.records = []
    PlanosSanto::MaterialPackage.result = nil
    PlanosSanto::SmartPaint.calls = []
    PlanosSanto::Workshop.rows = [];PlanosSanto::Workshop.saved = false
    PlanosSanto::OrderReferences.result = nil
    PlanosSanto::Exporter.calls = [];PlanosSanto::Exporter.diverge = false
  end

  def teardown
    V.singleton_class.send(:alias_method, :carpeta, :carpeta_original)
    V.singleton_class.send(:remove_method, :carpeta_original)
    ENV['PLANOS_SANTO_DATA_DIR'] = @previous_env
    PlanosSanto.instance_variable_set(:@offline_controller, nil)
    FileUtils.remove_entry(@tmp)
  end

  def png(width, height)
    "\x89PNG\r\n\x1A\n".b + [13].pack('N') + 'IHDR'.b + [width, height].pack('NN') + "\x08\x06\x00\x00\x00".b
  end

  # Instalación sintética: cada módulo exigido, los cursores y un manifiesto con sus hashes.
  def build_install(version: '0.8.24')
    FileUtils.mkdir_p(File.join(@folder, 'cursors'))
    File.write(File.join(@root, 'planos_santo.rb'), "# cargador\n")
    files = { 'planos_santo.rb' => nil }
    (V::MODULOS + ['offline.rb']).each do |name|
      File.write(File.join(@folder, name), "# #{name}\n");files["planos_santo/#{name}"] = nil
    end
    V::CURSORES.each do |name|
      File.binwrite(File.join(@folder, 'cursors', name), png(32, 32));files["planos_santo/cursors/#{name}"] = nil
    end
    files.each_key { |name| files[name] = Digest::SHA256.file(File.join(@root, name)).hexdigest }
    write_manifest('version' => version, 'files' => files)
  end

  def write_manifest(data)
    File.write(File.join(@folder, 'manifest.json'), JSON.generate({ 'name' => 'Planos Santo' }.merge(data)))
  end

  def manifest
    JSON.parse(File.read(File.join(@folder, 'manifest.json')))
  end

  # Huella de todo lo que el verificador podría tocar en disco.
  def disk_state
    Dir.glob(File.join(@tmp, '**', '*'), File::FNM_DOTMATCH).reject { |path| File.directory?(path) }.sort
       .to_h { |path| [path, Digest::SHA256.file(path).hexdigest] }
  end

  def test_integridad_aprueba_una_instalacion_completa_sin_tocar_disco
    before = disk_state
    result = V.integridad
    assert result['passed'], result.inspect
    assert result['versionOk']
    assert_equal [], result['mismatches']
    assert_equal [], result['extras']
    assert_equal [], result['faltantes']
    assert_equal %w[materials paint], result['toolbar']
    refute result['productionApproved']
    assert_equal before, disk_state
  end

  def test_integridad_detecta_archivo_alterado_sobrante_y_faltante
    File.write(File.join(@folder, 'model_watch.rb'), "# alterado\n")
    File.write(File.join(@folder, 'viejo_0810.rb'), "# resto\n")
    data = manifest;data['files'].delete('planos_santo/cursors/paint-edge.png');write_manifest(data)
    result = V.integridad
    refute result['passed']
    assert_equal ['planos_santo/model_watch.rb'], result['mismatches']
    assert_equal ['planos_santo/viejo_0810.rb'], result['extras']
    assert_equal ['cursors/paint-edge.png'], result['faltantes']
  end

  def test_integridad_exige_la_version_esperada_en_codigo_y_manifiesto
    data = manifest;data['version'] = '0.8.10';write_manifest(data)
    result = V.integridad
    refute result['versionOk']
    refute result['passed']
    assert_equal '0.8.10', result['versionManifiesto']
    # Con la versión que realmente se construyó se puede revisar el resto igual.
    PlanosSanto::Release.send(:remove_const, :VERSION);PlanosSanto::Release.const_set(:VERSION, '0.8.10')
    assert V.integridad(version: '0.8.10')['passed']
  ensure
    PlanosSanto::Release.send(:remove_const, :VERSION);PlanosSanto::Release.const_set(:VERSION, '0.8.24')
  end

  def test_integridad_rechaza_rutas_peligrosas_y_otra_version_de_sketchup
    data = manifest;data['files']['../fuera.rb'] = 'x' * 64;write_manifest(data)
    assert_raises(RuntimeError) { V.integridad }
    Sketchup.fake_version = '25.0.660'
    assert_match(/2026/, assert_raises(RuntimeError) { V.integridad }.message)
  end

  def test_carpeta_real_es_la_del_controlador_cargado
    assert_equal __dir__, V.carpeta_original
  end

  def test_estados_resume_y_marca_archivadas
    result = V.estados
    assert_equal({ 'ready' => 1, 'installable' => 1 }, result['resumen'])
    assert_equal 1, result['archivadas']
    caju = result['fichas'].find { |row| row['nombre'] == 'Caju 18mm' }
    assert caju['archivada']
    refute result['fichas'].find { |row| row['nombre'] == 'Melamina Blanca 18' }['archivada']
  end

  def test_estados_informa_indice_de_archivadas_danado_sin_fallar
    PlanosSanto::MaterialLibrary.archived = :broken
    result = V.estados
    assert_match(/dañado/, result['archivadas']['error'])
    assert(result['fichas'].none? { |row| row['archivada'] })
  end

  def test_cualquier_consulta_falla_si_el_modelo_cambia_durante_la_lectura
    @model.flip = true
    assert_match(/cambió/, assert_raises(RuntimeError) { V.estados }.message)
  end

  def test_atributos_ocl_lista_claves_escritas_por_planos_santo
    written = JSON.generate('type' => 2, 'thickness' => '18mm')
    @model.materials.instance_variable_set(:@items, [
      VerifyMaterial.new('Melamina Blanca 18', binding: { 'kind' => 'sheet' },
                         attrs: { %w[ladb_opencutlist type] => 2, %w[PlanosSantoMaterial ocl_written_v1] => written }),
      VerifyMaterial.new('Suelto')
    ])
    rows = V.atributos_ocl
    assert_equal 1, rows.length
    assert_equal({ 'type' => 2 }, rows[0]['opencutlist'])
    assert_equal %w[thickness type], rows[0]['escritasPorPlanosSanto']
  end

  def test_perfil_de_maderera_ausente_se_informa_como_no_aplica
    result = V.perfil_maderera
    refute result['disponible']
    assert_match(/NO APLICA/, result['nota'])
  end

  def test_perfil_de_maderera_presente_por_archivo
    File.write(File.join(@data, 'perfil-maderera.json'), '{}')
    result = V.perfil_maderera
    assert result['disponible']
    assert_equal ['perfil-maderera.json'], result['archivos']
  end

  def test_model_watch_ausente_es_correcto_sin_analisis_e_incorrecto_con_analisis
    assert V.model_watch['ok']
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(session: Object.new))
    result = V.model_watch
    refute result['ok']
    refute result['registrado']
  end

  def test_model_watch_real_adjunto_al_modelo_activo
    watch = PlanosSanto::ModelWatch.new(@model, on_change: ->(_kinds) {}, timers: VerifyTimers.new).attach
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(watch: watch, session: Object.new))
    result = V.model_watch
    assert result['ok'], result.inspect
    assert_equal %w[MaterialsObserver ModelObserver SelectionObserver], result['observadores']
    assert_in_delta 0.3, result['demoraSegundos']
    # Otro modelo activo: el observer quedó colgado del anterior.
    Sketchup.fake_model = VerifyModel.new
    refute V.model_watch['ok']
    Sketchup.fake_model = @model
    watch.detach
    refute V.model_watch['ok']
  end

  def test_huella_es_estable_y_no_modifica
    result = V.huella(repeticiones: 3)
    assert result['estable']
    assert_equal 3, result['msPorHuella'].length
  end

  def test_cursores_png_validos_sin_crear_cursores
    result = V.cursores
    assert result['ok'], result.inspect
    assert(result['cursores'].all? { |row| row['ancho'] == 32 && row['alto'] == 32 })
  end

  # 0.8.13 nativo: el producto trae 5 cursores (se sumó el del cuentagotas) y el verificador esperaba 4.
  def test_cursores_incluye_el_del_cuentagotas
    assert_includes V::CURSORES, 'paint-sample.png'
    assert V.cursores['ok']
  end

  def test_cursores_detecta_archivo_que_no_es_png
    File.write(File.join(@folder, 'cursors', 'paint-blocked.png'), 'no soy png')
    result = V.cursores
    refute result['ok']
    refute result['cursores'].find { |row| row['archivo'] == 'paint-blocked.png' }['png']
  end

  def test_tiempo_clic_mide_plan_liviano_y_completo
    @model.selection.instance_variable_set(:@items, [VerifyGroup.new([VerifyFace.new])])
    result = V.tiempo_clic(ID_A, repeticiones: 3)
    assert_equal 3, result['clic']['msPorPlan'].length
    assert_equal [true, true, true, false, false, false], PlanosSanto::SmartPaint.calls.map(&:last)
    data = PlanosSanto::SmartPaint.calls.first.first
    assert_equal({ 'pieceId' => '12', 'faceIds' => ['77'] }, data['targets'].first)
    assert_equal 'u-1', data['materialUuid']
    assert_includes [true, false], result['cumple']
  end

  def test_tiempo_clic_exige_pieza_y_ficha_lista
    assert_match(/Seleccioná/, assert_raises(RuntimeError) { V.tiempo_clic(ID_A) }.message)
    @model.selection.instance_variable_set(:@items, [VerifyGroup.new([VerifyFace.new])])
    assert_match(/no está lista/, assert_raises(RuntimeError) { V.tiempo_clic(ID_B) }.message)
    assert_empty PlanosSanto::SmartPaint.calls
  end

  def test_tiempos_pincel_resume_el_log_y_tolera_lineas_danadas
    FileUtils.mkdir_p(File.join(@data, 'diagnostico'))
    lines = (1..20).map { |i| JSON.generate('ms' => i * 10.0, 'mode' => i.odd? ? 'sheet' : 'edge', 'edgeCount' => i.odd? ? nil : 4, 'changed' => i <= 5, 'ok' => i != 20) }
    File.write(File.join(@data, 'diagnostico', 'pincel-tiempos.jsonl'), (lines + ['{roto', '[]']).join("\n") + "\n")
    before = disk_state
    result = V.tiempos_pincel
    assert_equal 20, result['registros']
    assert_equal 2, result['dañados']
    assert_equal 100.0, result['total']['p50']
    assert_equal 190.0, result['total']['p95']
    assert_equal 200.0, result['total']['max']
    refute result['cumple']
    assert_equal 10, result['porModo']['edge/4']['n']
    assert_equal 10, result['porModo']['sheet']['n']
    assert_equal 5, result['cambios']
    assert_equal 1, result['rechazados']
    assert_equal before, disk_state
  end

  def test_tiempos_pincel_sin_log
    assert_equal 0, V.tiempos_pincel['registros']
  end

  def test_colisiones_lista_solo_instalables_con_nombre_ya_presente
    @model.materials.instance_variable_set(:@items, [VerifyMaterial.new('Melamina petiribi18mm')])
    PlanosSanto::MaterialLibrary.records = [{ 'catalogId' => ID_B, 'sourceName' => 'Melamina petiribi18mm' },
                                            { 'catalogId' => ID_A, 'sourceName' => 'Melamina petiribi18mm' }]
    assert_equal [{ 'ficha' => 'Caju 18mm', 'nombreEnSkm' => 'Melamina petiribi18mm' }], V.colisiones
  end

  def test_paquete_valido_informa_nombres_repetidos
    PlanosSanto::MaterialPackage.result = { 'manifest' => { 'items' => [{ 'name' => 'caju 18MM' }, { 'name' => 'Nueva' }] },
                                            'files' => { 'a' => 'x' }, 'bytes' => 10, 'sha256' => 'f' * 64 }
    result = V.paquete(File.join(@tmp, 'p.zip'))
    assert result['valido']
    assert_equal 2, result['fichas']
    assert_equal ['caju 18MM'], result['nombresRepetidos']
  end

  def test_paquete_invalido_devuelve_el_mensaje_del_producto
    result = V.paquete(File.join(@tmp, 'p.zip'))
    refute result['valido']
    assert_match(/manifest/, result['error'])
  end

  def test_resumen_junta_chequeos_y_aisla_errores
    PlanosSanto.instance_variable_set(:@offline_controller, nil)
    result = V.resumen
    assert result['integridad']['passed']
    assert_match(/no está cargado/, result['modelWatch']['error'])
    assert result['cursores']['ok']
    assert_equal %w[ajustesPincel cursores integridad modelWatch perfilMaderera tiemposPincel], result.keys.sort
  end

  def test_pedido_propone_y_confirma_en_bloque_sin_guardar
    reasons = ['Placa con veta: revisala en la vista 2D.']
    PlanosSanto::Workshop.rows = (1..10).map { |i| { 'id' => "r#{i}", 'include' => i != 10, 'ok' => i > 2, 'reasons' => i > 2 ? [] : reasons } }
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(session: Object.new))
    before = disk_state
    result = V.pedido
    assert_equal 9, result['filasIncluidas']
    assert_equal 7, result['confirmables']
    assert_equal 2, result['enRevision']
    assert_equal 22.2, result['porcentajeRevision']
    refute result['cumple']
    assert_equal({ reasons.first => 2 }, result['motivosRevision'])
    refute PlanosSanto::Workshop.saved
    assert_equal before, disk_state
  end

  def test_pedido_exige_analisis_abierto_y_porcentaje_dentro_del_objetivo
    assert_match(/analizá/, assert_raises(RuntimeError) { V.pedido }.message)
    PlanosSanto::Workshop.rows = (1..5).map { |i| { 'id' => "r#{i}", 'include' => true, 'ok' => i > 1, 'reasons' => i > 1 ? [] : ['Cuadrada'] } }
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(session: Object.new))
    assert V.pedido['cumple']
    PlanosSanto::Workshop.rows = []
    assert_nil V.pedido['cumple']
  end

  def test_referencias_parciales_cuentan_pendientes_y_lotes
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(session: Object.new))
    PlanosSanto::OrderReferences.result = { 'references' => { 'a' => { 'lot' => 2 }, 'b' => { 'lot' => 1 }, 'c' => { 'lot' => 2 } }, 'pending' => [], 'excluded' => ['x'] }
    result = V.referencias_parciales
    assert_equal [3, 0, 1], result.values_at('conReferencia', 'pendientes', 'excluidas')
    assert_equal [1, 2], result['lotes']
    assert result['lotesDefinitivos']
    PlanosSanto::OrderReferences.result = { 'references' => { 'a' => {} }, 'pending' => ['b'], 'excluded' => [] }
    result = V.referencias_parciales
    assert_equal [], result['lotes']
    refute result['lotesDefinitivos']
  end

  def test_analisis_compara_cache_y_cuenta_herrajes
    result = V.analisis(repeticiones: 2)
    assert_equal [true, true, false, false], PlanosSanto::Exporter.calls
    assert result['equivalente']
    assert_equal 2, result['avisosHerraje']
    assert_equal 2, result['muebles']
    PlanosSanto::Exporter.diverge = true
    refute V.analisis(repeticiones: 1)['equivalente']
  end

  def test_ajustes_pincel_lee_recientes_y_tecla
    settings = { 'recentMaterials' => { 'sheet' => %w[a b c], 'edge' => %w[d] }, 'eyedropperKey' => 'shift', 'edgeCount' => 4, 'lastMaterials' => { 'sheet' => 'a' } }
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new(settings: settings))
    result = V.ajustes_pincel
    assert_equal({ 'sheet' => 3, 'edge' => 1 }, result['recientes'])
    assert result['maximoPorModo']
    assert_equal 'shift', result['teclaCuentagotas']
    assert_equal 4, result['cantosPorClic']
    PlanosSanto.instance_variable_set(:@offline_controller, VerifyController.new)
    assert_equal 'alt (por defecto)', V.ajustes_pincel['teclaCuentagotas']
  end
end
