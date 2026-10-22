# frozen_string_literal: true
# Browser comparison contract fixture. Never runs SketchUp, loads a SKP, or uses
# customer materials. PLANOS_TEST_INSTALL_DIR permits frozen pre-redesign assets.
require 'fileutils'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path); true; end
end
class UxFixtureMaterial < Sketchup::Material
  attr_reader :attributes
  def initialize(*args); super; @attributes={}; end
  def name; display_name; end
  def get_attribute(dictionary,key,default=nil);@attributes.fetch([dictionary,key],default);end
end
module Sketchup
  class << self; attr_accessor :ux_model; end
  def self.active_model; ux_model; end
end
module UI
  def self.savepanel(title,*_args); title.include?('PDF') ? File.join(ARGV.fetch(0),'PlanosSanto-A4.pdf') : nil; end
  def self.openpanel(*_args); nil; end
  def self.select_directory(**_args); nil; end
end
installation=ENV.fetch('PLANOS_TEST_INSTALL_DIR',File.expand_path('../build',__dir__))
require File.join(installation,'planos_santo','offline')
model=NamesFixture.model
# A readable two-board L-shaped synthetic cabinet, identical for both versions.
# Only this comparison fixture is positioned; no production geometry is changed.
model.entities.first.entities.first.transformation=Geom::Transformation.new([
  0,0,1,0, 0,1,0,0, -1,0,0,0, 0.75,0,0.75,1
])
items=[['Placa QA sintética','sheet','QA-PLACA',19.05,1830,2600],['Canto QA sintético','edge','QA-CANTO',1,22,nil]].map do |name,kind,sku,thick,width,length|
  item=PlanosSanto::CatalogStore.new.new_item(name,kind,{'source'=>'synthetic_browser_comparison'})
  item.merge('sku'=>sku,'supplier'=>'Ensayo sintético','approved'=>true,'thicknessMm'=>thick,'widthMm'=>width,'lengthMm'=>length,'grain'=>false,'favorite'=>true)
end
# Use fixed IDs and time for the exact same business fixture across versions.
items.each_with_index { |item,i| item['id']="11111111-1111-4111-8111-#{(i+1).to_s.rjust(12,'0')}";item['updatedAt']='2026-10-20T00:00:00Z' }
materials=items.each_with_index.map do |item,i|
  material=UxFixtureMaterial.new(880+i,item['name'],Sketchup::Color.new(*(i.zero? ? [172,138,100] : [120,90,65])),1,nil)
  material.attributes[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY]]=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item,"22222222-2222-4222-8222-#{(i+1).to_s.rjust(12,'0')}"))
  material
end
model.define_singleton_method(:materials) { materials }
model.selection=[]
Sketchup.ux_model=model
folder=ENV.fetch('PLANOS_SANTO_DATA_DIR')
FileUtils.mkdir_p(folder)
File.binwrite(File.join(folder,'catalog.json'),JSON.pretty_generate('schema'=>(defined?(PlanosSanto::CatalogStore::SCHEMA) ? PlanosSanto::CatalogStore::SCHEMA : 1),'revision'=>1,'items'=>items))
class UxStdioController < PlanosSanto::OfflineController
  def reply(id,result:nil,error:nil)
    STDOUT.puts(JSON.generate('version'=>1,'id'=>id,'result'=>result,'error'=>error));STDOUT.flush
  end
end
controller=UxStdioController.new
STDIN.each_line do |line|
  controller.handle(line)
end
