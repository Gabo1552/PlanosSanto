# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'fake_model'
$LOADED_FEATURES << 'sketchup.rb'
MB_YESNO = 4
IDYES = 6
module Kernel
  def file_loaded?(_file); true; end
end
module UI
  def self.messagebox(*_args); 7; end
  def self.savepanel(*_args); nil; end
  def self.start_timer(_delay,_repeat,&block); (@timers||=[]) << block; end
  def self.reset_timers; @timers=[]; end
  def self.flush_timers; jobs=@timers||[];@timers=[];jobs.each(&:call); end
  class HtmlDialog
    STYLE_DIALOG = 0
    attr_reader :file, :callbacks, :script, :front_count, :scripts
    def initialize(_options); @callbacks = {}; @visible = false; @front_count = 0; end
    def set_file(path); @file = path; end
    def add_action_callback(name, &block); @callbacks[name] = block; end
    def set_can_close(&block); @can_close = block; end
    def set_on_closed(&block); @closed = block; end
    def show; @visible = true; end
    def visible?; @visible; end
    def bring_to_front; @front_count += 1; end
    def execute_script(script); @script = script; (@scripts ||= []) << script; end
    def close; try_close; end
    def try_close
      return false unless @can_close.call
      @visible = false; @closed.call; true
    end
  end
end
require_relative '../build/planos_santo/offline'

