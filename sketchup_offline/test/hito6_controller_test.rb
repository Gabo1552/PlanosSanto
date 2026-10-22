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
    # 0.8.17: highlighting no longer asks to stop the brush or to reanalyze
    # first; a path that changed is refused by the highlight tool itself.
    highlighted=@controller.dispatch('piece_highlight',{'pieceId'=>'1/11'})
    assert_equal 'highlight',highlighted['toolState']['mode']
    # Undo after an own write keeps the banner: the analyzed session was replaced,
    # so the debounced check does not even walk the model again.
    PlanosSanto::ModelWatch.stub(:fingerprint,->(_model) { raise 'no debe recorrer el modelo' }) { @controller.model_watch_changed(['model']) }
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

  # ARQ-07
  def test_opening_materials_or_order_prepares_the_context_without_scanning
    Hito6ScanCounter.count=0
    controller=PlanosSanto::OfflineController.new;controller.instance_variable_set(:@dialog,Hito6DialogDouble.new)
    controller.instance_variable_set(:@quick_intent,{'sequence'=>3,'action'=>'materials'})
    loading=controller.dispatch('ui_loading',{})
    assert_equal false,loading['ready'];assert_equal 'materials',loading['intent']['action']
    assert_equal 'materials',controller.dispatch('ui_ready',{})['intent']['action']
    assert controller.dispatch('catalog_load',{}).key?('catalog')
    assert_equal 0,Hito6ScanCounter.count
    assert_same @model,controller.instance_variable_get(:@model_watch).model
    assert_raises(PlanosSanto::ExportError) { controller.dispatch('order_plan',{}) }
    assert_equal 0,Hito6ScanCounter.count
  end
  def test_loading_never_replaces_an_existing_session
    session=@controller.instance_variable_get(:@session)
    @controller.dispatch('ui_loading',{})
    assert_same session,@controller.instance_variable_get(:@session);assert_equal 1,Hito6ScanCounter.count
  end

  # ARQ-06
  def window(action,data,source=@dialog)
    @controller.handle(JSON.generate('version'=>1,'id'=>action,'action'=>action,'data'=>data),source:source)
    JSON.parse(JSON.parse(source.scripts.last[/JSON\.parse\((".*")\)\)\z/,1]))
  end
  def test_first_open_fits_80_percent_of_the_screen_once_and_remembers
    reply=window('window_fit',{'screenWidth'=>1366,'screenHeight'=>728})
    assert_equal true,reply['result']['fitted']
    assert_equal [[1093,582]],@dialog.sizes;assert_equal [[137,73]],@dialog.positions
    reply=window('window_fit',{'screenWidth'=>1366,'screenHeight'=>728})
    assert_equal false,reply['result']['fitted'];assert_equal 1,@dialog.sizes.length
    assert_match(/Pantalla inválida/,window('window_fit',{'screenWidth'=>'x','screenHeight'=>728})['error'])
  end
  def test_fold_shrinks_returns_focus_to_sketchup_and_unfold_restores_the_user_size
    @dialog.size=[1200,800]
    assert_equal true,window('window_fold',{'folded'=>true})['result']['folded']
    assert_equal [[420,120]],@dialog.sizes;assert_equal 1,Sketchup.hito6_focus
    window('window_fold',{'folded'=>false})
    assert_equal [1200,800],@dialog.sizes.last;assert_equal 1,Sketchup.hito6_focus
    assert_match(/inválid/,window('window_fold',{'folded'=>'sí'})['error'])
  end
  def test_compact_palette_restores_the_previous_editor_size_not_a_fixed_one
    @dialog.size=[1000,650]
    window('smart_palette_compact',{'compact'=>true});window('smart_palette_compact',{'compact'=>false})
    assert_equal [[440,760],[1000,650]],@dialog.sizes
  end
  def test_reset_windows_forgets_the_layout_and_refits_open_windows
    window('window_fit',{'screenWidth'=>1920,'screenHeight'=>1040});@dialog.sizes.clear;@dialog.positions.clear
    palette=Hito6DialogDouble.new;@controller.instance_variable_set(:@palette_dialog,palette)
    @controller.reset_windows
    assert_equal [[1536,832]],@dialog.sizes;assert_equal [[192,104]],@dialog.positions
    assert_equal [[680,320]],palette.sizes
    assert_equal 1,@dialog.events('planos-santo-window-reset').length
    assert_equal false,window('window_fit',{'screenWidth'=>1920,'screenHeight'=>1040})['result']['fitted']
    # Closed editor: the next open fits again.
    @controller.instance_variable_set(:@dialog,nil);@controller.reset_windows
    @controller.instance_variable_set(:@dialog,@dialog)
    assert_equal true,window('window_fit',{'screenWidth'=>1920,'screenHeight'=>1040})['result']['fitted']
  end

  # F-ARQ-A
  def each_node(nodes,&block);nodes.each { |node| block.call(node);each_node(node['children'],&block) };end
  def test_scan_reply_carries_no_meshes_and_generate_sends_them_for_the_chosen_furniture
    scan=@controller.dispatch('scan',{});meshes=[]
    each_node(scan['tree']['roots']) { |node| meshes << node['mesh'] if node['mesh'] }
    refute_empty meshes
    assert meshes.all? { |mesh| mesh=={'vertices'=>[],'triangles'=>[],'deferred'=>true} }
    generated=@controller.dispatch('generate',{'ids'=>['1']});real=[]
    each_node(generated['document']['furniture']) { |node| real << node['mesh'] if node['mesh'] }
    refute_empty real;assert real.all? { |mesh| mesh['vertices'].any? && mesh['triangles'].any? }
    assert_equal ['1'],generated['document']['furniture'].map { |root| root['id'] }
  end
  def chunks(dialog)
    dialog.scripts.select { |script| script.include?('receiveChunk') }.map { |script| JSON.parse(JSON.parse(script[/receiveChunk\(JSON\.parse\((".*")\)\)\z/,1])) }
  end
  def test_large_replies_travel_in_utf8_safe_parts_that_rebuild_the_exact_reply
    @controller.define_singleton_method(:reply_chunk_bytes) { 64 }
    @controller.handle(JSON.generate('version'=>1,'id'=>'big','action'=>'scan','data'=>{}),source:@dialog)
    parts=chunks(@dialog)
    assert_operator parts.length,:>,3
    assert parts.all? { |part| part['id']=='big' && part['total']==parts.length && part['data'].bytesize<=64 }
    assert_equal (0...parts.length).to_a,parts.map { |part| part['index'] }
    reply=JSON.parse(parts.map { |part| part['data'] }.join)
    assert_equal 'big',reply['id'];assert_nil reply['error'];assert_match(/sintético/,reply['result']['tree']['modelName'])
    refute @dialog.scripts.any? { |script| script.include?('PlanosSantoBridge.receive(') && script.include?('"big"') }
  end
  def test_small_replies_keep_a_single_script
    @controller.handle(JSON.generate('version'=>1,'id'=>'chico','action'=>'diagnostic','data'=>{}),source:@dialog)
    assert_empty chunks(@dialog);assert_includes @dialog.scripts.last,'PlanosSantoBridge.receive('
  end
  def test_replies_over_the_cap_become_a_clear_error_and_are_measured
    @controller.define_singleton_method(:reply_max_bytes) { 300 }
    @controller.handle(JSON.generate('version'=>1,'id'=>'tope','action'=>'scan','data'=>{}),source:@dialog)
    reply=JSON.parse(JSON.parse(@dialog.scripts.last[/JSON\.parse\((".*")\)\)\z/,1]))
    assert_nil reply['result'];assert_match(/supera el tope/,reply['error']);assert_match(/menos muebles/,reply['error'])
    @controller.define_singleton_method(:reply_max_bytes) { 48*1024*1024 }
    @controller.handle(JSON.generate('version'=>1,'id'=>'diag','action'=>'diagnostic','data'=>{}),source:@dialog)
    stats=JSON.parse(JSON.parse(@dialog.scripts.last[/JSON\.parse\((".*")\)\)\z/,1]))['result']['replyStats']
    capped=stats.find { |entry| entry['action']=='scan' }
    assert_equal true,capped['capped'];assert_operator capped['bytes'],:>,300;assert_operator capped['ms'],:>=,0
  end

  # Revisión Ruby
  def test_returning_to_the_analyzed_model_observes_it_again_and_checks_what_changed
    other=NamesFixture.model
    @controller.context_changed(other)
    assert_nil @controller.instance_variable_get(:@model_watch);assert_empty @observers
    face.material=@model.materials[2]
    @controller.context_changed(@model)
    assert @controller.instance_variable_get(:@model_watch).attached?;assert_equal 1,@observers.length
    assert_equal true,stale_events.last['stale']
  end
  def test_without_a_baseline_fingerprint_any_change_is_stale
    PlanosSanto::ModelWatch.stub(:fingerprint,->(_model) { raise IOError,'falla' }) do
      @controller.dispatch('scan',{})
      @controller.model_watch_changed(['model'])
    end
    assert_equal true,stale_events.last['stale']
  end
  def test_fold_uses_the_size_reported_by_the_ui_when_get_size_is_missing
    dialog=@dialog;dialog.singleton_class.send(:undef_method,:get_size)
    window('window_fold',{'folded'=>true,'windowWidth'=>1234,'windowHeight'=>777})
    window('window_fold',{'folded'=>false,'windowWidth'=>420,'windowHeight'=>120})
    assert_equal [[420,120],[1234,777]],@dialog.sizes
  end
  def test_reopening_a_window_closed_while_folded_refits_it
    window('window_fit',{'screenWidth'=>1366,'screenHeight'=>728});@dialog.sizes.clear
    reply=window('window_fit',{'screenWidth'=>1366,'screenHeight'=>728,'windowWidth'=>420,'windowHeight'=>120})
    assert_equal true,reply['result']['fitted'];assert_equal [[1093,582]],@dialog.sizes
    reply=window('window_fit',{'screenWidth'=>1366,'screenHeight'=>728,'windowWidth'=>1093,'windowHeight'=>582})
    assert_equal false,reply['result']['fitted']
  end
  def test_first_fit_centers_on_the_monitor_that_holds_the_window
    window('window_fit',{'screenWidth'=>1920,'screenHeight'=>1040,'screenLeft'=>-1920,'screenTop'=>0})
    assert_equal [[-1728,104]],@dialog.positions
  end
end
