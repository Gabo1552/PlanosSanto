# frozen_string_literal: true
require 'json'
require 'digest'
require_relative 'material_resolver'

module PlanosSanto
  # Paint permission and supplier approval are independent. Design readiness
  # depends only on visual data (photo, SKM, archived visual, colour); commercial
  # fields (SKU, supplier, price, format, approval) never block painting.
  # File integrity is verified when a material is installed or bound, not on
  # every click (Hito 1, 0.8.8).
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
    def self.skm_provenance_valid?(item)
      proof=item['observed']['skm']
      proof.is_a?(Hash) && HASH.match?(proof['sha256'].to_s) && proof['sourceName'].is_a?(String) &&
        !proof['sourceName'].empty? && !proof['sourceName'].match?(/[\\\/\x00-\x1f\x7f]/)
    end
    def self.skm_source_ready?(item,directory: nil)
      return false unless skm_import?(item) && %w[sheet edge].include?(item['kind'])
      proof=item['observed']['skm']
      return false unless skm_provenance_valid?(item)
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
    # Photo design readiness: original image, thumbnail and reusable SKM, all
    # content-addressed. The commercial fingerprint is deliberately NOT involved.
    def self.design_ready?(item,directory: nil)
      photo_source_ready?(item,directory:directory)
    end
    # Index record (catalogId -> archived visual SKM). Returns nil when absent.
    def self.visual_record(item,directory)
      return nil unless directory.is_a?(String) && item.is_a?(Hash)
      index_path=File.join(directory,'material-assets.json')
      return nil unless File.file?(index_path) && !File.symlink?(index_path) && File.size(index_path)<=8*1024*1024
      index=JSON.parse(File.binread(index_path))
      return nil unless index.is_a?(Hash) && index['schema']==1 && index['records'].is_a?(Array)
      rows=index['records'].select { |row| row.is_a?(Hash) && row['catalogId']==item['id'] }
      rows.length==1 ? rows.first : nil
    rescue JSON::ParserError,TypeError,ArgumentError,SystemCallError,IOError
      nil
    end
    # Where the verified visual to install comes from, and its integrity:
    # {'status'=>'ok'|'missing'|'corrupt'|'none','path'=>String|nil}.
    def self.design_asset(item,directory: nil)
      return {'status'=>'none','path'=>nil} unless item.is_a?(Hash) && %w[sheet edge].include?(item['kind'])
      candidates=[]
      record=visual_record(item,directory)
      candidates << ['material-assets',record['assetName'],record['assetHash']] if record && record['assetName'].is_a?(String) && record['assetHash'].is_a?(String)
      if photo?(item) && photo(item)['skmHash'].is_a?(String)
        candidates << ['material-assets',"#{photo(item)['skmHash']}.skm",photo(item)['skmHash']]
      end
      if skm_import?(item) && item['observed']['skm'].is_a?(Hash) && item['observed']['skm']['sha256'].is_a?(String)
        # Same provenance rules as skm_source_ready? (safe source name, no symlink).
        return {'status'=>'none','path'=>nil} if record.nil? && !skm_provenance_valid?(item)
        candidates << ['skm-import-assets',"#{item['observed']['skm']['sha256']}.skm",item['observed']['skm']['sha256']] if skm_provenance_valid?(item)
      end
      return {'status'=>'none','path'=>nil} if candidates.empty?
      if photo?(item)
        # The original photo and its thumbnail prove the visual; check them first.
        p=photo(item)
        [['photo-assets',p['imageAsset'],p['sourceHash']],['photo-assets',p['thumbnailAsset'],p['thumbnailAsset'].to_s.split('.').first],
         ['material-assets',"#{p['skmHash']}.skm",p['skmHash']]].each do |folder,name,hash|
          next if file_matches?(directory,folder,name,hash)
          path=directory.is_a?(String) && name.is_a?(String) ? File.join(directory,folder,name) : nil
          return {'status'=>path && File.file?(path) ? 'corrupt' : 'missing','path'=>nil}
        end
      end
      seen_corrupt=false
      candidates.uniq.each do |folder,name,hash|
        return {'status'=>'ok','path'=>File.join(directory,folder,name)} if file_matches?(directory,folder,name,hash)
        path=directory.is_a?(String) && name.is_a?(String) ? File.join(directory,folder,name) : nil
        seen_corrupt||=path && File.file?(path)
      end
      {'status'=>seen_corrupt ? 'corrupt' : 'missing','path'=>nil}
    rescue TypeError,ArgumentError,SystemCallError,IOError
      {'status'=>'missing','path'=>nil}
    end
    # A catalog item is paintable when a verified visual can be installed.
    # Commercial approval alone no longer grants it (it showed unpaintable
    # tiles, audit cause C1); a bound material already in the model is judged
    # by native_valid? instead.
    def self.paintable?(item,directory: nil)
      return false unless item.is_a?(Hash) && %w[sheet edge].include?(item['kind'])
      return false if photo?(item) && !metadata_valid?(item)
      design_asset(item,directory:directory)['status']=='ok'
    end
    # Bound native material check. require_source=true (install/bind) also
    # verifies the library files; false (painting) trusts the installed
    # material plus its embedded photo proof, so a click never hashes files.
    # allow_stale_index is accepted for callers of 0.8.7 and no longer changes the result.
    def self.native_valid?(item,material,directory: nil,allow_stale_index: false,require_source: true)
      return true unless photo?(item)
      source_ready=!require_source || photo_source_ready?(item,directory:directory)
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
