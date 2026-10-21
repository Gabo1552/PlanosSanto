# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'
require_relative 'exporter' unless defined?(PlanosSanto::Exporter)
require_relative 'guide_store'

module PlanosSanto
  # Instance names only. No definition names, geometry writes, make_unique or observers.
  class NameManager
    DICT = 'PlanosSantoNombres'
    PIECE_KEY = 'piece_v1'
    ROOT_KEY = 'furniture_v1'
    STOP_WORDS = %w[de del la las el los y en un una para].freeze

    def self.clean(value, limit = 80)
      raise ExportError, 'El nombre debe ser texto.' unless value.is_a?(String)
      raise ExportError, 'El nombre contiene caracteres de control.' if value.match?(/[\x00-\x1f\x7f]/)
      text = value.unicode_normalize(:nfc).gsub(/[[:space:]]+/u, ' ').strip
      raise ExportError, "Completá un nombre de hasta #{limit} caracteres." if text.empty? || text.length > limit
      text
    end

    def self.abbreviation(name)
      text = clean(name, 1000)
      code = text.match(/(?<![\p{L}\p{N}])(M\d+)(?![\p{L}\p{N}])/iu)
      return code[1].upcase if code
      words = text.scan(/[\p{L}\p{N}]+/u).reject { |word| STOP_WORDS.include?(word.downcase) }
      result = words.map { |word| word[0].upcase }.join
      result.empty? ? 'M' : result[0,20]
    end

    def initialize(model)
      @model = model
      @reader = Exporter.new(model)
    end

    def valid?(entity)
      (!entity.respond_to?(:valid?) || entity.valid?) && (!entity.respond_to?(:deleted?) || !entity.deleted?)
    end

    def locked?(entity)
      entity.respond_to?(:locked?) && entity.locked?
    end

    def get(entity, key)
      entity.get_attribute(DICT, key)
    end

    def metadata(entity, key)
      raw = get(entity, key)
      return nil if raw.nil?
      raise ExportError, 'Metadatos de nombres incompatibles; no se sobrescribieron.' unless raw.is_a?(String) && raw.bytesize <= 4096
      value = JSON.parse(raw)
      fields = key == PIECE_KEY ? %w[version base prefix originalName appliedName] : %w[version name prefix originalName]
      raise ExportError, 'Metadatos de nombres incompatibles; no se sobrescribieron.' unless value.is_a?(Hash) && value.keys.sort == fields.sort && value['version'] == 1 && (fields - ['version']).all? { |k| value[k].is_a?(String) && value[k].length <= 1000 }
      value
    rescue JSON::ParserError
      raise ExportError, 'Metadatos de nombres dañados; no se sobrescribieron.'
    end

    def display(entity, piece = false)
      name = entity.name.to_s.strip
      name = entity.definition.name.to_s.strip if name.empty?
      name.empty? ? "#{piece ? 'Pieza' : 'Mueble'} #{entity.persistent_id}" : name
    end

    # Traverse occurrences, including hidden ones, so shared definitions cannot leak writes.
    # geometry: false skips the per-face mesh fingerprint and the model
    # signature (signature: nil). Only a plan that is validated and committed in
    # the same synchronous call may use it (immediate paint click, 0.8.9 V19):
    # a token flow that commits later needs the signature to detect drift.
    def inventory(geometry: true)
      index = {}; occurrences = Hash.new { |h,k| h[k] = [] }; definitions = Hash.new(0)
      fingerprint = []; vertex_count = 0
      visit = lambda do |entity, parents, stack|
        raise ExportError, 'La jerarquía supera 25 niveles o 5.000 ocurrencias.' if parents.length >= 25 || index.length >= 5000
        raise ExportError, 'Hay una entidad eliminada. Actualizá el listado.' unless valid?(entity)
        raise ExportError, 'Definición recursiva: no se puede renombrar con seguridad.' if stack.include?(entity.definition.guid.to_s)
        route = (parents + [entity]).map { |e| e.persistent_id.to_s }.join('/')
        raise ExportError, 'Rutas de ocurrencia repetidas.' if index.key?(route)
        source = @reader.entities_of(entity)
        faces = source.select { |e| e.is_a?(Sketchup::Face) }
        children = @reader.containers(source)
        role = faces.empty? ? (children.empty? ? 'empty' : 'container') : (children.empty? ? 'piece' : 'mixed')
        node = { 'id' => route, 'currentName' => entity.name.to_s, 'displayName' => display(entity, role == 'piece'),
                 'role' => role, 'kind' => entity.is_a?(Sketchup::Group) ? 'group' : 'component', 'children' => [],
                 '_entity' => entity, '_parents' => parents }
        index[route] = node; occurrences[entity.persistent_id.to_s] << route; definitions[entity.definition.guid.to_s] += 1
        next node.merge!('children' => children.map { |child| visit.call(child, parents + [entity], stack + [entity.definition.guid.to_s]) }) unless geometry
        mesh = faces.map do |face|
          face_mesh = face.mesh(0)
          vertex_count += face_mesh.points.length
          raise ExportError, 'La geometría supera el límite de revisión de nombres.' if vertex_count > 200_000
          [face.hidden?, face.layer.name.to_s, face.layer.visible?, face_mesh.points.map { |p| p.to_a }, face_mesh.polygons, @reader.material(face.material), @reader.material(face.back_material)]
        end
        fingerprint << [route, entity.persistent_id.to_s, entity.definition.guid.to_s, entity.definition.name.to_s,
                        entity.name.to_s, entity.transformation.to_a, locked?(entity), entity.hidden?,
                        entity.layer.name.to_s, entity.layer.visible?, @reader.material(entity.material), mesh,
                        get(entity, PIECE_KEY), get(entity, ROOT_KEY)]
        node['children'] = children.map { |child| visit.call(child, parents + [entity], stack + [entity.definition.guid.to_s]) }
        node
      end
      roots = @reader.containers(@model.entities).map { |root| visit.call(root, [], []) }
      guide = GuideStore.new(@model).read
      signature = geometry ? Digest::SHA256.hexdigest(JSON.generate([@model.guid.to_s, fingerprint, guide])) : nil
      { roots: roots, index: index, occurrences: occurrences, definitions: definitions, signature: signature, guide: guide }
    end

    def public_node(node)
      node.reject { |k,_| k.start_with?('_') || k == 'children' }.merge('children' => node['children'].map { |child| public_node(child) })
    end

    def catalog
      snapshot = inventory
      { 'roots' => snapshot[:roots].map { |root| public_node(root) } }
    end

    def safety(node, snapshot, covered_paths = [])
      entity = node['_entity']; chain = node['_parents']
      return 'La instancia o uno de sus contenedores está bloqueado.' if (chain + [entity]).any? { |e| locked?(e) }
      paths = snapshot[:occurrences][entity.persistent_id.to_s]
      if paths.length > 1 && (paths - covered_paths).any?
        missing=paths-covered_paths
        return "Instancia compartida: #{paths.length} apariciones; faltan #{missing.length} en este cambio (#{missing.first(3).join(', ')}#{missing.length>3 ? ', …' : ''})."
      end
      # Every visible occurrence must be covered. References in unused definitions
      # still require the conservative definition.instances guard below.
      shared = chain.find do |parent|
        definition = parent.definition
        next false unless definition.respond_to?(:instances)
        # .instances includes references inside definitions not placed in the model.
        # Count physical entity IDs, not expanded occurrence counts: six placed
        # occurrences can refer to just one nested entity object.
        definition.instances.any? do |instance|
          valid?(instance) && (!instance.respond_to?(:persistent_id) || !snapshot[:occurrences].key?(instance.persistent_id.to_s))
        end
      end
      return "El contenedor «#{display(shared)}» usa una definición compartida. No se hará make_unique ni se renombrarán sus hijos." if shared
      nil
    end

    def preview(id)
      snapshot = inventory
      root = snapshot[:index][id]
      raise ExportError, 'El mueble no existe. Actualizá el listado.' unless root
      warnings = []; rows = []
      walk = lambda do |node, depth|
        piece = node['role'] == 'piece'
        base = nil; meta = nil
        begin
          meta = metadata(node['_entity'], PIECE_KEY) if piece
          current = node['currentName']
          base = meta && meta['appliedName'] == current ? meta['base'] : display(node['_entity'], true)
          if meta && meta['appliedName'] != current
            warnings << "#{node['id']}: nombre editado fuera del panel; se conserva completo como base."
          end
        rescue ExportError => e
          warnings << "#{node['id']}: #{e.message}"
          node['_invalid_metadata'] = true
        end
        rows << { 'id' => node['id'], 'depth' => depth, 'role' => node['role'], 'currentName' => node['currentName'],
                  'displayName' => node['displayName'], 'base' => piece ? base : nil }
        node['children'].each { |child| walk.call(child, depth + 1) }
      end
      root['children'].each { |child| walk.call(child, 0) }
      # A leaf is selectable for inspection, but is not silently treated as a furniture parent.
      blockers = []
      pieces = rows.select { |r| r['role'] == 'piece' }
      blockers << 'Este mueble supera 500 piezas; elegí un grupo menor.' if pieces.length > 500
      blockers << 'El grupo no contiene piezas hijas. Elegí un mueble padre.' if pieces.empty?
      blockers << 'Hay caras propias y subgrupos en un mismo nivel. Separá las piezas ambiguas antes de renombrar.' if root['role'] == 'mixed' || rows.any? { |r| r['role'] == 'mixed' }
      targets = [root] + pieces.map { |row| snapshot[:index].fetch(row['id']) }
      targets.each do |node|
        error = safety(node, snapshot, targets.map { |target| target['id'] })
        blockers << "#{node['id']}: #{error}" if error
        blockers << "#{node['id']}: metadatos incompatibles." if node['_invalid_metadata']
      end
      root_meta = nil
      begin
        root_meta = metadata(root['_entity'], ROOT_KEY)
      rescue ExportError => e
        blockers << e.message
      end
      name = root['displayName']
      prefix = root_meta && root_meta['name'] == root['currentName'] ? root_meta['prefix'] : self.class.abbreviation(name)
      token = SecureRandom.hex(16)
      @draft = { token: token, snapshot: snapshot, root: root, pieces: pieces, root_meta: root_meta }
      { 'token' => token, 'rootId' => id, 'currentName' => root['currentName'], 'name' => name, 'prefix' => prefix,
        'rows' => rows, 'pieceCount' => pieces.length, 'warnings' => warnings.uniq, 'blockers' => blockers.uniq,
        'blocked' => !blockers.empty? }
    end

    # Prepare the entire guide batch before entering the single save operation.
    # No model writes occur during preview/generation or from observers.
    def guide_changes(edits, work_code)
      GuideStore.new(@model).validate_work_code!(work_code)
      snapshot=inventory
      changes=[]
      proposals={}
      edits.each do |f|
        naming=f['naming']
        raise ExportError, 'Falta el módulo (por ejemplo M01).' if !work_code.empty? && (!naming || naming['moduleCode'].empty?)
        if f.key?('groupName')
          root=snapshot[:index][f['id']]
          raise ExportError, 'El grupo ya no existe; volvé a analizar.' unless root
          desired=self.class.clean(f['groupName'])
          if desired!=root['currentName'] && desired!=root['displayName']
            raise ExportError, 'Una pieza aislada se renombra desde su fila, no como grupo padre.' unless root['role']=='container'
            proposals[root['id']]={node:root,name:desired}
            entity=root['_entity']; old=metadata(entity,ROOT_KEY)
            prefix=[work_code,naming && naming['moduleCode']].compact.reject(&:empty?).join(' ')
            changes << {entity:entity,name:desired,key:ROOT_KEY,meta:{'version'=>1,'name'=>desired,'prefix'=>prefix,'originalName'=>old ? old['originalName'] : entity.name.to_s}}
          end
        end
        f['pieces'].each do |piece|
          node=snapshot[:index][piece['id']]
          raise ExportError, 'Una pieza ya no existe; volvé a analizar.' unless node
          base=naming ? naming['bases'].find { |b| b['id']==piece['id'] }.fetch('base') : piece['name']
          prefix=work_code.empty? ? '' : "#{work_code} #{naming['moduleCode']}"
          desired=prefix.empty? ? self.class.clean(base) : self.class.clean("#{prefix} #{self.class.clean(base)}")
          raise ExportError, 'El nombre de la tabla no coincide con obra, módulo y pieza.' unless desired==piece['name']
          entity=node['_entity']
          proposals[node['id']]={node:node,name:desired}
          next if entity.name.to_s==desired
          raise ExportError, 'No se renombra geometría mezclada con subgrupos; elegí piezas hijas.' unless node['role']=='piece'
          old=metadata(entity,PIECE_KEY)
          changes << {entity:entity,name:desired,meta:{'version'=>1,'base'=>base,'prefix'=>prefix,'originalName'=>old ? old['originalName'] : entity.name.to_s,'appliedName'=>desired}}
        end
      end
      validate_shared_batch!(changes, proposals, snapshot)
      changes=changes.uniq { |change| [change[:entity].persistent_id, change[:key] || PIECE_KEY] }
      lambda do
        changes.each do |change|
          entity=change[:entity]
          raise ExportError, 'Una pieza se bloqueó o dejó de existir.' unless valid?(entity) && !locked?(entity)
          entity.name=change[:name]
          raise ExportError, 'SketchUp no aceptó el nombre de la pieza.' unless entity.name==change[:name]
          entity.set_attribute(DICT,change[:key] || PIECE_KEY,JSON.generate(change[:meta]))
        end
      end
    end

    # A shared child is one SketchUp entity, even when it has several paths.
    # Only accept a coherent batch covering ALL occurrences; never make_unique,
    # detach geometry or silently propagate edits to unselected furniture.
    def validate_shared_batch!(changes, proposals, snapshot)
      changes.each do |change|
        entity=change[:entity]
        routes=snapshot[:occurrences].fetch(entity.persistent_id.to_s)
        routes.each do |route|
          node=snapshot[:index].fetch(route)
          error=safety(node,snapshot,proposals.keys)
          raise ExportError, "#{route}: #{error} Incluí todas sus apariciones con el mismo nombre o desactivá la sincronización con SketchUp para guardar solo la guía." if error
        end
        desired=routes.filter_map { |route| proposals[route] && proposals[route][:name] }.uniq
        if desired.length!=1 || desired.first!=change[:name]
          raise ExportError, "La pieza compartida #{entity.persistent_id} tiene nombres distintos entre sus apariciones. Usá el mismo nombre para todas o desactivá la sincronización con SketchUp para conservar nombres distintos solo en la guía."
        end
        # Same name but incompatible bases/prefixes would corrupt future naming.
        records=changes.select { |other| other[:entity].persistent_id==entity.persistent_id }.map { |other| other[:meta] || other[:value] }.uniq
        raise ExportError, 'Las apariciones compartidas tienen abreviaturas o nombres base incompatibles.' if records.length>1
      end
    end

    def apply(data)
      raise ExportError, 'Hay un renombrado en curso.' if @applying
      @applying = true
      started = false
      begin
        draft = @draft
        raise ExportError, 'Vista previa vencida. Volvé a revisar el mueble.' unless draft && data['token'] == draft[:token]
        current = inventory
        raise ExportError, 'El modelo o la guía cambió. Actualizá la vista previa antes de confirmar.' unless current[:signature] == draft[:snapshot][:signature]
        reviewed = preview(draft[:root]['id'])
        @draft = draft
        raise ExportError, reviewed['blockers'].join(' ') if reviewed['blocked']
        name = self.class.clean(data['name']); prefix = self.class.clean(data['prefix'], 20)
        bases = data['bases']
        raise ExportError, 'Listado de piezas inconsistente.' unless bases.is_a?(Hash) && bases.keys.sort == draft[:pieces].map { |row| row['id'] }.sort
        root = draft[:root]; root_entity = root['_entity']; root_meta = draft[:root_meta]
        changes = [{ entity: root_entity, id: root['id'], name: name, key: ROOT_KEY,
                     value: { 'version' => 1, 'name' => name, 'prefix' => prefix, 'originalName' => root_meta ? root_meta['originalName'] : root['currentName'] } }]
        draft[:pieces].each do |row|
          base = self.class.clean(bases.fetch(row['id']))
          proposed = self.class.clean("#{prefix} - #{base}")
          entity = draft[:snapshot][:index].fetch(row['id'])['_entity']; old_meta = metadata(entity, PIECE_KEY)
          changes << { entity: entity, id: row['id'], name: proposed, key: PIECE_KEY,
                       value: { 'version' => 1, 'base' => base, 'prefix' => prefix, 'originalName' => old_meta ? old_meta['originalName'] : entity.name.to_s, 'appliedName' => proposed } }
        end
        proposals=changes.to_h { |change| [change[:id], {node:current[:index].fetch(change[:id]),name:change[:name]}] }
        validate_shared_batch!(changes,proposals,current)
        updates = changes.select { |c| c[:entity].name.to_s != c[:name] || get(c[:entity], c[:key]) != JSON.generate(c[:value]) }
        updates=updates.uniq { |change| [change[:entity].persistent_id,change[:key]] }
        names = changes.to_h { |c| [c[:id], c[:name]] }
        guide = JSON.parse(JSON.generate(current[:guide])); guide_changed = false
        guide['furniture'].each do |furniture|
          furniture['pieces'].each do |piece|
            next unless names.key?(piece['id']) && piece['name'] != names[piece['id']]
            piece['name'] = names[piece['id']]; guide_changed = true
            if furniture['naming']
              base=furniture['naming']['bases'].find { |b| b['id']==piece['id'] }
              base['base']=piece['name'] if base && guide.fetch('workCode','').empty?
            end
          end
        end
        guide['revision'] += 1 if guide_changed
        encoded_guide = JSON.generate(guide)
        raise ExportError, 'La guía actualizada supera el límite.' if encoded_guide.bytesize > GuideStore::LIMIT
        if !updates.empty? || guide_changed
          raise ExportError, 'No se pudo iniciar la operación.' unless @model.start_operation('Renombrar mueble Planos Santo', true)
          started = true
          updates.each do |change|
            entity = change[:entity]
            raise ExportError, 'Una entidad dejó de estar disponible o está bloqueada.' unless valid?(entity) && !locked?(entity)
            entity.name = change[:name]
            raise ExportError, 'SketchUp no aceptó el nombre propuesto.' unless entity.name == change[:name]
            entity.set_attribute(DICT, change[:key], JSON.generate(change[:value]))
          end
          @model.set_attribute(GuideStore::DICTIONARY, GuideStore::KEY, encoded_guide) if guide_changed
          raise ExportError, 'No se pudo confirmar el renombrado.' unless @model.commit_operation
          started = false
        end
        { 'changed' => updates.length, 'noChanges' => updates.empty? && !guide_changed,
          'guideNamesUpdated' => guide_changed, 'preview' => preview(root['id']) }
      rescue StandardError
        @model.abort_operation if started
        raise
      ensure
        @applying = false
      end
    end
  end
end
