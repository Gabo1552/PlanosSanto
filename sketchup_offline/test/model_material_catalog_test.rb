# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'photo_material_double'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../model_material_catalog'

class ModelMaterialCatalogTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir;@catalog=PlanosSanto::CatalogStore.new(directory:@directory);@model=PhotoFixture::Model.new
    @material=@model.materials.add('Roble nativo');@allowed=true
    @service=PlanosSanto::ModelMaterialCatalog.new(@model,catalog:@catalog,directory:@directory,guard:-> { @allowed })
    @library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
    Sketchup::ImageRep.fail_load=false
  end
  def teardown;FileUtils.remove_entry(@directory);Sketchup::ImageRep.fail_load=false;end
  def ocl(values);values.each { |key,value| @material.set_attribute('ladb_opencutlist',key,value) };end
  def preview;@service.preview(@material.entityID.to_s);end
  def save(patch={})
    p=preview;p['item'].merge!(patch);@service.commit(p.slice('token','revision','assetRevision','item'))
  end
  def test_diagnostic_identity_resolves_the_same_material_without_name_matching
    p=@service.preview("material:#{@material.entityID}")
    assert_equal @material.entityID.to_s,p['materialId']
    assert_raises(PlanosSanto::ExportError) { @service.preview(@material.name) }
  end
  def test_preview_reads_metric_ocl_without_plugin_or_model_changes
    ocl('type'=>2,'std_thicknesses'=>'15mm;18mm','std_sizes'=>'2.75m x 183cm','grained'=>true)
    before=Marshal.dump(@material.attributes);p=preview
    assert_equal 'sheet',p['item']['kind'];assert_equal [15,18],p['item']['thicknessesMm']
    assert_equal [2750,1830,true],p['item'].values_at('lengthMm','widthMm','grain')
    assert_match(%r{\Adata:image/png;base64,},p['thumbnail'])
    assert_equal before,Marshal.dump(@material.attributes);assert_empty @model.operations
    assert_empty @catalog.read['items'];refute File.exist?(File.join(@directory,'material-assets.json'))
  end
  def test_unknown_and_ambiguous_lengths_stay_editable_and_never_use_texture_scale
    path=File.join(@directory,'synthetic.png');File.binwrite(path,PhotoFixture.png);@material.texture=[path,39.37,39.37]
    ocl('type'=>2,'std_thicknesses'=>18,'std_sizes'=>'96 x 48','grained'=>false)
    p=preview;assert_empty p['item']['thicknessesMm'];assert_nil p['item']['lengthMm'];assert_nil p['item']['widthMm']
    assert p['hasTexture'];assert_equal false,p['item']['grain']
    @material.set_attribute('ladb_opencutlist','type',nil)
    p=preview;assert_equal 'unknown',p['item']['kind']
    assert_raises(PlanosSanto::ExportError) { @service.commit(p) }
  end
  def test_commit_preserves_same_native_material_texture_ocl_geometry_and_supports_undo
    path=File.join(@directory,'synthetic.png');File.binwrite(path,PhotoFixture.png);@material.texture=[path,27.0,13.5]
    ocl('type'=>2,'std_thicknesses'=>'18mm','std_sizes'=>'2750mm x 1830mm','grained'=>true,'custom_private'=>'preservado')
    texture=@material.texture;attrs=@material.attributes.dup;geometry=@model.geometry
    result=save('name'=>'Ficha del taller','sku'=>'QA-18')
    assert result['created'];assert_equal 1,@model.materials.length;assert_same @material,@model.materials.first
    assert_same texture,@material.texture;assert_equal 'Roble nativo',@material.name;assert_equal geometry,@model.geometry
    attrs.each { |key,value| assert_equal value,@material.attributes[key] }
    assert_equal 0,@material.color_writes;assert_equal 'Ficha del taller',@catalog.read['items'][0]['name']
    record=@library.assets['records'][0];assert @library.usable_record(record,@catalog.read['items'][0])
    assert_equal result['catalogId'],PlanosSanto::MaterialResolver.read_binding(@material)['catalogId']
    @model.undo;assert_nil PlanosSanto::MaterialResolver.read_binding(@material);assert_same texture,@material.texture
    assert_equal attrs,@material.attributes;assert_equal geometry,@model.geometry
    assert_equal 1,@catalog.read['items'].length,'Undo model binding does not delete permanent library'
  end
  def test_edge_lists_and_user_missing_fields_are_saved_without_fabricating_supplier
    ocl('type'=>4,'thickness'=>'0,45mm','std_widths'=>'22mm;45mm')
    result=save('name'=>'Canto QA','supplier'=>'Proveedor escrito por usuario')
    item=@catalog.read['items'][0]
    assert_equal [22,45],item['widthsMm'];assert_equal 0.45,item['thicknessMm'];assert_nil item['lengthMm']
    assert_equal '',item['sku'];assert_equal 'edge',item['kind'];assert result['created']
  end
  def test_valid_binding_returns_existing_id_without_creating_duplicate
    result=save('kind'=>'sheet','thicknessesMm'=>[18]);count=@model.operations.length
    p=preview;assert_equal result['catalogId'],p['existingCatalogId'];refute p.key?('token')
    assert_equal count,@model.operations.length;assert_equal 1,@catalog.read['items'].length
  end
  def test_changed_native_material_stale_revisions_and_wrong_token_are_rejected
    p=preview;p['item']['kind']='sheet'
    assert_raises(PlanosSanto::ExportError) { @service.commit(p.merge('token'=>'incorrect')) }
    assert_raises(PlanosSanto::ExportError) { @service.commit(p.merge('revision'=>7)) }
    assert_raises(PlanosSanto::ExportError) { @service.commit(p.merge('assetRevision'=>7)) }
    @material.set_attribute('ladb_opencutlist','grained',true)
    assert_raises(PlanosSanto::ExportError) { @service.commit(p) }
    assert_empty @catalog.read['items'];assert_empty @model.operations
  end
  def test_selection_material_removed_or_model_guard_blocks_before_writes
    p=preview;p['item']['kind']='sheet';@allowed=false
    assert_raises(PlanosSanto::ExportError) { @service.commit(p) };@allowed=true
    @model.materials.clear
    assert_raises(PlanosSanto::ExportError) { @service.commit(p) }
    assert_empty @catalog.read['items']
  end
  def test_archive_failure_rolls_back_binding_and_catalog
    @material.save_failure=true
    assert_raises(PlanosSanto::ExportError) { save('kind'=>'sheet') }
    assert_empty @catalog.read['items'];assert_nil PlanosSanto::MaterialResolver.read_binding(@material)
    assert_empty @library.assets['records'];assert_equal [:abort],@model.operations.last
  end
  def test_native_commit_failure_restores_catalog_index_and_material
    @model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { save('kind'=>'sheet') }
    assert_empty @catalog.read['items'];assert_empty @library.assets['records']
    assert_nil PlanosSanto::MaterialResolver.read_binding(@material)
    assert_empty Dir.glob(File.join(@directory,'material-assets','*.skm'))
  end
  def test_client_cannot_supply_identity_or_observed_metadata
    result=save('kind'=>'sheet','id'=>'attacker','observed'=>{'photo'=>{'sourceAsset'=>'/tmp/private'}},'sourceHash'=>'bad')
    item=@catalog.read['items'][0]
    refute_equal 'attacker',result['catalogId'];assert_equal 'native_material',item['observed']['source'];refute item['observed'].key?('photo')
  end
  def test_bad_dimensions_fail_before_native_operation
    assert_raises(PlanosSanto::ExportError) { save('kind'=>'sheet','lengthMm'=>-10) }
    assert_empty @model.operations;assert_empty @catalog.read['items']
  end
  def test_thumbnail_failure_is_reported_but_native_visual_can_still_be_archived
    @material.thumbnail_failure=true;p=preview
    assert_nil p['thumbnail'];assert p['warnings'].any? { |warning| warning.include?('miniatura') }
    p['item']['kind']='sheet';result=@service.commit(p)
    assert result['created'];assert @library.usable_record(@library.assets['records'][0],@catalog.read['items'][0])
  end
  def test_index_publication_failure_restores_previous_catalog_bytes_and_native_binding
    original=@catalog.new_item('Ya existente','sheet');@catalog.save([original],0)
    before=File.binread(File.join(@directory,'catalog.json'))
    library=@service.instance_variable_get(:@library)
    library.define_singleton_method(:write_index) { |_index| raise IOError,'simulated write failure' }
    assert_raises(IOError) { save('kind'=>'sheet') }
    assert_equal before,File.binread(File.join(@directory,'catalog.json'))
    assert_nil PlanosSanto::MaterialResolver.read_binding(@material)
    assert_empty @library.assets['records'];assert_empty Dir.glob(File.join(@directory,'material-assets','*.skm'))
  end
  def test_broken_or_duplicate_binding_cannot_be_silently_overwritten
    @material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,'{broken')
    assert_raises(PlanosSanto::ExportError) { preview }
    assert_empty @catalog.read['items'];assert_empty @model.operations
  end

  def test_cancel_discards_only_matching_preview_and_never_writes
    p=preview;p['item']['kind']='sheet';@service.cancel('other-token')
    assert @service.commit(p)['created']
    @model.undo;p=preview;p['item']['kind']='sheet';@service.cancel(p['token'])
    assert_raises(PlanosSanto::ExportError) { @service.commit(p) }
    assert_equal 1,@catalog.read['items'].length
  end
  def test_persistent_thumbnail_is_read_from_bounded_archived_skm_across_service_instances
    bytes=PlanosSanto::BoundedZip.build([['document.xml','<materialDocument/>',false],['doc_thumbnail.png',PhotoFixture.png,false]])
    @material.define_singleton_method(:save_as) { |path| File.binwrite(path,bytes);true }
    result=save('kind'=>'sheet');fresh=PlanosSanto::ModelMaterialCatalog.new(@model,catalog:@catalog,directory:@directory)
    thumb=fresh.thumbnails[result['catalogId']]
    assert_equal 'data:image/png;base64,'+Base64.strict_encode64(PhotoFixture.png),thumb
    path=File.join(@directory,'material-assets',@library.assets['records'][0]['assetName'])
    File.binwrite(path,'changed')
    assert_empty fresh.thumbnails,'Cached thumbnail cannot hide a changed archive'
  end

  def test_changed_pixels_with_same_native_properties_require_new_preview
    p=preview;p['item']['kind']='sheet'
    @material.define_singleton_method(:write_thumbnail) { |path,_size| File.binwrite(path,PhotoFixture.png(3,3));true }
    error=assert_raises(PlanosSanto::ExportError) { @service.commit(p) }
    assert_match(/apariencia/,error.message);assert_empty @catalog.read['items'];assert_empty @model.operations
  end
  def test_failed_secondary_index_rollback_preserves_archived_skm_and_reports_recovery
    old=@catalog.new_item('Anterior','sheet');@catalog.save([old],0)
    index_path=File.join(@directory,'material-assets.json')
    File.binwrite(index_path,JSON.generate('schema'=>1,'revision'=>0,'records'=>[]))
    library=@service.instance_variable_get(:@library)
    library.singleton_class.class_eval do
      alias_method :original_atomic_write_for_test,:atomic_write
      define_method(:atomic_write) do |path,bytes|
        if path.end_with?('material-assets.json') && JSON.parse(bytes)['revision']==0
          raise IOError,'rollback index denied'
        end
        original_atomic_write_for_test(path,bytes)
      end
    end
    @model.fail_commit=true
    _out,err=capture_io do
      error=assert_raises(PlanosSanto::ExportError) { save('kind'=>'sheet') }
      assert_match(/recuperación/,error.message)
    end
    assert_match(/restaurar material-assets/,err)
    assert_equal 1,@library.assets['records'].length
    assert_equal 1,Dir.glob(File.join(@directory,'material-assets','*.skm')).length
    assert_equal [old['id']],@catalog.read['items'].map { |item| item['id'] }
    assert_nil PlanosSanto::MaterialResolver.read_binding(@material)
  end

end
