# frozen_string_literal: true
# Hito 7 · pincel avanzado (docs/hito2-pincel/DISENO_AVANZADO.md §3): contratos del
# controlador con dobles de la API. Nunca abre SketchUp ni un .skp; la herramienta
# real (SmartPaintTool) se reemplaza por un doble que registra kwargs y llamadas.
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
# Doble de la API nueva de SmartPaintTool (§2): constructor con select_material/recents/eyedropper_key,
# set_view_options, eyedropper_key= y el método de clase toggle_transparency.
class AvanzadoToolDouble
  class << self;attr_accessor :transparency,:toggled,:toggle_error;end
  def self.toggle_transparency(model);raise toggle_error if toggle_error;(self.toggled||=[]) << model;self.transparency=!transparency;end
  attr_reader :options,:args,:stops,:updates,:views,:keys
  def initialize(_model,**args);@args=args;@options=args[:options];@stops=0;@updates=0;@views=[];@keys=[];end
  def activate;@args[:on_event].call('active'=>true,'mode'=>@options['mode'],'options'=>@options);end
  def immediate?;@options['immediate']==true;end
  def update_options(options);@updates+=1;@options=options;@args[:on_event].call('active'=>true,'mode'=>options['mode'],'options'=>@options);end
  def set_view_options(options);@views << options;@args[:on_event].call('missing'=>{'enabled'=>options['highlightMissing'],'withoutSheet'=>0,'evaluated'=>0,'truncated'=>false});end
  def eyedropper_key=(key);@keys << key;end
  def stop;@stops+=1;@args[:on_event].call('active'=>false,'queuedCount'=>0);end
