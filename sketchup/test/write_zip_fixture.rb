# frozen_string_literal: true
require_relative 'fake_api'
require_relative '../planos_santo/zip_bundle'
exporter=PlanosSanto::Exporter.new(Fixture.model)
document=exporter.document(exporter.tree,['1','2'])
PlanosSanto::ZipBundle.write(document,ARGV.fetch(0))
