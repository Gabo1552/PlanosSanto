# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'

class SmartMaterialDouble < Sketchup::Material
  attr_accessor :binding,:ocl_type
  def get_attribute(dict,key,_default=nil)
    return binding if dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY
    return ocl_type if dict=='ladb_opencutlist' && key=='type'
    nil
  end
end
class SmartModelDouble < NamingModelDouble
  attr_accessor :materials
  def state
    super.merge(definitions:all_instances.map { |e| [e,e.definition,e.transformation] },uv:all_instances.flat_map { |e| e.definition.entities.grep(Sketchup::Face) }.uniq.map { |f| [f,f.instance_variable_get(:@uv_mapping),f.instance_variable_get(:@uv_reset)] },faces:all_instances.flat_map { |e| e.definition.entities.grep(Sketchup::Face) }.uniq.map { |f| [f,f.material,f.back_material] })
  end
  def restore(s)
    super;s[:uv].each { |f,m,r| f.instance_variable_set(:@uv_mapping,m);f.instance_variable_set(:@uv_reset,r) };s[:definitions].each { |e,d,t| e.definition=d;e.transformation=t }
    s[:faces].each { |f,m,b| f.instance_variable_set(:@material,m);f.instance_variable_set(:@back_material,b) }
  end
end
# Planar UV double: a real positioned mapping, native setter reset, then public
# position_material affine reconstruction. No SketchUp runtime is claimed.
Geom.const_set(:Point3d,Sketchup::Point) unless Geom.const_defined?(:Point3d,false)
Sketchup.define_singleton_method(:create_texture_writer) { Object.new }
module SmartUvFaceDouble
  attr_accessor :uv_position_fail,:uv_projected,:uv_unpositioned,:uv_distorted
  attr_reader :uv_calls
  def texture_positioned?(_front);!uv_unpositioned;end
  def texture_projected?(_front);uv_projected==true;end
  def material=(value);@uv_mapping=nil;@uv_reset=true;super;end
  def back_material=(value);@uv_mapping=nil;@uv_reset=true;super;end
  def uv_value(point)
    x,y,_z=point.to_a
    if @uv_mapping
      points,uv=@uv_mapping;ax,ay=points[0][0,2];bx,by=points[1][0,2];cx,cy=points[2][0,2]
      den=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay)
      s=((x-ax)*(cy-ay)-(cx-ax)*(y-ay))/den;t=((bx-ax)*(y-ay)-(x-ax)*(by-ay))/den
      2.times.map { |i| uv[0][i]+s*(uv[1][i]-uv[0][i])+t*(uv[2][i]-uv[0][i]) }
    elsif @uv_reset
      [x/10.0,y/10.0]
    else
      [y/8.0+0.25+(uv_distorted && x>0 && y==0 ? 0.2 : 0),-x/6.0+0.5]
    end
  end
  def get_UVHelper(_front,_back,_writer)
    face=self;helper=Object.new
    helper.define_singleton_method(:get_front_UVQ) { |point| uv=face.uv_value(point);Sketchup::Point.new(uv[0],uv[1],1) }
    helper.define_singleton_method(:get_back_UVQ) { |point| uv=face.uv_value(point);Sketchup::Point.new(uv[0],uv[1],1) };helper
  end
  def position_material(_material,pairs,_front)
    raise IOError,'synthetic UV positioning failure' if uv_position_fail
    @uv_calls=(@uv_calls||0)+1
    @uv_mapping=[pairs.each_slice(2).map { |p,_uv| p.to_a },pairs.each_slice(2).map { |_p,uv| uv.to_a[0,2] }];true
  end
