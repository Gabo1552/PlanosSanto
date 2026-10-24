# frozen_string_literal: true
require_relative 'photo_material'

module PlanosSanto
  # Explicitly archives ONE existing native material into the permanent library.
  # It never paints faces, replaces the native material, changes UV or writes OCL.
  class ModelMaterialCatalog
    EDITABLE=%w[name kind sku supplier thicknessMm widthMm lengthMm grain thicknessesMm widthsMm notes].freeze
    def initialize(model,catalog:,directory:CatalogStore.default_directory,guard:nil)
      @model,@catalog,@directory,@guard=model,catalog,directory,guard
      @library=MaterialLibrary.new(model,catalog:catalog,directory:directory)
      @photo=PhotoMaterial.new(model,catalog:catalog,directory:directory)
      @pending=nil
    end
    def guard!
      raise ExportError,'Cambió el modelo o hay cambios pendientes; volvé a abrir la ficha del material.' if @guard && @guard.call==false
    end
    def material!(id)
      # Diagnostics/Cutlist namespaces native entity IDs; the library uses raw IDs.
      native_id=id.to_s.sub(/\Amaterial:(\d+)\z/, '\\1')
      @library.materials.find { |material| @library.material_id(material)==native_id } || raise(ExportError,'El material ya no está en el modelo; volvé a elegirlo.')
    end
    def existing_id(material,catalog)
      observation=@library.observed(material)
      raise ExportError,'El vínculo del material está dañado; reparalo en Materiales antes de crear otra ficha.' if observation['status']=='invalid'
      return nil unless observation['binding']
      issues=@library.binding_issues(material,catalog,@library.duplicate_uuids)
      raise ExportError,issues.join(' ') unless issues.empty?
      observation['binding']['catalogId']
    end
    def preview(material_id)
      guard!;material=material!(material_id);catalog=@catalog.read;index=@library.assets
      existing=existing_id(material,catalog)
      return {'existingCatalogId'=>existing,'materialId'=>@library.material_id(material),'revision'=>catalog['revision'],'assetRevision'=>index['revision'],'warnings'=>[]} if existing
      attrs=OclAttributes::KNOWN_KEYS.to_h { |key| [key,material.get_attribute(OclAttributes::DICT,key,nil)] }.compact
      kind={2=>'sheet',4=>'edge'}[attrs['type']] || 'unknown'
      # OCL serialized lengths are strings with units. A bare numeric value has
      # no unit contract here (native Length values may be inches): don't guess.
      safe=attrs.transform_values { |value| (value.is_a?(String) && value.bytesize<=4096) || value==true || value==false ? value : nil }
      values=@catalog.ocl_values(kind,safe).compact;lists=@catalog.ocl_lists(kind,safe)
      item=@catalog.new_item(material.name.to_s[0,160],kind,{'source'=>'native_material','nativeId'=>@library.material_id(material),'ocl'=>safe.compact})
      item.merge!('thicknessesMm'=>[],'widthsMm'=>[])
      item.merge!(values)
      lists.each { |key,value| item[key]=value }
      item=CatalogStore.normalize_row(item)
      fields=(values.keys+lists.keys).uniq.sort
      item['suggested']={'source'=>'ocl','fields'=>fields.map { |key| {'thicknessesMm'=>'thicknessMm','widthsMm'=>'widthMm'}.fetch(key,key) }.uniq.sort,'presetId'=>nil} unless fields.empty?
      warnings=[]
      warnings << 'Elegí Placa o Canto: el material no tiene un tipo OpenCutList reconocido.' if kind=='unknown'
      warnings << 'Las medidas sin unidad, listas de formatos o valores ambiguos no se completaron. Revisá los campos vacíos.' if (attrs.key?('std_sizes') && (!values['lengthMm'] || !values['widthMm'])) || (attrs.key?('std_thicknesses') && !values['thicknessMm'] && !lists['thicknessesMm']) || (attrs.key?('thickness') && !values['thicknessMm']) || (attrs.key?('std_widths') && !values['widthMm'] && !lists['widthsMm'])
      warnings << 'La ficha conserva la apariencia actual. Guardarla no pinta ni cambia superficies del modelo.'
      thumbnail=begin
        'data:image/png;base64,'+Base64.strict_encode64(@photo.thumbnail_bytes(material))
      rescue ExportError
        warnings << 'No se pudo generar la miniatura; se conservará el material nativo mediante su SKM.'
        nil
      end
      color=material.respond_to?(:color) && material.color
      token=SecureRandom.hex(24)
      @pending={'token'=>token,'material'=>material,'materialId'=>@library.material_id(material),'state'=>@library.material_state(material),'thumbnailHash'=>thumbnail && Digest::SHA256.hexdigest(thumbnail),'item'=>item,'createdAt'=>Process.clock_gettime(Process::CLOCK_MONOTONIC)}
      {'token'=>token,'revision'=>catalog['revision'],'assetRevision'=>index['revision'],'materialId'=>@library.material_id(material),'item'=>Marshal.load(Marshal.dump(item)),
       'thumbnail'=>thumbnail,'color'=>color && [color.red,color.green,color.blue],'hasTexture'=>material.respond_to?(:texture) && !material.texture.nil?,'warnings'=>warnings}
    end
    def cancel(token=nil)
      @pending=nil if token.nil? || @pending && @pending['token']==token
      {'cancelled'=>true}
    end
    # Embedded SKM thumbnails persist across processes; no original texture path
    # or private asset bytes other than the bounded preview enter the dialog.
    def thumbnails
      catalog=@catalog.read;index=@library.assets;budget=PhotoMaterial::THUMBNAIL_BUDGET;out={}
      importer=SkmImport.new(catalog:@catalog,directory:@directory)
      @thumbnail_cache ||= {}
      catalog['items'].each do |item|
        break if budget<=0
        next unless item.dig('observed','source')=='native_material'
        record=index['records'].find { |row| row['catalogId']==item['id'] };next unless record
        path=File.join(@directory,'material-assets',record['assetName'])
        next unless File.file?(path) && File.size(path)<=SkmImport::MAX_SKM && MaterialPolicy.file_matches?(@directory,'material-assets',record['assetName'],record['assetHash'])
        thumb=if @thumbnail_cache.key?(record['assetHash'])
          @thumbnail_cache[record['assetHash']]
        else
          bytes=File.binread(path,SkmImport::MAX_SKM+1)
          zip=BoundedZip.new(bytes,max_bytes:SkmImport::MAX_SKM,max_entries:128,max_total:64*1024*1024,max_entry:32*1024*1024)
          image=zip.entries.find { |entry| %w[doc_thumbnail.png thumbnail.png doc_thumbnail.jpg thumbnail.jpg].include?(entry.name.downcase) && entry.size<=SkmImport::MAX_PREVIEW }
          @thumbnail_cache.clear if @thumbnail_cache.length>=256
          @thumbnail_cache[record['assetHash']]=image ? importer.thumbnail(zip.read(image)) : nil
        end
        break if thumb && thumb.bytesize>budget
        next unless thumb
        budget-=thumb.bytesize;out[item['id']]=thumb
      rescue ExportError,SystemCallError,IOError
        next # Missing/corrupt SKM readiness is reported by MaterialLibrary.status.
      end
      out
    end
    def commit(data)
      guard!
      raise ExportError,'Volvé a abrir la ficha del material: la previsualización venció.' unless data.is_a?(Hash) && @pending && data['token']==@pending['token'] && Process.clock_gettime(Process::CLOCK_MONOTONIC)-@pending['createdAt']<=600
      raise ExportError,'Ficha inválida.' unless data['item'].is_a?(Hash)
      raise ExportError,'Elegí Placa o Canto para guardar este material.' unless %w[sheet edge].include?(data['item']['kind'])
      raise ExportError,'Falta la revisión de los activos; volvé a abrir la ficha.' unless data['assetRevision'].is_a?(Integer)
      item=Marshal.load(Marshal.dump(@pending['item']))
      EDITABLE.each { |key| item[key]=data['item'][key] if data['item'].key?(key) }
      item=CatalogStore.normalize_row(item);item['updatedAt']=Time.now.utc.iso8601
      # source metadata/id are generated by Ruby, never taken from the dialog.
      item['sourceHash']=Digest::SHA256.hexdigest(JSON.generate(@catalog.canonical(item.slice('name','kind','observed'))))
      result=@library.locked({'confirmed'=>true,'revision'=>data['revision'],'assetRevision'=>data['assetRevision']}) do |catalog,index|
        guard!;material=material!(@pending['materialId'])
        existing=existing_id(material,catalog)
        next {'catalogId'=>existing,'materialId'=>@library.material_id(material),'created'=>false,'reused'=>true} if existing
        unless material.equal?(@pending['material']) && @library.material_state(material)==@pending['state']
          raise ExportError,'El material cambió desde la previsualización; volvé a abrir su ficha.'
        end
        if @pending['thumbnailHash']
          current_thumbnail=begin
            'data:image/png;base64,'+Base64.strict_encode64(@photo.thumbnail_bytes(material))
          rescue ExportError
            nil
          end
          unless current_thumbnail && Digest::SHA256.hexdigest(current_thumbnail)==@pending['thumbnailHash']
            raise ExportError,'La apariencia del material cambió o no se pudo verificar; volvé a abrir su ficha.'
          end
        end
        candidate=Marshal.load(Marshal.dump(catalog));candidate['items'] << item;@catalog.validate(candidate)
        path=File.join(@directory,'catalog.json');previous=File.file?(path) ? File.binread(path) : nil
        index_path=File.join(@directory,'material-assets.json');previous_index=File.file?(index_path) ? File.binread(index_path) : nil
        prior_assets=Dir.glob(File.join(@directory,'material-assets','*.skm'))
        begin
          @library.mutate(index,'Planos Santo — guardar material del modelo') do
            binding=MaterialResolver.binding_for(item)
            material.set_attribute(MaterialResolver::DICT,MaterialResolver::KEY,JSON.generate(binding))
            raise ExportError,'No se pudo guardar el SKM reutilizable; no se creó la ficha.' unless @library.archive(material,item,index,true)
            record=index['records'].find { |entry| entry['catalogId']==item['id'] }
            raise ExportError,'No se pudo verificar el SKM guardado.' unless record && @library.usable_record(record,item)
            @library.publish_catalog_locked(candidate,data['revision'])
            guard!
            [{'catalogId'=>item['id'],'materialId'=>@library.material_id(material),'binding'=>binding,'materialUuid'=>binding['uuid'],'created'=>true,'reused'=>false},true]
          end
        rescue Exception => original
          restored=true
          [[path,previous],[index_path,previous_index]].each do |file,bytes|
            begin
              current=File.file?(file) ? File.binread(file) : nil
              next if current==bytes
              bytes ? @library.atomic_write(file,bytes) : File.delete(file)
              restored=false unless (File.file?(file) ? File.binread(file) : nil)==bytes
            rescue StandardError
              restored=false
            end
          end
          restored=false unless @library.material_state(material)==@pending['state']
          unless restored
            raise ExportError,'No se pudo restaurar completamente el modelo o la biblioteca tras el error. Se conservaron los SKM para recuperación. No sigas guardando materiales; revisá la copia de seguridad de la biblioteca y el modelo.'
          end
          (Dir.glob(File.join(@directory,'material-assets','*.skm'))-prior_assets).each { |asset| File.delete(asset) if File.file?(asset) && !File.symlink?(asset) }
          raise original
        end
      end
      @pending=nil
      @library.status.merge(result)
    end
  end
end
