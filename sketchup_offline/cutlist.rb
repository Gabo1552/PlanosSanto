# frozen_string_literal: true
require 'json'
require_relative 'catalog_store'
require_relative 'supplier_order'
require_relative 'ocl_reader'
require_relative 'order_proposal'
require_relative 'guide_store'
require_relative 'workshop'

module PlanosSanto
  # Vista «Piezas»: lista de corte de los muebles generados, agrupada por material y espesor.
  # Solo lectura: no escribe el SKP, la guía ni el borrador del pedido. Reutiliza lo que ya calcula
  # el pedido (SupplierOrder#proposal para la geometría, OrderProposal#stage para ejes, placa y
  # cantos por lado, OclReader para lo pintado en cada cara) en vez de volver a interpretarlo.
  module Cutlist
    SIDES=%w[arr aba izq der].freeze
    TOLERANCE=0.1

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
      {'schema'=>1,'complete'=>report['complete']==true,'readOnly'=>true,
       'furniture'=>document.fetch('furniture',[]).map { |root| {'id'=>root['id'],'name'=>root['name']} },
       'sections'=>sections(pieces),'pieces'=>pieces}
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
        edge_side(side,stage && stage['sides'][index],observation && observation['sides'][index],context).merge('lengthMm'=>lengths[index<2 ? u : v].round(2))
      end
      {'id'=>id,'ids'=>[id],'definitionId'=>observed && observed['definition_id'],'quantity'=>1,
       'lengthMm'=>lengths[u].round(2),'widthMm'=>lengths[v].round(2),'thicknessMm'=>thickness,
       'rectangular'=>g['rectangular']==true,'mirrored'=>g['mirrored']==true,'material'=>material,
       'sectionKey'=>"#{section_source_key(material)}|#{format('%.1f',thickness)}",'edges'=>edges,
       'grain'=>grain(board,kept,u,v),'notes'=>stage ? (stage['notes'].map { |note| note['text'] }+stage['blockers']).uniq : ['Geometría no rectangular: medidas aproximadas por la caja de la pieza; cantos sin leer.']}
    end

    # Sin ejes del pedido (pieza no rectangular): solo una placa nativa única y vigente.
    def self.unrectangular_board(ids,context)
      sheets=ids.filter_map { |id| context['materials'][id] }.select { |material| material['category']=='sheet' && material['native_status']=='valid' }
      sheets.size==1 ? OrderProposal.bound_item(sheets.first,context['catalog']) : nil
    end

    def self.material_for(board,ids,context)
      if board
        format=board['lengthMm'].is_a?(Numeric) && board['widthMm'].is_a?(Numeric) ? [board['lengthMm'],board['widthMm']] : nil
        return {'source'=>'catalog','catalogId'=>board['id'],'name'=>board['name'],'sku'=>board['sku'],'thicknessMm'=>board['thicknessMm'],
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

    def self.sections(pieces)
      found={}
      pieces.each do |piece|
        found[piece['sectionKey']] ||= begin
          material=piece['material']
          base={'key'=>piece['sectionKey'],'thicknessMm'=>piece['thicknessMm']}
          if material.nil? then base.merge('source'=>'none','name'=>'Sin material')
          else base.merge('source'=>material['source'],'name'=>material['name'],'sku'=>material['sku'],'catalogId'=>material['catalogId'],
                          'catalogThicknessMm'=>material['thicknessMm'],'format'=>material['format'],'grain'=>material['grain'])
          end
        end
      end
      rank={'catalog'=>0,'model'=>1,'mixed'=>2,'none'=>3}
      found.values.sort_by { |section| [rank[section['source']],section['name'].to_s.downcase,section['thicknessMm']] }
    end

    def self.natural(text)
      text.to_s.scan(/\d+|\D+/).map { |part| part.match?(/\A\d+\z/) ? [0,part.to_i,''] : [1,0,part.downcase] }
    end
  end
end
