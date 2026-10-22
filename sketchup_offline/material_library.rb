# frozen_string_literal: true
require_relative 'catalog_store'
require_relative 'material_resolver'
require_relative 'material_policy'
require_relative 'ocl_attributes'

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

    # install: needs a verified visual in the library. bind: an existing model
    # material IS the visual, so any sheet/edge item may be associated (photo
    # items still require their proof, checked by the caller).
    def current_item(catalog, id, allow_source: false, for_bind: false)
      item = catalog['items'].find { |row| row['id'] == id }
      raise ExportError, 'La ficha ya no existe en la biblioteca.' unless item
      raise ExportError, "«#{item['name']}» no está clasificada como placa ni canto. Clasificala en la biblioteca." unless %w[sheet edge].include?(item['kind'])
      return item if for_bind
      raise ExportError, 'Elegí una placa o canto listo para diseño del catálogo.' unless MaterialPolicy.paintable?(item,directory:@directory) || allow_source && MaterialPolicy.photo_source_ready?(item,directory:@directory)
      item
    end

    def observed(material)
      MaterialResolver.observe_binding(material)
    end

    # Design issues only: these block painting. Commercial differences are
    # reported separately by #commercial_issues and never block painting.
    def binding_issues(material, catalog, duplicates)
      observation = observed(material)
      return [observation['error']] if observation['status'] == 'invalid'
      binding = observation['binding']
      return [] unless binding
      issues = []
      item = catalog['items'].find { |row| row['id'] == binding['catalogId'] }
      if !item
        issues << 'Vínculo con una ficha que ya no existe en la biblioteca.'
      elsif item['kind'] != binding['kind']
        issues << "La ficha cambió de tipo (#{binding['kind']} → #{item['kind']}): volvé a vincular el material."
      elsif MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory,require_source:false)
        issues << 'La textura de este material no coincide con su foto (imagen o escala cambiadas en SketchUp).'
      end
      issues << 'UUID duplicado: volver a vincular explícitamente.' if duplicates.include?(binding['uuid'])
      issues
    end

    def commercial_issues(material, catalog)
      binding = observed(material)['binding']
      return [] unless binding
      item = catalog['items'].find { |row| row['id'] == binding['catalogId'] }
      return [] unless item && item['kind'] == binding['kind']
      return [] if MaterialResolver.item_fingerprint(item) == binding['catalogFingerprint']
      ['Datos comerciales modificados desde la vinculación: revisá la ficha antes de pedir a la maderera.']
    end

    def duplicate_uuids
      materials.filter_map { |m| observed(m)['binding']&.fetch('uuid') }.tally.select { |_id, count| count > 1 }.keys
    end

    # The archived visual is content-addressed; commercial edits never stale it.
    def usable_record(record, item)
      return false unless record && item && record['catalogId'] == item['id']
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
            'designReady' => !observed(material)['binding'].nil? && binding_issues(material, catalog, duplicates).empty?,
            'supplierReady' => catalog['items'].any? { |item| item['id']==observed(material).dig('binding','catalogId') && item['approved']==true },
            'binding' => observed(material)['binding'], 'issues' => binding_issues(material, catalog, duplicates),
            'commercialIssues' => commercial_issues(material, catalog) }
        end,
        'visuals' => catalog['items'].select { |item| %w[sheet edge].include?(item['kind']) }.map do |item|
          record = index['records'].find { |r| r['catalogId'] == item['id'] }
          available = MaterialPolicy.paintable?(item,directory:@directory)
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
      rescue Exception => original
        rollback_confirmed=true
        if started
          begin
            # Boolean per the API; only an explicit false is a failed rollback
            # (validation 0.8.10). Callers that need proof still compare states.
            rollback_confirmed=@model.abort_operation!=false
          rescue StandardError
            rollback_confirmed=false
          end
        end
        if published
          begin
            previous ? atomic_write(@path, previous) : File.delete(@path)
          rescue StandardError => restore_error
            warn("Planos Santo: no se pudo restaurar material-assets.json: #{restore_error.class}: #{restore_error.message}")
          end
        end
        unless rollback_confirmed
          raise ExportError,'SketchUp no confirmó la cancelación de la operación. El estado del modelo no está asegurado: no continúes pintando ni guardes sobre el original; recuperá una copia de seguridad.'
        end
        raise original
      end
    end

    def bind(data)
      result = locked(data) do |catalog, index|
        repair=data['replaceBinding']==true && data['replaceVisual']==true
        item = current_item(catalog, data['catalogId'],allow_source:repair,for_bind:true)
        material = materials.find { |m| material_id(m) == data['materialId'].to_s }
        raise ExportError, 'El material elegido ya no existe en el modelo.' unless material
        raise ExportError, 'Para vincular esta foto, cargá su material visual guardado.' if MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory,allow_stale_index:repair)
        observation = observed(material)
        old = observation['binding']
        # Re-binding the same item only refreshes its commercial fingerprint.
        conflict = observation['status'] == 'invalid' || (old && (old['catalogId'] != item['id'] || old['kind'] != item['kind'] || duplicate_uuids.include?(old['uuid'])))
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

    # A native loader can return an unrelated material already in the model.
    # Identity detects this; a matching name is NEVER a visual/binding proof.
    class ExistingMaterialCollision < ExportError
      attr_reader :material,:original_states
      def initialize(material,original_states)
        @material=material;@original_states=original_states
        super('El cargador reutilizó un material existente.')
      end
    end

    def material_state(material)
      color=material.respond_to?(:color) && material.color
      texture=material.respond_to?(:texture) && material.texture
      attributes=if material.respond_to?(:attribute_dictionaries)
        dictionaries=material.attribute_dictionaries
        rows=[]
        if dictionaries
          dictionaries.each do |dictionary|
            pairs=[];dictionary.each_pair { |key,value| pairs << [key,value] }
            rows << [dictionary.name,pairs.sort_by { |key,_value| key.to_s }]
          end
        end
        rows.sort_by(&:first)
      elsif material.respond_to?(:attributes)
        material.attributes
      else
        []
      end
      JSON.generate([material.name.to_s,
        color && [color.red,color.green,color.blue,(color.alpha if color.respond_to?(:alpha))],
        (material.alpha if material.respond_to?(:alpha)),
        texture && %i[filename width height].map { |key| texture.public_send(key).to_s if texture.respond_to?(key) },attributes])
    end

    def independent_name(label,reserved=[])
      names=materials.map { |material| material.name.to_s }+reserved
      return label unless label.empty? || names.any? { |name| name.casecmp?(label) }
      loop do
        candidate="#{label.empty? ? 'Material' : label} · Planos Santo #{SecureRandom.hex(8)}"
        return candidate unless names.include?(candidate)
      end
    end

    def ensure_protected_states!(states)
      return unless states
      unless states.all? { |original,state| materials.include?(original) && material_state(original)==state }
        raise ExportError,'La importación cambió un material previo; se revirtió la operación completa.'
      end
    end

    def ensure_rollback_states!(states)
      current=materials
      restored=states && current.length==states.length && states.all? { |original,state| current.include?(original) && material_state(original)==state }
      return if restored
      raise ExportError,'SketchUp no restauró el estado verificable de los materiales. No se reintentó la importación: no continúes pintando ni guardes sobre el original; recuperá una copia de seguridad.'
    end

    # Must run inside #mutate. On a collision the FIRST operation has already
    # been aborted (a load may have touched the returned object). Temporarily
    # moving that object's name out of the way lets SketchUp import the original
    # SKM without editing its XML, texture bytes, PBR data or attributes. The new
    # material is renamed before restoring the old name. Every original's final
    # state must match before metadata is assigned or the operation can commit.
    def install_visual(item,index,path,repair,collision:nil)
      before=materials
      protected_states=before.map { |material| [material,material_state(material)] }
      if collision
        raise ExportError,'No se pudo importar una copia independiente del material. No se modificó el modelo.' unless before.include?(collision) && collision.respond_to?(:name=)
        original_name=collision.name.to_s
        reserved=before.map { |material| material.name.to_s }
        temporary_name=independent_name('Planos Santo '+SecureRandom.hex(16),reserved)
        collision.name=temporary_name
        raise ExportError,'No se pudo aislar el nombre de importación. No se modificó el modelo.' unless collision.name.to_s==temporary_name
      end
      material=@model.materials.load(path)
      raise ExportError,'SketchUp no pudo cargar el material .skm.' unless material
      raise ExistingMaterialCollision.new(material,protected_states) if before.include?(material)
      if collision
        raise ExportError,'SketchUp no permite asignar un nombre a la copia importada. No se modificó el modelo.' unless material.respond_to?(:name=)
        material.name=independent_name(item['name'].to_s,reserved)
        collision.name=original_name
        ensure_protected_states!(protected_states)
      end
      raise ExportError,'El SKM de diseño no coincide con la foto guardada.' if MaterialPolicy.photo?(item) && !MaterialPolicy.native_valid?(item,material,directory:@directory,allow_stale_index:repair)
      binding=MaterialResolver.binding_for(item)
      material.set_attribute(MaterialResolver::DICT,MaterialResolver::KEY,JSON.generate(binding))
      ocl=OclAttributes.write_missing(material,item)
      changed=archive(material,item,index,repair)
      raise ExportError,'No se pudo guardar el SKM de diseño actualizado; no se reparó el vínculo.' if repair && MaterialPolicy.photo?(item) && !changed
      ensure_protected_states!(protected_states)
      result={'materialId'=>material_id(material),'binding'=>binding,'opencutlist'=>ocl}
      result['collisionIsolated']=true if collision
      [result,changed]
    end

    def restore_name!(material,name)
      material.name=name if material.respond_to?(:valid?) ? material.valid? && material.name.to_s!=name : material.name.to_s!=name
    rescue StandardError => restore_error
      warn("Planos Santo: no se pudo restaurar el nombre del material #{name.inspect}: #{restore_error.class}")
    end

    # with_status:false returns only the installed binding (no full library
    # re-listing after the operation committed; used by PaintMaterials).
    def install(data, path: nil, with_status: true)
      result = locked(data) do |catalog, index|
        repair=data['replaceVisual']==true
        # An explicit .skm chosen by the operator IS the visual: any sheet/edge item.
        item = current_item(catalog, data['catalogId'],allow_source:repair,for_bind:!path.nil?)
        existing = materials.select { |m| observed(m).dig('binding', 'catalogId') == item['id'] }
        unless existing.empty?
          valid = existing.select { |m| binding_issues(m, catalog, duplicate_uuids).empty? }
          raise ExportError, 'Hay vínculos existentes en conflicto; revisalos antes de importar.' if valid.length != 1 || existing.length != 1
          next { 'materialId' => material_id(valid.first), 'binding' => observed(valid.first)['binding'] }
        end
        if path.nil?
          asset = MaterialPolicy.design_asset(item,directory:@directory)
          case asset['status']
          when 'ok' then path = asset['path']
          when 'corrupt' then raise ExportError, "El archivo de textura de «#{item['name']}» fue alterado o está dañado (no coincide su huella). Restaurá la copia de seguridad de la biblioteca o volvé a cargar la foto."
          when 'missing' then raise ExportError, "Falta el archivo de textura de «#{item['name']}» en la biblioteca local. Restaurá la copia de seguridad o volvé a cargar la foto."
          else raise ExportError, "«#{item['name']}» no tiene imagen, textura ni color. Asignale una foto o un color para poder pintar."
          end
        end
        raise ExportError, 'Elegí un archivo .skm existente.' unless path.is_a?(String) && File.extname(path).downcase == '.skm' && File.file?(path) && !File.symlink?(path)
        raise ExportError, 'Esta versión no permite importar materiales .skm.' unless @model.materials.respond_to?(:load)
        begin
          mutate(index) { install_visual(item,index,path,repair) }
        rescue ExistingMaterialCollision => error
          ensure_rollback_states!(error.original_states)
          # Retry only once, from the rolled-back state. If the native loader
          # still reuses any prior object (e.g. GUID deduplication), abort safely.
          original_name=error.material.name.to_s
          begin
            mutate(index) { install_visual(item,index,path,repair,collision:error.material) }
          rescue ExistingMaterialCollision => retry_error
            restore_name!(error.material,original_name)
            ensure_rollback_states!(retry_error.original_states)
            raise ExportError,'SketchUp no pudo crear una copia independiente de este SKM. No se vinculó ningún material existente ni se modificó el modelo.'
          rescue StandardError
            # The API does not promise that abort reverts Material#name=: never
            # leave the operator's material under the temporary import name.
            restore_name!(error.material,original_name)
            raise
          end
        end
      end
      with_status ? status.merge(result) : result
    end

    # --- Hito 7: duplicate and archive (MATERIALES-08/09) ---------------------
    # Archive state lives in its own index: catalog.json keeps schema 1 untouched.
    STATES_MAX=1024*1024
    def states_path;File.join(@directory,'material-states.json');end

    def states
      return {'schema'=>1,'revision'=>0,'records'=>[]} unless File.exist?(states_path) || File.symlink?(states_path)
      raise ExportError,'El índice de fichas archivadas no puede ser un enlace.' if File.symlink?(states_path)
      raise ExportError,'Índice de fichas archivadas demasiado grande.' if File.size(states_path)>STATES_MAX
      data=JSON.parse(File.binread(states_path))
      valid=data.is_a?(Hash) && data.keys.sort==%w[records revision schema] && data['schema']==1 && data['revision'].is_a?(Integer) && data['revision']>=0 && data['records'].is_a?(Array) && data['records'].length<=5000
      ids={}
      valid&&=data['records'].all? do |row|
        ok=row.is_a?(Hash) && row.keys.sort==%w[archived archivedAt catalogId] && row['catalogId'].is_a?(String) && MaterialResolver::UUID.match?(row['catalogId']) &&
          !ids.key?(row['catalogId']) && row['archived']==true && row['archivedAt'].is_a?(String) && row['archivedAt'].length<=40
        ids[row['catalogId']]=true if ok
        ok
      end
      raise ExportError,'Índice de fichas archivadas inválido; no se sobrescribió.' unless valid
      data
    rescue JSON::ParserError
      raise ExportError,'Índice de fichas archivadas dañado; restaurá su copia de seguridad.'
    end

    def archived_ids;states['records'].map { |row| row['catalogId'] };end

    def extras
      existing=@catalog.read['items'].map { |item| item['id'] }
      data=states
      {'archivedIds'=>data['records'].map { |row| row['catalogId'] } & existing,'statesRevision'=>data['revision']}
    end

    def write_states(data)
      bytes=JSON.pretty_generate(data)
      raise ExportError,'Índice de fichas archivadas demasiado grande.' if bytes.bytesize>STATES_MAX
      if File.file?(states_path)
        backups=File.join(@directory,'backups');FileUtils.mkdir_p(backups)
        File.open(File.join(backups,"material-states-#{SecureRandom.hex(8)}.json"),File::WRONLY|File::CREAT|File::EXCL,0o600) { |f| f.write(File.binread(states_path));f.flush;f.fsync }
      end
      atomic_write(states_path,bytes)
    end

    def normalized_name(value);value.to_s.unicode_normalize(:nfc).strip.downcase;end

    def copy_name(base,catalog)
      used=catalog['items'].map { |item| normalized_name(item['name']) }
      (1..999).each do |number|
        suffix=number==1 ? ' (copia)' : " (copia #{number})"
        candidate=base.to_s[0,160-suffix.length].rstrip+suffix
        return candidate unless used.include?(normalized_name(candidate))
      end
      raise ExportError,'No se encontró un nombre libre para la copia; escribí uno.'
    end

    # The copy shares the content-addressed visual (photo/SKM/archived SKM): no
    # file is duplicated. It always needs its own supplier approval.
    def duplicate(data)
      raise ExportError,'Confirmá duplicar la ficha.' unless data.is_a?(Hash) && data['confirmed']==true
      raise ExportError,'Nombre de copia inválido.' if data.key?('name') && !data['name'].nil? && !data['name'].is_a?(String)
      locked(data) do |catalog,index|
        source=catalog['items'].find { |item| item['id']==data['catalogId'] }
        raise ExportError,'La ficha ya no existe en la biblioteca.' unless source
        name=data['name'].nil? ? copy_name(source['name'],catalog) : @catalog.text(data['name'])
        raise ExportError,'Escribí un nombre para la copia.' if name.empty?
        raise ExportError,'Ya existe una ficha con ese nombre; elegí otro.' if catalog['items'].any? { |item| normalized_name(item['name'])==normalized_name(name) }
        copy=JSON.parse(JSON.generate(source))
        copy['id']=SecureRandom.uuid while copy['id']==source['id'] || catalog['items'].any? { |item| item['id']==copy['id'] }
        copy.merge!('name'=>name,'approved'=>false,'favorite'=>false,'updatedAt'=>Time.now.utc.iso8601)
        copy['observed']=copy['observed'].merge('duplicatedFrom'=>source['id'])
        copy['sourceHash']=Digest::SHA256.hexdigest(JSON.generate(@catalog.canonical({'name'=>copy['name'],'kind'=>copy['kind'],'observed'=>copy['observed']})))
        catalog['items'] << copy
        @catalog.validate(catalog)
        record=index['records'].find { |row| row['catalogId']==source['id'] }
        previous_index=File.file?(@path) ? File.binread(@path) : nil
        if record
          index['records'] << record.merge('catalogId'=>copy['id'],'catalogFingerprint'=>MaterialResolver.item_fingerprint(copy))
          index['revision']+=1
          write_index(index)
        end
        begin
          publish_catalog_locked(catalog,data['revision'])
        rescue StandardError
          (previous_index ? atomic_write(@path,previous_index) : File.delete(@path)) if record
          raise
        end
        warnings=['La copia queda pendiente de aprobación para maderera: revisá su ficha antes de pedir.']
        warnings << 'Comparte la foto o el SKM de la ficha original; no se duplicaron archivos.' if MaterialPolicy.photo?(copy) || MaterialPolicy.skm_import?(copy) || record
        {'catalog'=>catalog,'catalogId'=>copy['id'],'duplicatedFrom'=>source['id'],'name'=>copy['name'],'warnings'=>warnings}
      end
    end

    def archive_rows(catalog,ids)
      bound=materials.map { |material| observed(material).dig('binding','catalogId') }.compact.tally
      archived=archived_ids
      ids.map do |id|
        item=catalog['items'].find { |row| row['id']==id }
        in_model=bound.fetch(id,0)
        compatible=catalog['items'].count { |row| row['id']!=id && !archived.include?(row['id']) && row['compatibleIds'].include?(id) }
        warnings=[]
        warnings << "Está cargado en este modelo (#{in_model}). Archivar no lo quita del modelo ni despinta piezas." if in_model>0
        warnings << "Es canto compatible de #{compatible} #{compatible==1 ? 'placa activa' : 'placas activas'}; el vínculo se conserva." if compatible>0
        warnings << 'Tiene cantos compatibles; el vínculo se conserva para cuando la restaures.' if !item['compatibleIds'].empty?
        {'catalogId'=>id,'name'=>item['name'],'inModel'=>in_model,'compatibleWith'=>compatible,'warnings'=>warnings}
      end
    end

    # Archiving hides an item from daily lists; it never deletes the record,
    # its private files or compatibleIds, so restoring is lossless.
    def archive_items(data)
      ids=data.is_a?(Hash) ? data['catalogIds'] : nil
      raise ExportError,'Elegí una o más fichas para archivar o restaurar.' unless ids.is_a?(Array) && ids.length.between?(1,5000) && ids.uniq==ids && ids.all? { |id| id.is_a?(String) }
      raise ExportError,'Indicá si archivar o restaurar.' unless [true,false].include?(data['archived'])
      raise ExportError,'Vista previa inválida.' if data.key?('dryRun') && ![true,false].include?(data['dryRun'])
      catalog=@catalog.read
      missing=ids.reject { |id| catalog['items'].any? { |item| item['id']==id } }
      raise ExportError,'Alguna ficha ya no existe en la biblioteca; volvé a cargarla.' unless missing.empty?
      if data['dryRun']==true
        raise ExportError,'La biblioteca cambió; volvé a cargarla.' unless data['revision']==catalog['revision']
        current=archived_ids
        changed=ids.count { |id| current.include?(id)!=data['archived'] }
        return {'archivedIds'=>current,'changed'=>changed,'rows'=>archive_rows(catalog,ids),'noChanges'=>true,'dryRun'=>true}
      end
      locked(data) do |locked_catalog,_index|
        current=states
        rows=archive_rows(locked_catalog,ids)
        before=current['records'].map { |row| row['catalogId'] }
        if data['archived']
          now=Time.now.utc.iso8601
          ids.each { |id| current['records'] << {'catalogId'=>id,'archived'=>true,'archivedAt'=>now} unless before.include?(id) }
        else
          current['records'].reject! { |row| ids.include?(row['catalogId']) }
        end
        after=current['records'].map { |row| row['catalogId'] }
        changed=(before-after).length+(after-before).length
        if changed.zero?
          next {'archivedIds'=>after,'changed'=>0,'rows'=>rows,'noChanges'=>true}
        end
        current['revision']+=1
        write_states(current)
        {'archivedIds'=>after,'changed'=>changed,'rows'=>rows}
      end
    end
  end
end
