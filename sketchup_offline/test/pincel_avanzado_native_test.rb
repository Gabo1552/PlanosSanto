# frozen_string_literal: true
# Hito 7 · PINTURA-15 (varias caras por lado) with API doubles only: real
# SmartPaint/NativePaint/SmartPaintTool over synthetic grid boards. Nothing
# here claims SketchUp execution.
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'

class AvanzadoMaterialDouble < Sketchup::Material
  attr_accessor :binding
  def get_attribute(dict,key,_default=nil)
    dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY ? binding : nil
  end
end
class AvanzadoModelDouble < NamingModelDouble
  attr_accessor :materials
  def add_observer(_observer);true;end
  def remove_observer(_observer);true;end
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
class AvanzadoPicker
  attr_accessor :path,:leaf
  def do_pick(_x,_y);end
  def count;path ? 1 : 0;end
  def path_at(_index);path;end
  def leaf_at(_index);leaf;end
end
class AvanzadoView
  attr_accessor :drawing_color
  def initialize(picker);@picker=picker;end
  def pick_helper;@picker;end
  def invalidate;end
  def draw(*_args);end
  def draw_text(*_args);end
end

module AvanzadoFixture
  SHEET={'id'=>'31111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Melamina Gris','sku'=>'P','supplier'=>'QA','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
  EDGE=SHEET.merge('id'=>'32222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto Gris','thicknessMm'=>1,'widthMm'=>22)
  # Same order and ids as Fixture.board_definition: 100 z=0, 101 z=max, 102 y=0, 103 y=max, 104 x=0, 105 x=max.
  SIDES=[[2,'min'],[2,'max'],[1,'min'],[1,'max'],[0,'min'],[0,'max']].freeze
  # A closed 24 x 16 x 0.75 in box meshed on a shared grid (no T-junctions, as
  # SketchUp welds split vertices). parts: {[axis,side]=>lambda{|center| label}}
  # splits a side in several faces; normals: {label=>[x,y,z]} overrides one.
  def grid_board(cuts:{0=>[0,12,24],1=>[0,8,12,16],2=>[0,0.75]},parts:{},normals:{},drop:[])
    labels={};faces=[];extra=106
    SIDES.each_with_index do |(axis,side),index|
      u=(axis+1)%3;v=(axis+2)%3;at=side=='min' ? cuts[axis].first : cuts[axis].last
      cells=Hash.new { |hash,key| hash[key]=[] }
      cuts[u].each_cons(2) do |u0,u1|
        cuts[v].each_cons(2) do |v0,v1|
          corner=lambda { |a,b| p=[0,0,0];p[axis]=at;p[u]=a;p[v]=b;p }
          quad=[corner.(u0,v0),corner.(u1,v0),corner.(u1,v1),corner.(u0,v1)];quad.reverse! if side=='min'
          center=[0,0,0];center[axis]=at;center[u]=(u0+u1)/2.0;center[v]=(v0+v1)/2.0
          cells[parts.fetch([axis,side],->(_c) { :main }).call(center)] << quad
        end
      end
      cells.each_with_index do |(label,quads),position|
        name=label==:main ? index : label;next if drop.include?(name)
        normal=[0,0,0];normal[axis]=side=='min' ? -1 : 1
        face=Sketchup::Face.new(quads.flatten(1),normals.fetch(name,normal))
        face.mesh.polygons=quads.each_index.flat_map { |k| [[4*k+1,4*k+2,4*k+3],[4*k+1,4*k+3,4*k+4]] }
        id=position.zero? ? 100+index : (extra+=1)-1;face.define_singleton_method(:persistent_id) { id }
        labels[name]=face;faces << face
      end
    end
    @labels=labels;Sketchup::Definition.new('Tablón grilla',"grid-#{object_id}",faces)
  end
  def half_x_min;{[0,'min']=>->(c) { c[1]<8 ? :main : :half }};end
  def build(board,doors:3,scale:nil)
    @board=board
    @doors=(1..doors).map do |i|
      t=Geom::Transformation.translation(i*60,0,0);t=t*Geom::Transformation.scale(*scale) if scale && i==1
      Sketchup::ComponentInstance.new(10+i,"Puerta #{i}",@board,t)
    end
    @root=Sketchup::Group.new(1,'Bajo mesada',Sketchup::Definition.new('Bajo','bajo-avanzado',@doors))
    @model=AvanzadoModelDouble.new(Sketchup::Model.new([@root],'avanzado-synthetic','Hito 7 sintético',''))
    @doors.each { |door| enable_unique(door) }
    @sheet=material(993,SHEET,Sketchup::Color.new(120,120,120));@edge=material(994,EDGE,Sketchup::Color.new(90,90,90))
    @model.materials=[@sheet,@edge]
    data={'schema'=>1,'revision'=>1,'items'=>[SHEET,EDGE]};@catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog);@native=@smart.native
  end
  def material(id,item,color)
    result=AvanzadoMaterialDouble.new(id,item['name'],color,1,nil);result.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));result
  end
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
  def broad_ids;@board.entities.select { |f| f.normal.to_a[2].abs==1 }.map(&:persistent_id);end
  def paint_sheet!;@board.entities.each { |f| (f.material=@sheet;f.back_material=@sheet) if f.normal.to_a[2].abs==1 };end
  def binding_of(material);PlanosSanto::MaterialResolver.read_binding(material);end
  def edge_request(door,face_id,count:)
    b=binding_of(@edge)
    {'mode'=>'edge','immediate'=>true,'edgeCount'=>count,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>[face_id.to_s]}],'catalogId'=>b['catalogId'],'materialUuid'=>b['uuid']}
  end
  def sheet_request(door)
    b=binding_of(@sheet)
    {'mode'=>'sheet','immediatePiece'=>true,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>['100']}],'catalogId'=>b['catalogId'],'materialUuid'=>b['uuid']}
  end
  def node(door);{'_entity'=>door,'_parents'=>[@root],'id'=>"1/#{door.persistent_id}"};end
  def face(door,id);door.definition.entities.find { |f| f.persistent_id==id };end
  # Ids of the original board faces painted on an isolated door (copies carry door*1000+index).
  def painted(door,material=@edge);door.definition.entities.select { |f| f.material.equal?(material) && f.back_material.equal?(material) }.map { |f| @board.entities[f.persistent_id%1000].persistent_id }.sort;end
  def finishes;@model.all_instances.flat_map { |e| e.definition.entities.grep(Sketchup::Face) }.uniq.map { |f| [f,f.material,f.back_material] };end
  def tool_options(mode,count=4)
    b=binding_of(mode=='edge' ? @edge : @sheet)
    {'mode'=>mode,'side'=>'both','scope'=>'unique','axes'=>[0,1],'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>mode=='sheet' ? 1 : count,
     'batch'=>false,'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>false,'catalogId'=>b['catalogId'],'materialUuid'=>b['uuid']}
  end
  def hover(options,door,face_id)
    @events=[];@picker=AvanzadoPicker.new;@view=AvanzadoView.new(@picker);@model.define_singleton_method(:select_tool) { |_tool| }
    @tool=PlanosSanto::SmartPaintTool.new(@model,service:@smart,options:options,on_event:lambda { |event| @events << event },guard:lambda { true });@tool.activate
    target=face(door,face_id);@picker.path=[@root,door,target];@picker.leaf=target
    @tool.onMouseMove(0,40,50,@view);@tool.status['hover']
  end
  def click!;@tool.onLButtonDown(0,40,50,@view);@events.last;end
  def assert_refused(pattern)
    before=finishes;operations=@model.operations.length;undo=@model.undo_states.length
    error=assert_raises(PlanosSanto::ExportError) { yield }
    assert_match(pattern,error.message)
    assert_equal operations,@model.operations.length;assert_equal undo,@model.undo_states.length;assert_equal before,finishes
    error
  end
end

class PincelAvanzadoSplitSideTest < Minitest::Test
  include AvanzadoFixture
  GAP=/\AUn lado no está cubierto por caras planas completas \(rebaje o geometría abierta\)\. Revisá la pieza; no se pintó nada\.\z/
  def setup;build(grid_board(parts:half_x_min),doors:4);paint_sheet!;end
  def test_frame_reports_every_side_complete_and_keeps_groups
    frame=@native.boundary_frame(node(@doors[0]),{'axes'=>[0,1]})
    assert_equal [104,106],frame[:groups][[0,'min']].map(&:persistent_id).sort
    assert_equal 6,frame[:complete].length;assert frame[:complete].values.all?(true)
  end
  def test_four_edges_paint_both_halves_in_one_undo
    undo=@model.undo_states.length
    assert @smart.apply_immediate(edge_request(@doors[0],102,count:4))['changed']
    assert_equal undo+1,@model.undo_states.length
    assert_equal [102,103,104,105,106],painted(@doors[0]) # both halves of x=0
    assert_equal broad_ids.sort,painted(@doors[0],@sheet)
    assert @board.entities.none? { |f| f.material.equal?(@edge) } # other doors untouched
    @model.undo;assert_same @board,@doors[0].definition
  end
  def test_two_edges_from_either_half_or_its_opposite_paint_the_whole_axis
    [[104,0],[106,1],[105,2]].each do |id,door|
      undo=@model.undo_states.length
      assert @smart.apply_immediate(edge_request(@doors[door],id,count:2))['changed']
      assert_equal undo+1,@model.undo_states.length
      assert_equal [104,105,106],painted(@doors[door])
    end
  end
  def test_one_edge_on_a_half_paints_the_whole_side_only
    assert @smart.apply_immediate(edge_request(@doors[0],106,count:1))['changed']
    assert_equal [104,106],painted(@doors[0])
    assert_equal [102],@native.expanded_faces(node(@doors[1]),[face(@doors[1],102)],{'mode'=>'edge','axes'=>[0,1],'edgeCount'=>1}).map(&:persistent_id)
  end
  def test_hover_verdict_lists_every_face_of_the_sides
    assert_equal %w[102 103 104 105 106],hover(tool_options('edge',4),@doors[1],106)['expandedFaceIds'].sort
    assert @tool.status['hover']['verdict']['ok']
    assert_equal %w[104 106],hover(tool_options('edge',1),@doors[1],104)['expandedFaceIds'].sort
    undo=@model.undo_states.length;assert click!['changed'];assert_equal undo+1,@model.undo_states.length
  end
end

# F-PINT-A on split sides: repainting an already finished shared door is a real
# no-op (no make_unique, no Undo); a half-painted side isolates once and paints it whole.
class PincelAvanzadoSharedNoOpTest < Minitest::Test
  include AvanzadoFixture
  def setup;build(grid_board(parts:half_x_min),doors:4);paint_sheet!;end
  def definitions;@doors.map(&:definition);end
  def test_split_sides_already_painted_on_every_copy_make_no_undo_and_no_definition
    assert @smart.apply_immediate(edge_request(@doors[0],102,count:4).merge('scope'=>'all','allowShared'=>true))['changed']
    before=definitions;undo=@model.undo_states.length;operations=@model.operations.length
    @doors.each { |door| door.define_singleton_method(:make_unique) { raise 'make_unique must not run for a no-op' } }
    [{'scope'=>'unique'},{'scope'=>'all','allowShared'=>true}].each do |patch|
      [[102,4],[106,1],[104,2]].each do |id,count|
        result=@smart.apply_immediate(edge_request(@doors[2],id,count:count).merge(patch))
        refute result['changed'];assert result['noChanges']
      end
    end
    assert_equal undo,@model.undo_states.length;assert_equal operations,@model.operations.length;assert_equal before,definitions
  end
  def test_one_painted_half_still_isolates_once_and_paints_the_whole_side
    @board.entities.find { |f| f.persistent_id==104 }.tap { |f| f.material=@edge;f.back_material=@edge }
    undo=@model.undo_states.length
    assert @smart.apply_immediate(edge_request(@doors[1],104,count:1))['changed']
    assert_equal undo+1,@model.undo_states.length;refute_same @board,@doors[1].definition
    assert_equal [104,106],painted(@doors[1]);assert_equal 2,definitions.uniq.length
  end
end

class PincelAvanzadoRebateTest < Minitest::Test
  include AvanzadoFixture
  GAP=PincelAvanzadoSplitSideTest::GAP
  # x=0 in three faces; the last strip (y 12..16) is not an axis face, so the
  # side's planar faces cover 3/4 of it: an incomplete side, never "the side".
  def setup
    build(grid_board(parts:{[0,'min']=>->(c) { c[1]<8 ? :main : c[1]<12 ? :half : :strip }},normals:{strip:[-1,0.01,0]}));paint_sheet!
  end
  def test_frame_marks_only_that_side_incomplete
    complete=@native.boundary_frame(node(@doors[0]),{'axes'=>[0,1]})[:complete]
    refute complete[[0,'min']];assert complete.reject { |key,_| key==[0,'min'] }.values.all?(true)
  end
  def test_four_and_two_edges_on_that_axis_are_refused_without_operation
    [[102,4],[104,2],[106,2],[105,2]].each { |id,count| assert_refused(GAP) { @smart.apply_immediate(edge_request(@doors[0],id,count:count)) } }
    assert @smart.apply_immediate(edge_request(@doors[0],102,count:2))['changed'] # the y axis is complete
  end
  def test_one_edge_paints_only_the_pointed_face
    assert @smart.apply_immediate(edge_request(@doors[0],106,count:1))['changed']
    assert_equal [106],painted(@doors[0])
  end
  def test_hover_blocks_four_edges_with_the_reason_and_the_click_never_paints
    verdict=hover(tool_options('edge',4),@doors[1],102)['verdict']
    refute verdict['ok'];assert_match(GAP,verdict['reason']);assert_empty @tool.status['hover']['expandedFaceIds']
    before=finishes;event=click!;assert_match(GAP,event['error']);assert_empty @model.operations;assert_equal before,finishes
    assert_equal %w[104],hover(tool_options('edge',1),@doors[1],104)['expandedFaceIds']
  end
  def test_a_missing_face_is_still_refused_by_the_rectangular_check
    build(grid_board(parts:half_x_min,drop:[:half]));paint_sheet!
    [1,2,4].each { |count| assert_refused(/rectangular/) { @smart.apply_immediate(edge_request(@doors[0],104,count:count)) } }
  end
end

class PincelAvanzadoSheetTest < Minitest::Test
  include AvanzadoFixture
  BROAD=/\ALas caras anchas no cubren la placa completa\. Usá pintar Cara\.\z/
  def half_bottom;{[2,'min']=>->(c) { c[0]<12 ? :main : :bottom }};end
  def test_piece_mode_paints_every_broad_face_in_one_undo
    build(grid_board(parts:half_bottom));undo=@model.undo_states.length
    assert @smart.apply_immediate(sheet_request(@doors[0]))['changed'];assert_equal undo+1,@model.undo_states.length
    assert_equal [100,101,106],painted(@doors[0],@sheet) # both bottom halves and the top
    assert_equal %w[100 101 106],hover(tool_options('sheet'),@doors[1],103)['expandedFaceIds'].sort
  end
  def test_broad_faces_that_do_not_cover_the_board_are_refused
    build(grid_board(parts:half_bottom,normals:{bottom:[0.01,0,-1]}))
    assert_refused(BROAD) { @smart.apply_immediate(sheet_request(@doors[0])) }
    verdict=hover(tool_options('sheet'),@doors[0],101)['verdict'];refute verdict['ok'];assert_match(BROAD,verdict['reason'])
    assert_match(BROAD,click!['error']);assert_empty @model.operations
  end
  # Hinge cups / shelf pins: the broad face mesh loses area but its outer loop
  # still spans the board. Coverage reads the outer loop, so Pieza still paints.
  Vertex=Struct.new(:position)
  def drill!(face,lost_mm2)
    real=@native.method(:face_data)
    @native.define_singleton_method(:face_data) { |f| data=real.call(f);f.equal?(face) ? data.merge('areaMm2'=>data['areaMm2']-lost_mm2) : data }
  end
  def test_a_drilled_broad_face_still_paints_when_its_outer_loop_covers_the_board
    build(grid_board);bottom=face(@doors[0],100)
    drill!(bottom,3*962.0) # three 35 mm cups
    assert_refused(BROAD) { @smart.apply_immediate(sheet_request(@doors[0])) } # mesh area alone would refuse
    corners=[[0,0,0],[24,0,0],[24,16,0],[0,16,0]].map { |point| Vertex.new(point) }
    bottom.define_singleton_method(:outer_loop) { Struct.new(:vertices).new(corners) }
    assert @smart.apply_immediate(sheet_request(@doors[0]))['changed']
    assert_equal [100,101],painted(@doors[0],@sheet)
  end
  def test_an_outer_loop_short_of_the_side_is_refused
    build(grid_board);bottom=face(@doors[0],100)
    corners=[[0,0,0],[23,0,0],[23,16,0],[0,16,0]].map { |point| Vertex.new(point) } # a 1 in rebate along x
    bottom.define_singleton_method(:outer_loop) { Struct.new(:vertices).new(corners) }
    assert_refused(BROAD) { @smart.apply_immediate(sheet_request(@doors[0])) }
  end
end

class PincelAvanzadoScaleTest < Minitest::Test
  include AvanzadoFixture
  GAP=PincelAvanzadoSplitSideTest::GAP
  # Door 1 is stretched 3x along x and 2x along y: coverage uses local areas and bounds.
  def test_scaled_instance_still_sees_complete_split_sides
    build(grid_board(parts:half_x_min),scale:[3,2,1]);paint_sheet!
    frame=@native.boundary_frame(node(@doors[0]),{'axes'=>@native.automatic_axes(node(@doors[0]))})
    assert frame[:complete].values.all?(true)
    assert_equal %w[102 103 104 105 106],hover(tool_options('edge',4),@doors[0],104)['expandedFaceIds'].sort
    assert @smart.apply_immediate(edge_request(@doors[0],104,count:4))['changed'];assert_equal [102,103,104,105,106],painted(@doors[0])
  end
  def test_scaled_instance_with_an_incomplete_side_is_refused
    build(grid_board(parts:{[0,'min']=>->(c) { c[1]<12 ? :main : :strip }},normals:{strip:[-1,0.01,0]}),scale:[3,2,1]);paint_sheet!
    assert_refused(GAP) { @smart.apply_immediate(edge_request(@doors[0],102,count:4)) }
    refute hover(tool_options('edge',4),@doors[0],102)['verdict']['ok']
  end
end
