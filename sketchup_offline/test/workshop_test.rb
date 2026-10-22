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
  # Fichas completas: el pedido ya no mira la casilla `approved` (queda false a propósito).
  sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false)
  edge=@store.new_item('Canto de prueba','edge');edge.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22)
  @store.save([sheet,edge],0)
 end
 def order
  catalog=approved_catalog;service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog);draft=service.proposal
  # Solo datos: ni una confirmación, ni nota de revisión, ni origen de cantos.
  draft['rows'].each do |row|
   row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>catalog['items'][0]['id'],'principalId'=>catalog['items'][1]['id'],'edgeMap'=>[1,0,0,0],'grainPolicy'=>'locked','dimensionRule'=>'finished_accepted')
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

 def test_references_carry_the_same_edge_map_board_and_cut_as_the_supplier_txt
  service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  catalog=@store.read;second=@store.new_item('Canto secundario','edge');second.merge!('sku'=>'EDGE-2','supplier'=>'Proveedor de prueba','thicknessMm'=>0.4,'widthMm'=>22,'approved'=>true)
  items=catalog['items'];items[0]['compatibleIds']=[items[1]['id'],second['id']];saved=@store.save([*items,second],catalog['revision'])
  service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,saved);draft=service.proposal.merge('rows'=>draft['rows'])
  draft['catalogRevision']=saved['revision'];draft['rows'].each { |row| row.merge!('secondaryId'=>second['id'],'edgeMap'=>[1,1,0,2]) }
  draft['rows'][1].merge!('include'=>false,'excludeReason'=>'Exclusión sintética revisada')
  workshop.save_plan(draft);reference=workshop.references.fetch('1/11')
  base,height=service.dimensions(draft['rows'][0])
  assert_equal({'board'=>'TEST-18 / 19.05 mm','edgeMap'=>[1,1,0,2],'principal'=>'EDGE-1','secondary'=>'EDGE-2','base'=>base,'height'=>height},reference.reject { |key,_| key=='text' })
  assert_equal 'TEST-18 / 19.05 mm · Arr:EDGE-1 Aba:EDGE-1 Izq:sin Der:EDGE-2',reference['text']
  result=service.export(draft,@dir);line=File.read(File.join(result['directory'],'lote-01.txt')).lines.map { |l| l.chomp.split("\t") }.find { |cols| cols[0]=~/\A\d+\z/ }
  assert_equal reference['edgeMap'],line[5,4].map(&:to_i)
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

 def test_audit_lists_each_blocked_physical_row_instead_of_dropping_it
  service,draft=order;draft['rows'][0]['principalId']=nil;draft['rows'][1]['axes']=[1,2]
  errors=service.validate(draft,collect_errors:true);assert_equal ['1/11','1/13/12'],errors.map { |e| e['id'] };assert errors.all? { |e| !e['reason'].empty? }
  assert_raises(PlanosSanto::ExportError){service.export(draft,@dir)};assert_empty Dir[File.join(@dir,'PlanosSanto-pedido-*')]
 end
 def test_ux2_audit_lists_every_independent_reason_and_keeps_first_as_reason
  service,draft=order;row=draft['rows'][0]
  row.merge!('detail'=>'D'*81,'grainPolicy'=>'rotate','dimensionRule'=>'explicit_cut','cutBase'=>3500,'cutHeight'=>600)
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert_equal blocked['reasons'].first,blocked['reason'];assert_operator blocked['reasons'].length,:>=,2
  assert_includes blocked['reasons'],'El detalle supera 80 caracteres: acortalo.'
  assert_includes blocked['reasons'],'Cantos asimétricos: no se puede girar la pieza; mantené la orientación (rota 0).'
  refute blocked['reasons'].any? { |r| r.include?('no entra') },'Las medidas inválidas no se comparan con la placa'
  row.merge!('detail'=>'Lateral','grainPolicy'=>'locked')
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert_equal ['La pieza no entra en la placa: mide 3.500 × 600 mm y la placa es 3.000 × 2.000 mm.'],blocked['reasons']
 end
 def test_ux2_audit_reports_principal_and_secondary_edge_problems_together
  _service,draft=order;catalog=@store.read;catalog['items'][1]['widthMm']=10
  service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog);row=draft['rows'][0];row['edgeMap']=[1,2,0,0];row['secondaryId']=nil
  blocked=service.validate(draft,collect_errors:true).find { |e| e['id']==row['id'] }
  assert_includes blocked['reasons'],'El canto principal (1) es más angosto que el espesor de la pieza: ancho 10 mm y espesor 19,05 mm.',blocked['reasons'].inspect
  assert_includes blocked['reasons'],'Elegí un canto secundario (2) de la biblioteca.'
  normal=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert normal.message.end_with?(blocked['reasons'].first),normal.message
 end
 def test_ux2_check_and_export_errors_name_the_piece_and_show_values
  service,draft=order;row=draft['rows'][1];row['materialId']=''
  error=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert_equal "#{row['detail']} (#{row['id']}): Elegí una placa de la biblioteca.",error.message
  row['materialId']=draft['rows'][0]['materialId'];row['axes']=[0,2]
  error=assert_raises(PlanosSanto::ExportError){service.validate(draft)}
  assert_match(/\A.+ \(#{Regexp.escape(row['id'])}\): El espesor no coincide: el eje de espesor mide [\d,]+ mm y la placa tiene 19,05 mm\.\z/,error.message)
  draft['profile']['decimal']=';'
  assert_includes assert_raises(PlanosSanto::ExportError){service.validate(draft)}.message,'Perfil del archivo para la maderera'
 end
 def test_rectangular_mirrors_are_not_consolidated_as_same_orientation
  @model.entities[0].entities[0].transformation=Geom::Transformation.scale(-1,1,1)
  @session.scan;@session.generate(['1']);service,draft=order;draft['rows'].each { |row| row['detail']='Pieza igual' }
  result=service.export(draft,@dir);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
  assert_equal 1,result['lots'];assert_equal 2,manifest['lots'][0]['textRows'];assert_equal 2,manifest['lots'][0]['physicalQuantity']
 end

 def test_order_refuses_physical_problems_and_stale_catalog
  service,draft=order
  assert service.validate(draft),'Se exporta sin ningún tilde cuando no hay problemas físicos'
  changes=[->(d){d['rows'][0]['principalId']=nil},->(d){d['rows'][0]['axes']=[1,2]},->(d){d['catalogRevision']=0},->(d){d['rows'].pop},
           ->(d){d['rows'][0]['grainPolicy']='rotate'},->(d){d['rows'][0]['detail']='D'*81},->(d){d['rows'][0]['materialId']=''},->(d){d['rows'][0]['dimensionRule']='explicit_cut'}]
  changes.each { |change| copy=Marshal.load(Marshal.dump(draft));change.call(copy);assert_raises(PlanosSanto::ExportError){service.validate(copy)} }
  draft['rows'][0]['include']=false;assert service.validate(draft),'Excluir no pide motivo'
  draft['rows'][1]['include']=false;assert_raises(PlanosSanto::ExportError){service.validate(draft)}
 end
 def test_legacy_ticks_of_a_0815_draft_are_dropped_and_never_block
  service,draft=order
  draft['rows'].each { |row| row.merge!('orientationConfirmed'=>false,'materialConfirmed'=>false,'dimensionsConfirmed'=>false,'edgesConfirmed'=>false,'grainConfirmed'=>false,'grainAxis'=>'u','reviewNote'=>'','edgeResolution'=>nil,'edgeOverrideReason'=>'') }
  normalized=service.validate(draft)
  assert normalized['rows'].all? { |row| row.keys.sort==PlanosSanto::SupplierOrder::ROW_KEYS.sort }
  draft['rows'][0]['inventado']=true;assert_raises(PlanosSanto::ExportError){service.validate(draft)}
 end
 def test_references_follow_the_proposal_and_survive_a_library_change_never_assigning_excluded_pieces
  service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  # Sin borrador guardado: el pedido se propone desde el modelo (el doble no está pintado con placas de la biblioteca).
  assert_match(/Elegí una placa/,assert_raises(PlanosSanto::ExportError){workshop.references}.message)
  draft['rows'][1]['include']=false
  workshop.save_plan(draft);references=workshop.references
  assert_equal ['1/11'],references.keys;assert_includes references['1/11']['text'],'TEST-18';assert_includes references['1/11']['text'],'Arr:EDGE-1'
  catalog=@store.read;@store.save(catalog['items'],catalog['revision'])
  assert_equal references,workshop.references,'El borrador no se descarta cuando cambia la revisión de la biblioteca'
 end
 def test_068_and_0815_drafts_migrate_without_overwriting_and_keep_the_taller_data
  _service,draft=order
  draft['rows'].each { |row| %w[edgeResolution edgeBindings edgeOverrideReason grainPolicy].each { |key| row.delete(key) };row['orientationConfirmed']=true }
  raw=JSON.generate(draft.slice('schema','fingerprint','catalogRevision','rows','profile'));@model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,raw)
  workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir);result=workshop.plan;migrated=result['plan']
  first=migrated['rows'][0]
  assert_equal [],first['edgeBindings'];assert_equal 'locked',first['grainPolicy'];refute first.key?('orientationConfirmed')
  assert_equal [[0,1],[1,0,0,0],draft['rows'][0]['materialId']],[first['axes'],first['edgeMap'],first['materialId']],'Lo que había cargado el taller se conserva'
  assert_equal raw,@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY),'Abrir el pedido no escribe el modelo'
  assert_empty result['audit']['blocked'];assert result['audit']['estimate']
  export=workshop.export_order(migrated,@dir);assert_equal 2,export['physicalQuantity']
 end
 def test_draft_survives_a_new_model_fingerprint_and_is_revalidated
  service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  draft['rows'][0]['detail']='Lateral izquierdo';draft['rows'][1]['include']=false
  workshop.save_plan(draft)
  before=@session.fingerprint
  @model.entities[0].entities[0].transformation=Geom::Transformation.rotation_z(0.8);@session.scan;@session.generate(['1'])
  refute_equal before,@session.fingerprint
  result=workshop.plan;plan=result['plan']
  assert_equal @session.fingerprint,plan['fingerprint']
  assert_equal 'Lateral izquierdo',plan['rows'].find { |r| r['id']=='1/11' }['detail'];refute plan['rows'].find { |r| r['id']=='1/13/12' }['include']
  assert result['merge']['stale'];assert_equal 0,result['merge']['added'];assert_equal 0,result['merge']['removed']
  assert_empty result['audit']['blocked'],'Después del cruce se revalida'
  saved=workshop.save_plan(plan);refute saved['changed'];assert_equal plan['fingerprint'],JSON.parse(@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY))['fingerprint']
  assert workshop.export_order(plan,@dir)
 end
 def test_autosave_skips_identical_writes_and_reports_live_problems
  service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  first=workshop.save_plan(draft);assert first['saved'];assert_empty first['audit']['blocked'];assert first['audit']['estimate']
  operations=@model.operations.length
  workshop.save_plan(workshop.plan['plan']);assert_equal operations,@model.operations.length,'Sin cambios no se agrega otra operación al deshacer'
  draft['rows'][0]['axes']=[1,2]
  live=workshop.save_plan(draft)['audit'];assert_equal ['1/11'],live['blocked'].map { |e| e['id'] };assert_nil live['estimate']
  assert_match(/El espesor no coincide/,live['blocked'][0]['reason'])
 end
 def test_hand_made_edges_export_without_any_justification
  service,draft=order;draft['rows'][0]['edgeMap']=[1,1,1,1]
  result=service.export(draft,@dir);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
  assert_equal({'1/11'=>'manual','1/13/12'=>'manual'},manifest['lots'][0]['edgeSource']);refute manifest['lots'][0].key?('edgeEvidence')
 end
 def test_exclusion_reason_is_optional_and_other_rows_still_report
  service,draft=order;draft['rows'][0].merge!('include'=>false,'excludeReason'=>'');draft['rows'][1]['axes']=[1,2]
  errors=service.validate(draft,collect_errors:true);assert_equal ['1/13/12'],errors.map { |row| row['id'] }
  assert_raises(PlanosSanto::ExportError){service.validate(draft)}
 end
 def test_incomplete_ficha_blocks_with_what_is_missing_instead_of_an_approval
  _service,draft=order;catalog=@store.read;catalog['items'][0].merge!('sku'=>'','grain'=>nil);catalog['items'][1]['widthMm']=nil
  service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,catalog)
  reasons=service.validate(draft,collect_errors:true)[0]['reasons']
  assert_includes reasons,'La ficha de la placa «Placa de prueba» está incompleta: falta SKU, veta. Completala en la biblioteca.'
  assert_includes reasons,'La ficha del canto «Canto de prueba» está incompleta: falta ancho. Completala en la biblioteca.'
 end
 def test_stale_or_partial_drafts_are_crossed_with_the_model_instead_of_refused
  _service,draft=order;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  draft['rows'][0]['detail']='Editado a mano'
  stale=workshop.save_plan(draft.merge('fingerprint'=>'otro'))
  assert stale['changed'];assert_equal @session.fingerprint,stale['plan']['fingerprint'];assert_equal 'Editado a mano',stale['plan']['rows'].find { |r| r['id']=='1/11' }['detail']
  partial=workshop.save_plan(draft.merge('rows'=>draft['rows'].first(1)))
  assert partial['changed'];assert_equal %w[1/11 1/13/12],partial['plan']['rows'].map { |r| r['id'] }.sort;assert_equal 1,partial['merge']['added']
  error=assert_raises(PlanosSanto::ExportError){workshop.add_item({'name'=>'X'},99)};assert_includes error.message,'volvé a abrirla'
 end
end
