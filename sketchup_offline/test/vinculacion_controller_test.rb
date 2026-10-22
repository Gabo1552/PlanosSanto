# frozen_string_literal: true
# 0.8.17: la biblioteca resuelve sola los vínculos al cargarse; solo una ambigüedad
# real queda como aviso de un clic (material_link_resolve). Dobles de la API.
require 'minitest/autorun'
require 'tmpdir'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :management_model;end
  def self.active_model;management_model;end
end
require_relative '../build/planos_santo/offline'

class VinculacionControllerTest < Minitest::Test
  class LinkMaterial
    attr_reader :entityID,:attributes,:color
    attr_accessor :name,:texture
    def initialize(id,name);@entityID,@name=id,name;@attributes={};@color=Sketchup::Color.new(10,20,30);@texture=nil;end
    def display_name;@name;end
    def get_attribute(dict,key,default=nil);@attributes.fetch([dict,key],default);end
    def set_attribute(dict,key,value);@attributes[[dict,key]]=value;end
    def delete_attribute(dict,key);@attributes.delete([dict,key]);end
    def save_as(path);File.binwrite(path,"SKM-#{@entityID}");true;end
  end
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);Sketchup.management_model=@model
    @roble=LinkMaterial.new(901,'Roble QA');@model.materials=[@roble]
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
    @catalog=PlanosSanto::CatalogStore.new(directory:@dir)
    @item=@catalog.new_item('Roble QA','sheet');@catalog.save([@item],0)
    @notices=[];notices=@notices
    @controller.define_singleton_method(:notify_material_library_changed) { |action| notices << action }
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def binding;PlanosSanto::MaterialResolver.read_binding(@roble);end

  def test_loading_the_library_links_by_itself_once_and_reports_defaults
    library=dispatch('skm_library')
    assert_equal 1,library['autoLink']['changed']
    assert_equal @item['id'],binding['catalogId']
    assert_equal @item['id'],library['materials'].first['binding']['catalogId']
    assert_empty library['materials'].first['issues']
    assert_equal [],library['ambiguous']
    assert_equal({'sheet'=>[3,5,12,15,18,25],'edge'=>[0.45,2]},library['standardThicknessesMm'])
    assert_equal ['auto_link'],@notices
    assert_includes @model.operations.map { |row| row[1] },PlanosSanto::MaterialLibrary::AUTO_LINK_OPERATION
    again=dispatch('skm_library')
    assert_equal 0,again['autoLink']['changed'];assert_equal ['auto_link'],@notices,'Sin cambios no se avisa ni se crea otra operación'
  end

  def test_unsaved_guide_or_active_paint_defers_the_link
    @controller.instance_variable_set(:@dirty,true)
    assert dispatch('skm_library')['autoLink']['deferred'];assert_nil @roble.get_attribute('PlanosSantoMaterial','binding_v1')
    @controller.instance_variable_set(:@dirty,false)
    @controller.instance_variable_set(:@smart_state,{'active'=>true,'mode'=>'sheet'})
    assert dispatch('skm_library')['autoLink']['deferred'];assert_empty @notices
  end

  def test_two_fichas_with_the_same_name_ask_once_and_one_click_resolves
    twin=@catalog.new_item('Roble QA','edge');@catalog.save([@item,twin],1)
    library=dispatch('skm_library')
    assert_equal 0,library['autoLink']['changed'];assert_nil @roble.get_attribute('PlanosSantoMaterial','binding_v1')
    notice=library['ambiguous'].first
    assert_equal ['901','name'],notice.values_at('materialId','reason')
    assert_equal 2,notice['candidates'].length
    resolved=dispatch('material_link_resolve','materialId'=>'901','catalogId'=>twin['id'],'revision'=>2)
    assert_equal twin['id'],binding['catalogId'];assert resolved['stale']
    assert_equal ['material_link_resolve'],@notices
    assert_empty dispatch('skm_library')['ambiguous']
  end
end
