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
    SCHEMA=4
    FIELDS_V1=%w[id name kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds price favorite approved updatedAt sourceHash observed].freeze
    # Schema 2 (F-MAT-D): base item of a thickness variant, free notes and the
    # fields that were prefilled as unapproved suggestions (preset, OCL, SKM...).
    FIELDS_V2=(FIELDS_V1+%w[variantOf notes suggested]).freeze
    # Schema 3 (0.8.17): «Espesores estándar» of the ficha. `thicknessMm` stays the
    # chosen thickness (orders, OCL, ficha completa) and is always part of the list.
    FIELDS_V3=(FIELDS_V2+%w[thicknessesMm]).freeze
    # Schema 4 (0.8.20, Gabriel): a sheet has no single thickness any more. Every value of
    # `thicknessesMm` is valid: the material is the same for any of them and the cutlist splits
    # the pieces by their real thickness. `thicknessMm` stays in the record only for edges (the
    # band thickness that is deducted from the cut); a sheet keeps it nil. An edge keeps its
    # standard widths in `widthsMm` (22 and 45 mm by default) and `widthMm` nil: the band is
    # trimmed after edging, so its width never blocks anything.
    FIELDS=(FIELDS_V3+%w[widthsMm]).freeze
    # Shared by JSON and ZIP imports: v4 lists carry the commercial dimensions.
    IMPORT_FIELDS=%w[name kind sku supplier thicknessMm thicknessesMm widthMm widthsMm lengthMm grain price].freeze
    MAX_THICKNESSES=32
    # Fallback when presets-taller.json has no valid `standardThicknessesMm` (Gabriel, 22/10).
    DEFAULT_THICKNESSES={'sheet'=>[3,5,12,15,18,25],'edge'=>[0.45,2]}.freeze
    # Fallback when presets-taller.json has no valid `standardWidthsMm` (Gabriel, 23/10).
    DEFAULT_WIDTHS={'edge'=>[22,45]}.freeze
    TOLERANCE=0.1
    PRESETS=File.join(__dir__,'presets-taller.json')
    SUGGESTION_SOURCES=%w[preset ocl skm variant].freeze
    SUGGESTABLE=%w[kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds].freeze
    def self.measure?(value)
      value.is_a?(Numeric) && value.finite? && value>0 && value<=100000
    end
    # Per-kind standard thicknesses: presets-taller.json (editable, shipped with the
    # extension) or the constants above. Other kinds start with an empty list.
    def self.default_thicknesses_all(path=PRESETS)
      return @default_thicknesses.transform_values(&:dup) if path==PRESETS && @default_thicknesses
      result=preset_lists(path,'standardThicknessesMm',DEFAULT_THICKNESSES)
      @default_thicknesses=result.transform_values(&:dup) if path==PRESETS
      result
    end
    def self.default_thicknesses(kind);(default_thicknesses_all[kind] || []).dup;end
    # Standard edge widths, same rules as the thicknesses. Only edges have a list of widths.
    def self.default_widths_all(path=PRESETS)
      return @default_widths.transform_values(&:dup) if path==PRESETS && @default_widths
      result=preset_lists(path,'standardWidthsMm',DEFAULT_WIDTHS)
      @default_widths=result.transform_values(&:dup) if path==PRESETS
      result
    end
    def self.default_widths(kind);(default_widths_all[kind] || []).dup;end
    def self.preset_lists(path,key,fallback)
      data=JSON.parse(File.read(path,encoding:'UTF-8'))[key] rescue nil
      valid=data.is_a?(Hash) && data.keys.sort==fallback.keys.sort && data.values.all? { |list| list.is_a?(Array) && list.length.between?(1,MAX_THICKNESSES) && list.all? { |value| measure?(value) } && list.uniq==list }
      (valid ? data : fallback).transform_values { |list| list.map { |value| clean_measure(value) }.sort }
    end
    def self.clean_measure(value)
      rounded=value.to_f.round(3)
      rounded==rounded.to_i ? rounded.to_i : rounded
    end
    # Sorted, without repetitions and always including the single value of the record
    # (the old chosen thickness, or an edge's band thickness). A list with anything that
    # is not a valid measure is left untouched for #validate.
    def self.thickness_list(row);merged_list(row['thicknessesMm'],row['thicknessMm']);end
    def self.width_list(row);merged_list(row['widthsMm'],row['kind']=='edge' ? row['widthMm'] : nil);end
    def self.merged_list(list,single)
      return list unless list.nil? || (list.is_a?(Array) && list.all? { |value| measure?(value) })
      values=(list || [])+(measure?(single) ? [single] : [])
      values.map { |value| clean_measure(value) }.uniq.sort
    end
    # A measure of the list within 0,1 mm (the geometry reads 17,999 for 18).
    def self.in_list?(list,value)
      list.is_a?(Array) && value.is_a?(Numeric) && list.any? { |item| item.is_a?(Numeric) && (item-value).abs<=TOLERANCE }
    end
    # The thicknesses a sheet comes in / the widths an edge comes in, for any record shape.
    def self.thicknesses_of(item)
      list=thickness_list(item)
      list.is_a?(Array) ? list.select { |value| measure?(value) } : []
    end
    def self.widths_of(item)
      list=width_list(item)
      list.is_a?(Array) ? list.select { |value| measure?(value) } : []
    end
    # Brings a v1/v2/v3 record to the current shape without losing data. Used by the
    # migration, by package imports and by saves from older windows.
    def self.upgrade_row(row)
      return row unless row.is_a?(Hash)
      row=row.merge('variantOf'=>nil,'notes'=>'','suggested'=>nil) if row.keys.sort==FIELDS_V1.sort
      if row.keys.sort==FIELDS_V2.sort
        defaults=%w[sheet edge].include?(row['kind']) ? default_thicknesses(row['kind']) : []
        row=row.merge('thicknessesMm'=>thickness_list(row.merge('thicknessesMm'=>defaults)))
      end
      # 0.8.20: an edge gets the standard widths plus its own; #normalize_row moves the single values into the lists.
      row=row.merge('widthsMm'=>row['kind']=='edge' ? width_list(row.merge('widthsMm'=>default_widths('edge'))) : []) if row.keys.sort==FIELDS_V3.sort
      normalize_row(row)
    end
    # Idempotent. A sheet's thicknesses and an edge's widths live only in their lists.
    def self.normalize_row(row)
      return row unless row.is_a?(Hash) && row.key?('thicknessesMm')
      row=row.merge('thicknessesMm'=>thickness_list(row))
      row=row.merge('thicknessMm'=>nil) if row['kind']=='sheet' && valid_list?(row['thicknessesMm'])
      return row unless row.key?('widthsMm')
      row=row.merge('widthsMm'=>width_list(row))
      row=row.merge('widthMm'=>nil) if row['kind']=='edge' && valid_list?(row['widthsMm'])
      row
    end
    def self.same_import_values?(left,right)
      left=normalize_row(left);right=normalize_row(right)
      IMPORT_FIELDS.all? { |key| left[key]==right[key] }
    end
    def self.valid_list?(list);list.is_a?(Array) && list.all? { |value| measure?(value) };end
    def self.default_directory
      base=ENV['LOCALAPPDATA'] || ENV['APPDATA'] || ENV['XDG_DATA_HOME'] || File.join(Dir.home,'.local','share')
      File.join(base,'PlanosSanto')
    end
    def initialize(directory: self.class.default_directory)
      @directory=directory;@path=File.join(directory,'catalog.json')
    end
    def empty; {'schema'=>SCHEMA,'revision'=>0,'items'=>[]};end
    DAMAGED='La biblioteca está dañada; no se sobrescribió. Restaurá una copia de seguridad.'
    def read;load[2];end
    # One bounded read: [bytes, parsed, migrated]. Backups and the on-disk schema
    # always describe exactly the bytes that were migrated.
    def load
      return [nil,nil,empty] unless File.exist?(@path)
      raise ExportError,'La biblioteca es un enlace o no es un archivo; no se modificó.' if File.symlink?(@path) || !File.file?(@path)
      bytes=File.open(@path,'rb') { |file| file.read(MAX_BYTES+1) } || ''.b
      raise ExportError,'La biblioteca supera 8 MiB.' if bytes.bytesize>MAX_BYTES
      parsed=JSON.parse(bytes.dup.force_encoding(Encoding::UTF_8))
      [bytes,parsed,migrate(parsed)]
    rescue JSON::ParserError,EncodingError,ArgumentError
      raise ExportError,DAMAGED
    rescue SystemCallError => error
      raise ExportError,"No se pudo leer la biblioteca (#{error.class.name.split('::').last}); no se modificó."
    end
    # Explicit, in-memory and lossless. The file on disk keeps its old schema
    # until the next save, which first writes a verified pre-migration backup.
    def migrate(data)
      raise ExportError,DAMAGED unless data.is_a?(Hash) && data['schema'].is_a?(Integer)
      if data['schema']==0 && data['materials'].is_a?(Array)
        # All schema-0 records remain unapproved.
        raise ExportError,DAMAGED unless data['materials'].all? { |row| row.is_a?(Hash) && row['name'].is_a?(String) }
        data={'schema'=>1,'revision'=>data.fetch('revision',0),'items'=>data['materials'].map { |row| new_item(row['name'],row.fetch('kind','unknown'),row).slice(*FIELDS_V1) }}
      end
      raise ExportError,"La biblioteca usa un esquema más nuevo (#{data['schema']}) que esta versión de Planos Santo; no se modificó. Actualizá la extensión." if data['schema'].is_a?(Integer) && data['schema']>SCHEMA
      if data['schema']==1
        validate(data,schema:1)
        data=data.merge('schema'=>2,'items'=>data['items'].map { |row| row.merge('variantOf'=>nil,'notes'=>'','suggested'=>nil) })
      end
      if [2,3].include?(data['schema'])
        # 0.8.17 (v2→v3): each ficha gets its «Espesores estándar»: the defaults of its kind plus its own thickness.
        # 0.8.20 (v3→v4): a sheet keeps every thickness of its list (the chosen one is already there) and none is
        # «the» thickness; an edge gets its standard widths (22 and 45 mm by default) plus its own.
        # #upgrade_row takes a record through every step at once.
        validate(data,schema:data['schema'])
        data=data.merge('schema'=>SCHEMA,'items'=>data['items'].map { |row| self.class.upgrade_row(row) })
      elsif data['schema']==SCHEMA && data['items'].is_a?(Array)
        # A v4 file written by hand or by another tool with a sheet's single thickness (or an edge's single
        # width) is read with that value in its list, never rejected; the next save writes it normalized.
        data=data.merge('items'=>data['items'].map { |row| self.class.normalize_row(row) })
      end
      validate(data)
    end
    # nil when the file is current; otherwise the pending on-disk migration.
    def migration(parsed=load[1])
      schema=parsed.is_a?(Hash) ? parsed['schema'] : nil
      schema.is_a?(Integer) && schema<SCHEMA ? {'from'=>schema,'to'=>SCHEMA,'pending'=>true} : nil
    end
    def text(value,limit=160)
      raise ExportError,'Texto inválido en biblioteca.' unless value.is_a?(String) && value.length<=limit && !value.match?(/[\x00-\x1f\x7f]/)
      value.unicode_normalize(:nfc).strip
    end
    def validate(data,schema:SCHEMA)
      raise ExportError,'Versión de biblioteca desconocida.' unless data.is_a?(Hash) && data.keys.sort==%w[items revision schema] && data['schema']==schema && data['revision'].is_a?(Integer) && data['revision']>=0 && data['items'].is_a?(Array) && data['items'].length<=5000
      ids=[];fields={1=>FIELDS_V1,2=>FIELDS_V2,3=>FIELDS_V3}.fetch(schema,FIELDS)
      data['items'].each do |row|
        raise ExportError,'Registro de biblioteca inválido.' unless row.is_a?(Hash) && row.keys.sort==fields.sort
        raise ExportError,'ID de biblioteca inválido.' unless row['id'].is_a?(String) && row['id'].match?(/\A[0-9a-f-]{36}\z/) && !ids.include?(row['id'])
        ids << row['id'];raise ExportError,'Nombre/tipo de material inválido.' if text(row['name']).empty? || !KINDS.include?(row['kind'])
        %w[sku supplier].each { |key| text(row[key]) }
        %w[thicknessMm widthMm lengthMm].each { |key| value=row[key];raise ExportError,'Medida inválida en biblioteca.' unless value.nil? || (value.is_a?(Numeric) && value.finite? && value>0 && value<=100000) }
        raise ExportError,'Veta sin resolver.' unless [nil,true,false].include?(row['grain'])
        # `approved` stays in the file only for compatibility with 0.8.15 and older: it no longer filters or blocks anything.
        %w[favorite approved].each { |key| raise ExportError,'Estado de biblioteca inválido.' unless [true,false].include?(row[key]) }
        raise ExportError,'Compatibilidades inválidas.' unless row['compatibleIds'].is_a?(Array) && row['compatibleIds'].length<=5000 && row['compatibleIds'].uniq==row['compatibleIds'] && row['compatibleIds'].all? { |id| id.is_a?(String) }
        if row['price']
          p=row['price'];raise ExportError,'Precio incompleto.' unless p.is_a?(Hash) && p.keys.sort==%w[amount currency date source unit] && p['amount'].is_a?(Numeric) && p['amount'].finite? && p['amount']>0 && p['amount']<=1e9
          %w[currency source unit].each { |key| raise ExportError,'Falta moneda, unidad o fuente del precio.' if text(p[key]).empty? }
          raise ExportError,'Fecha del precio inválida.' unless p['date'].is_a?(String) && p['date'].match?(/\A\d{4}-\d{2}-\d{2}\z/) && (Time.strptime(p['date'],'%Y-%m-%d').strftime('%Y-%m-%d')==p['date'] rescue false)
        end
        raise ExportError,'Procedencia inválida.' unless row['observed'].is_a?(Hash) && row['sourceHash'].is_a?(String) && row['sourceHash'].match?(/\A[0-9a-f]{64}\z/) && row['updatedAt'].is_a?(String)
        validate_v2_fields(row) unless schema==1
        validate_v3_fields(row) if schema>=3
        validate_v4_fields(row) if schema>=4
      end
      data['items'].each do |row|
        raise ExportError,'Canto compatible no existente o tipo incorrecto.' unless row['compatibleIds'].all? { |id| data['items'].any? { |other| other['id']==id && other['kind']=='edge' } }
        next if schema==1 || row['variantOf'].nil?
        base=data['items'].find { |other| other['id']==row['variantOf'] }
        raise ExportError,'La variante apunta a una ficha base inexistente, de otro tipo o a otra variante.' unless base && base['id']!=row['id'] && base['kind']==row['kind'] && base['variantOf'].nil?
      end
      data
    end
    def validate_v2_fields(row)
      text(row['notes'],500)
      raise ExportError,'Ficha base de variante inválida.' unless row['variantOf'].nil? || (row['variantOf'].is_a?(String) && row['variantOf'].match?(/\A[0-9a-f-]{36}\z/))
      suggested=row['suggested']
      return if suggested.nil?
      # Provenance only (where the prefilled values came from): it never blocks a ficha.
      raise ExportError,'Sugerencias de ficha inválidas.' unless suggested.is_a?(Hash) && suggested.keys.sort==%w[fields presetId source] && SUGGESTION_SOURCES.include?(suggested['source']) &&
        suggested['fields'].is_a?(Array) && suggested['fields'].uniq==suggested['fields'] && suggested['fields'].all? { |key| SUGGESTABLE.include?(key) } && (suggested['presetId'].nil? || text(suggested['presetId'],80)==suggested['presetId'])
    end
    def validate_v3_fields(row)
      list=row['thicknessesMm']
      raise ExportError,"Espesores estándar inválidos (hasta #{MAX_THICKNESSES} medidas positivas, sin repetir)." unless list.is_a?(Array) && list.length<=MAX_THICKNESSES && list.all? { |value| self.class.measure?(value) } && list.uniq.length==list.length
    end
    def validate_v4_fields(row)
      list=row['widthsMm']
      raise ExportError,"Anchos estándar inválidos (hasta #{MAX_THICKNESSES} medidas positivas, sin repetir)." unless list.is_a?(Array) && list.length<=MAX_THICKNESSES && list.all? { |value| self.class.measure?(value) } && list.uniq.length==list.length
      raise ExportError,'Una placa no tiene un único espesor: sus espesores van en la lista.' if row['kind']=='sheet' && !row['thicknessMm'].nil?
      raise ExportError,'El ancho de un canto va en su lista de anchos estándar.' if row['kind']=='edge' && !row['widthMm'].nil?
    end
    # Ficha completa (0.8.16): the data an order needs, computed, never ticked by hand.
    # Placa: SKU, al menos un espesor, largo, ancho y veta definida. Canto: al menos un ancho.
    def self.missing(item)
      return ['tipo'] unless item.is_a?(Hash) && %w[sheet edge].include?(item['kind'])
      measure=->(key) { item[key].is_a?(Numeric) && item[key].finite? && item[key]>0 }
      if item['kind']=='sheet'
        out=[]
        out << 'SKU' if item['sku'].to_s.strip.empty?
        out << 'espesor' if thicknesses_of(item).empty?
        out << 'largo' unless measure.call('lengthMm')
        out << 'ancho' unless measure.call('widthMm')
        out << 'veta' unless [true,false].include?(item['grain'])
        out
      else
        widths_of(item).empty? ? ['ancho'] : []
      end
    end
    def self.complete?(item);missing(item).empty?;end
    # The 0.8.15 reader rejected an «approved» ficha without its old required data. The flag is kept
    # only while it still satisfies that rule, so an older Planos Santo can keep reading the file.
    def self.legacy_approved?(row)
      return false unless row['approved']==true && row['suggested'].nil? && row['kind']!='unknown' && !row['sku'].to_s.strip.empty? && !row['supplier'].to_s.strip.empty? && !row['thicknessMm'].nil?
      return false if row['kind']=='sheet' && (row['widthMm'].nil? || row['lengthMm'].nil? || row['grain'].nil?)
      return false if row['kind']=='edge' && row['widthMm'].nil?
      true
    end
    def new_item(name,kind,observed={})
      observed={'source'=>'manual','record'=>SecureRandom.uuid} if observed.empty?
      raw=JSON.generate(canonical({'name'=>name,'kind'=>kind,'observed'=>observed}))
      {'id'=>SecureRandom.uuid,'name'=>text(name),'kind'=>KINDS.include?(kind) ? kind : 'unknown','sku'=>'','supplier'=>'',
       'thicknessMm'=>nil,'widthMm'=>nil,'lengthMm'=>nil,'grain'=>nil,'compatibleIds'=>[],'price'=>nil,'favorite'=>false,'approved'=>false,
       'updatedAt'=>Time.now.utc.iso8601,'sourceHash'=>Digest::SHA256.hexdigest(raw),'observed'=>observed,'variantOf'=>nil,'notes'=>'','suggested'=>nil,
       'thicknessesMm'=>self.class.default_thicknesses(kind),'widthsMm'=>self.class.default_widths(kind)}
    end
    # Unapproved item whose given values are recorded as suggestions to review. `lists`
    # (OpenCutList «18mm;15mm») join the standard lists of the ficha and count as a
    # suggested thickness or width.
    def suggested_item(name,kind,values,source,observed={},preset_id: nil,lists: {})
      values=values.select { |key,value| SUGGESTABLE.include?(key) && !value.nil? }
      item=new_item(name,kind,observed).merge(values)
      fields=values.keys
      {'thicknessesMm'=>'thicknessMm','widthsMm'=>'widthMm'}.each do |key,field|
        extra=Array(lists[key]).select { |value| self.class.measure?(value) }
        next if extra.empty?
        item[key]=self.class.merged_list(item[key]+extra,nil);fields |= [field]
      end
      item['suggested']={'source'=>source,'fields'=>fields.sort,'presetId'=>preset_id} unless fields.empty?
      self.class.normalize_row(item)
    end
    # MATERIALES-03: same product in another thickness. Copies the commercial
    # data as unapproved suggestions; SKU and price stay empty on purpose.
    # 0.8.20: a sheet variant is a ficha of its own (own SKU) for just that thickness.
    def variant_item(base,thickness,name=nil)
      raise ExportError,'La ficha base ya no existe; volvé a cargar la biblioteca.' unless base.is_a?(Hash)
      raise ExportError,'Solo se crean variantes de espesor de placas o cantos.' unless %w[sheet edge].include?(base['kind'])
      raise ExportError,'Espesor de variante inválido.' unless thickness.is_a?(Numeric) && thickness.finite? && thickness>0 && thickness<=100000
      raise ExportError,'La ficha ya tiene ese espesor.' if base['thicknessMm'].is_a?(Numeric) && (base['thicknessMm']-thickness).abs<0.001
      single=self.class.thicknesses_of(base)
      raise ExportError,'La ficha ya tiene ese espesor como único espesor.' if base['kind']=='sheet' && single.length==1 && (single.first-thickness).abs<0.001
      label=thickness.round(3).to_s.sub(/\.0\z/,'').tr('.',',')
      name=name.to_s.strip.empty? ? "#{base['name'].sub(/\s*\d+(?:[.,]\d+)?\s*mm\z/i,'')} #{label} mm" : name
      values=base.slice('supplier','widthMm','lengthMm','grain').merge(base['kind']=='sheet' ? {'compatibleIds'=>base['compatibleIds']} : {})
      values=values.reject { |_key,value| value.nil? || value==[] || value=='' }
      item=suggested_item(name,base['kind'],values,'variant',{'source'=>'variant','baseId'=>base['id']})
      list=base['kind']=='sheet' ? [] : base['thicknessesMm'].is_a?(Array) ? base['thicknessesMm'] : item['thicknessesMm']
      widths=base['kind']=='edge' ? self.class.widths_of(base) : []
      self.class.normalize_row(item.merge('thicknessMm'=>thickness,'variantOf'=>base['variantOf'] || base['id'],'thicknessesMm'=>list,'widthsMm'=>widths))
    end
    # 0.8.20: one click from the cutlist or the order: the piece's thickness joins the ficha's
    # list (rounded to hundredths, as the order rounds the geometry). Already listed (±0,1 mm): nothing is written.
    def add_thickness(id,thickness)
      raise ExportError,'Espesor inválido.' unless self.class.measure?(thickness)
      value=self.class.clean_measure(thickness.to_f.round(2))
      current=read
      item=current['items'].find { |row| row['id']==id }
      raise ExportError,'La ficha ya no existe; volvé a cargar la biblioteca.' unless item
      raise ExportError,'Solo se agregan espesores a fichas de placa o canto.' unless %w[sheet edge].include?(item['kind'])
      return current if self.class.in_list?(item['thicknessesMm'],value)
      raise ExportError,"La ficha ya tiene #{MAX_THICKNESSES} espesores estándar." if item['thicknessesMm'].length>=MAX_THICKNESSES
      transaction(current['revision']) do |data|
        row=data['items'].find { |candidate| candidate['id']==id }
        row['thicknessesMm']=self.class.merged_list(row['thicknessesMm']+[value],nil)
        row['updatedAt']=Time.now.utc.iso8601
        data
      end
    end
    # F-MAT-A: OpenCutList measures read from the model, as suggestions only.
    # A list of several values or a non-metric unit is ambiguous: never guessed.
    def ocl_measure(value)
      return (value>0 && value<=100000 ? value.to_f.round(3) : nil) if value.is_a?(Numeric) && value.finite?
      return nil unless value.is_a?(String) && !value.include?(';')
      match=value.strip.match(/\A(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\z/i);return nil unless match
      number=match[1].tr(',','.').to_f*{'mm'=>1,'cm'=>10,'m'=>1000}[match[2].downcase]
      number>0 && number<=100000 ? number.round(3) : nil
    end
    # OpenCutList keeps the standard thicknesses of a sheet and the widths of an edge as
    # «18mm;15mm». Every part must be a metric measure, or the whole list is ignored.
    def ocl_list(value)
      return nil unless value.is_a?(String) && value.include?(';')
      values=value.split(';').map(&:strip).reject(&:empty?).map { |part| ocl_measure(part) }
      values.empty? || values.include?(nil) ? nil : values
    end
    def ocl_lists(kind,attrs)
      return {} unless attrs.is_a?(Hash)
      case kind
      when 'sheet' then {'thicknessesMm'=>ocl_list(attrs['std_thicknesses'])}.compact
      when 'edge' then {'widthsMm'=>ocl_list(attrs['std_widths'])}.compact
      else {}
      end
    end
    def ocl_values(kind,attrs)
      return {} unless attrs.is_a?(Hash)
      case kind
      when 'sheet'
        sizes=attrs['std_sizes'].is_a?(String) && !attrs['std_sizes'].include?(';') ? attrs['std_sizes'].split(/\s*x\s*/i) : []
        length,width=sizes.length==2 ? sizes.map { |size| ocl_measure(size) } : [nil,nil]
        {'thicknessMm'=>ocl_measure(attrs['std_thicknesses']),'lengthMm'=>length,'widthMm'=>width,'grain'=>[true,false].include?(attrs['grained']) ? attrs['grained'] : nil}
      when 'edge'
        {'thicknessMm'=>ocl_measure(attrs['thickness']),'widthMm'=>ocl_measure(attrs['std_widths'])}
      else
        {}
      end
    end
    def canonical(value)
      value.is_a?(Hash) ? value.sort.to_h.transform_values { |v| canonical(v) } : value.is_a?(Array) ? value.map { |v| canonical(v) } : value
    end
    def transaction(revision)
      FileUtils.mkdir_p(@directory)
      File.open(File.join(@directory,'catalog.lock'),File::RDWR|File::CREAT,0o600) do |lock|
        raise ExportError,'Otra ventana está guardando la biblioteca.' unless lock.flock(File::LOCK_EX|File::LOCK_NB)
        original,parsed,current=load;raise ExportError,'La biblioteca cambió en otra ventana. Volvé a cargarla.' unless current['revision']==revision
        result=yield(JSON.parse(JSON.generate(current)))
        result['revision']=revision+1
        if result['items'].is_a?(Array)
          result['items']=result['items'].map { |row| row.is_a?(Hash) && row['approved']==true && !self.class.legacy_approved?(row) ? row.merge('approved'=>false) : row }
          # A window of 0.8.16-0.8.19 sends v2/v3 records: upgraded here, never rejected. A single thickness or width always joins its list.
          result['items']=result['items'].map { |row| self.class.upgrade_row(row) }
        end
        validate(result);bytes=JSON.pretty_generate(result)
        raise ExportError,'La biblioteca supera 8 MiB.' if bytes.bytesize>MAX_BYTES
        if original
          pending=migration(parsed)
          # Before the first schema-2 write the old file is kept under an explicit name.
          name=pending ? "catalog-v#{pending['from']}-premigracion-#{revision}-#{SecureRandom.hex(6)}.json" : "catalog-#{revision}-#{SecureRandom.hex(6)}.json"
          write_backup(name,original)
        end
        Tempfile.create(['.catalog-','.json'],@directory) do |file|
          file.binmode;file.write(bytes);file.flush;file.fsync;file.close;File.rename(file.path,@path)
        end
        result
      ensure
        lock.flock(File::LOCK_UN) if lock
      end
    rescue SystemCallError,IOError => error
      raise ExportError,"No se pudo guardar la biblioteca (#{error.class.name.split('::').last}); la versión anterior quedó intacta."
    end
    # Written to a temporary name, verified, then published: a truncated copy
    # never looks like a valid backup.
    def write_backup(name,original)
      backups=File.join(@directory,'backups')
      raise ExportError,'La carpeta de copias de seguridad no puede ser un enlace.' if File.symlink?(backups)
      FileUtils.mkdir_p(backups);temporary=File.join(backups,".#{name}.tmp")
      begin
        File.open(temporary,File::WRONLY|File::CREAT|File::EXCL|File::BINARY,0o600) { |f| f.write(original);f.flush;f.fsync }
        raise ExportError,'No se pudo verificar la copia de seguridad; la biblioteca no se modificó.' unless Digest::SHA256.file(temporary).hexdigest==Digest::SHA256.hexdigest(original)
        File.rename(temporary,File.join(backups,name))
      ensure
        File.unlink(temporary) if File.exist?(temporary)
      end
    end
    def save(items,revision);transaction(revision) { |current| current['items']=items;current };end
    def import(data,revision)
      library=data.is_a?(Hash) && data['schema'].is_a?(Integer) && (1..SCHEMA).cover?(data['schema']) && data['items'].is_a?(Array)
      candidates=if library
        # Exports of either schema go through the same explicit migration.
        migrate(data)['items'].map { |row| row.merge('approved'=>false,'suggested'=>nil) }
      elsif data.is_a?(Hash) && data['items'].is_a?(Array)
        raise ExportError,'Candidatos de importación inválidos.' unless data['items'].all? { |row| row.is_a?(Hash) && row['nombre_en_modelos'].is_a?(String) }
        data['items'].map do |row|
          # No material-name heuristic: candidate types stay unresolved if not a known code.
          kind={'2'=>'sheet','4'=>'edge','1'=>'solid_wood','3'=>'dimensional','6'=>'veneer'}[row['tipo_opencutlist'].to_s] || 'unknown'
          new_item(row.fetch('nombre_en_modelos'),kind,row)
        end
      elsif data.is_a?(Hash) && data['schema']=='planos-santo.material-review.v1'
        raise ExportError,'Materiales del modelo inválidos.' unless data['materials'].is_a?(Array) && data['materials'].all? { |row| row.is_a?(Hash) && row['name'].is_a?(String) && row['category'].is_a?(String) }
        data['materials'].reject { |row| row['category']=='hardware' }.map do |row|
          observed={'name'=>row['name'],'attributes'=>row['attributes_observed'],'kind'=>row['category']}
          suggested_item(row.fetch('name'),row.fetch('category'),ocl_values(row['category'],row['attributes_observed']),'ocl',observed,
            lists:ocl_lists(row['category'],row['attributes_observed']))
        end
      else
        raise ExportError,'Formato de biblioteca/importación no reconocido.'
      end
      raise ExportError,'Demasiados candidatos.' if candidates.length>5000
      transaction(revision) do |current|
        candidates.each do |row|
          matches=current['items'].select { |existing| existing['sourceHash']==row['sourceHash'] }
          next if !matches.empty? && (!library || matches.any? { |existing| self.class.same_import_values?(existing,row) })
          row['id']=SecureRandom.uuid if current['items'].any? { |existing| existing['id']==row['id'] }
          # Imported compatibility and variant IDs reference another library; reconcile explicitly.
          row['compatibleIds']=[];row['variantOf']=nil;row['approved']=false
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
      File.open(target,File::WRONLY|File::CREAT|File::EXCL|File::BINARY,0o600) { |file| file.write(JSON.pretty_generate(read));file.flush;file.fsync }
    rescue Errno::EEXIST
      raise ExportError,'Ese archivo ya existe; no se sobrescribió.'
    end
  end
end
