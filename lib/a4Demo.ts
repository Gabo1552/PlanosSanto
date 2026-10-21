import {Matrix4} from 'three';
import {box} from './demo';
import {identity,importDocument,type RawNode,type Vec3} from './model';
/** Synthetic fixture only. This is NOT the operator's real 17-piece SketchUp model. */
export function createA4Demo(){
 const board=(id:string,name:string,size:Vec3,position:Vec3,definition=size.join('x')):RawNode=>({id,name,kind:'component',definition,transform:new Matrix4().makeTranslation(...position).toArray(),mesh:box(...size),children:[]});
 const root='DEMO17';
 const carcass:RawNode[]=[
  board(`${root}/left`,'Lateral',[18,600,800],[0,0,0]),board(`${root}/right`,'Lateral',[18,600,800],[1182,0,0]),
  board(`${root}/floor`,'Piso',[1164,580,18],[18,0,0],'floor'),board(`${root}/top`,'Tapa',[1164,580,18],[18,0,782],'top'),
  board(`${root}/back`,'Fondo',[1200,6,800],[0,594,0]),board(`${root}/shelf`,'Estante',[1164,560,18],[18,20,650]),
  board(`${root}/door-left`,'Puerta',[596,18,760],[2,-18,20]),board(`${root}/door-right`,'Puerta',[596,18,760],[602,-18,20]),
 ];
 const drawers:RawNode[]=Array.from({length:3},(_,i)=>({id:`${root}/drawer-${i+1}`,name:`Cajón ${i+1}`,kind:'group',transform:new Matrix4().makeTranslation(620,80,60+i*190).toArray(),children:[
  board(`${root}/drawer-${i+1}/side-left`,'Lateral cajón',[18,450,140],[0,0,0]),board(`${root}/drawer-${i+1}/side-right`,'Lateral cajón',[18,450,140],[520,0,0]),
  board(`${root}/drawer-${i+1}/floor`,'Fondo cajón',[520,450,6],[9,0,0]),
 ]}));
 const project=importDocument({version:1,units:'mm',name:'DEMOSTRACIÓN SINTÉTICA · Bajo mesada de 17 piezas',furniture:[{id:root,name:'Bajo mesada sintético · 1200 × 600 × 800',kind:'group',transform:identity(),children:[...carcass,...drawers]}]},'demo');
 const f=project.furniture[0];f.groupIdentical=true;f.explosion=0;f.presentation={guide:{mode:'both',hiddenPieceIds:[`${root}/door-left`,`${root}/door-right`],sharedCamera:true,observations:'DEMOSTRACIÓN SINTÉTICA. Verificar fijaciones y orden de armado en taller.'}};
 return project;
}
