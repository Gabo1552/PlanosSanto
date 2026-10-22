# frozen_string_literal: true
# MATERIALES-10/11 with synthetic API doubles (no native ImageRep, no SketchUp).
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'json'
require_relative 'photo_material_double'
module PlanosSanto
  class ExportError<StandardError;end unless const_defined?(:ExportError)
end
require_relative '../photo_material'

class TextureAdjustTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir;@source=Dir.mktmpdir
    @model=PhotoFixture::Model.new;@catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @service=PlanosSanto::PhotoMaterial.new(@model,catalog:@catalog,directory:@directory,guard:lambda { true })
    Sketchup::ImageRep.fail_load=false;Sketchup::ImageRep.fail_save=false
    path=File.join(@source,'Roble QA.png');File.binwrite(path,PhotoFixture.png(4,2))
    pick=@service.pick(path)
    @created=@service.create(pick['token'],{'revision'=>pick['revision'],'name'=>'Roble QA','kind'=>'sheet','thicknessMm'=>18,'action'=>'new','confirmed'=>true})
    @id=@created['catalogId']
    @catalog.save(@catalog.read['items'].map { |item| item.merge('lengthMm'=>2600,'widthMm'=>1830) },@catalog.read['revision'])
    @material=@model.materials.first
    @model.operations.clear
  end
  def teardown;FileUtils.remove_entry(@directory);FileUtils.remove_entry(@source);end
  def item;@catalog.read['items'].find { |row| row['id']==@id };end
  def library;PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory);end
  def request(extra={})
    {'catalogId'=>@id,'widthMm'=>800,'heightMm'=>400,'rotation'=>0}.merge(extra)
  end
  def apply(extra={})
    @service.texture_apply(request({'revision'=>@catalog.read['revision'],'assetRevision'=>library.assets['revision'],'confirmed'=>true}.merge(extra)))
  end

  def test_preview_reports_affected_repeats_and_ratio_without_writing
    before=Dir.glob(File.join(@directory,'**','*')).sort
    preview=@service.texture_preview(request('widthMm'=>800,'heightMm'=>800))
    assert preview['noChanges']
    assert_equal [@material.entityID.to_s],preview['affected'].map { |row| row['materialId'] }
    assert_equal({'widthPx'=>4,'heightPx'=>2},preview['pixels'])
    assert_equal 3.25,preview['repeats']['alongLength'];assert_equal 2.29,preview['repeats']['alongWidth']
    assert_match(/proporción/,preview['warnings'].join(' '))
    assert preview['thumbnail'].start_with?('data:image/png;base64,')
    assert_equal before,Dir.glob(File.join(@directory,'**','*')).sort
    assert_empty @model.operations
    refute preview['current']['verified']
  end

  def test_scale_apply_updates_same_material_in_one_operation_and_verifies
    result=apply
    assert_equal({'ok'=>true,'checked'=>1},result['verification'])
    assert_in_delta 800,@material.texture.width*25.4,0.01
    assert_in_delta 400,@material.texture.height*25.4,0.01
    assert_equal 1,@model.materials.length
    assert_equal [:start,:commit],@model.operations.map(&:first)
    photo=item['observed']['photo']
    assert_equal({'verified'=>true,'widthMm'=>800,'heightMm'=>400},photo['textureScale'])
    assert PlanosSanto::MaterialPolicy.native_valid?(item,@material,directory:@directory)
    assert PlanosSanto::MaterialPolicy.paintable?(item,directory:@directory)
    assert_empty library.binding_issues(@material,@catalog.read,[])
    assert_empty library.commercial_issues(@material,@catalog.read)
    assert_equal photo['skmHash'],library.assets['records'].find { |row| row['catalogId']==@id }['assetHash']
  end

  def test_rotation_swaps_pixels_and_keeps_new_image_proof
    old_source=item['observed']['photo']['sourceHash']
    preview=@service.texture_preview(request('rotation'=>90,'widthMm'=>400,'heightMm'=>800))
    assert_equal({'widthPx'=>2,'heightPx'=>4},preview['pixels'])
    assert_empty preview['warnings'].grep(/proporción/)
    apply('rotation'=>90,'widthMm'=>400,'heightMm'=>800)
    photo=item['observed']['photo']
    refute_equal old_source,photo['sourceHash']
    assert_equal [2,4],[photo['widthPx'],photo['heightPx']]
    assert File.file?(File.join(@directory,'photo-assets',photo['imageAsset']))
    assert PlanosSanto::MaterialPolicy.native_valid?(item,@material,directory:@directory)
    assert_equal photo['sourceHash'],JSON.parse(@material.get_attribute(PlanosSanto::MaterialResolver::DICT,'photo_v1'))['sourceHash']
  end

  def test_rotate_rep_moves_pixels_clockwise
    rep=Sketchup::ImageRep.new.set_data(2,1,32,0,[1,2].pack('V*'))
    turned=@service.rotate_rep(rep,90)
    assert_equal [1,2],[turned.width,turned.height]
    assert_equal [1,2],turned.data.unpack('V*')
    back=@service.rotate_rep(rep,270)
    assert_equal [2,1],back.data.unpack('V*')
    assert_equal [2,1],@service.rotate_rep(rep,180).data.unpack('V*')
    three=Sketchup::ImageRep.new.set_data(1,2,24,1,"ABC\x00DEF\x00".b)
    rotated=@service.rotate_rep(three,90)
    assert_equal [2,1,24,2],[rotated.width,rotated.height,rotated.bits_per_pixel,rotated.row_padding]
    assert_equal "DEFABC\x00\x00".b,rotated.data
  end

  def test_failed_verification_aborts_and_restores_files
    catalog_before=File.binread(File.join(@directory,'catalog.json'))
    assets_before=Dir.glob(File.join(@directory,'*-assets','*')).sort
    @material.define_singleton_method(:texture=) { |value| super([value[0],1,1]) }
    error=assert_raises(PlanosSanto::ExportError) { apply }
    assert_match(/verific/,error.message)
    assert_equal :abort,@model.operations.last.first
    assert_equal catalog_before,File.binread(File.join(@directory,'catalog.json'))
    assert_equal assets_before,Dir.glob(File.join(@directory,'*-assets','*')).sort
  end

  def test_validation_requires_photo_item_loaded_material_confirmation_and_fresh_revision
    assert_raises(PlanosSanto::ExportError) { @service.texture_preview(request('rotation'=>45)) }
    assert_raises(PlanosSanto::ExportError) { @service.texture_preview(request('widthMm'=>-1)) }
    assert_raises(PlanosSanto::ExportError) { @service.texture_preview(request('widthMm'=>nil)) }
    assert_raises(PlanosSanto::ExportError) { apply('confirmed'=>false) }
    assert_raises(PlanosSanto::ExportError) { apply('revision'=>99) }
    plain=@catalog.new_item('Sin foto','sheet');@catalog.save(@catalog.read['items']+[plain],@catalog.read['revision'])
    assert_raises(PlanosSanto::ExportError) { @service.texture_preview(request('catalogId'=>plain['id'])) }
    @model.materials.clear
    error=assert_raises(PlanosSanto::ExportError) { apply }
    assert_match(/modelo/,error.message)
  end
end
