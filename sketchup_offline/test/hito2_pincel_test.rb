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

class Hito2ScopeTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;end
  def definitions;@doors.map(&:definition);end
  def test_all_identical_doors_paint_in_one_undo_without_make_unique
    before=definitions;undo=@model.undo_states.length
    @doors.each { |door| door.define_singleton_method(:make_unique) { raise 'make_unique must not run for scope all' } }
    result=@smart.apply_immediate(sheet_request(@doors[2],'scope'=>'all','allowShared'=>true))
    assert result['changed'];assert_equal undo+1,@model.undo_states.length
    assert_equal before,definitions;assert definitions.all? { |definition| definition.equal?(@board) }
    assert @doors.all? { |door| faces_of(door).first(2).all? { |face| face.material.equal?(@sheet) && face.back_material.equal?(@sheet) } }
    assert_equal @doors.map { |door| "1/#{door.persistent_id}" }.sort,result['affectedPaths'].sort
    @model.undo;assert @board.entities.first(2).none? { |face| face.material.equal?(@sheet) }
  end
  def test_all_without_authorization_in_the_same_request_falls_back_to_one_isolated_door
    undo=@model.undo_states.length
    result=@smart.apply_immediate(sheet_request(@doors[0],'scope'=>'all'))
    assert result['changed'];assert result['unique'];assert_equal undo+1,@model.undo_states.length
    refute_same @board,@doors[0].definition;assert @doors.drop(1).all? { |door| door.definition.equal?(@board) }
    assert faces_of(@doors[0]).first(2).all? { |face| face.material.equal?(@sheet) }
    assert @board.entities.first(2).none? { |face| face.material.equal?(@sheet) }
  end
  def test_unique_isolates_only_the_clicked_door
    @smart.apply_immediate(sheet_request(@doors[1],'scope'=>'unique','allowShared'=>false))
    assert_equal 2,definitions.uniq.length;refute_same @board,@doors[1].definition
  end
  def test_repainting_already_painted_doors_is_a_real_no_op_for_all_and_unique
    @smart.apply_immediate(sheet_request(@doors[0],'scope'=>'all','allowShared'=>true))
    undo=@model.undo_states.length;operations=@model.operations.length;before=definitions
    [{'scope'=>'all','allowShared'=>true},{'scope'=>'unique'}].each do |patch|
      result=@smart.apply_immediate(sheet_request(@doors[3],**patch.transform_keys(&:to_sym)))
      refute result['changed'];assert result['noChanges']
    end
    assert_equal undo,@model.undo_states.length;assert_equal operations,@model.operations.length;assert_equal before,definitions
  end
  def test_four_edges_on_all_copies_in_one_click
    paint_sheet_on_board!;undo=@model.undo_states.length
    result=@smart.apply_immediate(edge_request(@doors[0],'102',count:4,scope:'all',allowShared:true))
    assert result['changed'];assert_equal undo+1,@model.undo_states.length
    assert @board.entities.drop(2).all? { |face| face.material.equal?(@edge) };assert definitions.all? { |definition| definition.equal?(@board) }
  end
  def test_tool_hover_reports_shared_count_and_highlights_every_copy_only_when_authorized
    build_tool(tool_options('sheet'))
    hover_on(@doors[0]);@tool.draw(@view)
    assert_equal 4,@tool.status['hover']['sharedCount'];assert_equal 'unique',@tool.status['hover']['scope']
    assert_equal 1,@view.draws.count { |mode,_| mode==4 }
    @view.draws.clear
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    hover_on(@doors[0]);@tool.draw(@view)
    assert_equal 'all',@tool.status['hover']['scope'];assert_equal 4,@tool.status['hover']['sharedCount']
    assert_equal 2*6*4,@view.draws.select { |mode,_| mode==4 }.sum { |_,count| count } # 2 broad faces on 4 copies
    undo=@model.undo_states.length;click_on(@doors[0])
    assert @events.last['changed'];assert_equal undo+1,@model.undo_states.length;assert definitions.all? { |definition| definition.equal?(@board) }
    assert @doors.all? { |door| faces_of(door).first(2).all? { |face| face.material.equal?(@sheet) } }
    click_on(@doors[1]);refute @events.last['changed'];assert_equal undo+1,@model.undo_states.length
  end
  def test_arrow_material_change_resets_the_all_copies_authorization
    other={'catalogId'=>'otra','materialUuid'=>'otra-uuid','name'=>'Otra'}
    @smart.define_singleton_method(:material_choices) { |_data| [other] }
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    @tool.onKeyDown(39,1,0,@view)
    assert_equal 'unique',@tool.status['options']['scope'];assert_equal 'otra-uuid',@tool.status['options']['materialUuid']
    assert_equal false,@tool.instance_variable_get(:@options)['allowShared']
  end
end

