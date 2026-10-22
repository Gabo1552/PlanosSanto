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
# F-DESP-B: the A4 prints the rows that validate and marks the rest «pendiente de pedido».
class OrderReferencesTest < Minitest::Test
 def setup
  @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
  @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
  @workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
 end
 def teardown;FileUtils.remove_entry(@dir);end
 def draft
  sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false,'approved'=>true)
  edge=@store.new_item('Canto de prueba','edge');edge.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22,'approved'=>true)
  sheet['compatibleIds']=[edge['id']];catalog=@store.save([sheet,edge],0)
  draft=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog).proposal
  draft['rows'].each do |row|
   row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>sheet['id'],'principalId'=>edge['id'],'edgeMap'=>[1,0,0,1],
    'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted','orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,'edgeResolution'=>'manual','edgeOverrideReason'=>'Inspección manual sintética para prueba','reviewNote'=>'Caso sintético, terminadas verificadas para prueba')
  end
  draft
 end
 def test_requires_a_saved_draft
  error=assert_raises(PlanosSanto::ExportError){PlanosSanto::OrderReferences.partial(@model,@workshop)}
  assert_match(/Guardá primero/,error.message)
 end
 def test_valid_rows_print_and_unvalidated_rows_stay_pending_while_full_references_still_refuse
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'][1]['orientationConfirmed']=false
  @workshop.save_plan(plan)
  assert_raises(PlanosSanto::ExportError){@workshop.references}
  result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal [ids[0]],result['references'].keys
  assert_equal [ids[1]],result['pending']
  assert_empty result['excluded']
  reference=result['references'][ids[0]]
  assert_equal [1,0,0,1],reference['edgeMap'];assert_equal 'TEST-18 / 19.05 mm',reference['board']
  assert_equal 1,reference['lot'];assert_equal false,reference['grain']
  assert_equal 'TEST-18 / 19.05 mm · Arr:EDGE-1 Aba:sin Izq:sin Der:EDGE-1',reference['text']
 end
 def test_complete_draft_matches_the_full_references_and_reports_excluded_rows
  plan=draft;ids=plan['rows'].map { |row| row['id'] }
  plan['rows'][1].merge!('include'=>false,'excludeReason'=>'Exclusión sintética revisada')
  @workshop.save_plan(plan)
  full=@workshop.references;result=PlanosSanto::OrderReferences.partial(@model,@workshop)
  assert_equal full.keys,result['references'].keys
  full.each { |id,value| assert_equal value,result['references'][id].reject { |key,_| %w[lot grain].include?(key) } }
  assert_empty result['pending'];assert_equal [ids[1]],result['excluded']
 end
 def test_stale_catalog_refuses_instead_of_printing_old_references
  @workshop.save_plan(draft)
  catalog=@store.read;@store.save(catalog['items'],catalog['revision'])
  error=assert_raises(PlanosSanto::ExportError){PlanosSanto::OrderReferences.partial(@model,@workshop)}
  assert_match(/desactualizado/,error.message)
 end
end
