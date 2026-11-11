# frozen_string_literal: true
# 0.8.31 «Materiales del proyecto»: the list of fichas chosen for ONE SKP, stored
# in the model with API doubles only (never a real .skp, never SketchUp itself).
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :project_model;end
  def self.active_model;project_model;end
end
require_relative '../build/planos_santo/offline'

class ProjectMaterialsStoreTest < Minitest::Test
  DICT=PlanosSanto::ProjectMaterials::DICTIONARY
  KEY=PlanosSanto::ProjectMaterials::KEY
  def setup
    @model=NamesFixture.model
    @store=PlanosSanto::ProjectMaterials.new(@model)
    @ids=%w[aaaaaaaa-0000-4000-8000-000000000001 aaaaaaaa-0000-4000-8000-000000000002 aaaaaaaa-0000-4000-8000-000000000003]
  end

  def test_model_without_attribute_reads_an_empty_list_and_writes_nothing
    assert_equal({'ids'=>[],'status'=>'empty'},@store.read(@ids))
    assert_equal({'schema'=>1,'ids'=>[],'status'=>'empty'},@store.payload(@ids))
    assert_empty @model.operations
    assert_nil @model.get_attribute(DICT,KEY)
  end

  def test_add_and_remove_are_one_named_operation_each_and_undo_restores_the_previous_list
    result=@store.change(add:[@ids[0],@ids[1]],remove:[],existing:@ids)
    assert_equal 2,result['changed']
    assert_equal [@ids[0],@ids[1]],result['projectMaterials']['ids']
    assert_equal [[:start,'Materiales del proyecto Planos Santo',true],[:commit]],@model.operations
    assert_equal({'schema'=>1,'ids'=>[@ids[0],@ids[1]]},JSON.parse(@model.get_attribute(DICT,KEY)))
    @store.change(add:[],remove:[@ids[0]],existing:@ids)
    assert_equal [@ids[1]],@store.read(@ids)['ids']
    assert_equal 2,@model.operations.count { |entry| entry.first==:start }
    @model.undo
    assert_equal [@ids[0],@ids[1]],@store.read(@ids)['ids'],'Ctrl+Z undoes only the last change'
    @model.undo
    assert_nil @model.get_attribute(DICT,KEY),'the first Ctrl+Z leaves the SKP as it was'
  end

  def test_other_planos_santo_and_opencutlist_attributes_are_never_touched
    @model.set_attribute('PlanosSanto','guide_v1','{"guía":true}')
    @model.set_attribute('ladb_opencutlist','type','2')
    @model.set_attribute('PlanosSantoPedidos','draft_v1','borrador')
    @store.change(add:[@ids[2]],remove:[],existing:@ids)
    assert_equal '{"guía":true}',@model.get_attribute('PlanosSanto','guide_v1')
    assert_equal '2',@model.get_attribute('ladb_opencutlist','type')
    assert_equal 'borrador',@model.get_attribute('PlanosSantoPedidos','draft_v1')
    refute_equal DICT,'PlanosSanto';refute_equal DICT,'ladb_opencutlist'
  end

  def test_ids_no_longer_in_the_library_are_ignored_on_read_and_dropped_on_the_next_write
    @store.change(add:@ids,remove:[],existing:@ids)
    assert_equal [@ids[0],@ids[2]],@store.read([@ids[0],@ids[2]])['ids']
    assert_equal @ids,@store.read(nil)['ids'],'reading never rewrites the SKP'
    result=@store.change(add:[],remove:[],existing:[@ids[0],@ids[2]])
    assert_equal 0,result['changed']
    assert_equal [@ids[0],@ids[2]],JSON.parse(@model.get_attribute(DICT,KEY))['ids'],'a write prunes fichas that left the library'
    assert_raises(PlanosSanto::ExportError) { @store.change(add:['bbbbbbbb-0000-4000-8000-000000000009'],remove:[],existing:@ids) }
  end

  def test_no_change_opens_no_operation
    @store.change(add:[@ids[0]],remove:[],existing:@ids)
    before=@model.operations.length
    result=@store.change(add:[@ids[0]],remove:[@ids[1]],existing:@ids)
    assert_equal true,result['noChanges']
    assert_equal before,@model.operations.length
  end

  def test_damaged_or_foreign_shapes_read_as_empty_without_raising
    ['no es json','[1,2]','{"schema":1,"ids":"x"}','{"schema":1,"ids":[1,"../x",null]}','{"ids":["a"]}',{'schema'=>1},'x'*(70*1024)].each do |raw|
      @model.set_attribute(DICT,KEY,raw)
      read=@store.read(@ids)
      assert_equal [],read['ids'],raw.to_s[0,40]
    end
    @model.set_attribute(DICT,KEY,'{"schema":1,"ids":[1,"../x",null,"'+@ids[0]+'","'+@ids[0]+'"]}')
    assert_equal [@ids[0]],@store.read(@ids)['ids'],'only valid, unique ids survive'
    @model.set_attribute(DICT,KEY,'roto')
    @store.change(add:[@ids[1]],remove:[],existing:@ids)
    assert_equal [@ids[1]],@store.read(@ids)['ids'],'an explicit choice replaces a damaged list (Ctrl+Z brings it back)'
  end

  def test_a_newer_schema_is_never_overwritten
    @model.set_attribute(DICT,KEY,'{"schema":2,"ids":["x"],"extra":{}}')
    assert_equal({'ids'=>[],'status'=>'newer'},@store.read(@ids))
    assert_raises(PlanosSanto::ExportError) { @store.change(add:[@ids[0]],remove:[],existing:@ids) }
    assert_equal '{"schema":2,"ids":["x"],"extra":{}}',@model.get_attribute(DICT,KEY)
    assert_empty @model.operations
  end

  def test_validates_shape_and_size_of_the_request
    ['texto',[1],[nil],['a b'],['../etc'],['x'*65],{'id'=>'x'}].each do |bad|
      assert_raises(PlanosSanto::ExportError,bad.inspect) { @store.change(add:bad,remove:[],existing:@ids) }
      assert_raises(PlanosSanto::ExportError,bad.inspect) { @store.change(add:[],remove:bad,existing:@ids) }
    end
    many=(1..501).map { |index| format('cccccccc-0000-4000-8000-%012d',index) }
    assert_raises(PlanosSanto::ExportError) { @store.change(add:many,remove:[],existing:many) }
    @store.change(add:many.first(500),remove:[],existing:many)
    error=assert_raises(PlanosSanto::ExportError) { @store.change(add:[many.last],remove:[],existing:many) }
    assert_match(/hasta 500/,error.message)
    assert_equal 500,@store.read(many)['ids'].length
  end

  def test_a_failed_write_aborts_the_operation
    @model.fail_write=true
    assert_raises(IOError) { @store.change(add:[@ids[0]],remove:[],existing:@ids) }
    assert_equal :abort,@model.operations.last.first
    @model.fail_write=false
    assert_nil @model.get_attribute(DICT,KEY)
  end
