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
    # Fichas completas: `approved` queda en false y el pedido no lo mira (0.8.16).
    sheet=@store.new_item('Melamina Blanca 18','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>19.05,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>grain,'price'=>board_price)
    edge=@store.new_item('Canto ABS 22','edge');edge.merge!('sku'=>'ABS-22','supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>edge_width,'price'=>edge_price)
    items=[sheet,edge]
    if second
      other=@store.new_item('Canto PVC 2mm','edge');other.merge!('sku'=>'PVC-2','supplier'=>'Maderera de prueba','thicknessMm'=>2,'widthMm'=>22)
      items << other
    end
    @store.save(items,@store.read['revision'])
  end
  def service(cat=catalog,**opts);PlanosSanto::SupplierOrder.new(@session.document,@session.fingerprint,cat,**opts);end
  def draft(svc,cat)
    d=svc.proposal
    d['rows'].each do |row|
      row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>cat['items'][0]['id'],'principalId'=>cat['items'][1]['id'],'edgeMap'=>[1,0,0,0],'grainPolicy'=>'locked','dimensionRule'=>'finished_accepted')
    end
    d.delete('geometry');d
  end
  def setup_order(**kw);cat=catalog(**kw);svc=service(cat);[svc,draft(svc,cat),cat];end
  def reasons(svc,d,id='1/11');(svc.validate(d,collect_errors:true).find { |e| e['id']==id }||{})['reasons']||[];end
  def refuse(svc,d,pattern);error=assert_raises(PlanosSanto::ExportError){svc.validate(d)};assert_match(pattern,error.message);error;end

  # --- Biblioteca v4 (0.8.20): espesor por pieza y anchos estándar del canto --------------------
  def test_thickness_never_blocks_and_each_lot_is_one_board_in_one_thickness
    cat=catalog;document=Marshal.load(Marshal.dump(@session.document))
    PlanosSanto::Exporter.each_node(document['furniture']) { |n| n['metadata']['localBounds']['max'][2]=n['metadata']['localBounds']['min'][2]+16 if n['id']=='1/13/12' }
    svc=PlanosSanto::SupplierOrder.new(document,@session.fingerprint,cat);d=draft(svc,cat)
    assert_equal [19.05,16.0],d['rows'].map { |row| svc.row_thickness(row) }
    refute PlanosSanto::CatalogStore.in_list?(cat['items'][0]['thicknessesMm'],16.0),'16 mm no está en la lista de la placa'
    assert_empty svc.validate(d,collect_errors:true),'Ningún espesor bloquea: la placa vale para todos y uno fuera de la lista solo se marca'
    manifest=JSON.parse(File.read(File.join(svc.export(d,@dir)['directory'],'manifest.json')))
    assert_equal [16.0,19.1],manifest['lots'].map { |lot| lot['thicknessMm'] }.sort,'Un lote por placa y espesor real'
    assert_equal [16.0,19.05],svc.estimate(d)['lines'].map { |line| line['thicknessMm'] }.sort,'Cada línea del presupuesto lleva el espesor de la pieza'
  end
  def test_edge_blocks_only_when_every_standard_width_is_narrower_than_the_piece
    cat=catalog;cat['items'][1]['widthsMm']=[10,45];svc=service(cat);d=draft(svc,cat)
    assert_empty reasons(svc,d),'45 mm cubre la pieza de 19,05 mm: el canto se refila'
    cat['items'][1]['widthsMm']=[10,12];svc=service(cat);d=draft(svc,cat)
    assert_equal ['El canto principal (1) es más angosto que el espesor de la pieza con todos sus anchos (10, 12 mm) y la pieza mide 19,05 mm.'],reasons(svc,d)
    cat=catalog;svc=service(cat);d=draft(svc,cat)
    assert_equal [22,45],cat['items'][1]['widthsMm'];assert_empty reasons(svc,d),'Canto nuevo con 22 y 45: sin avisos'
  end

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
    assert_equal({'1/11'=>'manual'},manifest['lots'][0]['edgeSource'],'Sin propuesta del modelo los cantos cuentan como cargados a mano')
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
    assert_includes reasons(svc,d).join,'La pieza no entra en la placa: mide 1.500 × 2.800 mm y la placa es 3.000 × 2.000 mm'
    row['grainPolicy']='rotate';assert_empty reasons(svc,d)
  end
  def test_edge_role_problems_width_unknown_compatibility_and_duplicates
    # Biblioteca v4: el canto incompleto es el que no tiene ningún ancho estándar.
    cat=catalog(second:true);cat['items'][1].merge!('widthMm'=>nil,'widthsMm'=>[]);svc=service(cat);d=draft(svc,cat)
    assert_includes reasons(svc,d),'La ficha del canto «Canto ABS 22» está incompleta: falta ancho. Completala en la biblioteca.'
    cat=catalog(second:true);svc=service(cat);d=draft(svc,cat)
    d['rows'][0].merge!('secondaryId'=>cat['items'][2]['id'],'edgeMap'=>[1,2,0,0])
    # Sin canto fijo por placa: cualquier canto que cubre el espesor vale.
    assert_empty reasons(svc,d)
    d['rows'][0]['secondaryId']=d['rows'][0]['principalId'];refute_empty reasons(svc,d).grep(/deben ser distintos/)
    d['rows'][0].merge!('secondaryId'=>nil,'edgeMap'=>[1,3,0,0]);refute_empty reasons(svc,d).grep(/Mapa de cantos inválido/)
    d['rows'][0]['edgeMap']=[1,0,0];refute_empty reasons(svc,d).grep(/Mapa de cantos inválido/)
    d['rows'][0].merge!('edgeMap'=>[0,0,0,0],'secondaryId'=>'no-existe');assert_empty reasons(svc,d),'Un rol que ningún lado usa no llega al TXT'
  end
  def test_draft_schema_profile_fields_and_inclusion_are_strict
    svc,d,_c=setup_order
    [->(x){x['schema']=2},->(x){x['fingerprint']='otro'},->(x){x['rows']=x['rows']+[x['rows'][0]]},->(x){x['profile']['encoding']='latin1'},
     ->(x){x['rows'][0]['extra']=1},->(x){x['rows'][0]['include']='si'},->(x){x['rows'][0]['detail']="Lateral\tizq"}].each do |change|
      copy=Marshal.load(Marshal.dump(d));change.call(copy);assert_raises(PlanosSanto::ExportError){svc.validate(copy)}
    end
    d['rows'][0].merge!('include'=>false,'excludeReason'=>'');assert svc.validate(d),'El motivo de exclusión es opcional'
    d['rows'].each { |r| r.merge!('include'=>false,'excludeReason'=>'Herrajes, no se cortan') }
    refuse(svc,d,/No hay piezas incluidas/)
  end
  def test_piece_errors_name_detail_or_fallback_when_detail_is_blank
    svc,d,_c=setup_order;d['rows'][0].merge!('detail'=>'  ','materialId'=>'')
    assert_equal 'Pieza sin detalle (1/11): Elegí una placa de la biblioteca.',refuse(svc,d,/\APieza sin detalle/).message
  end
  def test_collect_mode_stops_at_non_rectangular_and_at_broken_structure
    cat=catalog;document=Marshal.load(Marshal.dump(@session.document))
    PlanosSanto::Exporter.each_node(document['furniture']) { |n| n['metadata']['rectangular']=false if n['id']=='1/11' }
    svc=PlanosSanto::SupplierOrder.new(document,@session.fingerprint,cat);d=draft(svc,cat)
    assert_equal ['Pieza no rectangular: no se puede pedir como placa rectangular. Excluila o corregila en el modelo.'],reasons(svc,d)
    svc=service(cat);d=draft(svc,cat);d['rows'][0]['axes']=[0,0]
    assert_equal ['Faltan los ejes de base y altura de la pieza: elegilos en la vista 2D.'],reasons(svc,d)
    d['rows'][0]['axes']=[0,1];d['rows'][0]['flipX']='no';assert_equal ['Orientación de la pieza inválida.'],reasons(svc,d)
  end
  def test_board_without_thickness_or_format_and_unknown_material_kind
    # Biblioteca v4: a la placa le falta espesor cuando su lista de espesores está vacía.
    cat=catalog;cat['items'][0]['thicknessesMm']=[];svc=service(cat);d=draft(svc,cat)
    assert_includes reasons(svc,d),'La ficha de la placa «Melamina Blanca 18» está incompleta: falta espesor. Completala en la biblioteca.'
    cat=catalog;cat['items'][0]['lengthMm']=nil;svc=service(cat);d=draft(svc,cat)
    assert_equal ['La ficha de la placa «Melamina Blanca 18» está incompleta: falta largo. Completala en la biblioteca.'],reasons(svc,d)
    assert_equal 'Elegí un canto de la biblioteca.',assert_raises(PlanosSanto::ExportError){svc.material('nada','edge')}.message
    assert_raises(PlanosSanto::ExportError){svc.material(cat['items'][1]['id'],'sheet')}
  end
  def test_missing_sheet_message_agrees_in_gender
    # BUG-RB-01 (docs/qa/BUGS_ENCONTRADOS_RUBY.md): corregido; regresión de la concordancia.
    svc,_d,cat=setup_order
    assert_equal 'Elegí una placa de la biblioteca.',assert_raises(PlanosSanto::ExportError){svc.material(cat['items'][1]['id'],'sheet')}.message
  end
  def test_unknown_board_still_reports_edge_roles_without_board_comparisons
    svc,d,_c=setup_order;d['rows'][0]['materialId']='inexistente'
    r=reasons(svc,d)
    others=r.reject { |m| m.include?('canto') };assert_equal 1,others.length,'Sin placa no se comparan veta ni formato';assert_match(/\AElegí una placa/,others[0])
    d['rows'][0]['principalId']='tampoco';assert_includes reasons(svc,d),'Elegí un canto principal (1) de la biblioteca.'
  end
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
  def test_grain_follows_the_board_and_a_grained_board_never_rotates
    svc,d,_c=setup_order(grain:true);row=d['rows'][0];assert svc.validate(d)
    row['grainPolicy']='rotate';refuse(svc,d,/No se puede girar una placa con veta/)
    row['grainPolicy']=nil;assert svc.validate(d),'Sin elegir giro vale rota 0'
    row['grainPolicy']='a veces';refuse(svc,d,/Giro inválido/)
    row['grainPolicy']='locked';result=svc.export(d,@dir)
    assert_equal 'u',JSON.parse(File.read(File.join(result['directory'],'manifest.json')))['lots'][0]['grainAxis'],'La veta del lote la decide la placa'
  end
  def test_bindings_and_dimension_rules_are_validated
    svc,d,_c=setup_order;row=d['rows'][0]
    row['edgeBindings']=[{'observedId'=>'1','catalogId'=>'x'},{'observedId'=>'1','catalogId'=>'y'}]
    refute_empty reasons(svc,d).grep(/Vínculos de cantos inválidos/)
    row['edgeBindings']=[];row['dimensionRule']='a_ojo';refute_empty reasons(svc,d).grep(/Regla de medidas inválida/)
    row['dimensionRule']=nil;assert_empty reasons(svc,d),'Sin regla elegida valen las medidas terminadas'
    row['dimensionRule']='explicit_cut';row['cutBase']=Float::INFINITY;row['cutHeight']=400
    refute_empty reasons(svc,d).grep(/Medidas de corte inválidas/)
    row['cutBase']=-1;refute_empty reasons(svc,d).grep(/Medidas de corte inválidas/)
    row['cutBase']=500;row['detail']='L'*81;refute_empty reasons(svc,d).grep(/El detalle supera 80/)
  end
  def test_validation_and_export_never_reread_the_model
    cat=catalog;calls=[]
    svc=service(cat,material_proposal:->(id){calls << id;{}})
    d=draft(svc,cat);calls.clear
    svc.validate(d,collect_errors:true);svc.export(d,@dir)
    assert_empty calls,'Validar y exportar trabajan sobre el pedido; solo la propuesta lee el modelo'
    assert_raises(ArgumentError){service(cat,edge_review:->(_r,_g){})}
  end
end
