# frozen_string_literal: true
# Tableros sintéticos compartidos por los drivers de nombres (dobles; nunca abre un SKP real).
require_relative 'names_double'
module IgualesFixture
  def self.board(guid,x,y,z)
    v=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]]
    faces=[[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]]].map { |ids,n| Sketchup::Face.new(ids.map { |i| v[i] },n) }
    Sketchup::Definition.new("Tablero #{guid}",guid,faces)
  end
end
