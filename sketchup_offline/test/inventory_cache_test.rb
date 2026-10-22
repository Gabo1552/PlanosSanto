# frozen_string_literal: true
# Hito 6: per-definition face fingerprint in NameManager#inventory. API doubles only.
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../names'

class InventoryCacheTest < Minitest::Test
  def setup
    @model = NamesFixture.model
    @board = @model.entities.first.definition.entities.first.definition
  end

  def signature
    PlanosSanto::NameManager.new(@model).inventory[:signature]
  end

  def test_signature_is_stable_without_changes
    assert_equal signature, signature
  end

  def test_shared_definition_is_meshed_once_per_inventory
    calls = 0
    @board.entities.each do |face|
      face.define_singleton_method(:mesh) { |flags = 0| calls += 1; super(flags) }
    end
    PlanosSanto::NameManager.new(@model).inventory
    # Three occurrences (11, 12 and 21) share the board: six faces meshed once.
    assert_equal 6, calls
  end

  # SketchUp definitions have entityID: the production key. Distinct ids are
  # distinct entries even with identical geometry; the same id is meshed once.
  def test_entity_id_key_separates_definitions_and_shares_occurrences
    calls = 0
    twin = Sketchup::Definition.new('Gemela', 'twin', Fixture.board_definition.entities)
    [[@board, 501], [twin, 502]].each { |definition, id| definition.define_singleton_method(:entityID) { id } }
    (@board.entities + twin.entities).each { |face| face.define_singleton_method(:mesh) { |flags = 0| calls += 1; super(flags) } }
    @model.entities.last.definition.entities << Sketchup::ComponentInstance.new(22, 'Gemela', twin)
    before = signature
    assert_equal 12, calls
    twin.entities[0].material = Sketchup::Material.new(92, 'Solo gemela', Sketchup::Color.new(4, 5, 6), 1.0, nil)
    refute_equal before, signature
  end

  def test_face_layer_and_back_material_change_signature
    before = signature
    @board.entities[3].back_material = Sketchup::Material.new(93, 'Dorso', Sketchup::Color.new(7, 8, 9), 1.0, nil)
    after_back = signature
    refute_equal before, after_back
    @board.entities[3].layer = Sketchup::Layer.new('Cantos', true)
    refute_equal after_back, signature
  end

  def test_face_material_change_in_shared_definition_changes_signature
    before = signature
    @board.entities[2].material = Sketchup::Material.new(91, 'Canto nuevo', Sketchup::Color.new(1, 2, 3), 1.0, nil)
    refute_equal before, signature
  end

  def test_face_geometry_change_changes_signature
    before = signature
    mesh = @board.entities[0].mesh
    mesh.points[0] = Sketchup::Point.new(0.0, 0.0, -0.5)
    refute_equal before, signature
  end

  def test_hidden_face_changes_signature
    before = signature
    @board.entities[1].define_singleton_method(:hidden?) { true }
    refute_equal before, signature
  end

  def test_instance_data_still_changes_signature
    before = signature
    @model.entities.first.definition.entities.first.transformation = Geom::Transformation.translation(1, 0, 0)
    refute_equal before, signature
  end

  def test_vertex_limit_counts_every_occurrence_of_a_cached_definition
    # 54 faces x 4 points = 216 vertices per occurrence: 925 fit (199.800), 926 do not.
    dense = Sketchup::Definition.new('Densa', 'dense', 9.times.flat_map { @board.entities })
    model_of = lambda do |count|
      many = count.times.map { |i| Sketchup::ComponentInstance.new(50_000 + i, "D#{i}", dense) }
      NamingModelDouble.new(Sketchup::Model.new([Sketchup::Group.new(1, 'M', Sketchup::Definition.new('M', 'm', many))], 'g', 'Tope', ''))
    end
    assert PlanosSanto::NameManager.new(model_of.call(925)).inventory[:signature]
    error = assert_raises(PlanosSanto::ExportError) { PlanosSanto::NameManager.new(model_of.call(926)).inventory }
    assert_equal 'La geometría supera el límite de revisión de nombres.', error.message
  end
end
