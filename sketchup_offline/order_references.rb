# frozen_string_literal: true
require 'json'

module PlanosSanto
  # F-DESP-B / punto 17 (0.8.16): the A4 and the labels print the order rows that already validate, taken
  # from the order proposed from the painted model (crossed with the saved draft when there is one). Every
  # other included row is «pendiente de pedido». No saved draft and no ticks are needed. The board-level
  # contract follows Maderera (text, board, edge map, roles and cut of the supplier TXT) plus the TXT
  # lot and the board grain; read-only.
  module OrderReferences
    SIDES=%w[Arr Aba Izq Der].freeze
    TXT_PROFILE={'encoding'=>'utf8','decimal'=>'.','header'=>false}.freeze

    def self.partial(_model,workshop)
      service,draft=workshop.current_board_plan
      draft=SupplierOrder.normalize(draft)
      included=draft['rows'].select { |row| row['include'] }
      excluded=draft['rows'].reject { |row| row['include'] }.map { |row| row['id'] }
      # Nothing included yet: the sheet prints without order data instead of failing the whole draft.
      return {'references'=>{},'pending'=>[],'excluded'=>excluded} if included.empty?
      # Same board grouping, dimensions and edge codes as the current Maderera TXT. A blocked board
      # (e.g. three edge products) has no printable assignment; good rows on other boards remain usable.
      listed=service.boards(draft)['boards']
      # A SKU is not a unique catalog identity. Different boards with the same SKU/thickness
      # need distinct printed labels, otherwise their independent code 1/2 legends collide again.
      labels=listed.map { |board| "#{board['sku']} / #{service.mm(board['thicknessMm'])} mm" }
      counts=labels.tally
      assignments={}
      listed.each_with_index do |board,index|
        failed=board['problems'].map { |problem| problem['id'] }
        label=counts[labels[index]]>1 ? "#{labels[index]} · #{board['name']} (placa #{index+1})" : nil
        board['rowIds'].each { |id| assignments[id]=[board,index+1,label] unless board['blocker'] || failed.include?(id) }
      end
      references={};pending=[]
      included.each do |row|
        assigned=assignments[row['id']]
        reference=assigned ? reference_for(service,row,*assigned) : nil
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

    def self.reference_for(service,row,assignment,lot,label=nil)
      board=service.material(row['materialId'],'sheet')
      mapping=service.board_edge_map(row,assignment)
      roles=[1,2].map { |code| assignment['edges'].find { |edge| edge['code']==code }&.fetch('sku') }
      edge_text=mapping.each_with_index.map { |role,i| "#{SIDES[i]}:#{role==0 ? 'sin' : roles[role-1]}" }.join(' ')
      board_text=label || "#{board['sku']} / #{service.mm(service.row_thickness(row))} mm";base,height=service.dimensions(row)
      {'text'=>"#{board_text} · #{edge_text}",'board'=>board_text,'edgeMap'=>mapping,'principal'=>roles[0],'secondary'=>roles[1],
       'base'=>base,'height'=>height,'lot'=>lot,
       'grain'=>[true,false].include?(board['grain']) ? board['grain'] : nil}
    rescue ExportError
      nil
    end
  end
end
