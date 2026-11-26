# frozen_string_literal: true
# Herrajes en 3D (0.8.37) con dobles mínimos de la API, propios de esta prueba: grupo por mueble en la raíz,
# etiqueta y atributos, conversión mm → pulgadas, definiciones reutilizadas, reemplazo, quitar, validación antes de
# escribir, aborto que deja el modelo como estaba y el exportador salteando los grupos de herrajes.
# Simulado: NO es SketchUp; las caras solo registran su normal y el empuje.
require 'minitest/autorun'
require 'json'
require 'time'
module Geom
  Point3d = Struct.new(:x, :y, :z) { def to_a; [x, y, z]; end }
  Vector3d = Struct.new(:x, :y, :z) { def to_a; [x, y, z]; end }
  class Transformation
    def initialize(values); @values = values; end
    def to_a; @values.dup; end
  end
end
module Sketchup
  Layer = Struct.new(:name)
  class Entity
    attr_accessor :parent
    def initialize(model); @model = model; @attributes = {}; @valid = true; end
    def get_attribute(dictionary, key, default = nil); @attributes.fetch([dictionary, key], default); end
    def set_attribute(dictionary, key, value); @attributes[[dictionary, key]] = value; end
    def valid?; @valid; end
    def valid=(value); @valid = value; end
    def erase!; @valid = false; parent.items.delete(self); true; end
  end
  class Face
    attr_reader :normal, :pushed
    def initialize(normal); @normal = Geom::Vector3d.new(*normal); end
    def reverse!; @normal = Geom::Vector3d.new(-@normal.x, -@normal.y, -@normal.z); self; end
    def pushpull(distance); @pushed = distance; end
  end
  class Entities
    attr_accessor :items
    def initialize(model); @model = model; @items = []; end
    def select(&block); @items.select(&block); end
    def add(entity); entity.parent = self; @items << entity; entity; end
    def add_group; add(Group.new(@model, ComponentDefinition.new(@model, 'Grupo'))); end
    def add_instance(definition, transformation)
      @model.fail!(:add_instance)
      add(ComponentInstance.new(@model, definition, transformation))
    end
    # Caras: abajo con la normal hacia -z (como SketchUp en el plano del suelo); círculo con la normal pedida.
    def add_face(*points)
      face = points.first.is_a?(Array) ? Face.new(points.first.first) : Face.new([0, 0, -1])
      @items << face
      face
    end
    def add_circle(center, normal, radius, segments)
      @model.circles << [center.to_a, radius, segments]
      [normal.to_a]
    end
  end
  class ComponentDefinition < Entity
    attr_accessor :name
    attr_reader :entities
    def initialize(model, name); super(model); @name = name; @entities = Entities.new(model); end
  end
  class ComponentInstance < Entity
    attr_accessor :name, :layer
    attr_reader :definition, :transformation
    def initialize(model, definition, transformation = nil); super(model); @definition = definition; @transformation = transformation; @name = ''; end
  end
  class Group < ComponentInstance
    def entities; definition.entities; end
  end
  class Layers
    def initialize; @items = {}; end
    def [](name); @items[name]; end
    def add(name); @items[name] ||= Layer.new(name); end
    def length; @items.length; end
  end
  class Definitions
    attr_accessor :items
    def initialize(model); @model = model; @items = []; end
    def find(&block); @items.find(&block); end
    def add(name); ComponentDefinition.new(@model, name).tap { |definition| @items << definition }; end
  end
  class Model
    attr_reader :entities, :layers, :definitions, :operations, :circles
    attr_accessor :failing
    def initialize
      @entities = Entities.new(self); @layers = Layers.new; @definitions = Definitions.new(self); @operations = []; @circles = []
    end
    def fail!(step); raise 'falla sintética' if failing == step; end
    def start_operation(name, _disable_ui)
      @operations << [:start, name]
      @snapshot = [@entities.items.dup, @definitions.items.dup, @entities.items.map(&:valid?)]
      true
    end
    def commit_operation; @operations << [:commit]; true; end
    def abort_operation
      @operations << [:abort]
      @entities.items, @definitions.items, valid = @snapshot
      @entities.items.zip(valid).each { |entity, flag| entity.valid = flag }
    end
  end