class Hito2TabTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;end
  def test_tab_alternates_sheet_and_edge_with_the_last_material_of_each_mode
    asked=[];edge=tool_options('edge','edgeCount'=>2);sheet=tool_options('sheet')
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true),switch_mode:lambda { |mode| asked << mode;mode=='edge' ? edge : sheet })
    hover_on(@doors[0])
    assert @tool.onKeyDown(9,1,0,@view)
    assert_equal 'edge',@tool.status['mode'];assert_equal binding_of(@edge)['uuid'],@tool.status['options']['materialUuid']
    assert_equal 2,@tool.status['options']['edgeCount'];assert_equal 'unique',@tool.status['options']['scope']
    assert_nil @tool.status['hover'];assert @tool.status['active'];assert_equal 'edge',@events.last['options']['mode']
    @tool.onKeyDown(9,1,PlanosSanto::SmartPaintTool::SHIFT_MASK,@view);assert_equal 'sheet',@tool.status['mode']
    @tool.onKeyDown(9,2,0,@view);assert_equal 'sheet',@tool.status['mode'] # repeat ignored
    assert_equal %w[edge sheet],asked;assert_empty @model.operations
  end
  def test_tab_without_a_remembered_material_or_with_an_unready_one_keeps_the_mode
    build_tool(tool_options('sheet'),switch_mode:lambda { |_mode| nil })
    @tool.onKeyDown(9,1,0,@view)
    assert_equal 'sheet',@tool.status['mode'];assert_match(/Elegí un canto en la paleta para usar Tab/,@events.last['message']);assert @tool.status['active']
    build_tool(tool_options('edge'),switch_mode:lambda { |_mode| raise PlanosSanto::ExportError,'«Melamina» no está instalada en este modelo.' })
    @tool.onKeyDown(9,1,0,@view)
    assert_equal 'edge',@tool.status['mode'];assert_match(/no está instalada/,@events.last['error']);assert @tool.status['active']
    build_tool(tool_options('remove_edge'),switch_mode:lambda { |mode| mode=='sheet' ? tool_options('sheet') : nil })
    @tool.onKeyDown(9,1,0,@view);assert_equal 'sheet',@tool.status['mode']
  end
end

# Optional native APIs the doubles lack; real SketchUp provides them.
module Sketchup
  class << self;attr_accessor :hito2_status_texts;end
  def self.status_text=(text);(self.hito2_status_texts||=[]) << text;end
end
module UI
  class << self;attr_accessor :hito2_created,:hito2_set,:hito2_timers;end
  def self.create_cursor(path,x,y);(self.hito2_created||=[]) << [File.basename(path),x,y];1000+hito2_created.length;end
  def self.set_cursor(id);(self.hito2_set||=[]) << id;true;end
  def self.scale_factor;2.0;end
  def self.start_timer(delay,repeat,&block);(self.hito2_timers||=[]) << [delay,repeat,block];hito2_timers.length;end
end

class Hito2FeedbackTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;Sketchup.hito2_status_texts=[];UI.hito2_set=[];UI.hito2_timers=[];end
  def test_status_bar_shows_mode_material_scope_and_last_error_only_when_it_changes
    build_tool(tool_options('sheet'))
    hover_on(@doors[0])
    assert_equal 'Pintar pieza · Melamina Blanca · Solo esta (de 4)',Sketchup.hito2_status_texts.last
    count=Sketchup.hito2_status_texts.length;5.times { @tool.onMouseMove(0,41,51,@view) }
    assert_equal count,Sketchup.hito2_status_texts.length
    build_tool(tool_options('edge','scope'=>'all','allowShared'=>true))
    split_x_min_side!;click_on(@doors[0])
    assert_match(/\APintar canto · 4 cantos · Canto Blanco · Todas las iguales \(4\) · último error: Los cuatro lados/,Sketchup.hito2_status_texts.last)
  end
  def test_two_line_tooltip_near_the_cursor_in_green_or_red
    build_tool(tool_options('edge','edgeCount'=>2))
    hover_on(@doors[0]);@tool.draw(@view)
    (first,line1,options1),(second,line2,options2)=@view.texts.last(2)
    assert_equal 'Puerta 1 · 2 cantos · Solo esta (de 4)',line1;assert_equal 'Canto Blanco',line2
    assert_equal [76.0,86.0],first.first(2).map(&:to_f) # 18 px * scale 2 from (40,50)
    assert_operator second[1],:>,first[1]
    assert_equal [0,128,0],rgb(options2[:color])
    split_x_min_side!;build_tool(tool_options('edge','edgeCount'=>4));hover_on(@doors[1]);@tool.draw(@view)
    _,line,options=@view.texts.last
    assert_match(/caras físicas únicas/,line);assert_equal [200,0,0],rgb(options[:color])
  end
  def rgb(color);color.respond_to?(:red) ? [color.red,color.green,color.blue] : color.to_a.first(3);end
  def test_preview_uses_the_real_material_color_with_own_alpha_and_red_when_blocked
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    hover_on(@doors[0]);@tool.draw(@view)
    colors=@view.draws.select { |mode,_| mode==4 }.map(&:last)
    assert_equal [[240,240,235,60],[240,240,235,110]],colors.map { |c| c.respond_to?(:red) ? [c.red,c.green,c.blue,c.alpha] : c.to_a }
    split_x_min_side!;build_tool(tool_options('edge'));hover_on(@doors[1]);@view.draws.clear;@tool.draw(@view)
    assert_equal [220,30,30,110],@view.draws.find { |mode,_| mode==4 }.last.to_a
  end
  def test_own_cursor_per_mode_and_blocked_cursor_created_once_per_process
    build_tool(tool_options('sheet'));hover_on(@doors[0]);assert @tool.onSetCursor
    build_tool(tool_options('edge'));hover_on(@doors[0]);@tool.onSetCursor
    build_tool(tool_options('remove_edge'));@tool.onSetCursor
    split_x_min_side!;build_tool(tool_options('edge'));hover_on(@doors[1]);@tool.onSetCursor
    build_tool(tool_options('sheet'));@tool.onSetCursor
    names=UI.hito2_created.map(&:first)
    assert_equal %w[paint-blocked.png paint-edge.png paint-piece.png paint-remove.png],names.sort;assert UI.hito2_created.all? { |_,x,y| [x,y]==[3,3] }
    ids=UI.hito2_created.to_h { |name,_,_| [name,1000+UI.hito2_created.index { |row| row.first==name }+1] }
    assert_equal ids.values_at('paint-piece.png','paint-edge.png','paint-remove.png','paint-blocked.png','paint-piece.png'),UI.hito2_set
  end
end
