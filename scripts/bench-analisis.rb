# frozen_string_literal: true
# Benchmark reproducible del análisis (scan/generate), tamaño de respuestas y
# clic de pintura inmediata sobre un modelo SINTÉTICO de ~1.500 placas.
#
# TIEMPOS SIMULADOS: corre en Linux/Ruby con los dobles de la API de SketchUp
# (sketchup/test/fake_api.rb + dobles de sketchup_offline/test). NO es SketchUp:
# sirve para comparar versiones del código Ruby entre sí, no para predecir
# milisegundos reales dentro de SketchUp 2026.
#
# Uso:
#   LANG=C.UTF-8 ruby scripts/bench-analisis.rb [--runs N] [--warmup W] [--seed S] [--select K] [--json]
#
# Sólo usa la API pública del exporter (Exporter#tree, #document, #mesh_for vía
# NativeSession), así que funciona igual con exporter.rb con o sin caché /
# exclusión de herrajes.
require 'json'
require 'digest'
require 'optparse'
require_relative '../sketchup_offline/test/names_double'          # fake_api + NativeModelDouble + get_attribute en instancias
require_relative '../sketchup_offline/test/photo_material_double' # Material con atributos (OCL type, vínculo Planos Santo)

OPTIONS = { runs: 5, warmup: 1, seed: 42, select: 10, json: false,
            exporter: File.expand_path('../sketchup/planos_santo/exporter.rb', __dir__) }
OptionParser.new do |o|
  o.banner = 'Uso: LANG=C.UTF-8 ruby scripts/bench-analisis.rb [opciones]'
  o.on('--runs N', Integer, 'Repeticiones medidas por caso (defecto 5)') { |v| OPTIONS[:runs] = v }
  o.on('--warmup N', Integer, 'Repeticiones de calentamiento no medidas (defecto 1)') { |v| OPTIONS[:warmup] = v }
  o.on('--seed N', Integer, 'Semilla de las variaciones de medidas (defecto 42)') { |v| OPTIONS[:seed] = v }
  o.on('--select N', Integer, 'Muebles elegidos para generate (1..100, defecto 10)') { |v| OPTIONS[:select] = v }
  o.on('--json', 'Imprime sólo un JSON con los números') { OPTIONS[:json] = true }
  o.on('--exporter PATH', 'exporter.rb alternativo para comparar (p. ej. git show HEAD:... > /tmp/x.rb)') { |v| OPTIONS[:exporter] = File.expand_path(v) }
end.parse!
require OPTIONS[:exporter]
require_relative '../sketchup_offline/session'
require_relative '../sketchup_offline/names'
require_relative '../sketchup_offline/smart_paint'
require_relative '../sketchup_offline/model_watch'
abort('--runs debe ser >= 1') unless OPTIONS[:runs] >= 1
abort('--select debe estar entre 1 y 75') unless OPTIONS[:select].between?(1, 75)

# ---------------------------------------------------------------------------
# Dobles complementarios (sólo en este script).
# ---------------------------------------------------------------------------
module BenchIds
  @next = 100_000
  def self.next!; @next += 1; end
end

# get_attribute con default (firma real de SketchUp: dict, key, default=nil).
# NamesEntityDouble sólo acepta 2 argumentos; un exporter que consulte p. ej.
# get_attribute('ladb_opencutlist','type',nil) en una instancia no debe romper.
module BenchEntityAttributes
  def get_attribute(dictionary, key, default = nil)
    value = names_attributes[[dictionary, key]]
    value.nil? ? default : value
  end
end
Sketchup::ComponentInstance.prepend(BenchEntityAttributes)

# Definición con entityID estable (ModelWatch lo usa para recorrer cada
# definición una vez) y diccionario de atributos vacío.
class BenchDefinition < Sketchup::Definition
  attr_reader :entityID
  def initialize(*args)
    super
    @entityID = BenchIds.next!
  end
  def get_attribute(_dictionary, _key, default = nil); default; end