class NativeControllerTest < Minitest::Test
  def setup; UI.reset_timers; @controller = PlanosSanto::OfflineController.new; @controller.show; @dialog = @controller.instance_variable_get(:@dialog); end
  def test_local_assets_single_window_and_callback_recreated_after_close
    assert File.file?(@dialog.file)
    assert_equal ['request'], @dialog.callbacks.keys
    @controller.show
    assert_same @dialog, @controller.instance_variable_get(:@dialog)
    assert_equal 1, @dialog.front_count
    assert @dialog.try_close
    @controller.show
    refute_same @dialog, @controller.instance_variable_get(:@dialog)
    assert_equal ['request'], @controller.instance_variable_get(:@dialog).callbacks.keys
  end
  def test_unsaved_guide_blocks_close_when_operator_declines_discard
    @controller.handle(JSON.generate({ 'version' => 1, 'id' => 'dirty', 'action' => 'dirty', 'data' => { 'value' => true } }))
    refute @dialog.try_close
    @controller.handle(JSON.generate({ 'version' => 1, 'id' => 'clean', 'action' => 'dirty', 'data' => { 'value' => false } }))
    assert @dialog.try_close
  end
  def test_reply_roundtrips_quoted_model_text_as_data
    value = { 'text' => "\"</script><script>evil()</script>\\\n\u2028" }
    @controller.reply('request-id', result: value)
    prefix = 'window.PlanosSantoBridge.receive(JSON.parse('
    assert @dialog.script.start_with?(prefix)
    literal = @dialog.script.delete_prefix(prefix).delete_suffix('))')
    assert_equal value, JSON.parse(JSON.parse(literal))['result']
  end
  def save_payload
    model=NativeModelDouble.new(Fixture.model)
    model.define_singleton_method(:path) { '' }
    Sketchup.define_singleton_method(:active_model) { model }
    @controller.dispatch('scan',{})
    generated=@controller.dispatch('generate',{'ids'=>['1']})
    pieces=[]
    PlanosSanto::Exporter.each_node(generated['document']['furniture']) { |n| pieces << {'id'=>n['id'],'name'=>n['name'],'code'=>"P#{(pieces.length+1).to_s.rjust(2,'0')}"} if n['mesh'] }
    [model,{'furniture'=>[{'id'=>'1','explosion'=>0.45,'zoom'=>1,'pieces'=>pieces,'notes'=>[]}],'revision'=>0,'saveFile'=>false,'closeAfterSave'=>true}]
  end
  def handle_save(data)
    @controller.handle(JSON.generate({'version'=>1,'id'=>'save-close','action'=>'save','data'=>data}))
    literal=@dialog.script.delete_prefix('window.PlanosSantoBridge.receive(JSON.parse(').delete_suffix('))')
    JSON.parse(JSON.parse(literal))
  end
  def test_save_and_close_waits_until_reply_and_successful_commit
    model,data=save_payload;reply=handle_save(data)
    assert_nil reply['error'];assert reply['result']['closeAfterSave'];refute_empty model.attributes
    assert @dialog.visible?;UI.flush_timers;refute @dialog.visible?
  end
  def test_regular_save_keeps_window_open
    _model,data=save_payload;data['closeAfterSave']=false
    reply=handle_save(data);refute reply['result']['closeAfterSave'];UI.flush_timers;assert @dialog.visible?
  end
  def test_invalid_save_keeps_window_and_edits_open
    model,data=save_payload;data['furniture'][0]['pieces'][0]['dimensions']=[1,2,3]
    reply=handle_save(data);assert_includes reply['error'],'dimensions';assert_empty model.attributes
    UI.flush_timers;assert @dialog.visible?
  end
  def test_cancelling_skp_save_keeps_dialog_open
    model,data=save_payload;data['saveFile']=true
    reply=handle_save(data);assert_nil reply['error'];refute reply['result']['modelSaved'];refute reply['result']['closeAfterSave'];refute_empty model.attributes
    UI.flush_timers;assert @dialog.visible?
  end
  def test_successful_skp_save_can_close_and_new_edits_can_prevent_delayed_close
    model,data=save_payload;data['saveFile']=true
    calls=[];model.define_singleton_method(:path) { '/synthetic/test.skp' };model.define_singleton_method(:save) { |path| calls << path;true }
    reply=handle_save(data);assert reply['result']['modelSaved'];assert_equal ['/synthetic/test.skp'],calls
    @controller.handle(JSON.generate({'version'=>1,'id'=>'new-edit','action'=>'dirty','data'=>{'value'=>true}}))
    UI.flush_timers;assert @dialog.visible?
  end

  def messages
    (@dialog.scripts || []).map do |script|
      JSON.parse(JSON.parse(script.delete_prefix('window.PlanosSantoBridge.receive(JSON.parse(').delete_suffix('))')))
    end
  end

  def pdf_request
    _model,data=save_payload
    @controller.handle(JSON.generate({'version'=>1,'id'=>'pdf-test','action'=>'pdf',
      'data'=>{'furniture'=>data['furniture'],'fingerprint'=>@controller.instance_variable_get(:@session).fingerprint,
              'base64'=>Base64.strict_encode64("%PDF-1.4\nsynthetic fixture\n%%EOF")}}))
  end

  def pdf_messages
    messages.select { |message| message['id']=='pdf-test' }
  end

  def test_native_pdf_dialog_brackets_only_human_choice_then_returns_written_file
    Dir.mktmpdir do |folder|
      path=File.join(folder,'guide.pdf')
      UI.stub(:savepanel,lambda { |*_args|
        assert_equal ['waiting_user'],pdf_messages.map { |m| m['phase'] }
        path
      }) { pdf_request }
      assert_equal ['waiting_user','working',nil],pdf_messages.map { |m| m['phase'] }
      assert_nil pdf_messages.last['error']
      assert_equal path,pdf_messages.last['result']['path']
      assert_equal "%PDF-1.4\nsynthetic fixture\n%%EOF",File.binread(path)
      assert_nil @controller.instance_variable_get(:@request_id)
    end
  end

  def test_cancelled_native_pdf_dialog_resumes_and_replies_without_a_file
    UI.stub(:savepanel,nil) { pdf_request }
    assert_equal ['waiting_user','working',nil],pdf_messages.map { |m| m['phase'] }
    assert_equal({'cancelled'=>true},pdf_messages.last['result'])
    assert_nil pdf_messages.last['error']
    refute @controller.instance_variable_get(:@busy)
  end

  def test_dialog_exception_still_resumes_and_reports_error
    UI.stub(:savepanel,lambda { |*_args| raise IOError,'dialog failure' }) { pdf_request }
    assert_equal ['waiting_user','working',nil],pdf_messages.map { |m| m['phase'] }
    assert_includes pdf_messages.last['error'],'IOError'
    assert_nil @controller.instance_variable_get(:@request_id)
    refute @controller.instance_variable_get(:@busy)
  end

  def test_reentrant_request_and_dirty_notification_do_not_steal_pending_dialog_identity
    UI.stub(:savepanel,lambda { |*_args|
      @controller.handle(JSON.generate({'version'=>1,'id'=>'other','action'=>'scan'}))
      @controller.handle(JSON.generate({'version'=>1,'id'=>'dirty-during-dialog','action'=>'dirty','data'=>{'value'=>false}}))
      nil
    }) { pdf_request }
    assert_equal ['waiting_user','working',nil],pdf_messages.map { |m| m['phase'] }
    other=messages.find { |m| m['id']=='other' }
    assert_includes other['error'],'Esperá'
    assert_equal({'cancelled'=>true},pdf_messages.last['result'])
  end

  def test_existing_model_save_and_validation_failures_do_not_suspend_deadline
    _model,data=save_payload
    data['saveFile']=true
    @controller.instance_variable_get(:@model).define_singleton_method(:path) { '/synthetic/existing.skp' }
    @controller.instance_variable_get(:@model).define_singleton_method(:save) { |_path| true }
    handle_save(data)
    assert_empty messages.select { |m| m.key?('phase') }
    @controller.handle(JSON.generate({'version'=>1,'id'=>'invalid-pdf','action'=>'pdf','data'=>{}}))
    assert_empty messages.select { |m| m.key?('phase') }
    assert messages.last['error']
  end

end
