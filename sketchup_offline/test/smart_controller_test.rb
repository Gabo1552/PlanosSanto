# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path);true;end
end
module Sketchup
  class << self;attr_accessor :smart_model,:smart_prefs,:smart_native_strings;end
  def self.active_model;smart_model;end
  # Models the native read_default string-evaluation failure reported on Windows.
  def self.read_default(section,key,default)
    value=(smart_prefs||{}).fetch([section,key],default)
    smart_native_strings && value.is_a?(String) ? eval('"'+value+'"') : value
  end
  def self.write_default(section,key,value);self.smart_prefs||={};smart_prefs[[section,key]]=value;end
end
require_relative '../build/planos_santo/offline'

class SmartControllerToolDouble
  attr_reader :args,:stopped
  def initialize;@stopped=0;end
  def activate(_view=nil);args[:on_event].call('active'=>true,'queuedCount'=>0);end
  def stop;@stopped+=1;args[:on_event].call('active'=>false,'queuedCount'=>0);end
  def configure(args);@args=args;self;end
  def changed;args[:on_event].call('changed'=>true,'active'=>true,'queuedCount'=>0);end
end
class SmartControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old_dir=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model)
    @model.materials.each { |material| material.define_singleton_method(:name) { display_name } }
    @selections=[];selections=@selections
    @model.define_singleton_method(:select_tool) { |tool| selections << tool;tool.activate if tool }
    Sketchup.smart_model=@model;Sketchup.smart_prefs={};Sketchup.smart_native_strings=false
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @tool=SmartControllerToolDouble.new
  end
  def teardown
    ENV['PLANOS_SANTO_DATA_DIR']=@old_dir;FileUtils.remove_entry(@dir)
  end
  def options
    {'mode'=>'sheet','side'=>'front','scope'=>'all','axes'=>[0,1],'batch'=>false,'confirmed'=>true,'allowShared'=>true,'catalogId'=>'chosen','materialUuid'=>'project-only'}
  end
  def start(opts=options)
    tool=@tool
    PlanosSanto::SmartPaintTool.stub(:new,lambda { |*_args,**kwargs| tool.configure(kwargs) }) do
      @controller.dispatch('smart_tool_start',{'options'=>opts})
    end
  end
  def test_palette_load_and_preferences_are_readonly_and_never_persist_consent_or_project_uuid
    before=Marshal.dump(@model.attributes)
    loaded=@controller.dispatch('smart_palette_load',{})
    assert_equal PlanosSanto::CatalogStore::SCHEMA,loaded['catalog']['schema'];assert loaded['visuals']['materials'].any?
    assert_empty Sketchup.smart_prefs;assert_empty @model.operations
    start
    saved=@controller.smart_settings
    assert_equal 'chosen',saved['catalogId'];refute saved.key?('confirmed');refute saved.key?('allowShared');refute saved.key?('materialUuid')
    assert_equal before,Marshal.dump(@model.attributes)
  end
  def test_native_string_evaluation_reproduces_080_bug_and_encoded_preferences_roundtrip
    Sketchup.smart_native_strings=true
    chosen=options.merge('catalogId'=>'Placa "ñ" #{raise "unexpected evaluation"}', 'axes'=>[1,2], 'batch'=>true)
    legacy=JSON.generate(chosen.slice(*PlanosSanto::OfflineController::SMART_SETTING_KEYS))
    Sketchup.smart_prefs[['PlanosSanto','smart_paint_settings_v1']]=legacy
    assert_raises(SyntaxError) { Sketchup.read_default('PlanosSanto','smart_paint_settings_v1','{}') }
    assert_equal({},@controller.smart_settings)
    @controller.remember_smart_settings(chosen)
    expected=chosen.slice(*PlanosSanto::OfflineController::SMART_SETTING_KEYS)
    assert_equal expected,PlanosSanto::OfflineController.new.smart_settings
    encoded=Sketchup.smart_prefs.fetch(['PlanosSanto','smart_paint_settings_v2'])
    assert_match(/\Aps2:[A-Za-z0-9+\/=]+\z/,encoded)
    assert_equal legacy,Sketchup.smart_prefs[['PlanosSanto','smart_paint_settings_v1']]
    %w[confirmed allowShared materialUuid sourceMaterialUuid].each { |key| refute @controller.smart_settings.key?(key) }
    assert_empty @model.operations
  end
  def test_valid_legacy_preferences_are_read_without_mutating_or_carrying_permissions
    Sketchup.smart_prefs[['PlanosSanto','smart_paint_settings_v1']]=JSON.generate(options)
    before=Marshal.dump(Sketchup.smart_prefs)
    assert_equal options.slice(*PlanosSanto::OfflineController::SMART_SETTING_KEYS),@controller.smart_settings
    assert_equal before,Marshal.dump(Sketchup.smart_prefs)
    assert_empty @model.operations
  end
  def test_invalid_v2_payload_fails_closed_and_does_not_overwrite_preferences
    samples=['ps2:bad!', 'ps2:'+Base64.strict_encode64('{broken'),
      'ps2:'+Base64.strict_encode64(JSON.generate({'schema'=>999,'settings'=>options})), 'x'*9000]
    samples.each do |value|
      Sketchup.smart_prefs[['PlanosSanto','smart_paint_settings_v2']]=value
      before=Marshal.dump(Sketchup.smart_prefs)
      assert_equal({},@controller.smart_settings)
      assert_equal before,Marshal.dump(Sketchup.smart_prefs)
    end
    assert_empty @model.operations
  end
  def test_invalid_or_dirty_start_never_selects_tool
    [options.merge('confirmed'=>false),options.merge('axes'=>[0,0]),options.merge('axes'=>[0.0,1]),options.merge('mode'=>'invented')].each do |opts|
      assert_raises(PlanosSanto::ExportError) { start(opts) }
    end
    %i[@dirty @workshop_dirty].each do |key|
      @controller.instance_variable_set(key,true)
      assert_raises(PlanosSanto::ExportError) { start }
      @controller.instance_variable_set(key,false)
    end
    assert_empty @selections;assert_empty @model.operations
  end
  def test_changes_invalidate_session_immediately_and_stop_returns_saved_guide_scan
    @controller.dispatch('generate',{'ids'=>['1']})
    original=@controller.instance_variable_get(:@session)
    start;@tool.changed
    session=@controller.instance_variable_get(:@session)
    refute_same original,session;assert_nil session.document
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('generate',{'ids'=>['1']}) }
    result=@controller.dispatch('smart_tool_stop',{})
    assert result['scan'];assert result['toolState']['changed'];refute result['toolState']['active']
    assert_equal false,@controller.dispatch('smart_tool_status',{})['toolState']['changed']
    assert_nil @selections.last;assert_empty @model.operations
  end
  def test_guard_rechecks_pending_edits_and_model_at_each_native_gesture
    start
    @controller.instance_variable_set(:@workshop_dirty,true)
    assert_raises(PlanosSanto::ExportError) { @tool.args[:guard].call }
    @controller.instance_variable_set(:@workshop_dirty,false)
    Sketchup.smart_model=NamesFixture.model
    assert_raises(PlanosSanto::ExportError) { @tool.args[:guard].call }
    result=@controller.dispatch('smart_tool_stop',{})
    refute result['toolState']['active'];assert_operator @tool.stopped,:>,0
    assert_empty @model.operations
  end
  def test_closed_dialog_notification_does_not_turn_committed_edit_into_a_failure
    start
    dialog=Object.new
    dialog.define_singleton_method(:execute_script) { |_script| raise IOError,'native window already closed' }
    @controller.instance_variable_set(:@dialog,dialog)
    @tool.changed
    assert @controller.dispatch('smart_tool_status',{})['toolState']['changed']
    result=@controller.dispatch('smart_tool_stop',{})
    assert result['scan'];refute result['toolState']['active']
    assert_nil @selections.last
  end
  def test_compact_palette_can_resize_below_old_editor_minimum_and_restore
    sizes=[];dialog=Object.new;dialog.define_singleton_method(:set_size) { |*size| sizes << size }
    @controller.instance_variable_set(:@dialog,dialog)
    assert @controller.dispatch('smart_palette_compact',{'compact'=>true})['compact']
    refute @controller.dispatch('smart_palette_compact',{'compact'=>false})['compact']
    assert_equal [[440,760],[1440,920]],sizes
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_palette_compact',{'compact'=>'true'}) }
  end
  def test_corrupt_saved_preferences_do_not_change_model_or_prevent_palette
    Sketchup.smart_prefs[['PlanosSanto','smart_paint_settings_v1']]='{broken'
    assert_equal({},@controller.dispatch('smart_palette_load',{})['settings'])
    assert_empty @model.operations
  end
end
