# frozen_string_literal: true
# Synthetic cross-runtime contract: real Ruby order/reference services, no SketchUp execution.
require 'tmpdir'
require_relative '../../sketchup/test/fake_api'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../workshop'
require_relative '../order_references'

Dir.mktmpdir('planos-order-pdf-') do |directory|
  store=PlanosSanto::CatalogStore.new(directory:directory)
  sheet=store.new_item('Placa sintetica','sheet').merge('sku'=>'QA-18','supplier'=>'Proveedor QA','thicknessesMm'=>[18],'lengthMm'=>2750,'widthMm'=>1830,'grain'=>false)
  edges=%w[ABS-A PVC-B].map { |sku| store.new_item(sku,'edge').merge('sku'=>sku,'supplier'=>'Proveedor QA','thicknessMm'=>0.45,'widthsMm'=>[22]) }
  duplicate=ARGV.include?('--same-board-sku')
  other=store.new_item('Roble QA','sheet').merge(sheet.reject { |key,_| %w[id name sourceHash].include?(key) }) if duplicate
  catalog=store.save([sheet,*edges,other].compact,0);sheet,a,b,other=catalog['items']
  pieces=[{'id'=>'qa/lateral','name'=>'Lateral','dimensions'=>[700,450,18]},{'id'=>'qa/zocalo','name'=>'Zocalo','dimensions'=>[300,250,18]}]
  nodes=pieces.map do |piece|
    {'id'=>piece['id'],'name'=>piece['name'],'children'=>[],'mesh'=>{'vertices'=>[[0,0,0],piece['dimensions']],'triangles'=>[]},
     'metadata'=>{'localBounds'=>{'min'=>[0,0,0],'max'=>piece['dimensions']},'worldTransform'=>Geom::Transformation.new.to_a,'rectangular'=>true}}
  end
  service=PlanosSanto::SupplierOrder.new({'furniture'=>[{'id'=>'qa','children'=>nodes}]},'synthetic',catalog)
  plan=service.proposal
  plan['rows'].each_with_index do |row,index|
    row.merge!('axes'=>[0,1],'frontSign'=>1,'materialId'=>duplicate && index==1 ? other['id'] : sheet['id'],'principalId'=>[a,b][index]['id'],'edgeMap'=>index.zero? ? [1,1,0,0] : [1,0,0,0])
  end
  workshop=Object.new
  workshop.define_singleton_method(:current_plan) { [service,plan] }
  workshop.define_singleton_method(:current_board_plan) { [service,plan] }
  boards=service.boards(plan)['boards']
  texts=boards.map { |board| service.board_txt(plan,board['key'])['content'].dup.force_encoding('UTF-8') }
  refs=PlanosSanto::OrderReferences.partial(nil,workshop)
  puts JSON.generate({'synthetic'=>true,'pieces'=>pieces,'boards'=>boards,'txt'=>texts.join,'references'=>refs['references'],'pending'=>refs['pending']})
end
