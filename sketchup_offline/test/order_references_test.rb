# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'
require_relative '../order_references'
# F-DESP-B / punto 17: the A4 prints the rows that validate (from the model proposal, no saved draft
# or ticks needed) and marks the rest «pendiente de pedido».
class OrderReferencesTest < Minitest::Test
 def setup
  @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
  @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
  @workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
 end
 def teardown;FileUtils.remove_entry(@dir);end
 def draft
  # Fichas completas, sin `approved`; filas con datos y sin ningún tilde.
  sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false)
  edge=@store.new_item('Canto de prueba','edge');edge.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22)
  catalog=@store.save([sheet,edge],0)
  draft=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog).proposal
  draft['rows'].each do |row|
   row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>catalog['items'][0]['id'],'principalId'=>catalog['items'][1]['id'],'edgeMap'=>[1,0,0,1],'grainPolicy'=>'locked','dimensionRule'=>'finished_accepted')
  end
  draft
 end
 def test_valid_rows_print_and_unvalidated_rows_stay_pending_while_full_references_still_refuse
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'][1]['axes']=[1,2] # espesor distinto del eje: problema físico
  @workshop.save_plan(plan)
  assert_raises(PlanosSanto::ExportError){@workshop.references}
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal [ids[0]],result['references'].keys
  assert_equal [ids[1]],result['pending']
  assert_empty result['excluded']
  reference=result['references'][ids[0]]
  assert_equal [1,0,0,1],reference['edgeMap'];assert_equal 'TEST-18 / 19,05 mm',reference['board']
  refute reference.key?('lot'),'con filas pendientes el lote todavía puede cambiar';assert_equal false,reference['grain']
  assert_equal 'TEST-18 / 19,05 mm · Arr:EDGE-1 Aba:sin Izq:sin Der:EDGE-1',reference['text']
 end
 def test_complete_draft_matches_the_full_references_and_reports_excluded_rows
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'][1].merge!('include'=>false,'excludeReason'=>'Exclusión sintética revisada')
  @workshop.save_plan(plan)
  full=@workshop.references;result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal full.keys,result['references'].keys
  full.each { |id,value| assert_equal value,result['references'][id].reject { |key,_| %w[lot grain].include?(key) } }
  assert_empty result['pending'];assert_equal [ids[1]],result['excluded'];assert_equal 1,result['references'][ids[0]]['lot']
 end
 def test_valid_rows_carry_the_module_piece_code_of_the_txt_detail
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'][1]['axes']=[1,2]
  @workshop.save_plan(plan)
  @workshop.define_singleton_method(:codes) { {ids[0]=>'M03·P07',ids[1]=>'M03·P08'} }
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal 'M03·P07',result['references'][ids[0]]['code']
  assert_equal 'M03·P07 Pieza',PlanosSanto::OrderProposal.detail_text({'detailCode'=>'module_piece'},{'id'=>ids[0],'detail'=>'Pieza'},@workshop.codes)
  @workshop.define_singleton_method(:codes) { {ids[0]=>''} }
  refute PlanosSanto::OrderReferences.partial(@model,@workshop)['references'][ids[0]].key?('code'),'un código repetido o ausente no se inventa'
 end
 def test_an_unfinished_txt_profile_does_not_block_the_printed_references
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  @workshop.save_plan(plan)
  raw=JSON.parse(@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY));raw['profile']={'encoding'=>'latin9'}
  @model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,JSON.generate(raw))
  assert_raises(PlanosSanto::ExportError){@workshop.references}
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal ids.sort,result['references'].keys.sort;assert_empty result['pending']
 end
 def test_a_draft_without_included_pieces_prints_without_order_data
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'].each { |row| row.merge!('include'=>false,'excludeReason'=>'Exclusión sintética revisada') }
  @workshop.save_plan(plan)
  assert_equal({'references'=>{},'pending'=>[],'excluded'=>ids},PlanosSanto::OrderReferences.partial(@model,@workshop))
 end
 def test_without_a_saved_draft_the_proposal_from_the_model_is_printed
  draft # biblioteca con fichas completas, pero el doble no tiene pintada ninguna placa de la biblioteca
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_empty result['references'];assert_equal %w[1/11 1/13/12],result['pending'].sort;assert_empty result['excluded']
 end
 def test_a_library_change_keeps_the_saved_order_and_prints_current_data
  @workshop.save_plan(draft)
  catalog=@store.read;catalog['items'][0]['sku']='TEST-18B';@store.save(catalog['items'],catalog['revision'])
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal 2,result['references'].length,'El borrador no se descarta por cambiar la biblioteca'
  assert result['references'].values.all? { |reference| reference['board']=='TEST-18B / 19,05 mm' },'Se imprimen los datos vigentes de la ficha'
 end
end
