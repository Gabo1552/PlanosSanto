# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../names'
require_relative '../session'

class SharedOccurrencesTest < Minitest::Test
  def setup
    @leaf=Sketchup::ComponentInstance.new(44976,'Lateral',Fixture.board_definition)
    shared=Sketchup::Definition.new('Cajón compartido','shared-drawer',[@leaf])
    @drawers=[46072,45079,45078,45921,46071,45922].each_with_index.map { |id,i| Sketchup::ComponentInstance.new(id,'Cajón',shared,Geom::Transformation.translation(i*30,0,0)) }
    root=Sketchup::Group.new(62228,'M15 Guardado bajo',Sketchup::Definition.new('Mueble','cabinet-shared',@drawers))
    @model=NamingModelDouble.new(Sketchup::Model.new([root],'shared-occurrences-synthetic','Modelo sintético',''))
    @manager=PlanosSanto::NameManager.new(@model)
    @paths=@drawers.map { |d| "62228/#{d.persistent_id}/44976" }
  end
  def edits
    [{'id'=>'62228','explosion'=>0.45,'zoom'=>1,'notes'=>[],
      'naming'=>{'moduleCode'=>'M15','bases'=>@paths.map { |id| {'id'=>id,'base'=>'Lateral'} }},
      'pieces'=>@paths.each_with_index.map { |id,i| {'id'=>id,'name'=>'VF M15 Lateral','code'=>"P#{(i+1).to_s.rjust(2,'0')}"} }}]
  end
  def session
    result=PlanosSanto::NativeSession.new(@model);result.scan;result.generate(['62228']);result
  end
  def test_six_occurrences_inside_one_furniture_save_once_and_export_afterwards
    model_state=@model.all_instances.map { |e| [e.persistent_id,e.definition.guid,e.transformation.to_a,e.definition.name] }
    s=session;changes=edits
    result=s.save(changes,0,sync_names:true,work_code:'VF')
    assert_equal 'VF M15 Lateral',@leaf.name
    assert_equal 6,result['furniture'][0]['pieces'].size
    assert_equal @paths,result['furniture'][0]['pieces'].map { |p| p['id'] }
    assert s.validate_export(changes)
    assert_equal model_state,@model.all_instances.map { |e| [e.persistent_id,e.definition.guid,e.transformation.to_a,e.definition.name] }
    assert_equal 1,@model.undo_states.length
    @model.undo;assert_equal 'Lateral',@leaf.name
  end
  def test_conflicting_occurrence_names_fail_before_any_model_write
    changes=edits;changes[0]['pieces'][1]['name']='VF M15 Otra';changes[0]['naming']['bases'][1]['base']='Otra'
    error=assert_raises(PlanosSanto::ExportError) { session.save(changes,0,sync_names:true,work_code:'VF') }
    assert_match(/nombres distintos/,error.message);assert_match(/solo en la guía/,error.message)
    assert_equal 'Lateral',@leaf.name;assert_empty @model.operations
  end
  def test_unselected_shared_occurrence_remains_protected_but_guide_only_save_is_allowed
    @model.entities << Sketchup::Group.new(70000,'Otro mueble',Sketchup::Definition.new('Otro','other-container',[
      Sketchup::ComponentInstance.new(70001,'Cajón externo',@drawers[0].definition)]))
    s=session
    assert_match(/Incluí todas/,assert_raises(PlanosSanto::ExportError) { s.save(edits,0,sync_names:true,work_code:'VF') }.message)
    assert_empty @model.operations
    result=s.save(edits,0,sync_names:false,work_code:'VF')
    assert_equal 6,result['furniture'][0]['pieces'].size
    assert_equal 'Lateral',@leaf.name
  end
  def test_locked_ancestor_of_any_occurrence_blocks_entire_batch
    @drawers.last.locked_for_names=true
    assert_match(/bloqueado/,assert_raises(PlanosSanto::ExportError) { session.save(edits,0,sync_names:true,work_code:'VF') }.message)
    assert_empty @model.operations;assert_equal 'Lateral',@leaf.name
  end
  def test_legacy_preview_allows_full_coverage_and_rejects_conflicting_bases
    preview=@manager.preview('62228');refute preview['blocked']
    data={'token'=>preview['token'],'name'=>preview['name'],'prefix'=>'M15','bases'=>@paths.to_h { |id| [id,'Lateral'] }}
    result=@manager.apply(data);assert_equal 'M15 - Lateral',@leaf.name;assert_equal 1,@model.undo_states.length
    assert_equal 2,result['changed'] # root metadata + one shared entity, never six writes
    preview=result['preview'];data['token']=preview['token'];data['bases'][@paths.last]='Otra'
    assert_match(/nombres distintos/,assert_raises(PlanosSanto::ExportError) { @manager.apply(data) }.message)
  end
  def test_all_selected_furniture_with_matching_names_can_share_nested_entities
    second=Sketchup::Group.new(80000,'M15 Copia',@model.entities[0].definition,Geom::Transformation.translation(300,0,0))
    @model.entities << second
    s=PlanosSanto::NativeSession.new(@model);s.scan;s.generate(['62228','80000'])
    both=edits
    copy=Marshal.load(Marshal.dump(both[0]));copy['id']='80000'
    copy['pieces'].each { |piece| piece['id']=piece['id'].sub('62228/','80000/') }
    copy['naming']['bases'].each { |base| base['id']=base['id'].sub('62228/','80000/') }
    both << copy
    saved=s.save(both,0,sync_names:true,work_code:'VF')
    assert_equal 2,saved['furniture'].size;assert_equal 'VF M15 Lateral',@leaf.name
    assert s.validate_export(both);assert_equal 1,@model.undo_states.length
  end
  def test_unplaced_definition_references_remain_protected_despite_six_expanded_paths
    definition=@drawers.first.definition
    unplaced=Sketchup::ComponentInstance.new(99999,'Referencia sin colocar',definition)
    known=@drawers
    definition.define_singleton_method(:instances) { known+[unplaced] }
    assert_match(/definición compartida/,assert_raises(PlanosSanto::ExportError) { session.save(edits,0,sync_names:true,work_code:'VF') }.message)
    assert_empty @model.operations
  end
  def test_partial_write_failure_rolls_back_guide_and_shared_entity_name
    @leaf.fail_meta_write=true
    assert_raises(IOError) { session.save(edits,0,sync_names:true,work_code:'VF') }
    assert_equal 'Lateral',@leaf.name;assert_empty @leaf.names_attributes;assert_empty @model.attributes
    assert_equal :abort,@model.operations.last[0]
  end
end
