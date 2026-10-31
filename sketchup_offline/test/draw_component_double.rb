# frozen_string_literal: true
# Dobles de la API de SketchUp para DrawComponentTool. NO es SketchUp:
# geometría mínima en pulgadas, operaciones con instantánea y restauración, una
# vista sintética (planta, frente o una tabla fija de picks por pantalla) y
# String#to_l con unidades del modelo simuladas. Nunca lee ni escribe un .skp.
module Geom
  class Vector3d
    attr_reader :x,:y,:z
    def initialize(x=0.0,y=0.0,z=0.0);@x=x.to_f;@y=y.to_f;@z=z.to_f;end
    def to_a;[x,y,z];end
    def dot(other);x*other.x+y*other.y+z*other.z;end
    def cross(other);Vector3d.new(y*other.z-z*other.y,z*other.x-x*other.z,x*other.y-y*other.x);end
    def length;Math.sqrt(dot(self));end
    def normalize;size=length;raise ArgumentError,'vector nulo' if size<1e-12;Vector3d.new(x/size,y/size,z/size);end
    def reverse;Vector3d.new(-x,-y,-z);end
    def +(other);Vector3d.new(x+other.x,y+other.y,z+other.z);end
    def -(other);Vector3d.new(x-other.x,y-other.y,z-other.z);end
    def transform(transformation);transformation*self;end
    # Like SketchUp: [x, y, z] with z = self normalized and x × y = z.
    def axes
      z=normalize
      x=(z.x.abs<1.0/64 && z.y.abs<1.0/64) ? Vector3d.new(0,1,0).cross(z) : Vector3d.new(0,0,1).cross(z)
      x=x.normalize;[x,z.cross(x).normalize,z]
    end
  end
  class Point3d
    attr_reader :x,:y,:z
    def initialize(x=0.0,y=0.0,z=0.0);@x=x.to_f;@y=y.to_f;@z=z.to_f;end
    def to_a;[x,y,z];end
    def -(other)
      return Point3d.new(x-other.x,y-other.y,z-other.z) if other.is_a?(Vector3d)
      Vector3d.new(x-other.x,y-other.y,z-other.z)
    end
    def +(vector);Point3d.new(x+vector.x,y+vector.y,z+vector.z);end
    def transform(transformation);transformation*self;end
    def distance(other);(self-other).length;end
    def ==(other);other.respond_to?(:to_a) && to_a.zip(other.to_a).all? { |a,b| (a-b).abs<1e-9 };end
  end
  class Transformation
    def initialize(a=nil);@a=(a || [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]).map(&:to_f);end
    def self.axes(origin,x,y,z);new([*x.to_a,0,*y.to_a,0,*z.to_a,0,*origin.to_a,1]);end
    def self.translation(vector);new([1,0,0,0,0,1,0,0,0,0,1,0,*vector.to_a,1]);end
    def self.rotation_z(angle);c=Math.cos(angle);s=Math.sin(angle);new([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);end
    def to_a;@a.dup;end
    def origin;Point3d.new(*@a[12,3]);end
    def xaxis;Vector3d.new(*@a[0,3]);end
    def yaxis;Vector3d.new(*@a[4,3]);end
    def zaxis;Vector3d.new(*@a[8,3]);end
    def identity?;self==Transformation.new;end
    def ==(other);other.is_a?(Transformation) && to_a.zip(other.to_a).all? { |a,b| (a-b).abs<1e-9 };end
    def *(other)
      case other
      when Point3d then Point3d.new(*3.times.map { |r| @a[r]*other.x+@a[4+r]*other.y+@a[8+r]*other.z+@a[12+r] })
      when Vector3d then Vector3d.new(*3.times.map { |r| @a[r]*other.x+@a[4+r]*other.y+@a[8+r]*other.z })
      else
        b=other.to_a
        Transformation.new(16.times.map { |i| row=i%4;col=i/4;(0..3).sum { |k| @a[k*4+row]*b[col*4+k] } })
      end
    end
    def inverse
      m=[[@a[0],@a[4],@a[8]],[@a[1],@a[5],@a[9]],[@a[2],@a[6],@a[10]]]
      det=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
      raise ArgumentError,'transformación singular' if det.abs<1e-12
      inv=3.times.map do |r|
        3.times.map do |c|
          rows=[0,1,2]-[c];cols=[0,1,2]-[r]
          minor=m[rows[0]][cols[0]]*m[rows[1]][cols[1]]-m[rows[0]][cols[1]]*m[rows[1]][cols[0]]
          ((r+c).odd? ? -minor : minor)/det
        end
      end
      t=@a[12,3];moved=3.times.map { |r| -(inv[r][0]*t[0]+inv[r][1]*t[1]+inv[r][2]*t[2]) }
      Transformation.new([inv[0][0],inv[1][0],inv[2][0],0,inv[0][1],inv[1][1],inv[2][1],0,inv[0][2],inv[1][2],inv[2][2],0,*moved,1])
    end
  end
  class BoundingBox
    attr_reader :min,:max
    def add(*points)
      points.flatten.each do |point|
        @min=@min ? Point3d.new(*@min.to_a.zip(point.to_a).map(&:min)) : Point3d.new(*point.to_a)
        @max=@max ? Point3d.new(*@max.to_a.zip(point.to_a).map(&:max)) : Point3d.new(*point.to_a)
      end
      self
    end
    def empty?;@min.nil?;end
    def valid?;!empty?;end
  end
  def self.intersect_line_plane(line,plane)
    point,direction=line;origin,normal=plane
    denominator=direction.dot(normal)
    return nil if denominator.abs<1e-12
    distance=(origin-point).dot(normal)/denominator
    point+Vector3d.new(direction.x*distance,direction.y*distance,direction.z*distance)
  end
  def self.closest_points(first,second)
    p1,d1=first;p2,d2=second
    a=d1.dot(d1);b=d1.dot(d2);c=d2.dot(d2);w=p1-p2;d=d1.dot(w);e=d2.dot(w)
    denominator=a*c-b*b
    # Parallel lines: like a real solver, still answer (p2 projected on line 1).
    return [p1+Vector3d.new(d1.x*(-d/a),d1.y*(-d/a),d1.z*(-d/a)),p2] if denominator.abs<1e-12
    s=(b*e-c*d)/denominator;t=(a*e-b*d)/denominator
    [p1+Vector3d.new(d1.x*s,d1.y*s,d1.z*s),p2+Vector3d.new(d2.x*t,d2.y*t,d2.z*t)]
  end
end

module Sketchup
  class << self
    attr_accessor :active_model,:length_unit,:vcb_label,:vcb_value
    attr_reader :status_text
    def status_log;@status_log||=[];end
    def status_text=(text);status_log << text;@status_text=text;end
  end
  # Model units: 600 → «600mm» when the unit is :mm.
  def self.format_length(value)
    mm=(value*25.4).round(1);text=mm==mm.round ? mm.round.to_s : mm.to_s.tr('.',',')
    length_unit==:inch ? "#{(value).round(3)}\"" : "#{text}mm"
  end

  class Entity
    attr_accessor :locked
    def initialize(model);@model=model;@deleted=false;model&.register(self);end
    def valid?;!@deleted;end
    def deleted?;@deleted;end
    def locked?;@locked==true;end
    def erase!;@deleted=true;@model.parent_of(self)&.items&.delete(self);true;end
    def mark_deleted(value);@deleted=value;end
  end
  Vertex=Struct.new(:position)
  Layer=Struct.new(:name,:visible) { def visible?;visible;end }
  Mesh=Struct.new(:points,:polygons)
  class Face < Entity
    attr_reader :points,:normal,:entities
    attr_accessor :material,:back_material,:layer
    def initialize(model,entities,points,normal=nil)
      super(model);@entities=entities;@points=points;@layer=Layer.new('Untagged',true)
      @normal=normal || (points[1]-points[0]).cross(points[2]-points[0]).normalize
    end
    def vertices;@points.map { |point| Vertex.new(point) };end
    def reverse!;@normal=@normal.reverse;@points=@points.reverse;self;end
    def hidden?;false;end
    def mesh(_flags=0);Mesh.new(@points,[[1,2,3],[1,3,4]]);end
    # Lone face pushed along its normal: six outward faces.
    # pushpull_flip simula un empuje hacia el lado contrario al pedido.
    def pushpull(distance)
      @model.fail!(:pushpull)
      distance=-distance if @model.pushpull_flip
      offset=Geom::Vector3d.new(@normal.x*distance,@normal.y*distance,@normal.z*distance)
      top=@points.map { |point| point+offset }
      center=@points.inject(Geom::Vector3d.new) { |sum,point| sum+Geom::Vector3d.new(*point.to_a) }
      middle=Geom::Point3d.new(center.x/4,center.y/4,center.z/4)
      @entities.add_face(*top).tap { |face| face.reverse! if face.normal.dot(offset)<0 }
      @points.each_index do |i|
        quad=[@points[i],@points[(i+1)%4],top[(i+1)%4],top[i]]
        face=@entities.add_face(*quad)
        face.reverse! if face.normal.dot(quad[0]-middle)<0
      end
      reverse! if @normal.dot(offset)>0
      nil
    end
  end
  class Edge < Entity;end
  class Entities
    include Enumerable
    attr_accessor :items
    attr_reader :model
    def initialize(model);@model=model;@items=[];model.register_entities(self);end
    def each(&block);@items.each(&block);end
    def length;@items.length;end
    def [](index);@items[index];end
    def add_group;@model.fail!(:add_group);(Group.new(@model,@model.definitions.add_group)).tap { |group| @items << group };end
    def add_face(*points)
      @model.fail!(:add_face)
      points=points.flatten
      face=Face.new(@model,self,points)
      face.reverse! if points.all? { |point| point.z.abs<1e-9 } && face.normal.z>0
      @items << face
      face
    end
    def clear!;@items.each { |entity| entity.mark_deleted(true) };@items=[];true;end
  end
  class ComponentDefinition < Entity
    attr_accessor :name
    attr_reader :entities,:guid
    def initialize(model,name,group=false);super(model);@name=name;@group=group;@entities=Entities.new(model);@guid="guid-#{object_id}";end
    def group?;@group;end
    def instances;@model.all_instances.select { |instance| instance.definition.equal?(self) && instance.valid? };end
    def entityID;object_id;end
  end
  class ComponentInstance < Entity
    attr_accessor :name,:transformation,:material,:layer,:hidden
    attr_reader :definition,:persistent_id
    def initialize(model,definition,transformation=Geom::Transformation.new)
      super(model);@definition=definition;@transformation=transformation;@name='';@hidden=false
      @persistent_id=model.next_id;@layer=Layer.new('Untagged',true)
    end
    def hidden?;@hidden==true;end
    # Diccionarios propios de la instancia (nil si no tiene, como SketchUp).
    Dictionary=Struct.new(:name,:values) { def keys;values.keys;end }
    def attribute_dictionaries;@dictionaries && !@dictionaries.empty? ? @dictionaries.values : nil;end
    def get_attribute(dictionary,key,default=nil);(@dictionaries||{})[dictionary]&.values&.fetch(key,default) || default;end
    def set_attribute(dictionary,key,value)
      @dictionaries||={};(@dictionaries[dictionary]||=Dictionary.new(dictionary,{})).values[key]=value
    end
  end
  class Group < ComponentInstance
    def entities;definition.entities;end
    def to_component
      @model.fail!(:to_component)
      parent=@model.parent_of(self)
      definition=@model.definitions.add("Componente##{@model.definitions.length}")
      definition.entities.items=entities.items;entities.items=[]
      instance=ComponentInstance.new(@model,definition,transformation)
      parent.items[parent.items.index(self)]=instance
      @model.definitions.items.delete(self.definition);mark_deleted(true)
      instance
    end
  end
  class DefinitionList
    include Enumerable
    attr_accessor :items
    def initialize(model,unique: true);@model=model;@items=[];@unique=unique;end
    def each(&block);@items.each(&block);end
    def length;@items.length;end
    def [](name);@items.find { |definition| definition.name==name };end
    def add(name);definition=ComponentDefinition.new(@model,name);@items << definition;definition;end
    def add_group;definition=ComponentDefinition.new(@model,"Grupo##{@items.length}",true);@items << definition;definition;end
    def respond_to_missing?(name,include_private=false);name==:unique_name ? @unique : super;end
    # SketchUp style: «Pieza», «Pieza#1», «Pieza#2»…
    def method_missing(name,*args)
      return super unless name==:unique_name && @unique
      base=args[0];return base unless self[base]
      (1..).each { |index| candidate="#{base}##{index}";return candidate unless self[candidate] }
    end
  end
  class Selection
    include Enumerable
    def initialize;@items=[];end
    def each(&block);@items.each(&block);end
    def clear;@items.clear;end
    def add(*items);@items.concat(items.flatten).uniq!;@items.length;end
    def to_a;@items.dup;end
    def length;@items.length;end
    def empty?;@items.empty?;end
  end
  Axes=Struct.new(:origin,:xaxis,:yaxis,:zaxis)

  # Scripted pick: what SketchUp's inference engine would answer at (x, y).
  Pick=Struct.new(:position,:face,:transformation,:degrees_of_freedom,:tooltip)
  class InputPoint
    attr_reader :position,:face,:transformation,:degrees_of_freedom,:tooltip
    def initialize;clear;end
    def pick(view,x,y,reference=nil)
      view.pick_calls << [x,y,reference&.position]
      result=view.pick_at(x,y)
      return clear && false unless result
      # raw_transformation: como algunas inferencias reales, sin transformación (nil).
      @position=result.position;@face=result.face;@transformation=view.raw_transformation ? result.transformation : (result.transformation || Geom::Transformation.new)
      @degrees_of_freedom=result.degrees_of_freedom || 2;@tooltip=result.tooltip.to_s;@valid=true
    end
    def valid?;@valid;end
    def display?;@valid;end
    def clear;@valid=false;@position=nil;@face=nil;@transformation=Geom::Transformation.new;@degrees_of_freedom=3;@tooltip='';true;end
    def copy!(other)
      %i[position face transformation degrees_of_freedom tooltip].each { |key| instance_variable_set("@#{key}",other.public_send(key)) }
      @valid=other.valid?;self
    end
    def draw(view);view.input_draws+=1;end
  end

  # Synthetic camera, one pixel = 1 mm. :top looks down -Z (screen x,y → world
  # x,y on z=0); :front looks along +Y (screen x,y → world x,z). picks
  # overrides the inference answer per pixel.
  class ViewDouble
    attr_accessor :mode,:drawing_color,:line_width,:tooltip,:input_draws,:raw_transformation
    attr_reader :picks,:pick_calls,:draws,:invalidations
    def initialize(mode=:top);@mode=mode;@picks={};@pick_calls=[];@draws=[];@invalidations=0;@input_draws=0;end
    def invalidate;@invalidations+=1;end
    def draw(mode,points);@draws << [mode,points.map(&:to_a)];end
    def pickray(x,y)
      if @mode==:front then [Geom::Point3d.new(x/25.4,-1000,y/25.4),Geom::Vector3d.new(0,1,0)]
      else [Geom::Point3d.new(x/25.4,y/25.4,1000),Geom::Vector3d.new(0,0,-1)]
      end
    end
    def pick_at(x,y)
      return @picks[[x,y]] if @picks.key?([x,y])
      point=Geom.intersect_line_plane(pickray(x,y),@mode==:front ? [Geom::Point3d.new,Geom::Vector3d.new(0,1,0)] : [Geom::Point3d.new,Geom::Vector3d.new(0,0,1)])
      Pick.new(point,nil,nil,2,'En el plano')
    end
  end

  class ModelDouble
    attr_accessor :active_path,:edit_transform,:fail_at,:commit_result,:axes,:pushpull_flip
    attr_reader :entities,:definitions,:selection,:active_view,:operations,:selected_tools,:undo_stack
    def initialize(unique_name: true)
      @objects=[];@collections=[];@ids=100;@operations=[];@undo_stack=[];@selected_tools=[]
      @definitions=DefinitionList.new(self,unique: unique_name)
      @entities=Entities.new(self);@selection=Selection.new;@active_view=ViewDouble.new
      @edit_transform=Geom::Transformation.new;@active_path=nil;@commit_result=true
    end
    def register(object);@objects << object;end
    def register_entities(collection);@collections << collection;end
    def next_id;@ids+=1;end
    def fail!(step);raise RuntimeError,"fallo sintético en #{step}" if @fail_at==step;end
    def parent_of(entity);@collections.find { |collection| collection.items.include?(entity) };end
    def active_entities;active_path && !active_path.empty? ? active_path.last.definition.entities : @entities;end
    def select_tool(tool);@selected_tools.last&.deactivate(@active_view);@selected_tools << tool;tool&.activate;end
    def all_instances;@objects.grep(ComponentInstance);end
    def get_attribute(_dictionary,_key,default=nil);default;end
    def guid;'draw-synthetic';end
    def title;'Modelo sintético de dibujo';end
    def snapshot
      {collections:@collections.map { |collection| [collection,collection.items.dup] },definitions:@definitions.items.dup,
       names:@definitions.map { |definition| [definition,definition.name] },
       objects:@objects.map { |object| [object,object.deleted?,object.respond_to?(:transformation) ? object.transformation : nil] }}
    end
    def restore(state)
      @collections.each { |collection| collection.items=[] }
      state[:collections].each { |collection,items| collection.items=items.dup }
      @definitions.items=state[:definitions].dup
      state[:names].each { |definition,name| definition.name=name }
      @objects.each { |object| object.mark_deleted(true) }
      state[:objects].each { |object,deleted,transformation| object.mark_deleted(deleted);object.transformation=transformation if transformation }
    end
    def start_operation(name,disable_ui=false,next_transparent=false,transparent=false)
      raise 'operación anidada' if @open
      @open=snapshot;@operations << [:start,name,disable_ui,next_transparent,transparent];true
    end
    def commit_operation
      raise 'sin operación' unless @open
      return false unless @commit_result
      transparent=@operations.reverse.find { |op| op[0]==:start }[4]
      @undo_stack << @open unless transparent && !@undo_stack.empty?
      @open=nil;@operations << [:commit];true
    end
    def abort_operation;restore(@open) if @open;@open=nil;@operations << [:abort];true;end
    def undo!;restore(@undo_stack.pop);end
    # Structural state: everything a tool could have touched, deeply.
    def state
      walk=lambda do |collection|
        collection.map do |entity|
          case entity
          when Face then [:face,entity.points.map(&:to_a),entity.normal.to_a]
          when ComponentInstance then [entity.class.name,entity.definition.name,entity.name,entity.transformation.to_a,entity.valid?,walk.call(entity.definition.entities)]
          else [entity.class.name]
          end
        end
      end
      [walk.call(@entities),@definitions.map { |definition| [definition.name,definition.entities.length] }]
    end
  end
end

class String
  UNITS={'mm'=>1/25.4,'cm'=>10/25.4,'m'=>1000/25.4,'"'=>1.0,'in'=>1.0,"'"=>12.0,'ft'=>12.0}.freeze unless const_defined?(:UNITS)
  # Like SketchUp: a bare number uses the model units; decimal comma or point.
  def to_l
    match=strip.match(/\A([+-]?)\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(mm|cm|m|"|in|'|ft)?\z/i)
    raise ArgumentError,"Cannot convert \"#{self}\" to Length" unless match
    value=match[2].tr(',','.').to_f*UNITS.fetch((match[3] || (Sketchup.length_unit==:inch ? 'in' : 'mm')).downcase)
    match[1]=='-' ? -value : value
  end
end
