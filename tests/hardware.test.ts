import {describe,expect,it} from 'vitest';
import {parseObra} from '../lib/obra';
import {buildObra} from '../sketchup_offline/ui/obra';
import {cutlistCsv} from '../sketchup_offline/ui/cutlistModel';
import {data,project} from './fixtures/hardwareFixture';
import {activeCatalog,computeHardware,hardwareRole,hingeCount,matchFicha,runnerLength,sourceText,type HardwareCatalogItem} from '../sketchup_offline/ui/hardwareModel';

// Herrajes calculados por nombre (0.8.36). Muebles SINTÉTICOS en tests/fixtures/hardwareFixture.ts.
const item=(id:string,name:string,extra:Partial<HardwareCatalogItem>={}):HardwareCatalogItem=>({id,name,kind:'hardware',sku:id.toUpperCase(),...extra});

describe('Herrajes: reglas',()=>{
  it('reconoce puertas y frentes de cajón por el nombre, con obra y módulo delante, sin confundir otras piezas de cajón',()=>{
    for(const name of ['Puerta','AB M01 Puerta','Puertas','Puerta izq'])expect(hardwareRole(name)).toBe('door');
    for(const name of ['Fte','AB M01 Fte','Frente cajón','Frente cajon','Del Caj'])expect(hardwareRole(name)).toBe('drawer');
    for(const name of ['Lateral cajón','Fondo cajón','Lateral','Puertita','Fteado','Frente'])expect(hardwareRole(name)).toBeNull();
  });
  it('cuenta bisagras por el alto de la puerta según la tabla del taller',()=>{
    expect([400,900,900.4,901,1500,1501,2000,2001,2600].map(hingeCount)).toEqual([2,2,2,3,3,4,4,5,5]);
  });
  it('elige el largo de corredera más grande que entra en la profundidad menos 50 mm',()=>{
    expect([563,550,549,500,449,400,350,349].map(runnerLength)).toEqual([500,500,450,450,350,350,300,null]);
  });
});

describe('Herrajes: cálculo sobre el listado',()=>{
  it('puertas: bisagras por alto medido en el mueble y un tirador por puerta; avisa la rebatible',()=>{
    const result=computeHardware({pieces:data().pieces.filter(p=>p.furnitureId==='202')},project());
    expect(result.lines.map(l=>[l.name,l.quantity,l.unit])).toEqual([['Bisagra cazoleta 35 mm',7,'u'],['Tirador',2,'u']]);
    expect(result.lines[0].sources.map(sourceText)).toEqual(['Puerta: 5 c/u','Puerta: 2 c/u']);
    expect(result.notes).toEqual(['Puerta (Placard) es más ancha que alta: si es rebatible, las bisagras van arriba; revisá la cantidad.']);
  });
  it('cajones: un par de correderas por frente según la profundidad y la «Del Caj» no se cuenta si hay «Fte»',()=>{
    const result=computeHardware({pieces:data().pieces.filter(p=>p.furnitureId==='101')},project());
    expect(result.lines.map(l=>[l.name,l.quantity,l.unit,l.lengthMm])).toEqual([['Par de correderas 500 mm',2,'par',500],['Tirador',2,'u',null]]);
    expect(result.lines[0].sources.map(sourceText)).toEqual(['AB M01 Fte ×2']);
    expect(result.notes).toEqual([]);
  });
  it('sin «Fte», la «Del Caj» es el frente del cajón',()=>{
    const pieces=data().pieces.filter(p=>p.id==='101/5');
    expect(computeHardware({pieces},project()).lines.map(l=>[l.name,l.quantity])).toEqual([['Par de correderas 500 mm',1],['Tirador',1]]);
  });
  it('sin los muebles generados: bisagras por el lado más largo y corredera sin largo, con aviso',()=>{
    const result=computeHardware({pieces:data().pieces.filter(p=>['202/3','101/3'].includes(p.id))});
    expect(result.lines.map(l=>[l.name,l.quantity,l.warning])).toEqual([['Bisagra cazoleta 35 mm',2,'Sin ficha en la biblioteca'],['Par de correderas (largo a definir)',2,'Sin largo de corredera'],['Tirador',3,'Sin ficha en la biblioteca']]);
    expect(result.notes).toHaveLength(2);
  });
  it('avisa cuando el mueble no tiene profundidad para la corredera más corta',()=>{
    const shallow=project().map(f=>f.id!=='101'?f:{...f,pieces:f.pieces.filter(p=>p.id==='101/3')});
    const result=computeHardware({pieces:data().pieces.filter(p=>p.id==='101/3')},shallow);
    expect(result.lines.map(l=>l.name)).toEqual(['Tirador']);
    expect(result.notes).toEqual(['M01 Bajo mesada: 18 mm de profundidad no alcanzan para una corredera de 300 mm.']);
  });
});

