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
  def self.send_action(_action);true;end
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

  # 0.8.26: «Dibujar pieza» selects the drawing tool; no native dialog and no
  # selection needed. A locked open container blocks it with a reason.
  def test_component_selects_the_drawing_tool_without_dialog_or_selection
    @model.selection.clear;tools=[];@model.define_singleton_method(:select_tool) { |tool| tools << tool }
    Sketchup.stub(:send_action,->(_action) { flunk 'no native dialog' }) do
      assert_equal({'opened'=>true,'tool'=>'draw_component'},@controller.create_component)
    end
    assert_instance_of PlanosSanto::DrawComponentTool,tools.last;refute @controller.component_active?
    assert_nil @controller.component_block_reason
    @model.active_path=[@model.entities[0]];@model.entities[0].locked_for_names=true
    assert_match(/bloqueado/,@controller.component_block_reason)
    assert_raises(PlanosSanto::ExportError) { @controller.create_component }
    assert_equal 1,tools.length
    Sketchup.vista_model=nil
    assert_match(/Abrí un modelo/,@controller.component_block_reason)
  ensure
    @model.entities[0].locked_for_names=false;@model.active_path=nil
  end
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

  def test_main_dialog_request_activates_the_same_brush_without_blocking_itself
    replies=[]
    @controller.define_singleton_method(:reply) { |id,**payload| replies << payload.merge(id:id) }
    with_tool { @controller.handle(JSON.generate('version'=>1,'id'=>'rail-paint','action'=>'paint_in_view','data'=>{})) }
    assert_nil replies.last[:error]
    assert_nil replies.last.dig(:result,'error')
    assert_equal true,replies.last.dig(:result,'toolState','active')
    assert_equal 0,UI.vista_dialogs
    assert_instance_of VistaToolDouble,tool
    @controller.instance_variable_set(:@busy,true)
    with_tool { @controller.handle(JSON.generate('version'=>1,'id'=>'concurrent','action'=>'paint_in_view','data'=>{})) }
    assert_match(/Esperá/,replies.last[:error])
  ensure
    @controller.instance_variable_set(:@busy,false)
  end

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

  # 0.8.17: un material de la bandeja todavía sin vínculo se vincula solo (como al abrir Materiales) y pasa al pincel.
  def test_an_unbound_tray_material_links_itself_and_becomes_the_brush_material
    paint('sheet');loose=@natives[2]
    linker=Object.new;linker.define_singleton_method(:auto_link!) { loose.bound={'uuid'=>'uuid-suelto','catalogId'=>'placa','kind'=>'sheet'};{'changed'=>1} }
    options=PlanosSanto::MaterialLibrary.stub(:new,linker) { with_tool { tool.args[:native_material].call(loose) } }
    assert_equal 'sheet',options['mode'];assert_equal 'placa',options['catalogId']
    assert_equal 0,UI.vista_dialogs
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
    # 0.8.17 (cortes): the guard runs on every mouse move; an unsaved library
    # edit no longer freezes a running brush. Installing from the strip still waits.
    with_tool { tool.args[:guard].call }
    error=assert_raises(PlanosSanto::ExportError) { with_tool { tool.args[:pick_material].call('nueva','sheet') } }
    assert_match(/biblioteca o pedido antes de instalar/,error.message);assert_includes @installable,'nueva'
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

  # ---- 0.8.17 · punto 1 (placa → canto): the cause lives in the controller.
  def test_cause_tab_callback_refuses_a_remembered_edge_that_is_not_ready_in_this_model
    write_prefs('lastMaterials'=>{'sheet'=>'placa','edge'=>'nueva'})
    paint('sheet')
    error=assert_raises(PlanosSanto::ExportError) { with_tool { tool.args[:switch_mode].call('edge') } }
    assert_equal 'Se instala al elegirlo.',error.message
    assert_includes @installable,'nueva','Tab nunca instala'
  end

  # Same flow with the REAL SmartPaintTool: Tab and the «Pintar cantos» tab reach edge.
  def with_real_tool
    binding_of=lambda { |material| material.respond_to?(:bound) && material.bound ? {'status'=>'valid','binding'=>material.bound} : {'status'=>'absent'} }
    service=Object.new;service.define_singleton_method(:cancel) { nil }
    PlanosSanto::PaintMaterials.stub(:new,@paint) do
      PlanosSanto::SmartPaint.stub(:new,service) do
        PlanosSanto::CatalogStore.stub(:new,@catalog) do
          PlanosSanto::MaterialResolver.stub(:observe_binding,binding_of) { yield }
        end
      end
    end
  end
  def test_with_the_real_brush_tab_from_sheet_reaches_edge_and_shows_the_edges
    write_prefs('lastMaterials'=>{'sheet'=>'placa','edge'=>'nueva'})
    with_real_tool { @controller.paint_in_view('sheet') }
    real=tool;assert_instance_of PlanosSanto::SmartPaintTool,real
    assert_equal 'uuid-placa',real.status['options']['materialUuid']
    with_real_tool { real.onKeyDown(9,1,0,nil) }
    assert_equal 'edge',real.status['mode'];assert_nil real.status['options']['materialUuid']
    assert_equal %w[canto],real.instance_variable_get(:@strip_rows).map { |row| row['catalogId'] }
    assert_equal true,@controller.smart_state['active'];assert_equal 'edge',@controller.smart_state['mode']
    with_real_tool { real.choose_recent(0) }
    assert_equal 'uuid-canto',real.status['options']['materialUuid']
    assert_empty @prepared.select { |id,| id=='nueva' }
  end

  # ---- 0.8.17 · punto 2: actions that answered «Detené Pintura Inteligente…»
  # now stop the brush by themselves and go on.
  def session_double
    session=Object.new
    session.define_singleton_method(:scan) { {'tree'=>{'roots'=>[]}} }
    session.define_singleton_method(:generate) { |ids| {'generated'=>ids} }
    session.define_singleton_method(:save) { |_furniture,_revision,**_options| {'saved'=>true} }
    session.define_singleton_method(:fingerprint) { 'f' }
    session.define_singleton_method(:document) { {} }
    session.define_singleton_method(:skipped_names) { [] }
    session
  end
  def test_saving_the_guide_stops_the_brush_by_itself_and_saves
    paint('sheet');brush=tool
    @controller.instance_variable_set(:@session,session_double)
    @model.define_singleton_method(:path) { '' } unless @model.respond_to?(:path)
    result=with_tool { @controller.dispatch('save',{'furniture'=>[],'revision'=>1}) }
    assert_equal({'saved'=>true},result['guide'])
    assert_equal 1,brush.stops;assert_equal false,@controller.smart_state['active']
    assert_match(/Pintura detenida/,Sketchup.vista_status.last)
  end
  def test_library_changes_stop_the_brush_by_themselves_and_go_on
    workshop=Object.new
    workshop.define_singleton_method(:save_catalog) { |_items,_revision| {'catalog'=>{'items'=>[]}} }
    workshop.define_singleton_method(:add_variant) { |_id,_mm,_revision,name:nil| {'catalog'=>{'items'=>[]}} }
    library=Object.new;library.define_singleton_method(:archive_items) { |_data| {'archived'=>['x']} }
    {'catalog_save'=>{'items'=>[],'revision'=>1},'catalog_variant'=>{'id'=>'placa','thicknessMm'=>18,'revision'=>1},'material_archive'=>{'catalogIds'=>['x'],'archive'=>true}}.each do |action,data|
      paint('sheet');brush=tool
      result=PlanosSanto::Workshop.stub(:new,workshop) do
        @controller.stub(:management_library,library) { with_tool { @controller.dispatch(action,data) } }
      end
      refute result.key?('error'),action
      assert_equal 1,brush.stops,"#{action} detiene el pincel solo"
      assert_equal false,@controller.smart_state['active']
    end
  end
  def test_highlight_stops_the_brush_and_no_longer_asks_to_stop_it_or_reanalyze
    paint('sheet');brush=tool
    @controller.instance_variable_set(:@smart_changed,true);@controller.instance_variable_set(:@analysis_stale,true)
    highlight=VistaToolDouble.new(@model,options:{'mode'=>'highlight'},on_event:lambda { |_event| })
    result=PlanosSanto::PieceHighlightTool.stub(:new,highlight) { with_tool { @controller.dispatch('piece_highlight',{'pieceId'=>'1/11'}) } }
    assert_equal 'highlight',result['toolState']['mode'];assert_equal 1,brush.stops
    assert_same highlight,tool
  end

  # ---- 0.8.17 · punto 3 (cortes): what used to stop the brush by itself.
  def test_the_automatic_reanalysis_after_a_click_keeps_the_brush_painting
    paint('sheet');brush=tool
    PlanosSanto::NativeSession.stub(:new,session_double) { with_tool { @controller.dispatch('scan',{}) } }
    assert_equal 0,brush.stops,'App.tsx reanaliza 1,2 s después de cada clic: el pincel sigue'
    assert_equal true,@controller.smart_state['active'];assert_same brush,@controller.instance_variable_get(:@smart_tool)
    with_tool { brush.args[:guard].call }
    # The automatic refresh then regenerates the open guides: read-only, the brush keeps painting.
    assert_equal({'generated'=>['1']},with_tool { @controller.dispatch('generate',{'ids'=>['1']}) })
    assert_equal 0,brush.stops
  end
  def test_a_reanalysis_of_another_model_still_stops_the_brush
    paint('sheet');brush=tool
    other=NamesFixture.model;natives=@natives;other.define_singleton_method(:materials) { natives }
    other.define_singleton_method(:select_tool) { |_tool| }
    Sketchup.vista_model=other
    PlanosSanto::NativeSession.stub(:new,session_double) { with_tool { @controller.dispatch('scan',{}) } }
    assert_equal 1,brush.stops
  end
  def test_closing_the_main_window_or_the_palette_keeps_the_brush_of_the_toolbar
    paint('sheet');brush=tool
    with_tool { @controller.show }
    with_tool { @controller.instance_variable_get(:@dialog).close }
    assert_equal 0,brush.stops;refute_nil @controller.instance_variable_get(:@session)
    with_tool { brush.args[:guard].call } # still paints: the session was kept
    with_tool { @controller.open_paint_palette }
    with_tool { @controller.instance_variable_get(:@palette_dialog).close }
    assert_equal 0,brush.stops;assert_equal true,@controller.smart_state['active']
  end
end
