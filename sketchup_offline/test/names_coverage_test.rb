# frozen_string_literal: true
# Cobertura de ramas de NameManager con dobles (fake_api + names_double). No abre SketchUp.
require 'minitest/autorun'
require 'minitest/mock'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../names'

class NamesCoverageTest < Minitest::Test
  NM=PlanosSanto::NameManager
  def setup
    @model=NamesFixture.model;@manager=NM.new(@model)
    @root=@model.entities[0];@left=@root.entities[0];@container=@root.entities[1];@base=@container.entities[0]
  end
  def data(p=@manager.preview('1'),name:'Bajo Mesada',prefix:'BM')
    {'token'=>p['token'],'name'=>name,'prefix'=>prefix,'bases'=>p['rows'].select { |r| r['role']=='piece' }.to_h { |r| [r['id'],r['base']] }}
  end
  def guide_edit(code:'',module_code:'M01',names:nil,naming:true)
    names||=code.empty? ? ['Lateral','Base'] : ["#{code} #{module_code} Lateral","#{code} #{module_code} Base"]
    f={'id'=>'1','pieces'=>[{'id'=>'1/11','name'=>names[0],'code'=>'P01'},{'id'=>'1/13/12','name'=>names[1],'code'=>'P02'}]}
    f['naming']={'moduleCode'=>module_code,'bases'=>[{'id'=>'1/11','base'=>'Lateral'},{'id'=>'1/13/12','base'=>'Base'}]} if naming
    f
  end
  def meta(entity,key,value);entity.set_attribute(NM::DICT,key,value.is_a?(String) ? value : JSON.generate(value));end

  # --- Limpieza y abreviaturas con Unicode ------------------------------------
  def test_clean_normalizes_unicode_and_whitespace_and_enforces_limits
    assert_equal "Cajón",NM.clean("Cajón"),'NFD → NFC'
    assert_equal 'Puerta izq.',NM.clean("Puerta  izq. "),'NBSP y em-space se colapsan'
    assert_equal 'ñ'*80,NM.clean('ñ'*80),'El límite cuenta caracteres, no bytes'
    assert_raises(PlanosSanto::ExportError){NM.clean('ñ'*81)}
    assert_raises(PlanosSanto::ExportError){NM.clean("   ")}
    assert_raises(PlanosSanto::ExportError){NM.clean(:lateral)}
    assert_raises(PlanosSanto::ExportError){NM.clean("Lateral\u007f")}
    assert_raises(PlanosSanto::ExportError){NM.clean("Lateral\nizq")}
  end
  def test_abbreviation_unicode_codes_stop_words_and_length
    {'ñandú del sur'=>'ÑS','Él y Ésa'=>'ÉÉ','de la y los'=>'M','—'=>'M','2 Puertas Corredizas'=>'2PC','AM08 Alacena'=>'AA',
     'Mueble M3-bis'=>'M3','Cajonera m12'=>'M12','Øre Ångström'=>'ØÅ'}.each do |name,expected|
      assert_equal expected,NM.abbreviation(name),name
    end
    assert_equal 'A'*20,NM.abbreviation(Array.new(25) { 'alfa' }.join(' '))
  end

  # --- Metadatos y visualización ----------------------------------------------
  def test_invalid_piece_metadata_is_a_warning_and_a_blocker_without_writes
    {'x'*4097=>/incompatibles/,'{roto'=>/dañados/,JSON.generate({'version'=>2,'base'=>'a','prefix'=>'b','originalName'=>'c','appliedName'=>'d'})=>/incompatibles/,
     JSON.generate({'version'=>1,'base'=>'a'})=>/incompatibles/,JSON.generate({'version'=>1,'base'=>1,'prefix'=>'b','originalName'=>'c','appliedName'=>'d'})=>/incompatibles/}.each do |raw,pattern|
      meta(@left,NM::PIECE_KEY,raw);p=@manager.preview('1')
      assert p['blocked'];assert_match(pattern,p['warnings'].join);assert_includes p['blockers'],'1/11: metadatos incompatibles.'
    end
    @left.names_attributes[[NM::DICT,NM::PIECE_KEY]]=42;assert @manager.preview('1')['blocked']
    assert_empty @model.operations
  end
  def test_display_falls_back_to_definition_then_generic_label_with_id
    @root.name='';assert_equal 'Mueble A',@manager.preview('1')['name']
    @root.definition.name=' ';p=@manager.preview('1')
    assert_equal 'Mueble 1',p['name'];assert_equal 'M1',p['prefix']
  end
  def test_root_metadata_keeps_prefix_only_while_name_unchanged
    meta(@root,NM::ROOT_KEY,{'version'=>1,'name'=>'Bajo Mesada','prefix'=>'BAJ','originalName'=>'Bajo Mesada'})
    assert_equal 'BAJ',@manager.preview('1')['prefix']
    @root.name='Bajo Mesada Ñandú';assert_equal 'BMÑ',@manager.preview('1')['prefix']
  end

  # --- Límites del recorrido ---------------------------------------------------
  def test_inventory_rejects_deep_recursive_repeated_and_unknown_roots
    deep=Sketchup::ComponentInstance.new(900,'Lateral',Fixture.board_definition)
    26.times { |i| deep=Sketchup::Group.new(901+i,"Nivel #{i}",Sketchup::Definition.new("N#{i}","deep-#{i}",[deep])) }
    model=NamingModelDouble.new(Sketchup::Model.new([deep],'deep','Profundo',''))
    assert_match(/25 niveles/,assert_raises(PlanosSanto::ExportError){NM.new(model).catalog}.message)
    loop_def=Sketchup::Definition.new('Bucle','loop',[]);loop_def.entities << Sketchup::Group.new(51,'Hijo',loop_def)
    model=NamingModelDouble.new(Sketchup::Model.new([Sketchup::Group.new(50,'Raíz',loop_def)],'loop','Bucle',''))
    assert_match(/recursiva/,assert_raises(PlanosSanto::ExportError){NM.new(model).catalog}.message)
    @root.entities << @left
    assert_match(/repetidas/,assert_raises(PlanosSanto::ExportError){@manager.catalog}.message)
    @root.entities.pop
    assert_match(/no existe/,assert_raises(PlanosSanto::ExportError){@manager.preview('77')}.message)
  end
  def test_vertex_budget_is_enforced_but_skipped_without_geometry
    heavy=Sketchup::Face.new(Array.new(200_001) { [0,0,0] },[0,0,1])
    @root.entities << Sketchup::ComponentInstance.new(40,'Panel pesado',Sketchup::Definition.new('Pesado','heavy',[heavy]))
    assert_match(/límite de revisión/,assert_raises(PlanosSanto::ExportError){@manager.inventory}.message)
    snapshot=@manager.inventory(geometry:false);assert_nil snapshot[:signature];assert snapshot[:index].key?('1/40')
  end
  def test_preview_blocks_more_than_500_pieces
    board=Fixture.board_definition
    501.times { |i| @root.entities << Sketchup::ComponentInstance.new(1000+i,"Pieza #{i}",board) }
    p=@manager.preview('1');assert_includes p['blockers'],'Este mueble supera 500 piezas; elegí un grupo menor.'
  end

  # --- guide_changes: obra, módulo y prefijos ----------------------------------
  def test_guide_changes_label_fallbacks_when_module_is_missing
    edit=guide_edit(code:'VF',module_code:'').merge('id'=>'9')
    assert_equal '9: Falta el módulo del mueble «sin nombre» (por ejemplo M01).',assert_raises(PlanosSanto::ExportError){@manager.guide_changes([edit],'VF')}.message
    edit=guide_edit(code:'VF',naming:false).merge('name'=>'  Alacena ')
    assert_includes assert_raises(PlanosSanto::ExportError){@manager.guide_changes([edit.merge('id'=>'9')],'VF')}.message,'«Alacena»'
    assert_includes assert_raises(PlanosSanto::ExportError){@manager.guide_changes([guide_edit(code:'VF',naming:false)],'VF')}.message,'«Bajo Mesada»'
    assert_raises(PlanosSanto::ExportError){@manager.guide_changes([guide_edit],'vf')}
  end
  def test_guide_changes_without_naming_uses_piece_name_and_code_less_label
    edit=guide_edit(naming:false,names:['Lateral Ñ','Base'])
    @manager.guide_changes([edit],'').call
    assert_equal 'Lateral Ñ',@left.name;assert_equal 'Base',@base.name
    assert_equal 'Lateral Ñ',JSON.parse(@left.get_attribute(NM::DICT,NM::PIECE_KEY))['base']
    edit['pieces'][0].merge!('id'=>'1/98','code'=>'')
    assert_equal '1/98: La pieza ya no existe. Volvé a analizar el modelo.',assert_raises(PlanosSanto::ExportError){@manager.guide_changes([edit],'')}.message
  end
  def test_duplicated_prefix_is_rejected_unless_the_ui_sends_the_exact_composed_name
    edit=guide_edit(code:'VF',names:['VF M01 VF M01 Lateral','VF M01 Base'])
    assert_match(/no coincide con obra, módulo y pieza/,assert_raises(PlanosSanto::ExportError){@manager.guide_changes([edit],'VF')}.message)
    edit['naming']['bases'][0]['base']='VF M01 Lateral'
    @manager.guide_changes([edit],'VF').call
    assert_equal 'VF M01 VF M01 Lateral',@left.name,'Contrato actual: la base se toma literal; no se deduplica el prefijo'
  end
  def test_group_rename_rules_for_pieces_containers_and_preserved_original_name
    edit=guide_edit(code:'VF').merge('groupName'=>'Bajo Mesada')
    @manager.guide_changes([edit],'VF').call;assert_equal 'Bajo Mesada',@root.name,'Mismo nombre: sin cambio de grupo'
    assert_nil @root.get_attribute(NM::DICT,NM::ROOT_KEY)
    meta(@root,NM::ROOT_KEY,{'version'=>1,'name'=>'Bajo Mesada','prefix'=>'BM','originalName'=>'Mueble original'})
    edit=guide_edit(code:'VF').merge('groupName'=>'Bajo  Mesada  Ñandú')
    @manager.guide_changes([edit],'VF').call
    assert_equal 'Bajo Mesada Ñandú',@root.name
    assert_equal({'version'=>1,'name'=>'Bajo Mesada Ñandú','prefix'=>'VF M01','originalName'=>'Mueble original'},JSON.parse(@root.get_attribute(NM::DICT,NM::ROOT_KEY)))
    piece_edit={'id'=>'1/11','groupName'=>'Otro nombre','pieces'=>[]}
    assert_match(/pieza aislada/,assert_raises(PlanosSanto::ExportError){@manager.guide_changes([piece_edit],'')}.message)
  end
  def test_mixed_nodes_are_not_renamed_and_mutation_rechecks_lock_and_acceptance
    @container.entities << Fixture.board_definition.entities[0]
    edit=guide_edit(names:['Lateral','Base']);edit['pieces'] << {'id'=>'1/13','name'=>'Interior','code'=>'P03'}
    edit['naming']['bases'] << {'id'=>'1/13','base'=>'Interior'}
    assert_match(/geometría mezclada/,assert_raises(PlanosSanto::ExportError){@manager.guide_changes([edit],'')}.message)
    @container.entities.pop
    run=@manager.guide_changes([guide_edit(names:['Lateral','Base'])],'');@left.locked_for_names=true
    assert_match(/bloqueó/,assert_raises(PlanosSanto::ExportError){run.call}.message);@left.locked_for_names=false
    run=@manager.guide_changes([guide_edit(names:['Lateral','Base'])],'')
    @left.define_singleton_method(:name=) { |_v| }
    assert_match(/no aceptó/,assert_raises(PlanosSanto::ExportError){run.call}.message)
  end
  def test_shared_piece_with_incompatible_bases_is_rejected
    shared=Sketchup::ComponentInstance.new(60,'Estante',Fixture.board_definition)
    a=Sketchup::Group.new(61,'Módulo A',Sketchup::Definition.new('A','sa',[shared]))
    b=Sketchup::Group.new(62,'Módulo B',Sketchup::Definition.new('B','sb',[shared]))
    model=NamingModelDouble.new(Sketchup::Model.new([a,b],'shared','Compartido',''));manager=NM.new(model)
    edits=[['61','A'],['62','B']].map do |id,base|
      {'id'=>id,'pieces'=>[{'id'=>"#{id}/60",'name'=>'VF M01 Estante','code'=>'P01'}],'naming'=>{'moduleCode'=>'M01','bases'=>[{'id'=>"#{id}/60",'base'=>'Estante'}]}}
    end
    manager.guide_changes(edits,'VF')
    edits[1]['naming']['moduleCode']='M1';edits[1]['pieces'][0]['name']='VF M1 Estante'
    assert_match(/nombres distintos/,assert_raises(PlanosSanto::ExportError){manager.guide_changes(edits,'VF')}.message)
  end

  def test_shared_piece_message_lists_three_missing_paths_and_ellipsis
    shared=Sketchup::ComponentInstance.new(70,'Estante',Fixture.board_definition)
    roots=(71..75).map { |id| Sketchup::Group.new(id,"Módulo #{id}",Sketchup::Definition.new("D#{id}","sd#{id}",[shared])) }
    manager=NM.new(NamingModelDouble.new(Sketchup::Model.new(roots,'shared5','Compartido','')))
    p=manager.preview('71');assert p['blocked']
    assert_includes p['blockers'].join,'5 apariciones; faltan 4 en este cambio (72/70, 73/70, 74/70, …)'
  end
  def test_shared_piece_with_same_name_but_incompatible_prefix_split_is_rejected
    shared=Sketchup::ComponentInstance.new(60,'Estante',Fixture.board_definition)
    a=Sketchup::Group.new(61,'Módulo A',Sketchup::Definition.new('A','sa',[shared]))
    b=Sketchup::Group.new(62,'Módulo B',Sketchup::Definition.new('B','sb',[shared]))
    manager=NM.new(NamingModelDouble.new(Sketchup::Model.new([a,b],'shared','Compartido','')))
    edits=[['61','M01','Lado B'],['62','M01 Lado','B']].map do |id,module_code,base|
      {'id'=>id,'pieces'=>[{'id'=>"#{id}/60",'name'=>'VF M01 Lado B','code'=>'P01'}],'naming'=>{'moduleCode'=>module_code,'bases'=>[{'id'=>"#{id}/60",'base'=>base}]}}
    end
    assert_match(/de P01 tienen abreviaturas o nombres base incompatibles/,assert_raises(PlanosSanto::ExportError){manager.guide_changes(edits,'VF')}.message)
  end

  # --- apply: atomicidad y errores --------------------------------------------
  def test_apply_rejects_reentry_stale_token_and_inconsistent_bases
    p=@manager.preview('1')
    assert_match(/vencida/,assert_raises(PlanosSanto::ExportError){@manager.apply(data(p).merge('token'=>'otro'))}.message)
    payload=data(p);payload['bases'].delete('1/11')
    assert_match(/inconsistente/,assert_raises(PlanosSanto::ExportError){@manager.apply(payload)}.message)
    @manager.instance_variable_set(:@applying,true)
    assert_match(/en curso/,assert_raises(PlanosSanto::ExportError){@manager.apply(data(p))}.message)
    @manager.instance_variable_set(:@applying,false)
    assert NM.new(NamesFixture.model).respond_to?(:apply);assert_empty @model.operations
  end
  def test_apply_updates_guide_naming_bases_only_without_work_code
    guide={'version'=>1,'revision'=>0,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0,'zoom'=>1,'notes'=>[],
      'pieces'=>[{'id'=>'1/11','name'=>'Viejo','code'=>'P01'},{'id'=>'1/13/12','name'=>'Base','code'=>'P02'}],
      'naming'=>{'moduleCode'=>'','bases'=>[{'id'=>'1/11','base'=>'Viejo'},{'id'=>'1/13/12','base'=>'Base'}]}}]}
    @model.set_attribute('PlanosSanto','guide_v1',JSON.generate(guide))
    @manager.apply(data);updated=PlanosSanto::GuideStore.new(@model).read
    assert_equal 'BM - Lateral - Blanco',updated['furniture'][0]['naming']['bases'][0]['base']
    assert_equal 1,updated['revision']
    model=NamesFixture.model;model.set_attribute('PlanosSanto','guide_v1',JSON.generate(guide.merge('workCode'=>'VF')))
    manager=NM.new(model);manager.apply(data(manager.preview('1')))
    updated=PlanosSanto::GuideStore.new(model).read
    assert_equal 'Viejo',updated['furniture'][0]['naming']['bases'][0]['base'],'Con obra, la base no se pisa con el nombre compuesto'
    assert_equal 'BM - Lateral - Blanco',updated['furniture'][0]['pieces'][0]['name']
  end
  def test_apply_leaves_guide_revision_when_saved_names_already_match
    guide={'version'=>1,'revision'=>4,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0,'zoom'=>1,'notes'=>[],
      'pieces'=>[{'id'=>'1/11','name'=>'BM - Lateral - Blanco','code'=>'P01'}]}]}
    @model.set_attribute('PlanosSanto','guide_v1',JSON.generate(guide))
    result=@manager.apply(data);refute result['guideNamesUpdated']
    assert_equal 4,PlanosSanto::GuideStore.new(@model).read['revision']
  end
  def test_apply_operation_failures_abort_and_leave_names_untouched
    @model.define_singleton_method(:start_operation) { |*_| false }
    assert_match(/iniciar/,assert_raises(PlanosSanto::ExportError){@manager.apply(data)}.message)
    assert_equal 'Lateral - Blanco',@left.name
    model=NamesFixture.model;manager=NM.new(model);left=model.entities[0].entities[0]
    model.define_singleton_method(:commit_operation) { false }
    assert_match(/confirmar/,assert_raises(PlanosSanto::ExportError){manager.apply(data(manager.preview('1')))}.message)
    assert_equal 'Lateral - Blanco',left.name;assert_equal :abort,model.operations.last[0]
    model=NamesFixture.model;manager=NM.new(model);left=model.entities[0].entities[0];p=manager.preview('1')
    left.define_singleton_method(:name=) { |_v| }
    assert_match(/no aceptó/,assert_raises(PlanosSanto::ExportError){manager.apply(data(p))}.message)
    refute manager.instance_variable_get(:@applying),'El cerrojo se libera aunque falle'
  end
  def test_apply_aborts_when_a_piece_is_locked_after_validation
    p=@manager.preview('1');lock=->(*) { @base.locked_for_names=true }
    @manager.stub(:validate_shared_batch!,lock) do
      assert_match(/bloqueada/,assert_raises(PlanosSanto::ExportError){@manager.apply(data(p))}.message)
    end
    assert_equal :abort,@model.operations.last[0],'La operación ya iniciada se revierte'
    assert_equal ['Lateral - Blanco','Base'],[@left.name,@base.name];assert_empty @left.names_attributes
    refute @manager.instance_variable_get(:@applying)
  end
  def test_apply_refuses_guide_that_would_exceed_limit
    guide={'version'=>1,'revision'=>0,'selection'=>['1'],'furniture'=>[{'id'=>'1','explosion'=>0,'zoom'=>1,'notes'=>[],
      'pieces'=>[{'id'=>'1/11','name'=>'Viejo','code'=>'P01'}]}]}
    @model.set_attribute('PlanosSanto','guide_v1',JSON.generate(guide))
    p=@manager.preview('1');draft=@manager.instance_variable_get(:@draft)
    padded=Marshal.load(Marshal.dump(draft[:snapshot][:guide]));padded['furniture'][0]['pad']='x'*PlanosSanto::GuideStore::LIMIT
    @manager.stub(:inventory,draft[:snapshot].merge(guide:padded)) do
      assert_match(/supera el límite/,assert_raises(PlanosSanto::ExportError){@manager.apply(data(p))}.message)
    end
    assert_empty @model.operations
  end
end
