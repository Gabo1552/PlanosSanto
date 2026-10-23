# frozen_string_literal: true
require 'json'

module PlanosSanto
  # F-DESP-B / punto 17 (0.8.16): the A4 and the labels print the order rows that already validate, taken
  # from the order proposed from the painted model (crossed with the saved draft when there is one). Every
  # other included row is «pendiente de pedido». No saved draft and no ticks are needed. Same per-row
  # contract as Workshop#references (text, board, edge map, roles and cut of the supplier TXT) plus the TXT
  # lot and the board grain; read-only.
  module OrderReferences
    SIDES=%w[Arr Aba Izq Der].freeze
    TXT_PROFILE={'encoding'=>'utf8','decimal'=>'.','header'=>false}.freeze

    def self.partial(_model,workshop)
      service,draft=workshop.current_plan
      draft=SupplierOrder.normalize(draft)
      included=draft['rows'].select { |row| row['include'] }
      excluded=draft['rows'].reject { |row| row['include'] }.map { |row| row['id'] }
      # Nothing included yet: the sheet prints without order data instead of failing the whole draft.
      return {'references'=>{},'pending'=>[],'excluded'=>excluded} if included.empty?
      # The TXT file profile (encoding, decimal, header) never reaches the A4 or the labels: an unfinished one does not block them.
      failing=service.validate(draft.merge('profile'=>TXT_PROFILE),collect_errors:true).map { |error| error['id'] }
      # Lots follow the supplier export: one TXT per board, thickness and edge roles, in draft order.
      lots={}
      included.each do |row|
        board=usable(service,row['materialId'],'sheet') or next
        lots[[row['materialId'],service.thickness_key(row),row['principalId'],row['secondaryId']]] ||= lots.length+1
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
    end

    def self.usable(service,id,kind)
      service.material(id,kind)
    rescue ExportError
      nil
    end

    # SKU of each edge role a side actually uses (an unused role never reaches the TXT).
    def self.roles(service,row)
      [row['principalId'],row['secondaryId']].each_with_index.map { |id,index| id && row['edgeMap'].include?(index+1) ? service.material(id,'edge')['sku'] : nil }
    end

    def self.reference_for(service,row,lots)
      board=service.material(row['materialId'],'sheet')
      roles=roles(service,row)
      edge_text=row['edgeMap'].each_with_index.map { |role,i| "#{SIDES[i]}:#{role==0 ? 'sin' : roles[role-1]}" }.join(' ')
      board_text="#{board['sku']} / #{service.mm(service.row_thickness(row))} mm";base,height=service.dimensions(row)
      {'text'=>"#{board_text} · #{edge_text}",'board'=>board_text,'edgeMap'=>row['edgeMap'].dup,'principal'=>roles[0],'secondary'=>roles[1],
       'base'=>base,'height'=>height,'lot'=>lots[[row['materialId'],service.thickness_key(row),row['principalId'],row['secondaryId']]],
       'grain'=>[true,false].include?(board['grain']) ? board['grain'] : nil}
    rescue ExportError
      nil
    end
  end
end
