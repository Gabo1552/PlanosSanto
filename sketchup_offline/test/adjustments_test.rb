# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'

class AdjustmentsTest < Minitest::Test
  def setup
    @model=NamesFixture.model
    @model.entities[0].name='M01 Estantería izq. Util.'
    @model.entities[1].name='M02 Otro'
    @session=PlanosSanto::NativeSession.new(@model); @session.scan
    @document=@session.generate(['1'])['document']
    @store=PlanosSanto::GuideStore.new(@model)
    @edits=[{'id'=>'1','explosion'=>0.4,'zoom'=>1,'notes'=>[],
      'presentation'=>{'cameras'=>{'front'=>{'yaw'=>25,'pitch'=>35},'back'=>{'yaw'=>-10,'pitch'=>40}},'hideIds'=>true,'dimensionOffsets'=>[{'pieceId'=>'1/11','role'=>'largo','view'=>'front','offset'=>[0.03,0.02]}]},
      'naming'=>{'moduleCode'=>'M01','bases'=>[{'id'=>'1/11','base'=>'Lateral'},{'id'=>'1/13/12','base'=>'Base'}]},
      'pieces'=>[{'id'=>'1/11','name'=>'VF M01 Lateral','code'=>'P01'},{'id'=>'1/13/12','name'=>'VF M01 Base','code'=>'P02'}]}]
  end
  def save(sync:true,code:'VF'); @session.save(@edits,@store.read['revision'],sync_names:sync,work_code:code); end
  def state; @model.all_instances.map { |e| [e.name,e.definition.name,e.transformation.to_a,e.names_attributes.dup] }; end
  def geometry; @model.all_instances.map { |e| [e.definition.name,e.transformation.to_a,e.definition.entities.grep(Sketchup::Face).map { |f| f.mesh(0).points.map(&:to_a) }] }; end
  def test_dense_a4_zoom_remains_persistable_without_changing_geometry
    @edits[0]['zoom']=0.5
    @edits[0]['presentation']['guide']={'mode'=>'both','hiddenPieceIds'=>[],'sharedCamera'=>true,'observations'=>''}
    before=geometry
    result=save(sync:false)
    assert_equal 0.5,result['furniture'][0]['zoom']
    assert_equal 0.5,PlanosSanto::GuideStore.new(@model).read['furniture'][0]['zoom']
    assert_equal before,geometry
    @edits[0]['zoom']=0.34
    assert_raises(PlanosSanto::ExportError){save(sync:false)}
  end

  def test_atomic_names_work_module_and_presentation_roundtrip_without_geometry_changes
    before=geometry; saved=save
    assert_equal 'VF M01 Lateral',@model.entities[0].entities[0].name
    assert_equal 'VF M01 Base',@model.entities[0].entities[1].entities[0].name
    assert_equal before,geometry
    assert_equal 'VF',saved['workCode']; assert_equal @edits[0]['presentation'],saved['furniture'][0]['presentation']
    assert_equal @edits[0]['naming'],saved['furniture'][0]['naming']
    assert_equal 1,@model.undo_states.length
    assert @session.check_current!
    assert_equal 'Lateral',@session.document['furniture'][0]['children'][0]['metadata']['nameBase']
    assert_equal saved,PlanosSanto::GuideStore.new(@model).read
    assert @session.generate(['1'])['document']
    assert @session.validate_export(@edits)
  end
  def test_replacement_does_not_accumulate_prefixes_and_preserves_foreign_base
    save
    @edits[0]['naming']['moduleCode']='M03'
    @edits[0]['naming']['bases'][0]['base']='AS - Lateral'
    @edits[0]['pieces'][0]['name']='AB M03 AS - Lateral'
    @edits[0]['pieces'][1]['name']='AB M03 Base'
    save(code:'AB')
    assert_equal 'AB M03 AS - Lateral',@model.entities[0].entities[0].name
    refute_includes @model.entities[0].entities[0].name,'VF M01'
  end
  def test_shared_parent_and_locked_piece_reject_entire_batch_before_writing
    before=state
    @model.entities << Sketchup::ComponentInstance.new(3,'Repeated',@model.entities[0].definition)
    assert_raises(PlanosSanto::ExportError){save}
    assert_empty @model.operations; assert_equal before,state[0,before.length]
    @model.entities.pop; @model.entities[0].entities[1].entities[0].locked_for_names=true
    assert_raises(PlanosSanto::ExportError){save}
    assert_empty @model.attributes; assert_empty @model.operations
  end
  def test_guide_write_failure_rolls_back_all_names_and_metadata
    before=state; document=@session.document
    @model.fail_write=true
    assert_raises(IOError){save}
    assert_equal before,state; assert_empty @model.attributes
    assert_equal :abort,@model.operations.last[0]; assert_empty @model.undo_states
    assert_same document,@session.document
  end
  def test_partial_name_write_failure_rolls_back_first_piece
    before=state; @model.entities[0].entities[1].entities[0].fail_name_write=true
    assert_raises(IOError){save}; assert_equal before,state
    assert_empty @model.attributes; assert_equal :abort,@model.operations.last[0]
  end
  def test_alias_only_option_and_unsaved_changes_guard
    before=state;save(sync:false)
    assert_equal before,state
    assert_equal 'VF M01 Lateral',@store.read['furniture'][0]['pieces'][0]['name']
    @model.entities[0].name='M08 cambiado afuera'
    assert_raises(PlanosSanto::ExportError){save}
    assert_equal 1,@model.undo_states.length
  end
  def test_undo_and_reopen_restore_names_preferences_and_guide_together
    before=state; saved=save; reopened=Marshal.load(Marshal.dump(@model))
    assert_equal saved,PlanosSanto::GuideStore.new(reopened).read
    assert_equal 'VF M01 Lateral',reopened.entities[0].entities[0].name
    @model.undo; assert_equal before,state
    assert_equal 0,@store.read['revision']; assert_raises(PlanosSanto::ExportError){@session.check_current!}
  end
  def test_invalid_camera_offsets_prefixes_and_refs_never_write
    original=Marshal.dump(@edits)
    [-> { @edits[0]['presentation']['cameras']['front']['pitch']=90 },
     -> { @edits[0]['presentation']['dimensionOffsets'][0]['pieceId']='missing' },
     -> { @edits[0]['presentation']['dimensionOffsets']*=2 },
     -> { @edits[0]['naming']['moduleCode']='Estantería' },
     -> { @edits[0]['pieces'][0]['name']='ZZ M01 Lateral' }].each do |mutate|
      @edits=Marshal.load(original);mutate.call
      assert_raises(PlanosSanto::ExportError){save};assert_empty @model.operations
    end
    @edits=Marshal.load(original)
    assert_raises(PlanosSanto::ExportError){save(code:'V')}
    assert_empty @model.attributes
  end
  def test_group_and_pieces_share_one_operation_and_group_name_comes_from_model_after_save
    @edits[0]['groupName']='M01 Armario';before=geometry
    saved=save
    assert_equal 'M01 Armario',@model.entities[0].name
    assert_equal 'M01 Armario',@session.document['furniture'][0]['name']
    assert_equal 'VF M01 Lateral',@model.entities[0].entities[0].name
    assert_equal 1,@model.undo_states.length;assert_equal before,geometry
    refute saved['furniture'][0].key?('groupName')
    assert @session.check_current!
  end
  def test_group_and_first_piece_roll_back_when_later_piece_fails
    @edits[0]['groupName']='M01 Armario';before=state
    @model.entities[0].entities[1].entities[0].fail_name_write=true
    assert_raises(IOError){save};assert_equal before,state;assert_empty @model.attributes
    assert_equal :abort,@model.operations.last[0]
  end
  def test_group_change_requires_sync_and_respects_lock
    @edits[0]['groupName']='M01 Armario'
    assert_match(/Sincronizar nombres/,assert_raises(PlanosSanto::ExportError){save(sync:false)}.message)
    assert_empty @model.operations
    @model.entities[0].locked_for_names=true
    assert_raises(PlanosSanto::ExportError){save};assert_empty @model.operations
  end
  def test_invalid_field_reports_its_context_without_allowing_measure_edits_or_leaking_values
    @edits[0]['pieces'][0]['dimensions']='private-value'
    error=assert_raises(PlanosSanto::ExportError){save}
    assert_includes error.message,'pieza de la guía';assert_includes error.message,'dimensions'
    refute_includes error.message,'private-value';assert_empty @model.operations
    @edits[0]['pieces'][0].delete('dimensions');@edits[0]['presentation']['cameras']['front'].delete('pitch')
    error=assert_raises(PlanosSanto::ExportError){save}
    assert_includes error.message,'rotación de cámara';assert_includes error.message,'pitch';assert_empty @model.operations
  end

  def test_commit_revision_of_definition_does_not_invalidate_guide_or_second_save
    model=@model
    model.define_singleton_method(:commit_operation) do
      result=super()
      all_instances.map(&:definition).uniq.each_with_index { |definition,i| definition.guid="commit-#{undo_states.length}-#{i}" }
      result
    end
    before=geometry;save
    assert_equal before,geometry
    assert @session.check_current!
    assert @session.validate_export(@edits)
    assert_equal 2,save['revision']
    assert @session.validate_export(@edits)
  end
  def test_revision_of_definition_after_file_save_is_not_a_geometry_change
    save; fingerprint=@session.fingerprint;before=geometry
    @model.all_instances.map(&:definition).uniq.each_with_index { |definition,i| definition.guid="after-file-save-#{i}" }
    assert_equal before,geometry
    assert @session.validate_export(@edits)
    assert_equal fingerprint,@session.fingerprint
    assert_equal 2,save['revision']
  end

  def test_naming_reference_and_reviews_roundtrip_atomically_and_undo
    @edits[0]['naming']['reference']={'upAxis'=>2,'upSign'=>-1,'frontAxis'=>1,'frontSign'=>-1,'confirmed'=>true}
    @edits[0]['naming']['reviews']=[{'id'=>'1/11','proposed'=>'Lateral','base'=>'Lat'}]
    before=geometry;result=save;assert_equal @edits[0]['naming'],@store.read['furniture'][0]['naming'];assert_equal result,@store.read
    assert_equal before,geometry;assert_equal 1,@model.undo_states.length
    @model.undo;assert_equal 0,@store.read['revision'];assert_equal before,geometry
  end
  def test_invalid_front_or_review_identity_is_rejected_without_writes
    @edits[0]['naming']['reference']={'upAxis'=>2,'frontAxis'=>2,'frontSign'=>-1,'confirmed'=>true}
    assert_raises(PlanosSanto::ExportError){save};assert_empty @model.operations
    @edits[0]['naming']['reference']={'upAxis'=>2,'upSign'=>0,'frontAxis'=>1,'frontSign'=>-1,'confirmed'=>true}
    assert_raises(PlanosSanto::ExportError){save};assert_empty @model.operations
    @edits[0]['naming'].delete('reference');@edits[0]['naming']['reviews']=[{'id'=>'elsewhere','proposed'=>'Lateral','base'=>'Lat'}]
    assert_raises(PlanosSanto::ExportError){save};assert_empty @model.operations
  end

  def a4_guide
    {'mode'=>'both','hiddenPieceIds'=>['1/11'],'sharedCamera'=>true,'observations'=>"Armar sobre superficie nivelada.\nVerificar escuadra."}
  end

  def test_a4_view_configuration_persists_reopens_and_undoes_without_model_visibility_writes
    @edits[0]['presentation']['guide']=a4_guide
    # Both pieces share a board definition; the hidden path belongs only to one occurrence.
    assert_same @model.entities[0].entities[0].definition,@model.entities[0].entities[1].entities[0].definition
    original=[state,geometry,@model.all_instances.map(&:hidden?)]
    saved=save(sync:false)
    assert_equal ['1/11'],saved['furniture'][0]['presentation']['guide']['hiddenPieceIds']
    assert_equal original,[state,geometry,@model.all_instances.map(&:hidden?)]
    reopened=Marshal.load(Marshal.dump(@model))
    assert_equal saved,PlanosSanto::GuideStore.new(reopened).read
    reopened_session=PlanosSanto::NativeSession.new(reopened);reopened_session.scan
    assert reopened_session.generate(['1'])['document']
    assert_equal a4_guide,PlanosSanto::GuideStore.new(reopened).read['furniture'][0]['presentation']['guide']
    assert_equal 1,@model.undo_states.length
    @model.undo
    assert_empty @store.read['furniture']
    assert_equal original,[state,geometry,@model.all_instances.map(&:hidden?)]
  end

  def test_a4_exterior_interior_both_and_independent_camera_roundtrip
    %w[exterior interior both].each do |mode|
      @edits[0]['presentation']['guide']=a4_guide.merge('mode'=>mode,'sharedCamera'=>false)
      saved=save(sync:false)
      assert_equal mode,saved['furniture'][0]['presentation']['guide']['mode']
      assert_equal @edits[0]['presentation']['cameras'],saved['furniture'][0]['presentation']['cameras']
      refute saved['furniture'][0]['presentation']['guide']['sharedCamera']
    end
  end

  def test_a4_invalid_visibility_fields_reject_before_writing
    invalid=[{'mode'=>'back'},{'sharedCamera'=>1},{'hiddenPieceIds'=>['1/11','1/11']},
      {'hiddenPieceIds'=>['2/21']},{'hiddenPieceIds'=>['11']},{'hiddenPieceIds'=>nil},
      {'observations'=>'a'*2001},{'observations'=>"bad\x00text"},{'extra'=>true}]
    invalid.each do |change|
      @edits[0]['presentation']['guide']=a4_guide.merge(change)
      assert_raises(PlanosSanto::ExportError){save(sync:false)}
      assert_empty @model.operations
    end
    @edits[0]['presentation']['guide']=a4_guide.tap { |g| g.delete('mode') }
    assert_raises(PlanosSanto::ExportError){save(sync:false)}
    assert_empty @model.attributes
  end

  def test_a4_inherited_visibility_removes_deleted_paths_without_mutating_old_guide
    @edits[0]['presentation']['guide']=a4_guide
    save(sync:false)
    prior=@store.read;before=Marshal.dump(prior)
    document=Marshal.load(Marshal.dump(@document))
    document['furniture'][0]['children'].reject! { |node| node['id']=='1/11' }
    edits=Marshal.load(Marshal.dump(@edits))
    edits[0].delete('presentation');edits[0].delete('naming')
    edits[0]['pieces'].reject! { |piece| piece['id']=='1/11' }
    result=@store.validate(document,edits,prior)
    assert_empty result[0]['presentation']['guide']['hiddenPieceIds']
    assert_empty result[0]['presentation']['dimensionOffsets']
    assert_equal before,Marshal.dump(prior)
    assert_equal 'both',result[0]['presentation']['guide']['mode']
  end

end
