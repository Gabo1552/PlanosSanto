import {describe,it,expect} from 'vitest';
import {cleanName,suggestPrefix,proposals,type NamePreview} from '../sketchup_offline/ui/names';
const preview:NamePreview={token:'review',rootId:'1',currentName:'Bajo Mesada',name:'Bajo Mesada',prefix:'BM',pieceCount:2,blocked:false,warnings:[],blockers:[],rows:[{id:'1/11',depth:0,role:'piece',currentName:'Lateral - Blanco',displayName:'Lateral - Blanco',base:'Lateral - Blanco'},{id:'1/13',depth:0,role:'container',currentName:'Interior',displayName:'Interior',base:null},{id:'1/13/12',depth:1,role:'piece',currentName:'Base',displayName:'Base',base:'Base'}]};
describe('Vista previa de nombres, sin bridge ni escritura',()=>{
  it('propone abreviaturas Unicode, códigos expresos y palabras significativas',()=>{
    for(const [name,expected] of [['Bajo Mesada','BM'],['M08 - Alacena Superior','M08'],['m1 Mueble','M1'],['Módulo Ñandú','MÑ'],['Bajo de la Mesada','BM']])expect(suggestPrefix(name)).toBe(expected);
    expect(cleanName('  Puerta   derecha  ')).toBe('Puerta derecha');
  });
  it('actualiza todas las piezas, sin prefijar contenedores ni truncar guiones ajenos',()=>{
    const original=JSON.stringify(preview),result=proposals(preview,'Alacena Superior','AS',{'1/11':'Lateral - Blanco','1/13/12':'Puerta derecha'});
    expect(result.rows.map(r=>r.proposed)).toEqual(['AS - Lateral - Blanco','Interior','AS - Puerta derecha']);
    expect(result.changes).toBe(3);expect(result.errors).toEqual([]);expect(JSON.stringify(preview)).toBe(original);
  });
  it('rechaza nombres vacíos, controles y resultados demasiado extensos',()=>{
    expect(proposals(preview,'','',{}).errors.length).toBeGreaterThan(0);
    expect(proposals(preview,'Mueble','BM',{'1/11':'X'.repeat(80),'1/13/12':'Base'}).errors.join()).toContain('80');
    expect(proposals(preview,'Mueble\u0000','BM',{'1/11':'Lateral','1/13/12':'Base'}).errors.join()).toContain('control');
  });
});
