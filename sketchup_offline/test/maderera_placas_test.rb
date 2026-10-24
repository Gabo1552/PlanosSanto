# frozen_string_literal: true
# 0.8.20 «Maderera»: optimización por placa (material + espesor real de la pieza) y un TXT por placa en el
# formato que acepta la maderera. Dobles sintéticos: diagnóstico P1 armado a mano (como cutlist_test.rb) y,
# para el flujo completo, el modelo de nombres con fake_api. No abre SketchUp ni OpenCutList.
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../order_references'

class MadereraPlacasTest < Minitest::Test
  R=PlanosSanto::OclReader
  S=PlanosSanto::SupplierOrder
  FACES={'-x'=>[0,0],'+x'=>[0,1],'-y'=>[1,0],'+y'=>[1,1],'-z'=>[2,0],'+z'=>[2,1]}.freeze
  ROOT=File.expand_path('../..',__dir__)

  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    sheet=@store.new_item('Melamina Blanca','sheet');sheet.merge!('sku'=>'MEL-SINT','supplier'=>'Maderera de prueba','thicknessMm'=>18,'thicknessesMm'=>[18],'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false)
    oak=@store.new_item('Roble','sheet');oak.merge!('sku'=>'ROB-SINT','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true)
    edges=%w[ABS-A PVC-B ABS-C].map do |sku|
      edge=@store.new_item("Canto #{sku}",'edge');edge.merge!('sku'=>sku,'supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22);edge
    end
    @catalog=@store.save([sheet,oak,*edges],0);@sheet,@oak,@a,@b,@c=@catalog['items']
    @pieces=[];@workshop=PlanosSanto::Workshop.new(nil,nil,directory:@dir)
  end
  def teardown;FileUtils.remove_entry(@dir) if @dir && File.directory?(@dir);end

  def native(id,item);{'id'=>id,'name'=>"Material #{id}",'color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>item['kind']=='sheet' ? 2 : 4},'planos_santo_observed'=>{'status'=>'valid','binding'=>PlanosSanto::MaterialResolver.binding_for(item)}};end
  def materials;[native('board',@sheet),native('oak',@oak),native('edge-a',@a),native('edge-b',@b),native('edge-c',@c),{'id'=>'paint','name'=>'Pintura genérica','color_rgb'=>[9,9,9],'opencutlist_observed'=>{}}];end
  def piece(id,dims,paint={},name:"Pieza #{id}",base:'board',rectangular:true)
    faces=FACES.map do |face,(axis,high)|
      others=[0,1,2]-[axis];plane=high==1 ? dims[axis] : 0
      corners=[[0,0],[1,0],[1,1],[0,1]].map { |a,b| point=[0,0,0];point[axis]=plane;point[others[0]]=a*dims[others[0]];point[others[1]]=b*dims[others[1]];point }
      {'id'=>"#{id}-#{face}",'normal_local'=>Array.new(3) { |i| i==axis ? (high==1 ? 1 : -1) : 0 },'vertices_mm'=>corners,'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],
       'area_mm2_local'=>dims[others[0]]*dims[others[1]],'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint.fetch(face,base),'back_material_id'=>nil}
    end
    @pieces << {'id'=>id,'dims'=>dims,'faces'=>faces,'name'=>name,'base'=>base,'rectangular'=>rectangular}
  end
  def report
    diagnostic={'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOBLE','exported_at'=>'2026-10-22T00:00:00Z','model_guid'=>'sintetico','issues'=>[],
      'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>materials,'root_geometry'=>{'faces'=>[],'edges'=>[]},
      'definitions'=>@pieces.map { |p| {'id'=>"def-#{p['id']}",'name'=>p['id'],'geometry'=>{'faces'=>p['faces'],'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],p['dims']]}} },
      'instances'=>@pieces.map { |p| {'path'=>p['id'].split('/'),'definition_id'=>"def-#{p['id']}",'name'=>'','material_id'=>nil,'effective_material_id'=>p['base'],'visible'=>true,'world_transform'=>Geom::Transformation.new.to_a,'local_transform'=>Geom::Transformation.new.to_a,'axis_lengths_mm'=>p['dims'],'orientation'=>{'mirrored'=>false,'sheared'=>false,'singular'=>false}} }}
    R.from_diagnostic(diagnostic)
  end
  def node(p);{'id'=>p['id'],'name'=>p['name'],'children'=>[],'mesh'=>{'vertices'=>[[0,0,0],p['dims']],'triangles'=>[]},'metadata'=>{'localBounds'=>{'min'=>[0,0,0],'max'=>p['dims']},'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>p['rectangular']}};end
  def document
    roots=@pieces.group_by { |p| p['id'].split('/').first }
    {'furniture'=>roots.map { |root,list| {'id'=>root,'name'=>"Mueble #{root}",'children'=>list.map { |p| node(p) }} }}
  end
  # El plan que arma Workshop#board_plan: propuesta pura del modelo, sin borrador ni perfil.
  def plan(catalog=@catalog)
    rep=report
    @service=S.new(document,'huella',catalog,material_proposal:->(id) { @workshop.native_proposal(rep,id,catalog) })
    PlanosSanto::OrderProposal.new(@service,rep,catalog).propose(@service.proposal)['plan'].merge('profile'=>S::TXT_PROFILE.dup,'detailCode'=>'none')
  end
  def validate_txt(bytes)
    path=File.join(@dir,"validar-#{rand(1_000_000)}.txt");File.binwrite(path,bytes)
    %w[scripts/validar_txt_maderera.py scripts/validar_pedido_txt.py].each do |script|
      out,status=Open3.capture2e('python3',File.join(ROOT,script),path)
      assert status.success?,"#{script}: #{out}"
    end
  end
  def lines(prepared);prepared['content'].dup.force_encoding('UTF-8').split("\r\n").map { |line| line.split("\t") };end

  def test_boards_group_by_material_and_real_piece_thickness_with_outside_pieces
    piece('1/1',[700,450,18],{'+y'=>'edge-a'},name:'Lateral');piece('1/2',[700,450,18],{'+y'=>'edge-a'},name:'Lateral')
    piece('1/3',[400,300,15],name:'Fondo')                 # misma placa pintada, otro espesor medido
    piece('1/4',[500,200,18],name:'Tapa roble',base:'oak')
    piece('2/1',[600,300,18],name:'Pintada',base:'paint')  # sin placa de la biblioteca
    piece('2/2',[600,300,18],name:'Curva',rectangular:false)
    draft=plan;result=@service.boards(draft)
    assert_equal [['Melamina Blanca',15.0,['1/3']],['Melamina Blanca',18.0,['1/1','1/2']],['Roble',18.0,['1/4']]],result['boards'].map { |b| [b['name'],b['thicknessMm'],b['rowIds']] }
    assert_equal "#{@sheet['id']}|150",result['boards'][0]['key'];assert_equal S.board_key(@sheet['id'],18.04),result['boards'][1]['key']
    assert_equal({'2/1'=>'no_board','2/2'=>'not_rectangular'},result['outside'].to_h { |o| [o['id'],o['reason']] })
    # Biblioteca v4: 15 mm sobre una ficha que solo lista 18 mm no frena el TXT; la placa sale marcada fuera de la lista.
    fifteen=result['boards'][0];assert_empty fifteen['problems'];assert_equal [false,true,true],result['boards'].map { |b| b['thicknessInList'] }
    prepared=@service.board_txt(draft,fifteen['key']);assert_equal [%w[1 400 300 Fondo 0 0 0 0 0]],lines(prepared);validate_txt(prepared['content'])
    eighteen=@service.board_txt(draft,result['boards'][1]['key']);assert_equal [%w[2 700 450 Lateral 0 1 0 0 0]],lines(eighteen);validate_txt(eighteen['content'])
    # Un material con varios espesores estándar (`thicknessesMm`) tiene la pieza de 15 mm en su lista.
    catalog=Marshal.load(Marshal.dump(@catalog));catalog['items'][0]['thicknessesMm']=[15,18]
    draft=plan(catalog);board=@service.boards(draft)['boards'][0];assert_empty board['problems'];assert board['thicknessInList']
    prepared=@service.board_txt(draft,board['key']);assert_equal [%w[1 400 300 Fondo 0 0 0 0 0]],lines(prepared);validate_txt(prepared['content'])
  end

  def test_txt_of_one_board_uses_piece_sizes_board_level_edge_codes_and_supplier_format
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a'},name:'Lateral');piece('1/2',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a'},name:'Lateral')
    piece('1/3',[300,250,18],{'+y'=>'edge-b'},name:'Zócalo')   # solo canto B: en el pedido su principal es B
    piece('1/4',[650,400,18],name:'Estante')
    draft=plan;board=@service.boards(draft)['boards'].first
    assert_equal [['ABS-A',1,2.8],['PVC-B',2,0.3]],board['edges'].map { |e| [e['sku'],e['code'],e['metres']] }
    zocalo=draft['rows'].find { |r| r['id']=='1/3' };assert_equal @b['id'],zocalo['principalId'],'la fila propone B como principal'
    prepared=@service.board_txt(draft,board['key'])
    rows=lines(prepared)
    assert_equal [%w[2 700 450 Lateral 0 1 1 0 0],%w[1 300 250 Zócalo 0 2 0 0 0],%w[1 650 400 Estante 0 0 0 0 0]],rows,'B es el canto 2 de la placa aunque sea el principal de la pieza'
    bytes=prepared['content'];assert bytes.end_with?("\r\n".b);refute bytes.start_with?("\xEF\xBB\xBF".b);refute_includes bytes,','.b
    assert_equal 4,prepared['pieces'];assert_equal 3,prepared['textRows'];validate_txt(bytes)
    # Girar: solo en placas sin veta y con cantos simétricos (sin cantos o los cuatro iguales).
    rotated=lines(@service.board_txt(draft,board['key'],rotate:true))
    assert_equal %w[0 0 1],rotated.map { |r| r[4] }
  end

  def test_printed_references_share_board_edge_codes_with_txt_even_when_each_piece_has_its_own_principal
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a'},name:'Lateral')
    piece('1/2',[300,250,18],{'+y'=>'edge-b'},name:'Zócalo')
    draft=plan;before=Marshal.dump(draft);service=@service
    workshop=Object.new;workshop.define_singleton_method(:current_board_plan) { [service,draft] }
    references=PlanosSanto::OrderReferences.partial(nil,workshop)
    board=service.boards(draft)['boards'].first
    exported=lines(service.board_txt(draft,board['key']))
    assert_empty references['pending']
    draft['rows'].each do |row|
      reference=references['references'].fetch(row['id'])
      line=exported.find { |cells| cells[3]==row['detail'] }
      assert_equal line[5,4].map(&:to_i),reference['edgeMap']
      assert_equal ['ABS-A','PVC-B'],reference.values_at('principal','secondary')
      assert_equal 1,reference['lot']
    end
    assert_equal [2,0,0,0],references['references']['1/2']['edgeMap']
    assert_includes references['references']['1/2']['text'],'Arr:PVC-B'
    assert_equal before,Marshal.dump(draft),'referencias y TXT no cambian el borrador'
  end

  def test_references_leave_a_board_with_three_edge_products_pending
    %w[edge-a edge-b edge-c].each_with_index { |edge,i| piece("1/#{i+1}",[700-i*100,450,18],{'+y'=>edge}) }
    piece('2/1',[400,300,18],base:'oak')
    draft=plan;service=@service;workshop=Object.new
    workshop.define_singleton_method(:current_board_plan) { [service,draft] }
    references=PlanosSanto::OrderReferences.partial(nil,workshop)
    assert_equal %w[1/1 1/2 1/3],references['pending']
    assert_equal ['2/1'],references['references'].keys
    refute references['references']['2/1'].key?('lot')
  end

  def test_board_validation_rechecks_the_requested_rotation_without_mutating_the_draft
    piece('1/1',[700,450,18],name:'Solo entra girada')
    @sheet['lengthMm']=600;@sheet['widthMm']=800
    draft=plan;before=Marshal.dump(draft)
    locked=@service.boards(draft)['boards'].first
    assert_match(/no entra/,locked['problems'].first['reasons'].join)
    allowed=@service.boards(draft,rotate:true)['boards'].first
    assert_empty allowed['problems']
    assert_equal '1',lines(@service.board_txt(draft,allowed['key'],rotate:true)).first[4]
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,allowed['key'],rotate:false) }
    assert_equal before,Marshal.dump(draft)
    # Permitir giro nunca lo fuerza con veta ni con cantos asimétricos.
    @sheet['grain']=true;draft=plan
    refute_empty @service.boards(draft,rotate:true)['boards'].first['problems']
    @sheet['grain']=false;@pieces.clear;piece('1/1',[700,450,18],{'+y'=>'edge-a'});draft=plan
    refute_empty @service.boards(draft,rotate:true)['boards'].first['problems']
  end

  def test_grain_board_never_rotates_and_three_edges_block_only_that_board
    piece('1/1',[700,450,18],name:'Tapa',base:'oak')
    piece('1/2',[700,450,18],{'+y'=>'edge-a'},name:'Lateral');piece('1/3',[600,450,18],{'+y'=>'edge-b'},name:'Puerta');piece('1/4',[500,450,18],{'+y'=>'edge-c'},name:'Cajón')
    draft=plan;oak,white=@service.boards(draft)['boards'].partition { |b| b['materialId']==@oak['id'] }.map(&:first)
    assert_equal %w[1 700 450 Tapa 0 0 0 0 0],lines(@service.board_txt(draft,oak['key'],rotate:true)).first
    assert_match(/lleva 3 cantos distintos \(ABS-A, PVC-B, ABS-C\)/,white['blocker'])
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,white['key']) }
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,'otra|180') }
  end
  def test_experto_rotates_smooth_asymmetric_edges_without_changing_dimensions_or_draft
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-x'=>'edge-b'},name:'Lateral')
    draft=plan;before=Marshal.dump(draft);key=S.board_key(@sheet['id'],18)
    general=lines(@service.board_txt(draft,key,rotate:true)).first
    prepared=@service.board_txt(draft,key,method:'experto');experto=lines(prepared).first
    assert_equal '0',general[4];assert_equal '1',experto[4]
    assert_equal general.values_at(0,1,2,3,5,6,7,8),experto.values_at(0,1,2,3,5,6,7,8)
    assert_equal 9,experto.length;assert_equal %w[700 450],experto[1,2]
    assert_equal before,Marshal.dump(draft);validate_txt(prepared['content'])
  end

  def test_experto_uses_custom_catalog_format_and_exact_single_axis_trim
    @sheet['lengthMm']=1010;@sheet['widthMm']=610
    piece('1/1',[1000,600,18],name:'Ajustada')
    draft=plan;board=@service.boards(draft,method:'experto')['boards'].first
    assert_empty board['problems'];assert_equal %w[1000 600],lines(@service.board_txt(draft,board['key'],method:'experto')).first[1,2]
    @sheet['lengthMm']=1009.999
    draft=plan;board=@service.boards(draft,method:'experto')['boards'].first
    assert_match(/medida útil/,board['problems'].first['reasons'].join)
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,board['key'],method:'experto') }
    # Existing General has its own layout checks and keeps the previous TXT behavior.
    assert_empty @service.boards(draft)['boards'].first['problems']
  end

  def test_experto_small_parts_block_whole_material_and_exact_50_is_accepted
    piece('1/1',[700,50,18],name:'Válida');piece('1/2',[700,49.99,18],name:'Demasiado angosta')
    draft=plan;board=@service.boards(draft,method:'experto')['boards'].first
    assert_equal ['1/2'],board['problems'].map { |problem| problem['id'] }
    error=assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,board['key'],method:'experto') }
    assert_match(/al menos 50/,error.message)
    draft['rows'][1]['include']=false
    prepared=@service.board_txt(draft,board['key'],method:'experto')
    assert_equal 1,prepared['pieces'];assert_equal %w[700 50],lines(prepared).first[1,2]
  end

  def test_experto_does_not_rotate_grained_or_unknown_grain_material
    piece('1/1',[700,450,18],name:'Con veta',base:'oak')
    draft=plan;key=S.board_key(@oak['id'],18)
    assert_equal '0',lines(@service.board_txt(draft,key,rotate:true,method:'experto')).first[4]
    @oak['lengthMm']=600;@oak['widthMm']=800
    draft=plan
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,key,rotate:true,method:'experto') }
    @oak['grain']=nil;draft=plan
    assert_equal 'locked',@service.board_draft(draft,method:'experto')['rows'][0]['grainPolicy']
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,key,method:'experto') }
  end

  def test_experto_still_checks_edge_width_and_invalid_edge_maps
    piece('1/1',[700,450,18],{'+y'=>'edge-a'},name:'Lateral')
    @a['widthMm']=10;@a['widthsMm']=[10];draft=plan;key=S.board_key(@sheet['id'],18)
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,key,method:'experto') }
    @a['widthMm']=22;@a['widthsMm']=[22];draft=plan;draft['rows'][0]['edgeMap']=[3,0,0,0]
    error=assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,key,method:'experto') }
    assert_match(/Mapa de cantos inválido/,error.message)
  end

  def test_workshop_separates_cached_methods_and_exports_with_selected_method
    piece('1/1',[700,450,18],{'+y'=>'edge-a'},name:'Lateral')
    draft=plan;@workshop.instance_variable_set(:@board_plan,[@service,draft]);@workshop.instance_variable_set(:@order_catalog,@catalog)
    @workshop.define_singleton_method(:project_name) { 'Ensayo' }
    general=@workshop.boards(rotate:true);experto=@workshop.boards(rotate:true,method:'experto')
    key=general['boards'][0]['key']
    assert_equal 'locked',general['plan']['rows'][0]['grainPolicy']
    assert_equal 'rotate',experto['plan']['rows'][0]['grainPolicy']
    assert_equal 'locked',@workshop.boards(rotate:true)['plan']['rows'][0]['grainPolicy']
    assert_equal 2,@workshop.instance_variable_get(:@board_lists).length
    prepared=@workshop.board_export(key,false,method:'experto')
    assert_equal '1',lines(prepared).first[4]
    assert_match(/Ensayo-Melamina Blanca-18mm.txt/,prepared['fileName'])
    exported=@workshop.export_boards(false,@dir,method:'experto')
    assert_equal prepared['content'],File.binread(File.join(exported['directory'],prepared['fileName']))
  end

  def test_optimization_method_is_allowlisted_and_cannot_be_set_in_saved_row
    piece('1/1',[700,450,18]);draft=plan
    [nil,true,'opencut','EXPERTO',''].each do |method|
      assert_raises(PlanosSanto::ExportError) { @service.boards(draft,method:method) }
      assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,S.board_key(@sheet['id'],18),method:method) }
    end
    draft['rows'][0]['method']='experto'
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,S.board_key(@sheet['id'],18),method:'experto') }
  end

