# frozen_string_literal: true
module PlanosSanto
  # Veta de corte por pieza (0.8.26). Un solo lugar decide el eje local de la veta de cada pieza:
  # - automático: en una pieza vertical (puerta, lateral, fondo, frente de cajón) la veta sigue la altura del
  #   mueble, es decir el eje ancho más vertical del modelo; en una pieza horizontal (estante, techo, piso),
  #   el lado más largo;
  # - manual: el eje guardado en la instancia (`PlanosSantoGrain/axis_v1`, 0..2; -1 = automático) desde Piezas.
  # Lo ambiguo no se adivina en silencio: queda un aviso (`review`) que Piezas y el pedido muestran hasta que
  # el taller elige la veta a mano. El eje sale en la metadata del escaneo (`grainAxis`, eje local), en la
  # geometría del pedido y en Piezas; el largo de una pieza con veta es la medida a lo largo de la veta.
  #
  # Textura: `PhotoMaterial` crea la textura con el ancho de la foto (U) a lo largo del largo de la placa
  # (`alongLength` = largo de la placa / ancho de la textura) y la ficha dice «La fibra sigue el largo»; la foto
  # se gira de a 90° en «Ajustar escala y giro» para dejar la fibra horizontal. Por eso la U de la textura es la
  # dirección de la veta y `mapping` alinea U con el eje elegido.
  module Grain
    DICT='PlanosSantoGrain'.freeze
    KEY='axis_v1'.freeze
    AUTO=-1
    TOLERANCE=0.1
    # cos con la vertical: >= VERTICAL es vertical (2,6°), <= FLAT es horizontal (1°); lo demás, inclinado.
    VERTICAL=0.999
    FLAT=0.017
    SQUARE='Largo igual al ancho: la veta no tiene un lado más largo que seguir. Confirmala o girala en Piezas.'.freeze
    WIDE='Pieza vertical más ancha que alta (frente de cajón, zócalo): la veta va vertical, siguiendo la altura del mueble. Si la querés horizontal, girala en Piezas.'.freeze
    OBLIQUE='Pieza inclinada respecto de la vertical del modelo: no se sabe si es vertical u horizontal. Revisá la veta en Piezas.'.freeze
    TILTED='El mueble está acostado o girado fuera de la vertical del modelo: la veta automática toma la vertical del modelo. Revisala en Piezas.'.freeze

    def self.override(entity)
      value=entity.respond_to?(:get_attribute) ? entity.get_attribute(DICT,KEY) : nil
      value.is_a?(Integer) && (0..2).include?(value) ? value : nil
    end
    # |componente vertical| de la dirección mundo del eje local `axis` (matriz por columnas, como Transformation#to_a).
    def self.vertical_cos(matrix,axis)
      column=matrix[axis*4,3].map(&:to_f);length=Math.sqrt(column.sum { |v| v*v })
      length>1e-12 ? column[2].abs/length : 0.0
    end
    def self.scales(matrix);[0,4,8].map { |i| Math.sqrt(matrix[i,3].sum { |v| v.to_f*v.to_f }) };end
    # Instancia espejada: el determinante de la parte lineal (columnas x, y, z) es negativo.
    def self.mirrored?(matrix)
      x,y,z=[0,4,8].map { |i| matrix[i,3].map(&:to_f) }
      x[0]*(y[1]*z[2]-y[2]*z[1])-x[1]*(y[0]*z[2]-y[2]*z[0])+x[2]*(y[0]*z[1]-y[1]*z[0])<0
    end

    # lengths: medidas físicas (mm) por eje local; matrix: transformación mundo de la pieza; root: la del
    # contenedor de primer nivel (para avisar un mueble acostado). nil si la pieza no tiene un espesor claro.
    def self.info(lengths,matrix,override: nil,root: nil)
      return nil unless lengths.is_a?(Array) && lengths.length==3 && lengths.all? { |v| v.is_a?(Numeric) && v.finite? && v>0 }
      thin=(0..2).min_by { |i| [lengths[i],i] };axes=[0,1,2]-[thin]
      return nil unless axes.all? { |i| lengths[i]-lengths[thin]>0.01 }
      cos=axes.to_h { |i| [i,vertical_cos(matrix,i)] }
      vertical=axes.max_by { |i| [cos[i],lengths[i],-i] };longest=axes.max_by { |i| [lengths[i],-i] }
      other=(axes-[vertical]).first
      auto,review=if cos[vertical]>=VERTICAL
                    [vertical,lengths[vertical]+TOLERANCE<lengths[other] ? WIDE : nil]
                  elsif axes.all? { |i| cos[i]<=FLAT }
                    [longest,(lengths[axes[0]]-lengths[axes[1]]).abs<=TOLERANCE ? SQUARE : nil]
                  else
                    [cos[vertical]>0.5 ? vertical : longest,OBLIQUE]
                  end
      # Un mueble acostado explica los demás avisos de sus piezas: se avisa eso.
      review=TILTED if root && vertical_cos(root,2)<VERTICAL
      manual=override.is_a?(Integer) && axes.include?(override)
      axis=manual ? override : auto
      {'axis'=>axis,'auto'=>auto,'source'=>manual ? 'manual' : 'auto','review'=>manual ? nil : review,
       'direction'=>cos[axis]>=0.5 ? 'vertical' : 'horizontal','thickness'=>thin,'broad'=>axes}
    end
    # Metadata del escaneo (Exporter#walk): solo lee la instancia.
    def self.metadata(bounds,matrix,entity,root)
      sizes=scales(matrix)
      lengths=3.times.map { |i| (bounds['max'][i]-bounds['min'][i])*sizes[i] }
      found=info(lengths,matrix,override:override(entity),root:root)
      found ? {'grainAxis'=>found['axis'],'grainSource'=>found['source'],'grainReview'=>found['review'],'grainDirection'=>found['direction']} : {}
    end
    # Geometría del pedido: la metadata del escaneo manda; un documento sin ella (anterior a 0.8.26) usa el
    # mismo criterio automático.
    def self.from_metadata(meta,lengths,matrix)
      found=info(lengths,matrix)
      return {} unless found
      axis=meta['grainAxis']
      if axis.is_a?(Integer) && found['broad'].include?(axis)
        return {'grainAxis'=>axis,'grainSource'=>meta['grainSource']=='manual' ? 'manual' : 'auto','grainReview'=>meta['grainReview'].is_a?(String) ? meta['grainReview'] : nil,
                'grainDirection'=>%w[vertical horizontal].include?(meta['grainDirection']) ? meta['grainDirection'] : found['direction']}
      end
      {'grainAxis'=>found['axis'],'grainSource'=>'auto','grainReview'=>found['review'],'grainDirection'=>found['direction']}
    end

    def self.world(node)
      (node['_parents']+[node['_entity']]).inject(Geom::Transformation.new) { |t,e| t*e.transformation }
    end
    # Eje local de la normal de la cara, o nil si no está alineada con un eje (cara oblicua).
    def self.face_axis(face)
      normal=face.normal.to_a.map { |v| v.to_f.abs };length=Math.sqrt(normal.sum { |v| v*v })
      return nil unless length>0
      axis=normal.index(normal.max)
      normal[axis]/length>=0.999 ? axis : nil
    end
    # Puntos para Face#position_material: U de la textura a lo largo de `axis`, con el tamaño físico de la
    # textura aunque la instancia esté escalada (las caras están en coordenadas locales). nil sin textura o
    # cuando la cara es la testa de la veta (su normal es el eje de la veta).
    # Sentido: U×V tiene que apuntar hacia quien mira ese lado de la cara; si (eje × otro)·normal < 0 (caras
    # del lado negativo, el dorso `front: false` o una instancia espejada) V va al revés y la foto no sale espejada.
    def self.mapping(face,material,scales,axis,front: true,mirrored: false)
      texture=material.texture
      return nil unless texture
      normal=face_axis(face)
      return nil if normal.nil? || normal==axis
      raise ExportError,'SketchUp no permite orientar la textura de esta cara.' unless face.respond_to?(:position_material) && face.respond_to?(:vertices)
      other=([0,1,2]-[normal,axis]).first
      size=[texture.width.to_f,texture.height.to_f]
      raise ExportError,'La escala de la textura o de la pieza no es válida: revisala antes de orientar la veta.' unless (size+scales).all? { |v| v.finite? && v>1e-9 }
      u=[0.0,0.0,0.0];v=[0.0,0.0,0.0];u[axis]=1.0;v[other]=1.0
      cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
      facing=cross.zip(face.normal.to_a).sum { |p,q| p*q.to_f }
      facing=-facing unless front
      facing=-facing if mirrored
      a=face.vertices.first.position.to_a.map(&:to_f);b=a.dup;c=a.dup
      b[axis]+=size[0]/scales[axis];c[other]+=(facing<0 ? -size[1] : size[1])/scales[other]
      {'points'=>[a,b,c],'uv'=>[[0,0],[1,0],[0,1]]}
    end
    # UV como Point3d con q=1 (UVQ), igual que los devuelve UVHelper.
    def self.apply_mapping(face,material,mapping,front)
      return false unless mapping
      pairs=mapping['points'].zip(mapping['uv']).flat_map { |p,uv| [Geom::Point3d.new(*p),Geom::Point3d.new(uv[0],uv[1],1)] }
      raise ExportError,'SketchUp no orientó la textura; se revirtieron los cambios.' unless face.position_material(material,pairs,front)
      true
    end
  end
end
