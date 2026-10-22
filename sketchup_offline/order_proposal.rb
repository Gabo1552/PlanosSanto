# frozen_string_literal: true
require 'date'
require 'json'
require_relative 'material_resolver'
require_relative 'ocl_reader'

module PlanosSanto
  # Del modelo pintado al TXT (0.8.16): el pedido se propone solo al abrirlo desde lo pintado y nunca pide
  # tildes de revisión. Cada propuesta deja en el borrador su línea de base (`proposed`): lo que el taller
  # cambió a mano se reconoce porque difiere de esa base y se conserva cuando el modelo, la biblioteca o el
  # perfil cambian; lo que no tocó sigue al modelo. Nunca escribe el SKP; SupplierOrder valida lo físico.
  class OrderProposal
    SIDES=%w[Arriba Abajo Izquierda Derecha].freeze
    DETAIL_CODES=%w[none module_piece].freeze
    MAX_DETAIL=80
    MAX_LINKS=500
    MAX_ROWS=20_000
    TOLERANCE=0.1
    # Fields the model proposes, in groups that are kept or followed as a whole.
    PROPOSED={'detail'=>%w[detail],'orientation'=>%w[axes frontSign flipX flipY],'material'=>%w[materialId],
              'edges'=>%w[principalId secondaryId edgeMap edgeBindings],'grain'=>%w[grainPolicy],'dimensions'=>%w[dimensionRule cutBase cutHeight]}.freeze
    # «Aplicar a otras piezas»: fields copied per group. Nothing is invalidated: there are no ticks left.
    GROUPS={'material'=>%w[materialId],'edges'=>%w[principalId secondaryId edgeMap edgeBindings],'grain'=>%w[grainPolicy],'dimensions'=>%w[dimensionRule cutBase cutHeight]}.freeze
    NOTE_GROUPS=%w[orientation material edges].freeze

    # report: el recorrido de OclReader o un lambda que lo captura recién cuando hace falta.
    def initialize(service,report,catalog,today: Date.today)
      @service=service;@report_source=report;@catalog=catalog;@today=today
      @geometry=service.proposal['geometry']
    end

    # Library item a painted material is bound to (Planos Santo native binding). The id and kind are what
    # the order needs; the ficha's own data may change after painting (completing it is not a new binding).
    def self.bound_item(material,catalog)
      binding=material['native_binding']
      return nil unless material['native_status']=='valid' && binding
      catalog['items'].find { |item| item['id']==binding['catalogId'] && item['kind']==binding['kind'] }
    end

    # Campos opcionales del borrador (no de las filas): vínculos de cantos, código en el detalle y línea de base.
    def self.check_extras!(draft)
      links=draft.fetch('edgeLinks',[])
      valid=links.is_a?(Array) && links.length<=MAX_LINKS && links.all? { |l| l.is_a?(Hash) && l.keys.sort==%w[catalogId name observedId] && l.values.all? { |v| v.is_a?(String) && v.length<=200 } && !l['observedId'].empty? && !l['catalogId'].empty? }
      raise ExportError,'Tabla de vínculos de cantos inválida: volvé a proponer el pedido desde el modelo.' unless valid && links.map { |l| l['observedId'] }.uniq.length==links.length
      raise ExportError,'Opción de código en el detalle inválida.' unless DETAIL_CODES.include?(draft.fetch('detailCode','none'))
      proposed=draft.fetch('proposed',{})
      shape=proposed.is_a?(Hash) && proposed.length<=MAX_ROWS && proposed.all? do |id,entry|
        id.is_a?(String) && entry.is_a?(Hash) && entry['values'].is_a?(Hash) && entry.fetch('edgeBlockers',[]).is_a?(Array) && entry.fetch('edgeBlockers',[]).all?(String) &&
          entry.fetch('notes',[]).is_a?(Array) && entry.fetch('notes',[]).all? { |n| n.is_a?(Hash) && NOTE_GROUPS.include?(n['group']) && n['text'].is_a?(String) }
      end
      raise ExportError,'Propuesta del pedido dañada: volvé a proponer el pedido desde el modelo.' unless shape
      nil
    end

    def self.baseline(draft,id)
      entry=draft.is_a?(Hash) && draft['proposed'].is_a?(Hash) ? draft['proposed'][id] : nil
      entry.is_a?(Hash) && entry['values'].is_a?(Hash) ? entry : nil
    end
    # True while the row still holds what the model proposed for that group.
    def self.same_group?(row,values,group);PROPOSED.fetch(group).all? { |key| values.key?(key) && row[key]==values[key] };end
    # «Más de dos cantos por pieza» (se mantiene): blocks while the edges are still the model's own.
    def self.edge_blockers(draft,row)
      entry=baseline(draft,row['id'])
      entry && same_group?(row,entry['values'],'edges') ? Array(entry['edgeBlockers']).grep(String) : []
    end
    # Non-blocking notes of the proposal that still apply (their group was not edited by hand).
    def self.notes(draft,row)
      entry=baseline(draft,row['id']);return [] unless entry
      Array(entry['notes']).select { |note| note.is_a?(Hash) && PROPOSED.key?(note['group']) && same_group?(row,entry['values'],note['group']) }.map { |note| note['text'] }
    end
    def self.edge_source(draft,row)
      entry=baseline(draft,row['id'])
      entry && same_group?(row,entry['values'],'edges') ? 'model' : 'manual'
    end

    # Punto 10: cruza un borrador guardado con la propuesta nueva por id de fila. Las filas que siguen
    # existiendo conservan cada grupo editado a mano; las nuevas quedan propuestas; las que desaparecieron se quitan.
    def self.merge(stored,fresh)
      stored=SupplierOrder.normalize(stored)
      plan=JSON.parse(JSON.generate(fresh))
      old_rows=stored['rows'].select { |row| row.is_a?(Hash) && row['id'].is_a?(String) }.to_h { |row| [row['id'],row] }
      fresh_ids=plan['rows'].map { |row| row['id'] }
      stats={'kept'=>0,'added'=>0,'removed'=>(old_rows.keys-fresh_ids).length}
      plan['rows'].map! do |row|
        old=old_rows[row['id']]
        unless old
          stats['added']+=1;next row
        end
        merged=row.merge(old.slice('include','excludeReason'))
        entry=baseline(stored,row['id'])
        follows_orientation=true;edited=false
        PROPOSED.each do |group,fields|
          mine=entry ? !same_group?(old,entry['values'],group) : !blank_group?(old,group)
          # Edges and explicit cuts are relative to the view: a hand-made orientation keeps them too.
          mine ||= %w[edges dimensions].include?(group) && !follows_orientation
          next unless mine
          fields.each { |key| merged[key]=JSON.parse(JSON.generate(old[key])) if old.key?(key) }
          follows_orientation=false if group=='orientation'
          edited=true
        end
        stats['kept']+=1 if edited || merged['include']!=row['include']
        merged
      end
      plan['profile']=stored['profile'] if stored['profile'].is_a?(Hash)
      plan['detailCode']=stored['detailCode'] if DETAIL_CODES.include?(stored['detailCode'])
      {'plan'=>plan,'merge'=>stats}
    end
    # Draft saved before 0.8.16 (no baseline): a group the taller never filled in follows the model.
    def self.blank_group?(row,group)
      case group
      when 'orientation' then row['axes'].nil? || row['frontSign'].nil?
      when 'material' then row['materialId'].to_s.empty?
      when 'edges' then row['principalId'].nil? && row['secondaryId'].nil? && Array(row['edgeMap']).all? { |v| v==0 }
      when 'detail' then row['detail'].to_s.strip.empty?
      when 'grain' then row['grainPolicy']!='rotate'
      when 'dimensions' then row['dimensionRule']!='explicit_cut'
      else true
      end
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

    # Propuesta desde el modelo para todas las filas (o las elegidas). Escribe la línea de base de cada fila.
    def propose(draft,ids: nil)
      plan=SupplierOrder.normalize(copy(draft));links=links(plan);results={};staged={}
      plan['proposed']=plan['proposed'].is_a?(Hash) ? plan['proposed'] : {}
      plan['rows'].each do |row|
        next unless ids.nil? || ids.include?(row['id'])
        stage=stage(row,links)
        if stage
          staged[row['id']]=stage
        else
          plan['proposed'][row['id']]={'values'=>values(row),'edgeBlockers'=>[],'notes'=>[]}
          results[row['id']]={'status'=>'abstained','notes'=>['Pieza no rectangular: no se propone; excluila o corregila en el modelo.']}
        end
      end
      ranking=Hash.new(0)
      staged.each_value { |stage| stage['sides'].each_with_index { |id,index| ranking[id]+=stage['lengths'][index<2 ? 0 : 1] if id.is_a?(String) } unless stage['blocked'] }
      plan['rows'].each do |row|
        stage=staged[row['id']];next unless stage
        row.merge!(patch(row,stage,ranking))
        plan['proposed'][row['id']]={'values'=>values(row),'edgeBlockers'=>stage['blockers'],'notes'=>stage['notes']}
        results[row['id']]={'status'=>'proposed','notes'=>stage['notes'].map { |note| note['text'] }}
      end
      rows=plan['rows'].filter_map do |row|
        result=results[row['id']];next unless result
        {'id'=>row['id'],'detail'=>row['detail'],'status'=>result['status'],'notes'=>result['notes']}
      end
      summary={'proposed'=>rows.count { |r| r['status']=='proposed' },'abstained'=>rows.count { |r| r['status']=='abstained' },'withNotes'=>rows.count { |r| !r['notes'].empty? }}
      {'plan'=>plan,'proposal'=>{'rows'=>rows,'edgeMaterials'=>edge_materials(plan,links),'summary'=>summary}}
    end

    # Copia grupos de datos a filas equivalentes o elegidas. Ya no hay verificaciones que invalidar.
    def apply(draft,source_id,target_ids,groups)
      plan=SupplierOrder.normalize(copy(draft));source=plan['rows'].find { |row| row['id']==source_id }
      raise ExportError,'La pieza de origen no está en el pedido.' unless source
      counts={'applied'=>0,'edgesSkipped'=>0,'cutsSwapped'=>0,'dimensionsSkipped'=>0}
      plan['rows'].each do |row|
        next if row['id']==source_id || !target_ids.include?(row['id'])
        patch={}
        patch['materialId']=source['materialId'] if groups['material']
        if groups['edges']
          if same_view?(source,row)
            patch.merge!(source.slice('principalId','secondaryId'),'edgeMap'=>source['edgeMap'].dup,
              'edgeBindings'=>(row['edgeBindings'].reject { |b| source['edgeBindings'].any? { |s| s['observedId']==b['observedId'] } }+source['edgeBindings']).map(&:dup))
          else
            counts['edgesSkipped']+=1
          end
        end
        patch.merge!(source.slice('grainPolicy')) if groups['grain']
        if groups['dimensions']
          cut=cut_for(source,row,counts)
          cut ? patch.merge!(cut) : counts['dimensionsSkipped']+=1
        end
        changed=patch.reject { |key,value| row[key]==value }
        next if changed.empty?
        row.merge!(changed)
        counts['applied']+=1
      end
      counts.merge('plan'=>plan)
    end

    private

    def report;@report ||= @report_source.respond_to?(:call) ? @report_source.call : @report_source;end
    def copy(draft);JSON.parse(JSON.generate(draft));end
    def values(row);PROPOSED.values.flatten.to_h { |key| [key,JSON.parse(JSON.generate(row[key]))] };end
    def sheet(id);id.is_a?(String) && !id.empty? ? @catalog['items'].find { |item| item['id']==id && item['kind']=='sheet' } : nil;end
    def edge(id);id.is_a?(String) && !id.empty? ? @catalog['items'].find { |item| item['id']==id && item['kind']=='edge' } : nil;end
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
    def note(group,text);{'group'=>group,'text'=>text};end

    def stage(row,links)
      g=@geometry.fetch(row['id']);return nil unless g['rectangular']
      notes=[];blockers=[];lengths=g['lengths'];materials=used_materials(row['id'])
      sheets=materials.select { |m| m['category']=='sheet' && m['native_status']=='valid' }
      board=sheets.size==1 ? self.class.bound_item(sheets.first,@catalog) : nil
      notes << note('material','Hay más de una placa pintada en la pieza: elegí la placa.') if sheets.size>1
      notes << note('material','La placa pintada ya no está en la biblioteca: elegí la placa.') if sheets.size==1 && !board
      board ||= sheet(row['materialId'])
      notes << note('material','Sin placa pintada: pintá la pieza con una placa de la biblioteca o elegila acá.') if board.nil? && sheets.empty?
      thickness=thickness_axis(lengths,board,notes)
      u,v=([0,1,2]-[thickness]).sort_by { |i| [-lengths[i],i] }
      notes << note('orientation','Largo igual al ancho: revisá qué lado es la base en la vista 2D.') if (lengths[u]-lengths[v]).abs<=TOLERANCE && board && board['grain']==true
      notes << note('orientation','Instancia espejada en el modelo: revisá la cara vista en la vista 2D.') if g['mirrored']
      orientation={'axes'=>[u,v],'frontSign'=>[[0,1],[1,2],[2,0]].include?([u,v]) ? 1 : -1,'flipX'=>false,'flipY'=>false}
      observation=OclReader.projected_edges(report,row.merge(orientation),g)
      names=observation['materials'].to_h { |m| [m['id'],m['name']] };bindings=[]
      sides=observation['sides'].each_with_index.map do |side,index|
        next 0 if side['status']=='observed_no_edge'
        if side['status']!='observed_edge' || side['materialIds'].size!=1
          notes << note('edges',"#{SIDES[index]}: no se pudo leer el canto del modelo; quedó sin canto. Revisalo o asignalo a mano.");next 0
        end
        id=side['materialIds'].first;material=report['materials'].find { |m| m['id']==id }
        item,native=edge_for(material,links)
        unless item
          notes << note('edges',native ? "#{SIDES[index]}: el canto pintado «#{names[id]}» ya no está en la biblioteca; quedó sin canto." : "#{SIDES[index]}: vinculá «#{names[id]}» con un canto en «Cantos pintados sin vínculo»; mientras tanto quedó sin canto.")
          next 0
        end
        bindings << {'observedId'=>id,'catalogId'=>item['id']};item['id']
      end
      skus=sides.grep(String).uniq
      blocked=skus.length>2
      blockers << "La pieza tiene #{skus.length} cantos distintos pintados (#{skus.map { |id| edge(id)['sku'].to_s.strip.empty? ? edge(id)['name'] : edge(id)['sku'] }.join(', ')}): el pedido admite como máximo 2 por pieza (principal y secundario). Asigná los cantos a mano o repintá la pieza." if blocked
      {'orientation'=>orientation,'board'=>board,'sides'=>blocked ? [0,0,0,0] : sides,'bindings'=>bindings.uniq,'blocked'=>blocked,
       'lengths'=>[lengths[u],lengths[v]],'notes'=>notes,'blockers'=>blockers}
    end
    # Eje del espesor: el único que mide lo que la placa. Sin placa o sin coincidencia, el más chico.
    def thickness_axis(lengths,board,notes)
      smallest=(0..2).min_by { |i| [lengths[i],i] }
      return smallest unless board && board['thicknessMm'].is_a?(Numeric)
      matches=(0..2).select { |i| (lengths[i]-board['thicknessMm']).abs<=TOLERANCE }
      return matches.first if matches.size==1
      notes << note('orientation','Dos ejes miden el espesor de la placa: revisá ejes y cara en la vista 2D.') if matches.size>1
      matches.empty? ? smallest : matches.min_by { |i| [lengths[i],i] }
    end
    def patch(row,stage,ranking)
      roles=stage['sides'].grep(String).uniq.sort_by { |id| [-ranking[id],id] }
      edge_map=stage['sides'].map { |id| id.is_a?(String) ? roles.index(id)+1 : 0 }
      kept=row['edgeBindings'].reject { |b| stage['bindings'].any? { |s| s['observedId']==b['observedId'] } }
      board=stage['board']
      stage['orientation'].merge('materialId'=>board ? board['id'] : row['materialId'],'principalId'=>roles[0],'secondaryId'=>roles[1],'edgeMap'=>edge_map,
        'edgeBindings'=>kept+stage['bindings'],'grainPolicy'=>'locked','dimensionRule'=>'finished_accepted','cutBase'=>nil,'cutHeight'=>nil)
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