end

# Cara con malla arbitraria (N puntos, triángulos 1-based), persistent_id,
# entityID, área y vértices (ModelWatch#face_key usa area y vertices.length).
class BenchFace < Sketchup::Face
  attr_reader :persistent_id, :entityID, :area
  def initialize(points, normal, polygons = nil)
    super(points, normal)
    @mesh = Sketchup::Mesh.new(@mesh.points, polygons) if polygons
    @persistent_id = BenchIds.next!
    @entityID = @persistent_id
    @area = @mesh.polygons.sum do |tri|
      a, b, c = tri.map { |i| @mesh.points[i.abs - 1].to_a }
      u = b.zip(a).map { |x, y| x - y }; v = c.zip(a).map { |x, y| x - y }
      Math.sqrt([u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]].sum { |x| x*x }) / 2
    end
  end
  def vertices; @mesh.points; end
end

class BenchModel < NativeModelDouble
  attr_accessor :materials
end

# ---------------------------------------------------------------------------
# Modelo sintético determinista.
# ---------------------------------------------------------------------------
module BenchModelBuilder
  INCH = 25.4
  module_function

  def mm(v); v / INCH; end

  # Caja de 6 caras (pulgadas en la API), ejes locales: x=largo, y=ancho, z=espesor.
  def box_faces(x, y, z, material = nil)
    v = [[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]]
    [[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]].map do |ids, n|
      face = BenchFace.new(ids.map { |i| v[i] }, n)
      face.material = material if material
      face
    end
  end

  # Cilindro de `segments` lados: 2 tapas (N-gono, N-2 triángulos c/u) y N
  # caras laterales (quad = 2 triángulos), como lo teselaría SketchUp.
  def cylinder_faces(cx, cy, r, z0, h, segments, material)
    ring = ->(z) { segments.times.map { |i| a = 2 * Math::PI * i / segments; [cx + r * Math.cos(a), cy + r * Math.sin(a), z] } }
    bottom = ring.call(z0); top = ring.call(z0 + h)
    fan = (2...segments).map { |i| [1, i, i + 1] }
    faces = [BenchFace.new(bottom.reverse, [0,0,-1], fan), BenchFace.new(top, [0,0,1], fan)]
    segments.times do |i|
      j = (i + 1) % segments
      a = 2 * Math::PI * (i + 0.5) / segments
      faces << BenchFace.new([bottom[i], bottom[j], top[j], top[i]], [Math.cos(a), Math.sin(a), 0])
    end
    faces.each { |f| f.material = material }
  end

  # Bisagra cazoleta: cazoleta Ø35 (64 seg.) + brazo (caja) + perno Ø8 (64 seg.).
  def hinge_definition(material, segments)
    faces = cylinder_faces(0, 0, mm(17.5), 0, mm(11.5), segments, material)
    arm = box_faces(mm(50), mm(15), mm(3), material).each do |f|
      f.mesh.points.each { |p| p.x += mm(10); p.y -= mm(7.5); p.z += mm(11.5) }
    end
    faces.concat(arm)
    faces.concat(cylinder_faces(mm(45), 0, mm(4), mm(14.5), mm(15), segments, material))
    BenchDefinition.new('Bisagra cazoleta 35', 'def-bisagra-35', faces)
  end

  # Tirador curvo: dos cilindros (patas) + barra cilíndrica tumbada aproximada
  # por un cilindro en z (geometría densa equivalente).
  def handle_definition(material, segments)
    faces = cylinder_faces(0, 0, mm(5), 0, mm(25), segments, material)
    faces.concat(cylinder_faces(mm(128), 0, mm(5), 0, mm(25), segments, material))
    faces.concat(cylinder_faces(mm(64), 0, mm(6), mm(25), mm(8), segments, material))
    BenchDefinition.new('Tirador curvo 128', 'def-tirador-128', faces)
  end

  def build(seed:)
    rng = Random.new(seed)
    pid = 0
    next_pid = -> { pid += 1 }

    hardware = PhotoFixture::Material.new(5001, 'Herraje níquel')
    hardware.set_attribute('ladb_opencutlist', 'type', 5)
    melamine = PhotoFixture::Material.new(5002, 'Melamina Blanca 18')
    melamine.set_attribute('ladb_opencutlist', 'type', 2)
    oak = PhotoFixture::Material.new(5003, 'Roble Natural 18')
    oak.set_attribute('ladb_opencutlist', 'type', 2)
    carcass = PhotoFixture::Material.new(5004, 'Gris Grafito (contenedor)')
    carcass.set_attribute('ladb_opencutlist', 'type', 2)
    back = PhotoFixture::Material.new(5005, 'Fibroplus 3')
    back.set_attribute('ladb_opencutlist', 'type', 2)

    # Definiciones compartidas por todo el proyecto (laterales/estantes iguales).
    # Sin material en las caras: heredan de la instancia o del mueble.
    shared = {
      'Lateral 720x560' => [720, 560, 18], 'Estante 564x540' => [564, 540, 18],
      'Piso 564x560' => [564, 560, 18], 'Techo 564x560' => [564, 560, 18],
      'Fondo 716x596' => [716, 596, 3], 'Travesaño 564x100' => [564, 100, 18]
    }.transform_values { |(x, y, z)| [x, y, z] }
    shared_defs = shared.map { |name, (x, y, z)| [name, BenchDefinition.new(name, "def-#{name}", box_faces(mm(x), mm(y), mm(z), name.start_with?('Fondo') ? back : nil))] }.to_h

    # 5 tipos de mueble: 6 definiciones propias del tipo (compartidas entre los
    # 15 muebles de ese tipo), con material en las caras.
    type_defs = 5.times.map do |t|
      width = 400 + 100 * t
      {
        'Puerta' => [716, width - 4, 18], 'Frente cajón' => [width - 4, 176, 18],
        'Lateral cajón' => [500, 150, 15], 'Contrafrente cajón' => [width - 70, 130, 15],
        'Fondo cajón' => [width - 70, 490, 3], 'Zócalo' => [width, 100, 18]
      }.map do |name, (x, y, z)|
        BenchDefinition.new("#{name} T#{t}", "def-t#{t}-#{name}", box_faces(mm(x), mm(y), mm(z), name.start_with?('Puerta', 'Frente') ? oak : melamine))
      end
    end

    hinge_def = hinge_definition(hardware, 64)
    handle_def = handle_definition(hardware, 64)
    hardware_slots = 20.times.map { |k| (k * 75) / 20 }  # 20 herrajes en 20 muebles distintos
    hardware_paths = []
    unique_click = nil; shared_click = nil

    roots = 75.times.map do |m|
      type = m % 5
      root_pid = next_pid.call
      origin = Geom::Transformation.translation(mm(m % 15 * 900), mm(m / 15 * 2000), 0)
      parts = []
      place = lambda do |definition, name, x, y, z, material = nil|
        inst = Sketchup::ComponentInstance.new(1000 + next_pid.call, name, definition, Geom::Transformation.translation(mm(x), mm(y), mm(z)))
        inst.material = material
        # Real: make_unique existe. Para placas únicas nunca debe llamarse.
        inst.define_singleton_method(:make_unique) { raise 'El benchmark no aísla definiciones (pieza única esperada).' }
        inst
      end
      # 10 placas con definiciones compartidas del proyecto.
      parts << place.call(shared_defs['Lateral 720x560'], 'Lateral izquierdo', 0, 0, 0)
      parts << place.call(shared_defs['Lateral 720x560'], 'Lateral derecho', 600, 0, 0, m.even? ? melamine : nil)
      parts << place.call(shared_defs['Piso 564x560'], 'Piso', 18, 0, 0)
      parts << place.call(shared_defs['Techo 564x560'], 'Techo', 18, 0, 702)
      parts << place.call(shared_defs['Fondo 716x596'], 'Fondo', 0, 560, 0)
      3.times { |i| parts << place.call(shared_defs['Estante 564x540'], "Estante #{i + 1}", 18, 10, 180 * (i + 1), (m + i).odd? ? melamine : nil) }
      2.times { |i| parts << place.call(shared_defs['Travesaño 564x100'], "Travesaño #{i + 1}", 18, 460 * i, 700) }
      # 4 placas del tipo de mueble (compartidas entre los 15 del tipo).
      td = type_defs[type]
      parts << place.call(td[0], 'Puerta izquierda', 0, -20, 0)
      parts << place.call(td[0], 'Puerta derecha', 300, -20, 0)
      parts << place.call(td[5], 'Zócalo frontal', 0, 40, -100)
      parts << place.call(td[5], 'Zócalo trasero', 0, 500, -100)
      # 2 placas únicas del mueble (medida a medida, material en las caras).
      2.times do |i|
        x = 300 + rng.rand(400); y = 200 + rng.rand(300)
        d = BenchDefinition.new("Pieza a medida M#{m}-#{i}", "def-unica-#{m}-#{i}", box_faces(mm(x), mm(y), mm(18), melamine))
        inst = place.call(d, "Pieza a medida #{i + 1}", 18, 0, 300 + 100 * i)
        parts << inst
        unique_click ||= [root_pid, inst, d]
      end
      # Cajón (subgrupo) con 4 placas del tipo: 20 placas por mueble en total.
      drawer_parts = [place.call(td[1], 'Frente cajón', 0, -20, 520), place.call(td[2], 'Lateral cajón izq.', 30, 10, 540),
                      place.call(td[2], 'Lateral cajón der.', 550, 10, 540), place.call(td[4], 'Fondo cajón', 30, 10, 530)]
      drawer = Sketchup::Group.new(1000 + next_pid.call, 'Cajón', BenchDefinition.new('Cajón', "def-cajon-#{m}", drawer_parts))
      shared_click ||= [root_pid, parts[0]]  # Lateral: definición compartida (2 por mueble x 75)
      children = parts + [drawer]
      if (slot = hardware_slots.index(m))
        definition = slot.even? ? hinge_def : handle_def
        hw = Sketchup::ComponentInstance.new(1000 + next_pid.call, definition.name, definition, Geom::Transformation.translation(mm(20), mm(-18), mm(100)))
        hw.material = hardware
        children << hw
        hardware_paths << "#{root_pid}/#{hw.persistent_id}"
      end
      group = Sketchup::Group.new(root_pid, "M#{format('%02d', m + 1)} Bajo #{400 + 100 * type}", BenchDefinition.new("Mueble #{m + 1}", "def-mueble-#{m}", children), origin)
      group.material = carcass  # material heredado por las placas sin material propio
      group
    end

    model = BenchModel.new(Sketchup::Model.new(roots, 'bench-synthetic-guid', 'Bench sintético 1500 placas', '/tmp/bench-sintetico.skp'))
    model.selection = [roots[0]]
    { model: model, materials: [hardware, melamine, oak, carcass, back], hardware_paths: hardware_paths,
      unique_click: unique_click, shared_click: shared_click, roots: roots,
      definitions: shared_defs.size + type_defs.flatten.size + 2 * 75 + 75 + 75 + 2 }
  end
