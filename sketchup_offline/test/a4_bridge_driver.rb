# frozen_string_literal: true
# A4 synthetic browser/native contracts only. Not packaged; never opens or writes a SKP.
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file); true; end
end
module Sketchup
  def self.active_model
    @names_model ||= begin
      model=ARGV[1] == 'shared' ? NamingModelDouble.new(Fixture.model) : NamesFixture.model
      OclReadFixture.prepare(model) if ARGV[1].to_s.start_with?('materials')
      if ARGV[1]=='materials-edges'
        board=model.materials[0];first=model.materials[1]
        second=Sketchup::Material.new(890,'Canto secundario de prueba',Sketchup::Color.new(80,80,80),1,nil);second.ocl_attributes={'type'=>4,'thickness'=>'1mm','std_widths'=>'22mm'};model.materials << second
        faces=model.entities[0].entities[0].definition.entities;faces[1].material=nil;faces[3].material=first;faces[4].material=second
        model.entities[1].material=board
      end
      model
    end
  end
end
module UI
  def self.savepanel(title, *_args)
    return File.join(ARGV.fetch(0), 'materiales-cantos.json') if title.include?('materiales') && ARGV[1]=='materials'
    return File.join(ARGV.fetch(0),'biblioteca-exportada.json') if title.include?('biblioteca')
    title.include?('PDF') ? File.join(ARGV.fetch(0), 'PlanosSanto-A4.pdf') : nil
  end
  def self.openpanel(*_args);File.join(ARGV.fetch(0),'candidatos.json');end
  def self.select_directory(**_args);ARGV.fetch(0);end
end
require_relative '../build/planos_santo/offline'
if ARGV[1]=='save-revision'
  # Simulate revision IDs changing after commit and physical save, not geometry.
  # No SKP is created: the return value only exercises the native save contract.
  model=Sketchup.active_model
  model.define_singleton_method(:advance_definition_revisions) do |stage|
    all_instances.map(&:definition).uniq.each_with_index { |definition,i| definition.guid="#{stage}-#{@revision_count}-#{i}" }
    @revision_count=(@revision_count||0)+1
  end
  model.define_singleton_method(:commit_operation) { result=super();advance_definition_revisions('commit');result }
  model.define_singleton_method(:path) { File.join(ARGV.fetch(0),'modelo-SINTETICO.skp') }
  model.define_singleton_method(:save) { |_path| @simulated_saves=(@simulated_saves||0)+1;advance_definition_revisions('save');true }
end
class NamesStdioController < PlanosSanto::OfflineController
  def reply(id,result:nil,error:nil)
    STDOUT.puts(JSON.generate({'version'=>1,'id'=>id,'result'=>result,'error'=>error}));STDOUT.flush
  end
end
controller=NamesStdioController.new
STDIN.each_line do |line|
  msg=JSON.parse(line);model=Sketchup.active_model
  case msg['action']
  when '__names_inspect'
    geometry=model.all_instances.map do |e|
      faces=e.definition.entities.grep(Sketchup::Face).map { |f| [f.mesh(0).points.map(&:to_a),f.mesh(0).polygons, f.material&.entityID,f.back_material&.entityID] }
      [e.persistent_id,e.transformation.to_a,faces]
    end
    result={'names'=>model.all_instances.to_h { |e| [e.persistent_id.to_s,e.name] },'definitions'=>model.all_instances.map { |e| e.definition.name },'definitionGuids'=>model.all_instances.map { |e| e.definition.guid },'simulatedSaves'=>model.instance_variable_get(:@simulated_saves)||0,'operations'=>model.operations,'geometryHash'=>Digest::SHA256.hexdigest(JSON.generate(geometry)),'visibility'=>model.all_instances.to_h { |e| [e.persistent_id.to_s,e.respond_to?(:hidden?) ? e.hidden? : false] },'guide'=>PlanosSanto::GuideStore.new(model).read}
    controller.reply(msg['id'],result:result)
  when '__names_external'
    model.entities[0].name=msg.fetch('data',{}).fetch('name','Alacena externa');controller.reply(msg['id'],result:true)
  when '__names_undo'
    model.undo;controller.reply(msg['id'],result:true)
  when '__names_geometry'
    model.entities[0].transformation=Geom::Transformation.translation(3,2,1);controller.reply(msg['id'],result:true)
  else
    controller.handle(line)
  end
end
