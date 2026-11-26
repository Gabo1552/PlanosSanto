# frozen_string_literal: true
# Nombre de la definición (0.8.38): al sincronizar nombres, un componente lleva el nombre también en el campo
# «Definición» de Info. de entidad (el que lista OpenCutList), solo cuando es seguro. Dobles fake_api + names_double:
# NO es SketchUp.
require 'minitest/autorun'
require_relative 'names_double'
require_relative '../../sketchup/planos_santo/exporter'
require_relative '../session'
require_relative '../names'

class DefinitionNamesTest < Minitest::Test
  NM=PlanosSanto::NameManager
  def definition(name,guid);Sketchup::Definition.new(name,guid,Fixture.board_definition.entities);end
  def setup
    @lateral=definition('Tablero 1','def-lateral');@tapa=definition('Tablero 2','def-tapa');@fondo=definition('Tablero 3','def-fondo')
    @ajena=definition('HS M2 Fondo','def-ajena')
    @pieces={
      '11'=>Sketchup::ComponentInstance.new(11,'Lateral',@lateral),
      '12'=>Sketchup::ComponentInstance.new(12,'Reg tapa',@tapa),
      '13'=>Sketchup::ComponentInstance.new(13,'Reg tapa',@tapa,Geom::Transformation.translation(30,0,0)),
      '14'=>Sketchup::Group.new(14,'Estante',definition('Grupo#1','def-estante')),
      '15'=>Sketchup::ComponentInstance.new(15,'Fondo',@fondo)
    }
    root=Sketchup::Group.new(1,'M2 Bajo',Sketchup::Definition.new('Bajo','def-bajo',@pieces.values))
    other=Sketchup::Group.new(2,'Otro',Sketchup::Definition.new('Otro','def-otro',[Sketchup::ComponentInstance.new(21,'Fondo viejo',@ajena)]))
    @model=NamingModelDouble.new(Sketchup::Model.new([root,other],'definition-names','Definiciones sintéticas',''))
    @manager=NM.new(@model)
  end
  def edit(bases)
    {'id'=>'1','naming'=>{'moduleCode'=>'M2','bases'=>bases.map { |id,base| {'id'=>"1/#{id}",'base'=>base} }},
     'pieces'=>bases.each_with_index.map { |(id,base),i| {'id'=>"1/#{id}",'name'=>"HS M2 #{base}",'code'=>"P#{i+1}"} }}
  end
  def save(bases)
    @model.start_operation('Guardar',true);@manager.guide_changes([edit(bases)],'HS').call;@model.commit_operation
  end
  def reasons;@manager.definition_notes.to_h { |row| [row['id'],row['reason']] };end

  def test_a_component_gets_its_name_in_the_definition_field_and_a_group_keeps_its_definition
    save('11'=>'Lateral','12'=>'Reg tapa B','13'=>'Reg tapa B','14'=>'Estante')
    assert_equal 'HS M2 Lateral',@lateral.name
    assert_equal '',@pieces['11'].name,'La instancia queda vacía'
    assert_equal ['',''],[@pieces['12'].name,@pieces['13'].name]
    # Dos copias del mismo componente con el mismo nombre: la definición compartida se nombra una vez.
    assert_equal 'HS M2 Reg tapa B',@tapa.name
    # Un grupo no tiene campo «Definición»: su definición interna no se toca.
    assert_equal 'Grupo#1',@pieces['14'].definition.name;assert_equal 'HS M2 Estante',@pieces['14'].name,'Un grupo se nombra en su campo Nombre'
    assert_empty @manager.skipped;assert_empty @manager.definition_notes
  end

  def test_a_shared_definition_with_different_names_keeps_its_name_and_says_why
    save('12'=>'Reg tapa A','13'=>'Reg tapa B')
    assert_equal 'Tablero 2',@tapa.name
    assert_equal ['HS M2 Reg tapa A','HS M2 Reg tapa B'],[@pieces['12'].name,@pieces['13'].name],'Las instancias sí se nombran'
    assert_equal %w[1/12 1/13],reasons.keys.sort
    assert reasons.values.all? { |text| text.include?('comparten piezas con nombres distintos') }
  end

  def test_a_name_another_definition_already_has_is_not_repeated
    save('15'=>'Fondo')
    assert_equal 'Tablero 3',@fondo.name;assert_equal 'HS M2 Fondo',@ajena.name
    assert_equal 'HS M2 Fondo',@pieces['15'].name,'Sin definición disponible, el nombre queda en la instancia'
    assert_match(/Ya hay otra definición llamada «HS M2 Fondo»/,reasons['1/15']);assert_empty @manager.skipped
  end

  def test_two_definitions_that_would_take_the_same_name_keep_theirs
    save('11'=>'Lateral','15'=>'Lateral')
    assert_equal ['Tablero 1','Tablero 3'],[@lateral.name,@fondo.name]
    assert_equal %w[1/11 1/15],reasons.keys.sort
  end

  def test_a_definition_already_named_is_left_alone_and_undo_restores_the_definition
    save('11'=>'Lateral')
    @model.undo
    assert_equal 'Tablero 1',@lateral.name;assert_equal 'Lateral',@pieces['11'].name
    # Nombrada antes en la instancia (0.8.37) con la definición ya nombrada: el nombre queda solo en la definición.
    @lateral.name='HS M2 Lateral';@pieces['11'].name='HS M2 Lateral'
    save('11'=>'Lateral')
    assert_equal 'HS M2 Lateral',@lateral.name;assert_equal '',@pieces['11'].name;assert_empty @manager.definition_notes;assert_empty @manager.definition_notes
    # Guardar otra vez sin cambios no escribe nada.
    writes=@model.state;save('11'=>'Lateral')
    assert_equal writes[:entities],@model.state[:entities];assert_equal 'HS M2 Lateral',@lateral.name
  end

  def test_a_piece_named_in_the_definition_is_recognized_with_its_base_and_counts_as_named
    save('11'=>'Lateral')
    session=PlanosSanto::NativeSession.new(@model);session.scan
    node=session.generate(['1'])['document']['furniture'][0]['children'].find { |child| child['id']=='1/11' }
    assert_equal 'HS M2 Lateral',node['name']
    assert_equal 'Lateral',node['metadata']['nameBase']
    assert_equal 'HS M2 Lateral',node['metadata']['originalName'],'Cuenta como nombre propio para Sugerencias de nombres'
    # Una definición que no puso la extensión no cuenta como nombre propio de la pieza (como antes).
    node=session.generate(['1'])['document']['furniture'][0]['children'].find { |child| child['id']=='1/15' }
    assert_equal '',node['metadata']['originalName'] if @pieces['15'].name.empty?
  end
end
