# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :photo_model;end
  def self.active_model;photo_model;end
end
module UI
  class << self;attr_accessor :photo_path,:photo_choosers;end
  def self.openpanel(*args);(self.photo_choosers||=[]) << args;photo_path;end
end
require_relative '../build/planos_santo/offline'
class PhotoControllerServiceDouble
  attr_reader :calls
  def initialize;@calls=[];end
  def pick(path);@calls << [:pick,path];{'token'=>'native-choice','revision'=>0,'sourceHash'=>'a'*64};end
  def create(token,data);@calls << [:create,token,data];{'catalogId'=>'photo-candidate','designReady'=>true};end
  def thumbnails;{'photo-candidate'=>'data:image/png;base64,AAA='};end
end
class PhotoControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];Sketchup.photo_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @service=PhotoControllerServiceDouble.new;@controller.instance_variable_set(:@photo_material,@service)
    UI.photo_path='/synthetic/Foto á.png';UI.photo_choosers=[]
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def test_only_native_picker_selects_the_file_and_preview_does_not_modify_model
    before=Marshal.dump(@model.state)
    result=dispatch('material_photo_pick',{'path'=>'/untrusted/javascript.png','url'=>'https://example.invalid'})
    assert_equal 'native-choice',result['token'];assert_equal [[:pick,UI.photo_path]],@service.calls
    assert_equal before,Marshal.dump(@model.state);assert_empty @model.operations
    assert_match(/JPG.*PNG/,UI.photo_choosers.first.first)
    assert_match(/vista previa/,@controller.quick_block_reason('materials'))
  end
  def test_picker_cancellation_never_enters_native_material_creation
    UI.photo_path=nil
    assert dispatch('material_photo_pick')['cancelled'];assert_empty @service.calls;assert_empty @model.operations
  end
  def test_picker_pauses_timeout_only_while_user_chooses_a_path
    scripts=[];dialog=Object.new;dialog.define_singleton_method(:execute_script) { |script| scripts << script }
    @controller.instance_variable_set(:@dialog,dialog)
    @controller.handle(JSON.generate('version'=>1,'id'=>'photo-slow-choice','action'=>'material_photo_pick'))
    messages=scripts.map { |script| JSON.parse(JSON.parse(script.delete_prefix('window.PlanosSantoBridge.receive(JSON.parse(').delete_suffix('))'))) }
    assert_equal ['waiting_user','working',nil],messages.map { |m| m['phase'] }
    assert_equal ['photo-slow-choice'],messages.map { |m| m['id'] }.uniq
    assert_nil messages.last['error'];assert_equal 'native-choice',messages.last['result']['token']
  end
  def test_unsaved_names_or_order_block_picking_before_dialog_opens
    %i[@dirty @workshop_dirty].each do |flag|
      @controller.instance_variable_set(flag,true)
      assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_pick') }
      @controller.instance_variable_set(flag,false)
    end
    assert_empty UI.photo_choosers;assert_empty @service.calls
  end
  def test_create_requires_local_token_and_refreshes_existing_scan_without_names_or_geometry_writes
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_create',{'token'=>'forged'}) }
    dispatch('material_photo_pick')
    data={'token'=>'native-choice','revision'=>0,'action'=>'new','name'=>'Foto QA','kind'=>'sheet','confirmed'=>true}
    result=dispatch('material_photo_create',data)
    assert_equal [:create,'native-choice',data.reject { |key,_| key=='token' }],@service.calls.last
    assert result['stale'];refute result.key?('scan');assert result['library'];assert_equal 'photo-candidate',result['catalogId']
    refute @controller.instance_variable_get(:@photo_preview_active)
    assert_empty @model.operations
  end
  def test_cancel_after_model_change_releases_token_and_readonly_preview
    dispatch('material_photo_pick');Sketchup.photo_model=NamesFixture.model
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_create',{'token'=>'native-choice'}) }
    assert dispatch('material_photo_cancel')['cancelled'];assert_nil @controller.instance_variable_get(:@photo_material)
    refute @controller.instance_variable_get(:@photo_preview_active);assert_empty @model.operations
  end
  def test_active_paint_blocks_material_creation_and_preview_until_stopped
    @controller.instance_variable_set(:@smart_state,{'active'=>true,'mode'=>'sheet'})
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_pick') }
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_create',{}) }
    assert_empty @service.calls
  end
  def test_optional_modes_are_strict_and_do_not_persist_shared_permissions
    base={'confirmed'=>true,'mode'=>'edge','axes'=>[0,1],'side'=>'front','scope'=>'unique'}
    assert_equal 4,@controller.validate_smart_options(base.merge('edgeCount'=>4))['edgeCount']
    assert_raises(PlanosSanto::ExportError) { @controller.validate_smart_options(base.merge('edgeCount'=>3)) }
    assert_raises(PlanosSanto::ExportError) { @controller.validate_smart_options(base.merge('paintScope'=>'all')) }
    refute_includes PlanosSanto::OfflineController::SMART_SETTING_KEYS,'allowShared'
    refute_includes PlanosSanto::OfflineController::SMART_SETTING_KEYS,'materialUuid'
  end
  def test_photo_cards_include_real_service_thumbnail_without_granting_permission_from_metadata
    catalog=PlanosSanto::CatalogStore.new(directory:@dir)
    item=catalog.new_item('Foto QA','sheet',{'photo'=>{'schema'=>1,'designReady'=>true}})
    @service.define_singleton_method(:thumbnails) { {item['id']=>'data:image/png;base64,AAA='} }
    catalog.save([item],0)
    result=dispatch('skm_library')
    row=result['rows'].find { |record| record['catalogId']==item['id'] }
    assert row;assert_equal 'data:image/png;base64,AAA=',row['thumbnail']
    assert_equal false,row['designReady'];refute result['catalog']['items'][0]['approved']
    assert_empty @model.operations
  end
  def test_install_refuses_missing_confirmation_and_unverified_non_photo_catalog_items
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_install',{'catalogId'=>'forged','path'=>'/arbitrary.skm'}) }
    assert_raises(PlanosSanto::ExportError) { dispatch('material_photo_install',{'catalogId'=>'forged','revision'=>0,'confirmed'=>true,'path'=>'/arbitrary.skm'}) }
    assert_empty @model.operations;assert_empty @model.materials
  end

end
