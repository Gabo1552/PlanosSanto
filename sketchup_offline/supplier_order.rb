# frozen_string_literal: true
require 'json'
require 'digest'
require 'fileutils'
require 'securerandom'
require 'time'
require 'date'
require_relative 'maderera_profile'
require_relative 'order_proposal'

module PlanosSanto
  class SupplierOrder
    COLUMNS=%w[cant base altura detalle rota canto_arr canto_aba canto_izq canto_der].freeze
    # Hito 3: código módulo·pieza por id de fila (F-DESP-C); lo calcula Workshop desde la guía guardada.
    attr_accessor :detail_codes
    attr_reader :catalog
    # 0.8.16: a row holds data, never «I checked it» ticks. The legacy keys of drafts saved by 0.8.15
    # (five confirmations, review note, edge resolution, grain axis) are dropped on read, never trusted.
    ROW_KEYS=%w[id include excludeReason detail axes flipX flipY frontSign materialId principalId secondaryId edgeMap grainPolicy dimensionRule cutBase cutHeight edgeBindings].freeze
    LEGACY_ROW_KEYS=%w[grainAxis grainConfirmed orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed reviewNote edgeResolution edgeOverrideReason].freeze
    ROW_DEFAULTS={'include'=>true,'excludeReason'=>'','detail'=>'','axes'=>nil,'flipX'=>false,'flipY'=>false,'frontSign'=>nil,'materialId'=>'','principalId'=>nil,'secondaryId'=>nil,
      'edgeMap'=>[0,0,0,0],'grainPolicy'=>'locked','dimensionRule'=>'finished_accepted','cutBase'=>nil,'cutHeight'=>nil,'edgeBindings'=>[]}.freeze
    MAX_DETAIL=80
    # Same row in the 0.8.16 shape: legacy keys out, missing keys with their default (rota 0, medidas terminadas).
    def self.normalize_row(row)
      return row unless row.is_a?(Hash)
      out=row.reject { |key,_| LEGACY_ROW_KEYS.include?(key) }
      ROW_DEFAULTS.each { |key,value| out[key]=Marshal.load(Marshal.dump(value)) unless out.key?(key) }
      out['grainPolicy']='locked' if out['grainPolicy'].nil?
      out['dimensionRule']='finished_accepted' if out['dimensionRule'].nil?
      out['excludeReason']='' if out['excludeReason'].nil?
      out
    end
    def self.normalize(draft)
      return draft unless draft.is_a?(Hash) && draft['rows'].is_a?(Array)
      copy=Marshal.load(Marshal.dump(draft));copy['rows']=copy['rows'].map { |row| normalize_row(row) };copy
    end
    # Grain follows the board (0.8.16): with grain it runs along the base (U); without grain there is none.
    def self.grain_axis(board);board && board['grain']==true ? 'u' : 'none';end

    def initialize(document,fingerprint,catalog,material_proposal: nil, maderera: nil)
      @document=document;@fingerprint=fingerprint;@catalog=catalog;@nodes={};@material_proposal=material_proposal
      # Hito 4: only an approved supplier profile changes defaults, cut sizes or the estimate.
      @maderera=MaderaProfile.applies?(maderera) ? maderera : nil
      Exporter.each_node(document['furniture']) { |node| @nodes[node['id']]=node if node['mesh'] }
    end
    def ids;@nodes.keys;end
    def geometry(node)
      (@geometry ||= {})[node['id']] ||= measure(node)
    end
    def measure(node)
      meta=node.fetch('metadata');bounds=meta.fetch('localBounds');matrix=meta.fetch('worldTransform')
      scales=[0,4,8].map { |index| Math.sqrt(matrix[index,3].sum { |n| n*n }) }
      orthogonal=[[0,1],[0,2],[1,2]].all? { |a,b| scales[a]>0 && scales[b]>0 && (3.times.sum { |i| matrix[a*4+i]*matrix[b*4+i] }/(scales[a]*scales[b])).abs<1e-6 }
      lengths=3.times.map { |i| (bounds['max'][i]-bounds['min'][i])*scales[i] }
      determinant=matrix[0]*(matrix[5]*matrix[10]-matrix[6]*matrix[9])-matrix[4]*(matrix[1]*matrix[10]-matrix[2]*matrix[9])+matrix[8]*(matrix[1]*matrix[6]-matrix[2]*matrix[5])
      {'lengths'=>lengths,'bounds'=>bounds,'scales'=>scales,'mirrored'=>determinant<0,'rectangular'=>meta['rectangular']==true && orthogonal,
       'vertices'=>node['mesh']['vertices'],'triangles'=>node['mesh']['triangles']}
    end
    # Bare rows (one per physical piece) before the model proposal fills them.
    def proposal
      {'schema'=>1,'fingerprint'=>@fingerprint,'catalogRevision'=>@catalog['revision'],'maderera'=>MaderaProfile.binding(@maderera),'profile'=>@maderera ? @maderera.slice('encoding','decimal','header') : {'encoding'=>'utf8','decimal'=>'.','header'=>false},
       'rows'=>@nodes.values.map do |node|
         self.class.normalize_row({'id'=>node['id'],'detail'=>node['name'].to_s[0,MAX_DETAIL]}.merge(@material_proposal ? @material_proposal.call(node['id']) : {}))
       end,
       'geometry'=>@nodes.transform_values { |node| geometry(node) }}
    end
    # Returns the normalized draft (or, in collect mode, every problem per included row). Only physical
    # problems and data an order cannot go without block: there is nothing left to tick.
    def validate(draft,collect_errors: false)
      errors=[]
      raise ExportError,'El modelo cambió desde que se preparó el pedido: volvé a abrir el pedido y se actualiza solo.' unless draft.is_a?(Hash) && draft['schema']==1 && draft['fingerprint']==@fingerprint
      raise ExportError,'La biblioteca cambió desde que se preparó el pedido: volvé a abrir el pedido y se actualiza solo.' unless draft['catalogRevision']==@catalog['revision']
      raise ExportError,'El perfil de maderera en uso cambió: volvé a abrir el pedido y se actualiza solo.' unless draft['maderera']==MaderaProfile.binding(@maderera)
      draft=self.class.normalize(draft)
      rows=draft['rows'];raise ExportError,'Listado físico de pedido incompleto o duplicado.' unless rows.is_a?(Array) && rows.map { |r| r.is_a?(Hash) ? r['id'] : nil }.sort_by(&:to_s)==@nodes.keys.sort
      profile=draft['profile'];raise ExportError,'El perfil del archivo TXT no es válido: revisá codificación, decimal y encabezado en «Perfil del archivo para la maderera».' unless profile.is_a?(Hash) && profile.keys.sort==%w[decimal encoding header] && %w[utf8 windows1252].include?(profile['encoding']) && ['.',','].include?(profile['decimal']) && [true,false].include?(profile['header'])
      rows.each do |row|
        raise ExportError,'Campos de pedido no permitidos.' unless row.keys.sort==ROW_KEYS.sort
        raise ExportError,'Estado de inclusión inválido.' unless [true,false].include?(row['include'])
        %w[excludeReason detail].each { |key| CatalogStore.new.text(row[key]) }
        # An excluded piece needs no reason: the note is optional and only travels in the manifest.
        next unless row['include']
        if collect_errors
          reasons=(validate_row(row,collect:true)+OrderProposal.edge_blockers(draft,row)+OrderProposal.detail_reasons(draft,row,@detail_codes)).uniq
          errors << {'id'=>row['id'],'detail'=>row['detail'],'reason'=>reasons.first,'reasons'=>reasons} unless reasons.empty?
        else
          begin
            validate_row(row)
            (OrderProposal.edge_blockers(draft,row)+OrderProposal.detail_reasons(draft,row,@detail_codes)).each { |reason| raise ExportError,reason }
          rescue ExportError => error
            # Check/export stop at the first problem: name the piece so the message is actionable.
            raise ExportError,"#{row['detail'].to_s.strip.empty? ? 'Pieza sin detalle' : row['detail']} (#{row['id']}): #{error.message}"
          end
        end
      end
      raise ExportError,'No hay piezas incluidas en el pedido.' unless rows.any? { |row| row['include'] }
      collect_errors ? errors : draft
    end
    # Any ficha of the library serves while it is complete; nothing is «approved» by hand any more.
    def material(id,kind,role: nil)
      found=id.is_a?(String) && !id.empty? && @catalog['items'].find { |item| item['id']==id && item['kind']==kind }
      raise ExportError,"Elegí #{kind=='sheet' ? 'una placa' : "un canto#{role ? " #{role}" : ''}"} de la biblioteca." unless found
      missing=CatalogStore.missing(found)
      raise ExportError,"La ficha #{kind=='sheet' ? 'de la placa' : 'del canto'} «#{found['name']}» está incompleta: falta #{missing.join(', ')}. Completala en la biblioteca." unless missing.empty?
      found
    end
    def mm(number)
      # Same convention as the UI (es-AR): 1.234,5
      whole,fraction=format('%.2f',number).split('.')
      whole=whole.reverse.scan(/\d{1,3}/).join('.').reverse.prepend(number<0 ? '-' : '')
      fraction=fraction.sub(/0+\z/,'')
      fraction.empty? ? whole : "#{whole},#{fraction}"
    end
    # Independent groups of checks. Normal mode raises the first problem; collect mode keeps going so the
    # live list shows every problem of the piece. Kept on purpose (0.8.16, «Se mantienen»): la pieza no
    # entra en la placa, girar con veta o con cantos asimétricos, pieza no rectangular y detalle de más de
    # 80 caracteres. 0.8.20 (biblioteca v4): the thickness of the piece never blocks (a sheet comes in every
    # thickness of its list; one outside the list is only flagged), and an edge blocks only when every one
    # of its standard widths is narrower than the piece (the band is trimmed: 45 mm covers a 25 mm piece).
    def validate_row(row,collect: false)
      reasons=[]
      check=lambda do |&block|
        block.call
        true
      rescue ExportError => error
        raise unless collect
        reasons << error.message
        false
      end
      node=@nodes.fetch(row['id']);g=geometry(node);axes=row['axes'];board=nil;mapping=row['edgeMap']
      return reasons unless check.call { raise ExportError,'Pieza no rectangular: no se puede pedir como placa rectangular. Excluila o corregila en el modelo.' unless g['rectangular'] }
      structure=check.call do
        raise ExportError,'Faltan los ejes de base y altura de la pieza: elegilos en la vista 2D.' unless axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |n| n.is_a?(Integer) && n.between?(0,2) } && [-1,1].include?(row['frontSign'])
        %w[flipX flipY].each { |key| raise ExportError,'Orientación de la pieza inválida.' unless [true,false].include?(row[key]) }
      end
      return reasons unless structure
      thickness=g['lengths'][(0..2).find { |i| !axes.include?(i) }]
      check.call { board=material(row['materialId'],'sheet') }
      sized=check.call do
        raise ExportError,"El detalle supera #{MAX_DETAIL} caracteres: acortalo." if row['detail'].length>MAX_DETAIL
        raise ExportError,'Regla de medidas inválida.' unless %w[finished_accepted explicit_cut].include?(row['dimensionRule'])
        if row['dimensionRule']=='explicit_cut'
          %w[cutBase cutHeight].each { |key| n=row[key];raise ExportError,'Medidas de corte inválidas: cargá base y altura de corte mayores que cero.' unless n.is_a?(Numeric) && n.finite? && n>0 && n<=100000 }
        end
      end
      # Map structure first; then each edge role on its own so collect mode reports both roles.
      mapped=check.call do
        raise ExportError,'Mapa de cantos inválido: cada lado debe ser 0, 1 o 2.' unless mapping.is_a?(Array) && mapping.length==4 && mapping.all? { |v| v.is_a?(Integer) && v.between?(0,2) }
        bindings=row['edgeBindings'];raise ExportError,'Vínculos de cantos inválidos.' unless bindings.is_a?(Array) && bindings.length<=100 && bindings.all? { |r| r.is_a?(Hash) && r.keys.sort==%w[catalogId observedId] && r.values.all? { |v| v.is_a?(String) && v.length.between?(1,200) } } && bindings.map { |r| r['observedId'] }.uniq.length==bindings.length
      end
      distinct=check.call do
        raise ExportError,'Los cantos principal y secundario deben ser distintos.' if row['principalId'] && row['principalId']==row['secondaryId']
      end
      if mapped && distinct
        %w[principalId secondaryId].each_with_index do |key,index|
          # A product in a role that no side uses never reaches the TXT: it does not block.
          next unless mapping.include?(index+1)
          role=index.zero? ? 'principal (1)' : 'secundario (2)'
          check.call do
            edge=material(row[key],'edge',role:role)
            # Any edge with a standard width that covers the thickness is valid: boards do not have a fixed matching edge.
            widths=CatalogStore.widths_of(edge)
            raise ExportError,"El canto #{role} es más angosto que el espesor de la pieza con todos sus anchos (#{widths.map { |width| mm(width) }.join(', ')} mm) y la pieza mide #{mm(thickness)} mm." unless widths.any? { |width| width+0.1>=thickness }
          end
        end
      end
      if board
        check.call do
          raise ExportError,'Giro inválido: elegí mantener la orientación (rota 0) o permitir el giro (rota 1).' unless %w[locked rotate].include?(row['grainPolicy'])
          if row['grainPolicy']=='rotate'
            raise ExportError,'No se puede girar una placa con veta: mantené la orientación (rota 0).' unless board['grain']==false
            raise ExportError,'Cantos asimétricos: no se puede girar la pieza; mantené la orientación (rota 0).' if mapped && mapping.uniq.length!=1
          end
        end
      end
      if board && sized
        check.call do
          base,height=dimensions(row)
          raise ExportError,"Las medidas de corte quedan en cero o negativas al descontar el canto (#{mm(base)} × #{mm(height)} mm)." unless base>0 && height>0
          fits=(base<=board['lengthMm']+0.1 && height<=board['widthMm']+0.1) || (row['grainPolicy']=='rotate' && height<=board['lengthMm']+0.1 && base<=board['widthMm']+0.1)
          raise ExportError,"La pieza no entra en la placa: mide #{mm(base)} × #{mm(height)} mm y la placa es #{mm(board['lengthMm'])} × #{mm(board['widthMm'])} mm." unless fits
        end
      end
      reasons
    end
    def dimensions(row)
      return [row['cutBase'],row['cutHeight']] if row['dimensionRule']=='explicit_cut'
      g=geometry(@nodes.fetch(row['id']));MaderaProfile.cut_size(@maderera,*row['axes'].map { |axis| g['lengths'][axis] },edge_thicknesses(row))
    end
    # Real thickness of the piece (0.8.20): the axis that is neither base nor height, or the smallest one
    # (eje menor) while the axes are not chosen, in hundredths like the cutlist pieces. An order lot is one
    # board in one thickness (#thickness_key, tenths, the same key as a cutlist section).
    def row_thickness(row)
      lengths=geometry(@nodes.fetch(row['id']))['lengths'];axes=row['axes']
      chosen=axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |n| [0,1,2].include?(n) }
      lengths[chosen ? ([0,1,2]-axes).first : (0..2).min_by { |i| [lengths[i],i] }].round(2)
    end
    def thickness_key(row);row_thickness(row).round(1);end
    def edge_thicknesses(row)
      return [0,0,0,0] unless @maderera && row['edgeMap'].is_a?(Array) && row['edgeMap'].length==4
      @items ||= @catalog['items'].to_h { |item| [item['id'],item] }
      row['edgeMap'].map { |role| edge=[1,2].include?(role) && @items[row[role==1 ? 'principalId' : 'secondaryId']];edge && edge['kind']=='edge' ? edge['thicknessMm'] : 0 }
    end
    # OPT-02: never blocks; only rows whose board and size are already resolvable.
    def warnings(draft)
      return [] unless @maderera
      self.class.normalize(draft)['rows'].select { |row| row['include'] }.filter_map do |row|
        board=@catalog['items'].find { |item| item['id']==row['materialId'] && item['kind']=='sheet' }
        next unless board && row['axes'].is_a?(Array) && (row['dimensionRule']!='explicit_cut' || (row['cutBase'].is_a?(Numeric) && row['cutHeight'].is_a?(Numeric)))
        message=MaderaProfile.usable_warning(@maderera,board,*dimensions(row),row['grainPolicy']=='rotate')
        {'id'=>row['id'],'detail'=>row['detail'],'message'=>message} if message
      rescue ExportError,NoMethodError,TypeError
        nil
      end
    end
    def estimate(draft, today: Time.now.utc.to_date)
      draft=validate(draft)
      # Net consumption only: prices older than 90 days or future-dated stay
      # separate from current subtotals. No rounding up to purchased sheets.
      lines=draft['rows'].select { |row| row['include'] }.map do |row|
        board=material(row['materialId'],'sheet');base,height=dimensions(row);area=base*height/1_000_000.0
        charges=[]
        add=lambda do |item,quantity,unit,role|
          price=item['price'];amount=price && price['unit']==unit ? quantity*price['amount'] : nil
          age=price && (today-Date.iso8601(price['date'])).to_i
          status=amount.nil? ? 'price_pending' : age<0 ? 'future_price' : age>90 ? 'stale_price' : 'current_price'
          charges << {'materialId'=>item['id'],'role'=>role,'quantity'=>quantity,'unit'=>unit,'amount'=>amount,'price'=>price,'status'=>status}
        end
        if board['price'] && board['price']['unit']=='placa'
          add.call(board,area/(board['lengthMm']*board['widthMm']/1_000_000.0),'placa','board')
        else
          add.call(board,area,'m2','board')
        end
        [1,2].each do |role|
          metres=row['edgeMap'].each_with_index.sum { |value,index| value==role ? (index<2 ? base : height)/1000.0 : 0 }
          next unless metres>0
          edge=material(row[role==1 ? 'principalId' : 'secondaryId'],'edge');add.call(edge,metres,'metro',role==1 ? 'principal_edge' : 'secondary_edge')
        end
        {'id'=>row['id'],'detail'=>row['detail'],'thicknessMm'=>row_thickness(row),'netAreaM2'=>area,'boardAmount'=>charges[0]['amount'],'charges'=>charges,'status'=>charges.all? { |c| c['status']=='current_price' } ? 'net_material_estimate' : 'review_prices'}
      end
      charges=lines.flat_map { |line| line['charges'] }
      totals=lambda { |statuses| charges.select { |c| statuses.include?(c['status']) }.group_by { |c| c['price']['currency'] }.transform_values { |group| group.sum { |c| c['amount'] } } }
      pieces=draft['rows'].select { |row| row['include'] }.zip(lines).map do |row,line|
        edges=line['charges'].reject { |c| c['role']=='board' }.each_with_object(Hash.new(0.0)) { |c,sum| sum[c['materialId']]+=c['quantity'] }
        base,height=dimensions(row);{'materialId'=>row['materialId'],'thicknessMm'=>row_thickness(row),'base'=>base,'height'=>height,'edges'=>edges}
      end
      budget=@maderera && MaderaProfile.budget(@maderera,pieces,@catalog['items'].to_h { |item| [item['id'],item] },today:today)
      {'lines'=>lines,'totalsByCurrency'=>totals.call(['current_price']),'budget'=>budget,'warnings'=>warnings(draft),'outdatedTotalsByCurrency'=>totals.call(%w[stale_price future_price]),
       'pending'=>charges.count { |c| c['status']=='price_pending' },'outdated'=>charges.count { |c| %w[stale_price future_price].include?(c['status']) },'priceAgeDays'=>90,
       'includesWaste'=>false,'includesEdges'=>true,'includesLabor'=>false,'optimized'=>false}
    end
    def export(draft,directory)
      draft=validate(draft)
      batches=draft['rows'].select { |row| row['include'] }.group_by { |row| [row['materialId'],thickness_key(row),row['principalId'],row['secondaryId']] }
      # A new directory is the atomic publication unit; no pre-existing export can be overwritten.
      FileUtils.mkdir_p(directory)
      token="PlanosSanto-pedido-#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(4)}"
      staging=File.join(directory,".#{token}.tmp");target=File.join(directory,token);Dir.mkdir(staging,0o700)
      manifest={'schema'=>'planos-santo.supplier-order.v1','createdAt'=>Time.now.utc.iso8601,'fingerprint'=>@fingerprint,'catalogRevision'=>@catalog['revision'],
        'profile'=>draft['profile'],'madereraProfile'=>MaderaProfile.reference(@maderera),'columns'=>COLUMNS,'purpose'=>'prueba_importacion_proveedor','production_ready'=>false,'lots'=>[],
        'excluded'=>draft['rows'].reject { |row| row['include'] }.map { |row| {'id'=>row['id'],'reason'=>row['excludeReason']} }}
      batches.each_with_index do |(key,rows),index|
        board=material(key[0],'sheet')
        grouped=rows.group_by { |row| [*dimensions(row),OrderProposal.detail_text(draft,row,@detail_codes),row['axes'],row['flipX'],row['flipY'],row['frontSign'],geometry(@nodes.fetch(row['id']))['mirrored'],row['edgeMap'],row['grainPolicy'],row['dimensionRule']] }
        format_number=lambda do |number|
          raise ExportError,'El proveedor admite hasta tres decimales; revisá medidas.' if number.round(3)<=0
          str=format('%.3f',number).sub(/0+\z/,'').sub(/\.\z/,'');draft['profile']['decimal']==',' ? str.tr('.',',') : str
        end
        lines=grouped.values.map do |members|
          row=members.first;base,height=dimensions(row)
          [members.length,format_number.call(base),format_number.call(height),OrderProposal.detail_text(draft,row,@detail_codes),row['grainPolicy']=='rotate' ? 1 : 0,*row['edgeMap']].join("\t")
        end
        lines.unshift(COLUMNS.join("\t")) if draft['profile']['header']
        content=lines.join("\r\n")+"\r\n";bytes=content.encode(draft['profile']['encoding']=='windows1252' ? 'Windows-1252' : 'UTF-8')
        filename=format('lote-%02d.txt',index+1);File.binwrite(File.join(staging,filename),bytes)
        manifest['lots'] << {'file'=>filename,'sha256'=>Digest::SHA256.hexdigest(bytes),'material'=>board,'thicknessMm'=>key[1],'grainAxis'=>self.class.grain_axis(board),
          'principal'=>key[2] && material(key[2],'edge'),'secondary'=>key[3] && material(key[3],'edge'),
          # Where each row's edges come from: read from the painted model or edited by hand in the order.
          'edgeSource'=>rows.to_h { |row| [row['id'],OrderProposal.edge_source(draft,row)] },
          'edgeTotals'=>OrderProposal.edge_totals(rows,@catalog) { |row| dimensions(row) },
          'sourceRows'=>rows,'physicalIds'=>rows.map { |row| row['id'] },'physicalQuantity'=>rows.length,'textRows'=>grouped.length}
      end
      File.binwrite(File.join(staging,'manifest.json'),JSON.pretty_generate(manifest));raise ExportError,'Ya existe esa exportación; no se reemplazó.' if File.exist?(target);File.rename(staging,target)
      {'directory'=>target,'lots'=>batches.length,'physicalQuantity'=>draft['rows'].count { |row| row['include'] },'production_ready'=>false}
    rescue Encoding::UndefinedConversionError,Encoding::InvalidByteSequenceError
      raise ExportError,'El texto no se puede representar en la codificación seleccionada.'
    ensure
      FileUtils.remove_entry(staging) if staging && File.directory?(staging)
    end
  end
end
