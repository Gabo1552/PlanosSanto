import {describe,expect,it} from 'vitest';
import {computeHardware,shapeSuggestions} from '../sketchup_offline/ui/hardwareModel';
import {planFurniture} from '../sketchup_offline/ui/hardwarePlacement';
import {buildObra} from '../sketchup_offline/ui/obra';
import {data,project} from './fixtures/hardwareFixture';

// 0.8.39: herrajes por la forma. Lo elegido por pieza en Piezas (guardado en el modelo) manda sobre el nombre; las
// sugerencias usan la clasificación de Sugerencias de nombres con el frente confirmado. Muebles SINTÉTICOS.
const unnamed=()=>data().pieces.map(p=>p.id==='202/2'?{...p,name:'Tablero 2'}:p.id==='202/3'?{...p,name:'Tablero 3'}:p);

describe('Herrajes elegidos por pieza',()=>{
  it('una pieza elegida como puerta suma bisagras aunque su nombre no lo diga; «ninguno» saca una puerta por nombre',()=>{
    const pieces=unnamed().filter(p=>p.furnitureId==='202');
    expect(computeHardware({pieces},project()).lines).toEqual([]);
    const chosen=computeHardware({pieces},project(),[],{'202/2':'door','202/1':'none'});
    expect(chosen.lines.map(l=>[l.name,l.quantity])).toEqual([['Bisagra cazoleta 35 mm',5],['Tirador',1]]);
    expect(chosen.lines[0].sources.map(s=>[s.piece.name,s.ids])).toEqual([['Tablero 2',['202/2']]]);
    const named=data().pieces.filter(p=>p.furnitureId==='202');
    expect(computeHardware({pieces:named},project(),[],{'202/3':'none'}).lines.map(l=>[l.name,l.quantity])).toEqual([['Bisagra cazoleta 35 mm',5],['Tirador',1]]);
  });
  it('se elige por pieza física: en una fila de dos frentes, uno puede no llevar herrajes; «Del Caj» elegida cuenta aunque haya «Fte»',()=>{
    const pieces=data().pieces.filter(p=>p.furnitureId==='101');
    const result=computeHardware({pieces},project(),[],{'101/4':'none','101/5':'drawer'});
    expect(result.lines.map(l=>[l.name,l.quantity])).toEqual([['Par de correderas 500 mm',2],['Tirador',2]]);
    expect(result.lines[0].sources.map(s=>s.ids)).toEqual([['101/3'],['101/5']]);
  });
  it('los herrajes en 3D y el paquete de obra siguen lo elegido',()=>{
    const f=project().find(x=>x.id==='202')!,rows=unnamed().filter(p=>p.furnitureId==='202');
    const plan=planFurniture(f,rows,{},{'202/2':'door'});
    expect(plan.doors.map(d=>[d.pieceId,d.name,d.hinges])).toEqual([['202/2','Tablero 2',5]]);
    expect(plan.placements.filter(p=>p.kind==='hinge')).toHaveLength(5);
    const obra=buildObra({version:'0.8.39',exportedAt:'2026-11-27T12:00:00.000Z',data:{...data(),pieces:unnamed()},furniture:project(),roles:{'202/2':'door'}});
    expect(obra.muebles[1].herrajes?.map(h=>[h.nombre,h.cantidad,h.piezas])).toEqual([['Bisagra cazoleta 35 mm',5,['202/2']],['Tirador',1,['202/2']]]);
  });
});

describe('Sugerencias por la forma',()=>{
  it('sugiere las piezas paralelas al frente que no se llaman Puerta ni Fte, con la función que indica su forma',()=>{
    const {suggestions,unconfirmed}=shapeSuggestions(project(),unnamed());
    expect(unconfirmed).toEqual([]);
    expect(suggestions.map(s=>[s.piece.name,s.ids,s.role])).toEqual([['Tablero 2',['202/2'],'door'],['Tablero 3',['202/3'],'drawer']]);
    expect(suggestions[0].reason).toBe('Panel paralelo al frente; puerta, frente de cajón o revestimiento son alternativas.');
  });
  it('no sugiere lo que ya tiene nombre de herraje ni lo ya elegido (también «no lleva herrajes»)',()=>{
    expect(shapeSuggestions(project(),data().pieces).suggestions).toEqual([]);
    expect(shapeSuggestions(project(),unnamed(),{'202/2':'none','202/3':'door'}).suggestions).toEqual([]);
  });
  it('sin frente confirmado no adivina: avisa qué mueble falta confirmar',()=>{
    const furniture=project().map(f=>f.id==='202'?{...f,naming:{...f.naming!,reference:{...f.naming!.reference!,confirmed:false}}}:f);
    const {suggestions,unconfirmed}=shapeSuggestions(furniture,unnamed());
    expect(suggestions).toEqual([]);
    expect(unconfirmed).toEqual(['Placard']);
  });
});
