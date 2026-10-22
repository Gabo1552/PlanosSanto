# frozen_string_literal: true
# ARQ-01 (etapa S) with API doubles only; never opens SketchUp.
require 'minitest/autorun'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'

# OCL marks hardware on the material ('ladb_opencutlist', 'type' == 5).
class CacheMaterial < Sketchup::Material
  attr_accessor :ocl_type
  def get_attribute(dictionary, key, default = nil)
    dictionary == 'ladb_opencutlist' && key == 'type' && ocl_type ? ocl_type : default
  end
end

class CountingFace < Sketchup::Face
  @meshes = 0
  class << self
    attr_accessor :meshes
  end
  def mesh(flags = 0)
    self.class.meshes += 1
    super
  end
end

class CurvedFace < Sketchup::Face
  def initialize(points, polygons, normal)
    super(points[0, 4], normal)
    @curved = Sketchup::Mesh.new(points.map { |p| Sketchup::Point.new(*p) }, polygons)
  end
  def mesh(flags = 0)
    raise 'curved face meshed' if ENV['CACHE_TEST_STRICT'] == '1'
    raise unless flags.zero?
    @curved
  end
end

module CacheFixture
  module_function

  def board_faces(x, y, z, face_class: Sketchup::Face, offset: 0)
    v = [[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]].map { |p| [p[0] + offset, p[1], p[2]] }
    [[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]]
      .map { |ids, n| face_class.new(ids.map { |i| v[i] }, n) }
  end

  def board(name, guid, x, y, z, face_class: Sketchup::Face, painted: nil)
    faces = board_faces(x, y, z, face_class: face_class)
    faces[1].material = painted if painted
    Sketchup::Definition.new(name, guid, faces)
  end

  def degenerate
    face = Sketchup::Face.new([[0,0,0],[1,0,0],[2,0,0],[3,0,0]], [0,0,1])
    Sketchup::Definition.new('Degenerada', 'degenerate', [face])
  end

  def hinge(material)
    # A 32-segment cylinder: the kind of curved fitting that dominates the limits.
    ring = 32.times.map { |i| a = 2 * Math::PI * i / 32; [Math.cos(a), Math.sin(a)] }
    points = ring.map { |x, y| [x, y, 0.0] } + ring.map { |x, y| [x, y, 2.0] }
    polygons = 32.times.flat_map { |i| j = (i + 1) % 32; [[i + 1, j + 1, j + 33], [i + 1, j + 33, i + 33]] }
    face = CurvedFace.new(points, polygons, [1,0,0])
    face.material = material
    Sketchup::Definition.new('Bisagra', 'hinge', [face])
  end

  def model
    oak = CacheMaterial.new(301, 'Roble', Sketchup::Color.new(150,110,60), 1.0, nil)
    white = CacheMaterial.new(302, 'Blanco', Sketchup::Color.new(250,250,250), 1.0, nil)
    jade = CacheMaterial.new(303, 'Jade', Sketchup::Color.new(20,150,100), 1.0, nil)
    steel = CacheMaterial.new(304, 'Acero', Sketchup::Color.new(180,180,180), 1.0, nil)
    steel.ocl_type = 5
    side = board('Lateral', 'side', 24.0, 16.0, 0.75, painted: jade)
    shelf = board('Estante', 'shelf', 22.5, 15.0, 0.75)
    bad = degenerate
    hinge_def = hinge(steel)
    t = Geom::Transformation
    pieces = lambda do |base|
      left = Sketchup::ComponentInstance.new(base + 1, 'Lateral izq', side)
      right = Sketchup::ComponentInstance.new(base + 2, 'Lateral der', side, t.translation(23.25,0,0))
      top = Sketchup::ComponentInstance.new(base + 3, '', shelf, t.translation(0.75,0,15.0))
      bottom = Sketchup::ComponentInstance.new(base + 4, 'Piso', shelf, t.translation(0.75,0,0) * t.rotation_z(Math::PI / 2))
      bottom.material = white
      scaled = Sketchup::ComponentInstance.new(base + 5, 'Estante escalado', shelf, t.scale(0.5, 1.0, 1.0))
      skewed = Sketchup::ComponentInstance.new(base + 6, 'Sesgada', shelf, t.new([1,0,0,0, 0.5,1,0,0, 0,0,1,0, 0,0,0,1]))
      broken = Sketchup::ComponentInstance.new(base + 7, 'Rota', bad)
      fitting = Sketchup::ComponentInstance.new(base + 8, 'Bisagra', hinge_def)
      [left, right, top, bottom, scaled, skewed, broken, fitting]
    end
    first = Sketchup::Group.new(1, 'Bajo mesada', Sketchup::Definition.new('Bajo', 'low', pieces.call(100)))
    first.material = oak
    second = Sketchup::Group.new(2, 'Alacena', Sketchup::Definition.new('Alacena', 'high', pieces.call(200)), t.translation(60,0,0))
    third = Sketchup::Group.new(3, 'Alacena copia', second.definition, t.translation(120,0,0))
    third.material = white
    # Painted side: kept as a piece. Unpainted shelf: inherits the hardware material.
    box_children = [Sketchup::ComponentInstance.new(401, 'Lateral pintado', side), Sketchup::ComponentInstance.new(402, 'Herraje heredado', shelf)]
    fitting_box = Sketchup::Group.new(4, 'Caja de herrajes', Sketchup::Definition.new('Caja', 'box', box_children))
    fitting_box.material = steel
    Sketchup::Model.new([first, second, third, fitting_box], 'cache-model-guid', 'Caché ARQ-01 — NO ES UN SKP', '')
  end
