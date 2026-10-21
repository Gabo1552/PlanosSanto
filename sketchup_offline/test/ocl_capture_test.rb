# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'ocl_read_double'
require_relative '../ocl_reader'
class OclCaptureTest < Minitest::Test
  def setup; @model=OclReadFixture.prepare(Fixture.model); end
  def teardown; Object.send(:remove_const,:Ladb) if Object.const_defined?(:Ladb,false); end
  def test_public_api_capture_includes_unused_library_and_exactly_preserves_model
    before=Marshal.dump(@model)
    result=PlanosSanto::OclReader.capture(@model)
    assert_equal before,Marshal.dump(@model)
    assert result['complete'];assert result['capabilities']['whole_material_library']
    assert_equal 3,result['materials'].length;assert_equal 4,result['pieces'].length
    assert_equal '0.8mm',result['materials'].find { |m| m['category']=='edge' }['attributes_observed']['thickness']
    assert_equal '5mm',result['materials'].find { |m| m['id']=='material:77' }['attributes_observed']['length_increase']
    refute result['materials'].find { |m| m['id']=='material:889' }['applied']
    assert_equal 'version_matched_attribute',result['materials'][0]['confidence']
    assert result['pieces'].any? { |p| p['faces'].any? { |face| face['front_origin']=='inherited_instance' } }
    assert result['pieces'].any? { |p| !p['visible'] }
    refute result['production_ready']
  end
  def test_unknown_attribute_type_makes_capture_incomplete_without_writes
    @model.materials[0].ocl_attributes['std_sizes']=['unsupported array']
    before=Marshal.dump(@model);result=PlanosSanto::OclReader.capture(@model)
    refute result['complete'];assert_equal before,Marshal.dump(@model)
    assert result['issues'].any? { |i| i['code']=='unsupported_material_attribute' }
  end
  def test_material_limit_and_absent_library_are_explicit
    @model.materials=Array.new(5001,@model.materials[0])
    assert_raises(PlanosSanto::P1Diagnostics::LimitError) { PlanosSanto::OclReader.capture(@model) }
  end
end
