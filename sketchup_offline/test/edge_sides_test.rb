# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../ocl_reader'
require_relative '../catalog_store'
require_relative '../supplier_order'
class EdgeSidesTest < Minitest::Test
 R=PlanosSanto::OclReader
 def material(id,type);{'id'=>id,'name'=>'Color/nombre sin significado','color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>type}};end
 def diagnostic
  vertices=[[0,0,0],[700,0,0],[700,450,0],[0,450,0],[0,0,18],[700,0,18],[700,450,18],[0,450,18]]
  faces=[[[0,3,2,1],[0,0,-1],'board'],[[4,5,6,7],[0,0,1],'board'],[[0,1,5,4],[0,-1,0],'board'],[[3,7,6,2],[0,1,0],'edge-a'],[[0,4,7,3],[-1,0,0],'edge-b'],[[1,2,6,5],[1,0,0],'board']].each_with_index.map do |(indices,normal,paint),i|
   area=normal[2]!=0 ? 700*450 : normal[0]!=0 ? 450*18 : 700*18
   {'id'=>"face-#{i}",'normal_local'=>normal,'vertices_mm'=>indices.map { |j| vertices[j] },'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],'area_mm2_local'=>area,'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint,'back_material_id'=>nil}
  end
  {'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOUBLE','exported_at'=>'2026-10-19T00:00:00Z','model_guid'=>'synthetic','issues'=>[],
   'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>[material('board',2),material('edge-a',4),material('edge-b',4)],'root_geometry'=>{'faces'=>[],'edges'=>[]},
   'definitions'=>[{'id'=>'def','name'=>'Componente#1','geometry'=>{'faces'=>faces,'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],[700,450,18]]}}],
   'instances'=>[{'path'=>%w[1 11],'definition_id'=>'def','name'=>'','material_id'=>nil,'effective_material_id'=>'board','visible'=>true,'world_transform'=>Geom::Transformation.new.to_a,'local_transform'=>Geom::Transformation.new.to_a,'axis_lengths_mm'=>[700,450,18],'orientation'=>{'mirrored'=>false,'sheared'=>false,'singular'=>false}}]}
 end
 def setup
  @input=diagnostic;@report=R.from_diagnostic(@input)
  @g={'bounds'=>{'min'=>[0,0,0],'max'=>[700,450,18]},'mirrored'=>false,'rectangular'=>true}
  @row={'id'=>'1/11','axes'=>[0,1],'frontSign'=>1,'flipX'=>false,'flipY'=>false,'principalId'=>'cat-a','secondaryId'=>'cat-b','edgeMap'=>[1,0,2,0],'edgeBindings'=>[{'observedId'=>'edge-a','catalogId'=>'cat-a'},{'observedId'=>'edge-b','catalogId'=>'cat-b'}]}
  @catalog={'items'=>[{'id'=>'cat-a','kind'=>'edge','approved'=>true},{'id'=>'cat-b','kind'=>'edge','approved'=>true}]}
 end
 def map(row=@row,g=@g,report=@report)
  R.projected_edges(report,row,g)['sides'].map { |side| side['status']=='unresolved' ? '?' : side['materialIds'].first || 'none' }
 end
 def test_perimeter_faces_are_mapped_by_local_planes_not_names_colors_or_sorted_size
  before=Marshal.dump(@report)
  assert_equal %w[edge-a none edge-b none],map
  assert R.verify_edge_mapping(@report,@row,@g,@catalog)
  assert_equal before,Marshal.dump(@report)
  sides=R.projected_edges(@report,@row,@g)['sides'];assert_equal %w[arr aba izq der],sides.map { |s| s['side'] }
  assert_equal ['face-3'],sides[0]['faceIds'];assert_equal 'painted_face',sides[0]['faceMaterials'][0]['front_origin']
 end
 def test_front_back_flip_and_mirror_have_explicit_side_correspondence
  assert_equal %w[edge-a none none edge-b],map(@row.merge('frontSign'=>-1))
  assert_equal %w[edge-a none none edge-b],map(@row.merge('flipX'=>true))
  assert_equal %w[none edge-a edge-b none],map(@row.merge('flipY'=>true))
  assert_equal %w[edge-a none none edge-b],map(@row,@g.merge('mirrored'=>true))
  assert_equal %w[none edge-b edge-a none],map(@row.merge('axes'=>[1,0]))
 end
 def test_rotations_and_nested_repeated_definitions_keep_physical_paths_and_face_ids
  [Math::PI/2,Math::PI].each do |angle|
   input=Marshal.load(Marshal.dump(@input));input['instances'][0]['world_transform']=Geom::Transformation.rotation_z(angle).to_a
   input['instances'] << input['instances'][0].merge('path'=>%w[2 35 11])
   report=R.from_diagnostic(input);assert_equal 2,report['pieces'].size
   assert_equal %w[edge-a none edge-b none],map(@row,@g,report)
   assert_equal %w[edge-a none edge-b none],map(@row.merge('id'=>'2/35/11'),@g,report)
  end
 end
 def test_multiple_coatings_in_one_side_and_incomplete_coverage_stay_unresolved
  @input['definitions'][0]['geometry']['faces'][3]['back_material_id']='edge-b'
  assert_equal '?',map(@row,@g,R.from_diagnostic(@input))[0]
  @input=diagnostic;@input['definitions'][0]['geometry']['faces'][3]['area_mm2_local']/=2
  assert_equal '?',map(@row,@g,R.from_diagnostic(@input))[0]
 end
 def test_unpainted_unknown_versions_irregular_geometry_and_partial_scan_are_not_guessed
  input=diagnostic;input['instances'][0]['effective_material_id']=nil;input['definitions'][0]['geometry']['faces'][3]['front_material_id']=nil
  assert_equal '?',map(@row,@g,R.from_diagnostic(input))[0]
  input=diagnostic;input['opencutlist']['version']='9.0'
  assert_equal ['?']*4,map(@row,@g,R.from_diagnostic(input))
  assert_equal ['?']*4,map(@row,@g.merge('rectangular'=>false))
  input=diagnostic;input['complete']=false;assert_equal ['?']*4,map(@row,@g,R.from_diagnostic(input))
 end
 def test_real_face_mapping_must_match_roles_bindings_and_user_orientation
  assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(@report,@row.merge('edgeMap'=>[0,0,0,0]),@g,@catalog)}
  assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(@report,@row.merge('edgeBindings'=>[]),@g,@catalog)}
  assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(@report,@row.merge('frontSign'=>-1),@g,@catalog)}
  assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(@report,@row.merge('principalId'=>'other'),@g,@catalog)}
  # «Aprobado» ya no existe como requisito: el vínculo tiene que apuntar a un canto real.
  @catalog['items'][0]['approved']=false;R.verify_edge_mapping(@report,@row,@g,@catalog)
  @catalog['items'][0]['kind']='sheet';assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(@report,@row,@g,@catalog)}
 end
 def test_absent_geometry_and_inherited_unknown_material_do_not_create_a_side
  @report['pieces'][0]['faces'].each { |face| face['vertices_mm']=nil };assert_equal ['?']*4,map
  assert_raises(PlanosSanto::ExportError){R.projected_edges(@report,@row.merge('axes'=>[0,0]),@g)}
 end
 def test_split_side_has_consistent_full_coverage_or_stays_unresolved
  face=@input['definitions'][0]['geometry']['faces'][3];second=Marshal.load(Marshal.dump(face));second['id']='face-split'
  face['vertices_mm']=face['vertices_mm'].map { |point| [point[0]/2.0,point[1],point[2]] };face['area_mm2_local']/=2
  second['vertices_mm']=second['vertices_mm'].map { |point| [350+point[0]/2.0,point[1],point[2]] };second['area_mm2_local']/=2
  @input['definitions'][0]['geometry']['faces'] << second
  assert_equal 'edge-a',map(@row,@g,R.from_diagnostic(@input))[0]
  second['front_material_id']='board';assert_equal '?',map(@row,@g,R.from_diagnostic(@input))[0]
 end
 def test_third_canto_cannot_be_silently_mapped_into_two_roles
  @input['materials'] << material('edge-c',4);@input['definitions'][0]['geometry']['faces'][5]['front_material_id']='edge-c'
  report=R.from_diagnostic(@input);@row['edgeBindings'] << {'observedId'=>'edge-c','catalogId'=>'cat-c'};@catalog['items'] << {'id'=>'cat-c','kind'=>'edge','approved'=>true}
  assert_raises(PlanosSanto::ExportError){R.verify_edge_mapping(report,@row,@g,@catalog)}
 end
 def test_edges_export_without_rereading_faces_and_manifest_records_their_source
  # 0.8.16: la lectura de caras propone el pedido; exportar no la repite ni pide origen observado/manual.
  # Que el modelo se haya repintado lo detecta Workshop#export_order al cruzar con la propuesta (workshop_coverage_test).
  @catalog['items'].each { |edge| edge.merge!('widthMm'=>22,'thicknessMm'=>0.8,'sku'=>edge['id']) }
  @catalog['revision']=1;@catalog['items'] << {'id'=>'sheet','kind'=>'sheet','sku'=>'MEL-18','thicknessMm'=>18,'widthMm'=>2000,'lengthMm'=>3000,'grain'=>false}
  node={'id'=>'1/11','name'=>'Pieza sintética','children'=>[],'mesh'=>{'vertices'=>[[0,0,0],[700,450,18]],'triangles'=>[]},'metadata'=>{'localBounds'=>@g['bounds'],'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>true}}
  service=PlanosSanto::SupplierOrder.new({'furniture'=>[node]},'synthetic',@catalog);draft=service.proposal
  draft['rows'][0].merge!(@row).merge!('materialId'=>'sheet','grainPolicy'=>'locked','dimensionRule'=>'finished_accepted')
  assert_equal %w[edge-a none edge-b none],map,'La lectura de caras sigue disponible para proponer'
  Dir.mktmpdir do |directory|
   result=service.export(draft,directory);manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
   assert_equal({'1/11'=>'manual'},manifest['lots'][0]['edgeSource']);refute manifest['production_ready']
   assert system('python3','planos-santo-loop-068/scripts/validar_txt_maderera.py',File.join(result['directory'],'lote-01.txt'),out:File::NULL)
   assert_equal %w[1 0 2 0],File.read(File.join(result['directory'],'lote-01.txt')).chomp.split("\t")[5,4]
  end
 end
end
