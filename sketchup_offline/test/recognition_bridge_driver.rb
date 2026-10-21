# frozen_string_literal: true
# Linux browser/native bridge doubles only. Never opens or modifies a real SKP.
require_relative 'names_double'
module NamesFixture
  class << self
    alias_method :recognition_original_model, :model
    def model
      model=recognition_original_model
      model.all_instances.find { |entity| entity.persistent_id==11 }.name=''
      model.all_instances.find { |entity| entity.persistent_id==12 }.name=''
      model
    end
  end
end
module Fixture
  class << self
    alias_method :recognition_original_shared_model, :model
    def model
      model=recognition_original_shared_model
      model.entities.first.definition.entities.first.name=''
      model
    end
  end
end
require_relative 'names_bridge_driver'
