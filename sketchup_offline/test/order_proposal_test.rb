# frozen_string_literal: true
# Hito 3 «Del modelo al TXT sin fricción» con dobles sintéticos: diagnóstico P1 armado a mano,
# fake_api de SketchUp y biblioteca en un directorio temporal. No abre SketchUp ni OpenCutList.
require 'minitest/autorun'
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../order_proposal'

class OrderProposalTest < Minitest::Test
  R=PlanosSanto::OclReader
  TODAY=Date.new(2026,10,22)
  # Dirección de la cara → [eje, límite]. Las caras sin pintura propia van con la placa.
  FACES={'-x'=>[0,0],'+x'=>[0,1],'-y'=>[1,0],'+y'=>[1,1],'-z'=>[2,0],'+z'=>[2,1]}.freeze

  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    sheet=@store.new_item('Melamina Blanca 18','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true)
    @edges=%w[ABS-A PVC-B ABS-C].map do |sku|
      edge=@store.new_item("Canto #{sku}",'edge');edge.merge!('sku'=>sku,'supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true);edge
    end
    sheet['compatibleIds']=@edges.map { |e| e['id'] }
    @catalog=@store.save([sheet,*@edges],0);@sheet=@catalog['items'][0];@a,@b,@c=@catalog['items'].drop(1)
    @pieces=[];@workshop=PlanosSanto::Workshop.new(nil,nil,directory:@dir)
  end
  def teardown;FileUtils.remove_entry(@dir);end

  def native(id,item);{'id'=>id,'name'=>"Material #{id}",'color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>item['kind']=='sheet' ? 2 : 4},'planos_santo_observed'=>{'status'=>'valid','binding'=>PlanosSanto::MaterialResolver.binding_for(item)}};end
  def materials;[native('board',@sheet),native('edge-a',@a),{'id'=>'edge-b','name'=>'Canto sin vínculo','color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>4}},native('edge-c',@c)];end
  # Caja de dims[0]×dims[1]×dims[2] mm en ejes locales; paint: {'+y'=>'edge-a',...}.
  def piece(id,dims,given=nil,mirrored: false,rectangular: true,coverage: 1.0,**faces)
    paint=given||faces
    faces=FACES.map do |name,(axis,high)|
      others=[0,1,2]-[axis];plane=high==1 ? dims[axis] : 0
      corners=[[0,0],[1,0],[1,1],[0,1]].map { |a,b| point=[0,0,0];point[axis]=plane;point[others[0]]=a*dims[others[0]];point[others[1]]=b*dims[others[1]];point }
      area=dims[others[0]]*dims[others[1]]*(paint.key?(name) ? coverage : 1)
      {'id'=>"#{id}-#{name}",'normal_local'=>Array.new(3) { |i| i==axis ? (high==1 ? 1 : -1) : 0 },'vertices_mm'=>corners,'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],'area_mm2_local'=>area,'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint.fetch(name,'board'),'back_material_id'=>nil}
    end
    transform=mirrored ? Geom::Transformation.scale(-1,1,1).to_a : Geom::Transformation.new.to_a
    @pieces << {'id'=>id,'dims'=>dims,'faces'=>faces,'transform'=>transform,'rectangular'=>rectangular,'mirrored'=>mirrored}
  end
  def report
    diagnostic={'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOBLE','exported_at'=>'2026-10-22T00:00:00Z','model_guid'=>'sintetico','issues'=>[],
      'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>materials,'root_geometry'=>{'faces'=>[],'edges'=>[]},
      'definitions'=>@pieces.map { |p| {'id'=>"def-#{p['id']}",'name'=>p['id'],'geometry'=>{'faces'=>p['faces'],'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],p['dims']]}} },
      'instances'=>@pieces.map { |p| {'path'=>p['id'].split('/'),'definition_id'=>"def-#{p['id']}",'name'=>'','material_id'=>nil,'effective_material_id'=>'board','visible'=>true,'world_transform'=>p['transform'],'local_transform'=>p['transform'],'axis_lengths_mm'=>p['dims'],'orientation'=>{'mirrored'=>p['mirrored'],'sheared'=>false,'singular'=>false}} }}
    R.from_diagnostic(diagnostic)
  end
  def node(p);{'id'=>p['id'],'name'=>"Pieza #{p['id']}",'children'=>[],'mesh'=>{'vertices'=>[[0,0,0],p['dims']],'triangles'=>[]},'metadata'=>{'localBounds'=>{'min'=>[0,0,0],'max'=>p['dims']},'worldTransform'=>p['transform'],'rectangular'=>p['rectangular']}};end
  def build(catalog=@catalog)
    @report=report;rep=@report
    @service=PlanosSanto::SupplierOrder.new({'furniture'=>@pieces.map { |p| node(p) }},'huella',catalog,
      edge_review:->(row,g) { R.verify_edge_mapping(rep,row,g,catalog) },source_review:->(row,g) { @workshop.verify_native_source(rep,row,g,catalog) },
      material_proposal:->(id) { @workshop.native_proposal(rep,id,catalog) })
    @proposal=PlanosSanto::OrderProposal.new(@service,@report,catalog,today:TODAY)
    draft=@service.proposal;draft.delete('geometry');draft
  end
  def row(draft,id);draft['rows'].find { |r| r['id']==id };end
  def entry(result,id);result['proposal']['rows'].find { |r| r['id']==id };end
  CHECKS=%w[orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed grainConfirmed].freeze

  # --- 1. Proponer pedido desde el modelo --------------------------------------------
  def test_proposal_fills_axes_board_edges_rule_and_note_without_confirming
    piece('1/1',[700,450,18],'+y'=>'edge-a','-x'=>'edge-a')
    piece('1/2',[450,18,700],'+z'=>'edge-a') # largo en Z, espesor en Y
    draft=build;result=@proposal.propose(draft)
    first=row(result['plan'],'1/1')
    assert_equal [0,1],first['axes'];assert_equal 1,first['frontSign'];refute first['flipX'];refute first['flipY']
    assert_equal @sheet['id'],first['materialId'];assert_equal @a['id'],first['principalId'];assert_nil first['secondaryId']
    assert_equal [1,0,1,0],first['edgeMap'],'Arriba = +Y y Izquierda = −X en la vista de la cara positiva'
    assert_equal 'observed',first['edgeResolution'];assert_equal [{'observedId'=>'edge-a','catalogId'=>@a['id']}],first['edgeBindings']
    assert_equal 'finished_accepted',first['dimensionRule'];assert_equal 'locked',first['grainPolicy'];assert_equal 'none',first['grainAxis']
    assert_operator first['reviewNote'].strip.length,:>=,8;assert_includes first['reviewNote'],'2026-10-22'
    CHECKS.each { |key| refute first[key],"#{key} queda sin confirmar" }
    second=row(result['plan'],'1/2');assert_equal [2,0],second['axes'],'U = el más largo (Z), V = el segundo (X)'
    assert_equal [700,450],@service.dimensions(second)
    assert_equal [0,0,0,1],second['edgeMap'],'+Z es el extremo derecho de U'
    assert_equal({'proposed'=>2,'kept'=>0,'abstained'=>0,'bulkReady'=>2,'review'=>0},result['proposal']['summary'])
    assert entry(result,'1/1')['bulkReady'];assert_equal 'proposed',entry(result,'1/1')['status']
    refute_same draft,result['plan'];assert_nil row(draft,'1/1')['axes'],'El borrador recibido no se modifica'
  end
  def test_thickness_comes_from_the_board_not_from_the_smallest_side
    piece('1/1',[18,600,15]) # 15 mm es más chico pero la placa es de 18
    draft=build;first=row(@proposal.propose(draft)['plan'],'1/1')
    assert_equal [1,2],first['axes']
    piece('1/2',[30,600,25]);draft=build;result=@proposal.propose(draft)
    assert entry(result,'1/2')['reasons'].any? { |r| r.include?('espesor') },'Sin eje del espesor de la placa: se avisa'
    refute entry(result,'1/2')['bulkReady']
  end
  def test_grained_board_puts_u_along_the_grain_and_waits_for_individual_review
    items=Marshal.load(Marshal.dump(@catalog['items']));items[0]['grain']=true;catalog=@store.save(items,@catalog['revision'])
    @sheet=catalog['items'][0];@a,@b,@c=catalog['items'].drop(1)
    piece('1/1',[450,700,18]);draft=build(catalog);result=@proposal.propose(draft);first=row(result['plan'],'1/1')
    assert_equal [1,0],first['axes'];assert_equal 'u',first['grainAxis'];assert_equal 'locked',first['grainPolicy']
    refute entry(result,'1/1')['bulkReady'];assert entry(result,'1/1')['reasons'].any? { |r| r.include?('veta') }
  end
  def test_more_than_two_edge_skus_block_the_row_with_the_reason
    piece('1/1',[700,450,18],'+y'=>'edge-a','-y'=>'edge-c','-x'=>'edge-b')
    draft=build;draft['edgeLinks']=[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto sin vínculo'}]
    result=@proposal.propose(draft);first=row(result['plan'],'1/1')
    assert_equal [0,0,0,0],first['edgeMap'];assert_nil first['edgeResolution'];assert_nil first['principalId'];assert_nil first['secondaryId']
    reason=entry(result,'1/1')['reasons'].find { |r| r.include?('como máximo 2') }
    assert reason;%w[ABS-A PVC-B ABS-C].each { |sku| assert_includes reason,sku }
    refute entry(result,'1/1')['bulkReady']
  end
  def test_unbound_observed_edge_uses_the_draft_link_table
    piece('1/1',[700,450,18],'+y'=>'edge-b','-y'=>'edge-b')
    draft=build;result=@proposal.propose(draft)
    assert entry(result,'1/1')['reasons'].any? { |r| r.include?('Canto sin vínculo') && r.include?('Vínculos de cantos') }
    assert_equal [0,0,0,0],row(result['plan'],'1/1')['edgeMap']
    material=result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-b' }
    assert_equal({'observedId'=>'edge-b','name'=>'Canto sin vínculo','native'=>false,'catalogId'=>nil,'pieces'=>1},material)
    draft['edgeLinks']=[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto sin vínculo'}]
    result=@proposal.propose(draft);first=row(result['plan'],'1/1')
    assert_equal [1,1,0,0],first['edgeMap'];assert_equal @b['id'],first['principalId'];assert_equal 'observed',first['edgeResolution']
    assert_equal @b['id'],result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-b' }['catalogId']
    assert entry(result,'1/1')['bulkReady']
  end
  def test_native_edge_wins_over_a_draft_link_for_the_same_material
    piece('1/1',[700,450,18],'+y'=>'edge-a')
    draft=build;draft['edgeLinks']=[{'observedId'=>'edge-a','catalogId'=>@c['id'],'name'=>'Otro'}]
    result=@proposal.propose(draft)
    assert_equal @a['id'],row(result['plan'],'1/1')['principalId']
    assert_equal({'observedId'=>'edge-a','name'=>'Material edge-a','native'=>true,'catalogId'=>@a['id'],'pieces'=>1},result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-a' })
  end
  def test_edge_roles_are_consistent_across_the_order_so_lots_do_not_split
    piece('1/1',[700,450,18],'+y'=>'edge-c','-y'=>'edge-c','-x'=>'edge-a') # C suma 1,4 m y A 0,45 m
    piece('1/2',[700,450,18],'-x'=>'edge-a','+x'=>'edge-c')                 # C 0,45 y A 0,45: empata en la pieza
    draft=build;plan=@proposal.propose(draft)['plan']
    assert_equal [@c['id'],@a['id']],[row(plan,'1/1')['principalId'],row(plan,'1/1')['secondaryId']]
    assert_equal [@c['id'],@a['id']],[row(plan,'1/2')['principalId'],row(plan,'1/2')['secondaryId']],'Mismo principal en todo el pedido'
    assert_equal [1,1,2,0],row(plan,'1/1')['edgeMap'];assert_equal [0,0,2,1],row(plan,'1/2')['edgeMap']
  end
  def test_rows_with_any_confirmation_are_kept_and_ids_limit_the_proposal
    piece('1/1',[700,450,18]);piece('1/2',[700,450,18]);piece('1/3',[700,450,18])
    draft=build;row(draft,'1/1')['materialConfirmed']=true;row(draft,'1/1')['detail']='A mano'
    row(draft,'1/3').merge!('include'=>false,'excludeReason'=>'Lo hace el taller')
    result=@proposal.propose(draft,ids:%w[1/1 1/2])
    assert_equal 'kept',entry(result,'1/1')['status'];assert_nil row(result['plan'],'1/1')['axes'];assert_equal 'A mano',row(result['plan'],'1/1')['detail']
    assert_equal [0,1],row(result['plan'],'1/2')['axes'];assert_nil entry(result,'1/3');assert_nil row(result['plan'],'1/3')['axes']
    row(draft,'1/2')['reviewNote']='Nota escrita por el taller'
    assert_equal 'Nota escrita por el taller',row(@proposal.propose(draft)['plan'],'1/2')['reviewNote'],'Una nota propia no se pisa'
  end
  def test_non_rectangular_rows_abstain
    piece('1/1',[700,450,18],rectangular:false);draft=build;result=@proposal.propose(draft)
    assert_equal 'abstained',entry(result,'1/1')['status'];assert_nil row(result['plan'],'1/1')['axes']
    assert_equal 1,result['proposal']['summary']['abstained']
  end

  # --- 2. Confirmar en bloque ------------------------------------------------------
  def test_bulk_confirm_only_rows_without_ambiguity
    piece('1/1',[700,450,18],'+y'=>'edge-a','-x'=>'edge-a')   # inequívoca
    piece('1/2',[450,450,18],'+y'=>'edge-a')                   # largo = ancho
    piece('1/3',[700,450,18],{'+y'=>'edge-a'},mirrored:true)   # espejada
    piece('1/4',[700,450,18],{'+y'=>'edge-a'},coverage:0.5)    # cobertura parcial: lado sin resolver
    piece('1/5',[700,450,25],'+y'=>'edge-a')                   # espesor distinto
    piece('1/6',[700,450,18],{},rectangular:false)              # no rectangular
    draft=build;proposed=@proposal.propose(draft)['plan']
    result=@proposal.confirm_bulk(proposed)
    assert_equal ['1/1'],result['confirmed']
    confirmed=row(result['plan'],'1/1');CHECKS.each { |key| assert confirmed[key],key }
    review=result['review'].to_h { |r| [r['id'],r['reasons'].join(' ')] }
    assert_equal %w[1/2 1/3 1/4 1/5 1/6],review.keys.sort
    assert_includes review['1/2'],'Largo igual al ancho';assert_includes review['1/3'],'espejada';assert_includes review['1/4'],'Arriba'
    assert_includes review['1/5'],'espesor';assert_includes review['1/6'],'no rectangular'
    %w[1/2 1/3 1/4 1/5 1/6].each { |id| CHECKS.each { |key| refute row(result['plan'],id)[key],"#{id} #{key}" } }
  end
  def test_bulk_confirm_skips_manual_edges_and_already_confirmed_rows_and_honours_ids
    piece('1/1',[700,450,18]);piece('1/2',[700,450,18]);piece('1/3',[700,450,18])
    draft=build;plan=@proposal.propose(draft)['plan']
    row(plan,'1/2').merge!('edgeResolution'=>'manual','edgeOverrideReason'=>'Revisado a mano en el taller')
    result=@proposal.confirm_bulk(plan,ids:%w[1/1 1/2])
    assert_equal ['1/1'],result['confirmed'];assert_equal ['1/2'],result['review'].map { |r| r['id'] }
    assert_includes result['review'][0]['reasons'].join,'pieza por pieza'
    CHECKS.each { |key| refute row(result['plan'],'1/3')[key] }
    assert_equal [],@proposal.confirm_bulk(result['plan'],ids:['1/1'])['confirmed'],'Lo ya confirmado no se repite'
  end
  def test_bulk_confirmed_rows_export_and_manifest_carries_edge_totals
    piece('1/1',[700,450,18],'+y'=>'edge-a','-y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a','-y'=>'edge-a')
    draft=build;plan=@proposal.confirm_bulk(@proposal.propose(draft)['plan'])['plan']
    Dir.mktmpdir do |directory|
      result=@service.export(plan,directory);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
      lot=manifest['lots'][0]
      assert_equal [{'catalogId'=>@a['id'],'sku'=>'ABS-A','role'=>'principal','metres'=>2.8,'sides'=>4,'pieces'=>2}],lot['edgeTotals'],'2 piezas de 700 × 450 con [1,1,0,0] = 2,8 m'
      line=File.read(File.join(result['directory'],'lote-01.txt')).lines.first.chomp.split("\t")
      assert_equal 9,line.length;assert_equal %w[1 1 0 0],line[5,4]
    end
  end

  # --- 3. Aplicar a filas equivalentes o seleccionadas ------------------------------
  def ready(plan);@proposal.confirm_bulk(plan)['plan'];end
  def test_apply_invalidates_only_the_confirmations_whose_field_changed
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a')
    plan=(draft=build;ready(@proposal.propose(draft)['plan']))
    row(plan,'1/1').merge!('grainPolicy'=>'locked','reviewNote'=>'Nota del origen revisada')
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>true,'edges'=>true,'grain'=>true,'dimensions'=>true})
    assert_equal 1,result['applied'];assert_equal({},result['invalidated'],'Mismos valores: nada que volver a confirmar')
    CHECKS.each { |key| assert row(result['plan'],'1/2')[key] }
    assert_equal 'Nota del origen revisada',row(result['plan'],'1/2')['reviewNote']
    row(plan,'1/1')['principalId']=@c['id']
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>true,'edges'=>true,'grain'=>true,'dimensions'=>true})
    assert_equal({'1/2'=>['edgesConfirmed']},result['invalidated'])
    target=row(result['plan'],'1/2');assert_equal @c['id'],target['principalId']
    (CHECKS-['edgesConfirmed']).each { |key| assert target[key],key }
    row(plan,'1/1')['materialId']='otra-placa'
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>true,'edges'=>false,'grain'=>false,'dimensions'=>false})
    assert_equal({'1/2'=>%w[materialConfirmed grainConfirmed]},result['invalidated'])
  end
  def test_apply_to_selected_rows_skips_what_does_not_fit_and_swaps_crossed_cuts
    piece('1/1',[700,450,18]);piece('1/2',[450,700,18]);piece('1/3',[900,300,18])
    draft=build;plan=@proposal.propose(draft)['plan']
    row(plan,'1/1').merge!('dimensionRule'=>'explicit_cut','cutBase'=>698,'cutHeight'=>448,'edgeMap'=>[1,0,0,0],'principalId'=>@a['id'])
    result=@proposal.apply(plan,'1/1',%w[1/2 1/3],{'material'=>false,'edges'=>true,'grain'=>false,'dimensions'=>true})
    crossed=row(result['plan'],'1/2');assert_equal [1,0],crossed['axes']
    assert_equal [698,448],[crossed['cutBase'],crossed['cutHeight']],'Mismos ejes de vista: el corte se copia tal cual'
    other=row(result['plan'],'1/3');assert_equal 'finished_accepted',other['dimensionRule'],'Corte explícito no se copia a una pieza de otras medidas'
    assert_equal 1,result['dimensionsSkipped'];assert_equal [1,0,0,0],other['edgeMap']
    row(plan,'1/2')['axes']=[0,1]
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>false,'edges'=>true,'grain'=>false,'dimensions'=>true})
    assert_equal 1,result['edgesSkipped'];assert_equal 1,result['cutsSwapped']
    assert_equal [448,698],[row(result['plan'],'1/2')['cutBase'],row(result['plan'],'1/2')['cutHeight']]
    assert_raises(PlanosSanto::ExportError){@proposal.apply(plan,'1/9',['1/2'],{'material'=>true})}
    assert_equal 0,@proposal.apply(plan,'1/1',['1/1'],{'material'=>true})['applied'],'El origen no es destino'
  end

  # --- 6. Código compuesto en el detalle --------------------------------------------
  def test_detail_code_is_optional_respects_eighty_characters_and_splits_grouped_lines
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a')
    plan=(draft=build;ready(@proposal.propose(draft)['plan']));plan['rows'].each { |r| r['detail']='Lateral' }
    Dir.mktmpdir do |directory|
      plain=File.read(File.join(@service.export(plan,directory)['directory'],'lote-01.txt'))
      assert_equal 1,plain.lines.length,'Sin código: dos laterales iguales en un renglón'
      plan['detailCode']='module_piece';@service.detail_codes={'1/1'=>'M03·P07','1/2'=>'M03·P08'}
      lines=File.read(File.join(@service.export(plan,directory)['directory'],'lote-01.txt'),encoding:'UTF-8').lines.map { |l| l.chomp.split("\t") }
      assert_equal ['M03·P07 Lateral','M03·P08 Lateral'],lines.map { |l| l[3] }.sort;assert lines.all? { |l| l.length==9 && l[0]=='1' }
      plan['profile']={'encoding'=>'windows1252','decimal'=>'.','header'=>false}
      bytes=File.binread(File.join(@service.export(plan,directory)['directory'],'lote-01.txt'))
      assert_includes bytes.force_encoding('Windows-1252').encode('UTF-8'),'M03·P07 Lateral'
    end
    row(plan,'1/1')['detail']='L'*73
    assert_match(/supera 80 caracteres/,assert_raises(PlanosSanto::ExportError){@service.validate(plan)}.message)
    row(plan,'1/1')['detail']='L'*72;assert @service.validate(plan)
    @service.detail_codes={'1/2'=>'M03·P08'}
    blocked=@service.validate(plan,collect_errors:true);assert_equal ['1/1'],blocked.map { |e| e['id'] }
    assert_match(/Falta el código módulo·pieza/,blocked[0]['reason'])
    plan['detailCode']='otro';assert_raises(PlanosSanto::ExportError){@service.validate(plan)}
    plan['detailCode']='none';assert @service.validate(plan)
  end
  def test_codes_come_from_the_saved_guide_module_and_piece_codes
    document={'furniture'=>[{'id'=>'1','name'=>'Bajo mesada M03','children'=>[]},{'id'=>'2','name'=>'Alacena','children'=>[]},{'id'=>'3','name'=>'Placard','children'=>[]}]}
    guide={'furniture'=>[{'id'=>'1','pieces'=>[{'id'=>'1/11','name'=>'Lateral','code'=>'P07'}]},
      {'id'=>'2','naming'=>{'moduleCode'=>'M12','bases'=>[]},'pieces'=>[{'id'=>'2/5','name'=>'Base','code'=>'P01'}]},
      {'id'=>'3','pieces'=>[{'id'=>'3/1','name'=>'Techo','code'=>'P02'}]},{'id'=>'9','pieces'=>[{'id'=>'9/1','name'=>'Otro','code'=>'P01'}]}]}
    assert_equal({'1/11'=>'M03·P07','2/5'=>'M12·P01'},PlanosSanto::OrderProposal.codes(document,guide),'Sin módulo no se inventa un código')
  end

  # --- 4/5. Extras del borrador y totales de canto ---------------------------------
  def test_draft_extras_are_validated
    ok={'edgeLinks'=>[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto'}],'detailCode'=>'module_piece'}
    assert_nil PlanosSanto::OrderProposal.check_extras!(ok)
    assert_nil PlanosSanto::OrderProposal.check_extras!({})
    [{'edgeLinks'=>'x'},{'edgeLinks'=>[{'observedId'=>'a'}]},{'edgeLinks'=>[ok['edgeLinks'][0],ok['edgeLinks'][0]]},{'detailCode'=>'raro'},
     {'edgeLinks'=>[{'observedId'=>'a','catalogId'=>'b','name'=>'x'*201}]}].each do |bad|
      assert_raises(PlanosSanto::ExportError,bad.inspect){PlanosSanto::OrderProposal.check_extras!(bad)}
    end
  end
  def test_edge_totals_sum_base_for_top_bottom_and_height_for_sides_per_sku_and_role
    rows=[{'id'=>'a','edgeMap'=>[1,1,2,0],'principalId'=>@a['id'],'secondaryId'=>@b['id']},{'id'=>'b','edgeMap'=>[0,0,0,0],'principalId'=>@a['id'],'secondaryId'=>@b['id']}]
    totals=PlanosSanto::OrderProposal.edge_totals(rows,@catalog) { |_row| [700,450] }
    assert_equal [{'catalogId'=>@a['id'],'sku'=>'ABS-A','role'=>'principal','metres'=>1.4,'sides'=>2,'pieces'=>1},
                  {'catalogId'=>@b['id'],'sku'=>'PVC-B','role'=>'secondary','metres'=>0.45,'sides'=>1,'pieces'=>1}],totals
  end
end
