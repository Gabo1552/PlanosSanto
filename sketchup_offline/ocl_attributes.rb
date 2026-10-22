# frozen_string_literal: true
require 'json'
require_relative 'material_resolver'

module PlanosSanto
  # Writes OpenCutList-compatible data attributes on materials that Planos Santo
  # creates or installs (owner decision 2, Hito 1). Data format only: no OCL
  # code is used. Sheet goods and edge bands use different keys in OCL:
  #   sheet (type 2): std_thicknesses, std_sizes ("L x W"), grained
  #   edge  (type 4): thickness (band thickness), std_widths (band width)
  # Existing attributes are never overwritten. A material already typed with a
  # different OCL type is left untouched and reported as a conflict.
  # Every value Planos Santo writes is recorded (oclWritten, in its own
  # dictionary) so a later #sync can tell its own stale values from the user's.
  module OclAttributes
    DICT = 'ladb_opencutlist'
    WRITTEN_KEY = 'ocl_written_v1'
    # The only keys Planos Santo ever writes; a record can never name others.
    KNOWN_KEYS = %w[type std_thicknesses std_sizes grained thickness std_widths].freeze
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
      record_written(material, written(material).merge(written.to_h { |key| [key, material.get_attribute(DICT, key, nil)] })) unless written.empty?
      { 'status' => written.empty? ? 'unchanged' : 'written', 'written' => written }
    end

    # oclWritten: {key => value written by Planos Santo}. A damaged record is
    # read as empty, so every current value is then treated as the user's.
    def self.written(material)
      raw = material.get_attribute(MaterialResolver::DICT, WRITTEN_KEY, nil)
      return {} unless raw.is_a?(String) && raw.bytesize <= 4096
      data = JSON.parse(raw)
      return {} unless data.is_a?(Hash) && data.all? { |key, value| key.is_a?(String) && [String, Integer, TrueClass, FalseClass].any? { |type| value.is_a?(type) } }
      data.select { |key, _value| KNOWN_KEYS.include?(key) }
    rescue JSON::ParserError
      {}
    end

    def self.record_written(material, record)
      material.set_attribute(MaterialResolver::DICT, WRITTEN_KEY, JSON.generate(record.sort.to_h))
    end

    # Three-way plan: write what is missing, update what Planos Santo wrote and
    # nobody changed, remove its own value when the catalog no longer has one,
    # and keep (report) every value the user set.
    def self.plan(material, item)
      type = TYPES[item.is_a?(Hash) ? item['kind'] : nil]
      return { 'status' => 'skipped', 'changes' => [], 'kept' => [] } unless type && material.respond_to?(:get_attribute) && material.respond_to?(:set_attribute)
      record = written(material)
      current_type = material.get_attribute(DICT, 'type', nil)
      unless current_type.nil? || current_type == UNKNOWN || current_type == type || record['type'] == current_type
        return { 'status' => 'conflict', 'changes' => [], 'kept' => [{ 'key' => 'type', 'current' => current_type, 'proposed' => type }] }
      end
      desired = { 'type' => type }.merge(values(item))
      changes = []; kept = []
      (desired.keys | record.keys).each do |key|
        want = desired[key]; have = material.get_attribute(DICT, key, nil)
        mine = record.key?(key) && record[key] == have
        if want.nil?
          changes << { 'key' => key, 'from' => have, 'to' => nil, 'action' => 'remove' } if mine && !have.nil?
        elsif have.nil? || (key == 'type' && have == UNKNOWN)
          changes << { 'key' => key, 'from' => have, 'to' => want, 'action' => 'write' }
        elsif have != want
          if mine
            changes << { 'key' => key, 'from' => have, 'to' => want, 'action' => 'update' }
          else
            kept << { 'key' => key, 'current' => have, 'proposed' => want }
          end
        end
      end
      status = if changes.any? { |change| change['action'] != 'write' } then 'updated'
               elsif !changes.empty? then 'written'
               elsif !kept.empty? then 'kept'
               else 'unchanged'
               end
      { 'status' => status, 'changes' => changes, 'kept' => kept }
    end

    # Caller must hold an open model operation.
    def self.apply(material, plan)
      return false if %w[conflict skipped].include?(plan['status'])
      record = written(material)
      plan['changes'].each do |change|
        if change['action'] == 'remove'
          material.delete_attribute(DICT, change['key']) if material.respond_to?(:delete_attribute)
          record.delete(change['key'])
        else
          material.set_attribute(DICT, change['key'], change['to'])
          record[change['key']] = change['to']
        end
      end
      plan['kept'].each { |row| record.delete(row['key']) }
      record.select! { |key, value| material.get_attribute(DICT, key, nil) == value }
      record_written(material, record) unless record == written(material)
      !plan['changes'].empty?
    end
  end
end
