# frozen_string_literal: true
require 'date'
require 'json'
require_relative 'material_resolver'
require_relative 'ocl_reader'

module PlanosSanto
  # Hito 3: del modelo pintado al TXT con revisión por excepción. Propone filas del pedido,
  # confirma en bloque solo lo inequívoco y copia datos entre filas. Nunca escribe el SKP ni
  # confirma una propuesta por su cuenta: devuelve borradores nuevos y SupplierOrder sigue
  # siendo la única validación que habilita exportar.
  class OrderProposal
    CHECKS=%w[orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed grainConfirmed].freeze
    SIDES=%w[Arriba Abajo Izquierda Derecha].freeze
    DETAIL_CODES=%w[none module_piece].freeze
    MAX_DETAIL=80
    MAX_LINKS=500
    TOLERANCE=0.1
    # Campos que copia cada grupo y verificaciones que invalida si alguno cambia de valor.
    # La compatibilidad placa/canto la vuelve a comprobar Ruby; el mapa de cantos no depende de la placa.
    GROUPS={'material'=>[%w[materialId],%w[materialConfirmed grainConfirmed]],
            'edges'=>[%w[principalId secondaryId edgeMap edgeResolution edgeBindings],%w[edgesConfirmed]],
            'grain'=>[%w[grainAxis grainPolicy],%w[grainConfirmed]],
            'dimensions'=>[%w[dimensionRule cutBase cutHeight reviewNote],%w[dimensionsConfirmed]]}.freeze

    # report: el recorrido de OclReader o un lambda que lo captura recién cuando hace falta.
    def initialize(service,report,catalog,today: Date.today)
      @service=service;@report_source=report;@catalog=catalog;@today=today
      @geometry=service.proposal['geometry']
    end

    def self.bound_item(material,catalog)
      binding=material['native_binding']
      return nil unless material['native_status']=='valid' && binding
      catalog['items'].find { |item| item['id']==binding['catalogId'] && item['kind']==binding['kind'] && item['approved'] && MaterialResolver.item_fingerprint(item)==binding['catalogFingerprint'] }
    end

    # Campos opcionales del borrador (no de las filas): tabla de vínculos y código en el detalle.
    def self.check_extras!(draft)
      links=draft.fetch('edgeLinks',[])
      valid=links.is_a?(Array) && links.length<=MAX_LINKS && links.all? { |l| l.is_a?(Hash) && l.keys.sort==%w[catalogId name observedId] && l.values.all? { |v| v.is_a?(String) && v.length<=200 } && !l['observedId'].empty? && !l['catalogId'].empty? }
      raise ExportError,'Tabla de vínculos de cantos inválida: volvé a preparar el pedido.' unless valid && links.map { |l| l['observedId'] }.uniq.length==links.length
      raise ExportError,'Opción de código en el detalle inválida.' unless DETAIL_CODES.include?(draft.fetch('detailCode','none'))
      nil
    end

    # Código compuesto M03·P07 desde la guía guardada: módulo del mueble y código de la pieza.
    # Sin módulo no se inventa uno; esa pieza queda sin código.
    # Un mismo código en dos piezas (dos muebles con el mismo módulo) queda vacío: se bloquea, no se usa.
    def self.codes(document,guide)
      roots=document.fetch('furniture',[]).to_h { |node| [node['id'],node] }
      found=Array(guide['furniture']).each_with_object({}) do |furniture,out|
        root=roots[furniture['id']];next unless root
        module_code=furniture.dig('naming','moduleCode').to_s.upcase
        module_code=root['name'].to_s[/(?:\A|[^\p{L}\p{N}])(M\d{1,3})(?![\p{L}\p{N}])/i,1].to_s.upcase unless module_code.match?(/\AM\d{1,3}\z/)
        next if module_code.empty?
        furniture['pieces'].each { |piece| out[piece['id']]="#{module_code}·#{piece['code']}" }
      end
      repeated=found.values.tally.select { |_,count| count>1 }.keys
      found.transform_values { |code| repeated.include?(code) ? '' : code }
    end
    def self.detail_text(draft,row,codes)
      code=draft['detailCode']=='module_piece' && codes && codes[row['id']]
      code && !code.empty? ? "#{code} #{row['detail']}" : row['detail']
    end
    def self.detail_reasons(draft,row,codes)
      raise ExportError,'Opción de código en el detalle inválida.' unless DETAIL_CODES.include?(draft.fetch('detailCode','none'))
      return [] unless draft['detailCode']=='module_piece'
      code=codes && codes[row['id']]
      return ['Falta el código módulo·pieza: guardá la guía con el módulo (por ejemplo M01) y los códigos de pieza, o desactivá el código en el detalle.'] unless code
      return ['El código módulo·pieza se repite en otro mueble: corregí el módulo en la guía para que cada mueble tenga el suyo.'] if code.empty?
      return [] if detail_text(draft,row,codes).length<=MAX_DETAIL
      ["El detalle con código (#{code}) supera #{MAX_DETAIL} caracteres: acortalo a #{MAX_DETAIL-code.length-1} caracteres."]
    end

    # Metros de canto por SKU y rol de un lote, con la regla del presupuesto: arriba/abajo suman la base y
    # izquierda/derecha la altura. El bloque recibe la fila y devuelve [base, altura] en mm.
    def self.edge_totals(rows,catalog)
      totals={}
      rows.each do |row|
        base,height=yield(row)
        row['edgeMap'].each_with_index do |role,index|
          next unless [1,2].include?(role)
          id=row[role==1 ? 'principalId' : 'secondaryId']
          entry=totals[[id,role]] ||= {'catalogId'=>id,'sku'=>catalog['items'].find { |item| item['id']==id }&.fetch('sku',nil),'role'=>role==1 ? 'principal' : 'secondary','metres'=>0.0,'sides'=>0,'pieces'=>[]}
          entry['metres']+=(index<2 ? base : height)/1000.0;entry['sides']+=1;entry['pieces'] |= [row['id']]
        end
      end
      totals.values.map { |entry| entry.merge('metres'=>entry['metres'].round(3),'pieces'=>entry['pieces'].length) }
    end

    # 1. Propuesta para las filas incluidas sin ninguna verificación hecha. Las que ya tienen alguna se conservan.
    def propose(draft,ids: nil)
      plan=copy(draft);links=links(plan);results={};staged={}
      plan['rows'].each do |row|
        next unless row['include'] && (ids.nil? || ids.include?(row['id']))
        if CHECKS.any? { |key| row[key] }
          results[row['id']]={'status'=>'kept','reasons'=>['Tiene verificaciones hechas: se conserva sin cambios.']};next
        end
        stage=stage(row,links)
        stage ? staged[row['id']]=stage : results[row['id']]={'status'=>'abstained','reasons'=>['Geometría no rectangular: revisala en la vista 2D o excluila con un motivo.']}
      end
      ranking=Hash.new(0)
      staged.each_value { |stage| stage['sides'].each_with_index { |id,index| ranking[id]+=stage['lengths'][index<2 ? 0 : 1] if id.is_a?(String) } unless stage['blocked'] }
      plan['rows'].each do |row|
        stage=staged[row['id']];next unless stage
        row.merge!(patch(row,stage,ranking))
        results[row['id']]={'status'=>'proposed','reasons'=>stage['reasons']}
      end
      rows=plan['rows'].filter_map do |row|
        result=results[row['id']];next unless result
        reasons=result['status']=='proposed' ? (result['reasons']+bulk_reasons(row,plan)).uniq : result['reasons']
        {'id'=>row['id'],'detail'=>row['detail'],'status'=>result['status'],'bulkReady'=>result['status']=='proposed' && reasons.empty?,'reasons'=>reasons}
      end
      summary={'proposed'=>rows.count { |r| r['status']=='proposed' },'kept'=>rows.count { |r| r['status']=='kept' },'abstained'=>rows.count { |r| r['status']=='abstained' },
               'bulkReady'=>rows.count { |r| r['bulkReady'] },'review'=>rows.count { |r| r['status']=='proposed' && !r['bulkReady'] }}
      {'plan'=>plan,'proposal'=>{'rows'=>rows,'edgeMaterials'=>edge_materials(plan,links),'summary'=>summary}}
    end

    # 2. Confirma las cinco verificaciones solo en filas inequívocas que además pasan la validación completa.
    def confirm_bulk(draft,ids: nil)
      plan=copy(draft);confirmed=[];review=[]
      plan['rows'].each do |row|
        next unless row['include'] && (ids.nil? || ids.include?(row['id'])) && !CHECKS.all? { |key| row[key] }
        reasons=bulk_reasons(row,plan)
        if reasons.empty?
          CHECKS.each { |key| row[key]=true };confirmed << row['id']
        else
          review << {'id'=>row['id'],'detail'=>row['detail'],'reasons'=>reasons}
        end
      end
      {'plan'=>plan,'confirmed'=>confirmed,'review'=>review}
    end

    # 3. Copia grupos de datos a filas equivalentes o elegidas. Solo invalida las verificaciones del grupo
    # cuyo valor cambió de verdad en cada destino; nunca copia verificaciones.
    def apply(draft,source_id,target_ids,groups)
      plan=copy(draft);source=plan['rows'].find { |row| row['id']==source_id }
      raise ExportError,'La pieza de origen no está en el pedido.' unless source
      counts={'applied'=>0,'edgesSkipped'=>0,'cutsSwapped'=>0,'dimensionsSkipped'=>0};invalidated={}
      plan['rows'].each do |row|
        next if row['id']==source_id || !target_ids.include?(row['id'])
        patch={}
        patch['materialId']=source['materialId'] if groups['material']
        if groups['edges']
          if same_view?(source,row)
            patch.merge!(source.slice('principalId','secondaryId'),'edgeMap'=>source['edgeMap'].dup,'edgeResolution'=>source['edgeResolution']=='observed' ? 'observed' : nil,
              'edgeBindings'=>(row['edgeBindings'].reject { |b| source['edgeBindings'].any? { |s| s['observedId']==b['observedId'] } }+source['edgeBindings']).map(&:dup))
          else
            counts['edgesSkipped']+=1
          end
        end
        patch.merge!(source.slice('grainAxis','grainPolicy')) if groups['grain']
        if groups['dimensions']
          cut=cut_for(source,row,counts)
          cut ? patch.merge!(cut,'reviewNote'=>source['reviewNote']) : counts['dimensionsSkipped']+=1
        end
        changed=patch.reject { |key,value| row[key]==value }
        next if changed.empty?
        lost=GROUPS.values.select { |fields,_| (fields & changed.keys).any? }.flat_map(&:last).uniq.select { |key| row[key] }
        row.merge!(changed);lost.each { |key| row[key]=false }
        invalidated[row['id']]=lost unless lost.empty?
        counts['applied']+=1
      end
      counts.merge('plan'=>plan,'invalidated'=>invalidated)
    end

    private

    def report;@report ||= @report_source.respond_to?(:call) ? @report_source.call : @report_source;end
    def copy(draft);JSON.parse(JSON.generate(draft));end
    def sheet(id);@catalog['items'].find { |item| item['id']==id && item['kind']=='sheet' && item['approved'] };end
    def edge(id);@catalog['items'].find { |item| item['id']==id && item['kind']=='edge' && item['approved'] };end
    def piece(id);report['pieces'].find { |piece| piece['path'].join('/')==id };end
    def used_materials(id)
      piece=piece(id);return [] unless piece
      ids=piece['faces'].flat_map { |face| [face['front_material_id'],face['back_material_id']] }.compact.uniq
      report['materials'].select { |material| ids.include?(material['id']) }
    end
    def links(plan);Array(plan['edgeLinks']).to_h { |link| [link['observedId'],link['catalogId']] };end
    # Canto de biblioteca de un material observado: el vínculo nativo manda; si no hay, la tabla del borrador.
    def edge_for(material,links)
      native=material['native_status']=='valid' && material['native_binding']
      return [self.class.bound_item(material,@catalog)&.then { |item| item['kind']=='edge' ? item : nil },true] if native
      [edge(links[material['id']]),false]
    end

    def stage(row,links)
      g=@geometry.fetch(row['id']);return nil unless g['rectangular']
      reasons=[];lengths=g['lengths'];materials=used_materials(row['id'])
      sheets=materials.select { |m| m['category']=='sheet' && m['native_status']=='valid' }
      board=sheets.size==1 ? self.class.bound_item(sheets.first,@catalog) : nil
      reasons << 'Hay más de una placa pintada en la pieza: elegí la placa.' if sheets.size>1
      reasons << 'La placa pintada no coincide con un ítem aprobado vigente de la biblioteca.' if sheets.size==1 && !board
      board ||= sheet(row['materialId'])
      reasons << 'Sin placa vinculada: pintá la pieza con una placa de la biblioteca o elegila.' if board.nil? && sheets.empty?
      thickness=thickness_axis(lengths,board,reasons)
      u,v=([0,1,2]-[thickness]).sort_by { |i| [-lengths[i],i] }
      reasons << 'Largo igual al ancho: confirmá la orientación en la vista 2D.' if (lengths[u]-lengths[v]).abs<=TOLERANCE
      reasons << 'La placa no tiene la veta confirmada en la biblioteca.' if board && board['grain'].nil?
      orientation={'axes'=>[u,v],'frontSign'=>[[0,1],[1,2],[2,0]].include?([u,v]) ? 1 : -1,'flipX'=>false,'flipY'=>false}
      observation=OclReader.projected_edges(report,row.merge(orientation),g)
      names=observation['materials'].to_h { |m| [m['id'],m['name']] };bindings=[]
      sides=observation['sides'].each_with_index.map do |side,index|
        next 0 if side['status']=='observed_no_edge'
        if side['status']!='observed_edge' || side['materialIds'].size!=1
          reasons << "#{SIDES[index]}: lado sin resolver. #{side['reason']}";next nil
        end
        id=side['materialIds'].first;material=report['materials'].find { |m| m['id']==id }
        item,native=edge_for(material,links)
        unless item
          reasons << (native ? "El canto nativo «#{names[id]}» no coincide con un canto aprobado vigente de la biblioteca." : "Vinculá «#{names[id]}» con un canto en «Vínculos de cantos del borrador».")
          next nil
        end
        bindings << {'observedId'=>id,'catalogId'=>item['id']};item['id']
      end
      skus=sides.grep(String).uniq
      blocked=skus.length>2
      reasons << "La pieza tiene #{skus.length} cantos distintos (#{skus.map { |id| edge(id)['sku'] }.join(', ')}): el pedido admite como máximo 2 por pieza (principal y secundario)." if blocked
      {'orientation'=>orientation,'board'=>board,'sides'=>sides,'bindings'=>bindings.uniq,'blocked'=>blocked,'complete'=>!blocked && !sides.include?(nil),
       'lengths'=>[lengths[u],lengths[v]],'reasons'=>reasons,'axesChanged'=>!row['axes'].nil? && row['axes']!=[u,v]}
    end
    # Eje del espesor: el único que mide lo que la placa. Sin placa o sin coincidencia, el más chico, con aviso.
    def thickness_axis(lengths,board,reasons)
      smallest=(0..2).min_by { |i| [lengths[i],i] }
      return smallest unless board && board['thicknessMm'].is_a?(Numeric)
      matches=(0..2).select { |i| (lengths[i]-board['thicknessMm']).abs<=TOLERANCE }
      return matches.first if matches.size==1
      reasons << (matches.empty? ? "Ningún eje mide el espesor de la placa (#{board['thicknessMm']} mm): revisá la placa o el modelo." : 'Dos ejes miden el espesor de la placa: elegí ejes y cara en la vista 2D.')
      matches.empty? ? smallest : matches.min_by { |i| [lengths[i],i] }
    end
    def patch(row,stage,ranking)
      roles=stage['complete'] ? stage['sides'].grep(String).uniq.sort_by { |id| [-ranking[id],id] } : []
      edge_map=stage['complete'] ? stage['sides'].map { |id| id.is_a?(String) ? roles.index(id)+1 : 0 } : [0,0,0,0]
      kept=row['edgeBindings'].reject { |b| stage['bindings'].any? { |s| s['observedId']==b['observedId'] } }
      board=stage['board'];grain=board && board['grain']==true ? 'u' : board && board['grain']==false ? 'none' : nil
      note=row['reviewNote'].strip.length>=8 ? row['reviewNote'] : "Propuesta automática desde el modelo (#{@today.iso8601}): medidas terminadas del modelo aceptadas; validar con la maderera."
      dimensions=row['dimensionRule']=='explicit_cut' && !stage['axesChanged'] ? {} : {'dimensionRule'=>'finished_accepted','cutBase'=>nil,'cutHeight'=>nil}
      stage['orientation'].merge('materialId'=>board ? board['id'] : row['materialId'],'principalId'=>roles[0],'secondaryId'=>roles[1],'edgeMap'=>edge_map,
        'edgeResolution'=>stage['complete'] ? 'observed' : nil,'edgeBindings'=>kept+stage['bindings'],'edgeOverrideReason'=>'',
        'grainAxis'=>grain,'grainPolicy'=>'locked','reviewNote'=>note).merge(dimensions)
    end
    def edge_materials(plan,links)
      found={}
      plan['rows'].each do |row|
        next unless row['include']
        used_materials(row['id']).each do |material|
          next unless material['category']=='edge'
          entry=found[material['id']] ||= begin
            item,native=edge_for(material,links)
            {'observedId'=>material['id'],'name'=>material['name'],'native'=>native ? true : false,'catalogId'=>item && item['id'],'pieces'=>0}
          end
          entry['pieces']+=1
        end
      end
      found.values
    end

    # Criterio de «Confirmar en bloque». Vacío solo si la fila es inequívoca y Ruby la exportaría confirmada.
    def bulk_reasons(row,draft)
      g=@geometry.fetch(row['id'])
      return ['Geometría no rectangular: se revisa pieza por pieza.'] unless g['rectangular']
      reasons=[];axes=row['axes']
      reasons << 'Instancia espejada: confirmá cara y orientación en la vista 2D.' if g['mirrored']
      return reasons+['Faltan ejes y cara de la vista 2D.'] unless axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |n| n.is_a?(Integer) && n.between?(0,2) } && [-1,1].include?(row['frontSign'])
      lengths=g['lengths']
      reasons << 'Largo igual al ancho: confirmá la orientación en la vista 2D.' if (lengths[axes[0]]-lengths[axes[1]]).abs<=TOLERANCE
      board=sheet(row['materialId']);w=([0,1,2]-axes).first;thickness=lengths[w]
      if board.nil? then reasons << 'Sin placa aprobada.'
      elsif !board['thicknessMm'].is_a?(Numeric) || (thickness-board['thicknessMm']).abs>TOLERANCE then reasons << "El espesor no coincide con la placa: el eje de espesor mide #{@service.mm(thickness)} mm."
      elsif (0..2).count { |i| (lengths[i]-board['thicknessMm']).abs<=TOLERANCE }>1 then reasons << 'Dos ejes miden el espesor de la placa: elegí ejes y cara en la vista 2D.'
      elsif axes.any? { |i| lengths[i]<thickness-TOLERANCE } then reasons << 'Un lado es más chico que el espesor de la placa: confirmá ejes y espesor en la vista 2D.'
      end
      reasons << 'Placa con veta: confirmá la dirección de la veta en la vista 2D.' if board && board['grain']==true
      unresolved=OclReader.projected_edges(report,row,g)['sides'].each_with_index.select { |side,_| side['status']=='unresolved' }.map { |_,index| SIDES[index] }
      reasons << "Lados sin resolver: #{unresolved.join(', ')}." unless unresolved.empty?
      reasons << 'Cantos sin caras observadas: la revisión manual se confirma pieza por pieza.' unless row['edgeResolution']=='observed'
      # Vista desde el dorso = izquierda y derecha intercambiadas. Solo es la misma pieza si el mapa no cambia
      # al darla vuelta (izquierda = derecha, o arriba = abajo con un giro de 180°); si no, depende de la cara vista.
      map=row['edgeMap']
      reasons << 'Cantos asimétricos que dependen de la cara vista: confirmá la cara vista en la vista 2D.' if map.is_a?(Array) && map.length==4 && map[2]!=map[3] && map[0]!=map[1]
      return reasons unless reasons.empty?
      @service.validate_row(row.merge(CHECKS.to_h { |key| [key,true] }),collect:true)+self.class.detail_reasons(draft,row,@service.detail_codes)
    end

    def same_view?(a,b);a['axes'] && a['axes']==b['axes'] && %w[frontSign flipX flipY].all? { |key| a[key]==b[key] };end
    def equivalent?(a,b)
      ga=@geometry[a['id']];gb=@geometry[b['id']]
      return false unless ga && gb && ga['mirrored']==gb['mirrored'] && ga['rectangular']==gb['rectangular']
      ga['lengths'].sort.zip(gb['lengths'].sort).all? { |x,y| (x-y).abs<=TOLERANCE }
    end
    # Medidas a copiar al destino, o nil si un corte explícito no corresponde a esa pieza.
    def cut_for(source,row,counts)
      return {'dimensionRule'=>source['dimensionRule'],'cutBase'=>nil,'cutHeight'=>nil} unless source['dimensionRule']=='explicit_cut'
      return nil unless equivalent?(source,row) && source['axes'] && row['axes']
      base=@geometry[source['id']]['lengths'][source['axes'][0]];target=@geometry[row['id']]['lengths']
      cut=[source['cutBase'],source['cutHeight']]
      if (base-target[row['axes'][0]]).abs>TOLERANCE && (base-target[row['axes'][1]]).abs<=TOLERANCE
        cut.reverse!;counts['cutsSwapped']+=1
      end
      {'dimensionRule'=>'explicit_cut','cutBase'=>cut[0],'cutHeight'=>cut[1]}
    end
  end
end
