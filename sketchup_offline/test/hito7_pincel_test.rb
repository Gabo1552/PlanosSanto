# frozen_string_literal: true
# Hito 7 (pincel avanzado, adelanto) with API doubles only: real SmartPaint,
# NativePaint and SmartPaintTool over synthetic boards. Nothing here claims
# SketchUp execution; picking order, key codes and menus are validated there.
require 'minitest/autorun'
require_relative 'hito2_fixture'

# PINTURA-15: a side made of several coplanar faces is painted whole.
class Hito7SplitSideTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;split_x_min_side!;end
  # Isolated copies renumber their faces; the board order maps them back.
  def edge_ids(door);faces_of(door).each_index.select { |i| faces_of(door)[i].material.equal?(@edge) }.map { |i| @board.entities[i].persistent_id }.sort;end
  def test_four_edges_with_a_split_side_paint_the_five_faces_in_one_undo
    undo=@model.undo_states.length;operations=@model.operations.count { |op| op[0]==:start }
    result=@smart.apply_immediate(edge_request(@doors[0],'102',count:4))
    assert result['changed'];assert_equal undo+1,@model.undo_states.length;assert_equal operations+1,@model.operations.count { |op| op[0]==:start }
    assert_equal [102,103,105,106,107],edge_ids(@doors[0])
    assert faces_of(@doors[0]).first(2).all? { |face| face.material.equal?(@sheet) && face.back_material.equal?(@sheet) }
    assert faces_of(@doors[0]).select { |face| face.material.equal?(@edge) }.all? { |face| face.back_material.equal?(@edge) }
    @model.undo;assert_same @board,@doors[0].definition;assert_empty edge_ids(@doors[0])
  end
  def test_two_edges_from_either_half_paint_the_whole_split_side_and_its_opposite
    @smart.apply_immediate(edge_request(@doors[0],'107',count:2))
    assert_equal [105,106,107],edge_ids(@doors[0])
    @smart.apply_immediate(edge_request(@doors[1],'102',count:2))
    assert_equal [102,103],edge_ids(@doors[1])
  end
  def test_one_edge_on_either_half_paints_the_whole_side
    @smart.apply_immediate(edge_request(@doors[0],'106',count:1));assert_equal [106,107],edge_ids(@doors[0])
    @smart.apply_immediate(edge_request(@doors[1],'107',count:1));assert_equal [106,107],edge_ids(@doors[1])
  end
  def test_hover_previews_every_face_of_the_side_and_the_click_is_one_undo
    build_tool(tool_options('edge','edgeCount'=>4))
    index=faces_of(@doors[0]).index { |face| face.persistent_id==106 }
    hover_on(@doors[0],index)
    verdict=@tool.status['hover']['verdict'];assert verdict['ok'],verdict['reason']
    assert_equal %w[102 103 105 106 107],@tool.status['hover']['expandedFaceIds'].sort
    @tool.draw(@view);assert_equal 5*6,@view.draws.find { |mode,_| mode==4 }[1]
    undo=@model.undo_states.length;click_on(@doors[0],index)
    assert_nil @events.last['error'];assert @events.last['changed'];assert_equal undo+1,@model.undo_states.length
    assert_equal [102,103,105,106,107],edge_ids(@doors[0])
  end
  def test_remove_four_edges_restores_every_face_of_the_split_side
    @smart.apply_immediate(edge_request(@doors[0],'102',count:4))
    binding=binding_of(@sheet)
    @smart.apply_immediate(edge_request(@doors[0],'11002',count:4,mode:'remove_edge','catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']))
    assert_empty edge_ids(@doors[0])
  end
end

class Hito7RebateTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;rebate_x_min_side!;end
  def test_a_rebate_stays_blocked_in_every_mode_without_operation
    before=@board.entities.map { |face| [face.material,face.back_material] };operations=@model.operations.length
    [1,2,4].each do |count|
      error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(edge_request(@doors[0],'102',count:count)) }
      assert_match(/no es una placa rectangular/,error.message)
    end
    assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(sheet_request(@doors[0])) }
    assert_equal operations,@model.operations.length;assert_equal before,@board.entities.map { |face| [face.material,face.back_material] }
    build_tool(tool_options('edge'));hover_on(@doors[0])
    verdict=@tool.status['hover']['verdict'];refute verdict['ok'];assert_match(/no es una placa rectangular/,verdict['reason'])
    click_on(@doors[0]);assert_match(/no es una placa rectangular/,@events.last['error']);assert_equal operations,@model.operations.length
  end
end

