# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint_tool'
class SmartPaintToolTest < Minitest::Test
  class Service
    attr_reader :previews,:applications,:cancelled
    attr_accessor :paths,:shared_count,:fail_apply
    def initialize;@previews=[];@applications=[];@paths=['1/11'];@shared_count=1;@cancelled=0;end
    def preview(data)
      @previews << Marshal.load(Marshal.dump(data))
      {'token'=>"preview-#{@previews.length}",'affectedPaths'=>@paths,'sharedCount'=>@shared_count,
       'faceCount'=>data['targets'].sum { |target| target['faceIds'].size },'warnings'=>[]}
    end
    def apply(data);raise 'Atomic rejection' if @fail_apply;@applications << data;{'changed'=>true};end
    def apply_immediate(data)
      raise 'No se puede aislar esta instancia.' if @fail_apply
      @applications << Marshal.load(Marshal.dump(data));{'changed'=>true}
    end
    def cancel;@cancelled+=1;end
  end
  class Picker
    attr_accessor :path,:leaf
    attr_reader :pick_calls
    def initialize(path,leaf);@path=path;@leaf=leaf;@pick_calls=[];end
    def do_pick(x,y);@pick_calls << [x,y];end
    def count;@path ? 1 : 0;end
    def path_at(index);raise unless index==0;@path;end
    def leaf_at(index);raise unless index==0;@leaf;end
  end
  class View
    attr_reader :picker,:draws,:invalidations
    attr_accessor :drawing_color
    def initialize(picker);@picker=picker;@draws=[];@invalidations=0;end
    def pick_helper;@picker;end
    def invalidate;@invalidations+=1;end
    def draw(mode,points);@draws << [mode,points.map(&:to_a)];end
  end
  def setup
    @model=Fixture.model;@root=@model.entities[0];@piece=@root.definition.entities[0];@face=@piece.definition.entities[0]
    @model.define_singleton_method(:active_path) { @active_path }
    @model.define_singleton_method(:active_path=) { |value| @active_path=value }
    @model.define_singleton_method(:select_tool) { |value| @selected_tool=value }
    @model.define_singleton_method(:selected_tool) { @selected_tool }
    @picker=Picker.new([@root,@piece,@face],@face);@view=View.new(@picker);@service=Service.new;@events=[];@guard=true
    @options={'mode'=>'sheet','side'=>'front','scope'=>'all','catalogId'=>'approved-sheet','materialUuid'=>'native-id','confirmed'=>true}
    @tool=build(@options)
  end
  def build(options)
    PlanosSanto::SmartPaintTool.new(@model,service:@service,options:options,on_event:lambda { |event| @events << event },guard:lambda { @guard })
  end
  def hover;@tool.onMouseMove(0,20,30,@view);end
  def click(flags=0);@tool.onLButtonDown(flags,20,30,@view);end
  def test_hover_uses_complete_persistent_route_draws_world_mesh_and_never_applies
    before=Marshal.dump(@model.entities)
    @tool.activate;hover;@tool.draw(@view)
    assert_equal before,Marshal.dump(@model.entities)
    assert_empty @service.applications
    assert_equal '1/11',@events.last['hover']['pieceId']
    assert_equal @face.persistent_id.to_s,@events.last['hover']['faceId']
    assert_equal ['1/11'],@events.last['hover']['affectedPaths']
    assert_equal 1,@events.last['hover']['faceCount']
    assert_equal 4,@view.draws[0][0]
    assert_equal 100.0,@view.draws[0][1][0][0]
    assert_equal 1,@view.draws[1][0]
    hover;assert_equal 1,@service.previews.size
  end
  def test_mirrored_nested_geometry_preserves_front_normal_and_exact_instance_path
    @piece.transformation=Geom::Transformation.scale(-1,1,1)
    @tool.activate;hover;@tool.draw(@view)
    assert_equal '1/11',@events.last['hover']['pieceId']
    line=@view.draws[1][1]
    assert_in_delta(-0.5,line[1][2]-line[0][2],0.00001)
    @tool.update_options(@options.merge('side'=>'back'));hover;@tool.draw(@view)
    line=@view.draws.last[1]
    assert_in_delta 0.5,line[1][2]-line[0][2],0.00001
    assert_empty @service.applications
  end
  def test_click_revalidates_preview_and_performs_one_confirmed_apply
    @tool.activate;hover;click
    assert_equal 2,@service.previews.size
    assert_equal [{'token'=>'preview-2','confirmed'=>true}],@service.applications
    assert @events.last['changed'];assert_nil @events.last['hover']
  end
  def test_shared_definition_needs_explicit_authorization_and_emits_all_paths
    @service.paths=%w[1/11 2/11];@service.shared_count=2
    @tool.activate;click
    assert_empty @service.applications
    assert_match(/compartida/,@events.last['error'])
    assert_equal %w[1/11 2/11],@events.last['hover']['affectedPaths']
    @tool.update_options(@options.merge('allowShared'=>true));click
    assert_equal 1,@service.applications.size
  end
  def test_shared_unique_scope_uses_explicit_confirmation_without_all_scope_permission
    @service.paths=['1/11'];@service.shared_count=4
    @tool.update_options(@options.merge('scope'=>'unique'));click
    assert_equal 1,@service.applications.size
    assert_equal 'unique',@service.previews.last['scope']
    @tool.update_options(@options.merge('scope'=>'unique','confirmed'=>false));click
    assert_equal 1,@service.applications.size
    assert_match(/Confirmá/,@events.last['error'])
  end
  def test_queued_faces_remain_visible_after_hover_leaves_and_deduplicate_until_apply
    before=Marshal.dump(@model.entities)
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    second=@piece.definition.entities[1]
    @picker.path=[@root,@piece,second];@picker.leaf=second
    click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    assert_equal 2,@events.last['queuedCount']
    @picker.path=nil;@tool.onMouseMove(0,999,999,@view)
    assert_nil @events.last['hover']
    @tool.draw(@view)
    triangles=@view.draws.select { |mode,_| mode==4 }
    assert_equal 2,triangles.size
    assert_equal before,Marshal.dump(@model.entities)
    assert_empty @service.applications
    @tool.onKeyDown(13,0,0,@view)
    assert_equal 1,@service.applications.size
    @view.draws.clear;@tool.draw(@view);assert_empty @view.draws
  end
  def test_queued_overlay_is_cleared_on_stop_and_escape
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    @tool.stop;@tool.draw(@view);assert_empty @view.draws
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    @tool.onKeyDown(27,0,0,@view);@tool.draw(@view);assert_empty @view.draws
    assert_empty @service.applications
  end
  def test_authorized_path_subset_cannot_silently_grow
    @tool.update_options(@options.merge('allowShared'=>true,'authorizedPaths'=>['1/11']))
    @service.paths=%w[1/11 2/11];@service.shared_count=2;click
    assert_empty @service.applications;assert_match(/alcance cambió/,@events.last['error'])
  end
  def test_shift_queue_and_enter_make_one_multi_target_apply
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    @picker.path=[@model.entities[1],@piece,@face]
    @service.paths=['2/11'];click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    assert_empty @service.applications;assert_equal 2,@events.last['queuedCount']
    @tool.onKeyDown(13,0,0,@view)
    assert_equal 1,@service.applications.size
    assert_equal %w[1/11 2/11],@service.previews.last['targets'].map { |target| target['pieceId'] }
    assert_equal 0,@events.last['queuedCount']
  end
  def test_escape_cancels_queued_faces_and_exits_without_mutations
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    @tool.onKeyDown(27,0,0,@view)
    assert_empty @service.applications;assert_equal 0,@events.last['queuedCount'];refute @events.last['active'];assert_nil @model.selected_tool
  end
  def test_stop_is_readonly_and_does_not_select_another_tool
    @model.select_tool(:sentinel);@tool.activate;hover;@tool.stop
    assert_equal :sentinel,@model.selected_tool
    assert_empty @service.applications;refute @tool.status['active'];assert_nil @tool.status['hover']
  end
  def test_active_edit_relative_path_is_resolved_without_guessing_shared_occurrence
    @model.active_path=[@root];@picker.path=[@piece,@face];hover
    assert_equal '1/11',@events.last['hover']['pieceId']
    @picker.path=[@model.entities[1],@piece,@face];hover
    assert_nil @events.last['hover'];assert_match(/contexto/,@events.last['error'])
  end
  def test_unqualified_shared_leaf_without_context_is_rejected
    @picker.path=[@piece,@face];hover
    assert_nil @events.last['hover'];assert_empty @service.applications;assert_match(/ruta/,@events.last['error'])
  end
  def test_guard_and_missing_palette_confirmation_prevent_apply
    @tool.update_options(@options.merge('confirmed'=>false));click
    assert_empty @service.applications;assert_match(/Confirmá/,@events.last['error'])
    @tool.update_options(@options);hover;@guard=false;click
    assert_empty @service.applications;assert_match(/modelo/,@events.last['error'])
  end
  def test_batch_setting_queues_and_atomic_failure_keeps_queue
    @tool.update_options(@options.merge('batch'=>true));click
    assert_empty @service.applications;assert_equal 1,@tool.queued_targets.size
    @service.fail_apply=true;@tool.onKeyDown(13,0,0,@view)
    assert_empty @service.applications;assert_equal 1,@tool.queued_targets.size;assert_match(/Atomic rejection/,@events.last['error'])
  end
  def test_remove_replace_options_reach_service_without_camera_or_implicit_texture_axes
    @tool.update_options(@options.merge('mode'=>'replace','replacementKind'=>'edge','sourceMaterialUuid'=>'source-id','axes'=>[1,0]))
    hover
    payload=@service.previews.last
    assert_equal 'replace',payload['mode'];assert_equal 'source-id',payload['sourceMaterialUuid'];assert_equal [1,0],payload['axes']
    refute payload.key?('confirmed');refute payload.key?('textureRotation')
  end
  def test_native_tab_and_reverse_tab_cycle_compatible_submodes_and_cancel_queue_only
    @tool.update_options(@options.merge('mode'=>'edge','edgeCount'=>1,'batch'=>true));@tool.activate;click
    assert_equal 1,@tool.queued_targets.length
    assert @tool.onKeyDown(9,0,0,@view)
    assert_equal 2,@tool.status['options']['edgeCount'];assert_empty @tool.queued_targets;assert_empty @service.applications
    @tool.onKeyDown(9,0,PlanosSanto::SmartPaintTool::SHIFT_MASK,@view)
    assert_equal 1,@tool.status['options']['edgeCount']
    @tool.onKeyDown(9,3,0,@view);assert_equal 1,@tool.status['options']['edgeCount']
    @tool.update_options(@options.merge('mode'=>'sheet','paintScope'=>'face'));@tool.onKeyDown(9,0,0,@view)
    assert_equal 'piece',@tool.status['options']['paintScope']
  end
  def test_native_arrows_choose_only_service_valid_materials_and_require_shared_review
    choices=[{'catalogId'=>'approved-sheet','materialUuid'=>'native-id','name'=>'Primero'},{'catalogId'=>'second-sheet','materialUuid'=>'second-native','name'=>'Segundo'}]
    @service.define_singleton_method(:material_choices) { |_options| choices }
    @tool.update_options(@options.merge('batch'=>true,'allowShared'=>true));@tool.activate;click
    assert @tool.onKeyDown(39,0,0,@view)
    assert_equal 'second-native',@tool.status['options']['materialUuid'];assert_empty @tool.queued_targets
    assert @events.last['requiresSharedReview'];refute @events.last['options'].key?('allowShared');refute @events.last['options'].key?('confirmed')
    @service.paths=['1/11','2/21'];@service.shared_count=2;click
    assert_empty @service.applications;assert_match(/autorizá/,@events.last['error'])
  end
  def test_expanded_preview_draws_all_validated_faces_and_forwards_explicit_scope
    ids=@piece.definition.entities.first(2).map { |face| face.persistent_id.to_s }
    original=@service.method(:preview)
    @service.define_singleton_method(:preview) { |data| original.call(data).merge('expandedTargets'=>[{'pieceId'=>'1/11','faceIds'=>ids}],'faceCount'=>2) }
    @tool.update_options(@options.merge('paintScope'=>'piece','edgeCount'=>4));@tool.activate;hover;@tool.draw(@view)
    assert_equal ids,@tool.status['hover']['expandedFaceIds']
    assert_equal 'piece',@service.previews.last['paintScope'];assert_equal 4,@service.previews.last['edgeCount']
    expected=@piece.definition.entities.first(2).sum { |face| face.mesh.polygons.sum { |polygon| (polygon.length-2)*3 } }
    assert_equal expected,@view.draws.first[1].length
    assert_empty @service.applications
  end

  def immediate_options
    @options.merge('immediate'=>true,'immediatePiece'=>true,'paintScope'=>'piece','side'=>'both','scope'=>'unique','batch'=>false)
  end
  def test_immediate_hover_is_local_and_never_previews_or_applies_even_across_faces
    @tool=build(immediate_options);@tool.activate
    100.times { hover }
    @picker.leaf=@piece.definition.entities.grep(Sketchup::Face).last;@picker.path=[@root,@piece,@picker.leaf]
    hover;@tool.draw(@view)
    assert_empty @service.previews;assert_empty @service.applications
    assert @tool.status['active'];assert_equal '1/11',@tool.status['hover']['pieceId']
    refute_empty @view.draws
  end
  def test_immediate_five_clicks_paint_complete_piece_without_reconfiguration
    @tool=build(immediate_options);@tool.activate
    5.times { click;assert @tool.status['active'] }
    assert_equal 5,@service.applications.length
    assert_empty @service.previews
    assert @service.applications.all? { |data| data['immediatePiece'] && data['scope']=='unique' && data['side']=='both' && data['paintScope']=='piece' }
    assert_equal ['1/11'],@service.applications.map { |data| data['targets'].first['pieceId'] }.uniq
  end
  def test_immediate_change_material_keeps_same_active_tool_and_next_click_uses_it
    @tool=build(immediate_options);@tool.activate;click;tool=@tool
    @tool.update_options(immediate_options.merge('materialUuid'=>'second-texture'))
    assert_same tool,@tool;assert @tool.status['active'];click
    assert_equal ['native-id','second-texture'],@service.applications.map { |data| data['materialUuid'] }
    assert @tool.status['active'];assert_empty @service.previews
  end
  def test_immediate_escape_ends_tool_and_unsafe_click_warns_without_reconfiguration
    @tool=build(immediate_options);@tool.activate;@service.fail_apply=true;click
    assert_empty @service.applications;assert_match(/aislar/,@events.last['error']);assert @tool.status['active']
    @service.fail_apply=false;click;assert_nil @events.last['error'];assert_equal 1,@service.applications.length
    assert @tool.onKeyDown(27,1,0,@view)
    refute @tool.status['active'];assert_nil @model.selected_tool
  end
  def test_immediate_tab_cannot_accidentally_switch_back_to_face_painting
    @tool=build(immediate_options);@tool.activate
    @tool.onKeyDown(9,1,0,@view)
    assert_equal 'piece',@tool.status['options']['paintScope'];assert_equal 'sheet',@tool.status['mode'];assert @tool.status['active']
    assert_empty @service.applications
  end

end