end

class ProjectMaterialsControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];Sketchup.project_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @catalog=PlanosSanto::CatalogStore.new(directory:@dir)
    @sheet=@catalog.new_item('Roble proyecto QA','sheet');@edge=@catalog.new_item('Canto proyecto QA','edge')
    @catalog.save([@sheet,@edge],0)
    @notices=[];notices=@notices
    @controller.define_singleton_method(:notify_material_library_changed) { |action| notices << action }
  end
  def teardown
    ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir)
  end
  def dispatch(action,data={});@controller.dispatch(action,data);end

  def test_palette_and_library_receive_the_saved_list_validated_against_the_library
    assert_equal({'schema'=>1,'ids'=>[],'status'=>'empty'},dispatch('smart_palette_load')['projectMaterials'])
    result=dispatch('project_materials_set','add'=>[@sheet['id']])
    assert_equal [@sheet['id']],result['projectMaterials']['ids']
    assert_equal %w[project_materials_set],@notices,'both windows reread their list'
    assert_equal [@sheet['id']],dispatch('smart_palette_load')['projectMaterials']['ids']
    assert_equal [@sheet['id']],dispatch('skm_library')['projectMaterials']['ids']
    assert_equal [@sheet['id']],dispatch('project_materials')['projectMaterials']['ids']
    @catalog.save([@edge],1)
    assert_equal [],dispatch('smart_palette_load')['projectMaterials']['ids'],'a ficha removed from the library is ignored'
  end

  def test_set_rejects_unknown_fields_and_keeps_an_active_brush
    @controller.instance_variable_set(:@smart_state,{'active'=>true,'mode'=>'sheet'})
    assert_raises(PlanosSanto::ExportError) { dispatch('project_materials_set','add'=>[@sheet['id']],'ids'=>[]) }
    assert_raises(PlanosSanto::ExportError) { dispatch('project_materials_set','add'=>'todo') }
    dispatch('project_materials_set','add'=>[@edge['id']])
    assert_equal true,@controller.send(:smart_state)['active'],'choosing project materials never stops painting'
    unchanged=dispatch('project_materials_set','add'=>[@edge['id']])
    assert_equal true,unchanged['noChanges']
    assert_equal %w[project_materials_set],@notices,'no notice without a change'
  end

  def test_undo_in_sketchup_makes_both_windows_reread_the_list
    dispatch('project_materials_set','add'=>[@sheet['id']])
    @notices.clear
    @controller.send(:model_watch_changed,['selection'])
    @controller.send(:model_watch_changed,['model'])
    assert_empty @notices,'an unrelated transaction does not reload the list'
    @model.undo
    @controller.send(:model_watch_changed,['model'])
    assert_equal %w[project_materials],@notices
    assert_equal [],dispatch('smart_palette_load')['projectMaterials']['ids']
  end
end