# PINTURA-11: Up/Down walk the distinct pieces under the cursor.
class Hito7DepthTest < Minitest::Test
  include Hito2Fixture
  def setup
    build_fixture;paint_sheet_on_board!;UI.hito2_timers=[];@now=0.0
    build_tool(tool_options('sheet'),clock:-> { @now })
    @stack=Hito7Picker.new;@view=Hito2View.new(@stack)
    @stack.rows=[row(@doors[0],1),row(@doors[0],3),row(@doors[1],1),row(@doors[2],0)] # door 1 twice: one piece
  end
  def row(door,index);face=faces_of(door)[index];[[@root,door,face],face];end
  def move(x=40,y=50);@tool.onMouseMove(0,x,y,@view);end
  def key(code);@tool.onKeyDown(code,1,0,@view);end
  def hover;@tool.status['hover'];end
  def test_down_and_up_cycle_the_distinct_pieces_nearest_first_and_emit_at_once
    move;assert_equal '1/11',hover['pieceId'];assert_equal({'index'=>1,'count'=>3},hover['depth'])
    count=@events.length;@now=0.01
    assert key(40);assert_equal '1/12',hover['pieceId'];assert_equal({'index'=>2,'count'=>3},hover['depth'])
    assert_equal count+1,@events.length;assert_equal({'index'=>2,'count'=>3},@events.last['hover']['depth'])
    key(40);assert_equal '1/13',hover['pieceId'];key(40);assert_equal '1/11',hover['pieceId'] # wraps
    key(38);assert_equal '1/13',hover['pieceId']
    @tool.onKeyDown(40,2,0,@view);assert_equal '1/13',hover['pieceId'] # repeat ignored
    assert_equal binding_of(@sheet)['uuid'],@tool.status['options']['materialUuid'];assert_empty @model.operations
  end
  def test_the_click_paints_the_chosen_piece_only
    move;key(40);undo=@model.undo_states.length
    @board.entities.first(2).each { |face| face.material=nil;face.back_material=nil }
    @model.observers.each { |o| o.onTransactionCommit(@model) };move
    assert_equal '1/12',hover['pieceId']
    @tool.onLButtonDown(0,41,50,@view)
    assert @events.last['changed'];assert_equal undo+1,@model.undo_states.length
    assert faces_of(@doors[1]).first(2).all? { |face| face.material.equal?(@sheet) }
    assert faces_of(@doors[0]).first(2).none? { |face| face.material.equal?(@sheet) }
  end
  def test_the_choice_survives_small_moves_and_resets_on_a_long_move_or_a_new_list
    move;key(40);move(45,50);assert_equal '1/12',hover['pieceId'] # 5 px < 6 px * scale 2
    move(40+13,50);assert_equal '1/11',hover['pieceId'];assert_equal 1,hover['depth']['index']
    move;key(40);@stack.rows=@stack.rows.first(3);move;assert_equal '1/11',hover['pieceId'];assert_equal 2,hover['depth']['count']
  end
  def test_tooltip_counts_the_pieces_and_a_single_piece_has_no_depth
    move;key(40);@tool.draw(@view)
    assert_equal 'Puerta 2 · Pieza · Solo esta (de 4) · 2/3 bajo el cursor',@view.texts[-2][1]
    @stack.rows=[row(@doors[3],1)];move;refute hover.key?('depth')
    key(40);assert_match(/No hay otra pieza bajo el cursor/,@events.last['message']);assert_equal '1/14',hover['pieceId']
  end
  def test_left_and_right_still_change_the_material
    other={'catalogId'=>'otra','materialUuid'=>'otra-uuid','name'=>'Otra'}
    @smart.define_singleton_method(:material_choices) { |_data| [other] }
    move;key(39);assert_equal 'otra-uuid',@tool.status['options']['materialUuid']
  end
  def test_an_unresolved_nearest_pick_keeps_refusing_instead_of_taking_a_deeper_piece
    @stack.rows=[[[@root,@doors[0]],Object.new],row(@doors[1],1)];move
    assert_nil hover;key(40);assert_nil hover
  end
end

