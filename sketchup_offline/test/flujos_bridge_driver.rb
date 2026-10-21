# frozen_string_literal: true
# UI lifecycle + actual controller/tool services over synthetic API doubles.
# HtmlDialog records are contracts, never screenshots of native SketchUp.
module UI
  class << self;attr_accessor :flow_dialogs,:flow_messages;end
  self.flow_dialogs=[];self.flow_messages=[]
  def self.start_timer(*_args,&block);block.call;end
  def self.messagebox(text,*_args);flow_messages << text;6;end
  class HtmlDialog
    STYLE_DIALOG=0
    attr_reader :options,:file,:callbacks,:sizes,:scripts
    def initialize(options)
      @options=options;@callbacks={};@sizes=[];@scripts=[];@visible=false;UI.flow_dialogs << self
    end
    def set_file(path);@file=path;end
    def add_action_callback(name,&callback);@callbacks[name]=callback;end
    def set_can_close(&callback);@can_close=callback;end
    def set_on_closed(&callback);@on_closed=callback;end
    def set_size(*size);@sizes << size;end
    def set_position(*_args);end
    def center;end
    def show;@visible=true;end
    def visible?;@visible;end
    def bring_to_front;end
    def close;@visible=false;@on_closed.call if @on_closed;end
    def execute_script(script)
      @scripts << script
      STDOUT.puts(JSON.generate('script'=>script,'dialogFile'=>File.basename(@file.to_s)));STDOUT.flush
    end
  end
end
require_relative 'photo_bridge_driver'
module Sketchup
  class << self;attr_accessor :flow_preferences;end
  self.flow_preferences={}
  def self.read_default(section,key,default=nil);flow_preferences.fetch([section,key],default);end
  def self.write_default(section,key,value);flow_preferences[[section,key]]=value;end
end
# Same extra approved synthetic board in before/after, enabling card switching.
store=PlanosSanto::CatalogStore.new(directory:ENV.fetch('PLANOS_SANTO_DATA_DIR'))
catalog=store.read
item=catalog['items'].first.merge('id'=>'11111111-1111-4111-8111-000000000003','name'=>'Placa QA alternativa','sku'=>'QA-PLACA-2')
catalog['items'] << item
File.binwrite(File.join(store.directory,'catalog.json'),JSON.pretty_generate(catalog))
material=Sketchup.active_model.materials.add(item['name'])
material.color=Sketchup::Color.new(90,145,120)
material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,JSON.generate(PlanosSanto::MaterialResolver.binding_for(item,'22222222-2222-4222-8222-000000000003')))
module FlujosToolCounter
  attr_reader :flow_tool_starts
  def select_tool(tool)
    @flow_tool_starts=(@flow_tool_starts || 0)+1 if tool && tool.is_a?(PlanosSanto::SmartPaintTool)
    super
  end
end
Sketchup.active_model.singleton_class.prepend(FlujosToolCounter)
class FlujosBrowserController < PhotoBrowserController
  def dispatch(action,data)
    case action
    when '__flujos_enter'
      if data['remember']
        binding=PlanosSanto::MaterialResolver.read_binding(Sketchup.active_model.materials.first)
        remember_smart_settings({'mode'=>'sheet','catalogId'=>binding['catalogId'],'axes'=>[0,1],'side'=>'front','scope'=>'unique','batch'=>false,'paintScope'=>'face','edgeCount'=>1})
      end
      Sketchup.active_model.selection=[Sketchup.active_model.entities.first] if data['selection']
      result=quick_action(data.fetch('action','sheet'))
      {'intent'=>result,'dialogs'=>flow_dialogs,'toolState'=>smart_state}
    when '__flujos_dialogs';flow_state
    when '__flujos_paint'
      tool=@model.selected_tool;raise 'No active painting tool' unless tool
      root=@model.entities.first;piece=root.entities.first;face=piece.definition.entities.first
      picker=Object.new;picker.define_singleton_method(:do_pick) { |*_args| true };picker.define_singleton_method(:count) { 1 };picker.define_singleton_method(:path_at) { |_i| [root,piece,face] };picker.define_singleton_method(:leaf_at) { |_i| face }
      view=Object.new;view.define_singleton_method(:pick_helper) { picker };view.define_singleton_method(:invalidate) { true }
      tool.onLButtonDown(data.fetch('flags',0),100,100,view)
      flow_state
    when '__flujos_undo';@model.undo;flow_state
    else;super
    end
  end
  def flow_state
    model=Sketchup.active_model;face=model.entities.first.entities.first.definition.entities.first
    binding=PlanosSanto::MaterialResolver.read_binding(face.material) if face.material
    {'dialogs'=>flow_dialogs,'messages'=>UI.flow_messages,'toolState'=>smart_state,'toolStarts'=>model.flow_tool_starts || 0,
     'targetCatalogId'=>binding && binding['catalogId'],'operations'=>model.operations.map(&:first),
     'instanceNames'=>model.all_instances.to_h { |entity| [entity.persistent_id.to_s,entity.name] }}
  end
  def flow_dialogs
    UI.flow_dialogs.map { |dialog| {'title'=>dialog.options[:dialog_title],'width'=>dialog.options[:width],'height'=>dialog.options[:height],
      'file'=>File.basename(dialog.file.to_s),'visible'=>dialog.visible?,'sizes'=>dialog.sizes} }
  end
end
controller=FlujosBrowserController.new
STDIN.each_line do |line|
  message=JSON.parse(line)
  if message['action']=='__flujos_enter'
    begin
      controller.reply(message['id'],result:controller.dispatch(message['action'],message['data'] || {}))
    rescue StandardError => error
      controller.reply(message['id'],error:error.full_message)
    end
  elsif message['action'].start_with?('__')
    controller.handle(line)
  else
    dialog=UI.flow_dialogs.reverse.find { |entry| File.basename(entry.file.to_s)==ENV.fetch('PLANOS_TEST_UI_FILE','index.html') }
    if dialog && dialog.callbacks['request']
      dialog.callbacks['request'].call(nil,line)
    else
      controller.handle(line)
    end
  end
end
