# frozen_string_literal: true
# Reproduces a real archive replacement while the old Ruby classes remain loaded.
# Uses only the synthetic API double; never opens or saves a SKP.
require_relative 'names_double'
require 'open3'
$LOADED_FEATURES << 'sketchup.rb'
def file_loaded?(_path); true; end
module Sketchup
  def self.active_model; @fixture ||= NamingModelDouble.new(Fixture.model); end
end
plugins, archive = ARGV
require File.join(plugins, 'planos_santo', 'offline')
controller=PlanosSanto::OfflineController.new
controller.dispatch('scan',{})
document=controller.dispatch('generate',{'ids'=>['1']})['document']
_, error, status=Open3.capture3('python3','-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,plugins)
raise error unless status.success?
pieces=[]
PlanosSanto::Exporter.each_node(document['furniture']) do |n|
  pieces << {'id'=>n['id'],'name'=>n['name'],'code'=>"P#{(pieces.length+1).to_s.rjust(2,'0')}"} if n['mesh']
end
edit={'id'=>'1','explosion'=>0.45,'zoom'=>1,'pieces'=>pieces,'notes'=>[],
      'presentation'=>{},'naming'=>{'moduleCode'=>'','bases'=>pieces.map { |p| {'id'=>p['id'],'base'=>p['name']} }}}
message=nil
begin
  controller.dispatch('save',{'revision'=>0,'furniture'=>[edit],'saveFile'=>false})
rescue PlanosSanto::ExportError => error
  message=error.message
end
puts JSON.generate({'loadedVersion'=>controller.dispatch('diagnostic',{})['extensionVersion'],
  'installedVersion'=>JSON.parse(File.read(File.join(plugins,'planos_santo','manifest.json')))['version'],
  'saveError'=>message,'operations'=>Sketchup.active_model.operations,'attributes'=>Sketchup.active_model.attributes})
