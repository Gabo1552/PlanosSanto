# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'fake_model'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'

class NativeGuideTest < Minitest::Test
  def setup
    @model = NativeModelDouble.new(Fixture.model)
    @store = PlanosSanto::GuideStore.new(@model)
    @session = PlanosSanto::NativeSession.new(@model)
    @session.scan
    @document = @session.generate(%w[1 2])['document']
    @edits = @document['furniture'].map do |root|
      pieces = []
      PlanosSanto::Exporter.each_node([root]) do |n|
        pieces << { 'id' => n['id'], 'name' => n['name'], 'code' => "P#{(pieces.length + 1).to_s.rjust(2, '0')}" } if n['mesh']
      end
      { 'id' => root['id'], 'explosion' => 0.45, 'zoom' => 1, 'pieces' => pieces, 'notes' => [] }
    end
  end
  def note
    { 'id' => '12345678-1234-4234-8234-123456789012', 'pieceId' => '1/11', 'anchor' => [0, 0, 0],
      'position' => [718, 32], 'text' => 'Alinear antes de fijar' }
  end
  def save; @session.save(@edits, @store.read['revision']); end

  def test_roundtrip_attributes_revision_notes_names_and_geometry_read_only
    geometry = Marshal.dump(@model.__getobj__)
    @edits[0]['pieces'][0]['name'] = 'Costado del taller'
    @edits[0]['notes'] = [note]
    saved = save
    assert_equal 1, saved['revision']
    assert_equal saved, PlanosSanto::GuideStore.new(@model).read
    assert_equal 'Costado del taller', saved['furniture'][0]['pieces'][0]['name']
    assert_equal note, saved['furniture'][0]['notes'][0]
    assert_equal geometry, Marshal.dump(@model.__getobj__)
    assert_equal [:commit], @model.operations.last
    assert_equal JSON.parse(File.read(File.expand_path('../version.json', __dir__)))['version'], @document['exporter']['version']
  end
  def test_rejects_geometry_edits_duplicate_codes_and_invalid_anchors_before_writing
    @edits[0]['pieces'][0]['dimensions'] = [1, 2, 3]
    assert_raises(PlanosSanto::ExportError) { save }
    @edits[0]['pieces'][0].delete('dimensions')
    @edits[0]['pieces'][1]['code'] = 'P01'
    assert_raises(PlanosSanto::ExportError) { save }
    @edits[0]['pieces'][1]['code'] = 'P02'
    @edits[0]['notes'] = [note.merge('anchor' => [99_999, 0, 0])]
    assert_raises(PlanosSanto::ExportError) { save }
    @edits[0]['notes'] = [note.merge('pieceId' => 'missing')]
    assert_raises(PlanosSanto::ExportError) { save }
    assert_empty @model.attributes
    assert_empty @model.operations
  end
  def test_detects_revision_conflict_and_undo
    save
    assert_raises(PlanosSanto::ExportError) { @session.save(@edits, 0) }
    @model.attributes.clear # Double of Undo restoring the prior attribute value.
    assert_raises(PlanosSanto::ExportError) { @session.check_current! }
  end
  def test_aborts_failed_attribute_write
    @model.fail_write = true
    assert_raises(IOError) { save }
    assert_empty @model.attributes
    assert_equal [:abort], @model.operations.last
  end
  def test_selection_from_edit_context_uses_full_instance_path
    @model.active_path = [@model.entities[0]]
    @model.selection = [@model.entities[0].definition.entities[1]]
    result = @session.scan
    assert_equal ['1/13'], result['selected']
    assert_equal '1/13/12', @session.generate(['1/13'])['document']['furniture'][0]['children'][0]['id']
  end
  def test_changed_geometry_blocks_save_and_export
    @model.entities[0].transformation = Geom::Transformation.translation(3, 2, 1)
    error = assert_raises(PlanosSanto::ExportError) { save }
    assert_match(/geometría/, error.message)
    assert_raises(PlanosSanto::ExportError) { @session.validate_export(@edits) }
    assert_empty @model.attributes
  end
  def test_definition_revision_between_scan_and_generation_keeps_the_same_pieces
    @session.scan
    @model.entities[0].definition.guid='revision-without-geometry-change'
    document=@session.generate(['1'])['document']
    assert_equal 'revision-without-geometry-change',document['furniture'][0]['definition']
    assert_equal ['1/11','1/13/12'],document['furniture'][0]['children'].flat_map { |n| n['mesh'] ? [n['id']] : n['children'].map { |child| child['id'] } }
    assert @session.check_current!
  end
  def test_definition_revision_does_not_hide_actual_changes_to_pieces_or_materials
    mutations=[
      ->(root) { root.definition.entities[0].transformation=Geom::Transformation.scale(1.01,1,1) },
      ->(root) { root.definition.entities[0].definition.entities[0].mesh(0).points[0].x+=0.1 },
      ->(root) { root.definition.entities.delete_at(0) },
      ->(root) { root.definition.entities << Sketchup::ComponentInstance.new(55,'Nueva pieza',Fixture.board_definition) },
      ->(root) { root.definition.entities[0].definition.entities[0].material.color.red=25 },
      ->(root) { root.definition.entities[0].name='Nombre externo' }
    ]
    mutations.each do |mutate|
      setup
      root=@model.entities[0];root.definition.guid='new-revision';mutate.call(root)
      assert_raises(PlanosSanto::ExportError) { save }
      assert_raises(PlanosSanto::ExportError) { @session.validate_export(@edits) }
      assert_empty @model.attributes;assert_empty @model.operations
    end
  end
  def test_changing_model_after_review_blocks_generation
    @session.scan
    @model.entities[0].transformation = Geom::Transformation.translation(3, 2, 1)
    assert_raises(PlanosSanto::ExportError) { @session.generate(['1']) }
  end
  def test_preserves_other_furniture_and_existing_orphan_until_reanchored
    @edits[0]['notes'] = [note]
    save
    # Physical piece removed from the model after the first saved guide.
    @model.entities[0].definition.entities.delete_at(0)
    @session.scan
    doc = @session.generate(['1'])['document']
    edits = [@edits[0].merge('pieces' => [@edits[0]['pieces'][1]])]
    saved = @session.save(edits, 1)
    assert_equal 2, saved['furniture'].length
    assert_equal note, saved['furniture'].find { |f| f['id'] == '1' }['notes'][0]
    assert_raises(PlanosSanto::ExportError) { @session.validate_export(edits) }
    edits[0]['notes'][0] = note.merge('pieceId' => '1/13/12')
    assert @session.validate_export(edits)
    refute_empty doc['furniture']
  end
  def test_corrupt_attributes_are_not_overwritten
    @model.attributes[['PlanosSanto', 'guide_v1']] = '{broken'
    assert_raises(PlanosSanto::ExportError) { @store.read }
    assert_equal '{broken', @model.attributes[['PlanosSanto', 'guide_v1']]
  end
  def test_saved_piece_code_cannot_be_reassigned
    save
    @edits[0]['pieces'][0]['code'] = 'P33'
    assert_raises(PlanosSanto::ExportError) { save }
  end
  def test_hidden_dimensions_roundtrip_and_legacy_client_preserves_preferences
    @edits[0]['hiddenDimensions']=[{'pieceId'=>'1/11','role'=>'largo'}]
    original=Marshal.dump(@model.__getobj__);saved=save
    assert_equal @edits[0]['hiddenDimensions'],saved['furniture'][0]['hiddenDimensions']
    assert_equal original,Marshal.dump(@model.__getobj__)
    reopened=PlanosSanto::NativeSession.new(@model);reopened.scan
    assert_equal @edits[0]['hiddenDimensions'],reopened.generate(['1'])['guide']['furniture'][0]['hiddenDimensions']
    @edits[0].delete('hiddenDimensions');saved=save
    assert_equal [{'pieceId'=>'1/11','role'=>'largo'}],saved['furniture'][0]['hiddenDimensions']
    @edits[0]['hiddenDimensions']=[];assert_equal [],save['furniture'][0]['hiddenDimensions']
  end
  def test_hidden_dimensions_invalid_references_duplicates_and_unknown_roles_do_not_write
    ref={'pieceId'=>'1/11','role'=>'largo'}
    [[ref,ref],[ref.merge('pieceId'=>'missing')],[ref.merge('role'=>'espesor')],[ref.merge('value'=>18)]].each do |refs|
      @edits[0]['hiddenDimensions']=refs
      assert_raises(PlanosSanto::ExportError) { save }
    end
    assert_empty @model.attributes;assert_empty @model.operations
  end
  def test_malformed_saved_note_does_not_reach_renderer_or_overwrite_attributes
    guide = { 'version' => 1, 'revision' => 2, 'selection' => ['1'], 'furniture' => [@edits[0].merge('notes' => [note.merge('position' => [Float::INFINITY, 2])]) ] }
    # JSON itself also refuses non-finite numbers; test a valid JSON but invalid guide coordinate instead.
    guide['furniture'][0]['notes'][0]['position'] = [99_999, 2]
    raw = JSON.generate(guide)
    @model.attributes[['PlanosSanto', 'guide_v1']] = raw
    assert_raises(PlanosSanto::ExportError) { @store.read }
    assert_equal raw, @model.attributes[['PlanosSanto', 'guide_v1']]
  end
end
