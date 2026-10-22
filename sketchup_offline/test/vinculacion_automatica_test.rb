# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'ostruct'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'
require_relative '../paint_materials'

# 0.8.17 · pedido de Gabriel: «no tengo que estar vinculando nada». Dobles de la API:
# ningún SKP real; los atributos viven en hashes y la operación se deshace con abort.
module AutoLinkFixture
  class Material
    attr_reader :entityID, :attributes, :color
    attr_accessor :name, :texture
    def initialize(id, name)
      @entityID, @name = id, name
      @attributes = {}; @color = OpenStruct.new(red: 120, green: 90, blue: 60); @texture = nil
    end
    def display_name; @name; end
    def get_attribute(dict, key, default = nil); @attributes.fetch([dict, key], default); end
    def set_attribute(dict, key, value); @attributes[[dict, key]] = value; end
    def delete_attribute(dict, key); @attributes.delete([dict, key]); end
    def save_as(path); File.binwrite(path, "SKM-#{@name}-#{@entityID}"); true; end
  end
  class Model
    attr_reader :materials, :operations
    attr_accessor :fail_commit
    def initialize(*materials); @materials = materials; @operations = []; end
    def start_operation(name, *_args)
      @operations << name
      @snapshot = @materials.map { |m| [m, Marshal.load(Marshal.dump(m.attributes))] }; true
    end
    def commit_operation; !@fail_commit; end
    def abort_operation; @snapshot.each { |m, attrs| m.attributes.replace(attrs) }; true; end
  end
end

