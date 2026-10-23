# frozen_string_literal: true
# MATERIALES-07 package export/import with synthetic files only: no SketchUp,
# no customer photo or SKM. SKMs are tiny generated ZIPs with a document.xml.
require 'minitest/autorun'
require 'tmpdir'
require 'zlib'
module PlanosSanto
  class ExportError < StandardError; end unless const_defined?(:ExportError)
end
require_relative '../material_library'

module PackageFixture
  PNG="\x89PNG\r\n\x1a\n".b+[13].pack('N')+'IHDR'+[2,2,8,6,0,0,0].pack('NNCCCCC')+'SYNTHETIC-PNG'.b
  def self.skm(name)
    PlanosSanto::BoundedZip.build([['document.xml',%(<?xml version="1.0" encoding="UTF-8"?><materialDocument><material name="#{name}"/></materialDocument>),true]])
  end
  # Raw writer for hostile packages: no name validation on purpose.
  def self.raw_zip(entries)
    body=''.b;central=''.b
    entries.each do |name,bytes|
      crc=Zlib.crc32(bytes);offset=body.bytesize;raw=name.b
      body << [0x04034b50,20,0,0,0,0,crc,bytes.bytesize,bytes.bytesize,raw.bytesize,0].pack('VvvvvvVVVvv') << raw << bytes
      central << [0x02014b50,20,20,0,0,0,0,crc,bytes.bytesize,bytes.bytesize,raw.bytesize,0,0,0,0,0,offset].pack('VvvvvvvVVVvvvvvVV') << raw
    end
    body+central+[0x06054b50,0,0,entries.length,entries.length,central.bytesize,body.bytesize,0].pack('VvvvvVVv')
  end
  class Model
    attr_reader :materials
    def initialize;@materials=[];end
    def start_operation(*_args);true;end
    def commit_operation;true;end
    def abort_operation;true;end
  end
end

