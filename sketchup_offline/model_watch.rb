# frozen_string_literal: true
require 'digest'
require 'set'
require 'securerandom'

module PlanosSanto
  # Watches native model, selection and material changes. Callbacks only record
  # the kind of change (O(1)); the debounced flush reports the kinds to the
  # owner, which decides whether to recompute. Never walks the model itself.
  class ModelWatch
    DELAY = 0.3
    KINDS = %w[materials model selection].freeze
    MAX_DEPTH = 25
    MAX_NODES = 50_000
    NAMES_DICTIONARY = 'PlanosSantoNombres'
    PIECE_KEY = 'piece_v1'
    GUIDE_DICTIONARY = 'PlanosSanto'
    GUIDE_KEY = 'guide_v1'

    class ModelObserver
      def initialize(watch);@watch = watch;end
      def onTransactionCommit(*_args);@watch.note('model');end
      def onTransactionUndo(*_args);@watch.note('model');end
      def onTransactionRedo(*_args);@watch.note('model');end
    end

    class SelectionObserver
      def initialize(watch);@watch = watch;end
      def onSelectionBulkChange(*_args);@watch.note('selection');end
      def onSelectionCleared(*_args);@watch.note('selection');end
      def onSelectionAdded(*_args);@watch.note('selection');end
      def onSelectionRemoved(*_args);@watch.note('selection');end
    end

    class MaterialsObserver
      def initialize(watch);@watch = watch;end
      def onMaterialAdd(*_args);@watch.note('materials');end
      def onMaterialChange(*_args);@watch.note('materials');end
      def onMaterialRemove(*_args);@watch.note('materials');end
      def onMaterialUndoRedo(*_args);@watch.note('materials');end
    end

    attr_reader :model

    def initialize(model, on_change:, timers: UI, delay: DELAY)
      @model = model
      @on_change = on_change
      @timers = timers
      @delay = delay
      @pending = Set.new
      @depth = 0
      @timer = nil
      @observers = nil
    end

    def attach
      return self if @observers
      @observers = []
      [[@model, ModelObserver], [selection, SelectionObserver], [materials, MaterialsObserver]].each do |target, klass|
        next unless target.respond_to?(:add_observer)
        observer = klass.new(self)
        target.add_observer(observer)
        @observers << [target, observer]
      end
      self
    end

    def detach
      return self unless @observers
      @observers.each do |target, observer|
        target.remove_observer(observer) if target.respond_to?(:remove_observer)
      rescue StandardError => e
        warn("Planos Santo: no se pudo quitar un observer (#{e.class})")
      end
      self
    ensure
      if @observers
        @observers = nil
        acknowledge
      end
    end

    def attached?
      !@observers.nil?
    end

    def suppress
      @depth += 1
      yield
    ensure
      @depth -= 1
    end

    def suppressed?
      @depth.positive?
    end

    def acknowledge
      @pending.clear
      cancel_timer
      nil
    end

    def note(kind)
      return unless attached? && !suppressed? && KINDS.include?(kind)
      @pending << kind
      cancel_timer
      id = nil
      id = @timers.start_timer(@delay, false) { fire(id) }
      @timer = id
      nil
    rescue StandardError => e
      # Never raise into SketchUp from an observer callback; one note may be lost.
      warn("Planos Santo: no se pudo programar la revisión del modelo (#{e.class})")
      nil
    end

    def pending_kinds
      @pending.to_a.sort
    end

    def flush
      return unless attached? && !@pending.empty?
      cancel_timer
      kinds = pending_kinds
      @pending.clear
      @on_change.call(kinds)
      nil
    rescue StandardError => e
      warn("Planos Santo: no se pudo procesar el cambio del modelo (#{e.class}: #{e.message})")
      nil
    end

    def self.fingerprint(model)
      Digest::SHA256.hexdigest(Marshal.dump(snapshot(model)))
    end

    # Plain nested arrays of strings, numbers, booleans and nil (deterministic Marshal).
    def self.snapshot(model)
      state = { defs: {}, list: [], nodes: 0, overflow: false }
      top = model.respond_to?(:entities) ? walk(model.entities, 0, state) : []
      guide = model.respond_to?(:get_attribute) ? model.get_attribute(GUIDE_DICTIONARY, GUIDE_KEY) : nil
      # Only materials in use count (via faces/instances): installing an unused
      # material in the model never makes the analysis stale.
      result = [top, state[:list], guide.is_a?(String) ? guide : guide.inspect]
      # A partial walk could hide changes: an overflowed fingerprint never matches.
      result << ['overflow', SecureRandom.hex(8)] if state[:overflow]
      result
    end

    def self.walk(entities, depth, state)
      out = []
      return out unless entities.respond_to?(:each)
      entities.each do |e|
        if (state[:nodes] += 1) > MAX_NODES
          state[:overflow] = true
          break
        end
        if container?(e)
          out << instance_key(e, depth, state)
        elsif face?(e)
          out << face_key(e)
        end
      end
      out
    end

    def self.instance_key(e, depth, state)
      tr = e.respond_to?(:transformation) && e.transformation.respond_to?(:to_a) ? e.transformation.to_a.map { |v| round(v) } : nil
      layer = e.respond_to?(:layer) ? e.layer : nil
      [
        e.respond_to?(:persistent_id) ? e.persistent_id : nil,
        e.respond_to?(:name) ? e.name.to_s : nil,
        e.respond_to?(:hidden?) ? e.hidden? : nil,
        layer.respond_to?(:name) ? layer.name.to_s : nil,
        layer.respond_to?(:visible?) ? layer.visible? : nil,
        e.respond_to?(:material) ? material_key(e.material) : nil,
        tr,
        e.respond_to?(:get_attribute) ? e.get_attribute(NAMES_DICTIONARY, PIECE_KEY).then { |v| v.nil? || v.is_a?(String) ? v : v.inspect } : nil,
        definition_key(e, depth, state)
      ]
    end

    def self.definition_key(e, depth, state)
      definition = e.respond_to?(:definition) ? e.definition : nil
      entities = group?(e) && e.respond_to?(:entities) ? e.entities : definition.respond_to?(:entities) ? definition.entities : nil
      return nil unless entities
      # Ruby proxies of Entities may differ per call; the definition's entityID
      # is stable within the session, so repeated components are walked once.
      id = definition.respond_to?(:entityID) ? [:definition, definition.entityID] : entities.object_id
      return state[:defs][id] if state[:defs].key?(id)
      index = state[:defs][id] = state[:list].length
      entry = [definition.respond_to?(:name) ? definition.name.to_s : nil, nil]
      state[:list] << entry
      if depth + 1 > MAX_DEPTH
        state[:overflow] = true
        entry[1] = 'overflow'
      else
        entry[1] = walk(entities, depth + 1, state)
      end
      index
    end

    def self.face_key(f)
      [
        'face',
        material_key(f.material),
        f.respond_to?(:back_material) ? material_key(f.back_material) : nil,
        f.respond_to?(:hidden?) ? f.hidden? : nil,
        f.respond_to?(:area) ? round(f.area) : nil,
        f.respond_to?(:vertices) ? f.vertices.length : nil
      ]
    end

    def self.material_key(m)
      return nil if m.nil?
      name = m.respond_to?(:display_name) ? m.display_name.to_s : m.respond_to?(:name) ? m.name.to_s : m.to_s
      color = m.respond_to?(:color) && m.color.respond_to?(:to_a) ? m.color.to_a.map { |v| round(v) } : nil
      [name, m.respond_to?(:entityID) ? m.entityID : nil, color]
    end

    def self.round(value)
      value.is_a?(Numeric) ? Float(value).round(6) + 0.0 : value.to_s
    end

    def self.container?(e)
      group?(e) || (defined?(Sketchup::ComponentInstance) && e.is_a?(Sketchup::ComponentInstance))
    end

    def self.group?(e)
      defined?(Sketchup::Group) && e.is_a?(Sketchup::Group)
    end

    def self.face?(e)
      (defined?(Sketchup::Face) && e.is_a?(Sketchup::Face)) || (e.respond_to?(:material) && e.respond_to?(:back_material))
    end

    private_class_method :walk, :instance_key, :definition_key, :face_key, :material_key, :round, :container?, :group?, :face?

    private

    def selection
      @model.respond_to?(:selection) ? @model.selection : nil
    end

    def materials
      @model.respond_to?(:materials) ? @model.materials : nil
    end

    def cancel_timer
      return unless @timer
      id = @timer
      @timer = nil
      @timers.stop_timer(id)
    end

    def fire(id)
      @timers.stop_timer(id) if id
      return unless id && id == @timer
      @timer = nil
      flush
    end
  end
end
