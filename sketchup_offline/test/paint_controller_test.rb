# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require_relative 'names_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file); true; end
end
module Sketchup
  class << self; attr_accessor :paint_controller_model; end
  def self.active_model; paint_controller_model; end
end
module UI
  class << self; attr_accessor :paint_openpanel; end
  def self.openpanel(*_args); paint_openpanel&.call; end
end
require_relative '../build/planos_santo/offline'

# Bridge doubles isolate controller sequencing. Actual face setters, binding,
# sharing, rollback and simulated Undo are exercised by native_paint_test.rb.
class PaintBridgeDouble
  attr_reader :calls
  def initialize; @calls=[];@token=nil; end
  def status(id=nil,from_selection:false)
    @calls << [:status,id,from_selection];{'pieces'=>[],'piece'=>nil}
  end
  def preview(data)
    @calls << [:preview,data];@token='only-once';{'token'=>@token,'affectedPaths'=>['1/11']}
  end
  def cancel;@calls << [:cancel];@token=nil;{'cancelled'=>true};end
  def apply(data)
    raise PlanosSanto::ExportError,'Vista previa vencida.' unless @token && data['token']==@token && data['confirmed']==true
    @token=nil;@calls << [:apply,data];{'changed'=>true,'affectedPaths'=>['1/11']}
  end
end
class MaterialBridgeDouble
  attr_reader :calls
  def initialize;@calls=[];end
  def status;@calls << [:status];{'materials'=>[]};end
  def bind(data);@calls << [:bind,data];{'materialId'=>'material-123'};end
  def install(data,path:nil);@calls << [:install,data,path];{'materialId'=>'material-123'};end
end

