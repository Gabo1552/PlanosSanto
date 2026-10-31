# frozen_string_literal: true
# Veta por pieza (0.8.26) con dobles de la API (grain_double.rb): criterio automático, «Girar veta 90°» y
# «Veta automática», Deshacer en un paso, aborto, componentes compartidos, cantos y casos ambiguos.
# Simulado: Face#position_material solo guarda los puntos; NO es SketchUp.
require 'minitest/autorun'
require_relative 'grain_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../piece_grain'

class PieceGrainTest < Minitest::Test
  G=PlanosSanto::Grain
  D=GrainDouble
  T=Geom::Transformation
  def setup
    @oak={'id'=>'22222222-2222-2222-2222-222222222222','name'=>'Roble veteado','kind'=>'sheet','sku'=>'ROB18','supplier'=>'Taller','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true,'compatibleIds'=>[]}
    @white={'id'=>'33333333-3333-3333-3333-333333333333','name'=>'Blanco liso','kind'=>'sheet','sku'=>'BL18','supplier'=>'Taller','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'compatibleIds'=>[]}
    @edge={'id'=>'44444444-4444-4444-4444-444444444444','name'=>'Canto roble','kind'=>'edge','sku'=>'CR22','supplier'=>'Taller','thicknessMm'=>0.45,'widthMm'=>22,'compatibleIds'=>[]}
    @wood=D.material(500,'Roble veteado',@oak);@plain=D.material(501,'Blanco liso',@white);@band=D.material(502,'Canto roble',@edge,texture:nil)
    broad={'-y'=>@wood,'+y'=>@wood,'-z'=>@wood,'+z'=>@wood}
    # Puerta y lateral (verticales), estante (horizontal, hereda el roble del contenedor), fondo y frente de cajón.
    @door_def=D.box('Puerta',[600,18,2000],broad.merge('-x'=>@band,'+x'=>@band))
    @side_def=D.box('Lateral',[18,560,2000],{'-x'=>@wood,'+x'=>@wood,'+y'=>@band})
    @shelf_def=D.box('Estante',[800,560,18],{'+y'=>@band})
    @back_def=D.box('Fondo',[800,3,2000],{'-y'=>@wood,'+y'=>@wood})
    @drawer_def=D.box('Frente de cajón',[600,18,150],broad.merge('+x'=>@band))
    @door=Sketchup::ComponentInstance.new(11,'Puerta',@door_def)
    @side=Sketchup::ComponentInstance.new(12,'Lateral',@side_def,T.translation(30,0,0))
    @shelf=Sketchup::ComponentInstance.new(13,'Estante',@shelf_def,T.translation(0,0,20));@shelf.material=@wood
    @back=Sketchup::ComponentInstance.new(14,'Fondo',@back_def,T.translation(0,24,0))
    @drawer=Sketchup::ComponentInstance.new(15,'Frente de cajón',@drawer_def,T.translation(0,-1,0))
    @root=Sketchup::Group.new(1,'Placard',Sketchup::Definition.new('Placard','placard',[@door,@side,@shelf,@back,@drawer]))
    # Otro mueble con una puerta que es el MISMO componente (definición compartida).
    @other_door=Sketchup::ComponentInstance.new(21,'Puerta',@door_def)
    @other=Sketchup::Group.new(2,'Alacena',Sketchup::Definition.new('Alacena','alacena',[@other_door]),T.translation(100,0,0))
    @model=D::Model.new(Sketchup::Model.new([@root,@other],'grain-synthetic','Veta sintética',''))
    @model.materials=[@wood,@plain,@band]
    @catalog=D.catalog([@oak,@white,@edge])
    @grain=PlanosSanto::PieceGrain.new(@model,catalog:@catalog)
  end
  def axis_of(entity);entity.get_attribute(G::DICT,G::KEY);end
  def uv(definition,key,front=true);D.face(definition,key).uv[front];end
  def info(id)
    snapshot=PlanosSanto::NameManager.new(@model).inventory;node=snapshot[:index].fetch(id)
    @grain.send(:info,node)
  end

  # --- Criterio automático ---------------------------------------------------------------------------
  def test_automatic_axis_on_door_side_shelf_back_and_drawer_front
    assert_equal [2,'vertical',nil],info('1/11').values_at('axis','direction','review'),'Puerta: vertical, sigue la altura'
    assert_equal [2,'vertical',nil],info('1/12').values_at('axis','direction','review'),'Lateral: vertical'
    assert_equal [0,'horizontal',nil],info('1/13').values_at('axis','direction','review'),'Estante: el lado más largo'
    assert_equal [2,'vertical',nil],info('1/14').values_at('axis','direction','review'),'Fondo: vertical'
    drawer=info('1/15')
    assert_equal [2,'vertical'],drawer.values_at('axis','direction'),'Frente de cajón: pieza vertical, la veta sigue la altura (criterio confirmado)'
    assert_equal G::WIDE,drawer['review'],'…pero más ancha que alta: queda el aviso para confirmarla'
    assert_equal 'auto',drawer['source']
  end
  def test_ambiguous_cases_are_flagged_not_guessed
    flat=T.new.to_a
    assert_equal G::SQUARE,G.info([450,450,18],flat)['review'],'Pieza horizontal cuadrada'
    assert_nil G.info([450,18,450],flat)['review'],'Puerta cuadrada: vertical, sin ambigüedad'
    # 45° alrededor de Y: ni vertical ni horizontal.
    c=Math.cos(Math::PI/4);s=Math.sin(Math::PI/4);oblique=[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]
    found=G.info([600,18,2000],oblique);assert_equal [2,G::OBLIQUE],found.values_at('axis','review')
    # Mueble girado sobre el piso (90° en Z): la veta no cambia ni hay aviso.
    turned=T.rotation_z(Math::PI/2).to_a
    assert_equal [2,nil],G.info([600,18,2000],turned,root:turned).values_at('axis','review')
    # Mueble acostado (90° en X): se avisa; la pieza la decide la vertical del modelo.
    lying=[1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]
    found=G.info([800,560,18],lying,root:lying);assert_equal [1,G::TILTED],found.values_at('axis','review')
    # Elegida a mano: manda y ya no es ambigua; un eje inválido (el espesor) se ignora.
    assert_equal [1,'manual',nil],G.info([450,450,18],flat,override:1).values_at('axis','source','review')
    assert_equal [0,'auto'],G.info([450,450,18],flat,override:2).values_at('axis','source')
    assert_nil G.info([18,18,600],flat),'Sin espesor claro no hay veta'
  end
  def test_scan_metadata_carries_local_axis_and_manual_choice
    tree=PlanosSanto::Exporter.new(@model).tree
    nodes={};PlanosSanto::Exporter.each_node(tree['roots']) { |n| nodes[n['id']]=n }
    assert_equal({'grainAxis'=>2,'grainSource'=>'auto','grainReview'=>nil,'grainDirection'=>'vertical'},nodes['1/11']['metadata'].slice('grainAxis','grainSource','grainReview','grainDirection'))
    assert_equal 0,nodes['1/13']['metadata']['grainAxis']
    @door.set_attribute(G::DICT,G::KEY,0)
    tree=PlanosSanto::Exporter.new(@model).tree;nodes={};PlanosSanto::Exporter.each_node(tree['roots']) { |n| nodes[n['id']]=n }
    assert_equal [0,'manual','horizontal'],nodes['1/11']['metadata'].values_at('grainAxis','grainSource','grainDirection')
    assert_equal 2,nodes['2/21']['metadata']['grainAxis'],'La otra puerta (otra instancia) sigue automática'
    @door.set_attribute(G::DICT,G::KEY,G::AUTO)
    tree=PlanosSanto::Exporter.new(@model).tree;nodes={};PlanosSanto::Exporter.each_node(tree['roots']) { |n| nodes[n['id']]=n }
    assert_equal [2,'auto'],nodes['1/11']['metadata'].values_at('grainAxis','grainSource')
  end

  # --- Girar y volver a automático --------------------------------------------------------------------
  def test_rotate_then_auto_aligns_texture_u_with_the_grain_in_one_undo_step_each
    result=@grain.change(['1/12'],'rotate')
    assert_equal [true,1,0],result.values_at('changed','pieces','isolated')
    assert_equal 1,axis_of(@side),'Lateral girado: la veta va por el eje Y (560 mm)'
    w=1000/25.4;h=500/25.4
    # Cara ancha −X: U (1,0) a lo largo de Y con el ancho real de la textura; V a lo largo de −Z, porque
    # Y×Z apunta a +X y la cara mira a −X: así la foto no sale espejada (revisión 0826 · 10).
    a=D.face(@side_def,'-x').vertices.first.position.to_a.map(&:to_f)
    assert_equal [a,[0,0,1],[a[0],a[1]+w,a[2]],[1,0,1],[a[0],a[1],a[2]-h],[0,1,1]].map { |p| p.map { |v| v.round(6) } },uv(@side_def,'-x')
    refute_nil uv(@side_def,'+x');assert_nil uv(@side_def,'-y'),'La testa de la veta no se toca'
    assert_same @band,D.face(@side_def,'+y').material;assert_nil uv(@side_def,'+y'),'El canto no se toca'
    assert_equal 1,@model.operations.count { |o| o[0]==:start };assert_equal 1,@model.undo_states.length
    @grain.change(['1/12'],'auto')
    assert_equal G::AUTO,axis_of(@side);assert_equal 2,info('1/12')['axis']
    assert_in_delta a[2]+w,uv(@side_def,'-x')[2][2],1e-6,'Veta automática: U vuelve a la altura'
    @model.undo;assert_equal 1,axis_of(@side);@model.undo;assert_nil axis_of(@side);assert_nil uv(@side_def,'-x'),'Dos Ctrl+Z dejan todo como estaba'
  end
  def test_scaled_and_mirrored_instances_keep_the_physical_texture_size
    small=D.box('Puerta escalada',[300,9,1000],{'-y'=>@wood,'+y'=>@wood})
    scaled=Sketchup::ComponentInstance.new(16,'Puerta escalada',small,T.scale(-2,2,2))
    @root.definition.entities << scaled
    @grain.change(['1/16'],'auto')
    points=uv(small,'-y');a=points[0]
    assert_in_delta a[2]+1000/25.4/2,points[2][2],1e-6,'Escala 2: medio tramo local = la textura física'
    assert_in_delta a[0]+500/25.4/2,points[4][0],1e-6
  end
  def test_inherited_board_is_painted_only_on_broad_fronts_and_warned
    before=@shelf_def.entities.map { |f| [f.material,f.back_material] }
    result=@grain.change(['1/13'],'rotate')
    assert_equal 2,result['paintedFaces'];assert_match(/pintaron 2 caras con «Roble veteado».*Ctrl\+Z/,result['warnings'].join(' '))
    assert_same @wood,D.face(@shelf_def,'-z').material;assert_same @wood,D.face(@shelf_def,'+z').material
    assert_nil D.face(@shelf_def,'-z').back_material,'El dorso sigue sin material propio'
    %w[-x +x -y].each { |key| assert_nil D.face(@shelf_def,key).material,"#{key} sigue heredando" }
    assert_same @band,D.face(@shelf_def,'+y').material
    @model.undo;assert_equal before,@shelf_def.entities.map { |f| [f.material,f.back_material] }
  end

  # --- Abortar: el modelo queda igual -----------------------------------------------------------------
  def test_failure_aborts_the_single_operation_and_keeps_the_model
    attrs=axis_of(@door);faces=@door_def.entities.map { |f| [f.material,f.uv.dup] }
    @door.define_singleton_method(:make_unique) { raise 'no debe aislar: se piden todas las apariciones' }
    D.face(@door_def,'+y').fail_position=true
    error=assert_raises(PlanosSanto::ExportError) { @grain.change(['1/11','2/21'],'rotate') }
    assert_match(/no orientó la textura/,error.message)
    assert_equal :abort,@model.operations.last[0];assert_empty @model.undo_states
    assert_nil attrs;assert_nil axis_of(@door);assert_equal faces,@door_def.entities.map { |f| [f.material,f.uv.dup] }
  end
  def test_validation_errors_open_no_operation
    @root.locked_for_names=true
    assert_match(/bloqueado/,assert_raises(PlanosSanto::ExportError) { @grain.change(['1/12'],'rotate') }.message,'Grupo bloqueado')
    @root.locked_for_names=false
    D.face(@side_def,'-x').projected=true
    assert_match(/proyectada/,assert_raises(PlanosSanto::ExportError) { @grain.change(['1/12'],'rotate') }.message)
    D.face(@side_def,'-x').projected=false
    plain=D.box('Repisa blanca',[800,300,18],{'-z'=>@plain,'+z'=>@plain})
    @root.definition.entities << Sketchup::ComponentInstance.new(17,'Repisa blanca',plain)
    assert_match(/no tiene una placa con veta/,assert_raises(PlanosSanto::ExportError) { @grain.change(['1/17'],'rotate') }.message,'Pieza sin veta')
    %w[x girar].each { |mode| assert_raises(PlanosSanto::ExportError) { @grain.change(['1/12'],mode) } }
    assert_raises(PlanosSanto::ExportError) { @grain.change(['1/12','1/12'],'rotate') }
    assert_raises(PlanosSanto::ExportError) { @grain.change(['9/99'],'rotate') }
    assert_raises(PlanosSanto::ExportError) { @grain.change(['1'],'rotate') } # un mueble no es una pieza
    assert_empty @model.operations
    assert_match(/bloqueado/,(@root.locked_for_names=true;@grain.blocker(['1/12'])))
    @root.locked_for_names=false;assert_nil @grain.blocker(['1/12']);assert_empty @model.operations,'La revisión de Piezas no escribe'
  end

  # --- Componentes compartidos ------------------------------------------------------------------------
  def test_shared_door_in_two_furniture_is_isolated_without_touching_the_other
    D.enable_unique(@door)
    result=@grain.change(['1/11'],'rotate')
    assert_equal 1,result['isolated'];assert_match(/Se hizo único/,result['warnings'].join)
    refute_same @door_def,@door.definition;assert_same @door_def,@other_door.definition
    assert_equal 0,axis_of(@door);assert_nil axis_of(@other_door)
    refute_nil uv(@door.definition,'-y');assert_nil uv(@door_def,'-y'),'La puerta del otro mueble conserva su textura'
    assert_same @band,D.face(@door.definition,'+x').material,'Hacer único conserva los cantos'
    @model.undo;assert_same @door_def,@door.definition;assert_nil axis_of(@door)
  end
  def test_all_occurrences_with_the_same_grain_write_the_definition_once
    @door.define_singleton_method(:make_unique) { raise 'no debe aislar' }
    @grain.change(['1/11','2/21'],'rotate')
    assert_equal [0,0],[axis_of(@door),axis_of(@other_door)];assert_same @door_def,@door.definition
    refute_nil uv(@door_def,'-y')
  end
  def test_shared_parent_cannot_be_isolated_and_blocks_before_writing
    D.enable_unique(@side)
    copy=Sketchup::Group.new(3,'Placard repetido',@root.definition,T.translation(300,0,0))
    @model.entities << copy
    error=assert_raises(PlanosSanto::ExportError) { @grain.change(['1/12'],'rotate') }
    assert_match(/compartido.*no se puede aislar/,error.message);assert_empty @model.operations
    assert_match(/no se puede aislar/,@grain.blocker(['1/12']))
    # Con todas sus apariciones y la misma veta sí se puede: es la misma pieza en los dos placares.
    @grain.change(['1/12','3/12'],'rotate');assert_equal 1,axis_of(@side)
  end

  # --- Revisión 0826 ----------------------------------------------------------------------------------
  # 2: la misma definición con dos objetos Ruby distintos (otro envoltorio, mismo guid) se agrupa una vez.
  def test_definitions_are_grouped_by_guid_not_by_the_ruby_wrapper
    @other_door.definition=Sketchup::Definition.new(@door_def.name,@door_def.guid,@door_def.entities)
    @door.define_singleton_method(:make_unique) { raise 'no debe aislar' }
    result=@grain.change(['1/11','2/21'],'rotate')
    assert_equal [4,0],result.values_at('orientedFaces','isolated'),'Las cuatro caras anchas, una sola vez'
    assert_equal [0,0],[axis_of(@door),axis_of(@other_door)]
  end
  # 3: dos apariciones de la misma definición con escalas distintas no comparten la textura.
  def test_shared_occurrences_with_different_scales_are_isolated_or_blocked
    @other_door.transformation=T.scale(2,1,1)
    error=assert_raises(PlanosSanto::ExportError) { @grain.change(['1/11','2/21'],'rotate') }
    assert_match(/escalas distintas.*no se puede aislar/,error.message);assert_empty @model.operations
    assert_match(/escalas distintas/,@grain.blocker(['1/11','2/21']))
    D.enable_unique(@door);D.enable_unique(@other_door)
    result=@grain.change(['1/11','2/21'],'rotate')
    assert_equal 1,result['isolated'];refute_same @door_def,@door.definition;assert_same @door_def,@other_door.definition
    w=1000/25.4
    mine=uv(@door.definition,'-y');theirs=uv(@door_def,'-y')
    assert_in_delta mine[0][0]+w,mine[2][0],1e-6,'Escala 1: la textura entera'
    assert_in_delta theirs[0][0]+w/2,theirs[2][0],1e-6,'Escala 2 en X: medio tramo local'
    assert_equal [0,0],[axis_of(@door),axis_of(@other_door)]
  end
  # 10: U×V sigue a la cara que se mira: frente, dorso de la cara e instancia espejada.
  def test_mapping_keeps_the_texture_unmirrored_on_front_and_back_faces
    h=500/25.4
    front=D.face(@side_def,'+x');back=D.face(@side_def,'-x')
    v=lambda { |face,**options| m=G.mapping(face,@wood,[1.0,1.0,1.0],1,**options);m['points'][2][2]-m['points'][0][2] }
    assert_in_delta h,v.call(front),1e-9,'+X: Y×Z = +X, V sube'
    assert_in_delta(-h,v.call(back),1e-9,'−X: Y×Z = +X apunta al revés, V baja')
    assert_in_delta(-h,v.call(front,front:false),1e-9,'El dorso de la cara se mira desde el otro lado')
    assert_in_delta(-h,v.call(front,mirrored:true),1e-9,'Instancia espejada')
    assert_in_delta h,v.call(back,front:false),1e-9
    assert G.mirrored?(T.scale(-2,2,2).to_a);refute G.mirrored?(T.scale(2,2,2).to_a)
  end
  # 11: una placa sin textura no se pinta, pero la veta se guarda y se avisa.
  def test_board_without_texture_is_not_painted_but_keeps_the_grain_and_warns
    @wood.texture=nil
    result=@grain.change(['1/13'],'rotate')
    assert_equal [0,0,2],result.values_at('paintedFaces','orientedFaces','texturelessFaces')
    %w[-z +z].each { |key| assert_nil D.face(@shelf_def,key).material,"#{key} sigue heredando" }
    assert_equal 1,axis_of(@shelf),'La veta manda en Piezas, el TXT y la optimización'
    assert_match(/«Roble veteado» no tiene textura: no hay textura que orientar/,result['warnings'].join(' '))
    refute_match(/pint/,result['warnings'].join(' '))
  end
  # 8: con la pieza abierta en SketchUp no se escribe nada.
  def test_open_piece_in_the_active_path_is_refused_before_any_operation
    D.enable_unique(@door)
    @model.active_path=[@root,@door]
    assert_match(/«Puerta» está abierta para editar/,assert_raises(PlanosSanto::ExportError) { @grain.change(['1/11'],'rotate') }.message)
    assert_match(/abierta para editar/,@grain.blocker(['1/12','1/11']))
    assert_empty @model.operations;assert_same @door_def,@door.definition
    @model.active_path=[@root];@grain.change(['1/12'],'rotate');assert_equal 1,axis_of(@side),'Con el mueble abierto sí'
  end
  # 9: una excepción fuera de StandardError también revierte la operación.
  def test_an_exception_outside_standard_error_aborts_the_operation
    fatal=Class.new(Exception)
    D.face(@side_def,'+x').define_singleton_method(:position_material) { |*_| raise fatal,'sintética' }
    assert_raises(fatal) { @grain.change(['1/12'],'rotate') }
    assert_equal :abort,@model.operations.last[0];assert_empty @model.undo_states;assert_nil axis_of(@side)
  end
  # 12: Piezas revisa muchas filas con la biblioteca ya leída.
  def test_blocker_uses_the_catalog_it_is_given
    reads=0;data=@catalog.read;@catalog.define_singleton_method(:read) { reads+=1;data }
    snapshot=PlanosSanto::NameManager.new(@model).inventory(geometry:false)
    %w[1/12 1/13 1/14].each { |id| assert_nil @grain.blocker([id],snapshot:snapshot,catalog:data),id }
    assert_equal 0,reads
    @grain.blocker(['1/12'],snapshot:snapshot);assert_equal 1,reads,'Sin catálogo lo lee como antes'
  end
end
