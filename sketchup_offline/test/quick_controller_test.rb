# frozen_string_literal: true
# Controller sequencing with API doubles; never opens SketchUp or a native file.
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path); true; end
end
module Sketchup
  class AppObserver; end
  class << self; attr_accessor :quick_model,:observers; end
  def self.active_model; quick_model; end
  def self.add_observer(observer); (self.observers||=[]) << observer; end
end
module UI
  class << self; attr_accessor :messages; end
  def self.messagebox(message); (self.messages||=[]) << message; end
  class HtmlDialog
    STYLE_DIALOG=0
    attr_reader :scripts,:sizes,:callbacks
    def initialize(_options);@scripts=[];@sizes=[];@callbacks={};@visible=false;end
    def set_file(_path);end
    def add_action_callback(name,&block);@callbacks[name]=block;end
    def set_can_close(&block);@can_close=block;end
    def set_on_closed(&block);@on_closed=block;end
    def show;@visible=true;end
    def visible?;@visible;end
    def bring_to_front;end
    def set_size(*size);@sizes << size;end
    def execute_script(script);@scripts << script;end
    def close;@visible=false;@on_closed.call;end
  end
end
require_relative '../build/planos_santo/offline'
class QuickControllerToolDouble
  attr_reader :args,:stops
  def initialize(args);@args=args;@stops=0;end
  def activate;@args[:on_event].call('active'=>true,'queuedCount'=>0);end
  def stop;@stops+=1;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end
class QuickControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@previous=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;Sketchup.quick_model=@model;Sketchup.observers=[];UI.messages=[]
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool; tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@previous;FileUtils.remove_entry(@dir);end
  def dialog;@controller.instance_variable_get(:@dialog);end
  def palette;@controller.instance_variable_get(:@palette_dialog);end
  def ready
    @controller.dispatch('scan',{});@controller.dispatch('ui_ready',{})
  end
  def start(mode='sheet')
    opts={'mode'=>mode,'side'=>'front','scope'=>'all','axes'=>[0,1],'confirmed'=>true,'allowShared'=>true,'catalogId'=>'explicit'}
    factory=lambda { |_model,**args| @tool=QuickControllerToolDouble.new(args) }
    PlanosSanto::SmartPaintTool.stub(:new,factory) { @controller.dispatch('smart_tool_start',{'options'=>opts}) }
  end
  def test_cold_command_waits_for_ready_and_keeps_only_the_latest_intent
    first=@controller.quick_action('sheet');window=palette
    assert_equal 'sheet',first['action'];assert_empty palette.scripts;assert_empty @selected;assert_nil dialog
    @controller.quick_action('edge');assert_same window,palette
    ready_reply=@controller.dispatch('palette_ready',{})
    assert_equal 'edge',ready_reply['intent']['action']
    assert_equal 2,ready_reply['intent']['sequence']
    assert_equal ready_reply['intent'],@controller.dispatch('palette_ready',{})['intent']
    @controller.dispatch('quick_action_ack',{'sequence'=>2})
    assert_nil @controller.dispatch('palette_ready',{})['intent']
    assert_empty @model.operations
  end
  def test_seven_quick_actions_never_mutate_or_export_when_navigation_is_requested
    @controller.show;ready
    before=Marshal.dump(@model.state)
    PlanosSanto::OfflineController::QUICK_ACTIONS.each do |action|
      result=@controller.quick_action(action)
      assert_equal action,result['action']
      if %w[sheet edge remove_edge sample].include?(action)
        assert palette.visible?
      else
        assert_match(/planos-santo-quick-action/,dialog.scripts.last)
      end
    end
    assert_equal before,Marshal.dump(@model.state);assert_empty @model.operations
  end
  def test_selection_uses_complete_active_context_paths_and_only_instances
    @model.active_path=[@model.entities[0]];piece=@model.entities[0].entities[0]
    @model.selection=[piece,piece.definition.entities[0]]
    result=@controller.quick_action('furniture')
    assert_equal ['1/11'],result['selectionPaths']
    assert_empty @model.operations
  end
  def test_active_native_mode_checked_and_second_click_cancels_pending_batch_without_painting
    @controller.show;ready;start
    @tool.args[:on_event].call('queuedCount'=>2)
    assert_equal 8,@controller.quick_validation('sheet');assert_equal 0,@controller.quick_validation('edge')
    result=@controller.quick_action('sheet')
    assert result['toggleOff'];refute @controller.smart_state['active'];assert_equal 0,@controller.smart_state['queuedCount']
    assert_equal 0,@controller.quick_validation('sheet');assert_equal 1,@tool.stops;assert_nil @selected.last
    assert_empty @model.operations
  end
  def test_switching_mode_cancels_queue_with_an_explicit_notice_and_never_reuses_permissions
    @controller.show;ready;start;@tool.args[:on_event].call('queuedCount'=>2)
    result=@controller.quick_action('edge')
    refute result['toggleOff'];assert_match(/canceló/,result['message'])
    refute result.key?('options');refute result.key?('allowShared');refute @controller.smart_state['active']
    assert_empty @model.operations
  end
  def test_unsaved_edits_busy_and_missing_model_gray_commands_and_explain_the_reason
    %i[@dirty @workshop_dirty @busy].each do |flag|
      @controller.instance_variable_set(flag,true)
      assert_equal 1,@controller.quick_validation('sheet')
      assert @controller.quick_action('sheet')['error'];assert_nil dialog
      @controller.instance_variable_set(flag,false)
    end
    Sketchup.quick_model=nil;assert_equal 1,@controller.quick_validation('guides')
    assert_match(/modelo/,@controller.quick_action('guides')['error']);refute_empty UI.messages
  end
  def test_context_change_cancels_old_tool_and_invalidates_its_guard_even_if_returning_to_model
    @controller.show;ready;start;guard=@tool.args[:guard];callback=@tool.args[:on_event]
    @tool.args[:on_event].call('queuedCount'=>2)
    other=NamesFixture.model;Sketchup.quick_model=other
    Sketchup.observers.first.onActivateModel(other)
    refute @controller.smart_state['active'];assert_equal 0,@controller.smart_state['queuedCount']
    assert_equal 1,@controller.quick_validation('sheet')
    Sketchup.quick_model=@model
    assert_raises(PlanosSanto::ExportError) { guard.call }
    callback.call('active'=>true,'queuedCount'=>9)
    refute @controller.smart_state['active'];assert_equal 0,@controller.smart_state['queuedCount']
    assert_empty @model.operations;assert_empty other.operations
  end
  def test_dialog_close_cancels_pending_intent_and_tool_and_observer_is_registered_once
    @controller.quick_action('sheet');@controller.show;assert_equal 1,Sketchup.observers.length
    ready;start;window=palette;window.close
    dialog.close
    refute @controller.smart_state['active'];assert_nil dialog
    @controller.show;@controller.dispatch('scan',{})
    assert_nil @controller.dispatch('ui_ready',{})['intent'];assert_equal 1,Sketchup.observers.length
  end
  def test_sample_start_is_readonly_accepts_only_a_physical_side_and_requires_clean_current_context
    ready
    before=Marshal.dump(@model.state)
    [true,false,'both','invented'].each do |side|
      assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_sample_start',{'side'=>side}) }
    end
    result=@controller.dispatch('smart_sample_start',{'side'=>'back'})
    assert_equal 'sample',result['toolState']['mode'];assert result['toolState']['active'];assert_equal 8,@controller.quick_validation('sample')
    @controller.dispatch('smart_tool_stop',{})
    assert_equal before,Marshal.dump(@model.state);assert_empty @model.operations
    @controller.instance_variable_set(:@dirty,true)
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_sample_start',{'side'=>'front'}) }
  end
  def test_stopping_painted_tool_marks_stale_for_navigation_without_rescanning_generating_or_saving
    @controller.show;ready;start
    @tool.args[:on_event].call('changed'=>true,'queuedCount'=>1)
    result=@controller.quick_action('guides')
    assert result['stale'];refute result.key?('scan');assert_nil @controller.instance_variable_get(:@session).document
    assert_equal 'guides',result['action'];assert_match(/canceló/,result['message']);assert_empty @model.operations
  end
  def test_ready_requires_a_current_scan_and_unknown_action_does_not_open_a_window
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('ui_ready',{}) }
    assert @controller.quick_action('invented')['error'];assert_nil dialog
  end
  def test_reload_readiness_retains_unacknowledged_intent_and_ignores_stale_ack
    @controller.show;ready
    first=@controller.quick_action('sheet')
    second=@controller.quick_action('edge')
    @controller.dispatch('quick_action_ack',{'sequence'=>first['sequence']})
    @controller.dispatch('ui_loading',{})
    assert_equal second,@controller.dispatch('palette_ready',{})['intent']
    @controller.dispatch('quick_action_ack',{'sequence'=>second['sequence']})
    assert_nil @controller.dispatch('palette_ready',{})['intent']
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('quick_action_ack',{'sequence'=>'2'}) }
  end
  def test_principal_expands_existing_dialog_and_opens_guides_without_discarding_dirty_edits
    @controller.show;ready
    window=dialog;@controller.open_main
    assert_same window,dialog;assert_empty dialog.sizes # ARQ-06: keeps the operator's size
    assert_equal 'home',@controller.dispatch('ui_ready',{})['intent']['action']
    @controller.instance_variable_set(:@dirty,true)
    @controller.open_main
    assert @controller.instance_variable_get(:@dirty);assert_same window,dialog
  end

  def test_return_to_original_model_restores_context_without_changing_pending_edits
    @controller.show;ready;@controller.instance_variable_set(:@dirty,true)
    other=NamesFixture.model;Sketchup.quick_model=other
    Sketchup.observers.first.onActivateModel(other)
    assert @controller.smart_state['contextChanged']
    Sketchup.quick_model=@model;Sketchup.observers.first.onActivateModel(@model)
    refute @controller.smart_state['contextChanged'];assert @controller.smart_state['contextRestored']
    assert @controller.instance_variable_get(:@dirty);@controller.active!
    assert_empty @model.operations
  end
  def test_opening_a_different_document_invalidates_session_even_if_native_model_wrapper_is_reused
    @controller.show;ready
    Sketchup.observers.first.onOpenModel(@model)
    assert @controller.smart_state['contextChanged'];assert_equal 1,@controller.quick_validation('guides')
    assert_raises(PlanosSanto::ExportError) { @controller.active! }
    @controller.dispatch('scan',{});@controller.active!
    assert_equal 0,@controller.quick_validation('guides')
  end

end
