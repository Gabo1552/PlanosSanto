# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'
require 'fileutils'
require 'tempfile'
require 'time'
require 'date'
require_relative 'catalog_store'

module PlanosSanto
  # Hito 4 · F-OPT-C: how one supplier works, configured once. Pure rules here;
  # persistence in MaderaProfileStore. Nothing applies until a version is approved.
  module MaderaProfile
    CONTENT=%w[name supplier trimMm kerfMm dimensionRule wastePercent cutPrice edgingPrice encoding decimal header notes].freeze
    KEYS=(%w[id version approved approvedAt updatedAt contentHash]+CONTENT).freeze
    RULES=%w[finished deduct_edge].freeze
    PRICE_UNITS={'cutPrice'=>%w[placa pieza metro],'edgingPrice'=>%w[metro]}.freeze
    PRICE_AGE_DAYS=90

    # Suggested starting values, never approved: a person confirms them with the supplier.
    def self.template
      {'id'=>nil,'version'=>0,'approved'=>false,'approvedAt'=>nil,'updatedAt'=>nil,'contentHash'=>nil,'name'=>'','supplier'=>'',
       'trimMm'=>10,'kerfMm'=>3,'dimensionRule'=>'finished','wastePercent'=>15,'cutPrice'=>nil,'edgingPrice'=>nil,
       'encoding'=>'utf8','decimal'=>'.','header'=>false,'notes'=>''}
    end
    def self.text(value,limit);CatalogStore.new(directory:'').text(value,limit);end
    def self.number(value,min,max,label)
      raise ExportError,"#{label} inválido: cargá un número entre #{min} y #{max}." unless value.is_a?(Numeric) && value.finite? && value>=min && value<=max
      value
    end
    def self.validate_price(key,price)
      return if price.nil?
      raise ExportError,'Tarifa incompleta: cargá importe, moneda, unidad, fecha y fuente.' unless price.is_a?(Hash) && price.keys.sort==%w[amount currency date source unit] && price['amount'].is_a?(Numeric) && price['amount'].finite? && price['amount']>0 && price['amount']<=1e9
      %w[currency source].each { |name| raise ExportError,'Falta moneda o fuente de la tarifa.' if text(price[name],80).empty? }
      raise ExportError,"Unidad de tarifa no admitida para #{key=='cutPrice' ? 'corte' : 'canteado'}." unless PRICE_UNITS[key].include?(price['unit'])
      raise ExportError,'Fecha de tarifa inválida.' unless price['date'].is_a?(String) && price['date'].match?(/\A\d{4}-\d{2}-\d{2}\z/) && (Date.strptime(price['date'],'%Y-%m-%d').strftime('%Y-%m-%d')==price['date'] rescue false)
    end
    # Same contract for stored rows and for client input (content keys only).
    def self.validate_content(profile)
      raise ExportError,'Perfil de maderera inválido.' unless profile.is_a?(Hash)
      raise ExportError,'El perfil de maderera tiene campos no permitidos.' unless (profile.keys-KEYS).empty?
      name=text(profile['name'],80);raise ExportError,'Poné un nombre al perfil de maderera.' if name.empty?
      text(profile['supplier'],120);text(profile['notes'],500)
      number(profile['trimMm'],0,50,'Refilado');number(profile['kerfMm'],0,10,'Espesor de corte (kerf)');number(profile['wastePercent'],0,100,'Desperdicio')
      raise ExportError,'Regla de medidas inválida.' unless RULES.include?(profile['dimensionRule'])
      raise ExportError,'Codificación no admitida.' unless %w[utf8 windows1252].include?(profile['encoding'])
      raise ExportError,'Separador decimal no admitido.' unless ['.',','].include?(profile['decimal'])
      raise ExportError,'Encabezado inválido.' unless [true,false].include?(profile['header'])
      PRICE_UNITS.each_key { |key| validate_price(key,profile[key]) }
      profile
    end
    # Texts are normalized before hashing: a stray space is not a new version.
    def self.content(profile)
      CONTENT.to_h { |key| value=profile[key];[key,%w[name supplier notes].include?(key) && value.is_a?(String) ? text(value,key=='notes' ? 500 : 120) : value] }
    end
    def self.content_hash(profile)
      Digest::SHA256.hexdigest(JSON.generate(CatalogStore.new(directory:'').canonical(content(profile))))
    end
    # Compact signed reference for the order manifest.
    def self.reference(profile)
      return nil unless profile
      profile.slice('id','name','supplier','version','approved','contentHash','trimMm','kerfMm','dimensionRule','wastePercent')
    end
    # What a draft order was reviewed with; export refuses a different one.
    def self.binding(profile);profile && profile.slice('id','version','contentHash');end
    def self.applies?(profile);profile.is_a?(Hash) && profile['approved']==true;end

    # OPT-02: warns (never blocks) when a piece fits the raw board but not its
    # usable area after trimming every side.
    def self.usable_warning(profile,board,base,height,rotate)
      return nil unless applies?(profile) && board['lengthMm'].is_a?(Numeric) && board['widthMm'].is_a?(Numeric)
      trim=profile['trimMm'];length=board['lengthMm']-2*trim;width=board['widthMm']-2*trim
      return "El refilado de #{format_mm(trim)} mm por lado no deja medida útil en esta placa; revisá el perfil de maderera." unless length>0 && width>0
      fits=(base<=length+0.1 && height<=width+0.1) || (rotate && height<=length+0.1 && base<=width+0.1)
      return nil if fits
      "Puede no entrar en la medida útil: la pieza mide #{format_mm(base)} × #{format_mm(height)} mm y la placa, con #{format_mm(trim)} mm de refilado por lado, deja #{format_mm(length)} × #{format_mm(width)} mm. Confirmalo con la maderera."
    end
    def self.format_mm(number)
      text=format('%.2f',number).sub(/0+\z/,'').sub(/\.\z/,'');text.tr('.',',')
    end
    # MATERIALES-04 / CANTOS-03 / OPT-06: off by default. Edges on the left and
    # right shorten the base; top and bottom shorten the height. [arr,aba,izq,der].
    def self.cut_size(profile,base,height,edge_thicknesses)
      return [base,height] unless applies?(profile) && profile['dimensionRule']=='deduct_edge'
      top,bottom,left,right=4.times.map { |i| value=Array(edge_thicknesses)[i];value.is_a?(Numeric) ? value : 0 }
      [(base-left-right).round(3),(height-top-bottom).round(3)]
    end

    def self.price_status(price,unit,today)
      return 'price_pending' unless price && price['unit']==unit
      age=(today-Date.iso8601(price['date'])).to_i
      age<0 ? 'future_price' : age>PRICE_AGE_DAYS ? 'stale_price' : 'current_price'
    end
    # OPT-05: three columns (net, with waste, whole units to buy) plus services
    # on their own lines. An estimate, never an optimization.
    # pieces: [{'materialId','base','height','edges'=>{edgeId=>metres}}]
    def self.budget(profile,pieces,items,today: Time.now.utc.to_date)
      waste=1+profile['wastePercent']/100.0;kerf=profile['kerfMm'];trim=profile['trimMm']
      rows=[];sheets_total=0;sheets_known=true
      pieces.group_by { |piece| piece['materialId'] }.each do |id,group|
        board=items.fetch(id)
        net=group.sum { |p| p['base']*p['height'] }/1_000_000.0
        gross=group.sum { |p| (p['base']+kerf)*(p['height']+kerf) }/1_000_000.0*waste
        full=board['lengthMm'].is_a?(Numeric) && board['widthMm'].is_a?(Numeric) ? board['lengthMm']*board['widthMm']/1_000_000.0 : nil
        long=full && board['lengthMm']-2*trim;short=full && board['widthMm']-2*trim
        sheets=full && long>0 && short>0 ? (gross/(long*short/1_000_000.0)-1e-9).ceil : nil
        sheets ? sheets_total+=sheets : sheets_known=false
        price=board['price'];unit=price && price['unit']=='placa' && full ? 'placa' : 'm2'
        status=price_status(price,unit,today)
        per_m2=status=='price_pending' ? nil : unit=='placa' ? price['amount']/full : price['amount']
        rows << {'materialId'=>id,'name'=>board['name'],'sku'=>board['sku'],'role'=>'board','unit'=>'m2','netQuantity'=>net,'wasteQuantity'=>gross,
                 'purchaseQuantity'=>sheets,'purchaseUnit'=>'placa','netAmount'=>per_m2 && net*per_m2,'wasteAmount'=>per_m2 && gross*per_m2,
                 'purchaseAmount'=>per_m2 && sheets && full ? sheets*full*per_m2 : nil,'currency'=>price && price['currency'],'status'=>sheets ? status : 'size_pending'}
      end
      edge_metres=Hash.new(0.0);pieces.each { |p| p['edges'].each { |id,metres| edge_metres[id]+=metres } }
      edge_metres.each do |id,net|
        edge=items.fetch(id);price=edge['price'];status=price_status(price,'metro',today);amount=status=='price_pending' ? nil : price['amount']
        bought=(net*waste-1e-9).ceil
        rows << {'materialId'=>id,'name'=>edge['name'],'sku'=>edge['sku'],'role'=>'edge','unit'=>'metro','netQuantity'=>net,'wasteQuantity'=>net*waste,
                 'purchaseQuantity'=>bought,'purchaseUnit'=>'metro','netAmount'=>amount && net*amount,'wasteAmount'=>amount && net*waste*amount,
                 'purchaseAmount'=>amount && bought*amount,'currency'=>price && price['currency'],'status'=>status}
      end
      services=[]
      if (price=profile['cutPrice'])
        quantity={'placa'=>sheets_known ? sheets_total : nil,'pieza'=>pieces.length,'metro'=>pieces.sum { |p| 2*(p['base']+p['height']) }/1000.0}[price['unit']]
        status=quantity.nil? ? 'size_pending' : price_status(price,price['unit'],today)
        services << {'kind'=>'cut','quantity'=>quantity,'unit'=>price['unit'],'amount'=>quantity && price['amount']*quantity,'currency'=>price['currency'],'status'=>status,'approximate'=>price['unit']=='metro'}
      end
      if (price=profile['edgingPrice'])
        quantity=edge_metres.values.sum
        services << {'kind'=>'edging','quantity'=>quantity,'unit'=>'metro','amount'=>price['amount']*quantity,'currency'=>price['currency'],'status'=>price_status(price,'metro',today),'approximate'=>false}
      end
      sum=lambda do |list,key|
        list.select { |row| row['status']=='current_price' && row[key] }.group_by { |row| row['currency'] }.transform_values { |group| group.sum { |row| row[key] }.round(2) }
      end
      {'profile'=>reference(profile),'wastePercent'=>profile['wastePercent'],'kerfMm'=>kerf,'trimMm'=>trim,'priceAgeDays'=>PRICE_AGE_DAYS,
       'materials'=>rows,'totals'=>{'net'=>sum.call(rows,'netAmount'),'waste'=>sum.call(rows,'wasteAmount'),'purchase'=>sum.call(rows,'purchaseAmount')},
       'services'=>services,'servicesTotals'=>sum.call(services,'amount'),'estimated'=>true,'optimized'=>false}
    end
  end

  # Versioned, revisioned store next to the catalog: lock, backup, atomic write.
  class MaderaProfileStore
    MAX_BYTES=1024*1024
    MAX_PROFILES=50
    def initialize(directory: CatalogStore.default_directory)
      @directory=directory;@path=File.join(directory,'maderera-profiles.json')
    end
    def empty;{'schema'=>1,'revision'=>0,'activeId'=>nil,'profiles'=>[]};end
    DAMAGED='El archivo de perfiles de maderera está dañado; no se sobrescribió. Restaurá una copia de seguridad.'
    def read
      return empty unless File.exist?(@path)
      raise ExportError,'El archivo de perfiles de maderera es un enlace o no es un archivo; no se modificó.' if File.symlink?(@path) || !File.file?(@path)
      bytes=File.open(@path,'rb') { |file| file.read(MAX_BYTES+1) } || ''.b
      raise ExportError,'El archivo de perfiles de maderera supera 1 MiB; no se modificó.' if bytes.bytesize>MAX_BYTES
      validate(JSON.parse(bytes.force_encoding(Encoding::UTF_8)))
    rescue JSON::ParserError,EncodingError,ArgumentError
      raise ExportError,DAMAGED
    rescue SystemCallError => error
      raise ExportError,"No se pudieron leer los perfiles de maderera (#{error.class.name.split('::').last})."
    end
    def validate(data)
      raise ExportError,'Versión de perfiles de maderera desconocida; no se modificó.' unless data.is_a?(Hash) && data.keys.sort==%w[activeId profiles revision schema] && data['schema']==1 &&
        data['revision'].is_a?(Integer) && data['revision']>=0 && data['profiles'].is_a?(Array) && data['profiles'].length<=MAX_PROFILES
      ids=[]
      data['profiles'].each do |profile|
        raise ExportError,'Perfil de maderera dañado.' unless profile.is_a?(Hash) && profile.keys.sort==MaderaProfile::KEYS.sort
        MaderaProfile.validate_content(profile)
        raise ExportError,'Identificador de perfil inválido.' unless profile['id'].is_a?(String) && profile['id'].match?(/\A[0-9a-f-]{36}\z/) && !ids.include?(profile['id'])
        ids << profile['id']
        raise ExportError,'Versión de perfil inválida.' unless profile['version'].is_a?(Integer) && profile['version']>=1 && [true,false].include?(profile['approved'])
        raise ExportError,'La huella del perfil no coincide con su contenido.' unless profile['contentHash']==MaderaProfile.content_hash(profile)
        raise ExportError,'Fecha de aprobación del perfil inválida.' unless profile['approved'] ? profile['approvedAt'].is_a?(String) : profile['approvedAt'].nil?
        raise ExportError,'Fecha del perfil inválida.' unless profile['updatedAt'].is_a?(String)
        raise ExportError,'Perfil aprobado que descuenta canto sin confirmación anotada.' if profile['approved'] && profile['dimensionRule']=='deduct_edge' && profile['notes'].strip.length<8
      end
      raise ExportError,'El perfil activo no existe.' unless data['activeId'].nil? || ids.include?(data['activeId'])
      data
    end
    def active(approved_only: true)
      data=read;profile=data['profiles'].find { |row| row['id']==data['activeId'] }
      approved_only && !MaderaProfile.applies?(profile) ? nil : profile
    end
    # Client input carries content only: version, approval and hash are server side.
    def save(input,revision)
      raise ExportError,'Perfil de maderera inválido.' unless input.is_a?(Hash)
      raise ExportError,'El perfil de maderera tiene campos no permitidos.' unless (input.keys-MaderaProfile::KEYS).empty?
      transaction(revision) do |data|
        current=input['id'].to_s.empty? ? nil : data['profiles'].find { |row| row['id']==input['id'] }
        raise ExportError,'El perfil de maderera ya no existe; volvé a cargarlos.' if !input['id'].to_s.empty? && !current
        raise ExportError,'Se alcanzó el máximo de perfiles de maderera.' if !current && data['profiles'].length>=MAX_PROFILES
        # Absent keys keep the current (or template) value; explicit nil prices clear them.
        base=current || MaderaProfile.template.merge('id'=>SecureRandom.uuid,'version'=>0)
        MaderaProfile.validate_content(base.merge(input.slice(*MaderaProfile::CONTENT)))
        profile=base.merge(MaderaProfile.content(base.merge(input.slice(*MaderaProfile::CONTENT))))
        next nil if current && MaderaProfile.content_hash(current)==MaderaProfile.content_hash(profile)
        profile.merge!('version'=>profile['version']+1,'approved'=>false,'approvedAt'=>nil,'updatedAt'=>Time.now.utc.iso8601)
        profile['contentHash']=MaderaProfile.content_hash(profile)
        data['profiles']=current ? data['profiles'].map { |row| row['id']==profile['id'] ? profile : row } : data['profiles']+[profile]
        data
      end
    end
    def approve(id,version,revision)
      transaction(revision) do |data|
        profile=data['profiles'].find { |row| row['id']==id }
        raise ExportError,'El perfil de maderera ya no existe; volvé a cargarlos.' unless profile
        raise ExportError,'El perfil cambió desde que lo revisaste; volvé a revisarlo antes de aprobar.' unless profile['version']==version
        raise ExportError,'Completá nombre y proveedor antes de aprobar el perfil.' if profile['name'].strip.empty? || profile['supplier'].strip.empty?
        if profile['dimensionRule']=='deduct_edge' && profile['notes'].strip.length<8
          raise ExportError,'Para descontar el canto, anotá en notas cómo lo confirmó el proveedor (evita descontarlo dos veces).'
        end
        profile.merge!('approved'=>true,'approvedAt'=>Time.now.utc.iso8601)
        data
      end
    end
    def activate(id,revision)
      transaction(revision) do |data|
        unless id.nil?
          profile=data['profiles'].find { |row| row['id']==id }
          raise ExportError,'Solo se puede usar en los pedidos un perfil de maderera aprobado.' unless MaderaProfile.applies?(profile)
        end
        data['activeId']=id;data
      end
    end
    def transaction(revision)
      raise ExportError,'Revisión de perfiles inválida.' unless revision.is_a?(Integer)
      FileUtils.mkdir_p(@directory)
      File.open(File.join(@directory,'maderera-profiles.lock'),File::RDWR|File::CREAT,0o600) do |lock|
        raise ExportError,'Otra ventana está guardando los perfiles de maderera.' unless lock.flock(File::LOCK_EX|File::LOCK_NB)
        current=read;raise ExportError,'Los perfiles de maderera cambiaron en otra ventana. Volvé a cargarlos.' unless current['revision']==revision
        result=yield(JSON.parse(JSON.generate(current)))
        return current if result.nil?
        result['revision']=revision+1;validate(result);bytes=JSON.pretty_generate(result)
        raise ExportError,'Los perfiles de maderera superan 1 MiB.' if bytes.bytesize>MAX_BYTES
        # Same verified temporary-then-rename backup as the catalog.
        CatalogStore.new(directory:@directory).write_backup("maderera-profiles-#{revision}-#{SecureRandom.hex(6)}.json",File.binread(@path)) if File.file?(@path)
        Tempfile.create(['.maderera-profiles-','.json'],@directory) do |file|
          file.binmode;file.write(bytes);file.flush;file.fsync;file.close;File.rename(file.path,@path)
        end
        result
      ensure
        lock.flock(File::LOCK_UN) if lock
      end
    rescue SystemCallError,IOError => error
      raise ExportError,"No se pudieron guardar los perfiles de maderera (#{error.class.name.split('::').last}); la versión anterior quedó intacta."
    end
  end
end
