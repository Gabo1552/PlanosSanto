# frozen_string_literal: true
# Browser/native bridge doubles only (0.8.28, «Ocultar frente» en sugerencias de nombres). Never opens or modifies a real SKP.
# Placard sintético con dos puertas al frente (−Y): laterales, piso, tapa, dos estantes y las puertas delante de ellos.
require_relative 'iguales_bridge_driver_fixture'
module NamesFixture
  def self.model
    t=->(x,y,z) { Geom::Transformation.translation(x,y,z) }
    lat=IgualesFixture.board('frente-lateral',0.75,16,24);piso=IgualesFixture.board('frente-horizontal',30.5,16,0.75)
    repisa=IgualesFixture.board('frente-repisa',30.5,15,0.75);puerta=IgualesFixture.board('frente-puerta',15.9,0.75,23.5)
    pieces=[
      Sketchup::ComponentInstance.new(11,'',lat),Sketchup::ComponentInstance.new(12,'',lat,t.(31.25,0,0)),
      Sketchup::ComponentInstance.new(13,'',piso,t.(0.75,0,0)),Sketchup::ComponentInstance.new(14,'',piso,t.(0.75,0,23.25)),
      Sketchup::ComponentInstance.new(15,'',repisa,t.(0.75,0.5,8)),Sketchup::ComponentInstance.new(16,'',repisa,t.(0.75,0.5,16)),
      Sketchup::ComponentInstance.new(17,'',puerta,t.(0.05,-0.75,0.25)),Sketchup::ComponentInstance.new(18,'',puerta,t.(16.05,-0.75,0.25))
    ]
    root=Sketchup::Group.new(1,'M01 Placard',Sketchup::Definition.new('Placard','frente-root',pieces))
    other=Sketchup::Group.new(2,'Otro mueble',Sketchup::Definition.new('Otro','frente-other',[Sketchup::ComponentInstance.new(21,'Ajena',piso)]))
    NamingModelDouble.new(Sketchup::Model.new([root,other],'frente-synthetic','Placard sintético con puertas',''))
  end
end
require_relative 'names_bridge_driver'