end

# ---------------------------------------------------------------------------
# Réplica de Offline#light_scan (sketchup_offline/offline.rb, F-ARQ-A) y del
# sobre de `reply`: lo que realmente viaja al diálogo.
# ---------------------------------------------------------------------------
module BenchReply
  DEFERRED_MESH = { 'vertices' => [].freeze, 'triangles' => [].freeze, 'deferred' => true }.freeze
  module_function
  def light_scan(result)
    tree = result['tree']
    result.merge('tree' => tree.merge('roots' => light_nodes(tree['roots'])))
  end
  def light_nodes(nodes)
    nodes.map do |node|
      copy = node.merge('children' => light_nodes(node.fetch('children', []) || []))
      copy['mesh'] = DEFERRED_MESH if node['mesh']
      copy
    end
  end
  def envelope(result); JSON.generate({ 'version' => 1, 'id' => 'bench', 'result' => result, 'error' => nil }); end
end

# ---------------------------------------------------------------------------
# Medición.
# ---------------------------------------------------------------------------
def clock; Process.clock_gettime(Process::CLOCK_MONOTONIC); end

def measure(name, runs:, warmup:)
  last = nil
  warmup.times { |i| last = yield(i) }
  samples = runs.times.map do |i|
    GC.start
    t = clock
    last = yield(warmup + i)
    (clock - t) * 1000.0
  end
  sorted = samples.sort
  mid = sorted.length / 2
  median = sorted.length.odd? ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0
  [{ 'name' => name, 'medianMs' => median.round(2), 'minMs' => sorted.first.round(2), 'maxMs' => sorted.last.round(2),
     'samplesMs' => samples.map { |s| s.round(2) } }, last]
