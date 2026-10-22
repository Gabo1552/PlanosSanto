# frozen_string_literal: true
# Linux browser integration ONLY: real controller/photo/paint services, synthetic
# model and public API doubles. No SketchUp or customer image/SKM is executed.
require 'fileutils'
require_relative 'names_double'
require_relative 'ocl_read_double'
require_relative 'photo_material_double'
# Original striped/checkered raster: visibly an image, not a flat swatch. The
# synthetic ImageRep/material-thumbnail API returns this same test visual.
module PhotoFixture
  def self.png(width=128,height=96)
    chunk=lambda { |type,data| [data.bytesize].pack('N')+type+data+[Zlib.crc32(type+data)].pack('N') }
    rows=height.times.map do |y|
      "\x00".b+width.times.map do |x|
        grain=((x/5+y/19)%5)*9;mark=(x/32+y/24)%2==0 ? 14 : 0
        [140+grain+mark,99+grain,47+grain/2,255].pack('C4')
      end.join
    end.join
    "\x89PNG\r\n\x1a\n".b+chunk.call('IHDR',[width,height,8,6,0,0,0].pack('NNCCCCC'))+chunk.call('IDAT',Zlib.deflate(rows))+chunk.call('IEND',''.b)
  end
  class Material
    def write_thumbnail(path,size)
      @thumbnail_calls+=1;raise 'Invalid thumbnail size' unless size==256
      File.binwrite(path,File.binread(texture.filename));true
    end
  end
end
$LOADED_FEATURES << 'sketchup.rb'
module Kernel
  def file_loaded?(_path);true;end
end
module Sketchup
  class << self;attr_accessor :photo_browser_model;end
  def self.active_model;photo_browser_model;end
end
module UI
  class << self;attr_accessor :photo_browser_path;end
  def self.openpanel(*_args);photo_browser_path;end
  def self.savepanel(*_args);nil;end
  def self.select_directory(**_args);nil;end
end
class PhotoBrowserModel < NamingModelDouble
  attr_reader :selected_tool
  def state
    super.merge(faces:all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.map { |face| [face,face.material,face.back_material] })
  end
  def restore(snapshot)
    super;snapshot[:faces].each { |face,front,back| face.material=front;face.back_material=back }
  end
  def select_tool(tool)
    @selected_tool=tool;tool.activate if tool;true
  end
end
installation=ENV.fetch('PLANOS_TEST_INSTALL_DIR',File.expand_path('../build',__dir__))
require File.join(installation,'planos_santo','offline')
model=PhotoBrowserModel.new(NamesFixture.model.__getobj__)
# Independent copies keep the same synthetic L geometry while exercising safe
# unique scope without emulating native shared-definition cloning.
model.all_instances.each do |entity|
  next unless entity.definition.entities.any? { |child| child.is_a?(Sketchup::Face) }
  entity.definition=Marshal.load(Marshal.dump(entity.definition))
  entity.definition.guid="photo-browser-#{entity.persistent_id}"
  entity.define_singleton_method(:make_unique) { self }
end
model.entities.first.entities.first.transformation=Geom::Transformation.new([
  0,0,1,0, 0,1,0,0, -1,0,0,0, 0.75,0,0.75,1
])
model.all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.each_with_index { |face,i| face.define_singleton_method(:persistent_id) { 100+i };face.define_singleton_method(:texture_positioned?) { |_front| false };face.define_singleton_method(:texture_projected?) { |_front| false } }
model.materials=[];PhotoFixture.decorate(model)
folder=ENV.fetch('PLANOS_SANTO_DATA_DIR');FileUtils.mkdir_p(folder)
items=[['Placa QA sintética','sheet','QA-PLACA',19.05,1830,2600],['Canto QA sintético','edge','QA-CANTO',1,22,nil]].map do |name,kind,sku,thick,width,length|
  PlanosSanto::CatalogStore.new.new_item(name,kind,{'source'=>'synthetic_browser_comparison'}).merge('sku'=>sku,'supplier'=>'Ensayo sintético','approved'=>true,'thicknessMm'=>thick,'widthMm'=>width,'lengthMm'=>length,'grain'=>false,'favorite'=>true)
end
items.each_with_index do |item,i|
  item['id']="11111111-1111-4111-8111-#{(i+1).to_s.rjust(12,'0')}";item['updatedAt']='2026-10-20T00:00:00Z'
  material=model.materials.add(item['name']);material.set_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::MaterialResolver::KEY,JSON.generate(PlanosSanto::MaterialResolver.binding_for(item,"22222222-2222-4222-8222-#{(i+1).to_s.rjust(12,'0')}")))
