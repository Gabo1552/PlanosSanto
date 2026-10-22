# frozen_string_literal: true
# Test API only. No real SketchUp or OpenCutList is loaded.
require_relative '../../sketchup/test/fake_api'
module OclReadFixture
  Vertex=Struct.new(:position)
  Loop=Struct.new(:vertices) { def outer?; true; end }
  module FaceApi
    def persistent_id; object_id; end
    def loops; [Loop.new(@mesh.points.map { |point| Vertex.new(point) })]; end
    def edges; []; end
  end
  module MaterialApi
    attr_accessor :ocl_attributes
    # Vínculo Planos Santo simulado (JSON), solo para pruebas que lo fijan a mano; por defecto no hay.
    attr_accessor :planos_binding
    def get_attribute(dictionary,key,default=nil)
      return (key=='binding_v1' && @planos_binding) || default if dictionary == 'PlanosSantoMaterial'
      raise 'Wrong dictionary' unless dictionary=='ladb_opencutlist'
      (@ocl_attributes||{}).fetch(key,default)
    end
    def set_attribute(*); raise 'Material mutation forbidden'; end
  end
  Sketchup::Face.prepend(FaceApi)
  Sketchup::Material.prepend(MaterialApi)
  Sketchup::Model.class_eval { attr_accessor :materials }
  def self.install_ocl
    namespace=Module.new;ocl=Module.new
    ocl.const_set(:EXTENSION_VERSION,'7.1.0');ocl.const_set(:EXTENSION_BUILD,'202511301621')
    namespace.const_set(:OpenCutList,ocl);Object.const_set(:Ladb,namespace)
  end
  def self.prepare(model)
    install_ocl unless Object.const_defined?(:Ladb,false)
    board=model.entities[0].definition.entities[0].definition.entities[0].material
    board.ocl_attributes={'type'=>2,'grained'=>true,'std_thicknesses'=>'18mm','length_increase'=>'5mm'}
    edge=Sketchup::Material.new(888,'Canto de prueba',Sketchup::Color.new(80,80,80),1,nil)
    edge.ocl_attributes={'type'=>4,'thickness'=>'0.8mm','std_widths'=>'22mm'}
    unused=Sketchup::Material.new(889,'Placa sin aplicar',Sketchup::Color.new(1,2,3),1,nil)
    unused.ocl_attributes={'type'=>2,'grained'=>false}
    model.entities[0].material=board
    model.entities[0].definition.entities[0].definition.entities[1].material=edge
    model.materials=[board,edge,unused]
    model
  end
end
