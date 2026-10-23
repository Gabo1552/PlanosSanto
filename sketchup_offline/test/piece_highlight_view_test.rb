# frozen_string_literal: true
# Piezas 0.8.20 «ver la pieza en SketchUp»: selection, open context and camera
# framing of every instance of a cutlist row, and «Volver a la vista anterior».
# API doubles only (highlight_view_double.rb): no SketchUp viewport is rendered.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative 'highlight_view_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :highlight_model;end
  def self.active_model;highlight_model;end
end
module UI;end
require_relative '../build/planos_santo/offline'

class PieceHighlightViewTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model)
    @root=@model.entities[0];@left=@root.entities[0];@nested=@root.entities[1];@base=@nested.entities[0]
    # A second «Lateral - Blanco» beside the first one: same parent, same definition.
    @twin=Sketchup::ComponentInstance.new(99,'Lateral - Blanco',@left.definition,Geom::Transformation.translation(30,0,0))
    @root.entities << @twin
    @view=HighlightViewDouble.new;view=@view;@events=[]
    @model.define_singleton_method(:active_view) { view }
    @model.selection=HighlightSelectionDouble.new([@model.entities[1]])
    @tools=[];tools=@tools
    @model.define_singleton_method(:select_tool) { |tool| tools << tool;tool.activate if tool }
    Sketchup.highlight_model=@model
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def build(ids,focus:nil)
    PlanosSanto::PieceHighlightTool.new(@model,piece_ids:ids,focus:focus,guard:lambda { true },on_event:lambda { |event| @events << event })
  end
  def last_camera;@view.camera_calls.last.first;end
  def ids(list);list.to_a.map(&:persistent_id);end

  def test_same_parent_opens_its_context_selects_every_instance_and_frames_them_all
    tool=build(['1/11','1/99']);tool.activate
    shown=tool.show!(@view)
    assert_equal({'pieceIds'=>['1/11','1/99'],'missing'=>[],'count'=>2,'total'=>2,'focus'=>nil,'selected'=>2,'context'=>'opened','framed'=>true},shown)
    assert_equal [@root],@model.active_path;assert_equal [11,99],ids(@model.selection)
    # Box of both laterals: x 0..54, y 0..16, z 0..0,75 in; same view direction (+Y), 0,4 s transition.
    camera,transition=@view.camera_calls.last
    assert_equal PlanosSanto::PieceHighlightTool::TRANSITION,transition
    assert_equal [27.0,8.0,0.375],camera.target.to_a
    radius=Math.sqrt(54**2+16**2+0.75**2)/2;distance=radius*1.3/Math.sin(15*Math::PI/180)
    assert_in_delta 27.0,camera.eye.to_a[0],1e-9;assert_in_delta 8.0-distance,camera.eye.to_a[1],1e-6;assert_in_delta 0.375,camera.eye.to_a[2],1e-9
    assert camera.perspective?;assert_equal 30.0,camera.fov
    assert_empty @model.operations
  end

  def test_instances_in_different_modules_keep_the_selection_and_stepping_selects_one_with_its_context
    before=@model.selection.to_a
    tool=build(['1/11','1/13/12']);tool.activate
    shown=tool.show!(@view)
    assert_equal 'mixed',shown['context'];assert_equal 0,shown['selected'];assert shown['framed']
    assert_equal before,@model.selection.to_a;assert_nil @model.active_path
    tool.draw(@view);assert_equal 2,@view.draws.length
    # «2 de 2»: only the base inside «Interior estructural»; its context is opened.
    tool=build(['1/11','1/13/12'],focus:1);tool.activate
    shown=tool.show!(@view)
    assert_equal({'selected'=>1,'context'=>'opened','focus'=>1,'count'=>2},shown.slice('selected','context','focus','count'))
    assert_equal [@root,@nested],@model.active_path;assert_equal [12],ids(@model.selection)
    assert_equal [12.0,8.0,0.375],last_camera.target.to_a
    assert_equal '1/13/12',tool.status['pieceId'];assert_equal ['1/11','1/13/12'],tool.status['pieceIds']
    assert_empty @model.operations
  end

  def test_restore_brings_back_camera_open_context_and_selection
    @model.active_path=[@root,@nested];@model.selection=HighlightSelectionDouble.new([@base])
    original=@view.camera.to_h
    snap=PlanosSanto::PieceHighlightTool.snapshot(@model)
    tool=build(['1/11']);tool.activate;tool.show!(@view)
    assert_equal [@root],@model.active_path;assert_equal [11],ids(@model.selection);refute_equal original,@view.camera.to_h
    result=PlanosSanto::PieceHighlightTool.restore(@model,snap)
    assert_equal({'camera'=>true,'context'=>true,'selection'=>true},result)
    assert_equal [@root,@nested],@model.active_path;assert_equal [12],ids(@model.selection)
    assert_equal original,@view.camera.to_h;assert_equal 0.4,@view.camera_calls.last.last
    # A deleted entity of the old selection is left out; a closed context comes back closed.
    @model.active_path=nil;@model.selection=HighlightSelectionDouble.new([@left,@twin])
    snap=PlanosSanto::PieceHighlightTool.snapshot(@model);@twin.invalid_for_names=true
    build(['1/13/12']).tap { |t| t.activate;t.show!(@view) }
    PlanosSanto::PieceHighlightTool.restore(@model,snap)
    assert_nil @model.active_path;assert_equal [11],ids(@model.selection)
    assert_empty @model.operations
  end

  def test_orthographic_camera_keeps_its_kind_and_gets_a_height_that_fits
    @view.camera=Sketchup::Camera.new(Sketchup::Point.new(0,0,500),Sketchup::Point.new(0,0,0),Sketchup::Point.new(0,1,0),false,30.0)
    tool=build(['1/11']);tool.activate;tool.show!(@view)
    refute last_camera.perspective?
    radius=Math.sqrt(24**2+16**2+0.75**2)/2
    assert_in_delta 2*radius*1.3,last_camera.height,1e-9
    assert_equal [12.0,8.0,0.375],last_camera.target.to_a;assert_in_delta 0.375+radius*4,last_camera.eye.to_a[2],1e-9
  end

  def test_inside_an_open_context_world_coordinates_are_not_doubled
    # SketchUp reports the active entities in world coordinates: with «Bajo
    # Mesada» open (moved 100 in X) the lateral already says x+100.
    @root.transformation=Geom::Transformation.translation(100,0,0);@model.active_path=[@root]
    @left.transformation=Geom::Transformation.translation(100,0,0)
    tool=build(['1/11']);tool.activate;tool.show!(@view);tool.draw(@view)
    assert_equal 'kept',tool.show!(@view)['context']
    assert_equal 112.0,last_camera.target.to_a[0]
    xs=@view.draws.flat_map { |_mode,points| points.map(&:first) }
    assert_equal [100.0,124.0],xs.minmax
  end

  def test_rows_with_missing_instances_show_the_rest_and_say_which_failed
    tool=build(['1/11','1/999','1/13/12']);tool.activate
    shown=tool.show!(@view)
    assert_equal ['1/11','1/13/12'],shown['pieceIds'];assert_equal ['1/999'],shown['missing'];assert_equal 3,shown['total']
    error=assert_raises(PlanosSanto::ExportError) { build(['1/998','1/999']) }
    assert_match(/Ninguna de estas piezas/,error.message)
    assert_raises(PlanosSanto::ExportError) { build(['1/11','1/999'],focus:1) }
    assert_raises(PlanosSanto::ExportError) { build(['1/11'],focus:1) }
    assert_raises(PlanosSanto::ExportError) { build([]) }
    assert_raises(PlanosSanto::ExportError) { build(['1/11']*501) }
    assert_empty @model.operations
  end

  def test_overlay_draws_every_instance_and_an_outline_over_everything
    tool=build(['1/11','1/99'],focus:1);tool.activate;tool.draw(@view)
    assert_equal 2,@view.draws.length
    # The focused one last, on top: x 30..54.
    assert_equal [30.0,54.0],@view.draws.last[1].map(&:first).minmax
    assert_equal 2,@view.draws2d.length;assert @view.draws2d.all? { |mode,points| mode==1 && points.length==24 }
    assert_equal 1,@view.line_width
    # A click (the one that brings SketchUp to the front) keeps it; Esc ends it.
    tool.onLButtonDown(0,1,1,@view);assert tool.status['active']
    tool.onKeyDown(27,0,0,@view);refute tool.status['active']
  end

  def test_controller_frames_steps_and_restores_the_previous_view
    controller=PlanosSanto::OfflineController.new;controller.dispatch('scan',{})
    original=@view.camera.to_h;selection=@model.selection.to_a
    result=controller.dispatch('piece_highlight',{'pieceIds'=>['1/11','1/13/12'],'frame'=>true})
    assert_equal({'count'=>2,'context'=>'mixed','framed'=>true,'canRestore'=>true},result['highlight'].slice('count','context','framed','canRestore'))
    assert_equal 'highlight',result['toolState']['mode'];assert result['toolState']['active'];assert_equal ['1/11','1/13/12'],result['toolState']['pieceIds']
    stepped=controller.dispatch('piece_highlight',{'pieceIds'=>['1/11','1/13/12'],'focus'=>0,'frame'=>true})
    assert_equal 'opened',stepped['highlight']['context'];assert_equal [11],ids(@model.selection)
    restored=controller.dispatch('piece_highlight_restore',{})
    assert_equal true,restored['restored'];refute restored['toolState']['active']
    assert_equal original,@view.camera.to_h;assert_equal selection,@model.selection.to_a;assert_nil @model.active_path
    # Nothing left to restore; the old single-id call still neither selects nor frames.
    assert_equal false,controller.dispatch('piece_highlight_restore',{})['restored']
    calls=@view.camera_calls.length
    plain=controller.dispatch('piece_highlight',{'pieceId'=>'1/11'})
    refute plain.key?('highlight');assert_equal calls,@view.camera_calls.length;assert_equal selection,@model.selection.to_a
    error=assert_raises(PlanosSanto::ExportError) { controller.dispatch('piece_highlight',{'pieceIds'=>['1/998'],'frame'=>true}) }
    assert_match(/ruta de instancia/,error.message)
    assert_empty @model.operations
  end
end
