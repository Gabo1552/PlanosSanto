# frozen_string_literal: true
require 'json'
require 'digest'

module PlanosSanto
  # Stores only guide edits. Faces, definitions, entity names and transformations are never written.
  class GuideStore
    DICTIONARY = 'PlanosSanto'
    KEY = 'guide_v1'
    LIMIT = 5 * 1024 * 1024
    # Muebles por guía. El tope real es el tamaño (LIMIT) y la geometría del escaneo; este solo frena datos absurdos.
    MAX_FURNITURE = 500

    def initialize(model)
      @model = model
    end

    def read
      raw = @model.get_attribute(DICTIONARY, KEY)
      return { 'version' => 1, 'revision' => 0, 'selection' => [], 'furniture' => [] } unless raw
      raise ExportError, 'Los datos de la guía superan el límite. No se sobrescribieron.' unless raw.is_a?(String) && raw.bytesize <= LIMIT
      guide = JSON.parse(raw)
      valid = guide.is_a?(Hash) && guide['version'] == 1 && guide['revision'].is_a?(Integer) && guide['revision'] >= 0 &&
              guide['furniture'].is_a?(Array) && guide['furniture'].length <= MAX_FURNITURE && guide['selection'].is_a?(Array) && guide['selection'].length <= MAX_FURNITURE
      raise ExportError, 'La guía guardada tiene un formato incompatible. Conservá una copia del SKP; no se sobrescribió.' unless valid
      raise ExportError, 'La selección guardada es incompatible.' unless guide['selection'].all? { |id| id.is_a?(String) && id.length.between?(1,1000) }
      validate_work_code!(guide['workCode']) if guide.key?('workCode')
      guide['furniture'].each do |f|
        keys!(f, %w[id explosion zoom pieces notes], %w[hiddenDimensions presentation naming groupIdentical], context: 'mueble de la guía')
        text!(f['id'], 1000); finite!(f['explosion'], 0, 1); finite!(f['zoom'], 0.35, 1.4)
        raise ExportError, 'Listado guardado incompatible.' unless f['pieces'].is_a?(Array) && f['pieces'].length <= 500 && f['notes'].is_a?(Array) && f['notes'].length <= 40
        f['pieces'].each do |p|
          keys!(p, %w[id name code], %w[previousCode], context: 'pieza de la guía'); text!(p['id'], 1000); text!(p['name'], 80)
          raise ExportError, 'Código guardado incompatible.' unless piece_code?(p['code']) && (!p.key?('previousCode') || piece_code?(p['previousCode']))
        end
        raise ExportError, 'Piezas o códigos guardados repetidos.' unless f['pieces'].map { |p| p['id'] }.uniq.length == f['pieces'].length && f['pieces'].map { |p| p['code'] }.uniq.length == f['pieces'].length
        validate_hidden_dimensions!(f['hiddenDimensions'], f['pieces'].map { |p| p['id'] }) if f.key?('hiddenDimensions')
        validate_options!(f, f['pieces'].map { |p| p['id'] })
        f['notes'].each { |n| validate_note_format!(n) }
        raise ExportError, 'Notas guardadas repetidas.' unless f['notes'].map { |n| n['id'] }.uniq.length == f['notes'].length
      end
      raise ExportError, 'Muebles guardados repetidos.' unless guide['furniture'].map { |f| f['id'] }.uniq.length == guide['furniture'].length
      guide
    rescue JSON::ParserError
      raise ExportError, 'La guía guardada está dañada. No se sobrescribió; conservá una copia del SKP.'
    end

    def save(document, edits, expected_revision, work_code: nil)
      old = read
      raise ExportError, 'La guía cambió en SketchUp. Volvé a analizar antes de guardar.' unless old['revision'] == expected_revision
      furniture = validate(document, edits, old)
      selected = furniture.map { |f| f['id'] }
      merged = old['furniture'].reject { |f| selected.include?(f['id']) } + furniture
      raise ExportError, "La guía supera #{MAX_FURNITURE} muebles guardados." if merged.length > MAX_FURNITURE
      result = { 'version' => 1, 'revision' => old['revision'] + 1, 'selection' => selected, 'furniture' => merged }
      code = work_code.nil? ? old['workCode'] : work_code
      validate_work_code!(code) unless code.nil?
      result['workCode'] = code unless code.nil?
      json = JSON.generate(result)
      raise ExportError, 'Las anotaciones superan 5 MB. No se guardaron.' if json.bytesize > LIMIT
      started = false
      begin
        raise ExportError, 'No se pudo iniciar el guardado.' unless @model.start_operation('Guardar guía Planos Santo', true)
        started = true
        yield if block_given?
        @model.set_attribute(DICTIONARY, KEY, json)
        raise ExportError, 'No se pudo confirmar el guardado.' unless @model.commit_operation
        started = false
      rescue StandardError
        @model.abort_operation if started
        raise
      end
      result
    end

    def keys!(value, keys, optional = [], context: 'edición')
      raise ExportError, "Formato incompatible en #{context}: se esperaba un objeto. No se guardaron cambios." unless value.is_a?(Hash)
      missing=keys-value.keys
      unknown=value.keys-keys-optional
      return if missing.empty? && unknown.empty?
      details=[]
      describe=->(fields) { fields.first(8).map { |key| key.to_s[0,64].inspect }.join(', ') }
      details << "Faltan campos: #{describe.call(missing)}." unless missing.empty?
      details << "Campos no permitidos: #{describe.call(unknown)}." unless unknown.empty?
      raise ExportError, "Formato incompatible en #{context}. #{details.join(' ')} No se guardaron cambios."
    end

    def validate_hidden_dimensions!(refs, piece_ids)
      raise ExportError, 'Listado de cotas ocultas inválido.' unless refs.is_a?(Array) && refs.length <= 1000
      refs.each do |ref|
        keys!(ref, %w[pieceId role], context: 'cota oculta'); text!(ref['pieceId'], 1000)
        raise ExportError, 'Cota oculta desconocida.' unless %w[largo ancho].include?(ref['role']) && piece_ids.include?(ref['pieceId'])
      end
      raise ExportError, 'Hay cotas ocultas repetidas.' unless refs.map { |ref| [ref['pieceId'],ref['role']] }.uniq.length == refs.length
    end

    def validate_work_code!(value)
      raise ExportError, 'La obra necesita dos letras mayúsculas (por ejemplo VF).' unless value.is_a?(String) && (value.empty? || value.match?(/\A[A-Z]{2}\z/))
    end

    def validate_options!(f, ids)
      raise ExportError, 'Agrupación de piezas inválida.' if f.key?('groupIdentical') && ![true,false].include?(f['groupIdentical'])
      if f.key?('presentation')
        p=f['presentation']; keys!(p, [], %w[cameras hideIds compact dimensionOffsets guide], context: 'presentación del mueble')
        raise ExportError, 'Visibilidad de ID inválida.' if p.key?('hideIds') && ![true,false].include?(p['hideIds'])
        raise ExportError, 'Modo compacto inválido.' if p.key?('compact') && ![true,false].include?(p['compact'])
        if p.key?('guide')
          g=p['guide']
          keys!(g, %w[mode hiddenPieceIds sharedCamera observations], context: 'guía A4')
          raise ExportError, 'Selección de vistas inválida.' unless %w[exterior interior both].include?(g['mode'])
          raise ExportError, 'Cámara compartida inválida.' unless [true,false].include?(g['sharedCamera'])
          hidden=g['hiddenPieceIds']
          raise ExportError, 'Listado de piezas ocultas inválido.' unless hidden.is_a?(Array) && hidden.length<=500 && hidden.uniq.length==hidden.length && hidden.all? { |id| id.is_a?(String) && ids.include?(id) }
          observations=g['observations']
          raise ExportError, 'Observaciones inválidas; máximo 2000 caracteres.' unless observations.is_a?(String) && observations.length<=2000 && !observations.match?(/[\x00-\x08\x0b\x0c\x0e-\x1f]/)
        end
        if p.key?('cameras')
          keys!(p['cameras'], [], %w[front back], context: 'vistas de cámara')
          p['cameras'].each_value { |c| keys!(c,%w[yaw pitch],context: 'rotación de cámara'); finite!(c['yaw'],-180,180); finite!(c['pitch'],10,80) }
        end
        if p.key?('dimensionOffsets')
          rows=p['dimensionOffsets']
          raise ExportError, 'Listado de posiciones de cotas inválido.' unless rows.is_a?(Array) && rows.length<=2000
          rows.each do |r|
            keys!(r,%w[pieceId role view offset],context: 'posición de cota')
            raise ExportError, 'Cota movida desconocida.' unless ids.include?(r['pieceId']) && %w[largo ancho].include?(r['role']) && %w[front back].include?(r['view'])
            raise ExportError, 'Posición de cota inválida.' unless r['offset'].is_a?(Array) && r['offset'].length==2
            r['offset'].each { |n| finite!(n,-1,1) }
          end
          raise ExportError, 'Cotas movidas duplicadas.' unless rows.map { |r| r.values_at('pieceId','role','view') }.uniq.length==rows.length
        end
      end
      if f.key?('naming')
        n=f['naming']; keys!(n,%w[moduleCode bases],%w[reference reviews],context: 'nombres del mueble')
        if n.key?('reference')
          r=n['reference'];keys!(r,%w[upAxis frontAxis frontSign confirmed],%w[upSign],context:'frente de referencia')
          raise ExportError,'Vertical de referencia inválida.' if r.key?('upSign') && ![-1,1].include?(r['upSign'])
          raise ExportError,'Frente de referencia inválido.' unless [0,1,2].include?(r['upAxis']) && r['upAxis'].is_a?(Integer) && [0,1,2].include?(r['frontAxis']) && r['frontAxis'].is_a?(Integer) && r['upAxis']!=r['frontAxis'] && [-1,1].include?(r['frontSign']) && [true,false].include?(r['confirmed'])
        end
        if n.key?('reviews')
          rows=n['reviews'];raise ExportError,'Revisiones de nombres inválidas.' unless rows.is_a?(Array) && rows.length<=500 && rows.map { |r| r.is_a?(Hash) && r['id'] }.uniq.length==rows.length
          rows.each { |r| keys!(r,%w[id proposed base],context:'revisión de nombre');raise ExportError,'Pieza de revisión desconocida.' unless ids.include?(r['id']);text!(r['proposed'],80);text!(r['base'],80) }
        end
        raise ExportError, 'Módulo inválido; usá M01.' unless n['moduleCode'].is_a?(String) && (n['moduleCode'].empty? || n['moduleCode'].match?(/\AM\d{1,3}\z/))
        raise ExportError, 'Bases de nombres inconsistentes.' unless n['bases'].is_a?(Array) && n['bases'].map { |r| r.is_a?(Hash) && r['id'] }.sort==ids.sort
        n['bases'].each { |b| keys!(b,%w[id base],context: 'nombre base de pieza'); text!(b['base'],80) }
      end
    end

    def piece_code?(value)
      value.is_a?(String) && value.match?(/\AP\d{2,4}\z/) && value[1..].to_i.positive?
    end

    def finite!(value, min, max)
      raise ExportError, 'Valor numérico fuera de rango.' unless value.is_a?(Numeric) && value.finite? && value.between?(min, max)
    end

    def text!(value, limit)
      raise ExportError, 'El texto está vacío o es demasiado largo.' unless value.is_a?(String) && !value.strip.empty? && value.length <= limit
      raise ExportError, 'El texto contiene caracteres de control.' if value.match?(/[\x00-\x08\x0b\x0c\x0e-\x1f]/)
    end

    def validate_note_format!(n)
      keys!(n, %w[id pieceId anchor position text], context: 'nota'); text!(n['text'], 200); text!(n['pieceId'], 1000)
      raise ExportError, 'Identificador de nota inválido.' unless n['id'].is_a?(String) && n['id'].match?(/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i)
      raise ExportError, 'Ancla inválida.' unless n['anchor'].is_a?(Array) && n['anchor'].length == 3
      n['anchor'].each { |v| finite!(v, -10_000_000, 10_000_000) }
      raise ExportError, 'Posición de nota inválida.' unless n['position'].is_a?(Array) && n['position'].length == 2
      finite!(n['position'][0], 16, 734); finite!(n['position'][1], 22, 528)
    end

    def validate(document, edits, old = read)
      raise ExportError, 'Listado de muebles inconsistente.' unless edits.is_a?(Array) && edits.length == document['furniture'].length
      index = document['furniture'].to_h { |root| [root['id'], root] }
      raise ExportError, 'Listado de muebles inconsistente.' unless edits.map { |f| f.is_a?(Hash) && f['id'] }.sort == index.keys.sort
      hidden_by_furniture = {}
      edits.each do |f|
        keys!(f, %w[id explosion zoom pieces notes], %w[hiddenDimensions presentation naming groupName groupIdentical renumber], context: 'mueble de la guía')
        text!(f['groupName'],80) if f.key?('groupName')
        raise ExportError, 'Renumeración inválida.' if f.key?('renumber') && f['renumber'] != true
        finite!(f['explosion'], 0, 1); finite!(f['zoom'], 0.35, 1.4)
        pieces = {}
        Exporter.each_node([index.fetch(f['id'])]) { |n| pieces[n['id']] = n if n['mesh'] }
        previous = old['furniture'].find { |entry| entry['id'] == f['id'] }
        if f.key?('hiddenDimensions')
          validate_hidden_dimensions!(f['hiddenDimensions'], pieces.keys)
          hidden_by_furniture[f['id']] = f['hiddenDimensions']
        elsif previous && previous.key?('hiddenDimensions')
          hidden_by_furniture[f['id']] = previous['hiddenDimensions'].select { |ref| pieces.key?(ref['pieceId']) }
        end
        validate_options!(f, pieces.keys)
        previous_pieces = (previous || {}).fetch('pieces', []).to_h { |p| [p['id'], p] }
        previous_notes = (previous || {}).fetch('notes', []).to_h { |n| [n['id'], n] }
        raise ExportError, 'Listado de piezas inconsistente.' unless f['pieces'].is_a?(Array) && f['pieces'].map { |p| p.is_a?(Hash) && p['id'] }.sort == pieces.keys.sort
        codes = []
        f['pieces'].each do |p|
          keys!(p, %w[id name code], %w[previousCode], context: 'pieza de la guía'); text!(p['name'], 80)
          code = p['code']
          raise ExportError, 'Identificador de pieza inválido.' unless piece_code?(code)
          raise ExportError, 'Código anterior de pieza inválido.' if p.key?('previousCode') && !piece_code?(p['previousCode'])
          prior = previous_pieces[p['id']]
          raise ExportError, 'No se puede cambiar el código de una pieza guardada.' if prior && prior['code'] != code && !f['renumber']
          codes << code
        end
        raise ExportError, 'Hay códigos de pieza repetidos.' unless codes.uniq.length == codes.length
        raise ExportError, 'Una guía admite hasta 40 notas por mueble.' unless f['notes'].is_a?(Array) && f['notes'].length <= 40
        note_ids = []
        f['notes'].each do |n|
          validate_note_format!(n)
          note_ids << n['id']
          piece = pieces[n['pieceId']]
          if piece
            box = piece.dig('metadata', 'localBounds')
            if box && n['anchor'].each_with_index.any? { |v, i| v < box['min'][i] - 0.1 || v > box['max'][i] + 0.1 }
              raise ExportError, 'El ancla queda fuera de la pieza.'
            end
          else
            # Keep an existing orphan until the operator reanchors/deletes it. Never invent a new target.
            prior = previous_notes[n['id']]
            raise ExportError, 'La nota apunta a una pieza inexistente.' unless prior && prior['pieceId'] == n['pieceId'] && prior['anchor'] == n['anchor']
          end
        end
        raise ExportError, 'Hay notas repetidas.' unless note_ids.uniq.length == note_ids.length
      end
      result = JSON.parse(JSON.generate(edits))
      result.each do |f|
        f.delete('groupName') # One-shot model rename intent; the model remains the source of group names.
        f.delete('renumber') # One-shot permission to change saved codes; never stored.
        f['hiddenDimensions'] = hidden_by_furniture[f['id']] if hidden_by_furniture.key?(f['id'])
        prior=old['furniture'].find { |row| row['id']==f['id'] }
        # The store owns the code history: a changed code keeps the one it replaced (already printed labels),
        # an unchanged one keeps its stored history, and client values are ignored.
        prior_pieces=(prior || {}).fetch('pieces', []).to_h { |p| [p['id'], p] }
        f['pieces'].each do |p|
          was=prior_pieces[p['id']]; p.delete('previousCode')
          if was && was['code'] != p['code'] then p['previousCode'] = was['code']
          elsif was && was['previousCode'] then p['previousCode'] = was['previousCode']
          end
        end
        %w[presentation naming groupIdentical].each { |key| f[key]=JSON.parse(JSON.generate(prior[key])) if !f.key?(key) && prior && prior.key?(key) }
        # Inherited settings can refer to pieces deleted since the last analysis.
        # Fresh edits were validated above and must never silently accept foreign paths.
        if f.dig('presentation','guide','hiddenPieceIds')
          f['presentation']['guide']['hiddenPieceIds'].select! { |id| f['pieces'].any? { |piece| piece['id']==id } }
        end
        if f.dig('presentation','dimensionOffsets')
          f['presentation']['dimensionOffsets'].select! { |r| f['pieces'].any? { |p| p['id']==r['pieceId'] } }
        end
        if f['naming']
          f['naming']['reviews']&.select! { |r| f['pieces'].any? { |p| p['id']==r['id'] } }
          f['naming']['bases'].select! { |r| f['pieces'].any? { |p| p['id']==r['id'] } }
        end
        # Grouping is a drawing/table preference. Physical names and bases remain
        # independent until the operator explicitly edits the grouped name.
      end
      result
    end

  end
end
