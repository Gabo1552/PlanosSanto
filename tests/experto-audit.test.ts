import {describe,it,expect} from 'vitest';
import {auditExpertoCase} from '../scripts/audit-experto-case';
const fixture=()=>({placa:{base:2750,altura:1830,espesor:18,veta:true},cortes:[{id:0,cantidad:3,base:1500,altura:1500,descripcion:'Panel QA',rota:false,tapacantos:12}]});
const pdf='1 de 2750 x 1830\nTotal Placas = 3\nAprovechamiento: 44.71 %\nCortados: 6.8 m²\nDesperdicio de la Sierra 4.4 mm\nRefilados de la placa 10 mm\nDesplazamientos de la sierra = 4 metros = 37.3464 m\n(1) 3 de 1500 x 1500 Panel QA\n';
describe('Auditoría local Experto, datos sintéticos',()=>{
 it('confirma entradas y contabiliza cantidades, área y margen sin publicar nombres',()=>{const result=auditExpertoCase(fixture(),pdf);expect(result).toMatchObject({identicalCuts:true,comparable:true,boardCountMatches:true,pieces:3,local:{boards:3,edgeNetMetres:9,edgeWithWasteMetres:10.35,edgeBuyMetres:11}});expect(JSON.stringify(result)).not.toContain('Panel QA');});
 it('no convierte una diferencia real del proveedor en aprobación',()=>{expect(auditExpertoCase(fixture(),pdf.replace('Total Placas = 3','Total Placas = 2'))).toMatchObject({comparable:true,boardCountMatches:false});});
 it('detecta piezas distintas aunque el total de placas coincida',()=>{expect(auditExpertoCase(fixture(),pdf.replace('(1) 3 de','(1) 2 de'))).toMatchObject({identicalCuts:false,comparable:false});});
 it('no presupone parámetros ausentes ni acepta un formato distinto',()=>{expect(auditExpertoCase(fixture(),pdf.replace('4.4 mm','3 mm')).comparable).toBe(false);expect(auditExpertoCase(fixture(),'').boardCountMatches).toBeNull();expect(auditExpertoCase(fixture(),pdf.replace('2750 x 1830','2600 x 1830')).comparable).toBe(false);});
 it('respeta veta aunque un permiso individual esté encendido',()=>{const d=fixture();d.cortes[0].rota=true;expect(auditExpertoCase(d,pdf).rotatable).toBe(0);d.placa.veta=false;expect(auditExpertoCase(d,pdf).rotatable).toBe(3);});
 it('rechaza cantidades no enteras y códigos de canto no conocidos',()=>{const d=fixture();d.cortes[0].cantidad=1.2;expect(()=>auditExpertoCase(d,pdf)).toThrow();d.cortes[0].cantidad=3;d.cortes[0].tapacantos=16;expect(()=>auditExpertoCase(d,pdf)).toThrow();});
});

// El proveedor muestra un decimal, mientras la compra entera es una decisión separada.
it('separa estimación de canto del proveedor y redondeo de compra',()=>{
 const d=fixture();d.cortes=[{id:0,cantidad:1,base:1902.15,altura:500,descripcion:'Panel QA',rota:false,tapacantos:4}];
 const result=auditExpertoCase(d,'Tapacanto 1\nCANTO QA = 2.2 m\n');
 expect(result.local).toMatchObject({edgeDisplayMetres:2.2,edgeBuyMetres:3});expect(result.edgeDisplayMatches).toBe(true);
});