end
class SmartPaintTest < Minitest::Test
  def setup
    @model=SmartModelDouble.new(NamesFixture.model.__getobj__)
    @left=@model.entities[0].entities[0];@faces=@left.definition.entities
    @faces.each_with_index { |f,i| f.define_singleton_method(:persistent_id) { 100+i } }
    @data={'schema'=>1,'revision'=>1,'items'=>[]};data=@data
    @catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @model.materials=[]
    @sheet=material('sheet');@edge=material('edge');@other_edge=material('edge')
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
  end
  def material(kind)
    id=SecureRandom.uuid
    item={'id'=>id,'name'=>kind,'approved'=>true,'kind'=>kind,'sku'=>id,'supplier'=>'Taller','thicknessMm'=>kind=='sheet' ? 19.05 : 0.45,'widthMm'=>kind=='sheet' ? 1000 : 22,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
    @data['items'] << item
    m=SmartMaterialDouble.new(1000+@model.materials.length,kind,Sketchup::Color.new(200,200,180),1.0,nil)
    m.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));@model.materials << m;m
  end
  def options(mode:'sheet',target:@sheet,**values)
    b=PlanosSanto::MaterialResolver.read_binding(target)
    {'mode'=>mode,'targets'=>[{'pieceId'=>'1/11','faceIds'=>['100']}],'side'=>'front','scope'=>'all','axes'=>[0,1],
     'catalogId'=>b['catalogId'],'materialUuid'=>b['uuid']}.merge(values.transform_keys(&:to_s))
  end
  def apply(data)
    preview=@smart.preview(data);@smart.apply('token'=>preview['token'],'confirmed'=>true)
  end
  def test_batch_is_readonly_until_confirmed_and_deduplicates_shared_faces
    data=options(targets:[{'pieceId'=>'1/11','faceIds'=>['100','101']},{'pieceId'=>'2/21','faceIds'=>['100']}])
    original=@faces[0].material
    p=@smart.preview(data);assert_equal 2,p['operationCount'];assert_equal ['1/11','1/13/12','2/21'],p['affectedPaths']
    assert_empty @model.operations;assert_same original,@faces[0].material
    result=@smart.apply('token'=>p['token'],'confirmed'=>true)
    assert result['changed'];assert_same @sheet,@faces[0].material;assert_same @sheet,@faces[1].material
    assert_equal 1,@model.operations.count { |o| o[0]==:start };assert_equal 1,@model.undo_states.length
    @model.undo;assert_same original,@faces[0].material;assert_nil @faces[1].material
  end
  def test_batch_failure_rolls_back_every_previous_face
    original=@faces.map(&:material)
    @faces[1].define_singleton_method(:material=) { |_m| raise IOError,'batch failure' }
    assert_raises(IOError) { apply(options(targets:[{'pieceId'=>'1/11','faceIds'=>['100','101']}])) }
    assert_equal original,@faces.map(&:material);assert_equal :abort,@model.operations.last[0];assert_empty @model.undo_states
  end
  def test_entire_batch_validated_before_first_write_and_cancel_consumes_token
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(targets:[{'pieceId'=>'1/11','faceIds'=>['100']},{'pieceId'=>'2/21','faceIds'=>['missing']}])) }
    assert_empty @model.operations
    p=@smart.preview(options);@smart.cancel
    assert_raises(PlanosSanto::ExportError) { @smart.apply('token'=>p['token'],'confirmed'=>true) }
  end
  def test_stale_catalog_model_or_material_blocks_whole_batch
    p=@smart.preview(options);@data['revision']+=1
    assert_raises(PlanosSanto::ExportError) { @smart.apply('token'=>p['token'],'confirmed'=>true) }
    p=@smart.preview(options);@left.name='changed'
    assert_raises(PlanosSanto::ExportError) { @smart.apply('token'=>p['token'],'confirmed'=>true) }
    p=@smart.preview(options);@sheet.color=Sketchup::Color.new(1,2,3)
    assert_raises(PlanosSanto::ExportError) { @smart.apply('token'=>p['token'],'confirmed'=>true) }
    assert_empty @model.operations
  end
  def test_remove_edge_restores_verified_sheet_and_never_assigns_nil
    @faces[0].material=@sheet;@faces[2].material=@edge
    result=apply(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}],catalogId:nil,materialUuid:nil))
    assert result['changed'];assert_same @sheet,@faces[2].material;assert_nil @faces[2].back_material
    @model.undo;assert_same @edge,@faces[2].material
    assert_raises(PlanosSanto::ExportError) { apply(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}],side:'both')) }
  end
  def test_remove_edge_ambiguous_sheet_requires_explicit_binding
    sheet2=material('sheet');@faces[0].material=@sheet;@faces[1].material=sheet2;@faces[2].material=@edge
    assert_raises(PlanosSanto::ExportError) { apply(options(mode:'remove_edge',catalogId:nil,materialUuid:nil,targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    assert_empty @model.operations
    apply(options(mode:'remove_edge',target:sheet2,targets:[{'pieceId'=>'1/11','faceIds'=>['102']}]))
    assert_same sheet2,@faces[2].material
  end
  def test_remove_edge_rejects_unknown_and_wide_faces
    @faces[0].material=@edge
    assert_raises(PlanosSanto::ExportError) { apply(options(mode:'remove_edge')) }
    assert_raises(PlanosSanto::ExportError) { apply(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    assert_empty @model.operations
  end
  def test_replace_changes_exact_source_uuid_only_and_preserves_other_side
    @faces[2].material=@edge;@faces[2].back_material=@other_edge;@faces[3].material=@other_edge
    source=PlanosSanto::MaterialResolver.read_binding(@edge)['uuid']
    result=apply(options(mode:'replace',target:@other_edge,replacementKind:'edge',sourceMaterialUuid:source,side:'both',targets:[{'pieceId'=>'1/11','faceIds'=>['102','103']}]))
    assert result['changed'];assert_same @other_edge,@faces[2].material;assert_same @other_edge,@faces[2].back_material
    assert_same @other_edge,@faces[3].material;assert_nil @faces[3].back_material
    assert_equal 1,@model.operations.count { |o| o[0]==:start }
  end
  def test_replace_wrong_kind_and_unmatched_origin_do_not_create_undo
    @faces[2].material=@edge;source=PlanosSanto::MaterialResolver.read_binding(@edge)['uuid']
    assert_raises(PlanosSanto::ExportError) { apply(options(mode:'replace',replacementKind:'sheet',sourceMaterialUuid:source,targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    source=PlanosSanto::MaterialResolver.read_binding(@sheet)['uuid']
    result=apply(options(mode:'replace',replacementKind:'sheet',sourceMaterialUuid:source))
    assert result['noChanges'];refute result['changed'];assert_empty @model.operations
  end
  def test_repeated_identical_gesture_preserves_previous_undo
    apply(options);count=@model.operations.length
    result=apply(options);assert result['noChanges'];assert_equal count,@model.operations.length
    assert_equal 1,@model.undo_states.length
  end
  def test_shared_restore_conflict_blocks_without_silent_cross_furniture_changes
    sheet2=material('sheet');@faces[0].material=nil;@faces[2].material=@edge
    @model.entities[0].material=@sheet;@model.entities[1].material=sheet2
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'remove_edge',catalogId:nil,materialUuid:nil,targets:[{'pieceId'=>'1/11','faceIds'=>['102']},{'pieceId'=>'2/21','faceIds'=>['102']}])) }
    assert_empty @model.operations;assert_same @edge,@faces[2].material
  end
  def test_edges_keep_explicit_axes_after_mirror_and_rotation
    @left.transformation=Geom::Transformation.rotation_z(Math::PI/2)*Geom::Transformation.scale(-1,1,1)
    apply(options(mode:'edge',target:@edge,targets:[{'pieceId'=>'1/11','faceIds'=>['102','103']}]))
    assert_same @edge,@faces[2].material;assert_same @edge,@faces[3].material
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'edge',target:@edge,axes:[1,2],targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
  end
  def test_locked_other_occurrence_and_unsafe_unique_are_blocked
    @model.entities[1].locked_for_names=true
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options) }
    @model.entities[1].locked_for_names=false
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(scope:'unique')) }
    assert_empty @model.operations
  end
  def enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copied=definition.entities.each_with_index.map do |face,i|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a)
        copy.material=face.material;copy.back_material=face.back_material
        pid=persistent_id*1000+i
        copy.define_singleton_method(:persistent_id) { pid };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"unique-#{persistent_id}",copied)
      self
    end
  end
  def test_batch_unique_isolates_two_leaf_instances_in_one_operation_without_affecting_third
    other=@model.entities[1].entities[0];enable_unique(@left);enable_unique(other)
    original=@faces[0].material
    data=options(scope:'unique',targets:[{'pieceId'=>'1/11','faceIds'=>['100']},{'pieceId'=>'2/21','faceIds'=>['100']}])
    p=@smart.preview(data);assert_equal 3,p['sharedCount'];assert p['uniqueAvailable']
    @smart.apply('token'=>p['token'],'confirmed'=>true)
    assert_same @sheet,@left.definition.entities[0].material;assert_same @sheet,other.definition.entities[0].material
    assert_same original,@faces[0].material
    assert_equal 1,@model.operations.count { |o| o[0]==:start };assert_equal 1,@model.undo_states.length
    @model.undo;assert_same @left.definition,other.definition;assert_same original,@left.definition.entities[0].material
  end
  def test_remove_legacy_ocl_edge_only_with_exact_compatible_version_and_no_attribute_writes
    legacy=SmartMaterialDouble.new(9999,'Canto heredado',Sketchup::Color.new(1,2,3),1.0,nil);legacy.ocl_type=4
    @model.materials << legacy;@faces[2].material=legacy;@faces[0].material=@sheet
    opts=options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])
    assert_raises(PlanosSanto::ExportError) { @smart.preview(opts) }
    loaded=Module.new;ocl=Module.new;loaded.const_set(:OpenCutList,ocl)
    ocl.const_set(:EXTENSION_VERSION,'7.1.0');ocl.const_set(:EXTENSION_BUILD,'202511301621')
    Object.const_set(:Ladb,loaded)
    apply(opts);assert_same @sheet,@faces[2].material;assert_equal 4,legacy.ocl_type;assert_nil legacy.binding
  ensure
    Object.send(:remove_const,:Ladb) if Object.const_defined?(:Ladb,false)
  end
  def test_native_ocl_category_conflict_blocks_remove_without_silent_priority
    @faces[2].material=@edge;@edge.ocl_type=2
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    assert_empty @model.operations
  end
  def test_inferred_sheet_cannot_propagate_across_different_parent_plates_even_one_target
    sheet2=material('sheet');@faces[0].material=nil;@faces[2].material=@edge
    @model.entities[0].material=@sheet;@model.entities[1].material=sheet2
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'remove_edge',catalogId:nil,materialUuid:nil,targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    assert_empty @model.operations
  end

  def test_replace_inherited_material_does_not_replace_other_occurrences_with_another_source
    @faces.each { |f| f.material=nil }
    @model.entities[0].material=@sheet
    sheet2=material('sheet');@model.entities[1].material=sheet2
    source=PlanosSanto::MaterialResolver.read_binding(@sheet)['uuid']
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'replace',target:sheet2,replacementKind:'sheet',sourceMaterialUuid:source)) }
    assert_empty @model.operations
  end
  def test_remove_inherited_edge_does_not_change_other_occurrences_without_edge
    @faces.each { |f| f.material=nil }
    @model.entities[0].material=@edge;@model.entities[1].material=@sheet
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}])) }
    assert_empty @model.operations
  end
  def test_replace_same_source_is_noop_even_when_material_is_inherited
    @faces[0].material=nil;@model.entities[0].material=@sheet
    source=PlanosSanto::MaterialResolver.read_binding(@sheet)['uuid']
    result=apply(options(mode:'replace',replacementKind:'sheet',sourceMaterialUuid:source))
    assert result['noChanges'];assert_nil @faces[0].material;assert_empty @model.operations
  end

  def textured_materials(positioned:true)
    old=material('sheet');old.texture=Struct.new(:width,:height,:filename).new(100.0,40.0,'old-real.skm')
    @sheet.texture=Struct.new(:width,:height,:filename).new(200.0,80.0,'new-real.skm')
    @faces[0].material=old;@faces[0].extend(SmartUvFaceDouble)
    @faces[0].uv_unpositioned=!positioned
    old
  end
  def test_custom_affine_uv_preserves_direction_and_physical_scale_with_single_undo
    old=textured_materials;point=Sketchup::Point.new(24,0,0);original=@faces[0].uv_value(point)
    result=apply(options);assert result['changed'];assert_equal 1,@faces[0].uv_calls
    assert_equal original.map { |v| v/2 },@faces[0].uv_value(point)
    @model.undo;assert_same old,@faces[0].material;assert_equal original,@faces[0].uv_value(point)
  end
  def test_native_default_texture_is_not_repositioned_or_rotated
    textured_materials(positioned:false);apply(options)
    assert_nil @faces[0].uv_calls;assert_same @sheet,@faces[0].material
  end
  def test_projected_non_affine_or_uninspectable_texture_blocks_before_operation
    textured_materials;@faces[0].uv_projected=true
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options) }
    @faces[0].uv_projected=false;@faces[0].uv_distorted=true
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options) }
    @faces[0].uv_distorted=false;@faces[0].singleton_class.send(:undef_method,:texture_positioned?)
    assert_raises(PlanosSanto::ExportError) { @smart.preview(options) }
    assert_empty @model.operations
  end
  def test_failed_uv_positioning_aborts_whole_batch_and_restores_materials
    old=textured_materials;@faces[0].uv_position_fail=true
    assert_raises(IOError) { apply(options) }
    assert_same old,@faces[0].material;assert_equal :abort,@model.operations.last[0];assert_empty @model.undo_states
  end
  def test_changed_uv_mapping_after_preview_blocks_apply
    textured_materials;p=@smart.preview(options);@faces[0].uv_distorted=true
    assert_raises(PlanosSanto::ExportError) { @smart.apply('token'=>p['token'],'confirmed'=>true) }
    assert_empty @model.operations
  end
  def test_remove_edge_accepts_empty_palette_ids_as_infer_request
    @faces[0].material=@sheet;@faces[2].material=@edge
    apply(options(mode:'remove_edge',targets:[{'pieceId'=>'1/11','faceIds'=>['102']}],catalogId:'',materialUuid:''))
    assert_same @sheet,@faces[2].material
  end

end
