# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require 'ostruct'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'

module LibraryFixture
  class Material
    attr_reader :name, :entityID, :attributes, :color, :texture
    attr_accessor :save_result, :name
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
  class NameCollisionMaterials < Materials
    attr_reader :loads
    attr_accessor :source_name,:mutate_on_first_load,:reuse_regardless_of_name,:after_load
    def initialize(materials,source_name)
      super(materials);@source_name=source_name;@loads=[]
    end
    def load(path)
      @loads << path
      existing=reuse_regardless_of_name ? first : find { |material| material.name==source_name }
      if existing
        if mutate_on_first_load && loads.length==1
          existing.set_attribute('native-loader','transient','changed')
          existing.instance_variable_set(:@color,OpenStruct.new(red:200,green:10,blue:10))
        end
        return existing
      end
      material=Material.new(100+length,source_name,File.binread(path));self << material
      after_load.call(self) if after_load
      material
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
      @snapshot=@materials.map { |m| [m,Marshal.load(Marshal.dump(m.attributes)),m.name,m.color,m.texture] }; true
    end
    def commit_operation; !@fail_commit; end
    def abort_operation
      @aborts+=1
      @materials.replace(@snapshot.map(&:first))
      @snapshot.each { |m,attrs,name,color,texture| m.attributes.replace(attrs);m.name=name;m.instance_variable_set(:@color,color);m.instance_variable_set(:@texture,texture) }; true
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

  # 0.8.8: commercial approval is not a design requirement; an unapproved item
  # may receive a visual (that is how a commercial-only item becomes paintable).
  def test_revision_and_confirmation_block_before_mutation_but_approval_is_not_required_for_design
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('confirmed'=>false)) }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('revision'=>0)) }
    assert_raises(PlanosSanto::ExportError) { @library.bind(request.merge('assetRevision'=>99)) }
    assert_equal 0,@model.starts
    catalog=@catalog.read;catalog['items'][0]['approved']=false;@catalog.save(catalog['items'],1)
    @library.bind(request.merge('revision'=>2))
    assert_equal @sheet['id'],binding['catalogId'];assert_equal 1,@model.starts
    # 0.8.16: «lista para maderera» es la ficha completa; la casilla aprobada ya no cuenta.
    assert_equal PlanosSanto::CatalogStore.complete?(@catalog.read['items'][0]),@library.status['materials'][0]['supplierReady']
    catalog=@catalog.read;catalog['items'][0]['sku']='';@catalog.save(catalog['items'],catalog['revision'])
    refute @library.status['materials'][0]['supplierReady']
  end

  def test_corrupt_metadata_index_and_stale_commercial_fields_require_review
    @one.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,'broken')
    assert @library.status['materials'][0]['issues'].any?
    assert_raises(PlanosSanto::ExportError) { @library.bind(request) }
    @library.bind(request.merge('replaceBinding'=>true))
    catalog=@catalog.read;catalog['items'][0]['sku']='CHANGED';@catalog.save(catalog['items'],1)
    # 0.8.8: a commercial edit is reported for the supplier, never as a design issue.
    assert_empty @library.status['materials'][0]['issues']
    assert @library.status['materials'][0]['commercialIssues'].any?
    uuid=binding['uuid']
    @library.bind(request.merge('revision'=>2))
    assert_equal uuid,binding['uuid'],'re-vincular la misma ficha conserva el UUID'
    assert_empty @library.status['materials'][0]['issues'];assert_empty @library.status['materials'][0]['commercialIssues']
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

  # 0.8.8 (audit C2+C3): the archived visual is content-addressed, so a commercial
  # edit keeps it installable in another project; a tampered archive still blocks.
  def test_commercial_edit_keeps_visual_installable_in_another_project_but_tampered_archive_blocks
    @library.bind(request)
    catalog=@catalog.read
    catalog['items'][0]['sku']='SKU-CHANGED'
    @catalog.save(catalog['items'],1)
    fresh=LibraryFixture::Model.new
    other=PlanosSanto::MaterialLibrary.new(fresh,catalog:@catalog,directory:@directory)
    assert other.status['visuals'][0]['available']
    record=other.assets['records'][0];archive=File.join(@directory,'material-assets',record['assetName'])
    original=File.binread(archive);File.binwrite(archive,'tampered')
    refute other.status['visuals'][0]['available']
    assert_raises(PlanosSanto::ExportError) { other.install(request.merge('revision'=>2)) }
    assert_empty fresh.materials;assert_equal 0,fresh.starts
    File.binwrite(archive,original)
    installed=other.install(request.merge('revision'=>2))
    assert_equal 1,fresh.materials.length;assert_equal @sheet['id'],installed.dig('binding','catalogId')
  end

  def collision_loader
    @two.name='Otro acabado'
    loader=LibraryFixture::NameCollisionMaterials.new([@one,@two],@one.name)
    @model.instance_variable_set(:@materials,loader)
    loader
  end
  def collision_source
    path=File.join(@directory,'original-visual.skm');File.binwrite(path,'VISUAL-SELECTED-BY-HASH-NOT-NAME');path
  end
  def test_skm_name_collision_imports_distinct_native_material_without_binding_or_changing_originals
    loader=collision_loader;path=collision_source;before=@library.materials.map { |material| @library.material_state(material) }
    original=File.binread(path);result=@library.install(request,path:path)
    installed=@model.materials.find { |material| material.entityID.to_s==result['materialId'] }
    assert result['collisionIsolated'];refute_includes [@one,@two],installed
    assert_equal before,[@one,@two].map { |material| @library.material_state(material) }
    assert_equal 'Duplicado',@one.name;assert_empty @one.attributes;assert_empty @two.attributes
    assert_equal @sheet['id'],binding(installed)['catalogId'];refute_equal @one.name,installed.name;assert_includes installed.name,@sheet['name']
    assert_equal [path,path],loader.loads;assert_equal 1,@model.aborts;assert_equal 2,@model.starts
    row=@library.assets['records'].first
    assert_equal Digest::SHA256.hexdigest(original),row['assetHash'];assert_equal original,File.binread(path)
    again=@library.install(request)
    assert_equal installed.entityID.to_s,again['materialId'];assert_equal 2,loader.loads.length
    assert_equal 2,@model.starts
  end
  def test_collision_first_attempt_aborts_native_side_effects_before_safe_retry
    loader=collision_loader;loader.mutate_on_first_load=true
    before=@library.materials.map { |material| @library.material_state(material) }
    @library.install(request,path:collision_source)
    assert_equal before,[@one,@two].map { |material| @library.material_state(material) }
    assert_equal 1,@model.aborts;assert_equal 2,@model.starts
    refute @one.get_attribute('native-loader','transient')
  end
  def test_collision_guid_deduplication_aborts_once_more_without_binding_or_sidecar
    loader=collision_loader;loader.reuse_regardless_of_name=true
    before=@library.materials.map { |material| @library.material_state(material) }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_includes error.message,'copia independiente';assert_equal 2,loader.loads.length
    assert_equal 2,@model.aborts;assert_equal 2,@model.materials.length
    assert_equal before,@library.materials.map { |material| @library.material_state(material) }
    assert_empty @library.assets['records'];refute File.exist?(File.join(@directory,'material-assets.json'))
  end
  def test_collision_loader_that_changes_an_unrelated_material_rolls_back_retry
    loader=collision_loader;loader.after_load=lambda { |_materials| @two.set_attribute('unexpected','change',true) }
    before=@library.materials.map { |material| @library.material_state(material) }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_includes error.message,'material previo'
    assert_equal before,@library.materials.map { |material| @library.material_state(material) }
    assert_equal 2,@model.materials.length;assert_empty @library.assets['records']
  end
  def test_collision_failed_commit_restores_original_names_and_external_index
    collision_loader;@model.fail_commit=true
    before=@library.materials.map { |material| @library.material_state(material) }
    assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_equal before,@library.materials.map { |material| @library.material_state(material) }
    assert_equal 2,@model.materials.length;assert_empty @library.assets['records']
    refute File.exist?(File.join(@directory,'material-assets.json'))
  end

  def test_collision_preserves_native_attribute_dictionaries_with_block_only_enumeration
    collision_loader
    @one.set_attribute('qa-material','nested',[1,'text',true])
    dictionary=Struct.new(:name,:data) do
      def each_pair
        raise 'Native dictionary requires a block' unless block_given?
        data.each_pair { |key,value| yield key,value };self
      end
    end
    @one.define_singleton_method(:attribute_dictionaries) do
      attributes.group_by { |(group,_key),_value| group }.map do |name,rows|
        dictionary.new(name,rows.to_h { |(_group,key),value| [key,value] })
      end
    end
    before=@library.material_state(@one)
    result=@library.install(request,path:collision_source)
    assert result['collisionIsolated'];assert_equal before,@library.material_state(@one)
    assert_nil binding;assert_equal [1,'text',true],@one.get_attribute('qa-material','nested')
  end
  def test_collision_checks_originals_again_after_binding_and_archiving_new_material
    loader=collision_loader
    loader.after_load=lambda do |collection|
      imported=collection.last;original=collection.first;native_set=imported.method(:set_attribute)
      imported.define_singleton_method(:set_attribute) do |*args|
        native_set.call(*args);original.set_attribute('unexpected','shared-attribute',true)
      end
    end
    before=@library.materials.map { |material| @library.material_state(material) }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_includes error.message,'material previo'
    assert_equal before,@library.materials.map { |material| @library.material_state(material) }
    assert_equal 2,@model.materials.length;assert_empty @library.assets['records']
    refute File.exist?(File.join(@directory,'material-assets.json'))
  end

  def test_collision_never_retries_when_abort_returns_false_and_does_not_restore
    loader=collision_loader;loader.mutate_on_first_load=true
    @model.define_singleton_method(:abort_operation) { @aborts+=1;false }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_includes error.message,'no confirmó la cancelación'
    assert_includes error.message,'no continúes pintando'
    refute_includes error.message,'No se modificó'
    assert_equal 1,loader.loads.length;assert_equal 1,@model.starts;assert_equal 1,@model.aborts
    assert_nil binding;assert_empty @library.assets['records']
    assert_equal 'changed',@one.get_attribute('native-loader','transient'),'fixture intentionally demonstrates unconfirmed rollback'
  end
  def test_collision_never_retries_when_abort_claims_success_but_original_state_did_not_restore
    loader=collision_loader;loader.mutate_on_first_load=true
    @model.define_singleton_method(:abort_operation) { @aborts+=1;true }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    assert_includes error.message,'no restauró el estado verificable'
    assert_includes error.message,'No se reintentó'
    refute_includes error.message,'No se modificó'
    assert_equal 1,loader.loads.length;assert_equal 1,@model.starts;assert_equal 1,@model.aborts
    assert_nil binding;assert_empty @library.assets['records']
  end
  # 0.8.10: nil (outside the documented Boolean) is decided by the state proof
  # instead (test_collision_retry_runs_when_abort_answers_nil_...); a raising
  # abort still stops without retrying.
  def test_collision_never_retries_when_abort_raises
    [:raise].each do |result|
      loader=collision_loader;loader.mutate_on_first_load=false
      @model.define_singleton_method(:abort_operation) do
        @aborts+=1
        raise IOError,'Native rollback error' if result==:raise
        result
      end
      before=@model.starts
      error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
      assert_includes error.message,'no confirmó la cancelación'
      assert_equal 1,loader.loads.length;assert_equal before+1,@model.starts
      assert_nil binding;assert_empty @library.assets['records']
    end
  end

  def test_collision_second_abort_must_also_restore_the_temporary_name_before_claiming_safety
    loader=collision_loader;loader.reuse_regardless_of_name=true
    @model.define_singleton_method(:abort_operation) { @aborts+=1;true }
    error=assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
    # 0.8.10: the temporary import name is restored explicitly (the API does not
    # promise abort reverts Material#name=), so the original state is provable again.
    assert_includes error.message,'copia independiente'
    assert_equal 2,loader.loads.length;assert_equal 2,@model.starts
    assert_nil binding;assert_empty @library.assets['records']
    assert_equal 'Duplicado',@one.name,'el material del usuario recupera su nombre aunque abort no lo revierta'
  end

