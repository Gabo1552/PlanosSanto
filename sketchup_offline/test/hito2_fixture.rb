# frozen_string_literal: true
# Shared Hito 2/7 brush fixture: API doubles only (no SketchUp, no .skp).
require 'minitest/mock'
require 'tmpdir'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../smart_paint'
require_relative '../smart_paint_tool'

class Hito2MaterialDouble < Sketchup::Material
  attr_accessor :binding
  def get_attribute(dict,key,_default=nil)
    dict==PlanosSanto::MaterialResolver::DICT && key==PlanosSanto::MaterialResolver::KEY ? binding : nil
  end
end
class Hito2ModelDouble < NamingModelDouble
  attr_accessor :materials
  attr_reader :observers
  def add_observer(observer);(@observers||=[]) << observer;true;end
  def remove_observer(observer);(@observers||=[]).delete(observer);true;end
  def state
    super.merge(definitions:all_instances.map { |entity| [entity,entity.definition] },
                faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super
    snapshot[:definitions].each { |entity,definition| entity.definition=definition }
    snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
end
class Hito2Picker
  attr_accessor :path,:leaf
  def do_pick(_x,_y);end
  def count;path ? 1 : 0;end
  def path_at(_index);path;end
  def leaf_at(_index);leaf;end
end
# PickHelper with several paths under the cursor, nearest first (PINTURA-11).
class Hito7Picker
  attr_accessor :rows
  def initialize(rows=[]);@rows=rows;end
  def do_pick(_x,_y);end
  def count;rows.length;end
  def path_at(index);rows[index]&.first;end
  def leaf_at(index);rows[index]&.last;end
end
class Hito2View
  attr_accessor :drawing_color
  attr_reader :draws,:texts
  def initialize(picker);@picker=picker;@draws=[];@texts=[];end
  def pick_helper;@picker;end
  def invalidate;end
  def draw(mode,points);@draws << [mode,points.length,drawing_color];end
  def draw_text(point,text,options={});@texts << [point.to_a,text,options];end
end

module Hito2Fixture
  SHEET={'id'=>'11111111-1111-1111-1111-111111111111','kind'=>'sheet','approved'=>true,'name'=>'Melamina Blanca','sku'=>'P','supplier'=>'QA','thicknessMm'=>19.05,'widthMm'=>1000,'lengthMm'=>2000,'grain'=>false,'compatibleIds'=>[]}
  EDGE=SHEET.merge('id'=>'22222222-2222-2222-2222-222222222222','kind'=>'edge','name'=>'Canto Blanco','thicknessMm'=>1,'widthMm'=>22)
  def build_fixture(doors:4)
    @board=Fixture.board_definition;@board.entities[0].material=nil
    @board.entities.each_with_index { |face,index| face.define_singleton_method(:persistent_id) { 100+index } }
    @doors=(1..doors).map { |i| Sketchup::ComponentInstance.new(10+i,"Puerta #{i}",@board,Geom::Transformation.translation(i*30,0,0)) }
    @root=Sketchup::Group.new(1,'Bajo mesada',Sketchup::Definition.new('Bajo','bajo-root',@doors))
    @model=Hito2ModelDouble.new(Sketchup::Model.new([@root],'hito2-synthetic','Hito 2 sintético',''))
    @doors.each { |door| enable_unique(door) }
    @sheet=material(991,SHEET,Sketchup::Color.new(240,240,235));@edge=material(992,EDGE,Sketchup::Color.new(200,10,10))
    @model.materials=[@sheet,@edge]
    data={'schema'=>1,'revision'=>1,'items'=>[SHEET,EDGE]};@catalog=Object.new;@catalog.define_singleton_method(:read) { data }
    @smart=PlanosSanto::SmartPaint.new(@model,catalog:@catalog)
  end
  def material(id,item,color)
    result=Hito2MaterialDouble.new(id,item['name'],color,1,nil);result.binding=JSON.generate(PlanosSanto::MaterialResolver.binding_for(item));result
  end
  def binding_of(material);PlanosSanto::MaterialResolver.read_binding(material);end
  def enable_unique(entity)
    entity.define_singleton_method(:make_unique) do
      copies=definition.entities.each_with_index.map do |face,index|
        copy=Sketchup::Face.new(face.mesh.points.map(&:to_a),face.normal.to_a);copy.mesh.polygons=face.mesh.polygons.map(&:dup)
        copy.material=face.material;copy.back_material=face.back_material
        id=persistent_id*1000+index;copy.define_singleton_method(:persistent_id) { id };copy
      end
      self.definition=Sketchup::Definition.new(definition.name,"isolated-#{persistent_id}",copies);self
    end
  end
  def paint_sheet_on_board!;@board.entities.first(2).each { |face| face.material=@sheet;face.back_material=@sheet };end
  def faces_of(door);door.definition.entities;end
  def edge_request(door,face_id='102',count:4,**patch)
    binding=binding_of(@edge)
    {'mode'=>'edge','immediate'=>true,'edgeCount'=>count,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>[face_id]}],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  def sheet_request(door,**patch)
    binding=binding_of(@sheet)
    {'mode'=>'sheet','immediatePiece'=>true,'targets'=>[{'pieceId'=>"1/#{door.persistent_id}",'faceIds'=>['100']}],
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  def tool_options(mode='edge',**patch)
    binding=binding_of(mode=='edge' ? @edge : @sheet)
    {'mode'=>mode,'side'=>'both','scope'=>'unique','axes'=>[0,1],'paintScope'=>mode=='sheet' ? 'piece' : 'face','edgeCount'=>mode=='sheet' ? 1 : 4,
     'batch'=>false,'immediate'=>true,'immediatePiece'=>mode=='sheet','confirmed'=>true,'allowShared'=>false,
     'catalogId'=>binding['catalogId'],'materialUuid'=>binding['uuid']}.merge(patch.transform_keys(&:to_s))
  end
  # A side split in two coplanar faces (rebaje/geometría sucia): x=0 becomes
  # 106+107 and, as in SketchUp, both broad faces gain the split vertex.
  def split_x_min_side!(definition=@board)
    faces=definition.entities;faces.delete_at(4);z=0.75
    [[[[0,0,0],[0,8,0],[0,16,0],[24,16,0],[24,0,0]],[0,0,-1],[[1,2,5],[2,4,5],[2,3,4]]],
     [[[0,0,z],[24,0,z],[24,16,z],[0,16,z],[0,8,z]],[0,0,1],[[1,2,5],[5,2,3],[5,3,4]]]].each_with_index do |(points,normal,polygons),index|
      face=Sketchup::Face.new(points,normal);face.mesh.polygons=polygons;id=100+index
      face.define_singleton_method(:persistent_id) { id };face.material=faces[index].material;face.back_material=faces[index].back_material
      faces[index]=face
    end
    halves=[[[0,0,0],[0,0,0.75],[0,8,0.75],[0,8,0]],[[0,8,0],[0,8,0.75],[0,16,0.75],[0,16,0]]].each_with_index.map do |points,index|
      face=Sketchup::Face.new(points,[-1,0,0]);id=106+index;face.define_singleton_method(:persistent_id) { id };face
    end
    faces.concat(halves)
  end
  # A real rebaje on x=0 (L profile, 1 x 0.375 in): the piece is no longer a
  # rectangular board, so every mode stays blocked with the NativePaint reason.
  def rebate_x_min_side!(definition=@board)
    old=definition.entities;x=24;y=16;z=0.75;h=0.375;r=1
    specs=[[[[0,0,0],[0,y,0],[x,y,0],[x,0,0]],[0,0,-1]],[[[r,0,z],[x,0,z],[x,y,z],[r,y,z]],[0,0,1]],
           [[[0,0,0],[x,0,0],[x,0,z],[r,0,z],[r,0,h],[0,0,h]],[0,-1,0]],[[[0,y,0],[x,y,0],[x,y,z],[r,y,z],[r,y,h],[0,y,h]],[0,1,0]],
           [[[0,0,0],[0,0,h],[0,y,h],[0,y,0]],[-1,0,0]],[[[x,0,0],[x,y,0],[x,y,z],[x,0,z]],[1,0,0]],
           [[[0,0,h],[r,0,h],[r,y,h],[0,y,h]],[0,0,1]],[[[r,0,h],[r,0,z],[r,y,z],[r,y,h]],[-1,0,0]]]
    faces=specs.each_with_index.map do |(points,normal),index|
      face=Sketchup::Face.new(points,normal);id=100+index;face.define_singleton_method(:persistent_id) { id }
      face.mesh.polygons=[[5,6,1],[5,1,2],[5,2,3],[5,3,4]] if points.length==6
      (face.material=old[index].material;face.back_material=old[index].back_material) if index<2
      face
    end
    definition.entities.replace(faces)
  end
  def hover_on(door,face_index=2)
    face=faces_of(door)[face_index];@picker.path=[@root,door,face];@picker.leaf=face
    @tool.onMouseMove(0,40,50,@view)
  end
  def click_on(door,face_index=2)
    face=faces_of(door)[face_index];@picker.path=[@root,door,face];@picker.leaf=face
    @tool.onLButtonDown(0,40,50,@view)
  end
  def build_tool(options,**extra)
    @events=[];@picker=Hito2Picker.new;@view=Hito2View.new(@picker)
    @model.define_singleton_method(:select_tool) { |tool| @hito2_tool=tool }
    @tool=PlanosSanto::SmartPaintTool.new(@model,service:@smart,options:options,on_event:lambda { |event| @events << event },guard:lambda { true },**extra)
    @tool.activate;@tool
  end
end

# Optional native APIs the doubles lack; real SketchUp provides them.
module Sketchup
  class << self;attr_accessor :hito2_status_texts;end
  def self.status_text=(text);(self.hito2_status_texts||=[]) << text;end
end
module UI
  class << self;attr_accessor :hito2_created,:hito2_set,:hito2_timers;end
  def self.create_cursor(path,x,y);(self.hito2_created||=[]) << [File.basename(path),x,y];1000+hito2_created.length;end
  def self.set_cursor(id);(self.hito2_set||=[]) << id;true;end
  def self.scale_factor;2.0;end
  def self.start_timer(delay,repeat,&block);(self.hito2_timers||=[]) << [delay,repeat,block];hito2_timers.length;end
end
