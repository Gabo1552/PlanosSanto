# Records the 2D drawing commands of SmartPaintTool (in-view brush, edge mode)
# with the test doubles, for a raster simulation. Usage:
#   ruby sim.rb REPO SCALE OUT.json [OLD_TOOL.rb]
require 'minitest'
module Minitest;def self.autorun;end;end
repo,scale,out,old=ARGV
$LOAD_PATH.unshift(File.join(repo,'sketchup_offline','test'))
require File.join(repo,'sketchup_offline','test','pincel_avanzado_tool_test.rb')
if old
  $VERBOSE=nil
  load old
end
Object.const_set(:TextAlignLeft,0) unless Object.const_defined?(:TextAlignLeft)
Object.const_set(:TextAlignCenter,1) unless Object.const_defined?(:TextAlignCenter)
Object.const_set(:TextVerticalAlignCenter,3) unless Object.const_defined?(:TextVerticalAlignCenter)
SCALE=scale.to_f
UI.singleton_class.send(:define_method,:scale_factor) { SCALE }
Sketchup.singleton_class.send(:define_method,:platform) { :platform_win }

def rgba(color)
  return nil if color.nil?
  return color.to_a.first(4).map(&:to_i).then { |a| a.length==3 ? a+[255] : a } if color.respond_to?(:to_a) && !color.is_a?(String)
  color.to_s
end
class SimView
  attr_accessor :drawing_color
  attr_reader :cmds
  def initialize(picker,width,height);@picker=picker;@w=width;@h=height;@cmds=[];@lw=1;end
  def vpwidth;@w;end
  def vpheight;@h;end
  def pick_helper;@picker;end
  def invalidate;end
  def line_width=(value);@lw=value;end
  def draw(*_args);end
  def draw2d(mode,points,**options)
    @cmds << {'k'=>'2d','mode'=>mode,'pts'=>points.map { |p| p.to_a.first(2).map(&:to_f) },'color'=>rgba(drawing_color),'width'=>@lw,
              'texture'=>options[:texture],'uvs'=>options[:uvs]}
  end
  def draw_text(point,text,options={})
    @cmds << {'k'=>'text','pt'=>point.to_a.first(2).map(&:to_f),'text'=>text,'size'=>options[:size],'bold'=>options[:bold]==true,
              'align'=>options[:align],'valign'=>options[:vertical_align],'color'=>rgba(options[:color]),'font'=>options[:font]}
  end
  WIDTHS=JSON.parse(File.read(File.join(__dir__,'widths.json')))
  Bounds=Struct.new(:width,:height)
  # Same font as the raster (Liberation Sans, Arial metrics), 1 px per :size unit like 0.8.18 assumed.
  def text_bounds(_point,text,options={})
    table=WIDTHS[options[:bold] ? 'bold' : 'regular'];size=options[:size].to_f
    Bounds.new(text.to_s.each_char.sum { |ch| table.fetch(ch,0.6) }*size,size*1.21)
  end
  def load_texture(_rep);1;end
  def release_texture(_id);end
end
class SimTexture
  def image_width;1024;end
  def image_height;512;end
  def image_rep(_colorize=false);Struct.new(:width,:height).new(1024,512);end
end

test=PinturaEnVistaToolTest.new('sim')
test.setup
edge=test.instance_variable_get(:@edge)
edge.define_singleton_method(:texture) { SimTexture.new }
edge.define_singleton_method(:color) { Sketchup::Color.new(150,98,52) }
binding_edge=test.binding_of(edge)
rows=[{'catalogId'=>binding_edge['catalogId'],'materialUuid'=>binding_edge['uuid'],'name'=>'Canto Roble Santana','color'=>[150,98,52],'state'=>'ready'},
      {'catalogId'=>'c2','materialUuid'=>'u2','name'=>'Canto Blanco Nieve','color'=>[238,236,230],'state'=>'ready'},
      {'catalogId'=>'c3','materialUuid'=>'u3','name'=>'Canto Gris Humo','color'=>[120,122,124],'state'=>'ready'},
      {'catalogId'=>'c4','materialUuid'=>'u4','name'=>'Canto Wengué','color'=>[62,44,34],'state'=>'ready'},
      {'catalogId'=>'c5','materialUuid'=>'','name'=>'Canto Nogal Cadiz','color'=>nil,'state'=>'installable'},
      {'catalogId'=>'c6','materialUuid'=>'u6','name'=>'Canto Negro Profundo','color'=>[30,30,32],'state'=>'ready'}]
test.define_singleton_method(:swatches_for) { |_mode| rows }
test.define_singleton_method(:recents_for) { |_mode| [rows[0].reject { |key,_| key=='state' }] }
width=(1100*SCALE).round;height=(620*SCALE).round
options=test.tool_options('edge','edgeCount'=>2)
test.build_vista(options)
tool=test.instance_variable_get(:@tool)
picker=test.instance_variable_get(:@picker)
view=SimView.new(picker,width,height)
doors=test.instance_variable_get(:@doors)
test.stack!(test.entry(doors[0],2))
tool.onMouseMove(0,(560*SCALE).round,(300*SCALE).round,view)
view.cmds.clear
tool.draw(view)
File.write(out,JSON.generate({'scale'=>SCALE,'width'=>width,'height'=>height,'mouse'=>[(560*SCALE).round,(300*SCALE).round],'cmds'=>view.cmds}))
puts "#{out}: #{view.cmds.length} comandos"
