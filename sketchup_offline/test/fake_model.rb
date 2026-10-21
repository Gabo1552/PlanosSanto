# frozen_string_literal: true
require 'delegate'
require_relative '../../sketchup/test/fake_api'

# API double for Linux contract tests only. Does not read or write a .skp.
class NativeModelDouble < SimpleDelegator
  attr_accessor :active_path, :selection, :fail_write
  attr_reader :attributes, :operations
  def initialize(model)
    super(model)
    @attributes = {}; @operations = []; @selection = []; @active_path = nil
  end
  def get_attribute(dictionary, key); @attributes[[dictionary, key]]; end
  def start_operation(name, disable_ui); @backup = Marshal.load(Marshal.dump(@attributes)); @operations << [:start, name, disable_ui]; end
  def set_attribute(dictionary, key, value)
    @attributes[[dictionary, key]] = value
    raise IOError, 'synthetic write failure' if @fail_write
  end
  def commit_operation; @operations << [:commit]; end
  def abort_operation; @attributes = @backup; @operations << [:abort]; end
end
