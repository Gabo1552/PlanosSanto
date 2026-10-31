# frozen_string_literal: true
# Cobertura de ramas de GuideStore con dobles (fake_api + names_double). No abre SketchUp.
require 'minitest/autorun'
require 'minitest/mock'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'

class GuideStoreCoverageTest < Minitest::Test
  NOTE_ID='12345678-1234-4234-8234-123456789012'
  def setup
    @model=NamesFixture.model;@session=PlanosSanto::NativeSession.new(@model);@session.scan
    @document=@session.generate(['1'])['document'];@store=PlanosSanto::GuideStore.new(@model)
  end
  def edit
    {'id'=>'1','explosion'=>0.4,'zoom'=>1,'notes'=>[],
     'pieces'=>[{'id'=>'1/11','name'=>'Lateral','code'=>'P01'},{'id'=>'1/13/12','name'=>'Base','code'=>'P02'}]}
  end
  def note(extra={});{'id'=>NOTE_ID,'pieceId'=>'1/11','anchor'=>[1,1,1],'position'=>[100,100],'text'=>'Tapacanto a la vista'}.merge(extra);end
  def stored(guide);@model.attributes[[PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY]]=guide.is_a?(String) ? guide : JSON.generate(guide);end
  def guide(furniture=[edit]);{'version'=>1,'revision'=>3,'selection'=>['1'],'furniture'=>furniture};end
  def refuse_read(pattern);message=assert_raises(PlanosSanto::ExportError){@store.read}.message;assert_match(pattern,message);message;end
  def refuse_save(edits,pattern=//);message=assert_raises(PlanosSanto::ExportError){@store.save(@document,edits,@store.read['revision'])}.message;assert_match(pattern,message);message;end

  # --- Lectura defensiva -----------------------------------------------------
  def test_read_rejects_oversized_non_string_and_incompatible_root
    stored('x'*(PlanosSanto::GuideStore::LIMIT+1));refuse_read(/superan el límite/)
    @model.attributes[[PlanosSanto::GuideStore::DICTIONARY,PlanosSanto::GuideStore::KEY]]=42;refuse_read(/superan el límite/)
    stored(guide.merge('version'=>2));refuse_read(/formato incompatible/)
    stored(guide.merge('revision'=>-1));refuse_read(/formato incompatible/)
    stored(guide.merge('selection'=>['']));refuse_read(/selección guardada/)
    stored(guide.merge('workCode'=>'vf'));refuse_read(/dos letras mayúsculas/)
    stored(guide.merge('workCode'=>''));assert_equal '',@store.read['workCode'],'Obra vacía es válida'
  end
  def test_read_rejects_broken_pieces_codes_notes_and_duplicates
    f=edit;f['pieces']={};stored(guide([f]));refuse_read(/Listado guardado/)
    f=edit;f['pieces'][0]['code']='P00';stored(guide([f]));refuse_read(/Código guardado/)
    f=edit;f['pieces'][0]['code']='p01';stored(guide([f]));refuse_read(/Código guardado/)
    f=edit;f['pieces'][1]['code']='P01';stored(guide([f]));refuse_read(/repetidos/)
    f=edit;f['notes']=[note,note];stored(guide([f]));refuse_read(/Notas guardadas repetidas/)
    stored(guide([edit,edit]));refuse_read(/Muebles guardados repetidos/)
    f=edit;f['pieces'][0]['name']="Lateral\u0007";stored(guide([f]));refuse_read(/caracteres de control/)
    f=edit;f['pieces'][0]['name']='   ';stored(guide([f]));refuse_read(/vacío o es demasiado largo/)
  end
  def test_keys_report_missing_and_unknown_fields_trimmed_to_eight
    f=edit;f.delete('zoom');(1..10).each { |i| f["campo#{i}"]=i };stored(guide([f]))
    message=refuse_read(/Faltan campos: "zoom"\. Campos no permitidos: /)
    assert_includes message,'"campo8"';refute_includes message,'"campo9"'
    stored(guide([[1,2]]));refuse_read(/se esperaba un objeto/)
  end

  # --- Notas -----------------------------------------------------------------
  def test_note_format_id_anchor_and_position_bounds
    f=edit;f['notes']=[note('id'=>'no-uuid')];stored(guide([f]));refuse_read(/Identificador de nota/)
    f=edit;f['notes']=[note('anchor'=>[1,1])];stored(guide([f]));refuse_read(/Ancla inválida/)
    @model.attributes.clear
    [{'anchor'=>[1,1]},{'anchor'=>[1,1,Float::NAN]},{'position'=>[100]},{'position'=>[15,100]},{'position'=>[100,529]},{'text'=>'x'*201},{'pieceId'=>''}].each do |bad|
      f=edit;f['notes']=[note(bad)];refuse_save([f])
    end
    f=edit;f['notes']=[note('id'=>NOTE_ID.upcase)];assert @store.save(@document,[f],0),'UUID en mayúsculas es válido'
  end
  def test_note_anchor_outside_piece_and_orphan_note_rules
    f=edit;f['notes']=[note('anchor'=>[700,1,1])];refuse_save([f],/fuera de la pieza/)
    f=edit;f['notes']=[note('anchor'=>[609.65,406.45,19.1])];saved=@store.save(@document,[f],0)
    assert_equal [609.65,406.45,19.1],saved['furniture'][0]['notes'][0]['anchor'],'Tolerancia de 0,1 mm en el borde'
    orphan=note('pieceId'=>'1/99','anchor'=>[5,5,5])
    f=edit;f['notes']=[orphan];refuse_save([f],/pieza inexistente/)
    f=edit;f['notes']=[note,note];refuse_save([f],/notas repetidas/)
    f=edit;f['notes']=Array.new(41) { note };refuse_save([f],/40 notas/)
  end

  # --- Guardado --------------------------------------------------------------
  def test_save_rejects_stale_revision_and_edits_that_do_not_match_document
    assert_match(/cambió en SketchUp/,assert_raises(PlanosSanto::ExportError){@store.save(@document,[edit],7)}.message)
    refuse_save([],/inconsistente/)
    refuse_save([edit.merge('id'=>'2')],/inconsistente/)
    f=edit;f['pieces'].pop;refuse_save([f],/piezas inconsistente/)
    f=edit;f['pieces'][1]['code']='P01';refuse_save([f],/códigos de pieza repetidos/)
    f=edit;f['pieces'][1]['code']='X2';refuse_save([f],/Identificador de pieza/)
    f=edit;f['groupName']='';refuse_save([f],/vacío/)
    f=edit;f['explosion']=1.01;refuse_save([f],/fuera de rango/)
    assert_empty @model.operations
  end
  def test_saved_codes_are_immutable_and_unicode_names_roundtrip
    f=edit;f['pieces'][0]['name']='Cajón ñandú — frente';@store.save(@document,[f],0)
    assert_equal 'Cajón ñandú — frente',PlanosSanto::GuideStore.new(@model).read['furniture'][0]['pieces'][0]['name']
    f=edit;f['pieces'][0]['code']='P03';refuse_save([f],/No se puede cambiar el código/)
  end
  def test_save_operation_failures_abort_or_never_start
    @model.define_singleton_method(:start_operation) { |*_| false }
    refuse_save([edit],/No se pudo iniciar/);refute @model.operations.any? { |op| op[0]==:abort }
    model=NamesFixture.model;session=PlanosSanto::NativeSession.new(model);session.scan;doc=session.generate(['1'])['document']
    model.define_singleton_method(:commit_operation) { @operations << [:commit];false }
    store=PlanosSanto::GuideStore.new(model)
    assert_raises(PlanosSanto::ExportError){store.save(doc,[edit],0)}
    assert_equal :abort,model.operations.last[0];assert_nil model.get_attribute('PlanosSanto','guide_v1')
    model=NamesFixture.model;store=PlanosSanto::GuideStore.new(model)
    assert_raises(RuntimeError){store.save(doc,[edit],0) { raise 'bloque sintético' }}
    assert_equal :abort,model.operations.last[0]
  end
  def test_save_size_limit_and_furniture_limit
    big=Array.new(PlanosSanto::GuideStore::MAX_FURNITURE) { |i| edit.merge('id'=>"otro-#{i}") }
    stored(guide(big).merge('revision'=>0,'selection'=>[]))
    refuse_save([edit],/500 muebles/)
    @model.attributes.clear
    @store.stub(:validate,[edit.merge('pieces'=>[{'id'=>'1/11','name'=>'L','code'=>'P01'}],'filler'=>'x'*(PlanosSanto::GuideStore::LIMIT+1))]) do
      refuse_save([edit],/superan 5 MB/)
    end
    assert_empty @model.operations
  end
  def test_more_than_the_old_100_furniture_limit_saves
    big=Array.new(150) { |i| edit.merge('id'=>"otro-#{i}") }
    stored(guide(big).merge('revision'=>0,'selection'=>[]))
    saved=@store.save(@document,[edit],0)
    assert_equal 151,saved['furniture'].length
    assert_equal 151,@store.read['furniture'].length
  end
  def test_work_code_inherits_and_explicit_empty_clears
    @store.save(@document,[edit],0,work_code:'VF')
    assert_equal 'VF',@store.save(@document,[edit],1)['workCode'],'Sin obra explícita se hereda'
    assert_equal '',@store.save(@document,[edit],2,work_code:'')['workCode']
    assert_raises(PlanosSanto::ExportError){@store.save(@document,[edit],3,work_code:'V1')}
  end

  # --- Presentación / guía A4 con piezas ocultas ------------------------------
  def test_a4_guide_with_hidden_pieces_validates_mode_camera_and_observations
    base={'mode'=>'both','hiddenPieceIds'=>['1/13/12'],'sharedCamera'=>true,'observations'=>"Ver nota\ncanto 2 mm"}
    f=edit;f['presentation']={'guide'=>base,'compact'=>true};saved=@store.save(@document,[f],0)
    assert_equal ['1/13/12'],saved['furniture'][0]['presentation']['guide']['hiddenPieceIds']
    [{'mode'=>'lateral'},{'sharedCamera'=>nil},{'hiddenPieceIds'=>['1/99']},{'hiddenPieceIds'=>['1/11','1/11']},{'observations'=>'x'*2001},{'observations'=>"a\u0001"}].each do |bad|
      f=edit;f['presentation']={'guide'=>base.merge(bad)};refute_nil refuse_save([f])
    end
    [{'hideIds'=>'si'},{'compact'=>1},{'cameras'=>{'front'=>{'yaw'=>0,'pitch'=>5}}},{'cameras'=>{'top'=>{'yaw'=>0,'pitch'=>30}}}].each do |bad|
      f=edit;f['presentation']=bad;refute_nil refuse_save([f])
    end
  end
  def test_hidden_furniture_keeps_its_guide_and_inherited_hidden_pieces_are_pruned
    @model.entities[0].hidden=true;@session.scan;@document=@session.generate(['1'])['document']
    f=edit;f['presentation']={'guide'=>{'mode'=>'interior','hiddenPieceIds'=>['1/11','1/13/12'],'sharedCamera'=>false,'observations'=>''}}
    f['hiddenDimensions']=[{'pieceId'=>'1/11','role'=>'largo'}];@store.save(@document,[f],0)
    assert_equal ['1'],@store.read['selection'],'Un mueble oculto sigue en la guía'
    @model.entities[0].entities.delete_at(0);@session.scan;@document=@session.generate(['1'])['document']
    f=edit;f['pieces']=[{'id'=>'1/13/12','name'=>'Base','code'=>'P02'}];saved=@store.save(@document,[f],1)
    assert_equal ['1/13/12'],saved['furniture'][0]['presentation']['guide']['hiddenPieceIds']
    assert_equal [],saved['furniture'][0]['hiddenDimensions'],'Cotas ocultas heredadas de piezas borradas se descartan'
  end
  def test_dimension_offsets_and_hidden_dimensions_validation
    row={'pieceId'=>'1/11','role'=>'largo','view'=>'front','offset'=>[0.1,-0.1]}
    [{'view'=>'top'},{'offset'=>[0.1]},{'offset'=>[2,0]},{'pieceId'=>'1/99'}].each do |bad|
      f=edit;f['presentation']={'dimensionOffsets'=>[row.merge(bad)]};refute_nil refuse_save([f])
    end
    f=edit;f['presentation']={'dimensionOffsets'=>[row,row]};refuse_save([f],/duplicadas/)
    f=edit;f['presentation']={'dimensionOffsets'=>{}};refuse_save([f],/posiciones de cotas/)
    f=edit;f['hiddenDimensions']=[{'pieceId'=>'1/11','role'=>'espesor'}];refuse_save([f],/desconocida/)
    f=edit;f['hiddenDimensions']=[{'pieceId'=>'1/11','role'=>'largo'}]*2;refuse_save([f],/repetidas/)
    f=edit;f['hiddenDimensions']='todas';refuse_save([f],/inválido/)
  end
  def test_naming_reference_reviews_module_and_bases
    naming={'moduleCode'=>'M01','bases'=>[{'id'=>'1/11','base'=>'Lateral'},{'id'=>'1/13/12','base'=>'Base'}],
            'reference'=>{'upAxis'=>2,'frontAxis'=>1,'frontSign'=>-1,'confirmed'=>true,'upSign'=>1},
            'reviews'=>[{'id'=>'1/11','proposed'=>'Lateral izq.','base'=>'Lateral'}]}
    f=edit;f['naming']=naming;assert @store.save(@document,[f],0)
    [->(n){n['reference']['upSign']=0},->(n){n['reference']['frontAxis']=2},->(n){n['reference']['upAxis']=1.0},->(n){n['reviews']=[n['reviews'][0]]*2},
     ->(n){n['reviews'][0]['id']='1/99'},->(n){n['moduleCode']='01'},->(n){n['bases'].pop},->(n){n['bases'][0]['base']=''},->(n){n['reviews']='x'}].each do |change|
      n=Marshal.load(Marshal.dump(naming));change.call(n);f=edit;f['naming']=n;refute_nil refuse_save([f])
    end
    f=edit;f['naming']=naming.merge('moduleCode'=>'');assert @store.save(@document,[f],1),'Módulo vacío permitido'
    f=edit;f['groupIdentical']='si';refuse_save([f],/Agrupación/)
  end
end
