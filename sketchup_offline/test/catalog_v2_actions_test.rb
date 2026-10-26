# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'digest'
require_relative 'names_double'
require_relative 'ocl_read_double'
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_file);true;end
end
module Sketchup
  class << self;attr_accessor :v2_model;end
  def self.active_model;v2_model;end
end
require_relative '../build/planos_santo/offline'

# Hito 4 · MATERIALES-02/03/06 y acciones nuevas del despacho, contra el
# controlador empaquetado y dobles de SketchUp (no se abre ningún SKP).
class CatalogV2ActionsTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@old=ENV['PLANOS_SANTO_DATA_DIR'];ENV['PLANOS_SANTO_DATA_DIR']=@dir
    @model=NamesFixture.model;OclReadFixture.prepare(@model);@model.materials=[];Sketchup.v2_model=@model
    @controller=PlanosSanto::OfflineController.new;@controller.dispatch('scan',{})
  end
  def teardown;ENV['PLANOS_SANTO_DATA_DIR']=@old;FileUtils.remove_entry(@dir);end
  def dispatch(action,data={});@controller.dispatch(action,data);end
  def revision;PlanosSanto::CatalogStore.new(directory:@dir).read['revision'];end

  def test_presets_are_suggested_values_never_approved
    presets=dispatch('catalog_presets')['presets']
    # Biblioteca v4 (0.8.20): las placas sugeridas valen para todos sus espesores y los cantos para sus anchos 22 y 45.
    assert_equal %w[canto-045 canto-2 melamina-2600 melamina-2750],presets.map { |p| p['id'] }.sort
    assert_equal({'thicknessMm'=>0.45},presets.find { |p| p['id']=='canto-045' }['values'])
    library=dispatch('catalog_add_preset',{'presetId'=>'melamina-2750','name'=>'Melamina blanca','revision'=>0})
    item=library['catalog']['items'].first
    assert_equal ['sheet',nil,[3,5,12,15,18,25],2750,1830,false],item.values_at('kind','thicknessMm','thicknessesMm','lengthMm','widthMm','approved')
    assert_equal({'source'=>'preset','fields'=>%w[lengthMm widthMm],'presetId'=>'melamina-2750'},item['suggested'])
    assert_equal '',item['sku'],'El SKU nunca se sugiere.'
    edge=dispatch('catalog_add_preset',{'presetId'=>'canto-2','revision'=>1})['catalog']['items'].last
    assert_equal ['Canto 2 mm','edge',2,[0.45,2],nil,[22,45]],edge.values_at('name','kind','thicknessMm','thicknessesMm','widthMm','widthsMm')
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_add_preset',{'presetId'=>'canto-2','revision'=>2}) } # nombre repetido
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_add_preset',{'presetId'=>'inexistente','revision'=>2}) }
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_add_preset',{'presetId'=>'canto-045','revision'=>0}) } # revisión vieja
  end

  def test_thickness_variant_copies_commercial_data_as_suggestions_and_links_base
    store=PlanosSanto::CatalogStore.new(directory:@dir)
    edge=store.new_item('Canto blanco','edge').merge('sku'=>'CB','supplier'=>'QA','thicknessMm'=>0.45,'widthMm'=>22,'approved'=>true)
    sheet=store.new_item('Melamina blanca 18 mm','sheet').merge('sku'=>'MB18','supplier'=>'Maderera QA','thicknessMm'=>18,'widthMm'=>1830,'lengthMm'=>2750,'grain'=>false,'approved'=>true,'compatibleIds'=>[edge['id']],
      'price'=>{'amount'=>1,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'QA'})
    store.save([edge,sheet],0)
    # Biblioteca v4: la variante de una placa es una ficha propia (SKU propio) de ese único espesor.
    variant=dispatch('catalog_variant',{'id'=>sheet['id'],'thicknessMm'=>15,'revision'=>1})['catalog']['items'].last
    assert_equal ['Melamina blanca 15 mm',nil,[15],1830,2750,false,[edge['id']],sheet['id'],'',nil,false],
      variant.values_at('name','thicknessMm','thicknessesMm','widthMm','lengthMm','grain','compatibleIds','variantOf','sku','price','approved')
    assert_equal 'variant',variant['suggested']['source']
    second=dispatch('catalog_variant',{'id'=>variant['id'],'thicknessMm'=>25,'revision'=>2})['catalog']['items'].last
    assert_equal sheet['id'],second['variantOf'],'Variantes de variantes apuntan a la ficha base.'
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_variant',{'id'=>variant['id'],'thicknessMm'=>15,'revision'=>3}) } # ya es de 15
    assert_raises(PlanosSanto::ExportError) { dispatch('catalog_variant',{'id'=>sheet['id'],'thicknessMm'=>-1,'revision'=>3}) }
    pending=store.read['items'].last.merge('sku'=>'MB25','approved'=>true)
    saved=store.save(store.read['items'][0..-2]+[pending],3)
    refute saved['items'].last['approved'],'La marca vieja no se guarda junto a valores precargados (0.8.15 no lo leería)'
    assert PlanosSanto::CatalogStore.complete?(saved['items'].last),'Con SKU la variante ya está completa: nada que aprobar'
  end

  def test_typed_skm_commit_applies_batch_kind_and_optional_thickness_suggestion
    importer=@controller.send(:skm_importer)
    rows=[['a','Melamina Roble 18mm',{'kind'=>'sheet','thicknessMm'=>18.0,'verified'=>false}],['b','Canto Roble',{'kind'=>'edge','thicknessMm'=>nil,'verified'=>false}],['c','Otro',{'kind'=>'unknown','thicknessMm'=>nil,'verified'=>false}]].map do |id,name,suggestions|
      bytes="skm-#{id}".b
      {'id'=>id,'name'=>name,'sourceName'=>"#{id}.skm",'sha256'=>Digest::SHA256.hexdigest(bytes),'hash'=>Digest::SHA256.hexdigest(bytes),'status'=>'new','suggestions'=>suggestions,'_bytes'=>bytes}
    end
    importer.instance_variable_set(:@pending,{'token'=>'t','revision'=>0,'rows'=>rows})
    assert_raises(PlanosSanto::ExportError) { dispatch('skm_commit_typed',{'token'=>'t','selectedIds'=>%w[a b c],'revision'=>0,'confirmed'=>true,'kinds'=>{'a'=>'not_a_kind'}}) }
    result=dispatch('skm_commit_typed',{'token'=>'t','selectedIds'=>%w[a b c],'revision'=>0,'confirmed'=>true,'kinds'=>{'a'=>'sheet','b'=>'edge'},'applySuggestions'=>true})
    assert_equal 3,result['imported']
    items=result['catalog']['items'].to_h { |item| [item['name'],item] }
    # Biblioteca v4: el espesor sugerido por el nombre del SKM entra en la lista de la placa.
    assert_equal ['sheet',nil,{'source'=>'skm','fields'=>['thicknessMm'],'presetId'=>nil}],items['Melamina Roble 18mm'].values_at('kind','thicknessMm','suggested')
    assert_includes items['Melamina Roble 18mm']['thicknessesMm'],18
    assert_equal ['edge',nil,nil],items['Canto Roble'].values_at('kind','thicknessMm','suggested')
    assert_equal 'unknown',items['Otro']['kind']
    assert result['catalog']['items'].none? { |item| item['approved'] }
  end

  def test_maderera_profile_actions_round_trip_and_feed_the_order
    loaded=dispatch('maderera_profiles_load')
    assert_equal 0,loaded['profiles']['revision'];assert_equal 'finished',loaded['template']['dimensionRule']
    saved=dispatch('maderera_profile_save',{'profile'=>loaded['template'].merge('name'=>'Maderera QA','supplier'=>'QA SRL','decimal'=>','),'revision'=>0})
    profile=saved['profiles']['profiles'].first
    # Punto 24: no approval; the 0.8.15 approve action is still routed but writes nothing.
    legacy=dispatch('maderera_profile_approve',{'id'=>profile['id'],'version'=>1,'revision'=>1})
    assert_equal 1,legacy['profiles']['revision'];refute legacy['profiles']['profiles'].first.key?('approved')
    active=dispatch('maderera_profile_activate',{'id'=>profile['id'],'revision'=>1})
    assert_equal profile['id'],active['profiles']['activeId']
    @controller.instance_variable_get(:@session).generate(['1'])
    plan=dispatch('order_plan')
    assert_equal ',',plan['plan']['profile']['decimal'],'El pedido nuevo toma el formato del perfil en uso.'
  end

  def test_catalog_load_reports_pending_migration
    File.write(File.join(@dir,'catalog.json'),JSON.generate('schema'=>1,'revision'=>0,'items'=>[]))
    assert_equal({'from'=>1,'to'=>4,'pending'=>true},dispatch('catalog_load')['migration'])
    dispatch('catalog_save',{'items'=>[],'revision'=>0})
    assert_nil dispatch('catalog_load')['migration']
  end
end
