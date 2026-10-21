# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'base64'
require 'open3'
require 'rbconfig'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../skm_import'

class SkmImportTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir;@source=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @service=PlanosSanto::SkmImport.new(catalog:@catalog,directory:@directory)
  end
  def teardown
    FileUtils.remove_entry(@directory);FileUtils.remove_entry(@source)
  end
  def zip(entries,flags:0,external:0,local_version:20)
    body=''.b;central=''.b
    entries.each do |name,value|
      name=name.encode('UTF-8').b;value=value.b;crc=Zlib.crc32(value);offset=body.bytesize
      compressor=Zlib::Deflate.new(6,-Zlib::MAX_WBITS);packed=compressor.deflate(value,Zlib::FINISH);compressor.close
      body << [0x04034b50,local_version,flags,8,0,0,crc,packed.bytesize,value.bytesize,name.bytesize,0].pack('VvvvvvVVVvv') << name << packed
      central << [0x02014b50,0x0314,20,flags,8,0,0,crc,packed.bytesize,value.bytesize,name.bytesize,0,0,0,0,external,offset].pack('VvvvvvvVVVvvvvvVV') << name
    end
    body+central+[0x06054b50,0,0,entries.length,entries.length,central.bytesize,body.bytesize,0].pack('VvvvvVVv')
  end
  def png
    chunk=lambda { |type,data| [data.bytesize].pack('N')+type+data+[Zlib.crc32(type+data)].pack('N') }
    "\x89PNG\r\n\x1a\n".b+chunk.call('IHDR',[1,1,8,6,0,0,0].pack('NNCCCCC'))+chunk.call('IDAT',Zlib.deflate("\x00\x88\x77\x66\xff".b))+chunk.call('IEND',''.b)
  end
  def skm(name='Placa QA',image:png,extra:'',local_version:20)
    xml="<?xml version=\"1.0\" encoding=\"UTF-8\"?><materialDocument xmlns:mat=\"material\"><mat:material name=\"#{name}\"><mat:texture textureFilename=\"C:/Users/Privado/Temp/textura.png\"/>#{extra}</mat:material></materialDocument>"
    entries=[['document.xml',xml]];entries << ['doc_thumbnail.png',image] if image
    zip(entries,local_version:local_version)
  end
  def write(name,bytes)
    path=File.join(@source,name);File.binwrite(path,bytes);path
  end
  def bundle(entries)
    write('biblioteca.zip',zip(entries))
  end
  def preview(name='Placa QA 18mm.skm',bytes=skm)
    @service.preview(bundle([[name,bytes]]))
  end
  def commit(result,renames:{},selected:nil,confirmed:true)
    @service.commit(result['token'],selected || result['rows'].reject { |r| r['status']=='duplicate' }.map { |r| r['id'] },result['revision'],confirmed:confirmed,renames:renames)
  end
  def files;Dir.glob(File.join(@directory,'**','*')).sort;end
  def test_preview_is_readonly_and_does_not_publish_internal_absolute_paths
    result=preview
    assert_empty files
    row=result['rows'].first
    assert_equal 'Placa QA',row['name'];assert_equal 'new',row['status']
    assert_equal 'sheet',row['suggestions']['kind'];assert_equal 18,row['suggestions']['thicknessMm'];refute row['suggestions']['verified']
    assert row['thumbnail'].start_with?('data:image/png;base64,')
    assert_equal png,Base64.strict_decode64(row['thumbnail'].split(',',2).last)
    refute JSON.generate(result).include?('C:/Users');refute JSON.generate(result).include?(@source)
    assert_equal 64,row['sha256'].length
  end
  def test_candidates_keep_all_technical_values_unresolved_and_model_free
    result=commit(preview('Catno Gris QA 29x0,45mm.skm'))
    item=result['catalog']['items'].first
    assert_equal 'unknown',item['kind'];refute item['approved']
    %w[thicknessMm widthMm lengthMm grain price].each { |key| assert_nil item[key] }
    assert_empty item['sku'];assert_empty item['supplier'];assert_empty item['compatibleIds']
    assert_equal 'edge',item.dig('observed','skm','suggestions','kind')
    assert_nil item.dig('observed','skm','internalPath')
    assert_equal 1,result['imported'];assert_equal 1,result['catalog']['revision']
  end
  def test_reimport_same_bytes_has_zero_new_candidates_and_does_not_change_revision_or_backups
    commit(preview);before=File.binread(File.join(@directory,'catalog.json'));existing_files=files
    second=preview('Other filename.skm',skm)
    assert_equal 'duplicate',second['rows'].first['status']
    result=commit(second,selected:[second['rows'].first['id']])
    assert_equal 0,result['imported'];assert_equal 1,result['skipped'];assert_equal before,File.binread(File.join(@directory,'catalog.json'));assert_equal existing_files,files
  end
  def test_preview_after_restarting_service_keeps_actual_thumbnail_and_archive_bytes
    bytes=skm;result=commit(preview('QA.skm',bytes));id=result['catalog']['items'].first['id']
    service=PlanosSanto::SkmImport.new(catalog:PlanosSanto::CatalogStore.new(directory:@directory),directory:@directory)
    status=service.status
    assert_equal id,status['rows'].first['catalogId'];assert status['rows'].first['available'];assert_equal png,Base64.strict_decode64(status['rows'].first['thumbnail'].split(',',2).last)
    hash=Digest::SHA256.hexdigest(bytes);assert_equal bytes,File.binread(File.join(@directory,'skm-import-assets',hash+'.skm'))
  end
  def test_conflicting_name_or_filename_requires_explicit_unique_rename
    commit(preview)
    result=preview('Placa QA 18mm.skm',skm('Otro nombre'))
    assert_equal 'conflict',result['rows'].first['status']
    before=File.binread(File.join(@directory,'catalog.json'))
    assert_raises(PlanosSanto::ExportError) { commit(result) };assert_equal before,File.binread(File.join(@directory,'catalog.json'))
    assert_raises(PlanosSanto::ExportError) { commit(result,renames:{result['rows'].first['id']=>'Placa QA'}) }
    imported=commit(result,renames:{result['rows'].first['id']=>'Nueva ficha QA'})
    assert_equal 1,imported['imported'];assert_equal 2,imported['catalog']['items'].length
    assert_equal 'Placa QA',imported['catalog']['items'].first['name']
    assert Dir.glob(File.join(@directory,'backups','catalog-*.json')).any?
  end
  def test_duplicated_bytes_inside_bundle_have_unique_preview_ids_and_only_one_import
    result=@service.preview(bundle([['first.skm',skm],['second.skm',skm]]))
    assert_equal %w[new duplicate],result['rows'].map { |r| r['status'] }
    assert_equal 2,result['rows'].map { |r| r['id'] }.uniq.length
    imported=commit(result,selected:result['rows'].map { |r| r['id'] })
    assert_equal 1,imported['imported'];assert_equal 1,imported['skipped']
  end
  def test_same_name_different_bytes_inside_preview_is_an_explicit_conflict
    result=@service.preview(bundle([['first.skm',skm],['second.skm',skm(extra:'<extra/>')]]))
    assert_equal %w[conflict conflict],result['rows'].map { |r| r['status'] }
    assert_raises(PlanosSanto::ExportError) { commit(result) };assert_empty files
  end
  def test_folder_and_individual_file_sources_use_same_approvedfalse_rules
    write('one.skm',skm('Uno'));write('two.skm',skm('Dos'))
    result=@service.preview(@source,source:'folder');assert_equal 2,result['rows'].length
    assert_equal 2,commit(result)['imported']
    result=@service.preview([File.join(@source,'one.skm')],source:'files');assert_equal 'duplicate',result['rows'].first['status']
  end
  def test_stale_preview_revision_and_forged_confirmation_never_publish
    result=preview
    assert_raises(PlanosSanto::ExportError) { commit(result,confirmed:false) };assert_empty files
    @catalog.save([],0)
    assert_raises(PlanosSanto::ExportError) { commit(result) };assert_empty @catalog.read['items']
    assert_raises(PlanosSanto::ExportError) { @service.commit('forged',[],0,confirmed:true) }
  end
  def test_second_preview_invalidates_first_token_and_invalid_selection_rejected
    first=preview;second=preview
    assert_raises(PlanosSanto::ExportError) { commit(first) }
    assert_raises(PlanosSanto::ExportError) { commit(second,selected:['unseen']) }
    id=second['rows'].first['id'];assert_raises(PlanosSanto::ExportError) { commit(second,selected:[id,id]) }
    assert_empty files
  end
  def test_empty_selection_is_noop_and_token_is_consumed
    result=preview;assert_equal 0,commit(result,selected:[])['imported'];assert_empty files
    assert_raises(PlanosSanto::ExportError) { commit(result) }
  end
  def test_asset_requires_known_type_and_verified_archive_but_not_supplier_approval
    imported=commit(preview);item=imported['catalog']['items'].first
    assert_raises(PlanosSanto::ExportError) { @service.asset_path(item['id']) }
    item['kind']='sheet'
    @catalog.save([item],1)
    path=@service.asset_path(item['id']);assert File.file?(path)
    refute @catalog.read['items'].first['approved']
    assert_empty @catalog.read['items'].first['sku']
    assert PlanosSanto::MaterialPolicy.paintable?(@catalog.read['items'].first,directory:@directory)
    File.binwrite(path,'changed');assert_raises(PlanosSanto::ExportError) { @service.asset_path(item['id']) }
    refute @service.status['rows'].first['available']
  end
  def test_missing_thumbnail_uses_explicit_placeholder_state_without_synthetic_texture
    row=preview('plain.skm',skm(image:nil))['rows'].first
    assert_nil row['thumbnail'];assert row['warnings'].any? { |w| w.include?('Sin miniatura') }
  end
  def test_native_local_header_version45_is_supported_when_actual_sizes_are_bounded32bit
    assert_equal 'new',preview('native.skm',skm(local_version:45))['rows'].first['status']
  end
  def test_zip_slip_absolute_backslash_drive_and_duplicate_names_are_rejected_even_if_not_skm
    ['../outside.txt','/absolute.txt','C:/private.txt','a\\b.txt','a/../b.txt'].each do |name|
      assert_raises(PlanosSanto::ExportError) { @service.preview(bundle([[name,'unsafe'],['ok.skm',skm]])) }
    end
    assert_raises(PlanosSanto::ExportError) { @service.preview(bundle([['same.skm',skm],['SAME.skm',skm]])) };assert_empty files
  end
  def test_symlink_archive_entries_encryption_and_zip64_placeholders_rejected
    [zip([['x.skm',skm]],external:0xa000<<16),zip([['x.skm',skm]],flags:1)].each do |bytes|
      assert_raises(PlanosSanto::ExportError) { @service.preview(write('bad.zip',bytes)) }
    end
    bytes=zip([['x.skm',skm]]);bytes[-12,4]=[0xffffffff].pack('V')
    assert_raises(PlanosSanto::ExportError) { @service.preview(write('zip64.zip',bytes)) };assert_empty files
  end
  def test_bad_crc_truncation_and_decompression_bomb_rejected_without_catalog_mutation
    commit(preview);before=File.binread(File.join(@directory,'catalog.json'))
    bytes=zip([['x.skm',skm]]);at=bytes.index("PK\x01\x02".b);bytes[at+16,4]=[0].pack('V')
    [bytes,zip([['x.skm',skm]])[0...-7],zip([['bomb.txt','x'*(2*1024*1024)]])].each do |invalid|
      assert_raises(PlanosSanto::ExportError) { @service.preview(write('bad.zip',invalid)) }
      assert_equal before,File.binread(File.join(@directory,'catalog.json'))
    end
  end
  def test_external_entity_doctype_invalid_xml_and_missing_material_rejected
    ['<!DOCTYPE materialDocument [<!ENTITY x SYSTEM "file:///private">]><materialDocument/>','<broken>','<materialDocument/>'].each do |xml|
      assert_raises(PlanosSanto::ExportError) { preview('bad.skm',zip([['document.xml',xml]])) }
    end
    assert_empty files
  end
  def test_large_or_non_image_preview_is_not_returned_as_active_content
    ["<svg onload='bad()'/>","\x89PNG\r\n\x1a\n".b+[13].pack('N')+'IHDR'+[100_000,100_000,8,6,0,0,0].pack('NNCCCCC')+'0000'].each do |image|
      assert_nil preview('plain.skm',skm(image:image))['rows'].first['thumbnail']
    end
  end
  def test_folder_and_asset_symlinks_are_rejected
    skip 'symlink unavailable' unless File.respond_to?(:symlink)
    source=write('real.skm',skm);File.symlink(source,File.join(@source,'link.skm'))
    assert_raises(PlanosSanto::ExportError) { @service.preview(@source,source:'folder') }
    FileUtils.mkdir_p(@directory);File.symlink(@source,File.join(@directory,'skm-import-assets'))
    result=preview
    assert_raises(PlanosSanto::ExportError) { commit(result) };assert_empty @catalog.read['items']
  end
  def test_cancel_discards_pending_bytes_and_invalidates_the_token
    result=preview
    assert @service.cancel['cancelled']
    assert_raises(PlanosSanto::ExportError) { commit(result) }
    assert_empty files
  end
  def test_total_thumbnail_budget_is_bounded_for_preview_and_persistent_library
    image=png+('x'*460_000)
    result=@service.preview(bundle(15.times.map { |n| ["material#{n}.skm",skm("Material #{n}",image:image)] }))
    thumbnails=result['rows'].sum { |r| r['thumbnail'] ? r['thumbnail'].bytesize : 0 }
    assert_operator thumbnails,:<=,PlanosSanto::SkmImport::THUMBNAIL_BUDGET
    assert result['rows'].any? { |r| r['thumbnail'].nil? && r['warnings'].any? { |w| w.include?('límite') } }
    imported=commit(result)
    assert_equal 15,imported['imported']
    assert_operator imported['rows'].sum { |r| r['thumbnail'] ? r['thumbnail'].bytesize : 0 },:<=,PlanosSanto::SkmImport::THUMBNAIL_BUDGET
    assert_equal 15,Dir.glob(File.join(@directory,'skm-import-assets','*.skm')).length
  end
  def test_missing_rexml_blocks_only_import_and_does_not_prevent_extension_service_loading
    path=write('isolated.skm',skm)
    code=<<~'RUBY'
      module Kernel
        alias original_require require
        def require(name)
          raise LoadError,'simulated missing default gem' if name.start_with?('rexml/')
          original_require(name)
        end
      end
      module PlanosSanto;class ExportError<StandardError;end;end
      require 'skm_import'
      catalog=PlanosSanto::CatalogStore.new(directory:ARGV[1])
      importer=PlanosSanto::SkmImport.new(catalog:catalog,directory:ARGV[1])
      raise 'Unexpected state' unless importer.status['rows'].empty?
      begin
        importer.preview(ARGV[0],source:'files')
      rescue PlanosSanto::ExportError=>error
        raise 'Wrong diagnostic' unless error.message.include?('REXML')
        puts 'PASS_SERVICE_LOAD_FEATURE_BLOCKED'
      end
    RUBY
    stdout,stderr,status=Open3.capture3(RbConfig.ruby,'-I',File.expand_path('..',__dir__),'-e',code,path,@directory)
    assert status.success?,stderr
    assert_includes stdout,'PASS_SERVICE_LOAD_FEATURE_BLOCKED';assert_empty files
  end
  def test_status_reports_one_invalid_preserved_asset_without_hiding_other_candidates
    a=skm('Valid');b=skm('Invalid later')
    result=@service.preview(bundle([['a.skm',a],['b.skm',b]]));imported=commit(result)
    items=imported['catalog']['items'];bad=items.last
    bytes=zip([['document.xml','<broken>']]);hash=Digest::SHA256.hexdigest(bytes)
    File.binwrite(File.join(@directory,'skm-import-assets',hash+'.skm'),bytes)
    bad['observed']['skm']['sha256']=hash
    @catalog.save(items,1)
    rows=@service.status['rows'];assert_equal 2,rows.length
    assert rows.first['available'];refute rows.last['available'];assert_nil rows.last['thumbnail']
    refute_empty rows.last['warnings']
  end
  def test_xml_depth_is_bounded_before_tree_materialization
    xml='<materialDocument>'+('<node>'*80)+('</node>'*80)+'</materialDocument>'
    assert_raises(PlanosSanto::ExportError) { preview('deep.skm',zip([['document.xml',xml]])) }
    assert_empty files
  end

end
