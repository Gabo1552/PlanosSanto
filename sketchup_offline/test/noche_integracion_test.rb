# frozen_string_literal: true
# QA de integración de la noche: flujos que cruzan el pincel diario (Hito 2),
# ModelWatch y el aviso de análisis desactualizado (Hito 6), la gestión de
# materiales (Hito 7) y las ventanas. Dobles de la API; no es SketchUp nativo.
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
  class AppObserver;end
  class << self;attr_accessor :noche_model,:noche_prefs,:noche_focus;end
  def self.active_model;noche_model;end
  def self.add_observer(_observer);true;end
  def self.read_default(section,key,default);(noche_prefs||{}).fetch([section,key],default);end
  def self.write_default(section,key,value);self.noche_prefs||={};noche_prefs[[section,key]]=value;end
  def self.focus;self.noche_focus=(noche_focus||0)+1;true;end
end
module UI
  class << self;attr_accessor :noche_timers;end
  def self.start_timer(_delay,_repeat,&block);(self.noche_timers||=[]) << block;noche_timers.length;end
  def self.stop_timer(_id);end
  def self.messagebox(_message);end
  def self.openpanel(*_args);nil;end
  class HtmlDialog
    STYLE_DIALOG=0
    attr_reader :scripts,:sizes
    def initialize(_options={});@scripts=[];@sizes=[];@visible=false;end
    def set_file(_path);end
    def add_action_callback(_name,&_block);end
    def set_can_close(&block);@can_close=block;end
    def set_on_closed(&block);@on_closed=block;end
    def show;@visible=true;end
    def visible?;@visible;end
    def bring_to_front;end
    def set_size(*size);@sizes << size;end
    def execute_script(script);@scripts << script;end
    def close;@visible=false;@on_closed&.call;end
    def events(name)
      scripts.select { |script| script.include?("'#{name}'") }.map { |script| JSON.parse(JSON.parse(script[/JSON\.parse\((".*")\)\}\)\)\z/,1])) }
    end
  end
end
require_relative '../build/planos_santo/offline'

class NocheToolDouble
  attr_reader :args
  def configure(args);@args=args;self;end
  def activate(_view=nil);args[:on_event].call('active'=>true,'queuedCount'=>0);end
  def stop;args[:on_event].call('active'=>false,'queuedCount'=>0);end
  def immediate?;true;end
  def status;{'options'=>args[:options]};end
  def update_options(options);args[:options]=options;end
  # A real click commits a native operation (the observer sees it) and then
  # reports the change to the controller.
  def click(model_observer)
    model_observer&.onTransactionCommit(nil)
    args[:on_event].call('changed'=>true,'active'=>true,'queuedCount'=>0)
  end
end

class NocheIntegracionTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old_dir=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model)
    @model.materials.each { |material| material.define_singleton_method(:name) { display_name } }
    @model.define_singleton_method(:select_tool) { |tool| tool&.activate }
    observers=@observers=[]
    @model.define_singleton_method(:add_observer) { |observer| observers << observer;true }
    @model.define_singleton_method(:remove_observer) { |observer| observers.delete(observer);true }
    Sketchup.noche_model=@model;Sketchup.noche_prefs={};Sketchup.noche_focus=0;UI.noche_timers=[]
    @controller=PlanosSanto::OfflineController.new
    @tool=NocheToolDouble.new
  end

  def teardown
    ENV['PLANOS_SANTO_DATA_DIR']=@old_dir;FileUtils.remove_entry(@dir)
  end

  def editor!
    @dialog=UI::HtmlDialog.new;@dialog.show
    @controller.instance_variable_set(:@dialog,@dialog)
    @controller.dispatch('scan',{})
  end

  # The real window of show_palette, with its on_closed handler.
  def palette!
    @controller.show_palette
    @palette=@controller.instance_variable_get(:@palette_dialog)
    @controller.instance_variable_set(:@palette_ready,true)
  end

  def watch;@controller.instance_variable_get(:@model_watch);end
  def model_observer;@observers.find { |observer| observer.is_a?(PlanosSanto::ModelWatch::ModelObserver) };end
  def stale_events;@dialog.events('planos-santo-analysis-state');end

  def request(action,data={},source=@dialog)
    @controller.handle(JSON.generate('version'=>1,'id'=>action,'action'=>action,'data'=>data),source:source)
    script=source.scripts.reverse.find { |text| text.include?('PlanosSantoBridge.receive(') }
    JSON.parse(JSON.parse(script[/JSON\.parse\((".*")\)\)\z/,1]))
  end

  def start_tool(source=@dialog)
    tool=@tool
    options={'mode'=>'sheet','side'=>'both','scope'=>'unique','axes'=>[0,1],'batch'=>false,'confirmed'=>true,
             'immediate'=>true,'immediatePiece'=>true,'catalogId'=>'chosen','materialUuid'=>'project-only'}
    reply=PlanosSanto::SmartPaintTool.stub(:new,lambda { |*_args,**kwargs| tool.configure(kwargs) }) { request('smart_tool_start',{'options'=>options},source) }
    assert_nil reply['error'];assert_equal true,reply['result']['toolState']['active']
  end

  def counting_fingerprint
    calls=0
    PlanosSanto::ModelWatch.stub(:fingerprint,->(_model) { calls+=1;'otra-huella' }) { yield }
    calls
  end

  # Hito 2 × Hito 6: the pincel paints from a native Tool callback, outside
  # handle(), so ModelWatch sees its commit. That own write must read as
  # «Pintaste desde Planos Santo.» and must not walk the model (DISENO §1.6).
  def test_pincel_click_is_an_own_write_paint_reason_without_walking_the_model
    editor!;start_tool
    @tool.click(model_observer)
    assert_equal ['model'],watch.pending_kinds
    walks=counting_fingerprint { watch.flush }
    assert_equal 0,walks,'un clic del pincel no recorre el modelo para la huella'
    assert_equal true,stale_events.last['stale'];assert_equal 'paint',stale_events.last['source']
    assert_equal 'Pintaste desde Planos Santo.',stale_events.last['reason']
    # Clicks in a burst keep the same reason and never walk the model either.
    walks=counting_fingerprint { 3.times { @tool.click(model_observer);watch.flush } }
    assert_equal 0,walks;assert_equal %w[paint],stale_events.map { |event| event['source'] }.uniq
    stopped=request('smart_tool_stop')['result']
    assert_equal true,stopped['stale'];assert_equal 'paint',stale_events.last['source']
  end

  # Hito 2 × ventanas: closing the separate palette stops the Tool without a
  # refresh; the analysis must still read stale (own paint), not fresh.
  def test_closing_the_separate_palette_after_painting_leaves_the_paint_banner
    editor!;palette!;start_tool(@palette)
    @tool.click(model_observer)
    reply=request('palette_close',{},@palette)
    assert_equal true,reply['result']['closed'];refute @palette.visible?
    assert_nil @controller.instance_variable_get(:@palette_dialog)
    assert watch.attached?,'el editor sigue abierto: ModelWatch sigue observando'
    walks=counting_fingerprint { watch.flush }
    assert_equal 0,walks
    assert_equal({'stale'=>true,'reason'=>'Pintaste desde Planos Santo.','source'=>'paint'},@controller.send(:analysis_state))
    assert_equal false,request('smart_tool_status')['result']['toolState']['active']
  end

  # Ventanas × Hito 6 (ARQ-03): the palette alone keeps a session; when it
  # closes the watch is detached. Opening the editor later must observe again
  # so native material edits refresh it (MATERIALES-12) without scanning.
  def test_editor_opened_after_the_palette_closed_observes_the_model_again
    palette!
    @controller.ensure_palette_context!
    assert watch.attached?
    @palette.close
    assert_nil @controller.instance_variable_get(:@palette_dialog)
    assert_nil watch;assert_empty @observers
    @dialog=UI::HtmlDialog.new;@dialog.show;@controller.instance_variable_set(:@dialog,@dialog)
    assert_equal false,request('ui_loading')['result']['ready']
    assert watch&.attached?,'el editor abierto sin analizar vuelve a observar el modelo'
    @controller.model_watch_changed(['materials'])
    assert_equal 'model_watch',@dialog.events('planos-santo-material-library-changed').last['action']
  end

  # Hito 7 × Hito 6: material management requests run inside handle(), so
  # their own transactions never reach ModelWatch; the library is notified
  # once by the action itself, and the banner says «material».
  def test_material_actions_are_suppressed_for_model_watch_and_notify_once
    editor!;palette!
    library=Object.new;observer=model_observer
    library.define_singleton_method(:duplicate) { |_data| observer.onTransactionCommit(nil);{'catalogId'=>'copia','changed'=>true} }
    reply=@controller.stub(:management_library,library) { request('material_duplicate',{'catalogId'=>'x'}) }
    assert_nil reply['error'];assert_empty watch.pending_kinds
    assert_equal %w[material_duplicate],@palette.events('planos-santo-material-library-changed').map { |event| event['action'] }
    assert_equal %w[material_duplicate],@dialog.events('planos-santo-material-library-changed').map { |event| event['action'] }
  end

  # Hito 7 × Hito 2 · 0.8.17: a read-only focus request leaves the pincel
  # painting; a library mutation stops it by itself (no «Detené Pintura
  # Inteligente…») and goes on with its own validation.
  def test_material_mutations_stop_the_pincel_by_themselves_and_viewport_focus_answers
    editor!;palette!;start_tool(@palette)
    assert_equal({'focused'=>true,'method'=>'Sketchup.focus'},request('viewport_focus',{},@palette)['result'])
    assert_equal 1,Sketchup.noche_focus
    assert_equal true,@controller.send(:smart_state)['active']
    error=request('material_archive',{'catalogIds'=>['x']},@palette)['error']
    refute_match(/Detené/,error.to_s);assert_equal 'Indicá si archivar o restaurar.',error
    assert_equal false,@controller.send(:smart_state)['active']
  end

  # F-ARQ-A × Hito 7: a large reply of a user-dialog material action travels
  # in parts after the «working» phase, to the window that asked.
  def test_large_package_preview_travels_in_parts_after_the_picker_phase
    editor!;palette!
    @controller.define_singleton_method(:reply_chunk_bytes) { 96 }
    package=Object.new
    package.define_singleton_method(:preview) { |_path| {'token'=>'t','items'=>Array.new(20) { |i| {'id'=>"m#{i}",'name'=>"Melamina José #{i}"} }} }
    PlanosSanto::MaterialPackage.stub(:new,package) do
      UI.stub(:openpanel,'/tmp/paquete.zip') { @controller.handle(JSON.generate('version'=>1,'id'=>'pkg','action'=>'material_package_preview','data'=>{}),source:@dialog) }
    end
    phases=@dialog.scripts.select { |script| script.include?('phase') && !script.include?('receiveChunk') }
    assert_equal 2,phases.length
    chunks=@dialog.scripts.select { |script| script.include?('receiveChunk') }
    assert_operator chunks.length,:>,2
    assert_operator @dialog.scripts.index(phases.last),:<,@dialog.scripts.index(chunks.first)
    parts=chunks.map { |script| JSON.parse(JSON.parse(script[/receiveChunk\(JSON\.parse\((".*")\)\)\z/,1])) }
    reply=JSON.parse(parts.map { |part| part['data'] }.join)
    assert_equal 'pkg',reply['id'];assert_nil reply['error'];assert_equal 'Melamina José 19',reply['result']['items'].last['name']
    assert_empty @palette.scripts.select { |script| script.include?('receiveChunk') }
  end

  # Ventanas × Hito 2 × Hito 6: opening Pintar in the main window claims the
  # painting from the separate palette (closes it, stops its Tool without a
  # refresh). The paint already done keeps the banner; ModelWatch stays on.
  def test_main_window_claim_after_palette_painting_keeps_the_paint_banner
    editor!;palette!;start_tool(@palette)
    @tool.click(model_observer)
    loaded=request('smart_palette_load',{'claim'=>true})
    assert_nil loaded['error'];assert_equal false,loaded['result']['toolState']['active']
    refute @palette.visible?;assert_nil @controller.instance_variable_get(:@palette_dialog)
    assert watch.attached?
    assert_equal 'paint',@controller.send(:analysis_state)['source']
    walks=counting_fingerprint { watch.flush }
    assert_equal 0,walks
  end

  # Hito 7 × Hito 6: the OpenCutList preview writes nothing: no banner, no
  # library notice, no fingerprint walk.
  def test_ocl_sync_preview_never_marks_the_analysis_stale
    editor!;palette!
    library=Object.new
    library.define_singleton_method(:ocl_sync) { |_data| {'dryRun'=>true,'changed'=>3,'materials'=>[],'planDigest'=>'d','noChanges'=>true} }
    reply=@controller.stub(:management_library,library) { request('material_ocl_sync',{'dryRun'=>true}) }
    assert_equal 3,reply['result']['changed']
    assert_empty stale_events;assert_empty @palette.events('planos-santo-material-library-changed')
    assert_equal false,@controller.send(:analysis_state)['stale']
  end

  # Hito 7 × Hito 2 (pendiente de COORDINACION.md): an archived item leaves the
  # paint palette unless this model already uses it; a broken index hides nothing.
  def palette_load_with(archived)
    editor!
    items=%w[activa archivada-en-uso archivada].map { |id| {'id'=>id,'name'=>id,'kind'=>'sheet'} }
    store=Object.new;store.define_singleton_method(:read) { {'schema'=>1,'revision'=>4,'items'=>items} }
    visuals=Object.new;visuals.define_singleton_method(:status) { {'materials'=>[{'id'=>'m1','binding'=>{'catalogId'=>'archivada-en-uso','uuid'=>'u','kind'=>'sheet'}}]} }
    states=Object.new;states.define_singleton_method(:states) { {} }
    library=Object.new;library.define_singleton_method(:archived_ids) { archived.call }
    PlanosSanto::CatalogStore.stub(:new,store) do
      PlanosSanto::MaterialLibrary.stub(:new,visuals) do
        @controller.stub(:paint_materials,states) do
          @controller.stub(:material_thumbnails,{}) do
            @controller.stub(:management_library,library) { request('smart_palette_load') }
          end
        end
      end
    end
  end
  def test_archived_items_leave_the_paint_palette_unless_the_model_uses_them
    reply=palette_load_with(-> { %w[archivada archivada-en-uso] })
    assert_nil reply['error']
    assert_equal %w[activa archivada-en-uso],reply['result']['catalog']['items'].map { |item| item['id'] }
    assert_equal 4,reply['result']['catalog']['revision']
    reply=palette_load_with(-> { raise PlanosSanto::ExportError,'Índice dañado' })
    assert_equal %w[activa archivada-en-uso archivada],reply['result']['catalog']['items'].map { |item| item['id'] }
  end

  # Barra rápida × Hito 6: the toolbar runs outside handle(); switching to a
  # non-paint destination stops the pincel and reports the paint reason.
  def test_toolbar_switch_after_painting_keeps_the_paint_reason
    editor!;start_tool
    @tool.click(model_observer)
    @controller.stub(:show,nil) { @controller.quick_action('guides') }
    assert_equal 'paint',stale_events.last['source']
    assert_equal false,@controller.send(:smart_state)['active']
  end
end
