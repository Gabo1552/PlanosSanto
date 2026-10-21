# frozen_string_literal: true
# Strict bootstrap contract double: no SketchUp/Windows runtime is present here.
require 'json'
$LOADED_FEATURES.concat(%w[sketchup.rb extensions.rb])
$files_loaded = []
def file_loaded?(path); $files_loaded.include?(path); end
def file_loaded(path); $files_loaded << path; end
class SketchupExtension
  attr_reader :name, :path
  attr_accessor :description, :version, :creator
  def initialize(name, path); @name = name; @path = path; end
end
module UI
  @messages = []; @menus = []; @commands = []; @toolbars = []; @dialogs = []
  class << self
    attr_reader :messages, :menus, :commands, :toolbars, :dialogs
    def messagebox(message); @messages << message; end
    def menu(name); raise 'Wrong menu' unless name == 'Extensions'; Menu.new; end
  end
  class Menu
    def add_submenu(name); UI.menus << name; self; end
    def add_item(item, &block); UI.menus << (item.is_a?(Command) ? item.title : item); end
  end
  class Command
    attr_reader :title
    attr_accessor :tooltip, :status_bar_text
    def initialize(title, &block); @title = title; @block = block; UI.commands << self; end
    def small_icon=(path); raise 'Missing small icon' unless File.file?(path); end
    def large_icon=(path); raise 'Missing large icon' unless File.file?(path); end
    def set_validation_proc(&block); @validation=block; end
    def call; @block.call; end
  end
  class Toolbar
    attr_reader :restored
    def initialize(name); UI.toolbars << self; end
    def add_item(command); raise 'Wrong command' unless command.is_a?(Command); end
    def get_last_state; -1; end
    def restore; @restored = true; end
  end
  class HtmlDialog
    STYLE_DIALOG = 0
    attr_reader :file, :callbacks, :visible
    def initialize(options); @callbacks = {}; UI.dialogs << self; end
    def set_file(path); raise 'Missing dialog' unless File.file?(path); @file = path; end
    def add_action_callback(name, &block); @callbacks[name] = block; end
    def set_can_close(&block); end
    def set_on_closed(&block); end
    def show; @visible = true; end
    def visible?; @visible; end
    def bring_to_front; end
  end
end
module Sketchup
  class << self
    attr_reader :extension
    def register_extension(extension, enabled)
      @extension = extension
      return false if ENV['INSTALL_MODE'] == 'registration_failure'
      raise 'Not enabled on install' unless enabled
      require extension.path
      true
    end
  end
end
loader = File.join(ARGV.fetch(0), 'planos_santo.rb')
$LOAD_PATH.unshift(ARGV.fetch(0)) # SketchUp adds its Plugins directory to Ruby's load path.
load loader
load loader # SketchUp reload/duplicate evaluation should not duplicate UI.
UI.commands.first.call if UI.commands.first
puts JSON.generate({ 'version' => Sketchup.extension&.version, 'path' => Sketchup.extension&.path,
  'commands' => UI.commands.map(&:title), 'menus' => UI.menus,
  'restored' => UI.toolbars.map(&:restored), 'messages' => UI.messages,
  'dialogs' => UI.dialogs.map { |d| { 'file' => d.file, 'visible' => d.visible, 'callbacks' => d.callbacks.keys } },
  'legacyLoaded' => defined?(PlanosSanto::Controller) != nil })