end

def tree_stats(roots, hardware_paths)
  s = Hash.new(0)
  PlanosSanto::Exporter.each_node(roots) do |n|
    s['nodes'] += 1
    mesh = n['mesh']
    next unless mesh
    tris = mesh['triangles'].length
    verts = mesh['vertices'].length
    s['meshPieces'] += 1
    s['triangles'] += tris
    s['vertices'] += verts
    if hardware_paths.include?(n['id'])
      s['hardwareMeshPieces'] += 1
      s['hardwareTriangles'] += tris
    end
  end
  hardware_nodes = 0
  PlanosSanto::Exporter.each_node(roots) { |n| hardware_nodes += 1 if hardware_paths.include?(n['id']) }
  s['hardwareNodes'] = hardware_nodes
  s
end

runs = OPTIONS[:runs]; warmup = OPTIONS[:warmup]
fixture = BenchModelBuilder.build(seed: OPTIONS[:seed])
model = fixture[:model]
hardware_paths = fixture[:hardware_paths]

# Catálogo con dos placas vinculadas (A/B): los clics alternan entre ambas para
# que CADA repetición cambie realmente el material (nunca un no-op).
items = %w[1 2].map do |n|
  { 'id' => "11111111-1111-4111-8111-00000000000#{n}", 'name' => "Placa bench #{n}", 'kind' => 'sheet', 'approved' => true, 'observed' => {} }
