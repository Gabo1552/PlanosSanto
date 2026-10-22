# frozen_string_literal: true
# Hito 7 (pincel avanzado, DISENO_AVANZADO.md §2) with API doubles only: real
# SmartPaint/NativePaint and SmartPaintTool over synthetic boards. Nothing here
# claims SketchUp execution.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'

class PavMaterial < Sketchup::Material
  attr_accessor :binding
  def get_attribute(dict,key,_default=nil)
    dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY ? binding : nil
  end
end
class PavModel < NamingModelDouble
  attr_accessor :materials
  attr_reader :observers
  def add_observer(observer);(@observers||=[]) << observer;true;end
  def remove_observer(observer);(@observers||=[]).delete(observer);true;end
  def state
    super.merge(definitions:all_instances.map { |entity| [entity,entity.definition] },hidden:all_instances.map { |entity| [entity,entity.hidden] },
                faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:definitions].each { |entity,definition| entity.definition=definition }
    snapshot[:hidden].each { |entity,hidden| entity.hidden=hidden }
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
  def starts;operations.select { |row| row.first==:start };end
end
# Several pick entries (front to back), each with its own path and leaf.
class PavPicker
  attr_accessor :entries
  attr_reader :picks
  def initialize;@entries=[];@picks=0;end
  def do_pick(_x,_y);@picks+=1;end
  def count;entries.length;end
  def path_at(index);entries[index] && entries[index][0];end
  def leaf_at(index);entries[index] && entries[index][1];end
end
class PavPlainView
  attr_accessor :drawing_color
  attr_reader :draws,:texts
  def initialize(picker);@picker=picker;@draws=[];@texts=[];end
  def pick_helper;@picker;end
  def invalidate;end
  def draw(mode,points);@draws << [mode,points.length,drawing_color];end
  def draw_text(point,text,options={});@texts << [point.to_a,text,options];end
end
class PavView < PavPlainView
  attr_reader :draws2d,:widths
  def initialize(picker);super;@draws2d=[];@widths=[];end
  def vpheight;600;end
  def vpwidth;800;end
  def line_width=(value);@widths << value;end
  def draw2d(mode,points);@draws2d << [mode,points.map { |p| p.to_a.first(2) },drawing_color,@widths.last];end
end
class PavMenu
  attr_reader :items,:separators,:validations
  def initialize;@items=[];@separators=0;@validations={};end
  def add_item(text,&block);@items << [text,block];@items.length;end
  def add_separator;@separators+=1;end
  def set_validation_proc(id,&block);@validations[id]=block;end
  def texts;@items.map(&:first);end
  def choose(text);@items.find { |label,_| label==text }.last.call;end
  def check(text);@validations[@items.index { |label,_| label==text }+1].call;end
end

module Sketchup
  class << self;attr_accessor :pav_status_texts;end
  def self.status_text=(text);(self.pav_status_texts||=[]) << text;end
end
module UI
  class << self;attr_accessor :pav_created,:pav_inputbox,:pav_inputbox_calls;end
  def self.create_cursor(path,x,y);(self.pav_created||=[]) << [File.basename(path),x,y];2000+pav_created.length;end
  def self.set_cursor(_id);true;end
  def self.scale_factor;2.0;end
  def self.start_timer(_delay,_repeat,&_block);1;end
  def self.inputbox(prompts,defaults,title);(self.pav_inputbox_calls||=[]) << [prompts,defaults,title];pav_inputbox;end
end

