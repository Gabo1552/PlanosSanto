# frozen_string_literal: true
require 'minitest/autorun'

# Windows opens files in text mode unless told otherwise: every "\n" written
# becomes "\r\n". A backup verified by hash then never matches (0.8.14 native:
# «No se pudo verificar la copia de seguridad»). These checks read the product
# source, because the Linux suite cannot reproduce the translation itself.
class WindowsIoTest < Minitest::Test
  SOURCES = Dir[File.expand_path('../*.rb', __dir__)].freeze

  def lines_of(path) = File.read(path, encoding: 'UTF-8').lines

  def test_every_file_opened_for_writing_is_binary
    offenders = SOURCES.flat_map do |path|
      lines_of(path).each_with_index.filter_map do |line, index|
        next unless line.include?('File.open(') && line.include?('File::WRONLY')
        window = lines_of(path)[index, 3].join
        "#{File.basename(path)}:#{index + 1}" unless line.include?('File::BINARY') || window.include?('binmode')
      end
    end
    assert_empty offenders
  end

  def test_every_tempfile_that_receives_bytes_is_binary
    offenders = SOURCES.flat_map do |path|
      lines = lines_of(path)
      lines.each_with_index.filter_map do |line, index|
        next unless line.include?('Tempfile.create(')
        block = lines[index + 1, 2].join
        next unless block.include?('.write(')
        "#{File.basename(path)}:#{index + 1}" unless block.include?('binmode')
      end
    end
    assert_empty offenders
  end

  def test_no_text_mode_file_write
    offenders = SOURCES.flat_map do |path|
      lines_of(path).each_with_index.filter_map { |line, index| "#{File.basename(path)}:#{index + 1}" if line.match?(/\bFile\.write\(/) }
    end
    assert_empty offenders
  end
end
