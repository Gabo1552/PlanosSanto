# frozen_string_literal: true
# Hito 1 (0.8.8): "the material the palette shows is the material that paints".
# API doubles only: synthetic boards, generated QA images and SKM documents.
# Nothing here claims execution inside SketchUp; see VALIDACION_SKETCHUP_088.md.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require_relative 'names_double'
require_relative 'photo_material_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'
require_relative '../photo_material'
require_relative '../paint_materials'
require_relative '../supplier_order'

module PaintReadyFaceDouble
  def texture_positioned?(_front);false;end
  def texture_projected?(_front);false;end
end
class PaintReadyModelDouble < NamingModelDouble
  attr_accessor :materials
  def state
    super.merge(definitions:all_instances.map { |entity| [entity,entity.definition,entity.transformation] },
                faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:definitions].each { |entity,definition,transformation| entity.definition=definition;entity.transformation=transformation }
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
end

class PaintReadyTest < Minitest::Test
  class Picker
    attr_accessor :path,:leaf
    def do_pick(_x,_y);end
    def count;path ? 1 : 0;end
    def path_at(_index);path;end
    def leaf_at(_index);leaf;end
  end
  class View
    attr_accessor :drawing_color
    def initialize(picker);@picker=picker;end
    def pick_helper;@picker;end
    def invalidate;end
    def draw(_mode,_points);end
  end

  def setup
    @directory=Dir.mktmpdir;@source=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    # Model A: where the photo material was originally created.
    @first=PhotoFixture::Model.new
    @first_photo=PlanosSanto::PhotoMaterial.new(@first,catalog:@catalog,directory:@directory,guard:lambda { true })
    # Model B: a second, unrelated SKP that has never seen the material.
    @model=board_model
    @narrow=Sketchup::Material.new(8100,'Canto existente',Sketchup::Color.new(2,3,4),1,nil)
    @faces.drop(2).each { |face| face.material=@narrow;face.back_material=@narrow }
  end
  def teardown;FileUtils.remove_entry(@directory);FileUtils.remove_entry(@source);end

  def board_model
    board=Fixture.board_definition;@faces=board.entities
    @faces.each_with_index { |face,index| face.extend(PaintReadyFaceDouble);face.define_singleton_method(:persistent_id) { 100+index } }
    @pieces=(11..15).map { |id| Sketchup::ComponentInstance.new(id,"Pieza #{id}",board) }
    @pieces.each { |piece| enable_unique(piece) }
    root=Sketchup::Group.new(1,'M01',Sketchup::Definition.new('M01','root-only',@pieces))
    model=PaintReadyModelDouble.new(Sketchup::Model.new([root],'paint-ready-qa','Paint ready QA',''))
    model.materials=[];PhotoFixture.decorate(model)
  end
  def enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copies=definition.entities.each_with_index.map do |face,index|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a);copy.extend(PaintReadyFaceDouble)
        copy.material=face.material;copy.back_material=face.back_material
        id=persistent_id*1000+index;copy.define_singleton_method(:persistent_id) { id };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"isolated-#{persistent_id}",copies);self
    end
  end
  def create_photo(service=@first_photo,name='Caju 18mm.jpg',bytes=PhotoFixture.jpeg,extra={})
    path=File.join(@source,name);File.binwrite(path,bytes);picked=service.pick(path)
    service.create(picked['token'],{'revision'=>picked['revision'],'name'=>picked['name'],'kind'=>'sheet','thicknessMm'=>18,'action'=>'new','confirmed'=>true}.merge(extra))
  end
  def service(model=@model);PlanosSanto::PaintMaterials.new(model,catalog:@catalog,directory:@directory);end
  def smart(model=@model);PlanosSanto::SmartPaint.new(model,catalog:@catalog);end
  def options(prepared,index=0)
    piece=@pieces[index];face=piece.definition.entities[2]
    {'mode'=>'sheet','immediatePiece'=>true,'targets'=>[{'pieceId'=>"1/#{piece.persistent_id}",'faceIds'=>[face.persistent_id.to_s]}],
     'catalogId'=>prepared['catalogId'],'materialUuid'=>prepared['materialUuid']}
  end
  def sides(piece);piece.definition.entities.map { |face| [face.material,face.back_material] };end
  def assert_board(piece,material)
    assert_equal [[material,material],[material,material]],sides(piece).first(2)
    assert_equal Array.new(4) { [@narrow,@narrow] },sides(piece).drop(2),'los cantos existentes deben conservarse'
  end
  def item(name=nil)
    items=@catalog.read['items'];name ? items.find { |row| row['name']==name } : items.first
  end
  def update_item(id)
    data=@catalog.read;row=data['items'].find { |candidate| candidate['id']==id };yield row;@catalog.save(data['items'],data['revision'])
  end

  # Prueba obligatoria 1-6 + C2: foto creada en el modelo A, instalada sola en el modelo B.
  def test_photo_from_another_model_is_installed_automatically_when_chosen_and_paints_immediately
    created=create_photo
    material_a=@first.materials.last
    refute_nil material_a.texture,'la foto debe quedar como textura real del material'
    assert_equal PhotoFixture.jpeg,File.binread(material_a.texture.filename)
    states=service.states
    assert_equal 'installable',states[created['catalogId']]['state']
    assert_empty @model.materials
    prepared=service.prepare(created['catalogId'],'sheet')
    assert prepared['installed'];assert_equal created['catalogId'],prepared['catalogId']
    installed=@model.materials.last
    assert_equal PhotoFixture.jpeg,File.binread(installed.texture.filename)
    assert_equal 'ready',service.states[created['catalogId']]['state']
    assert_equal 1,@model.operations.count { |operation| operation.first==:start }
    again=service.prepare(created['catalogId'],'sheet')
    refute again['installed'];assert_equal prepared['materialUuid'],again['materialUuid']
    assert_equal 1,@model.materials.length,'elegir de nuevo no duplica el material'
    result=smart.apply_immediate(options(prepared))
    assert result['changed'];assert_board(@pieces[0],installed)
  end

  # C1: ficha comercial aprobada sin imagen ni color.
  def test_commercial_item_without_visual_reports_a_specific_actionable_state_instead_of_texture_error
    row=@catalog.new_item('Camellia','sheet').merge('sku'=>'CAM18','supplier'=>'Maderera QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true)
    @catalog.save([row],0)
    state=service.states[row['id']]
    assert_equal 'needs_visual',state['state'];assert_equal 'assign_visual',state['action']
    error=assert_raises(PlanosSanto::ExportError) { service.prepare(row['id'],'sheet') }
    assert_match(/no tiene imagen, textura ni color/,error.message)
    refute_match(/textura válida/,error.message)
    assert_empty @model.operations
  end

  # C3 + prueba obligatoria 9: SKU, proveedor, formato y aprobación no bloquean pintar.
  def test_commercial_changes_never_block_painting_but_are_reported_for_the_supplier
    created=create_photo;prepared=service.prepare(created['catalogId'],'sheet')
    update_item(created['catalogId']) do |row|
      row.merge!('sku'=>'CAJ-18-NUEVO','supplier'=>'Otro proveedor','widthMm'=>1830,'lengthMm'=>2750,'grain'=>true,'approved'=>true)
    end
    assert_equal 'ready',service.states[created['catalogId']]['state']
    material,=PlanosSanto::NativePaint.new(@model,catalog:@catalog).material_for('catalogId'=>created['catalogId'],'materialUuid'=>prepared['materialUuid'],'mode'=>'sheet')
    assert_same @model.materials.last,material
    library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).status
    row=library['materials'].find { |native| native.dig('binding','catalogId')==created['catalogId'] }
    assert_empty row['issues'];refute_empty row['commercialIssues']
    5.times { |index| assert smart.apply_immediate(options(prepared,index))['changed'];assert_board(@pieces[index],material) }
  end

  # C4: archivo del activo faltante o alterado: mensajes distintos, sin pintar a ciegas.
  def test_missing_and_tampered_library_files_are_distinguished
    created=create_photo;photo=item['observed']['photo']
    skm=File.join(@directory,'material-assets',"#{photo['skmHash']}.skm");bytes=File.binread(skm)
    File.binwrite(skm,'alterado')
    state=service.states[created['catalogId']]
    assert_equal 'asset_corrupt',state['state'];assert_match(/alterado o está dañado/,state['message'])
    error=assert_raises(PlanosSanto::ExportError) { service.prepare(created['catalogId'],'sheet') };assert_match(/alterado o está dañado/,error.message)
    File.delete(skm)
    state=service.states[created['catalogId']]
    assert_equal 'asset_missing',state['state'];assert_match(/Falta el archivo/,state['message'])
    File.binwrite(skm,bytes)
    assert_equal 'installable',service.states[created['catalogId']]['state']
  end

  # Integridad al instalar, no en cada clic: un material ya instalado sigue pintando
  # aunque se mueva la biblioteca local (por ejemplo, el SKP abierto en otra PC).
  def test_installed_material_keeps_painting_without_rehashing_library_files_on_each_click
    created=create_photo;prepared=service.prepare(created['catalogId'],'sheet')
    hashed=0;original=Digest::SHA256.method(:file)
    Digest::SHA256.singleton_class.send(:define_method,:file) { |*args| hashed+=1;original.call(*args) }
    begin
      3.times { |index| assert smart.apply_immediate(options(prepared,index))['changed'] }
    ensure
      Digest::SHA256.singleton_class.send(:define_method,:file) { |*args| original.call(*args) }
    end
    assert_equal 0,hashed,'el clic no debe recalcular hashes de archivos de la biblioteca'
    FileUtils.rm_rf(File.join(@directory,'photo-assets'))
    assert smart.apply_immediate(options(prepared,3))['changed']
  end

  # C5: escala verificada modificada en el editor de SketchUp.
  def test_scale_edited_in_sketchup_is_reported_as_texture_mismatch
    created=create_photo(@first_photo,'Escala.jpg',PhotoFixture.jpeg,'textureWidthMm'=>2750,'textureHeightMm'=>1830)
    service.prepare(created['catalogId'],'sheet')
    @model.materials.last.texture.width=10.0
    state=service.states[created['catalogId']]
    assert_equal 'texture_mismatch',state['state'];assert_match(/escala|tamaño/,state['message'])
  end

  # Prueba obligatoria 13: SKM importado (clasificado como placa, sin aprobación comercial).
  def test_imported_skm_is_installed_on_selection_and_paints
    native=PhotoFixture::Material.new(1,'Roble SKM');native.texture=[write_png('skm-texture.png'),1,1]
    path=File.join(@source,'origen.skm');native.save_as(path);bytes=File.binread(path);sha=Digest::SHA256.hexdigest(bytes)
    FileUtils.mkdir_p(File.join(@directory,'skm-import-assets'));File.binwrite(File.join(@directory,'skm-import-assets',"#{sha}.skm"),bytes)
    row=@catalog.new_item('Roble SKM','sheet',{'source'=>'skm-import','skm'=>{'sha256'=>sha,'sourceName'=>'origen.skm','originalName'=>'Roble SKM','suggestions'=>{}}})
    @catalog.save([row],0)
    assert_equal 'installable',service.states[row['id']]['state']
    prepared=service.prepare(row['id'],'sheet')
    assert prepared['installed']
    assert smart.apply_immediate(options(prepared))['changed'];assert_board(@pieces[0],@model.materials.last)
  end

  # 0.8.8 nativo V19: un clic inmediato recorría el modelo 3 veces con huella de
  # mallas + SHA-256 de todo el modelo (plan + frente + dorso). Ahora: un único
  # recorrido sin huella geométrica; vista previa/confirmar conservan la firma.
  module InventoryCounter
    class << self;attr_accessor :calls;end
    def inventory(geometry: true);(InventoryCounter.calls||=[]) << geometry;super;end
  end
  PlanosSanto::NameManager.prepend(InventoryCounter)
  def test_immediate_click_traverses_the_model_once_without_geometry_fingerprint
    prepared=service.prepare(create_photo['catalogId'],'sheet')
    InventoryCounter.calls=[]
    assert smart.apply_immediate(options(prepared))['changed']
    assert_equal [false],InventoryCounter.calls,'un solo recorrido liviano por clic'
    assert_board(@pieces[0],@model.materials.last)
    InventoryCounter.calls=[]
    painter=smart;token=painter.preview(options(prepared,1).reject { |key,_| key=='immediatePiece' }.merge('immediate'=>true))['token']
    assert_equal [true],InventoryCounter.calls,'la vista previa con token conserva la firma completa'
    @pieces[1].definition.entities[0].material=@narrow
    assert_raises(PlanosSanto::ExportError) { painter.apply('token'=>token,'confirmed'=>true) }
  end

  # 0.8.8 nativo V9 (observación): cerca del borde, PickHelper devuelve primero
  # la ARISTA; el clic no hacía nada. Ahora se usa una cara de esa misma arista.
  class EdgeLeaf
    attr_reader :faces
    def initialize(faces);@faces=faces;end
  end
  class RankedPicker
    attr_accessor :hits
    def do_pick(_x,_y);end
    def count;hits.length;end
    def path_at(index);hits[index][0];end
    def leaf_at(index);hits[index][1];end
  end
  def edge_tool(mode)
    Sketchup.const_set(:Edge,EdgeLeaf) unless defined?(Sketchup::Edge)
    @faces.each_with_index { |face,index| area=[384.0,384.0,18.0,18.0,12.0,12.0][index];face.define_singleton_method(:area) { area } }
    picker=RankedPicker.new;view=View.new(picker)
    tool=PlanosSanto::SmartPaintTool.new(@model,service:smart,options:{'mode'=>mode,'immediate'=>true,'immediatePiece'=>mode=='sheet'},on_event:lambda { |_event| },guard:lambda { true })
    [tool,picker,view]
  end
  def test_click_on_a_board_border_edge_selects_the_narrow_face_of_the_same_piece
    tool,picker,view=edge_tool('edge')
    piece=@pieces[0];board,narrow=@faces[0],@faces[2]
    border=Sketchup::Edge.new([board,narrow])
    other=@pieces[1]
    picker.hits=[[[@model.entities.first,piece,border],border],[[@model.entities.first,other,@faces[1]],@faces[1]],[[@model.entities.first,piece,board],board]]
    target=tool.send(:hit,view,0,0)
    assert_equal "1/#{piece.persistent_id}",target['pieceId'],'nunca la pieza vecina de atrás'
    assert_equal [narrow.persistent_id.to_s],target['faceIds'],'en modo canto, la cara estrecha de esa arista'
    sheet,sheet_picker,sheet_view=edge_tool('sheet');sheet_picker.hits=picker.hits
    assert_equal "1/#{piece.persistent_id}",sheet.send(:hit,sheet_view,0,0)['pieceId']
  end
  # Validación 0.8.10 (R1): en una esquina entre dos cantos de largo muy distinto
  # (estante 2000x300: 36000 vs 5400 mm²) no se elige el canto corto.
  def test_corner_between_two_edges_of_very_different_length_is_ambiguous
    tool,picker,view=edge_tool('edge')
    @faces[2].define_singleton_method(:area) { 18.0 };@faces[4].define_singleton_method(:area) { 2.7 }
    corner=Sketchup::Edge.new([@faces[2],@faces[4]])
    picker.hits=[[[@model.entities.first,@pieces[0],corner],corner]]
    assert_nil tool.send(:hit,view,0,0)
  end
  def test_ambiguous_corner_edge_in_edge_mode_paints_nothing
    tool,picker,view=edge_tool('edge')
    corner=Sketchup::Edge.new([@faces[2],@faces[3]])
    picker.hits=[[[@model.entities.first,@pieces[0],corner],corner]]
    assert_nil tool.send(:hit,view,0,0)
    open_border=Sketchup::Edge.new([@faces[0]])
    picker.hits=[[[@model.entities.first,@pieces[0],open_border],open_border]]
    assert_nil tool.send(:hit,view,0,0),'una arista de borde con una sola cara ancha no se trata como canto'
    picker.hits=[[[@model.entities.first,@pieces[0],@faces[2]],@faces[2]]]
    assert_equal [@faces[2].persistent_id.to_s],tool.send(:hit,view,0,0)['faceIds'],'un clic sobre la cara sigue igual'
  end

  # Material de color sólido, sin fotografía.
  def test_solid_colour_can_be_assigned_to_a_commercial_item_and_reused_in_another_model
    row=@catalog.new_item('Blanco liso','sheet').merge('sku'=>'BL18','supplier'=>'QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true)
    @catalog.save([row],0)
    service(@first).assign_color(row['id'],[240,240,236])
    colour=@first.materials.last
    assert_nil colour.texture;assert_equal [240,240,236],[colour.color.red,colour.color.green,colour.color.blue]
    assert item('Blanco liso')['approved'],'asignar un color no toca los datos comerciales'
    assert_equal 'BL18',item('Blanco liso')['sku']
    assert_equal 'installable',service.states[row['id']]['state']
    prepared=service.prepare(row['id'],'sheet')
    installed=@model.materials.last
    assert_nil installed.texture;assert_equal 240,installed.color.red
    assert smart.apply_immediate(options(prepared))['changed'];assert_board(@pieces[0],installed)
  end

  # Decisión 2: atributos OCL en materiales que crea Planos Santo.
  def test_created_and_installed_materials_carry_compatible_opencutlist_attributes
    created=create_photo
    material_a=@first.materials.last
    assert_equal 2,material_a.get_attribute('ladb_opencutlist','type')
    assert_equal '18mm',material_a.get_attribute('ladb_opencutlist','std_thicknesses')
    assert_nil material_a.get_attribute('ladb_opencutlist','thickness'),'en placas OCL usa std_thicknesses, no thickness'
    service.prepare(created['catalogId'],'sheet')
    assert_equal 2,@model.materials.last.get_attribute('ladb_opencutlist','type')
    edge=@catalog.new_item('Canto Caju 22','edge').merge('thicknessMm'=>0.45,'widthMm'=>22)
    data=@catalog.read;@catalog.save(data['items']+[edge],data['revision'])
    service(@first).assign_color(edge['id'],[150,110,70])
    canto=@first.materials.last
    assert_equal 4,canto.get_attribute('ladb_opencutlist','type')
    assert_equal '0.45mm',canto.get_attribute('ladb_opencutlist','thickness')
    assert_equal '22mm',canto.get_attribute('ladb_opencutlist','std_widths')
    assert_nil canto.get_attribute('ladb_opencutlist','std_thicknesses')
  end
  def test_existing_opencutlist_attributes_are_never_overwritten
    material=PhotoFixture::Material.new(77,'Ya tipado por OCL');material.set_attribute('ladb_opencutlist','type',1)
    material.set_attribute('ladb_opencutlist','std_thicknesses','19mm')
    result=PlanosSanto::OclAttributes.write_missing(material,@catalog.new_item('X','sheet').merge('thicknessMm'=>18))
    assert_equal 1,material.get_attribute('ladb_opencutlist','type');assert_equal '19mm',material.get_attribute('ladb_opencutlist','std_thicknesses')
    assert_equal 'conflict',result['status']
  end

  # Prueba obligatoria 7, 8 y 12 con la herramienta real: cinco piezas, cambio de material, Undo, Escape.
  def test_tool_paints_five_pieces_changes_material_without_restarting_and_undo_restores_one_click
    first=service.prepare(create_photo['catalogId'],'sheet')
    second=service.prepare(create_photo(@first_photo,'Segunda.png',PhotoFixture.png(3,3))['catalogId'],'sheet')
    material_one,material_two=@model.materials.last(2)
    events=[];picker=Picker.new;view=View.new(picker)
    @model.define_singleton_method(:select_tool) { |tool| @qa_tool=tool }
    @model.define_singleton_method(:selected_tool) { @qa_tool }
    tool=PlanosSanto::SmartPaintTool.new(@model,service:smart,options:options(first).reject { |key,_| key=='targets' },on_event:lambda { |event| events << event },guard:lambda { true })
    @model.select_tool(tool);tool.activate
    undo=@model.undo_states.length
    @pieces.each_with_index do |piece,index|
      face=piece.definition.entities[2];picker.path=[@model.entities.first,piece,face];picker.leaf=face
      tool.onLButtonDown(0,10,10,view)
      assert_nil events.last['error'];assert_board(piece,material_one);assert_equal undo+index+1,@model.undo_states.length
    end
    tool.update_options(options(second).reject { |key,_| key=='targets' });assert tool.status['active']
    face=@pieces.first.definition.entities[2];picker.path=[@model.entities.first,@pieces.first,face];picker.leaf=face
    tool.onLButtonDown(0,10,10,view);assert_board(@pieces.first,material_two)
    @model.undo;assert_board(@pieces.first,material_one);assert_board(@pieces.last,material_one)
    tool.onKeyDown(27,0,0,view);refute tool.status['active']
  end

  # Prueba obligatoria 10: compartidos. Modo rápido = sólo la pieza elegida.
  def test_shared_definition_only_changes_the_clicked_piece
    prepared=service.prepare(create_photo['catalogId'],'sheet')
    before=sides(@pieces[1])
    smart.apply_immediate(options(prepared,0))
    assert_board(@pieces[0],@model.materials.last);assert_equal before,sides(@pieces[1])
    refute_same @pieces[0].definition,@pieces[1].definition
  end

  # Auditoría OCL F-PINT-A: repasar una pieza compartida que YA tiene el material
  # no debe aislarla (make_unique) ni dejar una entrada de Ctrl+Z vacía.
  def test_repainting_shared_pieces_that_already_have_the_material_is_a_real_no_op
    prepared=service.prepare(create_photo['catalogId'],'sheet');material=@model.materials.last
    shared=@pieces[0].definition
    shared.entities.first(2).each { |face| face.material=material;face.back_material=material }
    assert_same shared,@pieces[1].definition
    undo=@model.undo_states.length
    result=smart.apply_immediate(options(prepared,0))
    refute result['changed'];assert result['noChanges']
    assert_same shared,@pieces[0].definition,'no se crea una definición nueva'
    assert_same shared,@pieces[1].definition
    assert_equal undo,@model.undo_states.length,'sin entrada de Ctrl+Z'
  end

  def test_kind_mismatch_is_explained
    created=create_photo
    error=assert_raises(PlanosSanto::ExportError) { service.prepare(created['catalogId'],'edge') }
    assert_match(/es una placa/,error.message)
  end

  # Acción "Asignar foto" sobre una ficha comercial sin visual: conserva SKU,
  # proveedor, formato y aprobación (antes 'replace' los reiniciaba).
  def test_assigning_a_photo_to_a_commercial_item_keeps_its_commercial_data
    row=@catalog.new_item('Camellia','sheet').merge('sku'=>'CAM18','supplier'=>'Maderera QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>true,'approved'=>true)
    @catalog.save([row],0)
    path=File.join(@source,'camellia.jpg');File.binwrite(path,PhotoFixture.jpeg);picked=@first_photo.pick(path)
    @first_photo.create(picked['token'],{'revision'=>picked['revision'],'name'=>'Camellia','kind'=>'sheet','thicknessMm'=>nil,'action'=>'replace','existingId'=>row['id'],'replaceConfirmed'=>true,'confirmed'=>true})
    after=item('Camellia')
    assert_equal row['id'],after['id']
    %w[sku supplier thicknessMm widthMm lengthMm grain approved].each { |key| assert_equal row[key],after[key],key }
    assert after.dig('observed','photo','designReady')
    assert_equal 'installable',service.states[row['id']]['state']
    prepared=service.prepare(row['id'],'sheet')
    assert smart.apply_immediate(options(prepared))['changed']
  end

  # Revisión 0.8.8 (seguridad): integridad también al SELECCIONAR un material ya instalado.
  def test_selecting_an_installed_photo_refuses_a_tampered_library_but_allows_an_absent_one
    created=create_photo;service.prepare(created['catalogId'],'sheet')
    image=File.join(@directory,'photo-assets',item['observed']['photo']['imageAsset']);bytes=File.binread(image)
    File.binwrite(image,bytes+'x')
    error=assert_raises(PlanosSanto::ExportError) { service.prepare(created['catalogId'],'sheet') }
    assert_match(/alterado o está dañado/,error.message)
    File.delete(image)
    assert_equal false,service.prepare(created['catalogId'],'sheet')['installed'],'sin archivos (otra PC) el material instalado sigue sirviendo'
  end

  # Revisión 0.8.8 (Ruby): una foto con metadatos inválidos no se ofrece como instalable.
  def test_photo_item_with_invalid_metadata_is_not_shown_as_installable
    created=create_photo
    # Written directly: the catalog store itself refuses to save this record.
    data=@catalog.read;row=data['items'].first;row['observed']['photo']['widthPx']=0
    File.binwrite(File.join(@directory,'catalog.json'),JSON.generate(data))
    state=service.states[created['catalogId']]
    assert_equal 'asset_corrupt',state['state'];assert_match(/datos de imagen inválidos/,state['message'])
  end

  # Revisión 0.8.8 (rendimiento): reabrir la paleta no vuelve a hashear archivos sin cambios.
  def test_reopening_the_palette_does_not_rehash_unchanged_library_files
    created=create_photo;service.states
    hashed=0;original=Digest::SHA256.method(:file)
    Digest::SHA256.singleton_class.send(:define_method,:file) { |*args| hashed+=1;original.call(*args) }
    begin
      3.times { assert_equal 'installable',service.states[created['catalogId']]['state'] }
    ensure
      Digest::SHA256.singleton_class.send(:define_method,:file) { |*args| original.call(*args) }
    end
    assert_equal 0,hashed
  end

  def write_png(name,bytes=PhotoFixture.png);path=File.join(@source,name);File.binwrite(path,bytes);path;end
  def test_skm_collision_with_unbound_native_visual_is_installed_independently_and_paints
    image=File.join(@source,'selected-skm-texture.png');File.binwrite(image,PhotoFixture.png(4,3))
    source=PhotoFixture::Material.new(9000,'Melamina QA 18mm');source.texture=[image,2,3]
    original_skm=File.join(@source,'original.skm');source.save_as(original_skm)
    bytes=File.binread(original_skm);sha=Digest::SHA256.hexdigest(bytes)
    folder=File.join(@directory,'skm-import-assets');FileUtils.mkdir_p(folder);path=File.join(folder,"#{sha}.skm");File.binwrite(path,bytes)
    row=@catalog.new_item('Caju QA 18mm','sheet',{'source'=>'skm-import','skm'=>{'sha256'=>sha,'sourceName'=>'Melamina QA 18mm.skm','originalName'=>'Melamina QA 18mm','suggestions'=>{}}})
    @catalog.save([row],0)
    existing=@model.materials.add('Melamina QA 18mm');existing.color=Sketchup::Color.new(7,8,9)
    existing.define_singleton_method(:name=) { |value| self.display_name=value }
    @faces.first(2).each { |face| face.material=existing;face.back_material=existing }
    loader=@model.materials.method(:load);loads=[]
    @model.materials.define_singleton_method(:load) do |file|
      loads << file;document=JSON.parse(File.binread(file))
      prior=find { |material| material.name==document['name'] }
      next prior if prior
      material=loader.call(file)
      material.define_singleton_method(:name=) { |value| self.display_name=value }
      material
    end
    names_aware=Module.new do
      define_method(:start_operation) do |*args|
        @collision_names=materials.map { |material| [material,material.name] };super(*args)
      end
      define_method(:abort_operation) do
        result=super();@collision_names.each { |material,name| material.display_name=name };result
      end
    end
    @model.singleton_class.prepend(names_aware)
    before=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).material_state(existing)
    assert_equal 'installable',service.state(row['id'])['state']
    prepared=service.prepare(row['id'],'sheet');assert prepared['installed']
    installed=@model.materials.last;refute_same existing,installed
    assert_equal before,PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).material_state(existing)
    assert_empty existing.attributes;assert_equal 'Melamina QA 18mm',existing.name
    assert_equal 'ready',service.state(row['id'])['state']
    assert_equal prepared['materialUuid'],service.state(row['id'])['materialUuid']
    assert_equal [path,path],loads;assert_equal bytes,File.binread(path)
    assert_equal PhotoFixture.png(4,3),File.binread(installed.texture.filename)
    assert smart.apply_immediate(options(prepared))['changed'];assert_board(@pieces[0],installed)
    assert_equal before,PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).material_state(existing)
    @model.undo;assert_same existing,@pieces[0].definition.entities[0].material
  end

end
