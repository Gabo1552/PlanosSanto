# frozen_string_literal: true
require 'json'
require_relative '../sketchup_offline/test/names_double'
require_relative '../sketchup_offline/test/photo_material_double'
require_relative '../sketchup/planos_santo/exporter'
require_relative '../sketchup_offline/smart_paint'
require_relative '../docs/hito1-correcciones-089/perfilar_sketchup'
board=Fixture.board_definition
board.entities.each_with_index { |face,i| face.define_singleton_method(:persistent_id) { 100+i } }
pieces=(0...1560).map do |i|
  instance=Sketchup::ComponentInstance.new(1000+i,"QA #{i}",board)
  instance.define_singleton_method(:make_unique) { raise 'Readonly profiler never isolates geometry.' };instance
end
roots=pieces.each_slice(37).each_with_index.map { |children,i| Sketchup::Group.new(i+1,"M#{i}",Sketchup::Definition.new("M#{i}","qa-root-#{i}",children)) }
model=NamingModelDouble.new(Sketchup::Model.new(roots,'profile-synthetic','Synthetic1560',''))
item={'id'=>'11111111-1111-4111-8111-000000000001','name'=>'QA','kind'=>'sheet','approved'=>true,'observed'=>{}}
material=PhotoFixture::Material.new(99999,'QA');material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,JSON.generate(PlanosSanto::MaterialResolver.binding_for(item)))
model.define_singleton_method(:materials) { [material] }
data={'schema'=>1,'revision'=>1,'items'=>[item]};catalog=Object.new;catalog.define_singleton_method(:read) { data }
request={'mode'=>'sheet','immediatePiece'=>true,'catalogId'=>item['id'],'materialUuid'=>PlanosSanto::MaterialResolver.read_binding(material)['uuid'],'targets'=>[{'pieceId'=>'1/1000','faceIds'=>['100']}]}
report=PlanosSantoPerf089.run(service:PlanosSanto::SmartPaint.new(model,catalog:catalog),request:request)
puts JSON.pretty_generate(report.merge('fixturePieces'=>1560,'fixtureOccurrences'=>1603,'nativeSketchupExecuted'=>false,'realModelOrCustomerAssets'=>false,'operationCount'=>model.operations.length))
