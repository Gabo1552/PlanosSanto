# frozen_string_literal: true
# Stdio harness, excluded from RBZ. Uses synthetic geometry and a SketchUp API double.
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file); true; end
end
module Sketchup
  def self.active_model
    @native_fixture ||= begin
      model=NamingModelDouble.new(Fixture.model)
      ENV['PLANOS_TEST_MATERIALS']=='1' ? OclReadFixture.prepare(model) : model
    end
  end
end
module UI
  def self.savepanel(title, _folder, _name)
    return nil unless title.include?('PDF') # Simulates cancelling the native SKP Save As dialog.
    File.join(ARGV.fetch(0), 'PlanosSanto-A4.pdf')
  end
end
require File.join(ENV.fetch('PLANOS_TEST_INSTALL_DIR',File.expand_path('../build',__dir__)),'planos_santo','offline')
class StdioController < PlanosSanto::OfflineController
  def reply(id, result: nil, error: nil)
    STDOUT.puts(JSON.generate({ 'version' => 1, 'id' => id, 'result' => result, 'error' => error }))
    STDOUT.flush
  end
end
controller = StdioController.new
STDIN.each_line do |line|
  msg = JSON.parse(line)
  if msg['action'] == '__fixture_move'
    Sketchup.active_model.entities[0].transformation = Geom::Transformation.translation(50, 1, 1)
    controller.reply(msg['id'], result: true)
  else
    controller.handle(line)
  end
end
