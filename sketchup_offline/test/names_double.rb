# frozen_string_literal: true
require_relative 'fake_model'

module NamesEntityDouble
  attr_accessor :invalid_for_names, :locked_for_names, :fail_name_write, :fail_meta_write
  def valid?; !invalid_for_names; end
  def locked?; locked_for_names == true; end
  def names_attributes; @names_attributes ||= {}; end
  def get_attribute(dictionary, key); names_attributes[[dictionary, key]]; end
  def set_attribute(dictionary, key, value)
    names_attributes[[dictionary, key]] = value
    raise IOError, 'synthetic entity metadata write failure' if fail_meta_write
  end
  def name=(value)
    raise IOError, 'synthetic name write failure' if fail_name_write
    super
  end
end
Sketchup::ComponentInstance.prepend(NamesEntityDouble)

class NamingModelDouble < NativeModelDouble
  attr_reader :undo_states
  def initialize(model); super; @undo_states=[]; end
  def all_instances
    seen={}; result=[]
    walk=->(entities) do
      entities.each do |e|
        next unless e.is_a?(Sketchup::ComponentInstance)
        next if seen[e.object_id]
        seen[e.object_id]=true; result << e; walk.call(e.definition.entities)
      end
    end
    walk.call(entities); result
  end
  def state
    { attributes:Marshal.load(Marshal.dump(attributes)),entities:all_instances.map { |e| [e,e.name,Marshal.load(Marshal.dump(e.names_attributes))] } }
  end
  def restore(snapshot)
    @attributes=Marshal.load(Marshal.dump(snapshot[:attributes]))
    snapshot[:entities].each { |e,name,attrs| e.instance_variable_set(:@name,name);e.instance_variable_set(:@names_attributes,Marshal.load(Marshal.dump(attrs))) }
  end
  def start_operation(name, disable_ui)
    @names_backup=state; super; true
  end
  def commit_operation; @undo_states << @names_backup; super; true; end
  def abort_operation; restore(@names_backup); @operations << [:abort]; true; end
  def undo; restore(@undo_states.pop); end
end

module NamesFixture
  def self.model
    board=Fixture.board_definition
    left=Sketchup::ComponentInstance.new(11,'Lateral - Blanco',board)
    base=Sketchup::Group.new(12,'Base',board)
    nested=Sketchup::Group.new(13,'Interior estructural',Sketchup::Definition.new('Interior','nest-safe',[base]))
    root=Sketchup::Group.new(1,'Bajo Mesada',Sketchup::Definition.new('Mueble A','root-safe',[left,nested]))
    other=Sketchup::Group.new(2,'Otro mueble',Sketchup::Definition.new('Mueble B','other-safe',[Sketchup::ComponentInstance.new(21,'Base ajena',board)]))
    NamingModelDouble.new(Sketchup::Model.new([root,other],'names-synthetic','Modelo sintético de nombres',''))
  end
end
