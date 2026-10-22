# frozen_string_literal: true
# Hito 2 (pincel diario) with API doubles only: real SmartPaint/NativePaint and
# SmartPaintTool over synthetic boards. Nothing here claims SketchUp execution.
require 'minitest/autorun'
require_relative 'hito2_fixture'

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
  # PINTURA-15 (Hito 7) changed this by design: a side split in coplanar faces
  # is painted whole; only a non-rectangular piece (rebaje) stays blocked.
  def test_split_side_paints_the_whole_side_with_two_and_four_edges_and_a_rebate_blocks
    split_x_min_side!
    {4=>[102,103,105,106,107],2=>[105,106,107]}.each_with_index do |(count,ids),i|
      door=@doors[i];undo=@model.undo_states.length
      @smart.apply_immediate(edge_request(door,count==4 ? '102' : '106',count:count));assert_equal undo+1,@model.undo_states.length
      painted=faces_of(door).each_index.select { |k| faces_of(door)[k].material.equal?(@edge) }.map { |k| @board.entities[k].persistent_id }
      assert_equal ids,painted.sort
    end
    build_fixture;paint_sheet_on_board!;rebate_x_min_side!
    before=@board.entities.map { |face| [face.material,face.back_material] };operations=@model.operations.length
    [4,2].each do |count|
      error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(edge_request(@doors[0],'102',count:count)) }
      assert_match(/no es una placa rectangular/,error.message)
    end
    assert_equal operations,@model.operations.length;assert_equal before,@board.entities.map { |face| [face.material,face.back_material] }
    build_tool(tool_options('edge'))
    hover_on(@doors[0])
    verdict=@tool.status['hover']['verdict'];refute verdict['ok'];assert_match(/no es una placa rectangular/,verdict['reason'])
    click_on(@doors[0])
    assert_match(/no es una placa rectangular/,@events.last['error']);assert_equal operations,@model.operations.length
    assert_equal before,@board.entities.map { |face| [face.material,face.back_material] };assert @tool.status['active']
  end
  def test_one_edge_on_a_split_half_paints_the_whole_side
    split_x_min_side!
    halves=[106,107].map { |id| @board.entities.index { |face| face.persistent_id==id } }
    @smart.apply_immediate(edge_request(@doors[0],'106',count:1))
    assert_equal halves,faces_of(@doors[0]).each_index.select { |i| faces_of(@doors[0])[i].material.equal?(@edge) }
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
    rebate_x_min_side!;click_on(@doors[0])
    assert_match(/\APintar canto · 4 cantos · Canto Blanco · Todas las iguales \(4\) · último error: No se puede pintar esta pieza con seguridad: no es una placa rectangular/,Sketchup.hito2_status_texts.last)
  end
  def test_two_line_tooltip_near_the_cursor_in_green_or_red
    build_tool(tool_options('edge','edgeCount'=>2))
    hover_on(@doors[0]);@tool.draw(@view)
    (first,line1,options1),(second,line2,options2)=@view.texts.last(2)
    assert_equal 'Puerta 1 · 2 cantos · Solo esta (de 4)',line1;assert_equal 'Canto Blanco',line2
    assert_equal [76.0,86.0],first.first(2).map(&:to_f) # 18 px * scale 2 from (40,50)
    assert_operator second[1],:>,first[1]
    assert_equal [0,128,0],rgb(options2[:color])
    rebate_x_min_side!;build_tool(tool_options('edge','edgeCount'=>4));hover_on(@doors[1]);@tool.draw(@view)
    _,line,options=@view.texts.last
    assert_match(/no es una placa rectangular/,line);assert_equal [200,0,0],rgb(options[:color])
  end
  def rgb(color);color.respond_to?(:red) ? [color.red,color.green,color.blue] : color.to_a.first(3);end
  def test_preview_uses_the_real_material_color_with_own_alpha_and_red_when_blocked
    build_tool(tool_options('sheet','scope'=>'all','allowShared'=>true))
    hover_on(@doors[0]);@tool.draw(@view)
    colors=@view.draws.select { |mode,_| mode==4 }.map(&:last)
    assert_equal [[240,240,235,60],[240,240,235,110]],colors.map { |c| c.respond_to?(:red) ? [c.red,c.green,c.blue,c.alpha] : c.to_a }
    rebate_x_min_side!;build_tool(tool_options('edge'));hover_on(@doors[1]);@view.draws.clear;@tool.draw(@view)
    assert_equal [220,30,30,110],@view.draws.find { |mode,_| mode==4 }.last.to_a
  end
  def test_own_cursor_per_mode_and_blocked_cursor_created_once_per_process
    build_tool(tool_options('sheet'));hover_on(@doors[0]);assert @tool.onSetCursor
    build_tool(tool_options('edge'));hover_on(@doors[0]);@tool.onSetCursor
    build_tool(tool_options('remove_edge'));@tool.onSetCursor
    rebate_x_min_side!;build_tool(tool_options('edge'));hover_on(@doors[1]);@tool.onSetCursor
    build_tool(tool_options('sheet'));@tool.onSetCursor
    names=UI.hito2_created.map(&:first)
    assert_equal %w[paint-blocked.png paint-edge.png paint-piece.png paint-remove.png],names.sort;assert UI.hito2_created.all? { |_,x,y| [x,y]==[3,3] }
    ids=UI.hito2_created.to_h { |name,_,_| [name,1000+UI.hito2_created.index { |row| row.first==name }+1] }
    assert_equal ids.values_at('paint-piece.png','paint-edge.png','paint-remove.png','paint-blocked.png','paint-piece.png'),UI.hito2_set
  end
