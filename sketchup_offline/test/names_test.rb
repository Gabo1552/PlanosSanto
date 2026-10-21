# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../names'

class NamesTest < Minitest::Test
  def setup
    @model=NamesFixture.model; @manager=PlanosSanto::NameManager.new(@model)
    @root=@model.entities[0]; @left=@root.entities[0]; @base=@root.entities[1].entities[0]
  end
  def preview; @manager.preview('1'); end
  def data(p=preview,name:'Bajo Mesada',prefix:'BM')
    { 'token'=>p['token'],'name'=>name,'prefix'=>prefix,'bases'=>p['rows'].select { |r| r['role']=='piece' }.to_h { |r| [r['id'],r['base']] } }
  end
  def names; @model.all_instances.map { |e| [e.persistent_id,e.name,e.definition.name,e.transformation.to_a] }; end

  def test_abbreviations_unicode_codes_and_normalized_spaces
    { 'Bajo Mesada'=>'BM','M08 - Alacena Superior'=>'M08','m1 Mueble'=>'M1','Módulo Ñandú'=>'MÑ','Bajo   de la Mesada'=>'BM' }.each do |name,expected|
      assert_equal expected,PlanosSanto::NameManager.abbreviation(name)
    end
    assert_equal 'Lateral - Blanco',PlanosSanto::NameManager.clean('  Lateral  -  Blanco  ')
    assert_raises(PlanosSanto::ExportError) { PlanosSanto::NameManager.clean("base\x00") }
  end
  def test_three_piece_example_applies_one_batch
    third=Sketchup::ComponentInstance.new(14,'Lateral derecho',Fixture.board_definition)
    @root.entities << third;p=preview
    assert_equal 3,p['pieceCount'];refute p['blocked']
    @manager.apply(data(p));assert_equal 'BM - Lateral derecho',third.name
    assert_equal 1,@model.operations.count { |op| op[0]==:start }
  end
  def test_catalog_and_preview_preserve_all_levels_and_do_not_write
    before=Marshal.dump(names);p=preview
    assert_equal ['1','2'],@manager.catalog['roots'].map { |r| r['id'] }
    assert_equal ['1/11','1/13','1/13/12'],p['rows'].map { |r| r['id'] }
    assert_equal %w[piece container piece],p['rows'].map { |r| r['role'] }
    assert_equal 2,p['pieceCount'];refute p['blocked'];assert_equal 'BM',p['prefix']
    assert_equal before,Marshal.dump(names);assert_empty @model.operations;assert_empty @left.names_attributes
  end
  def test_one_atomic_operation_idempotence_and_replacement_preserve_foreign_hyphens
    result=@manager.apply(data);refute result['noChanges'];assert_equal 'BM - Lateral - Blanco',@left.name
    assert_equal 'BM - Base',@base.name;assert_equal 'Bajo Mesada',@root.name
    assert_equal 'Interior estructural',@root.entities[1].name
    assert_equal 1,@model.operations.count { |op| op[0]==:start }
    again=@manager.apply(data(result['preview']));assert again['noChanges'];assert_equal 1,@model.undo_states.length
    @manager.apply(data(again['preview'],name:'Alacena Superior',prefix:'AS'))
    assert_equal 'AS - Lateral - Blanco',@left.name;assert_equal 'Alacena Superior',@root.name
    refute_includes @left.name,'BM -';assert_equal 'Base ajena',@model.entities[1].entities[0].name
  end
  def test_foreign_prefix_is_never_stripped_and_empty_instance_uses_definition
    @left.name='BM - Lateral';@base.name=''
    p=preview;assert_equal 'BM - Lateral',p['rows'][0]['base'];assert_equal 'Tablón de prueba',p['rows'][2]['base']
    @manager.apply(data(p));assert_equal 'BM - BM - Lateral',@left.name
    @base.name='';@base.definition.name=''
    p=preview;assert_equal 'Pieza 12',p['rows'][2]['base']
  end
  def test_shared_parent_and_shared_intermediate_block_without_make_unique
    @model.entities << Sketchup::ComponentInstance.new(3,'Repetido',@root.definition)
    p=preview;assert p['blocked'];assert_match(/compartid/,p['blockers'].join)
    before=Marshal.dump(names);assert_raises(PlanosSanto::ExportError) { @manager.apply(data(p)) };assert_equal before,Marshal.dump(names);assert_empty @model.operations
    @model.entities.pop
    container=@root.entities[1];@model.entities[1].entities << Sketchup::ComponentInstance.new(23,'Otra interior',container.definition)
    assert preview['blocked']
  end
  def test_shared_definition_of_leaf_is_safe_for_independent_instances
    assert_same @left.definition,@model.entities[1].entities[0].definition
    @manager.apply(data);assert_equal 'Base ajena',@model.entities[1].entities[0].name
    assert_equal 'Tablón de prueba',@left.definition.name
  end
  def test_nested_parent_instance_can_be_shared_even_when_only_one_definition_object_is_seen
    @model.entities << Sketchup::ComponentInstance.new(33,'Parent repeated',@root.definition)
    p=@manager.preview('1/13');assert p['blocked'];assert_match(/compartid/,p['blockers'].join)
  end
  def test_definition_instances_guard_includes_unplaced_definition_references
    @root.definition.define_singleton_method(:instances) { [Object.new,Object.new] }
    assert preview['blocked'];assert_empty @model.operations
  end
  def test_locked_removed_changed_names_or_geometry_require_fresh_preview
    @left.locked_for_names=true;assert preview['blocked'];@left.locked_for_names=false
    p=preview;@left.invalid_for_names=true
    assert_raises(PlanosSanto::ExportError) { @manager.apply(data(p)) };@left.invalid_for_names=false
    p=preview;@root.name='Cambiado afuera';assert_raises(PlanosSanto::ExportError) { @manager.apply(data(p)) }
    @root.name='Bajo Mesada';p=preview;@base.transformation=Geom::Transformation.translation(1,0,0)
    assert_raises(PlanosSanto::ExportError) { @manager.apply(data(p)) };assert_empty @model.operations
  end
  def test_partial_failure_aborts_names_metadata_and_guide
    before=Marshal.dump(names);@base.fail_meta_write=true
    assert_raises(IOError) { @manager.apply(data) }
    assert_equal before,Marshal.dump(names);assert_empty @left.names_attributes;assert_empty @root.names_attributes
    assert_equal :abort,@model.operations.last[0];assert_empty @model.undo_states
  end
  def test_guide_write_failure_aborts_all_instance_names_and_metadata
    guide={ 'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0.45,'zoom'=>1,'hiddenDimensions'=>[{'pieceId'=>'1/11','role'=>'largo'}],'pieces'=>[{'id'=>'1/11','name'=>'Alias anterior','code'=>'P01'}],'notes'=>[]}] }
    @model.attributes[['PlanosSanto','guide_v1']]=JSON.generate(guide)
    before=Marshal.dump(names);@model.fail_write=true
    assert_raises(IOError) { @manager.apply(data) }
    assert_equal before,Marshal.dump(names);assert_equal guide,PlanosSanto::GuideStore.new(@model).read
    assert_empty @left.names_attributes;assert_equal :abort,@model.operations.last[0]
  end
  def test_undo_and_serialized_reopen_preserve_metadata_without_prefix_duplication
    before=Marshal.dump(names);@manager.apply(data)
    reopened=Marshal.load(Marshal.dump(@model.__getobj__))
    fresh=PlanosSanto::NameManager.new(NamingModelDouble.new(reopened));p=fresh.preview('1')
    assert_equal 'Lateral - Blanco',p['rows'][0]['base'];assert_equal 'BM',p['prefix']
    assert fresh.apply(data(p))['noChanges']
    @model.undo;assert_equal before,Marshal.dump(names);assert_empty @left.names_attributes
  end
  def test_saved_guide_names_change_but_codes_notes_anchors_and_other_furniture_do_not
    guide={ 'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0.45,'zoom'=>1,'hiddenDimensions'=>[{'pieceId'=>'1/11','role'=>'largo'}],'pieces'=>[{'id'=>'1/11','name'=>'Alias anterior','code'=>'P01'}], 'notes'=>[{'id'=>'12345678-1234-4234-8234-123456789012','pieceId'=>'1/11','anchor'=>[0,0,0],'position'=>[718,32],'text'=>'No alterar esta nota'}]}] }
    @model.set_attribute('PlanosSanto','guide_v1',JSON.generate(guide));@manager.apply(data)
    updated=PlanosSanto::GuideStore.new(@model).read
    expected=Marshal.load(Marshal.dump(guide));expected['revision']=3;expected['furniture'][0]['pieces'][0]['name']='BM - Lateral - Blanco'
    assert_equal expected,updated
    @model.undo;assert_equal guide,PlanosSanto::GuideStore.new(@model).read
  end
  def test_empty_mixed_corrupt_metadata_and_bad_inputs_fail_without_writes
    @root.entities.clear;p=preview;assert p['blocked'];assert_equal 0,p['pieceCount']
    @model=NamesFixture.model;@manager=PlanosSanto::NameManager.new(@model);@root=@model.entities[0]
    @root.entities << Fixture.board_definition.entities[0];assert preview['blocked'];@root.entities.pop
    p=preview;payload=data(p);payload['prefix']='';assert_raises(PlanosSanto::ExportError) { @manager.apply(payload) }
    payload=data(p);payload['bases']['1/11']='X'*80;assert_raises(PlanosSanto::ExportError) { @manager.apply(payload) }
    @root.set_attribute(PlanosSanto::NameManager::DICT,PlanosSanto::NameManager::ROOT_KEY,'{broken')
    assert preview['blocked'];assert_empty @model.operations
  end
  def test_external_piece_name_edit_is_preserved_as_a_new_base
    @manager.apply(data);@root.name='M08 - Alacena Superior'
    assert_equal 'M08',preview['prefix']
    @left.name='Nombre externo - Blanco'
    p=preview;assert_equal 'Nombre externo - Blanco',p['rows'][0]['base'];refute_empty p['warnings']
    @manager.apply(data(p,prefix:'OT'));assert_equal 'OT - Nombre externo - Blanco',@left.name
  end
end
