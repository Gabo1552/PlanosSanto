# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../catalog_store'
require_relative '../material_resolver'
require 'digest'

# 0.8.34: el SKU se arma solo con el nombre y el espesor, igual que autoSku (tests/auto-sku.test.ts).
class CatalogSkuTest < Minitest::Test
  Store=PlanosSanto::CatalogStore
  CASES=JSON.parse(File.read(File.expand_path('../../tests/fixtures/auto-sku-cases.json',__dir__),encoding:'UTF-8'))['cases']
  def setup;@dir=Dir.mktmpdir;@store=Store.new(directory:@dir);end
  def teardown;FileUtils.remove_entry(@dir);end
  def item(name,kind,extra={});@store.new_item(name,kind).merge(extra);end

  def test_same_cases_as_the_interface
    CASES.each do |c|
      row={'name'=>c['name'],'kind'=>c['kind'],'thicknessesMm'=>c['thicknessesMm'],'thicknessMm'=>c['thicknessMm']}
      assert_equal c['sku'],Store.auto_sku(row),c.inspect
    end
  end

  def test_saving_fills_an_empty_sku_and_keeps_a_typed_one
    blank=item('Melamina Blanca','sheet','thicknessesMm'=>[18])
    typed=item('Fenólico','sheet','thicknessesMm'=>[18],'sku'=>'FEN-PROV-001')
    saved=@store.save([blank,typed],0)['items']
    assert_equal ['MELAMINA-BLANCA-18MM','FEN-PROV-001'],saved.map { |row| row['sku'] }
  end

  def test_an_automatic_sku_follows_a_new_name_or_thickness_but_a_typed_one_stays
    a=item('Melamina Blanca','sheet','thicknessesMm'=>[18]);b=item('Fenólico','sheet','thicknessesMm'=>[18],'sku'=>'FEN-PROV-001')
    saved=@store.save([a,b],0)['items']
    renamed=saved.map { |row| row.merge('name'=>"#{row['name']} Nuevo",'thicknessesMm'=>[15]) }
    again=@store.save(renamed,1)['items']
    assert_equal ['MELAMINA-BLANCA-NUEVO-15MM','FEN-PROV-001'],again.map { |row| row['sku'] }
    # Typed by hand afterwards: no longer the automatic one, never touched again.
    edited=again.map { |row| row['name'].start_with?('Melamina') ? row.merge('sku'=>'MB-PROPIO') : row }
    third=@store.save(edited,2)['items']
    fourth=@store.save(third.map { |row| row.merge('name'=>"#{row['name']} 2") },3)['items']
    assert_equal ['MB-PROPIO','FEN-PROV-001'],fourth.map { |row| row['sku'] }
  end

  def test_a_sheet_with_the_standard_list_gets_only_the_name
    saved=@store.save([item('Melamina Gris','sheet')],0)['items']
    assert_equal 'MELAMINA-GRIS',saved.first['sku']
    refute_includes Store.missing(saved.first),'SKU'
  end

  # The SKU is part of the binding fingerprint: an automatic one must not make painted models stale.
  def test_filling_or_renaming_an_automatic_sku_keeps_model_bindings_current
    blank=item('Melamina Blanca','sheet','thicknessesMm'=>[18])
    before=PlanosSanto::MaterialResolver.item_fingerprint(blank)
    saved=@store.save([blank],0)['items'].first
    assert_equal 'MELAMINA-BLANCA-18MM',saved['sku']
    assert PlanosSanto::MaterialResolver.fingerprint_current?(saved,before),'llenar el SKU automático no desactualiza el vínculo'
    renamed=@store.save([saved.merge('name'=>'Melamina Blanca Mate')],1)['items'].first
    assert_equal 'MELAMINA-BLANCA-MATE-18MM',renamed['sku']
    assert PlanosSanto::MaterialResolver.fingerprint_current?(renamed,before),'renombrar tampoco'
    typed=renamed.merge('sku'=>'MB-PROPIO')
    refute PlanosSanto::MaterialResolver.fingerprint_current?(typed,before),'un SKU escrito a mano sigue contando como dato comercial'
  end

  # Codex (PR #33): a SKU typed before 0.8.34 that happens to look automatic is still the user's.
  def test_an_old_typed_sku_that_looks_automatic_never_follows_a_rename
    old=item('Melamina Blanca','sheet','thicknessesMm'=>[18],'sku'=>'MELAMINA-BLANCA-18MM')
    saved=@store.save([old],0)['items'].first
    refute Store.auto_sku?(saved),'sin marca de procedencia: es del usuario'
    renamed=@store.save([saved.merge('name'=>'Melamina Blanca Mate','thicknessesMm'=>[15])],1)['items'].first
    assert_equal 'MELAMINA-BLANCA-18MM',renamed['sku']
  end

  # Codex (PR #33): the binding fingerprint of such a ficha is exactly the pre-0.8.34 one.
  def test_an_old_typed_sku_keeps_the_pre_0834_binding_fingerprint
    old=item('Melamina Blanca','sheet','thicknessesMm'=>[18],'sku'=>'MELAMINA-BLANCA-18MM')
    fields=PlanosSanto::MaterialResolver::FINGERPRINT_FIELDS
    legacy=Digest::SHA256.hexdigest(JSON.generate(fields.to_h { |key| [key,key=='compatibleIds' ? old[key].sort : old[key]] }.sort.to_h))
    assert_equal legacy,PlanosSanto::MaterialResolver.item_fingerprint(old)
    saved=@store.save([old],0)['items'].first
    assert PlanosSanto::MaterialResolver.fingerprint_current?(saved,legacy),'actualizar a 0.8.34 no desactualiza el vínculo'
  end

  def test_the_mark_lives_in_the_provenance_and_goes_away_when_typed
    saved=@store.save([item('Melamina Blanca','sheet','thicknessesMm'=>[18])],0)['items'].first
    assert_equal 'MELAMINA-BLANCA-18MM',saved['observed']['autoSku']
    typed=@store.save([saved.merge('sku'=>'MB-PROPIO')],1)['items'].first
    refute typed['observed'].key?('autoSku')
    cleared=@store.save([typed.merge('sku'=>'')],2)['items'].first
    assert_equal ['MELAMINA-BLANCA-18MM','MELAMINA-BLANCA-18MM'],[cleared['sku'],cleared['observed']['autoSku']],'vaciarlo devuelve el automático'
  end
end
