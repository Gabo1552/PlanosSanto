# frozen_string_literal: true
# Synthetic API capability fixtures only. Never executes SketchUp or a native
# image decoder. Production PhotoMaterial always invokes native ImageRep.
require 'zlib'
require 'base64'
require_relative '../../sketchup/test/fake_api'
module PhotoFixture
  def self.png(width=2,height=2)
    chunk=lambda { |type,data| [data.bytesize].pack('N')+type+data+[Zlib.crc32(type+data)].pack('N') }
    rows=("\x00".b+("\x70\x56\x29\xff".b*width))*height
    "\x89PNG\r\n\x1a\n".b+chunk.call('IHDR',[width,height,8,6,0,0,0].pack('NNCCCCC'))+chunk.call('IDAT',Zlib.deflate(rows))+chunk.call('IEND',''.b)
  end
  # Valid generated 2x2 JPEG (plain QA color), never a customer image.
  JPEG_QA_BASE64='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmKKKK8c7z/9k='.freeze
  def self.jpeg(width=2,height=2)
    bytes=Base64.strict_decode64(JPEG_QA_BASE64)
    at=bytes.index("\xff\xc0".b)
    bytes[at+5,4]=[height,width].pack('nn')
    bytes
  end
  Texture=Struct.new(:filename,:width,:height) do
    def image_width;2;end
    def image_height;2;end
    def size;File.size(filename);end
  end
  class Material < Sketchup::Material
    attr_reader :attributes,:thumbnail_calls,:color_writes,:thumbnail_sizes
    attr_accessor :save_failure,:thumbnail_failure,:texture_failure,:thumbnail_max
    def initialize(id,name)
      super(id,name,Sketchup::Color.new(112,86,41),1,nil)
      @attributes={};@thumbnail_calls=0;@color_writes=0
    end
    def name;display_name;end
    def get_attribute(dict,key,default=nil);@attributes.fetch([dict,key],default);end
    def set_attribute(dict,key,value);@attributes[[dict,key]]=value;end
    def texture=(value)
      return super(nil) if @texture_failure
      path,w,h=value.is_a?(Array) ? value : [value,1,1]
      super(Texture.new(path,w,h))
    end
    def color=(value);@color_writes+=1;super(value);end
    def write_thumbnail(path,size)
      @thumbnail_calls+=1;return false if thumbnail_failure
      (@thumbnail_sizes||=[]) << size
      raise 'Invalid size' unless [256,512].include?(size)
      raise ArgumentError,'size out of range' if thumbnail_max && size>thumbnail_max
      File.binwrite(path,PhotoFixture.png(size,size));true
    end
    def save_as(path)
      return false if save_failure
      # Solid-colour materials (no texture) are valid SketchUp materials too.
      document={'name'=>name,'attributes'=>@attributes.to_a,'color'=>color && [color.red,color.green,color.blue],
                'texture'=>texture && Base64.strict_encode64(File.binread(texture.filename)),
                'width'=>texture&.width,'height'=>texture&.height}
      File.binwrite(path,JSON.generate(document));true
    end
  end
  class Materials < Array
    attr_accessor :next_save_failure,:next_texture_failure,:next_thumbnail_failure
    def add(name)
      material=Material.new(1000+length,name)
      material.save_failure=next_save_failure;material.texture_failure=next_texture_failure;material.thumbnail_failure=next_thumbnail_failure
      self << material;material
    end
    def load(path)
      data=JSON.parse(File.binread(path));material=add(data['name'])
      data['attributes'].each { |keys,value| material.set_attribute(*keys,value) }
      material.color=Sketchup::Color.new(*data['color']) if data['color']
      return material unless data['texture']
      directory=File.dirname(path);image=File.join(directory,".fixture-embedded-image-#{material.entityID}.png")
      File.binwrite(image,Base64.strict_decode64(data['texture']))
      material.texture=[image,data['width'],data['height']];material
    end
  end
  def self.snapshot(materials)
    materials.map { |material| [material,material.respond_to?(:attributes) ? Marshal.load(Marshal.dump(material.attributes)) : nil,material.texture] }
  end
  def self.restore(materials,snapshot)
    materials.replace(snapshot.map(&:first))
    snapshot.each { |material,attributes,texture| material.attributes.replace(attributes) if attributes;material[4]=texture }
  end
  class Model
    attr_reader :materials,:operations,:undo_stack
    attr_accessor :fail_start,:fail_commit
    def initialize
      @materials=Materials.new;@operations=[];@undo_stack=[];@geometry=[['unchanged',2,3,4]]
    end
    def start_operation(name,disable_ui)
      return false if fail_start
      @before=PhotoFixture.snapshot(materials);@operations << [:start,name,disable_ui];true
    end
    def commit_operation
      return false if fail_commit
      @undo_stack << @before;@operations << [:commit];true
    end
    def abort_operation;PhotoFixture.restore(materials,@before);@operations << [:abort];true;end
    def undo;@redo=PhotoFixture.snapshot(materials);PhotoFixture.restore(materials,@undo_stack.pop);end
    def redo;@undo_stack << PhotoFixture.snapshot(materials);PhotoFixture.restore(materials,@redo);end
    def geometry;Marshal.dump(@geometry);end
  end
  module NativeTransactions
    def start_operation(*args)
      @photo_before=PhotoFixture.snapshot(materials);super
    end
    def commit_operation
      value=super
      (@photo_undo||=[]) << @photo_before unless value==false
      value
    end
    def abort_operation
      value=super;PhotoFixture.restore(materials,@photo_before);value
    end
    def undo
      value=super
      PhotoFixture.restore(materials,@photo_undo.pop) if @photo_undo && !@photo_undo.empty?
      value
    end
  end
  def self.decorate(model)
    originals=model.respond_to?(:materials) && model.materials ? model.materials.to_a : []
    collection=Materials.new(originals)
    model.define_singleton_method(:materials) { collection }
    model.singleton_class.prepend(NativeTransactions)
    model
  end