end

# Validación 0.8.10 (V6): contrato de rollback más allá de lo que garantiza la API.
class MaterialLibraryTest
  def test_collision_retry_runs_when_abort_answers_nil_and_states_prove_the_rollback
    loader=collision_loader
    native_abort=@model.method(:abort_operation)
    @model.define_singleton_method(:abort_operation) { native_abort.call;nil }
    result=@library.install(request,path:collision_source)
    assert result['collisionIsolated'];assert_equal 2,loader.loads.length
    assert_equal 'Duplicado',@one.name;assert_empty @one.attributes
  end
  def test_failed_retry_never_leaves_the_operators_material_under_the_temporary_name
    collision_loader
    # Abort that rolls back attributes but NOT Material#name= (not promised by the API).
    @model.define_singleton_method(:abort_operation) do
      @aborts+=1;@materials.replace(@snapshot.map(&:first))
      @snapshot.each { |m,attrs,_name,color,texture| m.attributes.replace(attrs);m.instance_variable_set(:@color,color);m.instance_variable_set(:@texture,texture) };true
    end
    PlanosSanto::MaterialPolicy.stub(:native_valid?,false) do
      @library.stub(:archive,->(*) { raise PlanosSanto::ExportError,'fallo simulado después de importar' }) do
        assert_raises(PlanosSanto::ExportError) { @library.install(request,path:collision_source) }
      end
    end
    assert_equal 'Duplicado',@one.name,'el material del usuario recupera su nombre'
    assert_empty @one.attributes
  end
end
