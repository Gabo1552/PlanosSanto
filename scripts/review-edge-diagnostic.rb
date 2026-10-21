# frozen_string_literal: true
# Private offline QA of an operator's diagnostic; never opens SKP or chooses
# a manufacturing orientation. Enumerates all 12 U/V/face combinations.
require 'digest'
require_relative '../sketchup/planos_santo/exporter'
require_relative '../sketchup_offline/ocl_reader'
input,target=ARGV
abort 'Uso: ruby scripts/review-edge-diagnostic.rb diagnostico.json informe-nuevo.json' unless input && target
abort 'Diagnóstico demasiado grande.' if File.size(input)>30*1024*1024
source=JSON.parse(File.read(input));review=PlanosSanto::OclReader.from_diagnostic(source)
definitions=source['definitions'].to_h { |definition| [definition['id'],definition] };exporter=PlanosSanto::Exporter.new(nil);meshes={};statuses=Hash.new(0)
rows=review['pieces'].map do |piece|
 begin
  mesh=meshes[piece['definition_id']] ||= begin
   vertices=[];triangles=[];indices={}
   definitions.fetch(piece['definition_id'])['geometry']['faces'].each do |face|
    face['triangles'].each do |triangle|
     points=triangle.map { |i| face['vertices_mm'].fetch(i) };a,b,c=points
     ab=b.zip(a).map { |x,y| x-y };ac=c.zip(a).map { |x,y| x-y };normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
     points.reverse! if normal.zip(face['normal_local']).sum { |x,y| x*y }<0
     triangles << points.map { |point| key=point.map { |n| n.round(8) };indices[key] ||= begin;vertices << point;vertices.size-1;end }
    end
   end
   {'vertices'=>vertices,'triangles'=>triangles}
  end
  shape=exporter.bounds_and_shape(mesh,piece['world_transform']);geometry={'bounds'=>shape['localBounds'],'rectangular'=>shape['rectangular'],'mirrored'=>piece['orientation']['mirrored']}
  cases=[0,1,2].permutation(2).flat_map do |axes|
   [-1,1].map do |face|
    row={'id'=>piece['path'].join('/'),'axes'=>axes,'frontSign'=>face,'flipX'=>false,'flipY'=>false}
    observation=PlanosSanto::OclReader.projected_edges(review,row,geometry)
    values=observation['sides'].map { |side| statuses[side['status']]+=1;side.slice('side','status','materialIds','faceIds') }
    {'axes'=>axes,'face'=>face,'sides'=>values}
   end
  end
  {'path'=>piece['path'],'rectangular_qa'=>geometry['rectangular'],'cases'=>cases,'confirmed'=>false}
 rescue PlanosSanto::ExportError => error
  {'path'=>piece['path'],'blocked'=>error.message,'confirmed'=>false}
 end
end
report={'source'=>'Reproducción QA del diagnóstico previamente aportado, no importador SKP ni orientación de fabricación','source_sha256'=>Digest::SHA256.file(input).hexdigest,'version'=>PlanosSanto::Release::VERSION,'sketchup_executed_here'=>false,'production_ready'=>false,'manual_orientation_confirmed'=>false,'pieces'=>rows,'side_statuses'=>statuses}
PlanosSanto::P1Diagnostics.write(report,target)
puts JSON.generate({'pieces'=>rows.size,'rectangular_qa'=>rows.count { |r| r['rectangular_qa'] },'side_statuses'=>statuses,'manufacturing_axes_chosen'=>false,'sketchup_executed_here'=>false})
