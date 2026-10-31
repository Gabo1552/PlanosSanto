# frozen_string_literal: true
# Browser/native bridge doubles only (0.8.26, sugerencias agrupadas). Never opens or modifies a real SKP.
# Placard sintético: dos laterales iguales de definiciones distintas, un divisor que es otra instancia de la
# definición del lateral izquierdo (instancia compartida), piso y tapa de una misma definición y dos estantes
# que son instancias de una misma definición. Todas las instancias sin nombre propio.
require_relative 'names_double'
module IgualesFixture
  def self.board(guid,x,y,z)
    v=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]]
    faces=[[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]].map { |ids,n| Sketchup::Face.new(ids.map { |i| v[i] },n) }
    Sketchup::Definition.new("Tablero #{guid}",guid,faces)
  end
end
module NamesFixture
  def self.model
    t=->(x,y,z) { Geom::Transformation.translation(x,y,z) }
    lat_a=IgualesFixture.board('tablero-a',0.75,16,24);lat_b=IgualesFixture.board('tablero-b',0.75,16,24)
    piso=IgualesFixture.board('horizontal',30.5,16,0.75)
    repisa=IgualesFixture.board('repisa',14.5,15,0.75)
    pieces=[
      Sketchup::ComponentInstance.new(11,'',lat_a),
      Sketchup::ComponentInstance.new(12,'',lat_b,t.(31.25,0,0)),
      Sketchup::ComponentInstance.new(13,'',lat_a,t.(15.625,0,0)),
      Sketchup::ComponentInstance.new(14,'',piso,t.(0.75,0,0)),
      Sketchup::ComponentInstance.new(15,'',piso,t.(0.75,0,23.25)),
      Sketchup::ComponentInstance.new(16,'',repisa,t.(0.75,0.5,12)),
      Sketchup::ComponentInstance.new(17,'',repisa,t.(16.375,0.5,12))
    ]
    root=Sketchup::Group.new(1,'M01 Placard',Sketchup::Definition.new('Placard','iguales-root',pieces))
    other=Sketchup::Group.new(2,'Otro mueble',Sketchup::Definition.new('Otro','iguales-other',[Sketchup::ComponentInstance.new(21,'Ajena',piso)]))
    NamingModelDouble.new(Sketchup::Model.new([root,other],'iguales-synthetic','Placard sintético de piezas iguales',''))
  end
end
require_relative 'names_bridge_driver'
