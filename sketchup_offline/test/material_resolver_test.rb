# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../ocl_reader'
require_relative '../material_resolver'
require_relative '../workshop'
require_relative 'ocl_read_double'

class MaterialResolverTest < Minitest::Test
  R=PlanosSanto::OclReader
 def material(id,type);{'id'=>id,'name'=>'Color/nombre sin significado','color_rgb'=>[1,1,1],'opencutlist_observed'=>{'type'=>type}};end
 def diagnostic
  vertices=[[0,0,0],[700,0,0],[700,450,0],[0,450,0],[0,0,18],[700,0,18],[700,450,18],[0,450,18]]
  faces=[[[0,3,2,1],[0,0,-1],'board'],[[4,5,6,7],[0,0,1],'board'],[[0,1,5,4],[0,-1,0],'board'],[[3,7,6,2],[0,1,0],'edge-a'],[[0,4,7,3],[-1,0,0],'edge-b'],[[1,2,6,5],[1,0,0],'board']].each_with_index.map do |(indices,normal,paint),i|
   area=normal[2]!=0 ? 700*450 : normal[0]!=0 ? 450*18 : 700*18
   {'id'=>"face-#{i}",'normal_local'=>normal,'vertices_mm'=>indices.map { |j| vertices[j] },'triangles'=>[[0,1,2],[0,2,3]],'loops'=>[],'area_mm2_local'=>area,'edge_ids'=>[],'visible'=>true,'front_material_id'=>paint,'back_material_id'=>nil}
  end
  {'schema'=>PlanosSanto::P1Diagnostics::SCHEMA,'complete'=>true,'sketchup_version'=>'2026-DOUBLE','exported_at'=>'2026-10-19T00:00:00Z','model_guid'=>'synthetic','issues'=>[],
   'opencutlist'=>{'namespace_present'=>true,'version'=>'7.1.0','build'=>'202511301621'},'materials'=>[material('board',2),material('edge-a',4),material('edge-b',4)],'root_geometry'=>{'faces'=>[],'edges'=>[]},
   'definitions'=>[{'id'=>'def','name'=>'Componente#1','geometry'=>{'faces'=>faces,'edges'=>[],'bounds_mm_local_direct_faces'=>[[0,0,0],[700,450,18]]}}],
   'instances'=>[{'path'=>%w[1 11],'definition_id'=>'def','name'=>'','material_id'=>nil,'effective_material_id'=>'board','visible'=>true,'world_transform'=>Geom::Transformation.new.to_a,'local_transform'=>Geom::Transformation.new.to_a,'axis_lengths_mm'=>[700,450,18],'orientation'=>{'mirrored'=>false,'sheared'=>false,'singular'=>false}}]}
 end
 def setup
  @input=diagnostic;@report=R.from_diagnostic(@input)
  @g={'bounds'=>{'min'=>[0,0,0],'max'=>[700,450,18]},'mirrored'=>false,'rectangular'=>true}
  @row={'id'=>'1/11','axes'=>[0,1],'frontSign'=>1,'flipX'=>false,'flipY'=>false,'principalId'=>'cat-a','secondaryId'=>'cat-b','edgeMap'=>[1,0,2,0],'edgeBindings'=>[{'observedId'=>'edge-a','catalogId'=>'cat-a'},{'observedId'=>'edge-b','catalogId'=>'cat-b'}]}
  @catalog={'items'=>[{'id'=>'cat-a','kind'=>'edge','approved'=>true},{'id'=>'cat-b','kind'=>'edge','approved'=>true}]}
 end
 def map(row=@row,g=@g,report=@report)
  R.projected_edges(report,row,g)['sides'].map { |side| side['status']=='unresolved' ? '?' : side['materialIds'].first || 'none' }
 end

  M = PlanosSanto::MaterialResolver
  def item(id, kind)
    {'id'=>id,'kind'=>kind,'sku'=>id,'supplier'=>'Taller','thicknessMm'=>kind=='sheet' ? 18 : 0.8,
     'widthMm'=>kind=='sheet' ? 1830 : 22,'lengthMm'=>kind=='sheet' ? 2600 : nil,
     'grain'=>false,'compatibleIds'=>[],'approved'=>true,'price'=>nil,'updatedAt'=>'today','sourceHash'=>'old'}
  end
  def native_source(material,item)
    material['planos_santo_observed']={'status'=>'valid','binding'=>M.binding_for(item)}
  end
  def native_input
    input=diagnostic
    input['opencutlist']={'namespace_present'=>false,'version'=>nil,'build'=>nil}
    @native_items=[item('11111111-1111-4111-8111-111111111111','sheet'),item('22222222-2222-4222-8222-222222222222','edge'),item('33333333-3333-4333-8333-333333333333','edge')]
    @native_items[0]['compatibleIds']=@native_items[1..].map { |edge| edge['id'] }
    input['materials'].zip(@native_items).each { |material,commercial| native_source(material,commercial); material['opencutlist_observed']={} }
    input
  end
  def test_binding_strict_roundtrip_and_read_is_pure
    commercial=item('11111111-1111-4111-8111-111111111111','sheet')
    binding=M.binding_for(commercial)
    reads=[]; material=Object.new
    material.define_singleton_method(:get_attribute) { |dict,key,fallback| reads << [dict,key,fallback]; JSON.generate(binding) }
    assert_equal binding,M.read_binding(material)
    assert_equal [[M::DICT,M::KEY,nil]],reads
    assert_equal 'valid',M.observe_binding(material)['status']
    binding['surprise']='x';assert_raises(ArgumentError) { M.read_binding(material) }
    assert_equal 'invalid',M.observe_binding(material)['status']
    material.define_singleton_method(:get_attribute) { |*_| nil };assert_nil M.read_binding(material)
    material.define_singleton_method(:get_attribute) { |*_| '{broken' };assert_raises(ArgumentError) { M.read_binding(material) }
    material.define_singleton_method(:get_attribute) { |*_| 'x'*4097 };assert_equal 'invalid',M.observe_binding(material)['status']
  end
  def test_fingerprint_tracks_commercial_geometry_and_compatibility_not_price_display_or_approval
    a=item('11111111-1111-4111-8111-111111111111','sheet')
    expected=M.item_fingerprint(a)
    b=a.merge('price'=>{'amount'=>900},'approved'=>false,'updatedAt'=>'later','sourceHash'=>'new','name'=>'Another name','favorite'=>true)
    assert_equal expected,M.item_fingerprint(b)
    %w[kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds].each do |key|
      changed=a.merge(key=>key=='compatibleIds' ? ['new-edge'] : key=='grain' ? true : key=='thicknessMm' ? 19 : 'other')
      refute_equal expected,M.item_fingerprint(changed),key
    end
    assert_equal M.item_fingerprint(a.merge('compatibleIds'=>%w[b a])),M.item_fingerprint(a.merge('compatibleIds'=>%w[a b]))
  end
  def test_native_faces_work_without_ocl_and_rotations_keep_local_side_identity
    input=native_input
    before=Marshal.dump(input)
    [0,Math::PI/2,Math::PI].each do |angle|
      input['instances'][0]['world_transform']=Geom::Transformation.rotation_z(angle).to_a
      report=R.from_diagnostic(input)
      assert report['capabilities']['material_types']
      assert_equal %w[sheet edge edge],report['materials'].map { |m| m['category'] }
      assert_equal %w[edge-a none edge-b none],map(@row,@g,report)
      assert_equal %w[edge-a none none edge-b],map(@row,@g.merge('mirrored'=>true),report)
      assert_equal @native_items[1]['id'],R.projected_edges(report,@row,@g)['materials'].find { |m| m['id']=='edge-a' }['native_binding']['catalogId']
    end
    input['instances'][0]['world_transform']=Geom::Transformation.new.to_a
    assert_equal before,Marshal.dump(input)
  end
  def test_native_and_verified_legacy_coexist_but_unknown_local_face_stays_blocking
    input=native_input
    input['opencutlist']=diagnostic['opencutlist']
    input['materials'][2].delete('planos_santo_observed'); input['materials'][2]['opencutlist_observed']={'type'=>4}
    report=R.from_diagnostic(input)
    assert_equal %w[native_binding native_binding version_matched_attribute],report['materials'].map { |m| m['confidence'] }
    assert_equal %w[edge-a none edge-b none],map(@row,@g,report)
    input['opencutlist']['namespace_present']=false
    assert_equal %w[edge-a none ? none],map(@row,@g,R.from_diagnostic(input))
  end
  def test_conflicting_ocl_types_block_even_when_plugin_not_loaded_and_invalid_own_cannot_fallback
    input=native_input
    input['materials'][1]['opencutlist_observed']={'type'=>2}
    report=R.from_diagnostic(input)
    assert_equal 'conflict',report['materials'][1]['native_status']
    assert_equal '?',map(@row,@g,report)[0]
    input['opencutlist']=diagnostic['opencutlist']
    input['materials'][1]['opencutlist_observed']={'type'=>4}
    input['materials'][1]['planos_santo_observed']={'status'=>'invalid','error'=>'broken'}
    assert_equal '?',map(@row,@g,R.from_diagnostic(input))[0]
  end
  def test_native_observed_cannot_be_rebound_to_other_sku_or_changed_catalog_geometry
    input=native_input; report=R.from_diagnostic(input)
    catalog={'items'=>@native_items};row=@row.merge('principalId'=>@native_items[1]['id'],'secondaryId'=>@native_items[2]['id'],
      'edgeBindings'=>[{'observedId'=>'edge-a','catalogId'=>@native_items[1]['id']},{'observedId'=>'edge-b','catalogId'=>@native_items[2]['id']}])
    assert R.verify_edge_mapping(report,row,@g,catalog)
    wrong=Marshal.load(Marshal.dump(row));wrong['edgeBindings'][0]['catalogId']=@native_items[2]['id']
    assert_raises(PlanosSanto::ExportError) { R.verify_edge_mapping(report,wrong,@g,catalog) }
    @native_items[1]['widthMm']=23
    assert_raises(PlanosSanto::ExportError) { R.verify_edge_mapping(report,row,@g,catalog) }
  end
  def native_service
    report=R.from_diagnostic(native_input)
    catalog={'revision'=>1,'items'=>@native_items}
    workshop=PlanosSanto::Workshop.allocate
    node={'id'=>'1/11','name'=>'Panel','children'=>[],'mesh'=>{'vertices'=>[[0,0,0],[700,450,18]],'triangles'=>[]},'metadata'=>{'localBounds'=>@g['bounds'],'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>true}}
    service=PlanosSanto::SupplierOrder.new({'furniture'=>[node]},'test-native',catalog,
      source_review:lambda { |row,geometry| workshop.verify_native_source(report,row,geometry,catalog) },
      edge_review:lambda { |row,geometry| R.verify_edge_mapping(report,row,geometry,catalog) },
      material_proposal:lambda { |id| workshop.native_proposal(report,id,catalog) })
    [service,report,catalog]
  end
  def completed_native_draft(service)
    draft=service.proposal
    draft['rows'][0].merge!('axes'=>[0,1],'frontSign'=>1,'principalId'=>@native_items[1]['id'],'secondaryId'=>@native_items[2]['id'],
      'edgeMap'=>[1,0,2,0],'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted',
      'orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,
      'reviewNote'=>'Medidas terminadas verificadas','edgeResolution'=>'manual','edgeOverrideReason'=>'Inspección física documentada')
    draft
  end
  def test_native_order_proposes_material_bindings_but_no_axes_roles_or_confirmations
    service,=native_service
    row=service.proposal['rows'].first
    assert_equal @native_items[0]['id'],row['materialId']
    assert_equal @native_items[1..].map { |edge| edge['id'] },row['edgeBindings'].map { |binding| binding['catalogId'] }
    assert_nil row['axes'];assert_nil row['frontSign'];assert_nil row['principalId'];assert_nil row['secondaryId']
    %w[orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed grainConfirmed].each { |key| refute row[key] }
  end
  def test_manual_override_cannot_substitute_native_sheet_or_bypass_conflicts
    service,report,catalog=native_service;draft=completed_native_draft(service)
    assert service.validate(draft)
    alternate=@native_items[0].merge('id'=>'44444444-4444-4444-8444-444444444444','sku'=>'other-board')
    catalog['items'] << alternate;draft['rows'][0]['materialId']=alternate['id']
    error=assert_raises(PlanosSanto::ExportError) { service.validate(draft) };assert_match(/placa elegida/,error.message)
    draft['rows'][0]['materialId']=@native_items[0]['id'];report['materials'][1]['native_status']='conflict'
    error=assert_raises(PlanosSanto::ExportError) { service.validate(draft) };assert_match(/conflicto/,error.message)
  end
  def test_manual_override_cannot_hide_native_edge_change_or_catalog_revision
    service,report,catalog=native_service;draft=completed_native_draft(service)
    draft['rows'][0]['edgeMap']=[0,0,0,0]
    error=assert_raises(PlanosSanto::ExportError) { service.validate(draft) };assert_match(/mapa manual/,error.message)
    draft['rows'][0]['edgeMap']=[1,0,2,0];catalog['items'][0]['sku']='new-sku'
    error=assert_raises(PlanosSanto::ExportError) { service.validate(draft) };assert_match(/vínculo/,error.message)
  end
  def test_nine_column_export_keeps_native_roles_and_physical_identity
    service,=native_service;draft=completed_native_draft(service)
    Dir.mktmpdir do |directory|
      result=service.export(draft,directory)
      text=File.binread(File.join(result['directory'],'lote-01.txt'))
      columns=text.strip.split("\t");assert_equal 9,columns.size;assert_equal %w[1 700 450 Panel 0 1 0 2 0],columns
      manifest=JSON.parse(File.read(File.join(result['directory'],'manifest.json')))
      assert_equal ['1/11'],manifest['lots'][0]['physicalIds'];refute manifest['production_ready']
    end
  end
  def test_actual_scanner_observes_own_dictionary_readonly_with_no_ocl_namespace
    model=OclReadFixture.prepare(Fixture.model)
    Object.send(:remove_const,:Ladb) if Object.const_defined?(:Ladb,false)
    material=model.materials.first
    binding=JSON.generate(M.binding_for(item('11111111-1111-4111-8111-111111111111','sheet')))
    # Singleton reader models persisted SKP metadata, without enabling any setter.
    material.define_singleton_method(:get_attribute) do |dict,key,fallback=nil|
      dict==M::DICT && key==M::KEY ? binding : (dict=='ladb_opencutlist' ? (ocl_attributes||{}).fetch(key,fallback) : fallback)
    end
    before=JSON.generate(PlanosSanto::P1Diagnostics::Scanner.new(model).scan)
    report=R.capture(model)
    after=JSON.generate(PlanosSanto::P1Diagnostics::Scanner.new(model).scan)
    stable=lambda { |text| JSON.parse(text).reject { |key,_| key=='exported_at' } }
    assert_equal stable.call(before),stable.call(after)
    observed=report['materials'].find { |entry| entry['id']=="material:#{material.entityID}" }
    assert_equal 'sheet',observed['category']
    assert_equal 'native_binding',observed['confidence']
    assert_equal '11111111-1111-4111-8111-111111111111',observed['native_binding']['catalogId']
    assert report['capabilities']['material_types']
  end
  def test_serialized_diagnostic_reopen_preserves_native_binding_without_mutations
    input=native_input;bytes=JSON.generate(input)
    report=R.from_diagnostic(JSON.parse(bytes));again=R.from_diagnostic(JSON.parse(bytes))
    assert_equal report,again
    assert_equal bytes,JSON.generate(input)
    assert_equal %w[edge-a none edge-b none],map(@row,@g,again)
  end
end
