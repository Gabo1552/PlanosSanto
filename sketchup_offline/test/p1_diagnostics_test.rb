# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require_relative '../../sketchup/test/fake_api'
require_relative '../p1_diagnostics'

# Synthetic API fixtures. These tests do not open SKP or run SketchUp.
module Sketchup
  Vertex = Struct.new(:position)
  Loop = Struct.new(:vertices, :outer) { def outer?; outer; end }
  class Face
    attr_accessor :test_loops, :test_edges, :test_mesh
    def persistent_id; object_id; end
    def loops; test_loops || [Loop.new(@mesh.points.map { |p| Vertex.new(p) }, true)]; end
    def edges; test_edges || []; end
    alias original_mesh mesh
    def mesh(flags = 0); test_mesh || original_mesh(flags); end
  end
  class Edge
    attr_accessor :start, :end, :faces, :material
    def initialize(a, b, faces)
      @start = Vertex.new(Point.new(*a)); @end = Vertex.new(Point.new(*b)); @faces = faces
    end
    def persistent_id; object_id; end
    def hidden?; false; end
    def soft?; true; end
    def smooth?; false; end
  end
  class Material
    def get_attribute(dictionary, key, default)
      return default if dictionary == 'PlanosSantoMaterial'
      raise 'Wrong dictionary' unless dictionary == 'ladb_opencutlist'
      { 'type' => 2, 'grained' => true, 'std_thicknesses' => '18mm' }.fetch(key, default)
    end
    def set_attribute(*); raise 'MUTATION FORBIDDEN'; end
  end
  class Model
    attr_accessor :selection, :active_path
    def start_operation(*); raise 'MUTATION FORBIDDEN'; end
    def set_attribute(*); raise 'MUTATION FORBIDDEN'; end
    def save(*); raise 'MUTATION FORBIDDEN'; end
  end
end
module UI
  class << self
    attr_accessor :target, :messages
    def savepanel(*); target; end
    def messagebox(message); (self.messages ||= []) << message; end
  end
end
class << Sketchup
  attr_accessor :active_model
end