module PavFixture
  SHEET={'id'=>'11111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Melamina Blanca','sku'=>'P','supplier'=>'QA','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
  EDGE=SHEET.merge('id'=>'22222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto Blanco','thicknessMm'=>1,'widthMm'=>22)
  def build_fixture(doors:4)
    @board=Fixture.board_definition;@board.entities[0].material=nil
    @board.entities.each_with_index { |face,index| face.define_singleton_method(:persistent_id) { 100+index } }
    @doors=(1..doors).map { |i| Sketchup::ComponentInstance.new(10+i,"Puerta #{i}",@board,Geom::Transformation.translation(i*30,0,0)) }
    @root=Sketchup::Group.new(1,'Bajo mesada',Sketchup::Definition.new('Bajo','bajo-root',@doors))
    @model=PavModel.new(Sketchup::Model.new([@root],'pav-synthetic','Hito 7 sintético',''))
    @doors.each { |door| enable_unique(door) }
    @sheet=material(991,SHEET,Sketchup::Color.new(240,240,235));@edge=material(992,EDGE,Sketchup::Color.new(200,10,10))
    @model.materials=[@sheet,@edge]
    data={'schema'=>1,'revision'=>1,'items'=>[SHEET,EDGE]};@catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
    @selected=[];@recent_calls=[];@remembered=[]
  end
  def material(id,item,color)
    result=PavMaterial.new(id,item['name'],color,1,nil);result.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));result
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
  def tool_options(mode='edge',**patch)
    binding=binding_of(mode=='edge' ? @edge : @sheet)
    {'mode'=>mode,'side'=>'both','scope'=>'unique','axes'=>[0,1],'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>mode=='sheet' ? 1 : 4,
     'batch'=>false,'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>false,
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  OTHER={'catalogId'=>'33333333-3333-3333-3333-333333333333','materialUuid'=>'otra-uuid','name'=>'Otra placa','color'=>[10,20,30]}
  def recents_for(mode)
    item=mode=='edge' ? @edge : @sheet;b=binding_of(item)
    first={'catalogId'=>b['catalogId'],'materialUuid'=>b['uuid'],'name'=>item.display_name,'color'=>[item.color.red,item.color.green,item.color.blue]}
    mode=='edge' ? [first] : [first,OTHER]
  end
  # Controller double: options for a catalog id and mode, never installs.
  def select_for(catalog_id,mode)
    @selected << [catalog_id,mode]
    raise PlanosSanto::ExportError,'«Otra» no está lista en este modelo.' if @refuse_select
    return tool_options(mode,'catalogId'=>catalog_id,'materialUuid'=>@wrong_uuid) if @wrong_uuid
    catalog_id==OTHER['catalogId'] ? tool_options(mode,'catalogId'=>catalog_id,'materialUuid'=>OTHER['materialUuid']) : tool_options(mode)
  end
  def build_tool(options,view: PavView,**extra)
    @events=[];@picker=PavPicker.new;@view=view.new(@picker);test=self
    defaults={select_material:lambda { |id,mode| test.select_for(id,mode) },recents:lambda { |mode| test.recent_called(mode);test.recents_for(mode) },
              remember:lambda { |o| test.remembered_options(o) }}
    @tool=PlanosSanto::SmartPaintTool.new(@model,service:@smart,options:options,on_event:lambda { |event| @events << event },guard:lambda { true },**defaults.merge(extra))
    @tool.activate;@tool
  end
  def recent_called(mode);@recent_calls << mode;end
  def remembered_options(options);@remembered << options;end
  def entry(door,face_index=0);face=faces_of(door)[face_index];[[@root,door,face],face];end
  def stack!(*entries);@picker.entries=entries;end
  def hover_on(door,face_index=0,x:400,y:300)
    stack!(entry(door,face_index));@tool.onMouseMove(0,x,y,@view)
  end
  def click_on(door,face_index=0,x:400,y:300)
    stack!(entry(door,face_index));@tool.onLButtonDown(0,x,y,@view)
  end
end

class PavRecentsTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;paint_sheet_on_board!;end
  # scale 2: 56 px squares, 6 px apart, 12 px from the left and from vpheight 600.
  def square(index);[12+index*62+28,600-12-28];end
  def test_strip_is_drawn_with_draw2d_marks_the_active_material_and_never_calls_recents_on_draw_or_move
    build_tool(tool_options('sheet'))
    assert_equal ['sheet'],@recent_calls
    hover_on(@doors[0]);@tool.draw(@view);@tool.draw(@view);@tool.onMouseMove(0,*square(1),@view)
    assert_equal ['sheet'],@recent_calls
    quads=@view.draws2d.select { |mode,| mode==7 }.first(2);loops=@view.draws2d.select { |mode,| mode==2 }.first(2)
    assert_equal [[12,532],[68,532],[68,588],[12,588]],quads[0][1].map { |p| p.map(&:round) }
    assert_equal [240,240,235],quads[0][2].to_a.first(3);assert_equal [10,20,30],quads[1][2].to_a.first(3)
    assert_equal 74,quads[1][1][0][0].round
    active,other=loops;assert_equal [0,0,0],active[2].to_a.first(3);assert_equal 2,active[3];refute_equal [0,0,0],other[2].to_a.first(3)
    assert(@view.texts.any? { |_,text,| text=='Recientes · clic o 1–6' })
    assert_equal OTHER['name'],@events.last['message'][/Otra placa/] # strip hover names the material
    assert_nil @tool.status['hover'];assert_equal 1,@tool.instance_variable_get(:@strip_hover)
    assert_equal [{'catalogId'=>OTHER['catalogId'],'materialUuid'=>'otra-uuid','name'=>'Otra placa','color'=>[10,20,30]}],@events.last['recents'].drop(1)
  end
  def test_strip_mouse_move_does_not_pick_pieces
    build_tool(tool_options('sheet'));stack!(entry(@doors[0]))
    picks=@picker.picks;@tool.onMouseMove(0,*square(0),@view)
    assert_equal picks,@picker.picks;assert_nil @tool.status['hover']
  end
  def test_click_on_a_square_changes_material_without_painting_or_operation_and_resets_scope
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    stack!(entry(@doors[0]));undo=@model.undo_states.length
    @tool.onLButtonDown(0,*square(1),@view)
    assert_equal [[OTHER['catalogId'],'sheet']],@selected
    options=@tool.status['options'];assert_equal 'otra-uuid',options['materialUuid'];assert_equal 'unique',options['scope']
    assert_equal false,@tool.instance_variable_get(:@options)['allowShared']
    assert_empty @model.operations;assert_equal undo,@model.undo_states.length
    assert faces_of(@doors[0]).drop(2).none? { |face| face.material };assert_equal %w[sheet sheet],@recent_calls
    assert_nil @events.last['error'];assert_match(/Otra placa/,@events.last['message'])
  end
  def test_number_keys_choose_recents_only_without_modifiers_or_repeat
    build_tool(tool_options('sheet'))
    assert @tool.onKeyDown(50,1,0,@view);assert_equal [[OTHER['catalogId'],'sheet']],@selected
    @tool.onKeyDown(49,2,0,@view);@tool.onKeyDown(49,1,PlanosSanto::SmartPaintTool::CTRL_MASK,@view);assert_equal 1,@selected.length
    @tool.onKeyDown(49,1,0,@view);assert_equal binding_of(@sheet)['uuid'],@tool.status['options']['materialUuid']
    @tool.onKeyDown(54,1,0,@view);assert_equal 2,@selected.length # no 6th recent: nothing changes
    assert_empty @model.operations
  end
  def test_refused_selection_reports_the_reason_and_keeps_the_material
    build_tool(tool_options('sheet'));@refuse_select=true
    @tool.onKeyDown(50,1,0,@view)
    assert_match(/no está lista/,@events.last['error']);assert_equal binding_of(@sheet)['uuid'],@tool.status['options']['materialUuid']
  end
  def test_edge_mode_asks_edge_recents_and_selects_with_edge_kind
    build_tool(tool_options('edge'));assert_equal ['edge'],@recent_calls
    @tool.onKeyDown(49,1,0,@view);assert_equal [[binding_of(@edge)['catalogId'],'edge']],@selected
  end
  def test_without_draw2d_nothing_is_drawn_and_nothing_fails
    build_tool(tool_options('sheet'),view:PavPlainView);hover_on(@doors[0])
    @tool.draw(@view);refute(@view.texts.any? { |_,text,| text.start_with?('Recientes') })
    @tool.onLButtonDown(0,40,560,@view);assert_empty @selected # no strip: a normal click
  end
  def test_remove_edge_hides_the_strip
    build_tool(tool_options('remove_edge','edgeCount'=>1,'catalogId'=>nil,'materialUuid'=>nil))
    @tool.draw(@view);assert_empty @view.draws2d;@tool.onKeyDown(49,1,0,@view);assert_empty @selected
    @tool.onLButtonDown(0,*square(0),@view);assert_empty @selected
  end
  def test_without_callbacks_the_strip_is_off
    build_tool(tool_options('sheet'),recents:nil,select_material:nil)
    @tool.draw(@view);assert_empty @view.draws2d;assert_equal [],@tool.status['recents']
  end
end

class PavEyedropperTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;paint_sheet_on_board!;UI.pav_created=[];end
  def test_alt_held_samples_an_edge_face_and_switches_mode_without_operation
    @board.entities[2].material=@edge
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    assert_equal true,@tool.onKeyDown(18,1,0,@view);assert_equal true,@tool.status['sampling'];assert_equal true,@events.last['sampling']
    assert_equal 'alt',@tool.status['eyedropperKey']
    hover_on(@doors[0],2)
    sample=@tool.status['hover']['sample'];assert_equal({'name'=>'Canto Blanco','status'=>'valid','catalogId'=>EDGE['id'],'kind'=>'edge'},sample)
    refute @tool.status['hover'].key?('verdict')
    assert @tool.onSetCursor;assert_equal 'paint-sample.png',UI.pav_created.last.first
    undo=@model.undo_states.length;click_on(@doors[0],2)
    assert_equal [[EDGE['id'],'edge']],@selected;assert_equal 'edge',@tool.status['mode'];assert_equal 'unique',@tool.status['options']['scope']
    assert_empty @model.operations;assert_equal undo,@model.undo_states.length;assert_nil @events.last['error']
    assert_equal true,@tool.onKeyUp(18,1,0,@view);assert_equal false,@tool.status['sampling'];assert_equal 'edge',@tool.status['mode']
    assert_equal binding_of(@edge)['uuid'],@tool.status['options']['materialUuid']
  end
  def test_a_click_carrying_the_held_key_samples_even_if_the_key_down_was_lost
    @board.entities[2].material=@edge
    build_tool(tool_options('sheet'));refute @tool.status['sampling']
    stack!(entry(@doors[0],2))
    undo=@model.undo_states.length;@tool.onLButtonDown(PlanosSanto::SmartPaintTool::ALT_MASK,400,300,@view)
    assert_equal [[EDGE['id'],'edge']],@selected;assert_equal 'edge',@tool.status['mode']
    assert_empty @model.operations;assert_equal undo,@model.undo_states.length
  end
  def test_sampling_from_remove_edge_names_the_new_mode_and_shift_tab_is_not_a_sample
    @board.entities[2].material=@edge
    build_tool(tool_options('remove_edge','edgeCount'=>1,'catalogId'=>nil,'materialUuid'=>nil))
    @tool.onKeyDown(18,1,0,@view);click_on(@doors[0],2)
    assert_equal 'edge',@tool.status['mode'];assert_match(/Modo: Pintar canto\./,@events.last['message']);assert_empty @model.operations
    build_tool(tool_options('sheet'),eyedropper_key:'shift',switch_mode:lambda { |_mode| nil })
    @tool.onKeyDown(16,1,PlanosSanto::SmartPaintTool::SHIFT_MASK,@view);assert @tool.status['sampling']
    @tool.onKeyDown(9,1,PlanosSanto::SmartPaintTool::SHIFT_MASK,@view);refute @tool.status['sampling']
  end
  def test_sampling_a_sheet_from_the_broad_face
    build_tool(tool_options('edge'))
    @tool.onKeyDown(18,1,0,@view);click_on(@doors[1],0)
    assert_equal [[SHEET['id'],'sheet']],@selected;assert_equal 'sheet',@tool.status['mode']
  end
  def test_material_without_binding_is_refused_with_reason_and_nothing_changes
    @board.entities[3].material=Sketchup::Material.new(55,'Sin ficha',Sketchup::Color.new(1,2,3),1,nil)
    build_tool(tool_options('sheet'));before=@tool.status['options']
    @tool.onKeyDown(18,1,0,@view);hover_on(@doors[0],3);assert_equal 'absent',@tool.status['hover']['sample']['status']
    click_on(@doors[0],3)
    assert_match(/vincul/,@events.last['error']);assert_empty @selected;assert_equal before,@tool.status['options'];assert_empty @model.operations
    @tool.onKeyDown(18,1,0,@view);click_on(@doors[0],4) # unpainted face, nothing inherited
    assert_match(/no tiene material/,@events.last['error']);assert_empty @selected
  end
  def test_returned_uuid_must_match_the_sampled_material
    build_tool(tool_options('edge'));@wrong_uuid='otro-uuid';before=@tool.status['options']
    @tool.onKeyDown(18,1,0,@view);click_on(@doors[0],0)
    assert_equal 'El material de esta cara no coincide con su ficha de biblioteca; revisalo en la biblioteca.',@events.last['error']
    assert_equal before,@tool.status['options']
  end
  def test_inherited_material_from_the_instance_is_sampled
    @board.entities.first(2).each { |face| face.material=nil;face.back_material=nil };@doors[2].material=@sheet
    build_tool(tool_options('edge'));@tool.onKeyDown(18,1,0,@view);click_on(@doors[2],1)
    assert_equal [[SHEET['id'],'sheet']],@selected
  end
  def test_shift_key_repeat_deactivate_and_normal_click
    build_tool(tool_options('sheet'),eyedropper_key:'shift')
    assert_equal 'shift',@tool.status['eyedropperKey']
    @tool.onKeyDown(18,1,0,@view);assert_equal false,@tool.status['sampling']
    @tool.onKeyDown(16,2,0,@view);assert_equal false,@tool.status['sampling'] # repeat ignored
    @tool.onKeyDown(16,1,0,@view);assert_equal true,@tool.status['sampling']
    @tool.deactivate(@view);assert_equal false,@tool.status['sampling']
    @tool.activate;undo=@model.undo_states.length
    @board.entities.first(2).each { |face| face.material=nil;face.back_material=nil }
    click_on(@doors[0]);assert @events.last['changed'];assert_equal undo+1,@model.undo_states.length # painting still works
    @tool.eyedropper_key='alt';assert_equal 'alt',@tool.status['eyedropperKey']
    assert_raises(PlanosSanto::ExportError) { @tool.eyedropper_key='ctrl' }
  end
  def test_update_options_and_escape_leave_sampling
    build_tool(tool_options('sheet'))
    @tool.onKeyDown(18,1,0,@view);@tool.update_options(tool_options('sheet'));assert_equal false,@tool.status['sampling']
    @tool.onKeyDown(18,1,0,@view);@tool.suspend(@view);assert_equal false,@tool.status['sampling']
  end
  def test_without_select_material_the_eyedropper_is_off
    build_tool(tool_options('sheet'),select_material:nil)
    refute @tool.onKeyDown(18,1,0,@view);assert_equal false,@tool.status['sampling']
  end
end

class PavStaleTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;paint_sheet_on_board!;end
  def test_eyedropper_recents_depth_menu_toggles_and_transparency_never_report_a_change
    @board.entities[2].material=@edge
    build_tool(tool_options('sheet'))
    @tool.onKeyDown(18,1,0,@view);click_on(@doors[0],2);@tool.onKeyUp(18,1,0,@view)
    @tool.onKeyDown(49,1,0,@view)
    stack!(entry(@doors[0],1),entry(@doors[1],1));@tool.onMouseMove(0,400,300,@view);@tool.onKeyDown(40,1,0,@view);@tool.onKeyDown(38,1,0,@view)
    @tool.set_view_options('highlightMissing'=>true);@tool.set_view_options('highlightMissing'=>false)
    menu=PavMenu.new;@tool.getMenu(menu,0,400,300,@view)
    assert_empty @model.operations
    assert @events.none? { |event| event['changed']==true },'una acción sin escritura marcó el análisis como desactualizado'
  end
end

class PavDepthTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;end
  def test_down_arrow_moves_the_hover_behind_and_the_click_paints_only_that_piece
    build_tool(tool_options('sheet'))
    stack!(entry(@doors[0],1),entry(@doors[0],0),entry(@doors[1],1));@tool.onMouseMove(0,400,300,@view)
    hover=@tool.status['hover'];assert_equal '1/11',hover['pieceId'];assert_equal({'index'=>0,'count'=>2},hover['depth'])
    assert_equal true,@tool.onKeyDown(40,1,0,@view)
    hover=@tool.status['hover'];assert_equal '1/12',hover['pieceId'];assert_equal({'index'=>1,'count'=>2},hover['depth'])
    assert_equal({'index'=>1,'count'=>2},@events.last['hover']['depth'])
    @tool.draw(@view);assert(@view.texts.any? { |_,text,| text.end_with?('(2 de 2 · ↑/↓)') })
    undo=@model.undo_states.length;@tool.onLButtonDown(0,400,300,@view)
    assert_nil @events.last['error'];assert @events.last['changed'];assert_equal undo+1,@model.undo_states.length
    assert faces_of(@doors[1]).first(2).all? { |face| face.material.equal?(@sheet) }
    assert @board.entities.first(2).none? { |face| face.material.equal?(@sheet) };assert_same @board,@doors[0].definition
  end
  # F-PINT-A + PINTURA-11: the piece behind, shared and already painted, is a no-op.
  def test_depth_click_on_an_already_painted_shared_piece_is_a_no_op
    paint_sheet_on_board!;build_tool(tool_options('sheet'))
    stack!(entry(@doors[0],1),entry(@doors[1],1));@tool.onMouseMove(0,400,300,@view);@tool.onKeyDown(40,1,0,@view)
    assert_equal '1/12',@tool.status['hover']['pieceId']
    undo=@model.undo_states.length;@tool.onLButtonDown(0,400,300,@view)
    assert_nil @events.last['error'];assert_equal false,@events.last['changed']
    assert_equal undo,@model.undo_states.length;assert_empty @model.operations;assert @doors.all? { |door| door.definition.equal?(@board) }
  end
  def test_up_arrow_wraps_and_a_single_piece_has_no_depth
    build_tool(tool_options('sheet'))
    stack!(entry(@doors[0]),entry(@doors[1]),entry(@doors[2]));@tool.onMouseMove(0,400,300,@view)
    @tool.onKeyDown(38,1,0,@view);assert_equal({'index'=>2,'count'=>3},@tool.status['hover']['depth']);assert_equal '1/13',@tool.status['hover']['pieceId']
    hover_on(@doors[3]);refute @tool.status['hover'].key?('depth') # a new stack resets the depth
  end
  def test_changed_stack_between_hover_and_click_does_not_paint
    build_tool(tool_options('sheet'))
    stack!(entry(@doors[0]),entry(@doors[1]));@tool.onMouseMove(0,400,300,@view);@tool.onKeyDown(40,1,0,@view)
    stack!(entry(@doors[0]),entry(@doors[2]));@tool.onLButtonDown(0,400,300,@view)
    assert_equal 'Cambió lo que hay bajo el cursor; elegí de nuevo con ↑/↓.',@events.last['error']
    assert_empty @model.undo_states;assert @doors.all? { |door| door.definition.equal?(@board) }
  end
  def test_left_right_still_rotate_materials_and_non_immediate_up_down_keep_rotating
    other={'catalogId'=>'otra','materialUuid'=>'otra-uuid','name'=>'Otra'}
    @smart.define_singleton_method(:material_choices) { |_data| [other] }
    build_tool(tool_options('sheet'));@tool.onKeyDown(39,1,0,@view);assert_equal 'otra-uuid',@tool.status['options']['materialUuid']
    build_tool(tool_options('sheet'));@tool.onKeyDown(38,1,0,@view);refute_equal 'otra-uuid',@tool.status['options']['materialUuid']
    build_tool(tool_options('sheet','immediate'=>false,'immediatePiece'=>false));@tool.onKeyDown(40,1,0,@view)
    assert_equal 'otra-uuid',@tool.status['options']['materialUuid']
  end
end

class PavMenuTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;paint_sheet_on_board!;UI.pav_inputbox_calls=[];end
  def menu!(door=@doors[0],face_index=0)
    hover_on(door,face_index) if door
    menu=PavMenu.new;assert_equal true,@tool.getMenu(menu,0,400,300,@view);menu
  end
  def test_menu_items_on_a_piece_and_opening_it_writes_nothing
    build_tool(tool_options('edge'))
    menu=menu!
    assert_equal ['Tomar el material de esta cara','Ocultar esta pieza','Renombrar pieza…','1 canto','2 cantos opuestos','4 cantos','Resaltar lo que falta pintar','Transparencia (rayos X)'],menu.texts
    assert_equal 8,menu.check('4 cantos');assert_equal 0,menu.check('1 canto');assert_equal 0,menu.check('Resaltar lo que falta pintar')
    assert_empty @model.operations;assert_empty UI.pav_inputbox_calls
    sheet=build_tool(tool_options('sheet')) && menu!
    refute_includes sheet.texts,'4 cantos'
  end
  def test_a_failing_menu_falls_back_to_the_native_menu_with_a_message
    build_tool(tool_options('edge'));hover_on(@doors[0],2)
    broken=Object.new;broken.define_singleton_method(:add_item) { |_text,&_block| raise 'menú roto' }
    assert_equal false,@tool.getMenu(broken,0,400,300,@view);assert_match(/menú roto/,@events.last['error']);assert_empty @model.operations
  end
  def test_without_a_piece_only_view_toggles
    build_tool(tool_options('edge'));@picker.entries=[];@tool.onMouseMove(0,1,1,@view)
    menu=PavMenu.new;@tool.getMenu(menu,0,1,1,@view)
    assert_equal ['Resaltar lo que falta pintar','Transparencia (rayos X)'],menu.texts
  end
  def test_hide_is_one_operation_and_show_restores_in_one_operation
    build_tool(tool_options('edge'))
    menu=menu!;menu.choose('Ocultar esta pieza')
    assert @doors[0].hidden?;assert_equal [[:start,'Ocultar pieza Planos Santo',true]],@model.starts;assert_equal true,@events.last['changed']
    assert_equal 1,@model.undo_states.length
    menu=menu!(@doors[1]);assert_includes menu.texts,'Mostrar las piezas ocultadas desde el pincel'
    menu.choose('Mostrar las piezas ocultadas desde el pincel')
    refute @doors[0].hidden?;assert_equal 2,@model.starts.length;assert_equal true,@events.last['changed']
    refute_includes menu!(@doors[1]).texts,'Mostrar las piezas ocultadas desde el pincel'
  end
  def test_locked_piece_is_not_hidden_or_renamed
    build_tool(tool_options('edge'));@doors[0].locked_for_names=true
    menu=menu!;menu.choose('Ocultar esta pieza')
    refute @doors[0].hidden?;assert_empty @model.operations;assert_match(/bloquead/,@events.last['error'])
    menu.choose('Renombrar pieza…');assert_empty UI.pav_inputbox_calls;assert_empty @model.operations
  end
  def test_failed_hide_aborts
    build_tool(tool_options('edge'));fail_once=true # the double's abort restores hidden through the same setter
    @doors[0].define_singleton_method(:hidden=) { |v| (fail_once=false;raise IOError,'sin permiso') if fail_once;@hidden=v }
    menu!.choose('Ocultar esta pieza')
    assert_equal :abort,@model.operations.last.first;assert_empty @model.undo_states;assert_match(/sin permiso/,@events.last['error'])
  end
  def test_rename_cleans_the_name_in_one_operation_and_cancel_or_same_name_does_nothing
    build_tool(tool_options('edge'))
    UI.pav_inputbox=['  Puerta   alacena '];menu!.choose('Renombrar pieza…')
    assert_equal [[['Nombre'],['Puerta 1'],'Renombrar pieza']],UI.pav_inputbox_calls
    assert_equal 'Puerta alacena',@doors[0].name;assert_equal [[:start,'Renombrar pieza Planos Santo',true]],@model.starts
    assert_equal true,@events.last['changed']
    UI.pav_inputbox=false;menu!.choose('Renombrar pieza…');assert_equal 1,@model.starts.length
    UI.pav_inputbox=['Puerta alacena'];menu!.choose('Renombrar pieza…');assert_equal 1,@model.starts.length
    UI.pav_inputbox=["mal\u0001"];menu!.choose('Renombrar pieza…');assert_equal 1,@model.starts.length;assert_match(/control/,@events.last['error'])
  end
  def test_edge_count_items_remember_and_view_toggles
    build_tool(tool_options('edge','edgeCount'=>1))
    menu!.choose('2 cantos opuestos');assert_equal 2,@tool.status['options']['edgeCount'];assert_equal [2],@remembered.map { |o| o['edgeCount'] }
    menu!.choose('Resaltar lo que falta pintar');assert_equal true,@tool.status['missing']['enabled']
    assert_equal 8,menu!.check('Resaltar lo que falta pintar')
    assert_empty @model.operations
  end
  def test_take_material_from_the_menu
    build_tool(tool_options('edge'));menu!(@doors[0],0).choose('Tomar el material de esta cara')
    assert_equal [[SHEET['id'],'sheet']],@selected;assert_equal 'sheet',@tool.status['mode'];assert_empty @model.operations
  end
  def test_non_immediate_tool_keeps_the_native_menu
    build_tool(tool_options('sheet','immediate'=>false,'immediatePiece'=>false))
    refute @tool.respond_to?(:getMenu)
  end
end

class PavMissingTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;end
  def test_pieces_without_sheet_are_red_with_summary_cache_and_tooltip
    @doors[0].material=@sheet # inherited sheet: complete board
    build_tool(tool_options('sheet'))
    assert_equal({'enabled'=>false,'withoutSheet'=>0,'evaluated'=>0,'truncated'=>false},@tool.status['missing'])
    native=@smart.native;calls=0;real=native.method(:automatic_axes)
    native.define_singleton_method(:automatic_axes) { |node| calls+=1;real.call(node) }
    @tool.set_view_options('highlightMissing'=>true)
    assert_equal({'enabled'=>true,'withoutSheet'=>3,'evaluated'=>4,'truncated'=>false},@events.last['missing'])
    hover_on(@doors[1]);@view.draws.clear;@tool.draw(@view);computed=calls
    red=@view.draws.select { |mode,_,color| mode==4 && color.to_a==[220,30,30,70] }
    assert_equal 3*6*6,red.sum { |_,count,| count } # 3 pieces x 6 faces x 2 triangles x 3 points
    @tool.draw(@view);@tool.draw(@view);assert_equal computed,calls
    assert(@view.texts.any? { |_,text,| text=='Falta: placa · cantos 0/4' })
    hover_on(@doors[0]);@view.texts.clear;@tool.draw(@view)
    assert(@view.texts.any? { |_,text,| text=='Falta: cantos 0/4' })
    # A transaction that changed nothing on these pieces reuses the per-definition result.
    @model.observers.first.onTransactionCommit(@model);@tool.draw(@view);assert_equal computed,calls
    @board.entities[0].material=@sheet;@model.observers.first.onTransactionCommit(@model)
    assert_equal 0,@tool.status['missing']['withoutSheet'];assert_operator calls,:>,computed
    assert_empty @model.operations
    @tool.set_view_options('highlightMissing'=>false);@view.draws.clear;@tool.draw(@view)
    assert_empty(@view.draws.select { |_,_,color| color.to_a==[220,30,30,70] })
  end
  def test_missing_never_raises_into_sketchup_and_skips_invisible_pieces
    build_tool(tool_options('sheet'))
    @doors[3].define_singleton_method(:visible?) { false }
    @tool.set_view_options('highlightMissing'=>true)
    assert_equal 3,@events.last['missing']['evaluated']
    occurrences=@tool.instance_variable_get(:@occurrences);occurrences.define_singleton_method(:all_paths) { |_generation| raise 'modelo roto' }
    @model.observers.first.onTransactionCommit(@model)
    status=@tool.status['missing'];assert status['truncated'];assert_match(/No se pudo evaluar/,status['error'])
    hover_on(@doors[0]);@tool.draw(@view);assert @tool.status['active'];assert_empty @model.operations
  end
  def test_edges_count_and_complete_piece
    paint_sheet_on_board!;@board.entities.drop(2).each { |face| face.material=@edge }
    build_tool(tool_options('sheet'));@tool.set_view_options('highlightMissing'=>true)
    assert_equal 0,@tool.status['missing']['withoutSheet']
    hover_on(@doors[0]);@tool.draw(@view);assert(@view.texts.any? { |_,text,| text=='Completa: placa · cantos 4/4' })
  end
  def test_truncated_summary
    build_tool(tool_options('sheet'));@tool.instance_variable_set(:@missing_limit,2)
    @tool.set_view_options('highlightMissing'=>true)
    assert_equal({'enabled'=>true,'withoutSheet'=>2,'evaluated'=>2,'truncated'=>true},@tool.status['missing'])
  end
  def test_invalid_view_option_is_refused
    build_tool(tool_options('sheet'))
    assert_raises(PlanosSanto::ExportError) { @tool.set_view_options('highlightMissing'=>'si') }
  end
end

class PavTransparencyTest < Minitest::Test
  include PavFixture
  def setup;build_fixture;end
  def test_toggle_without_operation_or_undo
    options={'ModelTransparency'=>false};@model.define_singleton_method(:rendering_options) { options }
    assert_equal true,PlanosSanto::SmartPaintTool.toggle_transparency(@model);assert_equal true,options['ModelTransparency']
    assert_equal false,PlanosSanto::SmartPaintTool.toggle_transparency(@model)
    assert_empty @model.operations;assert_empty @model.undo_states
    build_tool(tool_options('sheet'));assert_equal false,@tool.status['transparency']
    hover_on(@doors[0]);menu=PavMenu.new;@tool.getMenu(menu,0,400,300,@view);menu.choose('Transparencia (rayos X)')
    assert_equal true,@events.last['transparency'];assert_empty @model.operations
  end
  def test_without_rendering_options_it_explains
    error=assert_raises(PlanosSanto::ExportError) { PlanosSanto::SmartPaintTool.toggle_transparency(@model) }
    assert_equal 'Esta versión de SketchUp no permite cambiar la transparencia desde el pincel.',error.message
    build_tool(tool_options('sheet'));assert_nil @tool.status['transparency']
  end
end
