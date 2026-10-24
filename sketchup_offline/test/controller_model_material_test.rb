# frozen_string_literal: true
# OfflineController integration with Ruby API doubles. Never runs SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative 'photo_material_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :model_catalog_fixture;end
  def self.active_model;model_catalog_fixture;end
end
require_relative '../build/planos_santo/offline'

class ControllerModelMaterialTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];PhotoFixture.decorate(@model)
    @material=@model.materials.add('Material del modelo QA')
    {'type'=>2,'std_thicknesses'=>'15mm;18mm','std_sizes'=>'2750mm x 1830mm','grained'=>true,'keep'=>'original'}.each { |key,value| @material.set_attribute('ladb_opencutlist',key,value) }
    Sketchup.model_catalog_fixture=@model;Sketchup::ImageRep.fail_load=false
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @catalog=PlanosSanto::CatalogStore.new(directory:@dir)
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);Sketchup::ImageRep.fail_load=false;end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def preview;dispatch('material_model_preview',{'materialId'=>@material.entityID.to_s});end
  def commit_data(p);p.slice('token','revision','assetRevision','item');end

  def test_preview_and_commit_bridge_use_same_material_and_do_not_paint
    before=Marshal.dump(@model.state);ocl=@material.attributes.dup
    p=preview
    assert_equal 'sheet',p['item']['kind'];assert_equal [15,18],p['item']['thicknessesMm'];assert_equal before,Marshal.dump(@model.state)
    assert_empty @model.operations;assert_empty @catalog.read['items']
    p['item']['name']='Ficha QA';p['item']['sku']='QA-LOCAL'
    result=dispatch('material_model_commit',commit_data(p))
    assert result['created'];assert result['stale'];assert_equal 1,@model.materials.length
    assert_same @material,@model.materials.first;assert_equal before,Marshal.dump(@model.state)
    assert_equal 'Material del modelo QA',@material.name;assert_equal 0,@material.color_writes
    ocl.each { |key,value| assert_equal value,@material.attributes[key] }
    assert_equal result['catalogId'],@catalog.read['items'][0]['id']
    assert_equal 'Ficha QA',@catalog.read['items'][0]['name']
    assert_equal result['catalogId'],preview['existingCatalogId']
  end

  def test_unsaved_guide_or_catalog_blocks_commit_but_allows_readonly_preview
    %i[@dirty @workshop_dirty].each do |flag|
      @controller.instance_variable_set(flag,true);p=preview
      assert p['token'];assert_raises(PlanosSanto::ExportError) { dispatch('material_model_commit',commit_data(p)) }
      @controller.instance_variable_set(flag,false)
    end
    assert_empty @catalog.read['items'];assert_empty @model.operations
  end

  def test_active_model_change_blocks_pending_commit_and_cancel_releases_token
    p=preview;old_service=@controller.instance_variable_get(:@model_material_catalog)
    Sketchup.model_catalog_fixture=NamesFixture.model
    assert_raises(PlanosSanto::ExportError) { dispatch('material_model_commit',commit_data(p)) }
    assert_raises(PlanosSanto::ExportError,'service guard also rejects direct stale use') { old_service.commit(commit_data(p)) }
    assert dispatch('material_model_cancel',{'token'=>p['token']})['cancelled']
    Sketchup.model_catalog_fixture=@model
    assert_raises(PlanosSanto::ExportError) { dispatch('material_model_commit',commit_data(p)) }
    assert_empty @catalog.read['items'];assert_empty @model.operations
  end

  def test_cancel_wrong_token_does_not_cancel_newer_preview
    first=preview;second=preview
    dispatch('material_model_cancel',{'token'=>first['token']})
    result=dispatch('material_model_commit',commit_data(second))
    assert result['created'];assert_equal 1,@catalog.read['items'].length
  end

  def test_handle_returns_request_identity_and_reports_invalid_preview_without_writes
    scripts=[];dialog=Object.new;dialog.define_singleton_method(:execute_script) { |script| scripts << script }
    @controller.instance_variable_set(:@dialog,dialog)
    @controller.handle(JSON.generate('version'=>1,'id'=>'model-preview-qa','action'=>'material_model_preview','data'=>{'materialId'=>@material.entityID.to_s}))
    prefix='window.PlanosSantoBridge.receive(JSON.parse('
    messages=scripts.select { |script| script.start_with?(prefix) }.map { |script| JSON.parse(JSON.parse(script.delete_prefix(prefix).delete_suffix('))'))) }
    assert_equal 'model-preview-qa',messages.last['id'];assert_nil messages.last['error'];assert messages.last.dig('result','token')
    @controller.handle(JSON.generate('version'=>1,'id'=>'missing-qa','action'=>'material_model_preview','data'=>{'materialId'=>'missing'}))
    message=JSON.parse(JSON.parse(scripts.last.delete_prefix(prefix).delete_suffix('))')))
    assert_equal 'missing-qa',message['id'];assert_match(/no está/,message['error'])
    assert_empty @model.operations;assert_empty @catalog.read['items']
  end
end
