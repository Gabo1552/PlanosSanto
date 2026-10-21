import { importDocument, ModelValidationError, rawDocumentSchema } from './model';
export function importRubyDocument(input:unknown){
  const raw=rawDocumentSchema.parse(input);
  if(!raw.exporter || raw.units!=='mm')throw new ModelValidationError('Se requiere una exportación revisada de Planos Santo Ruby 0.2.0 en milímetros.');
  return importDocument(raw,'sketchup-ruby');
}
