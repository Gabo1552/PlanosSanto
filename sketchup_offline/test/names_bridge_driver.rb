# frozen_string_literal: true
# Synthetic-only driver, not packaged; never opens or writes a SKP.
require_relative 'names_double'
require_relative 'cantos_double'
require_relative 'ocl_read_double'
require_relative 'highlight_view_double'
# The native API exposes name as well as display_name; library navigation uses it.
Sketchup::Material.class_eval { def name; display_name; end }
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file); true; end
end
module Sketchup
  def self.active_model
    @names_model ||= begin
      model=ARGV[1] == 'shared' ? NamingModelDouble.new(Fixture.model) : ARGV[1]=='cantos' ? CantosFixture.model : NamesFixture.model
      OclReadFixture.prepare(model) if ARGV[1].to_s.start_with?('materials')
      if %w[materials-edges materials-cutlist materials-cutlist-pair].include?(ARGV[1])
        board=model.materials[0];first=model.materials[1]
        second=Sketchup::Material.new(890,'Canto secundario de prueba',Sketchup::Color.new(80,80,80),1,nil);second.ocl_attributes={'type'=>4,'thickness'=>'1mm','std_widths'=>'22mm'};model.materials << second
        faces=model.entities[0].entities[0].definition.entities;faces[1].material=nil;faces[3].material=first;faces[4].material=second
        model.entities[1].material=board
      end
      # Vista «Piezas»: el segundo mueble hereda otra placa en la cara sin pintar → sección con dos materiales.
      model.entities[1].material=model.materials[2] if ARGV[1].to_s.start_with?('materials-cutlist')
      if ARGV[1]=='materials-cutlist-pair'
        # Piezas 0.8.20: un segundo «Lateral - Blanco» dentro de «Interior estructural» (otro módulo del mismo mueble).
        nested=model.entities[0].entities[1];left=model.entities[0].entities[0]
        nested.entities << Sketchup::ComponentInstance.new(14,'Lateral - Blanco',left.definition,Geom::Transformation.translation(40,0,0))
      end
      if ARGV[1].to_s.start_with?('materials-cutlist')
        # Cámara y vista sintéticas para «ver en SketchUp» (no se dibuja nada).
        view=HighlightViewDouble.new;model.define_singleton_method(:active_view) { view }
      end
      model
    end
  end
end
module UI
  def self.savepanel(title, *_args)
    return File.join(ARGV.fetch(0), 'materiales-cantos.json') if title.include?('materiales') && ARGV[1]=='materials'
    return File.join(ARGV.fetch(0),'biblioteca-exportada.json') if title.include?('biblioteca')
    return File.join(ARGV.fetch(0),'piezas-exportadas') if title.include?('CSV')
    # Maderera (0.8.20): el TXT de una placa se guarda con el nombre que propone el diálogo.
    return File.join(ARGV.fetch(0),_args[1].to_s) if title.include?('TXT')
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
# This headless naming fixture records tool dispatch only. It does not render
# or activate a viewport; native PieceHighlightTool overlay has separate tests.
Sketchup.active_model.define_singleton_method(:select_tool) { |tool| @names_selected_tool=tool }
controller=NamesStdioController.new
STDIN.each_line do |line|
  msg=JSON.parse(line);model=Sketchup.active_model
  case msg['action']
  when '__names_inspect'
    geometry=model.all_instances.map do |e|
      faces=e.definition.entities.grep(Sketchup::Face).map { |f| [f.mesh(0).points.map(&:to_a),f.mesh(0).polygons, f.material&.entityID,f.back_material&.entityID] }
      [e.persistent_id,e.transformation.to_a,faces]
    end
    result={'names'=>model.all_instances.to_h { |e| [e.persistent_id.to_s,e.name] },'definitions'=>model.all_instances.map { |e| e.definition.name },'definitionGuids'=>model.all_instances.map { |e| e.definition.guid },'simulatedSaves'=>model.instance_variable_get(:@simulated_saves)||0,'operations'=>model.operations,'geometryHash'=>Digest::SHA256.hexdigest(JSON.generate(geometry)),'guide'=>PlanosSanto::GuideStore.new(model).read}
    controller.reply(msg['id'],result:result)
  when '__names_external'
    model.entities[0].name=msg.fetch('data',{}).fetch('name','Alacena externa');controller.reply(msg['id'],result:true)
  when '__names_undo'
    model.undo;controller.reply(msg['id'],result:true)
  when '__names_lock'
    # Punto 20: a locked piece is skipped on save with a notice on its row.
    id=msg.fetch('data',{}).fetch('persistentId').to_s
    model.all_instances.find { |e| e.persistent_id.to_s==id }.locked_for_names=true;controller.reply(msg['id'],result:true)
  when '__bind_material'
    # Vista «Piezas»: vincula un material del doble con una ficha de la biblioteca de prueba (sin UI de pintado).
    data=msg.fetch('data');item=PlanosSanto::CatalogStore.new(directory:ENV.fetch('PLANOS_SANTO_DATA_DIR')).read['items'].find { |row| row['id']==data.fetch('catalogId') }
    material=model.materials.find { |m| m.display_name==data.fetch('materialName') }
    material.planos_binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));controller.reply(msg['id'],result:true)
  when '__delete_instance'
    # Piezas 0.8.20: una pieza borrada después de leer el listado.
    id=msg.fetch('data',{}).fetch('persistentId').to_s
    model.all_instances.find { |e| e.persistent_id.to_s==id }.invalid_for_names=true;controller.reply(msg['id'],result:true)
  when '__view_inspect'
    # Piezas 0.8.20: cámara, transiciones, selección y contexto abierto del doble.
    view=model.respond_to?(:active_view) ? model.active_view : nil
    controller.reply(msg['id'],result:{'camera'=>view&.camera&.to_h,'transitions'=>view ? view.camera_calls.map(&:last) : [],
      'selection'=>model.selection.to_a.map(&:persistent_id),'activePath'=>(model.active_path || []).map(&:persistent_id)})
  when '__names_geometry'
    model.entities[0].transformation=Geom::Transformation.translation(3,2,1);controller.reply(msg['id'],result:true)
  else
    controller.handle(line)
  end
end
