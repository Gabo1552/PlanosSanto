import {describe,expect,it} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {hingeHeights,planFurniture} from '../sketchup_offline/ui/hardwarePlacement';
import {data,project} from './fixtures/hardwareFixture';

// Herrajes en 3D (0.8.37): ubicación de bisagras codo 0 y correderas sobre los muebles SINTÉTICOS de
// tests/fixtures/hardwareFixture.ts (frente hacia -Y del mundo, Z arriba: el ancho crece hacia +X).
const furniture=(id:string)=>project().find(f=>f.id===id)!;
const rows=(id:string)=>data().pieces.filter(p=>p.furnitureId===id);
const origin=(m:number[])=>[m[12],m[13],m[14]];
const axes=(m:number[])=>[m.slice(0,3),m.slice(4,7),m.slice(8,11)].map(v=>v.map(n=>n+0));
const world=(m:number[],local:number[])=>new Vector3(...local).applyMatrix4(new Matrix4().fromArray(m)).toArray().map(n=>Math.round(n*100)/100+0);

describe('Herrajes en 3D: bisagras codo 0',()=>{
  it('reparte las bisagras a 100 mm de las puntas y parejo en el medio',()=>{
    expect(hingeHeights(0,2100,5)).toEqual([100,575,1050,1525,2000]);
    expect(hingeHeights(2150,2550,2)).toEqual([2250,2450]);
    // Puerta baja: el margen se achica a un cuarto del alto.
    expect(hingeHeights(0,200,2)).toEqual([50,150]);
  });
  it('sugiere el lado del costado más cercano y ubica cada bisagra en el canto, en la cara interior de la puerta',()=>{
    const plan=planFurniture(furniture('202'),rows('202'));
    expect(plan.doors.map(d=>[d.pieceId,d.suggested,d.side,d.hinges])).toEqual([['202/2','left','left',5],['202/3','right','right',2]]);
    const tall=plan.placements.filter(p=>p.pieceId==='202/2');
    expect(tall.map(p=>[p.kind,p.side,origin(p.matrix)])).toEqual([100,575,1050,1525,2000].map(z=>['hinge','left',[3018,0,z]]));
    // Izquierda: x hacia adentro de la puerta (+X), y hacia el interior del mueble (+Y), z arriba.
    expect(axes(tall[0].matrix)).toEqual([[1,0,0],[0,1,0],[0,0,1]]);
    const flap=plan.placements.filter(p=>p.pieceId==='202/3');
    expect(flap.map(p=>origin(p.matrix))).toEqual([[3918,0,2250],[3918,0,2450]]);
    // Derecha: x hacia adentro de la puerta (-X), mismo interior; z abajo para que los ejes sigan siendo derechos.
    expect(axes(flap[0].matrix)).toEqual([[-1,0,0],[0,1,0],[0,0,-1]]);
    // La cazoleta (22 mm del canto) cae sobre la puerta, del lado de adentro.
    expect(world(tall[0].matrix,[22,-6,0])).toEqual([3040,-6,100]);
    expect(world(flap[0].matrix,[22,-6,0])).toEqual([3896,-6,2250]);
  });
  it('respeta el lado elegido para cada puerta',()=>{
    const plan=planFurniture(furniture('202'),rows('202'),{'202/2':'right'});
    expect(plan.doors[0]).toMatchObject({pieceId:'202/2',suggested:'left',side:'right'});
    expect(origin(plan.placements[0].matrix)).toEqual([3518,0,100]);
  });
});

describe('Herrajes en 3D: correderas',()=>{
  it('pone un par por frente entre las caras interiores de los laterales, detrás del frente y sobre su borde inferior',()=>{
    const plan=planFurniture(furniture('101'),rows('101'));
    expect(plan.notes).toEqual([]);
    expect(plan.placements.map(p=>[p.pieceId,p.kind,p.side,p.lengthMm,origin(p.matrix)])).toEqual([
      ['101/3','runner','left',500,[24.25,0,30]],['101/3','runner','right',500,[575.75,0,30]],
      ['101/4','runner','left',500,[24.25,0,350]],['101/4','runner','right',500,[575.75,0,350]]]);
    // x hacia el fondo (+Y), z arriba; la corredera de 500 termina dentro del mueble de 560.
    expect(axes(plan.placements[0].matrix)).toEqual([[0,1,0],[-1,0,0],[0,0,1]]);
    expect(world(plan.placements[0].matrix,[500,0,35])).toEqual([24.25,500,65]);
  });
  it('sin laterales a los costados no coloca correderas y avisa',()=>{
    // Solo el lateral izquierdo: del lado derecho no hay dónde atornillar la corredera.
    const f=furniture('101'),alone={...f,pieces:f.pieces.filter(p=>p.id!=='101/2')};
    const plan=planFurniture(alone,rows('101'));
    expect(plan.placements).toEqual([]);
    expect(plan.notes).toEqual(['AB M01 Fte (M01 Bajo mesada): no encontré los laterales a los costados del cajón; sus correderas no se colocan.']);
  });
  it('un lateral de la caja del cajón no se toma como lateral del cuerpo',()=>{
    const f=furniture('101'),box=f.pieces.find(p=>p.id==='101/1')!;
    // «Lateral cajón» de 15 mm junto al lateral izquierdo, de 200 de alto, detrás del frente.
    const side={...box,id:'101/9',transform:new Matrix4().makeTranslation(30,10,20).toArray()};
    const withBox={...f,pieces:[...f.pieces,side]};
    const list=[...rows('101'),{...rows('101')[0],id:'101/9',ids:['101/9'],name:'Lateral cajón',quantity:1}];
    expect(origin(planFurniture(withBox,list).placements[0].matrix)).toEqual([24.25,0,30]);
  });
});
