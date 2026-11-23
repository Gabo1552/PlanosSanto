# frozen_string_literal: true
# Acción `obra_json` del controlador (0.8.35) sobre el paquete armado, con dobles de la API: el paquete se valida
# contra los muebles generados antes de abrir el diálogo, se escribe sin tocar el modelo y frena si el modelo
# cambió. El JSON lo arma acá la prueba con el listado de Piezas, como hace la UI. Simulado: NO es SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'grain_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module UI
  def self.savepanel(*_args);nil;end
end
module Sketchup
  class << self;attr_accessor :obra_model;end
  def self.active_model;obra_model;end
end
require_relative '../build/planos_santo/offline'

class ObraControllerTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);Sketchup.obra_model=@model
    @controller=PlanosSanto::OfflineController.new
    dispatch('scan');dispatch('generate','ids'=>%w[1 2])
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def document;@controller.instance_variable_get(:@session).document;end

  # Lo mismo que arma la UI (sketchup_offline/ui/obra.ts), en mínimo: muebles y nombres del listado, piezas y su matriz mundo.
  def package
    cutlist=dispatch('cutlist');rows={}
    cutlist['pieces'].each { |piece| piece['ids'].each_with_index { |id,index| rows[id]=[piece,piece['idCodes'][index]] } }
    roots=document['furniture'].to_h { |root| [root['id'],root] }
    muebles=cutlist['furniture'].map do |entry|
      piezas=[]
      PlanosSanto::Exporter.each_node([roots.fetch(entry['id'])]) do |node|
        next unless node['mesh']
        piece,code=rows.fetch(node['id'])
        piezas << {'id'=>node['id'],'codigo'=>code,'nombre'=>piece['name'],'material'=>{'nombre'=>'Sin material','sku'=>nil,'color'=>nil},
                   'medidas'=>piece.values_at('lengthMm','widthMm','thicknessMm'),'caja'=>node['metadata']['localBounds'],'transform'=>node['metadata']['worldTransform']}
      end
      {'id'=>entry['id'],'nombre'=>entry['name'],'codigo'=>'','medidas'=>{'alto'=>1,'ancho'=>1,'profundidad'=>1},'piezas'=>piezas}
    end
    {'schema'=>'planos-santo.obra.v1','version'=>PlanosSanto::Release::VERSION,'modelo'=>cutlist['modelName'],'exportado'=>'2026-11-23T12:00:00.000Z','unidades'=>'mm','muebles'=>muebles}
  end
  def export(data,target:File.join(@dir,'elegido'))
    titles=[];result=nil
    UI.stub(:savepanel,lambda { |title,_dir,name| titles << [title,name];target }) { result=dispatch('obra_json','json'=>JSON.generate(data),'modelName'=>'Cocina: SINTÉTICA') }
    [result,titles]
  end

  def test_writes_the_package_of_the_generated_furniture_without_touching_the_model
    data=package
    assert_equal ['Bajo Mesada','Otro mueble'],data['muebles'].map { |m| m['nombre'] },'Mismo nombre que la columna Mueble del CSV'
    before=@model.operations.length
    result,titles=export(data)
    assert_equal [['Exportar paquete de obra (JSON)','Cocina SINTÉTICA.obra.json']],titles
    assert_equal File.join(@dir,'elegido.obra.json'),result['path']
    assert_equal data,JSON.parse(File.read(result['path'],encoding:'UTF-8'))
    assert_equal before,@model.operations.length,'Solo lectura: ninguna operación en el modelo'
  end

  def test_checks_before_the_dialog_and_cancel_writes_nothing
    data=package;data['muebles'][0]['nombre']='Otro nombre'
    titles=[]
    error=assert_raises(PlanosSanto::ExportError) do
      UI.stub(:savepanel,lambda { |*args| titles << args;nil }) { dispatch('obra_json','json'=>JSON.generate(data),'modelName'=>'x') }
    end
    assert_match(/Bajo Mesada/,error.message)
    assert_empty titles,'Un paquete que no corresponde no abre el diálogo'
    result,=export(package,target:nil)
    assert_equal({'cancelled'=>true},result)
    assert_empty Dir.glob(File.join(@dir,'*.json'))
  end

  def test_stops_when_the_model_changed_after_generating
    data=package
    @model.entities[0].entities[0].transformation=Geom::Transformation.translation(1,0,0)
    error=assert_raises(PlanosSanto::ExportError) { export(data) }
    assert_match(/cambió/,error.message)
  end
end
