# frozen_string_literal: true
# Unit tests with native API doubles only; never opens SketchUp.
require 'minitest/autorun'
module Sketchup
  class Group;end unless const_defined?(:Group, false)
  class ComponentInstance;end unless const_defined?(:ComponentInstance, false)
  class Face;end unless const_defined?(:Face, false)
end
require_relative '../model_watch'

class WatchTimers
  attr_reader :started,:stopped
  def initialize;@started={};@stopped=[];@next=0;end
  def start_timer(seconds,repeat,&blk);@next+=1;@started[@next]=[seconds,repeat,blk];@next;end
  def stop_timer(id);@stopped << id;@started.delete(id);end
  def pending;@started.keys;end
  def run;@started.keys.each { |id| entry=@started.delete(id);entry[2].call if entry };end
end
class WatchCollection
  attr_reader :observers,:added,:removed
  def initialize(items=[]);@items=items;@observers=[];@added=0;@removed=0;end
  def add_observer(o);@added+=1;@observers << o;true;end
  def remove_observer(o);@removed+=1;@observers.delete(o);true;end
  def each(&blk);@items.each(&blk);end
end
class WatchColor
  def initialize(*rgba);@rgba=rgba;end
  def to_a;@rgba;end
end
class WatchMaterial
  attr_reader :display_name,:entityID,:color
  def initialize(name,id,color=WatchColor.new(1,2,3,255));@display_name=name;@entityID=id;@color=color;end
end
class WatchLayer
  attr_reader :name
  def initialize(name);@name=name;end
  def visible?;true;end
end
class WatchFace < Sketchup::Face
  attr_accessor :material,:back_material
  def initialize(m,b=nil);@material=m;@back_material=b;end
  def hidden?;false;end
  def area;12.5;end
  def vertices;[1,2,3,4];end
end
class WatchEntities
  def initialize(items);@items=items;end
  def each(&blk);@items.each(&blk);end
end
class WatchDefinition
  attr_reader :name,:entities
  def initialize(name,items);@name=name;@entities=WatchEntities.new(items);end
end
class WatchTransformation
  attr_accessor :values
  def initialize(values);@values=values;end
  def to_a;@values;end
end
class WatchInstance < Sketchup::ComponentInstance
  attr_accessor :name,:material,:transformation,:attrs
  attr_reader :definition,:persistent_id,:layer
  def initialize(id,definition);@persistent_id=id;@definition=definition;@name='Lateral';@layer=WatchLayer.new('Untagged')
    @transformation=WatchTransformation.new(Array.new(16) { |i| (i%5).zero? ? 1.0 : 0.0 });@attrs={};end
  def hidden?;false;end
  def get_attribute(dict,key,default=nil);@attrs.fetch([dict,key],default);end
end
class WatchModel
  attr_reader :selection,:materials,:observers,:added,:removed,:attrs
  attr_accessor :explode
  def initialize(items=[],materials=[]);@items=items;@selection=WatchCollection.new;@materials=WatchCollection.new(materials)
    @observers=[];@added=0;@removed=0;@attrs={};end
  def add_observer(o);@added+=1;@observers << o;true;end
  def remove_observer(o);@removed+=1;@observers.delete(o);true;end
  def entities;raise 'entities touched during callback' if explode;WatchEntities.new(@items);end
  def get_attribute(dict,key,default=nil);@attrs.fetch([dict,key],default);end
end

