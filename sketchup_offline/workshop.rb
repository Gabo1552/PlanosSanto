# frozen_string_literal: true
require 'tempfile'
require 'securerandom'
require_relative 'catalog_store'
require_relative 'supplier_order'
require_relative 'maderera_profile'
require_relative 'ocl_reader'
require_relative 'order_proposal'
require_relative 'guide_store'
require_relative 'order_references'

module PlanosSanto
  class Workshop
    DICT='PlanosSantoPedidos'
    KEY='draft_v1'
    def initialize(model,session,directory: CatalogStore.default_directory)
      @model=model;@session=session;@catalog=CatalogStore.new(directory:directory);@profiles=MaderaProfileStore.new(directory:directory)
    end
    def catalog
      _bytes,parsed,data=@catalog.load
      {'catalog'=>data,'conflicts'=>@catalog.conflicts(data),'migration'=>@catalog.migration(parsed)}
    end
    def save_catalog(items,revision);data=@catalog.save(items,revision);{'catalog'=>data,'conflicts'=>@catalog.conflicts(data)};end
    def import_catalog(data,revision);data=@catalog.import(data,revision);{'catalog'=>data,'conflicts'=>@catalog.conflicts(data)};end
    def add_item(data,revision)
      current=@catalog.read
      raise ExportError,'La biblioteca cambió en otra ventana: volvé a abrirla y repetí el alta del material.' unless current['revision']==revision
      current['items'] << @catalog.new_item(data.fetch('name'),data.fetch('kind','unknown'))
      save_catalog(current['items'],revision)
    end
    def export_catalog(target);@catalog.export(target);{'path'=>target};end
    PRESETS=File.join(__dir__,'presets-taller.json')
    # MATERIALES-02: shipped suggestions, read-only and validated before use.
    def presets
      data=JSON.parse(File.read(PRESETS))
      valid=data.is_a?(Hash) && data['schema']==1 && data['presets'].is_a?(Array) && data['presets'].all? do |preset|
        preset.is_a?(Hash) && preset.keys.sort==%w[id kind label values] && %w[sheet edge].include?(preset['kind']) && preset['values'].is_a?(Hash) &&
          (preset['values'].keys-%w[thicknessMm widthMm lengthMm grain]).empty? && preset['values'].values.all? { |v| v.nil? || [true,false].include?(v) || (v.is_a?(Numeric) && v>0 && v<=100000) }
      end
      raise ExportError,'Los valores sugeridos del taller están dañados; reinstalá la extensión.' unless valid
      {'note'=>data['note'],'presets'=>data['presets']}
    rescue JSON::ParserError,SystemCallError
      raise ExportError,'Los valores sugeridos del taller están dañados; reinstalá la extensión.'
    end
    def add_preset(preset_id,name,revision)
      preset=presets['presets'].find { |row| row['id']==preset_id };raise ExportError,'Ese valor sugerido no existe.' unless preset
      current=@catalog.read
      raise ExportError,'La biblioteca cambió en otra ventana: volvé a abrirla y repetí el alta del material.' unless current['revision']==revision
      name=name.to_s.strip.empty? ? preset['label'] : name
      raise ExportError,'Ya existe un material con ese nombre en la biblioteca.' if current['items'].any? { |item| item['name'].unicode_normalize(:nfc).downcase==@catalog.text(name).downcase }
      item=@catalog.suggested_item(name,preset['kind'],preset['values'],'preset',{'source'=>'preset','presetId'=>preset['id']},preset_id:preset['id'])
      save_catalog(current['items']+[item],revision)
    end
    def add_variant(base_id,thickness,revision,name: nil)
      current=@catalog.read
      raise ExportError,'La biblioteca cambió en otra ventana: volvé a abrirla y repetí la variante.' unless current['revision']==revision
      item=@catalog.variant_item(current['items'].find { |row| row['id']==base_id },thickness,name)
      raise ExportError,'Ya existe un material con ese nombre en la biblioteca.' if current['items'].any? { |row| row['name'].unicode_normalize(:nfc).downcase==item['name'].downcase }
      save_catalog(current['items']+[item],revision)
    end
    # 0.8.20: «Agregar 16 mm a la ficha» from the cutlist or the order. Adding to a list commutes with any
    # other edit, so it needs no revision from the window: the store reads the current one.
    def add_thickness(id,thickness);data=@catalog.add_thickness(id,thickness);{'catalog'=>data,'conflicts'=>@catalog.conflicts(data)};end
    def maderera_profiles
      {'profiles'=>@profiles.read,'template'=>MaderaProfile.template}
    end
    def save_maderera_profile(profile,revision);@profiles.save(profile,revision);maderera_profiles;end
    def approve_maderera_profile(id,version,revision);@profiles.approve(id,version,revision);maderera_profiles;end
    def activate_maderera_profile(id,revision);@profiles.activate(id,revision);maderera_profiles;end
    # profile: false (0.8.20, Maderera) leaves the supplier profile out: it stays saved, it is just not applied.
    def order(profile: true)
      @session.check_current!
      catalog=@catalog.read;report=nil
      read=lambda { report ||= OclReader.capture(@model) }
      service=SupplierOrder.new(@session.document,@session.fingerprint,catalog,
        material_proposal:lambda { |id| native_proposal(read.call,id,catalog) },maderera:profile ? active_maderera : nil)
      service.detail_codes=codes;@read=read;@order_catalog=catalog
      service
    end
    # Código módulo·pieza de la guía guardada. Una guía dañada no inventa códigos: las filas quedan sin código.
    def codes
      OrderProposal.codes(@session.document,GuideStore.new(@model).read)
    rescue ExportError
      {}
    end
    # A damaged profile file never blocks orders: it only shows in its own screen.
    def active_maderera
      @profiles.active
    rescue ExportError
      nil
    end
    def native_piece(report,id)
      report['pieces'].find { |piece| piece['path'].join('/')==id }
    end
    def native_materials(report,piece)
      return [] unless piece
      ids=piece['faces'].flat_map { |face| [face['front_material_id'],face['back_material_id']] }.compact.uniq
      report['materials'].select { |material| ids.include?(material['id']) }
    end
    def bound_catalog_item(material,catalog);OrderProposal.bound_item(material,catalog);end
    def native_proposal(report,id,catalog)
      materials=native_materials(report,native_piece(report,id))
      sheets=materials.select { |material| material['category']=='sheet' && material['native_status']=='valid' }
      patch={}
      if sheets.size==1 && (item=bound_catalog_item(sheets.first,catalog)) && item['kind']=='sheet'
        patch['materialId']=item['id']
      end
      edges=materials.select { |material| material['category']=='edge' && material['native_status']=='valid' }
      bindings=edges.filter_map { |material| item=bound_catalog_item(material,catalog);{'observedId'=>material['id'],'catalogId'=>item['id']} if item }
      patch['edgeBindings']=bindings unless bindings.empty?
      patch
    end
    # Draft saved in the model, or nil. A damaged one is reported, never trusted, and replaced on the next save.
    def stored_draft
      raw=@model.get_attribute(DICT,KEY)
      return nil unless raw.is_a?(String) && raw.bytesize<=8*1024*1024
      stored=JSON.parse(raw)
      stored.is_a?(Hash) && stored['rows'].is_a?(Array) ? stored : (@damaged=true;nil)
    rescue JSON::ParserError
      @damaged=true;nil
    end
    def stale?(draft,current)
      !draft.is_a?(Hash) || %w[fingerprint catalogRevision maderera].any? { |key| draft[key]!=current[key] } ||
        !draft['rows'].is_a?(Array) || draft['rows'].map { |r| r.is_a?(Hash) ? r['id'] : nil }.sort_by(&:to_s)!=current['rows'].map { |r| r['id'] }.sort
    end
    # Puntos 3 y 10: the order is always proposed from the painted model when it opens. A saved draft is
    # crossed with that proposal by row id (OrderProposal.merge), never discarded because the model, the
    # library or the supplier profile changed.
    def build(stored,service=order)
      fresh=service.proposal
      links=stored.is_a?(Hash) ? stored['edgeLinks'] : nil
      fresh['edgeLinks']=links.is_a?(Array) ? links : []
      proposed=OrderProposal.new(service,@read,@order_catalog).propose(fresh)
      plan=proposed['plan'];merge=nil
      if stored
        merged=OrderProposal.merge(stored,plan);plan=merged['plan']
        merge=merged['merge'].merge('stale'=>stale?(stored,fresh)) if stale?(stored,fresh) || merged['merge']['kept']>0
      end
      plan['detailCode']=plan.fetch('detailCode','none');plan['codes']=codes
      {'plan'=>plan,'proposal'=>proposed['proposal'],'merge'=>merge,'service'=>service}
    end
    def plan(reset=false)
      @damaged=false
      built=build(reset ? nil : stored_draft)
      {'plan'=>built['plan'],'catalog'=>@order_catalog,'proposal'=>built['proposal'],'merge'=>built['merge'],'damagedDraft'=>@damaged,
       'audit'=>audit_with(built['service'],built['plan'])}
    end
    # Order rows as the A4 and the labels see them: the proposal crossed with the saved draft, if any.
    def current_plan
      built=build(stored_draft);[built['service'],built['plan']]
    end
    def edge_observations(row)
      proposal=order.proposal
      raise ExportError,'Pieza desconocida en este pedido.' unless proposal['geometry'].key?(row['id'])
      report=OclReader.capture(@model)
      OclReader.projected_edges(report,row,proposal['geometry'].fetch(row['id']))
    end
    def current_draft!(draft,service=order)
      current=service.proposal
      raise ExportError,'El modelo, la biblioteca o el perfil cambiaron: volvé a abrir el pedido y se actualiza solo.' if stale?(draft,current)
      raise ExportError,'Pedido con campos desconocidos: volvé a abrir el pedido.' unless draft['rows'].all? { |row| row.is_a?(Hash) && SupplierOrder.normalize_row(row).keys.sort==SupplierOrder::ROW_KEYS.sort }
      OrderProposal.check_extras!(draft)
      current
    end
    def proposal_service(draft,ids=nil)
      raise ExportError,'Selección de piezas inválida.' unless ids.nil? || (ids.is_a?(Array) && ids.all?(String))
      service=order;current_draft!(draft,service)
      [service,OrderProposal.new(service,@read,@order_catalog)]
    end
    def with_view(result,service)
      result.merge('plan'=>result['plan'].merge('geometry'=>service.proposal['geometry'],'codes'=>codes))
    end
    # Vuelve a proponer desde el modelo las piezas elegidas (o todas): reemplaza lo editado en esas filas.
    def propose(draft,ids=nil)
      service,proposal=proposal_service(draft,ids)
      with_view(proposal.propose(draft,ids:ids),service)
    end
    # 0.8.15 «Confirmar en bloque»: ya no hay nada que confirmar. Se conserva la acción del bridge sin efecto.
    def confirm_bulk(draft,ids=nil)
      service,_proposal=proposal_service(draft,ids)
      with_view({'plan'=>SupplierOrder.normalize(draft),'confirmed'=>[],'review'=>[]},service)
    end
    def apply_rows(draft,source_id,target_ids,groups)
      raise ExportError,'Elegí piezas destino y qué copiar.' unless target_ids.is_a?(Array) && target_ids.all?(String) && groups.is_a?(Hash)
      service,proposal=proposal_service(draft)
      with_view(proposal.apply(draft,source_id,target_ids,groups.select { |key,value| OrderProposal::GROUPS.key?(key) && value==true }),service)
    end
    STORED=%w[schema fingerprint catalogRevision maderera rows profile edgeLinks detailCode proposed].freeze
    # Punto 11: autosave. The UI sends the draft a moment after each change. When the model, the library,
    # the profile or the edge links changed meanwhile, the draft is crossed again with a new proposal and
    # the result comes back (`changed`). Always returns the live problems of the saved draft.
    def save_plan(draft)
      raise ExportError,'Pedido inválido.' unless draft.is_a?(Hash) && draft['rows'].is_a?(Array)
      service=order;current=service.proposal;stored=stored_draft
      links_changed=Array(stored.is_a?(Hash) ? stored['edgeLinks'] : [])!=Array(draft['edgeLinks'])
      changed=stale?(draft,current) || links_changed || !draft['proposed'].is_a?(Hash)
      built=changed ? build(draft,service) : nil
      draft=built ? built['plan'] : SupplierOrder.normalize(draft)
      current_draft!(draft,service)
      value=JSON.generate(draft.slice(*STORED))
      raise ExportError,'Borrador demasiado grande.' if value.bytesize>8*1024*1024
      write_draft(value) unless value==@model.get_attribute(DICT,KEY)
      result={'saved'=>true,'modelFileSaved'=>false,'changed'=>changed,'audit'=>audit_with(service,draft)}
      result.merge!('plan'=>draft.merge('geometry'=>current['geometry']),'proposal'=>built['proposal'],'merge'=>built['merge']) if built
      result
    end
    def write_draft(value)
      started=false
      begin
        raise ExportError,'No se pudo iniciar la operación.' unless @model.start_operation('Guardar pedido Planos Santo',true)
        started=true;@model.set_attribute(DICT,KEY,value)
        raise ExportError,'No se pudo guardar el pedido.' unless @model.commit_operation
        started=false
      rescue StandardError
        @model.abort_operation if started;raise
      end
    end
    # Live problems (punto 12): physical blockers per row, supplier warnings and, when nothing blocks, the net estimate.
    def audit_with(service,draft)
      errors=service.validate(draft,collect_errors:true)
      normalized=SupplierOrder.normalize(draft)
      result={'blocked'=>errors,'warnings'=>service.warnings(normalized),'excluded'=>normalized['rows'].reject { |row| row['include'] }.map { |row| row.slice('id','detail','excludeReason') },'production_ready'=>false}
      result['estimate']=service.estimate(normalized) if errors.empty? && normalized['rows'].any? { |row| row['include'] }
      result
    rescue ExportError => error
      # Nothing included, or a stale draft: the reason is the only problem to show.
      {'blocked'=>[],'warnings'=>[],'excluded'=>[],'production_ready'=>false,'error'=>error.message}
    end
    def audit(draft);audit_with(order,draft);end
    def check(draft)
      service=order
      service.validate(draft)
      {'valid'=>true,'estimate'=>service.estimate(draft)}
    end
    # Every included row must validate; the rows come from the model proposal crossed with the saved draft.
    def references
      service,draft=current_plan;draft=service.validate(draft)
      draft['rows'].select { |row| row['include'] }.to_h do |row|
        board=service.material(row['materialId'],'sheet')
        roles=OrderReferences.roles(service,row)
        edge_text=row['edgeMap'].each_with_index.map { |role,i| "#{%w[Arr Aba Izq Der][i]}:#{role==0 ? 'sin' : roles[role-1]}" }.join(' ')
        board_text="#{board['sku']} / #{service.mm(service.row_thickness(row))} mm";base,height=service.dimensions(row)
        # 'text' keeps the previous printed contract; the rest is the same edge map and cut as the supplier TXT (Arr·Aba·Izq·Der over base × height).
        [row['id'],{'text'=>"#{board_text} · #{edge_text}",'board'=>board_text,'edgeMap'=>row['edgeMap'].dup,'principal'=>roles[0],'secondary'=>roles[1],'base'=>base,'height'=>height}]
      end
    end
    # The TXT never goes out stale: the painted model is read once more and, if the proposal moved under
    # what the taller did not edit (repainted faces, renamed pieces), the export stops and the order is
    # refreshed when it is opened again. Hand-made edits never trigger this.
    def export_order(draft,directory)
      service=order
      current_draft!(draft,service)
      built=build(draft,service)
      unless canonical(SupplierOrder.normalize(draft)['rows'])==canonical(built['plan']['rows'])
        raise ExportError,'El modelo cambió desde que se abrió el pedido (pintura o nombres de piezas): el pedido se actualiza solo al volver a abrirlo. Revisalo y exportá de nuevo.'
      end
      service.export(draft,directory)
    end
    def canonical(value);value.is_a?(Hash) ? value.sort.to_h.transform_values { |v| canonical(v) } : value.is_a?(Array) ? value.map { |v| canonical(v) } : value;end

    # --- 0.8.20 · Maderera: optimización por placa y un TXT por material -----------------------------------
    # Todas las piezas de todos los muebles analizados, propuestas desde el modelo pintado y la biblioteca y
    # cruzadas con el borrador guardado (lo elegido a mano en versiones anteriores, como la placa de una pieza
    # sin pintar o una pieza excluida, se respeta igual que en la A4). Nunca escribe el borrador ni aplica el
    # perfil de maderera: los dos quedan guardados tal como estaban, para poder volver a la pantalla anterior.
    # El giro lo decide el corte elegido en pantalla (rota 0 salvo que se pida girar) y el detalle va sin código.
    def current_board_plan
      @damaged=false;service=order(profile:false)
      plan=build(stored_draft,service)['plan'].merge('detailCode'=>'none')
      [service,service.board_draft(plan)]
    end
    def board_plan
      @board_plan ||= current_board_plan
    end
    def board_list(rotate: false, method: 'general')
      method=SupplierOrder.optimization_method(method)
      @board_lists ||= {}
      @board_lists[[rotate,method]] ||= board_plan[0].boards(board_plan[1],rotate:rotate,method:method)
    end
    def boards(rotate: false, method: 'general')
      service,plan=board_plan;listed=board_list(rotate:rotate,method:method);names=board_file_names(listed['boards'])
      {'plan'=>service.board_draft(plan,rotate:rotate,method:method),'catalog'=>@order_catalog,'modelName'=>project_name,'boards'=>listed['boards'].map { |board| board.merge('fileName'=>names[board['key']]) },'outside'=>listed['outside']}
    end
    def project_name
      document=@session.document || {}
      name=(document['name'] || document['modelName']).to_s.strip
      name.empty? ? 'Obra' : name
    end
    # Parte de un nombre de archivo sin lo que Windows no acepta.
    def self.file_part(text,limit=60)
      text.to_s.unicode_normalize(:nfc).gsub(/[\\\/:*?"<>|\x00-\x1f]/,' ').strip.squeeze(' ')[0,limit].to_s.strip.sub(/[. ]+\z/,'')
    end
    # obra-material-espesor.txt (18 mm → «18mm», 18,5 mm → «18,5mm»); dos placas que dan el mismo nombre se numeran.
    def board_file_names(boards)
      service,=board_plan;used=Hash.new(0);obra=self.class.file_part(project_name).then { |part| part.empty? ? 'Obra' : part }
      boards.to_h do |board|
        material=self.class.file_part(board['name']).then { |part| part.empty? ? 'Placa' : part }
        base="#{obra}-#{material}-#{service.mm(board['thicknessMm'])}mm";used[base.downcase]+=1
        [board['key'],used[base.downcase]>1 ? "#{base}-#{used[base.downcase]}.txt" : "#{base}.txt"]
      end
    end
    # TXT de una placa listo para guardar (valida antes de abrir el diálogo de guardado).
    def board_export(key,rotate,method: 'general')
      service,plan=board_plan;prepared=service.board_txt(plan,key,rotate:rotate,method:method,listed:board_list(rotate:rotate,method:method)['boards'])
      prepared.merge('fileName'=>board_file_names(board_list(rotate:rotate,method:method)['boards'])[key])
    end
    def self.write_txt(bytes,target)
      target=target.to_s;target+='.txt' unless target.downcase.end_with?('.txt')
      Tempfile.create(['.planos-santo-','.txt'],File.dirname(target)) do |file|
        file.binmode;file.write(bytes);file.flush;file.fsync;file.close
        File.rename(file.path,target)
      end
      target
    end
    def write_board(prepared,target)
      path=self.class.write_txt(prepared['content'],target)
      prepared.reject { |key,_| key=='content' }.merge('path'=>path,'bytes'=>prepared['content'].bytesize)
    end
    # «Exportar todos»: un TXT por placa en una carpeta nueva dentro de la elegida (nunca reemplaza nada).
    # Las placas con problemas no se exportan y vuelven con el motivo.
    def export_boards(rotate,directory,method: 'general')
      service,plan=board_plan;listed=board_list(rotate:rotate,method:method)['boards'];names=board_file_names(listed)
      raise ExportError,'No hay placas para exportar: pintá las piezas con placas de la biblioteca.' if listed.empty?
      ready=[];skipped=[]
      listed.each do |board|
        ready << service.board_txt(plan,board['key'],rotate:rotate,listed:listed,method:method).merge('fileName'=>names[board['key']])
      rescue ExportError => error
        skipped << {'key'=>board['key'],'name'=>board['name'],'thicknessMm'=>board['thicknessMm'],'reason'=>error.message}
      end
      raise ExportError,"No se exportó ninguna placa. #{skipped.first['reason']}" if ready.empty?
      base="#{self.class.file_part(project_name).then { |part| part.empty? ? 'Obra' : part }}-maderera-#{Time.now.strftime('%Y%m%d-%H%M')}"
      target=File.join(directory,base);suffix=1
      target=File.join(directory,"#{base}-#{suffix+=1}") while File.exist?(target)
      staging=File.join(directory,".#{File.basename(target)}-#{SecureRandom.hex(4)}.tmp");Dir.mkdir(staging,0o700)
      ready.each { |entry| File.binwrite(File.join(staging,entry['fileName']),entry['content']) }
      raise ExportError,'Ya existe esa carpeta; no se reemplazó.' if File.exist?(target)
      File.rename(staging,target)
      {'directory'=>target,'files'=>ready.map { |entry| entry.reject { |key,_| key=='content' }.merge('file'=>entry['fileName']) },'skipped'=>skipped}
    ensure
      FileUtils.remove_entry(staging) if staging && File.directory?(staging)
    end
  end

  module OclGateway
    def self.open(tab)
      raise ExportError,'Herramienta OpenCutList no permitida.' unless %w[cutlist materials].include?(tab)
      namespace=Object.const_defined?(:Ladb,false) && ::Ladb.const_defined?(:OpenCutList,false) ? ::Ladb.const_get(:OpenCutList,false) : nil
      compatible=namespace && namespace.const_defined?(:EXTENSION_VERSION,false) && namespace.const_defined?(:EXTENSION_BUILD,false) && namespace.const_get(:EXTENSION_VERSION,false)=='7.1.0' && namespace.const_get(:EXTENSION_BUILD,false)=='202511301621'
      raise ExportError,'Abrí OpenCutList original. Este acceso se revisó para 7.1.0/build 202511301621; no se fuerza otra versión.' unless compatible && namespace.const_defined?(:PLUGIN,false)
      plugin=namespace.const_get(:PLUGIN,false)
      raise ExportError,'La interfaz de OpenCutList no está disponible.' unless plugin.respond_to?(:show_tabs_dialog)
      # Reviewed entry point at pinned upstream plugin.rb:1101. Only opens the
      # ORIGINAL dialog; its own user controls execute optimization/costs.
      plugin.show_tabs_dialog(tab)
      {'opened'=>true,'engine'=>'OpenCutList original','optimized'=>false}
    end
  end
end
