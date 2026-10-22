# frozen_string_literal: true
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
    def maderera_profiles
      {'profiles'=>@profiles.read,'template'=>MaderaProfile.template}
    end
    def save_maderera_profile(profile,revision);@profiles.save(profile,revision);maderera_profiles;end
    def approve_maderera_profile(id,version,revision);@profiles.approve(id,version,revision);maderera_profiles;end
    def activate_maderera_profile(id,revision);@profiles.activate(id,revision);maderera_profiles;end
    def order
      @session.check_current!
      catalog=@catalog.read;report=nil
      read=lambda { report ||= OclReader.capture(@model) }
      service=SupplierOrder.new(@session.document,@session.fingerprint,catalog,
        material_proposal:lambda { |id| native_proposal(read.call,id,catalog) },maderera:active_maderera)
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
      links_changed=stored.is_a?(Hash) && Array(stored['edgeLinks'])!=Array(draft['edgeLinks'])
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
        board_text="#{board['sku']} / #{board['thicknessMm']} mm";base,height=service.dimensions(row)
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
