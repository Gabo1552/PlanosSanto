# frozen_string_literal: true
# API-double tests; no native SketchUp viewport is executed here.
require 'minitest/autorun'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../piece_highlight_tool'

class PieceHighlightToolTest < Minitest::Test
  class View
    attr_accessor :drawing_color
    attr_reader :draws,:invalidations
    def initialize;@draws=[];@invalidations=0;end
    def draw(mode,points);@draws << [mode,points.map(&:to_a)];end
    def invalidate;@invalidations+=1;end
  end
  def setup
    @model=NamesFixture.model;@root=@model.entities[0];@piece=@root.entities[0]
    @root.transformation=Geom::Transformation.translation(100,0,0)
    @events=[];@allowed=true;@view=View.new
    @model.active_path=[@root];@model.selection=[@piece]
    @model.define_singleton_method(:select_tool) { |tool| @selected_tool=tool }
    @model.define_singleton_method(:selected_tool) { @selected_tool }
  end
  def build(path='1/11')
    PlanosSanto::PieceHighlightTool.new(@model,piece_id:path,guard:lambda { @allowed },on_event:lambda { |event| @events << event })
  end
  def snapshot
    JSON.generate([@model.state,(@model.active_path || []).map(&:persistent_id),@model.selection.map(&:persistent_id),
      @model.all_instances.map { |e| [e.persistent_id,e.name,e.transformation.to_a,e.definition.entities.grep(Sketchup::Face).map { |f| [f.mesh.points.map(&:to_a),f.mesh.polygons,f.material&.entityID,f.back_material&.entityID] }] },@model.operations])
  end
  def test_all_own_faces_are_drawn_in_world_space_without_model_or_selection_changes
    # Outside the open context the path is composed as is (inside it, see
    # piece_highlight_view_test: SketchUp already reports world coordinates).
    @model.active_path=nil
    before=snapshot;tool=build;tool.activate;tool.onMouseMove(0,2,3,@view);tool.draw(@view)
    assert_equal before,snapshot
    assert tool.status['active'];assert_equal 'highlight',tool.status['mode'];assert_equal ['1/11'],tool.status['hover']['affectedPaths']
    assert_equal @piece.definition.entities.grep(Sketchup::Face).length,tool.status['hover']['faceCount']
    assert @view.draws.any?;assert_equal 4,@view.draws.first[0]
    assert_equal 100.0,@view.draws.first[1].first[0]
    assert_empty @model.operations
  end
  def test_nested_group_occurrence_uses_complete_path_and_not_container_descendants
    tool=build('1/13/12');tool.activate;tool.draw(@view)
    assert_equal ['1/13/12'],tool.status['hover']['affectedPaths']
    assert_equal '1/13/12',tool.status['pieceId'];assert_empty @model.operations
    assert_raises(PlanosSanto::ExportError) { build('1/13') }
  end
  def test_shared_definition_highlights_only_the_requested_transformed_occurrence
    definition=@piece.definition
    other=Sketchup::ComponentInstance.new(99,'Otra ocurrencia',definition)
    other.transformation=Geom::Transformation.translation(30,10,0)
    @root.entities << other
    first=build;first.activate;first.draw(@view)
    first_x=@view.draws.first[1].first[0]
    @view=View.new;second=build('1/99');second.activate;second.draw(@view)
    assert_equal ['1/99'],second.status['hover']['affectedPaths']
    assert_in_delta first_x+30,@view.draws.first[1].first[0],0.00001
    assert_equal definition,other.definition;assert_empty @model.operations
  end
  def test_mirrored_piece_reuses_world_mesh_overlay_and_keeps_transform
    @piece.transformation=Geom::Transformation.scale(-1,1,1)
    before=snapshot;tool=build;tool.activate;tool.draw(@view)
    assert_equal before,snapshot;assert @view.draws.first[1].all? { |xyz| xyz.all?(&:finite?) }
    assert_empty @model.operations
  end
  def test_incomplete_unknown_invalid_and_deleted_routes_are_rejected
    [nil,'','11','1/999','1/11/999','1//11','../1','01/11','1/'+'2/'*65+'3'].each do |path|
      assert_raises(PlanosSanto::ExportError) { build(path) }
    end
    @piece.invalid_for_names=true
    assert_raises(PlanosSanto::ExportError) { build }
    assert_empty @model.operations
  end
  def test_stale_context_and_deleted_instance_clear_overlay_without_mutation
    tool=build;tool.activate;@allowed=false
    tool.onMouseMove(0,0,0,@view);refute tool.status['active'];assert_nil tool.status['hover'];assert_match(/modelo/,@events.last['error'])
    @view=View.new;tool.draw(@view);assert_empty @view.draws
    @allowed=true;tool=build;tool.activate;@piece.invalid_for_names=true;tool.draw(@view)
    refute tool.status['active'];assert_match(/ruta/,@events.last['error']);assert_empty @model.operations
  end
  def test_enter_and_inherited_mutating_methods_cannot_apply_or_queue
    tool=build;tool.activate;before=snapshot
    tool.onKeyDown(13,0,0,@view)
    assert tool.status['active'];assert_equal before,snapshot
    assert_raises(PlanosSanto::ExportError) { tool.apply_targets([]) }
    assert_raises(PlanosSanto::ExportError) { tool.queue({}) }
    assert_empty tool.queued_targets;assert_empty @model.operations
  end
  def test_escape_click_deactivate_and_stop_clear_only_the_overlay
    tool=build;before=snapshot;tool.activate;tool.onKeyDown(27,0,0,@view)
    refute tool.status['active'];assert_nil @model.selected_tool;assert_equal before,snapshot
    # 0.8.20: a click no longer ends it (the click that brings SketchUp to the front erased it).
    tool=build;tool.activate;tool.onLButtonDown(0,1,1,@view);assert tool.status['active'];tool.stop(@view)
    tool=build;tool.activate;tool.deactivate(@view);refute tool.status['active']
    tool=build;tool.activate;tool.stop(@view);refute tool.status['active'];assert_nil tool.status['hover']
    assert_equal before,snapshot;assert_empty @model.operations
  end
end
