# frozen_string_literal: true
require_relative 'smart_paint_tool'
require_relative 'material_library'

module PlanosSanto
  # Read-only sampler: uses the same complete-instance picker and transformed
  # face overlay as SmartPaintTool, but has no paint service or mutation path.
  class MaterialSampleTool < SmartPaintTool
    class ReadOnlyContext
      def cancel; end
    end

    def initialize(model, library:, on_event:, guard:, side: 'front')
      raise ExportError, 'Elegí frente o dorso para tomar el material de una cara física.' unless %w[front back].include?(side)
      @library = library
      @sample = nil
      @sample_sequence = 0
      super(model, service: ReadOnlyContext.new, options: { 'mode' => 'sample', 'side' => side }, on_event: on_event, guard: guard)
    end

    def activate
      @active = true
      emit('Cuentagotas: acercá el cursor y hacé clic para elegir un material. No modifica el modelo.')
    end

    def status
      super.merge('mode' => 'sample', 'sample' => @active && @target && @sample ? copy(@sample) : nil, 'sampleSequence' => @sample_sequence)
    end

    def material_name(material)
      material.respond_to?(:display_name) ? material.display_name.to_s : material.name.to_s
    end

    def sample_for(target)
      face = target.fetch('_face')
      material = @options['side'] == 'back' ? face.back_material : face.material
      result = { 'pieceId' => target['pieceId'], 'faceId' => target['faceIds'].first,
                 'side' => @options['side'], 'selectable' => false, 'issues' => [] }
      unless material
        ancestor = target['_instances'].reverse.find { |instance| instance.respond_to?(:material) && instance.material }
        if ancestor
          inherited = ancestor.material
          return result.merge('status' => 'inherited', 'materialId' => inherited.entityID.to_s,
                              'name' => material_name(inherited),
                              'issues' => ['Material heredado del grupo o componente. Vinculalo y revisá su aplicación sobre la cara antes de pintar.'])
        end
        return result.merge('status' => 'unpainted', 'name' => 'Sin material en esta cara',
                            'issues' => ['La cara no tiene un material físico asignado.'])
      end
      result.merge!('materialId' => material.entityID.to_s, 'name' => material_name(material))
      observation = MaterialResolver.observe_binding(material)
      if observation['status'] == 'invalid'
        return result.merge('status' => 'invalid_binding', 'issues' => [observation['error']])
      end
      unless observation['binding']
        return result.merge('status' => 'unbound',
                            'issues' => ['Material nativo sin vínculo propio aprobado. Asociá su visual en la biblioteca; no se deduce del nombre, color o tipo OpenCutList.'])
      end
      # MaterialLibrary performs the existing approval/fingerprint and duplicate
      # UUID checks. The sampler does not bind, install, migrate or approve.
      row = @library.status.fetch('materials').find { |entry| entry['id'] == result['materialId'] }
      unless row && row['binding'] == observation['binding'] && row['issues'].is_a?(Array) && row['issues'].empty?
        issues = row && row['issues']
        return result.merge('status' => 'invalid_binding',
                            'issues' => issues.is_a?(Array) && !issues.empty? ? issues : ['El material ya no está disponible o su vínculo cambió. Revisá la biblioteca.'])
      end
      binding = observation.fetch('binding')
      result.merge('status' => row['designReady']==true && row['supplierReady']==false ? 'design_ready' : 'approved', 'selectable' => true, 'catalogId' => binding['catalogId'],
                   'materialUuid' => binding['uuid'], 'kind' => binding['kind'])
    end

    def hover!(target)
      @target = target
      info = sample_for(target)
      @hover = { 'pieceId' => target['pieceId'], 'faceId' => target['faceIds'].first,
                 'name' => target['name'], 'affectedPaths' => [target['pieceId']], 'faceCount' => 1,
                 'sharedCount' => 1, 'side' => @options['side'], 'materialName' => info['name'],
                 'materialStatus' => info['status'], 'selectable' => info['selectable'] }
      build_overlay(target)
      emit(info['selectable'] ? 'Material aprobado detectado. Clic para elegirlo sin pintar.' : info['issues'].join(' '))
    end

    def onLButtonDown(flags, x, y, view)
      onMouseMove(flags, x, y, view)
      return unless @target
      verify_guard!
      # Re-read catalog, binding and face on every click, even if hover did not
      # move: sampling an item that was changed/unapproved must not select it.
      @sample = sample_for(@target)
      @sample_sequence += 1
      emit(@sample['selectable'] ? 'Material tomado en la paleta. Elegí un modo y confirmá el alcance antes de pintar.' : @sample['issues'].join(' '))
      invalidate(view)
    rescue StandardError => error
      @sample = nil
      emit('No se pudo tomar el material. No se modificó el modelo.', error: error.message)
      invalidate(view)
    end

    def onKeyDown(key, _repeat, _flags, view)
      onCancel(0, view) if key == 27
    end

    def stop(view = nil)
      clear
      @active = false
      emit('Cuentagotas detenido. No se modificó el modelo.')
      invalidate(view)
    end

    # Defensive overrides: the sampling tool must never gain a mutation route
    # through inherited batching or paint methods.
    def apply_targets(_targets)
      raise ExportError, 'El cuentagotas es de solo lectura.'
    end

    def queue(_target)
      raise ExportError, 'El cuentagotas no acumula caras para pintar.'
    end
  end
end
