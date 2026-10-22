# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'
require_relative '../maderera_profile'

# Hito 4: el perfil de maderera aprobado entra al pedido sin cambiar el
# formato del TXT de 9 columnas ni relajar sus bloqueos comerciales.
class MaderaOrderTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir);@profiles=PlanosSanto::MaderaProfileStore.new(directory:@dir)
    @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def catalog(sheet_patch={})
    sheet=@store.new_item('Placa de prueba','sheet');sheet.merge!('sku'=>'TEST-18','supplier'=>'Proveedor de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false,'approved'=>true,
      'price'=>{'amount'=>60000,'currency'=>'ARS','unit'=>'placa','date'=>Time.now.utc.strftime('%Y-%m-%d'),'source'=>'Lista QA'}).merge!(sheet_patch)
    edge=@store.new_item('Canto de prueba','edge');edge.merge!('sku'=>'EDGE-1','supplier'=>'Proveedor de prueba','thicknessMm'=>0.8,'widthMm'=>22,'approved'=>true,
      'price'=>{'amount'=>300,'currency'=>'ARS','unit'=>'metro','date'=>Time.now.utc.strftime('%Y-%m-%d'),'source'=>'Lista QA'})
    sheet["compatibleIds"]=[edge["id"]];@store.save([sheet,edge],@store.read["revision"])
  end
  def profile(patch={})
    data=@profiles.save(PlanosSanto::MaderaProfile.template.merge('name'=>'Maderera QA','supplier'=>'Maderera QA SRL').merge(patch),@profiles.read['revision'])
    created=data['profiles'].last
    @profiles.approve(created['id'],created['version'],@profiles.read['revision'])
    @profiles.activate(created['id'],@profiles.read['revision']);@profiles.active
  end
  def order(maderera=nil,sheet_patch={})
    data=catalog(sheet_patch);service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,data,maderera:maderera);draft=service.proposal
    draft['rows'].each do |row|
      row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>data['items'][0]['id'],'principalId'=>data['items'][1]['id'],'edgeMap'=>[1,0,0,0],'detail'=>'M01 Lateral',
       'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted','orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,'edgeResolution'=>'manual','edgeOverrideReason'=>'Inspección manual sintética para prueba','reviewNote'=>'Caso sintético, terminadas verificadas para prueba')
    end
    [service,draft]
  end
  def export(service,draft)
    result=service.export(draft,@dir)
    [File.binread(File.join(result['directory'],'lote-01.txt')),JSON.parse(File.read(File.join(result['directory'],'manifest.json')))]
  end

  def test_without_profile_the_txt_and_estimate_are_unchanged
    service,draft=order
    assert_equal({'encoding'=>'utf8','decimal'=>'.','header'=>false},draft['profile'])
    content,manifest=export(service,draft)
    assert_equal "2\t609.6\t406.4\tM01 Lateral\t0\t1\t0\t0\t0\r\n",content
    assert_nil manifest['madereraProfile']
    estimate=service.estimate(draft);assert_nil estimate['budget'];assert_empty estimate['warnings'];refute estimate['includesWaste']
  end

  def test_approved_profile_prefills_file_format_and_is_registered_in_manifest
    maderera=profile('encoding'=>'windows1252','decimal'=>',','header'=>true)
    service,draft=order(maderera)
    assert_equal({'encoding'=>'windows1252','decimal'=>',','header'=>true},draft['profile'])
    content,manifest=export(service,draft)
    lines=content.split("\r\n");assert_equal PlanosSanto::SupplierOrder::COLUMNS.join("\t"),lines[0]
    assert_equal "2\t609,6\t406,4\tM01 Lateral\t0\t1\t0\t0\t0",lines[1];assert_equal 9,lines[1].split("\t").length
    assert_equal PlanosSanto::MaderaProfile.reference(maderera),manifest['madereraProfile']
    assert_equal maderera['contentHash'],manifest['madereraProfile']['contentHash']
  end

  def test_unapproved_profile_never_applies
    data=@profiles.save(PlanosSanto::MaderaProfile.template.merge('name'=>'Borrador','supplier'=>'QA','dimensionRule'=>'deduct_edge','notes'=>'Pendiente de confirmar'),0)
    service,draft=order(data['profiles'].first)
    content,manifest=export(service,draft)
    assert_equal "2\t609.6\t406.4\tM01 Lateral\t0\t1\t0\t0\t0\r\n",content;assert_nil manifest['madereraProfile']
  end

  def test_edge_deduction_rule_uses_edge_thickness_in_txt_only_when_enabled
    maderera=profile('dimensionRule'=>'deduct_edge','notes'=>'La maderera confirmó por escrito que recibe medida de corte')
    service,draft=order(maderera)
    content,manifest=export(service,draft)
    assert_equal "2\t609.6\t405.6\tM01 Lateral\t0\t1\t0\t0\t0\r\n",content,'Canto arriba de 0,8 mm descuenta la altura.'
    assert_equal 'deduct_edge',manifest['madereraProfile']['dimensionRule']
    draft['rows'].each { |row| row.merge!('dimensionRule'=>'explicit_cut','cutBase'=>600,'cutHeight'=>400) }
    content,=export(service,draft)
    assert_equal "2\t600\t400\tM01 Lateral\t0\t1\t0\t0\t0\r\n",content,'Las medidas de corte explícitas nunca se descuentan.'
  end

  def test_usable_size_warns_without_blocking_and_raw_board_still_blocks
    maderera=profile('trimMm'=>10)
    service,draft=order(maderera,'lengthMm'=>615,'widthMm'=>2000)
    estimate=service.estimate(draft)
    assert_equal 2,estimate['warnings'].length;assert_match(/medida útil/,estimate['warnings'][0]['message'])
    assert_equal %w[detail id message],estimate['warnings'][0].keys.sort
    service.export(draft,@dir) # aviso, no bloqueo
    service,draft=order(maderera,'lengthMm'=>600,'widthMm'=>2000)
    assert_raises(PlanosSanto::ExportError) { service.validate(draft) }
  end

  def test_estimate_carries_three_column_budget_and_services
    maderera=profile('wastePercent'=>10,'cutPrice'=>{'amount'=>2500,'currency'=>'ARS','unit'=>'placa','date'=>Time.now.utc.strftime('%Y-%m-%d'),'source'=>'Lista QA'},
      'edgingPrice'=>{'amount'=>400,'currency'=>'ARS','unit'=>'metro','date'=>Time.now.utc.strftime('%Y-%m-%d'),'source'=>'Lista QA'})
    service,draft=order(maderera)
    budget=service.estimate(draft)['budget']
    board=budget['materials'].find { |row| row['role']=='board' };edge=budget['materials'].find { |row| row['role']=='edge' }
    net=2*609.6*406.4/1_000_000.0
    assert_in_delta net,board['netQuantity'],1e-9;assert_equal 1,board['purchaseQuantity'];assert_in_delta 60000,board['purchaseAmount']
    assert board['wasteQuantity']>net*1.1,'Con desperdicio incluye el kerf.'
    assert_in_delta 2*0.6096,edge['netQuantity'],1e-9;assert_equal 2,edge['purchaseQuantity']
    assert_equal %w[cut edging],budget['services'].map { |row| row['kind'] }
    assert_in_delta 2500,budget['services'][0]['amount'];assert_in_delta 400*1.2192,budget['services'][1]['amount'],1e-6
    assert_equal maderera['id'],budget['profile']['id']
  end

  def test_workshop_uses_only_the_active_approved_profile
    catalog;workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
    assert_equal({'encoding'=>'utf8','decimal'=>'.','header'=>false},workshop.plan['plan']['profile'])
    profile('decimal'=>',')
    assert_equal ',',PlanosSanto::Workshop.new(@model,@session,directory:@dir).plan['plan']['profile']['decimal']
  end

  def test_review_findings_invalid_edge_map_negative_cut_profile_binding_and_damaged_file
    maderera=profile('dimensionRule'=>'deduct_edge','notes'=>'La maderera confirmó por escrito que recibe medida de corte')
    service,draft=order(maderera)
    broken=Marshal.load(Marshal.dump(draft));broken['rows'][0]['edgeMap']=[1,2]
    reasons=service.validate(broken,collect_errors:true).first['reasons']
    assert reasons.any? { |reason| reason.include?('Mapa de cantos inválido') },'Auditoría completa sin TypeError.'
    tiny=Marshal.load(Marshal.dump(draft))
    edge=@store.read['items'][1];thick=@store.save(@store.read['items'].map { |item| item['id']==edge['id'] ? item.merge('thicknessMm'=>500,'widthMm'=>600) : item },@store.read['revision'])
    service=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,thick,maderera:maderera)
    tiny['catalogRevision']=thick['revision'];tiny['rows'].each { |row| row['edgeMap']=[1,1,0,0] }
    assert_match(/cero o negativas/,assert_raises(PlanosSanto::ExportError) { service.validate(tiny) }.message)
    other=PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,@store.read,maderera:nil)
    draft['catalogRevision']=@store.read['revision']
    assert_match(/perfil de maderera/,assert_raises(PlanosSanto::ExportError) { other.validate(draft) }.message)
    File.write(File.join(@dir,'maderera-profiles.json'),'{dañado')
    workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
    assert_nil workshop.plan['plan']['maderera'],'Un archivo de perfiles dañado no frena el pedido.'
    assert_raises(PlanosSanto::ExportError) { workshop.maderera_profiles }
  end

  def test_saved_draft_remembers_its_profile_and_follows_a_profile_change_without_losing_edits
    catalog;profile('decimal'=>',')
    workshop=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
    draft=workshop.plan['plan'];refute_nil draft['maderera'];draft['rows'][0]['detail']='Lateral editado'
    workshop.save_plan(draft)
    stored=JSON.parse(@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY))
    assert_equal draft['maderera'],stored['maderera'],'El borrador guardado recuerda la versión del perfil.'
    active=@profiles.active;@profiles.save(active.merge('kerfMm'=>4),@profiles.read['revision'])
    changed=PlanosSanto::Workshop.new(@model,@session,directory:@dir)
    saved=changed.save_plan(draft)
    assert saved['changed'];assert saved['merge']['stale'];assert_nil saved['plan']['maderera'],'Con el perfil desaprobado el pedido vuelve a la estimación neta.'
    assert_equal 'Lateral editado',saved['plan']['rows'][0]['detail'],'Cambiar el perfil no descarta el borrador'
    assert_nil changed.plan['plan']['maderera']
  end
end