end
# Dos cantos vinculados (A/B) para el clic de canto del pincel (PINTURA-15).
items += %w[1 2].map do |n|
  { 'id' => "22222222-2222-4222-8222-00000000000#{n}", 'name' => "Canto bench #{n}", 'kind' => 'edge', 'approved' => true,
    'observed' => {}, 'thicknessMm' => 1, 'widthMm' => 22 }
end
bound = items.each_with_index.map do |item, i|
  material = PhotoFixture::Material.new(9001 + i, item['name'])
  material.set_attribute(PlanosSanto::MaterialResolver::DICT, PlanosSanto::MaterialResolver::KEY, JSON.generate(PlanosSanto::MaterialResolver.binding_for(item)))
  material
end
model.materials = fixture[:materials] + bound
catalog_data = { 'schema' => 1, 'revision' => 1, 'items' => items }
catalog = Object.new
catalog.define_singleton_method(:read) { catalog_data }
paint_request = lambda do |piece_id, face_id, index, extra = {}|
  material = bound[index % 2]
  { 'mode' => 'sheet', 'immediate' => true, 'side' => 'both', 'scope' => 'unique',
    'catalogId' => items[index % 2]['id'], 'materialUuid' => PlanosSanto::MaterialResolver.read_binding(material)['uuid'],
    'targets' => [{ 'pieceId' => piece_id, 'faceIds' => [face_id] }] }.merge(extra)
end

