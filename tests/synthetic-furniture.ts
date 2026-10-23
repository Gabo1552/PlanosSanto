import {Matrix4} from 'three';
import {box} from '../lib/demo';
import {identity,importDocument,type Furniture,type RawNode,type Vec3} from '../lib/model';

// SYNTHETIC fixtures for the 3D render and the viewer (never a customer's SKP). Axes: X width, Y depth with the
// front at Y ≤ 0 (doors and drawer fronts at negative Y), Z up — the group axes SketchUp exports by default.
const board=(id:string,name:string,size:Vec3,position:Vec3,definition=size.join('x')):RawNode=>({id,name,kind:'component',definition,transform:new Matrix4().makeTranslation(...position).toArray(),mesh:box(...size),children:[]});
function furniture(id:string,name:string,children:RawNode[]):Furniture{
  const project=importDocument({version:1,units:'mm',name:`SINTÉTICO · ${name}`,furniture:[{id,name,kind:'group',transform:identity(),children}]},'demo');
  const f=project.furniture[0];f.explosion=0;f.groupIdentical=true;
  f.presentation={guide:{mode:'both',hiddenPieceIds:[],sharedCamera:true,observations:''}};
  return f;
}
/** Banco 1200 × 450 × 450 con zócalo retirado, piso apoyado sobre el zócalo, divisor y dos puertas. */
export function bench(){
  return furniture('BANCO','Banco 1200 × 450 × 450',[
    board('BANCO/tapa','Tapa',[1200,450,18],[0,0,432]),
    board('BANCO/lat-izq','Lateral',[18,450,432],[0,0,0]),board('BANCO/lat-der','Lateral',[18,450,432],[1182,0,0]),
    board('BANCO/piso','Piso',[1164,450,18],[18,0,80]),
    board('BANCO/zocalo','Zócalo',[1164,18,80],[18,40,0]),board('BANCO/zocalo-tras','Zócalo trasero',[1164,18,80],[18,392,0]),
    board('BANCO/fondo','Fondo',[1164,6,334],[18,444,98]),board('BANCO/divisor','Divisor',[18,444,334],[591,0,98]),
    board('BANCO/puerta-izq','Puerta',[598,18,350],[1,-18,81]),board('BANCO/puerta-der','Puerta',[598,18,350],[601,-18,81]),
  ]);
}
/** Placard 1800 × 600 × 2400: zócalo, divisor central, estantes y dos puertas. */
export function wardrobe(){
  const shelves=[700,1300,1900].flatMap((z,i)=>[board(`PLACARD/estante-izq-${i}`,'Estante',[873,560,18],[18,20,z]),board(`PLACARD/estante-der-${i}`,'Estante',[873,560,18],[909,20,z])]);
  return furniture('PLACARD','Placard 1800 × 600 × 2400',[
    board('PLACARD/lat-izq','Lateral',[18,600,2400],[0,0,0]),board('PLACARD/lat-der','Lateral',[18,600,2400],[1782,0,0]),
    board('PLACARD/tapa','Tapa',[1764,600,18],[18,0,2382]),board('PLACARD/piso','Piso',[1764,600,18],[18,0,80]),
    board('PLACARD/zocalo','Zócalo',[1764,18,80],[18,30,0]),board('PLACARD/fondo','Fondo',[1800,6,2400],[0,600,0]),
    board('PLACARD/divisor','Divisor',[18,580,2284],[891,0,98]),...shelves,
    board('PLACARD/puerta-izq','Puerta',[898,18,2318],[1,-18,81]),board('PLACARD/puerta-der','Puerta',[898,18,2318],[901,-18,81]),
  ]);
}
/** Cajonera 600 × 500 × 800 con cuatro cajones (frente, laterales, trasera y fondo). */
export function chest(drawers=4){
  const height=(800-36)/drawers;
  const boxes=Array.from({length:drawers},(_,i):RawNode=>({id:`CAJONERA/cajon-${i+1}`,name:`Cajón ${i+1}`,kind:'group',transform:new Matrix4().makeTranslation(18,0,18+i*height).toArray(),children:[
    board(`CAJONERA/cajon-${i+1}/frente`,'Frente de cajón',[560,18,height-4],[2,-18,2]),
    board(`CAJONERA/cajon-${i+1}/lat-izq`,'Lateral de cajón',[15,450,height-50],[13,10,20]),board(`CAJONERA/cajon-${i+1}/lat-der`,'Lateral de cajón',[15,450,height-50],[536,10,20]),
    board(`CAJONERA/cajon-${i+1}/trasera`,'Trasera de cajón',[508,15,height-50],[28,445,20]),board(`CAJONERA/cajon-${i+1}/fondo`,'Fondo de cajón',[508,435,6],[28,10,20]),
  ]}));
  return furniture('CAJONERA','Cajonera 600 × 500 × 800',[
    board('CAJONERA/lat-izq','Lateral',[18,500,800],[0,0,0]),board('CAJONERA/lat-der','Lateral',[18,500,800],[582,0,0]),
    board('CAJONERA/tapa','Tapa',[564,500,18],[18,0,782]),board('CAJONERA/piso','Piso',[564,500,18],[18,0,0]),
    board('CAJONERA/fondo','Fondo',[600,6,800],[0,500,0]),...boxes,
  ]);
}
/** A run of `modules` placards side by side: 300+ pieces for timing the render and the viewer. */
export function wardrobeRun(modules=20){
  const children:RawNode[]=[];
  for(let m=0;m<modules;m++){
    const x=m*620,p=(id:string)=>`RUN/m${m}/${id}`;
    children.push(board(p('lat-izq'),'Lateral',[18,600,2400],[x,0,0]),board(p('lat-der'),'Lateral',[18,600,2400],[x+582,0,0]),
      board(p('tapa'),'Tapa',[564,600,18],[x+18,0,2382]),board(p('piso'),'Piso',[564,600,18],[x+18,0,80]),board(p('zocalo'),'Zócalo',[564,18,80],[x+18,30,0]),
      board(p('fondo'),'Fondo',[600,6,2400],[x,600,0]),
      ...[500,900,1300,1700,2100].map((z,i)=>board(p(`estante-${i}`),'Estante',[564,560,18],[x+18,20,z])),
      ...[0,1,2].map(i=>board(p(`cajon-${i}`),'Frente de cajón',[596,18,130],[x+2,-18,90+i*134])),
      board(p('puerta'),'Puerta',[596,18,1880],[x+2,-18,494]));
  }
  return furniture('RUN',`Placard corrido de ${modules} módulos`,children);
}
