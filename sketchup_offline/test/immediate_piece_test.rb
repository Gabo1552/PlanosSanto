# frozen_string_literal: true
# Linux API contracts only: generated JPG, native texture/SKM API doubles and
# synthetic boards. These tests do not claim SketchUp image/render validation.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require_relative 'names_double'
require_relative 'photo_material_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'
require_relative '../photo_material'

module ImmediateTextureFaceDouble
  def texture_positioned?(_front);false;end
  def texture_projected?(_front);false;end
end
class ImmediateModelDouble < NamingModelDouble
  attr_accessor :materials
  def state
    super.merge(definitions:all_instances.map { |entity| [entity,entity.definition,entity.transformation] },
                faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:definitions].each { |entity,definition,transformation| entity.definition=definition;entity.transformation=transformation }
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
end

class ImmediatePieceTest < Minitest::Test
  class Picker
    attr_accessor :path,:leaf
    def do_pick(_x,_y);end
    def count;path ? 1 : 0;end
    def path_at(_index);path;end
    def leaf_at(_index);leaf;end
  end
  class View
    attr_accessor :drawing_color
    def initialize(picker);@picker=picker;end
    def pick_helper;@picker;end
    def invalidate;end
    def draw(_mode,_points);end
  end
  def setup
    @directory=Dir.mktmpdir;@source=Dir.mktmpdir
    board=Fixture.board_definition
    @original_faces=board.entities
    @original_faces.each_with_index do |face,index|
      face.extend(ImmediateTextureFaceDouble)
      face.define_singleton_method(:persistent_id) { 100+index }
    end
    @pieces=(11..15).map { |id| Sketchup::ComponentInstance.new(id,"Pieza #{id}",board) }
    root=Sketchup::Group.new(1,'M01',Sketchup::Definition.new('M01','root-only',@pieces))
    @other=Sketchup::ComponentInstance.new(21,'Otra pieza',board)
    other_root=Sketchup::Group.new(2,'M02',Sketchup::Definition.new('M02','other-only',[@other]))
    @model=ImmediateModelDouble.new(Sketchup::Model.new([root,other_root],'immediate-qa','Immediate QA',''))
    @model.materials=[];PhotoFixture.decorate(@model)
    @pieces.each { |piece| enable_unique(piece) }
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @photo=PlanosSanto::PhotoMaterial.new(@model,catalog:@catalog,directory:@directory,guard:lambda { true })
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
    @created=create_photo('Foto QA.jpg',PhotoFixture.jpeg)
    @material=@model.materials.last
    @narrow=Sketchup::Material.new(8100,'Canto antiguo desconocido',Sketchup::Color.new(2,3,4),1,nil)
    @original_faces[2..].each { |face| face.material=@narrow;face.back_material=@narrow }
  end
  def teardown
    FileUtils.remove_entry(@directory);FileUtils.remove_entry(@source)
  end
  def enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copies=definition.entities.each_with_index.map do |face,index|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a)
        copy.extend(ImmediateTextureFaceDouble)
        copy.material=face.material;copy.back_material=face.back_material
        id=persistent_id*1000+index;copy.define_singleton_method(:persistent_id) { id };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"isolated-#{persistent_id}",copies);self
    end
  end
  def create_photo(name,bytes)
    path=File.join(@source,name);File.binwrite(path,bytes);picked=@photo.pick(path)
    @photo.create(picked['token'],{'revision'=>picked['revision'],'name'=>picked['name'],'kind'=>'sheet','thicknessMm'=>18,'action'=>'new','confirmed'=>true})
  end
  def options(index=0,material=@material)
    piece=@pieces[index];face=piece.definition.entities[2];binding=PlanosSanto::MaterialResolver.read_binding(material)
    {'mode'=>'sheet','immediatePiece'=>true,'targets'=>[{'pieceId'=>"1/#{piece.persistent_id}",'faceIds'=>[face.persistent_id.to_s]}],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}
  end
  def all_sides(piece)
    piece.definition.entities.map { |face| [face.material,face.back_material] }
  end
  def assert_painted_piece(piece,material=@material)
    actual=all_sides(piece)
    assert_equal [[material,material],[material,material]],actual.first(2)
    assert_equal Array.new(4) { [@narrow,@narrow] },actual.drop(2)
  end
  def test_jpg_design_material_paints_the_whole_piece_even_from_a_narrow_hit_without_commercial_approval
    item=@catalog.read['items'].first;refute item['approved'];assert item.dig('observed','photo','designReady')
    original=all_sides(@other);definition=@pieces[0].definition;mesh=definition.entities.map { |face| face.mesh.points.map(&:to_a) }
    assert_nil @model.active_path
    result=@smart.apply_immediate(options)
    assert result['changed'];assert_equal ['1/11'],result['affectedPaths'];assert_painted_piece(@pieces[0])
    assert_same @material,@pieces[0].definition.entities[0].material
    assert_equal PhotoFixture.jpeg,File.binread(@pieces[0].definition.entities[0].material.texture.filename)
    assert_equal mesh,@pieces[0].definition.entities.map { |face| face.mesh.points.map(&:to_a) }
    refute_same definition,@pieces[0].definition;assert_same definition,@other.definition;assert_equal original,all_sides(@other)
    assert_nil @model.active_path
  end
  def test_five_consecutive_applications_and_material_change_need_no_faces_axes_or_scope_and_each_has_one_undo
    original=all_sides(@other);before=@model.undo_states.length
    5.times { |index| assert @smart.apply_immediate(options(index))['changed'];assert_painted_piece(@pieces[index]) }
    assert_equal before+5,@model.undo_states.length;assert_equal original,all_sides(@other)
    create_photo('Segunda QA.png',PhotoFixture.png(3,3));second=@model.materials.last
    assert @smart.apply_immediate(options(0,second))['changed'];assert_painted_piece(@pieces[0],second)
    @model.undo;assert_painted_piece(@pieces[0]);assert_painted_piece(@pieces[4])
    @model.undo # Undo material creation.
    @model.undo # Undo fifth paint only.
    assert_equal original,all_sides(@pieces[4]);assert_painted_piece(@pieces[3])
  end
  def test_real_tool_and_real_service_paint_five_components_then_repaint_from_jpg_without_entering_or_reconfiguring
    events=[];picker=Picker.new;view=View.new(picker)
    @model.define_singleton_method(:select_tool) { |tool| @qa_selected_tool=tool }
    @model.define_singleton_method(:selected_tool) { @qa_selected_tool }
    tool=PlanosSanto::SmartPaintTool.new(@model,service:@smart,options:options.reject { |key,_| key=='targets' },
                                       on_event:lambda { |event| events << event },guard:lambda { true })
    original=all_sides(@other);undo_count=@model.undo_states.length;preview_calls=0
    real_preview=@smart.method(:preview)
    @smart.define_singleton_method(:preview) { |data,**options| preview_calls+=1;real_preview.call(data,**options) }
    @model.select_tool(tool);tool.activate
    @pieces.each_with_index do |piece,index|
      face=piece.definition.entities[2];picker.path=[@model.entities.first,piece,face];picker.leaf=face
      prior_calls=preview_calls
      30.times { |step| tool.onMouseMove(0,step,10,view) }
      assert_equal prior_calls,preview_calls # Real plan/inventory is not used by hover.
      assert_equal undo_count+index,@model.undo_states.length
      tool.onLButtonDown(0,10,10,view)
      assert_nil events.last['error'];assert events.last['changed'];assert tool.status['active']
      assert_painted_piece(piece)
      binding=PlanosSanto::MaterialResolver.read_binding(piece.definition.entities[0].material)
      assert_equal @created['materialUuid'],binding['uuid'];assert_nil @model.active_path
    end
    assert_equal 5,preview_calls;assert_equal undo_count+5,@model.undo_states.length
    assert_equal original,all_sides(@other)
    assert_equal PhotoFixture.jpeg,File.binread(@pieces.first.definition.entities.first.material.texture.filename)
    create_photo('Cambiar material QA.png',PhotoFixture.png(3,3));second=@model.materials.last
    tool.update_options(options(0,second).reject { |key,_| key=='targets' });assert tool.status['active']
    face=@pieces.first.definition.entities.first;picker.path=[@model.entities.first,@pieces.first,face];picker.leaf=face
    tool.onLButtonDown(0,15,15,view)
    assert_nil events.last['error'];assert events.last['changed'];assert tool.status['active'];assert_painted_piece(@pieces.first,second)
    assert_equal 6,preview_calls;assert_equal original,all_sides(@other)
    @model.undo;assert_painted_piece(@pieces.first);assert_painted_piece(@pieces.last)
    tool.onKeyDown(27,0,0,view);refute tool.status['active'];assert_nil @model.selected_tool
    refute events.any? { |event| event['error'] }
  end
  def test_old_explicit_front_and_back_materials_are_replaced_but_unknown_narrow_finishes_are_unchanged
    old=Sketchup::Material.new(8200,'Acabado explícito anterior',Sketchup::Color.new(1,2,3),1,nil)
    @original_faces.first(2).each { |face| face.material=old;face.back_material=old }
    @smart.apply_immediate(options);assert_painted_piece(@pieces[0]);assert_equal [[old,old],[old,old]],all_sides(@other).first(2)
  end
  def test_recognized_edge_on_an_unexpected_broad_side_is_not_overwritten
    edge=PhotoFixture::Material.new(8300,'Canto reconocido')
    edge.set_attribute('ladb_opencutlist','type',4);@original_faces[0].back_material=edge
    @smart.apply_immediate(options)
    painted=@pieces[0].definition.entities
    assert_same @material,painted[0].material;assert_same edge,painted[0].back_material
    assert_same @material,painted[1].material;assert_same @material,painted[1].back_material
    assert_equal Array.new(4) { [@narrow,@narrow] },all_sides(@pieces[0]).drop(2)
  end
  def test_mirrored_rotated_instance_infers_its_own_plane_and_keeps_transform
    @pieces[0].transformation=Geom::Transformation.rotation_z(Math::PI/3)*Geom::Transformation.scale(-2,1,1)
    before=@pieces[0].transformation.to_a
    @smart.apply_immediate(options.merge('axes'=>[1,2],'side'=>'front','scope'=>'all'))
    assert_painted_piece(@pieces[0]);assert_equal before,@pieces[0].transformation.to_a
    refute_same @material,@other.definition.entities[0].material
  end
  def test_shared_ancestor_is_blocked_atomically_with_no_operation_or_neighbor_change
    root=@model.entities.first;copy=Sketchup::Group.new(3,'M03',root.definition);@model.entities << copy
    before=all_sides(@pieces[0]);operations=@model.operations.length
    error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(options) }
    assert_includes error.message,'aislar';assert_equal operations,@model.operations.length
    assert_equal before,all_sides(@pieces[0]);assert_same @pieces[0].definition,copy.definition.entities[0].definition
  end
  def test_isolation_that_changes_an_edge_finish_aborts_and_restores_the_original_definition
    piece=@pieces.first;original=piece.definition;finishes=all_sides(piece);normal_unique=piece.method(:make_unique)
    piece.define_singleton_method(:make_unique) { normal_unique.call;definition.entities[2].material=nil;self }
    undo_count=@model.undo_states.length
    error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(options) }
    assert_includes error.message,'acabados o cantos';assert_same original,piece.definition
    assert_equal finishes,all_sides(piece);assert_equal undo_count,@model.undo_states.length
    assert_equal :abort,@model.operations.last.first
  end
  def test_ambiguous_thickness_or_locked_piece_is_readonly_and_requires_no_form
    @pieces[0].locked_for_names=true;operations=@model.operations.length
    assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(options) };assert_equal operations,@model.operations.length
    @pieces[0].locked_for_names=false;@pieces[0].transformation=Geom::Transformation.scale(1,1,16/0.75)
    error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(options) };assert_includes error.message,'espesor'
    assert_equal operations,@model.operations.length
  end
  def test_repeat_identical_piece_gesture_does_not_consume_previous_undo
    @smart.apply_immediate(options);before=@model.undo_states.length
    result=@smart.apply_immediate(options);refute result['changed'];assert result['noChanges'];assert_equal before,@model.undo_states.length
    @model.undo;refute_same @material,@pieces[0].definition.entities[0].material
  end
  def test_quick_edges_and_removal_infer_yz_cutting_plane_and_preserve_other_three_edges
    @original_faces.each do |face|
      face.mesh.points.each { |point| x,y,z=point.to_a;point.x=z;point.y=x;point.z=y }
      x,y,z=face.normal.to_a;face.normal=Sketchup::Point.new(z,x,y)
    end
    @smart.apply_immediate(options)
    path=File.join(@source,'Canto QA.png');File.binwrite(path,PhotoFixture.png(3,3));picked=@photo.pick(path)
    created=@photo.create(picked['token'],{'revision'=>picked['revision'],'name'=>picked['name'],'kind'=>'edge','thicknessMm'=>1,'action'=>'new','confirmed'=>true})
    edge=@model.materials.last
    request=options.merge('mode'=>'edge','immediate'=>true,'immediatePiece'=>false,'edgeCount'=>1,'catalogId'=>created['catalogId'],'materialUuid'=>created['materialUuid'])
    assert @smart.apply_immediate(request)['changed']
    sides=all_sides(@pieces[0]);assert_equal [edge,edge],sides[2];assert_equal Array.new(3) { [@narrow,@narrow] },sides.drop(3)
    assert_equal [[@material,@material],[@material,@material]],sides.first(2)
    restore=options.merge('mode'=>'remove_edge','immediate'=>true,'immediatePiece'=>false,'edgeCount'=>1,'catalogId'=>nil,'materialUuid'=>nil)
    assert @smart.apply_immediate(restore)['changed'];assert_equal [@material,@material],all_sides(@pieces[0])[2]
    @model.undo;assert_equal [edge,edge],all_sides(@pieces[0])[2]
  end
  def test_immediate_preview_is_readonly_and_omits_commercial_or_safe_isolation_prompts
    operations=@model.operations.length;before=all_sides(@pieces[0])
    preview=@smart.preview(options)
    assert_empty preview['warnings'];assert_equal ['1/11'],preview['affectedPaths'];assert preview['uniqueAvailable']
    assert_equal operations,@model.operations.length;assert_equal before,all_sides(@pieces[0])
    @smart.cancel
  end
  def test_saved_skm_asset_loads_the_same_texture_for_immediate_piece_paint_without_source_photo
    item=@catalog.read['items'].first;source_hash=item.dig('observed','photo','sourceHash')
    FileUtils.remove_entry(@source);@source=Dir.mktmpdir
    model_materials=@model.materials
    model_materials.clear
    loaded=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).install({'catalogId'=>item['id'],'revision'=>@catalog.read['revision'],'confirmed'=>true})
    material=@model.materials.last;assert_equal loaded['binding']['uuid'],PlanosSanto::MaterialResolver.read_binding(material)['uuid']
    assert_equal source_hash,Digest::SHA256.file(material.texture.filename).hexdigest
    @smart.apply_immediate(options(0,material));assert_painted_piece(@pieces[0],material)
  end
end
