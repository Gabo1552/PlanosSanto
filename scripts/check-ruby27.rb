# frozen_string_literal: true
# 0.8.26 (SketchUp 2022): static check that the Ruby going into the RBZ runs on
# SketchUp 2022's Ruby 2.7.2 and on the SketchUp 2022 Ruby API. Run it through
# scripts/check-ruby27.mjs, which installs the pinned parser and
# sketchup-api-stubs gems and passes the RBZ file list.
#
#   ruby scripts/check-ruby27.rb --stubs DIR FILE...
#
# 1. Syntax: Parser::Ruby27 (whitequark/parser) must accept every file.
# 2. Ruby >= 3.0 core/stdlib methods and semantics (list below).
# 3. SketchUp Ruby API newer than 2022: methods and classes whose YARD
#    "@version SketchUp 20xx" in sketchup-api-stubs is 2023 or later must be guarded
#    (respond_to?/defined?/Sketchup.version) in the same method.
# A line ending in "# ruby27: ok <reason>" is accepted after review.
require 'parser/ruby27'
require 'set'

Parser::Builders::Default.modernize

module Ruby27Check
  # [method, minimum Ruby, note, predicate(node) or nil]
  def self.kw?(node, *names)
    node.children[2..].any? { |arg| arg.type == :kwargs && arg.children.any? { |pair| pair.type == :pair && pair.children[0].type == :sym && names.include?(pair.children[0].children[0]) } }
  end

  def self.const?(node, name)
    node&.type == :const && node.children[1] == name && (node.children[0].nil? || node.children[0].type == :cbase)
  end

  # Positional or keyword arguments; a &block is not one.
  def self.args?(node)
    node.children[2..].any? { |arg| arg.type != :block_pass }
  end

  METHODS = [
    [:except, '3.0', 'Hash#except'],
    [:intersect?, '3.1', 'Array#intersect?'],
    [:ceildiv, '3.2', 'Integer#ceildiv'],
    [:bytesplice, '3.2', 'String#bytesplice'],
    [:byteindex, '3.2', 'String#byteindex'],
    [:byterindex, '3.2', 'String#byterindex'],
    [:dedup, '3.2', 'String#dedup (use -str)'],
    [:detailed_message, '3.2', 'Exception#detailed_message'],
    [:subclasses, '3.1', 'Class#subclasses'],
    [:attached_object, '3.2', 'Class#attached_object'],
    [:match_length, '3.1', 'MatchData#match_length'],
    [:overlap?, '3.3', 'Range#overlap?'],
    [:set_temporary_name, '3.3', 'Module#set_temporary_name'],
    [:load_file, '3.0', 'JSON.load_file (no está en json 2.3.0, el de Ruby 2.7.2)', ->(n) { const?(n.children[0], :JSON) }],
    [:define, '3.2', 'Data.define', ->(n) { const?(n.children[0], :Data) }],
    [:try_convert, '3.1', 'Integer.try_convert', ->(n) { const?(n.children[0], :Integer) }],
    [:product, '3.2', 'Enumerator.product', ->(n) { const?(n.children[0], :Enumerator) }],
    [:timeout, '3.2', 'Regexp.timeout', ->(n) { const?(n.children[0], :Regexp) }],
    [:timeout=, '3.2', 'Regexp.timeout=', ->(n) { const?(n.children[0], :Regexp) }],
    [:linear_time?, '3.3', 'Regexp.linear_time?', ->(n) { const?(n.children[0], :Regexp) }],
    [:uuid_v4, '3.3', 'SecureRandom.uuid_v4'],
    [:uuid_v7, '3.3', 'SecureRandom.uuid_v7'],
    [:tally, '3.1', 'Enumerable#tally(hash)', ->(n) { args?(n) }],
    [:transform_keys, '3.0', 'Hash#transform_keys(hash)', ->(n) { args?(n) }],
    [:transform_keys!, '3.0', 'Hash#transform_keys!(hash)', ->(n) { args?(n) }],
    [:unpack, '3.1', 'String#unpack(offset:)', ->(n) { kw?(n, :offset) }],
    [:unpack1, '3.1', 'String#unpack1(offset:)', ->(n) { kw?(n, :offset) }],
    [:glob, '3.0', 'Dir.glob(sort:)', ->(n) { kw?(n, :sort) }],
    [:[], '3.0', 'Dir[](sort:)', ->(n) { const?(n.children[0], :Dir) && kw?(n, :sort) }],
    [:warn, '3.0', 'Kernel#warn(category:)', ->(n) { kw?(n, :category) }],
    [:new, '3.2', 'Regexp.new(timeout:)', ->(n) { const?(n.children[0], :Regexp) && kw?(n, :timeout) }],
    [:new, '3.1', 'Time.new(in:)', ->(n) { const?(n.children[0], :Time) && kw?(n, :in) }],
    [:now, '3.1', 'Time.now(in:)', ->(n) { const?(n.children[0], :Time) && kw?(n, :in) }],
    [:new, '3.4', 'Hash.new(capacity:)', ->(n) { const?(n.children[0], :Hash) && kw?(n, :capacity) }],
    [:new, '3.1', 'Thread::Queue.new(initial)', ->(n) { (const?(n.children[0], :Queue) || n.children[0]&.type == :const && n.children[0].children[1] == :Queue) && args?(n) }],
    [:create, '3.4', 'Tempfile.create(anonymous:)', ->(n) { kw?(n, :anonymous) }],
    [:alphanumeric, '3.3', 'SecureRandom.alphanumeric(chars:)', ->(n) { kw?(n, :chars) }],
    [:named_captures, '3.3', 'MatchData#named_captures(symbolize_names:)', ->(n) { kw?(n, :symbolize_names) }],
    [:name, '3.0', 'Symbol#name', ->(n) { n.children[0]&.type == :sym || n.children[0]&.type == :send && n.children[0].children[1] == :__method__ }],
  ].freeze
  JSON_OPTIONS = %i[script_safe escape_slash strict allow_trailing_comma allow_duplicate_key allow_control_characters allow_invalid_escape].freeze
  NEW_CONSTANTS = { Ractor: '3.0', ObjectSpace: nil }.freeze
  LATE_CORE_CONSTANTS = { %i[ObjectSpace WeakKeyMap] => '3.3', %i[IO Buffer] => '3.1', %i[Enumerator Product] => '3.2' }.freeze
  MUTATORS = %i[<< concat insert prepend replace clear force_encoding []= slice! sub! gsub! tr! tr_s! delete! squeeze! strip! lstrip! rstrip! chomp! chop!
                upcase! downcase! capitalize! swapcase! encode! unicode_normalize! scrub! setbyte succ! next! reverse!].freeze
  VISIBILITY = %i[private protected public module_function private_constant].freeze
  ATTRS = %i[attr_reader attr_writer attr_accessor attr].freeze
  ENUMERATOR_SOURCES = %i[lazy each_slice each_cons each_with_index each_entry each_with_object].freeze

  Finding = Struct.new(:level, :file, :line, :message)

  def self.version_key(text)
    match = text.to_s.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
    match ? match.captures.map(&:to_i) : [0]
  end

  # name => minimum SketchUp version over every stub that defines it.
  def self.load_stubs(dir)
    methods = Hash.new { |h, k| h[k] = [] }
    classes = {}
    Dir.glob(File.join(dir, '**', '*.rb')).sort.each do |file|
      next if file.include?('/Layout')
      klass = nil
      versions = []
      File.foreach(file, encoding: 'UTF-8') do |line|
        if (m = line.match(/^\s*#.*@version\s+(.*)$/))
          versions << m[1].strip
        elsif line.strip.start_with?('#') || line.strip.empty?
          next
        elsif (m = line.match(/^\s*(?:class|module)\s+([A-Z][\w:]*)/))
          klass = m[1]
          classes[klass] = versions.min_by { |v| version_key(v) } unless versions.empty?
          versions = []
        elsif (m = line.match(/^\s*def\s+(self\.)?([\w?!=\[\]<>+\-*\/]+)/))
          methods[m[2].to_sym] << [klass, versions.empty? ? 'SketchUp 6.0' : versions.min_by { |v| version_key(v) }]
          versions = []
        else
          versions = []
        end
      end
    end
    core = [Object.new, '', [], {}, 1, 1.0, :s, nil, 1..2, Struct.new(:a).new(1), Kernel, Module.new, Class.new, Comparable, Enumerable]
    late = {}
    methods.each do |name, defs|
      first = defs.min_by { |(_k, v)| version_key(v) }
      next unless version_key(first[1]).first >= 2023
      next if core.any? { |object| object.respond_to?(name, true) } || Enumerable.method_defined?(name) || Comparable.method_defined?(name)
      late[name] = defs.map { |k, v| "#{k}##{name} (#{v})" }.join(', ')
    end
    late_classes = classes.select { |name, version| name.start_with?('Sketchup::', 'UI::') && version_key(version).first >= 2023 }
    [late, late_classes]
  end

  class Analyzer
    attr_reader :findings, :shadowed

    def initialize(late_methods, late_classes, project_defs)
      @late = late_methods
      @late_classes = late_classes
      @project_defs = project_defs
      @findings = []
      @shadowed = Set.new
    end

    def check(file, source)
      @file = file
      # MRI 2.7 accepts "\x89PNG" in a UTF-8 file (a binary String); parser rejects it
      # (invalid_encoding). Same-length ASCII escapes keep every line and column.
      parsed = source.gsub(/\\x[89a-fA-F][0-9a-fA-F]/, '\\x7f')
      buffer = Parser::Source::Buffer.new(file, source: parsed)
      parser = Parser::Ruby27.new
      parser.diagnostics.all_errors_are_fatal = true
      parser.diagnostics.ignore_warnings = true
      ast, comments = parser.parse_with_comments(buffer)
      @ok_lines = comments.select { |c| c.text =~ /ruby27:\s*ok/ }.map { |c| c.location.line }.to_set
      return unless ast

      @frozen = source.lines.first(3).any? { |l| l =~ /frozen_string_literal:\s*true/ }
      @requires_set = source =~ /require\s+['"]set['"]/
      walk(ast, [])
      track_strings(ast) if @frozen
    rescue Parser::SyntaxError => e
      add(:error, e.diagnostic.location.line, "sintaxis Ruby 2.7: #{e.diagnostic.message}")
    end

    private

    def add(level, line, message)
      return if @ok_lines&.include?(line)
      @findings << Finding.new(level, @file, line, message)
    end

    def line(node)
      node.location.expression&.line || 0
    end

    def guarded?(scope, name)
      return false unless scope
      text = scope.location.expression.source
      text.include?("respond_to?(:#{name}") || text.match?(/defined\?\(\s*[\w:]*#{Regexp.escape(name.to_s)}/) || text.include?('Sketchup.version')
    end

    def walk(node, scopes)
      return unless node.is_a?(Parser::AST::Node)

      scopes = [*scopes, node] if %i[def defs].include?(node.type)
      case node.type
      when :send, :csend then on_send(node, scopes)
      when :const then on_const(node, scopes)
      when :case_match, :match_pattern, :match_pattern_p
        add(:error, line(node), 'pattern matching (case/in, =>, in): experimental en Ruby 2.7 y con otra semántica')
      when :forwarded_args, :forward_args, :forward_arg
        add(:warn, line(node), 'reenvío de argumentos (...): en Ruby 2.7.2 sólo sin argumentos previos')
      when :block, :numblock then on_block(node)
      when :def, :defs then on_def(node)
      end
      track_strings(node) if @frozen && %i[def defs].include?(node.type)
      node.children.each { |child| walk(child, scopes) }
    end

    def on_send(node, scopes)
      receiver, name, *args = node.children
      METHODS.each do |method, version, note, predicate|
        next unless name == method
        next if predicate && !predicate.call(node)
        add(:error, line(node), "#{note}: Ruby #{version}+ (SketchUp 2022 trae Ruby 2.7.2)")
      end
      if %i[generate pretty_generate dump to_json parse parse! load].include?(name) && JSON_OPTIONS.any? { |opt| Ruby27Check.kw?(node, opt) }
        add(:error, line(node), "opción JSON de json >= 2.7 en #{name}: SketchUp 2022 trae json 2.3.0")
      end
      if VISIBILITY.include?(name) && receiver.nil? && args.any? { |a| a.type == :send && a.children[0].nil? && ATTRS.include?(a.children[1]) }
        add(:error, line(node), "#{name} attr_*: attr_* devuelve nil en Ruby 2.7 (símbolos desde 3.0)")
      end
      if name == :compact && receiver&.type == :send && ENUMERATOR_SOURCES.include?(receiver.children[1])
        add(:error, line(node), 'Enumerable#compact / Enumerator::Lazy#compact: Ruby 3.1+')
      end
      if name == :it && receiver.nil? && args.empty? && @block_without_params&.positive?
        add(:error, line(node), '`it` como parámetro implícito de bloque: Ruby 3.4+ (en 2.7 es una llamada a método)')
      end
      if name == :scale_factor && Ruby27Check.const?(receiver, :UI) && !args.empty? && !guarded?(scopes.last, :scale_factor)
        add(:error, line(node), 'UI.scale_factor(view): SketchUp 2025.0+ (en 2022 sólo UI.scale_factor sin argumentos)')
      end
      return unless @late.key?(name)
      return if guarded?(scopes.last, name)
      # A project method with the same name (PieceHighlightTool#overlays, SkmImport#thumbnail):
      # an implicit call is the project's; with a receiver it needs a look.
      if @project_defs.include?(name)
        @shadowed << name
        return if receiver.nil? || receiver.type == :self
        return add(:warn, line(node), "#{name}: el proyecto define un método con este nombre; si es la API (#{@late[name]}) protegelo")
      end
      add(:error, line(node), "API de SketchUp posterior a 2022 sin respond_to?/defined?: #{@late[name]}")
    end

    def on_const(node, scopes)
      scope, name = node.children
      if Ruby27Check.const?(node, :Set) && !@requires_set
        add(:error, line(node), "Set sin require 'set' en este archivo (autoload recién en Ruby 3.2)")
      end
      if Ruby27Check.const?(node, :Ractor)
        add(:error, line(node), 'Ractor: Ruby 3.0+')
      end
      if scope&.type == :const
        pair = [scope.children[1], name]
        version = LATE_CORE_CONSTANTS[pair]
        add(:error, line(node), "#{pair.join('::')}: Ruby #{version}+") if version
        full = "#{scope.children[1]}::#{name}"
        if @late_classes.key?(full) && !guarded?(scopes.last, name)
          add(:error, line(node), "#{full} es de #{@late_classes[full]}: protegelo con defined?(#{full})")
        end
      end
    end

    def on_block(node)
      params = node.children[1]
      return unless node.type == :block && params.type == :args && params.children.empty?

      @block_without_params = (@block_without_params || 0) + 1
      walk(node.children[2], [])
      @block_without_params -= 1
      # body already walked for `it`; the generic walk visits it again without the flag.
    end

    def on_def(node)
      args = node.type == :def ? node.children[1] : node.children[2]
      types = args.children.map(&:type)
      return unless types.include?(:optarg) && (types & %i[kwarg kwoptarg kwrestarg]).any?

      add(:warn, line(node), "#{node.type == :def ? node.children[0] : node.children[1]}: argumento opcional + palabras clave; en Ruby 2.7 un Hash final puede tomarse como palabras clave. Revisar las llamadas.")
    end

    # With frozen_string_literal: true, Ruby 2.7 also freezes "#{interpolated}"
    # strings; Ruby 3.0+ does not. Mutating one only fails on 2.7.
    def track_strings(scope)
      body = scope.type == :def ? scope.children[2] : scope.type == :defs ? scope.children[3] : scope
      return unless body

      interpolated = Set.new
      each_node(body) do |node|
        interpolated << node.children[0] if %i[lvasgn ivasgn].include?(node.type) && node.children[1]&.type == :dstr
      end
      each_node(body) do |node|
        next unless %i[send csend].include?(node.type) && MUTATORS.include?(node.children[1])

        receiver = node.children[0]
        next unless receiver
        direct = receiver.type == :dstr
        variable = %i[lvar ivar].include?(receiver.type) && interpolated.include?(receiver.children[0])
        next unless direct || variable

        add(:error, line(node), "#{node.children[1]} sobre un String interpolado: con frozen_string_literal Ruby 2.7 lo congela (FrozenError); usá +\"...\" o String.new")
      end
    end

    def each_node(node, &block)
      return unless node.is_a?(Parser::AST::Node)

      yield node
      node.children.each { |child| each_node(child, &block) unless child.is_a?(Parser::AST::Node) && %i[def defs].include?(child.type) }
    end
  end
end

if $PROGRAM_NAME == __FILE__
  args = ARGV.dup
  stubs = nil
  if (index = args.index('--stubs'))
    stubs = args[index + 1]
    args.slice!(index, 2)
  end
  abort 'Uso: check-ruby27.rb --stubs DIR FILE...' if stubs.nil? || args.empty?
  late, late_classes = Ruby27Check.load_stubs(stubs)
  abort "No se leyeron versiones de #{stubs}" if late.empty? && late_classes.empty?
  sources = args.to_h { |file| [file, File.read(file, encoding: 'UTF-8')] }
  project_defs = sources.values.flat_map { |s| s.scan(/^\s*def\s+(?:self\.)?([\w?!=]+)/).flatten.map(&:to_sym) }.to_set
  analyzer = Ruby27Check::Analyzer.new(late, late_classes, project_defs)
  sources.each { |file, source| analyzer.check(file, source) }
  findings = analyzer.findings.uniq { |f| [f.level, f.file, f.line, f.message] }.sort_by { |f| [f.level == :error ? 0 : 1, f.file, f.line] }
  findings.each { |f| puts "#{f.level == :error ? 'ERROR' : 'aviso'} #{f.file}:#{f.line}: #{f.message}" }
  unless analyzer.shadowed.empty?
    puts "info: nombres de la API 2023+ que también define el proyecto (no se marcan): #{analyzer.shadowed.to_a.sort.join(', ')}"
  end
  errors = findings.count { |f| f.level == :error }
  puts "Ruby 2.7 / API SketchUp 2022: #{sources.size} archivos, #{errors} errores, #{findings.size - errors} avisos " \
       "(#{late.size} métodos y #{late_classes.size} clases de la API marcados 2023+ en los stubs)."
  exit(errors.zero? ? 0 : 1)
end
