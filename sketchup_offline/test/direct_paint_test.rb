# frozen_string_literal: true
# API doubles: no assertion here claims native SketchUp execution.
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path);true;end
end
module Sketchup
  class AppObserver;end
  class << self;attr_accessor :direct_model,:direct_prefs;end
  def self.active_model;direct_model;end
  def self.read_default(section,key,default);(direct_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.direct_prefs||={};direct_prefs[[section,key]]=value;end
end
module UI
  class << self;attr_accessor :messages;end
  def self.messagebox(message);(self.messages||=[]) << message;end
  def self.start_timer(_delay,_repeat,&block);block.call;end
  class HtmlDialog
    STYLE_DIALOG=0
    class << self;attr_accessor :created;end
    attr_reader :options,:scripts,:file,:sizes,:callbacks
    def initialize(options);@options=options;@scripts=[];@sizes=[];@callbacks={};self.class.created||=[];self.class.created << self;end
    def set_file(path);@file=path;end
    def add_action_callback(name,&block);@callbacks[name]=block;end
    def set_can_close(&block);@can_close=block;end
    def set_on_closed(&block);@closed=block;end
    def show;@visible=true;end
    def visible?;@visible;end
    def bring_to_front;end
    def set_size(*size);@sizes << size;end
    def execute_script(script);@scripts << script;end
    def close;@visible=false;@closed.call;end
  end
end
require_relative '../build/planos_santo/offline'
class DirectPaintToolDouble
  attr_reader :options,:stops
  def initialize(**args);@args=args;@options=args[:options];@stops=0;end
  def activate;@args[:on_event].call('active'=>true,'options'=>@options);end
  def immediate?;@options['immediate']==true;end
  def update_options(options);@options=options;@args[:on_event].call('active'=>true,'options'=>@options);end
  def stop;@stops+=1;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end
class DirectPaintTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;Sketchup.direct_model=@model;Sketchup.direct_prefs={};UI::HtmlDialog.created=[];UI.messages=[]
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
    @choices=[{'catalogId'=>'known','materialUuid'=>'current-native'}]
    choices=@choices
    @service=Object.new;@service.define_singleton_method(:material_choices) { |_data| choices }
    # 0.8.8: the controller resolves palette choices through PaintMaterials.
    @paint=Object.new
    @paint.define_singleton_method(:states) do
      row=choices.find { |choice| choice['catalogId']=='known' }
      row ? {'known'=>{'state'=>'ready','materialUuid'=>row['materialUuid']}} : {'known'=>{'state'=>'installable','message'=>'«Conocido» todavía no está en este modelo; se instala automáticamente al elegirlo.'}}
    end
    paint=@paint
    @paint.define_singleton_method(:state) { |catalog_id| paint.states[catalog_id] }
    @paint.define_singleton_method(:prepare) do |catalog_id,_mode|
      row=choices.find { |choice| choice['catalogId']==catalog_id }
      raise PlanosSanto::ExportError,'La ficha del material ya no existe en la biblioteca.' unless row
      {'catalogId'=>catalog_id,'materialUuid'=>row['materialUuid'],'installed'=>false,'message'=>'Material activo.'}
    end
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def palette;@controller.instance_variable_get(:@palette_dialog);end
  def with_tool
    PlanosSanto::PaintMaterials.stub(:new,@paint) do
      PlanosSanto::SmartPaint.stub(:new,@service) do
        PlanosSanto::SmartPaintTool.stub(:new,lambda { |_model,**args| DirectPaintToolDouble.new(**args) }) { yield }
      end
    end
  end
  def remember;@controller.remember_smart_settings('catalogId'=>'known','scope'=>'all','side'=>'both','axes'=>[1,2],'batch'=>true,'edgeCount'=>4,'paintScope'=>'piece');end
  def test_cold_toolbar_starts_before_ready_and_only_constructs_compact_window
    remember
    with_tool { @controller.quick_action('sheet') }
    assert_equal 1,UI::HtmlDialog.created.length
    assert_nil @controller.instance_variable_get(:@dialog)
    assert_equal [680,320],palette.options.values_at(:width,:height);assert_empty palette.sizes # ARQ-06
    assert palette.file.end_with?('/ui/palette.html')
    assert_equal true,@controller.smart_state['active']
    assert_equal 'unique',@selected.first.options['scope']
    assert_equal false,@selected.first.options['allowShared']
    assert_equal 'both',@selected.first.options['side']
    assert_equal [0,1],@selected.first.options['axes']
    assert_equal 1,@selected.first.options['edgeCount']
    assert_equal 'piece',@selected.first.options['paintScope']
    assert_equal 'current-native',@selected.first.options['materialUuid']
    assert_equal false,@selected.first.options['batch']
    assert_equal true,@selected.first.options['immediatePiece']
    assert @controller.dispatch('palette_ready',{})['toolState']['active']
    assert_equal 1,@selected.compact.length
    assert_empty @model.operations
  end
  def test_no_remembered_valid_material_is_a_chooser_without_a_scan_or_mutation
    @controller.quick_action('sheet')
    assert palette.visible?
    assert_empty @selected
    refute @controller.smart_state['active']
    assert_nil @controller.instance_variable_get(:@session).document
    assert_empty @model.operations
  end
  # 0.8.8: a toolbar resume never installs; it explains why it did not start.
  def test_remembered_material_not_installed_in_this_model_does_not_auto_start_or_install
    remember;@choices.clear
    with_tool { @controller.quick_action('sheet') }
    assert_empty @selected
    assert_match(/se instala automáticamente al elegirlo/,@controller.dispatch('palette_ready',{})['intent']['message'])
    assert_empty @model.operations
  end
  def test_explicit_quick_choice_is_unique_and_changed_uuid_or_shared_scope_is_rejected
    @controller.quick_action('sheet')
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'known','scope'=>'all'}) }
    with_tool do
      # 0.8.8: a stale UUID from the palette self-heals to the current bound material.
      result=@controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'known','materialUuid'=>'old'})
      assert result['toolState']['active'];assert_equal 'current-native',result['toolState']['options']['materialUuid']
      assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'unknown'}) }
    end
    refute @controller.smart_settings.key?('materialUuid')
    refute @controller.smart_settings.key?('allowShared')
  end
  def test_second_toolbar_click_stops_and_readiness_does_not_restart
    remember
    with_tool { @controller.quick_action('sheet') }
    tool=@selected.first
    with_tool { assert @controller.quick_action('sheet')['toggleOff'] }
    assert_equal 1,tool.stops
    refute @controller.dispatch('palette_ready',{})['toolState']['active']
    assert_equal 1,@selected.compact.length
  end
  def test_existing_generated_session_is_not_replaced_when_palette_opens_or_closes
    @controller.dispatch('scan',{});@controller.dispatch('generate',{'ids'=>['1']})
    session=@controller.instance_variable_get(:@session);document=session.document
    @controller.quick_action('sheet');palette.close
    assert_same session,@controller.instance_variable_get(:@session)
    assert_same document,session.document
    assert_empty @model.operations
  end
  def test_dirty_main_or_workshop_blocks_toolbar_without_constructing_any_window
    @controller.instance_variable_set(:@dirty,true)
    assert @controller.quick_action('sheet')['error']
    @controller.instance_variable_set(:@dirty,false);@controller.instance_variable_set(:@workshop_dirty,true)
    assert @controller.quick_action('sheet')['error']
    assert_empty UI::HtmlDialog.created
  end
  def test_replies_and_progress_are_routed_to_originating_dialog
    @controller.show;main=@controller.instance_variable_get(:@dialog)
    @controller.quick_action('sheet');other=palette
    @controller.handle(JSON.generate('version'=>1,'id'=>'p','action'=>'palette_ready'),source:other)
    assert_match(/PlanosSantoBridge.receive/,other.scripts.last)
    assert_empty main.scripts
    @controller.handle(JSON.generate('version'=>1,'id'=>'d','action'=>'dirty','data'=>{'value'=>false}),source:main)
    assert_match(/PlanosSantoBridge.receive/,main.scripts.last)
    assert_nil @controller.instance_variable_get(:@request_dialog)
  end
  def test_main_close_keeps_palette_and_session_but_palette_close_cancels_tool
    remember
    @controller.show
    with_tool { @controller.quick_action('sheet') }
    session=@controller.instance_variable_get(:@session);tool=@selected.first
    @controller.instance_variable_get(:@dialog).close
    assert_same session,@controller.instance_variable_get(:@session)
    assert @controller.smart_state['active']
    palette.close
    refute @controller.smart_state['active']
    assert_equal 1,tool.stops
  end
  def test_model_switch_cancels_and_never_paints_the_replacement
    remember
    with_tool { @controller.quick_action('sheet') }
    Sketchup.direct_model=NamesFixture.model
    @controller.context_changed(Sketchup.direct_model)
    refute @controller.smart_state['active']
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'known'}) }
    assert_empty Sketchup.direct_model.operations
  end
  def guide_payload
    @controller.dispatch('scan',{})
    generated=@controller.dispatch('generate',{'ids'=>['1']})
    pieces=[]
    PlanosSanto::Exporter.each_node(generated['document']['furniture']) do |node|
      pieces << {'id'=>node['id'],'name'=>node['name'],'code'=>"P#{(pieces.length+1).to_s.rjust(2,'0')}"} if node['mesh']
    end
    {'furniture'=>[{'id'=>'1','explosion'=>0.45,'zoom'=>1,'pieces'=>pieces,'notes'=>[]}],'revision'=>0,'workCode'=>''}
  end
  def test_guide_name_preview_allows_dirty_edits_but_never_mutates_or_opens_undo
    data=guide_payload
    data['furniture'][0]['pieces'][0]['name']='Nombre pendiente'
    data['furniture'][0]['groupName']='Mueble pendiente'
    before=Marshal.dump(@model.state)
    @controller.instance_variable_set(:@dirty,true)
    result=@controller.dispatch('guide_names_preview',data)
    assert result['rows'].any? { |row| row['name']=='Nombre pendiente' && row['changed'] }
    assert result['rows'].any? { |row| row['name']=='Mueble pendiente' && row['role']=='container' }
    assert_equal before,Marshal.dump(@model.state)
    assert_empty @model.operations
    assert @controller.instance_variable_get(:@dirty)
  end
  def test_guide_preview_rejects_stale_revision_and_unknown_routes
    data=guide_payload
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('guide_names_preview',data.merge('revision'=>1)) }
    data['furniture'][0]['pieces'][0]['id']='1/unknown'
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('guide_names_preview',data) }
    assert_empty @model.operations
  end
  def test_nested_dirty_callback_restores_progress_destination_and_request_id
    @controller.show;main=@controller.instance_variable_get(:@dialog)
    @controller.quick_action('sheet');other=palette
    @controller.instance_variable_set(:@request_dialog,other)
    @controller.instance_variable_set(:@request_id,'outer')
    @controller.instance_variable_set(:@busy,true)
    @controller.handle(JSON.generate('version'=>1,'id'=>'nested','action'=>'dirty','data'=>{'value'=>false}),source:main)
    assert_same other,@controller.instance_variable_get(:@request_dialog)
    assert_equal 'outer',@controller.instance_variable_get(:@request_id)
    @controller.dialog_progress('waiting_user')
    assert_match(/waiting_user/,other.scripts.last)
    assert_match(/nested/,main.scripts.last)
    assert @controller.instance_variable_get(:@busy)
  end

  def test_remove_edge_toolbar_ignores_remembered_edge_material_and_restores_by_inference
    remember
    @service.define_singleton_method(:material_choices) { |_data| raise 'Toolbar removal must not pick a remembered edge material' }
    with_tool { @controller.quick_action('remove_edge') }
    options=@selected.first.options
    assert_equal 'remove_edge',options['mode']
    refute options.key?('catalogId')
    refute options.key?('materialUuid')
    assert_equal 1,options['edgeCount']
  end
  def test_explicit_remove_edge_restoration_resolves_a_sheet_not_an_edge
    @controller.quick_action('sheet')
    seen=[];original=@paint.method(:prepare)
    @paint.define_singleton_method(:prepare) { |catalog_id,mode| seen << mode;original.call(catalog_id,mode) }
    with_tool { @controller.dispatch('smart_quick_start',{'mode'=>'remove_edge','catalogId'=>'known'}) }
    assert_equal ['sheet'],seen
    assert_equal 'current-native',@selected.last.options['materialUuid']
  end

  def test_quick_material_change_updates_the_active_tool_without_deselecting_it
    remember
    with_tool do
      @controller.quick_action('sheet');tool=@selected.first
      @choices.replace([{'catalogId'=>'other','materialUuid'=>'other-native'}])
      @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'other','materialUuid'=>'other-native','side'=>'front','axes'=>[1,2],'batch'=>true,'paintScope'=>'face'})
      assert_equal [tool],@selected.compact
      assert_equal 0,tool.stops
      assert_equal 'other-native',tool.options['materialUuid']
      assert_equal 'piece',tool.options['paintScope']
      assert_equal 'both',tool.options['side']
      assert_equal false,tool.options['batch']
      assert @controller.smart_state['active']
      @choices.clear
      assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>'bad'}) }
      assert_equal 0,tool.stops
      assert_equal 'other-native',tool.options['materialUuid']
    end
  end

  def test_library_mutation_invalidates_both_dialogs_with_a_lightweight_revision
    @controller.show;main=@controller.instance_variable_get(:@dialog)
    @controller.quick_action('sheet');other=palette
    main.scripts.clear;other.scripts.clear
    @controller.stub(:dispatch_action,{'catalog'=>{'revision'=>2}}) { @controller.dispatch('catalog_save',{}) }
    [main,other].each do |window|
      assert_equal 1,window.scripts.length
      assert_includes window.scripts.last,'planos-santo-material-library-changed'
      assert_includes window.scripts.last,'revision'
      refute_includes window.scripts.last,'items'
    end
    assert_equal 1,@controller.instance_variable_get(:@material_library_revision)
    assert_empty @model.operations
  end
  def test_palette_reads_cancellation_and_existing_material_selection_do_not_broadcast
    @controller.show;main=@controller.instance_variable_get(:@dialog)
    @controller.quick_action('sheet');other=palette;main.scripts.clear;other.scripts.clear
    @controller.stub(:dispatch_action,{'catalog'=>{'revision'=>1}}) { @controller.dispatch('smart_palette_load',{}) }
    @controller.stub(:dispatch_action,{'cancelled'=>true}) { @controller.dispatch('catalog_import',{}) }
    @controller.stub(:dispatch_action,{'prepared'=>{'installed'=>false}}) { @controller.dispatch('smart_quick_start',{}) }
    assert_empty main.scripts;assert_empty other.scripts
    @controller.stub(:dispatch_action,{'prepared'=>{'installed'=>true}}) { @controller.dispatch('smart_quick_start',{}) }
    assert_equal 1,main.scripts.length;assert_equal 1,other.scripts.length
  end
  def test_failed_mutation_does_not_broadcast_and_a_closing_window_does_not_fail_a_committed_change
    @controller.show;main=@controller.instance_variable_get(:@dialog)
    @controller.quick_action('sheet');other=palette;main.scripts.clear;other.scripts.clear
    @controller.stub(:dispatch_action,lambda { |_action,_data| raise PlanosSanto::ExportError,'No se guardó' }) do
      assert_raises(PlanosSanto::ExportError) { @controller.dispatch('catalog_save',{}) }
    end
    assert_empty main.scripts;assert_empty other.scripts
    main.define_singleton_method(:execute_script) { |_script| raise IOError,'Window closed' }
    @controller.stub(:dispatch_action,{'assigned'=>true}) do
      assert_equal({'assigned'=>true},@controller.dispatch('smart_assign_color',{}))
    end
    assert_equal 1,other.scripts.length
    assert_empty @model.operations
  end

end
