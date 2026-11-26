# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'
require_relative 'exporter' unless defined?(PlanosSanto::Exporter)
require_relative 'guide_store'

module PlanosSanto
  # Piece names: (0.8.38) a component takes its name in its definition (the «Definición» field of Entity Info, the
  # one OpenCutList lists) and its instance name is left empty, when that is safe; otherwise, and for groups and
  # furniture roots, in the instance name. No geometry writes, make_unique or observers.
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

    def component?(entity)
      entity && !entity.is_a?(Sketchup::Group) && entity.respond_to?(:definition) && entity.definition.respond_to?(:name=)
    end

    # El nombre que muestra SketchUp: el de la instancia o, en un componente sin nombre propio, el de su definición.
    def applied_name(entity)
      name = entity.name.to_s
      name.empty? && component?(entity) ? entity.definition.name.to_s : name
    end

    def definition_key(definition)
      definition.respond_to?(:entityID) ? [:entity, definition.entityID] : [:object, definition.object_id]
    end

    def display(entity, piece = false)
      name = entity.name.to_s.strip
      name = entity.definition.name.to_s.strip if name.empty?
      name.empty? ? "#{piece ? 'Pieza' : 'Mueble'} #{entity.persistent_id}" : name
    end

    # Traverse occurrences, including hidden ones, so shared definitions cannot leak writes.
    # geometry: false skips the per-face mesh fingerprint and the model
    # signature (signature: nil). Only a plan that is validated and committed in
    # the same synchronous call may use it (immediate paint click, 0.8.10; native V19):
    # a token flow that commits later needs the signature to detect drift.
    # The face part of the fingerprint only depends on the definition: it is
    # built and hashed once per definition (Hito 6), and still counts toward
    # the vertex limit once per occurrence. The signature is only compared in
    # memory between two inventories, never persisted.
    def inventory(geometry: true)
      index = {}; occurrences = Hash.new { |h,k| h[k] = [] }; definitions = Hash.new(0)
      fingerprint = []; vertex_count = 0; meshes = {}
      visit = lambda do |entity, parents, stack|
        raise ExportError, 'La jerarquía supera 25 niveles o 5.000 ocurrencias.' if parents.length >= 25 || index.length >= 5000
        raise ExportError, 'Hay una entidad eliminada. Volvé a analizar el modelo.' unless valid?(entity)
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
        definition = entity.definition
        key = definition.respond_to?(:entityID) ? [:entity, definition.entityID] : [:object, definition.object_id]
        mesh, vertices = meshes[key] ||= begin
          count = 0
          rows = faces.map do |face|
            face_mesh = face.mesh(0)
            count += face_mesh.points.length
            raise ExportError, 'La geometría supera el límite de revisión de nombres.' if vertex_count + count > 200_000
            [face.hidden?, face.layer.name.to_s, face.layer.visible?, face_mesh.points.map { |p| p.to_a }, face_mesh.polygons, @reader.material(face.material), @reader.material(face.back_material)]
          end
          [Digest::SHA256.hexdigest(JSON.generate(rows)), count]
        end
        vertex_count += vertices
        raise ExportError, 'La geometría supera el límite de revisión de nombres.' if vertex_count > 200_000
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
      raise ExportError, 'El mueble no existe. Volvé a analizar el modelo.' unless root
      warnings = []; rows = []
      walk = lambda do |node, depth|
        piece = node['role'] == 'piece'
        base = nil; meta = nil
        begin
          meta = metadata(node['_entity'], PIECE_KEY) if piece
          current = applied_name(node['_entity'])
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
    # Simplificación (punto 20): a row that cannot be renamed safely (shared
    # occurrence not covered, different names between occurrences, locked,
    # mixed geometry, isolated piece as group) is skipped and reported in
    # #skipped as {'id','reason'}; the rest is renamed in the same operation.
    # Inconsistent data (a piece or group that no longer exists, a name that does
    # not match obra/módulo/pieza) still refuses the whole save.
    def guide_changes(edits, work_code)
      GuideStore.new(@model).validate_work_code!(work_code)
      snapshot=inventory
      changes=[]
      proposals={}
      @skipped=[];@definition_notes=[]
      edits.each do |f|
        naming=f['naming']
        if !work_code.empty? && (!naming || naming['moduleCode'].to_s.empty?)
          label=[f['groupName'],snapshot[:index][f['id']]&.fetch('currentName',nil),f['name']].map { |v| v.to_s.strip }.find { |v| !v.empty? } || 'sin nombre'
          raise ExportError, "#{f['id']}: Falta el módulo del mueble «#{label}» (por ejemplo M01)."
        end
        if f.key?('groupName')
          root=snapshot[:index][f['id']]
          raise ExportError, "#{f['id']}: El grupo ya no existe. Volvé a analizar el modelo." unless root
          desired=self.class.clean(f['groupName'])
          if desired!=root['currentName'] && desired!=root['displayName']
            if root['role']=='container'
              proposals[root['id']]={node:root,name:desired}
              entity=root['_entity']; old=metadata(entity,ROOT_KEY)
              prefix=[work_code,naming && naming['moduleCode']].compact.reject(&:empty?).join(' ')
              changes << {entity:entity,id:root['id'],name:desired,key:ROOT_KEY,meta:{'version'=>1,'name'=>desired,'prefix'=>prefix,'originalName'=>old ? old['originalName'] : entity.name.to_s}}
            else
              skip(root['id'],'Una pieza aislada se renombra desde su fila, no como grupo padre.')
            end
          end
        end
        f['pieces'].each do |piece|
          node=snapshot[:index][piece['id']]
          label=piece['code'].to_s.empty? ? 'La pieza' : "La pieza #{piece['code']}"
          raise ExportError, "#{piece['id']}: #{label} ya no existe. Volvé a analizar el modelo." unless node
          base=naming ? naming['bases'].find { |b| b['id']==piece['id'] }.fetch('base') : piece['name']
          prefix=work_code.empty? ? '' : "#{work_code} #{naming['moduleCode']}"
          desired=prefix.empty? ? self.class.clean(base) : self.class.clean("#{prefix} #{self.class.clean(base)}")
          raise ExportError, "#{piece['id']}: El nombre de #{label.sub('La pieza','la pieza')} no coincide con obra, módulo y pieza. Volvé a analizar el modelo." unless desired==piece['name']
          entity=node['_entity']
          proposals[node['id']]={node:node,name:desired}
          # Ya nombrada: en la instancia (un componente todavía puede pasar el nombre a su definición) o en la definición.
          current=entity.name.to_s
          next if current.empty? ? applied_name(entity)==desired : current==desired && !(component?(entity) && node['role']=='piece')
          unless node['role']=='piece'
            skip(piece['id'],'Tiene caras propias y subgrupos: no se renombra en SketchUp; separá las piezas.')
            next
          end
          old=metadata(entity,PIECE_KEY)
          changes << {entity:entity,id:piece['id'],name:desired,code:piece['code'],meta:{'version'=>1,'base'=>base,'prefix'=>prefix,'originalName'=>old ? old['originalName'] : entity.name.to_s,'appliedName'=>desired}}
        end
      end
      rejected=shared_batch_errors(changes, proposals, snapshot)
      changes=changes.reject do |change|
        error=rejected[change[:entity].persistent_id]
        next false unless error
        # Every occurrence of the shared entity in this batch carries the notice.
        snapshot[:occurrences].fetch(change[:entity].persistent_id.to_s).each { |route| skip(route,error[1]) if proposals[route] || route==change[:id] }
        true
      end
      changes=changes.uniq { |change| [change[:entity].persistent_id, change[:key] || PIECE_KEY] }
      blocked=rejected.keys
      definitions,named=definition_names(proposals.reject { |_route,proposal| blocked.include?(proposal[:node]['_entity'].persistent_id) || proposal[:node]['role']!='piece' }.map { |route,proposal| [route,proposal[:name]] },snapshot)
      changes=instance_targets(changes,named)
      lambda do
        changes.each do |change|
          entity=change[:entity]
          raise ExportError, 'Una pieza se bloqueó o dejó de existir.' unless valid?(entity) && !locked?(entity)
          entity.name=change[:instance]
          raise ExportError, 'SketchUp no aceptó el nombre de la pieza.' unless entity.name==change[:instance]
          entity.set_attribute(DICT,change[:key] || PIECE_KEY,JSON.generate(change[:meta]))
        end
        write_definition_names!(definitions)
      end
    end

    # 0.8.38: en un componente el nombre va también en su definición (campo «Definición» de Info. de entidad, el que
    # lista OpenCutList). Solo cuando todas las apariciones de esa definición en el modelo quedan con el mismo nombre y
    # ninguna otra definición se llama igual: SketchUp no repite nombres de definición y una definición compartida
    # cambia en todas sus copias. Los grupos no tienen ese campo. `entries`: [[ruta, nombre final]] de lo que se nombra.
    # Devuelve [[definición, nombre]] a escribir; lo que no se puede queda en #skipped con el motivo.
    def definition_names(entries, snapshot)
      desired = entries.to_h
      key = ->(definition) { definition_key(definition) }
      component = ->(entity) { component?(entity) }
      uses = Hash.new { |hash, k| hash[k] = [] }
      snapshot[:index].each_value { |node| uses[key.call(node['_entity'].definition)] << node if component.call(node['_entity']) }
      plans = {}
      entries.each do |route, name|
        entity = snapshot[:index][route]&.fetch('_entity')
        next unless component.call(entity)
        definition = entity.definition
        k = key.call(definition)
        next if plans.key?(k)
        names = uses[k].map { |node| desired.fetch(node['id'], applied_name(node['_entity'])) }.uniq
        if names != [name]
          uses[k].each { |node| note_definition(node['id'], "Su definición «#{definition.name}» la comparten piezas con nombres distintos. Para que OpenCutList la liste con este nombre, hacé única la definición en SketchUp o usá el mismo nombre.") if desired.key?(node['id']) }
          plans[k] = nil
          next
        end
        plans[k] = [definition, name]
      end
      plans = plans.values.compact
      named = plans.select { |definition, name| definition.name.to_s == name }.map { |definition, _name| key.call(definition) }
      plans = plans.reject { |definition, name| definition.name.to_s == name }
      count = Hash.new(0)
      plans.each { |_definition, name| count[name] += 1 }
      renamed = plans.map { |definition, _name| key.call(definition) }
      others = (@model.respond_to?(:definitions) ? @model.definitions.to_a : []) + snapshot[:index].each_value.map { |node| node['_entity'].definition }
      taken = others.reject { |definition| renamed.include?(key.call(definition)) }.map { |definition| definition.name.to_s }
      writes = plans.reject do |definition, name|
        next false if count[name] == 1 && !taken.include?(name)
        uses[key.call(definition)].each { |node| note_definition(node['id'], "Ya hay otra definición llamada «#{name}» y SketchUp no repite nombres de definición.") if desired.key?(node['id']) }
        true
      end
      [writes, named + writes.map { |definition, _name| key.call(definition) }]
    end

    # Nombre que queda en la instancia: vacío en un componente cuya definición lleva el nombre; el nombre completo en
    # el resto. Sin nada que escribir (instancia y metadatos ya iguales), el cambio se descarta.
    # `metadata`: también escribe cuando solo cambian los metadatos (renombrado del panel, como antes).
    def instance_targets(changes, named, metadata: false)
      changes.each do |change|
        piece = (change[:key] || PIECE_KEY) == PIECE_KEY && component?(change[:entity])
        change[:instance] = piece && named.include?(definition_key(change[:entity].definition)) ? '' : change[:name]
      end
      # Con el nombre ya en la instancia no se escribe nada (como antes); con la instancia vacía, solo si cambian los
      # metadatos (la definición tomó otro nombre).
      changes.reject do |change|
        same = get(change[:entity], change[:key] || PIECE_KEY) == JSON.generate(change[:meta] || change[:value])
        change[:entity].name.to_s == change[:instance] && (same || (!metadata && !change[:instance].empty?))
      end
    end

    def write_definition_names!(plans)
      plans.each do |definition, name|
        definition.name = name
        raise ExportError, "SketchUp no aceptó el nombre de la definición «#{name}»." unless definition.name == name
      end
    end

    # 0.8.38: filas nombradas en la instancia porque su definición no podía llevar el nombre: [{'id','reason'}].
    # No son errores (la pieza sí se nombró): la ventana las muestra aparte de #skipped.
    def definition_notes
      (@definition_notes || []).uniq { |row| row['id'] }
    end

    def note_definition(id, reason)
      (@definition_notes ||= []) << { 'id' => id, 'reason' => reason }
    end

    # Rows the last #guide_changes left without renaming: [{'id','reason'}].
    def skipped
      (@skipped || []).uniq { |row| row['id'] }
    end

    def skip(id, reason)
      (@skipped ||= []) << { 'id' => id, 'reason' => reason }
    end

    # A shared child is one SketchUp entity, even when it has several paths.
    # Only accept a coherent batch covering ALL occurrences; never make_unique,
    # detach geometry or silently propagate edits to unselected furniture.
    # Returns {persistent_id => [route, message]} for the entities that cannot
    # be renamed; the legacy preview flow raises the first one.
    def shared_batch_errors(changes, proposals, snapshot)
      errors={}
      changes.each do |change|
        entity=change[:entity]
        next if errors.key?(entity.persistent_id)
        routes=snapshot[:occurrences].fetch(entity.persistent_id.to_s)
        blocked=routes.lazy.map { |route| [route,safety(snapshot[:index].fetch(route),snapshot,proposals.keys)] }.find { |_route,error| error }
        if blocked
          errors[entity.persistent_id]=[blocked[0],"#{blocked[1]} No se renombró en SketchUp: incluí todas sus apariciones con el mismo nombre."]
          next
        end
        desired=routes.filter_map { |route| proposals[route] && proposals[route][:name] }.uniq
        if desired.length!=1 || desired.first!=change[:name]
          errors[entity.persistent_id]=[routes.find { |r| proposals[r] } || routes.first,"La pieza compartida#{change[:code] ? " #{change[:code]}" : ''} tiene nombres distintos entre sus apariciones. No se renombró en SketchUp: usá el mismo nombre para todas."]
          next
        end
        # Same name but incompatible bases/prefixes would corrupt future naming.
        records=changes.select { |other| other[:entity].persistent_id==entity.persistent_id }.map { |other| other[:meta] || other[:value] }.uniq
        errors[entity.persistent_id]=[routes.find { |r| proposals[r] } || routes.first,"Las apariciones compartidas#{change[:code] ? " de #{change[:code]}" : ''} tienen abreviaturas o nombres base incompatibles. No se renombró en SketchUp."] if records.length>1
      end
      errors
    end

    def validate_shared_batch!(changes, proposals, snapshot)
      error=shared_batch_errors(changes, proposals, snapshot).values.first
      raise ExportError, "#{error[0]}: #{error[1]}" if error
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
        definitions, named = definition_names(changes.select { |c| c[:key] == PIECE_KEY }.map { |c| [c[:id], c[:name]] }, current)
        updates = instance_targets(changes, named, metadata: true)
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
        if !updates.empty? || guide_changed || !definitions.empty?
          raise ExportError, 'No se pudo iniciar la operación.' unless @model.start_operation('Renombrar mueble Planos Santo', true)
          started = true
          updates.each do |change|
            entity = change[:entity]
            raise ExportError, 'Una entidad dejó de estar disponible o está bloqueada.' unless valid?(entity) && !locked?(entity)
            entity.name = change[:instance]
            raise ExportError, 'SketchUp no aceptó el nombre propuesto.' unless entity.name == change[:instance]
            entity.set_attribute(DICT, change[:key], JSON.generate(change[:value]))
          end
          write_definition_names!(definitions)
          @model.set_attribute(GuideStore::DICTIONARY, GuideStore::KEY, encoded_guide) if guide_changed
          raise ExportError, 'No se pudo confirmar el renombrado.' unless @model.commit_operation
          started = false
        end
        { 'changed' => updates.length + definitions.length, 'noChanges' => updates.empty? && !guide_changed && definitions.empty?,
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
