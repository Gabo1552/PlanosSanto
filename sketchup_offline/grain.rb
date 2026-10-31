# frozen_string_literal: true
module PlanosSanto
  module Grain
    DICT='PlanosSantoGrain'.freeze
    KEY='axis_v1'.freeze
    # Vertical projection on the broad face; horizontal boards use their longer side.
    def self.axis(lengths,matrix,override=nil)
      thin=(0..2).min_by { |i| lengths[i] };axes=[0,1,2]-[thin]
      return override if override.is_a?(Integer) && axes.include?(override)
      vertical=axes.map do |i|
        scale=Math.sqrt(matrix[i*4,3].sum { |v| v*v })
        [i,scale>0 ? matrix[i*4+2].abs/scale : 0]
      end.max_by { |i,cos| [cos,lengths[i],-i] }
      vertical[1]>0.5 ? vertical[0] : axes.max_by { |i| [lengths[i],-i] }
    end
    def self.override(entity)
      value=entity.respond_to?(:get_attribute) ? entity.get_attribute(DICT,KEY) : nil
      value.is_a?(Integer) && (0..2).include?(value) ? value : nil
    end
    def self.world(node)
      (node['_parents']+[node['_entity']]).inject(Geom::Transformation.new) { |t,e| t*e.transformation }
    end
    def self.node_axis(node,native,manual=true)
      shape=native.geometry(node);bounds=shape.fetch('localBounds');lengths=native.physical_sizes(node,bounds)
      axis(lengths,world(node).to_a,manual ? override(node['_entity']) : nil)
    end
    # Material's U is its grain direction. Preserve its physical repeat size and
    # align it to the piece's chosen local axis, including scaled instances.
    def self.mapping(face,material,node,axis,front)
      return nil unless material.texture
      normal=face.normal.to_a.map(&:abs);thin=normal.index(normal.max)
      return nil if axis==thin || normal[thin]<0.999
      raise ExportError,'La textura está proyectada: quitá la proyección antes de orientar la veta.' if face.respond_to?(:texture_projected?) && face.texture_projected?(front)
      raise ExportError,'SketchUp no permite orientar la textura de esta cara.' unless face.respond_to?(:position_material)
      other=([0,1,2]-[thin,axis]).first
      matrix=world(node).to_a;scales=[0,4,8].map { |i| Math.sqrt(matrix[i,3].sum { |v| v*v }) }
      size=[material.texture.width.to_f,material.texture.height.to_f]
      raise ExportError,'La escala de textura o de la pieza no es válida.' unless (size+scales).all? { |v| v.finite? && v>1e-9 }
      a=face.vertices.first.position.to_a;b=a.dup;c=a.dup
      b[axis]+=size[0]/scales[axis];c[other]+=size[1]/scales[other]
      {'points'=>[a,b,c],'uv'=>[[0,0],[1,0],[0,1]]}
    end
    def self.apply_mapping(face,material,mapping,front)
      return unless mapping
      pairs=mapping['points'].zip(mapping['uv']).flat_map { |p,uv| [Geom::Point3d.new(*p),Geom::Point3d.new(uv[0],uv[1],1)] }
      raise ExportError,'No se pudo orientar la veta; se revirtieron los cambios.' unless face.position_material(material,pairs,front)
    end
  end
end
