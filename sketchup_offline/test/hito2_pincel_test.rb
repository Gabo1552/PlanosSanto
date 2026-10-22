# frozen_string_literal: true
# Hito 2 (pincel diario) with API doubles only: real SmartPaint/NativePaint and
# SmartPaintTool over synthetic boards. Nothing here claims SketchUp execution.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'

class Hito2MaterialDouble < Sketchup::Material
  attr_accessor :binding
  def get_attribute(dict,key,_default=nil)
    dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY ? binding : nil
  end
end
class Hito2ModelDouble < NamingModelDouble
  attr_accessor :materials
  attr_reader :observers
  def add_observer(observer);(@observers||=[]) << observer;true;end
  def remove_observer(observer);(@observers||=[]).delete(observer);true;end
  def state
    super.merge(definitions:all_instances.map { |entity| [entity,entity.definition] },
                faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:definitions].each { |entity,definition| entity.definition=definition }
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
end
class Hito2Picker
  attr_accessor :path,:leaf
  def do_pick(_x,_y);end
  def count;path ? 1 : 0;end
  def path_at(_index);path;end
  def leaf_at(_index);leaf;end
end
class Hito2View
  attr_accessor :drawing_color
  attr_reader :draws,:texts
  def initialize(picker);@picker=picker;@draws=[];@texts=[];end
  def pick_helper;@picker;end
  def invalidate;end
  def draw(mode,points);@draws << [mode,points.length,drawing_color];end
  def draw_text(point,text,options={});@texts << [point.to_a,text,options];end
end

