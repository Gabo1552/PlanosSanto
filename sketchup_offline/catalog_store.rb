# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'
require 'fileutils'
require 'tempfile'
require 'time'

module PlanosSanto
  class CatalogStore
    attr_reader :directory
    MAX_BYTES=8*1024*1024
    KINDS=%w[unknown sheet edge solid_wood dimensional veneer].freeze
    FIELDS=%w[id name kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds price favorite approved updatedAt sourceHash observed].freeze
    def self.default_directory
      base=ENV['LOCALAPPDATA'] || ENV['APPDATA'] || ENV['XDG_DATA_HOME'] || File.join(Dir.home,'.local','share')
      File.join(base,'PlanosSanto')
    end
    def initialize(directory: self.class.default_directory)
      @directory=directory;@path=File.join(directory,'catalog.json')
    end
    def empty; {'schema'=>1,'revision'=>0,'items'=>[]};end
    def read
      return empty unless File.exist?(@path)
      raise ExportError,'La biblioteca supera 8 MiB.' if File.size(@path)>MAX_BYTES
      data=JSON.parse(File.read(@path))
      # Migration is explicit in memory, all old records remain unapproved.
      if data['schema']==0 && data['materials'].is_a?(Array)
        data={'schema'=>1,'revision'=>data.fetch('revision',0),'items'=>data['materials'].map { |row| new_item(row.fetch('name'),row.fetch('kind','unknown'),row) }}
      end
      validate(data);data
    rescue JSON::ParserError
      raise ExportError,'La biblioteca está dañada; no se sobrescribió. Restaurá una copia de seguridad.'
    end
    def text(value,limit=160)
      raise ExportError,'Texto inválido en biblioteca.' unless value.is_a?(String) && value.length<=limit && !value.match?(/[\x00-\x1f\x7f]/)
      value.unicode_normalize(:nfc).strip
    end
    def validate(data)
      raise ExportError,'Versión de biblioteca desconocida.' unless data.is_a?(Hash) && data.keys.sort==%w[items revision schema] && data['schema']==1 && data['revision'].is_a?(Integer) && data['revision']>=0 && data['items'].is_a?(Array) && data['items'].length<=5000
      ids=[]
      data['items'].each do |row|
        raise ExportError,'Registro de biblioteca inválido.' unless row.is_a?(Hash) && row.keys.sort==FIELDS.sort
        raise ExportError,'ID de biblioteca inválido.' unless row['id'].is_a?(String) && row['id'].match?(/\A[0-9a-f-]{36}\z/) && !ids.include?(row['id'])
        ids << row['id'];raise ExportError,'Nombre/tipo de material inválido.' if text(row['name']).empty? || !KINDS.include?(row['kind'])
        %w[sku supplier].each { |key| text(row[key]) }
        %w[thicknessMm widthMm lengthMm].each { |key| value=row[key];raise ExportError,'Medida inválida en biblioteca.' unless value.nil? || (value.is_a?(Numeric) && value.finite? && value>0 && value<=100000) }
        raise ExportError,'Veta sin resolver.' unless [nil,true,false].include?(row['grain'])
        %w[favorite approved].each { |key| raise ExportError,'Estado de biblioteca inválido.' unless [true,false].include?(row[key]) }
        raise ExportError,'Compatibilidades inválidas.' unless row['compatibleIds'].is_a?(Array) && row['compatibleIds'].length<=5000 && row['compatibleIds'].uniq==row['compatibleIds'] && row['compatibleIds'].all? { |id| id.is_a?(String) }
        if row['approved']
          raise ExportError,'Para aprobar, completá tipo, SKU, proveedor y espesor.' if row['kind']=='unknown' || row['sku'].strip.empty? || row['supplier'].strip.empty? || row['thicknessMm'].nil?
          if row['kind']=='sheet'
            raise ExportError,'Para aprobar una placa, completá formato y veta.' if row['widthMm'].nil? || row['lengthMm'].nil? || row['grain'].nil?
          end
          raise ExportError,'Para aprobar un canto, completá su ancho.' if row['kind']=='edge' && row['widthMm'].nil?
        end
        if row['price']
          p=row['price'];raise ExportError,'Precio incompleto.' unless p.is_a?(Hash) && p.keys.sort==%w[amount currency date source unit] && p['amount'].is_a?(Numeric) && p['amount'].finite? && p['amount']>0
          %w[currency source unit].each { |key| raise ExportError,'Falta moneda, unidad o fuente del precio.' if text(p[key]).empty? }
          raise ExportError,'Fecha del precio inválida.' unless p['date'].is_a?(String) && p['date'].match?(/\A\d{4}-\d{2}-\d{2}\z/) && (Time.strptime(p['date'],'%Y-%m-%d').strftime('%Y-%m-%d')==p['date'] rescue false)
        end
        raise ExportError,'Procedencia inválida.' unless row['observed'].is_a?(Hash) && row['sourceHash'].is_a?(String) && row['sourceHash'].match?(/\A[0-9a-f]{64}\z/) && row['updatedAt'].is_a?(String)
      end
      data['items'].each do |row|
        raise ExportError,'Canto compatible no existente o tipo incorrecto.' unless row['compatibleIds'].all? { |id| data['items'].any? { |other| other['id']==id && other['kind']=='edge' } }
      end
      data
    end
    def new_item(name,kind,observed={})
      observed={'source'=>'manual','record'=>SecureRandom.uuid} if observed.empty?
      raw=JSON.generate(canonical({'name'=>name,'kind'=>kind,'observed'=>observed}))
      {'id'=>SecureRandom.uuid,'name'=>text(name),'kind'=>KINDS.include?(kind) ? kind : 'unknown','sku'=>'','supplier'=>'',
       'thicknessMm'=>nil,'widthMm'=>nil,'lengthMm'=>nil,'grain'=>nil,'compatibleIds'=>[],'price'=>nil,'favorite'=>false,'approved'=>false,
       'updatedAt'=>Time.now.utc.iso8601,'sourceHash'=>Digest::SHA256.hexdigest(raw),'observed'=>observed}
    end
    def canonical(value)
      value.is_a?(Hash) ? value.sort.to_h.transform_values { |v| canonical(v) } : value.is_a?(Array) ? value.map { |v| canonical(v) } : value
    end
    def transaction(revision)
      FileUtils.mkdir_p(@directory)
      File.open(File.join(@directory,'catalog.lock'),File::RDWR|File::CREAT,0o600) do |lock|
        raise ExportError,'Otra ventana está guardando la biblioteca.' unless lock.flock(File::LOCK_EX|File::LOCK_NB)
        current=read;raise ExportError,'La biblioteca cambió en otra ventana. Volvé a cargarla.' unless current['revision']==revision
        result=yield(JSON.parse(JSON.generate(current)))
        result['revision']=revision+1;validate(result);bytes=JSON.pretty_generate(result)
        raise ExportError,'La biblioteca supera 8 MiB.' if bytes.bytesize>MAX_BYTES
        if File.file?(@path)
          backups=File.join(@directory,'backups');FileUtils.mkdir_p(backups)
          File.open(File.join(backups,"catalog-#{revision}-#{SecureRandom.hex(6)}.json"),File::WRONLY|File::CREAT|File::EXCL,0o600) { |f| f.write(File.binread(@path));f.flush;f.fsync }
        end
        Tempfile.create(['.catalog-','.json'],@directory) do |file|
          file.write(bytes);file.flush;file.fsync;file.close;File.rename(file.path,@path)
        end
        result
      ensure
        lock.flock(File::LOCK_UN) if lock
      end
    end
    def save(items,revision);transaction(revision) { |current| current['items']=items;current };end
    def import(data,revision)
      candidates=if data.is_a?(Hash) && data['schema']==1 && data['items'].is_a?(Array)
        validate(data);data['items'].map { |row| row.merge('approved'=>false) }
      elsif data.is_a?(Hash) && data['items'].is_a?(Array)
        data['items'].map do |row|
          # No material-name heuristic: candidate types stay unresolved if not a known code.
          kind={'2'=>'sheet','4'=>'edge','1'=>'solid_wood','3'=>'dimensional','6'=>'veneer'}[row['tipo_opencutlist'].to_s] || 'unknown'
          new_item(row.fetch('nombre_en_modelos'),kind,row)
        end
      elsif data.is_a?(Hash) && data['schema']=='planos-santo.material-review.v1'
        data.fetch('materials').reject { |row| row['category']=='hardware' }.map { |row| new_item(row.fetch('name'),row.fetch('category'),{'name'=>row['name'],'attributes'=>row['attributes_observed'],'kind'=>row['category']}) }
      else
        raise ExportError,'Formato de biblioteca/importación no reconocido.'
      end
      raise ExportError,'Demasiados candidatos.' if candidates.length>5000
      transaction(revision) do |current|
        candidates.each do |row|
          matches=current['items'].select { |existing| existing['sourceHash']==row['sourceHash'] }
          fields=%w[name kind sku supplier thicknessMm widthMm lengthMm grain price]
          next if !matches.empty? && (data['schema']!=1 || matches.any? { |existing| fields.all? { |key| existing[key]==row[key] } })
          row['id']=SecureRandom.uuid if current['items'].any? { |existing| existing['id']==row['id'] }
          # Imported compatibility IDs reference another library; reconcile explicitly.
          row['compatibleIds']=[];row['approved']=false
          current['items'] << row
        end
        current
      end
    end
    def conflicts(data=read)
      data['items'].group_by { |row| row['name'].unicode_normalize(:nfc).downcase }.values.select { |rows| rows.length>1 }.map { |rows| rows.map { |row| row['id'] } }
    end
    def export(target)
      raise ExportError,'Elegí un archivo .json nuevo.' unless File.extname(target).downcase=='.json'
      File.open(target,File::WRONLY|File::CREAT|File::EXCL,0o600) { |file| file.write(JSON.pretty_generate(read));file.flush;file.fsync }
    rescue Errno::EEXIST
      raise ExportError,'Ese archivo ya existe; no se sobrescribió.'
    end
  end
end
