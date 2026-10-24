# frozen_string_literal: true
# Development-only adapter authored for Planos Santo. No OpenCutList source is included.
# Usage: ruby scripts/compare-general-ocl.rb /path/to/public/ocl/checkout < cases.json
# Runs the reference in a separate process, never from the extension or the RBZ.
require 'json'
require 'pathname'

reference = Pathname.new(ARGV.fetch(0)).realpath
entry = reference.join('src/ladb_opencutlist/ruby/lib/bin_packing_2d/packengine.rb')
raise 'Missing reference motor' unless entry.file?
module Ladb
  module OpenCutList
  end
end
require entry.to_s
engine_module = Ladb::OpenCutList::BinPacking2D

results = JSON.parse($stdin.read).map do |test_case|
  spec = test_case.fetch('spec')
  options = engine_module::Options.new
  options.set_base_length(spec.fetch('lengthMm') / 25.4)
  options.set_base_width(spec.fetch('widthMm') / 25.4)
  options.set_trimsize(spec.fetch('trimMm') / 25.4)
  options.set_saw_kerf(spec.fetch('kerfMm') / 25.4)
  options.set_rotatable(true)
  options.set_optimization(engine_module::OPT_MEDIUM)
  options.set_stacking_pref(engine_module::STACKING_NONE)
  engine = engine_module::PackEngine.new(options)
  test_case.fetch('pieces').each do |piece|
    engine.add_box(piece.fetch('base') / 25.4, piece.fetch('height') / 25.4,
                   piece.fetch('rotate'), piece.fetch('id'), piece.fetch('id'))
  end
  started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  begin
    $stdout = $stderr # Reference diagnostic output must not corrupt the JSON protocol.
    result, error = engine.runall
  ensure
    $stdout = STDOUT
  end
  elapsed = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
  placed = result ? result.packed_bins.flat_map { |bin| bin.boxes.map(&:data) } : []
  {
    'name' => test_case.fetch('name'), 'sheets' => result&.packed_bins&.length,
    'placedIds' => placed.sort,
    'unplacedIds' => (test_case.fetch('pieces').map { |piece| piece.fetch('id') } - placed).sort,
    'errorCode' => error, 'elapsedMs' => elapsed.round(3)
  }
end
puts JSON.pretty_generate(results)