end

class Hito2VerdictTest < Minitest::Test
  include Hito2Fixture
  def setup
    build_fixture;@applied=0;applied=0;test=self
    real=@smart.method(:apply_immediate)
    @smart.define_singleton_method(:apply_immediate) { |data| test.count_apply;real.call(data) }
  end
  def count_apply;@applied+=1;end
  def test_edge_on_a_piece_without_sheet_is_refused_before_the_click_reaches_the_service
    build_tool(tool_options('edge'));undo=@model.undo_states.length
    hover_on(@doors[0])
    verdict=@tool.status['hover']['verdict'];refute verdict['ok']
    assert_equal 'Canto sin placa: pintá primero la placa de esta pieza.',verdict['reason']
    assert_equal 'Canto sin placa: pintá primero la placa de esta pieza.',@events.last['error']
    click_on(@doors[0])
    assert_equal 0,@applied;assert_equal undo,@model.undo_states.length;assert_match(/Canto sin placa/,@events.last['error'])
    assert @board.entities.none? { |face| face.material.equal?(@edge) };assert @tool.status['active']
  end
  def test_sheet_on_a_broad_face_or_inherited_from_the_instance_allows_the_edge
    build_tool(tool_options('edge'))
    @doors[1].material=@sheet;hover_on(@doors[1]);assert @tool.status['hover']['verdict']['ok']
    hover_on(@doors[0]);refute @tool.status['hover']['verdict']['ok'] # same definition, no inherited sheet
    @board.entities[1].back_material=@sheet;@model.observers.each { |observer| observer.onTransactionCommit(@model) }
    hover_on(@doors[0]);assert @tool.status['hover']['verdict']['ok']
    click_on(@doors[0]);assert_equal 1,@applied;assert @events.last['changed']
  end
  def test_sheet_and_remove_edge_do_not_need_a_painted_sheet
    build_tool(tool_options('sheet'));hover_on(@doors[0]);assert @tool.status['hover']['verdict']['ok']
    build_tool(tool_options('remove_edge','edgeCount'=>1,'catalogId'=>nil,'materialUuid'=>nil));hover_on(@doors[0]);assert @tool.status['hover']['verdict']['ok']
  end
  def test_locked_piece_is_blocked_with_reason
    paint_sheet_on_board!;@doors[2].locked_for_names=true
    build_tool(tool_options('sheet'));hover_on(@doors[2])
    assert_match(/bloquead/,@tool.status['hover']['verdict']['reason']);click_on(@doors[2]);assert_equal 0,@applied
  end
  def test_two_instances_of_the_same_definition_reuse_the_verdict_until_a_transaction
    paint_sheet_on_board!;build_tool(tool_options('edge'))
    native=@smart.native;axes=0;real=native.method(:automatic_axes)
    native.define_singleton_method(:automatic_axes) { |node| axes+=1;real.call(node) }
    hover_on(@doors[0]);hover_on(@doors[1]);hover_on(@doors[2]);hover_on(@doors[0])
    assert_equal 1,@tool.verdicts.calls;assert_equal 1,axes
    assert_equal 1,@model.observers.length
    @model.observers.first.onTransactionCommit(@model)
    hover_on(@doors[1]);assert_equal 2,@tool.verdicts.calls;assert_equal 2,axes
    %i[onTransactionUndo onTransactionRedo onTransactionAbort onTransactionEmpty].each { |name| @model.observers.first.public_send(name,@model) }
    assert_equal 6,@tool.generation # activate + five transactions
    @tool.deactivate(@view);assert_empty @model.observers
  end
  def test_a_geometry_edit_committed_elsewhere_invalidates_the_cached_verdict
    paint_sheet_on_board!;build_tool(tool_options('edge'))
    hover_on(@doors[0]);assert @tool.status['hover']['verdict']['ok']
    rebate_x_min_side!;@model.observers.first.onTransactionCommit(@model)
    hover_on(@doors[0]);refute @tool.status['hover']['verdict']['ok']
    click_on(@doors[0]);assert_equal 0,@applied;assert_empty @model.undo_states
  end
  def test_own_click_advances_the_generation_even_without_observers
    paint_sheet_on_board!;@model.define_singleton_method(:respond_to?) { |name,*rest| name.to_s=~/observer/ ? false : super(name,*rest) }
    build_tool(tool_options('edge','edgeCount'=>1));hover_on(@doors[1]);click_on(@doors[1])
    assert_equal 2,@tool.generation;assert_equal 1,@applied # activate + own click
  end