module Hito2Fixture
  SHEET={'id'=>'11111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Melamina Blanca','sku'=>'P','supplier'=>'QA','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
  EDGE=SHEET.merge('id'=>'22222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto Blanco','thicknessMm'=>1,'widthMm'=>22)
  def build_fixture(doors:4)
    @board=Fixture.board_definition;@board.entities[0].material=nil
    @board.entities.each_with_index { |face,index| face.define_singleton_method(:persistent_id) { 100+index } }
    @doors=(1..doors).map { |i| Sketchup::ComponentInstance.new(10+i,"Puerta #{i}",@board,Geom::Transformation.translation(i*30,0,0)) }
    @root=Sketchup::Group.new(1,'Bajo mesada',Sketchup::Definition.new('Bajo','bajo-root',@doors))
    @model=Hito2ModelDouble.new(Sketchup::Model.new([@root],'hito2-synthetic','Hito 2 sintético',''))
    @doors.each { |door| enable_unique(door) }
    @sheet=material(991,SHEET,Sketchup::Color.new(240,240,235));@edge=material(992,EDGE,Sketchup::Color.new(200,10,10))
    @model.materials=[@sheet,@edge]
    data={'schema'=>1,'revision'=>1,'items'=>[SHEET,EDGE]};@catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
  end
  def material(id,item,color)
    result=Hito2MaterialDouble.new(id,item['name'],color,1,nil);result.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));result
  end
  def binding_of(material);PlanosSanto::MaterialResolver.read_binding(material);end
  def enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copies=definition.entities.each_with_index.map do |face,index|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a);copy.mesh.polygons=face.mesh.polygons.map(&:dup)
        copy.material=face.material;copy.back_material=face.back_material
        id=persistent_id*1000+index;copy.define_singleton_method(:persistent_id) { id };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"isolated-#{persistent_id}",copies);self
    end
  end
  def paint_sheet_on_board!;@board.entities.first(2).each { |face| face.material=@sheet;face.back_material=@sheet };end
  def faces_of(door);door.definition.entities;end
  def edge_request(door,face_id='102',count:4,**patch)
    binding=binding_of(@edge)
    {'mode'=>'edge','immediate'=>true,'edgeCount'=>count,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>[face_id]}],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  def sheet_request(door,**patch)
    binding=binding_of(@sheet)
    {'mode'=>'sheet','immediatePiece'=>true,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>['100']}],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  def tool_options(mode='edge',**patch)
    binding=binding_of(mode=='edge' ? @edge : @sheet)
    {'mode'=>mode,'side'=>'both','scope'=>'unique','axes'=>[0,1],'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>mode=='sheet' ? 1 : 4,
     'batch'=>false,'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>false,
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  # A side split in two coplanar faces (rebaje/geometría sucia): x=0 becomes
  # 106+107 and, as in SketchUp, both broad faces gain the split vertex.
  def split_x_min_side!(definition=@board)
    faces=definition.entities;faces.delete_at(4);z=0.75
    [[[[0,0,0],[0,8,0],[0,16,0],[24,16,0],[24,0,0]],[0,0,-1],[[1,2,5],[2,4,5],[2,3,4]]],
     [[[0,0,z],[24,0,z],[24,16,z],[0,16,z],[0,8,z]],[0,0,1],[[1,2,5],[5,2,3],[5,3,4]]]].each_with_index do |(points,normal,polygons),index|
      face=Sketchup::Face.new(points,normal);face.mesh.polygons=polygons;id=100+index
      face.define_singleton_method(:persistent_id) { id };face.material=faces[index].material;face.back_material=faces[index].back_material
      faces[index]=face
    end
    halves=[[[0,0,0],[0,0,0.75],[0,8,0.75],[0,8,0]],[[0,8,0],[0,8,0.75],[0,16,0.75],[0,16,0]]].each_with_index.map do |points,index|
      face=Sketchup::Face.new(points,[-1,0,0]);id=106+index;face.define_singleton_method(:persistent_id) { id };face
    end
    faces.concat(halves)
  end
  def hover_on(door,face_index=2)
    face=faces_of(door)[face_index];@picker.path=[@root,door,face];@picker.leaf=face
    @tool.onMouseMove(0,40,50,@view)
  end
  def click_on(door,face_index=2)
    face=faces_of(door)[face_index];@picker.path=[@root,door,face];@picker.leaf=face
    @tool.onLButtonDown(0,40,50,@view)
  end
  def build_tool(options,**extra)
    @events=[];@picker=Hito2Picker.new;@view=Hito2View.new(@picker)
    @model.define_singleton_method(:select_tool) { |tool| @hito2_tool=tool }
    @tool=PlanosSanto::SmartPaintTool.new(@model,service:@smart,options:options,on_event:lambda { |event| @events << event },guard:lambda { true },**extra)
    @tool.activate;@tool
  end
end

class Hito2EdgeCountTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;end
  def test_four_edges_in_one_click_are_previewed_on_hover_and_make_one_undo
    build_tool(tool_options('edge'))
    undo=@model.undo_states.length
    hover_on(@doors[0])
    assert_equal %w[102 103 104 105],@tool.status['hover']['expandedFaceIds'].sort
    assert_equal 4,@tool.status['hover']['edgeCount'];assert_equal true,@tool.status['hover']['verdict']['ok']
    @tool.draw(@view)
    assert_equal 4*6,@view.draws.find { |mode,_| mode==4 }[1] # four sides, two triangles each
    click_on(@doors[0])
    assert_nil @events.last['error'];assert @events.last['changed']
    assert_equal undo+1,@model.undo_states.length
    painted=faces_of(@doors[0]);assert painted.drop(2).all? { |face| face.material.equal?(@edge) && face.back_material.equal?(@edge) }
    assert painted.first(2).all? { |face| face.material.equal?(@sheet) }
    assert @board.entities.drop(2).none? { |face| face.material.equal?(@edge) } # unique: the other doors keep their edges
    @model.undo;assert_same @board,@doors[0].definition
  end
  def test_two_opposite_edges_from_the_pointed_side
    build_tool(tool_options('edge','edgeCount'=>2))
    hover_on(@doors[1],4)
    assert_equal %w[104 105],@tool.status['hover']['expandedFaceIds']
    click_on(@doors[1],4)
    assert_equal [@edge,@edge],faces_of(@doors[1]).values_at(4,5).map(&:material)
    assert faces_of(@doors[1]).values_at(2,3).none? { |face| face.material.equal?(@edge) }
  end
  def test_split_side_blocks_four_and_two_edges_with_reason_and_never_paints_half
    split_x_min_side!
    before=@board.entities.map { |face| [face.material,face.back_material] };operations=@model.operations.length
    [4,2].each do |count|
      error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(edge_request(@doors[0],'102',count:count)) }
      assert_match(/caras físicas únicas/,error.message)
    end
    assert_equal operations,@model.operations.length;assert_equal before,@board.entities.map { |face| [face.material,face.back_material] }
    build_tool(tool_options('edge'))
    hover_on(@doors[0])
    verdict=@tool.status['hover']['verdict'];refute verdict['ok'];assert_match(/caras físicas únicas/,verdict['reason'])
    click_on(@doors[0])
    assert_match(/caras físicas únicas/,@events.last['error']);assert_equal operations,@model.operations.length
    assert_equal before,@board.entities.map { |face| [face.material,face.back_material] };assert @tool.status['active']
  end
  def test_one_edge_on_a_split_half_still_paints_only_that_half
    split_x_min_side!
    index=@board.entities.index { |face| face.persistent_id==106 }
    @smart.apply_immediate(edge_request(@doors[0],'106',count:1))
    assert_equal [index],faces_of(@doors[0]).each_index.select { |i| faces_of(@doors[0])[i].material.equal?(@edge) }
  end
  def test_ctrl_tab_cycles_edge_count_remembers_it_and_never_deactivates
    remembered=[]
    build_tool(tool_options('edge','edgeCount'=>1),remember:lambda { |options| remembered << options['edgeCount'] })
    ctrl=PlanosSanto::SmartPaintTool::CTRL_MASK;shift=PlanosSanto::SmartPaintTool::SHIFT_MASK
    assert @tool.onKeyDown(9,1,ctrl,@view);assert_equal 2,@tool.status['options']['edgeCount']
    @tool.onKeyDown(9,1,ctrl,@view);assert_equal 4,@tool.status['options']['edgeCount']
    @tool.onKeyDown(9,1,ctrl,@view);assert_equal 1,@tool.status['options']['edgeCount']
    @tool.onKeyDown(9,1,ctrl|shift,@view);assert_equal 4,@tool.status['options']['edgeCount']
    @tool.onKeyDown(9,2,ctrl,@view);assert_equal 4,@tool.status['options']['edgeCount'] # key repeat ignored
    assert_equal [2,4,1,4],remembered;assert_equal 4,@events.last['options']['edgeCount']
    assert @tool.status['active'];assert_empty @model.operations
    hover_on(@doors[0]);assert_equal 4,@tool.status['hover']['expandedFaceIds'].length
  end
  def test_ctrl_tab_in_sheet_mode_explains_and_changes_nothing
    build_tool(tool_options('sheet'))
    @tool.onKeyDown(9,1,PlanosSanto::SmartPaintTool::CTRL_MASK,@view)
    assert_equal 1,@tool.status['options']['edgeCount'];assert_equal 'sheet',@tool.status['mode']
    assert_match(/modo canto/,@events.last['message']);assert @tool.status['active']
  end
  def test_sheet_hover_previews_only_the_two_broad_faces
    build_tool(tool_options('sheet'))
    hover_on(@doors[0],3)
    assert_equal %w[100 101],@tool.status['hover']['expandedFaceIds']
    @tool.draw(@view);assert_equal 2*6,@view.draws.find { |mode,_| mode==4 }[1]
  end
end
