# frozen_string_literal: true
# Unit tests with native API doubles only; never opens SketchUp.
require 'minitest/autorun'
require 'minitest/mock'
require 'digest'
MF_UNCHECKED=0
MF_GRAYED=1
MF_CHECKED=8
TB_HIDDEN=0
TB_VISIBLE=1
TB_NEVER_SHOWN=-1
module UI
  class << self
    attr_accessor :toolbar_states, :toolbars, :menus
    def menu(name);(@menus ||= {})[name] ||= Menu.new(name);end
  end
  class Menu
    attr_reader :name,:items,:submenus
    def initialize(name);@name=name;@items=[];@submenus=[];end
    def add_submenu(name);child=Menu.new(name);@submenus << child;child;end
    def add_item(item,&block);@items << [item,block];end
  end
  class Command
    attr_accessor :tooltip,:status_bar_text,:small_icon,:large_icon
    attr_reader :name
    def initialize(name,&block);@name=name;@block=block;end
    def set_validation_proc(&block);@validation=block;end
    def validation;@validation.call;end
    def call;@block.call;end
  end
  class Toolbar
    attr_reader :name,:items,:restore_count
    def initialize(name);@name=name;@items=[];@restore_count=0;(UI.toolbars||=[]) << self;end
    def add_item(command);@items << command;end
    def get_last_state;(UI.toolbar_states||{}).fetch(name,TB_NEVER_SHOWN);end
    def restore;@restore_count+=1;@visible=true;end
    def visible?;!!@visible;end
    def hide;@visible=false;end
    def show;@visible=true;end
  end
end
module Sketchup
  class << self;attr_accessor :sent_action;end
  def self.send_action(action);self.sent_action=action;end
end
module PlanosSanto
  module P1Diagnostics
    class << self;attr_accessor :runs;end
    def self.run;self.runs=(runs||0)+1;end
  end
end
require_relative '../quick_toolbar'
class QuickToolbarControllerDouble
  attr_reader :actions,:shown
  attr_accessor :flags,:failure,:reasons
  def initialize;@actions=[];@shown=0;@flags={};@reasons={};end
  def show;@shown+=1;end
  def quick_action(key);@actions << key;end
  def quick_block_reason(key);reasons[key];end
  def quick_validation(key);raise IOError,'validation failure' if failure;flags.fetch(key,MF_UNCHECKED);end
