// Caracterización de módulos de lib/ que también compila la extensión (sketchup_offline/ui).
// Fijan el comportamiento actual; si fallan, el cambio afecta a la web y al RBZ a la vez.
import { describe,expect,it } from 'vitest';
import { orderProjection,type PreviewGeometry } from '../lib/orderPreview';
import { sheetEntries } from '../lib/sheet';
import { createDemo } from '../lib/demo';

const plate:PreviewGeometry={lengths:[600,400,18],bounds:{min:[0,0,0],max:[600,400,18]},scales:[1,1,1],
  vertices:[[0,0,18],[600,0,18],[600,400,18],[0,400,18],[0,0,0]],
  triangles:[[0,1,2],[0,2,3],[0,2,1]]};

describe('orderProjection',()=>{
  it('proyecta sobre los ejes pedidos, desde el borde superior y sin espejar',()=>{
    const r=orderProjection(plate,{axes:[0,1],flipX:false,flipY:false,frontSign:1});
    expect(r).toMatchObject({width:600,height:400,effectiveFlipX:false});
    expect(r.points.slice(0,4)).toEqual([[0,400],[600,400],[600,0],[0,0]]);
  });
  it('conserva solo los triángulos que miran al frente elegido',()=>{
    expect(orderProjection(plate,{axes:[0,1],flipX:false,flipY:false,frontSign:1}).triangles).toEqual([[0,1,2],[0,2,3]]);
    expect(orderProjection(plate,{axes:[0,1],flipX:false,flipY:false,frontSign:-1}).triangles).toEqual([[0,2,1]]);
  });
  it('mirar desde atrás, invertir la paridad de ejes o una instancia espejada invierte X',()=>{
    expect(orderProjection(plate,{axes:[0,1],flipX:false,flipY:false,frontSign:-1}).effectiveFlipX).toBe(true);
    expect(orderProjection(plate,{axes:[1,0],flipX:false,flipY:false,frontSign:1}).effectiveFlipX).toBe(true);
    expect(orderProjection({...plate,mirrored:true},{axes:[0,1],flipX:false,flipY:false,frontSign:1}).effectiveFlipX).toBe(true);
    expect(orderProjection({...plate,mirrored:true},{axes:[0,1],flipX:true,flipY:false,frontSign:1}).effectiveFlipX).toBe(false);
  });
  it('aplica la escala por eje y flipY mide desde el borde inferior',()=>{
    const r=orderProjection({...plate,scales:[2,0.5,1]},{axes:[0,1],flipX:false,flipY:true,frontSign:null});
    expect(r.points[2]).toEqual([1200,200]);expect(r.points[0]).toEqual([0,0]);
  });
});

describe('sheetEntries',()=>{
  it('sin notas ni advertencias deja una sola leyenda de escala',()=>{
    const f=createDemo().furniture[0];f.notes=[];f.pieces.forEach(p=>{p.warnings=[];});
    expect(sheetEntries(f)).toEqual(['Mismos códigos en ambas vistas. Cotas en la delantera; espesor en la tabla. Despiece ilustrativo: no medir a escala.']);
  });
  it('numera notas con el código de su pieza y agrupa advertencias repetidas',()=>{
    const f=createDemo().furniture[0];f.pieces.forEach(p=>{p.warnings=[];});
    const [a,b]=f.pieces;
    f.notes=[{id:'n1',pieceId:a.id,anchor:[0,0,0],position:[0,0],text:'Encolar'},{id:'n2',pieceId:'inexistente',anchor:[0,0,0],position:[0,0],text:'Sin pieza'}];
    a.warnings=['Caja envolvente'];b.warnings=['Caja envolvente'];
    expect(sheetEntries(f)).toEqual([`1 · ${a.code} · Encolar`,'2 · ? · Sin pieza',`${a.code}, ${b.code}: Caja envolvente`]);
  });
});