end

class Hito2ThrottleTest < Minitest::Test
  include Hito2Fixture
  def setup
    build_fixture;paint_sheet_on_board!;UI.hito2_timers=[];@now=0.0;now=-> { @now }
    build_tool(tool_options('sheet'),clock:now)
  end
  def hovers;@events.select { |event| event['hover'] && event['message'].start_with?('Clic para pintar') };end
  def test_hover_events_are_limited_to_one_per_100_ms_and_the_last_one_is_delivered_later
    hover_on(@doors[0]);assert_equal ['1/11'],hovers.map { |event| event['hover']['pieceId'] }
    @now=0.05;hover_on(@doors[1]);@now=0.06;hover_on(@doors[2])
    assert_equal 1,hovers.length;assert_equal 1,UI.hito2_timers.length;assert_equal [0.1,false],UI.hito2_timers.first.first(2)
    @now=0.11;UI.hito2_timers.shift.last.call
    assert_equal %w[1/11 1/13],hovers.map { |event| event['hover']['pieceId'] }
    UI.hito2_timers.each { |timer| timer.last.call };assert_equal 2,hovers.length
    @now=0.3;hover_on(@doors[3]);assert_equal 3,hovers.length
  end
  def test_unchanged_signature_is_never_resent
    hover_on(@doors[0]);@now=5;50.times { |i| @tool.onMouseMove(0,40+i,50,@view) }
    assert_equal 1,hovers.length;assert_empty UI.hito2_timers
  end
  def test_click_options_and_leaving_the_piece_are_sent_at_once_and_drop_the_pending_hover
    hover_on(@doors[0]);@now=0.01;hover_on(@doors[1]);assert_equal 1,hovers.length
    count=@events.length;@now=0.02;click_on(@doors[1])
    assert_equal count+1,@events.length;assert_equal false,@events.last['changed'] # already painted: no-op, still instant
    UI.hito2_timers.each { |timer| timer.last.call };assert_equal count+1,@events.length # pending dropped by the click
    @now=0.03;@picker.path=nil;@tool.onMouseMove(0,1,1,@view);assert_nil @events.last['hover']
    @now=0.04;5.times { @tool.onMouseMove(0,2,2,@view) };assert_equal count+2,@events.length
    @tool.onKeyDown(9,1,PlanosSanto::SmartPaintTool::CTRL_MASK,@view);assert_equal count+3,@events.length
  end
