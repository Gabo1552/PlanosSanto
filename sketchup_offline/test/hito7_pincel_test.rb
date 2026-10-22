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
