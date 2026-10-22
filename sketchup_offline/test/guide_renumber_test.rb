# frozen_string_literal: true
# DESPIECE-01: renumerar códigos de una guía guardada solo con renumber:true; el código anterior queda en previousCode.
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'

class GuideRenumberTest < Minitest::Test
  def setup
    @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan
    @document=@session.generate(['1'])['document'];@store=PlanosSanto::GuideStore.new(@model)
  end
  def edit(a='P01',b='P02',extra={})
    {'id'=>'1','explosion'=>0.4,'zoom'=>1,'notes'=>[],
     'pieces'=>[{'id'=>'1/11','name'=>'Lateral','code'=>a},{'id'=>'1/13/12','name'=>'Base','code'=>b}]}.merge(extra)
  end
  def save(f);@store.save(@document,[f],@store.read['revision']);end
  def pieces(guide=@store.read);guide['furniture'][0]['pieces'].to_h { |p| [p['id'],p] };end
  def stored(guide);@model.attributes[[PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY]]=JSON.generate(guide);end

  def test_code_change_refused_without_renumber
    save(edit)
    message=assert_raises(PlanosSanto::ExportError){save(edit('P02','P01'))}.message
    assert_match(/No se puede cambiar el código de una pieza guardada/,message)
  end

  def test_renumber_accepts_changes_and_stores_previous_code
    save(edit)
    result=save(edit('P02','P03','renumber'=>true))
    refute result['furniture'][0].key?('renumber'),'renumber no se persiste'
    rows=pieces
    assert_equal({'id'=>'1/11','name'=>'Lateral','code'=>'P02','previousCode'=>'P01'},rows['1/11'])
    assert_equal 'P02',rows['1/13/12']['previousCode']
    refute_includes @model.attributes[[PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY]],'renumber'
  end

  def test_unchanged_piece_under_renumber_has_no_previous_code_and_new_pieces_never_get_one
    result=save(edit('P01','P02','renumber'=>true))
    refute pieces(result).values.any? { |p| p.key?('previousCode') },'Piezas nuevas o sin cambio no inventan código anterior'
    save(edit)
    result=save(edit('P01','P05','renumber'=>true))
    refute pieces(result)['1/11'].key?('previousCode')
    assert_equal 'P02',pieces(result)['1/13/12']['previousCode']
  end

  def test_previous_code_preserved_on_later_saves_and_ignored_from_client
    save(edit);save(edit('P03','P04','renumber'=>true))
    later=edit('P03','P04');later['pieces'][0]['name']='Lateral izquierdo'
    later['pieces'][1]['previousCode']='P09' # the client cannot rewrite the history
    save(later)
    rows=pieces
    assert_equal 'P01',rows['1/11']['previousCode'];assert_equal 'Lateral izquierdo',rows['1/11']['name']
    assert_equal 'P02',rows['1/13/12']['previousCode']
    save(edit('P01','P04','renumber'=>true))
    assert_equal 'P03',pieces['1/11']['previousCode'],'Un nuevo cambio guarda el código inmediatamente anterior'
    assert_equal 'P02',pieces['1/13/12']['previousCode']
  end

  def test_invalid_renumber_flag_and_previous_code_are_rejected
    save(edit)
    [false,'true',1].each do |bad|
      assert_raises(PlanosSanto::ExportError){save(edit('P02','P01','renumber'=>bad))}
    end
    %w[P00 X01 p01 P12345].each do |bad|
      f=edit;f['pieces'][0]['previousCode']=bad
      assert_raises(PlanosSanto::ExportError){save(f)}
    end
    f=edit;f['pieces'][0]['previousCode']=7
    assert_raises(PlanosSanto::ExportError){save(f)}
  end

  def test_read_accepts_old_guides_and_validates_stored_previous_code
    stored({'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[edit]})
    assert_equal 'P01',pieces['1/11']['code'],'Una guía vieja sin previousCode se lee igual'
    f=edit;f['pieces'][0]['previousCode']='P07'
    stored({'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[f]})
    assert_equal 'P07',pieces['1/11']['previousCode']
    f=edit;f['pieces'][0]['previousCode']='P0'
    stored({'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[f]})
    assert_match(/Código guardado/,assert_raises(PlanosSanto::ExportError){@store.read}.message)
    f=edit('P01','P02','renumber'=>true)
    stored({'version'=>1,'revision'=>2,'selection'=>['1'],'furniture'=>[f]})
    assert_raises(PlanosSanto::ExportError){@store.read}
  end

  def test_renumber_still_requires_unique_valid_codes
    save(edit)
    assert_match(/repetidos/,assert_raises(PlanosSanto::ExportError){save(edit('P03','P03','renumber'=>true))}.message)
    assert_match(/Identificador de pieza/,assert_raises(PlanosSanto::ExportError){save(edit('P00','P03','renumber'=>true))}.message)
  end
end
