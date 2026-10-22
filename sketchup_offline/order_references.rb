# frozen_string_literal: true
require 'json'

module PlanosSanto
  # F-DESP-B: the A4 and the labels print the rows of the saved order that already validate; every other
  # included row is «pendiente de pedido». Same per-row contract as Workshop#references (text, board, edge map,
  # roles and cut of the supplier TXT) plus the TXT lot and the board grain, read-only over the saved draft.
  module OrderReferences
    SIDES=%w[Arr Aba Izq Der].freeze
    TXT_PROFILE={'encoding'=>'utf8','decimal'=>'.','header'=>false}.freeze

    def self.partial(model,workshop)
      raw=model.get_attribute(Workshop::DICT,Workshop::KEY)
      raise ExportError,'Guardá primero el borrador revisado del pedido.' unless raw.is_a?(String)
      result=workshop.plan;draft=result['plan']
      stored=JSON.parse(raw)
      unless stored.is_a?(Hash) && stored['fingerprint']==draft['fingerprint'] && stored['catalogRevision']==draft['catalogRevision']
        raise ExportError,'El pedido guardado quedó desactualizado: volvé a revisarlo en Biblioteca y pedidos.'
      end
      service=workshop.order
      included=draft['rows'].select { |row| row['include'] }
      excluded=draft['rows'].reject { |row| row['include'] }.map { |row| row['id'] }
      # Nothing included yet: the sheet prints without order data instead of failing the whole draft.
      return {'references'=>{},'pending'=>[],'excluded'=>excluded} if included.empty?
      # The TXT file profile (encoding, decimal, header) never reaches the A4 or the labels: an unfinished one does not block them.
      failing=service.validate(draft.merge('profile'=>TXT_PROFILE),collect_errors:true).map { |error| error['id'] }
      # Lots follow the supplier export: one TXT per board, thickness and edge roles, in draft order.
      lots={}
      included.each do |row|
        board=approved(service,row['materialId'],'sheet') or next
        lots[[row['materialId'],board['thicknessMm'],row['principalId'],row['secondaryId']]] ||= lots.length+1
      end
      references={};pending=[]
      included.each do |row|
        reference=failing.include?(row['id']) ? nil : reference_for(service,row,lots)
        # Module·piece code of the saved guide (OrderProposal.codes): the same one the TXT detail carries.
        code=draft.fetch('codes',{})[row['id']].to_s
        reference['code']=code if reference && !code.empty?
        if reference then references[row['id']]=reference else pending << row['id'] end
      end
      # Lot numbers are final only when every included row validates: a pending row can still move to another lot and renumber the TXT.
      references.each_value { |reference| reference.delete('lot') } unless pending.empty?
      {'references'=>references,'pending'=>pending,'excluded'=>excluded}
    rescue JSON::ParserError
      raise ExportError,'Borrador de pedido dañado. Prepará uno nuevo sin sobrescribir el anterior.'
    end

    def self.approved(service,id,kind)
      service.material(id,kind)
    rescue ExportError
      nil
    end

    def self.reference_for(service,row,lots)
      board=service.material(row['materialId'],'sheet')
      roles=[row['principalId'],row['secondaryId']].map { |id| id ? service.material(id,'edge')['sku'] : nil }
      edge_text=row['edgeMap'].each_with_index.map { |role,i| "#{SIDES[i]}:#{role==0 ? 'sin' : roles[role-1]}" }.join(' ')
      board_text="#{board['sku']} / #{board['thicknessMm']} mm";base,height=service.dimensions(row)
      {'text'=>"#{board_text} · #{edge_text}",'board'=>board_text,'edgeMap'=>row['edgeMap'].dup,'principal'=>roles[0],'secondary'=>roles[1],
       'base'=>base,'height'=>height,'lot'=>lots[[row['materialId'],board['thicknessMm'],row['principalId'],row['secondaryId']]],
       'grain'=>[true,false].include?(board['grain']) ? board['grain'] : nil}
    rescue ExportError
      nil
    end
  end
end