end
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../hardware_model'

class HardwareModelTest < Minitest::Test
  H = PlanosSanto::HardwareModel
  IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0].freeze
  def setup
    @model = Sketchup::Model.new
    leaf = ->(id) { { 'id' => id, 'name' => 'Pieza', 'mesh' => {}, 'children' => [] } }
    @document = { 'furniture' => [
      { 'id' => '101', 'name' => 'M01 Bajo mesada', 'children' => [leaf.call('101/1'), leaf.call('101/3')] },
      { 'id' => '202', 'name' => 'Placard', 'children' => [leaf.call('202/2')] }] }
  end
  def hinge_at(piece, side, z); { 'pieceId' => piece, 'kind' => 'hinge', 'side' => side, 'lengthMm' => nil, 'matrix' => IDENTITY + [3018.0, 0.0, z, 1] }; end
  def runner_at(piece, side, x); { 'pieceId' => piece, 'kind' => 'runner', 'side' => side, 'lengthMm' => 500, 'matrix' => [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, x, 0, 30, 1] }; end
  def request
    [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0), hinge_at('202/2', 'left', 2000.0)] },
     { 'id' => '101', 'placements' => [runner_at('101/3', 'left', 24.25), runner_at('101/3', 'right', 575.75)] }]
  end
  def hardware_groups; @model.entities.items.select { |entity| H.group?(entity) }; end

  def test_places_one_tagged_group_per_furniture_at_the_root_in_one_operation
    result = H.place(@model, @document, request)
    assert_equal 4, result['placed']
    assert_equal [[:start, 'Colocar herrajes'], [:commit]], @model.operations
    groups = hardware_groups
    assert_equal ['Herrajes · Placard', 'Herrajes · M01 Bajo mesada'], groups.map(&:name)
    assert groups.all? { |group| group.layer.name == 'Planos Santo · Herrajes' }
    assert_equal %w[202 101], groups.map { |group| group.get_attribute(H::DICTIONARY, 'furnitureId') }
    items = groups[0].entities.items
    assert_equal [['202/2', 'hinge', 'left']] * 2, items.map { |item| %w[pieceId kind side].map { |key| item.get_attribute(H::DICTIONARY, key) } }
    assert items.all? { |item| item.layer.name == 'Planos Santo · Herrajes' }
    # Traslación de mm a pulgadas; la rotación pasa igual.
    (IDENTITY + [3018 / 25.4, 0.0, 100 / 25.4, 1.0]).zip(items[0].transformation.to_a).each { |want, got| assert_in_delta want, got, 1e-9 }
    runners = groups[1].entities.items
    assert_equal [500, 500], runners.map { |item| item.get_attribute(H::DICTIONARY, 'lengthMm') }
    assert_equal [{ 'furnitureId' => '202', 'furnitureName' => 'Placard', 'hinges' => 2, 'runners' => 0, 'sides' => { '202/2' => 'left' } },
                  { 'furnitureId' => '101', 'furnitureName' => 'M01 Bajo mesada', 'hinges' => 0, 'runners' => 2, 'sides' => {} }], result['status']
  end

  def test_one_definition_per_shape_and_length_with_its_own_solids
    H.place(@model, @document, request)
    assert_equal ['Planos Santo · Bisagra codo 0', 'Planos Santo · Corredera 500 mm'], @model.definitions.items.map(&:name)
    hinge, runner = @model.definitions.items
    # Bisagra: cazoleta (cilindro Ø35 hacia adentro de la puerta), brazo y base, cada uno en su grupo.
    assert_equal 3, hinge.entities.items.length
    cup = hinge.entities.items[0].entities.items[0]
    assert_equal [0, -1, 0], cup.normal.to_a
    assert_in_delta 12 / 25.4, cup.pushed, 1e-9
    assert_equal [[[22 / 25.4, 0.0, 0.0], 17.5 / 25.4, 24]], @model.circles
    arm = hinge.entities.items[1].entities.items[0]
    assert_equal [0, 0, 1], arm.normal.to_a
    assert_in_delta 16 / 25.4, arm.pushed, 1e-9
    assert_in_delta 35 / 25.4, runner.entities.items[0].entities.items[0].pushed, 1e-9
    # Colocar otra vez reutiliza las definiciones.
    H.place(@model, @document, request)
    assert_equal 2, @model.definitions.items.length
  end

  def test_placing_again_replaces_that_furniture_only
    H.place(@model, @document, request)
    first = hardware_groups
    H.place(@model, @document, [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'right', 500.0)] }])
    groups = hardware_groups
    refute first[0].valid?
    assert_same first[1], groups[0]
    assert_equal [{ '202/2' => 'right' }], H.status(@model).select { |row| row['furnitureId'] == '202' }.map { |row| row['sides'] }
    # Sin herrajes para un mueble: se quita su grupo y no se crea otro vacío.
    H.place(@model, @document, [{ 'id' => '202', 'placements' => [] }])
    assert_equal ['101'], hardware_groups.map { |group| group.get_attribute(H::DICTIONARY, 'furnitureId') }
  end

  def test_validates_everything_before_opening_the_operation
    bad = {
      'mueble que no está' => [{ 'id' => '999', 'placements' => [] }],
      'pieza de otro mueble' => [{ 'id' => '101', 'placements' => [hinge_at('202/2', 'left', 100.0)] }],
      'tipo desconocido' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0).merge('kind' => 'tirador')] }],
      'corredera sin largo' => [{ 'id' => '101', 'placements' => [runner_at('101/3', 'left', 0).merge('lengthMm' => nil)] }],
      'bisagra con largo' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0).merge('lengthMm' => 500)] }],
      'ejes no unitarios' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0).merge('matrix' => [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])] }],
      'ejes espejados' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0).merge('matrix' => [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])] }],
      'número no finito' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', Float::NAN)] }],
      'mueble repetido' => [{ 'id' => '202', 'placements' => [] }, { 'id' => '202', 'placements' => [] }],
      'demasiados' => [{ 'id' => '202', 'placements' => [hinge_at('202/2', 'left', 100.0)] * 401 }],
      'vacío' => []
    }
    bad.each do |label, value|
      assert_raises(PlanosSanto::ExportError, label) { H.place(@model, @document, value) }
    end
    assert_empty @model.operations
    assert_empty @model.entities.items
    assert_raises(PlanosSanto::ExportError) { H.place(@model, nil, request) }
  end

  def test_a_failure_while_drawing_aborts_and_keeps_the_previous_hardware
    H.place(@model, @document, request)
    before = hardware_groups
    @model.failing = :add_instance
    error = assert_raises(PlanosSanto::ExportError) { H.place(@model, @document, request) }
    assert_includes error.message, 'El modelo quedó como estaba.'
    assert_equal [:abort], @model.operations.last
    assert_equal before, hardware_groups
    assert before.all?(&:valid?)
  end

  def test_remove_one_furniture_or_all_and_nothing_to_remove_opens_no_operation
    H.place(@model, @document, request)
    result = H.remove(@model, ['202'])
    assert_equal 2, result['removed']
    assert_equal ['101'], result['status'].map { |row| row['furnitureId'] }
    assert_equal [:start, 'Quitar herrajes'], @model.operations[-2]
    assert_equal 2, H.remove(@model)['removed']
    count = @model.operations.length
    assert_equal({ 'removed' => 0, 'status' => [] }, H.remove(@model))
    assert_equal count, @model.operations.length
    assert_raises(PlanosSanto::ExportError) { H.remove(@model, '202') }
  end

  def test_the_exporter_skips_hardware_groups_but_keeps_furniture
    H.place(@model, @document, request)
    furniture = Sketchup::Group.new(@model, Sketchup::ComponentDefinition.new(@model, 'Bajo'))
    door = Sketchup::ComponentInstance.new(@model, Sketchup::ComponentDefinition.new(@model, 'Puerta'))
    exporter = PlanosSanto::Exporter.allocate
    assert_equal [furniture, door], exporter.containers(hardware_groups + [furniture, door])
    # Un componente con el diccionario (no un grupo de herrajes) sigue siendo un contenedor.
    door.set_attribute(H::DICTIONARY, 'role', 'group')
    assert_equal [door], exporter.containers([door])
  end
end
