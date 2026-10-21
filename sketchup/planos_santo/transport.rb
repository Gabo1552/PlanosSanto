# frozen_string_literal: true
require 'uri'
require 'net/http'
require 'openssl'
require 'json'
require_relative 'exporter'

module PlanosSanto
  module Transport
    def self.destination(value)
      uri = URI.parse(value.to_s)
      valid = %w[https http].include?(uri.scheme) && uri.hostname && !uri.hostname.empty? && !uri.userinfo && !uri.query && !uri.fragment && ['', '/'].include?(uri.path)
      raise ExportError, 'Usá la dirección raíz de la web, sin usuario, rutas, consultas ni fragmentos.' unless valid
      local = %w[localhost 127.0.0.1 ::1].include?(uri.hostname.downcase)
      raise ExportError, 'Se requiere HTTPS. HTTP solo está permitido para localhost/127.0.0.1/::1 en esta PC.' unless uri.scheme == 'https' || local
      uri
    rescue URI::InvalidURIError
      raise ExportError, 'La dirección web no es válida.'
    end

    def self.send_document(uri, token, document, http_factory: nil)
      uri = destination(uri.to_s)
      raise ExportError, 'Código temporal inválido. Generá uno nuevo en la web.' unless token.is_a?(String) && token.match?(/\A[a-f0-9]{64}\z/)
      raise ExportError, 'La exportación no fue revisada.' unless document.dig('exporter','reviewed') == true
      body = JSON.generate(document)
      raise ExportError, 'El JSON supera 30 MB.' if body.bytesize > 30*1024*1024
      http = http_factory ? http_factory.call(uri.hostname, uri.port) : Net::HTTP.new(uri.hostname, uri.port)
      http.open_timeout = 10; http.read_timeout = 60; http.write_timeout = 30; http.max_retries = 0
      if uri.scheme == 'https'
        http.use_ssl = true
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER
        http.verify_hostname = true
      end
      request = Net::HTTP::Post.new('/api/sketchup/receive')
      request['Content-Type'] = 'application/json'
      request['Authorization'] = "Bearer #{token}"
      request.body = body
      status = nil; response_body = +''
      http.start do |client|
        client.request(request) do |response|
          status = response.code.to_i
          response.read_body do |chunk|
            raise ExportError, 'La respuesta del servidor supera 1 MB.' if response_body.bytesize + chunk.bytesize > 1024*1024
            response_body << chunk
          end
        end
      end
      raise ExportError, 'El servidor intentó redirigir la carga. Usá su URL HTTPS final y generá otro código; no se siguió la redirección.' if status && status.between?(300,399)
      unless status == 201
        message = begin; JSON.parse(response_body)['error']; rescue JSON::ParserError; nil; end
        raise ExportError, "El servidor rechazó la carga (#{status || 'sin respuesta'}). #{message.to_s[0,250]}"
      end
      result = JSON.parse(response_body)
      project = result.fetch('project')
      raise ExportError, 'Respuesta del servidor incompatible.' unless project['id'].is_a?(String) && project['id'].match?(/\A[0-9a-f-]{36}\z/) && project['name'].is_a?(String)
      { 'project' => { 'id' => project['id'], 'name' => project['name'][0,120] } }
    rescue OpenSSL::SSL::SSLError
      raise ExportError, 'Falló la validación TLS del servidor. Revisá el certificado/cadena de confianza; no desactives la verificación.'
    rescue JSON::ParserError, KeyError
      raise ExportError, 'El servidor no devolvió una respuesta JSON compatible.'
    rescue Timeout::Error, SocketError, SystemCallError, IOError
      raise ExportError, 'No se pudo confirmar la entrega. Revisá Proyectos guardados antes de reintentar y generá otro código si hace falta.'
    end
  end
end
