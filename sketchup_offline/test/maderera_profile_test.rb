# frozen_string_literal: true
require 'minitest/autorun'
require 'tmpdir'
require 'json'
require 'date'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../maderera_profile'

# Hito 4 · F-OPT-C / OPT-02 / OPT-05: perfil de maderera versionado con
# aprobación, aviso de medida útil y presupuesto en tres columnas.
class MaderaProfileTest < Minitest::Test
  def setup
    @dir=Dir.mktmpdir;@store=PlanosSanto::MaderaProfileStore.new(directory:@dir);@path=File.join(@dir,'maderera-profiles.json')
  end
  def teardown;FileUtils.remove_entry(@dir);end
  def draft(extra={})
    PlanosSanto::MaderaProfile.template.merge('name'=>'Maderera QA','supplier'=>'Maderera QA SRL').merge(extra)
  end
  def saved_profile(extra={})
    data=@store.save(draft(extra),@store.read['revision']);data['profiles'].last
  end
  def approve(profile)
    @store.approve(profile['id'],profile['version'],@store.read['revision'])['profiles'].find { |row| row['id']==profile['id'] }
  end

  def test_template_defaults_are_conservative
    t=PlanosSanto::MaderaProfile.template
    assert_equal 'finished',t['dimensionRule'],'Descontar canto viene apagado.'
    assert_equal 'utf8',t['encoding'];assert_equal '.',t['decimal']
    refute t['header'];refute t['approved'];assert_nil t['cutPrice'];assert_nil t['edgingPrice']
    assert_equal 0,t['version']
  end

  def test_save_versions_and_invalidates_approval_on_change
    profile=saved_profile
    assert_equal 1,profile['version'];refute profile['approved'];assert_match(/\A[0-9a-f]{64}\z/,profile['contentHash'])
    approved=approve(profile);assert approved['approved'];assert_equal 1,approved['version'];refute_nil approved['approvedAt']
    same=@store.save(approved.merge('approved'=>false),@store.read['revision'])['profiles'].first
    assert same['approved'],'Guardar sin cambios conserva la aprobación y la versión.';assert_equal 1,same['version']
    changed=@store.save(same.merge('kerfMm'=>4),@store.read['revision'])['profiles'].first
    assert_equal 2,changed['version'];refute changed['approved'];assert_nil changed['approvedAt']
    refute_equal approved['contentHash'],changed['contentHash']
  end

  def test_client_cannot_self_approve_or_forge_version
    profile=saved_profile
    forged=@store.save(profile.merge('approved'=>true,'version'=>99,'kerfMm'=>5),@store.read['revision'])['profiles'].first
    refute forged['approved'];assert_equal 2,forged['version']
  end

  def test_approval_requires_current_version_and_documented_edge_deduction
    profile=saved_profile
    assert_raises(PlanosSanto::ExportError) { @store.approve(profile['id'],profile['version']+1,@store.read['revision']) }
    deduct=@store.save(profile.merge('dimensionRule'=>'deduct_edge','notes'=>''),@store.read['revision'])['profiles'].first
    assert_match(/proveedor/,assert_raises(PlanosSanto::ExportError) { approve(deduct) }.message)
    documented=@store.save(deduct.merge('notes'=>'Confirmado por mail con la maderera el 21/10'),@store.read['revision'])['profiles'].first
    assert approve(documented)['approved']
  end

  def test_validation_rejects_out_of_range_and_unknown_values
    [{'kerfMm'=>-1},{'kerfMm'=>11},{'trimMm'=>51},{'wastePercent'=>101},{'wastePercent'=>'15'},{'encoding'=>'latin1'},{'decimal'=>';'},{'dimensionRule'=>'magic'},
     {'header'=>'no'},{'name'=>''},{'name'=>'x'*81},{'notes'=>"a\u0001"},{'extra'=>1},
     {'cutPrice'=>{'amount'=>10,'currency'=>'ARS','unit'=>'litro','date'=>'2026-10-01','source'=>'Lista'}},
     {'edgingPrice'=>{'amount'=>10,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista'}},
     {'cutPrice'=>{'amount'=>0,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista'}},
     {'cutPrice'=>{'amount'=>10,'currency'=>'ARS','unit'=>'placa','date'=>'2026-02-30','source'=>'Lista'}}].each do |patch|
      assert_raises(PlanosSanto::ExportError,patch.inspect) { @store.save(draft(patch),@store.read['revision']) }
    end
    assert_equal 0,@store.read['revision']
  end

  def test_activate_only_approved_and_store_is_revisioned_with_backup
    profile=saved_profile
    assert_raises(PlanosSanto::ExportError) { @store.activate(profile['id'],@store.read['revision']) }
    approve(profile);data=@store.activate(profile['id'],@store.read['revision'])
    assert_equal profile['id'],data['activeId']
    assert_equal profile['id'],@store.active['id']
    assert_raises(PlanosSanto::ExportError) { @store.save(draft,0) } # revisión vieja
    assert Dir[File.join(@dir,'backups','maderera-profiles-*.json')].length>=2
    edited=@store.save(@store.active.merge('trimMm'=>12),@store.read['revision'])
    assert_equal profile['id'],edited['activeId'];assert_nil @store.active,'Un perfil activo modificado no se usa hasta volver a aprobarlo.'
    assert_equal profile['id'],@store.active(approved_only:false)['id']
    @store.activate(nil,@store.read['revision']);assert_nil @store.read['activeId']
  end

  def test_damaged_store_is_rejected_untouched
    ['{','[]',JSON.generate('schema'=>9,'revision'=>0,'activeId'=>nil,'profiles'=>[]),JSON.generate('schema'=>1,'revision'=>0,'activeId'=>'x','profiles'=>[])].each do |content|
      File.write(@path,content)
      assert_raises(PlanosSanto::ExportError,content) { @store.read }
      assert_raises(PlanosSanto::ExportError,content) { @store.save(draft,0) }
      assert_equal content,File.read(@path)
    end
  end

  def test_manifest_reference_is_compact_and_hashes_content
    profile=approve(saved_profile)
    ref=PlanosSanto::MaderaProfile.reference(profile)
    assert_equal %w[approved contentHash dimensionRule id kerfMm name supplier trimMm version wastePercent],ref.keys.sort
    assert_equal profile['contentHash'],ref['contentHash'];assert_nil PlanosSanto::MaderaProfile.reference(nil)
  end

  def board(extra={})
    {'id'=>'b','name'=>'Melamina','sku'=>'MB18','thicknessMm'=>18,'lengthMm'=>2600,'widthMm'=>1830,'kind'=>'sheet',
     'price'=>{'amount'=>100000,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista'}}.merge(extra)
  end

  def test_usable_size_warns_without_blocking
    profile=approve(saved_profile('trimMm'=>10))
    assert_match(/útil/,PlanosSanto::MaderaProfile.usable_warning(profile,board,2600,500,false))
    assert_nil PlanosSanto::MaderaProfile.usable_warning(profile,board,2580,500,false)
    assert_nil PlanosSanto::MaderaProfile.usable_warning(profile,board,1800,2550,true),'Con giro permitido entra rotada.'
    assert_nil PlanosSanto::MaderaProfile.usable_warning(nil,board,2600,500,false)
  end

  def test_edge_deduction_uses_edge_thickness_only_when_enabled
    finished=approve(saved_profile)
    edges=[0.45,2,nil,0.45] # arriba, abajo, izquierda, derecha
    assert_equal [700,450],PlanosSanto::MaderaProfile.cut_size(finished,700,450,edges)
    deduct=approve(@store.save(finished.merge('dimensionRule'=>'deduct_edge','notes'=>'Confirmado con la maderera por escrito'),@store.read['revision'])['profiles'].first)
    assert_equal [699.55,447.55],PlanosSanto::MaderaProfile.cut_size(deduct,700,450,edges)
    assert_equal [700,450],PlanosSanto::MaderaProfile.cut_size(nil,700,450,edges)
  end

  def test_budget_has_net_waste_purchase_columns_and_separate_services
    profile=approve(saved_profile('wastePercent'=>20,'kerfMm'=>0,'trimMm'=>0,
      'cutPrice'=>{'amount'=>3000,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista QA'},
      'edgingPrice'=>{'amount'=>500,'currency'=>'ARS','unit'=>'metro','date'=>'2026-10-01','source'=>'Lista QA'}))
    sheet=board('lengthMm'=>2000,'widthMm'=>1000) # 2 m2 por placa
    edge={'id'=>'e','name'=>'Canto','sku'=>'C22','kind'=>'edge','price'=>{'amount'=>200,'currency'=>'ARS','unit'=>'metro','date'=>'2026-10-01','source'=>'Lista'}}
    pieces=[{'materialId'=>'b','base'=>1000,'height'=>1000,'edges'=>{'e'=>2.0}},{'materialId'=>'b','base'=>1000,'height'=>1000,'edges'=>{'e'=>2.0}},
            {'materialId'=>'b','base'=>1000,'height'=>1000,'edges'=>{}}] # 3 m2 netos
    budget=PlanosSanto::MaderaProfile.budget(profile,pieces,{'b'=>sheet,'e'=>edge},today:Date.new(2026,10,10))
    row=budget['materials'].find { |line| line['materialId']=='b' }
    assert_in_delta 3.0,row['netQuantity'];assert_in_delta 3.6,row['wasteQuantity'];assert_equal 2,row['purchaseQuantity'];assert_equal 'placa',row['purchaseUnit']
    assert_in_delta 150000,row['netAmount'];assert_in_delta 180000,row['wasteAmount'];assert_in_delta 200000,row['purchaseAmount']
    edge_row=budget['materials'].find { |line| line['materialId']=='e' }
    assert_in_delta 4.0,edge_row['netQuantity'];assert_in_delta 4.8,edge_row['wasteQuantity'];assert_equal 5,edge_row['purchaseQuantity']
    assert_in_delta 1000,edge_row['purchaseAmount']
    assert_in_delta 150800,budget['totals']['net']['ARS']
    assert_in_delta 180960,budget['totals']['waste']['ARS']
    assert_in_delta 201000,budget['totals']['purchase']['ARS']
    cut=budget['services'].find { |line| line['kind']=='cut' };edging=budget['services'].find { |line| line['kind']=='edging' }
    assert_equal 2,cut['quantity'];assert_in_delta 6000,cut['amount']
    assert_in_delta 4.0,edging['quantity'];assert_in_delta 2000,edging['amount']
    assert_in_delta 8000,budget['servicesTotals']['ARS']
    assert budget['estimated'];refute budget['optimized'];assert_equal 20,budget['wastePercent']
  end

  def test_budget_keeps_pending_and_stale_prices_out_of_totals
    profile=approve(saved_profile('wastePercent'=>0,'trimMm'=>0,'kerfMm'=>0,'cutPrice'=>{'amount'=>10,'currency'=>'ARS','unit'=>'pieza','date'=>'2026-01-01','source'=>'Vieja'}))
    pieces=[{'materialId'=>'b','base'=>1000,'height'=>1000,'edges'=>{}}]
    budget=PlanosSanto::MaderaProfile.budget(profile,pieces,{'b'=>board('price'=>nil)},today:Date.new(2026,10,10))
    row=budget['materials'].first;assert_equal 'price_pending',row['status'];assert_nil row['purchaseAmount'];assert_empty budget['totals']['purchase']
    assert_equal 'stale_price',budget['services'].first['status'];assert_empty budget['servicesTotals']
    refute budget['services'].any? { |line| line['kind']=='edging' },'Sin tarifa de canteado no se inventa la línea.'
  end

  def test_whitespace_only_edits_and_partial_input_do_not_create_versions_or_nils
    profile=approve(saved_profile)
    same=@store.save({'id'=>profile['id'],'name'=>"  #{profile['name']} "},@store.read['revision'])['profiles'].first
    assert same['approved'];assert_equal 1,same['version']
    partial=@store.save({'id'=>profile['id'],'kerfMm'=>4},@store.read['revision'])['profiles'].first
    assert_equal [4,15,10],partial.values_at('kerfMm','wastePercent','trimMm');assert_equal 2,partial['version']
    huge=draft('cutPrice'=>{'amount'=>1e300,'currency'=>'ARS','unit'=>'placa','date'=>'2026-10-01','source'=>'Lista'})
    assert_raises(PlanosSanto::ExportError) { @store.save(huge,@store.read['revision']) }
  end

  def test_trim_larger_than_board_leaves_sheets_pending_and_warns
    profile=approve(saved_profile('trimMm'=>50))
    small={'id'=>'b','name'=>'Retazo','sku'=>'R','lengthMm'=>90,'widthMm'=>90,'price'=>nil}
    assert_match(/no deja medida útil/,PlanosSanto::MaderaProfile.usable_warning(profile,small,50,50,false))
    row=PlanosSanto::MaderaProfile.budget(profile,[{'materialId'=>'b','base'=>50,'height'=>50,'edges'=>{}}],{'b'=>small})['materials'].first
    assert_nil row['purchaseQuantity'];assert_equal 'size_pending',row['status']
    assert_equal [10,20],PlanosSanto::MaderaProfile.cut_size(nil,10,20,[1])
  end
end
