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
    # 15 mm sobre una ficha de 18 mm: la placa existe en la lista pero su TXT no sale.
    fifteen=result['boards'][0];assert_match(/El espesor no coincide: el eje de espesor mide 15 mm y la placa tiene 18 mm/,fifteen['problems'][0]['reasons'].join)
    error=assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,fifteen['key']) };assert_match(/\AMelamina Blanca 15 mm: .*El espesor no coincide/,error.message)
    # Un material con varios espesores estándar (`thicknessesMm`) acepta la pieza de 15 mm.
    catalog=Marshal.load(Marshal.dump(@catalog));catalog['items'][0]['thicknessesMm']=[15,18]
    draft=plan(catalog);board=@service.boards(draft)['boards'][0];assert_empty board['problems']
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

  def test_grain_board_never_rotates_and_three_edges_block_only_that_board
    piece('1/1',[700,450,18],name:'Tapa',base:'oak')
    piece('1/2',[700,450,18],{'+y'=>'edge-a'},name:'Lateral');piece('1/3',[600,450,18],{'+y'=>'edge-b'},name:'Puerta');piece('1/4',[500,450,18],{'+y'=>'edge-c'},name:'Cajón')
    draft=plan;oak,white=@service.boards(draft)['boards'].partition { |b| b['materialId']==@oak['id'] }.map(&:first)
    assert_equal %w[1 700 450 Tapa 0 0 0 0 0],lines(@service.board_txt(draft,oak['key'],rotate:true)).first
    assert_match(/lleva 3 cantos distintos \(ABS-A, PVC-B, ABS-C\)/,white['blocker'])
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,white['key']) }
    assert_raises(PlanosSanto::ExportError) { @service.board_txt(draft,'otra|180') }
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
