# frozen_string_literal: true
# Browser/native-controller regression doubles only. No real SKP is written.
require_relative 'names_double'
module NamesFixture
  def self.model
    board=Fixture.board_definition
    names=['Lateral izquierdo','Lateral derecho','Banquina frontal','Banquina trasera','Travesano frontal','Travesano trasero','Puerta izquierda','Puerta derecha','Bisagra derecha']
    pieces=names.each_with_index.map do |name,index|
      piece=Sketchup::ComponentInstance.new(11+index,name,board)
      piece.transformation=Geom::Transformation.translation(index*2,0,0)
      piece
    end
    nested=Sketchup::Group.new(100,'Interior',Sketchup::Definition.new('Interior','group-regression-nested',pieces.drop(1)))
    root=Sketchup::Group.new(1,'M01 Bajo mesada',Sketchup::Definition.new('Bajo mesada','group-regression-root',[pieces.first,nested]))
    other=Sketchup::Group.new(2,'Otro mueble',Sketchup::Definition.new('Otro','group-regression-other',[Sketchup::ComponentInstance.new(21,'Ajena',board)]))
    NamingModelDouble.new(Sketchup::Model.new([root,other],'group-regression','Regresión de agrupación sintética',''))
  end
end
require_relative 'names_bridge_driver'
