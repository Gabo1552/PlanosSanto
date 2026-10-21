# frozen_string_literal: true
require_relative 'fake_api'
require_relative '../planos_santo/exporter'
exporter=PlanosSanto::Exporter.new(Fixture.model)
document=exporter.document(exporter.tree,['1','2'])
puts JSON.generate(document)