# PINTURA-07: holding the eyedropper key turns the click into «tomar material».
class Hito7SampleTest < Minitest::Test
  include Hito2Fixture
  SHIFT=PlanosSanto::SmartPaintTool::SHIFT_MASK;ALT=PlanosSanto::SmartPaintTool::ALT_MASK
  def setup
    build_fixture;paint_sheet_on_board!;UI.hito2_set=[];UI.hito2_created=[];@asked=[];@remembered=[]
    @answer=tool_options('sheet').merge('sampleName'=>'Melamina Blanca')
  end
  def tool!(options=tool_options('edge','scope'=>'all','allowShared'=>true),key:'shift')
    asked=@asked;test=self;remembered=@remembered
    build_tool(options,sample_key:key,remember:lambda { |o| remembered << o },
               sample:lambda { |target| asked << target['pieceId'];test.answer })
  end
  def answer;raise PlanosSanto::ExportError,@answer if @answer.is_a?(String);@answer;end
  def test_shift_held_click_takes_the_material_and_release_switches_mode_and_resets_scope
    tool!;undo=@model.undo_states.length
    assert @tool.onKeyDown(16,1,SHIFT,@view);assert_equal true,@tool.status['sampling'];assert_equal true,@events.last['sampling']
    assert_equal 'shift',@events.last['options']['sampleKey']
    hover_on(@doors[0]);@tool.onSetCursor;assert_equal 'paint-sample.png',UI.hito2_created.last.first
    click_on(@doors[0])
    assert_equal ['1/11'],@asked;assert_equal undo,@model.undo_states.length;assert_empty @model.operations
    assert_equal 'edge',@tool.status['mode'];assert_match(/Melamina Blanca/,@events.last['message'])
    assert @tool.onKeyUp(16,1,0,@view)
    refute @tool.status.key?('sampling');assert_equal 'sheet',@tool.status['mode']
    assert_equal binding_of(@sheet)['uuid'],@tool.status['options']['materialUuid']
    assert_equal 'unique',@tool.status['options']['scope'];assert_equal false,@tool.instance_variable_get(:@options)['allowShared']
    refute @tool.instance_variable_get(:@options).key?('sampleName')
    assert_equal 'sheet',@remembered.last['mode'];assert @tool.status['active'];assert_empty @model.operations
  end
  def test_the_modifier_flag_alone_also_samples_and_the_next_plain_move_applies_it
    tool!;face=faces_of(@doors[1])[2];@picker.path=[@root,@doors[1],face];@picker.leaf=face
    @tool.onLButtonDown(SHIFT,40,50,@view);assert_equal ['1/12'],@asked;assert_equal 'edge',@tool.status['mode']
    @tool.onMouseMove(SHIFT,41,50,@view);assert_equal 'edge',@tool.status['mode'] # still held
    @tool.onMouseMove(0,42,50,@view);assert_equal 'sheet',@tool.status['mode'];assert_empty @model.operations
  end
  def test_an_unready_material_changes_nothing_and_says_why
    tool!;@answer='Material nativo sin vínculo propio aprobado.'
    before=@tool.status['options']
    @tool.onKeyDown(16,1,SHIFT,@view);click_on(@doors[0])
    assert_match(/sin vínculo propio/,@events.last['error'])
    @tool.onKeyUp(16,1,0,@view);assert_equal before.merge('sampleKey'=>'shift'),@tool.status['options'].merge('sampleKey'=>'shift')
    assert_empty @model.operations;assert_empty @remembered
  end
  def test_alt_key_and_off_are_configurable
    tool!(tool_options('sheet'),key:'alt')
    @tool.onKeyDown(16,1,SHIFT,@view);refute @tool.status.key?('sampling')
    @tool.onKeyDown(18,1,ALT,@view);assert @tool.status['sampling'];@tool.onKeyUp(18,1,0,@view)
    face=faces_of(@doors[0])[2];@picker.path=[@root,@doors[0],face];@picker.leaf=face
    @tool.onLButtonDown(ALT,40,50,@view);assert_equal ['1/11'],@asked
    tool!(tool_options('sheet'),key:'off');@asked.clear
    @tool.onKeyDown(16,1,SHIFT,@view);@tool.onKeyDown(18,1,ALT,@view);refute @tool.status.key?('sampling')
    @board.entities.first(2).each { |f| f.material=nil };@picker.path=[@root,@doors[0],face];@picker.leaf=face
    @tool.onLButtonDown(SHIFT|ALT,40,50,@view)
    assert_empty @asked;assert @events.last['changed'] # off: the click paints as usual
    assert_raises(PlanosSanto::ExportError) { @tool.tool_option('sampleKey','ctrl') }
    @tool.tool_option('sampleKey','alt');assert_equal 'alt',@tool.status['options']['sampleKey']
  end
  def test_shift_tab_is_still_tab_and_cancels_the_temporary_eyedropper
    edge=tool_options('edge');asked=@asked;test=self
    build_tool(tool_options('sheet'),sample_key:'shift',switch_mode:lambda { |_m| edge },sample:lambda { |t| asked << t['pieceId'];test.answer.merge('mode'=>'sheet') })
    @tool.onKeyDown(16,1,SHIFT,@view);click_on(@doors[0]);assert_equal 1,@asked.length
    @tool.onKeyDown(9,1,SHIFT,@view);assert_equal 'edge',@tool.status['mode'];refute @tool.status.key?('sampling')
    @tool.onKeyUp(16,1,0,@view);assert_equal 'edge',@tool.status['mode'] # the sample was dropped
  end
end
