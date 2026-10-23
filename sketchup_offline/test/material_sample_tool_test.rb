# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../material_sample_tool'

class SampleMaterialDouble < Sketchup::Material
  attr_reader :attributes
  def initialize(*args); super; @attributes = {}; end
  def name; display_name; end
  def get_attribute(dictionary, key, default = nil); @attributes.fetch([dictionary, key], default); end
  def set_attribute(*); raise 'Sampler must never mutate attributes'; end
end

class MaterialSampleToolTest < Minitest::Test
  class Picker
    attr_accessor :path, :leaf
    def initialize(path, leaf); @path, @leaf = path, leaf; end
    def do_pick(*); end
    def count; @path ? 1 : 0; end
    def path_at(_index); @path; end
    def leaf_at(_index); @leaf; end
  end
  class View
    attr_accessor :drawing_color
    attr_reader :picker, :draws
    def initialize(picker); @picker = picker; @draws = []; end
    def pick_helper; @picker; end
    def invalidate; end
    def draw(mode, points); @draws << [mode, points.map(&:to_a)]; end
  end
  def setup
    @directory = Dir.mktmpdir
    @model = NamesFixture.model
    @root = @model.entities.first
    @piece = @root.entities.first
    @face = @piece.definition.entities.first
    @sheet = {'id'=>'11111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Placa QA','sku'=>'QA18','supplier'=>'Ensayo','thicknessMm'=>19.05,'widthMm'=>1200,'lengthMm'=>2400,'grain'=>true,'compatibleIds'=>[]}
    @edge = @sheet.merge('id'=>'22222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto QA','sku'=>'QA1','thicknessMm'=>1,'widthMm'=>22,'lengthMm'=>nil,'grain'=>false)
    @catalog_data = {'schema'=>1,'revision'=>1,'items'=>[@sheet,@edge]}
    data = @catalog_data
    @catalog = Object.new
    @catalog.define_singleton_method(:read) { data }
    @board = material(1001, @sheet)
    @band = material(1002, @edge)
    @face.material = @board
    @face.back_material = @band
    @model.materials = [@board,@band]
    @model.define_singleton_method(:select_tool) { |tool| @selected_tool = tool }
    @model.define_singleton_method(:selected_tool) { @selected_tool }
    @events = []
    @allowed = true
    @library = PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
    @picker = Picker.new([@root,@piece,@face],@face)
    @view = View.new(@picker)
    @tool = build
  end
  def teardown; FileUtils.remove_entry(@directory); end
  def material(id,item)
    value = SampleMaterialDouble.new(id,item['name'],Sketchup::Color.new(12,34,56),1,nil)
    value.attributes[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY]] = JSON.generate(PlanosSanto::MaterialResolver.binding_for(item))
    value
  end
  def build(side='front')
    PlanosSanto::MaterialSampleTool.new(@model,library:@library,on_event:lambda { |event| @events << event },guard:lambda { @allowed },side:side)
  end
  def snapshot
    instances=@model.all_instances.map { |e| [e.persistent_id,e.name,e.definition.name,e.transformation.to_a,e.hidden?,e.names_attributes,e.definition.entities.grep(Sketchup::Face).map { |f| [f.mesh.points.map(&:to_a),f.mesh.polygons,f.material&.entityID,f.back_material&.entityID] }] }
    JSON.generate([instances,@model.attributes,@model.operations,@model.materials.map { |m| [m.entityID,m.display_name,m.attributes] },@catalog_data,Dir.glob(File.join(@directory,'**/*'))])
  end
  def hover; @tool.onMouseMove(0,12,34,@view); end
  def click(flags=0); @tool.onLButtonDown(flags,12,34,@view); end

  # 0.8.20: the toolbar eyedropper uses the brush's dropper cursor.
  def test_toolbar_eyedropper_uses_the_dropper_cursor
    assert_equal 'sample', @tool.cursor_name
    path, x, y = PlanosSanto::SmartPaintTool.cursor_file(@tool.cursor_name)
    assert File.file?(path), path
    assert_equal [7, 7], [x, y]
  end

  def test_hover_and_overlay_are_readonly_without_selecting_a_material
    before=snapshot
    @tool.activate;hover;@tool.draw(@view)
    assert_equal before,snapshot
    assert_nil @events.last['sample']
    assert_equal 'sample',@events.last['mode']
    assert @events.last['active']
    assert_equal '1/11',@events.last['hover']['pieceId']
    assert_equal 'approved',@events.last['hover']['materialStatus']
    assert_equal 4,@view.draws.first.first
    assert_empty @model.operations
  end

  def test_click_selects_exact_approved_binding_without_paint_permissions_or_undo
    before=snapshot
    @tool.activate;click(PlanosSanto::SmartPaintTool::SHIFT_MASK)
    sample=@events.last.fetch('sample')
    assert sample['selectable']
    assert_equal @sheet['id'],sample['catalogId']
    assert_equal PlanosSanto::MaterialResolver.read_binding(@board)['uuid'],sample['materialUuid']
    assert_equal 'sheet',sample['kind']
    assert_equal 'front',sample['side']
    assert_equal '1/11',sample['pieceId']
    assert_equal @face.persistent_id.to_s,sample['faceId']
    assert_equal 1,@events.last['sampleSequence']
    refute sample.key?('confirmed')
    refute sample.key?('allowShared')
    assert_empty @tool.queued_targets
    @tool.onKeyDown(13,0,0,@view)
    assert_equal before,snapshot
    assert_empty @model.operations
  end

  def test_front_and_back_are_explicit_different_physical_materials
    front_before=@face.material
    @tool=build('back');@tool.activate;click
    sample=@events.last['sample']
    assert sample['selectable'];assert_equal @edge['id'],sample['catalogId'];assert_equal 'edge',sample['kind']
    assert_equal 'back',sample['side'];assert_same front_before,@face.material
    assert_raises(PlanosSanto::ExportError) { build('both') }
  end

  # 0.8.8: approval/SKU changes keep the sample selectable; a kind change does not.
  def test_commercial_changes_keep_sample_selectable_but_kind_change_blocks_after_valid_hover
    @tool.activate;hover
    @sheet['approved']=false;@sheet['sku']='Changed-SKU'
    before=snapshot;click
    assert @events.last['sample']['selectable']
    assert_equal before,snapshot
    @sheet['kind']='edge';before=snapshot;click
    refute @events.last['sample']['selectable']
    assert_equal 'invalid_binding',@events.last['sample']['status']
    refute @events.last['sample'].key?('catalogId')
    assert_equal before,snapshot
  end

  def test_duplicate_uuid_is_reported_without_guessing_an_equivalent_material
    duplicate=material(1003,@sheet)
    duplicate.attributes.replace(@board.attributes)
    @model.materials << duplicate
    before=snapshot;@tool.activate;click
    refute @events.last['sample']['selectable']
    assert_match(/duplicado/,@events.last['sample']['issues'].join(' '))
    assert_equal before,snapshot
  end

  def test_legacy_or_unbound_material_is_identified_but_not_autoapproved
    @board.attributes.clear
    @board.attributes[['ladb_opencutlist','type']]=2
    before=snapshot;@tool.activate;click
    sample=@events.last['sample']
    refute sample['selectable'];assert_equal 'unbound',sample['status'];assert_equal @board.display_name,sample['name']
    assert_equal @board.entityID.to_s,sample['materialId'];assert_equal before,snapshot
    refute sample.key?('catalogId')
  end

  def test_inherited_material_is_reported_with_its_source_without_selecting_it
    @face.material=nil;@piece.material=@board
    before=snapshot;@tool.activate;click
    sample=@events.last['sample']
    assert_equal 'inherited',sample['status'];refute sample['selectable'];assert_equal @board.entityID.to_s,sample['materialId']
    assert_match(/heredado/,sample['issues'].join(' '));assert_equal before,snapshot
  end

  def test_missing_or_invalid_material_does_not_invent_a_palette_selection
    @face.material=nil
    @tool.activate;click
    assert_equal 'unpainted',@events.last['sample']['status'];refute @events.last['sample']['selectable']
    @face.material=@board
    @board.attributes[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY]]='{not JSON'
    before=snapshot;click
    assert_equal 'invalid_binding',@events.last['sample']['status'];refute @events.last['sample']['selectable']
    assert_equal before,snapshot
  end

  def test_nested_rotated_mirrored_and_shared_paths_keep_actual_instance_identity
    nested=@root.entities[1];rotated=nested.entities.first
    rotated.transformation=Geom::Transformation.rotation_z(Math::PI/3)*Geom::Transformation.scale(-1,1,1)
    @picker.path=[@root,nested,rotated,@face]
    before=snapshot;@tool.activate;click;@tool.draw(@view)
    assert_equal '1/13/12',@events.last['sample']['pieceId']
    assert_equal @sheet['id'],@events.last['sample']['catalogId']
    assert_equal before,snapshot
    other=@model.entities[1];other_piece=other.entities.first
    @picker.path=[other,other_piece,@face];click
    assert_equal '2/21',@events.last['sample']['pieceId']
    assert_equal before,snapshot
  end

  def test_context_guard_and_wrong_path_block_without_mutation
    before=snapshot;@allowed=false;@tool.activate;click
    assert_nil @events.last['sample'];assert_match(/modelo|guía/,@events.last['error'])
    @allowed=true;@picker.path=[@root,@model.entities[1],@face];click
    assert_nil @events.last['sample'];assert_match(/Ruta/,@events.last['error'])
    assert_equal before,snapshot
  end

  def test_escape_deactivation_and_blank_pick_clear_overlays_without_changes
    before=snapshot;@tool.activate;click
    @picker.path=nil;hover
    assert_nil @events.last['hover']
    @tool.onKeyDown(27,0,0,@view);@tool.draw(@view)
    refute @events.last['active'];assert_nil @events.last['sample'];assert_nil @model.selected_tool;assert_empty @view.draws
    assert_equal before,snapshot
    @tool.activate;@tool.deactivate(@view);refute @events.last['active']
  end

  def test_sampling_has_no_inherited_mutation_or_queue_entry_point
    before=snapshot
    assert_raises(PlanosSanto::ExportError) { @tool.apply_targets([]) }
    assert_raises(PlanosSanto::ExportError) { @tool.queue({}) }
    assert_equal before,snapshot
  end
end