end
class PincelAvanzadoControllerTest < Minitest::Test
  Color=Struct.new(:red,:green,:blue)
  Native=Struct.new(:uuid,:color)
  PREFS=['PlanosSanto','smart_paint_settings_v2'].freeze
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;Sketchup.hito2_model=@model;Sketchup.hito2_prefs={}
    @natives=[];natives=@natives;@model.define_singleton_method(:materials) { natives }
    @selected=[];selected=@selected
    @model.define_singleton_method(:select_tool) { |tool| selected << tool;tool.activate if tool }
    @controller=PlanosSanto::OfflineController.new
    @ready={'placa'=>'uuid-placa','canto'=>'uuid-canto','placa2'=>'uuid-placa2','placa3'=>'uuid-placa3'}
    @kinds={'placa'=>'sheet','canto'=>'edge','placa2'=>'sheet','placa3'=>'sheet','nueva'=>'sheet','rota'=>'sheet'}
    @installable=['nueva'];@broken=['rota']
    @prepared=[];ready=@ready;kinds=@kinds;prepared=@prepared;installable=@installable;broken=@broken
    @paint=Object.new
    @paint.define_singleton_method(:states) { ready.to_h { |id,uuid| [id,{'state'=>'ready','materialUuid'=>uuid}] } }
    @paint.define_singleton_method(:state) do |id|
      raise PlanosSanto::ExportError,'Catálogo ilegible.' if broken.include?(id)
      next {'state'=>'installable','message'=>'Se instala al elegirlo en la paleta.'} if installable.include?(id)
      ready[id] ? {'state'=>'ready','materialUuid'=>ready[id]} : nil
    end
    @paint.define_singleton_method(:prepare) do |id,mode|
      raise PlanosSanto::ExportError,'La ficha del material ya no existe en la biblioteca.' unless ready[id]
      raise PlanosSanto::ExportError,'Tipo equivocado.' unless kinds[id]==mode
      prepared << [id,mode];{'catalogId'=>id,'materialUuid'=>ready[id],'installed'=>false,'message'=>'Material activo.'}
    end
    @items=kinds.map { |id,kind| {'id'=>id,'name'=>"Nombre #{id}",'kind'=>kind} };items=@items
    @catalog=Object.new;@catalog.define_singleton_method(:read) { {'schema'=>1,'revision'=>1,'items'=>items} }
    AvanzadoToolDouble.transparency=false;AvanzadoToolDouble.toggled=[];AvanzadoToolDouble.toggle_error=nil
    @controller.quick_action('sheet')
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  # Reemplaza la constante: el controlador resuelve SmartPaintTool en tiempo de ejecución.
  def with_tool
    original=PlanosSanto::SmartPaintTool
    PlanosSanto.send(:remove_const,:SmartPaintTool);PlanosSanto.const_set(:SmartPaintTool,AvanzadoToolDouble)
    PlanosSanto::PaintMaterials.stub(:new,@paint) do
      PlanosSanto::SmartPaint.stub(:new,Object.new) do
        PlanosSanto::CatalogStore.stub(:new,@catalog) do
          PlanosSanto::MaterialResolver.stub(:observe_binding,lambda { |material| {'status'=>'valid','binding'=>{'uuid'=>material.uuid}} }) { yield }
        end
      end
    end
  ensure
    PlanosSanto.send(:remove_const,:SmartPaintTool);PlanosSanto.const_set(:SmartPaintTool,original)
  end
  def quick(data);with_tool { @controller.dispatch('smart_quick_start',data) };end
  def act(action,data={});with_tool { @controller.dispatch(action,data) };end
  def tool;@selected.compact.last;end
  def immediate(mode,id);{'mode'=>mode,'immediate'=>true,'immediatePiece'=>mode=='sheet','catalogId'=>id,'scope'=>'unique','side'=>'both'};end
  def write_prefs(settings);Sketchup.hito2_prefs[PREFS]='ps2:'+Base64.strict_encode64(JSON.generate('schema'=>2,'settings'=>settings));end
  def stored_bytes;Base64.strict_decode64(Sketchup.hito2_prefs[PREFS].delete_prefix('ps2:')).bytesize;end
  def refute_stale
    refute @controller.instance_variable_get(:@analysis_stale);refute @controller.smart_state['changed']
  end

  def test_recent_materials_go_to_the_front_without_duplicates_and_at_most_six_per_mode
    %w[a b c d e f g].each { |id| @controller.remember_smart_settings(immediate('sheet',id)) }
    @controller.remember_smart_settings(immediate('edge','k1'));@controller.remember_smart_settings(immediate('edge','k2'))
    assert_equal({'sheet'=>%w[g f e d c b],'edge'=>%w[k2 k1]},@controller.smart_settings['recentMaterials'])
    @controller.remember_smart_settings(immediate('sheet','d'))
    assert_equal %w[d g f e c b],@controller.smart_settings['recentMaterials']['sheet']
    # remove_edge, sin catalogId o fuera del modo inmediato no tocan la lista.
    @controller.remember_smart_settings(immediate('remove_edge','x'))
    @controller.remember_smart_settings(immediate('sheet',''))
    @controller.remember_smart_settings('mode'=>'sheet','catalogId'=>'avanzado','scope'=>'unique','side'=>'front','axes'=>[0,1])
    assert_equal({'sheet'=>%w[d g f e c b],'edge'=>%w[k2 k1]},@controller.smart_settings['recentMaterials'])
    # Las opciones nunca inyectan una lista propia.
    @controller.remember_smart_settings(immediate('edge','k3').merge('recentMaterials'=>{'edge'=>['intrusa']}))
    assert_equal %w[k3 k2 k1],@controller.smart_settings['recentMaterials']['edge']
  end

  def test_recent_materials_and_eyedropper_key_are_sanitized_when_read
    long='x'*201
    write_prefs('recentMaterials'=>{'sheet'=>['a',7,'',long,'a',nil,'b','c','d','e','f','g'],'edge'=>'canto','otro'=>['z']},'eyedropperKey'=>'ctrl')
    settings=@controller.smart_settings
    assert_equal({'sheet'=>%w[a b c d e f]},settings['recentMaterials']);refute settings.key?('eyedropperKey')
    write_prefs('recentMaterials'=>['a'],'eyedropperKey'=>:shift.to_s)
    settings=@controller.smart_settings;refute settings.key?('recentMaterials');assert_equal 'shift',settings['eyedropperKey']
    write_prefs('recentMaterials'=>{'sheet'=>[],'edge'=>[{'id'=>'a'}]},'eyedropperKey'=>['alt'])
    settings=@controller.smart_settings;refute settings.key?('recentMaterials');refute settings.key?('eyedropperKey')
    write_prefs('eyedropperKey'=>'ALT');refute @controller.smart_settings.key?('eyedropperKey')
  end

  def test_preferences_stay_within_4096_bytes_with_full_lists
    write_prefs('eyedropperKey'=>'shift')
    ids=->(prefix) { (1..7).map { |n| "#{prefix}#{n}".ljust(200,'z') } }
    ids.('s').each { |id| @controller.remember_smart_settings(immediate('sheet',id).merge('edgeCount'=>4)) }
    ids.('e').each { |id| @controller.remember_smart_settings(immediate('edge',id).merge('edgeCount'=>4)) }
    assert_operator stored_bytes,:<=,4096
    settings=@controller.smart_settings
    assert_equal ids.('s').last(6).reverse,settings['recentMaterials']['sheet'];assert_equal ids.('e').last(6).reverse,settings['recentMaterials']['edge']
    assert_equal 'shift',settings['eyedropperKey'];assert_equal 4,settings['edgeCount']
    assert_equal({'sheet'=>ids.('s').last,'edge'=>ids.('e').last},settings['lastMaterials'])
  end

  def test_tool_start_passes_select_material_recents_and_eyedropper_key
    quick('mode'=>'sheet','catalogId'=>'placa')
    assert_respond_to tool.args[:select_material],:call;assert_respond_to tool.args[:recents],:call
    assert_equal 'alt',tool.args[:eyedropper_key]
    act('smart_tool_stop');write_prefs(@controller.smart_settings.merge('eyedropperKey'=>'shift'))
    quick('mode'=>'edge','catalogId'=>'canto')
    assert_equal 'shift',tool.args[:eyedropper_key];assert_equal 2,@selected.compact.length
  end

  def test_select_material_never_installs_and_remembers_the_choice
    quick('mode'=>'sheet','catalogId'=>'placa','scope'=>'all','allowShared'=>true);@prepared.clear
    select=tool.args[:select_material]
    options=with_tool { select.call('placa2','sheet') }
    assert_equal %w[placa2 uuid-placa2 sheet unique],options.values_at('catalogId','materialUuid','mode','scope');assert_equal false,options['allowShared']
    assert_equal true,options['immediate'];assert_equal [['placa2','sheet']],@prepared
    settings=@controller.smart_settings
    assert_equal %w[placa2 placa],settings['recentMaterials']['sheet'];assert_equal 'placa2',settings['lastMaterials']['sheet'];assert_equal 'unique',settings['scope']
    # Instalable (no listo): rechazado con el motivo, sin prepare (install:false).
    @prepared.clear
    error=assert_raises(PlanosSanto::ExportError) { with_tool { select.call('nueva','sheet') } }
    assert_equal 'Se instala al elegirlo en la paleta.',error.message;assert_empty @prepared
    assert_raises(PlanosSanto::ExportError) { with_tool { select.call('placa','remove_edge') } }
    assert_raises(PlanosSanto::ExportError) { with_tool { select.call('','sheet') } }
    assert_raises(PlanosSanto::ExportError) { with_tool { select.call(7,'sheet') } }
    assert_raises(PlanosSanto::ExportError) { with_tool { select.call('canto','sheet') } }
    assert_equal %w[placa2 placa],@controller.smart_settings['recentMaterials']['sheet']
    options=with_tool { select.call('canto','edge') };assert_equal %w[edge uuid-canto],options.values_at('mode','materialUuid')
    # Una herramienta vieja (otra generación) no puede elegir.
    act('smart_tool_stop');@prepared.clear
    assert_raises(PlanosSanto::ExportError) { with_tool { select.call('placa','sheet') } };assert_empty @prepared
    assert_empty @model.operations
  end

  def test_recents_return_only_ready_named_materials_with_rgb_and_skip_failures
    @natives.push(Native.new('uuid-placa',Color.new(10,20,30)),Native.new('uuid-placa2',[40,50,60,255]),Native.new('uuid-canto',Color.new(1,2,3)))
    %w[placa3 rota nueva fantasma placa2 placa].each { |id| @controller.remember_smart_settings(immediate('sheet',id)) }
    @controller.remember_smart_settings(immediate('edge','canto'))
    quick('mode'=>'sheet','catalogId'=>'placa');@prepared.clear
    recents=with_tool { tool.args[:recents].call('sheet') }
    assert_equal [{'catalogId'=>'placa','materialUuid'=>'uuid-placa','name'=>'Nombre placa','color'=>[10,20,30]},
                  {'catalogId'=>'placa2','materialUuid'=>'uuid-placa2','name'=>'Nombre placa2','color'=>[40,50,60]}],recents
    assert_equal [{'catalogId'=>'canto','materialUuid'=>'uuid-canto','name'=>'Nombre canto','color'=>[1,2,3]}],with_tool { tool.args[:recents].call('edge') }
    assert_equal [],with_tool { tool.args[:recents].call('remove_edge') }
    assert_empty @prepared # nunca instala ni prepara
    JSON.generate(recents) # lista pública: solo tipos JSON
  end

  def test_tool_view_validates_and_neither_stops_the_tool_nor_marks_stale
    quick('mode'=>'sheet','catalogId'=>'placa')
    [{},{'highlightMissing'=>'true'},{'highlightMissing'=>1},{'highlightMissing'=>true,'otra'=>1},nil].each do |bad|
      assert_raises(PlanosSanto::ExportError) { act('smart_tool_view',bad) }
    end
    assert_empty tool.views
    result=act('smart_tool_view','highlightMissing'=>true)
    assert_equal [{'highlightMissing'=>true}],tool.views;assert_equal true,result['toolState']['missing']['enabled'];assert_equal true,result['toolState']['active']
    act('smart_tool_view','highlightMissing'=>false);assert_equal 2,tool.views.length
    assert_equal 0,tool.stops;assert_equal 1,@selected.compact.length;refute_stale;refute act('smart_tool_status').key?('stale')
    # Sin herramienta inmediata activa: no falla y no arranca nada.
    act('smart_tool_stop');result=act('smart_tool_view','highlightMissing'=>true)
    assert_equal false,result['toolState']['active'];assert_equal 2,tool.views.length;assert_equal 1,@selected.compact.length
  end

  def test_toggle_transparency_calls_the_class_method_without_stopping_or_marking_stale
    quick('mode'=>'edge','catalogId'=>'canto')
    result=act('smart_toggle_transparency')
    assert_equal true,result['transparency'];assert_equal true,result['toolState']['transparency'];assert_equal true,result['toolState']['active']
    assert_equal false,act('smart_toggle_transparency')['transparency']
    assert_equal [@model,@model],AvanzadoToolDouble.toggled
    assert_equal 0,tool.stops;refute_stale;assert_empty @model.operations
    AvanzadoToolDouble.toggle_error=PlanosSanto::ExportError.new('Esta versión de SketchUp no permite cambiar la transparencia desde el pincel.')
    error=assert_raises(PlanosSanto::ExportError) { act('smart_toggle_transparency') };assert_match(/transparencia/,error.message)
    assert_equal 0,tool.stops
  end

  def test_eyedropper_key_validates_remembers_and_updates_the_active_tool
    quick('mode'=>'sheet','catalogId'=>'placa')
    ['ctrl','ALT',nil,:alt,1].each { |bad| assert_raises(PlanosSanto::ExportError) { act('smart_eyedropper_key','key'=>bad) } }
    assert_raises(PlanosSanto::ExportError) { act('smart_eyedropper_key',nil) }
    assert_empty tool.keys;refute @controller.smart_settings.key?('eyedropperKey')
    result=act('smart_eyedropper_key','key'=>'shift')
    assert_equal 'shift',result['settings']['eyedropperKey'];assert_equal true,result['toolState']['active'];assert_equal ['shift'],tool.keys
    assert_equal 'placa',result['settings']['lastMaterials']['sheet'] # recordar la tecla no pierde lo demás
    assert_equal 0,tool.stops;refute_stale
    # La tecla sobrevive a otros recuerdos y llega a la próxima herramienta.
    quick('mode'=>'sheet','catalogId'=>'placa2');assert_equal 'shift',@controller.smart_settings['eyedropperKey']
    act('smart_tool_stop');act('smart_eyedropper_key','key'=>'alt');assert_equal ['shift'],tool.keys
    quick('mode'=>'sheet','catalogId'=>'placa');assert_equal 'alt',tool.args[:eyedropper_key]
    assert_equal 'alt',act('smart_palette_load')['settings']['eyedropperKey']
  end

  def test_palette_load_reports_the_model_x_ray_state_without_a_tool
    act('smart_tool_stop');options={'ModelTransparency'=>true};@model.define_singleton_method(:rendering_options) { options }
    assert_equal true,act('smart_palette_load')['toolState']['transparency']
    options['ModelTransparency']=false;assert_equal false,act('smart_palette_load')['toolState']['transparency']
    @model.define_singleton_method(:rendering_options) { raise 'sin vista' };refute act('smart_palette_load')['toolState'].key?('transparency')
    assert_empty @model.operations
  end
end
