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
    ROW_KEYS=%w[id include excludeReason detail axes flipX flipY frontSign materialId principalId secondaryId edgeMap grainPolicy grainAxis grainConfirmed dimensionRule cutBase cutHeight orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed reviewNote edgeResolution edgeBindings edgeOverrideReason].freeze
    def initialize(document,fingerprint,catalog,edge_review: nil, source_review: nil, material_proposal: nil, maderera: nil)
      @document=document;@fingerprint=fingerprint;@catalog=catalog;@nodes={};@edge_review=edge_review;@source_review=source_review;@material_proposal=material_proposal
      # Hito 4: only an approved supplier profile changes defaults, cut sizes or the estimate.
      @maderera=MaderaProfile.applies?(maderera) ? maderera : nil
      Exporter.each_node(document['furniture']) { |node| @nodes[node['id']]=node if node['mesh'] }
    end
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
    def proposal
      {'schema'=>1,'fingerprint'=>@fingerprint,'catalogRevision'=>@catalog['revision'],'maderera'=>MaderaProfile.binding(@maderera),'profile'=>@maderera ? @maderera.slice('encoding','decimal','header') : {'encoding'=>'utf8','decimal'=>'.','header'=>false},
       'rows'=>@nodes.values.map do |node|
         {'id'=>node['id'],'include'=>true,'excludeReason'=>'','detail'=>node['name'],'axes'=>nil,'flipX'=>false,'flipY'=>false,'frontSign'=>nil,
          'materialId'=>'','principalId'=>nil,'secondaryId'=>nil,'edgeMap'=>[0,0,0,0],'grainPolicy'=>nil,'grainAxis'=>nil,'grainConfirmed'=>false,'dimensionRule'=>nil,
          'cutBase'=>nil,'cutHeight'=>nil,'orientationConfirmed'=>false,'materialConfirmed'=>false,'dimensionsConfirmed'=>false,'edgesConfirmed'=>false,'reviewNote'=>'','edgeResolution'=>nil,'edgeBindings'=>[],'edgeOverrideReason'=>''}.merge(@material_proposal ? @material_proposal.call(node['id']) : {})
       end,
       'geometry'=>@nodes.transform_values { |node| geometry(node) }}
    end
    def validate(draft,collect_errors: false)
      errors=[];@edge_evidence={}
      raise ExportError,'Pedido incompatible o geometría modificada: volvé a preparar.' unless draft.is_a?(Hash) && draft['schema']==1 && draft['fingerprint']==@fingerprint
      raise ExportError,'La biblioteca cambió; volvé a preparar y revisar el pedido.' unless draft['catalogRevision']==@catalog['revision']
      raise ExportError,'El perfil de maderera en uso cambió desde que preparaste el pedido: usá «Preparar de nuevo» y revisá las medidas.' unless draft['maderera']==MaderaProfile.binding(@maderera)
      rows=draft['rows'];raise ExportError,'Listado físico de pedido incompleto o duplicado.' unless rows.is_a?(Array) && rows.map { |r| r['id'] }.sort==@nodes.keys.sort
      profile=draft['profile'];raise ExportError,'El perfil del archivo TXT no es válido: revisá codificación, decimal y encabezado en «Perfil del archivo para la maderera».' unless profile.is_a?(Hash) && profile.keys.sort==%w[decimal encoding header] && %w[utf8 windows1252].include?(profile['encoding']) && ['.',','].include?(profile['decimal']) && [true,false].include?(profile['header'])
      rows.each do |row|
        raise ExportError,'Campos de pedido no permitidos.' unless row.is_a?(Hash) && row.keys.sort==ROW_KEYS.sort
        raise ExportError,'Estado de inclusión inválido.' unless [true,false].include?(row['include'])
        %w[excludeReason detail reviewNote].each { |key| CatalogStore.new.text(row[key]) }
        unless row['include']
          if row['excludeReason'].strip.length<3
            if collect_errors;errors << {'id'=>row['id'],'detail'=>row['detail'],'reason'=>'Indicá por qué se excluye esta pieza.','reasons'=>['Indicá por qué se excluye esta pieza.']};else;raise ExportError,'Indicá por qué se excluye cada pieza.';end
          end
          next
        end
        if collect_errors
          reasons=validate_row(row,collect:true)+OrderProposal.detail_reasons(draft,row,@detail_codes)
          errors << {'id'=>row['id'],'detail'=>row['detail'],'reason'=>reasons.first,'reasons'=>reasons} unless reasons.empty?
        else
          begin
            validate_row(row)
            OrderProposal.detail_reasons(draft,row,@detail_codes).each { |reason| raise ExportError,reason }
          rescue ExportError => error
            # Check/export stop at the first problem: name the piece so the message is actionable.
            raise ExportError,"#{row['detail'].to_s.strip.empty? ? 'Pieza sin detalle' : row['detail']} (#{row['id']}): #{error.message}"
          end
        end
      end
      raise ExportError,'No hay piezas incluidas en el pedido.' unless rows.any? { |row| row['include'] }
      collect_errors ? errors : draft
    end
    def material(id,kind)
      found=@catalog['items'].find { |item| item['id']==id && item['kind']==kind && item['approved'] }
      raise ExportError,"Elegí #{kind=='sheet' ? 'una placa aprobada' : 'un canto aprobado'} de la biblioteca." unless found
      found
    end
    def mm(number)
      # Same convention as the UI (es-AR): 1.234,5
      whole,fraction=format('%.2f',number).split('.')
      whole=whole.reverse.scan(/\d{1,3}/).join('.').reverse.prepend(number<0 ? '-' : '')
      fraction=fraction.sub(/0+\z/,'')
      fraction.empty? ? whole : "#{whole},#{fraction}"
    end
    # Independent groups of checks. Normal mode raises the first problem (same order as
    # always); collect mode keeps going so one audit lists every problem of the piece.
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
      return reasons unless check.call { raise ExportError,'Geometría no rectangular: verificala o excluila explícitamente.' unless g['rectangular'] }
      structure=check.call do
        raise ExportError,'Elegí ejes U/V distintos y la cara frontal de la vista 2D.' unless axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |n| n.is_a?(Integer) && n.between?(0,2) } && [-1,1].include?(row['frontSign'])
        %w[flipX flipY orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed grainConfirmed].each { |key| raise ExportError,'Confirmaciones de pedido inválidas.' unless [true,false].include?(row[key]) }
      end
      return reasons unless structure
      check.call do
        missing={'orientationConfirmed'=>'orientación','materialConfirmed'=>'material','dimensionsConfirmed'=>'medidas','edgesConfirmed'=>'cantos'}.reject { |key,_| row[key] }.values
        raise ExportError,"Falta confirmar #{missing.join(', ')}." unless missing.empty?
      end
      check.call do
        raise ExportError,'Elegí cómo verificaste los cantos: caras observadas o inspección manual documentada.' unless %w[observed manual].include?(row['edgeResolution'])
        bindings=row['edgeBindings'];raise ExportError,'Vínculos de cantos inválidos.' unless bindings.is_a?(Array) && bindings.length<=100 && bindings.all? { |r| r.is_a?(Hash) && r.keys.sort==%w[catalogId observedId] && r.values.all? { |v| v.is_a?(String) && v.length.between?(1,200) } } && bindings.map { |r| r['observedId'] }.uniq.length==bindings.length
        CatalogStore.new.text(row['edgeOverrideReason'])
        raise ExportError,'Documentá por qué el mapa manual representa los cantos reales.' if row['edgeResolution']=='manual' && row['edgeOverrideReason'].strip.length<8
      end
      thickness=g['lengths'][(0..2).find { |i| !axes.include?(i) }]
      check.call do
        board=material(row['materialId'],'sheet')
        raise ExportError,'La placa aprobada no tiene espesor cargado en la biblioteca.' unless board['thicknessMm'].is_a?(Numeric)
        raise ExportError,"El espesor no coincide: el eje de espesor mide #{mm(thickness)} mm y la placa aprobada tiene #{mm(board['thicknessMm'])} mm." if (thickness-board['thicknessMm']).abs>0.1
      end
      sized=check.call do
        raise ExportError,'Completá detalle y justificación de medidas de corte/terminadas.' if row['detail'].strip.empty? || row['detail'].length>80 || row['reviewNote'].strip.length<8
        raise ExportError,'Elegí medidas terminadas aceptadas o medidas de corte explícitas.' unless %w[finished_accepted explicit_cut].include?(row['dimensionRule'])
        if row['dimensionRule']=='explicit_cut'
          %w[cutBase cutHeight].each { |key| n=row[key];raise ExportError,'Medidas de corte inválidas: cargá base y altura de corte mayores que cero.' unless n.is_a?(Numeric) && n.finite? && n>0 && n<=100000 }
        end
      end
      # Map structure first; then each edge role on its own so collect mode reports both roles.
      mapped=check.call do
        raise ExportError,'Mapa de cantos inválido: cada lado debe ser 0, 1 o 2.' unless mapping.is_a?(Array) && mapping.length==4 && mapping.all? { |v| v.is_a?(Integer) && v.between?(0,2) }
      end
      distinct=check.call do
        raise ExportError,'Los cantos principal y secundario deben ser distintos.' if row['principalId'] && row['principalId']==row['secondaryId']
      end
      if mapped && distinct
        %w[principalId secondaryId].each_with_index do |key,index|
          next unless row[key] || mapping.include?(index+1)
          role=index.zero? ? 'principal (1)' : 'secundario (2)'
          check.call do
            edge=@catalog['items'].find { |item| item['id']==row[key] && item['kind']=='edge' && item['approved'] }
            raise ExportError,"Elegí un canto #{role} aprobado de la biblioteca." unless edge
            if board
              width=edge['widthMm'].is_a?(Numeric) ? "#{mm(edge['widthMm'])} mm" : 'sin cargar'
              # Any approved edge that covers the thickness is valid: boards do not have a fixed matching edge.
              raise ExportError,"El canto #{role} no cubre el espesor de la placa: ancho #{width} y espesor #{mm(thickness)} mm." unless edge['widthMm'].is_a?(Numeric) && edge['widthMm']+0.1>=thickness
            end
          end
        end
      end
      if board
        check.call do
          raise ExportError,'Confirmá la dirección de veta de la pieza en la vista 2D.' unless row['grainConfirmed'] && (board['grain'] ? row['grainAxis']=='u' : row['grainAxis']=='none')
          raise ExportError,'Confirmá si la pieza admite rotación.' unless %w[locked rotate].include?(row['grainPolicy'])
          if row['grainPolicy']=='rotate'
            raise ExportError,'No se permite girar una placa con veta o sin veta confirmada.' unless board['grain']==false
            raise ExportError,'Cantos asimétricos: mantener rota=0 hasta validar la maderera.' if mapped && mapping.uniq.length!=1
          end
        end
      end
      # Model rereads only make sense once the row itself is coherent.
      if reasons.empty?
        check.call do
          if row['edgeResolution']=='observed'
            raise ExportError,'Se necesita releer las caras del modelo para validar cantos observados.' unless @edge_review
            @edge_evidence ||= {};@edge_evidence[row['id']]=@edge_review.call(row,g)
          end
          @source_review.call(row,g) if @source_review
        end
      end
      if board && sized
        check.call do
          raise ExportError,'La placa aprobada no tiene largo y ancho cargados en la biblioteca.' unless board['lengthMm'].is_a?(Numeric) && board['widthMm'].is_a?(Numeric)
          base,height=dimensions(row)
          raise ExportError,"Las medidas de corte quedan en cero o negativas al descontar el canto (#{mm(base)} × #{mm(height)} mm)." unless base>0 && height>0
          fits=(base<=board['lengthMm']+0.1 && height<=board['widthMm']+0.1) || (row['grainPolicy']=='rotate' && height<=board['lengthMm']+0.1 && base<=board['widthMm']+0.1)
          raise ExportError,"La pieza no entra en el formato de placa aprobado: mide #{mm(base)} × #{mm(height)} mm y la placa aprobada es #{mm(board['lengthMm'])} × #{mm(board['widthMm'])} mm." unless fits
        end
      end
      reasons
    end
    def dimensions(row)
      return [row['cutBase'],row['cutHeight']] if row['dimensionRule']=='explicit_cut'
      g=geometry(@nodes.fetch(row['id']));MaderaProfile.cut_size(@maderera,*row['axes'].map { |axis| g['lengths'][axis] },edge_thicknesses(row))
    end
    def edge_thicknesses(row)
      return [0,0,0,0] unless @maderera && row['edgeMap'].is_a?(Array) && row['edgeMap'].length==4
      @items ||= @catalog['items'].to_h { |item| [item['id'],item] }
      row['edgeMap'].map { |role| edge=[1,2].include?(role) && @items[row[role==1 ? 'principalId' : 'secondaryId']];edge && edge['kind']=='edge' ? edge['thicknessMm'] : 0 }
    end
    # OPT-02: never blocks; only rows whose board and size are already resolvable.
    def warnings(draft)
      return [] unless @maderera
      draft['rows'].select { |row| row['include'] }.filter_map do |row|
        board=@catalog['items'].find { |item| item['id']==row['materialId'] && item['kind']=='sheet' }
        next unless board && row['axes'].is_a?(Array) && (row['dimensionRule']!='explicit_cut' || (row['cutBase'].is_a?(Numeric) && row['cutHeight'].is_a?(Numeric)))
        message=MaderaProfile.usable_warning(@maderera,board,*dimensions(row),row['grainPolicy']=='rotate')
        {'id'=>row['id'],'detail'=>row['detail'],'message'=>message} if message
      rescue ExportError
        nil
      end
    end
    def estimate(draft, today: Time.now.utc.to_date)
      validate(draft)
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
        {'id'=>row['id'],'detail'=>row['detail'],'netAreaM2'=>area,'boardAmount'=>charges[0]['amount'],'charges'=>charges,'status'=>charges.all? { |c| c['status']=='current_price' } ? 'net_material_estimate' : 'review_prices'}
      end
      charges=lines.flat_map { |line| line['charges'] }
      totals=lambda { |statuses| charges.select { |c| statuses.include?(c['status']) }.group_by { |c| c['price']['currency'] }.transform_values { |group| group.sum { |c| c['amount'] } } }
      pieces=draft['rows'].select { |row| row['include'] }.zip(lines).map do |row,line|
        edges=line['charges'].reject { |c| c['role']=='board' }.each_with_object(Hash.new(0.0)) { |c,sum| sum[c['materialId']]+=c['quantity'] }
        base,height=dimensions(row);{'materialId'=>row['materialId'],'base'=>base,'height'=>height,'edges'=>edges}
      end
      budget=@maderera && MaderaProfile.budget(@maderera,pieces,@catalog['items'].to_h { |item| [item['id'],item] },today:today)
      {'lines'=>lines,'totalsByCurrency'=>totals.call(['current_price']),'budget'=>budget,'warnings'=>warnings(draft),'outdatedTotalsByCurrency'=>totals.call(%w[stale_price future_price]),
       'pending'=>charges.count { |c| c['status']=='price_pending' },'outdated'=>charges.count { |c| %w[stale_price future_price].include?(c['status']) },'priceAgeDays'=>90,
       'includesWaste'=>false,'includesEdges'=>true,'includesLabor'=>false,'optimized'=>false}
    end
    def export(draft,directory)
      validate(draft)
      batches=draft['rows'].select { |row| row['include'] }.group_by { |row| [row['materialId'],material(row['materialId'],'sheet')['thicknessMm'],row['principalId'],row['secondaryId']] }
      # A new directory is the atomic publication unit; no pre-existing export can be overwritten.
      FileUtils.mkdir_p(directory)
      token="PlanosSanto-pedido-#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(4)}"
      staging=File.join(directory,".#{token}.tmp");target=File.join(directory,token);Dir.mkdir(staging,0o700)
      manifest={'schema'=>'planos-santo.supplier-order.v1','createdAt'=>Time.now.utc.iso8601,'fingerprint'=>@fingerprint,'catalogRevision'=>@catalog['revision'],
        'profile'=>draft['profile'],'madereraProfile'=>MaderaProfile.reference(@maderera),'columns'=>COLUMNS,'purpose'=>'prueba_importacion_proveedor','production_ready'=>false,'lots'=>[],
        'excluded'=>draft['rows'].reject { |row| row['include'] }.map { |row| {'id'=>row['id'],'reason'=>row['excludeReason']} }}
      batches.each_with_index do |(key,rows),index|
        grouped=rows.group_by { |row| [*dimensions(row),OrderProposal.detail_text(draft,row,@detail_codes),row['axes'],row['flipX'],row['flipY'],row['frontSign'],geometry(@nodes.fetch(row['id']))['mirrored'],row['edgeMap'],row['grainPolicy'],row['grainAxis'],row['dimensionRule']] }
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
        board=material(key[0],'sheet')
        manifest['lots'] << {'file'=>filename,'sha256'=>Digest::SHA256.hexdigest(bytes),'material'=>board,'thicknessMm'=>key[1],
          'principal'=>key[2] && material(key[2],'edge'),'secondary'=>key[3] && material(key[3],'edge'),
          'edgeEvidence'=>rows.to_h { |row| [row['id'],row['edgeResolution']=='observed' ? @edge_evidence.fetch(row['id']) : {'mode'=>'manual','reason'=>row['edgeOverrideReason']}] },
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
