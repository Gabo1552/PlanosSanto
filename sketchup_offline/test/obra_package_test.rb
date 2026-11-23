# frozen_string_literal: true
# Paquete de obra (0.8.35, planos-santo.obra.v1): Ruby compara el JSON que arma la UI con los muebles generados
# (mismos muebles, mismos nombres que la columna «Mueble» del CSV, mismas piezas y su ubicación) y lo escribe
# completo o nada. Documento SINTÉTICO armado a mano; no abre SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../obra_package'

class ObraPackageTest < Minitest::Test
  O=PlanosSanto::ObraPackage
  IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1].freeze
  def at(x,y,z);[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];end
  def setup;@dir=Dir.mktmpdir;end
  def teardown;FileUtils.remove_entry(@dir);end

  def mesh_node(id,name,world);{'id'=>id,'name'=>name,'mesh'=>{'vertices'=>[],'triangles'=>[]},'metadata'=>{'worldTransform'=>world},'children'=>[]};end
  def document
    {'name'=>'Cocina SINTÉTICA','furniture'=>[
      {'id'=>'101','name'=>'M01 Bajo mesada','children'=>[
        {'id'=>'101/9','name'=>'Herraje','metadata'=>{'worldTransform'=>IDENTITY},'children'=>[mesh_node('101/9/1','Lateral',at(0,0,100))]},
        mesh_node('101/2','Piso',at(18,0,100))]},
      {'id'=>'202','name'=>'Alacena','children'=>[mesh_node('202/1','Puerta',at(2000,0,1500))]}]}
  end
  def piece(id,world);{'id'=>id,'codigo'=>'','nombre'=>'Pieza','material'=>{'nombre'=>'Sin material','sku'=>nil,'color'=>nil},'medidas'=>[700,400,18],'caja'=>{'min'=>[0,0,0],'max'=>[400,18,700]},'transform'=>world};end
  def package
    {'schema'=>'planos-santo.obra.v1','version'=>'0.8.35','modelo'=>'Cocina SINTÉTICA','exportado'=>'2026-11-23T12:00:00.000Z','unidades'=>'mm','muebles'=>[
      {'id'=>'101','nombre'=>'M01 Bajo mesada','codigo'=>'M01','medidas'=>{'alto'=>720,'ancho'=>600,'profundidad'=>560},'piezas'=>[piece('101/9/1',at(0,0,100)),piece('101/2',at(18,0,100))]},
      {'id'=>'202','nombre'=>'Alacena','codigo'=>'','medidas'=>{'alto'=>700,'ancho'=>400,'profundidad'=>18},'piezas'=>[piece('202/1',at(2000,0,1500))]}]}
  end
  def error(text,doc=document);assert_raises(PlanosSanto::ExportError) { O.check(text,doc) }.message;end
  def with(&block);data=package;block.call(data);JSON.generate(data);end

  def test_accepts_the_package_of_the_generated_furniture_and_writes_it_whole_in_utf8
    text=JSON.generate(package)
    assert_equal 2,O.check(text,document)['muebles'].length
    target=File.join(@dir,'Cocina José')
    result=O.write(text,target,document)
    assert_equal File.join(@dir,'Cocina José.obra.json'),result['path']
    bytes=File.binread(result['path'])
    assert_equal text.bytesize,result['bytes']
    assert_equal text,bytes.force_encoding(Encoding::UTF_8),'Sin BOM: es JSON, no planilla'
    assert_equal 1,Dir.children(@dir).length,'Sin temporales sueltos'
    assert_equal File.join(@dir,'a.json'),O.write(text,File.join(@dir,'a.json'),document)['path'],'Respeta la extensión .json elegida'
  end

  def test_suggests_the_model_name_with_obra_json_and_without_windows_reserved_characters
    assert_equal 'Cocina Ana 2.obra.json',O.file_name('Cocina: Ana / 2')
    assert_equal 'Obra.obra.json',O.file_name('  ')
    assert_equal 'Obra.obra.json',O.file_name(nil)
  end

  def test_rejects_text_that_is_not_a_package
    assert_match(/inválido/,error(''))
    assert_match(/inválido/,error('{'))
    assert_match(/inválido/,error("{\"a\":\"\u0000\"}"))
    assert_match(/inválido/,error("\xff\xfe".dup.force_encoding(Encoding::BINARY)))
    assert_match(/inválido/,error('x'*(O::MAX_BYTES+1)))
    assert_match(/planos-santo.obra.v1/,error(with { |d| d['schema']='planos-santo.obra.v2' }))
    assert_match(/milímetros/,error(with { |d| d['unidades']='in' }))
    assert_match(/inválido/,error(JSON.generate([1])))
    assert_match(/inválido/,error(with { |d| d['muebles']=[] }))
  end

  def test_the_furniture_and_its_names_must_be_the_generated_ones_like_the_pieces_csv
    assert_match(/volvé a generar/,error(with { |d| d['muebles'].pop }))
    assert_match(/volvé a generar/,error(with { |d| d['muebles'].reverse! }))
    assert_match(/«Alacena»/,error(with { |d| d['muebles'][1]['nombre']='Alacena alta' }),'El nombre tiene que ser el de la columna Mueble del CSV')
  end

  def test_every_piece_with_geometry_once_and_where_it_is_in_the_model
    assert_match(/volvé a generar/,error(with { |d| d['muebles'][0]['piezas'].pop }))
    assert_match(/volvé a generar/,error(with { |d| d['muebles'][0]['piezas'] << piece('101/9',IDENTITY) }),'El grupo sin geometría propia no es pieza')
    assert_match(/volvé a generar/,error(with { |d| d['muebles'][1]['piezas'][0]['id']='101/2' }))
    assert_match(/se movió/,error(with { |d| d['muebles'][1]['piezas'][0]['transform']=at(2000,0,1500.5) }))
    assert_match(/inválida/,error(with { |d| d['muebles'][1]['piezas'][0]['transform']=at(1,2,3).first(15) }))
    assert_match(/inválida/,error(with { |d| d['muebles'][1]['piezas'][0]['caja']={'min'=>[0,0,0],'max'=>[1,'x',1]} }))
    # Redondeo de la UI (6 decimales en la rotación, 2 en la traslación): no es un cambio del modelo.
    O.check(with { |d| d['muebles'][1]['piezas'][0]['transform']=at(2000.004,0,1500) },document)
  end

  def test_respects_the_limits_of_the_guides
    doc=document;doc['furniture']=Array.new(PlanosSanto::Exporter::MAX_FURNITURE+1) { |i| {'id'=>"x#{i}",'name'=>"M#{i}",'children'=>[mesh_node("x#{i}/1",'P',IDENTITY)]} }
    data=package;data['muebles']=doc['furniture'].map { |root| {'id'=>root['id'],'nombre'=>root['name'],'codigo'=>'','medidas'=>{'alto'=>1,'ancho'=>1,'profundidad'=>1},'piezas'=>[piece("#{root['id']}/1",IDENTITY)]} }
    assert_match(/500 muebles/,error(JSON.generate(data),doc))
  end
end