results = []
session = PlanosSanto::NativeSession.new(model)

row, scan_result = measure('scan (NativeSession#scan)', runs: runs, warmup: warmup) { session.scan }
results << row
scan_stats = tree_stats(scan_result['tree']['roots'], hardware_paths)

selected_ids = scan_result['tree']['roots'].first(OPTIONS[:select]).map { |r| r['id'] }
row, generate_result = measure("generate (#{selected_ids.length} muebles)", runs: runs, warmup: warmup) { session.generate(selected_ids) }
results << row
generate_stats = tree_stats(generate_result['document']['furniture'], hardware_paths)

row, light = measure('light_scan + JSON (respuesta scan)', runs: runs, warmup: warmup) { BenchReply.envelope(BenchReply.light_scan(scan_result)) }
results << row
row, gen_json = measure('JSON (respuesta generate)', runs: runs, warmup: warmup) { BenchReply.envelope(generate_result) }
results << row

sizes = {
  'scanRawBytes' => JSON.generate(scan_result).bytesize,
  'scanSentBytes' => light.bytesize,
  'generateSentBytes' => gen_json.bytesize
}

row, = measure('ModelWatch.fingerprint', runs: runs, warmup: warmup) { PlanosSanto::ModelWatch.fingerprint(model) }
results << row
row, = measure('NameManager#inventory(geometry: true)', runs: runs, warmup: warmup) { PlanosSanto::NameManager.new(model).inventory(geometry: true) }
results << row
row, = measure('NameManager#inventory(geometry: false)', runs: runs, warmup: warmup) { PlanosSanto::NameManager.new(model).inventory(geometry: false) }
results << row

root_pid, unique_inst, unique_def = fixture[:unique_click]
unique_piece = "#{root_pid}/#{unique_inst.persistent_id}"
unique_face = unique_def.entities.first.persistent_id.to_s
smart = PlanosSanto::SmartPaint.new(model, catalog: catalog)
row, = measure('SmartPaint#plan(light: true) pieza única', runs: runs, warmup: warmup) { |i| smart.plan(paint_request.call(unique_piece, unique_face, i), light: true) }
results << row
click_results = []
row, = measure('clic inmediato pieza única (apply_immediate)', runs: runs, warmup: warmup) do |i|
  r = smart.apply_immediate(paint_request.call(unique_piece, unique_face, i))
  click_results << r['changed']
  r
end
results << row

shared_root, shared_inst = fixture[:shared_click]
shared_piece = "#{shared_root}/#{shared_inst.persistent_id}"
shared_face = shared_inst.definition.entities.first.persistent_id.to_s
shared_count = nil
row, = measure('clic inmediato pieza compartida (scope all)', runs: runs, warmup: warmup) do |i|
  r = smart.apply_immediate(paint_request.call(shared_piece, shared_face, i, 'scope' => 'all', 'allowShared' => true))
  click_results << r['changed']; shared_count = r['affectedPaths'].length
  r
end
results << row
# Clic de canto inmediato: la cara 3 de la caja es un lado (normal -y). Con 1
# canto se arma el marco local para unir caras partidas; con 4, los cuatro lados.
edge_face = unique_def.entities[2].persistent_id.to_s
[1, 4].each do |count|
  row, = measure("clic inmediato canto (#{count} #{count == 1 ? 'canto' : 'cantos'})", runs: runs, warmup: warmup) do |i|
    material = bound[2 + (i % 2)]
    r = smart.apply_immediate({ 'mode' => 'edge', 'immediate' => true, 'edgeCount' => count, 'side' => 'both', 'scope' => 'unique',
                                'catalogId' => items[2 + (i % 2)]['id'], 'materialUuid' => PlanosSanto::MaterialResolver.read_binding(material)['uuid'],
                                'targets' => [{ 'pieceId' => unique_piece, 'faceIds' => [edge_face] }] })
    click_results << r['changed']
    r
  end
  results << row
