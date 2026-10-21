# frozen_string_literal: true
require 'base64'
require 'tempfile'
require_relative 'material_library'

module PlanosSanto
  # Creates a real native textured material from a Ruby-picked local image.
  # Paths and bytes never arrive from JS: the browser gets an expiring token.
  class PhotoMaterial
    MAX_BYTES=12*1024*1024
    MAX_PIXELS=16_000_000
    MAX_DIMENSION=16_384
    MAX_THUMBNAIL=512*1024
    THUMBNAIL_BUDGET=8*1024*1024
    PHOTO_KEY='photo_v1'
    def initialize(model,catalog:,directory:CatalogStore.default_directory,guard:nil)
      @model=model;@catalog=catalog;@directory=directory;@guard=guard;@pending=nil
      @library=MaterialLibrary.new(model,catalog:catalog,directory:directory)
    end
    def verify_guard!
      raise ExportError,'Cambió el modelo o hay cambios pendientes. Volvé a elegir la foto.' if @guard && @guard.call==false
    end
    def reject_image!;raise ExportError,'Elegí una imagen JPG o PNG válida de hasta12MiB,16megapíxeles y16.384píxeles por lado.';end
    def image_info(bytes)
      if bytes.start_with?("\x89PNG\r\n\x1a\n".b) && bytes.bytesize>=33 && bytes.byteslice(8,4).unpack1('N')==13 && bytes.byteslice(12,4)=='IHDR'
        width,height=bytes.byteslice(16,8).unpack('NN');format='png'
      elsif bytes.start_with?("\xff\xd8".b)
        position=2;format='jpg';width=height=nil
        while position+4<=bytes.bytesize
          reject_image! unless bytes.getbyte(position)==255
          marker=bytes.getbyte(position+1);position+=2
          next if marker==255 || marker==216
          break if [217,218].include?(marker)
          length=bytes.byteslice(position,2).unpack1('n')
          reject_image! if length<2 || position+length>bytes.bytesize
          if [192,193,194,195,197,198,199,201,202,203,205,206,207].include?(marker)
            reject_image! if length<8
            height,width=bytes.byteslice(position+3,4).unpack('nn');break
          end
          position+=length
        end
      else
        reject_image!
      end
      reject_image! unless width.is_a?(Integer) && height.is_a?(Integer) && width>0 && height>0 && width<=MAX_DIMENSION && height<=MAX_DIMENSION && width*height<=MAX_PIXELS
      {'widthPx'=>width,'heightPx'=>height,'format'=>format}
    end
    def load_image(path,expected:nil)
      raise ExportError,'Esta instalación no permite decodificar imágenes con ImageRep. Revisá SketchUp2026.' unless defined?(Sketchup::ImageRep)
      rep=Sketchup::ImageRep.new
      reject_image! unless rep.load_file(path)==true
      width=rep.width;height=rep.height
      reject_image! unless width.is_a?(Integer) && height.is_a?(Integer) && width>0 && height>0 && width<=MAX_DIMENSION && height<=MAX_DIMENSION && width*height<=MAX_PIXELS
      reject_image! if expected && [width,height]!=[expected['widthPx'],expected['heightPx']]
      rep
    rescue ExportError
      raise
    rescue StandardError
      reject_image!
    end
    def temporary(bytes,extension)
      Tempfile.create(['.planos-photo-',extension]) do |file|
        file.binmode;file.write(bytes);file.flush
        yield file.path
      end
    end
    def image_preview(rep)
      ratio=[256.0/rep.width,256.0/rep.height,1.0].min
      width=[(rep.width*ratio).round,1].max;height=[(rep.height*ratio).round,1].max
      if [width,height]!=[rep.width,rep.height]
        raise ExportError,'No se pudo generar la vista previa de la imagen.' if rep.resize(width,height)==false
      end
      Tempfile.create(['.planos-preview-','.png']) do |file|
        path=file.path;file.close
        raise ExportError,'No se pudo generar la vista previa de la imagen.' if rep.save_file(path)==false || !File.file?(path)
        bytes=File.binread(path,MAX_THUMBNAIL+1)
        raise ExportError,'La vista previa supera el tamaño permitido.' if bytes.bytesize>MAX_THUMBNAIL
        info=image_info(bytes);reject_image! unless info['format']=='png' && info['widthPx']<=256 && info['heightPx']<=256
        'data:image/png;base64,'+Base64.strict_encode64(bytes)
      end
    end
    def normalized(name);name.to_s.unicode_normalize(:nfc).downcase.strip;end
    def photo(item)
      value=item.is_a?(Hash) && item.dig('observed','photo')
      value.is_a?(Hash) && value['schema']==1 ? value : nil
    end
    def pick(path)
      @pending=nil;verify_guard!
      reject_image! unless path.is_a?(String) && %w[.jpg .jpeg .png].include?(File.extname(path).downcase) && File.file?(path) && !File.symlink?(path)
      size=File.size(path);reject_image! if size>MAX_BYTES || size.zero?
      bytes=File.binread(path,MAX_BYTES+1);reject_image! if bytes.bytesize!=size || bytes.bytesize>MAX_BYTES
      info=image_info(bytes)
      preview=temporary(bytes,'.'+info['format']) { |copy| image_preview(load_image(copy,expected:info)) }
      verify_guard!
      hash=Digest::SHA256.hexdigest(bytes)
      name=File.basename(path,File.extname(path)).encode('UTF-8',invalid: :replace,undef: :replace,replace:'').gsub(/[\x00-\x1f\x7f]/,'').strip[0,160]
      name='Material de foto' if name.empty?
      catalog=@catalog.read
      duplicates=catalog['items'].filter_map do |item|
        same_hash=photo(item)&.fetch('sourceHash',nil)==hash
        same_name=normalized(item['name'])==normalized(name)
        next unless same_hash || same_name
        {'catalogId'=>item['id'],'name'=>item['name'],'reason'=>same_hash ? 'hash' : 'name'}
      end
      @pending=info.merge('token'=>SecureRandom.hex(24),'revision'=>catalog['revision'],'sourceHash'=>hash,'name'=>name,'bytes'=>bytes,'duplicates'=>duplicates)
      @pending.reject { |key,_| %w[bytes format].include?(key) }.merge('preview'=>preview,'scaleVerified'=>false,
        'warnings'=>['Foto para diseño: escala real y repetición de textura sin verificar.','Falta validar abastecimiento antes de pedir a maderera.'])
    end
    def cancel;@pending=nil;{'cancelled'=>true};end
    def paths
      [File.join(@directory,'photo-assets'),File.join(@directory,'material-assets')]
    end
    def verify_directories!
      raise ExportError,'La biblioteca privada no puede usar enlaces simbólicos.' if File.symlink?(@directory) || paths.any? { |path| File.symlink?(path) }
    end
    def blob(bytes,extension,created)
      folder=File.join(@directory,'photo-assets');FileUtils.mkdir_p(folder)
      hash=Digest::SHA256.hexdigest(bytes);name=hash+extension;target=File.join(folder,name)
      if File.exist?(target) || File.symlink?(target)
        raise ExportError,'El activo existente cambió; restaurá su copia antes de continuar.' unless File.file?(target) && !File.symlink?(target) && Digest::SHA256.file(target).hexdigest==hash
      else
        Tempfile.create(['.photo-','.pending'],folder) do |file|
          file.binmode;file.write(bytes);file.flush;file.fsync;file.close;File.rename(file.path,target)
        end
        created << target
      end
      [name,target]
    end
    def thumbnail_bytes(material)
      raise ExportError,'Esta instalación no permite generar miniaturas del material real.' unless material.respond_to?(:write_thumbnail)
      Tempfile.create(['.planos-material-thumb-','.png']) do |file|
        path=file.path;file.close
        raise ExportError,'No se pudo generar la miniatura del material real.' if material.write_thumbnail(path,256)==false || !File.file?(path)
        bytes=File.binread(path,MAX_THUMBNAIL+1)
        raise ExportError,'La miniatura del material supera el tamaño permitido.' if bytes.bytesize>MAX_THUMBNAIL
        info=image_info(bytes)
        reject_image! unless info['format']=='png' && info['widthPx']<=512 && info['heightPx']<=512
        load_image(path,expected:info)
        bytes
      end
    end
    def options(data)
      allowed=%w[revision name kind thicknessMm action existingId confirmed replaceConfirmed textureWidthMm textureHeightMm]
      raise ExportError,'Confirmá la creación después de revisar la foto.' unless data.is_a?(Hash) && data['confirmed']==true && data['revision'].is_a?(Integer) && (data.keys-allowed).empty?
      raise ExportError,'Elegí crear, usar existente, variante o reemplazar.' unless %w[new existing variant replace].include?(data['action'])
      return data if data['action']=='existing'
      name=@catalog.text(data.fetch('name',''))
      raise ExportError,'Completá nombre y tipo placa o canto.' if name.empty? || !%w[sheet edge].include?(data['kind'])
      thickness=data['thicknessMm']
      raise ExportError,'El espesor debe ser un número positivo en milímetros.' unless thickness.nil? || (thickness.is_a?(Numeric) && thickness.finite? && thickness>0 && thickness<=100000)
      widths=%w[textureWidthMm textureHeightMm].map { |key| data[key] }
      unless widths.all?(&:nil?) || widths.all? { |value| value.is_a?(Numeric) && value.finite? && value>0 && value<=100000 }
        raise ExportError,'Confirmá ancho y alto reales de textura o dejá ambos sin verificar.'
      end
      data.merge('name'=>name)
    end
    def restore_file(path,previous)
      if previous
        @library.atomic_write(path,previous)
      elsif File.file?(path) && !File.symlink?(path)
        File.delete(path)
      end
    end
    def create(token,data)
      verify_guard!;verify_directories!
      raise ExportError,'La foto venció. Volvé a elegirla.' unless @pending && token==@pending['token']
      data=options(data)
      raise ExportError,'La biblioteca cambió; volvé a elegir la foto.' unless data['revision']==@pending['revision']
      if data['action']=='existing'
        duplicate=@pending['duplicates'].find { |row| row['catalogId']==data['existingId'] }
        raise ExportError,'Elegí un material existente de las coincidencias revisadas.' unless duplicate
        request={'catalogId'=>data['existingId'],'revision'=>data['revision'],'confirmed'=>true}
        # Replacing a photo intentionally leaves old face materials untouched.
        # Reuse only the unique verified current material; stale predecessors
        # remain unchanged and never become candidates by name alone.
        result=@library.locked(request) do |catalog,_index|
          verify_guard!
          item=@library.current_item(catalog,data['existingId'])
          duplicate_uuids=@library.duplicate_uuids
          valid=@library.materials.select do |material|
            @library.observed(material).dig('binding','catalogId')==item['id'] &&
              @library.binding_issues(material,catalog,duplicate_uuids).empty?
          end
          raise ExportError,'Hay varios materiales actuales; revisá sus vínculos antes de elegir.' if valid.length>1
          valid.empty? ? nil : {'materialId'=>@library.material_id(valid.first),'binding'=>@library.observed(valid.first)['binding']}
        end
        result=result ? @library.status.merge(result) : @library.install(request)
        @pending=nil
        return result.merge('catalog'=>@catalog.read,'catalogId'=>result.dig('binding','catalogId'),'materialUuid'=>result.dig('binding','uuid'),'thumbnail'=>thumbnails[data['existingId']],'created'=>false,'reused'=>true,'designReady'=>true)
      end
      result=nil
      @library.locked('revision'=>data['revision'],'confirmed'=>true) do |catalog,index|
        verify_guard!
        old=catalog['items'].find { |item| item['id']==data['existingId'] }
        if data['action']=='replace'
          raise ExportError,'Confirmá explícitamente reemplazar el visual. Las piezas existentes no se repintarán automáticamente.' unless data['replaceConfirmed']==true && old
          raise ExportError,'Reemplazar textura no permite cambiar el tipo del material.' unless old['kind']==data['kind']
        else
          same_hash=catalog['items'].any? { |item| photo(item)&.fetch('sourceHash',nil)==@pending['sourceHash'] }
          name_collision=catalog['items'].any? { |item| normalized(item['name'])==normalized(data['name']) }
          raise ExportError,'Ya existe una coincidencia. Elegí usar existente, variante con otro nombre o reemplazar.' if name_collision || (data['action']=='new' && same_hash)
        end
        catalog_path=File.join(@directory,'catalog.json');index_path=File.join(@directory,'material-assets.json')
        previous_catalog=File.file?(catalog_path) ? File.binread(catalog_path) : nil
        previous_index=File.file?(index_path) ? File.binread(index_path) : nil
        prior_assets=Dir.glob(File.join(@directory,'material-assets','*.skm'))
        created=[];started=false
        begin
          raise ExportError,'No se pudo iniciar la creación del material.' if @model.start_operation('Planos Santo — material desde foto',true)==false
          started=true
          image_asset,image_path=blob(@pending['bytes'],'.'+@pending['format'],created)
          scale={'verified'=>!data['textureWidthMm'].nil?,'widthMm'=>data['textureWidthMm'],'heightMm'=>data['textureHeightMm']}
          metadata={'schema'=>1,'designReady'=>true,'sourceHash'=>@pending['sourceHash'],'imageAsset'=>image_asset,
                    'thumbnailAsset'=>('0'*64)+'.png','skmHash'=>'0'*64,'textureScale'=>scale,'widthPx'=>@pending['widthPx'],'heightPx'=>@pending['heightPx']}
          item=@catalog.new_item(data['name'],data['kind'],{'source'=>'photo','photo'=>metadata})
          item['id']=old['id'] if data['action']=='replace'
          item['thicknessMm']=data['thicknessMm']
          previous_materials=@model.materials.to_a
          material=@model.materials.add(data['name'])
          raise ExportError,'SketchUp no pudo crear un material nuevo; el material existente no se modificó.' unless material && !previous_materials.include?(material) && material.respond_to?(:texture=)
          material.texture=scale['verified'] ? [image_path,data['textureWidthMm']/25.4,data['textureHeightMm']/25.4] : image_path
          raise ExportError,'SketchUp no pudo aplicar la textura real.' unless material.texture
          bytes=thumbnail_bytes(material)
          metadata['thumbnailAsset']=blob(bytes,'.png',created).first
          binding=MaterialResolver.binding_for(item)
          material.set_attribute(MaterialResolver::DICT,MaterialResolver::KEY,JSON.generate(binding))
          material.set_attribute(MaterialResolver::DICT,PHOTO_KEY,JSON.generate('schema'=>1,'sourceHash'=>@pending['sourceHash']))
          raise ExportError,'SketchUp no pudo guardar el SKM reutilizable.' unless @library.archive(material,item,index,true)
          record=index['records'].find { |row| row['catalogId']==item['id'] }
          raise ExportError,'Falta el archivo SKM reutilizable.' unless record && @library.usable_record(record,item)
          metadata['skmHash']=record['assetHash']
          item['sourceHash']=Digest::SHA256.hexdigest(JSON.generate(@catalog.canonical({'name'=>item['name'],'kind'=>item['kind'],'observed'=>item['observed']})))
          catalog['items'].reject! { |row| row['id']==item['id'] }
          catalog['items'] << item
          @catalog.validate(catalog)
          index['revision']+=1
          @library.write_index(index)
          @library.publish_catalog_locked(catalog,data['revision'])
          verify_guard!
          raise ExportError,'No se pudo confirmar la creación del material.' if @model.commit_operation==false
          started=false
          result={'catalog'=>catalog,'catalogId'=>item['id'],'materialId'=>material.entityID.to_s,'materialUuid'=>binding['uuid'],'binding'=>binding,
                  'thumbnail'=>'data:image/png;base64,'+Base64.strict_encode64(bytes),'created'=>true,'reused'=>false,'designReady'=>true,
                  'replaced'=>data['action']=='replace','textureScale'=>scale,
                  'warnings'=>['Listo para diseño; pendiente de validación para maderera.']+(scale['verified'] ? [] : ['Escala y repetición de la foto sin verificar.'])}
        rescue Exception
          @model.abort_operation if started
          restore_file(catalog_path,previous_catalog);restore_file(index_path,previous_index)
          (Dir.glob(File.join(@directory,'material-assets','*.skm'))-prior_assets).each { |path| File.delete(path) unless File.symlink?(path) }
          created.uniq.each { |path| File.delete(path) if File.file?(path) && !File.symlink?(path) }
          raise
        end
      end
      @pending=nil
      result
    end
    def thumbnails
      remaining=THUMBNAIL_BUDGET
      @catalog.read['items'].each_with_object({}) do |item,map|
        data=photo(item);next unless data && data['thumbnailAsset'].is_a?(String) && /\A[0-9a-f]{64}\.png\z/.match?(data['thumbnailAsset'])
        path=File.join(@directory,'photo-assets',data['thumbnailAsset'])
        next unless File.file?(path) && !File.symlink?(path) && !File.symlink?(File.dirname(path)) && File.size(path)<=MAX_THUMBNAIL
        bytes=File.binread(path,MAX_THUMBNAIL+1)
        next unless Digest::SHA256.hexdigest(bytes)==File.basename(path,'.png')
        begin
          info=image_info(bytes);next unless info['format']=='png' && info['widthPx']<=512 && info['heightPx']<=512
        rescue ExportError
          next
        end
        encoded='data:image/png;base64,'+Base64.strict_encode64(bytes)
        next if encoded.bytesize>remaining
        remaining-=encoded.bytesize;map[item['id']]=encoded
      end
    end
  end
end
