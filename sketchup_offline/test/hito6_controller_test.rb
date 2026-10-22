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
  class << self;attr_accessor :hito6_model,:hito6_prefs,:hito6_focus;end
  def self.active_model;hito6_model;end
  def self.read_default(section,key,default);(hito6_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.hito6_prefs||={};hito6_prefs[[section,key]]=value;end
  def self.focus;self.hito6_focus=(hito6_focus||0)+1;true;end
end
module UI
  class << self;attr_accessor :hito6_timers;end
  def self.start_timer(_delay,_repeat,&block);(self.hito6_timers||=[]) << block;hito6_timers.length;end
  def self.stop_timer(_id);end
end
require_relative '../build/planos_santo/offline'

# Counts native rescans: ARQ-02 forbids them after Planos Santo's own writes.
module Hito6ScanCounter
  class << self;attr_accessor :count;end
  def scan;Hito6ScanCounter.count=(Hito6ScanCounter.count || 0)+1;super;end
end
PlanosSanto::NativeSession.prepend(Hito6ScanCounter)

class Hito6DialogDouble
  attr_reader :scripts,:sizes,:positions
  attr_accessor :size
  def initialize;@scripts=[];@sizes=[];@positions=[];@size=[1100,700];end
  def execute_script(script);@scripts << script;end
  def set_size(*size);@sizes << size;@size=size;end
  def get_size;@size;end
  def set_position(*position);@positions << position;end
  def events(name)
    scripts.select { |script| script.include?("'#{name}'") }.map { |script| JSON.parse(JSON.parse(script[/JSON\.parse\((".*")\)\}\)\)\z/,1])) }
  end
end

class Hito6ToolDouble
  attr_reader :args
  def activate(_view=nil);args[:on_event].call('active'=>true,'queuedCount'=>0);end
  def stop;args[:on_event].call('active'=>false,'queuedCount'=>0);end
  def configure(args);@args=args;self;end
  def changed;args[:on_event].call('changed'=>true,'active'=>true,'queuedCount'=>0);end
end

