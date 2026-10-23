# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../catalog_store'
require_relative '../material_library'

# 0.8.17 (pedido de Gabriel): espesores estándar predeterminados por tipo de ficha.
# Placa: 3, 5, 12, 15, 18 y 25 mm. Canto: 0,45 y 2 mm. Esquema 3 con migración v2→v3.
class CatalogEspesoresTest < Minitest::Test
  Store=PlanosSanto::CatalogStore
  def setup
    @dir=Dir.mktmpdir;@store=Store.new(directory:@dir);@path=File.join(@dir,'catalog.json')
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def backups;Dir[File.join(@dir,'backups','*.json')];end
  def v2_item(name,kind,extra={})
    {'id'=>SecureRandom.uuid,'name'=>name,'kind'=>kind,'sku'=>'','supplier'=>'','thicknessMm'=>nil,'widthMm'=>nil,'lengthMm'=>nil,'grain'=>nil,
     'compatibleIds'=>[],'price'=>nil,'favorite'=>false,'approved'=>false,'updatedAt'=>'2026-10-01T00:00:00Z','sourceHash'=>'a'*64,
     'observed'=>{'source'=>'manual'},'variantOf'=>nil,'notes'=>'','suggested'=>nil}.merge(extra)
  end

  def test_new_fichas_get_the_standard_thicknesses_of_their_kind
    assert_equal [3,5,12,15,18,25],@store.new_item('Melamina','sheet')['thicknessesMm']
    assert_equal [0.45,2],@store.new_item('Canto','edge')['thicknessesMm']
    assert_equal [],@store.new_item('Herraje','unknown')['thicknessesMm']
    assert_equal [],@store.new_item('Pino','solid_wood')['thicknessesMm']
    # Each ficha owns its copy: editing one list never edits the defaults.
    first=@store.new_item('A','sheet');first['thicknessesMm'] << 30
    assert_equal [3,5,12,15,18,25],@store.new_item('B','sheet')['thicknessesMm']
  end

  def test_defaults_come_from_presets_taller_json_with_constant_fallback
    shipped=JSON.parse(File.read(Store::PRESETS))['standardThicknessesMm']
    assert_equal({'sheet'=>[3,5,12,15,18,25],'edge'=>[0.45,2]},shipped)
    custom=File.join(@dir,'presets.json')
    File.write(custom,JSON.generate('schema'=>1,'standardThicknessesMm'=>{'sheet'=>[18,9],'edge'=>[1]}))
    assert_equal({'sheet'=>[9,18],'edge'=>[1]},Store.default_thicknesses_all(custom))
    ['{roto',JSON.generate('standardThicknessesMm'=>{'sheet'=>[-1],'edge'=>[1]}),JSON.generate('standardThicknessesMm'=>{'sheet'=>[18]}),JSON.generate('otro'=>1)].each do |content|
      File.write(custom,content)
      assert_equal({'sheet'=>[3,5,12,15,18,25],'edge'=>[0.45,2]},Store.default_thicknesses_all(custom),content)
    end
    assert_equal Store::DEFAULT_THICKNESSES,Store.default_thicknesses_all(File.join(@dir,'no-existe.json'))
  end

  # 0.8.20 (biblioteca v4): una placa no tiene espesor elegido; un espesor suelto entra en la lista. El canto sí
  # conserva su espesor (el que se descuenta del corte) y siempre está en su lista.
  def test_saving_sorts_dedupes_and_always_includes_the_single_thickness
    item=@store.new_item('Melamina','sheet').merge('thicknessMm'=>16,'thicknessesMm'=>[25,18.0,3,18,5.0004])
    saved=@store.save([item],0)['items'].first
    assert_equal [3,5,16,18,25],saved['thicknessesMm']
    assert_nil saved['thicknessMm'],'La placa no tiene «el» espesor: todos los de la lista valen'
    # The operator may remove values with «−»: the list may end empty (the ficha then lacks «espesor»).
    empty=@store.save([saved.merge('thicknessesMm'=>[])],1)['items'].first
    assert_equal [],empty['thicknessesMm']
    assert_includes PlanosSanto::CatalogStore.missing(empty),'espesor'
    edge=@store.new_item('Canto','edge').merge('thicknessMm'=>1,'thicknessesMm'=>[2])
    edge=@store.save([edge],2)['items'].first
    assert_equal [1,[1,2]],edge.values_at('thicknessMm','thicknessesMm'),'El espesor del canto se conserva y está en la lista'
  end

  def test_invalid_lists_are_rejected_without_touching_the_file
    good=@store.save([@store.new_item('Melamina','sheet')],0);bytes=File.binread(@path)
    [['18mm'],[0],[Float::INFINITY.to_s],Array.new(33) { |index| index+1 },'18'].each do |list|
      assert_raises(PlanosSanto::ExportError,list.inspect) { @store.save([good['items'].first.merge('thicknessesMm'=>list)],1) }
      assert_equal bytes,File.binread(@path)
    end
  end

  def test_a_0816_window_saving_v2_records_is_upgraded_not_rejected
    @store.save([],0)
    row=v2_item('Canto 22 x 1','edge','thicknessMm'=>1,'widthMm'=>22)
    saved=@store.save([row],1)['items'].first
    assert_equal [0.45,1,2],saved['thicknessesMm']
    assert_equal Store::FIELDS.sort,saved.keys.sort
  end

  def test_v2_library_migrates_to_v4_with_defaults_plus_own_thickness_and_backup
    sheet=v2_item('Melamina 18','sheet','thicknessMm'=>18)
    edge=v2_item('Canto 1 mm','edge','thicknessMm'=>1,'widthMm'=>22)
    other=v2_item('Perfil','dimensional','thicknessMm'=>9)
    bare=v2_item('Sin tipo','unknown')
    original=JSON.pretty_generate('schema'=>2,'revision'=>4,'items'=>[sheet,edge,other,bare]);File.write(@path,original)
    data=@store.read
    assert_equal 4,data['schema'],'v2 pasa directo a v4'
    assert_equal [[3,5,12,15,18,25],[0.45,1,2],[9],[]],data['items'].map { |row| row['thicknessesMm'] }
    assert_equal [nil,1,9,nil],data['items'].map { |row| row['thicknessMm'] },'La placa deja su espesor en la lista; el canto y el resto lo conservan'
    assert_equal [[],[22,45],[],[]],data['items'].map { |row| row['widthsMm'] }
    assert_equal original,File.binread(@path),'Leer no reescribe el archivo v2'
    assert_equal({'from'=>2,'to'=>4,'pending'=>true},@store.migration)
    @store.save(data['items'],4)
    premigration=backups.select { |path| File.basename(path).start_with?('catalog-v2-premigracion-4-') }
    assert_equal 1,premigration.length
    assert_equal original,File.binread(premigration.first)
    assert_nil @store.migration
  end

  def test_fingerprint_ignores_the_list_so_bindings_never_go_stale
    item=@store.new_item('Melamina','sheet').merge('thicknessMm'=>18)
    before=PlanosSanto::MaterialResolver.item_fingerprint(item)
    assert_equal before,PlanosSanto::MaterialResolver.item_fingerprint(item.merge('thicknessesMm'=>[18,36]))
  end

  def test_suggested_and_variant_fichas_keep_the_list_with_their_thickness
    preset=@store.suggested_item('Canto 22 x 1,5','edge',{'thicknessMm'=>1.5,'widthMm'=>22},'preset')
    assert_equal [0.45,1.5,2],preset['thicknessesMm']
    # Biblioteca v4: la variante de una placa es de ese único espesor; la de un canto conserva la lista y los anchos.
    base=@store.new_item('Melamina','sheet').merge('thicknessesMm'=>[15,18])
    variant=@store.variant_item(base,16)
    assert_equal [16],variant['thicknessesMm']
    assert_nil variant['thicknessMm']
    edge=@store.new_item('Canto 0,45','edge').merge('thicknessMm'=>0.45,'thicknessesMm'=>[0.45,2],'widthsMm'=>[22,45])
    thick=@store.variant_item(edge,1)
    assert_equal [1,[0.45,1,2],[22,45]],thick.values_at('thicknessMm','thicknessesMm','widthsMm')
  end

  def test_imports_of_v1_v2_and_package_items_are_upgraded
    v2={'schema'=>2,'revision'=>0,'items'=>[v2_item('Placa importada','sheet','thicknessMm'=>19)]}
    imported=@store.import(v2,0)['items'].first
    assert_equal [3,5,12,15,18,19,25],imported['thicknessesMm']
    package=PlanosSanto::MaterialPackage.new(library:nil,catalog:@store,directory:@dir)
    item=v2_item('Del paquete','edge','thicknessMm'=>0.45)
    package.validate_items([item])
    assert_equal [0.45,2],item['thicknessesMm']
  end
end
