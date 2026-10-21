# frozen_string_literal: true
require 'zlib'
require 'json'
require 'csv'
require_relative 'exporter'

module PlanosSanto
  module ZipBundle
    # Small, uncompressed ZIP32 writer. No external gems needed inside SketchUp.
    # Names are fixed, UTF-8, and there is no filesystem extraction.
    def self.write(document,target)
      json=JSON.pretty_generate(document)
      raise ExportError, 'La exportación supera 30 MB.' if json.bytesize>30*1024*1024
      rows=[['mueble','pieza_id','nombre','largo_mm','ancho_mm','espesor_mm','rectangular','validacion_en_sketchup']]
      document['furniture'].each do |root|
        Exporter.each_node([root]) do |node|
          next unless node['mesh']
          m=node.fetch('metadata');rows << [root['name'],node['id'],node['name'],*m.fetch('dimensionsMm'),m['rectangular'],'PENDIENTE VALIDACION MANUAL']
        end
      end
      report={ 'source'=>'SketchUp Ruby API','exporterVersion'=>VERSION,'sha256'=>Digest::SHA256.hexdigest(json),
               'modelGuid'=>document.dig('exporter','modelGuid'),'sketchupVersion'=>document.dig('exporter','sketchupVersion'),
               'furniture'=>document['furniture'].map { |f| {'id'=>f['id'],'name'=>f['name']} },'pieces'=>rows.length-1,
               'warnings'=>document.dig('exporter','warnings'),'manualValidation'=>'PENDIENTE VALIDACION MANUAL' }
      files={ 'modelo.planos-santo.json'=>json,'modelo.planos-santo.medidas.csv'=>CSV.generate { |csv| rows.each { |row| csv << row } },'modelo.planos-santo.informe.json'=>JSON.pretty_generate(report) }
      body=+''.b;central=+''.b;date=((2026-1980)<<9)|(10<<5)|15
      files.each do |name,content|
        name=name.b;data=content.b;crc=Zlib.crc32(data);size=data.bytesize;offset=body.bytesize
        body << [0x04034b50,20,0x800,0,0,date,crc,size,size,name.bytesize,0].pack('VvvvvvVVVvv') << name << data
        central << [0x02014b50,20,20,0x800,0,0,date,crc,size,size,name.bytesize,0,0,0,0,0,offset].pack('VvvvvvvVVVvvvvvVV') << name
      end
      ending=[0x06054b50,0,0,files.length,files.length,central.bytesize,body.bytesize,0].pack('VvvvvVVv')
      File.open(target,File::WRONLY|File::CREAT|File::EXCL|File::BINARY,0o600) { |io| io.write(body);io.write(central);io.write(ending) }
      report
    rescue Errno::EEXIST
      raise ExportError, 'Ese ZIP ya existe. Elegí otro nombre para conservarlo.'
    end
  end
end
