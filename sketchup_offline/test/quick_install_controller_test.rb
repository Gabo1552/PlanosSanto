# frozen_string_literal: true
# Controller path of Hito 1 with API doubles (no SketchUp): choosing a library
# material in the quick palette installs it in a second model and arms the tool.
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative 'photo_material_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path);true;end
end
module Sketchup
  class AppObserver;end
  class << self;attr_accessor :install_model,:install_prefs;end
  def self.active_model;install_model;end
  def self.read_default(section,key,default);(install_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.install_prefs||={};install_prefs[[section,key]]=value;end
end
module UI
  class << self;attr_accessor :messages;end
  def self.messagebox(message);(self.messages||=[]) << message;end
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
    def close;@visible=false;@closed&.call;end
  end
end
require_relative '../build/planos_santo/offline'

class QuickInstallToolDouble
  attr_reader :options
  def initialize(**args);@args=args;@options=args[:options];end
  def activate;@args[:on_event].call('active'=>true,'options'=>@options);end
  def immediate?;@options['immediate']==true;end
  def update_options(options);@options=options;@args[:on_event].call('active'=>true,'options'=>@options);end
  def stop;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end

class QuickInstallControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@source=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    catalog=PlanosSanto::CatalogStore.new(directory:@dir)
    # The photo is created in another model; this model has never seen it.
    first=PhotoFixture::Model.new
    photo=PlanosSanto::PhotoMaterial.new(first,catalog:catalog,directory:@dir,guard:lambda { true })
    path=File.join(@source,'Caju 18mm.jpg');File.binwrite(path,PhotoFixture.jpeg);picked=photo.pick(path)
    @created=photo.create(picked['token'],{'revision'=>picked['revision'],'name'=>picked['name'],'kind'=>'sheet','thicknessMm'=>18,'action'=>'new','confirmed'=>true})
    @model=NamesFixture.model;@model.define_singleton_method(:materials) { @qa_materials||=PhotoFixture::Materials.new }
    PhotoFixture.decorate(@model)
    Sketchup.install_model=@model;Sketchup.install_prefs={};UI.messages=[]
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);FileUtils.remove_entry(@source);end
  def with_tool(&block)
    PlanosSanto::SmartPaintTool.stub(:new,lambda { |_model,**args| QuickInstallToolDouble.new(**args) },&block)
  end

  def test_choosing_a_material_installs_it_and_arms_the_tool_in_one_request
    @controller.quick_action('sheet')
    loaded=@controller.dispatch('smart_palette_load',{})
    assert_equal 'installable',loaded['paintStates'][@created['catalogId']]['state']
    assert_empty @model.materials
    result=with_tool { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>@created['catalogId']}) }
    assert result['toolState']['active'],'la herramienta queda activa sin otro paso'
    assert result['prepared']['installed']
    assert_equal 'ready',result['paintStates'][@created['catalogId']]['state']
    assert_equal 1,@model.materials.length
    assert_equal result['prepared']['materialUuid'],@selected.last.options['materialUuid']
    assert_equal 'unique',@selected.last.options['scope'],'pintar canto/pieza sólo afecta la pieza elegida'
    again=with_tool { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>@created['catalogId']}) }
    refute again['prepared']['installed'];assert_equal 1,@model.materials.length
  end

  def test_refused_tool_options_never_leave_an_installed_material_behind
    @controller.quick_action('sheet')
    assert_raises(PlanosSanto::ExportError) do
      with_tool { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>@created['catalogId'],'scope'=>'all'}) }
    end
    assert_empty @model.materials
  end

  def test_toolbar_resume_never_installs_without_an_explicit_choice
    @controller.remember_smart_settings('catalogId'=>@created['catalogId'],'mode'=>'sheet')
    intent=with_tool { @controller.quick_action('sheet') }
    assert_empty @selected;assert_empty @model.materials
    assert_match(/se instala automáticamente al elegirlo/,intent['message'])
  end

  def test_assign_color_from_the_palette_makes_a_commercial_item_paintable
    store=PlanosSanto::CatalogStore.new(directory:@dir);data=store.read
    item=store.new_item('Camellia','sheet').merge('sku'=>'CAM','supplier'=>'QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true)
    store.save(data['items']+[item],data['revision'])
    @controller.quick_action('sheet')
    assert_equal 'needs_visual',@controller.dispatch('smart_palette_load',{})['paintStates'][item['id']]['state']
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('smart_assign_color',{'catalogId'=>item['id'],'rgb'=>[200,190,170]}) }
    assigned=@controller.dispatch('smart_assign_color',{'catalogId'=>item['id'],'rgb'=>[200,190,170],'confirmed'=>true})
    assert_equal 'ready',assigned['paintStates'][item['id']]['state']
    result=with_tool { @controller.dispatch('smart_quick_start',{'mode'=>'sheet','catalogId'=>item['id']}) }
    assert result['toolState']['active']
    assert_equal 'CAM',store.read['items'].find { |row| row['id']==item['id'] }['sku']
  end
end
