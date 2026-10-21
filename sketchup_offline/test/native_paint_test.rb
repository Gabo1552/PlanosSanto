# frozen_string_literal: true
require 'minitest/autorun'
require 'ostruct'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../native_paint'

class PaintMaterialDouble < Sketchup::Material
  attr_accessor :binding
  def get_attribute(_dict,_key,_default=nil); binding; end
end
class PaintingModelDouble < NamingModelDouble
  attr_accessor :materials
  def state
    super.merge(definitions:all_instances.map { |e| [e,e.definition,e.transformation] },faces:all_instances.flat_map { |e| e.definition.entities.grep(Sketchup::Face) }.uniq.map { |f| [f,f.material,f.back_material] })
  end
  def restore(s)
    super
    s[:definitions].each { |e,d,t| e.definition=d;e.transformation=t }
    s[:faces].each { |f,m,b| f.instance_variable_set(:@material,m);f.instance_variable_set(:@back_material,b) }
  end
end

class NativePaintTest < Minitest::Test
  def setup
    source=NamesFixture.model
    @model=PaintingModelDouble.new(source.__getobj__)
    @left=@model.entities[0].entities[0]
    @faces=@left.definition.entities
    @faces.each_with_index { |f,i| f.define_singleton_method(:persistent_id) { 100+i } }
    @item={'id'=>'11111111-1111-1111-1111-111111111111','name'=>'Melamina real seleccionada','approved'=>true,'kind'=>'sheet','sku'=>'BL18','supplier'=>'Taller','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
    @data={'schema'=>1,'revision'=>1,'items'=>[@item]}
    @catalog=Object.new; data=@data;@catalog.define_singleton_method(:read) { data }
    @material=PaintMaterialDouble.new(1000,'Material registrado',Sketchup::Color.new(200,200,180),1.0,nil)
    @binding=PlanosSanto::MaterialResolver.binding_for(@item)
    @material.binding=JSON.generate(@binding)
    @model.materials=[@material]
    @paint=PlanosSanto::NativePaint.new(@model,catalog:@catalog)
  end
  def request(**changes)
    {'pieceId'=>'1/11','faceIds'=>['100'],'side'=>'front','catalogId'=>@item['id'],'materialUuid'=>@binding['uuid'],'mode'=>'sheet','axes'=>[0,1],'scope'=>'all'}.merge(changes.transform_keys(&:to_s))
  end
  def apply(preview);@paint.apply({'token'=>preview['token'],'confirmed'=>true});end
  def test_status_and_preview_cancel_are_readonly_with_all_shared_occurrences
    original=@faces[0].material
    status=@paint.status('1/11');assert_equal 6,status['piece']['faces'].length
    p=@paint.preview(request);assert_equal ['1/11','1/13/12','2/21'],p['affectedPaths'];assert_equal 3,p['sharedCount'];refute_empty p['warnings']
    assert_empty @model.operations;assert_same original,@faces[0].material
    @paint.cancel;assert_raises(PlanosSanto::ExportError) { apply(p) };assert_empty @model.operations
  end
  def test_confirm_paints_real_front_and_back_once_and_undo_restores
    original=@faces[0].material;p=@paint.preview(request(side:'both'));result=apply(p)
    assert result['changed'];assert_same @material,@faces[0].material;assert_same @material,@faces[0].back_material
    assert_equal 1,@model.operations.count { |o| o[0]==:start }
    assert_raises(PlanosSanto::ExportError) { apply(p) }
    @model.undo;assert_same original,@faces[0].material;assert_nil @faces[0].back_material
  end
  def test_back_only_preserves_front_and_geometry_and_visibility
    before=@faces[0].material;mesh=@faces.map { |f| f.mesh.points.map(&:to_a) };transforms=@model.all_instances.map { |e| [e.transformation.to_a,e.hidden?] }
    apply(@paint.preview(request(side:'back')))
    assert_same before,@faces[0].material;assert_same @material,@faces[0].back_material
    assert_equal mesh,@faces.map { |f| f.mesh.points.map(&:to_a) };assert_equal transforms,@model.all_instances.map { |e| [e.transformation.to_a,e.hidden?] }
  end
  def test_stale_model_catalog_binding_and_explicit_confirmation_block
    p=@paint.preview(request);@left.name='Cambio';assert_raises(PlanosSanto::ExportError) { apply(p) }
    p=@paint.preview(request);@data['revision']=2;assert_raises(PlanosSanto::ExportError) { apply(p) }
    p=@paint.preview(request);assert_raises(PlanosSanto::ExportError) { @paint.apply({'token'=>p['token'],'confirmed'=>false}) }
    assert_empty @model.operations
  end
  def test_locked_other_mueble_and_ambiguous_scope_block
    @model.entities[1].locked_for_names=true
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request) }
    @model.entities[1].locked_for_names=false
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(scope:'implicit')) }
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(faceIds:['100','100'])) }
    assert_empty @model.operations
  end
  def edge_material
    @item['kind']='edge';@item['widthMm']=22;@item['thicknessMm']=0.45;@binding=PlanosSanto::MaterialResolver.binding_for(@item);@material.binding=JSON.generate(@binding)
  end
  def test_edge_requires_explicit_axes_and_narrow_face_not_camera_or_sorted_dimensions
    edge_material
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(mode:'edge')) }
    p=@paint.preview(request(mode:'edge',faceIds:['102']));apply(p);assert_same @material,@faces[2].material
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(mode:'edge',faceIds:['102'],axes:[1,2])) }
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(mode:'edge',faceIds:['102'],axes:[0,0])) }
  end
  def test_rolls_back_partial_setter_failure
    original=@faces.map(&:material)
    @faces[1].define_singleton_method(:material=) { |_m| raise IOError,'synthetic setter failure' }
    p=@paint.preview(request(faceIds:['100','101']))
    assert_raises(IOError) { apply(p) }
    assert_equal :abort,@model.operations.last[0]
    assert_equal original,@faces.map(&:material)
  end
  def test_unique_nested_repeated_parent_blocked_and_all_lists_nested_paths
    @model.entities << Sketchup::ComponentInstance.new(3,'Mueble repetido',@model.entities[0].definition)
    p=@paint.preview(request);assert_includes p['affectedPaths'],'3/11';assert_includes p['affectedPaths'],'3/13/12'
    assert_raises(PlanosSanto::ExportError) { @paint.preview(request(scope:'unique')) }
  end
  # 0.8.8 (audit C3): approval and SKU are commercial and never block painting;
  # an item kind change or a duplicated native UUID still does.
  def test_binding_requires_matching_kind_and_single_uuid_but_not_commercial_data
    @item['approved']=false;assert @paint.preview(request)['token']
    @item['approved']=true;@item['sku']='Changed';assert @paint.preview(request)['token']
    @item['kind']='edge';assert_raises(PlanosSanto::ExportError) { @paint.preview(request) }
    @item['kind']='sheet';@item['sku']='BL18';@model.materials << @material;assert_raises(PlanosSanto::ExportError) { @paint.preview(request) }
  end
  def test_native_face_selection_requires_unambiguous_edit_path
    @model.selection=[@faces[2]]
    assert_raises(PlanosSanto::ExportError) { @paint.status(nil,from_selection:true) }
    @model.active_path=[@model.entities[0],@left]
    status=@paint.status(nil,from_selection:true)
    assert_equal '1/11',status['piece']['id'];assert_equal ['102'],status['piece']['selectedFaceIds']
  end
  def enable_unique
    entity=@left
    entity.define_singleton_method(:make_unique) do
      copied=definition.entities.map.with_index do |face,i|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a)
        copy.material=face.material;copy.back_material=face.back_material
        copy.define_singleton_method(:persistent_id) { 10000+i };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,'unique-synthetic',copied)
      self
    end
  end
  def test_unique_conserves_geometry_other_occurrences_and_is_undoable
    enable_unique
    original_definition=@left.definition;old_material=@faces[0].material
    p=@paint.preview(request(scope:'unique'))
    assert p['uniqueAvailable'];assert_equal ['1/11'],p['affectedPaths']
    result=apply(p);assert result['unique'];refute_same original_definition,@left.definition
    assert_same @material,@left.definition.entities[0].material
    assert_same old_material,original_definition.entities[0].material
    @model.undo;assert_same original_definition,@left.definition
    assert_same old_material,@left.definition.entities[0].material
  end
  def test_unique_geometry_change_aborts_and_does_not_paint_shared_faces
    enable_unique
    original_definition=@left.definition
    @left.define_singleton_method(:make_unique) { self.transformation=Geom::Transformation.translation(1,0,0) }
    before=@faces[0].material
    assert_raises(PlanosSanto::ExportError) { apply(@paint.preview(request(scope:'unique'))) }
    assert_same before,@faces[0].material;assert_equal :abort,@model.operations.last[0]
    assert_same original_definition,@left.definition
  end
  def test_material_appearance_and_face_identity_staleness_are_blocked
    p=@paint.preview(request);@material.color=Sketchup::Color.new(0,0,0)
    assert_raises(PlanosSanto::ExportError) { apply(p) }
    p=@paint.preview(request);@faces[0].define_singleton_method(:persistent_id) { 88888 }
    assert_raises(PlanosSanto::ExportError) { apply(p) };assert_empty @model.operations
  end
  def test_rotated_and_mirrored_piece_keep_local_edge_axes
    edge_material
    [Geom::Transformation.rotation_z(Math::PI/2),Geom::Transformation.scale(-1,1,1)].each do |transform|
      @left.transformation=transform
      p=@paint.preview(request(mode:'edge',faceIds:['102'],side:'both'))
      apply(p);assert_same @material,@faces[2].material;assert_same @material,@faces[2].back_material
    end
  end

  def test_unrelated_invalid_binding_remains_pending_without_disabling_valid_material
    bad=PaintMaterialDouble.new(2000,'Pendiente',Sketchup::Color.new(1,2,3),1.0,nil)
    bad.binding='{invalid';@model.materials << bad
    apply(@paint.preview(request))
    assert_same @material,@faces[0].material
    assert_equal '{invalid',bad.binding
  end

  def test_identical_assignment_creates_no_operation_and_preserves_previous_undo
    original=@faces[0].material
    apply(@paint.preview(request(side:'both')))
    count=@model.operations.length;undo_count=@model.undo_states.length
    result=apply(@paint.preview(request(side:'both')))
    refute result['changed'];assert result['noChanges'];assert_match(/No se creó una operación Undo/,result['message'])
    assert_equal count,@model.operations.length;assert_equal undo_count,@model.undo_states.length
    @model.undo;assert_same original,@faces[0].material;assert_nil @faces[0].back_material
  end
  def test_unique_unshared_identical_is_noop_but_shared_isolation_is_an_edit
    enable_unique
    apply(@paint.preview(request))
    count=@model.operations.length
    result=apply(@paint.preview(request(scope:'unique')))
    assert result['changed'];refute result['noChanges'];assert_operator @model.operations.length,:>,count
    count=@model.operations.length;undo_count=@model.undo_states.length
    result=apply(@paint.preview(request(scope:'unique',faceIds:['10000'])))
    refute result['changed'];assert result['noChanges']
    assert_equal count,@model.operations.length;assert_equal undo_count,@model.undo_states.length
  end

end
