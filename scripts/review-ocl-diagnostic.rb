# frozen_string_literal: true
# Offline QA of an operator-provided observation report, not a SKP importer.
require_relative '../sketchup_offline/ocl_reader'
input,target=ARGV
abort 'Uso: ruby scripts/review-ocl-diagnostic.rb diagnostico.json informe-nuevo.json' unless input && target
abort 'El diagnóstico supera el límite de 30 MiB.' if File.size(input)>30*1024*1024
review=PlanosSanto::OclReader.from_diagnostic(JSON.parse(File.read(input)))
review['replay_only']=true
review['sketchup_executed_here']=false
PlanosSanto::P1Diagnostics.write(review,target)
puts JSON.generate({'materials'=>review['materials'].length,'types'=>review['materials'].group_by { |m| m['category'] }.transform_values(&:length),
                    'pieces'=>review['pieces'].length,'unique_sheet_observations'=>review['pieces'].count { |p| p['capabilities']['sheet_candidate_unique'] },
                    'whole_library_enumerated'=>review['capabilities']['whole_material_library'],'production_ready'=>false})
