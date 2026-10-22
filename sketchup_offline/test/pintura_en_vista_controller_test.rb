# frozen_string_literal: true
# Pintura en vista (barra de herramientas → pincel sin ventanas) con dobles de la
# API. Nunca abre SketchUp: la herramienta real se reemplaza por un doble que
# registra sus kwargs, y cada UI::HtmlDialog creado queda contado.
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
  class << self;attr_accessor :vista_model,:vista_prefs,:vista_status;end
  def self.active_model;vista_model;end
  def self.read_default(section,key,default);(vista_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.vista_prefs||={};vista_prefs[[section,key]]=value;end
  def self.status_text=(text);(self.vista_status||=[]) << text;end
end
module UI
  class << self;attr_accessor :vista_dialogs,:vista_messages;end
  def self.messagebox(message);(self.vista_messages||=[]) << message;end
  def self.start_timer(_delay,_repeat,&block);block.call;end
  class HtmlDialog
    STYLE_DIALOG=0
    attr_reader :scripts
    def initialize(_options);@scripts=[];UI.vista_dialogs=(UI.vista_dialogs||0)+1;end
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

class VistaToolDouble
  attr_reader :options,:args,:stops
  def initialize(_model,**args);@args=args;@options=args[:options];@stops=0;end
  def activate;@args[:on_event].call('active'=>true,'mode'=>@options['mode'],'options'=>@options);end
  def immediate?;@options['immediate']==true;end
  def update_options(options);@options=options;end
  def stop;@stops+=1;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end

class PinturaEnVistaControllerTest < Minitest::Test
  Color=Struct.new(:red,:green,:blue)
  Native=Struct.new(:uuid,:color,:bound,:name) do
    def display_name;name;end
  end
  PREFS=['PlanosSanto','smart_paint_settings_v2'].freeze

  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;Sketchup.vista_model=@model;Sketchup.vista_prefs={};Sketchup.vista_status=[]
    UI.vista_dialogs=0;UI.vista_messages=[]
    @natives=[
      Native.new('uuid-placa',Color.new(240,240,235),{'uuid'=>'uuid-placa','catalogId'=>'placa','kind'=>'sheet'},'Melamina Blanca'),
      Native.new('uuid-canto',Color.new(200,10,10),{'uuid'=>'uuid-canto','catalogId'=>'canto','kind'=>'edge'},'Canto Rojo'),
      Native.new('uuid-suelto',Color.new(1,2,3),nil,'Pintura de SketchUp')
    ]
    natives=@natives;@model.define_singleton_method(:materials) { natives }
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
    @ready={'placa'=>'uuid-placa','canto'=>'uuid-canto'};@installable=['nueva']
    @kinds={'placa'=>'sheet','canto'=>'edge','nueva'=>'sheet'}
    @prepared=[];ready=@ready;installable=@installable;kinds=@kinds;prepared=@prepared
    @paint=Object.new
    @paint.define_singleton_method(:states) do
      ready.to_h { |id,uuid| [id,{'state'=>'ready','materialUuid'=>uuid}] }.merge(installable.to_h { |id| [id,{'state'=>'installable'}] })
    end
    @paint.define_singleton_method(:state) do |id|
      next {'state'=>'installable','message'=>'Se instala al elegirlo.'} if installable.include?(id)
      ready[id] ? {'state'=>'ready','materialUuid'=>ready[id]} : nil
    end
    @paint.define_singleton_method(:prepare) do |id,mode|
      raise PlanosSanto::ExportError,'Tipo equivocado.' unless kinds[id]==mode
      installed=installable.delete(id) ? true : false
      ready[id]||="uuid-#{id}" if installed
      raise PlanosSanto::ExportError,'La ficha del material ya no existe en la biblioteca.' unless ready[id]
      prepared << [id,mode,installed];{'catalogId'=>id,'materialUuid'=>ready[id],'installed'=>installed,'message'=>'Material activo.'}
    end
    items=kinds.map { |id,kind| {'id'=>id,'name'=>"Nombre #{id}",'kind'=>kind} }
    @catalog=Object.new;@catalog.define_singleton_method(:read) { {'schema'=>1,'revision'=>1,'items'=>items} }
  end

  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end

  def with_tool
    original=PlanosSanto::SmartPaintTool
    PlanosSanto.send(:remove_const,:SmartPaintTool);PlanosSanto.const_set(:SmartPaintTool,VistaToolDouble)
    binding_of=lambda { |material| material.bound ? {'status'=>'valid','binding'=>material.bound} : {'status'=>'absent'} }
    PlanosSanto::PaintMaterials.stub(:new,@paint) do
      PlanosSanto::SmartPaint.stub(:new,Object.new) do
        PlanosSanto::CatalogStore.stub(:new,@catalog) do
          PlanosSanto::MaterialResolver.stub(:observe_binding,binding_of) { yield }
        end
      end
    end
  ensure
    PlanosSanto.send(:remove_const,:SmartPaintTool);PlanosSanto.const_set(:SmartPaintTool,original)
  end

  def paint(action='sheet');with_tool { @controller.paint_in_view(action) };end
  def tool;@selected.compact.last;end
  def write_prefs(settings);Sketchup.vista_prefs[PREFS]='ps2:'+Base64.strict_encode64(JSON.generate('schema'=>2,'settings'=>settings));end

  def test_toolbar_paint_starts_the_brush_in_the_view_without_opening_any_window
    result=paint('sheet')
    assert_equal true,result['toolState']['active']
    assert_equal 0,UI.vista_dialogs;assert_empty UI.vista_messages
    assert_nil @controller.instance_variable_get(:@palette_dialog);assert_nil @controller.instance_variable_get(:@dialog)
    assert_instance_of VistaToolDouble,tool
    assert_equal 'sheet',tool.options['mode'];assert_equal true,tool.options['immediate']
    assert_nil tool.options['catalogId'],'sin material recordado, el pincel arranca sin material'
    %i[swatches pick_material native_material select_material recents].each { |key| assert_respond_to tool.args[key],:call }
    assert_empty @prepared
  end

  def test_canto_from_the_toolbar_starts_edge_mode_with_the_remembered_count
    write_prefs('edgeCount'=>4)
    paint('edge')
    assert_equal 'edge',tool.options['mode'];assert_equal 4,tool.options['edgeCount'];assert_equal 0,UI.vista_dialogs
  end

  def test_remembered_ready_material_is_reused_and_an_installable_one_is_never_installed_by_the_toolbar
    write_prefs('lastMaterials'=>{'sheet'=>'placa'})
    paint('sheet')
    assert_equal 'placa',tool.options['catalogId'];assert_equal 'uuid-placa',tool.options['materialUuid']
    write_prefs('lastMaterials'=>{'sheet'=>'nueva'})
    with_tool { @controller.send(:stop_smart_tool) }
    paint('sheet')
    assert_nil tool.options['catalogId'];refute(@prepared.any? { |id,| id=='nueva' })
    assert_includes @installable,'nueva'
  end

  def test_swatches_list_ready_materials_first_with_their_color_then_installable_ones
    paint('sheet')
    rows=with_tool { tool.args[:swatches].call('sheet') }
    assert_equal %w[placa nueva],rows.map { |row| row['catalogId'] }
    assert_equal ['ready','installable'],rows.map { |row| row['state'] }
    assert_equal [240,240,235],rows.first['color'];assert_equal 'uuid-placa',rows.first['materialUuid']
    assert_nil rows.last['color'];assert_equal '',rows.last['materialUuid']
    assert_equal ['canto'],with_tool { tool.args[:swatches].call('edge') }.map { |row| row['catalogId'] }
  end

  def test_choosing_an_installable_swatch_installs_it_without_a_window_and_remembers_it
    paint('sheet')
    options=with_tool { tool.args[:pick_material].call('nueva','sheet') }
    assert_equal 'nueva',options['catalogId'];assert_equal 'uuid-nueva',options['materialUuid']
    assert_includes @prepared,['nueva','sheet',true]
    assert_equal 'nueva',@controller.smart_settings['lastMaterials']['sheet']
    assert_equal 0,UI.vista_dialogs
  end

  def test_a_bound_material_chosen_in_the_materials_tray_becomes_the_brush_material
    paint('sheet')
    options=with_tool { tool.args[:native_material].call(@natives[1]) }
    assert_equal 'edge',options['mode'];assert_equal 'canto',options['catalogId'];assert_equal 'uuid-canto',options['materialUuid']
  end

  def test_an_unbound_material_from_the_tray_explains_why_it_cannot_be_used
    paint('sheet')
    error=assert_raises(PlanosSanto::ExportError) { with_tool { tool.args[:native_material].call(@natives[2]) } }
    assert_match(/«Pintura de SketchUp» no está en la biblioteca de Planos Santo/,error.message)
    assert_equal 0,UI.vista_dialogs
  end

  def test_painting_needs_no_analysis_and_no_saved_guide_but_open_library_edits_still_block
    @controller.instance_variable_set(:@dirty,true);@controller.instance_variable_set(:@analysis_stale,true)
    assert_nil @controller.paint_block_reason('sheet')
    result=paint('sheet')
    assert_equal true,result['toolState']['active']
    with_tool { tool.args[:guard].call } # the in-view guard does not ask for the guide
    @controller.instance_variable_set(:@workshop_dirty,true)
    assert_raises(PlanosSanto::ExportError) { with_tool { tool.args[:guard].call } }
    assert_match(/biblioteca o pedido/,@controller.paint_block_reason('sheet'))
    assert_equal 1,@controller.paint_validation('sheet') # MF_GRAYED
  end

  def test_toolbar_again_stops_the_brush
    paint('sheet');first=tool
    result=paint('sheet')
    assert result['toggleOff'];assert_equal false,result['toolState']['active'];assert_equal 1,first.stops
    assert_includes Sketchup.vista_status,'Pintura terminada.'
  end

  def test_after_switching_models_the_brush_follows_the_active_model_unless_the_guide_has_unsaved_edits
    paint('sheet')
    other=NamesFixture.model;natives=@natives;selected=@selected
    other.define_singleton_method(:materials) { natives }
    other.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    Sketchup.vista_model=other
    paint('edge')
    assert_same other,@controller.instance_variable_get(:@model);assert_equal 'edge',tool.options['mode']
    Sketchup.vista_model=@model;@controller.instance_variable_set(:@dirty,true)
    result=paint('sheet')
    assert_match(/guía tiene cambios sin guardar/,result['error'])
    assert_empty UI.vista_messages,'un error del pincel va a la barra de estado, no a un cuadro'
    assert_match(/guía tiene cambios sin guardar/,Sketchup.vista_status.last)
  end

  def test_the_paint_palette_is_still_available_from_the_menu
    with_tool { @controller.open_paint_palette }
    assert_equal 1,UI.vista_dialogs
    refute_nil @controller.instance_variable_get(:@palette_dialog)
  end
end