end
raise 'Algún clic medido no cambió el material (no-op): la medición no sería comparable.' unless click_results.all?(true)

exporter_file = OPTIONS[:exporter]
git = (`git -C #{File.expand_path('..', __dir__)} rev-parse --short HEAD 2>/dev/null`.strip rescue '')
report = {
  'schema' => 1,
  'simulated' => true,
  'note' => 'Tiempos SIMULADOS con dobles de la API en Linux/Ruby; no es SketchUp.',
  'ruby' => RUBY_VERSION, 'platform' => RUBY_PLATFORM, 'git' => git,
  'exporterSha256' => Digest::SHA256.file(exporter_file).hexdigest[0, 12],
  'options' => OPTIONS.reject { |k, _| k == :json }.transform_keys(&:to_s),
  'exporterPath' => exporter_file,
  'model' => { 'furniture' => 75, 'boards' => 1500, 'hardware' => hardware_paths.length,
               'definitions' => fixture[:definitions], 'selectedForGenerate' => selected_ids.length,
               'sharedClickOccurrences' => shared_count },
  'scanTree' => scan_stats, 'generateTree' => generate_stats,
  'bytes' => sizes,
  'timings' => results
}

if OPTIONS[:json]
  puts JSON.pretty_generate(report)
  exit
end

kb = ->(b) { format('%.1f KB', b / 1024.0) }
puts '=' * 78
puts 'BENCH ANÁLISIS PLANOS SANTO — TIEMPOS SIMULADOS (dobles de la API, Linux/Ruby)'
puts 'NO es SketchUp: sirve para comparar versiones del código Ruby entre sí.'
puts '=' * 78
puts "Ruby #{RUBY_VERSION} (#{RUBY_PLATFORM}) · git #{git} · exporter #{exporter_file} sha256 #{report['exporterSha256']}"
puts "runs=#{runs} warmup=#{warmup} seed=#{OPTIONS[:seed]} (mediana/mínimo en ms; GC.start antes de cada muestra)"
puts
puts "Modelo: 75 muebles · 1500 placas · #{hardware_paths.length} herrajes curvos (OCL type 5) · #{fixture[:definitions]} definiciones"
puts format('Árbol scan:      %5d nodos · %5d piezas con malla · %6d triángulos · %6d vértices',
            scan_stats['nodes'], scan_stats['meshPieces'], scan_stats['triangles'], scan_stats['vertices'])
puts format('  de herrajes:   %5d nodos · %5d con malla       · %6d triángulos',
            scan_stats['hardwareNodes'], scan_stats['hardwareMeshPieces'], scan_stats['hardwareTriangles'])
puts format('Árbol generate:  %5d nodos · %5d piezas con malla · %6d triángulos (%d muebles, %d herrajes con malla)',
            generate_stats['nodes'], generate_stats['meshPieces'], generate_stats['triangles'], selected_ids.length, generate_stats['hardwareMeshPieces'])
puts
puts 'Tamaño de respuestas (JSON.generate):'
puts format('  scan crudo (NativeSession#scan)          %12d B  (%s)', sizes['scanRawBytes'], kb.call(sizes['scanRawBytes']))
puts format('  scan enviado (light_scan + sobre reply)  %12d B  (%s)', sizes['scanSentBytes'], kb.call(sizes['scanSentBytes']))
puts format('  generate enviado (sobre reply)           %12d B  (%s)', sizes['generateSentBytes'], kb.call(sizes['generateSentBytes']))
puts
puts format('%-48s %10s %10s %10s', 'Caso', 'mediana', 'mínimo', 'máximo')
puts '-' * 81
results.each { |r| puts format('%-48s %10.2f %10.2f %10.2f', r['name'], r['medianMs'], r['minMs'], r['maxMs']) }
puts '-' * 81
puts "Clic compartido: #{shared_count} apariciones pintadas por clic. Todos los clics medidos cambiaron material (A/B alternados)."
puts 'Usá --json para obtener los números en JSON.'
