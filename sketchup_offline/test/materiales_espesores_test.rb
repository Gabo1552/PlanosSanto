# frozen_string_literal: true
# 0.8.20 (pedido de Gabriel, 23/10): biblioteca v4. Una placa vale para todos los espesores de su lista (ninguno es
# «el» espesor); el despiece separa por el espesor real de la pieza. Un canto tiene anchos estándar (22 y 45 mm) que
# nunca generan avisos rojos: se refila. Datos sintéticos: sin SKU ni precios reales, sin SketchUp.
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require 'digest'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../catalog_store'
require_relative '../material_resolver'
require_relative '../material_library'
require_relative '../ocl_attributes'

class MaterialesEspesoresTest < Minitest::Test
  Store=PlanosSanto::CatalogStore
  def setup
    @dir=Dir.mktmpdir;@store=Store.new(directory:@dir);@path=File.join(@dir,'catalog.json')
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def backups;Dir[File.join(@dir,'backups','*.json')];end
  # Ficha tal como la escribía 0.8.17-0.8.19 (esquema 3): espesor elegido dentro de la lista y ancho suelto del canto.
  def v3_item(name,kind,extra={})
    {'id'=>SecureRandom.uuid,'name'=>name,'kind'=>kind,'sku'=>'','supplier'=>'','thicknessMm'=>nil,'widthMm'=>nil,'lengthMm'=>nil,'grain'=>nil,
     'compatibleIds'=>[],'price'=>nil,'favorite'=>false,'approved'=>false,'updatedAt'=>'2026-10-20T00:00:00Z','sourceHash'=>'b'*64,
     'observed'=>{'source'=>'manual'},'variantOf'=>nil,'notes'=>'','suggested'=>nil,'thicknessesMm'=>[]}.merge(extra)
  end
  def v3_library
    edge=v3_item('Canto blanco sintético','edge','sku'=>'SINT-C','thicknessMm'=>0.45,'thicknessesMm'=>[0.45,2],'widthMm'=>19)
    sheet=v3_item('Melamina blanca sintética','sheet','sku'=>'SINT-M','thicknessMm'=>16,'thicknessesMm'=>[3,5,12,15,16,18,25],'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'compatibleIds'=>[edge['id']])
    loose=v3_item('Placa sin elegir','sheet','thicknessesMm'=>[15,18])
    {'schema'=>3,'revision'=>5,'items'=>[sheet,edge,loose,v3_item('Perfil','dimensional','thicknessMm'=>9,'thicknessesMm'=>[9])]}
  end

  def test_v3_library_migrates_to_v4_with_backup_keeping_every_thickness_and_width
    original=JSON.pretty_generate(v3_library);File.write(@path,original)
    fingerprints=JSON.parse(original)['items'].map { |row| PlanosSanto::MaterialResolver.item_fingerprint(row) }
    data=@store.read
    assert_equal 4,data['schema']
    sheet,edge,loose,profile=data['items']
    assert_equal [nil,[3,5,12,15,16,18,25],[]],sheet.values_at('thicknessMm','thicknessesMm','widthsMm'),'La placa conserva su 16 dentro de la lista y deja de tener «el» espesor'
    assert_equal [0.45,[0.45,2],nil,[19,22,45]],edge.values_at('thicknessMm','thicknessesMm','widthMm','widthsMm'),'El canto conserva su espesor y su ancho viejo entra con 22 y 45'
    assert_equal [nil,[15,18]],loose.values_at('thicknessMm','thicknessesMm')
    assert_equal [9,[9],[]],profile.values_at('thicknessMm','thicknessesMm','widthsMm'),'Otros tipos no cambian'
    assert_equal [1830,2750,false,'SINT-M'],sheet.values_at('widthMm','lengthMm','grain','sku'),'El formato de la placa no se toca'
    data['items'].zip(fingerprints).each { |row,fingerprint| assert PlanosSanto::MaterialResolver.fingerprint_current?(row,fingerprint),"#{row['name']}: el vínculo con el modelo sigue vigente" }
    assert_equal original.b,File.binread(@path),'Leer no reescribe el archivo v3'
    assert_equal({'from'=>3,'to'=>4,'pending'=>true},@store.migration)
    @store.save(data['items'],5)
    premigration=backups.select { |path| File.basename(path).start_with?('catalog-v3-premigracion-5-') }
    assert_equal 1,premigration.length,'Copia de seguridad explícita antes de la primera escritura v4'
    assert_equal original.b,File.binread(premigration.first)
    assert_nil @store.migration
    # Idempotente: releer y volver a guardar no cambia nada ni genera otra copia de premigración.
    again=@store.read
    assert_equal data['items'],again['items']
    assert_equal again['items'],again['items'].map { |row| Store.upgrade_row(row) }
    @store.save(again['items'],6)
    assert_equal 1,backups.count { |path| File.basename(path).include?('premigracion') }
    assert_equal data['items'],@store.read['items']
  end

  def test_a_sheet_has_no_single_thickness_and_any_listed_one_is_valid
    item=@store.new_item('Melamina sintética','sheet')
    assert_nil item['thicknessMm'];assert_equal [3,5,12,15,18,25],item['thicknessesMm']
    saved=@store.save([item.merge('thicknessMm'=>36)],0)['items'].first
    assert_equal [nil,[3,5,12,15,18,25,36]],saved.values_at('thicknessMm','thicknessesMm'),'Un espesor suelto (ventana vieja, foto, OCL) entra en la lista'
    [15,18,36].each { |value| assert Store.in_list?(saved['thicknessesMm'],value) }
    assert Store.in_list?(saved['thicknessesMm'],17.999),'La geometría lee 17,999 para 18'
    refute Store.in_list?(saved['thicknessesMm'],16)
    # Un archivo v4 escrito a mano con «el» espesor de una placa (o el ancho suelto de un canto) se lee con ese valor
    # en su lista, sin rechazarlo ni reescribirlo; validar ese registro tal cual sí falla.
    edge=@store.new_item('Canto sintético','edge')
    loose=JSON.generate('schema'=>4,'revision'=>1,'items'=>[saved.merge('thicknessMm'=>16),edge.merge('widthMm'=>19)]);File.write(@path,loose)
    sheet,band=@store.read['items']
    assert_equal [nil,[3,5,12,15,16,18,25,36]],sheet.values_at('thicknessMm','thicknessesMm')
    assert_equal [nil,[19,22,45]],band.values_at('widthMm','widthsMm')
    assert_equal loose,File.read(@path)
    assert_raises(PlanosSanto::ExportError) { @store.validate({'schema'=>4,'revision'=>0,'items'=>[saved.merge('thicknessMm'=>18)]}) }
  end

  def test_out_of_list_thickness_is_added_with_one_click_and_only_once
    sheet=@store.save([@store.new_item('Melamina sintética','sheet')],0)['items'].first
    after=@store.add_thickness(sheet['id'],15.999)
    assert_equal [3,5,12,15,16,18,25],after['items'].first['thicknessesMm'],'Se redondea como la geometría del pedido (16,00)'
    revision=after['revision']
    assert_equal revision,@store.add_thickness(sheet['id'],16.04)['revision'],'Ya está en la lista (±0,1 mm): no se escribe nada'
    assert_raises(PlanosSanto::ExportError) { @store.add_thickness(sheet['id'],-1) }
    assert_raises(PlanosSanto::ExportError) { @store.add_thickness(SecureRandom.uuid,16) }
    other=@store.save(@store.read['items']+[@store.new_item('Herraje','unknown')],revision)['items'].last
    assert_raises(PlanosSanto::ExportError) { @store.add_thickness(other['id'],16) }
  end

  def test_edges_get_standard_widths_from_presets_and_never_lack_width
    assert_equal({'edge'=>[22,45]},Store.default_widths_all)
    custom=File.join(@dir,'presets.json')
    File.write(custom,JSON.generate('standardWidthsMm'=>{'edge'=>[45,22,33]}))
    assert_equal({'edge'=>[22,33,45]},Store.default_widths_all(custom))
    File.write(custom,JSON.generate('standardWidthsMm'=>{'edge'=>[0]}))
    assert_equal({'edge'=>[22,45]},Store.default_widths_all(custom),'Un valor inválido vuelve a los de fábrica')
    edge=@store.new_item('Canto sintético','edge')
    assert_equal [[22,45],[0.45,2]],edge.values_at('widthsMm','thicknessesMm')
    assert_empty Store.missing(edge),'Con anchos estándar el canto no tiene «Ancho no definido»'
    assert_equal ['ancho'],Store.missing(edge.merge('widthsMm'=>[]))
    assert_equal [],@store.new_item('Melamina','sheet')['widthsMm']
  end

  def test_opencutlist_lists_are_read_and_written_without_touching_user_values
    review={'schema'=>'planos-santo.material-review.v1','materials'=>[
      {'name'=>'Placa OCL sintética','category'=>'sheet','attributes_observed'=>{'type'=>2,'std_thicknesses'=>'16mm;19mm'}},
      {'name'=>'Canto OCL sintético','category'=>'edge','attributes_observed'=>{'type'=>4,'thickness'=>'1mm','std_widths'=>'23mm;33mm'}},
      {'name'=>'Lista rota','category'=>'sheet','attributes_observed'=>{'type'=>2,'std_thicknesses'=>'16mm;3/4"'}}]}
    items=@store.import(review,0)['items'].to_h { |row| [row['name'],row] }
    assert_equal [3,5,12,15,16,18,19,25],items['Placa OCL sintética']['thicknessesMm']
    assert_equal [[22,23,33,45],1],items['Canto OCL sintético'].values_at('widthsMm','thicknessMm')
    assert_equal [3,5,12,15,18,25],items['Lista rota']['thicknessesMm'],'Una lista con una parte que no es métrica no se adivina'
    values=PlanosSanto::OclAttributes.values(items['Placa OCL sintética'])
    assert_equal '3mm;5mm;12mm;15mm;16mm;18mm;19mm;25mm',values['std_thicknesses']
    assert_equal({'thickness'=>'1mm','std_widths'=>'22mm;23mm;33mm;45mm'},PlanosSanto::OclAttributes.values(items['Canto OCL sintético']))
  end

  # Un paquete .zip exportado por 0.8.17-0.8.19 trae fichas v3: se importan migradas.
  def test_v3_material_package_from_an_older_version_still_imports
    items=v3_library['items'].first(2)
    manifest={'format'=>PlanosSanto::MaterialPackage::FORMAT,'schema'=>1,'createdAt'=>'2026-10-20T00:00:00Z','items'=>items,'visualRecords'=>[],'files'=>[]}
    zip=File.join(@dir,'paquete-v3.zip');File.binwrite(zip,PlanosSanto::BoundedZip.build([['manifest.json',JSON.pretty_generate(manifest),true]]))
    library=PlanosSanto::MaterialLibrary.new(Struct.new(:materials).new([]),catalog:@store,directory:@dir)
    package=PlanosSanto::MaterialPackage.new(library:library,catalog:@store,directory:@dir)
    preview=package.preview(zip)
    assert_equal %w[new new],preview['rows'].map { |row| row['status'] }
    package.commit(preview['token'],preview['rows'].map { |row| row['id'] },preview['revision'],confirmed:true)
    imported=@store.read['items'].to_h { |row| [row['name'],row] }
    assert_equal [nil,[3,5,12,15,16,18,25]],imported['Melamina blanca sintética'].values_at('thicknessMm','thicknessesMm')
    assert_equal [0.45,nil,[19,22,45]],imported['Canto blanco sintético'].values_at('thicknessMm','widthMm','widthsMm')
    # Y la exportación JSON de una biblioteca v3 también se importa.
    json=@store.import(v3_library.merge('items'=>[v3_item('Otra placa sintética','sheet','thicknessMm'=>18,'thicknessesMm'=>[18])]),@store.read['revision'])
    assert_equal [nil,[18]],json['items'].last.values_at('thicknessMm','thicknessesMm')
  end
end
