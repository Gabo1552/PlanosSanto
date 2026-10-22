# frozen_string_literal: true
# MATERIALES-08/09 with API doubles only: no SketchUp, no real .skp or SKM.
require 'minitest/autorun'
require 'tmpdir'
require 'ostruct'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'

module ManagementFixture
  class Material
    attr_reader :entityID,:attributes,:color,:texture
    attr_accessor :name
    def initialize(id,name,bytes='SYNTHETIC-SKM')
      @entityID,@name,@bytes=id,name,bytes;@attributes={};@color=OpenStruct.new(red:1,green:2,blue:3);@texture=nil
    end
    def get_attribute(dict,key,default=nil);@attributes.fetch([dict,key],default);end
    def set_attribute(dict,key,value);@attributes[[dict,key]]=value;end
    def save_as(path);File.binwrite(path,@bytes);true;end
  end
  class Model
    attr_reader :materials,:starts
    def initialize(*materials);@materials=materials;@starts=0;end
    def start_operation(*_args);@starts+=1;true;end
    def commit_operation;true;end
    def abort_operation;true;end
  end
end

class MaterialManagementTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @edge=@catalog.new_item('Canto blanco','edge').merge('sku'=>'C1','supplier'=>'QA','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true)
    @sheet=@catalog.new_item('Blanco 18','sheet').merge('sku'=>'B18','supplier'=>'QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2600,'grain'=>false,'approved'=>true,'favorite'=>true,'compatibleIds'=>[@edge['id']])
    @catalog.save([@sheet,@edge],0)
    @material=ManagementFixture::Material.new(7,'Blanco 18')
    @model=ManagementFixture::Model.new(@material)
    @library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
  end
  def teardown;FileUtils.remove_entry(@directory);end
  def revision;@catalog.read['revision'];end

  def test_duplicate_copies_commercial_data_as_pending_with_new_identity
    result=@library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision,'confirmed'=>true)
    items=@catalog.read['items']
    copy=items.find { |item| item['id']==result['catalogId'] }
    assert_equal 3,items.length
    assert_equal 'Blanco 18 (copia)',copy['name']
    assert_equal @sheet['id'],result['duplicatedFrom']
    %w[kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds].each { |key| assert_equal @sheet[key],copy[key],key }
    assert_nil copy['price']
    refute copy['approved'];refute copy['favorite']
    refute_equal @sheet['id'],copy['id'];refute_equal @sheet['sourceHash'],copy['sourceHash']
    assert_equal @sheet['id'],copy['observed']['duplicatedFrom']
    assert_includes result['warnings'].join(' '),'conserva el SKU del original','Ya no hay aprobación que esperar: solo se avisa del SKU repetido'
    assert_equal 0,@model.starts
    second=@library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision,'confirmed'=>true)
    assert_equal 'Blanco 18 (copia 2)',second['name']
  end

  def test_duplicate_rejects_name_collision_stale_revision_and_missing_confirmation
    assert_raises(PlanosSanto::ExportError) { @library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision,'confirmed'=>true,'name'=>' canto BLANCO ') }
    assert_raises(PlanosSanto::ExportError) { @library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision+5,'confirmed'=>true) }
    assert_raises(PlanosSanto::ExportError) { @library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision) }
    assert_raises(PlanosSanto::ExportError) { @library.duplicate('catalogId'=>'00000000-0000-4000-8000-000000000000','revision'=>revision,'confirmed'=>true) }
    assert_equal 2,@catalog.read['items'].length
  end

  def test_duplicate_keeps_photo_and_skm_visual_shared_and_paintable
    bytes='SYNTHETIC-IMPORTED-SKM';hash=Digest::SHA256.hexdigest(bytes)
    folder=File.join(@directory,'skm-import-assets');FileUtils.mkdir_p(folder);File.binwrite(File.join(folder,"#{hash}.skm"),bytes)
    item=@catalog.new_item('SKM QA','sheet',{'source'=>'skm-import','skm'=>{'sha256'=>hash,'sourceName'=>'QA.skm'}})
    @catalog.save(@catalog.read['items']+[item],revision)
    result=@library.duplicate('catalogId'=>item['id'],'revision'=>revision,'confirmed'=>true,'name'=>'SKM QA variante')
    copy=@catalog.read['items'].find { |row| row['id']==result['catalogId'] }
    assert PlanosSanto::MaterialPolicy.paintable?(copy,directory:@directory)
    assert_equal ['skm-import-assets'],Dir.children(@directory).select { |name| name.end_with?('assets') }
  end

  def test_duplicate_copies_archived_visual_record_for_bound_items
    @library.bind('catalogId'=>@sheet['id'],'materialId'=>'7','revision'=>revision,'confirmed'=>true)
    result=@library.duplicate('catalogId'=>@sheet['id'],'revision'=>revision,'confirmed'=>true)
    records=@library.assets['records']
    copy=records.find { |row| row['catalogId']==result['catalogId'] }
    assert copy
    assert_equal records.find { |row| row['catalogId']==@sheet['id'] }['assetHash'],copy['assetHash']
    item=@catalog.read['items'].find { |row| row['id']==result['catalogId'] }
    assert_equal PlanosSanto::MaterialResolver.item_fingerprint(item),copy['catalogFingerprint']
    assert PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
  end

  def test_archive_dry_run_reports_usage_without_writing
    @library.bind('catalogId'=>@edge['id'],'materialId'=>'7','revision'=>revision,'confirmed'=>true)
    before=Dir.children(@directory).sort
    result=@library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision,'dryRun'=>true)
    assert result['noChanges']
    row=result['rows'].first
    assert_equal 1,row['inModel'];assert_equal 1,row['compatibleWith']
    assert_match(/modelo/,row['warnings'].join(' '));assert_match(/compatible/,row['warnings'].join(' '))
    assert_equal before,Dir.children(@directory).sort
    assert_empty @library.archived_ids
  end

  def test_archive_and_restore_keep_catalog_files_and_compatibility
    catalog_before=File.binread(File.join(@directory,'catalog.json'))
    result=@library.archive_items('catalogIds'=>[@edge['id'],@sheet['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true)
    assert_equal 2,result['changed']
    assert_equal [@edge['id'],@sheet['id']].sort,@library.archived_ids.sort
    assert_equal catalog_before,File.binread(File.join(@directory,'catalog.json'))
    assert_equal [@edge['id']],@catalog.read['items'].find { |row| row['id']==@sheet['id'] }['compatibleIds']
    again=@library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true)
    assert_equal 0,again['changed'];assert again['noChanges']
    restored=@library.archive_items('catalogIds'=>[@edge['id']],'archived'=>false,'revision'=>revision,'confirmed'=>true)
    assert_equal 1,restored['changed']
    assert_equal [@sheet['id']],@library.archived_ids
    assert Dir.glob(File.join(@directory,'backups','material-states-*.json')).any?
  end

  def test_archive_validates_ids_confirmation_and_damaged_index
    assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision) }
    assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>['nope'],'archived'=>true,'revision'=>revision,'confirmed'=>true) }
    assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>[@edge['id'],@edge['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true) }
    assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>[@edge['id']],'archived'=>'si','revision'=>revision,'confirmed'=>true) }
    File.write(File.join(@directory,'material-states.json'),'{"schema":1,"revision":0,"records":[{"catalogId":"../x"}]}')
    error=assert_raises(PlanosSanto::ExportError) { @library.archived_ids }
    assert_match(/archivadas/,error.message)
    File.write(File.join(@directory,'material-states.json'),'{roto')
    assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true) }
  end

  def test_orphan_records_can_be_restored_and_are_cleaned_on_write
    @library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true)
    @catalog.save([@sheet.merge('compatibleIds'=>[])],revision)
    result=@library.archive_items('catalogIds'=>[@edge['id']],'archived'=>false,'revision'=>revision,'confirmed'=>true)
    assert_equal 1,result['changed']
    assert_empty @library.states['records']
    stale=assert_raises(PlanosSanto::ExportError) { @library.archive_items('catalogIds'=>[@sheet['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true,'statesRevision'=>0) }
    assert_match(/otra ventana/,stale.message)
    message=assert_raises(PlanosSanto::ExportError) { @library.duplicate('catalogId'=>@sheet['id'],'confirmed'=>true) }.message
    assert_match(/duplicar/,message)
  end

  def test_extras_ignore_records_of_deleted_items
    @library.archive_items('catalogIds'=>[@edge['id']],'archived'=>true,'revision'=>revision,'confirmed'=>true)
    @catalog.save([@sheet.merge('compatibleIds'=>[])],revision)
    assert_equal [],@library.extras['archivedIds']
  end
end