class MaterialPackageTest < Minitest::Test
  def setup
    @source=Dir.mktmpdir;@target=Dir.mktmpdir;@out=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@source)
    write=lambda do |folder,bytes,extension|
      hash=Digest::SHA256.hexdigest(bytes);FileUtils.mkdir_p(File.join(@source,folder))
      File.binwrite(File.join(@source,folder,"#{hash}#{extension}"),bytes);hash
    end
    @skm_bytes=PackageFixture.skm('Canto QA');skm_hash=write.call('skm-import-assets',@skm_bytes,'.skm')
    @edge=@catalog.new_item('Canto QA','edge',{'source'=>'skm-import','skm'=>{'sha256'=>skm_hash,'sourceName'=>'Canto QA.skm'}}).merge('thicknessMm'=>0.45,'widthMm'=>22)
    image=write.call('photo-assets',PackageFixture::PNG+'IMAGE'.b,'.png');thumb=write.call('photo-assets',PackageFixture::PNG+'THUMB'.b,'.png')
    design=write.call('material-assets',PackageFixture.skm('Roble foto'),'.skm')
    photo={'schema'=>1,'designReady'=>true,'sourceHash'=>image,'imageAsset'=>"#{image}.png",'thumbnailAsset'=>"#{thumb}.png",'skmHash'=>design,
           'textureScale'=>{'verified'=>false,'widthMm'=>nil,'heightMm'=>nil},'widthPx'=>2,'heightPx'=>2}
    @sheet=@catalog.new_item('Roble foto','sheet',{'source'=>'photo','photo'=>photo}).merge('sku'=>'R18','supplier'=>'QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2600,'grain'=>true,'approved'=>true,'compatibleIds'=>[@edge['id']])
    @archived=@catalog.new_item('Viejo','unknown')
    @catalog.save([@sheet,@edge,@archived],0)
    @library=PlanosSanto::MaterialLibrary.new(PackageFixture::Model.new,catalog:@catalog,directory:@source)
    @library.archive_items('catalogIds'=>[@archived['id']],'archived'=>true,'revision'=>1,'confirmed'=>true)
    @package=PlanosSanto::MaterialPackage.new(library:@library,catalog:@catalog,directory:@source)
    @target_catalog=PlanosSanto::CatalogStore.new(directory:@target)
    @target_library=PlanosSanto::MaterialLibrary.new(PackageFixture::Model.new,catalog:@target_catalog,directory:@target)
    @importer=PlanosSanto::MaterialPackage.new(library:@target_library,catalog:@target_catalog,directory:@target)
  end
  def teardown;[@source,@target,@out].each { |dir| FileUtils.remove_entry(dir) };end
  def export(**options);path=File.join(@out,"lote-#{SecureRandom.hex(4)}.zip");[@package.export(path,**options),path];end
  def tamper(path)
    zip=PlanosSanto::BoundedZip.new(File.binread(path),max_entries:2048)
    entries=zip.entries.map { |entry| [entry.name,zip.read(entry)] }
    yield entries
    File.binwrite(path,PackageFixture.raw_zip(entries))
  end

  def test_round_trip_exports_active_items_with_files_and_imports_pending_with_new_ids
    result,path=export
    assert_equal 2,result['items'];assert_equal 4,result['files']
    assert_equal Digest::SHA256.file(path).hexdigest,result['sha256']
    names=PlanosSanto::BoundedZip.new(File.binread(path),max_entries:2048).entries.map(&:name)
    assert_includes names,'manifest.json'
    assert names.all? { |name| name=='manifest.json' || name.match?(%r{\A(photo-assets|material-assets|skm-import-assets)/[0-9a-f]{64}\.(png|skm)\z}) }
    preview=@importer.preview(path)
    assert_equal %w[new new],preview['rows'].map { |row| row['status'] }
    assert preview['rows'].find { |row| row['name']=='Roble foto' }['thumbnail'].start_with?('data:image/png;base64,')
    assert_equal 2,preview['package']['items']
    committed=@importer.commit(preview['token'],preview['rows'].map { |row| row['id'] },preview['revision'],confirmed:true)
    assert_equal 2,committed['imported']
    items=@target_catalog.read['items']
    sheet=items.find { |item| item['name']=='Roble foto' };edge=items.find { |item| item['name']=='Canto QA' }
    refute_equal @sheet['id'],sheet['id'];refute sheet['approved']
    assert_equal [edge['id']],sheet['compatibleIds']
    assert_equal 'R18',sheet['sku']
    assert PlanosSanto::MaterialPolicy.paintable?(sheet,directory:@target)
    assert PlanosSanto::MaterialPolicy.paintable?(edge,directory:@target)
    refute items.any? { |item| item['name']=='Viejo' }
  end

  def test_reimport_marks_duplicates_and_name_conflicts_need_rename
    _result,path=export
    preview=@package.preview(path)
    assert_equal %w[duplicate duplicate],preview['rows'].map { |row| row['status'] }
    @package.cancel
    changed=@catalog.read['items'].map { |item| item['id']==@edge['id'] ? item.merge('sku'=>'OTRO') : item }
    @catalog.save(changed,@catalog.read['revision'])
    preview=@package.preview(path)
    row=preview['rows'].find { |candidate| candidate['name']=='Canto QA' }
    assert_equal 'conflict',row['status']
    assert_raises(PlanosSanto::ExportError) { @package.commit(preview['token'],[row['id']],preview['revision'],confirmed:true) }
    result=@package.commit(preview['token'],[row['id']],preview['revision'],confirmed:true,renames:{row['id']=>'Canto QA importado'})
    assert_equal 1,result['imported']
    assert @catalog.read['items'].any? { |item| item['name']=='Canto QA importado' && !item['approved'] }
  end

  def test_changed_measure_lists_in_package_require_conflict_resolution_and_keep_both_versions
    [[@sheet['id'],'thicknessesMm',[36,18]],[@edge['id'],'widthsMm',[64,45,22]]].each do |id,field,values|
      original=@catalog.read['items'].find { |item| item['id']==id }
      _result,path=export(catalog_ids:[id])
      tamper(path) do |entries|
        manifest=entries.find { |name,_| name=='manifest.json' }
        data=JSON.parse(manifest[1]);data['items'].first[field]=values
        manifest[1]=JSON.generate(data)
      end
      preview=@package.preview(path);row=preview['rows'].first
      assert_equal 'conflict',row['status'],field
      assert_raises(PlanosSanto::ExportError) { @package.commit(preview['token'],[row['id']],preview['revision'],confirmed:true) }
      assert_equal original,@catalog.read['items'].find { |item| item['id']==id },'El conflicto no modifica la ficha local'
      name=original['name']+' ampliado'
      result=@package.commit(preview['token'],[row['id']],preview['revision'],confirmed:true,renames:{row['id']=>name})
      assert_equal 1,result['imported']
      imported=@catalog.read['items'].find { |item| item['name']==name }
      assert_equal values.sort,imported[field]
      refute imported['approved']
      assert_equal original,@catalog.read['items'].find { |item| item['id']==id },'La versión original permanece intacta'
    end
  end

  def test_package_deduplicates_equivalent_measure_lists_after_normalization
    _result,path=export
    tamper(path) do |entries|
      manifest=entries.find { |name,_| name=='manifest.json' };data=JSON.parse(manifest[1])
      data['items'].each do |item|
        %w[thicknessesMm widthsMm].each do |field|
          list=item[field];item[field]=list.reverse.map(&:to_f)+list.first(1)
        end
      end
      manifest[1]=JSON.generate(data)
    end
    assert_equal %w[duplicate duplicate],@package.preview(path)['rows'].map { |row| row['status'] }
  end

  def test_subset_export_prunes_compatibility_outside_package_and_can_include_archived
    result,path=export(catalog_ids:[@sheet['id']])
    assert_equal 1,result['items']
    preview=@importer.preview(path)
    @importer.commit(preview['token'],preview['rows'].map { |row| row['id'] },preview['revision'],confirmed:true)
    assert_equal [],@target_catalog.read['items'].first['compatibleIds']
    all,=export(include_archived:true)
    assert_equal 3,all['items']
  end

  def test_export_refuses_existing_file_and_wrong_extension
    path=File.join(@out,'existe.zip');File.binwrite(path,'x')
    assert_raises(PlanosSanto::ExportError) { @package.export(path) }
    assert_equal 'x',File.binread(path)
    assert_raises(PlanosSanto::ExportError) { @package.export(File.join(@out,'lote.json')) }
  end

  def test_rejects_tampered_hash_unknown_paths_and_traversal
    cases={
      'hash'=>lambda { |entries| entries.find { |name,_| name.start_with?('photo-assets/') }[1] << 'X' },
      'script'=>lambda { |entries| entries << ['scripts/run.rb','puts 1'] },
      'traversal'=>lambda { |entries| entries << ['../material-assets/x.skm','x'] },
      'absolute'=>lambda { |entries| entries << ['/etc/passwd','x'] },
      'unlisted'=>lambda { |entries| bytes='EXTRA';entries << ["photo-assets/#{Digest::SHA256.hexdigest(bytes)}.png",bytes] },
      'no-manifest'=>lambda { |entries| entries.reject! { |name,_| name=='manifest.json' } },
      'manifest-keys'=>lambda { |entries| row=entries.find { |name,_| name=='manifest.json' };data=JSON.parse(row[1]);data['run']='x';row[1]=JSON.generate(data) },
      'bytes'=>lambda { |entries| row=entries.find { |name,_| name=='manifest.json' };data=JSON.parse(row[1]);data['files'][0]['bytes']+=1;row[1]=JSON.generate(data) },
      'bad-skm'=>lambda { |entries| row=entries.find { |name,_| name.start_with?('skm-import-assets/') };bytes='NOT-A-ZIP';row[0]="skm-import-assets/#{Digest::SHA256.hexdigest(bytes)}.skm";row[1]=bytes
                          manifest=entries.find { |name,_| name=='manifest.json' };data=JSON.parse(manifest[1]);file=data['files'].find { |f| f['path'].start_with?('skm-import-assets/') }
                          file.merge!('path'=>row[0],'sha256'=>Digest::SHA256.hexdigest(bytes),'bytes'=>bytes.bytesize);manifest[1]=JSON.generate(data) }
    }
    cases.each do |label,mutation|
      _result,path=export
      tamper(path,&mutation)
      error=assert_raises(PlanosSanto::ExportError,label) { @importer.preview(path) }
      refute_empty error.message,label
    end
    assert_equal 0,@target_catalog.read['items'].length
    refute Dir.exist?(File.join(@target,'photo-assets'))
  end

  def test_rejects_symlink_and_non_zip_selection
    _result,path=export
    link=File.join(@out,'enlace.zip');File.symlink(path,link)
    assert_raises(PlanosSanto::ExportError) { @importer.preview(link) }
    other=File.join(@out,'lote.txt');FileUtils.cp(path,other)
    assert_raises(PlanosSanto::ExportError) { @importer.preview(other) }
  end

  def test_commit_requires_confirmation_fresh_token_and_rolls_back_files_on_failure
    _result,path=export
    preview=@importer.preview(path)
    ids=preview['rows'].map { |row| row['id'] }
    assert_raises(PlanosSanto::ExportError) { @importer.commit(preview['token'],ids,preview['revision']) }
    assert_raises(PlanosSanto::ExportError) { @importer.commit('otro',ids,preview['revision'],confirmed:true) }
    @target_library.define_singleton_method(:publish_catalog_locked) { |*_args| raise PlanosSanto::ExportError,'fallo sintético' }
    assert_raises(PlanosSanto::ExportError) { @importer.commit(preview['token'],ids,preview['revision'],confirmed:true) }
    assert_equal 0,@target_catalog.read['items'].length
    assert_empty Dir.glob(File.join(@target,'*-assets','*'))
  end

  def test_existing_damaged_asset_in_target_is_never_overwritten
    _result,path=export
    folder=File.join(@target,'skm-import-assets');FileUtils.mkdir_p(folder)
    damaged=File.join(folder,"#{@edge['observed']['skm']['sha256']}.skm");File.binwrite(damaged,'DANADO')
    preview=@importer.preview(path)
    assert_raises(PlanosSanto::ExportError) { @importer.commit(preview['token'],preview['rows'].map { |row| row['id'] },preview['revision'],confirmed:true) }
    assert_equal 'DANADO',File.binread(damaged)
    assert_equal 0,@target_catalog.read['items'].length
  end

  def manifest_mutation(path)
    tamper(path) do |entries|
      row=entries.find { |name,_| name=='manifest.json' };data=JSON.parse(row[1]);yield data;row[1]=JSON.generate(data)
    end
  end

  def test_hostile_observed_metadata_is_rejected_before_it_reaches_the_catalog
    mutations={
      'photo-scale'=>lambda { |data| data['items'].find { |item| item['observed']['photo'] }['observed']['photo']['textureScale']='x' },
      'skm-provenance'=>lambda { |data| data['items'].find { |item| item['observed']['skm'] }['observed']['skm']['sourceName']='../x.skm' },
      'huge-observed'=>lambda { |data| data['items'].first['observed']['nota']='x'*20_000 },
      'many-compatible'=>lambda { |data| data['items'].first['compatibleIds']=Array.new(300) { SecureRandom.uuid } }
    }
    mutations.each do |label,mutation|
      _result,path=export
      manifest_mutation(path,&mutation)
      assert_raises(PlanosSanto::ExportError,label) { @importer.preview(path) }
    end
    _result,path=export
    tamper(path) { |entries| row=entries.find { |name,_| name=='manifest.json' };row[1]=row[1].sub('"schema": 1','"schema": 1,"n":1e999') }
    assert_raises(PlanosSanto::ExportError) { @importer.preview(path) }
    _result,path=export
    tamper(path) { |entries| row=entries.find { |name,_| name=='manifest.json' };row[1]=row[1].sub('"schema": 1','"schema": 1'+('0'*50)) }
    assert_raises(PlanosSanto::ExportError) { @importer.preview(path) }
    assert_equal 0,@target_catalog.read['items'].length
  end

  def test_many_items_preview_stays_fast
    _result,path=export
    manifest_mutation(path) do |data|
      base=data['items'].find { |item| item['kind']=='edge' }
      data['items']=Array.new(3000) { |i| base.merge('id'=>SecureRandom.uuid,'name'=>"Canto #{i}",'sourceHash'=>Digest::SHA256.hexdigest(i.to_s)) }
      data['visualRecords']=[]
    end
    started=Process.clock_gettime(Process::CLOCK_MONOTONIC)
    preview=@importer.preview(path)
    assert_equal 3000,preview['rows'].length
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC)-started,:<,5
  end

  def test_photo_thumbnail_with_absurd_dimensions_is_not_sent_to_the_page
    huge="\x89PNG\r\n\x1a\n".b+[13].pack('N')+'IHDR'+[60_000,60_000,8,6,0,0,0].pack('NNCCCCC')+'X'.b
    hash=Digest::SHA256.hexdigest(huge);File.binwrite(File.join(@source,'photo-assets',"#{hash}.png"),huge)
    items=@catalog.read['items'].map { |item| item['id']==@sheet['id'] ? item.merge('observed'=>item['observed'].merge('photo'=>item['observed']['photo'].merge('thumbnailAsset'=>"#{hash}.png"))) : item }
    @catalog.save(items,@catalog.read['revision'])
    _result,path=export
    row=@importer.preview(path)['rows'].find { |candidate| candidate['name']=='Roble foto' }
    assert_nil row['thumbnail']
  end

  def test_rollback_cleans_files_when_index_write_fails
    index={'schema'=>1,'revision'=>0,'records'=>[]}
    sheet=@catalog.read['items'].find { |item| item['id']==@sheet['id'] }
    index['records'] << {'catalogId'=>sheet['id'],'catalogFingerprint'=>PlanosSanto::MaterialResolver.item_fingerprint(sheet),'assetName'=>"#{sheet['observed']['photo']['skmHash']}.skm",'assetHash'=>sheet['observed']['photo']['skmHash'],'sourceName'=>'Roble'}
    File.write(File.join(@source,'material-assets.json'),JSON.generate(index))
    _result,path=export
    preview=@importer.preview(path)
    @target_library.define_singleton_method(:write_index) { |_index| raise IOError,'disco lleno sintético' }
    assert_raises(IOError) { @importer.commit(preview['token'],preview['rows'].map { |row| row['id'] },preview['revision'],confirmed:true) }
    assert_empty Dir.glob(File.join(@target,'*-assets','*'))
    assert_equal 0,@target_catalog.read['items'].length
  end
end
