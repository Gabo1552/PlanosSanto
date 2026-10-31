# frozen_string_literal: true
require 'base64'
require 'tempfile'
require_relative 'material_library'
require_relative 'ocl_attributes'

module PlanosSanto
  # Creates a real native textured material from a Ruby-picked local image.
  # Paths and bytes never arrive from JS: the browser gets an expiring token.
  class PhotoMaterial
    MAX_BYTES=12*1024*1024
    MAX_PIXELS=16_000_000
    MAX_DIMENSION=16_384
    MAX_DECODED_BYTES=MAX_PIXELS*4+MAX_DIMENSION*3
    # 0.8.18 (calidad visual): previews and material thumbnails are 512 px on
    # their longest side (the largest library tile is ~314 CSS px, so 512 covers
    # it at 150 % and almost at 200 % scaling). Byte limit: a 512×512 RGBA PNG
    # that does not compress at all (512*512*4 + one filter byte per row) plus
    # 64 KiB for zlib/chunk headers = 1_114_624 bytes (it was 512 KiB for 256 px).
    THUMBNAIL_SIDE=512
    LEGACY_THUMBNAIL_SIDE=256
    MAX_THUMBNAIL=THUMBNAIL_SIDE*THUMBNAIL_SIDE*4+THUMBNAIL_SIDE+64*1024
    # Base64 data URIs sent to the library in one load (was 8 MiB): a typical
    # 512 px wood photo is 0.4-0.7 MB as PNG (0.55-0.95 MB in Base64), so 24 MiB
    # keeps ~25-40 photo thumbnails; the rest show the placeholder, as before.
    THUMBNAIL_BUDGET=24*1024*1024
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
      raise ExportError,'Esta instalación de SketchUp no tiene Sketchup::ImageRep (SketchUp 2018 o posterior) y no puede decodificar la foto.' unless defined?(Sketchup::ImageRep)
      # load_file has no documented return value (SketchUp 2026 answers nil after
      # a successful decode). Start with a new representation so a failed decode
      # cannot reuse pixels or dimensions from a previous image. Only true or nil
      # are accepted, and either answer must still prove decoded pixels.
      rep=Sketchup::ImageRep.new
      result=rep.load_file(path)
      reject_image! unless result==true || result.nil?
      width=rep.width;height=rep.height
      reject_image! unless width.is_a?(Integer) && height.is_a?(Integer) && width>0 && height>0 && width<=MAX_DIMENSION && height<=MAX_DIMENSION && width*height<=MAX_PIXELS
      reject_image! if expected && [width,height]!=[expected['widthPx'],expected['heightPx']]
      reject_image! unless expected && rep.respond_to?(:bits_per_pixel) && rep.respond_to?(:row_padding) && rep.respond_to?(:data)
      bits=rep.bits_per_pixel;padding=rep.row_padding
      reject_image! unless [24,32].include?(bits) && bits.is_a?(Integer) && padding.is_a?(Integer) && padding.between?(0,3)
      stride=width*(bits/8)+padding
      decoded_size=height*stride
      reject_image! if stride>MAX_DIMENSION*4+3 || decoded_size>MAX_DECODED_BYTES
      pixels=rep.data
      reject_image! unless pixels.is_a?(String) && pixels.bytesize==decoded_size
      rep
    rescue ExportError
      raise
    rescue StandardError
      reject_image!
    end
    # Close the copy before decoding: on Windows ImageRep#load_file fails while
    # Ruby still holds the file open (0.8.13 native F0).
    def temporary(bytes,extension)
      Tempfile.create(['.planos-photo-',extension]) do |file|
        file.binmode;file.write(bytes);file.flush;file.close
        yield file.path
      end
    end
    # ImageRep has no resize (API 2018-2026: data/set_data/save_file only), so
    # the preview is reduced here from the already validated pixels with an
    # area average (box filter), not a nearest-neighbour sample (0.8.17 and
    # before, which aliased fine grain and looked pixelated). Each output pixel
    # is the mean of a step×step block, step = the reduction ratio rounded to an
    # integer, starting where that pixel falls in the source. Every byte is
    # averaged on its own, so the native order (BGR(A) on Windows) is kept, and
    # rows are padded to 4 bytes.
    # Speed (16 MP in a few hundred ms, pure Ruby): a source row becomes one
    # Integer with a lane of bits_per_pixel bits per pixel and channel. Adding
    # rows, sliding the block (one multiplication) and dividing (multiply by a
    # reciprocal and shift) are then a few big-integer operations in C per row,
    # never one Ruby operation per pixel. The reciprocal rounds down: exact to
    # ±1 level for blocks up to 16 px (24 bits) or 256 px (32 bits); a larger
    # block (only 24-bit sources over 8192 px) may read up to 4 levels darker.
    def thumbnail_rep(rep,width,height)
      bytes=rep.bits_per_pixel/8;source=rep.data;source_width=rep.width;source_height=rep.height
      stride=source_width*bytes+rep.row_padding;row_bytes=source_width*bytes;lane=bytes*8
      step=[(source_width.to_f/width).round,(source_height.to_f/height).round].min;step=1 if step<1
      step-=1 while step>1 && step*step*255>=(1<<lane) # a block sum must fit its lane
      shift=lane-8;reciprocal=(1<<shift)/(step*step)
      low_byte=lanes(("\xFF".b+"\x00".b*(bytes-1))*source_width)
      half=lanes(("\x01".b+"\x00".b*(bytes-1))*source_width)<<(shift-1)
      # sum*kernel: in each lane, the sum of the step pixels that end there, times the reciprocal.
      kernel=(0...step).sum { |index| reciprocal<<(index*lane) }
      # Big-endian hex of the averaged row; output pixels taken right to left.
      gather=(0...width).reverse_each.map do |x|
        last=[x*source_width/width,source_width-step].min+step-1
        "@#{(source_width-1-last)*bytes*2}a#{bytes*2}"
      end.join
      padding=(4-(width*bytes)%4)%4;zero="\x00".b*padding;digits=row_bytes*2;row_mask=(1<<(row_bytes*8))-1
      pixels=String.new(capacity:(width*bytes+padding)*height,encoding:Encoding::BINARY)
      channels={} # source row -> its bytes split by channel, reused by overlapping blocks
      height.times do |y|
        top=[y*source_height/height,source_height-step].min
        channels.delete_if { |row,_| row<top }
        sums=Array.new(bytes,0)
        step.times do |offset|
          split=channels[top+offset]||=begin
            value=lanes(source.byteslice((top+offset)*stride,row_bytes))
            Array.new(bytes) { |channel| (value>>(8*channel))&low_byte }
          end
          bytes.times { |channel| sums[channel]+=split[channel] }
        end
        averaged=0
        sums.each_with_index { |sum,channel| averaged|=(((sum*kernel+half)>>shift)&low_byte)<<(8*channel) }
        hex=(averaged&row_mask).to_s(16).rjust(digits,'0')
        pixels << [hex.unpack(gather).join].pack('H*').reverse << zero
      end
      Sketchup::ImageRep.new.set_data(width,height,rep.bits_per_pixel,padding,pixels)
    end
    # Little-endian bytes -> Integer, through the documented Marshal layout of
    # an Integer ("\x04\x08l+", length in 16-bit words, digits): a plain copy in
    # C. The header is fixed here and the bytes are only pixel values, so
    # nothing but an Integer can come out.
    def lanes(bytes)
      bytes+="\x00".b if bytes.bytesize.odd?
      words=bytes.bytesize/2
      length=words<=122 ? [words+5].pack('C') : [words].pack('V').sub(/\x00+\z/n,'').then { |digits| [digits.bytesize].pack('C')+digits }
      value=Marshal.load("\x04\x08l+".b+length+bytes)
      raise ExportError,'No se pudo generar la vista previa de la imagen.' unless value.is_a?(Integer)
      value
    end
    def image_preview(rep)
      side=THUMBNAIL_SIDE.to_f
      ratio=[side/rep.width,side/rep.height,1.0].min
      width=[(rep.width*ratio).round,1].max;height=[(rep.height*ratio).round,1].max
      if [width,height]!=[rep.width,rep.height]
        rep=thumbnail_rep(rep,width,height)
        raise ExportError,'No se pudo generar la vista previa de la imagen.' unless rep && rep.width==width && rep.height==height
      end
      Tempfile.create(['.planos-preview-','.png']) do |file|
        path=file.path;file.close
        raise ExportError,'No se pudo generar la vista previa de la imagen.' if rep.save_file(path)==false || !File.file?(path)
        bytes=File.binread(path,MAX_THUMBNAIL+1)
        raise ExportError,'La vista previa supera el tamaño permitido.' if bytes.bytesize>MAX_THUMBNAIL
        info=image_info(bytes);reject_image! unless info['format']=='png' && info['widthPx']<=THUMBNAIL_SIDE && info['heightPx']<=THUMBNAIL_SIDE
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
      extension=File.extname(path).downcase
      reject_image! unless info['format']==(extension=='.png' ? 'png' : 'jpg')
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
        # 512 px for sharp tiles; 256 px (0.8.17) only if SketchUp refuses the larger size.
        written=[THUMBNAIL_SIDE,LEGACY_THUMBNAIL_SIDE].any? do |side|
          File.binwrite(path,''.b)
          begin
            material.write_thumbnail(path,side)!=false && File.size?(path)
          rescue StandardError # e.g. a size this SketchUp does not accept: try the next one
            false
          end
        end
        raise ExportError,'No se pudo generar la miniatura del material real.' unless written
        bytes=File.binread(path,MAX_THUMBNAIL+1)
        raise ExportError,'La miniatura del material supera el tamaño permitido.' if bytes.bytesize>MAX_THUMBNAIL
        info=image_info(bytes)
        reject_image! unless info['format']=='png' && info['widthPx']<=THUMBNAIL_SIDE && info['heightPx']<=THUMBNAIL_SIDE
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
      @library.locked({'revision'=>data['revision'],'confirmed'=>true}) do |catalog,index|
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
          if data['action']=='replace'
            # Replacing the visual never resets commercial data (0.8.8): SKU,
            # supplier, format, grain, edges, price and approval are preserved.
            item['id']=old['id']
            %w[sku supplier thicknessMm widthMm lengthMm grain compatibleIds price favorite approved].each { |key| item[key]=old[key] }
          end
          item['thicknessMm']=data['thicknessMm'] unless data['thicknessMm'].nil?
          # Library v4: a sheet's thickness joins its list (and an edge's single width, its widths).
          item=CatalogStore.normalize_row(item)
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
          OclAttributes.write_missing(material,item)
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
          begin
            @model.abort_operation if started
          rescue StandardError => abort_error
            warn("Planos Santo: abort_operation falló al ajustar textura: #{abort_error.class}")
          end
          restore_file(catalog_path,previous_catalog);restore_file(index_path,previous_index)
          (Dir.glob(File.join(@directory,'material-assets','*.skm'))-prior_assets).each { |path| File.delete(path) unless File.symlink?(path) }
          created.uniq.each { |path| File.delete(path) if File.file?(path) && !File.symlink?(path) }
          raise
        end
      end
      @pending=nil
      result
    end
    # --- Hito 7: scale and 90° rotation of a photo texture (MATERIALES-10/11) --
    # Edits the SAME native material(s) bound to the item, so faces already
    # painted follow the change. Rotation re-encodes the image pixels (ImageRep
    # has no rotation); cut grain is still confirmed per piece, never here.
    MAX_ROTATE_PIXELS=4_194_304
    ROTATIONS=[0,90,180,270].freeze
    def texture_options(data)
      raise ExportError,'Solicitud de textura inválida.' unless data.is_a?(Hash) && data['catalogId'].is_a?(String)
      raise ExportError,'Girá la textura de a 90° (0, 90, 180 o 270).' unless ROTATIONS.include?(data['rotation'])
      sizes=%w[widthMm heightMm].map { |key| data[key] }
      raise ExportError,'Completá ancho y alto reales de la textura en milímetros.' unless sizes.all? { |value| value.is_a?(Numeric) && value.finite? && value>0 && value<=100000 }
      data
    end
    def texture_item(catalog,id)
      item=catalog['items'].find { |row| row['id']==id }
      raise ExportError,'La ficha ya no existe en la biblioteca.' unless item
      raise ExportError,'Solo las fichas creadas desde una foto propia permiten ajustar escala y giro.' unless MaterialPolicy.photo?(item) && MaterialPolicy.metadata_valid?(item)
      raise ExportError,"Faltan o cambiaron archivos privados de «#{item['name']}»; restauralos antes de ajustar la textura." unless MaterialPolicy.photo_source_ready?(item,directory:@directory)
      item
    end
    def texture_targets(item,catalog)
      duplicates=@library.duplicate_uuids
      @library.materials.select do |material|
        @library.observed(material).dig('binding','catalogId')==item['id'] && @library.binding_issues(material,catalog,duplicates).empty?
      end
    end
    def rotate_rep(rep,degrees)
      return rep if degrees.zero?
      bytes=rep.bits_per_pixel/8;width=rep.width;height=rep.height
      raise ExportError,'La foto es demasiado grande para girarla aquí (máximo 4 megapíxeles). Girala antes de cargarla.' if width*height>MAX_ROTATE_PIXELS
      raise ExportError,'Formato de imagen no admitido para girar.' unless [3,4].include?(bytes)
      stride=width*bytes+rep.row_padding;source=rep.data
      # Integers per pixel (immediate values), never one String per pixel.
      grid=Array.new(height) do |y|
        row=source.byteslice(y*stride,width*bytes)
        if bytes==4
          row.unpack('V*')
        else
          channels=row.unpack('C*')
          Array.new(width) { |x| channels[x*3]|channels[x*3+1]<<8|channels[x*3+2]<<16 }
        end
      end
      grid=case degrees
           when 90 then grid.transpose.map(&:reverse)
           when 180 then grid.reverse.map(&:reverse)
           else grid.transpose.reverse
           end
      new_width=grid.first.length;new_height=grid.length
      padding=(4-(new_width*bytes)%4)%4
      pixels=String.new(capacity:(new_width*bytes+padding)*new_height,encoding:Encoding::BINARY)
      grid.each { |row| pixels << (bytes==4 ? row.pack('V*') : row.flat_map { |v| [v&255,(v>>8)&255,(v>>16)&255] }.pack('C*')) << ("\x00".b*padding) }
      Sketchup::ImageRep.new.set_data(new_width,new_height,rep.bits_per_pixel,padding,pixels)
    end
    def rotated_png(path,degrees,limit)
      bytes=File.binread(path,MAX_BYTES+1)
      rep=rotate_rep(load_image(path,expected:image_info(bytes)),degrees)
      Tempfile.create(['.planos-rotated-','.png']) do |file|
        target=file.path;file.close
        raise ExportError,'No se pudo guardar la imagen girada.' if rep.save_file(target)==false || !File.file?(target)
        raise ExportError,'La imagen girada supera el tamaño permitido.' if File.size(target)>limit
        output=File.binread(target,limit+1)
        info=image_info(output)
        reject_image! unless info['format']=='png' && [info['widthPx'],info['heightPx']]==[rep.width,rep.height]
        output
      end
    end
    def texture_summary(item,data)
      photo=item['observed']['photo']
      pixels=data['rotation']%180==90 ? [photo['heightPx'],photo['widthPx']] : [photo['widthPx'],photo['heightPx']]
      warnings=[]
      ratio=data['widthMm'].to_f/data['heightMm'];pixel_ratio=pixels[0].to_f/pixels[1]
      if (ratio-pixel_ratio).abs/pixel_ratio>0.02
        warnings << "La proporción no coincide con la foto (#{pixels[0]} × #{pixels[1]} px): la textura se verá deformada."
      end
      repeats=nil
      if item['kind']=='sheet' && item['lengthMm'] && item['widthMm']
        repeats={'alongLength'=>(item['lengthMm']/data['widthMm'].to_f).round(2),'alongWidth'=>(item['widthMm']/data['heightMm'].to_f).round(2)}
        warnings << "La foto se repite #{repeats['alongLength']} × #{repeats['alongWidth']} veces sobre la placa; pueden verse juntas." if repeats.values.any? { |value| value>1.0 }
      end
      warnings << 'Girar la textura solo cambia lo visual: la veta de corte se sigue confirmando por pieza.' unless data['rotation'].zero?
      [{'widthPx'=>pixels[0],'heightPx'=>pixels[1]},repeats,warnings]
    end
    def texture_preview(data)
      data=texture_options(data)
      catalog=@catalog.read
      item=texture_item(catalog,data['catalogId'])
      photo=item['observed']['photo']
      pixels,repeats,warnings=texture_summary(item,data)
      thumb_path=File.join(@directory,'photo-assets',photo['thumbnailAsset'])
      thumbnail=begin
        bytes=data['rotation'].zero? ? File.binread(thumb_path,MAX_THUMBNAIL+1) : rotated_png(thumb_path,data['rotation'],MAX_THUMBNAIL)
        bytes.bytesize<=MAX_THUMBNAIL ? 'data:image/png;base64,'+Base64.strict_encode64(bytes) : nil
      rescue ExportError
        nil
      end
      affected=texture_targets(item,catalog).map { |material| {'materialId'=>@library.material_id(material),'name'=>material.name.to_s} }
      warnings << 'Cargá este material en el modelo para ajustar su textura.' if affected.empty?
      excluded=@library.materials.count { |material| @library.observed(material).dig('binding','catalogId')==item['id'] }-affected.length
      warnings << "#{excluded} material(es) vinculados con problemas no se ajustarán; revisalos en el modelo." if excluded>0
      {'catalogId'=>item['id'],'current'=>photo['textureScale'].merge('rotation'=>0),'proposed'=>{'widthMm'=>data['widthMm'],'heightMm'=>data['heightMm'],'rotation'=>data['rotation']},
       'pixels'=>pixels,'thumbnail'=>thumbnail,'affected'=>affected,'materialIds'=>affected.map { |row| row['materialId'] },'repeats'=>repeats,'warnings'=>warnings,
       'revision'=>catalog['revision'],'assetRevision'=>@library.assets['revision'],'noChanges'=>true}
    end
    def texture_apply(data)
      verify_guard!;verify_directories!
      data=texture_options(data)
      raise ExportError,'Confirmá el ajuste de textura después de revisar la vista previa.' unless data['confirmed']==true
      result=nil
      raise ExportError,'Volvé a verificar la vista previa antes de aplicar.' unless data['materialIds'].is_a?(Array)
      @library.locked(data,confirm_message:'Confirmá el ajuste de textura después de revisar la vista previa.') do |catalog,index|
        verify_guard!
        item=texture_item(catalog,data['catalogId'])
        targets=texture_targets(item,catalog)
        raise ExportError,'Cargá este material en el modelo para ajustar su textura.' if targets.empty?
        unless targets.map { |material| @library.material_id(material) }.sort==data['materialIds'].map(&:to_s).sort
          raise ExportError,'Los materiales del modelo cambiaron desde la vista previa; volvé a verificarla.'
        end
        scale=item['observed']['photo']['textureScale']
        if data['rotation'].zero? && scale['verified'] && scale['widthMm']==data['widthMm'] && scale['heightMm']==data['heightMm']
          result={'catalogId'=>item['id'],'applied'=>[],'textureScale'=>scale,'rotation'=>0,'verification'=>{'ok'=>true,'checked'=>0},'warnings'=>['La textura ya tenía esa escala; no se cambió nada.'],'noChanges'=>true}
          next
        end
        photo=JSON.parse(JSON.generate(item['observed']['photo']))
        pixels,_repeats,warnings=texture_summary(item,data)
        catalog_path=File.join(@directory,'catalog.json');index_path=File.join(@directory,'material-assets.json')
        previous_catalog=File.file?(catalog_path) ? File.binread(catalog_path) : nil
        previous_index=File.file?(index_path) ? File.binread(index_path) : nil
        prior_assets=Dir.glob(File.join(@directory,'material-assets','*.skm'))
        created=[];started=false
        begin
          image_path=File.join(@directory,'photo-assets',photo['imageAsset'])
          unless data['rotation'].zero?
            bytes=rotated_png(image_path,data['rotation'],MAX_BYTES)
            photo['imageAsset'],image_path=blob(bytes,'.png',created)
            photo['sourceHash']=photo['imageAsset'].split('.').first
            photo['widthPx'],photo['heightPx']=pixels['widthPx'],pixels['heightPx']
          end
          photo['textureScale']={'verified'=>true,'widthMm'=>data['widthMm'],'heightMm'=>data['heightMm']}
          raise ExportError,'No se pudo iniciar el ajuste de textura.' if @model.start_operation('Planos Santo — ajustar textura',true)==false
          started=true
          targets.each do |material|
            material.texture=[image_path,data['widthMm']/25.4,data['heightMm']/25.4]
            texture=material.texture
            ok=texture && %i[width height].all? { |axis| texture.respond_to?(axis) } &&
              (texture.width.to_f*25.4-data['widthMm']).abs<=0.1 && (texture.height.to_f*25.4-data['heightMm']).abs<=0.1
            raise ExportError,"SketchUp no aplicó la escala pedida a «#{material.name}»; no se verificó el ajuste y se revirtió." unless ok
            material.set_attribute(MaterialResolver::DICT,PHOTO_KEY,JSON.generate('schema'=>1,'sourceHash'=>photo['sourceHash']))
          end
          photo['thumbnailAsset']=blob(thumbnail_bytes(targets.first),'.png',created).first
          item['observed']=item['observed'].merge('photo'=>photo)
          raise ExportError,'SketchUp no pudo guardar el SKM reutilizable.' unless @library.archive(targets.first,item,index,true)
          record=index['records'].find { |row| row['catalogId']==item['id'] }
          raise ExportError,'Falta el archivo SKM reutilizable.' unless record && @library.usable_record(record,item)
          photo['skmHash']=record['assetHash']
          item['observed']=item['observed'].merge('photo'=>photo)
          item['updatedAt']=Time.now.utc.iso8601
          item['sourceHash']=Digest::SHA256.hexdigest(JSON.generate(@catalog.canonical({'name'=>item['name'],'kind'=>item['kind'],'observed'=>item['observed']})))
          record['catalogFingerprint']=MaterialResolver.item_fingerprint(item)
          targets.each do |material|
            old=@library.observed(material)['binding']
            material.set_attribute(MaterialResolver::DICT,MaterialResolver::KEY,JSON.generate(MaterialResolver.binding_for(item,old['uuid'])))
          end
          catalog['items'].map! { |row| row['id']==item['id'] ? item : row }
          @catalog.validate(catalog)
          index['revision']+=1
          @library.write_index(index)
          @library.publish_catalog_locked(catalog,data['revision'])
          unless targets.all? { |material| MaterialPolicy.native_valid?(item,material,directory:@directory) }
            raise ExportError,'No se pudo verificar la textura ajustada; se revirtió el cambio.'
          end
          verify_guard!
          raise ExportError,'No se pudo confirmar el ajuste de textura.' if @model.commit_operation==false
          started=false
          result={'catalogId'=>item['id'],'catalog'=>catalog,
                  'applied'=>targets.map { |material| {'materialId'=>@library.material_id(material),'name'=>material.name.to_s,'widthMm'=>data['widthMm'],'heightMm'=>data['heightMm']} },
                  'textureScale'=>photo['textureScale'],'rotation'=>data['rotation'],'verification'=>{'ok'=>true,'checked'=>targets.length},'warnings'=>warnings}
        rescue Exception
          @model.abort_operation if started
          restore_file(catalog_path,previous_catalog);restore_file(index_path,previous_index)
          (Dir.glob(File.join(@directory,'material-assets','*.skm'))-prior_assets).each { |path| File.delete(path) unless File.symlink?(path) }
          created.uniq.each { |path| File.delete(path) if File.file?(path) && !File.symlink?(path) }
          raise
        end
      end
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
          info=image_info(bytes);next unless info['format']=='png' && info['widthPx']<=THUMBNAIL_SIDE && info['heightPx']<=THUMBNAIL_SIDE
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
