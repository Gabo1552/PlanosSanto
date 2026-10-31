# frozen_string_literal: true
# Veta (0.8.26): el mismo eje de veta llega a Piezas, al pedido, al TXT de la maderera y a la optimización.
# Dobles sintéticos como cutlist_test.rb y maderera_placas_test.rb (diagnóstico P1 armado a mano y fake_api).
# Largo = medida a lo largo de la veta. No abre SketchUp ni OpenCutList.
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../cutlist'

class GrainOrderTest < Minitest::Test
  R=PlanosSanto::OclReader
  S=PlanosSanto::SupplierOrder
  P=PlanosSanto::OrderProposal
  FACES={'-x'=>[0,0],'+x'=>[0,1],'-y'=>[1,0],'+y'=>[1,1],'-z'=>[2,0],'+z'=>[2,1]}.freeze
  ROOT=File.expand_path('../..',__dir__)

  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    oak=@store.new_item('Roble','sheet');oak.merge!('sku'=>'ROB-SINT','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true)
    white=@store.new_item('Blanco','sheet');white.merge!('sku'=>'BL-SINT','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false)
    edge=@store.new_item('Canto roble','edge');edge.merge!('sku'=>'CR-22','supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22)
    @catalog=@store.save([oak,white,edge],0);@oak,@white,@edge=@catalog['items']
    @pieces=[];@workshop=PlanosSanto::Workshop.new(nil,nil,directory:@dir)
  end
  def teardown;FileUtils.remove_entry(@dir) if @dir && File.directory?(@dir);end
  def native(id,item);{'id'=>id,'name'=>"Material #{id}",'color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>item['kind']=='sheet' ? 2 : 4},'planos_santo_observed'=>{'status'=>'valid','binding'=>PlanosSanto::MaterialResolver.binding_for(item)}};end
  def materials;[native('oak',@oak),native('white',@white),native('edge',@edge)];end
  # grain: lo que el escaneo (Exporter + Grain) deja en la metadata; nil = documento anterior a 0.8.26.
  def piece(id,dims,paint={},name:'Puerta',base:'oak',grain:nil,rectangular:true)
    faces=FACES.map do |face,(axis,high)|
      others=[0,1,2]-[axis];plane=high==1 ? dims[axis] : 0
      corners=[[0,0],[1,0],[1,1],[0,1]].map { |a,b| point=[0,0,0];point[axis]=plane;point[others[0]]=a*dims[others[0]];point[others[1]]=b*dims[others[1]];point }
      {'id'=>"#{id}-#{face}",'normal_local'=>Array.new(3) { |i| i==axis ? (high==1 ? 1 : -1) : 0 },'vertices_mm'=>corners,'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],
       'area_mm2_local'=>dims[others[0]]*dims[others[1]],'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint.fetch(face,base),'back_material_id'=>nil}
    end
    @pieces << {'id'=>id,'dims'=>dims,'faces'=>faces,'name'=>name,'base'=>base,'grain'=>grain,'rectangular'=>rectangular}
  end
  def report
    diagnostic={'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOBLE','exported_at'=>'2026-10-31T00:00:00Z','model_guid'=>'sintetico','issues'=>[],
      'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>materials,'root_geometry'=>{'faces'=>[],'edges'=>[]},
      'definitions'=>@pieces.map { |p| {'id'=>"def-#{p['id']}",'name'=>p['id'],'geometry'=>{'faces'=>p['faces'],'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],p['dims']]}} },
      'instances'=>@pieces.map { |p| {'path'=>p['id'].split('/'),'definition_id'=>"def-#{p['id']}",'name'=>'','material_id'=>nil,'effective_material_id'=>p['base'],'visible'=>true,'world_transform'=>Geom::Transformation.new.to_a,'local_transform'=>Geom::Transformation.new.to_a,'axis_lengths_mm'=>p['dims'],'orientation'=>{'mirrored'=>false,'sheared'=>false,'singular'=>false}} }}
    R.from_diagnostic(diagnostic)
  end
  def node(p)
    meta={'localBounds'=>{'min'=>[0,0,0],'max'=>p['dims']},'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>p['rectangular']}.merge(p['grain'] || {})
    {'id'=>p['id'],'name'=>p['name'],'children'=>[],'mesh'=>{'vertices'=>[[0,0,0],p['dims']],'triangles'=>[]},'metadata'=>meta}
  end
  def document
    {'furniture'=>@pieces.group_by { |p| p['id'].split('/').first }.map { |root,list| {'id'=>root,'name'=>"Mueble #{root}",'children'=>list.map { |p| node(p) }} }}
  end
  def service
    rep=report;catalog=@catalog
    @report=rep;@service=S.new(document,'huella',catalog,material_proposal:->(id) { @workshop.native_proposal(rep,id,catalog) })
  end
  def plan;svc=service;P.new(svc,@report,@catalog).propose(svc.proposal)['plan'].merge('profile'=>S::TXT_PROFILE.dup,'detailCode'=>'none');end
  def cutlist(stored: nil,check: nil);svc=service;PlanosSanto::Cutlist.build(document,svc,@report,@catalog,stored:stored,grain_check:check);end
  def row(draft,id);draft['rows'].find { |r| r['id']==id };end
  def txt(draft)
    board=@service.boards(draft)['boards'].first
    prepared=@service.board_txt(draft,board['key'],listed:[board])
    path=File.join(@dir,"veta-#{rand(1_000_000)}.txt");File.binwrite(path,prepared['content'])
    %w[scripts/validar_txt_maderera.py scripts/validar_pedido_txt.py].each do |script|
      out,status=Open3.capture2e('python3',File.join(ROOT,script),path);assert status.success?,"#{script}: #{out}"
    end
    prepared['content'].dup.force_encoding('UTF-8').split("\r\n").map { |line| line.split("\t") }
  end
  AUTO={'grainAxis'=>2,'grainSource'=>'auto','grainReview'=>nil,'grainDirection'=>'vertical'}.freeze
  MANUAL={'grainAxis'=>0,'grainSource'=>'manual','grainReview'=>nil,'grainDirection'=>'horizontal'}.freeze

  # Puerta de 2000 × 600 (local: 600 en X, 18 en Y, 2000 en Z), en roble con veta.
  def test_vertical_grain_2000x600_same_in_pieces_txt_and_optimizer_input
    piece('1/1',[600,18,2000],{'+x'=>'edge'},grain:AUTO)
    door=cutlist['pieces'].first
    assert_equal [2000.0,600.0,'length',2,'auto','vertical',nil],door.values_at('lengthMm','widthMm','grain','grainAxis','grainSource','grainDirection','grainReview')
    draft=plan;r=row(draft,'1/1')
    assert_equal [2,0],r['axes'],'La base del pedido es el eje de la veta';assert_equal 'locked',r['grainPolicy']
    assert_equal [2000,600],@service.dimensions(r),'La optimización usa las mismas medidas (rowDimensions): base a lo largo de la placa'
    assert_equal 2,@service.proposal['geometry']['1/1']['grainAxis'],'La geometría del pedido lleva el eje para la UI'
    assert_equal [['1','2000','600','Puerta','0','1','0','0','0']],txt(draft),'El canto de +X corre a lo largo de la veta: arriba'
  end
  def test_rotated_grain_swaps_largo_and_ancho_everywhere
    piece('1/1',[600,18,2000],{'+x'=>'edge'},grain:MANUAL)
    door=cutlist['pieces'].first
    assert_equal [600.0,2000.0,'length',0,'manual','horizontal'],door.values_at('lengthMm','widthMm','grain','grainAxis','grainSource','grainDirection'),'Largo = medida a lo largo de la veta'
    assert_equal ['Ancho del borde 2',2000.0],door['strips'].first.values_at('label','lengthMm'),'El canto de +X ahora queda a lo ancho'
    draft=plan;r=row(draft,'1/1');assert_equal [0,2],r['axes'];assert_equal [600,2000],@service.dimensions(r)
    # Con la veta a lo ancho, 2000 mm cruzan una placa de 1830 de ancho: no entra y el TXT no sale.
    error=assert_raises(PlanosSanto::ExportError) { txt(draft) }
    assert_match(/no entra en la placa: mide 600 × 2.000 mm/,error.message)
    # Una puerta de 1500 sí entra: base 600 a lo largo de la placa, rota 0 y el canto en su cara física (derecha).
    @pieces.clear;piece('1/1',[600,18,1500],{'+x'=>'edge'},grain:MANUAL)
    assert_equal [600.0,1500.0],cutlist['pieces'].first.values_at('lengthMm','widthMm')
    assert_equal [['1','600','1500','Puerta','0','0','0','0','1']],txt(plan),'Con veta no rota (rota 0)'
  end
  def test_document_without_grain_metadata_uses_the_same_criterion
    piece('1/1',[600,18,2000])
    assert_equal [2000.0,2,'auto'],cutlist['pieces'].first.values_at('lengthMm','grainAxis','grainSource')
    piece('1/2',[800,560,18],name:'Estante')
    assert_equal [800.0,0,'horizontal'],cutlist['pieces'].find { |p| p['name']=='Estante' }.values_at('lengthMm','grainAxis','grainDirection')
  end
  def test_board_without_grain_keeps_the_longest_side_and_has_no_grain_controls
    piece('1/1',[600,18,2000],base:'white',grain:MANUAL)
    door=cutlist(check:->(_ids) { flunk 'sin veta no se revisa' })['pieces'].first
    assert_equal ['none',nil,nil,2000.0],door.values_at('grain','grainAxis','grainBlock','lengthMm'),'Placa sin veta: no hay botón ni eje'
    assert_equal [2,0],row(plan,'1/1')['axes']
  end
  def test_review_note_and_row_blockers_reach_pieces
    piece('1/1',[600,18,150],name:'Frente de cajón',grain:AUTO.merge('grainReview'=>PlanosSanto::Grain::WIDE))
    piece('1/2',[600,18,2000],name:'Curva',grain:AUTO,rectangular:false)
    result=cutlist(check:->(ids) { ids==['1/1'] ? 'La pieza o un contenedor está bloqueado.' : nil })
    drawer=result['pieces'].find { |p| p['name']=='Frente de cajón' }
    assert_equal [150.0,600.0,PlanosSanto::Grain::WIDE],drawer.values_at('lengthMm','widthMm','grainReview')
    assert drawer['notes'].any? { |n| n.start_with?('Veta: Pieza vertical más ancha') },'El aviso también va a las notas del pedido'
    assert_equal 'La pieza o un contenedor está bloqueado.',drawer['grainBlock']
    assert_equal 'Pieza no rectangular: la veta no se puede orientar.',result['pieces'].find { |p| p['name']=='Curva' }['grainBlock']
  end
  def test_order_blocks_a_base_that_does_not_follow_the_grain
    piece('1/1',[600,18,2000],grain:AUTO)
    draft=plan;row(draft,'1/1')['axes']=[0,2]
    reasons=@service.validate(draft,collect_errors:true).first['reasons']
    assert_includes reasons.join(' '),'La base de la pieza no sigue su veta'
  end
  # Pedido guardado antes de 0.8.16 (tildes, «grainAxis» u/v) y con la base por el lado más largo.
  def test_old_saved_order_with_u_v_grain_axis_keeps_working
    piece('1/1',[600,18,1500],{'+x'=>'edge'},grain:MANUAL)
    old={'id'=>'1/1','include'=>true,'excludeReason'=>'','detail'=>'Puerta vieja','axes'=>[2,0],'flipX'=>false,'flipY'=>false,'frontSign'=>-1,'materialId'=>@oak['id'],
         'principalId'=>@edge['id'],'secondaryId'=>nil,'edgeMap'=>[1,0,0,0],'grainPolicy'=>'locked','dimensionRule'=>'explicit_cut','cutBase'=>1495,'cutHeight'=>595,'edgeBindings'=>[],
         'grainAxis'=>'v','grainConfirmed'=>true,'orientationConfirmed'=>true,'reviewNote'=>'','edgeResolution'=>nil}
    stored={'schema'=>1,'fingerprint'=>'huella','catalogRevision'=>@catalog['revision'],'maderera'=>nil,'profile'=>S::TXT_PROFILE.dup,'rows'=>[old]}
    merged=P.merge(stored,plan);result=merged['plan'];r=row(result,'1/1')
    assert_equal 1,merged['merge']['regrained'];refute r.key?('grainAxis'),'El u/v viejo no se lee ni se guarda'
    assert_equal [0,2],r['axes'],'La orientación vieja contradecía la veta: sigue al modelo'
    assert_equal 'Puerta vieja',r['detail'];assert_equal [595,1495],[r['cutBase'],r['cutHeight']],'El corte cargado a mano se pasa a la vista nueva'
    old_faces=P.side_faces(old,false);new_faces=P.side_faces(r,false)
    assert_equal old_faces[old['edgeMap'].index(1)],new_faces[r['edgeMap'].index(1)],'El canto sigue en la misma cara física'
    assert_empty @service.validate(result,collect_errors:true)
    assert_equal [['1','595','1495','Puerta vieja','0','0','0','0','1']],txt(result),'El TXT sale con el corte cargado a mano, a lo largo de la veta'
    # Piezas con ese mismo borrador guardado: la veta sale de la pieza, no del u/v viejo.
    assert_equal [600.0,'length'],cutlist(stored:stored)['pieces'].first.values_at('lengthMm','grain')
  end
end
