# frozen_string_literal: true
require 'zlib'

module PlanosSanto
  # Small read-only ZIP reader for local SKM bundles. No filesystem extraction,
  # native executables, ZIP64, encryption, external links or unbounded inflation.
  class BoundedZip
    Entry = Struct.new(:name, :flags, :method, :crc, :compressed, :size, :offset, :raw_name, keyword_init:true)
    attr_reader :entries
    def initialize(bytes,max_bytes:128*1024*1024,max_entries:512,max_total:256*1024*1024,max_entry:32*1024*1024)
      @bytes=bytes;@max_entry=max_entry
      reject! unless bytes.is_a?(String) && bytes.bytesize<=max_bytes && bytes.bytesize>=22
      start=[bytes.bytesize-65_557,0].max
      eocd=bytes.rindex("PK\x05\x06".b)
      reject! unless eocd && eocd>=start && eocd+22<=bytes.bytesize
      disk,central_disk,disk_count,count,size,offset,comment=bytes.byteslice(eocd+4,18).unpack('vvvvVVv')
      reject! unless disk.zero? && central_disk.zero? && disk_count==count && count<=max_entries && count!=65_535 && size!=0xffffffff && offset!=0xffffffff && offset+size==eocd && eocd+22+comment==bytes.bytesize
      @central=offset;@entries=[];position=offset;total=0;seen={}
      count.times do
        reject! unless position+46<=eocd && bytes.byteslice(position,4)=="PK\x01\x02".b
        made,needed,flags,method,_time,_date,crc,compressed,uncompressed,nlen,xlen,clen,dstart,_attrs,external,local=bytes.byteslice(position+4,42).unpack('vvvvvvVVVvvvvvVV')
        reject! unless needed<=20 && [0,8].include?(method) && (flags & ~0x0808).zero? && dstart.zero? && compressed!=0xffffffff && uncompressed<=max_entry && compressed<=max_bytes && local<offset
        mode=(external>>16)&0xf000
        reject! if mode==0xa000 || ((made>>8)==3 && ![0,0x8000,0x4000].include?(mode))
        ending=position+46+nlen+xlen+clen;reject! if ending>eocd
        raw=bytes.byteslice(position+46,nlen)
        name=decode_name(raw,flags)
        key=name.unicode_normalize(:nfc).downcase
        reject! if seen[key];seen[key]=true
        total+=uncompressed;reject! if total>max_total
        reject! if uncompressed>1_048_576 && uncompressed>[compressed*250,1].max
        @entries << Entry.new(name:name,flags:flags,method:method,crc:crc,compressed:compressed,size:uncompressed,offset:local,raw_name:raw)
        position=ending
      end
      reject! unless position==offset+size
      # Validate headers even for ignored entries; ambiguous paths are rejected.
      ranges=@entries.map do |entry|
        payload=payload_offset(entry)
        [entry.offset,payload+entry.compressed]
      end.sort
      reject! if ranges.each_cons(2).any? { |a,b| a[1]>b[0] }
    rescue EncodingError,ArgumentError,NoMethodError
      reject!
    end
    def reject!;raise ExportError,'Archivo ZIP/SKM inválido, inseguro o fuera de los límites permitidos.';end
    SAFE_NAME=%r{\A[A-Za-z0-9_-][A-Za-z0-9._-]*(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\z}
    # Writer for the packages this reader accepts: no ZIP64, no directories,
    # stored or raw-deflated entries, plain relative names, fixed timestamp.
    # entries: [[name, bytes, deflate]]; returns the archive bytes.
    def self.build(entries,max_bytes:128*1024*1024,max_entries:2048)
      raise ExportError,'Demasiados archivos para un paquete ZIP.' unless entries.is_a?(Array) && entries.length.between?(1,max_entries)
      names={};body=''.b;central=''.b
      time,date=0,(2026-1980)<<9|1<<5|1
      entries.each do |name,bytes,deflate|
        raise ExportError,'Ruta inválida dentro del paquete ZIP.' unless name.is_a?(String) && name.bytesize<=1024 && SAFE_NAME.match?(name) && !names.key?(name.downcase)
        raise ExportError,'Contenido inválido dentro del paquete ZIP.' unless bytes.is_a?(String) && bytes.bytesize<0xffffffff
        names[name.downcase]=true
        data=bytes.b;crc=Zlib.crc32(data);method=0
        if deflate
          deflater=Zlib::Deflate.new(Zlib::BEST_COMPRESSION,-Zlib::MAX_WBITS)
          begin
            packed=deflater.deflate(data,Zlib::FINISH)
          ensure
            deflater.close
          end
          data,method=packed,8 if packed.bytesize<bytes.bytesize
        end
        offset=body.bytesize
        raw=name.b
        body << [0x04034b50,20,0x0800,method,time,date,crc,data.bytesize,bytes.bytesize,raw.bytesize,0].pack('VvvvvvVVVvv') << raw << data
        central << [0x02014b50,20,20,0x0800,method,time,date,crc,data.bytesize,bytes.bytesize,raw.bytesize,0,0,0,0,0,offset].pack('VvvvvvvVVVvvvvvVV') << raw
        raise ExportError,'El paquete supera el tamaño máximo permitido.' if body.bytesize+central.bytesize+22>max_bytes
      end
      body+central+[0x06054b50,0,0,entries.length,entries.length,central.bytesize,body.bytesize,0].pack('VvvvvVVv')
    end
    def decode_name(raw,flags)
      value=raw.dup.force_encoding(Encoding::UTF_8)
      value=raw.encode(Encoding::UTF_8,Encoding.find('IBM437')) unless value.valid_encoding? || (flags&0x0800)!=0
      reject! unless value.valid_encoding? && value.bytesize<=1024 && !value.empty?
      reject! if value.match?(/[\x00-\x1f\x7f\\]/) || value.start_with?('/') || value.match?(/\A[A-Za-z]:/) || value.split('/').any? { |part| part=='.' || part=='..' || part.empty? }
      value
    end
    def payload_offset(entry)
      at=entry.offset;reject! unless at+30<=@central && @bytes.byteslice(at,4)=="PK\x03\x04".b
      needed,flags,method,_time,_date,crc,csize,usize,nlen,xlen=@bytes.byteslice(at+4,26).unpack('vvvvvVVVvv')
      reject! unless needed<=45 && flags==entry.flags && method==entry.method
      reject! unless (flags&8)!=0 || [crc,csize,usize]==[entry.crc,entry.compressed,entry.size]
      payload=at+30+nlen+xlen
      reject! unless payload+entry.compressed<=@central && @bytes.byteslice(at+30,nlen)==entry.raw_name
      payload
    end
    def read(entry)
      entry=@entries.find { |candidate| candidate.name==entry } if entry.is_a?(String)
      reject! unless entry && @entries.include?(entry)
      input=@bytes.byteslice(payload_offset(entry),entry.compressed)
      output=''.b
      if entry.method.zero?
        output=input
      else
        inflater=Zlib::Inflate.new(-Zlib::MAX_WBITS)
        begin
          position=0
          while position<input.bytesize
            part=input.byteslice(position,16_384);position+=part.bytesize
            inflater.inflate(part) do |chunk|
              reject! if output.bytesize+chunk.bytesize>entry.size || output.bytesize+chunk.bytesize>@max_entry
              output << chunk
            end
          end
          reject! unless inflater.finished? && inflater.total_in==entry.compressed
        ensure
          inflater.close
        end
      end
      reject! unless output.bytesize==entry.size && Zlib.crc32(output)==entry.crc
      output
    rescue Zlib::Error
      reject!
    end
  end
end
