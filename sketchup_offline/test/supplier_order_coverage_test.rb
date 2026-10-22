# frozen_string_literal: true
# Cobertura de ramas de SupplierOrder con dobles (fake_api + names_double). No abre SketchUp.
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'
require_relative '../workshop'

class SupplierOrderCoverageTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(['1'])
  end
  def teardown;FileUtils.remove_entry(@dir);end

  def catalog(grain:false,edge_width:22,board_price:nil,edge_price:nil,second:false)
    sheet=@store.new_item('Melamina Blanca 18','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>grain,'approved'=>true,'price'=>board_price)
    edge=@store.new_item('Canto ABS 22','edge');edge.merge!('sku'=>'ABS-22','supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>edge_width,'approved'=>true,'price'=>edge_price)
    items=[sheet,edge]
    if second
      other=@store.new_item('Canto PVC 2mm','edge');other.merge!('sku'=>'PVC-2','supplier'=>'Maderera de prueba','thicknessMm'=>2,'widthMm'=>22,'approved'=>true)
      items << other
    end
    sheet['compatibleIds']=items.drop(1).map { |i| i['id'] }
    @store.save(items,@store.read['revision'])
  end
  def service(cat=catalog,**opts);PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,cat,**opts);end
  def draft(svc,cat)
    d=svc.proposal
    d['rows'].each do |row|
      row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>cat['items'][0]['id'],'principalId'=>cat['items'][1]['id'],'edgeMap'=>[1,0,0,0],
        'grainPolicy'=>'locked','grainAxis'=>cat['items'][0]['grain'] ? 'u' : 'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted',
        'orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,'edgeResolution'=>'manual',
        'edgeOverrideReason'=>'Inspección manual en el taller','reviewNote'=>'Medidas terminadas revisadas en taller')
    end
    d.delete('geometry');d
  end
  def setup_order(**kw);cat=catalog(**kw);svc=service(cat);[svc,draft(svc,cat),cat];end
  def reasons(svc,d,id='1/11');(svc.validate(d,collect_errors:true).find { |e| e['id']==id }||{})['reasons']||[];end
  def refuse(svc,d,pattern);error=assert_raises(PlanosSanto::ExportError){svc.validate(d)};assert_match(pattern,error.message);error;end

  # --- Medidas es-AR -------------------------------------------------------
  def test_mm_uses_es_ar_thousands_dot_and_decimal_comma_without_trailing_zeros
    svc,_d=setup_order
    {1234.5=>'1.234,5',609.6=>'609,6',19.05=>'19,05',3000=>'3.000',1_234_567.891=>'1.234.567,89',0.004=>'0',999.999=>'1.000',-1234.5=>'-1.234,5'}.each do |number,expected|
      assert_equal expected,svc.mm(number),number.inspect
    end
  end
  def test_txt_decimal_comma_three_decimals_and_rejects_sizes_that_round_to_zero
    svc,d,_c=setup_order;d['profile']['decimal']=','
    d['rows'][0].merge!('dimensionRule'=>'explicit_cut','cutBase'=>1234.5678,'cutHeight'=>400.1)
    d['rows'][1].merge!('include'=>false,'excludeReason'=>'Se corta en otra placa')
    result=svc.export(d,@dir);cells=File.read(File.join(result['directory'],'lote-01.txt')).chomp.split("\t")
    assert_equal ['1','1234,568','400,1'],cells[0,3],'El TXT no lleva separador de miles; solo coma decimal'
    d['rows'][0]['cutBase']=0.0004
    assert_raises(PlanosSanto::ExportError){svc.export(d,@dir)}
    assert_equal 1,Dir[File.join(@dir,'PlanosSanto-pedido-*')].length,'Un lote rechazado no deja carpeta ni temporales'
    assert_empty Dir[File.join(@dir,'.PlanosSanto-pedido-*')]
  end

  # --- TXT de 9 columnas TAB + CRLF ------------------------------------------
  def test_txt_has_header_nine_tab_columns_crlf_and_one_lot_per_board_and_edge_pair
    svc,d,cat=setup_order(second:true);d['profile']['header']=true
    d['rows'][1].merge!('secondaryId'=>cat['items'][2]['id'],'edgeMap'=>[1,2,0,2],'detail'=>'M01 Estante móvil')
    result=svc.export(d,@dir)
    assert_equal 2,result['lots'];assert_equal 2,result['physicalQuantity'];refute result['production_ready']
    %w[lote-01.txt lote-02.txt].each do |name|
      raw=File.binread(File.join(result['directory'],name))
      lines=raw.split("\r\n",-1);assert_equal '',lines.pop,'Termina en CRLF';refute raw.delete("\r\n").include?("\n"),'Sin LF sueltos'
      assert_equal PlanosSanto::SupplierOrder::COLUMNS.join("\t"),lines[0]
      lines.each { |line| assert_equal 9,line.split("\t",-1).length,line }
    end
    second=File.read(File.join(result['directory'],'lote-02.txt')).lines[1].chomp.split("\t")
    assert_equal ['M01 Estante móvil','0','1','2','0','2'],second[3,6]
    manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
    assert_equal 'PVC-2',manifest['lots'][1]['secondary']['sku'];assert_nil manifest['lots'][0]['secondary']
    assert_equal({'mode'=>'manual','reason'=>'Inspección manual en el taller'},manifest['lots'][0]['edgeEvidence']['1/11'])
  end
  def test_windows1252_rejects_characters_it_cannot_represent_and_cleans_staging
    svc,d,_c=setup_order;d['profile']['encoding']='windows1252';d['rows'][0]['detail']='Lateral → izquierdo'
    error=assert_raises(PlanosSanto::ExportError){svc.export(d,@dir)}
    assert_match(/codificación/,error.message)
    assert_empty Dir[File.join(@dir,'{.,}PlanosSanto-pedido-*')]
    d['rows'][0]['detail']='Cajón ñandú';result=svc.export(d,@dir)
    assert_includes File.binread(File.join(result['directory'],'lote-01.txt')).force_encoding('Windows-1252').encode('UTF-8'),'Cajón ñandú'
  end
  def test_export_never_replaces_an_existing_target_directory
    svc,d,_c=setup_order;fixed=Time.utc(2026,10,22,3,4,5)
    Time.stub(:now,fixed) do
      SecureRandom.stub(:hex,'cafe0001') do
        Dir.mkdir(File.join(@dir,"PlanosSanto-pedido-#{fixed.strftime('%Y%m%d-%H%M%S')}-cafe0001"))
        assert_match(/no se reemplazó/,assert_raises(PlanosSanto::ExportError){svc.export(d,@dir)}.message)
      end
    end
    assert_empty Dir[File.join(@dir,'.PlanosSanto-pedido-*')],'El staging se elimina aunque falle la publicación'
  end

  # --- Cantos asimétricos y veta ---------------------------------------------
  def test_rotation_requires_unveined_board_and_symmetric_edges
    svc,d,_c=setup_order;row=d['rows'][0];row['grainPolicy']='rotate'
    refuse(svc,d,/Cantos asimétricos/)
    row['edgeMap']=[1,1,1,1];assert svc.validate(d)
    result=svc.export(d,@dir);line=File.read(File.join(result['directory'],'lote-01.txt')).lines.find { |l| l.split("\t")[4]=='1' }
    assert line,'rota=1 solo para la pieza con cantos simétricos'
    row['edgeMap']=[0,0,0,0];row['principalId']=nil;assert svc.validate(d),'Sin cantos también es simétrico'
  end
  def test_rotation_lets_a_piece_fit_only_across_the_board
    svc,d,_c=setup_order;row=d['rows'][0];row.merge!('dimensionRule'=>'explicit_cut','cutBase'=>1500,'cutHeight'=>2800,'edgeMap'=>[0,0,0,0],'principalId'=>nil)
    assert_includes reasons(svc,d).join,'mide 1.500 × 2.800 mm y la placa aprobada es 3.000 × 2.000 mm'
    row['grainPolicy']='rotate';assert_empty reasons(svc,d)
  end
  def test_grained_board_demands_u_axis_and_locked_policy
    svc,d,_c=setup_order(grain:true);row=d['rows'][0];assert svc.validate(d)
    row['grainAxis']='none';refute_empty reasons(svc,d).grep(/dirección de veta/)
    row['grainAxis']='u';row['grainConfirmed']=false;refute_empty reasons(svc,d).grep(/dirección de veta/)
    row['grainConfirmed']=true;row['grainPolicy']='rotate';refuse(svc,d,/girar una placa con veta/)
    row['grainPolicy']=nil;refuse(svc,d,/admite rotación/)
  end
  def test_edge_role_problems_width_unknown_compatibility_and_duplicates
    cat=catalog(second:true);cat['items'][1]['widthMm']=nil;svc=service(cat);d=draft(svc,cat)
    assert_includes reasons(svc,d),'El canto principal (1) no cubre el espesor de la placa: ancho sin cargar y espesor 19,05 mm.'
    cat=catalog(second:true);cat['items'][0]['compatibleIds']=[cat['items'][1]['id']];svc=service(cat);d=draft(svc,cat)
    d['rows'][0].merge!('secondaryId'=>cat['items'][2]['id'],'edgeMap'=>[1,2,0,0])
    # Sin canto fijo por placa: un canto aprobado que cubre el espesor vale aunque no figure en compatibleIds.
    assert_empty reasons(svc,d).grep(/compatibilidad/)
    d['rows'][0]['secondaryId']=d['rows'][0]['principalId'];refute_empty reasons(svc,d).grep(/deben ser distintos/)
    d['rows'][0].merge!('secondaryId'=>nil,'edgeMap'=>[1,3,0,0]);refute_empty reasons(svc,d).grep(/Mapa de cantos inválido/)
    d['rows'][0]['edgeMap']=[1,0,0];refute_empty reasons(svc,d).grep(/Mapa de cantos inválido/)
  end

  # --- Validaciones estructurales y modo auditoría ---------------------------
  def test_draft_schema_profile_fields_and_inclusion_are_strict
    svc,d,_c=setup_order
    [->(x){x['schema']=2},->(x){x['fingerprint']='otro'},->(x){x['rows']=x['rows']+[x['rows'][0]]},->(x){x['profile']['encoding']='latin1'},
     ->(x){x['rows'][0]['extra']=1},->(x){x['rows'][0]['include']='si'},->(x){x['rows'][0]['detail']="Lateral\tizq"}].each do |change|
      copy=Marshal.load(Marshal.dump(d));change.call(copy);assert_raises(PlanosSanto::ExportError){svc.validate(copy)}
    end
    d['rows'].each { |r| r.merge!('include'=>false,'excludeReason'=>'Herrajes, no se cortan') }
    refuse(svc,d,/No hay piezas incluidas/)
    d['rows'][0]['excludeReason']='  ñ ';refuse(svc,d,/por qué se excluye/)
  end
  def test_piece_errors_name_detail_or_fallback_when_detail_is_blank
    svc,d,_c=setup_order;d['rows'][0].merge!('detail'=>'  ','orientationConfirmed'=>false)
    assert_equal 'Pieza sin detalle (1/11): Falta confirmar orientación.',refuse(svc,d,/\APieza sin detalle/).message
  end
  def test_collect_mode_stops_at_non_rectangular_and_at_broken_structure
    cat=catalog;document=Marshal.load(Marshal.dump(@session.document))
    PlanosSanto::Exporter.each_node(document['furniture']) { |n| n['metadata']['rectangular']=false if n['id']=='1/11' }
    svc=PlanosSanto::SupplierOrder.new(document,@session.fingerprint,cat);d=draft(svc,cat)
    assert_equal ['Geometría no rectangular: verificala o excluila explícitamente.'],reasons(svc,d)
    svc=service(cat);d=draft(svc,cat);d['rows'][0]['axes']=[0,0]
    assert_equal 1,reasons(svc,d).length
    d['rows'][0]['axes']=[0,1];d['rows'][0]['flipX']='no';assert_equal ['Confirmaciones de pedido inválidas.'],reasons(svc,d)
  end
  def test_edge_resolution_bindings_and_dimension_rules_are_validated
    svc,d,_c=setup_order;row=d['rows'][0]
    row['edgeResolution']='adivinado';refute_empty reasons(svc,d).grep(/cómo verificaste/)
    row['edgeResolution']='manual';row['edgeBindings']=[{'observedId'=>'1','catalogId'=>'x'},{'observedId'=>'1','catalogId'=>'y'}]
    refute_empty reasons(svc,d).grep(/Vínculos de cantos inválidos/)
    row['edgeBindings']=[];row['dimensionRule']='a_ojo';refute_empty reasons(svc,d).grep(/medidas terminadas aceptadas/)
    row['dimensionRule']='explicit_cut';row['cutBase']=Float::INFINITY;row['cutHeight']=400
    refute_empty reasons(svc,d).grep(/Medidas de corte inválidas/)
    row['cutBase']=-1;refute_empty reasons(svc,d).grep(/Medidas de corte inválidas/)
    row['cutBase']=500;row['detail']='L'*81;refute_empty reasons(svc,d).grep(/justificación/)
  end
  def test_board_without_thickness_or_format_and_unknown_material_kind
    cat=catalog;cat['items'][0]['thicknessMm']='18';svc=service(cat);d=draft(svc,cat)
    refute_empty reasons(svc,d).grep(/no tiene espesor cargado/)
    cat=catalog;cat['items'][0]['lengthMm']=nil;svc=service(cat);d=draft(svc,cat)
    assert_equal ['La placa aprobada no tiene largo y ancho cargados en la biblioteca.'],reasons(svc,d)
    assert_equal 'Elegí un canto aprobado de la biblioteca.',assert_raises(PlanosSanto::ExportError){svc.material('nada','edge')}.message
    assert_raises(PlanosSanto::ExportError){svc.material(cat['items'][1]['id'],'sheet')}
  end
  def test_missing_sheet_message_agrees_in_gender
    # BUG-RB-01 (docs/qa/BUGS_ENCONTRADOS_RUBY.md): corregido; regresión de la concordancia.
    svc,_d,cat=setup_order
    assert_equal 'Elegí una placa aprobada de la biblioteca.',assert_raises(PlanosSanto::ExportError){svc.material(cat['items'][1]['id'],'sheet')}.message
  end
  def test_observed_edges_and_source_review_run_only_for_coherent_rows
    cat=catalog;calls=[]
    svc=service(cat,edge_review:->(row,_g){calls << [:edge,row['id']];{'mode'=>'observed','faces'=>1}},source_review:->(row,_g){calls << [:source,row['id']]})
    d=draft(svc,cat);d['rows'][0]['edgeResolution']='observed';d['rows'][1]['orientationConfirmed']=false
    svc.validate(d,collect_errors:true)
    assert_equal [[:edge,'1/11'],[:source,'1/11']],calls,'La fila incoherente no relee el modelo'
    d['rows'][1]['orientationConfirmed']=true;result=svc.export(d,@dir)
    manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
    assert_equal({'mode'=>'observed','faces'=>1},manifest['lots'][0]['edgeEvidence']['1/11'])
    d['rows'][0]['edgeResolution']='manual'
    failing=service(cat,source_review:->(_r,_g){raise PlanosSanto::ExportError,'Fuente sintética rechazada.'})
    assert_includes reasons(failing,d),'Fuente sintética rechazada.'
  end

  def test_unknown_board_still_reports_edge_roles_without_board_comparisons
    svc,d,_c=setup_order;d['rows'][0]['materialId']='inexistente'
    r=reasons(svc,d)
    others=r.reject { |m| m.include?('canto') };assert_equal 1,others.length,'Sin placa no se comparan veta ni formato';assert_match(/\AElegí una placa/,others[0])
    d['rows'][0]['principalId']='tampoco';assert_includes reasons(svc,d),'Elegí un canto principal (1) aprobado de la biblioteca.'
  end

  # --- Estimación ------------------------------------------------------------
  def test_estimate_per_sheet_price_edge_lengths_by_side_and_pending_units
    today=Date.new(2026,10,22)
    cat=catalog(second:true,board_price:{'amount'=>60000,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista octubre'},
                edge_price:{'amount'=>500,'currency'=>'ARS','unit'=>'metro','date'=>'2026-10-01','source'=>'Lista octubre'})
    svc=service(cat);d=draft(svc,cat)
    d['rows'][0].merge!('dimensionRule'=>'explicit_cut','cutBase'=>1000,'cutHeight'=>600,'secondaryId'=>cat['items'][2]['id'],'edgeMap'=>[1,1,2,0])
    d['rows'][1].merge!('include'=>false,'excludeReason'=>'Reposición, no entra en este pedido')
    result=svc.estimate(d,today:today);line=result['lines'][0]
    assert_in_delta 0.6,line['netAreaM2'],1e-9
    assert_in_delta 0.1*60000,line['boardAmount'],1e-6,'0,6 m² de una placa de 6 m²'
    principal,secondary=line['charges'].drop(1)
    assert_equal ['principal_edge',2.0,1000.0],[principal['role'],principal['quantity'],principal['amount']],'Arr+Aba usan la base'
    assert_equal ['secondary_edge',0.6,nil,'price_pending'],secondary.values_at('role','quantity','amount','status'),'Izq usa la altura; canto sin precio queda pendiente'
    assert_equal 'review_prices',line['status'];assert_equal 1,result['pending']
    assert_in_delta 7000,result['totalsByCurrency']['ARS'],1e-6
    cat['items'][0]['price']['unit']='m2';cat['items'][1]['price']['unit']='rollo'
    line=service(cat).estimate(d,today:today)['lines'][0]
    assert_in_delta 36000,line['boardAmount'],1e-6;assert_equal 'price_pending',line['charges'][1]['status'],'Unidad distinta nunca se convierte'
  end
  def test_estimate_with_all_current_prices_is_a_net_material_estimate
    today=Date.new(2026,10,22)
    cat=catalog(board_price:{'amount'=>12000,'currency'=>'ARS','unit'=>'m2','date'=>'2026-10-20','source'=>'Lista vigente'},
                edge_price:{'amount'=>350,'currency'=>'ARS','unit'=>'metro','date'=>'2026-07-24','source'=>'Lista vigente'})
    svc=service(cat);result=svc.estimate(draft(svc,cat),today:today)
    assert result['lines'].all? { |line| line['status']=='net_material_estimate' },'90 días exactos sigue vigente'
    assert_equal 0,result['pending'];assert_equal 0,result['outdated'];assert_equal ['ARS'],result['totalsByCurrency'].keys
  end
end