class P1DiagnosticsTest < Minitest::Test
  D = PlanosSanto::P1Diagnostics
  def setup
    @model = Fixture.model
    Sketchup.active_model = @model
    UI.target = nil; UI.messages = []
  end
  def scan(**limits); D::Scanner.new(@model, limits: limits).scan; end
  def test_full_hierarchy_repeated_definitions_and_units_without_mutation
    before = Marshal.dump(@model)
    result = scan
    assert result['complete']
    assert_equal 8, result['instances'].size
    assert_equal 3, result['definitions'].size
    assert_equal [%w[1], %w[1 11], %w[1 13], %w[1 13 12], %w[2], %w[2 11], %w[2 13], %w[2 13 12]], result['instances'].map { |i| i['path'] }
    board = result['instances'][1]
    assert_equal [609.5999999999999, 406.4, 19.049999999999997], board['axis_lengths_mm']
    assert_in_delta 2540, board['world_transform'][12], 1e-8
    assert_equal [0, 0, 0], board['local_transform'][12, 3]
    assert_equal Marshal.dump(@model), before
    refute result['production_ready']
    refute result['opencutlist']['namespace_present']
    assert_nil result['instances'][0]['axis_lengths_mm'] # container is not a board
  end
  def test_rotation_nonuniform_scale_mirror_and_shear_are_not_sorted_cut_dimensions
    piece = @model.entities[0].definition.entities[0]
    piece.transformation = Geom::Transformation.rotation_z(Math::PI / 3) * Geom::Transformation.scale(-2, 3, 1)
    board = scan['instances'][1]
    assert board['orientation']['mirrored']
    refute board['orientation']['sheared']
    [1219.2, 1219.2, 19.05].zip(board['axis_lengths_mm']).each { |a,b| assert_in_delta a, b, 1e-7 }
    matrix = Geom::Transformation.new.to_a; matrix[4] = 0.5
    piece.transformation = Geom::Transformation.new(matrix)
    assert scan['instances'][1]['orientation']['sheared']
    piece.transformation = Geom::Transformation.scale(0, 1, 1)
    assert scan['instances'][1]['orientation']['singular']
  end
  def test_unnamed_leaf_is_unclassified_and_selection_keeps_active_ancestors
    root = @model.entities[0]; piece = root.definition.entities[0]
    piece.name = ''
    @model.active_path = [root]; @model.selection = [piece]
    report = scan
    assert_equal [%w[1 11]], report['selection_paths']
    assert_equal '', report['instances'][1]['name']
    assert_equal 'unclassified_leaf', report['instances'][1]['candidate']
    assert_equal 'container_requires_review', report['instances'][0]['candidate']
  end
  def test_visibility_and_material_inheritance_are_observed_not_approved
    root = @model.entities[0]
    root.material = Sketchup::Material.new(999, 'Inherited', Sketchup::Color.new(1,2,3), 1, nil)
    root.hidden = true
    report = scan
    assert report['instances'].first(4).none? { |i| i['visible'] }
    assert_equal 'material:999', report['instances'][1]['effective_material_id']
    face = report['definitions'].find { |d| d['guid_revision'] == 'synthetic-board' }['geometry']['faces'][0]
    assert_equal 'material:77', face['front_material_id']
    assert_nil face['back_material_id']
    assert_equal %w[grained std_thicknesses type], report['materials'][0]['opencutlist_observed'].keys.sort
    assert report['materials'].none? { |m| m['catalog_approved'] }
    refute report.to_json.include?('std_prices')
  end
  def test_holes_real_triangles_face_back_material_and_edge_adjacency
    outer = [[0,0,0],[4,0,0],[4,4,0],[0,4,0]]
    inner = [[1,1,0],[3,1,0],[3,3,0],[1,3,0]]
    points = (outer + inner).map { |p| Sketchup::Point.new(*p) }
    face = Sketchup::Face.new(outer, [0,0,1])
    face.test_loops = [Sketchup::Loop.new(points[0,4].map { |p| Sketchup::Vertex.new(p) }, true), Sketchup::Loop.new(points[4,4].map { |p| Sketchup::Vertex.new(p) }, false)]
    polygons = [[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]]
    face.test_mesh = Sketchup::Mesh.new(points, polygons)
    face.back_material = Sketchup::Material.new(88, 'Back', Sketchup::Color.new(1,1,1), 1, nil)
    edge = Sketchup::Edge.new(outer[0], outer[1], [face]); face.test_edges = [edge]
    @model.entities.replace([face, edge])
    report = scan
    geometry = report['root_geometry']; exported = geometry['faces'][0]
    assert_equal [true, false], exported['loops'].map { |l| l['outer'] }
    assert_equal 8, exported['triangles'].length
    assert_in_delta 12 * 25.4**2, exported['area_mm2_local'], 1e-7
    assert_equal 'material:88', exported['back_material_id']
    assert_equal [edge.persistent_id.to_s], exported['edge_ids']
    assert_equal [face.persistent_id.to_s], geometry['edges'][0]['face_ids']
    assert_empty report['instances']
    assert report['complete']
  end
  def test_global_limits_and_recursive_definitions_report_incompleteness
    [:instances, :definitions, :faces, :points, :edges, :triangles].each do |kind|
      next if kind == :edges # explicitly tested with edge fixture below
      report = scan(**{kind => 0})
      refute report['complete'], kind
      assert_equal 'limit', report['issues'][0]['code']
    end
    refute scan(depth: 0)['complete']
    root = @model.entities[0]
    root.definition.entities << root
    report = scan
    refute report['complete']
    assert report['issues'].any? { |i| i['code'] == 'recursive_definition' }
  end
  def test_loaded_opencutlist_is_observed_without_calling_its_helpers
    namespace = Module.new; ocl = Module.new
    ocl.const_set(:EXTENSION_VERSION, '7.1.0-test')
    ocl.const_set(:EXTENSION_BUILD, 'synthetic')
    helper = Class.new { def initialize(*); raise 'OCL helper must not be instantiated'; end }
    ocl.const_set(:MaterialAttributes, helper)
    namespace.const_set(:OpenCutList, ocl); Object.const_set(:Ladb, namespace)
    report = scan
    assert report['opencutlist']['namespace_present']
    assert_equal '7.1.0-test', report['opencutlist']['version']
    assert_equal 'synthetic', report['opencutlist']['build']
    assert report['complete']
  ensure
    Object.send(:remove_const, :Ladb) if Object.const_defined?(:Ladb, false)
  end
  def test_missing_persistent_id_and_edge_limits_are_explicit
    @model.entities[0].persistent_id = 0
    report = scan
    refute report['complete']
    assert report['issues'].any? { |i| i['code'] == 'missing_persistent_id' }
    @model.entities.replace([Sketchup::Edge.new([0,0,0], [1,0,0], [])])
    report = scan(edges: 0)
    refute report['complete']
    assert_equal 'limit', report['issues'][0]['code']
  end
  def test_invalid_mesh_or_nonfinite_transform_never_exports_approximation
    piece = @model.entities[0].definition.entities[0]
    piece.definition.entities[0].test_mesh = Sketchup::Mesh.new([], [[1,2,3,4]])
    assert_raises(ArgumentError) { scan }
    @model = Fixture.model
    a = Geom::Transformation.new.to_a; a[12] = Float::INFINITY
    @model.entities[0].transformation = Geom::Transformation.new(a)
    assert_raises(ArgumentError) { scan }
  end
  def test_file_safety_size_limit_unicode_and_cancellation
    Dir.mktmpdir do |dir|
      target = File.join(dir, 'Diagnóstico José.json')
      report = scan
      D.write(report, target)
      assert_equal D::SCHEMA, JSON.parse(File.read(target))['schema']
      output, error, status = Open3.capture3('python3', File.expand_path('../../scripts/validar_diagnostico_p1.py', __dir__), target)
      assert status.success?, error
      assert_equal 8, JSON.parse(output)['instances']
      corrupted = Marshal.load(Marshal.dump(report))
      corrupted['instances'][1]['world_transform'][12] += 1
      invalid = File.join(dir, 'invalid.json'); D.write(corrupted, invalid)
      _, _, status = Open3.capture3('python3', File.expand_path('../../scripts/validar_diagnostico_p1.py', __dir__), invalid)
      refute status.success?
      assert_raises(Errno::EEXIST) { D.write(report, target) }
      assert_equal D::SCHEMA, JSON.parse(File.read(target))['schema']
      assert_raises(ArgumentError) { D.write(report, File.join(dir, 'model.skp')) }
      assert_raises(D::LimitError) { D.write(report, File.join(dir, 'large.json'), max_bytes: 10) }
      refute File.exist?(File.join(dir, 'large.json'))
      assert_equal({ 'cancelled' => true }, D.run)
      assert_empty UI.messages
      UI.target = File.join(dir, 'Nuevo')
      result = D.run
      assert result['complete']
      assert File.exist?(UI.target + '.json')
      assert_includes UI.messages.last, 'No confirma medidas'
    end
  end
  def test_public_counter_keys_are_strings_and_match_actual_instances_without_json_payload_change
    scanner=D::Scanner.new(@model)
    report=scanner.scan
    assert report['counts'].keys.all? { |key| key.is_a?(String) }
    assert_equal report['instances'].length,report['counts']['instances']
    assert_equal 8,report['counts']['instances']
    # Recreate the old public Symbol-keyed hash. JSON payload must remain identical.
    legacy=report.merge('counts'=>scanner.instance_variable_get(:@counts))
    assert legacy['counts'].keys.all? { |key| key.is_a?(Symbol) }
    assert_equal JSON.parse(JSON.generate(legacy)),JSON.parse(JSON.generate(report))
  end

  def test_diagnostic_message_uses_actual_instance_counter
    Dir.mktmpdir do |dir|
      UI.target=File.join(dir,'counter.json')
      result=D.run
      assert result['complete']
      assert_includes UI.messages.last,'8 instancias.'
      assert_equal 8,JSON.parse(File.read(UI.target))['counts']['instances']
    end
  end

end
