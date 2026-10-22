import {describe,it,expect} from 'vitest';
import {cleanName,compositeCode,carryEdits,carryNotice,nameDiff,nameChangeKind} from '../sketchup_offline/ui/names';
describe('Nombres: utilidades puras, sin bridge ni escritura',()=>{
  it('normaliza espacios y Unicode',()=>{
    expect(cleanName('  Puerta   derecha  ')).toBe('Puerta derecha');
    expect(cleanName('Cajón')).toBe('Cajón');
  });
  it('arma el código compuesto módulo·pieza solo para la vista',()=>{
    expect(compositeCode('M03','P07')).toBe('M03·P07');
    expect(compositeCode(' m12 ','P101')).toBe('M12·P101');
    expect(compositeCode('','P07')).toBe('P07');
    expect(compositeCode(undefined,'P07')).toBe('P07');
    expect(compositeCode('M01','Grupo')).toBe('Grupo M01');
  });
  it('conserva ediciones manuales al recalcular y descarta solo las aceptaciones automáticas',()=>{
    const before=[{ids:['a'],base:'Lateral'},{ids:['b'],base:'Base'},{ids:['c'],base:'Techo'}];
    const result=carryEdits({a:'Lateral',b:'Base revisada',c:'Techo corto'},before,[{ids:['a']},{ids:['b']}]);
    expect(result).toEqual({chosen:{b:'Base revisada'},kept:1,lost:1,auto:1});
    expect(carryNotice(result)).toBe('Se conservó 1 nombre editado; las propuestas automáticas se recalcularon. 1 edición quedó fuera de la lista y se descartó.');
    expect(carryNotice({kept:3,lost:0,auto:2})).toBe('Se conservaron 3 nombres editados; las propuestas automáticas se recalcularon.');
    expect(carryNotice({kept:0,lost:0,auto:2})).toBe('Las propuestas automáticas se recalcularon; volvé a seleccionarlas.');
    expect(carryNotice({kept:0,lost:0,auto:0})).toBe('');
  });
});
describe('Diferencia entre nombre actual y nuevo',()=>{
  it('separa prefijo, tramo cambiado y sufijo por puntos de código',()=>{
    expect(nameDiff('OB1 M01 Lateral','OB2 M01 Lateral')).toEqual({prefix:'OB',changed:'2',suffix:' M01 Lateral',removed:'1',same:false});
    expect(nameDiff('M01 Lateral','M01 Lateral izquierdo')).toEqual({prefix:'M01 Lateral',changed:' izquierdo',suffix:'',removed:'',same:false});
    expect(nameDiff('Ñandú 😀 A','Ñandú 😀 B')).toEqual({prefix:'Ñandú 😀 ',changed:'B',suffix:'',removed:'A',same:false});
    expect(nameDiff('','Base')).toEqual({prefix:'',changed:'Base',suffix:'',removed:'',same:false});
  });
  it('no superpone prefijo y sufijo en repeticiones y detecta cambios solo de espacios',()=>{
    const diff=nameDiff('aa','aaa');expect(diff.prefix+diff.changed+diff.suffix).toBe('aaa');expect(diff.changed).toBe('a');
    expect(nameDiff('  Puerta   derecha ','Puerta derecha').same).toBe(true);
  });
  it('clasifica cambios de prefijo, de nombre base e iguales',()=>{
    expect(nameChangeKind('OB1 M01 Lateral','OB2 M01 Lateral')).toBe('prefix');
    expect(nameChangeKind('OB1 M01 Lateral','OB1 M01 Base')).toBe('base');
    expect(nameChangeKind('Lateral','Central')).toBe('base');
    expect(nameChangeKind('Lateral','M1 Lateral')).toBe('prefix');
    expect(nameChangeKind('M1 Lateral','Lateral')).toBe('prefix');
    expect(nameChangeKind('','OB1 M01 Base')).toBe('base');
    expect(nameChangeKind('Base  ','Base')).toBe('same');
  });
});
