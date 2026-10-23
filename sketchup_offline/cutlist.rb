# frozen_string_literal: true
require 'json'
require 'tempfile'
require_relative 'catalog_store'
require_relative 'supplier_order'
require_relative 'ocl_reader'
require_relative 'order_proposal'
require_relative 'guide_store'
require_relative 'workshop'

module PlanosSanto
  # Vista «Piezas»: lista de corte de los muebles generados, agrupada por material y espesor real de la pieza
  # (0.8.20: una ficha de placa vale para todos sus espesores; «Melamina 18» y «Melamina 15» son dos secciones
  # del mismo material). Cada pieza lleva `thicknessMm` (eje menor) y `thicknessInList` para el despiece.
  # Solo lectura: no escribe el SKP, la guía ni el borrador del pedido. Reutiliza lo que ya calcula
  # el pedido (SupplierOrder#proposal para la geometría, OrderProposal#stage para ejes, placa y
  # cantos por lado, OclReader para lo pintado en cada cara) en vez de volver a interpretarlo.
  module Cutlist
    SIDES=%w[arr aba izq der].freeze
    TOLERANCE=0.1
    # Tira de canto por lado: arriba y abajo corren a lo largo de la pieza; izquierda y derecha, a lo ancho.
    STRIP_LABELS={'arr'=>'Longitud del borde 1','aba'=>'Longitud del borde 2','izq'=>'Ancho del borde 1','der'=>'Ancho del borde 2'}.freeze
    CSV_MAX_BYTES=5*1024*1024

    # Punto de entrada del controlador: arma el pedido como Workshop#order, sin validarlo.
    def self.for_model(model,session,directory:)
      raise ExportError,'Primero generá las guías en Muebles.' unless session&.document
      session.check_current!
      workshop=Workshop.new(model,session,directory:directory)
      catalog=CatalogStore.new(directory:directory).read
      report=begin
        OclReader.capture(model)
      rescue P1Diagnostics::LimitError,ArgumentError => error
        raise ExportError,error.message
      end
      service=SupplierOrder.new(session.document,session.fingerprint,catalog,
        material_proposal:lambda { |id| workshop.native_proposal(report,id,catalog) },maderera:workshop.active_maderera)
      guide=begin
        GuideStore.new(model).read
      rescue ExportError
        {}
      end
      build(session.document,service,report,catalog,guide:guide,stored:stored_draft(model))
    end

    # Exportar CSV: la UI arma el texto (lo que se ve en la pestaña) y Ruby solo lo valida y lo escribe
    # completo o nada, con BOM UTF-8 para que Excel respete las tildes.
    def self.write_csv(text,target)
      raise ExportError,'CSV de piezas inválido.' unless text.is_a?(String) && text.bytesize.between?(1,CSV_MAX_BYTES)
      body=text.dup.force_encoding(Encoding::UTF_8)
      raise ExportError,'CSV de piezas inválido.' unless body.valid_encoding? && !body.include?("\0")
      target=target.to_s
      target+='.csv' unless target.downcase.end_with?('.csv')
      bytes="﻿"+body.delete_prefix("﻿")
      Tempfile.create(['.planos-santo-','.csv'],File.dirname(target)) do |file|
        file.binmode;file.write(bytes);file.flush;file.fsync;file.close
        File.rename(file.path,target)
      end
      {'path'=>target,'bytes'=>bytes.bytesize}
    end

    # Nombre sugerido del archivo: «Piezas-<modelo>.csv» sin caracteres que Windows no acepta.
    def self.csv_file_name(name)
      clean=name.to_s.gsub(/[\\\/:*?"<>|\x00-\x1f]/,' ').strip.squeeze(' ')[0,80].to_s.strip
      clean.empty? ? 'Piezas.csv' : "Piezas-#{clean}.csv"
    end

    # Borrador del pedido guardado en el modelo, si se puede leer. Sirve para respetar la placa elegida
    # a mano, los vínculos de cantos y la veta; si está dañado o viejo se ignora (no bloquea la vista).
    def self.stored_draft(model)
      raw=model.respond_to?(:get_attribute) ? model.get_attribute(Workshop::DICT,Workshop::KEY) : nil
      return nil unless raw.is_a?(String) && raw.bytesize<=8*1024*1024
      parsed=JSON.parse(raw)
      parsed.is_a?(Hash) ? parsed : nil
    rescue JSON::ParserError
      nil
    end

    # document: el documento generado (muebles y piezas); service: SupplierOrder; report: OclReader.
    def self.build(document,service,report,catalog,guide: {},stored: nil)
      proposal=service.proposal;geometry=proposal['geometry']
      fresh=stored.is_a?(Hash) && stored['fingerprint']==proposal['fingerprint'] && stored['catalogRevision']==proposal['catalogRevision'] && stored['rows'].is_a?(Array)
      saved=fresh ? stored['rows'].select { |row| row.is_a?(Hash) && row['id'].is_a?(String) }.to_h { |row| [row['id'],row] } : {}
      links=fresh ? Array(stored['edgeLinks']).select { |link| link.is_a?(Hash) }.to_h { |link| [link['observedId'],link['catalogId']] } : {}
      planner=OrderProposal.new(service,report,catalog)
      codes=begin
        OrderProposal.codes(document,guide)
      rescue StandardError
        {}
      end
      guide_pieces={}
      Array(guide['furniture']).each { |furniture| Array(furniture['pieces']).each { |piece| guide_pieces[piece['id']]=piece if piece.is_a?(Hash) } }
      roots={};nodes={}
      document.fetch('furniture',[]).each do |root|
        Exporter.each_node([root]) { |node| next unless node['mesh'];roots[node['id']]=root;nodes[node['id']]=node }
      end
      context={'materials'=>report['materials'].to_h { |material| [material['id'],material] },
               'pieces'=>report['pieces'].to_h { |piece| [piece['path'].join('/'),piece] },
               'items'=>catalog['items'].to_h { |item| [item['id'],item] },'catalog'=>catalog,'report'=>report,'links'=>links}
      entries=proposal['rows'].map do |row|
        id=row['id'];kept=saved[id] || {}
        work=row.merge(kept['materialId'].is_a?(String) && !kept['materialId'].empty? ? {'materialId'=>kept['materialId']} : {})
        guide_piece=guide_pieces[id];code=codes[id].to_s
        code=guide_piece['code'].to_s if code.empty? && guide_piece
        name=guide_piece && !guide_piece['name'].to_s.strip.empty? ? guide_piece['name'] : nodes[id]['name']
        piece(work,kept,geometry.fetch(id),planner,context).merge('code'=>code,'name'=>name,'furnitureId'=>roots[id]['id'],'furnitureName'=>roots[id]['name'])
      end
      pieces=group(entries)
      order=document.fetch('furniture',[]).each_with_index.to_h { |root,index| [root['id'],index] }
      pieces.sort_by! { |piece| [order[piece['furnitureId']] || 0,piece['code'].empty? ? 1 : 0,natural(piece['code']),piece['name'].to_s,piece['id']] }
      {'schema'=>1,'complete'=>report['complete']==true,'readOnly'=>true,'modelName'=>(document['name'] || document['modelName']).to_s,'unit'=>'mm',
       'furniture'=>document.fetch('furniture',[]).map { |root| {'id'=>root['id'],'name'=>root['name']} },
       'sections'=>sections(pieces,context),'edgeSections'=>edge_sections(pieces,context),'pieces'=>pieces}
    end

    # Una pieza física: medidas por ejes del pedido, placa de las caras grandes y canto de cada lado.
    def self.piece(row,kept,g,planner,context)
      id=row['id'];lengths=g['lengths']
      stage=g['rectangular'] ? planner.send(:stage,row,context['links']) : nil
      u,v=stage ? stage['orientation']['axes'] : (0..2).sort_by { |i| [-lengths[i],i] }.first(2)
      w=([0,1,2]-[u,v]).first
      observed=context['pieces'][id]
      big=observed ? observed['faces'].select { |face| face['normal_local'].is_a?(Array) && face['normal_local'][w].to_f.abs>0.999 } : []
      big_ids=big.filter_map { |face| face['front_material_id'] || face['back_material_id'] }.uniq
      board=stage ? stage['board'] : unrectangular_board(big_ids,context)
      material=material_for(board,big_ids,context)
      thickness=lengths[w].round(2)
      observation=stage ? OclReader.projected_edges(context['report'],row.merge(stage['orientation']),g) : nil
      edges=SIDES.each_with_index.map do |side,index|
        edge=edge_side(side,stage && stage['sides'][index],observation && observation['sides'][index],context).merge('lengthMm'=>lengths[index<2 ? u : v].round(2))
        key=edge_key(edge)
        key ? edge.merge('edgeKey'=>key) : edge
      end
      {'id'=>id,'strips'=>strips(edges,thickness,g['rectangular']==true,context),'ids'=>[id],'definitionId'=>observed && observed['definition_id'],'quantity'=>1,
       'lengthMm'=>lengths[u].round(2),'widthMm'=>lengths[v].round(2),'thicknessMm'=>thickness,
       'rectangular'=>g['rectangular']==true,'mirrored'=>g['mirrored']==true,'material'=>material,'thicknessInList'=>thickness_in_list(board,thickness),
       'sectionKey'=>"#{section_source_key(material)}|#{format('%.1f',thickness)}",'edges'=>edges,
       'grain'=>grain(board,kept,u,v),'notes'=>stage ? (stage['notes'].map { |note| note['text'] }+stage['blockers']).uniq : ['Geometría no rectangular: medidas aproximadas por la caja de la pieza; cantos sin leer.']}
    end

    # ¿El espesor real de la pieza está entre los de la ficha? nil sin ficha de placa o sin lista. Fuera de la lista
    # no bloquea: la pieza se lista con su espesor y la sección lo marca, con un clic para agregarlo a la ficha.
    def self.thickness_in_list(board,thickness)
      list=board && board['kind']=='sheet' ? CatalogStore.thicknesses_of(board) : []
      list.empty? ? nil : CatalogStore.in_list?(list,thickness)
    end

    # Sin ejes del pedido (pieza no rectangular): solo una placa nativa única y vigente.
    def self.unrectangular_board(ids,context)
      sheets=ids.filter_map { |id| context['materials'][id] }.select { |material| material['category']=='sheet' && material['native_status']=='valid' }
      sheets.size==1 ? OrderProposal.bound_item(sheets.first,context['catalog']) : nil
    end

    def self.material_for(board,ids,context)
      if board
        format=board['lengthMm'].is_a?(Numeric) && board['widthMm'].is_a?(Numeric) ? [board['lengthMm'],board['widthMm']] : nil
        return {'source'=>'catalog','catalogId'=>board['id'],'name'=>board['name'],'sku'=>board['sku'],'thicknessesMm'=>CatalogStore.thicknesses_of(board),
                'format'=>format,'grain'=>[true,false].include?(board['grain']) ? board['grain'] : nil}
      end
      found=ids.filter_map { |id| context['materials'][id] }
      return nil if found.empty?
      return {'source'=>'model','observedId'=>found[0]['id'],'name'=>found[0]['name'],'category'=>found[0]['category'],'linked'=>!found[0]['native_binding'].nil?} if found.size==1
      {'source'=>'mixed','observedIds'=>found.map { |material| material['id'] }.sort,'name'=>found.map { |material| material['name'] }.join(' / ')}
    end

    def self.section_source_key(material)
      return 'none' unless material
      case material['source']
      when 'catalog' then "catalog:#{material['catalogId']}"
      when 'model' then "model:#{material['observedId']}"
      else "mixed:#{material['observedIds'].join(',')}"
      end
    end

    # value: lo que resolvió OrderProposal#stage (id de canto de biblioteca, 0 sin canto o nil sin resolver).
    def self.edge_side(side,value,observed,context)
      if value.is_a?(String) && (item=context['items'][value])
        return {'side'=>side,'status'=>'catalog','catalogId'=>item['id'],'sku'=>item['sku'],'name'=>item['name']}
      end
      # The order proposal leaves unreadable or unlinked sides at 0 (no edge) with a note: the cutlist
      # still shows what the model says (painted edge without a sheet, or not readable).
      return {'side'=>side,'status'=>'none'} if value==0 && (!observed || observed['status']=='observed_no_edge')
      return {'side'=>side,'status'=>'unknown'} if observed && observed['status']=='unresolved'
      ids=observed ? Array(observed['materialIds']) : []
      edges=ids.filter_map { |id| context['materials'][id] }
      return {'side'=>side,'status'=>'unknown'} if edges.empty?
      {'side'=>side,'status'=>'observed','observedIds'=>edges.map { |material| material['id'] },'name'=>edges.map { |material| material['name'] }.join(' / ')}
    end

    # Clave estable del canto para agruparlo: la ficha si existe; si no, los materiales pintados.
    def self.edge_key(edge)
      return "catalog:#{edge['catalogId']}" if edge['status']=='catalog' && edge['catalogId']
      return "model:#{edge['observedIds'].sort.join(',')}" if edge['status']=='observed' && Array(edge['observedIds']).any?
      nil
    end

    # Una tira por lado con canto. El ancho de la tira sale de los anchos estándar de la ficha: el más angosto que
    # cubre el espesor de la pieza (o el más ancho si ninguno cubre: el canto se refila, no es un aviso). Sin anchos
    # en la ficha se toma el espesor de la pieza (lo que el canto cubre) y la tira queda marcada como aproximada.
    def self.strips(edges,thickness,rectangular,context)
      edges.filter_map do |edge|
        next unless edge['edgeKey']
        item=edge['status']=='catalog' ? context['items'][edge['catalogId']] : nil
        width=item ? strip_width(CatalogStore.widths_of(item),thickness) : nil
        {'side'=>edge['side'],'label'=>STRIP_LABELS.fetch(edge['side']),'edgeKey'=>edge['edgeKey'],'lengthMm'=>edge['lengthMm'],
         'widthMm'=>width || thickness,'widthApprox'=>width.nil?,'approximate'=>!rectangular}
      end
    end

    def self.strip_width(widths,thickness)
      return nil if widths.empty?
      widths.find { |width| width+TOLERANCE>=thickness } || widths.max
    end

    def self.measure?(value)
      value.is_a?(Numeric) && value.finite? && value.positive?
    end

    # La veta sale de la ficha de la placa. Si el pedido guardado ya fijó el eje, se respeta.
    def self.grain(board,kept,u,v)
      return nil unless board && [true,false].include?(board['grain'])
      return 'none' unless board['grain']
      axes=kept['axes'];axis=kept['grainAxis']
      return 'length' unless axes.is_a?(Array) && axes.size==2 && %w[u v].include?(axis)
      axes[axis=='u' ? 0 : 1]==v ? 'width' : 'length'
    end

    # Piezas idénticas del mismo mueble en una fila: misma definición, nombre, material, medidas, cantos y veta.
    def self.group(entries)
      groups={}
      entries.each do |entry|
        signature=[entry['furnitureId'],entry['definitionId'] || entry['id'],entry['name'],entry['sectionKey'],entry['lengthMm'],entry['widthMm'],entry['thicknessMm'],
                   entry['edges'].map { |edge| [edge['status'],edge['catalogId'],edge['observedIds']] },entry['grain'],entry['rectangular']]
        found=groups[signature]
        if found
          found['ids'] << entry['id'];found['quantity']+=1;found['codes'] |= [entry['code']] unless entry['code'].empty?
          found['notes'] |= entry['notes']
        else
          groups[signature]=entry.merge('codes'=>entry['code'].empty? ? [] : [entry['code']])
        end
      end
      groups.values.each do |entry|
        entry['codes'].sort_by! { |code| natural(code) }
        entry['code']=entry['codes'].first.to_s
        entry['id']=entry['ids'].first
        entry.delete('definitionId')
      end
    end

    def self.sections(pieces,context={})
      found={}
      pieces.each do |piece|
        found[piece['sectionKey']] ||= begin
          material=piece['material']
          base={'key'=>piece['sectionKey'],'thicknessMm'=>piece['thicknessMm']}
          if material.nil? then base.merge('source'=>'none','name'=>'Sin material','kind'=>'unknown','colorRgb'=>nil,'missing'=>[])
          else base.merge('source'=>material['source'],'name'=>material['name'],'sku'=>material['sku'],'catalogId'=>material['catalogId'],
                          'standardThicknessesMm'=>material['thicknessesMm'],'thicknessInList'=>piece['thicknessInList'],'format'=>material['format'],'grain'=>material['grain'],
                          'kind'=>section_kind(material),'colorRgb'=>material_color(material,context),'missing'=>material_missing(material,context))
          end
        end
      end
      grouped=pieces.group_by { |piece| piece['sectionKey'] }
      found.each_value { |section| section['totals']=sheet_totals(grouped[section['key']]) }
      rank={'catalog'=>0,'model'=>1,'mixed'=>2,'none'=>3}
      found.values.sort_by { |section| [rank[section['source']],section['name'].to_s.downcase,section['thicknessMm']] }
    end

    # Placa con ficha, o material del modelo que OpenCutList marca como placa. Lo demás no se sabe («?»).
    def self.section_kind(material)
      return 'sheet' if material['source']=='catalog'
      material['source']=='model' && material['category']=='sheet' ? 'sheet' : 'unknown'
    end

    # Datos que le faltan a la ficha (CatalogStore.missing). Un material del modelo sin vínculo no tiene ficha.
    def self.material_missing(material,context)
      case material['source']
      when 'catalog'
        item=context.fetch('items',{})[material['catalogId']]
        item ? CatalogStore.missing(item) : ['ficha']
      when 'model' then ['ficha']
      else []
      end
    end

    # Color de muestra (RGB del material de SketchUp): el vinculado a la ficha o el pintado.
    def self.material_color(material,context)
      materials=context.fetch('materials',{})
      found=case material['source']
            when 'catalog' then bound_material(material['catalogId'],context)
            when 'model' then materials[material['observedId']]
            when 'mixed' then materials[Array(material['observedIds']).first]
            end
      color_of(found)
    end

    def self.bound_material(catalog_id,context)
      context.fetch('materials',{}).values.find { |found| found['native_status']=='valid' && found.dig('native_binding','catalogId')==catalog_id }
    end

    def self.color_of(material)
      rgb=material && material['color_rgb']
      rgb.is_a?(Array) && rgb.size>=3 && rgb.first(3).all? { |value| value.is_a?(Integer) && value.between?(0,255) } ? rgb.first(3) : nil
    end

    # Totales de una sección de placas: piezas, metros de largo, m² y m³ netos (medidas finales × cantidad).
    def self.sheet_totals(pieces)
      pieces=Array(pieces)
      {'pieces'=>pieces.sum { |piece| piece['quantity'] },
       'lengthM'=>(pieces.sum { |piece| piece['lengthMm']*piece['quantity'] }/1000.0).round(3),
       'areaM2'=>(pieces.sum { |piece| piece['lengthMm']*piece['widthMm']*piece['quantity'] }/1e6).round(3),
       'volumeM3'=>(pieces.sum { |piece| piece['lengthMm']*piece['widthMm']*piece['thicknessMm']*piece['quantity'] }/1e9).round(4)}
    end

    # Una sección por canto (ficha o material pintado) con sus totales: tiras, metros, m² y m³.
    # El m³ solo se da si la ficha tiene espesor; el m² usa el ancho de cada tira (aproximado sin ficha).
    def self.edge_sections(pieces,context)
      found={}
      pieces.each do |piece|
        piece['strips'].each do |strip|
          edge=piece['edges'].find { |candidate| candidate['side']==strip['side'] }
          entry=found[strip['edgeKey']] ||= edge_info(edge,strip['edgeKey'],context).merge('list'=>[])
          entry['list'] << [piece,strip]
        end
      end
      found.values.map do |entry|
        list=entry.delete('list')
        thickness=entry['thicknessMm']
        # Con anchos estándar, el ancho de la sección es el de sus tiras si es uno solo (22 o 45); con los dos, ninguno.
        widths=list.map { |_piece,strip| strip['widthMm'] }.uniq
        entry['widthMm']=widths.length==1 ? widths.first : nil unless Array(entry['widthsMm']).empty?
        length=list.sum { |piece,strip| strip['lengthMm']*piece['quantity'] }
        area=list.sum { |piece,strip| strip['lengthMm']*strip['widthMm']*piece['quantity'] }
        entry.merge('widthApprox'=>list.any? { |_piece,strip| strip['widthApprox'] },
                    'totals'=>{'strips'=>list.sum { |piece,_strip| piece['quantity'] },'lengthM'=>(length/1000.0).round(3),'areaM2'=>(area/1e6).round(3),
                               'volumeM3'=>thickness ? (area*thickness/1e9).round(5) : nil})
      end.sort_by { |entry| [entry['source']=='catalog' ? 0 : 1,entry['name'].to_s.downcase,entry['key']] }
    end

    def self.edge_info(edge,key,context)
      if edge['status']=='catalog'
        item=context.fetch('items',{})[edge['catalogId']] || {}
        {'key'=>key,'source'=>'catalog','kind'=>'edge','name'=>edge['name'],'sku'=>edge['sku'],'catalogId'=>edge['catalogId'],
         'thicknessMm'=>measure?(item['thicknessMm']) ? item['thicknessMm'] : nil,'widthMm'=>nil,'widthsMm'=>item.empty? ? [] : CatalogStore.widths_of(item),
         'colorRgb'=>color_of(bound_material(edge['catalogId'],context)),'missing'=>item.empty? ? ['ficha'] : CatalogStore.missing(item)}
      else
        {'key'=>key,'source'=>'model','kind'=>'edge','name'=>edge['name'],'sku'=>nil,'catalogId'=>nil,'observedIds'=>edge['observedIds'],'thicknessMm'=>nil,'widthMm'=>nil,
         'colorRgb'=>color_of(context.fetch('materials',{})[edge['observedIds'].first]),'missing'=>['ficha']}
      end
    end

    def self.natural(text)
      text.to_s.scan(/\d+|\D+/).map { |part| part.match?(/\A\d+\z/) ? [0,part.to_i,''] : [1,0,part.downcase] }
    end
  end
end
