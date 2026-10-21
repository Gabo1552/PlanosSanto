# frozen_string_literal: true
require 'json'
require 'digest'
require_relative 'material_resolver'

module PlanosSanto
  # Paint permission and supplier approval are independent. Photo provenance or
  # a classified, immutable SKM import permits design work, never supplier use.
  module MaterialPolicy
    PHOTO_KEY='photo_v1'
    HASH=/\A[0-9a-f]{64}\z/
    PHOTO_KEYS=%w[schema designReady sourceHash imageAsset thumbnailAsset skmHash textureScale widthPx heightPx].freeze
    def self.photo(item)
      value=item.is_a?(Hash) && item['observed'].is_a?(Hash) && item['observed']['photo']
      value.is_a?(Hash) ? value : nil
    end
    def self.photo?(item); !photo(item).nil?; end
    def self.skm_import?(item)
      item.is_a?(Hash) && item['observed'].is_a?(Hash) && item['observed']['source']=='skm-import'
    end
    def self.skm_source_ready?(item,directory: nil)
      return false unless skm_import?(item) && %w[sheet edge].include?(item['kind'])
      proof=item['observed']['skm']
      return false unless proof.is_a?(Hash) && HASH.match?(proof['sha256'].to_s) && proof['sourceName'].is_a?(String) &&
                          !proof['sourceName'].empty? && !proof['sourceName'].match?(/[\\\/\x00-\x1f\x7f]/)
      file_matches?(directory,'skm-import-assets',"#{proof['sha256']}.skm",proof['sha256'])
    rescue TypeError,ArgumentError,SystemCallError,IOError
      false
    end
    def self.directory(catalog)
      catalog.directory if catalog.respond_to?(:directory)
    end
    def self.file_matches?(directory,folder,name,expected)
      return false unless directory.is_a?(String) && !directory.empty? && expected.is_a?(String) && HASH.match?(expected)
      return false unless name.is_a?(String) && /\A[0-9a-f]{64}\.(?:png|jpg|jpeg|skm)\z/.match?(name) && name.split('.').first==expected
      base=File.join(directory,folder)
      return false if File.symlink?(directory) || File.symlink?(base)
      path=File.join(base,name)
      File.file?(path) && !File.symlink?(path) && File.size(path)>0 && Digest::SHA256.file(path).hexdigest==expected
    rescue SystemCallError,IOError
      false
    end
    def self.valid_scale?(scale)
      return false unless scale.is_a?(Hash) && scale.keys.sort==%w[heightMm verified widthMm] && [true,false].include?(scale['verified'])
      return scale['widthMm'].nil? && scale['heightMm'].nil? unless scale['verified']
      %w[widthMm heightMm].all? { |key| value=scale[key];value.is_a?(Numeric) && value.finite? && value>0 && value<=100000 }
    end
    def self.metadata_valid?(item)
      p=photo(item)
      item.is_a?(Hash) && %w[sheet edge].include?(item['kind']) && item['name'].is_a?(String) && !item['name'].strip.empty? &&
        p && p.keys.sort==PHOTO_KEYS.sort && p['schema']==1 && p['designReady']==true && HASH.match?(p['sourceHash'].to_s) && HASH.match?(p['skmHash'].to_s) &&
        p['imageAsset'].is_a?(String) && /\A[0-9a-f]{64}\.(?:png|jpg|jpeg)\z/.match?(p['imageAsset']) &&
        p['thumbnailAsset'].is_a?(String) && /\A[0-9a-f]{64}\.png\z/.match?(p['thumbnailAsset']) &&
        %w[widthPx heightPx].all? { |key| p[key].is_a?(Integer) && p[key]>0 && p[key]<=16384 } &&
        p['widthPx']*p['heightPx']<=16_000_000 && valid_scale?(p['textureScale'])
    end
    def self.photo_source_ready?(item,directory: nil)
      return false unless metadata_valid?(item)
      p=photo(item)
      return false unless file_matches?(directory,'photo-assets',p['imageAsset'],p['sourceHash']) &&
                          file_matches?(directory,'photo-assets',p['thumbnailAsset'],p['thumbnailAsset'].split('.').first) &&
                          file_matches?(directory,'material-assets',"#{p['skmHash']}.skm",p['skmHash'])
      true
    rescue TypeError,ArgumentError,SystemCallError,IOError
      false
    end
    def self.design_ready?(item,directory: nil)
      return false unless photo_source_ready?(item,directory:directory)
      index_path=File.join(directory,'material-assets.json')
      return false unless File.file?(index_path) && !File.symlink?(index_path) && File.size(index_path)<=8*1024*1024
      index=JSON.parse(File.binread(index_path))
      return false unless index.is_a?(Hash) && index['schema']==1 && index['records'].is_a?(Array)
      rows=index['records'].select { |row| row.is_a?(Hash) && row['catalogId']==item['id'] }
      return false unless rows.length==1
      record=rows.first
      record['catalogFingerprint']==MaterialResolver.item_fingerprint(item) &&
        file_matches?(directory,'material-assets',record['assetName'],record['assetHash'])
    rescue JSON::ParserError,TypeError,ArgumentError,SystemCallError,IOError
      false
    end
    def self.paintable?(item,directory: nil)
      return false unless item.is_a?(Hash) && %w[sheet edge].include?(item['kind'])
      return design_ready?(item,directory:directory) if photo?(item)
      return skm_source_ready?(item,directory:directory) if skm_import?(item)
      item['approved']==true
    end
    def self.native_valid?(item,material,directory: nil,allow_stale_index: false)
      return paintable?(item,directory:directory) unless photo?(item)
      source_ready=allow_stale_index ? photo_source_ready?(item,directory:directory) : design_ready?(item,directory:directory)
      return false unless source_ready && material.respond_to?(:texture) && material.texture && material.respond_to?(:get_attribute)
      raw=material.get_attribute(MaterialResolver::DICT,PHOTO_KEY,nil)
      return false unless raw.is_a?(String) && raw.bytesize<=1024
      proof=JSON.parse(raw)
      return false unless proof.is_a?(Hash) && proof['schema']==1 && proof['sourceHash']==photo(item)['sourceHash']
      texture=material.texture
      return false unless %i[width height].all? { |axis| texture.respond_to?(axis) && texture.public_send(axis).to_f.finite? && texture.public_send(axis).to_f>0 }
      scale=photo(item)['textureScale']
      !scale['verified'] || (texture.width.to_f*25.4-scale['widthMm']).abs<=0.1 && (texture.height.to_f*25.4-scale['heightMm']).abs<=0.1
    rescue JSON::ParserError,ArgumentError,TypeError
      false
    end
    def self.warnings(item)
      return [] unless photo?(item) || skm_import?(item)
      warnings=[]
      warnings << 'Listo para diseño; falta validar la ficha comercial antes de maderera.' unless item['approved']==true
      warnings << 'Escala de textura sin verificar; la foto no determina medidas físicas ni garantiza repetición sin juntas.' if photo?(item) && photo(item).dig('textureScale','verified')!=true
      warnings
    end
  end
end
