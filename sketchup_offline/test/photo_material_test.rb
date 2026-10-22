# frozen_string_literal: true
require 'minitest/autorun'
require 'minitest/mock'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'base64'
require_relative 'photo_material_double'
module PlanosSanto
  class ExportError<StandardError;end unless const_defined?(:ExportError)
end
require_relative '../photo_material'
require_relative '../material_policy'

class PhotoMaterialTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir;@source=Dir.mktmpdir
    @model=PhotoFixture::Model.new;@catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @allowed=true
    @service=PlanosSanto::PhotoMaterial.new(@model,catalog:@catalog,directory:@directory,guard:lambda { @allowed })
    Sketchup::ImageRep.fail_load=false;Sketchup::ImageRep.fail_save=false;Sketchup::ImageRep.set_data_calls=0
  end
  def teardown
    FileUtils.remove_entry(@directory);FileUtils.remove_entry(@source)
    Sketchup::ImageRep.fail_load=false;Sketchup::ImageRep.fail_save=false;Sketchup::ImageRep.set_data_calls=0
  end
  def file(name='Foto propia.png',bytes=PhotoFixture.png)
    path=File.join(@source,name);File.binwrite(path,bytes);path
  end
  def pick(name='Foto propia.png',bytes=PhotoFixture.png);@service.pick(file(name,bytes));end
  def create(result,data={})
    @service.create(result['token'],{'revision'=>result['revision'],'name'=>result['name'],'kind'=>'sheet','thicknessMm'=>18,'action'=>'new','confirmed'=>true}.merge(data))
  end
  def immutable_assets
    %w[photo-assets material-assets].flat_map { |folder| Dir.glob(File.join(@directory,folder,'*')).select { |path| File.file?(path) } }
  end
  def catalog_bytes;path=File.join(@directory,'catalog.json');File.file?(path) ? File.binread(path) : nil;end
  def index_bytes;path=File.join(@directory,'material-assets.json');File.file?(path) ? File.binread(path) : nil;end
  def test_pick_decodes_png_with_native_api_and_returns_only_bounded_safe_metadata
    result=pick('Álamo íntimo.png')
    assert_equal 'Álamo íntimo',result['name'];assert_equal [2,2],[result['widthPx'],result['heightPx']]
    assert result['preview'].start_with?('data:image/png;base64,');assert_operator result['preview'].bytesize,:<,512*1024
    assert_equal Digest::SHA256.hexdigest(PhotoFixture.png),result['sourceHash'];refute result['scaleVerified']
    refute JSON.generate(result).include?(@source);refute result.key?('bytes');assert_empty @model.materials;assert_empty @model.operations;assert_nil catalog_bytes
  end
  def test_jpeg_fixture_routes_through_native_decoder_before_any_material_is_created
    result=pick('Foto JPEG.jpeg',PhotoFixture.jpeg)
    assert_equal [2,2],[result['widthPx'],result['heightPx']];assert result['preview'].start_with?('data:image/png;base64,')
    assert_empty @model.materials;assert_empty @model.operations
  end
  def test_creates_real_texture_original_thumbnail_skm_and_design_only_catalog_record
    before=@model.geometry;result=create(pick)
    item=result['catalog']['items'].first;material=@model.materials.first
    assert material.texture;assert_equal 0,material.color_writes;assert_equal 1,material.thumbnail_calls
    assert_equal PhotoFixture.png,File.binread(material.texture.filename)
    assert_equal 'sheet',item['kind'];refute item['approved'];assert_empty item['sku'];assert_empty item['supplier']
    assert_equal item['id'],result['catalogId'];assert_equal result['binding']['uuid'],result['materialUuid']
    assert_equal 18,item['thicknessMm'];assert_nil item['grain'];assert_nil item['widthMm'];assert_nil item['lengthMm']
    assert item.dig('observed','photo','designReady');assert_equal 64,item.dig('observed','photo','skmHash').length
    assert_equal result['thumbnail'],@service.thumbnails[item['id']]
    assert PlanosSanto::MaterialPolicy.design_ready?(item,directory:@directory)
    assert_equal before,@model.geometry;assert_equal [[:start,'Planos Santo — material desde foto',true],[:commit]],@model.operations
    assert File.file?(File.join(@directory,'catalog.json'))
  end
  def test_original_can_be_deleted_and_archive_installs_in_a_different_model
    result=create(pick);item=result['catalog']['items'].first
    FileUtils.remove_entry(@source);@source=Dir.mktmpdir
    other=PhotoFixture::Model.new;library=PlanosSanto::MaterialLibrary.new(other,catalog:@catalog,directory:@directory)
    loaded=library.install({'catalogId'=>item['id'],'revision'=>1,'confirmed'=>true})
    assert_equal 1,other.materials.length;assert other.materials.first.texture
    assert_equal item['id'],loaded['binding']['catalogId'];refute_equal result['binding']['uuid'],loaded['binding']['uuid']
    assert_equal PhotoFixture.png,File.binread(other.materials.first.texture.filename)
    assert PlanosSanto::MaterialPolicy.design_ready?(@catalog.read['items'].first,directory:@directory)
  end
  def test_texture_physical_scale_is_explicit_and_never_derived_from_pixels
    result=create(pick,{'textureWidthMm'=>250,'textureHeightMm'=>500})
    texture=@model.materials.first.texture
    assert_in_delta 250/25.4,texture.width,0.000001;assert_in_delta 500/25.4,texture.height,0.000001
    assert_equal({'verified'=>true,'widthMm'=>250,'heightMm'=>500},result['textureScale'])
  end
  def test_unverified_scale_remains_explicit_and_missing_thickness_is_allowed_for_design
    result=create(pick,{'thicknessMm'=>nil})
    assert_equal({'verified'=>false,'widthMm'=>nil,'heightMm'=>nil},result['textureScale'])
    assert_nil result['catalog']['items'].first['thicknessMm'];refute result['catalog']['items'].first['approved']
  end
  def test_cancel_and_second_pick_invalidate_old_tokens_without_global_files
    result=pick;assert @service.cancel['cancelled']
    assert_raises(PlanosSanto::ExportError) { create(result) }
    second=pick;pick('Otra.png')
    assert_raises(PlanosSanto::ExportError) { create(second) };assert_empty immutable_assets;assert_empty @model.operations
  end
  def test_source_is_copied_at_pick_and_changes_or_deletion_do_not_change_created_texture
    path=file;result=@service.pick(path);File.binwrite(path,PhotoFixture.png(3,3))
    created=create(result)
    assert_equal PhotoFixture.png,File.binread(@model.materials.first.texture.filename)
    assert_equal Digest::SHA256.hexdigest(PhotoFixture.png),created['catalog']['items'].first.dig('observed','photo','sourceHash')
  end
  def test_duplicate_hash_and_name_require_explicit_decision
    first=create(pick)
    result=pick
    assert_equal first['catalogId'],result['duplicates'].first['catalogId'];assert_equal 'hash',result['duplicates'].first['reason']
    assert_raises(PlanosSanto::ExportError) { create(result) }
    assert_equal 1,@model.materials.length;assert_equal 1,@catalog.read['revision']
  end
  def test_existing_choice_reuses_matching_model_material_without_another_undo
    first=create(pick);result=pick
    reused=@service.create(result['token'],{'revision'=>result['revision'],'action'=>'existing','existingId'=>first['catalogId'],'confirmed'=>true})
    assert reused['reused'];refute reused['created'];assert_equal first['materialId'],reused['materialId']
    assert_equal 1,@model.materials.length;assert_equal 1,@model.operations.count { |operation| operation.first==:start }
    assert_equal 1,@catalog.read['revision']
  end
  def test_variant_creates_independent_catalog_and_native_material_and_preserves_original
    original=create(pick);old=@model.materials.first;bytes=catalog_bytes
    variant=create(pick,{'action'=>'variant','name'=>'Variante de diseño'})
    refute_equal original['catalogId'],variant['catalogId'];refute_same old,@model.materials.last
    assert_equal 2,@catalog.read['items'].length;assert_equal original['catalogId'],@catalog.read['items'].first['id']
    assert_equal PhotoFixture.png,File.binread(old.texture.filename);refute_equal bytes,catalog_bytes
  end
  def test_replace_is_explicit_new_material_and_does_not_mutate_existing_painted_objects
    old=create(pick);old_material=@model.materials.first;old_attributes=Marshal.dump(old_material.attributes);old_path=old_material.texture.filename
    result=pick('Nueva foto.png',PhotoFixture.png(3,3))
    assert_raises(PlanosSanto::ExportError) { create(result,{'action'=>'replace','existingId'=>old['catalogId']}) }
    replacement=create(result,{'action'=>'replace','existingId'=>old['catalogId'],'replaceConfirmed'=>true,'name'=>'Nuevo visual'})
    assert replacement['replaced'];assert_equal old['catalogId'],replacement['catalogId'];assert_equal 1,@catalog.read['items'].length
    assert_equal 2,@model.materials.length;assert_equal old_attributes,Marshal.dump(old_material.attributes);assert_equal old_path,old_material.texture.filename
    refute_equal old['binding']['catalogFingerprint'],replacement['binding']['catalogFingerprint'];refute @catalog.read['items'].first['approved']
  end
  def test_replace_cannot_silently_change_sheet_to_edge
    old=create(pick);result=pick
    assert_raises(PlanosSanto::ExportError) { create(result,{'action'=>'replace','existingId'=>old['catalogId'],'replaceConfirmed'=>true,'kind'=>'edge'}) }
    assert_equal 'sheet',@catalog.read['items'].first['kind']
  end
  def test_existing_after_replacement_reuses_only_current_verified_material_without_mutation
    first=create(pick);old=@model.materials.first
    replaced=create(pick('Nueva foto.png',PhotoFixture.png(3,3)),{'action'=>'replace','existingId'=>first['catalogId'],'replaceConfirmed'=>true})
    current=@model.materials.last;before_catalog=catalog_bytes;before_index=index_bytes
    before_operations=@model.operations.dup;old_attributes=Marshal.dump(old.attributes);old_texture=old.texture
    selected=pick('Nueva foto.png',PhotoFixture.png(3,3))
    reused=@service.create(selected['token'],{'revision'=>selected['revision'],'action'=>'existing','existingId'=>first['catalogId'],'confirmed'=>true})
    assert_equal replaced['materialId'],reused['materialId'];assert_equal replaced['materialUuid'],reused['materialUuid']
    assert reused['reused'];refute reused['created'];assert_equal [old,current],@model.materials
    assert_equal before_operations,@model.operations;assert_equal before_catalog,catalog_bytes;assert_equal before_index,index_bytes
    assert_equal old_attributes,Marshal.dump(old.attributes);assert_same old_texture,old.texture
    stale=pick('Nueva foto.png',PhotoFixture.png(3,3));@catalog.save(@catalog.read['items'],stale['revision'])
    assert_raises(PlanosSanto::ExportError) { @service.create(stale['token'],{'revision'=>stale['revision'],'action'=>'existing','existingId'=>first['catalogId'],'confirmed'=>true}) }
    assert_equal before_operations,@model.operations
  end
  def test_catalog_revision_changes_and_model_guard_prevent_creation
    result=pick;@catalog.save([],0)
    assert_raises(PlanosSanto::ExportError) { create(result) };assert_empty @model.materials
    result=pick;@allowed=false
    assert_raises(PlanosSanto::ExportError) { create(result) };assert_empty @model.operations
  end
  def test_invalid_signature_corrupt_decoding_oversize_and_pixel_limits_are_rejected
    ["not image",PhotoFixture.png.byteslice(0,33),PhotoFixture.jpeg(5000,5000),PhotoFixture.jpeg(20_000,1)].each do |bytes|
      assert_raises(PlanosSanto::ExportError) { pick('bad.png',bytes) }
    end
    Sketchup::ImageRep.fail_load=true
    assert_raises(PlanosSanto::ExportError) { pick };Sketchup::ImageRep.fail_load=false
    path=file;File.open(path,'wb') { |stream| stream.truncate(PlanosSanto::PhotoMaterial::MAX_BYTES+1) }
    assert_raises(PlanosSanto::ExportError) { @service.pick(path) }
    assert_empty @model.operations;assert_nil catalog_bytes
  end
  def test_symlink_and_non_local_paths_never_reach_material_creation
    real=file;link=File.join(@source,'link.png');File.symlink(real,link)
    [link,'https://example.invalid/photo.png',nil].each do |path|
      assert_raises(PlanosSanto::ExportError) { @service.pick(path) }
    end
    assert_empty @model.operations
  end
  def test_bad_user_fields_do_not_create_a_native_operation
    result=pick
    [{kind:'unknown'},{name:''},{thicknessMm:0},{textureWidthMm:200},{textureWidthMm:'100',textureHeightMm:100},{confirmed:false},{path:'/arbitrary.png'}].each do |patch|
      assert_raises(PlanosSanto::ExportError) { create(result,patch.transform_keys(&:to_s)) }
    end
    assert_empty @model.operations;assert_nil catalog_bytes
  end
  def test_failures_in_texture_thumbnail_save_and_commit_restore_model_catalog_and_assets
    %i[next_texture_failure next_thumbnail_failure next_save_failure].each do |flag|
      result=pick;@model.materials.public_send(flag.to_s+'=',true)
      assert_raises(PlanosSanto::ExportError) { create(result) }
      assert_empty @model.materials;assert_empty immutable_assets;assert_nil catalog_bytes;assert_nil index_bytes
      @model.materials.public_send(flag.to_s+'=',false)
    end
    result=pick;@model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { create(result) }
    assert_empty @model.materials;assert_empty immutable_assets;assert_nil catalog_bytes;assert_nil index_bytes
  end
  def test_failed_replacement_restores_catalog_visual_and_old_material_exactly
    first=create(pick);before_catalog=catalog_bytes;before_index=index_bytes;before_assets=immutable_assets.sort;old_material=@model.materials.first
    result=pick('Otra foto.png',PhotoFixture.png(3,3));@model.fail_commit=true
    assert_raises(PlanosSanto::ExportError) { create(result,{'action'=>'replace','existingId'=>first['catalogId'],'replaceConfirmed'=>true}) }
    assert_equal before_catalog,catalog_bytes;assert_equal before_index,index_bytes;assert_equal before_assets,immutable_assets.sort
    assert_equal [old_material],@model.materials
  end
  def test_photo_operation_is_a_single_native_undo_and_redo_preserves_library
    created=create(pick);assert_equal 1,@model.undo_stack.length
    @model.undo;assert_empty @model.materials
    assert_equal created['catalogId'],@catalog.read['items'].first['id'];refute_empty @service.thumbnails
    @model.redo;assert_equal 1,@model.materials.length;assert @model.materials.first.texture
  end
  def test_missing_or_changed_thumbnail_is_not_returned_and_never_replaced_by_a_fake
    result=create(pick);item=result['catalog']['items'].first;path=File.join(@directory,'photo-assets',item.dig('observed','photo','thumbnailAsset'))
    File.binwrite(path,'corrupt')
    assert_empty @service.thumbnails;refute PlanosSanto::MaterialPolicy.design_ready?(item,directory:@directory)
  end
  def test_materials_add_returning_an_existing_object_cannot_change_its_texture_or_binding
    first=create(pick);existing=@model.materials.first
    before=Marshal.dump(existing.attributes);old_texture=existing.texture
    result=pick('Different name.png',PhotoFixture.png(3,3))
    @model.materials.stub(:add,existing) do
      assert_raises(PlanosSanto::ExportError) { create(result) }
    end
    assert_equal before,Marshal.dump(existing.attributes);assert_same old_texture,existing.texture
    assert_equal first['catalogId'],@catalog.read['items'].first['id'];assert_equal 1,@catalog.read['revision']
  end
  def test_external_catalog_publication_failure_rolls_back_native_operation_and_visual_index
    result=pick;library=@service.instance_variable_get(:@library)
    library.stub(:publish_catalog_locked,lambda { |*_args| raise IOError,'simulated publication failure' }) do
      assert_raises(IOError) { create(result) }
    end
    assert_empty @model.materials;assert_nil catalog_bytes;assert_nil index_bytes;assert_empty immutable_assets
  end
  def test_context_change_before_commit_restores_model_catalog_and_all_new_assets
    result=pick;library=@service.instance_variable_get(:@library)
    publish=library.method(:publish_catalog_locked)
    library.stub(:publish_catalog_locked,lambda { |*args| response=publish.call(*args);@allowed=false;response }) do
      assert_raises(PlanosSanto::ExportError) { create(result) }
    end
    assert_empty @model.materials;assert_nil catalog_bytes;assert_nil index_bytes;assert_empty immutable_assets
  end

  # Decoder-contract doubles: these do NOT execute the Windows image decoder.
  # In particular the 1200x1200 case uses declared dimensions to reproduce the
  # observed native return contract, not the user's absent private JPG bytes.
  def with_decoder_contract(result: nil, proof: true, width: nil, height: nil, bits: 24, padding: nil, data: :complete, error: nil)
    original=Sketchup::ImageRep.method(:new);instances=[]
    factory=lambda do
      rep=original.call;instances << rep
      decode=rep.method(:load_file)
      rep.define_singleton_method(:load_file) do |path|
        decoded=decode.call(path)
        raise error if error
        decoded==false ? false : result
      end
      rep.define_singleton_method(:width) { width } unless width.nil?
      rep.define_singleton_method(:height) { height } unless height.nil?
      rep.define_singleton_method(:data) { nil } unless proof
      if proof
        rep.define_singleton_method(:bits_per_pixel) { bits }
        rep.define_singleton_method(:row_padding) { padding.nil? ? (4-(self.width*(bits.to_i/8))%4)%4 : padding }
        rep.define_singleton_method(:data) do
          data==:complete ? ("\x00".b*((self.width*(bits.to_i/8)+(padding.nil? ? (4-(self.width*(bits.to_i/8))%4)%4 : padding))*self.height)) : data.respond_to?(:call) ? data.call : data
        end
      end
      rep
    end
    Sketchup::ImageRep.stub(:new,factory) { yield instances }
  end
  def test_nil_load_result_requires_decoded_pixels_and_matching_headers_for_jpg_and_png
    with_decoder_contract do |instances|
      jpg=pick('Original.jpg',PhotoFixture.jpeg)
      png=pick('Original.png',PhotoFixture.png)
      assert_equal [2,2],[jpg['widthPx'],jpg['heightPx']]
      assert_equal [2,2],[png['widthPx'],png['heightPx']]
      assert_equal 2,instances.length
      refute_same instances[0],instances[1]
      assert_empty @model.materials;assert_empty @model.operations
    end
  end
  def test_nil_load_result_with_reported_1200_square_dimensions_creates_real_material_binding
    bytes=PhotoFixture.jpeg(1200,1200)
    with_decoder_contract do
      selected=pick('Contrato 1200.jpg',bytes)
      assert_equal [1200,1200],[selected['widthPx'],selected['heightPx']]
      created=create(selected)
      assert_equal Digest::SHA256.hexdigest(bytes),created['catalog']['items'].first.dig('observed','photo','sourceHash')
      assert_equal bytes,File.binread(@model.materials.first.texture.filename)
      assert created['designReady'];assert @model.materials.first.texture
    end
  end
  def test_nil_decode_supports_creating_and_replacing_a_photo_without_mutating_previous_visual
    with_decoder_contract do
      initial=create(pick('Inicial.jpg',PhotoFixture.jpeg))
      previous=@model.materials.first;old_texture=previous.texture;old_attributes=Marshal.dump(previous.attributes)
      replacement=create(pick('Reemplazo.png',PhotoFixture.png(3,3)),{'action'=>'replace','existingId'=>initial['catalogId'],'replaceConfirmed'=>true})
      assert replacement['replaced'];assert_equal initial['catalogId'],replacement['catalogId']
      assert_equal 2,@model.materials.length
      assert_same old_texture,previous.texture;assert_equal old_attributes,Marshal.dump(previous.attributes)
      assert_equal PhotoFixture.png(3,3),File.binread(@model.materials.last.texture.filename)
    end
  end
  # Validación 0.8.10 (juez): ImageRep#resize NO existe en la API (2018-2026).
  # Toda foto de más de 256 px fallaba al armar la vista previa en SketchUp real.
  IMAGE_REP_API=%w[bits_per_pixel color_at_uv colors data height load_file row_padding save_file set_data size width].freeze
  # 0.8.13 nativo (F0): en Windows load_file falla si Ruby tiene el archivo abierto. El doble lo
  # reproduce, y el código cierra la copia temporal antes de decodificar.
  def test_image_rep_double_fails_like_windows_on_an_open_file_and_pick_closes_its_copy
    Tempfile.create(['abierto','.jpg']) do |file|
      file.binmode;file.write('x');file.flush
      assert_raises(ArgumentError) { Sketchup::ImageRep.new.load_file(file.path) }
    end
    source=File.read(File.expand_path('../photo_material.rb',__dir__),encoding:'UTF-8')
    assert_match(/def temporary\(bytes,extension\).*?file\.close\s*\n\s*yield file\.path/m,source)
  end

  def test_photo_code_only_calls_documented_image_rep_methods
    source=File.read(File.expand_path('../photo_material.rb',__dir__),encoding:'UTF-8')
    called=source.scan(/\brep\.(\w+)/).flatten.uniq-%w[respond_to]
    assert_empty called-IMAGE_REP_API,"métodos de ImageRep fuera de la API documentada: #{called-IMAGE_REP_API}"
    refute Sketchup::ImageRep.method_defined?(:resize),'el doble no debe inventar métodos que SketchUp no tiene'
  end
  # 0.8.18 (calidad visual, «que no sea tan pixelado»): 512 px, not 256.
  def test_large_photo_preview_is_averaged_with_set_data_to_at_most_512_pixels
    result=pick('Textura 1200.jpg',PhotoFixture.jpeg(1200,1200))
    assert_equal [1200,1200],[result['widthPx'],result['heightPx']]
    assert_operator Sketchup::ImageRep.set_data_calls,:>=,1
    info=@service.image_info(Base64.decode64(result['preview'].split(',',2).last))
    assert_equal [512,512],[info['widthPx'],info['heightPx']]
    wide=pick('Panorámica.jpg',PhotoFixture.jpeg(1000,300))
    info=@service.image_info(Base64.decode64(wide['preview'].split(',',2).last))
    assert_equal [512,154],[info['widthPx'],info['heightPx']]
    small=pick('Chica.jpg',PhotoFixture.jpeg(300,200))
    info=@service.image_info(Base64.decode64(small['preview'].split(',',2).last))
    assert_equal [300,200],[info['widthPx'],info['heightPx']],'nunca se agranda una foto chica'
  end
  def rep(width,height,bits,padding,pixels)
    Sketchup::ImageRep.new.set_data(width,height,bits,padding,pixels.b)
  end
  def checker(size,bits,cell=1)
    bytes=bits/8;black="\x00".b*bytes;white="\xff".b*bytes
    rows=Array.new(size) { |y| Array.new(size) { |x| ((x/cell)+(y/cell)).even? ? black : white }.join }
    padding=(4-(size*bytes)%4)%4
    rep(size,size,bits,padding,rows.map { |row| row+"\x00".b*padding }.join)
  end
  def test_thumbnail_averages_blocks_keeps_native_byte_order_and_row_padding
    # 4x2, 24 bpp, padding 0: pixel (x,y) = [x, y, 9] in native order.
    pixels=(0..1).flat_map { |y| (0..3).flat_map { |x| [x,y,9] } }.pack('C*')
    thumb=@service.thumbnail_rep(rep(4,2,24,0,pixels),2,1)
    assert_equal [2,1,24,2],[thumb.width,thumb.height,thumb.bits_per_pixel,thumb.row_padding]
    # Block 1: mean of x 0,1 = 0.5 -> 1; block 2: x 2,3 = 2.5 -> 3; y 0,1 -> 1; the third byte stays 9.
    assert_equal [1,1,9,3,1,9,0,0],thumb.data.unpack('C*'),'promedio por bloque, BGR intacto y fila rellenada a 4 bytes'
    # 32 bpp keeps the 4th byte (alpha) and its own order.
    pixels=[10,20,30,40, 30,40,50,60, 50,60,70,80, 70,80,90,100].pack('C*')
    thumb=@service.thumbnail_rep(rep(2,2,32,0,pixels),1,1)
    assert_equal [40,50,60,70],thumb.data.unpack('C*')
    assert_equal 0,thumb.row_padding
  end
  def test_thumbnail_of_a_checkerboard_is_flat_grey_not_aliased
    [24,32].each do |bits|
      # Even blocks (2x2, 4x4) hold as much black as white: exactly grey.
      # A 3x3 block holds 4 and 5: 113/142, never the 0/255 of a nearest sample.
      [[1024,512,127..128],[1000,512,127..128],[64,16,127..128],[1500,512,113..142]].each do |size,target,range|
        values=@service.thumbnail_rep(checker(size,bits),target,target).data.bytes
        bytes=bits/8;padding=(4-(target*bytes)%4)%4
        values=values.each_slice(target*bytes+padding).flat_map { |row| row.first(target*bytes) }
        assert_equal target*target*bytes,values.length
        assert values.all? { |value| range.cover?(value) },"ajedrez #{size}->#{target} a #{bits} bits: #{values.minmax.inspect}"
      end
    end
    # Squares of 2 px reduced 4x: every 4x4 block holds two black and two white squares.
    values=@service.thumbnail_rep(checker(512,32,2),128,128).data.bytes
    assert values.all? { |value| value.between?(127,128) },"ajedrez de 2 px: #{values.minmax.inspect}"
  end
  def test_thumbnail_matches_an_exact_box_average_with_padding
    random=Random.new(18)
    [[37,23,24,9,6],[37,23,32,9,6],[50,50,24,7,7],[5,3,24,2,1],[300,200,32,1,1]].each do |width,height,bits,out_w,out_h|
      bytes=bits/8;padding=(4-(width*bytes)%4)%4;stride=width*bytes+padding
      source=Array.new(height) { random.bytes(width*bytes)+"\x00".b*padding }.join
      thumb=@service.thumbnail_rep(rep(width,height,bits,padding,source),out_w,out_h)
      step=[(width.to_f/out_w).round,(height.to_f/out_h).round].min
      out_pad=(4-(out_w*bytes)%4)%4
      expected=(0...out_h).flat_map do |y|
        top=[y*height/out_h,height-step].min
        (0...out_w).flat_map do |x|
          left=[x*width/out_w,width-step].min
          (0...bytes).map do |channel|
            sum=0;step.times { |j| step.times { |i| sum+=source.getbyte((top+j)*stride+(left+i)*bytes+channel) } }
            (sum+step*step/2)/(step*step)
          end
        end+[0]*out_pad
      end
      actual=thumb.data.bytes
      assert_equal expected.length,actual.length
      assert_operator actual.zip(expected).map { |a,b| (a-b).abs }.max,:<=,1,"#{width}x#{height}@#{bits} -> #{out_w}x#{out_h}"
    end
  end
  def test_sixteen_megapixel_photo_is_reduced_in_well_under_two_seconds
    width=height=4000;bytes=4
    row=Random.new(16).bytes(width*bytes)
    source=rep(width,height,32,0,row*height)
    started=Process.clock_gettime(Process::CLOCK_MONOTONIC)
    thumb=@service.thumbnail_rep(source,512,512)
    elapsed=Process.clock_gettime(Process::CLOCK_MONOTONIC)-started
    assert_equal [512,512],[thumb.width,thumb.height]
    assert_equal 512*512*4,thumb.data.bytesize
    assert_operator elapsed,:<,2.0,"16 MP -> 512 px tardó #{elapsed.round(2)} s"
  end
  def test_thumbnail_limits_are_512_pixels_and_documented_bytes
    assert_equal 512,PlanosSanto::PhotoMaterial::THUMBNAIL_SIDE
    assert_equal 1_114_624,PlanosSanto::PhotoMaterial::MAX_THUMBNAIL,'512×512 RGBA sin compresión + filtros + 64 KiB de cabeceras'
    assert_equal 1_114_624,PlanosSanto::SkmImport::MAX_PREVIEW
    assert_equal 24*1024*1024,PlanosSanto::PhotoMaterial::THUMBNAIL_BUDGET
    source=File.read(File.expand_path('../photo_material.rb',__dir__),encoding:'UTF-8')
    refute_match(/x\*rep\.width\/width\)\*bytes/,source,'sin vecino más cercano')
  end
  def test_material_thumbnail_is_written_at_512_and_falls_back_to_256
    created=create(pick)
    material=@model.materials.first
    assert_equal [512],material.thumbnail_sizes
    asset=created['catalog']['items'].first.dig('observed','photo','thumbnailAsset')
    info=@service.image_info(File.binread(File.join(@directory,'photo-assets',asset)))
    assert_equal [512,512],[info['widthPx'],info['heightPx']]
    legacy=PhotoFixture::Material.new(77,'Viejo');legacy.thumbnail_max=256
    bytes=@service.thumbnail_bytes(legacy)
    assert_equal [512,256],legacy.thumbnail_sizes,'si SketchUp rechaza 512, usa 256'
    assert_equal [256,256],@service.image_info(bytes).values_at('widthPx','heightPx')
    broken=PhotoFixture::Material.new(78,'Roto');broken.thumbnail_failure=true
    assert_raises(PlanosSanto::ExportError) { @service.thumbnail_bytes(broken) }
  end
  def test_nil_without_pixel_proof_never_accepts_dimensions_alone
    [{proof:false},{data:nil},{data:''},{data:'truncated'},{bits:0},{bits:7},{bits:24.0},{bits:136},{padding:-1},{padding:4}].each do |options|
      with_decoder_contract(**options) { assert_raises(PlanosSanto::ExportError) { pick } }
    end
    assert_empty @model.materials;assert_empty @model.operations;assert_nil catalog_bytes
  end
  def test_false_unknown_or_raising_decoder_never_uses_dimensions_or_pixel_buffers
    [false,'true',1].each do |value|
      with_decoder_contract(result:value) { assert_raises(PlanosSanto::ExportError) { pick } }
    end
    with_decoder_contract(error:RuntimeError.new('native decode failed')) { assert_raises(PlanosSanto::ExportError) { pick } }
    assert_empty @model.materials;assert_empty @model.operations
  end
  def test_nil_decoder_rejects_zero_invalid_mismatching_or_excessive_dimensions
    [{width:0},{height:0},{width:2.0},{width:3},{height:3},{width:20_000},{width:5000,height:5000}].each do |options|
      with_decoder_contract(**options) { assert_raises(PlanosSanto::ExportError) { pick } }
    end
    assert_empty @model.materials;assert_empty @model.operations
  end
  def test_nil_decoder_accepts_native_rgb_padding_and_rgba_alpha_buffers
    with_decoder_contract(bits:24) do
      selected=pick('RGB con padding.png',PhotoFixture.png(1,2))
      assert_equal [1,2],[selected['widthPx'],selected['heightPx']]
      assert create(selected)['created']
    end
    with_decoder_contract(bits:32) do
      selected=pick('RGBA con alpha.png',PhotoFixture.png(3,2))
      assert_equal [3,2],[selected['widthPx'],selected['heightPx']]
      assert create(selected)['created']
    end
    assert_equal 2,@model.materials.length
  end
  def test_invalid_decoder_layout_is_rejected_before_requesting_large_pixel_buffer
    no_read=lambda { flunk('No se debe copiar un buffer de un formato inválido') }
    [{bits:128},{bits:8},{padding:10_000},{width:20_000}].each do |options|
      with_decoder_contract(**options,data:no_read) { assert_raises(PlanosSanto::ExportError) { pick } }
    end
    assert_equal 16_000_000*4+16_384*3,PlanosSanto::PhotoMaterial::MAX_DECODED_BYTES
    assert_empty @model.operations
  end
  def test_nil_decoder_does_not_bypass_corrupt_content_false_extensions_or_limits
    with_decoder_contract do
      [PhotoFixture.png.byteslice(0,33),PhotoFixture.jpeg.byteslice(0,100),'not a picture'].each do |bytes|
        assert_raises(PlanosSanto::ExportError) { pick('Corrupta.png',bytes) }
      end
      assert_raises(PlanosSanto::ExportError) { pick('Falsa.jpg',PhotoFixture.png) }
      assert_raises(PlanosSanto::ExportError) { pick('Falsa.png',PhotoFixture.jpeg) }
      assert_raises(PlanosSanto::ExportError) { pick('Grande.jpg',PhotoFixture.jpeg(5000,5000)) }
      assert_raises(PlanosSanto::ExportError) { pick('Larga.jpg',PhotoFixture.jpeg(20_000,1)) }
    end
    assert_empty @model.materials;assert_empty @model.operations;assert_nil catalog_bytes
  end

end
