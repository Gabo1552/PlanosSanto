# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'cantos_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'
require_relative '../order_references'
# CANTOS-04: the supplier TXT, the references printed on the A4 and the partial references carry, for
# five asymmetric pieces, the same Arr·Aba·Izq·Der map over the same base × height.
class CantosCoincidenciaTest < Minitest::Test
 def setup
  @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
  @model=CantosFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['3'])
  sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false,'approved'=>true)
  first=@store.new_item('Canto principal','edge');first.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22,'approved'=>true)
  second=@store.new_item('Canto secundario','edge');second.merge!('sku'=>'EDGE-2','supplier'=>'Proveedor de prueba','thicknessMm'=>2,'widthMm'=>22,'approved'=>true)
  sheet['compatibleIds']=[first['id'],second['id']];@catalog=@store.save([sheet,first,second],0)
  @service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,@catalog)
  @draft=CantosFixture.rows!(@service.proposal,sheet['id'],first['id'],second['id'])
  @workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
 end
 def teardown;FileUtils.remove_entry(@dir);end
 def test_five_asymmetric_pieces_share_the_same_edge_map_in_txt_and_printed_references
  assert_equal 5,@draft['rows'].length
  @workshop.save_plan(@draft)
  references=@workshop.references;partial=PlanosSanto::OrderReferences.partial(@model,@workshop)
  result=@service.export(@draft,@dir)
  lines=File.read(File.join(result['directory'],'lote-01.txt')).lines.map { |l| l.chomp.split("\t") }.select { |cols| cols[0]=~/\A\d+\z/ }
  assert_equal 5,lines.length,'cada pieza asimétrica es su propio renglón del TXT'
  CantosFixture::PIECES.each do |piece|
   row=@draft['rows'].find { |r| r['detail']==piece['detail'] }
   line=lines.find { |cols| cols[3]==piece['detail'] }
   base,height=@service.dimensions(row)
   assert_equal [base,height].map { |value| value.round(3) },[line[1],line[2]].map { |value| value.tr(',','.').to_f },piece['detail']
   assert_equal piece['edgeMap'],line[5,4].map(&:to_i),"TXT #{piece['detail']}"
   assert_equal piece['edgeMap'],references.fetch(row['id'])['edgeMap'],"A4 #{piece['detail']}"
   assert_equal piece['edgeMap'],partial['references'].fetch(row['id'])['edgeMap'],"A4 parcial #{piece['detail']}"
   assert_equal [base,height],references.fetch(row['id']).values_at('base','height')
   sides=%w[Arr Aba Izq Der].zip(piece['edgeMap']).map { |side,role| "#{side}:#{role==0 ? 'sin' : %w[EDGE-1 EDGE-2][role-1]}" }.join(' ')
   assert_equal "TEST-18 / 19.05 mm · #{sides}",references.fetch(row['id'])['text']
  end
 end
end
