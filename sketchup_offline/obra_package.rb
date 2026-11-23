# frozen_string_literal: true
require 'json'
require 'tempfile'
require_relative 'exporter' unless defined?(PlanosSanto::Exporter)

module PlanosSanto
  # «Paquete de obra» (0.8.35, planos-santo.obra.v1) para el visor 3D de App Santo. La UI lo arma con el listado
  # de Piezas y los muebles generados (sketchup_offline/ui/obra.ts, esquema en lib/obra.ts); acá solo se compara
  # con los muebles generados vigentes y se escribe completo o nada. Solo lectura del modelo: no escribe el SKP,
  # la guía ni el pedido. Contrato: docs/integracion-app-santo/OBRA_JSON.md.
  module ObraPackage
    SCHEMA='planos-santo.obra.v1'
    MAX_BYTES=16*1024*1024
    MAX_PIECES=500
    STALE='El paquete no corresponde a los muebles generados: volvé a generar Piezas y exportá de nuevo.'
    # Redondeo de la UI: 6 decimales en rotación y escala, 2 en la traslación (mm).
    ROTATION_TOLERANCE=1e-5
    TRANSLATION_TOLERANCE=0.01

    # Nombre sugerido: «<modelo>.obra.json» sin caracteres que Windows no acepta.
    def self.file_name(name)
      clean=name.to_s.gsub(/[\\\/:*?"<>|\x00-\x1f]/,' ').strip.squeeze(' ')[0,80].to_s.strip
      "#{clean.empty? ? 'Obra' : clean}.obra.json"
    end

    # Valida el texto contra el documento generado (session.document) y devuelve el paquete leído.
    def self.check(text,document)
      data=parse(text)
      raise ExportError,"Paquete de obra incompatible: se esperaba #{SCHEMA}." unless data['schema']==SCHEMA
      raise ExportError,'El paquete de obra tiene que estar en milímetros.' unless data['unidades']=='mm'
      muebles=data['muebles']
      raise ExportError,'Paquete de obra inválido.' unless muebles.is_a?(Array) && !muebles.empty? && muebles.all? { |m| m.is_a?(Hash) }
      raise ExportError,"El paquete supera #{Exporter::MAX_FURNITURE} muebles." if muebles.length>Exporter::MAX_FURNITURE
      roots=Array(document && document['furniture'])
      raise ExportError,STALE unless muebles.map { |m| m['id'] }==roots.map { |root| root['id'] }
      muebles.zip(roots).each { |mueble,root| check_furniture(mueble,root) }
      data
    end

    # Escribe el paquete ya validado: UTF-8 sin BOM, a un temporal en la misma carpeta y después renombra.
    def self.write(text,target,document)
      check(text,document)
      target=target.to_s
      target+='.obra.json' unless target.downcase.end_with?('.json')
      bytes=text.dup.force_encoding(Encoding::UTF_8)
      Tempfile.create(['.planos-santo-','.json'],File.dirname(target)) do |file|
        file.binmode;file.write(bytes);file.flush;file.fsync;file.close
        File.rename(file.path,target)
      end
      {'path'=>target,'bytes'=>bytes.bytesize}
    end

    def self.parse(text)
      raise ExportError,'Paquete de obra inválido.' unless text.is_a?(String) && text.bytesize.between?(1,MAX_BYTES)
      body=text.dup.force_encoding(Encoding::UTF_8)
      raise ExportError,'Paquete de obra inválido.' unless body.valid_encoding? && !body.include?("\0")
      data=JSON.parse(body,max_nesting:20)
      raise ExportError,'Paquete de obra inválido.' unless data.is_a?(Hash)
      data
    rescue JSON::ParserError
      raise ExportError,'Paquete de obra inválido.'
    end

    # El mueble: el nombre es el de la columna «Mueble» del CSV (root['name']); cada pieza con geometría,
    # una sola vez y en el lugar donde está en el modelo.
    def self.check_furniture(mueble,root)
      raise ExportError,"El mueble «#{root['name']}» cambió de nombre: volvé a generar Piezas y exportá de nuevo." unless mueble['nombre']==root['name']
      piezas=mueble['piezas']
      raise ExportError,'Paquete de obra inválido.' unless piezas.is_a?(Array) && piezas.all? { |p| p.is_a?(Hash) }
      raise ExportError,"#{root['name']}: supera #{MAX_PIECES} piezas." if piezas.length>MAX_PIECES
      nodes={}
      Exporter.each_node([root]) { |node| nodes[node['id']]=node if node['mesh'] }
      ids=piezas.map { |p| p['id'] }
      raise ExportError,STALE unless ids.uniq.length==ids.length && ids.sort==nodes.keys.sort
      piezas.each do |pieza|
        transform=pieza['transform']
        raise ExportError,"#{pieza['id']}: ubicación inválida." unless matrix?(transform) && box?(pieza['caja'])
        world=nodes[pieza['id']].dig('metadata','worldTransform')
        raise ExportError,"Una pieza de «#{root['name']}» se movió desde que se generó Piezas: volvé a generar y exportá de nuevo." unless same_place?(transform,world)
      end
    end

    def self.number?(value)
      value.is_a?(Numeric) && value.to_f.finite?
    end

    def self.matrix?(value)
      value.is_a?(Array) && value.length==16 && value.all? { |n| number?(n) }
    end

    def self.box?(value)
      value.is_a?(Hash) && %w[min max].all? { |key| value[key].is_a?(Array) && value[key].length==3 && value[key].all? { |n| number?(n) } }
    end

    def self.same_place?(transform,world)
      return false unless matrix?(world)
      transform.each_with_index.all? do |value,index|
        tolerance=[12,13,14].include?(index) ? TRANSLATION_TOLERANCE : ROTATION_TOLERANCE
        (value.to_f-world[index].to_f).abs<=tolerance+1e-9
      end
    end
  end
end