class ModelWatchTest < Minitest::Test
  def setup
    @timers=WatchTimers.new;@changes=[];@model=WatchModel.new
    @watch=PlanosSanto::ModelWatch.new(@model,on_change: ->(kinds) { @changes << kinds },timers: @timers)
  end
  def fire_all
    @model.observers[0].onTransactionCommit(@model)
    @model.selection.observers[0].onSelectionBulkChange(@model.selection)
    @model.materials.observers[0].onMaterialChange(@model.materials,Object.new)
  end
  def test_attach_is_idempotent_and_detach_removes_everything
    assert_same @watch,@watch.attach
    @watch.attach
    assert @watch.attached?
    assert_equal [1,1,1],[@model.added,@model.selection.added,@model.materials.added]
    @watch.note('model')
    @watch.detach;@watch.detach
    refute @watch.attached?
    assert_equal [1,1,1],[@model.removed,@model.selection.removed,@model.materials.removed]
    assert_empty @timers.pending
    assert_empty @watch.pending_kinds
  end
  def test_callbacks_never_walk_the_model
    @watch.attach;@model.explode=true
    fire_all
    @model.observers[0].onTransactionUndo(@model);@model.observers[0].onTransactionRedo(@model)
    s=@model.selection.observers[0];s.onSelectionCleared(1);s.onSelectionAdded(1,2);s.onSelectionRemoved(1,2)
    m=@model.materials.observers[0];m.onMaterialAdd(1,2);m.onMaterialRemove(1,2);m.onMaterialUndoRedo(1,2)
    assert_equal %w[materials model selection],@watch.pending_kinds
  end
  def test_abort_and_start_are_not_watched
    @watch.attach
    o=@model.observers[0]
    refute o.respond_to?(:onTransactionAbort)
    refute o.respond_to?(:onTransactionStart)
  end
  def test_debounce_coalesces_events_into_one_change
    @watch.attach;fire_all
    assert_equal 1,@timers.pending.length
    assert_equal [1,2],@timers.stopped
    assert_equal [0.3,false],@timers.started.values.first[0,2]
    assert_equal 0.3,PlanosSanto::ModelWatch::DELAY
    @timers.run
    assert_equal [%w[materials model selection]],@changes
    @watch.flush
    assert_equal 1,@changes.length
  end
  def test_suppress_ignores_events_nests_and_restores
    @watch.attach
    @watch.suppress do
      @watch.suppress { @watch.note('model') }
      assert @watch.suppressed?
      @watch.note('selection')
    end
    refute @watch.suppressed?
    assert_empty @watch.pending_kinds
    assert_raises(IOError) { @watch.suppress { raise IOError,'x' } }
    refute @watch.suppressed?
    @watch.note('model')
    assert_equal ['model'],@watch.pending_kinds
  end
  def test_acknowledge_discards_pending_and_stops_timer
    @watch.attach;@watch.note('model')
    @watch.acknowledge
    assert_empty @watch.pending_kinds
    assert_empty @timers.pending
    @watch.flush
    assert_empty @changes
  end
  def test_callback_failure_is_rescued
    watch=PlanosSanto::ModelWatch.new(@model,on_change: ->(_) { raise 'boom' },timers: @timers).attach
    watch.note('model')
    _,err=capture_io { watch.flush }
    assert_includes err,'boom'
    assert_empty watch.pending_kinds
  end
  def test_events_after_detach_are_ignored
    @watch.attach;observer=@model.observers[0];@watch.detach
    observer.onTransactionCommit(@model);@watch.note('model')
    assert_empty @watch.pending_kinds
    assert_empty @timers.pending
    @watch.flush
    assert_empty @changes
  end
  def test_unknown_kind_is_ignored
    @watch.attach;@watch.note('camera')
    assert_empty @watch.pending_kinds
  end
end

class ModelWatchFingerprintTest < Minitest::Test
  def setup
    @oak=WatchMaterial.new('Roble',10);@white=WatchMaterial.new('Blanco',11);@edge=WatchMaterial.new('Canto',12)
    @f1=WatchFace.new(@oak);@f2=WatchFace.new(@oak,@white)
    @definition=WatchDefinition.new('Lateral',[@f1,@f2])
    @a=WatchInstance.new(1,@definition);@b=WatchInstance.new(2,@definition)
    @model=WatchModel.new([@a,@b],[@oak,@white,@edge])
  end
  def fp;PlanosSanto::ModelWatch.fingerprint(@model);end
  def test_deterministic
    assert_match(/\A\h{64}\z/,fp)
    assert_equal fp,fp
  end
  def test_changes_with_front_material_of_one_face_and_undo_restores
    before=fp;@f2.material=@edge
    refute_equal before,fp
    @f2.material=@oak
    assert_equal before,fp
  end
  def test_changes_with_back_material
    before=fp;@f1.back_material=@edge
    refute_equal before,fp
  end
  def test_changes_with_transformation_name_material_and_piece_attribute
    before=fp
    @a.transformation=WatchTransformation.new(@a.transformation.to_a.dup.tap { |v| v[12]=5.0 });t=fp
    refute_equal before,t
    @a.name='Fondo';n=fp
    refute_equal t,n
    @a.material=@white;m=fp
    refute_equal n,m
    @a.attrs[%w[PlanosSantoNombres piece_v1]]='{"name":"x"}'
    refute_equal m,fp
  end
  def test_changes_with_guide_and_material_color
    @f1.back_material=@edge
    before=fp;@model.attrs[%w[PlanosSanto guide_v1]]='{"revision":1}';g=fp
    refute_equal before,g
    @edge.instance_variable_set(:@color,WatchColor.new(9,9,9,255))
    refute_equal g,fp
  end
  def test_installing_an_unused_material_keeps_the_fingerprint
    before=fp
    @model.materials.instance_variable_get(:@items)&.push(WatchMaterial.new('Nuevo sin usar',99))
    assert_equal before,fp
  end
  def test_overflow_marker_instead_of_exploding
    deep=WatchDefinition.new('Hoja',[WatchFace.new(@oak)])
    30.times { |i| deep=WatchDefinition.new("N#{i}",[WatchInstance.new(100+i,deep)]) }
    model=WatchModel.new([WatchInstance.new(999,deep)])
    assert_match(/\A\h{64}\z/,PlanosSanto::ModelWatch.fingerprint(model))
    assert_includes PlanosSanto::ModelWatch.snapshot(model).flatten,'overflow'
  end
end
