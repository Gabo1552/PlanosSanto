# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require_relative 'fake_api'
require_relative '../planos_santo/exporter'

class ExporterTest < Minitest::Test
  def setup
    @model=Fixture.model;@exporter=PlanosSanto::Exporter.new(@model);@tree=@exporter.tree
  end
  def document(ids=['1','2']);@exporter.document(@tree,ids);end
  def test_recursion_instances_units_rotation_and_hierarchy
    doc=document
    assert_equal 2,doc['furniture'].length
    first=doc['furniture'][0]
    assert_equal '1/13/12',first['children'][1]['children'][0]['id']
    assert_equal '2/13/12',doc['furniture'][1]['children'][1]['children'][0]['id']
    assert_equal [609.5999999999999,406.4,19.049999999999997],first['children'][0]['metadata']['dimensionsMm']
    dimensions=first['children'][1]['children'][0]['metadata']['dimensionsMm']
    [609.6,406.4,19.05].zip(dimensions).each { |expected,actual| assert_in_delta expected,actual,1e-8 }
    assert_in_delta 2540.0,first['transform'][12],1e-8
    assert first['children'][0]['metadata']['rectangular']
    assert_equal false,first['children'][1]['children'][0]['metadata']['effectiveVisible']
    assert_equal 'Jade synthetic',first['children'][0]['mesh']['faceMaterials'][0]['front']['name']
  end
  def test_read_only_and_stable_ids
    before=Marshal.dump(@model)
    one=document;two=@exporter.document(@exporter.tree,['1','2'])
    assert_equal one['furniture'],two['furniture']
    assert_equal before,Marshal.dump(@model)
  end
  def test_nested_root_preserves_world_transform
    doc=document(['1/13'])
    assert_equal '1/13',doc['furniture'][0]['id']
    assert_in_delta 2540.0,doc['furniture'][0]['transform'][12],1e-8
    assert_equal ['1','13'],doc['furniture'][0]['metadata']['instancePath']
  end
  def test_selection_validation
    assert_raises(PlanosSanto::ExportError) { document([]) }
    assert_raises(PlanosSanto::ExportError) { document(['1','1/13']) }
    assert_raises(PlanosSanto::ExportError) { document(['missing']) }
  end
  def test_furniture_count_limit_is_500
    # 101 to 500 pass the count check (these ids do not exist, so the error is a different one).
    error=assert_raises(PlanosSanto::ExportError) { document(Array.new(101) { |i| "falta-#{i}" }) }
    refute_match(/muebles/,error.message)
    error=assert_raises(PlanosSanto::ExportError) { document(Array.new(501) { |i| "falta-#{i}" }) }
    assert_match(/Elegí entre 1 y 500 muebles/,error.message)
  end
  def test_reflection_and_non_uniform_scale
    @model.entities[0].transformation=Geom::Transformation.scale(-2,3,1)
    doc=@exporter.document(@exporter.tree,['1/11'])
    assert_in_delta 1219.2,doc['furniture'][0]['metadata']['dimensionsMm'][1],1e-8
    assert_in_delta 1219.2,doc['furniture'][0]['metadata']['dimensionsMm'][0],1e-8
    assert_raises(PlanosSanto::ExportError) { @exporter.document(@exporter.tree,['1/13']) } # accumulated shear with 45° child
  end
  def test_shear_blocks_selected_piece_but_keeps_review_possible
    a=Geom::Transformation.new.to_a;a[4]=0.3
    @model.entities[0].definition.entities[0].transformation=Geom::Transformation.new(a)
    tree=@exporter.tree
    assert_match(/sesgada/,tree['roots'][0]['children'][0]['metadata']['errors'].join)
    assert_raises(PlanosSanto::ExportError) { @exporter.document(tree,['1']) }
  end
  def test_zero_scale_and_unclosed_geometry_are_not_silently_trusted
    @model.entities[0].definition.entities[0].transformation=Geom::Transformation.scale(0,1,1)
    assert_raises(PlanosSanto::ExportError) { @exporter.document(@exporter.tree,['1']) }
    model=Fixture.model;model.entities[0].definition.entities[0].definition.entities.pop
    exporter=PlanosSanto::Exporter.new(model);tree=exporter.tree
    refute tree['roots'][0]['children'][0]['metadata']['rectangular']
    assert_match(/No es un sólido/,tree['roots'][0]['children'][0]['metadata']['warnings'].join)
  end
  def test_local_bundle_hash_csv_and_no_overwrite
    Dir.mktmpdir do |dir|
      file=File.join(dir,'mueble.planos-santo.json');doc=document
      report=PlanosSanto::Exporter.write_bundle(doc,file)
      assert_equal Digest::SHA256.file(file).hexdigest,report['sha256']
      assert_equal 4,report['pieces']
      assert_equal doc,JSON.parse(File.read(file))
      assert_equal 5,CSV.read(file.sub(/\.json$/,'.medidas.csv')).length
      assert_raises(PlanosSanto::ExportError) { PlanosSanto::Exporter.write_bundle(doc,file) }
    end
  end
end
