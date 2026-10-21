# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :skm_model;end
  def self.active_model;skm_model;end
end
module UI
  class << self;attr_accessor :skm_path,:choosers;end
  def self.openpanel(*args);(self.choosers||=[]) << args;skm_path;end
  def self.select_directory(**args);(self.choosers||=[]) << args;skm_path;end
end
require_relative '../build/planos_santo/offline'
class SkmControllerImportDouble
  attr_reader :calls
  def initialize(catalog);@catalog=catalog;@calls=[];end
  def preview(path,source:);@calls << [:preview,path,source];{'token'=>'qa-token','revision'=>0,'rows'=>[]};end
  def commit(*args,**options);@calls << [:commit,args,options];{'imported'=>35,'skipped'=>0,'catalog'=>@catalog.read};end
  def status;@calls << [:status];{'catalog'=>@catalog.read,'rows'=>[{'catalogId'=>'qa','thumbnail'=>'data:image/png;base64,AAA='}]};end
  def asset_path(id);@calls << [:asset_path,id];'/synthetic/material.skm';end
end
class SkmControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];Sketchup.skm_model=@model;@selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @importer=SkmControllerImportDouble.new(PlanosSanto::CatalogStore.new(directory:@dir));@controller.instance_variable_set(:@skm_import,@importer)
    UI.skm_path='/synthetic/library.zip';UI.choosers=[]
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def test_preview_uses_native_chooser_and_cancelling_never_calls_importer
    UI.skm_path=nil
    assert dispatch('skm_preview',{'source'=>'zip'})['cancelled'];assert_empty @importer.calls
    UI.skm_path='/synthetic/library.zip'
    assert_equal 'qa-token',dispatch('skm_preview',{'source'=>'zip'})['token']
    assert_equal [:preview,'/synthetic/library.zip','zip'],@importer.calls.last
    assert_empty @model.operations
  end
  def test_folder_and_single_skm_route_to_the_same_bulk_service
    dispatch('skm_preview',{'source'=>'folder'});assert_equal 'folder',@importer.calls.last.last
    UI.skm_path='/synthetic/one.skm';dispatch('skm_preview',{'source'=>'file'})
    assert_equal [:preview,'/synthetic/one.skm','files'],@importer.calls.last
    assert_raises(PlanosSanto::ExportError) { dispatch('skm_preview',{'source'=>'url'}) }
    assert_equal 2,UI.choosers.length
  end
  def test_preview_refuses_unsaved_context_and_model_change_before_choosing
    %i[@dirty @workshop_dirty].each do |flag|
      @controller.instance_variable_set(flag,true)
      assert_raises(PlanosSanto::ExportError) { dispatch('skm_preview',{'source'=>'zip'}) }
      @controller.instance_variable_set(flag,false)
    end
    Sketchup.skm_model=NamesFixture.model
    assert_raises(PlanosSanto::ExportError) { dispatch('skm_preview',{'source'=>'zip'}) }
    assert_empty UI.choosers;assert_empty @importer.calls
  end
  def test_preview_pause_resume_protocol_keeps_original_request_identity
    scripts=[];dialog=Object.new;dialog.define_singleton_method(:execute_script) { |script| scripts << script }
    @controller.instance_variable_set(:@dialog,dialog)
    @controller.handle(JSON.generate('version'=>1,'id'=>'skm-choice','action'=>'skm_preview','data'=>{'source'=>'zip'}))
    messages=scripts.map { |script| JSON.parse(JSON.parse(script.delete_prefix('window.PlanosSantoBridge.receive(JSON.parse(').delete_suffix('))'))) }
    assert_equal ['waiting_user','working',nil],messages.map { |m| m['phase'] }
    assert_equal ['skm-choice'],messages.map { |m| m['id'] }.uniq
    assert_nil messages.last['error'];assert_equal 'qa-token',messages.last['result']['token']
  end
  def test_commit_forwards_explicit_selection_revision_confirmation_and_renames_without_model_writes
    @controller.instance_variable_set(:@workshop_dirty,true)
    before=Marshal.dump(@model.state)
    data={'token'=>'qa-token','selectedIds'=>['1'],'revision'=>0,'confirmed'=>true,'renames'=>{'1'=>'Candidato revisado'}}
    result=dispatch('skm_commit',data)
    call=@importer.calls.find { |entry| entry.first==:commit }
    assert_equal ['qa-token',['1'],0],call[1]
    assert_equal({confirmed:true,renames:{'1'=>'Candidato revisado'}},call[2])
    assert_equal 35,result['imported'];assert result['catalog'];assert result['materials']
    assert_equal before,Marshal.dump(@model.state);assert_empty @selected;assert_empty @model.operations
  end
  def test_cancel_is_available_after_model_change_and_releases_preview_memory
    Sketchup.skm_model=NamesFixture.model
    assert dispatch('skm_cancel')['cancelled'];assert_nil @controller.instance_variable_get(:@skm_import)
    assert_empty @model.operations
  end
  def test_library_and_palette_thumbnails_are_readonly_and_global_not_fake_native_materials
    result=dispatch('skm_library');assert_equal 'qa',result['rows'][0]['catalogId'];assert result['materials'].is_a?(Array)
    palette=dispatch('smart_palette_load');assert_equal 'data:image/png;base64,AAA=',palette['thumbnails']['qa']
    assert_empty @model.operations;assert_empty @selected
  end
  def test_install_requires_confirmation_and_clean_guide_then_delegates_to_existing_native_library
    assert_raises(PlanosSanto::ExportError) { dispatch('skm_install',{'catalogId'=>'qa','confirmed'=>false}) }
    @controller.instance_variable_set(:@dirty,true)
    assert_raises(PlanosSanto::ExportError) { dispatch('skm_install',{'catalogId'=>'qa','confirmed'=>true}) }
    @controller.instance_variable_set(:@dirty,false)
    calls=[];library=Object.new
    library.define_singleton_method(:install) { |data,path:| calls << [data,path];{'noChanges'=>true} }
    data={'catalogId'=>'qa','confirmed'=>true,'revision'=>0,'assetRevision'=>0}
    result=PlanosSanto::MaterialLibrary.stub(:new,library) { dispatch('skm_install',data) }
    assert_equal [[data,'/synthetic/material.skm']],calls;assert result['noChanges'];assert_empty @model.operations
  end
  def test_piece_highlight_works_during_name_edits_without_geometry_selection_or_undo_changes
    before=Marshal.dump(@model.state);selection=@model.selection.dup
    @controller.instance_variable_set(:@dirty,true)
    result=dispatch('piece_highlight',{'pieceId'=>'1/11'})
    assert_equal 'highlight',result['toolState']['mode'];assert result['toolState']['active']
    assert_equal selection,@model.selection;assert_equal before,Marshal.dump(@model.state)
    @controller.instance_variable_get(:@smart_tool).onKeyDown(13,0,0,nil)
    assert_empty @model.operations;assert @controller.instance_variable_get(:@dirty)
    dispatch('smart_tool_stop');assert_empty @model.operations
  end
  def test_pending_preview_disables_native_navigation_until_cancel_and_accepts_single_skm_from_combined_picker
    UI.skm_path='/synthetic/one.skm'
    dispatch('skm_preview',{'source'=>'zip'})
    assert_equal [:preview,'/synthetic/one.skm','files'],@importer.calls.last
    assert_equal 1,@controller.quick_validation('materials')
    assert_match(/cancelá/,@controller.quick_block_reason('materials'))
    dispatch('skm_cancel');assert_equal 0,@controller.quick_validation('materials')
  end

end