class Hito6ControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old_dir=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model)
    @model.materials.each { |material| material.define_singleton_method(:name) { display_name } }
    @model.define_singleton_method(:select_tool) { |tool| tool&.activate }
    observers=@observers=[]
    @model.define_singleton_method(:add_observer) { |observer| observers << observer;true }
    @model.define_singleton_method(:remove_observer) { |observer| observers.delete(observer);true }
    Sketchup.hito6_model=@model;Sketchup.hito6_prefs={};Sketchup.hito6_focus=0;UI.hito6_timers=[]
    @dialog=Hito6DialogDouble.new
    @controller=PlanosSanto::OfflineController.new
    @controller.instance_variable_set(:@dialog,@dialog)
    Hito6ScanCounter.count=0
    @controller.dispatch('scan',{})
    @tool=Hito6ToolDouble.new
  end
  def teardown
    ENV['PLANOS_SANTO_DATA_DIR']=@old_dir;FileUtils.remove_entry(@dir)
  end
  def face;@model.entities[0].definition.entities[0].definition.entities[1];end
  def stale_events;@dialog.events('planos-santo-analysis-state');end
  def start_tool
    tool=@tool
    options={'mode'=>'sheet','side'=>'front','scope'=>'all','axes'=>[0,1],'batch'=>false,'confirmed'=>true,'allowShared'=>true,'catalogId'=>'chosen','materialUuid'=>'project-only'}
    PlanosSanto::SmartPaintTool.stub(:new,lambda { |*_args,**kwargs| tool.configure(kwargs) }) { @controller.dispatch('smart_tool_start',{'options'=>options}) }
  end

  # ARQ-03
  def test_scan_attaches_one_model_watch_and_closing_context_detaches_it
    watch=@controller.instance_variable_get(:@model_watch)
    assert_same @model,watch.model;assert watch.attached?;assert_equal 1,@observers.length
    @controller.dispatch('scan',{})
    assert_same watch,@controller.instance_variable_get(:@model_watch);assert_equal 1,@observers.length
    @controller.context_changed(@model,replaced:true)
    refute watch.attached?;assert_empty @observers;assert_nil @controller.instance_variable_get(:@model_watch)
  end
  def test_requests_from_the_windows_are_planos_santo_transactions_and_are_ignored
    seen=nil;controller=@controller
    @controller.define_singleton_method(:dispatch) { |_action,_data| seen=controller.instance_variable_get(:@model_watch).suppressed?;{} }
    @controller.handle(JSON.generate('version'=>1,'id'=>'a','action'=>'diagnostic','data'=>{}),source:@dialog)
    assert_equal true,seen
    refute @controller.instance_variable_get(:@model_watch).suppressed?
  end
  def test_observer_callbacks_only_queue_and_the_debounced_flush_checks_the_model
    watch=@controller.instance_variable_get(:@model_watch)
    calls=0
    PlanosSanto::ModelWatch.stub(:fingerprint,->(_model) { calls+=1;'otra' }) do
      @observers[0].onTransactionCommit(@model);@observers[0].onTransactionUndo(@model)
      assert_equal 0,calls;assert_equal ['model'],watch.pending_kinds
      watch.flush
    end
    assert_equal 1,calls
    assert_equal true,stale_events.last['stale'];assert_equal 'model',stale_events.last['source']
  end
  def test_selection_changes_never_compute_the_fingerprint
    PlanosSanto::ModelWatch.stub(:fingerprint,->(_model) { raise 'no debe recorrer el modelo' }) do
      @controller.model_watch_changed(['selection'])
    end
    assert_empty stale_events
  end
  def test_native_material_edits_refresh_both_palettes_materiales_12
    @controller.model_watch_changed(['materials'])
    assert_equal 'model_watch',@dialog.events('planos-santo-material-library-changed').last['action']
    assert_empty stale_events
  end

  # ARQ-02
  def test_scan_reply_itself_is_the_fresh_analysis
    assert_empty stale_events;assert_equal false,@controller.send(:analysis_state)['stale']
    assert_equal 1,Hito6ScanCounter.count
  end
  def test_native_change_marks_stale_and_undo_to_the_analyzed_state_clears_it
    original=face.material
    @controller.model_watch_changed(['model'])
    assert_empty stale_events
    face.material=@model.materials[2]
    @controller.model_watch_changed(['model'])
    assert_equal true,stale_events.last['stale'];assert_match(/Deshacer/,stale_events.last['reason'])
    face.material=original
    @controller.model_watch_changed(['model'])
    assert_equal false,stale_events.last['stale']
    assert_equal 1,Hito6ScanCounter.count
  end
  def test_painting_marks_stale_without_rescanning
    start_tool;@tool.changed
    # smart_event is owned by the painting flow: it keeps its document-invalidated notice.
    assert_equal [{'scanRequired'=>true}],@dialog.events('planos-santo-document-invalidated')
    result=@controller.dispatch('smart_tool_stop',{})
    assert_equal true,stale_events.last['stale'];assert_equal 'paint',stale_events.last['source']
    assert_equal true,result['stale'];refute result.key?('scan');refute result.key?('scanRequired')
    assert_equal false,result['toolState']['changed']
    assert_equal 1,Hito6ScanCounter.count
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('generate',{'ids'=>['1']}) }
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('piece_highlight',{'pieceId'=>'1/11'}) }
    # Undo after an own write keeps the banner: the analyzed session was replaced.
    @controller.model_watch_changed(['model'])
    assert_equal true,stale_events.last['stale']
    @controller.dispatch('scan',{})
    assert_equal false,@controller.send(:analysis_state)['stale'];assert_equal 2,Hito6ScanCounter.count
  end
  def test_material_writes_mark_stale_without_rescanning
    result=@controller.send(:refresh_after_material_change,{'changed'=>true})
    assert_equal true,result['stale'];refute result.key?('scan');refute result.key?('refreshWarning')
    assert_equal 'material',stale_events.last['source'];assert_equal 1,Hito6ScanCounter.count
    assert_equal({'noChanges'=>true},@controller.send(:refresh_after_material_change,{'noChanges'=>true}))
  end
  def test_saving_the_guide_rebaselines_the_fingerprint
    session=@controller.instance_variable_get(:@session);model=@model
    session.define_singleton_method(:save) { |*_args,**_kw| model.set_attribute('PlanosSanto','guide_v1','{"revision":2}');{'revision'=>2} }
    session.define_singleton_method(:fingerprint) { 'x' }
    session.define_singleton_method(:document) { {} }
    @controller.dispatch('save',{'furniture'=>[],'revision'=>1})
    @controller.model_watch_changed(['model'])
    assert_empty stale_events
  end
  def test_without_an_analysis_no_banner_is_shown
    controller=PlanosSanto::OfflineController.new;dialog=Hito6DialogDouble.new
    controller.instance_variable_set(:@dialog,dialog)
    controller.ensure_palette_context!
    controller.send(:mark_stale,'paint');controller.model_watch_changed(['model'])
    assert_empty dialog.events('planos-santo-analysis-state')
  end
end
