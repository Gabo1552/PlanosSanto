# frozen_string_literal: true
# «Dibujar pieza» con dobles de la API (draw_component_double.rb). NO es
# SketchUp: la vista, las inferencias, pushpull, to_component y Deshacer son
# simulados; lo que comprueba es la lógica de la herramienta.
require 'minitest/autorun'
require_relative 'draw_component_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../names'
require_relative '../draw_component_tool'

class DrawComponentToolTest < Minitest::Test
  MM=1/25.4
  Pick=Sketchup::Pick

  def setup
    Sketchup.length_unit=:mm;Sketchup.status_log.clear
    @model=Sketchup::ModelDouble.new;Sketchup.active_model=@model;@view=@model.active_view
    # Existing furniture whose face lies exactly where the pieces are drawn.
    @furniture=@model.entities.add_group;@furniture.name='Bajo mesada'
    @board=@furniture.entities.add_face(pt(0,0,0),pt(800,0,0),pt(800,600,0),pt(0,600,0))
    @model.selection.add(@furniture)
    @tool=PlanosSanto::DrawComponentTool.new(@model);@model.select_tool(@tool)
    @before=@model.state
  end

  def teardown
    %i[VK_RIGHT VK_LEFT VK_UP VK_DOWN].each { |name| Object.send(:remove_const,name) if Object.const_defined?(name,false) }
    Sketchup.send(:remove_const,:RegionalSettings) if Sketchup.const_defined?(:RegionalSettings,false)
  end

  def pt(x,y,z);Geom::Point3d.new(x*MM,y*MM,z*MM);end
  def vec(x,y,z);Geom::Vector3d.new(x,y,z);end
  def move(x,y);@tool.onMouseMove(0,x,y,@view);end
  def click(x,y);move(x,y);@tool.onLButtonDown(0,x,y,@view);end
  def type(text);@tool.onUserText(text,@view);end
  def created;(@model.active_entities.to_a-[@furniture]).grep(Sketchup::ComponentInstance);end
  def piece;assert_equal 1,created.length,Sketchup.status_text;created.first;end
  def ops;@model.operations.map(&:first);end
  def assert_point(expected,actual,message=nil)
    expected.to_a.zip(actual.to_a).each { |e,a| assert_in_delta e,a,1e-7,message || "#{expected.to_a} != #{actual.to_a}" }
  end
  # World size along the component axes, in mm, from its local geometry.
  def size_mm(component)
    points=component.definition.entities.grep(Sketchup::Face).flat_map(&:points)
    3.times.map { |axis| ((points.map { |p| p.to_a[axis] }.max-points.map { |p| p.to_a[axis] }.min)*25.4).round(6) }
  end
  def assert_axes(component,x,y,z,origin)
    t=component.transformation
    assert_point x,t.xaxis,'eje x';assert_point y,t.yaxis,'eje y';assert_point z,t.zaxis,'eje z';assert_point origin,t.origin,'origen'
  end
  def world_corner(component,x,y,z);component.transformation*pt(x,y,z);end
  def draw_floor(width=600,height=400)
    click(0,0);move(width,height);click(width,height)
  end

  def test_floor_drawing_creates_one_isolated_component_with_exact_size_axes_name_and_selection
    assert_match(/primera esquina/,Sketchup.status_text);assert_equal 'Medidas',Sketchup.vcb_label
    draw_floor
    assert_equal :thickness,@tool.phase;assert_equal 'Espesor',Sketchup.vcb_label;assert_equal '18mm',Sketchup.vcb_value
    click(600,400)
    component=piece
    assert_equal [:start,'Dibujar pieza',true,false,false],@model.operations.first
    assert_equal %i[start commit],ops
    assert_equal 'Pieza',component.definition.name
    assert_equal [600.0,400.0,18.0],size_mm(component)
    assert_axes component,vec(1,0,0),vec(0,1,0),vec(0,0,1),pt(0,0,0)
    assert_equal 6,component.definition.entities.grep(Sketchup::Face).length
    # Isolated: the existing face is untouched and nothing loose was added.
    assert_equal [@board],@furniture.entities.to_a;assert_includes @board.points,pt(0,0,0)
    assert_equal [@furniture,component],@model.entities.to_a
    assert_equal [component],@model.selection.to_a
    assert_match(/Pieza «Pieza» creada y seleccionada: 600mm × 400mm × 18mm/,Sketchup.status_text)
    assert_equal :corner,@tool.phase;assert_equal 'Corregir',Sketchup.vcb_label
    # The analysis takes it as a piece by its geometry: no extra attribute needed.
    node=PlanosSanto::NameManager.new(@model).inventory[:index][component.persistent_id.to_s]
    assert_equal 'piece',node['role'];assert_equal 'Pieza',node['displayName']
  end

  def test_rectangle_uses_inferences_with_the_first_point_as_reference_and_projects_snaps
    click(0,0)
    # Snapped to a vertex 50 mm above the plane: projected onto the drawing plane.
    @view.picks[[600,400]]=Pick.new(pt(600,400,50),nil,nil,0,'Extremo')
    move(600,400)
    assert_point pt(0,0,0),@view.pick_calls.last[2]
    assert_in_delta 600*MM,@tool.width,1e-9;assert_in_delta 400*MM,@tool.height,1e-9
    assert_equal 'Extremo',@view.tooltip;assert_equal '600mm;400mm',Sketchup.vcb_value
    click(600,400)
    # Thickness snapped to a vertex 25 mm high.
    @view.picks[[650,450]]=Pick.new(pt(650,450,25),nil,nil,0,'Extremo')
    click(650,450)
    assert_equal [600.0,400.0,25.0],size_mm(piece)
  end

  def test_drag_and_release_closes_the_rectangle
    move(0,0);@tool.onLButtonDown(0,0,0,@view);move(300,200);@tool.onLButtonUp(0,300,200,@view)
    assert_equal :thickness,@tool.phase
    tool=PlanosSanto::DrawComponentTool.new(@model);@model.select_tool(tool)
    tool.onMouseMove(0,0,0,@view);tool.onLButtonDown(0,0,0,@view);tool.onLButtonUp(0,2,2,@view)
    assert_equal :rectangle,tool.phase
  end

  def test_vertical_face_uses_its_world_normal_and_upright_axes
    @view.mode=:front
    wall=Sketchup::Face.new(@model,@furniture.entities,[pt(0,0,0),pt(0,0,900),pt(800,0,900),pt(800,0,0)],vec(0,-1,0))
    @view.picks[[100,50]]=Pick.new(pt(100,0,50),wall,Geom::Transformation.new,2,'En la cara')
    click(100,50);move(700,450)
    assert_point vec(0,-1,0),@tool.normal
    assert_in_delta 600*MM,@tool.width,1e-9;assert_in_delta 400*MM,@tool.height,1e-9
    click(700,450);type('18')
    component=piece
    assert_axes component,vec(1,0,0),vec(0,0,1),vec(0,-1,0),pt(100,0,50)
    assert_point pt(700,-18,450),world_corner(component,600,400,18)
    assert_equal [600.0,400.0,18.0],size_mm(component)
  end

  # Concave face in a non-uniformly scaled, rotated instance: the plane comes
  # from face.normal, transformed as a plane (not from three vertices).
  def test_face_normal_is_exact_for_scaled_rotated_instances_and_concave_faces
    concave=Sketchup::Face.new(@model,@furniture.entities,[pt(0,0,0),pt(10,0,0),pt(20,0,0),pt(20,10,0),pt(10,5,0),pt(0,10,0)],vec(1,1,0).normalize)
    scale=Geom::Transformation.new([2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
    transformation=Geom::Transformation.rotation_z(Math::PI/2)*scale
    @view.picks[[5,5]]=Pick.new(pt(5,5,0),concave,transformation,2,'En la cara')
    click(5,5)
    expected=(Geom::Transformation.rotation_z(Math::PI/2)*vec(0.5,1,0)).normalize
    assert_point expected,@tool.normal
    mirrored=Geom::Transformation.new([-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
    floor=Sketchup::Face.new(@model,@furniture.entities,[pt(0,0,0),pt(1,0,0),pt(1,1,0)],vec(0,0,1))
    @tool.onCancel(0,@view) if @tool.phase!=:corner
    @view.picks[[6,6]]=Pick.new(pt(6,6,0),floor,mirrored,2,'En la cara')
    click(6,6)
    assert_point vec(0,0,1),@tool.normal
  end

  def test_arrow_keys_lock_and_release_the_plane_with_vk_constants_when_defined
    assert @tool.onKeyDown(39,0,0,@view);assert_equal :x,@tool.locked;assert_match(/lateral \(eje rojo\), fijado/,Sketchup.status_text)
    @view.picks[[0,0]]=Pick.new(pt(0,0,0),nil,nil,0,'Origen')
    @view.picks[[1,1]]=Pick.new(pt(40,500,300),nil,nil,0,'Extremo')
    click(0,0);move(1,1)
    assert_point vec(1,0,0),@tool.normal
    assert_in_delta 500*MM,@tool.width,1e-9;assert_in_delta 300*MM,@tool.height,1e-9
    # ↑ in the rectangle phase changes to the floor and keeps the corner.
    assert @tool.onKeyDown(38,0,0,@view);assert_equal :z,@tool.locked;assert_point vec(0,0,1),@tool.normal;assert_point pt(0,0,0),@tool.origin
    assert @tool.onKeyDown(38,0,0,@view);assert_nil @tool.locked
    @tool.onKeyDown(37,0,0,@view);assert_point vec(0,-1,0),@tool.normal
    @tool.onKeyDown(40,0,0,@view);assert_nil @tool.locked;assert_point vec(0,0,1),@tool.normal
    refute @tool.onKeyDown(65,0,0,@view)
    # Mac: VK_* differ from 37-40 and are the ones honoured.
    Object.const_set(:VK_RIGHT,63235);Object.const_set(:VK_LEFT,63234);Object.const_set(:VK_UP,63232);Object.const_set(:VK_DOWN,63233)
    refute @tool.onKeyDown(39,0,0,@view);assert_nil @tool.locked
    assert @tool.onKeyDown(63235,0,0,@view);assert_equal :x,@tool.locked
    assert_empty @model.operations
  end

  def test_open_group_receives_the_piece_aligned_with_its_axes_in_world_coordinates
    edit=Geom::Transformation.translation(vec(1000*MM,0,0))*Geom::Transformation.rotation_z(Math::PI/2)
    @furniture.transformation=edit;@model.active_path=[@furniture];@model.edit_transform=edit
    click(1000,0);move(600,600)
    # Group x axis is world +Y, y axis world -X.
    assert_in_delta 600*MM,@tool.width,1e-9;assert_in_delta 400*MM,@tool.height,1e-9
    click(600,600);type('18mm')
    assert_equal [@board,created.first].compact,@furniture.entities.to_a
    component=piece
    assert_equal [@furniture],@model.entities.to_a
    assert_axes component,vec(0,1,0),vec(-1,0,0),vec(0,0,1),pt(1000,0,0)
    local=edit.inverse*component.transformation
    assert local.xaxis.to_a.zip([1,0,0]).all? { |a,b| (a-b).abs<1e-9 } && local.origin==Geom::Point3d.new,'alineada al mueble y en su origen'
    assert_equal [component],@model.selection.to_a
    inventory=PlanosSanto::NameManager.new(@model).inventory[:index]
    assert_equal 'piece',inventory["#{@furniture.persistent_id}/#{component.persistent_id}"]['role']
  end

  def test_exact_measures_follow_the_mouse_direction_and_the_model_units
    click(0,0);move(-100,-50)
    type('60cm;400');assert_equal :thickness,@tool.phase
    type('18mm')
    component=piece
    assert_equal [600.0,400.0,18.0],size_mm(component)
    assert_axes component,vec(-1,0,0),vec(0,-1,0),vec(0,0,1),pt(0,0,0)
    assert_point pt(-600,-400,18),world_corner(component,600,400,18)
    # Three values at once, decimal comma, a negative width against the mouse.
    click(0,0);move(100,50);type('-0,6m;40cm;18')
    component=created.last
    assert_point pt(-600,400,0),world_corner(component,600,400,18);assert_point pt(0,0,18),component.transformation.origin
    assert_equal [600.0,400.0,18.0],size_mm(component)
    # Inch model: bare numbers are inches.
    Sketchup.length_unit=:inch
    click(0,0);move(10,10);type('10;5;1')
    assert_equal [254.0,127.0,25.4],size_mm(created.last)
    assert_equal 3,@model.undo_stack.length
  end

  def test_separators_partial_values_and_invalid_text
    click(0,0);move(300,200)
    type(';250');assert_in_delta 300*MM,@tool.width,1e-9;assert_in_delta 250*MM,@tool.height,1e-9
    @tool.onCancel(0,@view);click(0,0);move(300,200)
    type('abc');assert_match(/No entiendo «abc»/,Sketchup.status_text);assert_equal :rectangle,@tool.phase
    type('1;2;3;4');assert_match(/hasta tres medidas/,Sketchup.status_text)
    # Decimal comma (default): «600,400» is 600,4 mm and the height stays.
    type('600,400');assert_in_delta 600.4*MM,@tool.width,1e-9;assert_in_delta 200*MM,@tool.height,1e-9
    @tool.onCancel(0,@view);click(0,0);move(300,200)
    Sketchup.const_set(:RegionalSettings,Module.new { def self.decimal_separator;'.';end })
    type('600,400');assert_equal :thickness,@tool.phase;assert_in_delta 400*MM,@tool.height,1e-9
    assert_empty @model.operations
    @tool.onCancel(0,@view);@tool.onCancel(0,@view)
    tool=PlanosSanto::DrawComponentTool.new(@model);@model.select_tool(tool)
    tool.onUserText('600;400',@view);assert_match(/Marcá primero la esquina/,Sketchup.status_text)
    assert_empty @model.operations
  end

  def test_negative_thickness_goes_to_the_other_side_typed_or_with_the_mouse
    draw_floor;type('-18')
    component=piece
    assert_axes component,vec(1,0,0),vec(0,1,0),vec(0,0,1),pt(0,0,-18)
    assert_point pt(600,400,0),world_corner(component,600,400,18)
    @view.picks[[700,500]]=Pick.new(pt(700,500,-25),nil,nil,0,'Extremo')
    click(0,0);move(600,400);click(600,400);click(700,500)
    assert_equal [600.0,400.0,25.0],size_mm(created.last)
    assert_point pt(0,0,-25),created.last.transformation.origin
  end

  def test_thickness_follows_the_mouse_ray_but_not_in_a_view_along_the_normal
    draw_floor;move(900,900)
    assert_in_delta 18*MM,@tool.thickness,1e-9,'planta: el rayo es paralelo a la normal'
    @view.mode=:front;move(600,30);assert_in_delta 30*MM,@tool.thickness,1e-9;assert_equal '30mm',Sketchup.vcb_value
    move(600,-40);assert_in_delta(-40*MM,@tool.thickness,1e-9)
    @tool.onLButtonDown(0,600,-40,@view)
    assert_point pt(0,0,-40),piece.transformation.origin;assert_equal [600.0,400.0,40.0],size_mm(piece)
  end

  # A batten: thickness larger than the drawn width is a valid piece.
  def test_thickness_may_exceed_width_and_sizes_are_bounded
    click(0,0);move(40,18);click(40,18);type('2000')
    assert_equal [40.0,18.0,2000.0],size_mm(piece)
    click(0,0);move(300,0);click(300,0)
    assert_match(/El alto tiene que estar entre 0,1 mm y 100 m/,Sketchup.status_text);assert_equal :rectangle,@tool.phase
    type('300;200');type('0');assert_match(/El espesor tiene que estar/,Sketchup.status_text)
    type('200000');assert_match(/El espesor tiene que estar/,Sketchup.status_text)
    assert_equal 1,created.length;assert_equal %i[start commit],ops
  end

  def test_escape_resets_each_phase_and_second_escape_exits_without_touching_the_model
    click(0,0);@tool.onCancel(0,@view)
    assert_equal :corner,@tool.phase;assert @tool.active?
    draw_floor;@tool.onCancel(0,@view);assert_equal :corner,@tool.phase
    draw_floor;@tool.onCancel(1,@view);assert_equal :corner,@tool.phase
    @tool.onCancel(0,@view)
    refute @tool.active?;assert_nil @model.selected_tools.last
    assert_equal '',Sketchup.status_text;assert_equal '',Sketchup.vcb_label;assert_equal '',Sketchup.vcb_value
    assert_equal @before,@model.state;assert_empty @model.operations;assert_equal [@furniture],@model.selection.to_a
  end

  def test_switching_tool_mid_drawing_restores_the_status_bar_and_changes_nothing
    draw_floor
    other=Object.new;def other.activate;end
    @model.select_tool(other)
    refute @tool.active?;assert_equal '',Sketchup.status_text;assert_equal '',Sketchup.vcb_label
    assert_equal @before,@model.state;assert_empty @model.operations
  end

  def test_any_failure_aborts_the_single_operation_and_leaves_the_model_identical
    %i[add_group add_face pushpull to_component commit].each do |step|
      @model.fail_at=step==:commit ? nil : step;@model.commit_result=step!=:commit
      draw_floor;click(600,400)
      assert_equal @before,@model.state,step.to_s
      assert_equal %i[start abort],ops.last(2),step.to_s
      assert_equal [@furniture],@model.selection.to_a
      assert_match(/No se pudo crear la pieza: .*El modelo quedó como estaba/,Sketchup.status_text)
      assert_equal :thickness,@tool.phase;@tool.onCancel(0,@view)
    end
    assert_empty @model.undo_stack
    @model.fail_at=nil;@model.commit_result=true
    draw_floor;click(600,400)
    assert_equal 'Pieza',piece.definition.name;assert_equal 1,@model.undo_stack.length
  end

  def test_context_change_cancels_the_drawing_and_locked_or_foreign_contexts_are_refused
    draw_floor
    @model.active_path=[@furniture];@model.edit_transform=Geom::Transformation.translation(vec(5,0,0))
    move(10,10)
    assert_equal :corner,@tool.phase;assert_match(/Cambió el contexto de edición/,Sketchup.status_text)
    # The new context is adopted for the next drawing.
    draw_floor;assert_equal :thickness,@tool.phase
    @furniture.locked=true;click(600,400)
    assert_match(/bloqueado/,Sketchup.status_text);assert_empty created
    @furniture.locked=false
    Sketchup.active_model=Sketchup::ModelDouble.new;click(600,400)
    assert_match(/Cambiaste de modelo/,Sketchup.status_text)
    Sketchup.active_model=@model
    @furniture.locked=true;@tool.onCancel(0,@view);click(0,0)
    assert_equal :corner,@tool.phase;assert_match(/bloqueado/,Sketchup.status_text)
    assert_equal @before,@model.state;assert_empty @model.operations
  end

  def test_repeated_names_get_a_unique_definition_name_with_or_without_unique_name
    [true,false].each do |native|
      @model=Sketchup::ModelDouble.new(unique_name:native);Sketchup.active_model=@model;@view=@model.active_view
      %w[Pieza Pieza#1].each { |name| @model.definitions.add(name) }
      @tool=PlanosSanto::DrawComponentTool.new(@model);@model.select_tool(@tool)
      draw_floor;click(600,400)
      assert_equal 'Pieza#2',piece.definition.name,native.to_s
      assert_equal 1,@model.definitions.count { |definition| definition.name=='Pieza#2' }
    end
  end

  def test_retyping_after_creation_corrects_the_same_piece_and_one_undo_removes_it
    draw_floor;click(600,400);component=piece
    type('700;450')
    assert_same component,piece;assert_equal [700.0,450.0,18.0],size_mm(component);assert_equal 'Pieza',component.definition.name
    type('25');assert_equal [700.0,450.0,25.0],size_mm(component)
    type('-25');assert_point pt(0,0,-25),component.transformation.origin
    assert_equal [:start,'Dibujar pieza',true,false,true],@model.operations[-2]
    assert_equal 1,@model.undo_stack.length;assert_equal [component],@model.selection.to_a
    @model.undo!
    assert_equal @before,@model.state
    # Undo while the tool is active ends the correction.
    draw_floor;click(600,400);@tool.onCancel(2,@view);type('700;450')
    # The last thickness (25) is the default for the next piece, as typed.
    assert_match(/Marcá primero la esquina/,Sketchup.status_text);assert_equal [600.0,400.0,25.0],size_mm(piece)
  end

  def test_failed_correction_aborts_and_keeps_the_created_piece
    draw_floor;click(600,400);component=piece;after=@model.state
    @model.fail_at=:pushpull;type('700;450')
    assert_equal after,@model.state;assert_equal [600.0,400.0,18.0],size_mm(component)
    assert_match(/El modelo quedó como estaba/,Sketchup.status_text)
    @model.fail_at=nil;type('700;450');assert_equal [700.0,450.0,18.0],size_mm(component)
    # A new corner ends the correction for the previous piece.
    click(0,0);@tool.onCancel(0,@view);type('10;10')
    assert_match(/Marcá primero la esquina/,Sketchup.status_text)
  end

  def test_preview_draws_rectangle_then_box_with_extents_and_lock_color
    click(0,0);move(600,400);@tool.draw(@view)
    mode,points=@view.draws.last
    assert_equal 1,mode;assert_equal 8,points.length;assert_equal 'Magenta',@view.drawing_color
    box=@tool.getExtents;assert_point pt(0,0,0),box.min;assert_point pt(600,400,0),box.max
    click(600,400);@tool.onCancel(0,@view);@tool.onKeyDown(38,0,0,@view);draw_floor;@tool.draw(@view)
    assert_equal 24,@view.draws.last[1].length;assert_equal 'Blue',@view.drawing_color
    assert_point pt(600,400,18),@tool.getExtents.max
    assert_operator @view.input_draws,:>=,2
    assert_empty @model.operations
  end

  # Revisión 0826 · 1: corregir por VCB borra y rehace la caja, así que nunca
  # después de otro trabajo sobre la pieza.
  def test_painting_after_creating_and_then_typing_measures_erases_nothing
    draw_floor;click(600,400);component=piece
    face=component.definition.entities.grep(Sketchup::Face).first;face.material='Roble'
    after=@model.state;count=@model.operations.length
    type('700;450')
    assert_same component,piece;assert_same face,component.definition.entities.grep(Sketchup::Face).first
    assert_equal 'Roble',face.material;assert face.valid?
    assert_equal after,@model.state;assert_equal count,@model.operations.length,'Ninguna operación'
    assert_equal [600.0,400.0,18.0],size_mm(component)
    assert_match(/ya cambió.*herramientas de SketchUp/,Sketchup.status_text)
    assert_equal 'Medidas',Sketchup.vcb_label,'Se descartó la corrección'
    type('700;450');assert_match(/Marcá primero la esquina/,Sketchup.status_text)
  end

  def test_any_later_change_to_the_piece_cancels_the_correction
    edits={
      'dorso pintado'=>lambda { |c| c.definition.entities.grep(Sketchup::Face).last.back_material='Roble' },
      'material de la instancia'=>lambda { |c| c.material='Roble' },
      'atributo propio'=>lambda { |c| c.set_attribute('Taller','nota','revisar') },
      'definición renombrada'=>lambda { |c| c.definition.name='Lateral' },
      'otra instancia'=>lambda { |c| @model.entities.items << Sketchup::ComponentInstance.new(@model,c.definition) },
      'geometría agregada'=>lambda { |c| c.definition.entities.add_face(pt(0,0,0),pt(10,0,0),pt(10,10,0)) }
    }
    edits.each do |label,edit|
      draw_floor;click(600,400);component=created.last
      edit.call(component);after=@model.state;count=@model.operations.length
      type('700;450')
      assert_equal after,@model.state,label;assert_equal count,@model.operations.length,label
      assert_equal [600.0,400.0,18.0],size_mm(component),label
      assert_match(/ya cambió/,Sketchup.status_text,label)
    end
    # Sin cambios sigue corrigiendo la misma pieza.
    draw_floor;click(600,400);component=created.last;type('700;450')
    assert_equal [700.0,450.0,18.0],size_mm(component)
  end

  # Revisión 0826 · 5: SketchUp repite onKeyDown con repeat>1 al mantener la tecla.
  def test_holding_an_arrow_does_not_toggle_the_locked_plane
    assert @tool.onKeyDown(39,1,0,@view);assert_equal :x,@tool.locked
    assert @tool.onKeyDown(39,2,0,@view);assert @tool.onKeyDown(39,3,0,@view);assert_equal :x,@tool.locked
    click(0,0);assert @tool.onKeyDown(38,1,0,@view);assert_equal :z,@tool.locked
    (2..6).each { |count| assert @tool.onKeyDown(38,count,0,@view) }
    assert_equal :z,@tool.locked;assert_point vec(0,0,1),@tool.normal
    assert @tool.onKeyDown(38,1,0,@view);assert_nil @tool.locked,'Una nueva pulsación sí alterna'
    assert_empty @model.operations
  end

  # Revisión 0826 · 6: la caja local tiene que ser [0,w]x[0,h]x[0,t].
  def test_box_must_fill_the_positive_local_box_or_the_operation_aborts
    draw_floor;click(600,400);component=piece
    box=Geom::BoundingBox.new.add(component.definition.entities.grep(Sketchup::Face).flat_map(&:points))
    assert_point pt(0,0,0),box.min;assert_point pt(600,400,18),box.max
    after=@model.state;undo=@model.undo_stack.length
    @model.pushpull_flip=true
    draw_floor;click(600,400)
    assert_equal after,@model.state;assert_equal %i[start abort],ops.last(2);assert_equal undo,@model.undo_stack.length
    assert_match(/extruyó la caja fuera de su lugar.*El modelo quedó como estaba/,Sketchup.status_text)
    # Lo mismo al corregir la pieza recién creada.
    @tool.onCancel(0,@view);@model.pushpull_flip=false;draw_floor;click(600,400);component=created.last;after=@model.state
    @model.pushpull_flip=true;type('700;450')
    assert_equal after,@model.state;assert_equal [600.0,400.0,18.0],size_mm(component);assert_equal :abort,ops.last
  end

  # Revisión 0826 · 7: InputPoint#transformation puede ser nil.
  def test_face_normal_without_input_transformation_uses_the_identity
    @view.mode=:front;@view.raw_transformation=true
    wall=Sketchup::Face.new(@model,@furniture.entities,[pt(0,0,0),pt(0,0,900),pt(800,0,900),pt(800,0,0)],vec(0,-1,0))
    @view.picks[[100,50]]=Pick.new(pt(100,0,50),wall,nil,2,'En la cara')
    click(100,50)
    assert_equal :rectangle,@tool.phase,Sketchup.status_text;assert_point vec(0,-1,0),@tool.normal
  end

  # Revisión 0826 · 9: una excepción fuera de StandardError también aborta.
  def test_an_exception_outside_standard_error_still_aborts_the_operation
    fatal=Class.new(Exception)
    draw_floor
    @model.entities.define_singleton_method(:add_group) { raise fatal,'sintética' }
    assert_raises(fatal) { click(600,400) }
    assert_equal @before,@model.state;assert_equal %i[start abort],ops.last(2);assert_empty @model.undo_stack
  end

  # Revisión 0826 · 9: ninguna excepción de un evento llega a SketchUp y draw avisa una sola vez.
  def test_no_event_lets_an_exception_reach_sketchup_and_draw_warns_once
    broken=Object.new;broken.define_singleton_method(:to_a) { raise 'ruta rota' }
    click(0,0);@model.active_path=broken
    assert @tool.onKeyDown(38,1,0,@view);assert_match(/ruta rota/,Sketchup.status_text)
    @tool.activate;assert_match(/ruta rota/,Sketchup.status_text)
    @model.active_path=nil;@tool.activate;@tool.onCancel(1,@view);assert_equal :corner,@tool.phase
    @model.define_singleton_method(:select_tool) { |_tool| raise 'sin herramienta' }
    @tool.onCancel(0,@view);assert_match(/sin herramienta/,Sketchup.status_text)
    calls=0;flaky=Sketchup::ViewDouble.new;flaky.define_singleton_method(:invalidate) { calls+=1;raise 'vista' if calls==1 }
    @tool.resume(flaky);assert_match(/vista/,Sketchup.status_text)
    failing=Sketchup::ViewDouble.new;failing.define_singleton_method(:draw) { |*_| raise 'gl' }
    click(0,0);move(600,400)
    _out,err=capture_io { 3.times { @tool.draw(failing) } }
    assert_equal 1,err.scan(/no se pudo dibujar la vista previa/).length
    assert_empty @model.operations
  end
end
