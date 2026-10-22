# frozen_string_literal: true
# Vista «Piezas» (Cutlist) con dobles sintéticos: diagnóstico P1 armado a mano, fake_api de SketchUp y
# biblioteca en un directorio temporal. No abre SketchUp ni OpenCutList; es la misma armadura que
# order_proposal_test.rb, con varias instancias de una misma definición.
require 'minitest/autorun'
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../cutlist'

class CutlistTest < Minitest::Test
  R=PlanosSanto::OclReader
  FACES={'-x'=>[0,0],'+x'=>[0,1],'-y'=>[1,0],'+y'=>[1,1],'-z'=>[2,0],'+z'=>[2,1]}.freeze

  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir)
    sheet=@store.new_item('Melamina Blanca 18','sheet');sheet.merge!('sku'=>'MEL-18','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true)
    oak=@store.new_item('Roble 18','sheet');oak.merge!('sku'=>'ROB-18','supplier'=>'Maderera de prueba','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true,'approved'=>true)
    edges=%w[ABS-A PVC-B].map do |sku|
      edge=@store.new_item("Canto #{sku}",'edge');edge.merge!('sku'=>sku,'supplier'=>'Maderera de prueba','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true);edge
    end
    [sheet,oak].each { |item| item['compatibleIds']=edges.map { |e| e['id'] } }
    @catalog=@store.save([sheet,oak,*edges],0);@sheet,@oak,@a,@b=@catalog['items']
    @pieces=[];@workshop=PlanosSanto::Workshop.new(nil,nil,directory:@dir)
  end
  def teardown;FileUtils.remove_entry(@dir);end

  def native(id,item,color=[1,1,1]);{'id'=>id,'name'=>"Material #{id}",'color_rgb'=>color,'opencutlist_observed'=>{'type'=>item['kind']=='sheet' ? 2 : 4},'planos_santo_observed'=>{'status'=>'valid','binding'=>PlanosSanto::MaterialResolver.binding_for(item)}};end
  def materials
    [native('board',@sheet,[230,226,214]),native('oak',@oak),native('edge-a',@a,[40,60,180]),{'id'=>'edge-b','name'=>'Canto sin vínculo','color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>4}},
     {'id'=>'paint','name'=>'Pintura genérica','color_rgb'=>[9,9,9],'opencutlist_observed'=>{}}]
  end
  # Caja de dims mm en ejes locales. base: material de las caras sin pintura propia (nil = sin material).
  def piece(id,dims,paint={},name:"Pieza #{id}",definition:nil,base:'board')
    faces=FACES.map do |face,(axis,high)|
      others=[0,1,2]-[axis];plane=high==1 ? dims[axis] : 0
      corners=[[0,0],[1,0],[1,1],[0,1]].map { |a,b| point=[0,0,0];point[axis]=plane;point[others[0]]=a*dims[others[0]];point[others[1]]=b*dims[others[1]];point }
      {'id'=>"#{id}-#{face}",'normal_local'=>Array.new(3) { |i| i==axis ? (high==1 ? 1 : -1) : 0 },'vertices_mm'=>corners,'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],
       'area_mm2_local'=>dims[others[0]]*dims[others[1]],'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint.fetch(face,base),'back_material_id'=>nil}
    end
    @pieces << {'id'=>id,'dims'=>dims,'faces'=>faces,'name'=>name,'definition'=>definition || "def-#{id}",'base'=>base}
  end
  def report
    definitions=@pieces.group_by { |p| p['definition'] }.map { |id,list| {'id'=>id,'name'=>id,'geometry'=>{'faces'=>list[0]['faces'],'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],list[0]['dims']]}} }
    diagnostic={'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOBLE','exported_at'=>'2026-10-22T00:00:00Z','model_guid'=>'sintetico','issues'=>[],
      'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>materials,'root_geometry'=>{'faces'=>[],'edges'=>[]},'definitions'=>definitions,
      'instances'=>@pieces.map { |p| {'path'=>p['id'].split('/'),'definition_id'=>p['definition'],'name'=>'','material_id'=>nil,'effective_material_id'=>p['base'],'visible'=>true,'world_transform'=>Geom::Transformation.new.to_a,'local_transform'=>Geom::Transformation.new.to_a,'axis_lengths_mm'=>p['dims'],'orientation'=>{'mirrored'=>false,'sheared'=>false,'singular'=>false}} }}
    R.from_diagnostic(diagnostic)
  end
  def node(p);{'id'=>p['id'],'name'=>p['name'],'children'=>[],'mesh'=>{'vertices'=>[[0,0,0],p['dims']],'triangles'=>[]},'metadata'=>{'localBounds'=>{'min'=>[0,0,0],'max'=>p['dims']},'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>true}};end
  def document
    roots=@pieces.group_by { |p| p['id'].split('/').first }
    {'furniture'=>roots.map { |root,list| {'id'=>root,'name'=>"Mueble #{root}",'children'=>list.map { |p| node(p) }} }}
  end
  def build(guide: {},stored: nil)
    rep=report;catalog=@catalog
    service=PlanosSanto::SupplierOrder.new(document,'huella',catalog,material_proposal:->(id) { @workshop.native_proposal(rep,id,catalog) })
    PlanosSanto::Cutlist.build(document,service,rep,catalog,guide:guide,stored:stored)
  end
  def find(result,name);result['pieces'].find { |p| p['name']==name };end
  def side(piece,name);piece['edges'].find { |e| e['side']==name };end

  def test_groups_by_material_and_thickness_with_identical_quantities
    piece('1/1',[700,450,18],{'+y'=>'edge-a'},name:'Lateral',definition:'lateral')
    piece('1/2',[700,450,18],{'+y'=>'edge-a'},name:'Lateral',definition:'lateral')
    piece('1/3',[600,300,18],{'-x'=>'edge-b'},name:'Estante')
    piece('1/4',[400,300,15],name:'Fondo')  # misma placa pintada, otro espesor medido
    piece('1/5',[500,200,18],name:'Tapa roble',base:'oak')
    piece('2/1',[700,450,18],{'+y'=>'edge-a'},name:'Lateral',definition:'lateral')  # otro mueble: otra fila
    guide={'furniture'=>[{'id'=>'1','naming'=>{'moduleCode'=>'M01'},'pieces'=>[{'id'=>'1/1','code'=>'P01','name'=>'Lateral'},{'id'=>'1/2','code'=>'P02','name'=>'Lateral'},{'id'=>'1/3','code'=>'P03','name'=>'Estante'},{'id'=>'1/4','code'=>'P04','name'=>'Fondo'},{'id'=>'1/5','code'=>'P05','name'=>'Tapa roble'}]}]}
    result=build(guide:guide)
    assert result['readOnly'];assert_equal [{'id'=>'1','name'=>'Mueble 1'},{'id'=>'2','name'=>'Mueble 2'}],result['furniture']
    keys=result['sections'].map { |s| [s['name'],s['thicknessMm']] }
    assert_equal [['Melamina Blanca 18',15.0],['Melamina Blanca 18',18.0],['Roble 18',18.0]],keys,'Una sección por ficha y espesor medido'
    white=result['sections'].find { |s| s['thicknessMm']==18.0 && s['name']=='Melamina Blanca 18' }
    assert_equal({'source'=>'catalog','sku'=>'MEL-18','format'=>[2750,1830],'grain'=>false,'catalogThicknessMm'=>18},white.slice('source','sku','format','grain','catalogThicknessMm'))
    laterals=result['pieces'].select { |p| p['name']=='Lateral' }
    assert_equal 2,laterals.size,'Las idénticas se agrupan dentro de cada mueble'
    first=laterals.find { |p| p['furnitureId']=='1' }
    assert_equal 2,first['quantity'];assert_equal %w[1/1 1/2],first['ids'];assert_equal 'M01·P01',first['code'];assert_equal ['M01·P01','M01·P02'],first['codes']
    assert_equal [700.0,450.0,18.0],first.values_at('lengthMm','widthMm','thicknessMm')
    assert_equal white['key'],first['sectionKey']
    other=laterals.find { |p| p['furnitureId']=='2' };assert_equal 1,other['quantity'];assert_equal '',other['code'],'Sin módulo no se inventa un código'
    assert_equal 'none',first['grain'],'La ficha define placa sin veta'
    assert_equal 'length',find(result,'Tapa roble')['grain'],'Placa con veta: a lo largo por defecto'
    refute result['pieces'].any? { |p| p.key?('definitionId') }
  end

  def test_edges_by_side_with_catalog_observed_and_none
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-x'=>'edge-b'},name:'Lateral')
    result=build;lateral=find(result,'Lateral')
    assert_equal %w[arr aba izq der],lateral['edges'].map { |e| e['side'] }
    assert_equal({'side'=>'arr','status'=>'catalog','catalogId'=>@a['id'],'sku'=>'ABS-A','name'=>'Canto ABS-A','lengthMm'=>700.0,'edgeKey'=>"catalog:#{@a['id']}"},side(lateral,'arr'))
    assert_equal({'side'=>'aba','status'=>'none','lengthMm'=>700.0},side(lateral,'aba'))
    assert_equal({'side'=>'izq','status'=>'observed','observedIds'=>['edge-b'],'name'=>'Canto sin vínculo','lengthMm'=>450.0,'edgeKey'=>'model:edge-b'},side(lateral,'izq'),'Canto pintado sin ficha: se muestra con su nombre')
    assert_equal 'none',side(lateral,'der')['status']
    # Con el vínculo del borrador del pedido, el canto observado resuelve a su ficha.
    stored={'fingerprint'=>'huella','catalogRevision'=>@catalog['revision'],'rows'=>[],'edgeLinks'=>[{'observedId'=>'edge-b','catalogId'=>@b['id'],'name'=>'Canto sin vínculo'}]}
    linked=find(build(stored:stored),'Lateral')
    assert_equal ['catalog','PVC-B'],side(linked,'izq').values_at('status','sku')
    # Un borrador viejo (otra huella) se ignora.
    assert_equal 'observed',side(find(build(stored:stored.merge('fingerprint'=>'otra')),'Lateral'),'izq')['status']
  end

  def test_piece_without_material_goes_to_sin_material
    piece('1/1',[700,450,18],name:'Lateral')
    piece('1/2',[500,400,18],name:'Sin pintar',base:nil)
    piece('1/3',[500,400,18],name:'Pintada genérica',base:'paint')
    result=build
    bare=find(result,'Sin pintar')
    assert_nil bare['material'];assert_equal 'none|18.0',bare['sectionKey']
    assert_equal %w[unknown unknown unknown unknown],bare['edges'].map { |e| e['status'] },'Sin material no hay canto que leer'
    assert_includes bare['notes'].join(' '),'Sin placa pintada'
    generic=find(result,'Pintada genérica')
    assert_equal({'source'=>'model','observedId'=>'paint','name'=>'Pintura genérica','category'=>'unknown','linked'=>false},generic['material'])
    assert_equal ['catalog','model','none'],result['sections'].map { |s| s['source'] },'Fichas primero, «Sin material» al final'
    assert_equal 'Sin material',result['sections'].last['name']
  end

  def test_grain_follows_saved_order_axis
    piece('1/1',[700,450,18],name:'Puerta',base:'oak')
    row={'id'=>'1/1','materialId'=>@oak['id'],'axes'=>[0,1],'grainAxis'=>'v'}
    stored={'fingerprint'=>'huella','catalogRevision'=>@catalog['revision'],'rows'=>[row],'edgeLinks'=>[]}
    assert_equal 'width',find(build(stored:stored),'Puerta')['grain']
    assert_equal 'length',find(build(stored:stored.merge('rows'=>[row.merge('grainAxis'=>'u')])),'Puerta')['grain']
  end

  # Listado de partes 0.8.18: tiras de canto por pieza y una sección por canto con sus totales.
  def test_strips_per_piece_and_edge_sections_with_totals
    piece('1/1',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a','-x'=>'edge-b'},name:'Lateral',definition:'lateral')
    piece('1/2',[700,450,18],{'+y'=>'edge-a','-y'=>'edge-a','-x'=>'edge-b'},name:'Lateral',definition:'lateral')
    piece('1/3',[600,300,18],{'+y'=>'edge-a'},name:'Estante')
    result=build;lateral=find(result,'Lateral')
    assert_equal 2,lateral['quantity']
    assert_equal [['arr','Longitud del borde 1',700.0,22,false],['aba','Longitud del borde 2',700.0,22,false],['izq','Ancho del borde 1',450.0,18.0,true]],
                 lateral['strips'].map { |s| s.values_at('side','label','lengthMm','widthMm','widthApprox') },'Una tira por lado con canto; sin ficha, el ancho es el espesor de la pieza'
    assert_equal ["catalog:#{@a['id']}","catalog:#{@a['id']}",'model:edge-b'],lateral['strips'].map { |s| s['edgeKey'] }
    refute lateral['strips'].any? { |s| s['approximate'] },'Pieza rectangular: medidas exactas'
    edges=result['edgeSections']
    assert_equal ["catalog:#{@a['id']}",'model:edge-b'],edges.map { |e| e['key'] },'Fichas primero, después lo pintado sin ficha'
    abs=edges[0]
    assert_equal({'source'=>'catalog','kind'=>'edge','name'=>'Canto ABS-A','sku'=>'ABS-A','catalogId'=>@a['id'],'thicknessMm'=>0.45,'widthMm'=>22,'colorRgb'=>[40,60,180],'missing'=>[],'widthApprox'=>false},
                 abs.slice('source','kind','name','sku','catalogId','thicknessMm','widthMm','colorRgb','missing','widthApprox'))
    # 4 tiras de 700 (2 lados × 2 laterales) + 1 de 600 = 3,4 m; × 22 mm = 0,0748 m²; × 0,45 mm.
    assert_equal({'strips'=>5,'lengthM'=>3.4,'areaM2'=>0.075,'volumeM3'=>0.00003},abs['totals'])
    painted=edges[1]
    assert_equal ['model',['ficha'],true,nil],painted.values_at('source','missing','widthApprox','thicknessMm')
    # 2 × 450 mm con el espesor de la pieza (18 mm) como ancho aproximado; sin espesor de ficha no hay m³.
    assert_equal({'strips'=>2,'lengthM'=>0.9,'areaM2'=>0.016,'volumeM3'=>nil},painted['totals'])
  end

  def test_sections_carry_kind_color_missing_and_totals
    piece('1/1',[700,450,18],name:'Lateral',definition:'lateral')
    piece('1/2',[700,450,18],name:'Lateral',definition:'lateral')
    piece('1/3',[500,400,18],name:'Pintada genérica',base:'paint')
    piece('1/4',[500,400,18],name:'Sin pintar',base:nil)
    result=build
    white,generic,none=result['sections']
    assert_equal ['sheet',[230,226,214],[]],white.values_at('kind','colorRgb','missing'),'Placa con ficha completa: color del material vinculado'
    # 2 × 700 × 450 × 18 mm
    assert_equal({'pieces'=>2,'lengthM'=>1.4,'areaM2'=>0.63,'volumeM3'=>0.0113},white['totals'])
    assert_equal ['unknown',[9,9,9],['ficha']],generic.values_at('kind','colorRgb','missing'),'Material del modelo sin tipo: «?» y sin ficha'
    assert_equal ['unknown',nil,[]],none.values_at('kind','colorRgb','missing')
    assert_equal({'pieces'=>1,'lengthM'=>0.5,'areaM2'=>0.2,'volumeM3'=>0.0036},none['totals'])
    assert_equal [],result['edgeSections']
    assert_equal '',result['modelName'];assert_equal 'mm',result['unit']
  end

  def test_missing_catalog_data_reaches_sections_and_edges
    narrow=@store.new_item('Canto sin ancho','edge');narrow.merge!('sku'=>'SIN-ANCHO','thicknessMm'=>1)
    sheet=@catalog['items'][0].merge('grain'=>nil)
    @catalog=@store.save([sheet,*@catalog['items'][1..],narrow],@catalog['revision']);@sheet=@catalog['items'][0];narrow=@catalog['items'].last
    extra=native('edge-n',narrow)
    define_singleton_method(:materials) { super()+[extra] }
    piece('1/1',[700,450,18],{'+y'=>'edge-n'},name:'Lateral')
    result=build
    assert_equal ['veta'],result['sections'][0]['missing'],'La placa sin veta definida avisa'
    lateral=find(result,'Lateral')
    assert_equal ['catalog','SIN-ANCHO'],side(lateral,'arr').values_at('status','sku')
    edge=result['edgeSections'].find { |e| e['catalogId']==narrow['id'] }
    assert_equal [['ancho'],nil,1,true],edge.values_at('missing','widthMm','thicknessMm','widthApprox'),'Canto sin ancho en la ficha: «Ancho no definido»'
    assert_equal [18.0,true],lateral['strips'][0].values_at('widthMm','widthApprox')
    # 0,7 m × 18 mm (espesor de la pieza) × 1 mm
    assert_equal({'strips'=>1,'lengthM'=>0.7,'areaM2'=>0.013,'volumeM3'=>0.00001},edge['totals'])
  end

  def test_write_csv_with_bom_and_safe_name
    target=File.join(@dir,'piezas')
    result=PlanosSanto::Cutlist.write_csv("Tipo;Pieza\r\nPlaca;Lateral – ñ\r\n",target)
    assert_equal File.join(@dir,'piezas.csv'),result['path']
    bytes=File.binread(result['path'])
    assert bytes.start_with?("\xEF\xBB\xBF".b),'BOM UTF-8 para Excel'
    assert_equal "Tipo;Pieza\r\nPlaca;Lateral – ñ\r\n",bytes.byteslice(3..).force_encoding('UTF-8')
    assert_equal bytes.bytesize,result['bytes']
    # Un BOM que ya venga en el texto no se duplica.
    again=PlanosSanto::Cutlist.write_csv("﻿a;b\r\n",File.join(@dir,'otro.CSV'))
    assert_equal "\xEF\xBB\xBFa;b\r\n".b,File.binread(again['path'])
    ['',"\xFF\xFE".b,"a\0b",nil,'x'*(PlanosSanto::Cutlist::CSV_MAX_BYTES+1)].each do |bad|
      assert_raises(PlanosSanto::ExportError) { PlanosSanto::Cutlist.write_csv(bad,File.join(@dir,'malo.csv')) }
    end
    refute File.exist?(File.join(@dir,'malo.csv'))
    assert_equal 'Piezas-Cocina Ana.csv',PlanosSanto::Cutlist.csv_file_name('Cocina: Ana?')
    assert_equal 'Piezas.csv',PlanosSanto::Cutlist.csv_file_name(' / ')
    assert_equal 'Piezas.csv',PlanosSanto::Cutlist.csv_file_name(nil)
  end

  def test_read_only_entry_point_requires_generated_guides
    model=Sketchup::Model.new([],'x','Vacío','')
    error=assert_raises(PlanosSanto::ExportError) { PlanosSanto::Cutlist.for_model(model,nil,directory:@dir) }
    assert_match(/generá las guías/,error.message)
  end
end
