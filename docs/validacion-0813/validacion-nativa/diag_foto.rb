# Diagnóstico de solo lectura de F0: repite paso a paso PhotoMaterial#pick sin el rescue que oculta la causa.
# No crea materiales ni fichas; usa la instancia del producto solo para métodos puros.
module Q
  def self.diag_foto(ruta)
    model = Sketchup.active_model
    catalog = PlanosSanto::CatalogStore.new(directory: V.directory)
    svc = PlanosSanto::PhotoMaterial.new(model, catalog: catalog, directory: V.directory)
    pasos = {}
    bytes = File.binread(ruta)
    info = begin
      svc.send(:image_info, bytes).tap { |v| pasos['image_info'] = v }
    rescue Exception => e
      pasos['image_info'] = "#{e.class}: #{e.message}"; return pasos
    end
    ext = '.' + info['format']
    Tempfile.create(['.planos-photo-', ext]) do |file|
      file.binmode; file.write(bytes); file.flush
      pasos['tempfile'] = file.path.sub(/.*[\\\/]/, '<tmp>/')
      rep = Sketchup::ImageRep.new
      begin
        r = rep.load_file(file.path)
        pasos['load_file'] = { 'return' => r.inspect, 'width' => rep.width, 'height' => rep.height, 'bpp' => rep.bits_per_pixel,
                               'padding' => rep.row_padding, 'dataBytes' => rep.data.bytesize }
      rescue Exception => e
        pasos['load_file'] = "#{e.class}: #{e.message} @ #{e.backtrace.first(3).join(' | ')}"; return pasos
      end
      pasos['respond_to'] = %i[bits_per_pixel row_padding data].to_h { |m| [m.to_s, rep.respond_to?(m)] }
      begin
        pasos['load_image'] = svc.send(:load_image, file.path, expected: info).class.name
      rescue Exception => e
        pasos['load_image'] = "#{e.class}: #{e.message}"
      end
      begin
        ratio = [256.0 / rep.width, 256.0 / rep.height, 1.0].min
        w = [(rep.width * ratio).round, 1].max; h = [(rep.height * ratio).round, 1].max
        thumb = svc.send(:thumbnail_rep, rep, w, h)
        pasos['thumbnail_rep'] = { 'width' => thumb.width, 'height' => thumb.height }
        Tempfile.create(['.planos-preview-', '.png']) do |pf|
          path = pf.path; pf.close
          saved = thumb.save_file(path)
          png = File.file?(path) ? File.binread(path) : ''
          pasos['save_file'] = { 'return' => saved.inspect, 'existe' => File.file?(path), 'bytes' => png.bytesize, 'cabecera' => png.byteslice(0, 16).to_s.unpack1('H*') }
          pasos['image_info_preview'] = begin
            svc.send(:image_info, png)
          rescue Exception => e
            "#{e.class}: #{e.message}"
          end
        end
      rescue Exception => e
        pasos['preview'] = "#{e.class}: #{e.message} @ #{e.backtrace.first(3).join(' | ')}"
      end
      begin
        pasos['image_preview'] = svc.send(:image_preview, svc.send(:load_image, file.path, expected: info)).to_s[0, 40]
      rescue Exception => e
        pasos['image_preview'] = "#{e.class}: #{e.message} @ #{e.backtrace.first(4).join(' | ')}"
      end
    end
    pasos['modificado'] = model.modified?
    pasos
  end
end
puts 'diag listo'