end
class QuickToolbarTest < Minitest::Test
  def setup
    toolbar=PlanosSanto::QuickToolbar
    %i[@registry @controller].each { |key| toolbar.remove_instance_variable(key) if toolbar.instance_variable_defined?(key) }
    UI.toolbar_states={};UI.toolbars=[];UI.menus={};Sketchup.sent_action=nil;PlanosSanto::P1Diagnostics.runs=0
    @controller=QuickToolbarControllerDouble.new
  end
  def install;PlanosSanto::QuickToolbar.install(@controller);end
  # Pintura en vista: «Pintar canto» joins «Pintar» on the toolbar.
  def test_one_toolbar_with_six_primary_actions_and_all_secondary_menu_shortcuts
    registry=install
    assert_equal ['Planos Santo'],UI.toolbars.map(&:name)
    assert_same registry[:main_toolbar],registry[:tools_toolbar]
    assert_equal %w[sheet edge furniture order guides materials].map { |key| registry[:commands][key] },registry[:main_toolbar].items
    assert_equal ['Pintar','Pintar canto','Muebles','Maderera','Planos','Materiales'],registry[:main_toolbar].items.map(&:name)
    %w[main remove_edge sample].each do |key|
      refute_includes registry[:main_toolbar].items,registry[:commands][key]
      assert_includes registry[:menu].items.map(&:first),registry[:commands][key]
    end
    assert_equal %w[main materials sheet edge remove_edge sample furniture order guides],registry[:commands].keys
    assert_equal 'Planos Santo',registry[:menu].name
    assert_equal 14,registry[:menu].items.length
    registry[:commands].each do |key,command|
      assert_includes registry[:menu].items.map(&:first),command
      refute_empty command.tooltip
      refute_empty command.status_bar_text
      command.call
    end
    assert_equal 1,@controller.shown
    assert_equal %w[materials sheet edge remove_edge sample furniture order guides],@controller.actions
    assert_equal 9,registry[:commands].values.map(&:tooltip).uniq.length
    assert_equal 9,registry[:commands].values.map(&:status_bar_text).uniq.length
  end
  # Pintura en vista: paint commands go to paint_in_view (no window), with their
  # own validation; the palette stays reachable from the menu.
  def test_paint_commands_paint_in_the_view_and_the_menu_keeps_the_palette
    painted=[];palette=[];checks=[]
    @controller.define_singleton_method(:paint_in_view) { |key| painted << key;{'toolState'=>{}} }
    @controller.define_singleton_method(:paint_block_reason) { |key| key=='remove_edge' ? 'Guardá los cambios de biblioteca o pedido antes de pintar.' : nil }
    @controller.define_singleton_method(:paint_validation) { |key| checks << key;key=='sheet' ? MF_CHECKED : MF_UNCHECKED }
    @controller.define_singleton_method(:open_paint_palette) { palette << :opened }
    registry=install
    %w[sheet edge remove_edge].each { |key| registry[:commands][key].call }
    assert_equal %w[sheet edge remove_edge],painted;assert_empty @controller.actions
    registry[:commands]['sample'].call;assert_equal ['sample'],@controller.actions
    assert_equal MF_CHECKED,registry[:commands]['sheet'].validation;assert_equal MF_UNCHECKED,registry[:commands]['edge'].validation
    registry[:commands]['remove_edge'].validation
    assert_equal 'Guardá los cambios de biblioteca o pedido antes de pintar.',registry[:commands]['remove_edge'].status_bar_text
    assert_equal %w[sheet edge remove_edge],checks
    registry[:menu].items.find { |item,_| item=='Paleta de pintura…' }.last.call
    assert_equal [:opened],palette
  end

  def test_main_command_prefers_full_interface_navigation_without_registering_again
    @controller.define_singleton_method(:open_main) { @full_opened=(@full_opened||0)+1 }
    registry=install;registry[:commands]['main'].call
    assert_equal 1,@controller.instance_variable_get(:@full_opened)
    assert_equal 0,@controller.shown
    assert_same registry,install
    assert_equal 1,UI.toolbars.length
  end
  def test_registration_is_idempotent_and_callbacks_follow_a_replaced_controller
    first=install
    other=QuickToolbarControllerDouble.new
    assert_same first,PlanosSanto::QuickToolbar.install(other)
    assert_equal 1,UI.toolbars.length
    assert_equal 1,UI.menu('Extensions').submenus.length
    first[:commands]['sheet'].call;first[:commands]['main'].call
    assert_equal ['sheet'],other.actions;assert_equal 1,other.shown
    assert_empty @controller.actions;assert_equal 0,@controller.shown
    assert_equal [1],UI.toolbars.map(&:restore_count)
  end
  def test_reloading_source_keeps_registry_and_does_not_add_native_ui_entries
    first=install
    load File.expand_path('../quick_toolbar.rb',__dir__)
    assert_same first,install
    assert_equal 1,UI.toolbars.length
    assert_equal 1,UI.menu('Extensions').submenus.length
    assert_equal 14,first[:menu].items.length
  end
  def test_operator_hidden_toolbar_is_never_forced_visible
    UI.toolbar_states={'Planos Santo'=>TB_VISIBLE,'Planos Santo - Herramientas'=>TB_HIDDEN}
    install
    assert_equal [1],UI.toolbars.map(&:restore_count)
  end
  def test_hidden_primary_bar_is_preserved_even_when_legacy_bar_was_visible
    UI.toolbar_states={'Planos Santo'=>TB_HIDDEN,'Planos Santo - Herramientas'=>TB_NEVER_SHOWN}
    install
    assert_equal [0],UI.toolbars.map(&:restore_count)
  end
  def test_menu_can_hide_and_show_the_same_toolbar_without_registering_another
    registry=install;toolbar=registry[:main_toolbar]
    toggle=registry[:menu].items.find { |item,_| item=='Mostrar / ocultar barra rápida' }.last
    assert toolbar.visible?;toggle.call;refute toolbar.visible?;toggle.call;assert toolbar.visible?
    assert_equal 1,UI.toolbars.length
  end
  def test_validation_reflects_current_controller_state_instead_of_cached_checked_button
    registry=install
    @controller.flags={'sheet'=>MF_CHECKED,'edge'=>MF_GRAYED}
    assert_equal MF_CHECKED,registry[:commands]['sheet'].validation
    assert_equal MF_GRAYED,registry[:commands]['edge'].validation
    assert_equal MF_UNCHECKED,registry[:commands]['remove_edge'].validation
    @controller.flags={'sheet'=>MF_UNCHECKED,'edge'=>MF_CHECKED}
    assert_equal MF_UNCHECKED,registry[:commands]['sheet'].validation
    assert_equal MF_CHECKED,registry[:commands]['edge'].validation
    assert_equal MF_UNCHECKED,registry[:commands]['main'].validation
  end
  def test_disabled_commands_explain_guard_reason_and_restore_description_after_unlock
    registry=install;command=registry[:commands]['sheet'];description=command.status_bar_text
    @controller.flags['sheet']=MF_GRAYED
    @controller.reasons['sheet']='Guardá los cambios de la guía antes de pintar.'
    assert_equal MF_GRAYED,command.validation
    assert_equal @controller.reasons['sheet'],command.status_bar_text
    @controller.reasons.clear;@controller.flags.clear
    assert_equal MF_UNCHECKED,command.validation
    assert_equal description,command.status_bar_text
  end
  def test_validation_failure_disables_command
    registry=install;@controller.failure=true
    _out,error=capture_io { assert_equal MF_GRAYED,registry[:commands]['sheet'].validation }
    assert_includes error,'validation failure'
  end
  def test_original_icons_exist_at_24_and_32_with_distinct_payloads
    registry=install
    payloads=[]
    registry[:commands].each do |key,command|
      [[command.small_icon,24],[command.large_icon,32]].each do |path,size|
        assert_equal "#{key}-#{size}.png",File.basename(path)
        assert File.file?(path),path
        bytes=File.binread(path)
        assert_equal "\x89PNG\r\n\x1a\n".b,bytes.byteslice(0,8)
        assert_equal [size,size],bytes.byteslice(16,8).unpack('N2')
        payloads << Digest::SHA256.hexdigest(bytes)
      end
    end
    assert_equal 18,payloads.uniq.length
  end
  # 0.8.18 (calidad visual): Windows takes the vector icon (sharp at 125-200 %);
  # macOS and an installation without the SVG keep the PNGs.
  def test_windows_uses_the_vector_icon_and_keeps_the_png_fallback
    Sketchup.singleton_class.send(:define_method,:platform) { :platform_win }
    begin
      registry=install
      registry[:commands].each do |key,command|
        assert_equal ["#{key}.svg","#{key}.svg"],[File.basename(command.small_icon),File.basename(command.large_icon)]
        svg=File.read(command.small_icon,encoding:'UTF-8')
        assert svg.start_with?('<?xml'),key;assert_includes svg,'viewBox="0 0 24 24"'
        refute_match(/<(?:script|style|text|image|filter)\b/,svg,'SVG simple: solo formas')
        %w[24 32].each { |size| assert File.file?(File.join(File.dirname(command.small_icon),"#{key}-#{size}.png")) }
      end
      original=File.method(:file?)
      File.stub(:file?,lambda { |path| path.to_s.end_with?('.svg') ? false : original.call(path) }) do
        assert_equal 'sheet-32.png',File.basename(PlanosSanto::QuickToolbar.icon('sheet',32)),'sin el SVG vuelve al PNG'
      end
    ensure
      Sketchup.singleton_class.send(:remove_method,:platform)
    end
    Sketchup.singleton_class.send(:define_method,:platform) { :platform_osx }
    begin
      assert_equal 'sheet-24.png',File.basename(PlanosSanto::QuickToolbar.icon('sheet',24)),'macOS usa PNG (SVG no, PDF sí)'
    ensure
      Sketchup.singleton_class.send(:remove_method,:platform)
    end
  end
  def test_existing_diagnostic_and_open_skp_actions_are_preserved
    registry=install
    diagnose=registry[:menu].items.find { |item,_| item=='Diagnóstico de integración (solo lectura)…' }
    open=registry[:menu].items.find { |item,_| item=='Abrir archivo .skp…' }
    diagnose.last.call;open.last.call
    assert_equal 1,PlanosSanto::P1Diagnostics.runs
    assert_equal 'openDocument:',Sketchup.sent_action
  end
  def test_menu_offers_reset_windows_without_requiring_it_from_older_controllers
    registry=install
    item=registry[:menu].items.find { |label,_| label=='Restablecer ventanas' }
    refute_nil item
    item[1].call # older controller double: no reset_windows, no failure
    resets=0;@controller.define_singleton_method(:reset_windows) { resets+=1 }
    item[1].call
    assert_equal 1,resets
  end
end
