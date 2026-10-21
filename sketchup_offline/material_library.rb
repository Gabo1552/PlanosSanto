# frozen_string_literal: true
require_relative 'catalog_store'
require_relative 'material_resolver'
require_relative 'material_policy'

module PlanosSanto
  # Visual archives are private local SKM files, separate from the commercial
  # schema. Merely listing the library never creates a material or metadata.
  class MaterialLibrary
    MAX_BYTES = 8 * 1024 * 1024
    def initialize(model, catalog:, directory: CatalogStore.default_directory)
      @model, @catalog, @directory = model, catalog, directory
      @path = File.join(directory, 'material-assets.json')
    end

    def assets
      return { 'schema' => 1, 'revision' => 0, 'records' => [] } unless File.exist?(@path)
      raise ExportError, 'Índice visual demasiado grande.' if File.size(@path) > MAX_BYTES
      data = JSON.parse(File.binread(@path))
      valid = data.is_a?(Hash) && data.keys.sort == %w[records revision schema] && data['schema'] == 1 && data['revision'].is_a?(Integer) && data['revision'] >= 0 && data['records'].is_a?(Array) && data['records'].length <= 5000
      raise ExportError, 'Índice visual inválido; no se sobrescribió.' unless valid
      ids = []
      data['records'].each do |row|
        valid = row.is_a?(Hash) && row.keys.sort == %w[assetHash assetName catalogFingerprint catalogId sourceName] &&
          row['catalogId'].is_a?(String) && MaterialResolver::UUID.match?(row['catalogId']) && !ids.include?(row['catalogId']) &&
          row['assetName'].is_a?(String) && /\A[0-9a-f]{64}\.skm\z/.match?(row['assetName']) &&
          %w[assetHash catalogFingerprint].all? { |k| row[k].is_a?(String) && /\A[0-9a-f]{64}\z/.match?(row[k]) } &&
          row['assetName'] == "#{row['assetHash']}.skm" &&
          row['sourceName'].is_a?(String) && row['sourceName'].length <= 512
        raise ExportError, 'Registro visual inválido; no se sobrescribió.' unless valid
        ids << row['catalogId']
      end
      data
    rescue JSON::ParserError
      raise ExportError, 'Índice visual dañado; restaurá su copia de seguridad.'
    end

    def materials
      @model.materials.to_a
    end

    def material_id(material)
      material.entityID.to_s
    end

    def current_item(catalog, id, allow_source: false)
      item = catalog['items'].find { |row| row['id'] == id }
      raise ExportError, 'Elegí una placa o canto listo para diseño del catálogo.' unless item && (MaterialPolicy.paintable?(item,directory:@directory) || allow_source && MaterialPolicy.photo_source_ready?(item,directory:@directory)) && %w[sheet edge].include?(item['kind'])
      item
    end

    def observed(material)
      MaterialResolver.observe_binding(material)
    end

    def binding_issues(material, catalog, duplicates)
      observation = observed(material)
      return [observation['error']] if observation['status'] == 'invalid'
      binding = observation['binding']
      return [] unless binding
      issues = []
      item = catalog['items'].find { |row| row['id'] == binding['catalogId'] }
      issues << 'SKU ausente, pendiente o modificado: revisar vínculo.' unless item && MaterialPolicy.paintable?(item,directory:@directory) && item['kind'] == binding['kind'] && MaterialResolver.item_fingerprint(item) == binding['catalogFingerprint']
      issues << 'La textura de diseño no coincide con su foto y archivo guardados.' if item && MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory)
      issues << 'UUID duplicado: volver a vincular explícitamente.' if duplicates.include?(binding['uuid'])
      issues
    end

    def duplicate_uuids
      materials.filter_map { |m| observed(m)['binding']&.fetch('uuid') }.tally.select { |_id, count| count > 1 }.keys
    end

    def usable_record(record, item)
      return false unless record && record['catalogFingerprint'] == MaterialResolver.item_fingerprint(item)
      path = File.join(@directory, 'material-assets', record['assetName'])
      File.file?(path) && !File.symlink?(path) && Digest::SHA256.file(path).hexdigest == record['assetHash']
    end

    def status
      catalog = @catalog.read
      index = assets
      duplicates = duplicate_uuids
      { 'catalogRevision' => catalog['revision'], 'assetRevision' => index['revision'],
        'materials' => materials.map do |material|
          color = material.respond_to?(:color) ? material.color : nil
          { 'id' => material_id(material), 'nativeId' => material_id(material), 'name' => material.name.to_s,
            'color' => color && color.respond_to?(:red) ? [color.red, color.green, color.blue] : nil,
            'hasTexture' => material.respond_to?(:texture) && !material.texture.nil?,
            'designReady' => catalog['items'].any? { |item| item['id']==observed(material).dig('binding','catalogId') && MaterialPolicy.paintable?(item,directory:@directory) },
            'supplierReady' => catalog['items'].any? { |item| item['id']==observed(material).dig('binding','catalogId') && item['approved']==true },
            'binding' => observed(material)['binding'], 'issues' => binding_issues(material, catalog, duplicates) }
        end,
        'visuals' => catalog['items'].select { |item| %w[sheet edge].include?(item['kind']) }.map do |item|
          record = index['records'].find { |r| r['catalogId'] == item['id'] }
          source_ready = MaterialPolicy.skm_source_ready?(item,directory:@directory)
          available = MaterialPolicy.paintable?(item,directory:@directory) && (usable_record(record, item) || source_ready)
          { 'catalogId' => item['id'], 'available' => available, 'assetHash' => record && record['assetHash'],
            'assetName' => record && record['assetName'], 'status' => available ? 'available' : 'needs_review',
            'designReady' => MaterialPolicy.paintable?(item,directory:@directory), 'supplierReady' => item['approved']==true, 'warnings' => MaterialPolicy.warnings(item) }
        end, 'issues' => [] }
    end

    def validate_request(data)
      raise ExportError, 'Confirmá el vínculo del material.' unless data.is_a?(Hash) && data['confirmed'] == true && data['revision'].is_a?(Integer)
      if data.key?('assetRevision') && !(data['assetRevision'].is_a?(Integer) && data['assetRevision'] >= 0)
        raise ExportError, 'La revisión de activos debe ser un entero no negativo.'
      end
      %w[replaceBinding replaceVisual].each do |key|
        raise ExportError, 'Confirmación inválida.' if data.key?(key) && ![true, false].include?(data[key])
      end
    end

    def locked(data)
      validate_request(data)
      FileUtils.mkdir_p(@directory)
      File.open(File.join(@directory, 'catalog.lock'), File::RDWR | File::CREAT, 0o600) do |catalog_lock|
        raise ExportError, 'La biblioteca está ocupada.' unless catalog_lock.flock(File::LOCK_EX | File::LOCK_NB)
        File.open(File.join(@directory, 'material-assets.lock'), File::RDWR | File::CREAT, 0o600) do |lock|
          raise ExportError, 'Otra ventana guarda los materiales.' unless lock.flock(File::LOCK_EX | File::LOCK_NB)
          catalog = @catalog.read
          raise ExportError, 'La biblioteca cambió; volvé a cargarla.' unless catalog['revision'] == data['revision']
          index = assets
          raise ExportError, 'Los activos cambiaron; volvé a cargar la biblioteca.' if data.key?('assetRevision') && data['assetRevision'] != index['revision']
          yield catalog, index
        ensure
          lock.flock(File::LOCK_UN) if lock
        end
      ensure
        catalog_lock.flock(File::LOCK_UN) if catalog_lock
      end
    end

    def write_index(index)
      bytes = JSON.pretty_generate(index)
      raise ExportError, 'Índice visual demasiado grande.' if bytes.bytesize > MAX_BYTES
      if File.file?(@path)
        backups = File.join(@directory, 'backups')
        FileUtils.mkdir_p(backups)
        File.open(File.join(backups, "material-assets-#{SecureRandom.hex(8)}.json"), File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write(File.binread(@path)); f.flush; f.fsync }
      end
      atomic_write(@path, bytes)
    end

    def atomic_write(path, bytes)
      Tempfile.create(['.materials-', '.json'], @directory) do |file|
        file.binmode; file.write(bytes); file.flush; file.fsync; file.close
        File.rename(file.path, path)
      end
    end

    def archive(material, item, index, replace)
      previous = index['records'].find { |row| row['catalogId'] == item['id'] }
      # Even a stale or missing visual belongs to an existing explicit choice.
      # Repairing/replacing it requires its own confirmation.
      return false if previous && !replace
      return false unless material.respond_to?(:save_as)
      directory = File.join(@directory, 'material-assets')
      FileUtils.mkdir_p(directory)
      temp = File.join(directory, ".pending-#{SecureRandom.hex(16)}.skm")
      begin
        result = material.save_as(temp)
        return false if result == false || !File.file?(temp) || File.zero?(temp)
        hash = Digest::SHA256.file(temp).hexdigest
        name = "#{hash}.skm"
        destination = File.join(directory, name)
        if File.exist?(destination)
          raise ExportError, 'El activo existente está dañado.' unless !File.symlink?(destination) && Digest::SHA256.file(destination).hexdigest == hash
        else
          File.rename(temp, destination)
        end
        index['records'].reject! { |row| row['catalogId'] == item['id'] }
        index['records'] << { 'catalogId' => item['id'], 'catalogFingerprint' => MaterialResolver.item_fingerprint(item),
                              'assetName' => name, 'assetHash' => hash, 'sourceName' => material.name.to_s[0, 512] }
        true
      ensure
        File.delete(temp) if File.file?(temp)
      end
    end

    # Index publication is rolled back if the model operation cannot commit.
    # Orphan content-addressed archives are harmless and never considered active.
    def mutate(index)
      previous = File.file?(@path) ? File.binread(@path) : nil
      started = false
      published = false
      begin
        raise ExportError, 'No se pudo iniciar la operación.' if @model.start_operation('Planos Santo — vincular material', true) == false
        started = true
        result, changed = yield
        if changed
          index['revision'] += 1
          write_index(index)
          published = true
        end
        raise ExportError, 'No se pudo confirmar la operación.' if @model.commit_operation == false
        started = false
        result
      rescue Exception
        @model.abort_operation if started
        if published
          previous ? atomic_write(@path, previous) : File.delete(@path)
        end
        raise
      end
    end

    def bind(data)
      result = locked(data) do |catalog, index|
        repair=data['replaceBinding']==true && data['replaceVisual']==true
        item = current_item(catalog, data['catalogId'],allow_source:repair)
        material = materials.find { |m| material_id(m) == data['materialId'].to_s }
        raise ExportError, 'El material elegido ya no existe en el modelo.' unless material
        raise ExportError, 'Para vincular esta foto, cargá su material visual guardado.' if MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory,allow_stale_index:repair)
        observation = observed(material)
        old = observation['binding']
        conflict = observation['status'] == 'invalid' || (old && (old['catalogId'] != item['id'] || old['catalogFingerprint'] != MaterialResolver.item_fingerprint(item) || duplicate_uuids.include?(old['uuid'])))
        raise ExportError, 'El material tiene un vínculo diferente o inválido; confirmá reemplazarlo.' if conflict && data['replaceBinding'] != true
        mutate(index) do
          binding = MaterialResolver.binding_for(item, old && !conflict ? old['uuid'] : SecureRandom.uuid)
          material.set_attribute(MaterialResolver::DICT, MaterialResolver::KEY, JSON.generate(binding))
          changed = archive(material, item, index, data['replaceVisual'] == true)
          raise ExportError, 'No se pudo guardar el SKM de diseño actualizado; no se reparó el vínculo.' if repair && MaterialPolicy.photo?(item) && !changed
          [{ 'materialId' => material_id(material), 'binding' => binding }, changed]
        end
      end
      status.merge(result)
    end

    # Photo creation coordinates the native operation and both external indexes.
    # Caller MUST hold #locked, which owns catalog.lock and material-assets.lock.
    def publish_catalog_locked(catalog, revision)
      raise ExportError, 'Revisión de catálogo inválida.' unless revision.is_a?(Integer) && catalog['revision']==revision
      catalog['revision']=revision+1
      @catalog.validate(catalog)
      bytes=JSON.pretty_generate(catalog)
      raise ExportError, 'La biblioteca supera 8 MiB.' if bytes.bytesize>CatalogStore::MAX_BYTES
      path=File.join(@directory,'catalog.json')
      if File.file?(path)
        folder=File.join(@directory,'backups');FileUtils.mkdir_p(folder)
        target=File.join(folder,"catalog-#{revision}-#{SecureRandom.hex(8)}.json")
        File.open(target,File::WRONLY|File::CREAT|File::EXCL,0o600) { |file| file.binmode;file.write(File.binread(path));file.flush;file.fsync }
      end
      atomic_write(path,bytes)
      catalog
    end

    def install(data, path: nil)
      result = locked(data) do |catalog, index|
        repair=data['replaceVisual']==true
        item = current_item(catalog, data['catalogId'],allow_source:repair)
        existing = materials.select { |m| observed(m).dig('binding', 'catalogId') == item['id'] }
        unless existing.empty?
          valid = existing.select { |m| binding_issues(m, catalog, duplicate_uuids).empty? }
          raise ExportError, 'Hay vínculos existentes en conflicto; revisalos antes de importar.' if valid.length != 1 || existing.length != 1
          next { 'materialId' => material_id(valid.first), 'binding' => observed(valid.first)['binding'] }
        end
        record = index['records'].find { |row| row['catalogId'] == item['id'] }
        if path.nil?
          if MaterialPolicy.skm_source_ready?(item,directory:@directory) && !usable_record(record, item)
            path=File.join(@directory,'skm-import-assets',"#{item['observed']['skm']['sha256']}.skm")
          elsif repair && MaterialPolicy.photo?(item) && MaterialPolicy.photo_source_ready?(item,directory:@directory)
            path=File.join(@directory,'material-assets',"#{item['observed']['photo']['skmHash']}.skm")
          else
            raise ExportError, 'No hay un activo visual verificado. Vinculá un material real o elegí un .skm.' unless usable_record(record, item)
            path = File.join(@directory, 'material-assets', record['assetName'])
          end
        end
        raise ExportError, 'Elegí un archivo .skm existente.' unless path.is_a?(String) && File.extname(path).downcase == '.skm' && File.file?(path) && !File.symlink?(path)
        raise ExportError, 'Esta versión no permite importar materiales .skm.' unless @model.materials.respond_to?(:load)
        mutate(index) do
          before = materials
          material = @model.materials.load(path)
          raise ExportError, 'SketchUp no pudo cargar el material .skm.' unless material
          raise ExportError, 'El SKM de diseño no coincide con la foto guardada.' if MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory,allow_stale_index:repair)
          raise ExportError, 'SketchUp devolvió un material existente: vinculalo explícitamente.' if before.include?(material)
          binding = MaterialResolver.binding_for(item)
          material.set_attribute(MaterialResolver::DICT, MaterialResolver::KEY, JSON.generate(binding))
          changed = archive(material, item, index, data['replaceVisual'] == true)
          raise ExportError, 'No se pudo guardar el SKM de diseño actualizado; no se reparó el vínculo.' if repair && MaterialPolicy.photo?(item) && !changed
          [{ 'materialId' => material_id(material), 'binding' => binding }, changed]
        end
      end
      status.merge(result)
    end
  end
end
