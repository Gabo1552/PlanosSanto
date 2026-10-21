# frozen_string_literal: true
require 'minitest/autorun'
require_relative 'fake_api'
require_relative '../planos_santo/transport'

class TransportTest < Minitest::Test
  class FakeResponse
    attr_accessor :code,:payload
    def initialize(code='201',payload=JSON.generate({project:{id:'11111111-1111-4111-8111-111111111111',name:'Contrato'}}));@code=code;@payload=payload;end
    def read_body;yield @payload;end
  end
  class FakeHTTP
    attr_accessor :open_timeout,:read_timeout,:write_timeout,:max_retries,:use_ssl,:verify_mode,:verify_hostname,:response,:sent,:failure
    def initialize;@response=FakeResponse.new;end
    def start;yield self;end
    def request(request);raise @failure if @failure;@sent=request;yield @response;end
  end
  def setup
    exporter=PlanosSanto::Exporter.new(Fixture.model);@doc=exporter.document(exporter.tree,['1']);@http=FakeHTTP.new;@token='a'*64
  end
  def send_doc(url='https://taller.example')
    PlanosSanto::Transport.send_document(PlanosSanto::Transport.destination(url),@token,@doc,http_factory:->(_host,_port){@http})
  end
  def test_tls_verified_credentials_in_header_only_and_no_model_binary
    result=send_doc
    assert_equal 'Contrato',result['project']['name']
    assert_equal true,@http.use_ssl
    assert_equal OpenSSL::SSL::VERIFY_PEER,@http.verify_mode
    assert_equal true,@http.verify_hostname
    assert_equal 0,@http.max_retries
    assert_equal '/api/sketchup/receive',@http.sent.path
    assert_equal 'Bearer '+@token,@http.sent['Authorization']
    refute_includes @http.sent.body,@token
    assert_equal @doc,JSON.parse(@http.sent.body)
  end
  def test_http_only_literal_loopback_and_no_credential_urls
    %w[http://evil.example http://localhost.evil.example https://u:p@evil.example https://taller.example/path https://taller.example?token=x https://taller.example/#x file:///tmp/x].each do |url|
      assert_raises(PlanosSanto::ExportError) { PlanosSanto::Transport.destination(url) }
    end
    send_doc('http://127.0.0.1:3000');refute @http.use_ssl
  end
  def test_rejects_redirects_and_server_rejection
    @http.response.code='302';assert_raises(PlanosSanto::ExportError) { send_doc }
    @http.response.code='401';@http.response.payload='{"error":"Código vencido"}'
    e=assert_raises(PlanosSanto::ExportError) { send_doc };assert_match(/Código vencido/,e.message)
  end
  def test_bad_token_and_unreviewed_document_never_sent
    @token="a\r\nb";assert_raises(PlanosSanto::ExportError) { send_doc };assert_nil @http.sent
    @token='a'*64;@doc['exporter']['reviewed']=false
    assert_raises(PlanosSanto::ExportError) { send_doc };assert_nil @http.sent
  end
  def test_tls_failures_and_timeouts_are_explicit
    @http.failure=OpenSSL::SSL::SSLError.new('bad certificate')
    e=assert_raises(PlanosSanto::ExportError) { send_doc };assert_match(/validación TLS/,e.message)
    @http.failure=Net::ReadTimeout.new
    e=assert_raises(PlanosSanto::ExportError) { send_doc };assert_match(/confirmar la entrega/,e.message)
  end
end
