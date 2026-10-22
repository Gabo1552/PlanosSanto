# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'
class WorkshopTest < Minitest::Test
 def setup
  @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
  @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
 end
 def teardown;FileUtils.remove_entry(@dir);end
 def approved_catalog
  sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false,'approved'=>true)
  edge=@store.new_item('Canto de prueba','edge');edge.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22,'approved'=>true)
  sheet['compatibleIds']=[edge['id']]
  @store.save([sheet,edge],0)
 end
 def order
  catalog=approved_catalog;service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog);draft=service.proposal
  draft['rows'].each do |row|
   row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>catalog['items'][0]['id'],'principalId'=>catalog['items'][1]['id'],'edgeMap'=>[1,0,0,0],
    'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted','orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,'edgeResolution'=>'manual','edgeOverrideReason'=>'Inspección manual sintética para prueba','reviewNote'=>'Caso sintético, terminadas verificadas para prueba')
  end
  [service,draft]
 end
 def test_catalog_persists_across_instances_revision_backup_and_corrupt_file_protection
  catalog=approved_catalog
  assert_equal catalog,PlanosSanto::CatalogStore.new(directory:@dir).read
  items=Marshal.load(Marshal.dump(catalog['items']));items[0]['favorite']=true
  saved=@store.save(items,1);assert saved['items'][0]['favorite'];assert_equal 1,Dir[File.join(@dir,'backups','*.json')].length
  assert_raises(PlanosSanto::ExportError){@store.save(items,1)};assert_equal saved,@store.read
  File.write(File.join(@dir,'catalog.json'),'{broken')
  assert_raises(PlanosSanto::ExportError){@store.read};assert_equal '{broken',File.read(File.join(@dir,'catalog.json'))
 end
 def test_candidate_import_is_idempotent_unapproved_and_conflicts_remain_distinct
  raw={'items'=>[{'nombre_en_modelos'=>'Melamina','tipo_opencutlist'=>'2','espesor'=>'18mm'},{'nombre_en_modelos'=>'Melamina','tipo_opencutlist'=>'2','espesor'=>'19mm'}]}
  first=@store.import(raw,0);assert_equal 2,first['items'].length;assert first['items'].none? { |r| r['approved'] };assert first['items'].all? { |r| r['price'].nil? && r['thicknessMm'].nil? }
  assert_equal 1,@store.conflicts.length
  second=@store.import(raw,1);assert_equal 2,second['items'].length
  target=File.join(@dir,'copia.json');@store.export(target);assert_raises(PlanosSanto::ExportError){@store.export(target)}
 end
 def test_schema_zero_migrates_without_approving_and_unknown_schema_or_invalid_price_fails
  File.write(File.join(@dir,'catalog.json'),JSON.generate({'schema'=>0,'materials'=>[{'name'=>'Anterior','kind'=>'sheet'}]}))
  migrated=@store.read;refute migrated['items'][0]['approved'];assert_nil migrated['items'][0]['price']
  File.write(File.join(@dir,'catalog.json'),JSON.generate({'schema'=>99,'items'=>[]}));assert_raises(PlanosSanto::ExportError){@store.read}
  File.delete(File.join(@dir,'catalog.json'));catalog=approved_catalog
  catalog['items'][0]['price']={'amount'=>123,'currency'=>'ARS','unit'=>'m2','date'=>'2026-02-30','source'=>'Prueba'}
  assert_raises(PlanosSanto::ExportError){@store.save(catalog['items'],1)}
 end
 def test_order_exports_nine_tabs_per_row_grouped_only_for_identical_physical_records
  service,draft=order;draft['rows'].each { |r| r['detail']='M01 Lateral' }
  result=service.export(draft,@dir);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
  assert_equal 1,result['lots'];assert_equal 2,result['physicalQuantity'];assert_equal 1,manifest['lots'][0]['textRows']
  content=File.binread(File.join(result['directory'],'lote-01.txt'));assert content.end_with?("\r\n");refute content.start_with?("\xEF\xBB\xBF".b)
  cells=content.strip.split("\t");assert_equal 9,cells.length;assert_equal '2',cells[0];assert_equal ['609.6','406.4'],cells[1,2];assert_equal %w[1 0 0 0],cells[5,4]
  assert_equal ['1/11','1/13/12'],manifest['lots'][0]['physicalIds'];refute manifest['production_ready']
 end
 def test_rotated_mirrored_swapped_axes_preserve_physical_sizes_and_orientation_trace
  @model.entities[0].entities[0].transformation=Geom::Transformation.rotation_z(0.8)*Geom::Transformation.scale(-1,1,1)
  @session.scan;@session.generate(['1']);service,draft=order
  draft['rows'][0]['axes']=[1,0];draft['rows'][0]['frontSign']=-1;draft['rows'][0]['flipX']=true
  assert service.validate(draft);assert_equal [406.4,609.5999999999999],service.dimensions(draft['rows'][0])
  assert service.proposal['geometry']['1/11']['mirrored']
  result=service.export(draft,@dir);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
  assert_equal 2,manifest['lots'][0]['textRows']
 end
 def test_order_refuses_uncertainty_veta_missing_edge_incompatible_material_and_stale_catalog
  service,draft=order
  changes=[->(d){d['rows'][0]['orientationConfirmed']=false},->(d){d['rows'][0]['grainAxis']='u'},->(d){d['rows'][0]['principalId']=nil},->(d){d['rows'][0]['axes']=[1,2]},->(d){d['catalogRevision']=0},->(d){d['rows'].pop},->(d){d['rows'][0]['reviewNote']=''},->(d){d['rows'][0]['grainPolicy']='rotate'}]
  changes.each { |change| copy=Marshal.load(Marshal.dump(draft));change.call(copy);assert_raises(PlanosSanto::ExportError){service.validate(copy)} }
  draft['rows'][0]['include']=false;assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  draft['rows'][0]['excludeReason']='Herraje ajeno al pedido';assert service.validate(draft)
 end
 def test_explicit_cut_dimensions_and_encoding_are_used_without_guessing_reductions
  service,draft=order;row=draft['rows'][0];row.merge!('dimensionRule'=>'explicit_cut','cutBase'=>600.125,'cutHeight'=>400.5,'detail'=>'M01 Láteral')
  draft['profile']={'encoding'=>'windows1252','decimal'=>',','header'=>true}
  result=service.export(draft,@dir);bytes=File.binread(File.join(result['directory'],'lote-01.txt'))
  text=bytes.force_encoding('Windows-1252').encode('UTF-8');assert text.start_with?(PlanosSanto::SupplierOrder::COLUMNS.join("\t"));assert_includes text,'600,125';assert_includes text,'Láteral'
 end
 def test_model_order_draft_undo_and_no_catalog_or_geometry_writes
  approved_catalog;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir);result=workshop.plan
  before=@model.all_instances.map { |e| [e.name,e.definition.name,e.transformation.to_a] }
  workshop.save_plan(result['plan']);assert_equal result['plan']['rows'],workshop.plan['plan']['rows'];assert_equal before,@model.all_instances.map { |e| [e.name,e.definition.name,e.transformation.to_a] }
  @model.undo;assert_nil @model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
 end
 def test_missing_prices_are_pending_and_currencies_never_mixed
  service,draft=order;estimate=service.estimate(draft)
  assert_equal 4,estimate['pending'];assert_empty estimate['totalsByCurrency'];assert estimate['lines'].all? { |line| line['boardAmount'].nil? }
 end
 def test_estimate_separates_missing_old_future_prices_and_currencies_with_edge_lengths
  service,draft=order
  catalog=@store.read;board,edge=catalog['items']
  board['price']={'amount'=>1000,'currency'=>'ARS','unit'=>'m2','date'=>'2026-10-01','source'=>'Lista sintética'}
  edge['price']={'amount'=>2,'currency'=>'USD','unit'=>'metro','date'=>'2026-06-01','source'=>'Lista antigua sintética'}
  service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog)
  result=service.estimate(draft,today:Date.new(2026,10,17))
  assert_in_delta 495.48288,result['totalsByCurrency']['ARS'],0.00001
  refute result['totalsByCurrency'].key?('USD');assert_in_delta 2.4384,result['outdatedTotalsByCurrency']['USD'],0.00001
  assert_equal 2,result['outdated'];assert_equal 0,result['pending'];assert result['includesEdges'];refute result['optimized']
  edge['price']['date']='2026-11-01'
  assert_equal 'future_price',service.estimate(draft,today:Date.new(2026,10,17))['lines'][0]['charges'][1]['status']
 end
 def test_export_syntax_validator_and_no_side_effect_on_original_files
  service,draft=order;before=Marshal.dump(@model.all_instances.map { |e| [e.name,e.definition.name,e.transformation.to_a] })
  result=service.export(draft,@dir)
  assert system('python3','planos-santo-ocl-066/scripts/validar_pedido_txt.py',File.join(result['directory'],'lote-01.txt'),out:File::NULL)
  assert_equal before,Marshal.dump(@model.all_instances.map { |e| [e.name,e.definition.name,e.transformation.to_a] })
  assert_empty @model.operations
 end
 def test_original_ocl_gateway_requires_exact_version_and_only_opens_real_dialog
  assert_raises(PlanosSanto::ExportError){PlanosSanto::OclGateway.open('cutlist')}
  namespace=Module.new;plugin=Object.new;called=[];plugin.define_singleton_method(:show_tabs_dialog) { |tab| called << tab }
  namespace.const_set(:EXTENSION_VERSION,'7.1.0');namespace.const_set(:EXTENSION_BUILD,'202511301621');namespace.const_set(:PLUGIN,plugin)
  outer=Module.new;outer.const_set(:OpenCutList,namespace);Object.const_set(:Ladb,outer)
  result=PlanosSanto::OclGateway.open('cutlist');assert_equal ['cutlist'],called;refute result['optimized'];assert result['opened']
  assert_raises(PlanosSanto::ExportError){PlanosSanto::OclGateway.open('made_up_optimizer')}
  namespace.send(:remove_const,:EXTENSION_VERSION);namespace.const_set(:EXTENSION_VERSION,'9.0.0')
  assert_raises(PlanosSanto::ExportError){PlanosSanto::OclGateway.open('materials')};assert_equal ['cutlist'],called
 ensure
  Object.send(:remove_const,:Ladb) if Object.const_defined?(:Ladb,false)
 end

 def test_references_require_saved_complete_current_draft_and_never_assign_excluded_pieces
  service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  assert_raises(PlanosSanto::ExportError){workshop.references}
  workshop.save_plan(service.proposal);assert_raises(PlanosSanto::ExportError){workshop.references}
  draft['rows'][1]['include']=false;draft['rows'][1]['excludeReason']='Exclusión sintética revisada'
  workshop.save_plan(draft);references=workshop.references
  assert_equal ['1/11'],references.keys;assert_includes references['1/11'],'TEST-18';assert_includes references['1/11'],'Arr:EDGE-1'
  catalog=@store.read;@store.save(catalog['items'],catalog['revision']);assert_raises(PlanosSanto::ExportError){workshop.references}
 end
 def test_nested_non_uniform_scale_and_rotation_cannot_become_a_rectangular_order
  catalog=approved_catalog;document=Marshal.load(Marshal.dump(@session.document))
  PlanosSanto::Exporter.each_node(document['furniture']) do |node|
   next unless node['mesh']
   node['metadata']['worldTransform']=[1,0,0,0,0.5,1,0,0,0,0,1,0,0,0,0,1]
  end
  service=PlanosSanto::SupplierOrder.new(document,@session.fingerprint,catalog)
  refute service.proposal['geometry'].values.first['rectangular']
 end

 def test_068_draft_migrates_without_overwriting_and_requires_edge_review_again
  service,draft=order
  draft['rows'].each { |row| %w[edgeResolution edgeBindings edgeOverrideReason].each { |key| row.delete(key) } }
  raw=JSON.generate(draft.slice('schema','fingerprint','catalogRevision','rows','profile'));@model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,raw)
  workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir);migrated=workshop.plan['plan']
  assert_nil migrated['rows'][0]['edgeResolution'];refute migrated['rows'][0]['edgesConfirmed'];assert_equal [],migrated['rows'][0]['edgeBindings']
  assert_equal raw,@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
  assert_raises(PlanosSanto::ExportError){workshop.export_order(migrated,@dir)}
 end
 def test_audit_lists_each_blocked_physical_row_instead_of_dropping_it
  service,draft=order;draft['rows'][0]['edgeOverrideReason']='';draft['rows'][1]['orientationConfirmed']=false
  errors=service.validate(draft,collect_errors:true);assert_equal ['1/11','1/13/12'],errors.map { |e| e['id'] };assert errors.all? { |e| !e['reason'].empty? }
  assert_raises(PlanosSanto::ExportError){service.export(draft,@dir)};assert_empty Dir[File.join(@dir,'PlanosSanto-pedido-*')]
 end
 def test_manual_cantos_without_justification_and_observed_without_reader_are_blocked
  service,draft=order;draft['rows'][0]['edgeOverrideReason']=''
  assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  draft['rows'][0]['edgeResolution']='observed'
  assert_raises(PlanosSanto::ExportError){service.validate(draft)}
 end

 def test_audit_reports_unjustified_exclusion_and_other_blocked_rows_together
  service,draft=order;draft['rows'][0].merge!('include'=>false,'excludeReason'=>'');draft['rows'][1]['orientationConfirmed']=false
  errors=service.validate(draft,collect_errors:true);assert_equal ['1/11','1/13/12'],errors.map { |row| row['id'] };assert_includes errors[0]['reason'],'excluye'
  assert_raises(PlanosSanto::ExportError){service.validate(draft)}
 end

 def test_ux2_audit_lists_every_independent_reason_and_keeps_first_as_reason
  service,draft=order;row=draft['rows'][0]
  row.merge!('orientationConfirmed'=>false,'reviewNote'=>'','grainAxis'=>'u','dimensionRule'=>'explicit_cut','cutBase'=>3500,'cutHeight'=>600)
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert_equal blocked['reasons'].first,blocked['reason'];assert_operator blocked['reasons'].length,:>=,3
  assert_includes blocked['reasons'][0],'Falta confirmar orientación'
  assert blocked['reasons'].any? { |r| r.include?('justificación') }
  assert blocked['reasons'].any? { |r| r.include?('dirección de veta') }
  refute blocked['reasons'].any? { |r| r.include?('no entra') },'Las medidas inválidas no se comparan con la placa'
  row.merge!('reviewNote'=>'Medidas sintéticas revisadas para la prueba')
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert blocked['reasons'].any? { |r| r.include?('mide 3.500 × 600 mm y la placa aprobada es 3.000 × 2.000 mm') },blocked['reasons'].inspect
 end
 def test_ux2_audit_reports_principal_and_secondary_edge_problems_together
  _service,draft=order;catalog=@store.read;catalog['items'][1]['widthMm']=10
  service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog);row=draft['rows'][0];row['edgeMap']=[1,2,0,0];row['secondaryId']=nil
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert_includes blocked['reasons'],'El canto principal (1) no cubre el espesor de la placa: ancho 10 mm y espesor 19,05 mm.',blocked['reasons'].inspect
  assert_includes blocked['reasons'],'Elegí un canto secundario (2) aprobado de la biblioteca.'
  normal=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert normal.message.end_with?(blocked['reasons'].first),normal.message
 end
 def test_ux2_check_and_export_errors_name_the_piece_and_show_values
  service,draft=order;row=draft['rows'][1];row['materialConfirmed']=false
  error=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert_equal "#{row['detail']} (#{row['id']}): Falta confirmar material.",error.message
  row['materialConfirmed']=true;row['axes']=[0,2]
  error=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert_match(/\A.+ \(#{Regexp.escape(row['id'])}\): El espesor no coincide: el eje de espesor mide [\d,]+ mm y la placa aprobada tiene 19,05 mm\.\z/,error.message)
  draft['profile']['decimal']=';'
  assert_includes assert_raises(PlanosSanto::ExportError){service.validate(draft)}.message,'Perfil del archivo para la maderera'
 end
 def test_ux2_draft_errors_say_how_to_recover
  _service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  stale=draft.merge('fingerprint'=>'otro');assert_includes assert_raises(PlanosSanto::ExportError){workshop.save_plan(stale)}.message,'usá «Preparar de nuevo»'
  partial=draft.merge('rows'=>draft['rows'].first(1));assert_includes assert_raises(PlanosSanto::ExportError){workshop.save_plan(partial)}.message,'mismas piezas'
  error=assert_raises(PlanosSanto::ExportError){workshop.add_item({'name'=>'X'},99)};assert_includes error.message,'volvé a abrirla'
 end

 def test_rectangular_mirrors_are_not_consolidated_as_same_orientation
  @model.entities[0].entities[0].transformation=Geom::Transformation.scale(-1,1,1)
  @session.scan;@session.generate(['1']);service,draft=order;draft['rows'].each { |row| row['detail']='Pieza igual' }
  result=service.export(draft,@dir);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
  assert_equal 1,result['lots'];assert_equal 2,manifest['lots'][0]['textRows'];assert_equal 2,manifest['lots'][0]['physicalQuantity']
 end

end
