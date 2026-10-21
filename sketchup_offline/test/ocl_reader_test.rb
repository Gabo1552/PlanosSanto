# frozen_string_literal: true
require 'minitest/autorun'
require_relative '../../sketchup/test/fake_api'
require_relative '../ocl_reader'

class OclReaderTest < Minitest::Test
  R=PlanosSanto::OclReader
  def fixture
    { 'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOUBLE','exported_at'=>'2026-10-17T00:00:00Z','model_guid'=>'synthetic',
      'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'issues'=>[],
      'materials'=>[material('board',2),material('edge-a',4),material('edge-b',4),material('hardware',5),material('unused',2)],
      'root_geometry'=>{'faces'=>[],'edges'=>[]},
      'definitions'=>[{'id'=>'def','name'=>'Sin nombre','geometry'=>{'faces'=>[
        face('front',nil,nil),face('side-a','edge-a',nil),face('side-b','edge-b',nil)],'edges'=>[]}}],
      'instances'=>[{'path'=>%w[1 11],'definition_id'=>'def','name'=>'','material_id'=>nil,'effective_material_id'=>'board','visible'=>true,
        'world_transform'=>Geom::Transformation.rotation_z(0.8).to_a,'local_transform'=>Geom::Transformation.rotation_z(0.8).to_a,
        'axis_lengths_mm'=>[400,700,18],'orientation'=>{'mirrored'=>true,'sheared'=>false,'singular'=>false}}] }
  end
  def material(id,type)
    {'id'=>id,'name'=>'Mismo nombre','color_rgb'=>[1,2,3],'opencutlist_observed'=>{'type'=>type,'grained'=>true,'edge_decremented'=>true,'std_thicknesses'=>'18mm'}}
  end
  def face(id,front,back)
    {'id'=>id,'front_material_id'=>front,'back_material_id'=>back,'normal_local'=>[0,0,1],'area_mm2_local'=>100,'edge_ids'=>[],'visible'=>true}
  end
  def test_types_from_attributes_multiple_edge_materials_and_inherited_face_material
    input=fixture;before=Marshal.dump(input);result=R.from_diagnostic(input)
    assert_equal before,Marshal.dump(input)
    assert_equal %w[sheet edge edge hardware sheet],result['materials'].map { |m| m['category'] }
    piece=result['pieces'][0]
    assert_equal ['board'],piece['sheet_material_candidates'];assert_equal %w[edge-a edge-b],piece['edge_material_candidates']
    assert_equal 'board',piece['faces'][0]['front_material_id'];assert_equal 'inherited_instance',piece['faces'][0]['front_origin']
    assert_equal 'edge-a',piece['faces'][1]['front_material_id'];assert_equal 'board',piece['faces'][1]['back_material_id']
    assert piece['orientation']['mirrored'];assert_equal input['instances'][0]['world_transform'],piece['world_transform']
    assert_equal 'single_sheet_observed',piece['confidence'];refute piece['confirmed'];refute piece['capabilities']['supplier_export']
    refute result['materials'].last['applied'];refute result['production_ready']
    refute result['capabilities']['whole_material_library'] # replay lacks unused-library guarantee
  end
  def test_version_build_and_absent_ocl_block_interpretation_even_with_same_attributes
    [nil,'7.2.0'].each do |version|
      input=fixture;input['opencutlist']['version']=version;input['opencutlist']['namespace_present']=!version.nil?
      result=R.from_diagnostic(input)
      assert result['materials'].all? { |m| m['category']=='unknown' }
      refute result['capabilities']['material_types'];assert_equal 'unresolved',result['confidence']
      refute result['warnings'].empty?;assert_empty result['pieces'][0]['edge_material_candidates']
    end
    input=fixture;input['opencutlist']['build']='future';refute R.from_diagnostic(input)['capabilities']['material_types']
  end
  def test_missing_attributes_are_not_inferred_from_names_colors_or_unpainted_faces
    input=fixture;input['materials'][0]['opencutlist_observed']={};input['instances'][0]['effective_material_id']=nil
    result=R.from_diagnostic(input);piece=result['pieces'][0]
    assert_empty piece['sheet_material_candidates'];assert_equal 'unknown',result['materials'][0]['category']
    assert_nil piece['faces'][0]['front_material_id'];assert_equal 'unpainted',piece['faces'][0]['front_origin']
    assert piece['warnings'].any? { |w| w.include?('sin material') }
    refute piece['capabilities']['orientation_2d_confirmed'];refute piece['capabilities']['cut_dimensions_confirmed']
  end
  def test_multiple_sheet_candidates_shear_and_partial_scan_stay_unresolved
    input=fixture;input['definitions'][0]['geometry']['faces'][0]['front_material_id']='unused'
    input['instances'][0]['orientation']['sheared']=true;input['complete']=false
    result=R.from_diagnostic(input);piece=result['pieces'][0]
    assert_equal 'unresolved',piece['confidence'];assert_equal 'unresolved',result['confidence']
    assert piece['warnings'].any? { |w| w.include?('más de un material') }
    assert piece['warnings'].any? { |w| w.include?('sesgada') };refute result['complete']
  end
  def test_material_used_on_loose_root_face_is_not_mislabeled_unused
    input=fixture;input['root_geometry']['faces']=[face('loose','unused',nil)]
    material=R.from_diagnostic(input)['materials'].last
    assert material['applied'];assert_equal 0,material['physical_uses']
  end
  def test_every_physical_occurrence_has_its_own_record_and_usage_count
    input=fixture;input['instances'] << input['instances'][0].merge('path'=>%w[2 11])
    result=R.from_diagnostic(input)
    assert_equal [%w[1 11],%w[2 11]],result['pieces'].map { |p| p['path'] }
    assert_equal 2,result['materials'][0]['physical_uses']
  end
  def test_wrong_type_values_and_unknown_schema_are_rejected_conservatively
    ['2',true,2.0,99,nil].each do |value|
      input=fixture;input['materials'][0]['opencutlist_observed']['type']=value
      assert_equal 'unknown',R.from_diagnostic(input)['materials'][0]['category']
    end
    assert_raises(ArgumentError) { R.from_diagnostic({}) }
  end
end