end

# Flujo completo de Workshop con el modelo sintético de nombres: nombres de archivo, guardado de un TXT,
# «Exportar todos» en una carpeta nueva, sin tocar el borrador del pedido ni aplicar el perfil de maderera.
class MadereraWorkshopTest < Minitest::Test
  ROOT=File.expand_path('../..',__dir__)
  def setup
    require_relative 'names_double'
    require_relative 'ocl_read_double'
    require_relative '../session'
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    @model=NamesFixture.model;OclReadFixture.prepare(@model)
    sheet=@store.new_item('Melamina Jade','sheet');sheet.merge!('sku'=>'JADE-SINT','supplier'=>'Prueba','thicknessMm'=>19.05,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true)
    edge=@store.new_item('Canto Jade','edge');edge.merge!('sku'=>'CJ-SINT','supplier'=>'Prueba','thicknessMm'=>0.8,'widthMm'=>22)
    catalog=@store.save([sheet,edge],0);@sheet,@edge=catalog['items']
    @model.materials[0].planos_binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(@sheet))
    @model.materials[1].planos_binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(@edge))
    @session=PlanosSanto::NativeSession.new(@model);@session.scan;@session.generate(%w[1 2])
  end
  def teardown;FileUtils.remove_entry(@dir) if @dir && File.directory?(@dir);end
  def workshop;PlanosSanto::Workshop.new(@model,@session,directory:@dir);end

  def test_boards_file_names_one_txt_and_all_in_a_new_folder_without_writing_the_model
    # Perfil activo con «descontar canto», coma decimal y encabezado: queda guardado y no se aplica.
    profiles=PlanosSanto::MaderaProfileStore.new(directory:@dir)
    saved=profiles.save(PlanosSanto::MaderaProfile.template.merge('name'=>'Perfil guardado','dimensionRule'=>'deduct_edge','decimal'=>',','header'=>true),0)
    profiles.activate(saved['profiles'][0]['id'],saved['revision'])
    @model.set_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY,'{"rows":[]}')
    before=@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
    listed=workshop.boards
    assert_equal 1,listed['boards'].length;board=listed['boards'][0]
    assert_equal ['Melamina Jade',19.05,3],[board['name'],board['thicknessMm'],board['rowIds'].length]
    assert_equal "#{listed['modelName']}-Melamina Jade-19,05mm.txt",board['fileName']
    assert_empty board['problems'];assert_nil board['blocker']
    prepared=workshop.board_export(board['key'],false);target=File.join(@dir,'una-placa')
    written=workshop.write_board(prepared,target);assert_equal "#{target}.txt",written['path'];refute written.key?('content')
    text=File.binread(written['path']).force_encoding('UTF-8');refute text.start_with?("cant\t");refute_includes text,','
    assert text.split("\r\n").all? { |line| line.split("\t").length==9 }
    # El A4 actual también ignora el perfil heredado: sus medidas de corte coinciden con este TXT.
    references=PlanosSanto::OrderReferences.partial(@model,workshop)
    assert_empty references['pending']
    cut_sizes=text.split("\r\n").map { |line| line.split("\t")[1,2].map(&:to_f) }.uniq
    assert_equal cut_sizes,references['references'].values.map { |reference| reference.values_at('base','height').map { |value| value.round(3) } }.uniq
    out,status=Open3.capture2e('python3',File.join(ROOT,'scripts/validar_txt_maderera.py'),written['path']);assert status.success?,out
    all=workshop.export_boards(false,@dir)
    assert_match(/-maderera-\d{8}-\d{4}\z/,all['directory']);assert_equal [board['fileName']],Dir.children(all['directory'])
    assert_equal File.binread(written['path']),File.binread(File.join(all['directory'],board['fileName']))
    again=workshop.export_boards(false,@dir);refute_equal all['directory'],again['directory']
    assert_equal before,@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY),'el borrador del pedido no se toca'
    assert_equal 'Perfil guardado',profiles.active['name'],'el perfil sigue guardado y activo'
  end

  # Lo elegido a mano en el pedido de una versión anterior (pieza excluida, giro) sigue guardado: la exclusión se
  # respeta como en la A4 y el giro lo decide la pantalla nueva. El borrador no se reescribe.
  def test_saved_draft_from_previous_versions_is_honored_but_never_written
    plan=workshop.plan['plan'];excluded=plan['rows'][0]
    excluded['include']=false;plan['rows'][1]['grainPolicy']='rotate';workshop.save_plan(plan)
    before=@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
    listed=workshop.boards
    assert_equal [{'id'=>excluded['id'],'detail'=>excluded['detail'],'reason'=>'excluded'}],listed['outside']
    assert_equal 2,listed['boards'][0]['rowIds'].length;assert listed['plan']['rows'].all? { |row| row['grainPolicy']=='locked' }
    lines=workshop.board_export(listed['boards'][0]['key'],true)['content'].split("\r\n".b)
    assert lines.all? { |line| line.split("\t".b)[4]=='0'.b },'placa con veta: rota 0 aunque se pida girar'
    assert_equal before,@model.get_attribute(PlanosSanto::Workshop::DICT,PlanosSanto::Workshop::KEY)
  end

  def test_file_part_drops_characters_windows_does_not_accept
    assert_equal 'Cocina Pérez 1 2',PlanosSanto::Workshop.file_part("Cocina: Pérez 1/2.")
  end
end
