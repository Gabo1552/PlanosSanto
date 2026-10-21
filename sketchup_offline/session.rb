# frozen_string_literal: true
require_relative 'release'
require_relative 'guide_store'

module PlanosSanto
  class NativeExporter < Exporter
    def walk(entity, *args)
      node=super
      if node['mesh'] && entity.respond_to?(:get_attribute)
        raw=entity.get_attribute('PlanosSantoNombres','piece_v1')
        begin
          meta=JSON.parse(raw) if raw.is_a?(String) && raw.bytesize<=4096
          node['metadata']['nameBase']=meta['base'] if meta.is_a?(Hash) && meta['version']==1 && meta['appliedName']==entity.name.to_s && meta['base'].is_a?(String) && meta['base'].length<=80
        rescue JSON::ParserError
          # The naming service reports invalid metadata before any write.
        end
      end
      node
    end

    def document(snapshot, ids)
      result = super
      result['exporter']['version'] = Release::VERSION
      result
    end
  end

  class NativeSession
    attr_reader :document, :fingerprint

    def initialize(model)
      @model = model
      @store = GuideStore.new(model)
    end

    def scan
      @exporter = NativeExporter.new(@model)
      @snapshot = @exporter.tree
      guide = @store.read
      @revision = guide['revision']
      @document = nil
      path = (@model.active_path || []).map { |e| e.persistent_id.to_s }
      selected = @model.selection.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
                       .map { |e| (path + [e.persistent_id.to_s]).join('/') }
      index = {}; Exporter.each_node(@snapshot['roots']) { |n| index[n['id']] = n }
      selected.select! { |id| index.key?(id) }
      selected.reject! { |id| selected.any? { |other| other != id && id.start_with?(other + '/') } }
      { 'tree' => @snapshot, 'guide' => guide, 'selected' => selected, 'path' => @model.path.to_s }
    end

    def generate(ids)
      raise ExportError, 'Primero analizá el modelo.' unless @snapshot
      current = NativeExporter.new(@model)
      tree = current.tree
      candidate = @exporter.document(@snapshot, ids)
      actual = current.document(tree, ids)
      raise ExportError, 'El modelo cambió. Volvé a analizar antes de generar.' unless furniture_fingerprint(candidate['furniture']) == furniture_fingerprint(actual['furniture'])
      @document = actual
      @fingerprint = furniture_fingerprint(@document['furniture'])
      { 'document' => @document, 'guide' => @store.read, 'fingerprint' => @fingerprint }
    end

    def check_current!
      raise ExportError, 'Primero generá las guías.' unless @document
      current = NativeExporter.new(@model)
      doc = current.document(current.tree, @document['exporter']['selectionPaths'])
      hash = furniture_fingerprint(doc['furniture'])
      raise ExportError, 'La geometría o la selección cambió. Volvé a analizar y generar las guías.' unless hash == @fingerprint
      raise ExportError, 'La guía cambió en SketchUp (puede ser Deshacer). Volvé a analizar.' unless @store.read['revision'] == @revision
      true
    end

    def save(edits, revision, sync_names: false, work_code: nil)
      check_current!
      raise ExportError, 'Revisión desactualizada.' unless revision == @revision
      if !sync_names && edits.is_a?(Array) && edits.any? { |f| f.is_a?(Hash) && f.key?('groupName') && @document['furniture'].any? { |root| root['id']==f['id'] && root['name']!=f['groupName'] } }
        raise ExportError, 'Para renombrar el grupo, activá Sincronizar nombres de grupos y piezas en SketchUp.'
      end
      # Validate before constructing a batch so malformed requests cannot write names.
      @store.validate(@document, edits)
      effective_code=work_code.nil? ? @store.read.fetch('workCode','') : work_code
      rename=NameManager.new(@model).guide_changes(edits,effective_code) if sync_names
      refreshed=nil; refreshed_reader=nil; refreshed_tree=nil
      result = @store.save(@document, edits, @revision, work_code: work_code) do
        if rename
          rename.call
          reader=NativeExporter.new(@model)
          refreshed_reader=reader; refreshed_tree=reader.tree
          refreshed=reader.document(refreshed_tree,@document['exporter']['selectionPaths'])
        end
      end
      if refreshed
        @exporter=refreshed_reader; @snapshot=refreshed_tree
        @document=refreshed
        @fingerprint=furniture_fingerprint(@document['furniture'])
      end
      @revision = result['revision']
      result
    end

    def validate_export(edits)
      check_current!
      @store.validate(@document, edits)
      roots = @document['furniture'].to_h { |f| [f['id'], f] }
      edits.each do |f|
        ids = []
        Exporter.each_node([roots.fetch(f['id'])]) { |node| ids << node['id'] if node['mesh'] }
        raise ExportError, 'Hay notas sin destino. Reanclalas o eliminalas antes de exportar.' if f['notes'].any? { |n| !ids.include?(n['pieceId']) }
      end
      true
    end

    private

    def furniture_fingerprint(furniture)
      # ComponentDefinition#guid identifies a revision, not stable geometry. SketchUp
      # can update it after commit/save, including commits that only write names or
      # attributes. Keep the exported GUID, but compare all actual piece data instead.
      stable_node = lambda do |node|
        node.reject { |key, _value| key == 'definition' || key == 'children' }
            .merge('children' => node.fetch('children').map { |child| stable_node.call(child) })
      end
      Digest::SHA256.hexdigest(JSON.generate(furniture.map { |node| stable_node.call(node) }))
    end
  end
end
