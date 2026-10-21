# frozen_string_literal: true
require 'json'
require 'digest'
require 'fileutils'
require 'securerandom'
require 'time'
require 'date'

module PlanosSanto
  class SupplierOrder
    COLUMNS=%w[cant base altura detalle rota canto_arr canto_aba canto_izq canto_der].freeze
    ROW_KEYS=%w[id include excludeReason detail axes flipX flipY frontSign materialId principalId secondaryId edgeMap grainPolicy grainAxis grainConfirmed dimensionRule cutBase cutHeight orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed reviewNote edgeResolution edgeBindings edgeOverrideReason].freeze
    def initialize(document,fingerprint,catalog,edge_review: nil, source_review: nil, material_proposal: nil)
      @document=document;@fingerprint=fingerprint;@catalog=catalog;@nodes={};@edge_review=edge_review;@source_review=source_review;@material_proposal=material_proposal
      Exporter.each_node(document['furniture']) { |node| @nodes[node['id']]=node if node['mesh'] }
    end
    def geometry(node)
      meta=node.fetch('metadata');bounds=meta.fetch('localBounds');matrix=meta.fetch('worldTransform')
      scales=[0,4,8].map { |index| Math.sqrt(matrix[index,3].sum { |n| n*n }) }
      orthogonal=[[0,1],[0,2],[1,2]].all? { |a,b| scales[a]>0 && scales[b]>0 && (3.times.sum { |i| matrix[a*4+i]*matrix[b*4+i] }/(scales[a]*scales[b])).abs<1e-6 }
      lengths=3.times.map { |i| (bounds['max'][i]-bounds['min'][i])*scales[i] }
      determinant=matrix[0]*(matrix[5]*matrix[10]-matrix[6]*matrix[9])-matrix[4]*(matrix[1]*matrix[10]-matrix[2]*matrix[9])+matrix[8]*(matrix[1]*matrix[6]-matrix[2]*matrix[5])
      {'lengths'=>lengths,'bounds'=>bounds,'scales'=>scales,'mirrored'=>determinant<0,'rectangular'=>meta['rectangular']==true && orthogonal,
       'vertices'=>node['mesh']['vertices'],'triangles'=>node['mesh']['triangles']}
    end
    def proposal
      {'schema'=>1,'fingerprint'=>@fingerprint,'catalogRevision'=>@catalog['revision'],'profile'=>{'encoding'=>'utf8','decimal'=>'.','header'=>false},
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
      rows=draft['rows'];raise ExportError,'Listado físico de pedido incompleto o duplicado.' unless rows.is_a?(Array) && rows.map { |r| r['id'] }.sort==@nodes.keys.sort
      profile=draft['profile'];raise ExportError,'Perfil TXT inválido.' unless profile.is_a?(Hash) && profile.keys.sort==%w[decimal encoding header] && %w[utf8 windows1252].include?(profile['encoding']) && ['.',','].include?(profile['decimal']) && [true,false].include?(profile['header'])
      rows.each do |row|
        raise ExportError,'Campos de pedido no permitidos.' unless row.is_a?(Hash) && row.keys.sort==ROW_KEYS.sort
        raise ExportError,'Estado de inclusión inválido.' unless [true,false].include?(row['include'])
        %w[excludeReason detail reviewNote].each { |key| CatalogStore.new.text(row[key]) }
        unless row['include']
          if row['excludeReason'].strip.length<3
            if collect_errors;errors << {'id'=>row['id'],'detail'=>row['detail'],'reason'=>'Indicá por qué se excluye esta pieza.'};else;raise ExportError,'Indicá por qué se excluye cada pieza.';end
          end
          next
        end
        begin
          validate_row(row)
        rescue ExportError => error
          raise unless collect_errors
          errors << {'id'=>row['id'],'detail'=>row['detail'],'reason'=>error.message}
        end
      end
      raise ExportError,'No hay piezas incluidas en el pedido.' unless rows.any? { |row| row['include'] }
      collect_errors ? errors : draft
    end
    def material(id,kind)
      found=@catalog['items'].find { |item| item['id']==id && item['kind']==kind && item['approved'] }
      raise ExportError,"Elegí #{kind=='sheet' ? 'una placa' : 'un canto'} aprobado de la biblioteca." unless found
      found
    end
    def validate_row(row)
      node=@nodes.fetch(row['id']);g=geometry(node)
      raise ExportError,"#{row['detail']}: geometría no rectangular; verificar/excluir explícitamente." unless g['rectangular']
      axes=row['axes'];raise ExportError,'Elegí ejes U/V distintos y la cara frontal de la vista 2D.' unless axes.is_a?(Array) && axes.length==2 && axes.uniq.length==2 && axes.all? { |n| n.is_a?(Integer) && n.between?(0,2) } && [-1,1].include?(row['frontSign'])
      %w[flipX flipY orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed grainConfirmed].each { |key| raise ExportError,'Confirmaciones de pedido inválidas.' unless [true,false].include?(row[key]) }
      raise ExportError,"#{row['detail']}: falta confirmar orientación, material, medidas o cantos." unless %w[orientationConfirmed materialConfirmed dimensionsConfirmed edgesConfirmed].all? { |key| row[key] }
      raise ExportError,'Elegí cómo verificaste los cantos: caras observadas o inspección manual documentada.' unless %w[observed manual].include?(row['edgeResolution'])
      bindings=row['edgeBindings'];raise ExportError,'Vínculos de cantos inválidos.' unless bindings.is_a?(Array) && bindings.length<=100 && bindings.all? { |r| r.is_a?(Hash) && r.keys.sort==%w[catalogId observedId] && r.values.all? { |v| v.is_a?(String) && v.length.between?(1,200) } } && bindings.map { |r| r['observedId'] }.uniq.length==bindings.length
      CatalogStore.new.text(row['edgeOverrideReason'])
      raise ExportError,'Documentá por qué el mapa manual representa los cantos reales.' if row['edgeResolution']=='manual' && row['edgeOverrideReason'].strip.length<8
      board=material(row['materialId'],'sheet');thickness=g['lengths'][(0..2).find { |i| !axes.include?(i) }]
      raise ExportError,'El espesor del catálogo no coincide con el eje de espesor elegido.' if (thickness-board['thicknessMm']).abs>0.1
      raise ExportError,'Completá detalle y justificación de medidas de corte/terminadas.' if row['detail'].strip.empty? || row['detail'].length>80 || row['reviewNote'].strip.length<8
      raise ExportError,'Elegí medidas terminadas aceptadas o medidas de corte explícitas.' unless %w[finished_accepted explicit_cut].include?(row['dimensionRule'])
      if row['dimensionRule']=='explicit_cut'
        %w[cutBase cutHeight].each { |key| n=row[key];raise ExportError,'Medidas de corte inválidas.' unless n.is_a?(Numeric) && n.finite? && n>0 && n<=100000 }
      end
      mapping=row['edgeMap'];raise ExportError,'Mapa de cantos inválido.' unless mapping.is_a?(Array) && mapping.length==4 && mapping.all? { |v| v.is_a?(Integer) && v.between?(0,2) }
      raise ExportError,'Los cantos principal y secundario deben ser distintos.' if row['principalId'] && row['principalId']==row['secondaryId']
      %w[principalId secondaryId].each_with_index do |key,index|
        next unless row[key] || mapping.include?(index+1)
        edge=material(row[key],'edge')
        raise ExportError,'El canto no cubre el espesor de la placa.' if edge['widthMm']+0.1<thickness
        raise ExportError,'Confirmá compatibilidad placa/canto en la biblioteca.' unless board['compatibleIds'].include?(edge['id'])
      end
      raise ExportError,'Confirmá la dirección de veta de la pieza en la vista 2D.' unless row['grainConfirmed'] && (board['grain'] ? row['grainAxis']=='u' : row['grainAxis']=='none')
      raise ExportError,'Confirmá si la pieza admite rotación.' unless %w[locked rotate].include?(row['grainPolicy'])
      if row['grainPolicy']=='rotate'
        raise ExportError,'No se permite girar una placa con veta o sin veta confirmada.' unless board['grain']==false
        raise ExportError,'Cantos asimétricos: mantener rota=0 hasta validar el proveedor.' unless mapping.uniq.length==1
      end
      if row['edgeResolution']=='observed'
        raise ExportError,'Se necesita releer las caras del modelo para validar cantos observados.' unless @edge_review
        @edge_evidence ||= {};@edge_evidence[row['id']]=@edge_review.call(row,g)
      end
      @source_review.call(row,g) if @source_review
      base,height=dimensions(row);raise ExportError,'La pieza no entra en el formato de placa aprobado.' if !((base<=board['lengthMm']+0.1 && height<=board['widthMm']+0.1) || (row['grainPolicy']=='rotate' && height<=board['lengthMm']+0.1 && base<=board['widthMm']+0.1))
    end
    def dimensions(row)
      return [row['cutBase'],row['cutHeight']] if row['dimensionRule']=='explicit_cut'
      g=geometry(@nodes.fetch(row['id']));row['axes'].map { |axis| g['lengths'][axis] }
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
      {'lines'=>lines,'totalsByCurrency'=>totals.call(['current_price']),'outdatedTotalsByCurrency'=>totals.call(%w[stale_price future_price]),
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
        'profile'=>draft['profile'],'columns'=>COLUMNS,'purpose'=>'prueba_importacion_proveedor','production_ready'=>false,'lots'=>[],
        'excluded'=>draft['rows'].reject { |row| row['include'] }.map { |row| {'id'=>row['id'],'reason'=>row['excludeReason']} }}
      batches.each_with_index do |(key,rows),index|
        grouped=rows.group_by { |row| [*dimensions(row),row['detail'],row['axes'],row['flipX'],row['flipY'],row['frontSign'],geometry(@nodes.fetch(row['id']))['mirrored'],row['edgeMap'],row['grainPolicy'],row['grainAxis'],row['dimensionRule']] }
        format_number=lambda do |number|
          raise ExportError,'El proveedor admite hasta tres decimales; revisá medidas.' if number.round(3)<=0
          str=format('%.3f',number).sub(/0+\z/,'').sub(/\.\z/,'');draft['profile']['decimal']==',' ? str.tr('.',',') : str
        end
        lines=grouped.values.map do |members|
          row=members.first;base,height=dimensions(row)
          [members.length,format_number.call(base),format_number.call(height),row['detail'],row['grainPolicy']=='rotate' ? 1 : 0,*row['edgeMap']].join("\t")
        end
        lines.unshift(COLUMNS.join("\t")) if draft['profile']['header']
        content=lines.join("\r\n")+"\r\n";bytes=content.encode(draft['profile']['encoding']=='windows1252' ? 'Windows-1252' : 'UTF-8')
        filename=format('lote-%02d.txt',index+1);File.binwrite(File.join(staging,filename),bytes)
        board=material(key[0],'sheet')
        manifest['lots'] << {'file'=>filename,'sha256'=>Digest::SHA256.hexdigest(bytes),'material'=>board,'thicknessMm'=>key[1],
          'principal'=>key[2] && material(key[2],'edge'),'secondary'=>key[3] && material(key[3],'edge'),
          'edgeEvidence'=>rows.to_h { |row| [row['id'],row['edgeResolution']=='observed' ? @edge_evidence.fetch(row['id']) : {'mode'=>'manual','reason'=>row['edgeOverrideReason']}] },
          'sourceRows'=>rows,'physicalIds'=>rows.map { |row| row['id'] },'physicalQuantity'=>rows.length,'textRows'=>grouped.length}
      end
      File.write(File.join(staging,'manifest.json'),JSON.pretty_generate(manifest));raise ExportError,'Ya existe esa exportación; no se reemplazó.' if File.exist?(target);File.rename(staging,target)
      {'directory'=>target,'lots'=>batches.length,'physicalQuantity'=>draft['rows'].count { |row| row['include'] },'production_ready'=>false}
    rescue Encoding::UndefinedConversionError,Encoding::InvalidByteSequenceError
      raise ExportError,'El texto no se puede representar en la codificación seleccionada.'
    ensure
      FileUtils.remove_entry(staging) if staging && File.directory?(staging)
    end
  end
end
