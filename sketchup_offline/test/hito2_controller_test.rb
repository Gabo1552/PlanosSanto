# frozen_string_literal: true
# Hito 2 controller contracts with API doubles: never opens SketchUp or a .skp.
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
  class << self;attr_accessor :hito2_model,:hito2_prefs;end
  def self.active_model;hito2_model;end
  def self.read_default(section,key,default);(hito2_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.hito2_prefs||={};hito2_prefs[[section,key]]=value;end
end
module UI
  def self.messagebox(_message);end
  def self.start_timer(_delay,_repeat,&block);block.call;end
  class HtmlDialog
    STYLE_DIALOG=0
    attr_reader :scripts
    def initialize(_options);@scripts=[];end
    def set_file(_path);end
    def add_action_callback(_name,&_block);end
    def set_can_close(&_block);end
    def set_on_closed(&block);@closed=block;end
    def show;@visible=true;end
    def visible?;@visible;end
    def bring_to_front;end
    def set_size(*_size);end
    def execute_script(script);@scripts << script;end
    def close;@visible=false;@closed.call;end
  end
end
require_relative '../build/planos_santo/offline'
class Hito2ToolDouble
  attr_reader :options,:args,:stops,:updates
  def initialize(**args);@args=args;@options=args[:options];@stops=0;@updates=0;end
  def activate;@args[:on_event].call('active'=>true,'mode'=>@options['mode'],'options'=>@options);end
  def immediate?;@options['immediate']==true;end
  def update_options(options);@updates+=1;@options=options;@args[:on_event].call('active'=>true,'mode'=>options['mode'],'options'=>@options);end
  def stop;@stops+=1;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end
class Hito2ControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;Sketchup.hito2_model=@model;Sketchup.hito2_prefs={};@model.define_singleton_method(:materials) { [] }
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
    @ready={'placa'=>'uuid-placa','canto'=>'uuid-canto','placa2'=>'uuid-placa2'}
    @kinds={'placa'=>'sheet','canto'=>'edge','placa2'=>'sheet'}
    @prepared=[];ready=@ready;kinds=@kinds;prepared=@prepared
    @paint=Object.new
    @paint.define_singleton_method(:states) { ready.to_h { |id,uuid| [id,{'state'=>'ready','materialUuid'=>uuid}] } }
    @paint.define_singleton_method(:state) { |id| ready[id] ? {'state'=>'ready','materialUuid'=>ready[id]} : nil }
    @paint.define_singleton_method(:prepare) do |id,mode|
      raise PlanosSanto::ExportError,'La ficha del material ya no existe en la biblioteca.' unless ready[id]
      raise PlanosSanto::ExportError,'Tipo equivocado.' unless kinds[id]==mode
      prepared << [id,mode];{'catalogId'=>id,'materialUuid'=>ready[id],'installed'=>false,'message'=>'Material activo.'}
    end
    @controller.quick_action('sheet')
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def with_tool
    PlanosSanto::PaintMaterials.stub(:new,@paint) do
      PlanosSanto::SmartPaint.stub(:new,Object.new) do
        PlanosSanto::SmartPaintTool.stub(:new,lambda { |_model,**args| Hito2ToolDouble.new(**args) }) { yield }
      end
    end
  end
  def quick(data);with_tool { @controller.dispatch('smart_quick_start',data) };end
  def tool;@selected.compact.last;end
  def test_edge_count_one_two_four_reach_the_tool_and_are_remembered
    [1,2,4].each do |count|
      quick('mode'=>'edge','catalogId'=>'canto','edgeCount'=>count)
      assert_equal count,tool.options['edgeCount'];assert_equal count,@controller.smart_settings['edgeCount']
    end
    assert_equal 1,@selected.compact.length # same tool updated in place
  end
  def test_edge_count_is_validated_exactly_before_any_install_or_tool_change
    ['2',2.0,3,0,true,nil,[4]].each do |bad|
      error=assert_raises(PlanosSanto::ExportError) { quick('mode'=>'edge','catalogId'=>'canto','edgeCount'=>bad) }
      assert_match(/1, 2 opuestos o 4 cantos/,error.message)
    end
    assert_empty @prepared;assert_empty @selected.compact;refute @controller.smart_settings.key?('edgeCount')
    assert_raises(PlanosSanto::ExportError) do
      @controller.validate_smart_options('confirmed'=>true,'mode'=>'edge','axes'=>[0,1],'side'=>'front','scope'=>'unique','edgeCount'=>2.0)
    end
  end
  def test_missing_edge_count_uses_remembered_value_or_one_and_sheet_forces_one_without_forgetting
    quick('mode'=>'edge','catalogId'=>'canto');assert_equal 1,tool.options['edgeCount']
    quick('mode'=>'edge','catalogId'=>'canto','edgeCount'=>4)
    quick('mode'=>'sheet','catalogId'=>'placa','edgeCount'=>4)
    assert_equal 1,tool.options['edgeCount'];assert_equal 4,@controller.smart_settings['edgeCount']
    quick('mode'=>'remove_edge');assert_equal 4,tool.options['edgeCount']
    quick('mode'=>'edge','catalogId'=>'canto');assert_equal 4,tool.options['edgeCount']
    assert_empty @model.operations
  end
  def test_ctrl_tab_remember_callback_persists_edge_count
    quick('mode'=>'edge','catalogId'=>'canto','edgeCount'=>1)
    tool.args[:remember].call(tool.options.merge('edgeCount'=>2))
    assert_equal 2,@controller.smart_settings['edgeCount']
    assert_equal 2,@controller.dispatch('smart_palette_load',{})['settings']['edgeCount']
  end
  def test_scope_all_needs_allow_shared_in_the_same_request_and_is_never_persisted
    [{'scope'=>'all'},{'scope'=>'all','allowShared'=>false},{'scope'=>'all','allowShared'=>'true'},{'scope'=>'todas'},{'scope'=>'unique','allowShared'=>'yes'}].each do |patch|
      assert_raises(PlanosSanto::ExportError) { quick({'mode'=>'sheet','catalogId'=>'placa'}.merge(patch)) }
    end
    assert_empty @prepared;assert_empty @selected.compact
    quick('mode'=>'sheet','catalogId'=>'placa','scope'=>'all','allowShared'=>true)
    assert_equal 'all',tool.options['scope'];assert_equal true,tool.options['allowShared']
    assert_equal 'unique',@controller.smart_settings['scope'];refute @controller.smart_settings.key?('allowShared')
    quick('mode'=>'sheet','catalogId'=>'placa')
    assert_equal 'unique',tool.options['scope'];assert_equal false,tool.options['allowShared']
  end
  def test_changing_material_or_mode_resets_the_authorization
    quick('mode'=>'sheet','catalogId'=>'placa','scope'=>'all','allowShared'=>true)
    quick('mode'=>'sheet','catalogId'=>'placa2','scope'=>'all','allowShared'=>true)
    assert_equal 'unique',tool.options['scope'];assert_equal false,tool.options['allowShared'];assert_equal 'uuid-placa2',tool.options['materialUuid']
    quick('mode'=>'sheet','catalogId'=>'placa2','scope'=>'all','allowShared'=>true);assert_equal 'all',tool.options['scope']
    quick('mode'=>'edge','catalogId'=>'canto','scope'=>'all','allowShared'=>true)
    assert_equal 'unique',tool.options['scope'];assert_equal 'edge',tool.options['mode']
  end
  def test_advanced_tool_settings_never_store_all
    @controller.remember_smart_settings('mode'=>'sheet','scope'=>'all','side'=>'front','axes'=>[0,1],'catalogId'=>'placa')
    assert_equal 'unique',@controller.smart_settings['scope']
  end
end
