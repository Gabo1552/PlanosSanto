# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'names_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file); true; end
end
module Sketchup
  class << self; attr_writer :names_test_model; end
  def self.active_model; @names_test_model; end
end
require_relative '../build/planos_santo/offline'

class NamesControllerTest < Minitest::Test
  def setup
    @model=NamesFixture.model;Sketchup.names_test_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
  end
  def payload
    p=@controller.dispatch('names_preview',{'rootId'=>'1'})
    {'token'=>p['token'],'name'=>'Alacena Superior','prefix'=>'AS','bases'=>p['rows'].select { |r| r['role']=='piece' }.to_h { |r| [r['id'],r['base']] }}
  end
  def test_pending_guide_edits_and_active_model_change_block_names_before_writing
    data=payload
    @controller.instance_variable_set(:@dirty,true)
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('names_apply',data) }
    @controller.instance_variable_set(:@dirty,false);Sketchup.names_test_model=NamesFixture.model
    assert_raises(PlanosSanto::ExportError) { @controller.dispatch('names_apply',data) }
    assert_empty @model.operations
  end
  def test_no_changes_keeps_generated_document_and_avoids_rescan
    @controller.dispatch('names_apply',payload)
    @controller.dispatch('scan',{}) # ARQ-02: the operator reanalyzes before generating again.
    p=payload;@controller.dispatch('generate',{'ids'=>['1']})
    session=@controller.instance_variable_get(:@session);doc=session.document
    # Use the reviewed values (AS) to make an idempotent request.
    result=@controller.dispatch('names_apply',p)
    assert result['noChanges'];assert_same doc,session.document;refute result.key?('scan')
    assert_equal 1,@model.operations.count { |op| op[0]==:start }
  end
  # ARQ-02: applied names mark the analysis stale; no rescan follows the commit.
  def test_names_applied_mark_analysis_stale_without_rescanning
    data=payload;session=@controller.instance_variable_get(:@session)
    def session.scan; raise PlanosSanto::ExportError,'synthetic rescan must not run'; end
    result=@controller.dispatch('names_apply',data)
    assert result['stale'];refute result.key?('refreshWarning');refute_same session,@controller.instance_variable_get(:@session)
    assert_equal 'Alacena Superior',@model.entities[0].name
    assert_equal :commit,@model.operations.last[0];refute result.key?('scan')
  end
  def test_saving_skp_is_explicit_and_optional_and_never_called_when_disabled
    @model.define_singleton_method(:path) { '/synthetic/not-a-real-file.skp' }
    calls=[]
    @model.define_singleton_method(:save) { |path| calls << path; true }
    generated=@controller.dispatch('generate',{'ids'=>['1']})
    pieces=[]
    PlanosSanto::Exporter.each_node(generated['document']['furniture']) do |n|
      pieces << {'id'=>n['id'],'name'=>n['name'],'code'=>"P#{(pieces.length+1).to_s.rjust(2,'0')}"} if n['mesh']
    end
    edit={'id'=>'1','explosion'=>0.45,'zoom'=>1,'pieces'=>pieces,'notes'=>[]}
    saved=@controller.dispatch('save',{'furniture'=>[edit],'revision'=>0,'saveFile'=>false})
    refute saved['modelSaved'];assert_empty calls
    again=@controller.dispatch('save',{'furniture'=>[edit],'revision'=>1,'saveFile'=>true})
    assert again['modelSaved'];assert_equal ['/synthetic/not-a-real-file.skp'],calls
  end

end
