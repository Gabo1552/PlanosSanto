# frozen_string_literal: true
# Dispatch contract of the isolated Hito 7 block, with API doubles only.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :management_model,:focus_calls;end
  def self.active_model;management_model;end
end
module UI
  class << self;attr_accessor :management_save,:management_open;end
  def self.savepanel(*_args);management_save;end
  def self.openpanel(*_args);management_open;end
end
require_relative '../build/planos_santo/offline'

class MaterialManagementControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];Sketchup.management_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @catalog=PlanosSanto::CatalogStore.new(directory:@dir)
    @item=@catalog.new_item('Roble QA','sheet');@catalog.save([@item],0)
    @notices=[];notices=@notices
    @controller.define_singleton_method(:notify_material_library_changed) { |action| notices << action }
  end
  def teardown
    ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir)
    Sketchup.singleton_class.send(:remove_method,:focus) if Sketchup.respond_to?(:focus)
  end
  def dispatch(action,data={});@controller.dispatch(action,data);end

  def test_extras_duplicate_and_archive_go_through_isolated_block_and_notify
    assert_equal [],dispatch('material_extras')['archivedIds']
    copy=dispatch('material_duplicate','catalogId'=>@item['id'],'revision'=>1,'confirmed'=>true)
    assert_equal 'Roble QA (copia)',copy['name']
    preview=dispatch('material_archive','catalogIds'=>[copy['catalogId']],'archived'=>true,'revision'=>2,'dryRun'=>true)
    assert preview['noChanges']
    dispatch('material_archive','catalogIds'=>[copy['catalogId']],'archived'=>true,'revision'=>2,'confirmed'=>true)
    assert_equal [copy['catalogId']],dispatch('material_extras')['archivedIds']
    assert_equal %w[material_duplicate material_archive],@notices
    assert_empty @model.operations
  end

  def test_mutations_are_refused_while_smart_paint_is_active_or_guide_is_dirty
    @controller.instance_variable_set(:@smart_state,{'active'=>true,'mode'=>'sheet'})
    assert_raises(PlanosSanto::ExportError) { dispatch('material_duplicate','catalogId'=>@item['id'],'revision'=>1,'confirmed'=>true) }
    assert_equal [],dispatch('material_extras')['archivedIds']
    @controller.instance_variable_set(:@smart_state,nil)
    @controller.instance_variable_set(:@dirty,true)
    assert_raises(PlanosSanto::ExportError) { dispatch('material_archive','catalogIds'=>[@item['id']],'archived'=>true,'revision'=>1,'confirmed'=>true) }
    assert_equal 1,@catalog.read['items'].length
  end

  def test_viewport_focus_is_best_effort_and_reports_support
    assert_equal({'focused'=>false,'method'=>'unsupported'},dispatch('viewport_focus'))
    Sketchup.focus_calls=0
    Sketchup.define_singleton_method(:focus) { Sketchup.focus_calls+=1;true }
    assert_equal({'focused'=>true,'method'=>'Sketchup.focus'},dispatch('viewport_focus'))
    assert_equal 1,Sketchup.focus_calls
  end

  def test_package_export_preview_commit_and_cancel_through_native_dialogs
    UI.management_save=nil
    assert dispatch('material_package_export')['cancelled']
    UI.management_save=File.join(@dir,'lote')
    exported=dispatch('material_package_export')
    assert_equal 'lote.zip',exported['fileName'];assert_equal 1,exported['items']
    other=Dir.mktmpdir
    begin
      ENV['PLANOS_SANTO_DATA_DIR']=other
      UI.management_open=File.join(@dir,'lote.zip')
      preview=dispatch('material_package_preview')
      assert_equal ['new'],preview['rows'].map { |row| row['status'] }
      dispatch('material_package_cancel')
      assert_raises(PlanosSanto::ExportError) { dispatch('material_package_commit','token'=>preview['token'],'selectedIds'=>[],'revision'=>0,'confirmed'=>true) }
      preview=dispatch('material_package_preview')
      result=dispatch('material_package_commit','token'=>preview['token'],'selectedIds'=>preview['rows'].map { |row| row['id'] },'revision'=>preview['revision'],'confirmed'=>true,'renames'=>{})
      assert_equal 1,result['imported']
      assert_equal ['Roble QA'],PlanosSanto::CatalogStore.new(directory:other).read['items'].map { |item| item['name'] }
      assert_includes @notices,'material_package_commit'
    ensure
      ENV['PLANOS_SANTO_DATA_DIR']=@dir
      FileUtils.remove_entry(other)
    end
    assert_empty @model.operations
  end

  def test_ocl_sync_dry_run_never_opens_operation_and_unbound_item_is_reported
    error=assert_raises(PlanosSanto::ExportError) { dispatch('material_ocl_sync','catalogId'=>@item['id'],'dryRun'=>true) }
    assert_match(/vinculados/,error.message)
    result=dispatch('material_ocl_sync','dryRun'=>true)
    assert_equal [],result['materials'];assert result['noChanges']
    assert_empty @model.operations;assert_empty @notices
  end

  def test_texture_actions_delegate_to_photo_service_and_refresh_after_apply
    service=Object.new;calls=[]
    service.define_singleton_method(:texture_preview) { |data| calls << [:preview,data];{'noChanges'=>true,'affected'=>[]} }
    service.define_singleton_method(:texture_apply) { |data| calls << [:apply,data];{'catalogId'=>'x','verification'=>{'ok'=>true,'checked'=>1}} }
    @controller.instance_variable_set(:@photo_material,service)
    assert dispatch('material_texture_preview','catalogId'=>'x','rotation'=>90)['noChanges']
    applied=dispatch('material_texture_apply','catalogId'=>'x','confirmed'=>true)
    assert applied.key?('scan')
    assert_equal %i[preview apply],calls.map(&:first)
    assert_equal ['material_texture_apply'],@notices
  end

  def test_rejects_non_hash_data
    assert_raises(PlanosSanto::ExportError) { dispatch('material_extras',[]) }
  end
end
