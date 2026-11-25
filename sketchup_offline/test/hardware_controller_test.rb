# frozen_string_literal: true
# Acciones de herrajes en 3D del controlador (0.8.37) con dobles de la API: estado, validación contra los muebles
# generados antes de escribir, quitar sin nada colocado y el análisis salteando un grupo de herrajes de la raíz.
# La geometría se prueba en hardware_model_test.rb. Simulado: NO es SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'grain_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :hardware_model;end
  def self.active_model;hardware_model;end
end
require_relative '../build/planos_santo/offline'

class HardwareControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);Sketchup.hardware_model=@model
    @controller=PlanosSanto::OfflineController.new
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def pieces(root)
    ids=[];PlanosSanto::Exporter.each_node([root]) { |node| ids << node['id'] if node['mesh'] };ids
  end

  def test_status_place_validation_and_remove_without_hardware
    dispatch('scan')
    assert_equal({'status'=>[]},dispatch('hardware_status'))
    error=assert_raises(PlanosSanto::ExportError) { dispatch('hardware_place','furniture'=>[{'id'=>'1','placements'=>[]}]) }
    assert_match(/generá las guías/,error.message)
    dispatch('generate','ids'=>%w[1 2])
    document=@controller.instance_variable_get(:@session).document
    other=pieces(document['furniture'][1]).first
    before=@model.operations.length
    matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    error=assert_raises(PlanosSanto::ExportError) do
      dispatch('hardware_place','furniture'=>[{'id'=>'1','placements'=>[{'pieceId'=>other,'kind'=>'hinge','side'=>'left','lengthMm'=>nil,'matrix'=>matrix}]}])
    end
    assert_match(/ya no está en Piezas/,error.message)
    assert_equal({'removed'=>0,'status'=>[]},dispatch('hardware_remove','furnitureIds'=>['1']))
    assert_equal before,@model.operations.length,'Validar y quitar sin nada colocado no abren operaciones'
  end

  def hardware_group(id=99)
    group=Sketchup::Group.new(id,'Herrajes · Bajo Mesada',Sketchup::Definition.new('Herrajes',"hardware-#{id}",[]))
    group.set_attribute('PlanosSantoHerrajes','role','group');group.set_attribute('PlanosSantoHerrajes','furnitureId','1')
    group
  end

  def test_the_analysis_fingerprint_ignores_hardware_groups_so_undo_or_redo_does_not_make_the_guide_stale
    before=PlanosSanto::ModelWatch.fingerprint(@model)
    @model.entities << hardware_group
    assert_equal before,PlanosSanto::ModelWatch.fingerprint(@model)
    # Un grupo cualquiera sí cambia la huella.
    @model.entities << Sketchup::Group.new(98,'Otro',Sketchup::Definition.new('Otro','other-98',[]))
    refute_equal before,PlanosSanto::ModelWatch.fingerprint(@model)
  end

  def test_undo_or_redo_in_sketchup_publishes_the_new_hardware_status_once
    dispatch('scan')
    scripts=[];dialog=Object.new;dialog.define_singleton_method(:execute_script) { |script| scripts << script }
    @controller.instance_variable_set(:@dialog,dialog)
    assert_equal({'status'=>[]},dispatch('hardware_status'))
    @controller.send(:model_watch_changed,['model'])
    assert_empty scripts.grep(/hardware-changed/),'Sin cambios no avisa'
    @model.entities << hardware_group
    @controller.send(:model_watch_changed,['model'])
    events=scripts.grep(/planos-santo-hardware-changed/)
    assert_equal 1,events.length
    assert_includes events[0],'furnitureId'
    @controller.send(:model_watch_changed,['model'])
    assert_equal 1,scripts.grep(/planos-santo-hardware-changed/).length,'El mismo estado no se vuelve a avisar'
  end

  def test_the_analysis_skips_a_hardware_group_at_the_root
    roots=dispatch('scan')['tree']['roots'].map { |root| root['id'] }
    @model.entities << hardware_group
    assert_equal roots,dispatch('scan')['tree']['roots'].map { |root| root['id'] }
  end
end
