# frozen_string_literal: true
# Load manually in SketchUp. Loading executes no test, changes no preference,
# patches no product class and writes no file.
require 'json'
require 'base64'
module PlanosSantoPreferencias087
  def self.check(expected)
    raise 'Ejecutar en SketchUp2026 con0.8.7 instalada.' unless defined?(Sketchup) && Sketchup.version.to_s.split('.').first=='26' && defined?(PlanosSanto::Release::VERSION) && PlanosSanto::Release::VERSION=='0.8.7'
    raise 'Indicá expected como Hash con las opciones realmente elegidas en UI.' unless expected.is_a?(Hash) && !expected.empty?
    allowed=PlanosSanto::OfflineController::SMART_SETTING_KEYS
    raise 'expected contiene campos ajenos a preferencias.' unless (expected.keys-allowed).empty?
    model=Sketchup.active_model;modified=model.modified?
    actual=PlanosSanto::OfflineController.new.smart_settings
    raw=Sketchup.read_default('PlanosSanto','smart_paint_settings_v2','')
    raise 'Activá primero la herramienta desde UI para guardar formato nuevo.' unless raw.is_a?(String) && raw.start_with?('ps2:')
    envelope=JSON.parse(Base64.strict_decode64(raw.delete_prefix('ps2:')))
    raise 'Sobre inválido.' unless envelope['schema']==2 && envelope['settings'].is_a?(Hash)
    forbidden=%w[confirmed allowShared materialUuid sourceMaterialUuid]
    raise 'Se persistieron permisos o UUID de proyecto.' unless (envelope['settings'].keys & forbidden).empty?
    raise 'El modelo cambió al consultar preferencias.' unless model.modified? == modified
    mismatches=expected.reject { |key,value| actual[key]==value }
    {'version'=>'0.8.7','nativeExecuted'=>true,'passed'=>mismatches.empty?,
     'expectedSubset'=>expected,'actual'=>actual,'mismatches'=>mismatches,
     'forbiddenKeysAbsent'=>true,'modelModifiedUnchanged'=>true,'productionApproved'=>false}
  end
end
