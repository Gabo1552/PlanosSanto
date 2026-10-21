# frozen_string_literal: true
# Integration harness with synthetic API doubles, not a real SketchUp session.
require_relative 'fake_api'
require_relative '../planos_santo/transport'
exporter=PlanosSanto::Exporter.new(Fixture.model)
doc=exporter.document(exporter.tree,['1','2'])
result=PlanosSanto::Transport.send_document(PlanosSanto::Transport.destination(ENV.fetch('SANTO_TEST_ORIGIN')),ENV.fetch('SANTO_TEST_TOKEN'),doc)
puts JSON.generate(result)
