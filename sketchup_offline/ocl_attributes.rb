# frozen_string_literal: true

module PlanosSanto
  # Writes OpenCutList-compatible data attributes on materials that Planos Santo
  # creates or installs (owner decision 2, Hito 1). Data format only: no OCL
  # code is used. Sheet goods and edge bands use different keys in OCL:
  #   sheet (type 2): std_thicknesses, std_sizes ("L x W"), grained
  #   edge  (type 4): thickness (band thickness), std_widths (band width)
  # Existing attributes are never overwritten. A material already typed with a
  # different OCL type is left untouched and reported as a conflict.
  module OclAttributes
    DICT = 'ladb_opencutlist'
    TYPES = { 'sheet' => 2, 'edge' => 4 }.freeze
    UNKNOWN = 0

    def self.length(value)
      return nil unless value.is_a?(Numeric) && value.finite? && value.positive?
      text = format('%.3f', value).sub(/0+\z/, '').sub(/\.\z/, '')
      "#{text}mm"
    end

    def self.values(item)
      case item['kind']
      when 'sheet'
        sizes = item['lengthMm'] && item['widthMm'] && [length(item['lengthMm']), length(item['widthMm'])].compact
        { 'std_thicknesses' => length(item['thicknessMm']),
          'std_sizes' => sizes && sizes.length == 2 ? sizes.join(' x ') : nil,
          'grained' => [true, false].include?(item['grain']) ? item['grain'] : nil }
      when 'edge'
        { 'thickness' => length(item['thicknessMm']), 'std_widths' => length(item['widthMm']) }
      else
        {}
      end.compact
    end

    # Caller must hold an open model operation (creation/installation).
    def self.write_missing(material, item)
      type = TYPES[item.is_a?(Hash) ? item['kind'] : nil]
      return { 'status' => 'skipped', 'written' => [] } unless type && material.respond_to?(:get_attribute) && material.respond_to?(:set_attribute)
      current = material.get_attribute(DICT, 'type', nil)
      unless current.nil? || current == UNKNOWN || current == type
        return { 'status' => 'conflict', 'written' => [], 'existingType' => current }
      end
      written = []
      if current != type
        material.set_attribute(DICT, 'type', type)
        written << 'type'
      end
      values(item).each do |key, value|
        next unless material.get_attribute(DICT, key, nil).nil?
        material.set_attribute(DICT, key, value)
        written << key
      end
      { 'status' => written.empty? ? 'unchanged' : 'written', 'written' => written }
    end
  end
end
