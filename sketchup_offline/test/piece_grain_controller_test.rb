# frozen_string_literal: true
# Acción `piece_grain` del controlador (0.8.26) sobre el paquete armado, con dobles de la API: bloqueos como
# los de pintar, una sola operación, el listado de Piezas leído de nuevo y el aviso de análisis desactualizado.
# Simulado: NO es SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'grain_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :grain_model;end
  def self.active_model;grain_model;end
end
require_relative '../build/planos_santo/offline'

class PieceGrainControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);Sketchup.grain_model=@model
    @store=PlanosSanto::CatalogStore.new(directory:@dir)
    item=@store.new_item('Roble Jade','sheet');item.merge!('sku'=>'RJ-19','supplier'=>'Prueba','thicknessMm'=>19.05,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true)
    @item=@store.save([item],0)['items'][0]
    @board=@model.materials[0];@board.planos_binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(@item))
    @left=@model.entities[0].entities[0]
    @controller=PlanosSanto::OfflineController.new
    @stale=[];stale=@stale;@controller.define_singleton_method(:publish_analysis_state) { stale << analysis_state }
    dispatch('scan');dispatch('generate','ids'=>%w[1 2])
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def row(name);dispatch('cutlist')['pieces'].find { |piece| piece['name']==name };end
  def grain_error(data={'ids'=>['1/11'],'mode'=>'rotate'});assert_raises(PlanosSanto::ExportError) { dispatch('piece_grain',data) }.message;end

  def test_rotates_a_row_in_one_operation_and_the_cutlist_reads_it_back
    lateral=row('Lateral - Blanco')
    assert_equal ['length',609.6,406.4,0,'auto','horizontal'],lateral.values_at('grain','lengthMm','widthMm','grainAxis','grainSource','grainDirection')
    assert_match(/compartido/,lateral['grainBlock'],'La placa es la misma definición en tres apariciones y no se puede hacer única')
    GrainDouble.enable_unique(@left)
    assert_nil row('Lateral - Blanco')['grainBlock']
    before=@model.operations.length
    # Como al pintar en la vista, una guía recién generada y sin guardar (Piezas la genera sola) no frena.
    @controller.instance_variable_set(:@dirty,true)
    result=dispatch('piece_grain','ids'=>['1/11'],'mode'=>'rotate')
    assert_equal [true,1,true],result.values_at('changed','isolated','stale')
    assert_equal 1,@model.operations.drop(before).count { |o| o[0]==:start },'Una sola operación (un Ctrl+Z)'
    assert_equal 1,@left.get_attribute(PlanosSanto::Grain::DICT,PlanosSanto::Grain::KEY)
    assert @stale.last['stale'],'El editor regenera sus guías solo, como después de pintar'
    lateral=row('Lateral - Blanco')
    assert_equal [406.4,609.6,1,'manual'],lateral.values_at('lengthMm','widthMm','grainAxis','grainSource'),'Piezas se lee de nuevo sin volver a analizar'
    assert_equal [609.6,0,'auto'],row('Base ajena').values_at('lengthMm','grainAxis','grainSource'),'La otra aparición no cambió'
    dispatch('piece_grain','ids'=>['1/11'],'mode'=>'auto')
    assert_equal [609.6,0,'auto'],row('Lateral - Blanco').values_at('lengthMm','grainAxis','grainSource')
  end
  def test_blocks_like_painting_before_writing
    GrainDouble.enable_unique(@left)
    @controller.instance_variable_set(:@workshop_dirty,true);assert_match(/biblioteca o pedido/,grain_error)
    @controller.instance_variable_set(:@workshop_dirty,false);@controller.instance_variable_set(:@skm_preview_active,true);assert_match(/importación/,grain_error)
    @controller.instance_variable_set(:@skm_preview_active,false)
    assert_match(/ya no están en Piezas/,grain_error('ids'=>['9/99'],'mode'=>'rotate'))
    assert_match(/ajuste de veta/,grain_error('ids'=>['1/11']))
    @left.name='Lateral cambiado en SketchUp'
    assert_match(/cambió/,grain_error,'Modelo cambiado desde el análisis')
    refute @model.operations.any? { |o| o[1]=='Orientar veta Planos Santo' },'Nada se escribió'
    assert_nil @left.get_attribute(PlanosSanto::Grain::DICT,PlanosSanto::Grain::KEY)
  end
end
