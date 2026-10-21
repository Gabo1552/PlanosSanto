# Reproducción automática (dobles de API) de las causas C1 y C3 del fallo de pintado 0.8.7.
# Evidencia de auditoría, NO es parte del producto. Ejecutar con un checkout de main:
#   LANG=C.UTF-8 PS_MAIN=/ruta/al/checkout ruby repro_causas_test.rb
# Resultado obtenido el 2026-10-21: 2 runs, 5 assertions, 0 failures (ambas causas reproducidas).
MAIN=ENV.fetch('PS_MAIN')
require File.join(MAIN,'sketchup_offline/test/material_library_test.rb')
Minitest::Runnable.runnables.delete(MaterialLibraryTest)

class ReproCausasTest < Minitest::Test
  def setup
    @directory=Dir.mktmpdir
    @catalog=PlanosSanto::CatalogStore.new(directory:@directory)
    @sheet=@catalog.new_item('Camellia','sheet').merge('sku'=>'M18','supplier'=>'Prueba','thicknessMm'=>18,'widthMm'=>1800,'lengthMm'=>2600,'grain'=>false,'approved'=>true)
    @catalog.save([@sheet],0)
    @mat=LibraryFixture::Material.new(20,'Camellia')
    @model=LibraryFixture::Model.new(@mat)
    @library=PlanosSanto::MaterialLibrary.new(@model,catalog:@catalog,directory:@directory)
  end
  def teardown; FileUtils.remove_entry(@directory); end
  # Regla JS de la paleta: usableForPainting (sketchup_offline/ui/SmartPaintPalette.tsx:22) vs exigencia del clic en change() (:110-114)
  def palette_shows?(item,materials)
    %w[sheet edge].include?(item['kind']) && (item['approved'] || materials.any? { |m| m['designReady'] && m.dig('binding','catalogId')==item['id'] && m['issues'].empty? })
  end
  def click_ok?(item,materials)
    materials.any? { |m| m.dig('binding','catalogId')==item['id'] && m.dig('binding','kind')==item['kind'] && m['issues'].empty? }
  end
  def test_C1_ficha_aprobada_sin_material_en_modelo
    status=@library.status
    item=@catalog.read['items'].first
    assert palette_shows?(item,status['materials']), 'la paleta muestra la ficha aprobada'
    refute click_ok?(item,status['materials']), 'el clic exige material vinculado -> error "textura no válida"'
  end
  def test_C3_completar_dato_comercial_invalida_vinculo
    @library.bind('catalogId'=>@sheet['id'],'materialId'=>'20','revision'=>1,'confirmed'=>true)
    item=@catalog.read['items'].first
    assert click_ok?(item,@library.status['materials']), 'recién vinculado: se puede pintar'
    data=@catalog.read; data['items'][0]['sku']='M18-NUEVO'; @catalog.save(data['items'],data['revision'])
    status=@library.status
    item=@catalog.read['items'].first
    assert palette_shows?(item,status['materials']), 'sigue visible en la paleta'
    refute click_ok?(item,status['materials']), 'cambiar SKU deja issues -> el clic falla'
    puts "\n  issues tras cambiar SKU: #{status['materials'].first['issues'].inspect}"
  end
end