class PaintControllerTest < Minitest::Test
  def setup
    @model=NamesFixture.model;Sketchup.paint_controller_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @paint=PaintBridgeDouble.new;@library=MaterialBridgeDouble.new
    UI.paint_openpanel=nil
  end
  def teardown;UI.paint_openpanel=nil;end
  def dispatch(action,data={})
    PlanosSanto::NativePaint.stub(:new,@paint) do
      PlanosSanto::MaterialLibrary.stub(:new,@library) { @controller.dispatch(action,data) }
    end
  end
  def confirmation;{'token'=>'only-once','confirmed'=>true};end
  def test_cancel_after_model_change_releases_preview_without_touching_either_model
    dispatch('paint_preview',{})
    other=NamesFixture.model
    Sketchup.paint_controller_model=other
    assert dispatch('paint_cancel')['cancelled']
    assert_equal :cancel,@paint.calls.last.first
    assert_empty @model.operations
    assert_empty other.operations
    Sketchup.paint_controller_model=@model
    assert_raises(PlanosSanto::ExportError) { dispatch('paint_apply',confirmation) }
    assert_empty @model.operations
  end
  def test_cancel_without_scan_is_safe
    controller=PlanosSanto::OfflineController.new
    assert controller.dispatch('paint_cancel',{})['cancelled']
    assert_empty @model.operations
  end
  def test_no_changes_preserves_generated_guide_and_avoids_rescan
    @controller.dispatch('generate',{'ids'=>['1']})
    session=@controller.instance_variable_get(:@session)
    document=session.document
    result=@paint.stub(:apply,{'changed'=>false,'noChanges'=>true,'message'=>'Sin cambios'}) do
      dispatch('paint_apply',confirmation)
    end
    assert result['noChanges']
    refute result['changed']
    refute result.key?('scan')
    assert_same document,session.document
    assert_empty @model.operations
  end
  def test_dirty_guide_and_workshop_guard_every_material_mutation_before_bridge_calls
    %i[@dirty @workshop_dirty].each do |flag|
      @controller.instance_variable_set(flag,true)
      %w[paint_preview paint_apply catalog_bind catalog_install].each do |action|
        error=assert_raises(PlanosSanto::ExportError) { dispatch(action,confirmation.merge('source'=>'saved')) }
        assert_match(/Guardá los cambios/,error.message)
      end
      assert_empty @paint.calls;assert_empty @library.calls;assert_empty @model.operations
      @controller.instance_variable_set(flag,false)
    end
  end
  def test_status_and_cancel_are_readonly_even_with_pending_changes
    @controller.instance_variable_set(:@dirty,true);@controller.instance_variable_set(:@workshop_dirty,true)
    before=Marshal.dump(@model.attributes)
    assert_equal [],dispatch('paint_status',{'pieceId'=>'1/11','fromSelection'=>true})['pieces']
    assert_equal [],dispatch('catalog_visuals')['materials']
    assert dispatch('paint_cancel')['cancelled']
    assert_equal [[:status,'1/11',true],[:cancel]],@paint.calls
    assert_empty @model.operations;assert_equal before,Marshal.dump(@model.attributes)
    assert @controller.instance_variable_get(:@dirty);assert @controller.instance_variable_get(:@workshop_dirty)
  end
  def test_all_material_actions_require_same_active_model
    Sketchup.paint_controller_model=NamesFixture.model
    %w[catalog_visuals catalog_bind catalog_install paint_status paint_preview paint_apply].each do |action|
      error=assert_raises(PlanosSanto::ExportError) { dispatch(action,confirmation.merge('source'=>'saved')) }
      assert_match(/modelo activo/,error.message)
    end
    assert_empty @paint.calls;assert_empty @library.calls;assert_empty @model.operations
  end
  def test_apply_marks_analysis_stale_discards_generated_document_and_clears_paint_and_naming
    @controller.dispatch('generate',{'ids'=>['1']});session=@controller.instance_variable_get(:@session)
    refute_nil session.document
    @controller.instance_variable_set(:@naming,Object.new)
    dispatch('paint_preview',{'pieceId'=>'1/11'})
    result=dispatch('paint_apply',confirmation)
    assert result['changed'];assert result['stale'];refute result.key?('scan');assert_nil @controller.instance_variable_get(:@session).document
    assert_nil @controller.instance_variable_get(:@paint);assert_nil @controller.instance_variable_get(:@naming)
    assert_equal 1,@paint.calls.count { |call| call[0]==:apply }
    assert_raises(PlanosSanto::ExportError) { dispatch('paint_apply',confirmation) }
    assert_equal 1,@paint.calls.count { |call| call[0]==:apply }
  end
  def test_material_bind_and_install_also_mark_stale_after_success
    %w[catalog_bind catalog_install].each do |action|
      @controller.dispatch('scan',{}) # ARQ-02: reanalyze after the previous write.
      @controller.dispatch('generate',{'ids'=>['1']})
      result=dispatch(action,{'confirmed'=>true,'source'=>'saved'})
      assert_equal 'material-123',result['materialId'];assert result['stale'];refute result.key?('scan')
      assert_nil @controller.instance_variable_get(:@session).document
    end
    assert_equal %i[bind install],@library.calls.map(&:first)
  end
  # ARQ-02: the committed write never rescans, so a slow or failing scan cannot follow it.
  def test_apply_never_rescans_and_reports_committed_result_without_reapplying
    session=@controller.instance_variable_get(:@session)
    def session.scan;raise PlanosSanto::ExportError,'synthetic scan must not run after commit';end
    dispatch('paint_preview',{'pieceId'=>'1/11'})
    result=dispatch('paint_apply',confirmation)
    assert result['changed'];assert result['stale'];refute result.key?('refreshWarning')
    refute result.key?('scan');refute_same session,@controller.instance_variable_get(:@session)
    assert_nil @controller.instance_variable_get(:@paint)
    assert_raises(PlanosSanto::ExportError) { dispatch('paint_apply',confirmation) }
    assert_equal 1,@paint.calls.count { |call| call[0]==:apply }
  end
  def test_file_install_cancel_does_not_invoke_library_or_refresh_scan
    session=@controller.instance_variable_get(:@session)
    result=dispatch('catalog_install',{'confirmed'=>true,'source'=>'file'})
    assert result['cancelled'];assert_empty @library.calls;assert_same session,@controller.instance_variable_get(:@session)
    assert_empty @model.operations
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_install',{'confirmed'=>false,'source'=>'saved'}) }
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_install',{'confirmed'=>true,'source'=>'remote'}) }
  end
  def test_file_panel_rechecks_active_model_and_dirty_state_after_operator_selection
    UI.paint_openpanel=-> { Sketchup.paint_controller_model=NamesFixture.model;'/synthetic/material.skm' }
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_install',{'confirmed'=>true,'source'=>'file'}) }
    assert_empty @library.calls
    Sketchup.paint_controller_model=@model
    UI.paint_openpanel=-> { @controller.instance_variable_set(:@workshop_dirty,true);'/synthetic/material.skm' }
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_install',{'confirmed'=>true,'source'=>'file'}) }
    assert_empty @library.calls;assert_empty @model.operations
  end
end
