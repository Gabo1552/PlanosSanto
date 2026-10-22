# frozen_string_literal: true
require_relative 'catalog_store'
require_relative 'material_resolver'
require_relative 'material_policy'
require_relative 'ocl_attributes'
require_relative 'bounded_zip'
require_relative 'skm_import'

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
    # --- Hito 7: OpenCutList sync (MATERIALES-13) -----------------------------
    def ocl_sync(data)
      raise ExportError,'Solicitud de sincronización inválida.' unless data.is_a?(Hash) && [true,false].include?(data.fetch('dryRun',false))
      dry_run=data.fetch('dryRun',false)
      raise ExportError,'Confirmá la sincronización con OpenCutList.' unless dry_run || data['confirmed']==true
      catalog=@catalog.read
      wanted=data['catalogId']
      raise ExportError,'La ficha ya no existe en la biblioteca.' if wanted && !catalog['items'].any? { |item| item['id']==wanted }
      duplicates=duplicate_uuids
      targets=materials.filter_map do |material|
        binding=observed(material)['binding']
        next unless binding && (wanted.nil? || binding['catalogId']==wanted)
        item=catalog['items'].find { |row| row['id']==binding['catalogId'] }
        next unless item && item['kind']==binding['kind'] && binding_issues(material,catalog,duplicates).empty?
        [material,item]
      end
      raise ExportError,'Esta ficha no tiene materiales vinculados en el modelo.' if wanted && targets.empty?
      rows=targets.map do |material,item|
        plan=OclAttributes.plan(material,item)
        {'materialId'=>material_id(material),'name'=>material.name.to_s,'catalogId'=>item['id']}.merge(plan)
      end
      return {'dryRun'=>true,'changed'=>rows.count { |row| !row['changes'].empty? },'materials'=>rows,'noChanges'=>true} if dry_run
      changing=targets.zip(rows).select { |_pair,row| !row['changes'].empty? || !row['kept'].empty? }
      return {'dryRun'=>false,'changed'=>0,'materials'=>rows,'noChanges'=>true} if changing.none? { |_pair,row| !row['changes'].empty? }
      raise ExportError,'No se pudo iniciar la operación.' if @model.start_operation('Planos Santo — sincronizar OpenCutList',true)==false
      begin
        changed=changing.count { |(material,_item),row| OclAttributes.apply(material,row) }
        raise ExportError,'No se pudo confirmar la sincronización.' if @model.commit_operation==false
      rescue Exception
        @model.abort_operation
        raise
      end
      {'dryRun'=>false,'changed'=>changed,'materials'=>rows}
    end
  end

  # MATERIALES-07: portable library package (.zip) with item records, the
  # content-addressed SKM/photo/thumbnail files and their SHA-256. Import is
  # preview → explicit commit, never touches the model and never overwrites:
  # every entry must be allowlisted, listed in the manifest and match its hash.
  class MaterialPackage
    FORMAT='planos-santo.material-package'
    MAX_PACKAGE=128*1024*1024
    MAX_ENTRIES=2048
    MAX_MANIFEST=8*1024*1024
    MAX_FILE=16*1024*1024
    MAX_OBSERVED=16*1024
    MAX_COMPATIBLE=200
    MAX_COMPATIBLE_TOTAL=2000
    MAX_NODES=200_000
    FOLDERS={'photo-assets'=>/\A[0-9a-f]{64}\.(?:png|jpg|jpeg)\z/,'material-assets'=>/\A[0-9a-f]{64}\.skm\z/,'skm-import-assets'=>/\A[0-9a-f]{64}\.skm\z/}.freeze
    MANIFEST_KEYS=%w[createdAt files format items schema visualRecords].freeze
    RECORD_KEYS=%w[assetHash assetName catalogFingerprint catalogId sourceName].freeze
    COMPARED=%w[name kind sku supplier thicknessMm widthMm lengthMm grain price].freeze
    def initialize(library:,catalog:,directory:)
      @library=library;@catalog=catalog;@directory=directory;@pending=nil
    end

    def self.path_allowed?(path)
      folder,name,extra=path.to_s.split('/',3)
      extra.nil? && FOLDERS.key?(folder) && FOLDERS[folder].match?(name.to_s)
    end

    # [folder, name, hash] for every private file an item's visual depends on.
    def references(item,records)
      refs=[]
      photo=MaterialPolicy.photo(item)
      if photo
        refs << ['photo-assets',photo['imageAsset'],photo['sourceHash']]
        refs << ['photo-assets',photo['thumbnailAsset'],photo['thumbnailAsset'].to_s.split('.').first]
        refs << ['material-assets',"#{photo['skmHash']}.skm",photo['skmHash']]
      end
      skm=MaterialPolicy.skm_import?(item) && item['observed']['skm']
      refs << ['skm-import-assets',"#{skm['sha256']}.skm",skm['sha256']] if skm.is_a?(Hash)
      record=records.find { |row| row['catalogId']==item['id'] }
      refs << ['material-assets',record['assetName'],record['assetHash']] if record
      refs.select { |folder,name,hash| name.is_a?(String) && hash.is_a?(String) && path_allowed_ref?(folder,name,hash) }.uniq
    end

    def path_allowed_ref?(folder,name,hash)
      self.class.path_allowed?("#{folder}/#{name}") && name.split('.').first==hash
    end

    def export(target,catalog_ids:nil,include_archived:false)
      raise ExportError,'Elegí un archivo .zip para el paquete.' unless target.is_a?(String) && File.extname(target).downcase=='.zip'
      raise ExportError,'Ese archivo ya existe; no se sobrescribió.' if File.exist?(target) || File.symlink?(target)
      catalog=@catalog.read
      archived=@library.archived_ids
      items=if catalog_ids.nil?
        catalog['items'].reject { |item| !include_archived && archived.include?(item['id']) }
      else
        raise ExportError,'Selección de fichas inválida.' unless catalog_ids.is_a?(Array) && catalog_ids.uniq==catalog_ids && catalog_ids.all? { |id| catalog['items'].any? { |item| item['id']==id } }
        catalog['items'].select { |item| catalog_ids.include?(item['id']) }
      end
      raise ExportError,'No hay fichas para exportar.' if items.empty?
      ids=items.map { |item| item['id'] }
      items=items.map { |item| JSON.parse(JSON.generate(item)).tap { |copy| copy['compatibleIds']&=ids } }
      records=@library.assets['records'].select { |row| ids.include?(row['catalogId']) }
      files={};warnings=[];planned=0
      items.each do |item|
        references(item,records).each do |folder,name,_hash|
          path=File.join(@directory,folder,name)
          planned+=File.size(path) if File.file?(path) && !File.symlink?(path)
        end
      end
      raise ExportError,'El paquete superaría 128 MiB; exportá menos fichas por vez.' if planned>MAX_PACKAGE
      items.each do |item|
        references(item,records).each do |folder,name,hash|
          path="#{folder}/#{name}"
          next if files.key?(path)
          if MaterialPolicy.file_matches?(@directory,folder,name,hash)
            bytes=File.binread(File.join(@directory,folder,name),MAX_FILE+1)
            raise ExportError,"Un archivo de «#{item['name']}» supera el límite del paquete." if bytes.bytesize>MAX_FILE
            raise ExportError,"El archivo de «#{item['name']}» cambió durante la exportación." unless Digest::SHA256.hexdigest(bytes)==hash
            files[path]=bytes
          else
            warnings << "«#{item['name']}»: falta o está dañado un archivo visual; se exportó la ficha sin él."
          end
        end
      end
      manifest={'format'=>FORMAT,'schema'=>1,'createdAt'=>Time.now.utc.iso8601,'items'=>items,
                'visualRecords'=>records.select { |row| files.key?("material-assets/#{row['assetName']}") },
                'files'=>files.map { |path,bytes| {'path'=>path,'sha256'=>Digest::SHA256.hexdigest(bytes),'bytes'=>bytes.bytesize} }}
      json=JSON.pretty_generate(manifest)
      raise ExportError,'El manifiesto del paquete es demasiado grande; exportá menos fichas.' if json.bytesize>MAX_MANIFEST
      bytes=BoundedZip.build([['manifest.json',json,true]]+files.map { |path,data| [path,data,false] },max_bytes:MAX_PACKAGE,max_entries:MAX_ENTRIES)
      created=false
      begin
        File.open(target,File::WRONLY|File::CREAT|File::EXCL,0o600) { |file| created=true;file.binmode;file.write(bytes);file.flush;file.fsync }
      rescue Errno::EEXIST
        raise ExportError,'Ese archivo ya existe; no se sobrescribió.'
      rescue StandardError
        File.delete(target) if created && File.file?(target) && !File.symlink?(target)
        raise
      end
      {'fileName'=>File.basename(target),'items'=>items.length,'files'=>files.length,'bytes'=>bytes.bytesize,'sha256'=>Digest::SHA256.hexdigest(bytes),'warnings'=>warnings.uniq}
    end

    def reject!(detail);raise ExportError,"Paquete de materiales inválido: #{detail} La biblioteca no cambió.";end

    def read_package(path)
      raise ExportError,'Elegí un paquete .zip local; no enlaces simbólicos.' unless path.is_a?(String) && File.extname(path).downcase=='.zip' && File.file?(path) && !File.symlink?(path)
      size=File.size(path);raise ExportError,'El paquete supera 128 MiB.' if size>MAX_PACKAGE
      bytes=File.binread(path,MAX_PACKAGE+1);raise ExportError,'El paquete cambió mientras se leía.' if bytes.bytesize!=size
      zip=BoundedZip.new(bytes,max_bytes:MAX_PACKAGE,max_entries:MAX_ENTRIES,max_total:160*1024*1024,max_entry:MAX_FILE)
      names=zip.entries.map(&:name)
      bad=names.reject { |name| name=='manifest.json' || self.class.path_allowed?(name) }
      reject!("contiene rutas no permitidas (#{bad.first(3).join(', ')}).") unless bad.empty?
      manifest_entry=zip.entries.find { |entry| entry.name=='manifest.json' }
      reject!('falta manifest.json.') unless manifest_entry
      reject!('el manifiesto es demasiado grande.') if manifest_entry.size>MAX_MANIFEST
      text=zip.read(manifest_entry).force_encoding(Encoding::UTF_8)
      reject!('el manifiesto no es UTF-8.') unless text.valid_encoding?
      # Huge numerals cost seconds to parse and never appear in a real package.
      reject!('el manifiesto contiene números fuera de rango.') if text.match?(/\d{40,}/)
      manifest=begin
        JSON.parse(text,max_nesting:32)
      rescue JSON::ParserError,JSON::NestingError
        reject!('el manifiesto está dañado.')
      end
      reject!('el manifiesto contiene valores no permitidos.') unless plain_json?(manifest)
      reject!('formato o versión desconocidos.') unless manifest.is_a?(Hash) && manifest.keys.sort==MANIFEST_KEYS && manifest['format']==FORMAT && manifest['schema']==1 && manifest['createdAt'].is_a?(String) && manifest['createdAt'].length<=40
      %w[items files visualRecords].each { |key| reject!("#{key} inválido.") unless manifest[key].is_a?(Array) && manifest[key].length<=5000 }
      rows=manifest['files']
      reject!('la lista de archivos no coincide con el contenido.') unless rows.all? { |row| row.is_a?(Hash) && row.keys.sort==%w[bytes path sha256] && row['path'].is_a?(String) } &&
        rows.map { |row| row['path'] }.sort==(names-['manifest.json']).sort
      files={}
      rows.each do |row|
        entry=zip.entries.find { |candidate| candidate.name==row['path'] }
        hash=File.basename(row['path']).split('.').first
        reject!("#{row['path']} no coincide con su huella.") unless row['sha256']==hash && row['bytes']==entry.size
        data=zip.read(entry)
        reject!("#{row['path']} no coincide con su huella.") unless Digest::SHA256.hexdigest(data)==hash
        check_file(row['path'],data)
        files[row['path']]=data
      end
      items=manifest['items']
      validate_items(items)
      records=manifest['visualRecords']
      reject!('registros visuales inválidos.') unless records.all? do |row|
        row.is_a?(Hash) && row.keys.sort==RECORD_KEYS && items.any? { |item| item['id']==row['catalogId'] } && row['assetName']=="#{row['assetHash']}.skm" &&
          files.key?("material-assets/#{row['assetName']}") && row['catalogFingerprint'].is_a?(String) && row['sourceName'].is_a?(String) && row['sourceName'].length<=512
      end && records.map { |row| row['catalogId'] }.uniq.length==records.length
      {'manifest'=>manifest,'files'=>files,'sha256'=>Digest::SHA256.hexdigest(bytes),'bytes'=>bytes.bytesize}
    end

    # Only finite numbers, strings, booleans, nil, arrays and string-keyed
    # objects, with a bounded node count (Infinity/NaN never reach JSON.generate).
    def plain_json?(value)
      stack=[value];nodes=0
      until stack.empty?
        node=stack.pop;nodes+=1
        return false if nodes>MAX_NODES
        case node
        when Hash then return false unless node.keys.all? { |key| key.is_a?(String) };stack.concat(node.values)
        when Array then stack.concat(node)
        when Float then return false unless node.finite?
        when String,Integer,true,false,nil then next
        else return false
        end
      end
      true
    end

    SKM_KEYS=%w[originalName sha256 sourceName suggestions].freeze
    # CatalogStore#validate leaves `observed` free-form and its compatibility
    # check is cubic: items from a foreign package get a strict, linear check
    # first so hostile metadata can never be persisted into catalog.json.
    def validate_items(items)
      ids={};kinds={};total=0
      items.each do |item|
        reject!('ficha con formato inválido.') unless item.is_a?(Hash) && item['id'].is_a?(String) && !ids.key?(item['id']) && item['compatibleIds'].is_a?(Array)
        ids[item['id']]=true;kinds[item['id']]=item['kind']
        reject!("«#{item['name']}» tiene demasiados cantos compatibles.") if item['compatibleIds'].length>MAX_COMPATIBLE
        total+=item['compatibleIds'].length
      end
      reject!('el paquete tiene demasiadas compatibilidades.') if total>MAX_COMPATIBLE_TOTAL
      items.each do |item|
        reject!('canto compatible inexistente o de otro tipo.') unless item['compatibleIds'].all? { |id| id.is_a?(String) && kinds[id]=='edge' }
        begin
          @catalog.validate({'schema'=>1,'revision'=>0,'items'=>[item.merge('compatibleIds'=>[])]})
        rescue ExportError => error
          reject!("fichas inválidas (#{error.message})")
        end
        observed=item['observed']
        reject!("«#{item['name']}» trae metadatos demasiado grandes.") if JSON.generate(observed).bytesize>MAX_OBSERVED
        reject!("«#{item['name']}» trae metadatos de foto inválidos.") if observed.key?('photo') && !MaterialPolicy.metadata_valid?(item)
        if observed['source']=='skm-import' || observed.key?('skm')
          skm=observed['skm']
          valid=skm.is_a?(Hash) && (skm.keys-SKM_KEYS).empty? && MaterialPolicy.skm_provenance_valid?(item) &&
            (skm['originalName'].nil? || skm['originalName'].is_a?(String) && skm['originalName'].length<=160) &&
            (skm['suggestions'].nil? || skm['suggestions'].is_a?(Hash))
          reject!("«#{item['name']}» trae un origen SKM inválido.") unless valid
        end
      end
    end

    # Defense in depth: content is never executed, but types must be what the
    # name claims (SKM = bounded ZIP with document.xml; images by signature).
    def check_file(path,data)
      if path.end_with?('.skm')
        archive=begin
          BoundedZip.new(data,max_bytes:SkmImport::MAX_SKM,max_entries:128,max_total:64*1024*1024,max_entry:32*1024*1024)
        rescue ExportError
          reject!("#{path} no es un SKM válido.")
        end
        reject!("#{path} no es un SKM válido.") unless archive.entries.any? { |entry| entry.name=='document.xml' }
      elsif path.end_with?('.png')
        reject!("#{path} no es una imagen PNG.") unless data.start_with?("\x89PNG\r\n\x1a\n".b)
      else
        reject!("#{path} no es una imagen JPG.") unless data.start_with?("\xff\xd8".b)
      end
    end

    def same_item?(existing,item)
      existing['sourceHash']==item['sourceHash'] && COMPARED.all? { |key| existing[key]==item[key] }
    end

    def thumbnail(item,files)
      photo=MaterialPolicy.photo(item)
      if photo
        bytes=files["photo-assets/#{photo['thumbnailAsset']}"]
        return bytes && bytes.bytesize<=SkmImport::MAX_PREVIEW ? SkmImport.new(catalog:@catalog,directory:@directory).thumbnail(bytes) : nil
      end
      skm=MaterialPolicy.skm_import?(item) && item['observed']['skm']
      bytes=skm.is_a?(Hash) && files["skm-import-assets/#{skm['sha256']}.skm"]
      return nil unless bytes
      zip=BoundedZip.new(bytes,max_bytes:SkmImport::MAX_SKM,max_entries:128,max_total:64*1024*1024,max_entry:32*1024*1024)
      image=zip.entries.find { |entry| %w[doc_thumbnail.png thumbnail.png doc_thumbnail.jpg thumbnail.jpg].include?(entry.name.downcase) && entry.size<=SkmImport::MAX_PREVIEW }
      image ? SkmImport.new(catalog:@catalog,directory:@directory).thumbnail(zip.read(image)) : nil
    rescue ExportError
      nil
    end

    def preview(path)
      @pending=nil
      package=read_package(path)
      manifest=package['manifest'];files=package['files']
      current=@catalog.read
      budget=SkmImport::THUMBNAIL_BUDGET
      names=manifest['items'].map { |item| @library.normalized_name(item['name']) }.tally
      existing_names=current['items'].to_h { |item| [@library.normalized_name(item['name']),true] }
      existing_by_hash=current['items'].group_by { |item| item['sourceHash'] }
      rows=manifest['items'].map do |item|
        refs=references(item,manifest['visualRecords'])
        present=refs.count { |folder,name,_hash| files.key?("#{folder}/#{name}") }
        warnings=['Se importa sin aprobar: revisá la ficha antes de pedir a maderera.']
        warnings << 'Faltan archivos visuales en el paquete; la ficha quedará para revisar.' if present<refs.length && refs.any? { |folder,name,hash| !files.key?("#{folder}/#{name}") && !MaterialPolicy.file_matches?(@directory,folder,name,hash) }
        warnings << 'La foto tiene metadatos inválidos; la ficha quedará para revisar.' if MaterialPolicy.photo?(item) && !MaterialPolicy.metadata_valid?(item)
        status=if existing_by_hash.fetch(item['sourceHash'],[]).any? { |existing| same_item?(existing,item) }
          'duplicate'
        elsif existing_names.key?(@library.normalized_name(item['name'])) || names[@library.normalized_name(item['name'])]>1
          'conflict'
        else
          'new'
        end
        thumb=thumbnail(item,files)
        thumb=nil if thumb && thumb.bytesize>budget
        budget-=thumb.bytesize if thumb
        {'id'=>SecureRandom.hex(16),'name'=>item['name'],'kind'=>item['kind'],'status'=>status,'thumbnail'=>thumb,'files'=>present,'warnings'=>warnings,'_item'=>item}
      end
      @pending={'token'=>SecureRandom.hex(24),'revision'=>current['revision'],'rows'=>rows,'files'=>files,'records'=>manifest['visualRecords']}
      {'token'=>@pending['token'],'revision'=>current['revision'],
       'package'=>{'items'=>rows.length,'files'=>files.length,'bytes'=>package['bytes'],'createdAt'=>manifest['createdAt'],'sha256'=>package['sha256']},
       'rows'=>rows.map { |row| row.reject { |key,_| key.start_with?('_') } }}
    end

    def cancel;@pending=nil;{'cancelled'=>true};end

    def store(folder,name,bytes,created)
      directory=File.join(@directory,folder)
      raise ExportError,'La biblioteca privada no puede usar enlaces simbólicos.' if File.symlink?(@directory) || File.symlink?(directory)
      FileUtils.mkdir_p(directory)
      target=File.join(directory,name)
      if File.exist?(target) || File.symlink?(target)
        raise ExportError,"El archivo existente #{folder}/#{name} está dañado; no se sobrescribió. Restaurá su copia de seguridad." unless File.file?(target) && !File.symlink?(target) && Digest::SHA256.file(target).hexdigest==name.split('.').first
        return
      end
      Tempfile.create(['.package-','.pending'],directory) do |file|
        file.binmode;file.write(bytes);file.flush;file.fsync;file.close;File.rename(file.path,target)
      end
      created << target
    end

    def commit(token,selected_ids,revision,confirmed:false,renames:{})
      raise ExportError,'Confirmá la importación después de revisar el paquete.' unless confirmed==true
      raise ExportError,'Vista previa vencida; volvé a elegir el paquete.' unless @pending && token==@pending['token'] && revision==@pending['revision']
      raise ExportError,'Selección de fichas inválida.' unless selected_ids.is_a?(Array) && selected_ids.uniq==selected_ids && selected_ids.all? { |id| id.is_a?(String) && @pending['rows'].any? { |row| row['id']==id } } && renames.is_a?(Hash)
      result=@library.locked('revision'=>revision,'confirmed'=>true) do |catalog,index|
        selected=@pending['rows'].select { |row| selected_ids.include?(row['id']) && row['status']!='duplicate' }
        used=catalog['items'].map { |item| @library.normalized_name(item['name']) }
        mapping={}
        candidates=selected.map do |row|
          name=@catalog.text(renames.key?(row['id']) ? renames[row['id']].to_s : row['name'])
          if name.empty? || (row['status']=='conflict' && (!renames.key?(row['id']) || @library.normalized_name(name)==@library.normalized_name(row['name']))) || used.include?(@library.normalized_name(name))
            raise ExportError,'Resolvé el nombre de cada ficha en conflicto; no se sobrescribió ninguna.'
          end
          used << @library.normalized_name(name)
          item=JSON.parse(JSON.generate(row['_item']))
          id=SecureRandom.uuid
          id=SecureRandom.uuid while catalog['items'].any? { |existing| existing['id']==id } || mapping.value?(id)
          mapping[item['id']]=id
          item.merge!('id'=>id,'name'=>name,'approved'=>false,'updatedAt'=>Time.now.utc.iso8601)
          [item,row]
        end
        candidates.each { |item,_row| item['compatibleIds']=item['compatibleIds'].filter_map { |old| mapping[old] } }
        next {'catalog'=>catalog,'imported'=>0,'skipped'=>selected_ids.length,'noChanges'=>true} if candidates.empty?
        catalog['items']+=candidates.map(&:first)
        @catalog.validate(catalog)
        created=[];index_path=File.join(@directory,'material-assets.json')
        previous_index=File.file?(index_path) ? File.binread(index_path) : nil
        added_records=false
        begin
          candidates.each do |item,row|
            references(row['_item'],@pending['records']).each do |folder,name,_hash|
              bytes=@pending['files']["#{folder}/#{name}"]
              store(folder,name,bytes,created) if bytes
            end
            record=@pending['records'].find { |candidate| candidate['catalogId']==row['_item']['id'] }
            next unless record
            index['records'] << record.merge('catalogId'=>item['id'],'catalogFingerprint'=>MaterialResolver.item_fingerprint(item))
            added_records=true
          end
          if added_records
            index['revision']+=1
            @library.write_index(index)
          end
          @library.publish_catalog_locked(catalog,revision)
        rescue Exception
          # Each cleanup step is independent: one failure never skips the rest
          # nor masks the original error.
          if added_records
            begin
              previous_index ? @library.atomic_write(index_path,previous_index) : (File.delete(index_path) if File.file?(index_path))
            rescue StandardError => restore_error
              warn("Planos Santo: no se pudo restaurar material-assets.json: #{restore_error.class}")
            end
          end
          created.each do |path|
            File.delete(path) if File.file?(path) && !File.symlink?(path)
          rescue StandardError => delete_error
            warn("Planos Santo: no se pudo quitar #{File.basename(path)}: #{delete_error.class}")
          end
          raise
        end
        {'catalog'=>catalog,'imported'=>candidates.length,'skipped'=>selected_ids.length-candidates.length}
      end
      @pending=nil
      result
    end
  end
end
