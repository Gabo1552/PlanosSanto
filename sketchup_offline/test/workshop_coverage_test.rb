# frozen_string_literal: true
# Cobertura de ramas de Workshop con dobles (fake_api + names_double). OclReader se
# reemplaza con stubs de Minitest donde haría falta un recorrido real de OpenCutList.
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'

class WorkshopCoverageTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
    @workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def approved_catalog(second:false)
    sheet=@store.new_item('Melamina Blanca','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false,'approved'=>true)
    edge=@store.new_item('Canto ABS','edge');edge.merge!('sku'=>'ABS-22','supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true)
    items=[sheet,edge]
    if second
      other=@store.new_item('Canto PVC','edge');other.merge!('sku'=>'PVC-22','supplier'=>'Maderera de prueba','thicknessMm'=>2,'widthMm'=>22,'approved'=>true);items << other
    end
    sheet['compatibleIds']=items.drop(1).map { |i| i['id'] }
    @store.save(items,@store.read['revision'])
  end
  def ready_draft(catalog)
    draft=@workshop.plan['plan']
    draft['rows'].each do |row|
      row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>catalog['items'][0]['id'],'principalId'=>catalog['items'][1]['id'],'edgeMap'=>[1,0,0,0],
        'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted','orientationConfirmed'=>true,
        'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,'edgeResolution'=>'manual',
        'edgeOverrideReason'=>'Inspección manual en el taller','reviewNote'=>'Medidas terminadas revisadas')
    end
    draft
  end
  def binding(item);{'catalogId'=>item['id'],'kind'=>item['kind'],'catalogFingerprint'=>PlanosSanto::MaterialResolver.item_fingerprint(item)};end
  def report(materials,complete:true,faces:nil)
    faces||=materials.map { |m| {'front_material_id'=>m['id'],'back_material_id'=>nil} }
    {'complete'=>complete,'pieces'=>[{'path'=>%w[1 11],'faces'=>faces}],'materials'=>materials}
  end
  def native(id,category,item,status:'valid');{'id'=>id,'category'=>category,'native_status'=>status,'native_binding'=>item && binding(item)};end

  # --- Biblioteca --------------------------------------------------------------
  def test_catalog_reports_conflicts_and_add_item_appends_unapproved_item
    empty=@workshop.catalog;assert_equal [],empty['catalog']['items'];assert_equal [],empty['conflicts']
    result=@workshop.add_item({'name'=>'Fibrofácil 15 mm'},0)
    assert_equal ['Fibrofácil 15 mm'],result['catalog']['items'].map { |i| i['name'] }
    assert_equal 'unknown',result['catalog']['items'][0]['kind'];refute result['catalog']['items'][0]['approved']
    result=@workshop.add_item({'name'=>'Canto haya','kind'=>'edge'},1);assert_equal 'edge',result['catalog']['items'][1]['kind']
    assert_raises(KeyError){@workshop.add_item({},2)}
  end

  # --- Propuesta de material nativo -------------------------------------------
  def test_native_proposal_binds_single_sheet_and_valid_edges_only
    catalog=approved_catalog(second:true);sheet,edge,other=catalog['items']
    materials=[native('m-sheet','sheet',sheet),native('m-edge','edge',edge),native('m-edge2','edge',other,status:'conflict'),native('m-x','edge',nil)]
    patch=@workshop.native_proposal(report(materials),'1/11',catalog)
    assert_equal({'materialId'=>sheet['id'],'edgeBindings'=>[{'observedId'=>'m-edge','catalogId'=>edge['id']}]},patch)
    two_sheets=[native('a','sheet',sheet),native('b','sheet',sheet)]
    assert_equal({},@workshop.native_proposal(report(two_sheets),'1/11',catalog),'Dos placas en una pieza: no se adivina')
    assert_equal({},@workshop.native_proposal(report(materials),'1/99',catalog),'Pieza sin recorrido: sin propuesta')
    stale=Marshal.load(Marshal.dump(sheet));stale['thicknessMm']=18
    assert_equal({},@workshop.native_proposal(report([native('m-sheet','sheet',stale)]),'1/11',catalog),'Huella de biblioteca vencida')
    unapproved=Marshal.load(Marshal.dump(catalog));unapproved['items'][0]['approved']=false
    assert_equal({},@workshop.native_proposal(report([native('m-sheet','sheet',sheet)]),'1/11',unapproved))
  end

  # --- Verificación de fuente nativa -------------------------------------------
  def test_verify_native_source_blocks_invalid_incomplete_and_mismatched_sheets
    catalog=approved_catalog;sheet,=catalog['items'];row={'id'=>'1/11','materialId'=>sheet['id'],'edgeBindings'=>[]}
    assert_nil @workshop.verify_native_source(report([]),row,{},catalog),'Sin vínculos nativos no hay nada que verificar'
    assert_match(/inválidos o en conflicto/,assert_raises(PlanosSanto::ExportError){@workshop.verify_native_source(report([native('s','sheet',sheet,status:'invalid')]),row,{},catalog)}.message)
    assert_match(/incompleto/,assert_raises(PlanosSanto::ExportError){@workshop.verify_native_source(report([native('s','sheet',sheet)],complete:false),row,{},catalog)}.message)
    assert_nil @workshop.verify_native_source(report([native('s','sheet',sheet)]),row,{},catalog)
    assert_match(/no coincide con el material/,assert_raises(PlanosSanto::ExportError){@workshop.verify_native_source(report([native('s','sheet',sheet)]),row.merge('materialId'=>'otra'),{},catalog)}.message)
    stale=Marshal.load(Marshal.dump(sheet));stale['grain']=true
    assert_match(/ítem aprobado vigente/,assert_raises(PlanosSanto::ExportError){@workshop.verify_native_source(report([native('s','sheet',stale)]),row,{},catalog)}.message)
  end
  def test_verify_native_source_asymmetric_native_edges_must_match_map_roles
    catalog=approved_catalog(second:true);sheet,edge,other=catalog['items']
    materials=[native('s','sheet',sheet),native('e1','edge',edge),native('e2','edge',other)]
    row={'id'=>'1/11','materialId'=>sheet['id'],'principalId'=>edge['id'],'secondaryId'=>other['id'],'edgeMap'=>[1,0,2,0],
         'edgeBindings'=>[{'observedId'=>'e1','catalogId'=>edge['id']},{'observedId'=>'e2','catalogId'=>other['id']}]}
    sides=->(*ids) { ids.map { |id| {'status'=>id ? 'observed_edge' : 'observed_no_edge','materialIds'=>id ? [id] : []} } }
    verify=->(observation,r=row) { PlanosSanto::OclReader.stub(:projected_edges,observation) { @workshop.verify_native_source(report(materials),r,{},catalog) } }
    verify.call({'sides'=>sides.call('e1',nil,'e2',nil)}) # Arr=principal(1), Izq=secundario(2): no lanza
    assert_match(/mapa manual no coincide/,assert_raises(PlanosSanto::ExportError){verify.call({'sides'=>sides.call('e1',nil,nil,'e2')})}.message)
    swapped=row.merge('principalId'=>other['id'],'secondaryId'=>edge['id'])
    assert_match(/mapa manual no coincide/,assert_raises(PlanosSanto::ExportError){verify.call({'sides'=>sides.call('e1',nil,'e2',nil)},swapped)}.message)
    assert_match(/cara perimetral verificable/,assert_raises(PlanosSanto::ExportError){verify.call({'sides'=>sides.call('e1',nil,nil,nil)})}.message)
    unbound=row.merge('edgeBindings'=>[{'observedId'=>'e1','catalogId'=>edge['id']}])
    assert_match(/Confirmá el vínculo/,assert_raises(PlanosSanto::ExportError){verify.call({'sides'=>sides.call('e1',nil,'e2',nil)},unbound)}.message)
    ambiguous={'sides'=>[{'status'=>'observed_edge','materialIds'=>%w[e1 e2]},*sides.call(nil,'e2',nil)]}
    assert_match(/ambigua/,assert_raises(PlanosSanto::ExportError){verify.call(ambiguous)}.message)
  end

  # --- Borrador de pedido en el modelo ------------------------------------------
  def test_plan_ignores_reset_oversized_or_foreign_drafts_and_reports_corruption
    approved_catalog;draft=@workshop.plan['plan'];draft['rows'][0]['detail']='Lateral izq. 1.234,5'
    @workshop.save_plan(draft)
    assert_equal 'Lateral izq. 1.234,5',@workshop.plan['plan']['rows'][0]['detail']
    refute_equal 'Lateral izq. 1.234,5',@workshop.plan(true)['plan']['rows'][0]['detail'],'reset=true parte de la propuesta'
    stored=JSON.parse(@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY))
    @model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,JSON.generate(stored.merge('fingerprint'=>'otro')))
    refute_equal 'Lateral izq. 1.234,5',@workshop.plan['plan']['rows'][0]['detail'],'Borrador de otra geometría se ignora sin borrarlo'
    @model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,42);assert @workshop.plan['plan']
    @model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,'{roto')
    assert_match(/dañado/,assert_raises(PlanosSanto::ExportError){@workshop.plan}.message)
    assert_equal '{roto',@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
  end
  def test_save_plan_rejects_foreign_rows_and_aborts_failed_operations
    approved_catalog;draft=@workshop.plan['plan']
    foreign=Marshal.load(Marshal.dump(draft));foreign['rows'][0]['precio']=1
    assert_match(/otra versión/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(foreign)}.message)
    assert_match(/desactualizado/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan('no')}.message)
    @model.define_singleton_method(:commit_operation) { @operations << [:commit];false }
    assert_match(/No se pudo guardar/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(draft)}.message)
    assert_equal :abort,@model.operations.last[0];assert_nil @model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
    @model.define_singleton_method(:start_operation) { |*_| false }
    count=@model.operations.length
    assert_match(/iniciar/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(draft)}.message);assert_equal count,@model.operations.length
  end
  def test_save_plan_refuses_drafts_over_eight_megabytes
    approved_catalog;draft=@workshop.plan['plan']
    huge=draft.merge('profile'=>draft['profile'].merge('relleno'=>'x'*(8*1024*1024)))
    assert_match(/demasiado grande/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(huge)}.message);assert_empty @model.operations
  end

  # --- Hito 3: extras del borrador y acciones de propuesta ------------------------
  def test_plan_carries_draft_extras_and_codes_and_save_plan_validates_them
    catalog=approved_catalog(second:true);plan=@workshop.plan['plan']
    assert_equal [[],'none',{}],plan.values_at('edgeLinks','detailCode','codes')
    plan['edgeLinks']=[{'observedId'=>'material:888','catalogId'=>catalog['items'][1]['id'],'name'=>'Canto de prueba'}];plan['detailCode']='module_piece'
    @workshop.save_plan(plan);stored=JSON.parse(@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY))
    refute stored.key?('codes'),'Los códigos se calculan, no se guardan';refute stored.key?('geometry')
    again=@workshop.plan['plan'];assert_equal plan['edgeLinks'],again['edgeLinks'];assert_equal 'module_piece',again['detailCode']
    assert_match(/Tabla de vínculos/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(plan.merge('edgeLinks'=>[{'observedId'=>'x'}]))}.message)
    assert_match(/código en el detalle/,assert_raises(PlanosSanto::ExportError){@workshop.save_plan(plan.merge('detailCode'=>'sí'))}.message)
    guide={'version'=>1,'revision'=>1,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0,'zoom'=>1,'notes'=>[],
      'naming'=>{'moduleCode'=>'M02','bases'=>[{'id'=>'1/11','base'=>'Lateral'},{'id'=>'1/13/12','base'=>'Base'}]},
      'pieces'=>[{'id'=>'1/11','name'=>'Lateral','code'=>'P01'},{'id'=>'1/13/12','name'=>'Base','code'=>'P02'}]}]}
    @model.set_attribute(PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY,JSON.generate(guide));@session.scan;@session.generate(['1'])
    assert_equal({'1/11'=>'M02·P01','1/13/12'=>'M02·P02'},@workshop.plan['plan']['codes'])
    @model.set_attribute(PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY,'{rota')
    @session.define_singleton_method(:check_current!) { true }
    assert_equal({},@workshop.plan['plan']['codes'],'Guía dañada: sin códigos, nunca inventados')
  end
  def test_detail_code_reaches_the_txt_through_the_workshop_order
    catalog=approved_catalog;draft=ready_draft(catalog);draft['detailCode']='module_piece'
    assert_match(/Falta el código módulo·pieza/,assert_raises(PlanosSanto::ExportError){@workshop.check(draft)}.message)
    @workshop.stub(:codes,{'1/11'=>'M01·P01','1/13/12'=>'M01·P02'}) do
      result=@workshop.export_order(draft,@dir)
      details=File.read(File.join(result['directory'],'lote-01.txt'),encoding:'UTF-8').lines.map { |l| l.split("\t")[3] }
      assert_equal ['M01·P01 Lateral - Blanco','M01·P02 Base'],details.sort
      manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
      assert_equal [{'catalogId'=>catalog['items'][1]['id'],'sku'=>'ABS-22','role'=>'principal','metres'=>1.219,'sides'=>2,'pieces'=>2}],manifest['lots'][0]['edgeTotals']
    end
  end
  def test_propose_confirm_and_apply_return_a_new_unsaved_draft_with_view_data
    catalog=approved_catalog;plan=@workshop.plan['plan'];fake={'complete'=>true,'pieces'=>[],'materials'=>[]}
    PlanosSanto::OclReader.stub(:capture,fake) do
      result=@workshop.propose(plan)
      assert_equal plan['geometry'].keys.sort,result['plan']['geometry'].keys.sort;assert_equal({},result['plan']['codes'])
      assert_equal 2,result['proposal']['summary']['proposed'];assert_equal 0,result['proposal']['summary']['bulkReady']
      row=result['plan']['rows'][0];assert_equal [0,1],row['axes'];assert_equal 'finished_accepted',row['dimensionRule'];refute row['orientationConfirmed']
      assert result['proposal']['rows'][0]['reasons'].any? { |r| r.include?('Sin placa vinculada') },'Sin recorrido no se adivina la placa'
      assert_nil @model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY),'Proponer no guarda el borrador'
      assert_empty @model.operations
      bulk=@workshop.confirm_bulk(result['plan']);assert_empty bulk['confirmed'];assert_equal 2,bulk['review'].length
      result['plan']['rows'][0]['materialId']=catalog['items'][0]['id']
      applied=@workshop.apply_rows(result['plan'],'1/11',['1/13/12'],{'material'=>true,'inventado'=>true,'grain'=>'sí'})
      assert_equal 1,applied['applied'];assert_equal catalog['items'][0]['id'],applied['plan']['rows'][1]['materialId']
      assert_match(/destino/,assert_raises(PlanosSanto::ExportError){@workshop.apply_rows(plan,'1/11','1/13/12',{})}.message)
      assert_match(/Selección/,assert_raises(PlanosSanto::ExportError){@workshop.propose(plan,'1/11')}.message)
      assert_match(/desactualizado/,assert_raises(PlanosSanto::ExportError){@workshop.confirm_bulk(plan.merge('fingerprint'=>'otro'))}.message)
    end
  end

  # --- Auditoría, control y lecturas de cantos ----------------------------------
  def test_audit_lists_blocked_and_excluded_rows_and_check_returns_estimate
    catalog=approved_catalog;draft=ready_draft(catalog)
    draft['rows'][1].merge!('include'=>false,'excludeReason'=>'Se reutiliza la base vieja')
    audit=@workshop.audit(draft)
    assert_equal [],audit['blocked'];refute audit['production_ready']
    assert_equal [{'id'=>'1/13/12','detail'=>'Base','excludeReason'=>'Se reutiliza la base vieja'}],audit['excluded']
    check=@workshop.check(draft);assert check['valid'];assert_equal 1,check['estimate']['lines'].length
    draft['rows'][0]['orientationConfirmed']=false
    assert_equal ['1/11'],@workshop.audit(draft)['blocked'].map { |e| e['id'] }
    assert_raises(PlanosSanto::ExportError){@workshop.check(draft)}
  end
  def test_observed_edges_use_one_lazy_capture_through_the_workshop_order
    catalog=approved_catalog;draft=ready_draft(catalog);draft['rows'].each { |row| row['edgeResolution']='observed' }
    captures=0;fake={'complete'=>true,'pieces'=>[],'materials'=>[]}
    capture=->(_model) { captures+=1;fake }
    PlanosSanto::OclReader.stub(:capture,capture) do
      PlanosSanto::OclReader.stub(:verify_edge_mapping,->(report,row,_g,_c) { {'mode'=>'observed','piece'=>row['id'],'same'=>report.equal?(fake)} }) do
        result=@workshop.export_order(draft,@dir)
        manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
        assert_equal({'mode'=>'observed','piece'=>'1/11','same'=>true},manifest['lots'][0]['edgeEvidence']['1/11'])
      end
    end
    assert_operator captures,:<=,2,'Cada servicio de pedido captura el modelo una sola vez'
  end
  def test_edge_observations_require_known_piece_and_project_current_geometry
    approved_catalog
    assert_match(/Pieza desconocida/,assert_raises(PlanosSanto::ExportError){@workshop.edge_observations({'id'=>'1/99'})}.message)
    fake={'complete'=>true,'pieces'=>[],'materials'=>[]}
    PlanosSanto::OclReader.stub(:capture,fake) do
      result=@workshop.edge_observations({'id'=>'1/11','axes'=>[0,1],'frontSign'=>1,'flipX'=>false,'flipY'=>false})
      assert_equal 4,result['sides'].length;assert result['sides'].all? { |s| s['status']=='unresolved' },'Sin caras observadas no se inventan cantos'
    end
  end
  def test_ocl_gateway_refuses_plugin_without_dialog_entry_point
    namespace=Module.new;namespace.const_set(:EXTENSION_VERSION,'7.1.0');namespace.const_set(:EXTENSION_BUILD,'202511301621');namespace.const_set(:PLUGIN,Object.new)
    outer=Module.new;outer.const_set(:OpenCutList,namespace)
    previous=Object.const_defined?(:Ladb,false) ? Object.send(:remove_const,:Ladb) : nil
    Object.const_set(:Ladb,outer)
    assert_match(/no está disponible/,assert_raises(PlanosSanto::ExportError){PlanosSanto::OclGateway.open('materials')}.message)
  ensure
    Object.send(:remove_const,:Ladb) if Object.const_defined?(:Ladb,false)
    Object.const_set(:Ladb,previous) if previous
  end
end
