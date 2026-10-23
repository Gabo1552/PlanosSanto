# frozen_string_literal: true
# API doubles for «ver la pieza en SketchUp» (Piezas 0.8.20): camera, view and
# selection. NOT SketchUp: no viewport is rendered, the projection is a fixed
# synthetic one and the camera transition is only recorded.
module Sketchup
  unless const_defined?(:Camera, false)
    class Camera
      attr_accessor :eye, :target, :up, :fov, :height
      def initialize(eye, target, up, perspective = true, fov = 30.0)
        @eye = eye; @target = target; @up = up; @perspective = perspective; @fov = fov; @height = nil
      end
      def perspective?; @perspective; end
      def to_h; {eye:@eye.to_a, target:@target.to_a, up:@up.to_a, perspective:@perspective, fov:@fov, height:@height}; end
    end
  end
end

class HighlightViewDouble
  attr_accessor :drawing_color, :line_width, :vpwidth, :vpheight
  attr_reader :camera, :camera_calls, :draws, :draws2d, :invalidations
  def initialize(camera = Sketchup::Camera.new(Sketchup::Point.new(0, -1000, 0), Sketchup::Point.new(0, 0, 0), Sketchup::Point.new(0, 0, 1), true, 30.0), width: 1200, height: 800)
    @camera = camera; @camera_calls = []; @draws = []; @draws2d = []; @invalidations = 0; @vpwidth = width; @vpheight = height
  end
  # View#camera= takes a camera or [camera, transition seconds].
  def camera=(value)
    camera, transition = value.is_a?(Array) ? value : [value, nil]
    @camera_calls << [camera, transition]; @camera = camera
  end
  def draw(mode, points); @draws << [mode, points.map(&:to_a)]; end
  def draw2d(mode, points); @draws2d << [mode, points.map(&:to_a)]; end
  def screen_coords(point); xyz = point.to_a; Sketchup::Point.new(xyz[0] * 2, -xyz[2] * 2, 0); end
  def invalidate; @invalidations += 1; end
end

class HighlightSelectionDouble
  include Enumerable
  def initialize(items = []); @items = items.dup; end
  def each(&block); @items.each(&block); end
  def add(*items); @items.concat(items.flatten); @items.uniq!; @items.length; end
  def clear; @items.clear; end
  def to_a; @items.dup; end
  def length; @items.length; end
  def ==(other); other.respond_to?(:to_a) && other.to_a == @items; end
end
