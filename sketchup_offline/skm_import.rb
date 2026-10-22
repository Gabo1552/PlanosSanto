# frozen_string_literal: true
require 'base64'
require_relative 'catalog_store'
require_relative 'bounded_zip'
require_relative 'material_policy'

module PlanosSanto
  # Private, permanent candidate library; intentionally never receives a model.
  # Actual Materials#load remains an explicit MaterialLibrary operation.
  class SkmImport
    MAX_INPUT=128*1024*1024
    MAX_FILES=256
    MAX_SKM=16*1024*1024
    # Largest embedded/photo preview accepted, in bytes: a 512×512 RGBA PNG that
    # does not compress (512*512*4 + 512 filter bytes) + 64 KiB of headers =
    # 1_114_624 (0.8.18; it was 512 KiB and dropped the 512 px photo thumbnails).
    MAX_PREVIEW=512*512*4+512+64*1024
    THUMBNAIL_BUDGET=8*1024*1024
    def initialize(catalog:,directory:CatalogStore.default_directory)
      @catalog=catalog;@directory=directory;@pending=nil
    end
    def safe_name(value,fallback)
      name=value.to_s.encode('UTF-8',invalid: :replace,undef: :replace,replace:'').unicode_normalize(:nfc).strip
      name=fallback if name.empty? || name.match?(/[\x00-\x1f\x7f\\\/]/) || name.match?(/\A[A-Za-z]:/)
      name[0,160]
    end
    def file_bytes(path,limit=MAX_INPUT)
      raise ExportError,'Elegí archivos locales existentes; no enlaces simbólicos.' unless path.is_a?(String) && File.file?(path) && !File.symlink?(path)
      size=File.size(path);raise ExportError,'El archivo supera el límite de importación.' if size>limit
      bytes=File.binread(path,limit+1);raise ExportError,'El archivo cambió o supera el límite.' if bytes.bytesize!=size || bytes.bytesize>limit
      bytes
    end
    def source_files(path,source)
      case source
      when 'zip'
        archive=BoundedZip.new(file_bytes(path))
        archive.entries.filter_map do |entry|
          bytes=archive.read(entry)
          next if entry.name.end_with?('/') || File.extname(entry.name).downcase!='.skm'
          [File.basename(entry.name),bytes]
        end
      when 'folder'
        raise ExportError,'Elegí una carpeta local, no un enlace.' unless path.is_a?(String) && File.directory?(path) && !File.symlink?(path)
        names=Dir.children(path).select { |name| File.extname(name).downcase=='.skm' }.sort
        raise ExportError,'Demasiados archivos SKM; seleccioná hasta256 por lote.' if names.length>MAX_FILES
        names.map { |name| [name,file_bytes(File.join(path,name),MAX_SKM)] }
      when 'files'
        paths=path.is_a?(Array) ? path : [path]
        raise ExportError,'Elegí hasta256 archivos .skm.' unless paths.length.between?(1,MAX_FILES) && paths.all? { |value| value.is_a?(String) && File.extname(value).downcase=='.skm' }
        paths.map { |value| [File.basename(value),file_bytes(value,MAX_SKM)] }
      else
        raise ExportError,'Origen de biblioteca inválido.'
      end
    end
    def thumbnail(bytes)
      return nil unless bytes && bytes.bytesize<=MAX_PREVIEW
      if bytes.start_with?("\x89PNG\r\n\x1a\n".b) && bytes.bytesize>=33 && bytes.byteslice(12,4)=='IHDR'
        width,height=bytes.byteslice(16,8).unpack('NN')
        return nil unless width.between?(1,2048) && height.between?(1,2048) && width*height<=4_194_304
        'data:image/png;base64,'+Base64.strict_encode64(bytes)
      elsif bytes.start_with?("\xff\xd8".b)
        position=2
        while position+4<=bytes.bytesize
          return nil unless bytes.getbyte(position)==255
          marker=bytes.getbyte(position+1);position+=2
          next if marker==255 || marker==216
          break if marker==217 || marker==218
          length=bytes.byteslice(position,2).unpack1('n');return nil if length<2 || position+length>bytes.bytesize
          if [192,193,194,195,197,198,199,201,202,203,205,206,207].include?(marker)
            return nil if length<8
            height,width=bytes.byteslice(position+3,4).unpack('nn')
            return nil unless width.between?(1,2048) && height.between?(1,2048) && width*height<=4_194_304
            return 'data:image/jpeg;base64,'+Base64.strict_encode64(bytes)
          end
          position+=length
        end
        nil
      end
    end
    def parse_document(xml)
      begin
        require 'rexml/document'
        require 'rexml/parsers/pullparser'
      rescue LoadError
        raise ExportError,'Esta instalación de Ruby no incluye REXML. La importación SKM requiere revisión en SketchUp; las demás funciones siguen disponibles.'
      end
      begin
      depth=0;nodes=0;parser=REXML::Parsers::PullParser.new(xml)
      while parser.has_next?
        event=parser.pull
        if event.start_element?
          depth+=1;nodes+=1
          raise ExportError,'Metadatos XML demasiado complejos.' if depth>64 || nodes>20_000
        elsif event.end_element?
          depth-=1
        end
      end
      REXML::Document.new(xml)

      rescue REXML::ParseException
        raise ExportError,'Metadatos SKM inválidos; no se modificó la biblioteca.'
      end
    end
    def parse_skm(bytes,filename)
      raise ExportError,'Un SKM supera16MiB.' if bytes.bytesize>MAX_SKM
      archive=BoundedZip.new(bytes,max_bytes:MAX_SKM,max_entries:128,max_total:64*1024*1024,max_entry:32*1024*1024)
      document=archive.entries.find { |entry| entry.name=='document.xml' }
      raise ExportError,'El SKM no contiene document.xml.' unless document && document.size<=2*1024*1024
      xml=archive.read(document).force_encoding(Encoding::UTF_8)
      raise ExportError,'Metadatos XML no permitidos.' unless xml.valid_encoding? && !xml.match?(/<!\s*(DOCTYPE|ENTITY)/i) && !xml.match?(/<\?xml[^>]+encoding\s*=\s*['"](?!utf-8['"])[^'"]+/i)
      archive.entries.each { |entry| archive.read(entry) }
      doc=parse_document(xml)
      raise ExportError,'Documento SKM no reconocido.' unless doc.root && doc.root.name=='materialDocument'
      material=doc.root.elements.find { |element| element.name=='material' }
      raise ExportError,'Falta la definición de material SKM.' unless material
      name=safe_name(material.attributes['name'],File.basename(filename,'.skm'))
      image=archive.entries.find { |entry| %w[doc_thumbnail.png thumbnail.png doc_thumbnail.jpg thumbnail.jpg].include?(entry.name.downcase) }
      thumb=image && image.size<=MAX_PREVIEW ? thumbnail(archive.read(image)) : nil
      suggested_kind=filename.match?(/\b(?:canto|catno)\b/i) ? 'edge' : filename.match?(/\b(?:\d+[,.]?\d*)\s*mm\b/i) ? 'sheet' : 'unknown'
      thickness=filename[/\b(\d+(?:[,.]\d+)?)\s*mm\b/i,1]
      {'name'=>name,'thumbnail'=>thumb,'suggestions'=>{'kind'=>suggested_kind,'thicknessMm'=>thickness && thickness.tr(',','.').to_f,'verified'=>false},'warnings'=>['Tipo, medidas, veta, SKU y proveedor pendientes de revisión.']+(thumb ? [] : ['Sin miniatura embebida utilizable; se conserva el SKM original.'])}
    end
    def normalized(value);value.to_s.unicode_normalize(:nfc).downcase.strip;end
    def metadata(item)
      observed=item['observed'];skm=observed.is_a?(Hash) && observed['skm']
      return nil unless skm.is_a?(Hash) && skm['sha256'].is_a?(String) && skm['sha256'].match?(/\A[0-9a-f]{64}\z/) && skm['sourceName'].is_a?(String) && File.basename(skm['sourceName'])==skm['sourceName']
      skm
    end
    def preview(path,source:'zip')
      @pending=nil
      files=source_files(path,source)
      raise ExportError,'El lote no contiene archivos SKM o supera256 materiales.' unless files.length.between?(1,MAX_FILES)
      raise ExportError,'El lote supera128MiB.' if files.sum { |_name,bytes| bytes.bytesize }>MAX_INPUT
      current=@catalog.read
      seen={};thumbnail_budget=THUMBNAIL_BUDGET
      rows=files.map do |filename,bytes|
        source_name=safe_name(filename,'material.skm');hash=Digest::SHA256.hexdigest(bytes)
        parsed=parse_skm(bytes,source_name)
        thumbnail_budget=limit_thumbnail(parsed,thumbnail_budget)
        exact=current['items'].any? { |item| metadata(item)&.dig('sha256')==hash }
        collision=current['items'].any? { |item| normalized(item['name'])==normalized(parsed['name']) || (metadata(item) && normalized(metadata(item)['sourceName'])==normalized(source_name)) }
        duplicate=exact || seen.key?(hash);seen[hash]=true
        parsed.merge('id'=>SecureRandom.hex(16),'hash'=>hash,'sha256'=>hash,'sourceName'=>source_name,'bytes'=>bytes.bytesize,'status'=>duplicate ? 'duplicate' : collision ? 'conflict' : 'new','_bytes'=>bytes)
      end
      rows.each do |row|
        next unless row['status']=='new'
        same=rows.count { |other| other['sha256']!=row['sha256'] && (normalized(other['name'])==normalized(row['name']) || normalized(other['sourceName'])==normalized(row['sourceName'])) }
        row['status']='conflict' if same>0
      end
      @pending={'token'=>SecureRandom.hex(24),'revision'=>current['revision'],'rows'=>rows}
      public_preview
    end
    def cancel
      @pending=nil
      {'cancelled'=>true}
    end
    def limit_thumbnail(row,budget)
      size=row['thumbnail'] ? row['thumbnail'].bytesize : 0
      if size>budget
        row['thumbnail']=nil
        row['warnings']=(row['warnings'] || [])+['Miniatura omitida por límite de vista previa; el SKM original se conserva.']
        budget
      else
        budget-size
      end
    end
    def public_preview
      {'token'=>@pending['token'],'revision'=>@pending['revision'],'rows'=>@pending['rows'].map { |row| row.reject { |key,_| key.start_with?('_') } }}
    end
    def archive_path(hash)
      raise ExportError,'Identificador de activo inválido.' unless hash.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(hash)
      File.join(@directory,'skm-import-assets',hash+'.skm')
    end
    def archive_bytes(hash,bytes)
      folder=File.join(@directory,'skm-import-assets')
      raise ExportError,'La carpeta de activos no puede ser un enlace.' if File.symlink?(@directory) || File.symlink?(folder)
      FileUtils.mkdir_p(folder)
      target=archive_path(hash)
      if File.exist?(target) || File.symlink?(target)
        raise ExportError,'El activo previo está dañado; no se sobrescribió.' unless File.file?(target) && !File.symlink?(target) && Digest::SHA256.file(target).hexdigest==hash
      else
        Tempfile.create(['.skm-','.pending'],folder) do |file|
          file.binmode;file.write(bytes);file.flush;file.fsync;file.close
          File.rename(file.path,target)
        end
      end
    end
    # MATERIALES-06: kinds is the batch type chosen in the preview ({rowId=>kind}).
    # applySuggestions copies the file-name thickness as an unapproved suggestion.
    def commit(token,selected_ids,revision,confirmed:false,renames:{},kinds:{},apply_suggestions:false)
      raise ExportError,'Confirmá la importación después de revisar el lote.' unless confirmed==true
      raise ExportError,'Vista previa vencida; volvé a analizar.' unless @pending && token==@pending['token'] && revision==@pending['revision']
      raise ExportError,'Selección de materiales inválida.' unless selected_ids.is_a?(Array) && selected_ids.uniq==selected_ids && selected_ids.all? { |id| id.is_a?(String) && @pending['rows'].any? { |row| row['id']==id } } && renames.is_a?(Hash)
      raise ExportError,'Tipo de material inválido en el lote.' unless kinds.is_a?(Hash) && kinds.all? { |id,kind| selected_ids.include?(id) && CatalogStore::KINDS.include?(kind) } && [true,false].include?(apply_suggestions)
      current=@catalog.read;raise ExportError,'La biblioteca cambió; volvé a analizar el lote.' unless current['revision']==revision
      selected=@pending['rows'].select { |row| selected_ids.include?(row['id']) && row['status']!='duplicate' }.uniq { |row| row['sha256'] }
      used=current['items'].map { |item| normalized(item['name']) }
      candidates=selected.map do |row|
        name=renames.key?(row['id']) ? @catalog.text(renames[row['id']]) : row['name']
        raise ExportError,'Resolvé el nombre de cada material en conflicto; no se sobrescribió ninguno.' if name.empty? || (row['status']=='conflict' && (!renames.key?(row['id']) || normalized(name)==normalized(row['name']))) || used.include?(normalized(name))
        used << normalized(name)
        skm={'sha256'=>row['sha256'],'sourceName'=>row['sourceName'],'originalName'=>row['name'],'suggestions'=>row['suggestions']}
        kind=kinds.fetch(row['id'],'unknown')
        thickness=row.dig('suggestions','thicknessMm')
        values=apply_suggestions && thickness.is_a?(Numeric) && thickness>0 && thickness<=100000 && %w[sheet edge].include?(kind) ? {'thicknessMm'=>thickness} : {}
        item=@catalog.suggested_item(name,kind,values,'skm',{'source'=>'skm-import','skm'=>skm})
        [item,row]
      end
      if candidates.empty?
        @pending=nil
        return {'catalog'=>current,'imported'=>0,'skipped'=>selected_ids.length,'rows'=>status['rows']}
      end
      published=@catalog.transaction(revision) do |catalog|
        # Validate all candidates before archiving/publication; existing catalog is
        # the only index. Unpublished content-addressed blobs are inert on errors.
        catalog['items']+=candidates.map(&:first);@catalog.validate(catalog)
        candidates.each { |_item,row| archive_bytes(row['sha256'],row['_bytes']) }
        catalog
      end
      @pending=nil
      {'catalog'=>published,'imported'=>candidates.length,'skipped'=>selected_ids.length-candidates.length,'rows'=>status['rows']}
    end
    def status
      catalog=@catalog.read
      thumbnail_budget=THUMBNAIL_BUDGET
      rows=catalog['items'].filter_map do |item|
        skm=metadata(item);next unless skm
        path=archive_path(skm['sha256']);valid=File.file?(path) && !File.symlink?(path) && !File.symlink?(File.dirname(path)) && Digest::SHA256.file(path).hexdigest==skm['sha256']
        begin
          parsed=valid ? parse_skm(file_bytes(path,MAX_SKM),skm['sourceName']) : {'thumbnail'=>nil,'warnings'=>['Activo SKM ausente o modificado; restaurá su copia de seguridad y revisá la ficha.']}
        rescue ExportError => error
          valid=false
          parsed={'thumbnail'=>nil,'warnings'=>[error.message]}
        end
        thumbnail_budget=limit_thumbnail(parsed,thumbnail_budget)
        {'catalogId'=>item['id'],'sha256'=>skm['sha256'],'hash'=>skm['sha256'],'name'=>item['name'],'sourceName'=>skm['sourceName'],'thumbnail'=>parsed['thumbnail'],'suggestions'=>skm['suggestions'],'warnings'=>parsed['warnings'],'available'=>valid}
      end
      {'catalog'=>catalog,'rows'=>rows}
    end
    def asset_path(catalog_id)
      item=@catalog.read['items'].find { |row| row['id']==catalog_id }
      raise ExportError,'Indicá si el material es placa o canto antes de cargarlo para diseño.' unless item && %w[sheet edge].include?(item['kind'])
      skm=metadata(item);raise ExportError,'No hay un SKM asociado a esta ficha.' unless skm
      path=archive_path(skm['sha256'])
      raise ExportError,'Activo SKM ausente o modificado.' unless File.file?(path) && !File.symlink?(path) && !File.symlink?(File.dirname(path)) && Digest::SHA256.file(path).hexdigest==skm['sha256']
      raise ExportError,'El SKM no está listo para diseño; revisá el archivo guardado.' unless MaterialPolicy.skm_source_ready?(item,directory:@directory)
      path
    end
  end
end
