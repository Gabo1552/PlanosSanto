# frozen_string_literal: true
require 'json'
require_relative 'names_double'

# CANTOS-04: one furniture with five boards (609,6 × 406,4 × 19,05 mm) whose order rows carry the
# asymmetric edge maps of tests/offline/fixtures/cantos-asimetricos.json. Synthetic only; never a SKP.
module CantosFixture
  PIECES=JSON.parse(File.read(File.expand_path('../../tests/offline/fixtures/cantos-asimetricos.json',__dir__)))['pieces']
  def self.model
    board=Fixture.board_definition
    pieces=PIECES.each_index.map { |i| Sketchup::ComponentInstance.new(31+i,"Pieza asimétrica #{i+1}",board,Geom::Transformation.translation(30*i,0,0)) }
    root=Sketchup::Group.new(3,'Mueble asimétrico',Sketchup::Definition.new('Mueble C','cantos-safe',pieces))
    NamingModelDouble.new(Sketchup::Model.new([root],'cantos-synthetic','Modelo sintético de cantos',''))
  end
  # Supplier draft rows: same board and roles, each row with its own asymmetric map and detail.
  def self.rows!(draft,sheet,principal,secondary)
    draft['rows'].sort_by { |row| row['id'].split('/').map(&:to_i) }.each_with_index do |row,i|
      row.merge!('detail'=>PIECES[i]['detail'],'axes'=>[0,1],'frontSign'=>1,'materialId'=>sheet,'principalId'=>principal,'secondaryId'=>secondary,'edgeMap'=>PIECES[i]['edgeMap'],
        'grainPolicy'=>'locked','grainAxis'=>'none','grainConfirmed'=>true,'dimensionRule'=>'finished_accepted','orientationConfirmed'=>true,'materialConfirmed'=>true,'dimensionsConfirmed'=>true,'edgesConfirmed'=>true,
        'edgeResolution'=>'manual','edgeOverrideReason'=>'Inspección manual sintética para prueba','reviewNote'=>'Caso sintético, terminadas verificadas para prueba')
    end
    draft
  end
end