end

class Hito2TimingTest < Minitest::Test
  include Hito2Fixture
  def setup;build_fixture;paint_sheet_on_board!;@dir=Dir.mktmpdir;end
  def teardown;FileUtils.remove_entry(@dir);end
  def log_path;File.join(@dir,'diagnostico','pincel-tiempos.jsonl');end
  def test_each_immediate_click_is_measured_in_memory_and_in_jsonl
    log=PlanosSanto::PaintTimingLog.new(directory:@dir);ticks=0.0
    build_tool(tool_options('edge','edgeCount'=>4),timing:log,clock:-> { ticks+=0.02 })
    click_on(@doors[0])
    rebate_x_min_side!;@model.observers.each { |o| o.onTransactionCommit(@model) };click_on(@doors[1]) # blocked before the service
    assert_equal 2,log.entries.length
    first,second=log.entries
    assert_equal({'mode'=>'edge','edgeCount'=>4,'scope'=>'unique','changed'=>true,'ok'=>true},first.slice('mode','edgeCount','scope','changed','ok'))
    assert_operator first['ms'],:>,0;refute second['ok'];assert_equal false,second['changed']
    lines=File.readlines(log_path).map { |line| JSON.parse(line) };assert_equal log.entries,lines
    summary=log.summary
    assert_equal 2,summary['count'];assert_equal summary['max'],log.entries.map { |e| e['ms'] }.max;assert_equal second,summary['last']
    assert summary.key?('p50') && summary.key?('p95')
  end
  def test_ring_keeps_200_and_the_file_rotates_after_512_kb
    log=PlanosSanto::PaintTimingLog.new(directory:@dir)
    FileUtils.mkdir_p(File.dirname(log_path));File.write(log_path,'x'*(512*1024+1))
    205.times { |i| log.record('ms'=>i.to_f,'mode'=>'sheet','edgeCount'=>1,'scope'=>'unique','changed'=>true,'ok'=>true) }
    assert_equal 200,log.entries.length;assert_equal 5.0,log.entries.first['ms']
    assert File.exist?(log_path+'.1');assert_operator File.size(log_path),:<,512*1024
    assert_equal 205,File.readlines(log_path).length
    s=log.summary;assert_equal [200,104.0,194.0,204.0],s.values_at('count','p50','p95','max')
  end
  def test_write_failure_only_warns_and_never_breaks_the_click
    File.write(File.join(@dir,'diagnostico'),'no soy una carpeta')
    log=PlanosSanto::PaintTimingLog.new(directory:@dir)
    build_tool(tool_options('sheet'),timing:log)
    _,err=capture_io { click_on(@doors[0]) }
    assert_match(/Planos Santo pincel/,err);assert_equal 1,log.entries.length;assert_nil @events.last['error']
    assert_equal({'count'=>0,'p50'=>nil,'p95'=>nil,'max'=>nil,'last'=>nil},PlanosSanto::PaintTimingLog.new(directory:nil).summary)
  end
end