describe('Herrajes: fichas de la biblioteca',()=>{
  const catalog=[item('bis','Bisagra cazoleta codo 0'),item('c450','Corredera telescópica 450'),item('c500','Corredera telescópica',{lengthMm:500}),
    item('t1','Tirador barral 128'),item('t2','Manija aluminio',{favorite:true}),item('mel','Melamina bisagra',{kind:'sheet'})];
  it('empareja por palabra y largo; con varias usa la favorita; ignora fichas que no son herraje',()=>{
    expect(matchFicha(catalog,'hinge',null)).toEqual({ficha:{id:'bis',name:'Bisagra cazoleta codo 0',sku:'BIS'},warning:null});
    expect(matchFicha(catalog,'runner',450).ficha?.id).toBe('c450');
    expect(matchFicha(catalog,'runner',500).ficha?.id).toBe('c500');
    expect(matchFicha(catalog,'runner',350)).toEqual({ficha:null,warning:'Sin ficha en la biblioteca'});
    expect(matchFicha(catalog,'handle',null).ficha?.id).toBe('t2');
    expect(matchFicha(catalog.map(i=>({...i,favorite:false})),'handle',null)).toEqual({ficha:null,warning:'2 fichas posibles: marcá una como favorita'});
  });
  it('una ficha archivada no nombra herrajes ni crea ambigüedad con la activa',()=>{
    const withArchived=[...catalog,item('bis-vieja','Bisagra cazoleta vieja')];
    expect(matchFicha(withArchived,'hinge',null).ficha).toBeNull();
    expect(matchFicha(activeCatalog(withArchived,['bis-vieja']),'hinge',null).ficha?.id).toBe('bis');
    expect(activeCatalog(withArchived).length).toBe(withArchived.length);
  });
  it('el CSV suma una fila por herraje de cada pieza, con la ficha y el aviso',()=>{
    const {lines}=computeHardware(data(),project(),catalog);
    const rows=cutlistCsv([],[],lines).trim().split('\r\n').slice(1);
    expect(rows).toEqual([
      'Herraje;Bisagra cazoleta codo 0;;A;Bisagra cazoleta 35 mm – Puerta;Placard;;5;;;;No;',
      'Herraje;Bisagra cazoleta codo 0;;B;Bisagra cazoleta 35 mm – Puerta;Placard;;2;;;;No;',
      'Herraje;Corredera telescópica;;A;Par de correderas 500 mm – AB M01 Fte;M01 Bajo mesada;M01·C, D;2;500;;;No;',
      'Herraje;Manija aluminio;;A;Tirador – AB M01 Fte;M01 Bajo mesada;M01·C, D;2;;;;No;',
      'Herraje;Manija aluminio;;B;Tirador – Puerta;Placard;;1;;;;No;',
      'Herraje;Manija aluminio;;C;Tirador – Puerta;Placard;;1;;;;No;']);
  });
  it('el paquete de obra lleva los herrajes de cada mueble con las piezas que los llevan',()=>{
    const obra=buildObra({version:'0.8.36',exportedAt:'2026-11-25T12:00:00.000Z',data:data(),furniture:project(),catalog});
    expect(obra.muebles[0].herrajes).toEqual([
      {nombre:'Corredera telescópica',sku:'C500',cantidad:2,unidad:'par',largo:500,piezas:['101/3','101/4']},
      {nombre:'Manija aluminio',sku:'T2',cantidad:2,unidad:'u',largo:null,piezas:['101/3','101/4']}]);
    expect(obra.muebles[1].herrajes?.map(h=>[h.nombre,h.cantidad])).toEqual([['Bisagra cazoleta codo 0',7],['Manija aluminio',2]]);
    const foreign=structuredClone(obra);foreign.muebles[0].herrajes![0].piezas=['202/2'];
    expect(()=>parseObra(foreign)).toThrow(/ajena/);
    const old=structuredClone(obra);for(const m of old.muebles)delete m.herrajes;
    expect(()=>parseObra(old)).not.toThrow();
  });
});
