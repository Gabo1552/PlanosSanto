# frozen_string_literal: true
# Dobles de la API para la veta (0.8.26). NO es SketchUp: Face#position_material solo guarda los pares de
# puntos que recibe; Hacer único copia la definición en memoria. Sirve para contratos de Linux.
require_relative 'names_double'

module Geom
  unless const_defined?(:Point3d)
    Point3d=Struct.new(:x,:y,:z) do
      def initialize(x=0,y=0,z=0);super(x.to_f,y.to_f,z.to_f);end
      def to_a;[x,y,z];end
    end
  end
end

module GrainDouble
  Vertex=Struct.new(:position)
  Texture=Struct.new(:width,:height)
  # Caras con vértices, textura posicionable y proyección simulada.
  module FaceApi
    attr_accessor :projected, :fail_position
    def vertices;@mesh.points.first(4).map { |point| Vertex.new(point) };end
    def uv;@uv ||= {};end
    def texture_projected?(front);projected==true && (projected_side.nil? || projected_side==front);end
    attr_accessor :projected_side
    def position_material(material,pairs,front)
      return false if fail_position
      raise ArgumentError,'pares de puntos inválidos' unless pairs.length==6
      if front then @material=material else @back_material=material end
      uv[front]=pairs.map { |point| point.to_a.map { |v| v.round(6) } }
      self
    end
  end
  Sketchup::Face.prepend(FaceApi)

  # Material con vínculo Planos Santo (JSON) y textura.
  class Material < Sketchup::Material
    attr_accessor :binding
    def get_attribute(dictionary,_key,default=nil);dictionary=='PlanosSantoMaterial' ? binding : default;end
  end

  # Modelo con Deshacer que también recuerda definiciones, acabados y la posición de las texturas.
  class Model < NamingModelDouble
    attr_accessor :materials
    def faces;all_instances.flat_map { |e| e.definition.entities.grep(Sketchup::Face) }.uniq;end
    def state
      super.merge(definitions:all_instances.map { |e| [e,e.definition,e.transformation] },
                  faces:faces.map { |f| [f,f.material,f.back_material,Marshal.load(Marshal.dump(f.uv))] })
    end
    def restore(snapshot)
      super
      snapshot[:definitions].each { |e,d,t| e.definition=d;e.transformation=t }
      snapshot[:faces].each { |f,m,b,uv| f.instance_variable_set(:@material,m);f.instance_variable_set(:@back_material,b);f.instance_variable_set(:@uv,uv) }
    end
  end

  # Caja de dims mm en ejes locales, con las normales hacia afuera. paint: material por cara
  # ('-x','+x','-y','+y','-z','+z'); las demás quedan sin material (heredan del contenedor).
  KEYS=%w[-z +z -y +y -x +x].freeze
  def self.box(name,dims,paint={},guid:name)
    x,y,z=dims.map { |v| v/25.4 }
    v=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]]
    quads=[[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]]
    faces=quads.each_with_index.map do |(ids,normal),index|
      face=Sketchup::Face.new(ids.map { |i| v[i] },normal);face.material=paint[KEYS[index]]
      face.define_singleton_method(:persistent_id) { object_id };face
    end
    Sketchup::Definition.new(name,guid,faces)
  end
  def self.face(definition,key);definition.entities[KEYS.index(key)];end
  # «Hacer único»: copia la definición (geometría y acabados) solo para esta instancia.
  def self.enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copied=definition.entities.map do |face|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a)
        copy.material=face.material;copy.back_material=face.back_material
        copy.instance_variable_set(:@uv,Marshal.load(Marshal.dump(face.uv)))
        copy.define_singleton_method(:persistent_id) { object_id };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"#{definition.guid}-unico-#{persistent_id}",copied)
      self
    end
  end
  def self.material(id,name,item,texture: Texture.new(1000/25.4,500/25.4))
    material=Material.new(id,name,Sketchup::Color.new(150,110,70),1.0,texture)
    material.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item)) if item
    material
  end
  def self.catalog(items)
    data={'schema'=>1,'revision'=>1,'items'=>items};catalog=Object.new
    catalog.define_singleton_method(:read) { data };catalog
  end
end
