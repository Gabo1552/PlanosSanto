# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'ostruct'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'

module LibraryFixture
  class Material
    attr_reader :name, :entityID, :attributes, :color, :texture
    attr_accessor :save_result
    def initialize(id, name, bytes='REAL-SKM-VISUAL')
      @entityID, @name, @bytes = id, name, bytes
      @attributes = {}; @color = OpenStruct.new(red: 15, green: 30, blue: 45); @texture = Object.new
      @save_result = true
    end
    def get_attribute(dict, key, default=nil); @attributes.fetch([dict,key], default); end
    def set_attribute(dict, key, value); @attributes[[dict,key]]=value; end
    def save_as(path)
      return false unless @save_result
      File.binwrite(path, @bytes); true
    end
  end
  class Materials < Array
    attr_accessor :load_existing
    def load(path)
      return first if @load_existing
      material = Material.new(100+length, File.basename(path), File.binread(path)); self << material; material
    end
  end
  class Model
    attr_reader :materials, :starts, :aborts
    attr_accessor :fail_commit
    def initialize(*materials)
      @materials=Materials.new(materials); @starts=0; @aborts=0
    end
    def start_operation(*_args)
      @starts+=1
      @snapshot=@materials.map { |m| [m,Marshal.load(Marshal.dump(m.attributes))] }; true
    end
    def commit_operation; !@fail_commit; end
    def abort_operation
      @aborts+=1
      @materials.replace(@snapshot.map(&:first))
      @snapshot.each { |m,attrs| m.attributes.replace(attrs) }; true
    end
  end
end

class MaterialLibraryTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @sheet=@catalog.new_item('Duplicado','sheet').merge('sku'=>'M18','supplier'=>'Prueba','thicknessMm'=>18,'widthMm'=>1800,'lengthMm'=>2600,'grain'=>false,'approved'=>true)
    @edge=@catalog.new_item('Duplicado','edge').merge('sku'=>'C1','supplier'=>'Prueba','thicknessMm'=>1,'widthMm'=>22,'approved'=>true)
    @catalog.save([@sheet,@edge],0)
    @one=LibraryFixture::Material.new(20,'Duplicado')
    @two=LibraryFixture::Material.new(21,'Duplicado','OTHER-REAL-SKM')
    @model=LibraryFixture::Model.new(@one,@two)
    @library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
  end
  def teardown; FileUtils.remove_entry(@directory); end
  def request(item=@sheet, material=@one)
    {'catalogId'=>item['id'],'materialId'=>material.entityID.to_s,'revision'=>1,'confirmed'=>true}
  end
  def binding(material=@one); PlanosSanto::MaterialResolver.read_binding(material); end

  def test_readonly_status_uses_ids_not_names_and_preserves_catalog_schema
    before=File.binread(File.join(@directory,'catalog.json'))
    result=@library.status
    assert_equal %w[20 21],result['materials'].map { |m| m['id'] }
    assert result['materials'].all? { |m| m['binding'].nil? && m['hasTexture'] }
    assert result['visuals'].all? { |m| !m['available'] && m['status']=='needs_review' }
    assert_empty @one.attributes
    assert_equal 0,@model.starts
    refute File.exist?(File.join(@directory,'material-assets.json'))
    @library.bind(request)
    assert_equal before,File.binread(File.join(@directory,'catalog.json'))
    assert_equal [15,30,45],@library.status['materials'][0]['color']
  end

  def test_explicit_binding_persists_real_visual_and_loads_it_in_fresh_project
    result=@library.bind(request)
    assert_equal @sheet['id'],binding['catalogId']
    visual=result['visuals'].find { |v| v['catalogId']==@sheet['id'] }
    assert visual['available']
    assert_equal Digest::SHA256.hexdigest('REAL-SKM-VISUAL'),visual['assetHash']
    other=LibraryFixture::Model.new
    library=PlanosSanto::MaterialLibrary.new(other,catalog:@catalog,directory:@directory)
    loaded=library.install(request)
    assert_equal 1,other.materials.length
    assert_equal @sheet['id'],PlanosSanto::MaterialResolver.read_binding(other.materials.first)['catalogId']
    refute_equal binding['uuid'],loaded['binding']['uuid']
    again=library.install(request)
    assert_equal loaded['materialId'],again['materialId']
    assert_equal 1,other.materials.length
    assert_equal 1,other.starts
  end
  def test_classified_skm_can_load_for_design_and_reopen_without_commercial_approval
    bytes='SYNTHETIC-IMPORTED-SKM';hash=Digest::SHA256.hexdigest(bytes)
    item=@catalog.new_item('SKM diseño QA','sheet',{'source'=>'skm-import','skm'=>{'sha256'=>hash,'sourceName'=>'QA.skm'}})
    folder=File.join(@directory,'skm-import-assets');FileUtils.mkdir_p(folder);File.binwrite(File.join(folder,"#{hash}.skm"),bytes)
    @catalog.save([item],1)
    result=@library.status
    assert result['visuals'].first['designReady'];assert result['visuals'].first['available'];refute result['visuals'].first['supplierReady']
    assert_equal 0,@model.starts
    installed=@library.install({'catalogId'=>item['id'],'revision'=>2,'confirmed'=>true})
    material=@model.materials.find { |m| m.entityID.to_s==installed['materialId'] }
    assert_equal item['id'],PlanosSanto::MaterialResolver.read_binding(material)['catalogId']
    refute @catalog.read['items'].first['approved'];assert_empty @catalog.read['items'].first['sku']
    other=LibraryFixture::Model.new
    library=PlanosSanto::MaterialLibrary.new(other,catalog:@catalog,directory:@directory)
    loaded=library.install({'catalogId'=>item['id'],'revision'=>2,'confirmed'=>true})
    assert_equal 1,other.materials.length
    refute_equal installed['binding']['uuid'],loaded['binding']['uuid']
    assert loaded['materials'].first['designReady'];refute loaded['materials'].first['supplierReady']
    assert_equal bytes,File.binread(File.join(@directory,'skm-import-assets',"#{hash}.skm"))
  end

  def test_conflicting_metadata_requires_explicit_replace_and_leaves_ocl_untouched
    @one.set_attribute('ladb_opencutlist','type',2)
    @library.bind(request)
    assert_raises(PlanosSanto::ExportError) { @library.bind(request(@edge)) }
    assert_equal @sheet['id'],binding['catalogId']
    @library.bind(request(@edge).merge('replaceBinding'=>true))
    assert_equal @edge['id'],binding['catalogId']
    assert_equal 2,@one.get_attribute('ladb_opencutlist','type')
    assert_equal [15,30,45],[@one.color.red,@one.color.green,@one.color.blue]
  end

  def test_duplicate_uuid_requires_explicit_repair
    @library.bind(request)
    @two.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,JSON.generate(binding))
    assert @library.status['materials'].all? { |m| m['issues'].any? { |s| s.include?('UUID') } }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request(@sheet,@two)) }
    @library.bind(request(@sheet,@two).merge('replaceBinding'=>true))
    refute_equal binding['uuid'],binding(@two)['uuid']
    assert @library.status['materials'].all? { |m| m['issues'].empty? }
  end

  def test_missing_or_modified_asset_never_creates_fake_visual
    @library.bind(request)
    row=@library.assets['records'][0]
    path=File.join(@directory,'material-assets',row['assetName'])
    File.binwrite(path,'CORRUPT')
    refute @library.status['visuals'][0]['available']
    fresh=LibraryFixture::Model.new
    library=PlanosSanto::MaterialLibrary.new(fresh,catalog:@catalog,directory:@directory)
    assert_raises(PlanosSanto::ExportError) { library.install(request) }
    assert_empty fresh.materials
    File.delete(path)
    assert_raises(PlanosSanto::ExportError) { library.install(request) }
    assert_equal 0,fresh.starts
  end

  def test_unsupported_skm_export_keeps_valid_binding_but_visual_pending
    @one.save_result=false
    result=@library.bind(request)
    assert_equal @sheet['id'],binding['catalogId']
    refute result['visuals'][0]['available']
    assert_equal 'needs_review',result['visuals'][0]['status']
    assert_equal 0,result['assetRevision']
  end

  def test_failed_model_commit_rolls_back_metadata_and_sidecar_active_record
    @model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { @library.bind(request) }
    assert_nil binding
    assert_equal 1,@model.aborts
    assert_empty @library.assets['records']
    @model.fail_commit=false
    @library.bind(request)
    before=File.binread(File.join(@directory,'material-assets.json'))
    @model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { @library.bind(request(@edge).merge('replaceBinding'=>true)) }
    assert_equal @sheet['id'],binding['catalogId']
    assert_equal before,File.binread(File.join(@directory,'material-assets.json'))
  end

  def test_existing_visual_is_not_silently_overwritten_and_backups_are_kept
    @library.bind(request)
    before=@library.assets['records'][0]['assetHash']
    @library.bind(request(@sheet,@two))
    assert_equal before,@library.assets['records'][0]['assetHash']
    @library.bind(request(@sheet,@two).merge('replaceVisual'=>true))
    refute_equal before,@library.assets['records'][0]['assetHash']
    assert_equal 1,Dir[File.join(@directory,'backups','material-assets-*.json')].length
  end

  def test_revision_confirmation_and_unapproved_items_block_before_mutation
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('confirmed'=>false)) }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('revision'=>0)) }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('assetRevision'=>99)) }
    catalog=@catalog.read;catalog['items'][0]['approved']=false;@catalog.save(catalog['items'],1)
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('revision'=>2)) }
    assert_equal 0,@model.starts
  end

  def test_corrupt_metadata_index_and_stale_commercial_fields_require_review
    @one.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,'broken')
    assert @library.status['materials'][0]['issues'].any?
    assert_raises(PlanosSanto::ExportError) { @library.bind(request) }
    @library.bind(request.merge('replaceBinding'=>true))
    catalog=@catalog.read;catalog['items'][0]['sku']='CHANGED';@catalog.save(catalog['items'],1)
    assert @library.status['materials'][0]['issues'].any?
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('revision'=>2)) }
    @library.bind(request.merge('revision'=>2,'replaceBinding'=>true))
    assert_empty @library.status['materials'][0]['issues']
    File.binwrite(File.join(@directory,'material-assets.json'),'{broken')
    assert_raises(PlanosSanto::ExportError) { @library.status }
    assert_equal '{broken',File.binread(File.join(@directory,'material-assets.json'))
  end

  def test_import_selected_skm_rolls_back_if_loader_returns_existing_material
    path=File.join(@directory,'chosen.skm');File.binwrite(path,'ACTUAL-CHOSEN-SKM')
    @model.materials.load_existing=true
    assert_raises(PlanosSanto::ExportError) { @library.install(request,path:path) }
    assert_nil binding
    assert_equal 2,@model.materials.length
    @model.materials.load_existing=false
    result=@library.install(request,path:path)
    assert_equal '102',result['materialId']
    assert_equal 3,@model.materials.length
    assert result['visuals'][0]['available']
  end
  def test_archive_failure_aborts_binding_and_catalog_remains_readonly
    @one.define_singleton_method(:save_as) { |_path| raise IOError, 'Disco lleno' }
    before=File.binread(File.join(@directory,'catalog.json'))
    assert_raises(IOError) { @library.bind(request) }
    assert_nil binding
    assert_equal 1,@model.aborts
    assert_equal before,File.binread(File.join(@directory,'catalog.json'))
    assert_empty @library.assets['records']
  end

  def test_global_catalog_lock_prevents_concurrent_mutation_through_model_commit
    catalog=@catalog
    blocked=false
    original=@model.method(:commit_operation)
    @model.define_singleton_method(:commit_operation) do
      begin
        catalog.save(catalog.read['items'],1)
      rescue PlanosSanto::ExportError
        blocked=true
      end
      original.call
    end
    @library.bind(request)
    assert blocked
    assert_equal 1,@catalog.read['revision']
    assert_equal 1,@library.assets['revision']
  end

  def test_missing_visual_needs_explicit_replacement_even_if_source_still_exists
    @library.bind(request)
    row=@library.assets['records'].first
    File.delete(File.join(@directory,'material-assets',row['assetName']))
    result=@library.bind(request)
    refute result['visuals'].first['available']
    assert_equal 1,result['assetRevision']
    repaired=@library.bind(request.merge('replaceVisual'=>true))
    assert repaired['visuals'].first['available']
    assert_equal 2,repaired['assetRevision']
  end

  def test_asset_revision_is_optional_but_present_values_must_be_nonnegative_integers
    [0.0, 0.5, -1, '0', nil, true, false, [], {}].each do |revision|
      error=assert_raises(PlanosSanto::ExportError, "assetRevision=#{revision.inspect}") do
        @library.bind(request.merge('assetRevision'=>revision))
      end
      assert_match(/revisión|activos/i,error.message)
      assert_raises(PlanosSanto::ExportError) { @library.install(request.merge('assetRevision'=>revision)) }
    end
    assert_equal 0,@model.starts
    assert_empty @library.assets['records']
    assert_equal 1,@library.bind(request.merge('assetRevision'=>0))['assetRevision']
    assert_equal '20',@library.install(request)['materialId'] # legacy caller remains supported
  end

  def test_same_catalog_revision_does_not_authorize_stale_visual_replacement_or_installation
    stale=request.merge('assetRevision'=>0)
    @library.bind(stale)
    assert_equal 1,@catalog.read['revision']
    original_index=File.binread(File.join(@directory,'material-assets.json'))
    before_starts=@model.starts
    assert_raises(PlanosSanto::ExportError) { @library.bind(stale.merge('materialId'=>'21','replaceVisual'=>true)) }
    assert_nil binding(@two)
    # Even an existing binding cannot bypass a stale caller's revision check.
    assert_raises(PlanosSanto::ExportError) { @library.install(stale) }
    assert_equal before_starts,@model.starts
    assert_equal original_index,File.binread(File.join(@directory,'material-assets.json'))
    fresh=LibraryFixture::Model.new
    other=PlanosSanto::MaterialLibrary.new(fresh,catalog:@catalog,directory:@directory)
    path=File.join(@directory,'chosen-current.skm');File.binwrite(path,'CURRENT-REAL-SKM')
    assert_raises(PlanosSanto::ExportError) { other.install(stale,path:path) }
    assert_empty fresh.materials
    assert_equal 0,fresh.starts
    assert_equal '100',other.install(stale.merge('assetRevision'=>1))['materialId']
  end

  def test_asset_name_must_be_derived_from_its_hash_not_another_existing_blob
    @library.bind(request)
    index=@library.assets
    index['records'][0]['assetName']="#{'0'*64}.skm"
    path=File.join(@directory,'material-assets.json')
    File.binwrite(path,JSON.generate(index))
    original=File.binread(path)
    assert_raises(PlanosSanto::ExportError) { @library.status }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('replaceVisual'=>true)) }
    assert_equal original,File.binread(path)
    fresh=LibraryFixture::Model.new
    other=PlanosSanto::MaterialLibrary.new(fresh,catalog:@catalog,directory:@directory)
    assert_raises(PlanosSanto::ExportError) { other.install(request) }
    assert_equal 0,fresh.starts
  end

  def test_duplicate_uuid_prevents_installation_until_explicit_repair
    @library.bind(request)
    @two.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,JSON.generate(binding))
    before=@model.starts
    assert_raises(PlanosSanto::ExportError) { @library.install(request) }
    assert_equal before,@model.starts
    assert_equal 2,@model.materials.length
    @library.bind(request(@edge,@two).merge('replaceBinding'=>true))
    assert_equal '20',@library.install(request)['materialId']
    assert_equal '21',@library.install(request(@edge))['materialId']
  end

  def test_unapproved_or_stale_visual_record_cannot_be_installed_in_another_project
    @library.bind(request)
    catalog=@catalog.read
    catalog['items'][0]['sku']='SKU-CHANGED'
    @catalog.save(catalog['items'],1)
    fresh=LibraryFixture::Model.new
    other=PlanosSanto::MaterialLibrary.new(fresh,catalog:@catalog,directory:@directory)
    refute other.status['visuals'][0]['available']
    assert_raises(PlanosSanto::ExportError) { other.install(request.merge('revision'=>2)) }
    assert_empty fresh.materials
    assert_equal 0,fresh.starts
    assert_equal 1,other.assets['revision']
  end

end
