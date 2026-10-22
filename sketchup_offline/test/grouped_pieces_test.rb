# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
class GroupedPiecesTest < Minitest::Test
  def setup
    @model=NamesFixture.model
    regenerate
    @edits=[{'id'=>'1','groupIdentical'=>true,'explosion'=>0.45,'zoom'=>1,'notes'=>[],
      'naming'=>{'moduleCode'=>'M01','bases'=>[{'id'=>'1/11','base'=>'PT'},{'id'=>'1/13/12','base'=>'PT'}]},
      'pieces'=>[{'id'=>'1/11','name'=>'VF M01 PT','code'=>'P01'},{'id'=>'1/13/12','name'=>'VF M01 PT','code'=>'P02'}]}]
  end
  def regenerate
    @session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
    @store=PlanosSanto::GuideStore.new(@model)
  end
  def save;@session.save(@edits,@store.read['revision'],sync_names:true,work_code:'VF');end
  def test_shared_name_writes_all_instances_atomically_and_preserves_physical_ids_and_other_furniture
    geometry=@model.all_instances.map { |e| [e.definition.name,e.transformation.to_a,e.definition.entities.grep(Sketchup::Face).map { |f| f.mesh(0).points.map(&:to_a) }] }
    saved=save
    assert saved['furniture'][0]['groupIdentical'];assert_equal %w[P01 P02],saved['furniture'][0]['pieces'].map { |p| p['code'] }
    assert_equal 'VF M01 PT',@model.entities[0].entities[0].name
    assert_equal 'VF M01 PT',@model.entities[0].entities[1].entities[0].name
    assert_equal 'Base ajena',@model.entities[1].entities[0].name
    assert_equal geometry,@model.all_instances.map { |e| [e.definition.name,e.transformation.to_a,e.definition.entities.grep(Sketchup::Face).map { |f| f.mesh(0).points.map(&:to_a) }] }
    assert_equal 1,@model.undo_states.length;assert @session.validate_export(@edits)
    @model.undo;assert_equal 'Lateral - Blanco',@model.entities[0].entities[0].name;assert_equal 0,@store.read['revision']
  end
  def test_grouping_and_note_target_survive_serialized_model_reopen_and_opt_out
    note={'id'=>'12345678-1234-4234-8234-123456789012','pieceId'=>'1/13/12','anchor'=>[0,0,0],'position'=>[718,32],'text'=>'Solo esta instancia'}
    @edits[0]['notes']=[note];save
    reopened=Marshal.load(Marshal.dump(@model));session=PlanosSanto::NativeSession.new(reopened);session.scan
    assert_equal true,session.generate(['1'])['guide']['furniture'][0]['groupIdentical']
    assert_equal note,PlanosSanto::GuideStore.new(reopened).read['furniture'][0]['notes'][0]
    @edits[0]['groupIdentical']=false;saved=save
    refute saved['furniture'][0]['groupIdentical'];assert_equal %w[P01 P02],saved['furniture'][0]['pieces'].map { |p| p['code'] };assert_equal note,saved['furniture'][0]['notes'][0]
  end
  def test_grouping_only_preserves_rotated_equal_instances_names_bases_metadata_and_undo
    first=@model.entities[0].entities[0]
    second=@model.entities[0].entities[1].entities[0]
    first.name='Lateral izquierdo';second.name='Lateral derecho'
    second.transformation=Geom::Transformation.translation(100,30,0)*Geom::Transformation.rotation_z(Math::PI/3)
    regenerate
    @edits[0]['naming']={'moduleCode'=>'','bases'=>[
      {'id'=>'1/11','base'=>first.name},{'id'=>'1/13/12','base'=>second.name}]}
    @edits[0]['pieces'].each_with_index { |row,i| row['name']=[first,second][i].name }
    before=@model.state
    geometry=@model.all_instances.map { |e| [e.definition.guid,e.transformation.to_a] }
    saved=@session.save(@edits,0,sync_names:true,work_code:'')
    assert saved['furniture'][0]['groupIdentical']
    assert_equal ['Lateral izquierdo','Lateral derecho'],saved['furniture'][0]['pieces'].map { |p| p['name'] }
    assert_equal @edits[0]['naming'],saved['furniture'][0]['naming']
    assert_equal before[:entities],@model.state[:entities], 'Grouping must not write instance names or naming metadata'
    assert_equal geometry,@model.all_instances.map { |e| [e.definition.guid,e.transformation.to_a] }
    assert @session.validate_export(@edits)
    reopened=Marshal.load(Marshal.dump(@model))
    restored=PlanosSanto::GuideStore.new(reopened).read
    assert_equal saved,restored
    session=PlanosSanto::NativeSession.new(reopened);session.scan
    assert_equal saved['furniture'],session.generate(['1'])['guide']['furniture']
    assert_equal ['Lateral izquierdo','Lateral derecho'],[reopened.entities[0].entities[0].name,reopened.entities[0].entities[1].entities[0].name]
    @model.undo
    assert_equal before,@model.state
    assert_equal 0,@store.read['revision']
  end
  def test_grouping_preserves_previously_synced_original_names_and_distinct_bases
    @edits[0]['groupIdentical']=false
    @edits[0]['naming']['bases'][1]['base']='Otra'
    @edits[0]['pieces'][1]['name']='VF M01 Otra'
    save
    before=@model.state[:entities]
    @edits[0]['groupIdentical']=true
    saved=save
    assert_equal ['PT','Otra'],saved['furniture'][0]['naming']['bases'].map { |p| p['base'] }
    assert_equal before,@model.state[:entities]
    assert_equal ['Lateral - Blanco','Base'],[@model.entities[0].entities[0],@model.entities[0].entities[1].entities[0]].map { |e| JSON.parse(e.get_attribute(PlanosSanto::NameManager::DICT,PlanosSanto::NameManager::PIECE_KEY))['originalName'] }
    @model.undo
    refute @store.read['furniture'][0]['groupIdentical']
    assert_equal before,@model.state[:entities]
  end
  def test_non_equivalent_definitions_materials_scales_or_mirrors_allow_independent_names
    changes=[
      ->(piece){piece.definition=Marshal.load(Marshal.dump(piece.definition));piece.definition.guid='another-definition'},
      ->(piece){piece.material=Sketchup::Material.new(99,'Otro',Sketchup::Color.new(100,80,60),1.0,nil)},
      ->(piece){piece.transformation=Geom::Transformation.scale(2,1,1)},
      ->(piece){piece.transformation=Geom::Transformation.scale(-1,1,1)}
    ]
    changes.each do |change|
      setup;change.call(@model.entities[0].entities[1].entities[0]);regenerate
      @edits[0]['pieces'][1]['name']='VF M01 Distinta';@edits[0]['naming']['bases'][1]['base']='Distinta'
      assert_equal 'VF M01 Distinta',save['furniture'][0]['pieces'][1]['name']
    end
  end
  # Punto 20: a locked member keeps its name with a row notice; the guide and
  # the other names are saved in one operation. A failed write still aborts all.
  def test_locked_member_is_skipped_and_failed_write_leaves_entire_group_unchanged
    piece=@model.entities[0].entities[1].entities[0];piece.locked_for_names=true
    saved=save;assert_equal 1,saved['revision'];assert_equal 1,@model.undo_states.length
    assert_equal ['1/13/12'],@session.skipped_names.map { |row| row['id'] };assert_match(/bloqueado/,@session.skipped_names[0]['reason'])
    assert_equal 'Base',piece.name;assert_equal 'VF M01 PT',@model.entities[0].entities[0].name
    @model.undo;assert_equal 'Lateral - Blanco',@model.entities[0].entities[0].name;regenerate
    piece.locked_for_names=false;piece.fail_name_write=true
    assert_raises(IOError){save};assert_equal 'Lateral - Blanco',@model.entities[0].entities[0].name
    assert_equal 'Base',piece.name;assert_empty @model.attributes;assert_equal :abort,@model.operations.last[0]
  end
  def test_strict_boolean_name_base_consistency_and_unique_immutable_physical_codes_are_still_required
    @edits[0]['groupIdentical']='true';assert_raises(PlanosSanto::ExportError){save}
    @edits[0]['groupIdentical']=true;@edits[0]['naming']['bases'][1]['base']='Otra';assert_match(/no coincide/,assert_raises(PlanosSanto::ExportError){save}.message)
    @edits[0]['naming']['bases'][1]['base']='PT';@edits[0]['pieces'][1]['code']='P01';assert_raises(PlanosSanto::ExportError){save}
    @edits[0]['pieces'][1]['code']='P02';save
    @edits[0].delete('groupIdentical');assert_equal true,save['furniture'][0]['groupIdentical']
    @edits[0]['pieces'][1]['code']='P03';assert_raises(PlanosSanto::ExportError){save}
    assert_equal 2,@store.read['revision']
  end
  def test_grouping_does_not_bypass_shared_parent_guard
    @model.entities << Sketchup::ComponentInstance.new(3,'Otra ocurrencia',@model.entities[0].definition)
    regenerate;save
    assert_equal %w[1/11 1/13/12],@session.skipped_names.map { |row| row['id'] }.sort,'Las piezas del mueble compartido no se renombran.'
    assert_equal 'Lateral - Blanco',@model.entities[0].entities[0].name;assert_equal 'Base',@model.entities[0].entities[1].entities[0].name
    assert_equal 'VF M01 PT',@store.read['furniture'][0]['pieces'][0]['name'],'La guía guarda el nombre igual.'
  end

end