# Revisión Ruby del Hito 2: escalas por copia, limitador, Undo, índice truncado y errores.
class Hito2ReviewTest < Minitest::Test
  include Hito2Fixture
  def setup
    build_fixture;paint_sheet_on_board!;UI.hito2_timers=[];UI.hito2_set=[];Sketchup.hito2_status_texts=[];@now=0.0
    @selections=[];selections=@selections;@model.define_singleton_method(:select_tool) { |tool| selections << tool }
  end
  def now;-> { @now };end
  def tool!(options,**extra)
    build_tool(options,clock:now,**extra);selections=@selections;@model.define_singleton_method(:select_tool) { |tool| selections << tool };@tool
  end
  def hovers;@events.select { |event| event['hover'] && event['message'].start_with?('Clic para pintar') };end
  def test_all_copies_with_a_different_thickness_orientation_are_refused_without_undo
    # Door 2 stretched along z: its thinnest axis becomes y, so face 102 is broad there.
    @doors[1].transformation=Geom::Transformation.translation(60,0,0)*Geom::Transformation.scale(1,1,40)
    before=@board.entities.map { |face| [face.material,face.back_material] };undo=@model.undo_states.length;operations=@model.operations.length
    error=assert_raises(PlanosSanto::ExportError) { @smart.apply_immediate(edge_request(@doors[0],'102',count:1,scope:'all',allowShared:true)) }
    assert_equal 'Las copias tienen distinta orientación de espesor; usá Solo esta.',error.message
    assert_equal before,@board.entities.map { |face| [face.material,face.back_material] }
    assert_equal undo,@model.undo_states.length;assert_equal operations,@model.operations.length
    tool!(tool_options('edge','edgeCount'=>1,'scope'=>'all','allowShared'=>true));click_on(@doors[0])
    assert_match(/distinta orientación de espesor/,@events.last['error']);assert_equal undo,@model.undo_states.length
    assert @smart.apply_immediate(edge_request(@doors[0],'102',count:1))['changed'] # Solo esta still works
  end
  def test_arrow_material_goes_through_the_limiter_and_drops_the_stale_pending_hover
    other={'catalogId'=>'otra','materialUuid'=>'otra-uuid','name'=>'Otra'}
    @smart.define_singleton_method(:material_choices) { |_data| [other] }
    tool!(tool_options('sheet'))
    hover_on(@doors[0]);@now=0.05;hover_on(@doors[1]);assert_equal 1,hovers.length
    @now=0.06;@tool.onKeyDown(39,1,0,@view)
    event=@events.last;assert_equal 'Material activo: Otra. Hacé clic en otra pieza.',event['message'];assert_equal false,event['requiresSharedReview']
    UI.hito2_timers.each { |timer| timer.last.call };assert_equal 1,hovers.length # stale pending never sent
    @now=0.5;hover_on(@doors[0]);assert_equal 2,hovers.length;assert_equal '1/11',hovers.last['hover']['pieceId']
  end
  def test_undo_cancel_keeps_the_tool_reselect_does_nothing_and_escape_stops
    tool!(tool_options('sheet'));hover_on(@doors[0]);generation=@tool.generation
    @tool.onCancel(1,@view);refute_nil @tool.status['hover'];assert_equal generation,@tool.generation
    @tool.onCancel(2,@view)
    assert_nil @tool.status['hover'];assert_equal generation+1,@tool.generation;assert @tool.status['active']
    assert_empty @selections;assert_equal 1,@model.observers.length
    hover_on(@doors[0]);refute_nil @tool.status['hover']
    @tool.onCancel(0,@view);refute @tool.status['active'];assert_equal [nil],@selections;assert_empty @model.observers
  end
  def test_truncated_occurrence_index_marks_the_shared_count_as_partial
    index=PlanosSanto::OccurrenceIndex.new(@model,limit:2)
    assert_equal 1,index.paths(@board,0).length;assert index.truncated?
    full=PlanosSanto::OccurrenceIndex.new(@model);assert_equal 4,full.paths(@board,0).length;refute full.truncated?
    tool!(tool_options('edge','edgeCount'=>2));@tool.instance_variable_set(:@occurrences,index)
    hover_on(@doors[0])
    assert_equal true,@tool.status['hover']['sharedTruncated'];assert_equal true,@events.last['hover']['sharedTruncated']
    @tool.draw(@view);assert_equal 'Puerta 1 · 2 cantos · Solo esta (de 1+)',@view.texts[-2][1]
    assert_match(/Solo esta \(de 1\+\)\z/,Sketchup.hito2_status_texts.last)
    tool!(tool_options('edge'));hover_on(@doors[0]);refute @tool.status['hover'].key?('sharedTruncated')
  end
  def test_unexpected_hover_errors_are_not_recomputed_until_the_key_changes
    tool!(tool_options('sheet'));calls=0
    @tool.verdicts.define_singleton_method(:for) { |*_args,**_kw| calls+=1;raise NoMethodError,'fallo interno' }
    3.times { |i| @now=i;hover_on(@doors[0]) }
    assert_equal 1,calls;assert_equal 'fallo interno',@events.last['error'];assert_nil @tool.status['hover']
    @now=5;hover_on(@doors[1]);assert_equal 2,calls
    @now=6;hover_on(@doors[0]);assert_equal 3,calls
    @model.observers.first.onTransactionCommit(@model);@now=7;hover_on(@doors[0]);assert_equal 4,calls
  end
  def test_failed_remove_observer_keeps_the_observer_for_a_later_retry
    tool!(tool_options('sheet'));fail_once=true;model=@model
    @model.define_singleton_method(:remove_observer) { |observer| (fail_once=false;raise 'API ocupada') if fail_once;observers.delete(observer);true }
    @tool.deactivate(@view);assert_equal 1,@model.observers.length
    @tool.activate;assert_equal 1,model.observers.length # no second observer
    @tool.deactivate(@view);assert_empty @model.observers
  end
  def test_activate_advances_the_generation
    tool!(tool_options('sheet'));generation=@tool.generation
    @tool.deactivate(@view);@tool.activate;assert_equal generation+1,@tool.generation
  end
  def test_last_error_is_cleared_by_options_and_keyboard_mode_or_material_changes
    other={'catalogId'=>'otra','materialUuid'=>'otra-uuid','name'=>'Otra'}
    @smart.define_singleton_method(:material_choices) { |_data| [other] }
    tool!(tool_options('edge'),switch_mode:lambda { |mode| mode=='edge' ? tool_options('edge') : tool_options('sheet') })
    block=lambda do # a fresh rebated board each time: the click is refused with a reason
      @board=Fixture.board_definition;@board.entities.each_with_index { |f,i| f.define_singleton_method(:persistent_id) { 100+i };f.material=@sheet;f.back_material=@sheet }
      @doors.each { |door| door.definition=@board };rebate_x_min_side!;@model.observers.each { |o| o.onTransactionCommit(@model) }
      click_on(@doors[0]);assert_match(/último error/,Sketchup.hito2_status_texts.last)
    end
    block.call
    @tool.update_options(tool_options('edge'));refute_match(/último error/,Sketchup.hito2_status_texts.last)
    block.call;@tool.onKeyDown(9,1,0,@view);refute_match(/último error/,Sketchup.hito2_status_texts.last) # Tab
    @tool.update_options(tool_options('edge'));block.call;@tool.onKeyDown(9,1,PlanosSanto::SmartPaintTool::CTRL_MASK,@view)
    refute_match(/último error/,Sketchup.hito2_status_texts.last) # Ctrl+Tab
    @tool.update_options(tool_options('edge'));block.call;@tool.onKeyDown(39,1,0,@view);refute_match(/último error/,Sketchup.hito2_status_texts.last) # arrows
  end
  def test_set_cursor_failure_falls_back_to_the_native_cursor
    tool!(tool_options('sheet'));hover_on(@doors[0])
    UI.stub(:set_cursor,lambda { |_id| raise 'sin cursor' }) { assert_equal false,@tool.onSetCursor }
  end
end
