# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'ostruct'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../catalog_store'
require_relative '../material_policy'
require_relative '../material_library'
require_relative '../native_paint'
require_relative '../supplier_order'
class DesignMaterialDouble < Sketchup::Material
  attr_accessor :metadata
  def name;display_name;end
  def get_attribute(dict,key,_default=nil);metadata[[dict,key]];end
  def set_attribute(dict,key,value);metadata[[dict,key]]=value;end
  def save_as(path);File.binwrite(path,JSON.generate(metadata.transform_keys { |key| key.join('/') }));true;end
end
class MaterialPolicyTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir;@catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @source="\x89PNG\r\n\x1a\nphoto-source".b;@thumbnail="\x89PNG\r\n\x1a\nthumbnail".b;@skm='immutable skm fixture'
    @source_hash=Digest::SHA256.hexdigest(@source);@thumb_hash=Digest::SHA256.hexdigest(@thumbnail);@skm_hash=Digest::SHA256.hexdigest(@skm)
    @photo={'schema'=>1,'designReady'=>true,'sourceHash'=>@source_hash,'imageAsset'=>"#{@source_hash}.png",'thumbnailAsset'=>"#{@thumb_hash}.png",'skmHash'=>@skm_hash,'textureScale'=>{'verified'=>false,'widthMm'=>nil,'heightMm'=>nil},'widthPx'=>32,'heightPx'=>16}
    @item=@catalog.new_item('Madera propia de ensayo','sheet',{'photo'=>@photo})
    FileUtils.mkdir_p(File.join(@directory,'photo-assets'));FileUtils.mkdir_p(File.join(@directory,'material-assets'))
    File.binwrite(File.join(@directory,'photo-assets',@photo['imageAsset']),@source)
    File.binwrite(File.join(@directory,'photo-assets',@photo['thumbnailAsset']),@thumbnail)
    File.binwrite(File.join(@directory,'material-assets',"#{@skm_hash}.skm"),@skm)
    save_index
    @data=@catalog.save([@item],0)
    @model=NamesFixture.model
    @material=DesignMaterialDouble.new(990,'Foto propia',Sketchup::Color.new(20,30,40),1,OpenStruct.new(width:1,height:1,filename:'native-reopened-texture.png'))
    @material.metadata={}
    refresh_native
    materials=[@material];@model.define_singleton_method(:materials) { materials }
  end
  def teardown;FileUtils.remove_entry(@directory);end
  def save_index(hash=@skm_hash)
    record={'catalogId'=>@item['id'],'catalogFingerprint'=>PlanosSanto::MaterialResolver.item_fingerprint(@item),'assetName'=>"#{hash}.skm",'assetHash'=>hash,'sourceName'=>'Foto propia'}
    File.binwrite(File.join(@directory,'material-assets.json'),JSON.generate('schema'=>1,'revision'=>1,'records'=>[record]))
  end
  def refresh_native
    @binding=PlanosSanto::MaterialResolver.binding_for(@item)
    @material.metadata[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY]]=JSON.generate(@binding)
    @material.metadata[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialPolicy::PHOTO_KEY]]=JSON.generate('schema'=>1,'sourceHash'=>@source_hash)
  end
  def paintable;PlanosSanto::MaterialPolicy.paintable?(@item,directory:@directory);end
  def test_design_permission_does_not_approve_commercial_fields_and_requires_immutable_assets
    assert paintable
    refute @item['approved'];assert_equal '',@item['sku'];assert_equal '',@item['supplier'];assert_nil @item['thicknessMm']
    assert PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
    assert_match(/sin verificar/,PlanosSanto::MaterialPolicy.warnings(@item).join(' '))
    assert_empty @model.operations
  end
  def test_missing_tampered_or_unsafe_source_thumbnail_or_skm_blocks_design
    [File.join('photo-assets',@photo['imageAsset']),File.join('photo-assets',@photo['thumbnailAsset']),File.join('material-assets',"#{@skm_hash}.skm")].each do |relative|
      file=File.join(@directory,relative);bytes=File.binread(file);File.binwrite(file,'tampered');refute paintable
      File.delete(file);refute paintable
      File.binwrite(file,bytes);assert paintable
    end
    @photo['imageAsset']='../source.png';refute paintable
  end
  def test_native_proof_and_texture_must_match_and_verified_scale_is_checked
    @material.metadata[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialPolicy::PHOTO_KEY]]='{}'
    refute PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
    refresh_native
    @material.texture=nil;refute PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
    @material.texture=OpenStruct.new(width:1,height:1)
    @photo['textureScale']={'verified'=>true,'widthMm'=>25.4,'heightMm'=>25.4};save_index;refresh_native
    assert PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
    @material.texture=OpenStruct.new(width:2,height:1)
    refute PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
  end
  def test_source_and_scale_change_fingerprint_but_skm_hash_does_not_create_a_hash_cycle
    initial=PlanosSanto::MaterialResolver.item_fingerprint(@item)
    @photo['skmHash']='a'*64;assert_equal initial,PlanosSanto::MaterialResolver.item_fingerprint(@item)
    @photo['sourceHash']='b'*64;refute_equal initial,PlanosSanto::MaterialResolver.item_fingerprint(@item)
  end
  def test_archive_can_be_resaved_with_new_native_uuid_without_invalidating_original_source
    fresh='new model archive with another material UUID';hash=Digest::SHA256.hexdigest(fresh)
    File.binwrite(File.join(@directory,'material-assets',"#{hash}.skm"),fresh);save_index(hash)
    assert paintable
    assert PlanosSanto::MaterialPolicy.native_valid?(@item,@material,directory:@directory)
    File.binwrite(File.join(@directory,'material-assets',"#{@skm_hash}.skm"),'changed original');refute paintable
  end
  def test_legacy_approved_items_keep_permission_and_unapproved_nonphoto_items_do_not_gain_it
    legacy=@catalog.new_item('Placa comercial','sheet');legacy['approved']=true
    assert PlanosSanto::MaterialPolicy.paintable?(legacy)
    legacy['approved']=false;refute PlanosSanto::MaterialPolicy.paintable?(legacy)
    legacy['observed']={'photo'=>{'designReady'=>true}};refute PlanosSanto::MaterialPolicy.paintable?(legacy,directory:@directory)
  end
  def test_imported_skm_design_requires_classification_and_verified_original_not_commercial_fields
    hash=Digest::SHA256.hexdigest(@skm)
    imported=@catalog.new_item('SKM privado QA','unknown',{'source'=>'skm-import','skm'=>{'sha256'=>hash,'sourceName'=>'QA.skm'}})
    folder=File.join(@directory,'skm-import-assets');FileUtils.mkdir_p(folder)
    path=File.join(folder,"#{hash}.skm");File.binwrite(path,@skm)
    refute PlanosSanto::MaterialPolicy.paintable?(imported,directory:@directory)
    imported['kind']='sheet'
    assert PlanosSanto::MaterialPolicy.paintable?(imported,directory:@directory)
    refute imported['approved'];assert_empty imported['sku'];assert_nil imported['grain']
    binding=PlanosSanto::MaterialResolver.binding_for(imported)
    @material.metadata[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY]]=JSON.generate(binding)
    @catalog.save([imported],1)
    material,=PlanosSanto::NativePaint.new(@model,catalog:@catalog).material_for('catalogId'=>imported['id'],'materialUuid'=>binding['uuid'],'mode'=>'sheet')
    assert_same @material,material
    order=PlanosSanto::SupplierOrder.new({'furniture'=>[]},'qa',@catalog.read)
    assert_raises(PlanosSanto::ExportError) { order.material(imported['id'],'sheet') }
    File.binwrite(path,'tampered');refute PlanosSanto::MaterialPolicy.paintable?(imported,directory:@directory)
    File.binwrite(path,@skm);assert PlanosSanto::MaterialPolicy.paintable?(imported,directory:@directory)
    File.delete(path);refute PlanosSanto::MaterialPolicy.paintable?(imported,directory:@directory)
  end
  def test_imported_skm_metadata_does_not_authorize_an_unrelated_unapproved_material_or_symlink
    hash=Digest::SHA256.hexdigest(@skm)
    item=@catalog.new_item('QA','sheet',{'source'=>'skm-import','skm'=>{'sha256'=>hash,'sourceName'=>'QA.skm'}})
    folder=File.join(@directory,'skm-import-assets');FileUtils.mkdir_p(folder)
    path=File.join(folder,"#{hash}.skm");File.binwrite(path,@skm)
    assert PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
    item['observed']['source']='manual';refute PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
    item['observed']['source']='skm-import'
    item['observed']['skm']['sourceName']='../QA.skm';refute PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
    item['observed']['skm']['sourceName']='QA.skm'
    File.delete(path);File.symlink(File.join(@directory,'material-assets',"#{@skm_hash}.skm"),path)
    refute PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
    File.delete(path);item['observed']['skm']['sha256']='forged';refute PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
  end
  def test_native_paint_and_library_accept_design_without_changing_supplier_order_rule
    paint=PlanosSanto::NativePaint.new(@model,catalog:@catalog)
    assert_same @material,paint.material_for('catalogId'=>@item['id'],'materialUuid'=>@binding['uuid'],'mode'=>'sheet').first
    status=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory).status
    assert status['materials'].first['designReady'];refute status['materials'].first['supplierReady'];assert_empty status['materials'].first['issues']
    assert status['visuals'].first['available']
    order=PlanosSanto::SupplierOrder.new({'furniture'=>[]},'test',@data)
    error=assert_raises(PlanosSanto::ExportError) { order.material(@item['id'],'sheet') }
    assert_match(/aprobad/,error.message)
    assert_empty @model.operations
  end
  def test_stale_photo_native_binding_blocks_paint_even_when_same_catalog_id_is_used
    @photo['sourceHash']='b'*64
    @catalog.save([@item],1)
    error=assert_raises(PlanosSanto::ExportError) { PlanosSanto::NativePaint.new(@model,catalog:@catalog).material_for('catalogId'=>@item['id'],'materialUuid'=>@binding['uuid'],'mode'=>'sheet') }
    assert_match(/cambi|foto|biblioteca|diseño/,error.message)
    assert_empty @model.operations
  end
  def test_commercial_review_stales_design_binding_until_explicit_repair_then_supplier_gate_is_available
    reviewed=@catalog.read['items'].first.merge('approved'=>true,'sku'=>'QA-P18','supplier'=>'Taller QA','thicknessMm'=>18,'widthMm'=>1800,'lengthMm'=>2600,'grain'=>false)
    @catalog.save([reviewed],1)
    refute PlanosSanto::MaterialPolicy.design_ready?(reviewed,directory:@directory)
    assert PlanosSanto::MaterialPolicy.photo_source_ready?(reviewed,directory:@directory)
    paint=PlanosSanto::NativePaint.new(@model,catalog:@catalog)
    request={'catalogId'=>reviewed['id'],'materialUuid'=>@binding['uuid'],'mode'=>'sheet'}
    assert_raises(PlanosSanto::ExportError) { paint.material_for(request) }
    library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
    bind={'catalogId'=>reviewed['id'],'materialId'=>@material.entityID.to_s,'revision'=>2,'assetRevision'=>1,'confirmed'=>true}
    assert_raises(PlanosSanto::ExportError) { library.bind(bind) }
    assert_raises(PlanosSanto::ExportError) { library.bind(bind.merge('replaceBinding'=>true)) }
    assert_empty @model.operations
    result=library.bind(bind.merge('replaceBinding'=>true,'replaceVisual'=>true))
    assert_empty result['materials'].first['issues']
    assert PlanosSanto::MaterialPolicy.design_ready?(reviewed,directory:@directory)
    fresh=PlanosSanto::MaterialResolver.read_binding(@material)
    assert_same @material,paint.material_for(request.merge('materialUuid'=>fresh['uuid'])).first
    order=PlanosSanto::SupplierOrder.new({'furniture'=>[]},'test',@catalog.read)
    assert_equal reviewed,order.material(reviewed['id'],'sheet')
    assert_equal 1,@model.operations.count { |operation| operation.first==:start }
  end
  def test_explicit_repair_cannot_relabel_a_material_from_another_photo_source
    reviewed=@catalog.read['items'].first.merge('sku'=>'QA-P18')
    @catalog.save([reviewed],1)
    @material.metadata[[PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialPolicy::PHOTO_KEY]]=JSON.generate('schema'=>1,'sourceHash'=>'a'*64)
    library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
    assert_raises(PlanosSanto::ExportError) do
      library.bind('catalogId'=>reviewed['id'],'materialId'=>@material.entityID.to_s,'revision'=>2,'assetRevision'=>1,'confirmed'=>true,'replaceBinding'=>true,'replaceVisual'=>true)
    end
    assert_empty @model.operations
    refute PlanosSanto::MaterialPolicy.design_ready?(reviewed,directory:@directory)
  end

end
