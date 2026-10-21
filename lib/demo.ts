import { Matrix4, Vector3 } from 'three';
import { identity, importDocument, type Mesh, type RawDocument, type RawNode } from './model';
export function box(x: number, y: number, z: number): Mesh {
  return { vertices: [[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]],
    triangles: [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]] };
}
function board(id: string, name: string, size: [number,number,number], pos: [number,number,number], rotation = 0): RawNode {
  const m = new Matrix4().makeRotationZ(rotation); m.setPosition(new Vector3(...pos));
  return { id, name, kind: 'component', definition: size.join('x'), transform: m.toArray(), mesh: box(...size), children: [] };
}
export const demoDocument: RawDocument = {
  version: 1, units: 'mm', name: 'Taller · Proyecto de demostración', furniture: [
    { id: 'modulo', name: 'Módulo bajo · 800', kind: 'group', transform: identity(), children: [
      board('m-lateral-izq','Lateral izquierdo',[18,450,700],[0,0,0]),
      board('m-lateral-der','Lateral derecho',[18,450,700],[782,0,0]),
      board('m-base','Base',[764,450,18],[18,0,0]),
      board('m-tapa','Tapa',[764,450,18],[18,0,682]),
      { id:'m-interior',name:'Interior',kind:'group',transform:identity(),children:[board('m-estante','Estante',[764,430,18],[18,10,330])]},
      board('m-fondo','Fondo',[800,6,700],[0,450,0]),
    ]},
    { id: 'mesa', name: 'Mesa auxiliar · 600', kind: 'component', transform: new Matrix4().makeTranslation(1300,0,0).toArray(), children: [
      board('t-sobre','Sobre',[600,500,25],[0,0,500]),
      board('t-izq','Pata izquierda',[25,450,500],[30,25,0]),
      board('t-der','Pata derecha',[25,450,500],[545,25,0]),
      board('t-trav','Travesaño rotado',[450,18,100],[525,465,300],Math.PI),
    ]},
  ],
};
export const createDemo = () => importDocument(demoDocument, 'demo');
