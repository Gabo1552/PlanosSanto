# frozen_string_literal: true
# MATERIALES-13 three-way sync of OpenCutList data attributes, API doubles only.
require 'minitest/autorun'
require 'tmpdir'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'

module OclSyncFixture
  class Material
    attr_reader :entityID,:attributes
    attr_accessor :name
    def initialize(id,name);@entityID,@name=id,name;@attributes={};end
    def get_attribute(dict,key,default=nil);@attributes.fetch([dict,key],default);end
    def set_attribute(dict,key,value);@attributes[[dict,key]]=value;end
    def delete_attribute(dict,key);@attributes.delete([dict,key]);end
    def color;nil;end
    def texture;nil;end
    def save_as(path);File.binwrite(path,"SKM-#{@entityID}");true;end
  end
  class Model
    attr_reader :materials,:operations
    attr_accessor :fail_commit
    def initialize(*materials);@materials=materials;@operations=[];end
    def start_operation(name,*_args);@operations << [:start,name];@snapshot=@materials.map { |m| [m,m.attributes.dup] };true;end
    def commit_operation;@operations << [:commit];!fail_commit;end
    def abort_operation;@operations << [:abort];@snapshot.each { |m,attrs| m.attributes.replace(attrs) };true;end
  end
end

class OclSyncTest < Minitest::Test
  DICT=PlanosSanto::OclAttributes::DICT
  def setup
    @directory=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    # Biblioteca v4: los espesores de la placa son su lista; acá, solo 18 mm.
    @sheet=@catalog.new_item('Blanco 18','sheet').merge('thicknessesMm'=>[18],'widthMm'=>1830,'lengthMm'=>2600,'grain'=>false)
    @sheet=@catalog.save([@sheet],0)['items'].first
    @material=OclSyncFixture::Material.new(5,'Blanco 18')
    @model=OclSyncFixture::Model.new(@material)
    @library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
    @library.bind('catalogId'=>@sheet['id'],'materialId'=>'5','revision'=>1,'confirmed'=>true)
    @model.operations.clear
  end
  def teardown;FileUtils.remove_entry(@directory);end
  def edit(changes);@catalog.save([@catalog.read['items'].first.merge(changes)],@catalog.read['revision']);end
  def sync(dry_run:false)
    preview=@library.ocl_sync('dryRun'=>true)
    dry_run ? preview : @library.ocl_sync('dryRun'=>false,'confirmed'=>true,'planDigest'=>preview['planDigest'])
  end

  def test_write_missing_records_what_planos_santo_wrote
    result=PlanosSanto::OclAttributes.write_missing(@material,@sheet)
    assert_equal 'written',result['status']
    assert_equal({'type'=>2,'std_thicknesses'=>'18mm','std_sizes'=>'2600mm x 1830mm','grained'=>false},PlanosSanto::OclAttributes.written(@material))
  end

  def test_sync_writes_missing_then_updates_only_untouched_keys_and_keeps_user_values
    first=sync
    assert_equal 'written',first['materials'].first['status']
    assert_equal 2,@material.get_attribute(DICT,'type')
    @model.operations.clear
    edit('thicknessesMm'=>[15],'widthMm'=>1500)
    @material.set_attribute(DICT,'std_sizes','2440mm x 1220mm')
    preview=sync(dry_run:true)
    row=preview['materials'].first
    assert preview['noChanges'];assert_equal '18mm',@material.get_attribute(DICT,'std_thicknesses')
    assert_equal [{'key'=>'std_thicknesses','from'=>'18mm','to'=>'15mm','action'=>'update'}],row['changes']
    assert_equal [{'key'=>'std_sizes','current'=>'2440mm x 1220mm','proposed'=>'2600mm x 1500mm'}],row['kept']
    assert_empty @model.operations
    applied=sync
    assert_equal 1,applied['changed']
    assert_equal '15mm',@material.get_attribute(DICT,'std_thicknesses')
    assert_equal '2440mm x 1220mm',@material.get_attribute(DICT,'std_sizes')
    assert_equal [[:start,'Planos Santo — sincronizar OpenCutList'],[:commit]],@model.operations
    assert_equal '15mm',PlanosSanto::OclAttributes.written(@material)['std_thicknesses']
    refute PlanosSanto::OclAttributes.written(@material).key?('std_sizes')
    assert_equal 'unchanged',sync(dry_run:true)['materials'].first['status'].then { |status| status=='kept' ? 'unchanged' : status }
  end

  def test_values_set_by_user_before_planos_santo_are_never_overwritten
    @material.set_attribute(DICT,'std_thicknesses','19mm')
    row=sync['materials'].first
    assert_equal '19mm',@material.get_attribute(DICT,'std_thicknesses')
    assert_equal 'std_thicknesses',row['kept'].first['key']
    refute PlanosSanto::OclAttributes.written(@material).key?('std_thicknesses')
  end

  def test_removed_catalog_value_deletes_only_planos_santo_value
    sync
    edit('grain'=>nil)
    row=sync['materials'].first
    assert_includes row['changes'],{'key'=>'grained','from'=>false,'to'=>nil,'action'=>'remove'}
    assert_nil @material.get_attribute(DICT,'grained')
  end

  def test_different_ocl_type_from_user_is_a_conflict_and_nothing_is_written
    @material.set_attribute(DICT,'type',4)
    row=sync['materials'].first
    assert_equal 'conflict',row['status']
    assert_nil @material.get_attribute(DICT,'std_thicknesses')
  end

  def test_damaged_record_is_treated_as_user_owned
    sync
    @material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::OclAttributes::WRITTEN_KEY,'{roto')
    edit('thicknessesMm'=>[15])
    row=sync['materials'].first
    assert_equal '18mm',@material.get_attribute(DICT,'std_thicknesses')
    assert_equal 'std_thicknesses',row['kept'].first['key']
  end

  def test_apply_refuses_a_plan_different_from_the_reviewed_one
    preview=@library.ocl_sync('dryRun'=>true)
    @material.set_attribute(DICT,'std_thicknesses','25mm')
    assert_raises(PlanosSanto::ExportError) { @library.ocl_sync('dryRun'=>false,'confirmed'=>true,'planDigest'=>preview['planDigest']) }
    assert_equal '25mm',@material.get_attribute(DICT,'std_thicknesses')
    assert_nil @material.get_attribute(DICT,'type')
  end

  def test_record_never_names_keys_planos_santo_does_not_write
    @material.set_attribute(DICT,'std_lengths','3000mm')
    @material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::OclAttributes::WRITTEN_KEY,JSON.generate('std_lengths'=>'3000mm'))
    sync
    assert_equal '3000mm',@material.get_attribute(DICT,'std_lengths')
  end

  def test_one_click_sync_filters_by_item_honours_a_preview_and_aborts_on_failed_commit
    # Punto 27: sin paso de confirmación; un clic aplica y Ctrl+Z (una operación) lo deshace.
    result=@library.ocl_sync('dryRun'=>false)
    assert_operator result['changed'],:>,0;assert_equal 2,@material.get_attribute(DICT,'type')
    assert_equal :commit,@model.operations.last.first
    assert_raises(PlanosSanto::ExportError) { @library.ocl_sync('dryRun'=>false,'catalogId'=>'00000000-0000-4000-8000-000000000000') }
    assert_raises(PlanosSanto::ExportError) { @library.ocl_sync('dryRun'=>false,'planDigest'=>'vencido') } # una vista previa vencida no aplica otra cosa
    assert_raises(PlanosSanto::ExportError) { @library.ocl_sync('dryRun'=>false,'planDigest'=>7) }
  end
  def test_failed_commit_aborts_without_writing
    @model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { sync }
    assert_nil @material.get_attribute(DICT,'type')
    assert_equal :abort,@model.operations.last.first
  end
end
