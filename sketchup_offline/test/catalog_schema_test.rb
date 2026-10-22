# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require 'digest'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../catalog_store'
require_relative '../material_resolver'

# Hito 4 · F-MAT-D: esquema 2 de la biblioteca, migración explícita v1→v2 con
# respaldo previo verificado y rechazo de archivos dañados sin tocarlos.
class CatalogSchemaTest < Minitest::Test
  V1_FIELDS=%w[id name kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds price favorite approved updatedAt sourceHash observed].freeze
  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::CatalogStore.new(directory:@dir);@path=File.join(@dir,'catalog.json')
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def v1_item(name,kind,extra={})
    {'id'=>SecureRandom.uuid,'name'=>name,'kind'=>kind,'sku'=>'','supplier'=>'','thicknessMm'=>nil,'widthMm'=>nil,'lengthMm'=>nil,'grain'=>nil,
     'compatibleIds'=>[],'price'=>nil,'favorite'=>false,'approved'=>false,'updatedAt'=>'2026-10-01T00:00:00Z','sourceHash'=>'a'*64,'observed'=>{'source'=>'manual'}}.merge(extra)
  end
  def v1_library
    edge=v1_item('Canto blanco 22x0,45','edge','sku'=>'CB22','supplier'=>'Maderera QA','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true)
    sheet=v1_item('Melamina blanca 18','sheet','sku'=>'MB18','supplier'=>'Maderera QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true,
      'compatibleIds'=>[edge['id']],'favorite'=>true,'price'=>{'amount'=>95000,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista QA'})
    {'schema'=>1,'revision'=>7,'items'=>[sheet,edge,v1_item('Pendiente','unknown')]}
  end
  def write(data);File.write(@path,data.is_a?(String) ? data : JSON.pretty_generate(data));File.binread(@path);end
  def backups;Dir[File.join(@dir,'backups','*.json')];end

  def test_new_library_is_schema_2_with_new_fields
    item=@store.new_item('Melamina','sheet')
    assert_equal 2,@store.empty['schema']
    assert_equal PlanosSanto::CatalogStore::FIELDS.sort,item.keys.sort
    assert_nil item['variantOf'];assert_equal '',item['notes'];assert_nil item['suggested']
    saved=@store.save([item],0);assert_equal 2,saved['schema'];assert_equal 2,JSON.parse(File.read(@path))['schema']
  end

  def test_v1_reads_migrated_in_memory_without_touching_the_file
    original=write(v1_library)
    data=@store.read
    assert_equal 2,data['schema'];assert_equal 7,data['revision'];assert_equal 3,data['items'].length
    data['items'].each { |row| assert_equal PlanosSanto::CatalogStore::FIELDS.sort,row.keys.sort;assert_nil row['variantOf'];assert_equal '',row['notes'];assert_nil row['suggested'] }
    v1_library_rows=JSON.parse(original)['items']
    data['items'].zip(v1_library_rows).each { |migrated,old| V1_FIELDS.each { |key| old[key].nil? ? assert_nil(migrated[key],key) : assert_equal(old[key],migrated[key],key) } }
    assert_equal original,File.binread(@path),'Leer no reescribe la biblioteca v1.'
    assert_empty backups
    assert_equal({'from'=>1,'to'=>2,'pending'=>true},@store.migration)
  end

  def test_migration_preserves_native_binding_fingerprints
    write(v1_library);before=JSON.parse(File.read(@path))['items'].map { |row| PlanosSanto::MaterialResolver.item_fingerprint(row) }
    assert_equal before,@store.read['items'].map { |row| PlanosSanto::MaterialResolver.item_fingerprint(row) }
  end

  def test_first_save_writes_verified_premigration_backup_then_schema_2
    original=write(v1_library)
    items=@store.read['items'];items[2]['notes']='Revisar con el proveedor'
    saved=@store.save(items,7)
    assert_equal 2,saved['schema'];assert_equal 8,saved['revision']
    stored=JSON.parse(File.read(@path));assert_equal 2,stored['schema'];assert_equal 3,stored['items'].length
    premigration=backups.select { |path| File.basename(path).start_with?('catalog-v1-premigracion-7-') }
    assert_equal 1,premigration.length,'Respaldo explícito de la versión 1.'
    assert_equal Digest::SHA256.hexdigest(original),Digest::SHA256.file(premigration.first).hexdigest
    assert_nil @store.migration
    # Later saves use the ordinary backup naming again.
    @store.save(@store.read['items'],8)
    assert_equal 1,backups.count { |path| File.basename(path).include?('premigracion') }
    assert_equal 2,backups.length
  end

  def test_damaged_files_are_rejected_untouched_and_without_backup
    cases={
      'json roto'=>'{"schema":1,',
      'esquema futuro'=>JSON.generate('schema'=>3,'revision'=>0,'items'=>[]),
      'esquema texto'=>JSON.generate('schema'=>'2','revision'=>0,'items'=>[]),
      'no es objeto'=>JSON.generate([1,2]),
      'clave extra arriba'=>JSON.generate(v1_library.merge('extra'=>true)),
      'v1 con campo v2'=>JSON.generate(v1_library.tap { |d| d['items'][0]['notes']='x' }),
      'v1 sin campo'=>JSON.generate(v1_library.tap { |d| d['items'][0].delete('observed') }),
      'v1 ids duplicados'=>JSON.generate(v1_library.tap { |d| d['items'][1]['id']=d['items'][0]['id'] }),
      'v2 sin campos nuevos'=>JSON.generate(v1_library.merge('schema'=>2)),
      'v2 variante inexistente'=>JSON.generate(@store.empty.merge('items'=>[@store.new_item('A','sheet').merge('variantOf'=>SecureRandom.uuid)])),
      'v2 sugerencia mal formada'=>JSON.generate(@store.empty.merge('items'=>[@store.new_item('A','sheet').merge('suggested'=>{'source'=>'preset'})])),
      'v2 notas con control'=>JSON.generate(@store.empty.merge('items'=>[@store.new_item('A','sheet').merge('notes'=>"a\u0000b")])),
      'revisión negativa'=>JSON.generate(v1_library.merge('revision'=>-1)),
      'esquema decimal'=>JSON.generate(v1_library.merge('schema'=>1.0)).sub('"schema":1,','"schema":1.0,'),
      'v0 con filas no objeto'=>JSON.generate('schema'=>0,'materials'=>[1,nil]),
      'utf8 inválido'=>"{\"schema\":2,\"revision\":0,\"items\":[\"\xff\"]}".b
    }
    cases.each do |label,content|
      bytes=write(content)
      error=assert_raises(PlanosSanto::ExportError,label) { @store.read }
      refute_empty error.message,label
      assert_raises(PlanosSanto::ExportError,label) { @store.save([],0) }
      assert_equal bytes,File.binread(@path),"#{label}: el archivo dañado no se toca."
      assert_empty backups,"#{label}: sin respaldo de un archivo dañado."
    end
  end

  def test_filesystem_errors_are_export_errors_and_leave_no_partial_backup
    Dir.mkdir(@path)
    assert_raises(PlanosSanto::ExportError) { @store.read }
    Dir.rmdir(@path);original=write(v1_library)
    File.write(File.join(@dir,'backups'),'no soy carpeta')
    assert_raises(PlanosSanto::ExportError) { @store.save(@store.read['items'],7) }
    assert_equal original,File.binread(@path)
    File.delete(File.join(@dir,'backups'))
    @store.save(@store.read['items'],7)
    assert_empty Dir[File.join(@dir,'backups','.*.tmp')]
  end

  def test_malformed_import_payloads_are_rejected_cleanly
    [{'items'=>[1]},{'schema'=>'planos-santo.material-review.v1'},{'schema'=>'planos-santo.material-review.v1','materials'=>[1]},{'items'=>[[]]}].each do |payload|
      assert_raises(PlanosSanto::ExportError,payload.inspect) { @store.import(payload,0) }
    end
    huge={'schema'=>'planos-santo.material-review.v1','materials'=>[{'name'=>'Canto raro','category'=>'edge','attributes_observed'=>{'thickness'=>1_000_000_000}}]}
    assert_nil @store.import(huge,0)['items'].first['thicknessMm']
  end

  def test_price_amount_is_bounded
    item=@store.new_item('Melamina','sheet').merge('price'=>{'amount'=>1e10,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista'})
    assert_raises(PlanosSanto::ExportError) { @store.save([item],0) }
    @store.save([item.merge('price'=>item['price'].merge('amount'=>1e9))],0)
  end

  def test_future_schema_message_does_not_suggest_restoring
    write(JSON.generate('schema'=>3,'revision'=>0,'items'=>[]))
    assert_match(/más nuevo/,assert_raises(PlanosSanto::ExportError) { @store.read }.message)
  end

  def test_oversized_file_rejected_without_parsing
    File.write(@path,' '*(PlanosSanto::CatalogStore::MAX_BYTES+1))
    assert_raises(PlanosSanto::ExportError) { @store.read }
  end

  def test_v2_rules_variant_kind_suggestion_and_approval
    base=@store.new_item('Melamina 18','sheet');variant=@store.new_item('Melamina 15','sheet').merge('variantOf'=>base['id'])
    @store.save([base,variant],0)
    edge=@store.new_item('Canto','edge').merge('variantOf'=>base['id'])
    assert_raises(PlanosSanto::ExportError) { @store.save([base,variant,edge],1) } # distinto tipo
    chained=@store.new_item('Melamina 25','sheet').merge('variantOf'=>variant['id'])
    assert_raises(PlanosSanto::ExportError) { @store.save([base,variant,chained],1) } # sin cadenas
    own=@store.new_item('Melamina sola','sheet');own['variantOf']=own['id']
    assert_raises(PlanosSanto::ExportError) { @store.save([own],1) }
    suggested=@store.new_item('Canto 22','edge').merge('suggested'=>{'source'=>'preset','fields'=>%w[widthMm thicknessMm],'presetId'=>'canto-22x045'})
    @store.save([base,variant,suggested],1)
    # 0.8.16: las sugerencias ya no bloquean nada. Una ficha «aprobada» con sugerencias (que 0.8.15 rechazaba)
    # se guarda sin la marca, para que una versión anterior siga pudiendo leer el archivo.
    approved=suggested.merge('sku'=>'C22','supplier'=>'QA','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true)
    saved=@store.save([base,variant,approved],2);refute saved['items'][2]['approved'];assert_equal 'preset',saved['items'][2]['suggested']['source']
    legacy=@store.save([base,variant,approved.merge('suggested'=>nil)],3);assert legacy['items'][2]['approved'],'Una marca que 0.8.15 aceptaba se conserva tal cual'
    bad_field=suggested.merge('suggested'=>{'source'=>'preset','fields'=>%w[price],'presetId'=>nil})
    assert_raises(PlanosSanto::ExportError) { @store.save([bad_field],4) }
    bad_source=suggested.merge('suggested'=>{'source'=>'internet','fields'=>[],'presetId'=>nil})
    assert_raises(PlanosSanto::ExportError) { @store.save([bad_source],4) }
  end
  def test_import_accepts_v1_and_v2_exports_unapproved_without_foreign_links
    v1=v1_library
    imported=@store.import(v1,0)
    assert_equal 2,imported['schema'];assert_equal 3,imported['items'].length
    assert imported['items'].none? { |row| row['approved'] }
    assert imported['items'].all? { |row| row['compatibleIds'].empty? && row['variantOf'].nil? }
    export=File.join(@dir,'copia.json');@store.export(export)
    again=@store.import(JSON.parse(File.read(export)),1)
    assert_equal 3,again['items'].length,'Reimportar la misma copia v2 es idempotente.'
    broken=JSON.parse(File.read(export));broken['items'][0].delete('notes')
    assert_raises(PlanosSanto::ExportError) { @store.import(broken,2) }
  end

  def test_model_import_preloads_ocl_measures_as_unapproved_suggestions
    review={'schema'=>'planos-santo.material-review.v1','materials'=>[
      {'name'=>'Melamina OCL','category'=>'sheet','attributes_observed'=>{'type'=>2,'std_thicknesses'=>'18mm','std_sizes'=>'2750mm x 1830mm','grained'=>false}},
      {'name'=>'Canto OCL','category'=>'edge','attributes_observed'=>{'type'=>4,'thickness'=>'0.45mm','std_widths'=>'22mm'}},
      {'name'=>'Ambigua OCL','category'=>'sheet','attributes_observed'=>{'type'=>2,'std_thicknesses'=>'15mm;18mm','std_sizes'=>'96" x 48"'}},
      {'name'=>'Herraje','category'=>'hardware','attributes_observed'=>{}}]}
    items=@store.import(review,0)['items']
    sheet=items.find { |row| row['name']=='Melamina OCL' };edge=items.find { |row| row['name']=='Canto OCL' };ambiguous=items.find { |row| row['name']=='Ambigua OCL' }
    assert_equal [18.0,2750.0,1830.0,false],sheet.values_at('thicknessMm','lengthMm','widthMm','grain')
    assert_equal({'source'=>'ocl','fields'=>%w[grain lengthMm thicknessMm widthMm],'presetId'=>nil},sheet['suggested'])
    assert_equal [0.45,22.0],edge.values_at('thicknessMm','widthMm')
    assert_equal({'source'=>'ocl','fields'=>%w[thicknessMm widthMm],'presetId'=>nil},edge['suggested'])
    assert_equal [nil,nil,nil],ambiguous.values_at('thicknessMm','lengthMm','widthMm'),'Valores múltiples o en pulgadas no se adivinan.'
    assert_nil ambiguous['suggested']
    assert items.none? { |row| row['approved'] };assert_equal 3,items.length
  end
  def test_ficha_is_complete_or_names_what_it_lacks
    sheet=@store.new_item('Melamina','sheet')
    assert_equal %w[SKU espesor largo ancho veta],PlanosSanto::CatalogStore.missing(sheet)
    sheet.merge!('sku'=>'MB18','thicknessMm'=>18,'lengthMm'=>2750,'widthMm'=>1830,'grain'=>false)
    assert PlanosSanto::CatalogStore.complete?(sheet),'Sin proveedor ni aprobación la placa ya está completa'
    assert_equal ['veta'],PlanosSanto::CatalogStore.missing(sheet.merge('grain'=>nil))
    assert_equal ['SKU'],PlanosSanto::CatalogStore.missing(sheet.merge('sku'=>'   '))
    assert_equal ['espesor'],PlanosSanto::CatalogStore.missing(sheet.merge('thicknessMm'=>'18'))
    edge=@store.new_item('Canto','edge')
    assert_equal ['ancho'],PlanosSanto::CatalogStore.missing(edge);assert PlanosSanto::CatalogStore.complete?(edge.merge('widthMm'=>22)),'Canto: alcanza con el ancho'
    assert_equal ['tipo'],PlanosSanto::CatalogStore.missing(@store.new_item('Herraje','unknown'))
    refute PlanosSanto::CatalogStore.complete?(@store.new_item('Pino','solid_wood'))
  end
  def test_a_real_0815_v2_catalog_keeps_its_data_and_approval_marks_never_block_saving
    # Catálogo v2 tal como lo escribía 0.8.15: fichas aprobadas, una sugerida sin aprobar y una variante.
    edge=v1_item('Canto blanco 22x0,45','edge','sku'=>'CB22','supplier'=>'Maderera QA','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true).merge('variantOf'=>nil,'notes'=>'','suggested'=>nil)
    sheet=v1_item('Melamina blanca 18','sheet','sku'=>'MB18','supplier'=>'Maderera QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true,'compatibleIds'=>[edge['id']]).merge('variantOf'=>nil,'notes'=>'Lista octubre','suggested'=>nil)
    variant=v1_item('Melamina blanca 15','sheet','supplier'=>'Maderera QA','thicknessMm'=>15,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'compatibleIds'=>[edge['id']]).merge('variantOf'=>sheet['id'],'notes'=>'','suggested'=>{'source'=>'variant','fields'=>%w[compatibleIds grain lengthMm supplier widthMm],'presetId'=>nil})
    original=write({'schema'=>2,'revision'=>12,'items'=>[sheet,edge,variant]})
    data=@store.read
    assert_equal JSON.parse(original),data,'Se lee sin migrar ni reescribir nada'
    assert_equal [true,true,false],data['items'].map { |row| PlanosSanto::CatalogStore.complete?(row) },'La variante sin SKU queda incompleta'
    assert_equal [sheet['compatibleIds'],variant['suggested']],[data['items'][0]['compatibleIds'],data['items'][2]['suggested']],'Compatibilidades y procedencia se conservan aunque ya no se usen'
    # Al vaciar el proveedor de una ficha aprobada, 0.8.15 la rechazaba: ahora se guarda y la marca cae para que el archivo siga siendo legible por 0.8.15.
    items=data['items'];items[0]['supplier']='';items[2]['sku']='MB15'
    saved=@store.save(items,12)
    assert_equal [false,true,false],saved['items'].map { |row| row['approved'] }
    assert saved['items'].select { |row| row['approved'] }.all? { |row| PlanosSanto::CatalogStore.legacy_approved?(row) }
    assert_equal [true,true,true],saved['items'].map { |row| PlanosSanto::CatalogStore.complete?(row) }
    assert_equal saved,@store.read;assert_equal 1,backups.length
  end
end