end
File.binwrite(File.join(folder,'catalog.json'),JSON.pretty_generate('schema'=>(defined?(PlanosSanto::CatalogStore::SCHEMA) ? PlanosSanto::CatalogStore::SCHEMA : 1),'revision'=>1,'items'=>items))
image=File.join(ARGV.fetch(0),'Foto QA ámbar.png');File.binwrite(image,PhotoFixture.png(128,96));UI.photo_browser_path=image
Sketchup.photo_browser_model=model
class PhotoBrowserController < PlanosSanto::OfflineController
  def reply(id,result:nil,error:nil)
    STDOUT.puts(JSON.generate('version'=>1,'id'=>id,'result'=>result,'error'=>error));STDOUT.flush
  end
  def photo_snapshot
    catalog=PlanosSanto::CatalogStore.new(directory:ENV.fetch('PLANOS_SANTO_DATA_DIR')).read
    {'photoItems'=>catalog['items'].filter_map do |item|
      next unless PlanosSanto::MaterialPolicy.photo?(item)
      material=@model.materials.find { |candidate| PlanosSanto::MaterialResolver.read_binding(candidate)&.fetch('catalogId',nil)==item['id'] }
      {'name'=>item['name'],'approved'=>item['approved'],'designReady'=>PlanosSanto::MaterialPolicy.design_ready?(item,directory:ENV['PLANOS_SANTO_DATA_DIR']),
       'hasTexture'=>!!material&.texture,'hasArchive'=>Dir.glob(File.join(ENV['PLANOS_SANTO_DATA_DIR'],'material-assets','*.skm')).any?,
       'scaleVerified'=>item.dig('observed','photo','textureScale','verified')}
    end,'targetHasPhoto'=>target_photo?,'toolState'=>smart_state}
  end
  def target_photo?
    face=@model.entities.first.entities.first.definition.entities.first
    !!face.material && !!face.material.get_attribute(PlanosSanto::MaterialResolver::DICT,PlanosSanto::PhotoMaterial::PHOTO_KEY,nil)
  end
  def dispatch(action,data)
    case action
    when '__photo_new_model'
      fresh=PhotoBrowserModel.new(NamesFixture.model.__getobj__)
      fresh.all_instances.each do |entity|
        next unless entity.definition.entities.any? { |child| child.is_a?(Sketchup::Face) }
        entity.definition=Marshal.load(Marshal.dump(entity.definition));entity.definition.guid="fresh-photo-#{entity.persistent_id}"
        entity.define_singleton_method(:make_unique) { self }
      end
      fresh.all_instances.flat_map { |entity| entity.definition.entities.grep(Sketchup::Face) }.uniq.each_with_index do |face,i|
        face.define_singleton_method(:persistent_id) { 100+i };face.define_singleton_method(:texture_positioned?) { |_front| false };face.define_singleton_method(:texture_projected?) { |_front| false }
      end
      fresh.materials=[];PhotoFixture.decorate(fresh);Sketchup.photo_browser_model=fresh
      File.delete(UI.photo_browser_path) if data['deleteOriginal'] && File.file?(UI.photo_browser_path)
      dispatch('scan',{})
    when '__photo_picker'
      case data['kind']
      when 'cancel';UI.photo_browser_path=nil
      when 'invalid';path=File.join(ARGV.fetch(0),'No es foto.png');File.binwrite(path,'not an image');UI.photo_browser_path=path
      when 'jpeg';path=File.join(ARGV.fetch(0),'Textura QA ñ.jpg');File.binwrite(path,PhotoFixture.jpeg);UI.photo_browser_path=path
      end
      {'set'=>true}
    when '__photo_snapshot';photo_snapshot
    when '__photo_undo';@model.undo;photo_snapshot
    when '__photo_paint'
      tool=@model.selected_tool;raise 'No active painting tool' unless tool
      root=@model.entities.first;piece=root.entities.first;face=piece.definition.entities.first
      picker=Object.new;picker.define_singleton_method(:do_pick) { |*_args| true };picker.define_singleton_method(:count) { 1 };picker.define_singleton_method(:path_at) { |_i| [root,piece,face] };picker.define_singleton_method(:leaf_at) { |_i| face }
      view=Object.new;view.define_singleton_method(:pick_helper) { picker };view.define_singleton_method(:invalidate) { true }
      tool.onLButtonDown(0,100,100,view)
      photo_snapshot.merge('changed'=>smart_state['changed'])
    else;super
    end
  rescue StandardError => error
    warn(error.full_message);raise
  end
end
if $PROGRAM_NAME==__FILE__
  controller=PhotoBrowserController.new
  STDIN.each_line { |line| controller.handle(line) }
end
