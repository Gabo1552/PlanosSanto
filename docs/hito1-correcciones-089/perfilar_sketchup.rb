# frozen_string_literal: true
require 'json'
# Readonly profiling of the INSTALLED painter. No method replacements, no load
# patches, no automatic execution. Trace overhead is excluded from medianMs.
module PlanosSantoPerf089
  def self.run(service:, request:, rounds: 5)
    raise ArgumentError,'Entre3y10muestras.' unless rounds.is_a?(Integer) && rounds.between?(3,10)
    clock=-> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
    times=rounds.times.map do
      start=clock.call;service.preview(request);elapsed=(clock.call-start)*1000
      service.cancel;elapsed
    end
    tracked={};stacks=Hash.new { |h,k| h[k]=[] }
    trace=TracePoint.new(:call,:return) do |point|
      klass=point.defined_class.to_s
      next unless klass.start_with?('PlanosSanto::') && %i[inventory prepare_application preview geometry material_for automatic_axes].include?(point.method_id)
      key="#{klass}##{point.method_id}";token=[Thread.current.object_id,point.self.object_id,key]
      if point.event==:call
        stacks[token] << clock.call
      elsif (start=stacks[token].pop)
        row=(tracked[key]||={'calls'=>0,'inclusiveMs'=>0.0});row['calls']+=1;row['inclusiveMs']+=(clock.call-start)*1000
      end
    end
    begin
      trace.enable { service.preview(request) }
    ensure
      trace.disable;service.cancel
    end
    {'schema'=>1,'readonly'=>true,'samplesMs'=>times,'medianMs'=>times.sort[times.length/2],
     'tracedMethods'=>tracked,'traceTimingComparableToMedian'=>false,
     'note'=>'Muestras readonly; no prueban10escrituras ni latencia humana.'}
  end
end

module PlanosSantoPerf089
  # Optional WRITE benchmark, only on a user-prepared QA copy. No automatic run.
  # Ten distinct/alternating destinations must really change; no-op aborts the
  # sample series instead of being counted as a measured paint application.
  def self.measure_writes(service:, requests:, confirmed_copy: false)
    raise ArgumentError,'Usar solo una COPIA de ensayo y confirmed_copy:true.' unless confirmed_copy==true
    raise ArgumentError,'Preparar exactamente10solicitudes que cambienmaterial.' unless requests.is_a?(Array) && requests.length==10
    samples=[]
    requests.each do |request|
      started=Process.clock_gettime(Process::CLOCK_MONOTONIC)
      result=service.apply_immediate(request)
      elapsed=(Process.clock_gettime(Process::CLOCK_MONOTONIC)-started)*1000
      samples << {'elapsedMs'=>elapsed,'changed'=>result['changed']==true,'noChanges'=>result['noChanges']==true}
      break unless result['changed']==true
    end
    {'schema'=>1,'readonly'=>false,'samples'=>samples,'changedCount'=>samples.count { |row| row['changed'] },
     'tenRealWrites'=>samples.length==10 && samples.all? { |row| row['changed'] },
     'scope'=>'Solo motor síncrono; sin automatización/captura/latencia humana. Cada cambio conserva su Undo.'}
  end
end
