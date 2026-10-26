# frozen_string_literal: true
require 'json'
require 'digest'
require 'securerandom'

module PlanosSanto
  # Own metadata only. Reads never create IDs, dictionaries, OCL attributes or
  # materials. A binding identifies a commercial item, never a manufacturing side.
  module MaterialResolver
    DICT = 'PlanosSantoMaterial'
    KEY = 'binding_v1'
    SCHEMA = 1
    MAX_BYTES = 4096
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
    FINGERPRINT_FIELDS = %w[kind sku supplier thicknessMm widthMm lengthMm grain compatibleIds].freeze
    BINDING_KEYS = %w[schema uuid catalogId kind catalogFingerprint].freeze

    def self.item_fingerprint(item)
      raise ArgumentError, 'Ítem comercial inválido.' unless item.is_a?(Hash)
      value = FINGERPRINT_FIELDS.to_h { |key| [key, item[key]] }
      value['compatibleIds'] = value['compatibleIds'].sort if value['compatibleIds'].is_a?(Array)
      photo=item['observed'].is_a?(Hash) && item['observed']['photo']
      value['photoSource']={'schema'=>photo['schema'],'sourceHash'=>photo['sourceHash'],'textureScale'=>photo['textureScale']} if photo.is_a?(Hash)
      Digest::SHA256.hexdigest(JSON.generate(value.sort.to_h))
    end

    # True when a binding still describes the ficha. 0.8.20 (library v4): a sheet no longer has one
    # thickness and an edge no longer has one width; a binding written while the ficha had one keeps
    # matching as long as that value is still in its list, so the migration never stales a link.
    def self.fingerprint_current?(item, fingerprint)
      return true if item_fingerprint(item) == fingerprint
      key, list = { 'sheet' => %w[thicknessMm thicknessesMm], 'edge' => %w[widthMm widthsMm] }.fetch(item['kind'], [])
      return false unless key && item[key].nil? && item[list].is_a?(Array)
      item[list].grep(Numeric).flat_map { |value| [value, value.to_f, value.to_f == value.to_i ? value.to_i : nil].compact.uniq }
                .any? { |value| item_fingerprint(item.merge(key => value)) == fingerprint }
    end

    def self.validate_binding(binding)
      valid = binding.is_a?(Hash) && binding.keys.sort == BINDING_KEYS.sort && binding['schema'].is_a?(Integer) && binding['schema'] == SCHEMA &&
        %w[uuid catalogId].all? { |key| binding[key].is_a?(String) && UUID.match?(binding[key]) } &&
        %w[sheet edge hardware].include?(binding['kind']) && binding['catalogFingerprint'].is_a?(String) &&
        /\A[0-9a-f]{64}\z/.match?(binding['catalogFingerprint'])
      raise ArgumentError, 'Vínculo Planos Santo inválido; requiere revisión.' unless valid
      binding
    end

    def self.binding_for(item, uuid = SecureRandom.uuid)
      validate_binding('schema' => SCHEMA, 'uuid' => uuid, 'catalogId' => item['id'],
                       'kind' => item['kind'], 'catalogFingerprint' => item_fingerprint(item))
    end

    def self.read_binding(material)
      return nil unless material.respond_to?(:get_attribute)
      raw = material.get_attribute(DICT, KEY, nil)
      return nil if raw.nil?
      raise ArgumentError, 'Vínculo Planos Santo inválido; requiere revisión.' unless raw.is_a?(String) && raw.bytesize <= MAX_BYTES
      validate_binding(JSON.parse(raw))
    rescue JSON::ParserError, JSON::NestingError
      raise ArgumentError, 'Vínculo Planos Santo ilegible; requiere revisión.'
    end

    def self.observe_binding(material)
      binding = read_binding(material)
      binding ? { 'status' => 'valid', 'binding' => binding } : { 'status' => 'absent' }
    rescue ArgumentError => error
      { 'status' => 'invalid', 'error' => error.message }
    end

    def self.resolve(source, ocl_compatible:)
      attrs = source.fetch('opencutlist_observed', {})
      raw_type = attrs['type']
      types = { 1 => 'solid_wood', 2 => 'sheet', 3 => 'dimensional', 4 => 'edge', 5 => 'hardware', 6 => 'veneer' }
      ocl_kind = raw_type.is_a?(Integer) ? types[raw_type] : nil
      own = source.fetch('planos_santo_observed', { 'status' => 'absent' })
      own = { 'status' => 'invalid' } unless own.is_a?(Hash)
      warnings = []
      binding = nil
      begin
        if own['status'] == 'valid'
          binding = validate_binding(own['binding'])
        elsif own['status'] != 'absent'
          warnings << 'Vínculo propio inválido: no se interpreta el tipo heredado.'
        end
      rescue ArgumentError
        warnings << 'Vínculo propio inválido: requiere revisión.'
      end
      conflict = binding && ocl_kind && ocl_kind != binding['kind']
      warnings << 'Conflicto entre tipo Planos Santo y tipo OpenCutList observado.' if conflict
      if warnings.empty? && binding
        { 'category' => binding['kind'], 'confidence' => 'native_binding', 'native_binding' => binding,
          'native_status' => 'valid', 'warnings' => [], 'type_read' => true }
      elsif warnings.empty? && ocl_compatible && ocl_kind
        { 'category' => ocl_kind, 'confidence' => 'version_matched_attribute', 'native_status' => 'absent', 'warnings' => [], 'type_read' => true }
      else
        { 'category' => 'unknown', 'confidence' => 'unresolved', 'native_status' => conflict ? 'conflict' : (warnings.empty? ? 'absent' : 'invalid'),
          'native_binding' => binding, 'warnings' => warnings + ['Tipo no resuelto: no se deduce del nombre ni del color.'], 'type_read' => false }
      end
    end
  end
end
