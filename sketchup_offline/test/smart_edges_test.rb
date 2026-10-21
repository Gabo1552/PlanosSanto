# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
class CardinalMaterialDouble < Sketchup::Material
  attr_accessor :binding
  def get_attribute(dict,key,_default=nil)
    dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY ? binding : nil
  end
end
class CardinalModelDouble < NamingModelDouble
  attr_accessor :materials
  def state
    super.merge(faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
end
class SmartEdgesTest < Minitest::Test
  def setup
    @model=CardinalModelDouble.new(NamesFixture.model.__getobj__);@piece=@model.entities[0].entities[0];@faces=@piece.definition.entities
    @faces.each_with_index { |face,index| face.define_singleton_method(:persistent_id) { 100+index } }
    @sheet_item={'id'=>'11111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Placa ensayo','sku'=>'P','supplier'=>'QA','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
    @edge_item=@sheet_item.merge('id'=>'22222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto ensayo','thicknessMm'=>1,'widthMm'=>22)
    @sheet=material(991,@sheet_item);@edge=material(992,@edge_item);@model.materials=[@sheet,@edge]
    data={'schema'=>1,'revision'=>1,'items'=>[@sheet_item,@edge_item]};@catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
  end
  def material(id,item)
    result=CardinalMaterialDouble.new(id,item['name'],Sketchup::Color.new(100,100,100),1,nil);result.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));result
  end
  def options(mode:'edge',count:1,face:'102',**patch)
    binding=PlanosSanto::MaterialResolver.read_binding(mode=='remove_edge' ? @sheet : mode=='sheet' ? @sheet : @edge)
    {'mode'=>mode,'edgeCount'=>count,'paintScope'=>'face','targets'=>[{'pieceId'=>'1/11','faceIds'=>[face]}],'side'=>'front','scope'=>'all','axes'=>[0,1],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  def apply(options)
    preview=@smart.preview(options);[@smart.apply('token'=>preview['token'],'confirmed'=>true),preview]
  end
  def painted(material=@edge);@faces.select { |face| face.material.equal?(material) }.map(&:persistent_id).sort;end
  def test_one_physical_edge_preserves_the_other_three_and_undo_is_one_operation
    before=@faces.map(&:material);result,preview=apply(options)
    assert_equal [102],painted;assert_equal 1,preview['faceCount'];assert result['changed'];assert_equal 1,@model.operations.count { |op| op[0]==:start }
    @model.undo;assert_equal before,@faces.map(&:material)
  end
  def test_two_opposite_edges_use_local_frame_and_preview_all_targets_before_apply
    preview=@smart.preview(options(count:2));assert_equal 2,preview['faceCount'];assert_equal [102,103],preview['expandedTargets'].first['faceIds'].map(&:to_i).sort
    assert_empty @model.operations;@smart.apply('token'=>preview['token'],'confirmed'=>true)
    assert_equal [102,103],painted;assert_equal 1,@model.operations.count { |op| op[0]==:start }
  end
  def test_four_edges_leave_broad_faces_and_geometry_untouched
    before=@faces.map { |face| face.mesh.points.map(&:to_a) };result,preview=apply(options(count:4))
    assert_equal [102,103,104,105],painted;assert_equal 4,preview['faceCount'];assert result['changed'];assert_equal before,@faces.map { |face| face.mesh.points.map(&:to_a) }
    refute_same @edge,@faces[0].material;refute_same @edge,@faces[1].material
  end
  def test_piece_scope_paints_two_broad_faces_but_face_scope_keeps_legacy_single_face
    _,preview=apply(options(mode:'sheet',face:'102',paintScope:'piece'))
    assert_equal [100,101],painted(@sheet);assert_equal 2,preview['faceCount']
    @model.undo
    apply(options(mode:'sheet',face:'100',paintScope:'face'));assert_equal [100],painted(@sheet)
  end
  def test_rotated_or_mirrored_instances_do_not_change_local_side_correspondence
    @piece.transformation=Geom::Transformation.scale(-1,1,1)
    _,preview=apply(options(count:2,face:'104'))
    assert_equal [104,105],painted;assert_includes preview['affectedPaths'],'1/11'
  end
  def test_invalid_axes_broad_anchor_or_split_physical_boundary_blocks_before_operation
    [options(count:3),options(count:2,axes:[0,0]),options(count:4,axes:[1,2]),options(count:2,face:'100')].each do |request|
      assert_raises(PlanosSanto::ExportError) { @smart.preview(request) }
    end
    @piece.definition.entities << @faces[2]
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(count:4)) }
    assert_empty @model.operations
  end
  def test_remove_four_edges_restores_explicit_sheet_in_single_undo_and_rejects_unknown_side
    [2,3,4,5].each { |index| @faces[index].material=@edge }
    before=@faces.map(&:material);result,preview=apply(options(mode:'remove_edge',count:4))
    assert_equal [102,103,104,105],painted(@sheet);assert_equal 4,preview['faceCount'];assert result['changed']
    @model.undo;assert_equal before,@faces.map(&:material)
    @faces[3].material=nil
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'remove_edge',count:4)) }
  end
  def test_catalog_choices_are_only_native_bound_valid_materials_of_current_kind
    choices=@smart.material_choices('mode'=>'edge');assert_equal [@edge_item['id']],choices.map { |row| row['catalogId'] }
    @edge_item['approved']=false;assert_empty @smart.material_choices('mode'=>'edge');assert_empty @model.operations
  end
  def test_nonuniform_scale_that_reverses_physical_thickness_blocks_expansion
    @piece.transformation=Geom::Transformation.scale(1,1,100)
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(count:4)) }
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(count:1)) }
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'sheet',paintScope:'piece')) }
    assert_empty @model.operations
  end

end
