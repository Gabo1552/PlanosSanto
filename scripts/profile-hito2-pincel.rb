# frozen_string_literal: true
# Hito 2 (PINTURA-09) synthetic baseline: hover and click of the immediate
# painter over ~500 pieces built with the API DOUBLES of the Ruby suite. It is
# NOT a SketchUp measurement; it only shows the Ruby cost of the plan/commit path
# so a regression is visible before the native run (target < 150 ms per click).
# Run: LANG=C.UTF-8 ruby scripts/profile-hito2-pincel.rb
require 'json'
require 'minitest'
# Reuse the suite fixtures without running the suite.
module Minitest;def self.autorun;end;end
require_relative '../sketchup_offline/test/hito2_pincel_test'

class Hito2Profile
  include Hito2Fixture
  MODULES=125;COPIES=4 # 125 modules x 4 equal doors = 500 pieces
  def build
    build_fixture(doors:1);paint_sheet_on_board!
    @doors=[];roots=[]
    MODULES.times do |m|
      board=Fixture.board_definition;board.entities.each_with_index { |face,i| id=100+i;face.define_singleton_method(:persistent_id) { id } }
      board=Sketchup::Definition.new("Puerta M#{m}","board-#{m}",board.entities)
      board.entities.first(2).each { |face| face.material=@sheet;face.back_material=@sheet }
      doors=(1..COPIES).map { |i| Sketchup::ComponentInstance.new(10_000+m*10+i,"Puerta #{m}.#{i}",board,Geom::Transformation.translation(i*30,m*20,0)) }
      doors.each { |door| enable_unique(door) };@doors.concat(doors)
      roots << Sketchup::Group.new(m+1,"M#{m}",Sketchup::Definition.new("M#{m}","mod-#{m}",doors))
    end
    @model=Hito2ModelDouble.new(Sketchup::Model.new(roots,'hito2-profile','Perfil Hito 2 sintético',''))
    @model.materials=[@sheet,@edge]
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
  end
  def root_of(door);@model.entities.find { |root| root.definition.entities.include?(door) };end
  def at(door,index=2);face=door.definition.entities[index];@picker.path=[root_of(door),door,face];@picker.leaf=face;end
  def ms;start=Process.clock_gettime(Process::CLOCK_MONOTONIC);yield;((Process.clock_gettime(Process::CLOCK_MONOTONIC)-start)*1000).round(2);end
  def stats(samples);sorted=samples.sort;{'n'=>sorted.length,'p50'=>sorted[sorted.length/2],'p95'=>sorted[(sorted.length*0.95).ceil-1],'max'=>sorted.last};end
  def run
    build;report={}
    build_tool(tool_options('edge',edgeCount:4))
    report['hoverFirstMs']=stats(@doors.first(40).map { |door| at(door);ms { @tool.onMouseMove(0,40,50,@view) } })
    report['hoverCachedMs']=stats(@doors.first(40).map { |door| at(door);@tool.instance_variable_set(:@hit_key,nil);ms { @tool.onMouseMove(0,40,50,@view) } })
    report['clickEdge4UniqueMs']=stats(@doors.each_slice(COPIES).first(20).map { |row| at(row[0]);ms { @tool.onLButtonDown(0,40,50,@view) } })
    build_tool(tool_options('sheet'))
    @edge_free=@doors.each_slice(COPIES).drop(20).first(20).map(&:first)
    @model.materials << (@other=material(993,SHEET.merge('id'=>'33333333-3333-3333-3333-333333333333','name'=>'Roble'),Sketchup::Color.new(120,80,50)))
    @catalog.read['items'] << SHEET.merge('id'=>'33333333-3333-3333-3333-333333333333','name'=>'Roble')
    other=binding_of(@other)
    @tool.update_options(tool_options('sheet','catalogId'=>other['catalogId'],'materialUuid'=>other['uuid']))
    report['clickSheetUniqueMs']=stats(@edge_free.map { |door| at(door,0);ms { @tool.onLButtonDown(0,40,50,@view) } })
    @tool.update_options(tool_options('sheet','catalogId'=>other['catalogId'],'materialUuid'=>other['uuid'],'scope'=>'all','allowShared'=>true))
    report['clickSheetAllCopiesMs']=stats(@doors.each_slice(COPIES).drop(40).first(20).map { |row| at(row[0],0);ms { @tool.onLButtonDown(0,40,50,@view) } })
    errors=@events.map { |event| event['error'] }.compact.uniq
    report.merge('pieces'=>@doors.length,'copiesPerDefinition'=>COPIES,'undoEntries'=>@model.undo_states.length,'toolErrors'=>errors,
                 'nativeSketchupExecuted'=>false,'note'=>'Dobles de la API; no reemplaza la medición en SketchUp 2026 (VALIDACION_SKETCHUP.md, PINTURA-09).')
  end
end
puts JSON.pretty_generate(Hito2Profile.new.run)
