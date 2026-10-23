# frozen_string_literal: true
# Del modelo pintado al TXT sin tildes (0.8.16) con dobles sintéticos: diagnóstico P1 armado a mano,
# fake_api de SketchUp y biblioteca en un directorio temporal. No abre SketchUp ni OpenCutList.
require 'minitest/autorun'
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../order_proposal'

class OrderProposalTest < Minitest::Test
  R=PlanosSanto::OclReader
  P=PlanosSanto::OrderProposal
  TODAY=Date.new(2026,10,22)
  # Dirección de la cara → [eje, límite]. Las caras sin pintura propia van con la placa.
  FACES={'-x'=>[0,0],'+x'=>[0,1],'-y'=>[1,0],'+y'=>[1,1],'-z'=>[2,0],'+z'=>[2,1]}.freeze
  LEGACY=PlanosSanto::SupplierOrder::LEGACY_ROW_KEYS

  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    # Ficha completa sin `approved`: el pedido ya no mira esa casilla.
    sheet=@store.new_item('Melamina Blanca 18','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false)
    @edges=%w[ABS-A PVC-B ABS-C].map do |sku|
      edge=@store.new_item("Canto #{sku}",'edge');edge.merge!('sku'=>sku,'supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22);edge
    end
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
  def build(catalog=@catalog,fingerprint: 'huella')
    @report=report;rep=@report
    @service=PlanosSanto::SupplierOrder.new({'furniture'=>@pieces.map { |p| node(p) }},fingerprint,catalog,material_proposal:->(id) { @workshop.native_proposal(rep,id,catalog) })
    @proposal=PlanosSanto::OrderProposal.new(@service,@report,catalog,today:TODAY)
    draft=@service.proposal;draft.delete('geometry');draft
  end
  def fresh(*args,**options);draft=build(*args,**options);@proposal.propose(draft);end
  def proposed;fresh['plan'];end
  def row(draft,id);draft['rows'].find { |r| r['id']==id };end
  def entry(result,id);result['proposal']['rows'].find { |r| r['id']==id };end
  def reasons(plan,id);(@service.validate(plan,collect_errors:true).find { |e| e['id']==id }||{'reasons'=>[]})['reasons'];end

  # --- 1. Propuesta automática desde el modelo --------------------------------------------
  def test_proposal_fills_axes_board_edges_and_rules_without_any_tick_and_records_its_baseline
    piece('1/1',[700,450,18],'+y'=>'edge-a','-x'=>'edge-a')
    piece('1/2',[450,18,700],'+z'=>'edge-a') # largo en Z, espesor en Y
    draft=build;result=@proposal.propose(draft)
    first=row(result['plan'],'1/1')
    assert_equal [0,1],first['axes'];assert_equal 1,first['frontSign'];refute first['flipX'];refute first['flipY']
    assert_equal @sheet['id'],first['materialId'];assert_equal @a['id'],first['principalId'];assert_nil first['secondaryId']
    assert_equal [1,0,1,0],first['edgeMap'],'Arriba = +Y y Izquierda = −X en la vista de la cara positiva'
    assert_equal [{'observedId'=>'edge-a','catalogId'=>@a['id']}],first['edgeBindings']
    assert_equal 'finished_accepted',first['dimensionRule'];assert_equal 'locked',first['grainPolicy']
    assert_equal PlanosSanto::SupplierOrder::ROW_KEYS.sort,first.keys.sort,'Ninguna fila lleva tildes de revisión'
    LEGACY.each { |key| refute first.key?(key),key }
    second=row(result['plan'],'1/2');assert_equal [2,0],second['axes'],'U = el más largo (Z), V = el segundo (X)'
    assert_equal [700,450],@service.dimensions(second)
    assert_equal [0,0,0,1],second['edgeMap'],'+Z es el extremo derecho de U'
    assert_equal({'proposed'=>2,'abstained'=>0,'withNotes'=>0},result['proposal']['summary'])
    assert_equal 'proposed',entry(result,'1/1')['status']
    base=result['plan']['proposed']['1/1']
    assert_equal first.slice(*P::PROPOSED.values.flatten),base['values'];assert_empty base['edgeBlockers']
    refute_same draft,result['plan'];assert_nil row(draft,'1/1')['axes'],'El borrador recibido no se modifica'
    assert_empty @service.validate(result['plan'],collect_errors:true),'Lo propuesto desde el modelo ya se puede exportar'
  end
  def test_proposed_rows_export_without_any_tick_and_the_manifest_says_where_edges_come_from
    piece('1/1',[700,450,18],'+y'=>'edge-a','-y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a','-y'=>'edge-a')
    plan=proposed
    Dir.mktmpdir do |directory|
      result=@service.export(plan,directory);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
      lot=manifest['lots'][0]
      assert_equal [{'catalogId'=>@a['id'],'sku'=>'ABS-A','role'=>'principal','metres'=>2.8,'sides'=>4,'pieces'=>2}],lot['edgeTotals'],'2 piezas de 700 × 450 con [1,1,0,0] = 2,8 m'
      assert_equal({'1/1'=>'model','1/2'=>'model'},lot['edgeSource']);assert_equal 'none',lot['grainAxis']
      assert lot['sourceRows'].all? { |r| (r.keys & LEGACY).empty? }
      line=File.read(File.join(result['directory'],'lote-01.txt')).lines.first.chomp.split("\t")
      assert_equal 9,line.length;assert_equal %w[1 1 0 0],line[5,4]
      row(plan,'1/2')['edgeMap']=[1,0,0,0]
      lot=JSON.parse(File.read(File.join(@service.export(plan,directory)['directory'],'manifest.json')))['lots'][0]
      assert_equal 'manual',lot['edgeSource']['1/2'],'Un mapa cambiado a mano se exporta sin justificar nada'
    end
  end
  def test_thickness_comes_from_the_board_not_from_the_smallest_side
    piece('1/1',[18,600,15]) # 15 mm es más chico pero la placa es de 18
    assert_equal [1,2],row(proposed,'1/1')['axes']
    # 0.8.20: 25 mm es uno de los espesores estándar de la ficha (material con varios espesores): vale.
    piece('1/2',[30,600,25]);piece('1/3',[30,600,22]);plan=proposed
    assert reasons(plan,'1/2').none? { |r| r.include?('El espesor no coincide') },'Espesor estándar de la ficha: no bloquea'
    assert reasons(plan,'1/3').any? { |r| r.include?('El espesor no coincide') },'Sin eje de un espesor de la placa: bloquea (regla física)'
  end
  def test_grained_board_puts_u_along_the_grain_and_the_grain_follows_the_board
    items=Marshal.load(Marshal.dump(@catalog['items']));items[0]['grain']=true;catalog=@store.save(items,@catalog['revision'])
    @sheet=catalog['items'][0];@a,@b,@c=catalog['items'].drop(1)
    piece('1/1',[450,700,18]);result=fresh(catalog);first=row(result['plan'],'1/1')
    assert_equal [1,0],first['axes'];assert_equal 'locked',first['grainPolicy']
    assert_equal 'u',PlanosSanto::SupplierOrder.grain_axis(@sheet);assert_empty @service.validate(result['plan'],collect_errors:true)
    first['grainPolicy']='rotate'
    assert_includes reasons(result['plan'],'1/1'),'No se puede girar una placa con veta: mantené la orientación (rota 0).'
  end
  def test_square_piece_on_grained_board_and_mirrored_instances_only_add_notes
    items=Marshal.load(Marshal.dump(@catalog['items']));items[0]['grain']=true;catalog=@store.save(items,@catalog['revision'])
    @sheet=catalog['items'][0];@a,@b,@c=catalog['items'].drop(1)
    piece('1/1',[450,450,18]);piece('1/2',[700,450,18],{},mirrored:true)
    result=fresh(catalog)
    assert entry(result,'1/1')['notes'].any? { |n| n.include?('Largo igual al ancho') }
    assert entry(result,'1/2')['notes'].any? { |n| n.include?('espejada') }
    assert_empty @service.validate(result['plan'],collect_errors:true),'Los avisos no bloquean'
    plan=result['plan'];row(plan,'1/1')['axes']=[1,0]
    assert_empty P.notes(plan,row(plan,'1/1')),'Al tocar la orientación el aviso de orientación ya no aplica'
  end
  # Se mantiene: más de dos cantos por pieza.
  def test_more_than_two_edge_skus_block_until_the_edges_are_set_by_hand
    piece('1/1',[700,450,18],'+y'=>'edge-a','-y'=>'edge-c','-x'=>'edge-b')
    draft=build;draft['edgeLinks']=[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto sin vínculo'}]
    plan=@proposal.propose(draft)['plan'];first=row(plan,'1/1')
    assert_equal [0,0,0,0],first['edgeMap'];assert_nil first['principalId'];assert_nil first['secondaryId']
    blocker=reasons(plan,'1/1').find { |r| r.include?('como máximo 2') }
    assert blocker;%w[ABS-A PVC-B ABS-C].each { |sku| assert_includes blocker,sku }
    assert_raises(PlanosSanto::ExportError) { @service.validate(plan) }
    first.merge!('principalId'=>@a['id'],'secondaryId'=>@c['id'],'edgeMap'=>[1,2,0,0])
    assert_empty reasons(plan,'1/1'),'Asignados a mano: el pedido sigue'
  end
  def test_unbound_observed_edge_is_a_note_and_the_link_table_resolves_it
    piece('1/1',[700,450,18],'+y'=>'edge-b','-y'=>'edge-b')
    draft=build;result=@proposal.propose(draft)
    assert entry(result,'1/1')['notes'].any? { |r| r.include?('Canto sin vínculo') && r.include?('Cantos pintados sin vínculo') }
    assert_equal [0,0,0,0],row(result['plan'],'1/1')['edgeMap'];assert_empty @service.validate(result['plan'],collect_errors:true),'No bloquea: queda sin canto con aviso'
    material=result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-b' }
    assert_equal({'observedId'=>'edge-b','name'=>'Canto sin vínculo','native'=>false,'catalogId'=>nil,'pieces'=>1},material)
    draft['edgeLinks']=[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto sin vínculo'}]
    result=@proposal.propose(draft);first=row(result['plan'],'1/1')
    assert_equal [1,1,0,0],first['edgeMap'];assert_equal @b['id'],first['principalId'];assert_empty entry(result,'1/1')['notes']
    assert_equal @b['id'],result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-b' }['catalogId']
  end
  def test_partial_coverage_leaves_that_side_without_edge_with_a_note
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a'},coverage:0.5)
    result=fresh;first=row(result['plan'],'1/1')
    assert_equal [0,0,0,0],first['edgeMap'];assert entry(result,'1/1')['notes'].any? { |n| n.start_with?('Arriba: no se pudo leer') }
    assert_empty @service.validate(result['plan'],collect_errors:true)
  end
  def test_native_edge_wins_over_a_draft_link_for_the_same_material
    piece('1/1',[700,450,18],'+y'=>'edge-a')
    draft=build;draft['edgeLinks']=[{'observedId'=>'edge-a','catalogId'=>@c['id'],'name'=>'Otro'}]
    result=@proposal.propose(draft)
    assert_equal @a['id'],row(result['plan'],'1/1')['principalId']
    assert_equal({'observedId'=>'edge-a','name'=>'Material edge-a','native'=>true,'catalogId'=>@a['id'],'pieces'=>1},result['proposal']['edgeMaterials'].find { |m| m['observedId']=='edge-a' })
  end
  def test_completing_a_ficha_after_painting_keeps_the_painted_binding
    items=Marshal.load(Marshal.dump(@catalog['items']));items[0]['sku']='';catalog=@store.save(items,@catalog['revision'])
    @sheet=catalog['items'][0];@a,@b,@c=catalog['items'].drop(1)
    piece('1/1',[700,450,18]);build(catalog);@report=report # pintado con la ficha incompleta
    items=Marshal.load(Marshal.dump(catalog['items']));items[0]['sku']='MEL-18';completed=@store.save(items,catalog['revision'])
    rep=@report;service=PlanosSanto::SupplierOrder.new({'furniture'=>@pieces.map { |p| node(p) }},'huella',completed,material_proposal:->(id) { @workshop.native_proposal(rep,id,completed) })
    plan=PlanosSanto::OrderProposal.new(service,rep,completed).propose(service.proposal)['plan']
    assert_equal @sheet['id'],row(plan,'1/1')['materialId'],'Completar la ficha no rompe el vínculo de lo ya pintado'
    assert_empty service.validate(plan,collect_errors:true)
  end
  def test_edge_roles_are_consistent_across_the_order_so_lots_do_not_split
    piece('1/1',[700,450,18],'+y'=>'edge-c','-y'=>'edge-c','-x'=>'edge-a') # C suma 1,4 m y A 0,45 m
    piece('1/2',[700,450,18],'-x'=>'edge-a','+x'=>'edge-c')                 # C 0,45 y A 0,45: empata en la pieza
    plan=proposed
    assert_equal [@c['id'],@a['id']],[row(plan,'1/1')['principalId'],row(plan,'1/1')['secondaryId']]
    assert_equal [@c['id'],@a['id']],[row(plan,'1/2')['principalId'],row(plan,'1/2')['secondaryId']],'Mismo principal en todo el pedido'
    assert_equal [1,1,2,0],row(plan,'1/1')['edgeMap'];assert_equal [0,0,2,1],row(plan,'1/2')['edgeMap']
  end
  def test_ids_limit_the_proposal
    piece('1/1',[700,450,18]);piece('1/2',[700,450,18])
    draft=build;row(draft,'1/1')['detail']='A mano'
    result=@proposal.propose(draft,ids:%w[1/2])
    assert_nil row(result['plan'],'1/1')['axes'];assert_equal 'A mano',row(result['plan'],'1/1')['detail'];assert_nil entry(result,'1/1')
    assert_equal [0,1],row(result['plan'],'1/2')['axes'];refute result['plan']['proposed'].key?('1/1')
  end
  # Se mantiene: pieza no rectangular.
  def test_non_rectangular_rows_abstain_and_block
    piece('1/1',[700,450,18],rectangular:false);result=fresh
    assert_equal 'abstained',entry(result,'1/1')['status'];assert_nil row(result['plan'],'1/1')['axes']
    assert_equal 1,result['proposal']['summary']['abstained']
    assert_match(/no rectangular/,reasons(result['plan'],'1/1').first)
    row(result['plan'],'1/1')['include']=false;row(result['plan'],'1/1')['excludeReason']=''
    assert_match(/No hay piezas incluidas/,assert_raises(PlanosSanto::ExportError) { @service.validate(result['plan']) }.message)
  end

  # --- 2. Punto 10: el borrador sobrevive a cambios del modelo, la biblioteca o el perfil -------
  def test_draft_survives_a_new_fingerprint_crossing_rows_by_id
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18]);piece('1/3',[700,450,18])
    stored=proposed
    row(stored,'1/1').merge!('materialId'=>'','detail'=>'Lateral a mano')          # editado a mano
    row(stored,'1/2').merge!('include'=>false,'excludeReason'=>'')                 # excluido sin motivo
    # El modelo cambió: 1/1 se repintó con otro canto, 1/3 desapareció y apareció 1/4.
    @pieces.reject! { |p| %w[1/1 1/3].include?(p['id']) }
    piece('1/1',[700,450,18],'+y'=>'edge-c');piece('1/4',[600,400,18],'-y'=>'edge-a')
    fresh=fresh(fingerprint:'huella-nueva')['plan']
    merged=P.merge(stored,fresh);plan=merged['plan']
    assert_equal({'kept'=>2,'added'=>1,'removed'=>1},merged['merge'])
    assert_equal 'huella-nueva',plan['fingerprint'];assert_equal %w[1/1 1/2 1/4],plan['rows'].map { |r| r['id'] }.sort
    first=row(plan,'1/1')
    assert_equal '',first['materialId'];assert_equal 'Lateral a mano',first['detail'],'Lo editado a mano se conserva'
    assert_equal @c['id'],first['principalId'],'Los cantos que no se tocaron siguen al modelo repintado'
    refute row(plan,'1/2')['include'];assert_equal [0,1],row(plan,'1/4')['axes']
    assert_equal fresh['proposed'],plan['proposed'],'La línea de base pasa a ser la propuesta nueva'
    blocked=@service.validate(plan,collect_errors:true)
    assert_equal ['1/1'],blocked.map { |e| e['id'] };assert_includes blocked[0]['reasons'],'Elegí una placa de la biblioteca.','Después se revalida'
  end
  def test_a_hand_made_orientation_keeps_its_edges_and_explicit_cut
    piece('1/1',[700,450,18],'+y'=>'edge-a')
    stored=proposed;row(stored,'1/1').merge!('axes'=>[1,0],'frontSign'=>-1,'edgeMap'=>[0,0,1,0],'dimensionRule'=>'explicit_cut','cutBase'=>449,'cutHeight'=>699)
    @pieces.clear;piece('1/1',[700,450,18],'+y'=>'edge-c')
    plan=P.merge(stored,fresh(fingerprint:'otra')['plan'])['plan']
    assert_equal({'axes'=>[1,0],'frontSign'=>-1,'edgeMap'=>[0,0,1,0],'principalId'=>@a['id'],'dimensionRule'=>'explicit_cut','cutBase'=>449},row(plan,'1/1').slice('axes','frontSign','edgeMap','principalId','dimensionRule','cutBase'))
  end
  def test_a_0815_draft_without_baseline_keeps_what_the_taller_filled_in
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a')
    legacy=build;legacy.delete('proposed')
    row(legacy,'1/1').merge!('axes'=>[1,0],'frontSign'=>1,'materialId'=>@sheet['id'],'principalId'=>@c['id'],'edgeMap'=>[0,0,1,0],'grainPolicy'=>'rotate','orientationConfirmed'=>true,'reviewNote'=>'Nota vieja','edgeResolution'=>'manual','edgeOverrideReason'=>'Revisado','grainAxis'=>'none','grainConfirmed'=>true)
    row(legacy,'1/2').merge!('grainAxis'=>nil,'grainPolicy'=>nil,'dimensionRule'=>nil,'reviewNote'=>'','edgeResolution'=>nil)
    plan=P.merge(legacy,fresh['plan'])['plan']
    first=row(plan,'1/1');second=row(plan,'1/2')
    assert_equal [[1,0],@c['id'],[0,0,1,0],'rotate'],[first['axes'],first['principalId'],first['edgeMap'],first['grainPolicy']]
    assert_equal [[0,1],@a['id'],[1,0,0,0],'locked','finished_accepted'],[second['axes'],second['principalId'],second['edgeMap'],second['grainPolicy'],second['dimensionRule']],'Lo que estaba vacío sigue al modelo'
    plan['rows'].each { |r| assert_empty r.keys & LEGACY }
  end

  # --- 3. Aplicar a filas equivalentes o seleccionadas ------------------------------
  def test_apply_copies_only_changed_values_and_never_touches_ticks
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a')
    plan=proposed
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>true,'edges'=>true,'grain'=>true,'dimensions'=>true})
    assert_equal 0,result['applied'],'Mismos valores: nada que copiar';refute result.key?('invalidated')
    row(plan,'1/1')['principalId']=@c['id']
    result=@proposal.apply(plan,'1/1',['1/2'],{'material'=>true,'edges'=>true,'grain'=>true,'dimensions'=>true})
    assert_equal 1,result['applied'];assert_equal @c['id'],row(result['plan'],'1/2')['principalId']
    assert_equal 'manual',P.edge_source(result['plan'],row(result['plan'],'1/2'))
  end
  def test_apply_to_selected_rows_skips_what_does_not_fit_and_swaps_crossed_cuts
    piece('1/1',[700,450,18]);piece('1/2',[450,700,18]);piece('1/3',[900,300,18])
    plan=proposed
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

  # --- 4. Código compuesto en el detalle (se mantiene: 80 caracteres y código repetido) ------
  def test_detail_code_is_optional_respects_eighty_characters_and_splits_grouped_lines
    piece('1/1',[700,450,18],'+y'=>'edge-a');piece('1/2',[700,450,18],'+y'=>'edge-a')
    plan=proposed;plan['rows'].each { |r| r['detail']='Lateral' }
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
    row(plan,'1/1')['detail']='L'*81
    assert_includes reasons(plan,'1/1'),'El detalle supera 80 caracteres: acortalo.','Sin código también rige el máximo de 80'
  end
  def test_codes_come_from_the_saved_guide_module_and_piece_codes
    document={'furniture'=>[{'id'=>'1','name'=>'Bajo mesada M03','children'=>[]},{'id'=>'2','name'=>'Alacena','children'=>[]},{'id'=>'3','name'=>'Placard','children'=>[]}]}
    guide={'furniture'=>[{'id'=>'1','pieces'=>[{'id'=>'1/11','name'=>'Lateral','code'=>'P07'}]},
      {'id'=>'2','naming'=>{'moduleCode'=>'M12','bases'=>[]},'pieces'=>[{'id'=>'2/5','name'=>'Base','code'=>'P01'}]},
      {'id'=>'3','pieces'=>[{'id'=>'3/1','name'=>'Techo','code'=>'P02'}]},{'id'=>'9','pieces'=>[{'id'=>'9/1','name'=>'Otro','code'=>'P01'}]}]}
    assert_equal({'1/11'=>'M03·P07','2/5'=>'M12·P01'},PlanosSanto::OrderProposal.codes(document,guide),'Sin módulo no se inventa un código')
    guide['furniture'][1]['naming']['moduleCode']='M03';guide['furniture'][1]['pieces'][0]['code']='P07'
    codes=PlanosSanto::OrderProposal.codes(document,guide);assert_equal({'1/11'=>'','2/5'=>''},codes,'Código repetido entre muebles: se marca, no se usa')
    reason=PlanosSanto::OrderProposal.detail_reasons({'detailCode'=>'module_piece'},{'id'=>'1/11','detail'=>'Lateral'},codes)
    assert_match(/se repite/,reason[0]);assert_equal 'Lateral',PlanosSanto::OrderProposal.detail_text({'detailCode'=>'module_piece'},{'id'=>'1/11','detail'=>'Lateral'},codes)
  end

  # --- 5. Extras del borrador y totales de canto ---------------------------------
  def test_draft_extras_are_validated
    ok={'edgeLinks'=>[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto'}],'detailCode'=>'module_piece','proposed'=>{'1/1'=>{'values'=>{},'edgeBlockers'=>[],'notes'=>[{'group'=>'edges','text'=>'x'}]}}}
    assert_nil PlanosSanto::OrderProposal.check_extras!(ok)
    assert_nil PlanosSanto::OrderProposal.check_extras!({})
    [{'edgeLinks'=>'x'},{'edgeLinks'=>[{'observedId'=>'a'}]},{'edgeLinks'=>[ok['edgeLinks'][0],ok['edgeLinks'][0]]},{'detailCode'=>'raro'},
     {'edgeLinks'=>[{'observedId'=>'a','catalogId'=>'b','name'=>'x'*201}]},{'proposed'=>[]},{'proposed'=>{'1/1'=>{'values'=>[]}}},
     {'proposed'=>{'1/1'=>{'values'=>{},'notes'=>[{'group'=>'otro','text'=>'x'}]}}}].each do |bad|
      assert_raises(PlanosSanto::ExportError,bad.inspect){PlanosSanto::OrderProposal.check_extras!(bad)}
    end
  end
  def test_edge_totals_sum_base_for_top_bottom_and_height_for_sides_per_sku_and_role
    rows=[{'id'=>'a','edgeMap'=>[1,1,2,0],'principalId'=>@a['id'],'secondaryId'=>@b['id']},{'id'=>'b','edgeMap'=>[0,0,0,0],'principalId'=>@a['id'],'secondaryId'=>@b['id']}]
    totals=PlanosSanto::OrderProposal.edge_totals(rows,@catalog) { |_row| [700,450] }
    assert_equal [{'catalogId'=>@a['id'],'sku'=>'ABS-A','role'=>'principal','metres'=>1.4,'sides'=>2,'pieces'=>1},
                  {'catalogId'=>@b['id'],'sku'=>'PVC-B','role'=>'secondary','metres'=>0.45,'sides'=>1,'pieces'=>1}],totals
  end
  def test_turning_the_view_keeps_the_edges_on_their_faces_and_still_counts_them_as_the_models
    piece('1/1',[700,450,18],'+y'=>'edge-a','-x'=>'edge-c')
    plan=proposed;first=row(plan,'1/1');before=first['edgeMap'].dup
    turned=first.merge('frontSign'=>-first['frontSign'])
    turned['edgeMap']=P.remap_edges(first,turned,before,false)
    assert_equal [before[0],before[1],before[3],before[2]],turned['edgeMap'],'Dar vuelta la cara intercambia izquierda y derecha'
    plan['rows'][0]=turned
    assert_equal 'model',P.edge_source(plan,turned);assert_empty @service.validate(plan,collect_errors:true)
    # Coincide con lo que leería OclReader en la vista nueva.
    observed=R.projected_edges(@report,turned,@service.proposal['geometry']['1/1'])['sides'].map { |side| side['materialIds'].first }
    assert_equal turned['edgeMap'].map(&:positive?),observed.map { |id| !id.nil? }
    turned['edgeMap']=[1,1,1,1];assert_equal 'manual',P.edge_source(plan,turned)
  end
end