end

class ExporterCacheTest < Minitest::Test
  def outputs(model, cache)
    exporter = PlanosSanto::Exporter.new(model, cache: cache)
    tree = exporter.tree
    pieces = []
    PlanosSanto::Exporter.each_node(tree['roots']) { |n| pieces << n['id'] if n['mesh'] && n.dig('metadata', 'errors').empty? }
    [JSON.generate(tree), JSON.generate(stable(exporter.document(tree, pieces)))]
  end

  def stable(document)
    document.merge('exporter' => document['exporter'].merge('exportedAt' => 'fixed'))
  end

  def test_contract_fixture_is_byte_identical_with_and_without_cache
    assert_equal outputs(Fixture.model, false), outputs(Fixture.model, true)
  end

  def test_shared_definitions_inherited_materials_and_errors_are_byte_identical
    cached = outputs(CacheFixture.model, true)
    assert_equal outputs(CacheFixture.model, false), cached
    tree = JSON.parse(cached[0])
    nodes = {}; PlanosSanto::Exporter.each_node(tree['roots']) { |n| nodes[n['id']] = n }
    # The key includes the inherited material: same definition, different face colors.
    # faceMaterials are per triangle (two per face): the painted face 1 is index 2.
    assert_equal 'Roble', nodes['1/103']['mesh']['faceMaterials'][0]['front']['name']
    assert_equal 'Blanco', nodes['3/203']['mesh']['faceMaterials'][0]['front']['name']
    assert_nil nodes['2/203']['mesh']['faceMaterials'][0]['front']
    assert_equal 'Jade', nodes['2/201']['mesh']['faceMaterials'][2]['front']['name']
    # Errors and per-transform checks are replayed for every occurrence.
    %w[1/107 2/207 3/207].each { |id| assert_equal ['Triángulo degenerado en una cara.'], nodes[id]['metadata']['errors'] }
    %w[1/106 2/206 3/206].each { |id| refute_empty nodes[id]['metadata']['errors'] }
    assert_in_delta 285.75, nodes['1/105']['metadata']['dimensionsMm'][1], 1e-6
  end

  def test_hardware_is_not_tessellated
    ENV['CACHE_TEST_STRICT'] = '1'
    tree = PlanosSanto::Exporter.new(CacheFixture.model).tree
    nodes = {}; PlanosSanto::Exporter.each_node(tree['roots']) { |n| nodes[n['id']] = n }
    %w[1/108 2/208 3/208 4/402].each do |id|
      refute nodes[id].key?('mesh'), id
      assert_includes nodes[id]['metadata']['warnings'], PlanosSanto::Exporter::HARDWARE_WARNING
    end
    # A container is never pruned: a board with its own sheet face stays a piece.
    assert nodes['4/401'].key?('mesh')
    refute_includes nodes['4']['metadata']['warnings'], PlanosSanto::Exporter::HARDWARE_WARNING
    assert nodes['1/101'].key?('mesh')
  ensure
    ENV.delete('CACHE_TEST_STRICT')
  end

  def test_cache_tessellates_each_definition_and_material_once
    CountingFace.meshes = 0
    definition = CacheFixture.board('Placa', 'plate', 24.0, 16.0, 0.75, face_class: CountingFace)
    instances = 50.times.map { |i| Sketchup::ComponentInstance.new(i + 10, "P#{i}", definition, Geom::Transformation.translation(i * 30, 0, 0)) }
    model = Sketchup::Model.new([Sketchup::Group.new(1, 'Mueble', Sketchup::Definition.new('M', 'm', instances))], 'g', 'Conteo', '')
    PlanosSanto::Exporter.new(model).tree
    assert_equal 6, CountingFace.meshes
    CountingFace.meshes = 0
    PlanosSanto::Exporter.new(model, cache: false).tree
    assert_equal 300, CountingFace.meshes
  end

  def test_cached_geometry_still_counts_toward_the_limit
    # Ten boxes per definition: 80 vertices and 120 triangles per occurrence.
    faces = 10.times.flat_map { |k| CacheFixture.board_faces(2.0, 2.0, 0.75, offset: k * 3.0) }
    definition = Sketchup::Definition.new('Rack', 'rack', faces)
    model_of = lambda do |count|
      instances = count.times.map { |i| Sketchup::ComponentInstance.new(i + 10, "P#{i}", definition) }
      Sketchup::Model.new([Sketchup::Group.new(1, 'Mueble', Sketchup::Definition.new('M', 'm', instances))], 'g', 'Tope', '')
    end
    assert_equal 1_666, PlanosSanto::Exporter.new(model_of.call(1_666)).tree['roots'][0]['children'].length
    [true, false].each do |cache|
      error = assert_raises(PlanosSanto::ExportError) { PlanosSanto::Exporter.new(model_of.call(1_667), cache: cache).tree }
      assert_equal 'El modelo supera 200.000 vértices o triángulos.', error.message
    end
  end
end