class VinculacionAutomaticaTest < Minitest::Test
  DICT = PlanosSanto::MaterialResolver::DICT
  KEY = PlanosSanto::MaterialResolver::KEY
  OCL = PlanosSanto::OclAttributes::DICT
  def setup
    @dir = Dir.mktmpdir
    @catalog = PlanosSanto::CatalogStore.new(directory: @dir)
    @roble = @catalog.new_item('Roble 18', 'sheet').merge('thicknessMm' => 18)
    @canto = @catalog.new_item('Canto roble', 'edge').merge('thicknessMm' => 0.45, 'widthMm' => 22)
    save(@roble, @canto)
  end
  def teardown; FileUtils.remove_entry(@dir); end

  def save(*items); @catalog.save(items, @catalog.read['revision']); end
  def library(model); PlanosSanto::MaterialLibrary.new(model, catalog: @catalog, directory: @dir); end
  def binding(material); PlanosSanto::MaterialResolver.read_binding(material); end
  def bind!(material, item, uuid = SecureRandom.uuid)
    material.set_attribute(DICT, KEY, JSON.generate(PlanosSanto::MaterialResolver.binding_for(item, uuid)))
  end
  def item(id); @catalog.read['items'].find { |row| row['id'] == id }; end

  def test_own_healthy_attribute_is_used_and_nothing_is_written
    material = AutoLinkFixture::Material.new(10, 'Otro nombre cualquiera')
    bind!(material, item(@roble['id']), 'aaaaaaaa-0000-4000-8000-000000000001')
    model = AutoLinkFixture::Model.new(material)
    before = Marshal.load(Marshal.dump(material.attributes))
    result = library(model).auto_link!
    assert_equal 0, result['changed']; assert result['noChanges']
    assert_empty model.operations, 'Sin cambios no hay operación ni entrada en Deshacer'
    assert_equal before, material.attributes
    assert_empty library(model).status['materials'].first['issues']
  end

  def test_unique_name_links_by_itself_without_touching_opencutlist_values
    material = AutoLinkFixture::Material.new(10, '  roble   18 ')
    material.set_attribute(OCL, 'type', 2)
    material.set_attribute(OCL, 'std_thicknesses', '19mm')
    model = AutoLinkFixture::Model.new(material, AutoLinkFixture::Material.new(11, 'Pino'))
    result = library(model).auto_link!
    assert_equal 1, result['changed']
    assert_equal [{ 'type' => 'bind', 'materialId' => '10', 'name' => '  roble   18 ', 'catalogId' => @roble['id'], 'message' => 'vinculado por nombre' }], result['linked']
    assert_equal @roble['id'], binding(material)['catalogId']
    assert_equal 'sheet', binding(material)['kind']
    assert_equal 2, material.get_attribute(OCL, 'type'), 'El tipo de OpenCutList ya coincidía y no se toca'
    assert_equal '19mm', material.get_attribute(OCL, 'std_thicknesses'), 'Un valor cargado en OpenCutList nunca se sobrescribe'
    assert_nil material.get_attribute(DICT, PlanosSanto::OclAttributes::WRITTEN_KEY)
    assert_equal [PlanosSanto::MaterialLibrary::AUTO_LINK_OPERATION], model.operations
    record = library(model).assets['records'].find { |row| row['catalogId'] == @roble['id'] }
    assert record, 'El material del modelo queda como visual reutilizable de la ficha'
    assert_equal 0, library(model).auto_link!['changed'], 'Es idempotente'
    assert_equal 1, model.operations.length
  end

  def test_user_opencutlist_type_of_another_kind_is_never_overwritten
    material = AutoLinkFixture::Material.new(10, 'Canto roble')
    material.set_attribute(OCL, 'type', 2) # el usuario la tiene como placa en OpenCutList
    model = AutoLinkFixture::Model.new(material)
    result = library(model).auto_link!
    assert_equal 0, result['changed']
    assert_nil material.get_attribute(DICT, KEY)
    assert_equal 2, material.get_attribute(OCL, 'type')
    notice = result['ambiguous'].first
    assert_equal 'ocl_type', notice['reason']; assert_equal [@canto['id']], notice['candidates'].map { |row| row['catalogId'] }
    # Un clic: el operador elige la ficha y OpenCutList toma su tipo (registrado como escrito por Planos Santo).
    resolved = library(model).resolve_link('materialId' => '10', 'catalogId' => @canto['id'], 'revision' => @catalog.read['revision'])
    assert_equal @canto['id'], binding(material)['catalogId']
    assert resolved['oclTypeUpdated']
    assert_equal 4, material.get_attribute(OCL, 'type')
    assert_equal({ 'type' => 4 }, PlanosSanto::OclAttributes.written(material))
    assert_empty library(model).status['ambiguous']
  end

  def test_untyped_opencutlist_material_links_and_keeps_its_other_attributes
    material = AutoLinkFixture::Material.new(10, 'Canto roble')
    material.set_attribute(OCL, 'type', 0)
    material.set_attribute(OCL, 'std_widths', '23mm')
    model = AutoLinkFixture::Model.new(material)
    assert_equal 1, library(model).auto_link!['changed']
    assert_equal @canto['id'], binding(material)['catalogId']
    assert_equal [0, '23mm'], [material.get_attribute(OCL, 'type'), material.get_attribute(OCL, 'std_widths')]
  end

  def test_two_fichas_with_the_same_name_stay_as_one_click_notice
    twin = @catalog.new_item('Roble 18', 'edge').merge('thicknessMm' => 2)
    save(item(@roble['id']), item(@canto['id']), twin)
    material = AutoLinkFixture::Material.new(10, 'Roble 18')
    model = AutoLinkFixture::Model.new(material)
    result = library(model).auto_link!
    assert_equal 0, result['changed']; assert_nil material.get_attribute(DICT, KEY)
    notice = result['ambiguous'].first
    assert_equal 'name', notice['reason']; assert_match(/coincide con 2 fichas/, notice['message'])
    assert_equal [@roble['id'], twin['id']].sort, notice['candidates'].map { |row| row['catalogId'] }.sort
    assert_equal [notice], library(model).status['ambiguous'], 'La biblioteca muestra el aviso'
    library(model).resolve_link('materialId' => '10', 'catalogId' => twin['id'], 'revision' => @catalog.read['revision'])
    assert_equal [twin['id'], 'edge'], binding(material).values_at('catalogId', 'kind')
    assert_empty library(model).status['ambiguous']
    assert_equal 0, library(model).auto_link!['changed'], 'Ya elegida, no se vuelve a preguntar'
  end

  def test_archived_ficha_does_not_compete_for_the_name
    twin = @catalog.new_item('Roble 18', 'sheet')
    save(item(@roble['id']), item(@canto['id']), twin)
    File.write(File.join(@dir, 'material-states.json'), JSON.generate('schema' => 1, 'revision' => 1, 'records' => [{ 'catalogId' => twin['id'], 'archived' => true, 'archivedAt' => '2026-10-22T00:00:00Z' }]))
    material = AutoLinkFixture::Material.new(10, 'Roble 18')
    model = AutoLinkFixture::Model.new(material)
    assert_equal 1, library(model).auto_link!['changed']
    assert_equal @roble['id'], binding(material)['catalogId']
  end

  def test_link_to_a_deleted_ficha_relinks_by_name_or_is_left_alone
    gone = @catalog.new_item('Roble 18', 'sheet')
    orphan_item = @catalog.new_item('Nogal de otra PC', 'sheet')
    relinked = AutoLinkFixture::Material.new(10, 'Roble 18'); bind!(relinked, gone, 'bbbbbbbb-0000-4000-8000-000000000001')
    orphan = AutoLinkFixture::Material.new(11, 'Nogal de otra PC'); bind!(orphan, orphan_item, 'bbbbbbbb-0000-4000-8000-000000000002')
    before = Marshal.load(Marshal.dump(orphan.attributes))
    model = AutoLinkFixture::Model.new(relinked, orphan)
    result = library(model).auto_link!
    assert_equal ['relink'], result['linked'].map { |row| row['type'] }
    assert_equal @roble['id'], binding(relinked)['catalogId']
    refute_equal 'bbbbbbbb-0000-4000-8000-000000000001', binding(relinked)['uuid']
    assert_equal before, orphan.attributes, 'Sin ficha con ese nombre el vínculo se conserva (puede ser de otra biblioteca)'
    assert_empty library(model).status['materials'].first['issues']
  end

  def test_reclassified_ficha_follows_its_new_kind_and_only_planos_santo_ocl_type
    material = AutoLinkFixture::Material.new(10, 'Material A')
    bind!(material, item(@roble['id']).merge('kind' => 'edge'), 'cccccccc-0000-4000-8000-000000000001')
    material.set_attribute(OCL, 'type', 4)
    PlanosSanto::OclAttributes.record_written(material, 'type' => 4)
    model = AutoLinkFixture::Model.new(material)
    refute_empty library(model).status['materials'].first['issues']
    result = library(model).auto_link!
    assert_equal ['rebind'], result['linked'].map { |row| row['type'] }
    assert_equal ['sheet', 'cccccccc-0000-4000-8000-000000000001'], binding(material).values_at('kind', 'uuid'), 'Misma ficha y mismo UUID'
    assert_equal 2, material.get_attribute(OCL, 'type'), 'El tipo que escribió Planos Santo sigue a la ficha'
    assert_empty library(model).status['materials'].first['issues']
  end

  def test_reclassified_ficha_with_user_ocl_type_is_a_notice_not_an_overwrite
    material = AutoLinkFixture::Material.new(10, 'Material A')
    bind!(material, item(@roble['id']).merge('kind' => 'edge'))
    material.set_attribute(OCL, 'type', 4) # escrito por el usuario en OpenCutList
    model = AutoLinkFixture::Model.new(material)
    before = Marshal.load(Marshal.dump(material.attributes))
    result = library(model).auto_link!
    assert_equal 0, result['changed']; assert_equal before, material.attributes
    assert_equal ['ocl_type'], result['ambiguous'].map { |row| row['reason'] }
  end

  def test_copied_material_gets_its_own_uuid
    first = AutoLinkFixture::Material.new(10, 'Roble 18')
    copy = AutoLinkFixture::Material.new(11, 'Roble 181')
    bind!(first, item(@roble['id']), 'dddddddd-0000-4000-8000-000000000001')
    copy.attributes.replace(Marshal.load(Marshal.dump(first.attributes)))
    model = AutoLinkFixture::Model.new(copy, first)
    assert(library(model).status['materials'].all? { |row| row['issues'].any? { |issue| issue.include?('UUID duplicado') } })
    library(model).auto_link!
    assert_equal 'dddddddd-0000-4000-8000-000000000001', binding(first)['uuid'], 'El material más antiguo conserva su UUID'
    refute_equal binding(first)['uuid'], binding(copy)['uuid']
    assert_equal [@roble['id']] * 2, [binding(first), binding(copy)].map { |row| row['catalogId'] }
    assert(library(model).status['materials'].all? { |row| row['issues'].empty? })
  end

  def test_damaged_own_attribute_is_replaced_but_a_newer_version_is_left_alone
    damaged = AutoLinkFixture::Material.new(10, 'Roble 18'); damaged.set_attribute(DICT, KEY, '{roto')
    lost = AutoLinkFixture::Material.new(11, 'Sin ficha'); lost.set_attribute(DICT, KEY, JSON.generate('schema' => 1, 'uuid' => 'x'))
    newer = AutoLinkFixture::Material.new(12, 'Canto roble'); newer.set_attribute(DICT, KEY, JSON.generate('schema' => 2, 'algo' => 'nuevo'))
    model = AutoLinkFixture::Model.new(damaged, lost, newer)
    result = library(model).auto_link!
    assert_equal %w[relink clear], result['linked'].map { |row| row['type'] }
    assert_equal @roble['id'], binding(damaged)['catalogId']
    assert_nil lost.get_attribute(DICT, KEY)
    assert_equal JSON.generate('schema' => 2, 'algo' => 'nuevo'), newer.get_attribute(DICT, KEY)
    assert_equal ['newer'], result['skipped'].map { |row| row['reason'] }
  end

  def test_stale_commercial_fingerprint_is_refreshed
    material = AutoLinkFixture::Material.new(10, 'Material A')
    bind!(material, item(@roble['id']), 'eeeeeeee-0000-4000-8000-000000000001')
    save(item(@roble['id']).merge('sku' => 'R18-NUEVO'), item(@canto['id']))
    model = AutoLinkFixture::Model.new(material)
    refute_empty library(model).status['materials'].first['commercialIssues']
    library(model).auto_link!
    assert_equal 'eeeeeeee-0000-4000-8000-000000000001', binding(material)['uuid']
    assert_empty library(model).status['materials'].first['commercialIssues']
  end

  def test_failed_commit_restores_every_attribute
    material = AutoLinkFixture::Material.new(10, 'Roble 18')
    model = AutoLinkFixture::Model.new(material); model.fail_commit = true
    assert_raises(PlanosSanto::ExportError) { library(model).auto_link! }
    assert_empty material.attributes
    refute File.exist?(File.join(@dir, 'material-assets.json'))
  end

  def test_photo_ficha_is_not_linked_to_a_different_texture_with_its_name
    photo = { 'schema' => 1, 'designReady' => true, 'sourceHash' => 'a' * 64, 'imageAsset' => "#{'a' * 64}.jpg", 'thumbnailAsset' => "#{'b' * 64}.png",
              'skmHash' => 'c' * 64, 'textureScale' => { 'verified' => false, 'widthMm' => nil, 'heightMm' => nil }, 'widthPx' => 10, 'heightPx' => 10 }
    foto = @catalog.new_item('Foto nogal', 'sheet', { 'source' => 'photo', 'photo' => photo })
    save(item(@roble['id']), item(@canto['id']), foto)
    material = AutoLinkFixture::Material.new(10, 'Foto nogal'); material.texture = OpenStruct.new(width: 1, height: 1)
    model = AutoLinkFixture::Model.new(material)
    result = library(model).auto_link!
    assert_equal 0, result['changed']; assert_nil material.get_attribute(DICT, KEY)
    assert_equal ['texture'], result['skipped'].map { |row| row['reason'] }
    assert_raises(PlanosSanto::ExportError) { library(model).resolve_link('materialId' => '10', 'catalogId' => foto['id'], 'revision' => @catalog.read['revision']) }
  end

  def test_painting_a_ficha_links_its_model_material_instead_of_asking
    material = AutoLinkFixture::Material.new(10, 'Roble 18')
    model = AutoLinkFixture::Model.new(material)
    paint = PlanosSanto::PaintMaterials.new(model, catalog: @catalog, directory: @dir)
    state = paint.states[@roble['id']]
    assert_equal 'installable', state['state']; assert state['autoLink']
    assert_match(/se vincula sola con «Roble 18»/, state['message'])
    assert_equal 'needs_visual', paint.states[@canto['id']]['state'], 'Sin material del modelo con ese nombre sigue pidiendo foto o color'
    prepared = paint.prepare(@roble['id'], 'sheet')
    assert prepared['linked']; assert_equal '10', prepared['materialId']
    assert_equal 1, model.materials.length, 'No se instala una copia: se usa el material que ya estaba'
    assert_equal 'ready', paint.states[@roble['id']]['state']
  end
end
