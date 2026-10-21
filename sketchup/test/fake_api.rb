# frozen_string_literal: true
# Minimal doubles, NOT SketchUp. Geometry fixtures are synthetic and never decode .skp.
module Geom
  class Transformation
    def initialize(a=nil)
      @a=a || [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    end
    def to_a; @a.dup; end
    def *(other)
      b=other.to_a
      self.class.new(16.times.map { |i| row=i%4;col=i/4;(0..3).sum { |k| @a[k*4+row]*b[col*4+k] } })
    end
    def self.translation(x,y,z); a=new.to_a;a[12,3]=[x,y,z];new(a);end
    def self.scale(x,y,z);a=new.to_a;a[0]=x;a[5]=y;a[10]=z;new(a);end
    def self.rotation_z(angle);c=Math.cos(angle);s=Math.sin(angle);new([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);end
  end
end
module Sketchup
  def self.version; '2026-TEST-DOUBLE';end
  Point=Struct.new(:x,:y,:z) { def to_a;[x,y,z];end }
  Color=Struct.new(:red,:green,:blue)
  Material=Struct.new(:entityID,:display_name,:color,:alpha,:texture)
  Layer=Struct.new(:name,:visible) {def visible?;visible;end}
  Mesh=Struct.new(:points,:polygons)
  class Face
    attr_accessor :material,:back_material,:layer,:normal
    def initialize(points,normal)
      @mesh=Mesh.new(points.map { |p| Point.new(*p) },[[1,2,3],[1,3,4]])
      @normal=Point.new(*normal);@layer=Layer.new('Untagged',true)
    end
    def mesh(flags=0);raise unless flags==0;@mesh;end
    def hidden?;false;end
  end
  Definition=Struct.new(:name,:guid,:entities)
  class ComponentInstance
    attr_accessor :name,:persistent_id,:definition,:transformation,:material,:layer,:hidden
    def initialize(id,name,definition,transformation=Geom::Transformation.new)
      @persistent_id=id;@name=name;@definition=definition;@transformation=transformation;@hidden=false;@layer=Layer.new('Untagged',true)
    end
    def hidden?;@hidden;end
  end
  class Group < ComponentInstance
    def entities;definition.entities;end
  end
  Model=Struct.new(:entities,:guid,:title,:path)
end
module Fixture
  def self.board_definition
    # Inches in the API: 24 x 16 x 0.75 in => 609.6 x 406.4 x 19.05 mm.
    x=24.0;y=16.0;z=0.75
    v=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]]
    faces=[[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]].map { |ids,n| Sketchup::Face.new(ids.map { |i| v[i] },n) }
    faces[0].material=Sketchup::Material.new(77,'Jade synthetic',Sketchup::Color.new(20,150,100),1.0,nil)
    Sketchup::Definition.new('Tablón de prueba','synthetic-board',faces)
  end
  def self.model
    definition=board_definition
    a=Sketchup::ComponentInstance.new(11,'Lateral sintético',definition)
    b=Sketchup::ComponentInstance.new(12,'Rotado sintético',definition,Geom::Transformation.translation(30,0,0)*Geom::Transformation.rotation_z(Math::PI/4))
    b.hidden=true
    nested=Sketchup::Group.new(13,'Interior',Sketchup::Definition.new('Interior','nest',[b]))
    root=Sketchup::Group.new(1,'Mueble de contrato',Sketchup::Definition.new('Mueble','root',[a,nested]),Geom::Transformation.translation(100,0,0))
    second=Sketchup::Group.new(2,'Mueble repetido sintético',root.definition,Geom::Transformation.translation(200,0,0))
    Sketchup::Model.new([root,second],'synthetic-model-guid','Fixture Ruby API — NO ES UN SKP','')
  end
end