end
module Sketchup
  class ImageRep
    # Mirrors the documented API only (no resize). load_file answers nil after
    # a successful decode, like SketchUp 2026 on Windows (0.8.8 native V1).
    class << self;attr_accessor :fail_load,:fail_save,:set_data_calls;end
    attr_reader :width,:height,:bits_per_pixel,:row_padding
    def data;@data;end
    def size;@data&.bytesize;end
    def set_data(width,height,bits,padding,pixels)
      raise ArgumentError,'invalid image data' unless width.positive? && height.positive? && [8,24,32].include?(bits) && pixels.encoding==Encoding::BINARY && pixels.bytesize==(width*bits/8+padding)*height
      self.class.set_data_calls=(self.class.set_data_calls||0)+1
      @width,@height,@bits_per_pixel,@row_padding,@data=width,height,bits,padding,pixels;self
    end
    # Windows (0.8.13 native F0): load_file raises while Ruby still holds the file open.
    def self.open_in_ruby?(path)
      target=File.expand_path(path)
      ObjectSpace.each_object(File).any? { |file| !file.closed? && file.respond_to?(:path) && file.path && File.expand_path(file.path)==target rescue false }
    end
    def load_file(path)
      raise ArgumentError,'failed to load image' if self.class.open_in_ruby?(path)
      return false unless decode(path)
      @bits_per_pixel=32;@row_padding=0;@data="\x00".b*(@width*@height*4);nil
    end
    def decode(path)
      return false if self.class.fail_load
      bytes=File.binread(path)
      if bytes.start_with?("\x89PNG\r\n\x1a\n".b)
        @width,@height=bytes.byteslice(16,8).unpack('NN')
        return false unless bytes.include?('IEND') && bytes.include?('IDAT')
      elsif bytes.start_with?("\xff\xd8".b) && bytes.end_with?("\xff\xd9".b)
        at=bytes.index("\xff\xc0".b) || bytes.index("\xff\xc2".b)
        return false unless at
        @height,@width=bytes.byteslice(at+5,4).unpack('nn')
      else
        return false
      end
      true
    end
    def save_file(path);return false if self.class.fail_save;File.binwrite(path,PhotoFixture.png(width,height));true;end
  end
end
