# frozen_string_literal: true
require_relative 'catalog_store'
require_relative 'supplier_order'
require_relative 'ocl_reader'

module PlanosSanto
  class Workshop
    DICT='PlanosSantoPedidos'
    KEY='draft_v1'
    def initialize(model,session,directory: CatalogStore.default_directory)
      @model=model;@session=session;@catalog=CatalogStore.new(directory:directory)
    end
    def catalog
      data=@catalog.read
      {'catalog'=>data,'conflicts'=>@catalog.conflicts(data)}
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
    def order
      @session.check_current!
      catalog=@catalog.read;report=nil
      read=lambda { report ||= OclReader.capture(@model) }
      SupplierOrder.new(@session.document,@session.fingerprint,catalog,
        edge_review:lambda { |row,geometry| OclReader.verify_edge_mapping(read.call,row,geometry,catalog) },
        source_review:lambda { |row,geometry| verify_native_source(read.call,row,geometry,catalog) },
        material_proposal:lambda { |id| native_proposal(read.call,id,catalog) })
    end
    def native_piece(report,id)
      report['pieces'].find { |piece| piece['path'].join('/')==id }
    end
    def native_materials(report,piece)
      return [] unless piece
      ids=piece['faces'].flat_map { |face| [face['front_material_id'],face['back_material_id']] }.compact.uniq
      report['materials'].select { |material| ids.include?(material['id']) }
    end
    def bound_catalog_item(material,catalog)
      binding=material['native_binding']
      return nil unless material['native_status']=='valid' && binding
      catalog['items'].find { |item| item['id']==binding['catalogId'] && item['kind']==binding['kind'] && item['approved'] && MaterialResolver.item_fingerprint(item)==binding['catalogFingerprint'] }
    end
    def native_proposal(report,id,catalog)
      materials=native_materials(report,native_piece(report,id))
      sheets=materials.select { |material| material['category']=='sheet' && material['native_status']=='valid' }
      patch={}
      if sheets.size==1 && (item=bound_catalog_item(sheets.first,catalog))
        patch['materialId']=item['id']
      end
      edges=materials.select { |material| material['category']=='edge' && material['native_status']=='valid' }
      bindings=edges.filter_map { |material| item=bound_catalog_item(material,catalog);{'observedId'=>material['id'],'catalogId'=>item['id']} if item }
      patch['edgeBindings']=bindings unless bindings.empty?
      patch
    end
    def verify_native_source(report,row,geometry,catalog)
      materials=native_materials(report,native_piece(report,row['id']))
      if materials.any? { |material| %w[invalid conflict].include?(material['native_status']) }
        raise ExportError,'Hay vínculos Planos Santo inválidos o en conflicto con OpenCutList. Resolvé el material antes de exportar; una nota manual no reemplaza el vínculo.'
      end
      natives=materials.select { |material| material['native_status']=='valid' }
      return if natives.empty?
      raise ExportError,'El recorrido está incompleto; no se validan materiales nativos.' unless report['complete']
      natives.each do |material|
        item=bound_catalog_item(material,catalog)
        raise ExportError,'El material pintado no coincide con un ítem aprobado vigente de biblioteca. Revisá el vínculo y sus medidas.' unless item
        if item['kind']=='sheet' && row['materialId']!=item['id']
          raise ExportError,'La placa elegida no coincide con el material Planos Santo pintado. No se sustituye el SKU mediante revisión manual.'
        end
      end
      native_edges=natives.select { |material| material['category']=='edge' }
      return if native_edges.empty?
      observation=OclReader.projected_edges(report,row,geometry)
      native_ids=native_edges.map { |material| material['id'] }
      native_edges.each do |material|
        unless observation['sides'].any? { |side| side['materialIds'].include?(material['id']) }
          raise ExportError,'Un canto nativo no tiene una cara perimetral verificable en estos ejes; revisá la orientación y la pintura.'
        end
        binding=row['edgeBindings'].find { |entry| entry['observedId']==material['id'] }
        raise ExportError,'Confirmá el vínculo del canto nativo con su ítem exacto de biblioteca.' unless binding && binding['catalogId']==material['native_binding']['catalogId']
      end
      observation['sides'].each_with_index do |side,index|
        next if (side['materialIds'] & native_ids).empty?
        raise ExportError,'El canto nativo tiene cobertura o pintura ambigua; revisá sus caras antes de exportar.' unless side['status']=='observed_edge' && side['materialIds'].size==1
        material=native_edges.find { |entry| entry['id']==side['materialIds'].first }
        role=[row['principalId'],row['secondaryId']].index(material['native_binding']['catalogId'])
        raise ExportError,'El mapa manual no coincide con el canto nativo pintado o sus roles de lote.' unless role && row['edgeMap'][index]==role+1
      end
    end
    def plan(reset=false)
      current=order.proposal
      raw=@model.get_attribute(DICT,KEY)
      if !reset && raw.is_a?(String) && raw.bytesize<=8*1024*1024
        stored=JSON.parse(raw)
        if stored['fingerprint']==current['fingerprint'] && stored['catalogRevision']==current['catalogRevision']
          current.merge!(stored.slice('rows','profile'))
          current['rows'].each { |row| unless row.key?('edgeResolution');row.merge!('edgeResolution'=>nil,'edgeBindings'=>[],'edgeOverrideReason'=>'','edgesConfirmed'=>false);end }
        end
      end
      {'plan'=>current,'catalog'=>@catalog.read}
    rescue JSON::ParserError
      raise ExportError,'Borrador de pedido dañado. Prepará uno nuevo sin sobrescribir el anterior.'
    end
    def edge_observations(row)
      proposal=order.proposal
      raise ExportError,'Pieza desconocida en este pedido.' unless proposal['geometry'].key?(row['id'])
      report=OclReader.capture(@model)
      OclReader.projected_edges(report,row,proposal['geometry'].fetch(row['id']))
    end
    def save_plan(draft)
      # Drafts may be unfinished. Preserve exact source linkage, never certify them.
      current=order.proposal
      raise ExportError,'El borrador quedó desactualizado porque cambió el modelo o la biblioteca: usá «Preparar de nuevo».' unless draft.is_a?(Hash) && draft['fingerprint']==current['fingerprint'] && draft['catalogRevision']==current['catalogRevision']
      raise ExportError,'El borrador no tiene las mismas piezas que el modelo: usá «Preparar de nuevo».' unless draft['rows'].is_a?(Array) && draft['rows'].map { |r| r['id'] }.sort==current['rows'].map { |r| r['id'] }.sort
      raise ExportError,'El borrador viene de otra versión de Planos Santo: usá «Preparar de nuevo».' unless draft['rows'].all? { |row| row.is_a?(Hash) && row.keys.sort==SupplierOrder::ROW_KEYS.sort }
      value=JSON.generate(draft.slice('schema','fingerprint','catalogRevision','rows','profile'))
      raise ExportError,'Borrador demasiado grande.' if value.bytesize>8*1024*1024
      started=false
      begin
        raise ExportError,'No se pudo iniciar la operación.' unless @model.start_operation('Guardar pedido Planos Santo',true)
        started=true;@model.set_attribute(DICT,KEY,value)
        raise ExportError,'No se pudo guardar el pedido.' unless @model.commit_operation
        started=false;{'saved'=>true,'modelFileSaved'=>false}
      rescue StandardError
        @model.abort_operation if started;raise
      end
    end
    def audit(draft)
      errors=order.validate(draft,collect_errors:true)
      {'blocked'=>errors,'excluded'=>draft['rows'].reject { |row| row['include'] }.map { |row| row.slice('id','detail','excludeReason') },'production_ready'=>false}
    end
    def check(draft)
      service=order
      service.validate(draft)
      {'valid'=>true,'estimate'=>service.estimate(draft)}
    end
    def references
      raise ExportError,'Guardá primero el borrador revisado del pedido.' unless @model.get_attribute(DICT,KEY)
      draft=plan['plan'];service=order;service.validate(draft)
      draft['rows'].select { |row| row['include'] }.to_h do |row|
        board=service.material(row['materialId'],'sheet')
        roles=[row['principalId'],row['secondaryId']].map { |id| id ? service.material(id,'edge')['sku'] : nil }
        edge_text=row['edgeMap'].each_with_index.map { |role,i| "#{%w[Arr Aba Izq Der][i]}:#{role==0 ? 'sin' : roles[role-1]}" }.join(' ')
        [row['id'],"#{board['sku']} / #{board['thicknessMm']} mm · #{edge_text}"]
      end
    end
    def export_order(draft,directory);order.export(draft,directory);end
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
