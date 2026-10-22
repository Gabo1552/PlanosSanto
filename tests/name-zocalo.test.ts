import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box,createDemo} from '../lib/demo';
import {importDocument,type Furniture,type RawNode} from '../lib/model';
import {exteriorFromOrientation,frontFromPick,furnitureExterior,nameSuggestions,proposeFront,proposeOrientation,uprightFromTransform} from '../lib/nameSuggestions';

// Banco 1200 × 450 × 450 (X ancho, Y profundidad, Z alto); el frente mira a −Y.
const o={upAxis:2,frontAxis:1,frontSign:-1,confirmed:true};
function board(id:string,size:[number,number,number],pos:[number,number,number],name='Grupo#1'):RawNode{
 return {id,name,kind:'group',transform:new Matrix4().makeTranslation(...pos).toArray(),mesh:box(...size),children:[]};
}
function furniture(children:RawNode[],transform=new Matrix4()):Furniture{
 return importDocument({version:1,units:'mm',name:'Banco',furniture:[{id:'banco',name:'Banco',kind:'group',transform:transform.toArray(),children}]},'demo').furniture[0];
}
const names=(f:Furniture,orientation=o)=>Object.fromEntries(nameSuggestions(f,orientation,true).map(s=>[s.ids[0],[s.base,s.confidence]]));
// Laterales hasta el piso; zócalo de 100 mm retranqueado 50 mm; el piso apoya encima.
const bancoLaterales=()=>[board('lat-i',[18,450,450],[0,0,0]),board('lat-d',[18,450,450],[1182,0,0]),board('piso',[1164,444,18],[18,0,100]),board('tapa',[1164,444,18],[18,0,432]),board('fondo',[1164,6,350],[18,444,100]),board('zocalo',[1164,18,100],[18,50,0])];
// Caja sobre un bastidor de zócalo de 80 mm (frente, trasero y dos costados).
const bancoBastidor=()=>[board('lat-i',[18,450,352],[0,0,80]),board('lat-d',[18,450,352],[1182,0,80]),board('piso',[1164,444,18],[18,0,80]),board('tapa',[1200,450,18],[0,0,432]),board('fondo',[1164,6,334],[18,444,98]),
 board('zf',[1100,18,80],[50,50,0]),board('zt',[1100,18,80],[50,400,0]),board('zi',[18,332,80],[50,68,0]),board('zd',[18,332,80],[1132,68,0])];

describe('Banco con zócalo (reporte 0.8.18)',()=>{
 it('laterales hasta el piso: zócalo, piso apoyado, tapa y fondo son geométricos',()=>{
  expect(names(furniture(bancoLaterales()))).toEqual({'lat-i':['Lateral','high'],'lat-d':['Lateral','high'],piso:['Piso','high'],tapa:['Tapa','high'],fondo:['Fondo','high'],zocalo:['Zócalo','high']});
 });
 it('caja sobre bastidor: las cuatro piezas del zócalo y el piso, con franjas medidas sin el zócalo',()=>{
  const f=furniture(bancoBastidor()),all=nameSuggestions(f,o,true),by=(id:string)=>all.find(s=>s.ids[0]===id)!;
  for(const id of ['zf','zt','zi','zd'])expect(by(id)).toMatchObject({base:'Zócalo',confidence:'high'});
  expect(by('piso')).toMatchObject({base:'Piso',confidence:'high',position:'Centro · abajo · interior'});
  expect(by('piso').reason).toContain('sobre el zócalo');
  expect(by('lat-i').position).toBe('Izquierda · intermedio · interior');
 });
 it('antes se proponía Estante: el piso sobre un zócalo alto queda por encima del 15 % de la caja total',()=>{
  // Zócalo de 100 mm en un banco de 450: el piso está a z≈0,24 de la caja total pero en 0,03 del cuerpo.
  const f=furniture(bancoLaterales()),piso=nameSuggestions(f,o,true).find(s=>s.ids[0]==='piso')!;
  expect(piso.base).toBe('Piso');expect(piso.position).toContain('abajo');
 });
 it('un zócalo agrupado en su propio subgrupo no se confunde con un cajón',()=>{
  const plinth:RawNode={id:'zoc',name:'Zócalo',kind:'group',transform:new Matrix4().toArray(),children:bancoBastidor().slice(5).map(n=>({...n,id:`zoc/${n.id}`}))};
  const f=furniture([...bancoBastidor().slice(0,5),plinth]);
  for(const id of ['zoc/zf','zoc/zt','zoc/zi','zoc/zd'])expect(names(f)[id]).toEqual(['Zócalo','high']);
 });
 it('sin zócalo: nada se llama Zócalo y el módulo demo conserva piso, tapa, estante y fondo',()=>{
  const f=createDemo().furniture[0],all=nameSuggestions(f,o,true),base=(id:string)=>all.find(s=>s.ids.includes(id))!;
  expect(all.some(s=>s.base==='Zócalo')).toBe(false);
  expect(base('m-base')).toMatchObject({base:'Piso',confidence:'high'});expect(base('m-tapa')).toMatchObject({base:'Tapa',confidence:'high'});
  expect(base('m-estante')).toMatchObject({base:'Estante',confidence:'review'});expect(base('m-fondo')).toMatchObject({base:'Fondo',confidence:'high'});
  // La mesa: patas y travesaño alto no son zócalo.
  expect(nameSuggestions(createDemo().furniture[1],o,true).some(s=>s.base==='Zócalo')).toBe(false);
 });
 it('una franja baja sin piso apoyado encima no es zócalo, y un piso con patas apoya entre laterales',()=>{
  const f=furniture([board('lat-i',[18,450,450],[0,0,0]),board('lat-d',[18,450,450],[1182,0,0]),board('piso',[1164,444,18],[18,0,120]),board('tapa',[1164,444,18],[18,0,432]),board('trav',[1164,18,60],[18,200,0])]);
  const n=names(f);expect(n.trav[0]).not.toBe('Zócalo');expect(n.piso).toEqual(['Piso','high']);
 });
 it('un frente de cajón al ras del suelo, con el piso detrás, no es zócalo',()=>{
  const f=furniture([board('lat-i',[18,450,700],[0,0,0]),board('lat-d',[18,450,700],[1182,0,0]),board('piso',[1164,450,18],[18,0,0]),board('trav',[1164,432,18],[18,18,152]),board('tapa',[1164,450,18],[18,0,682]),board('fc',[1200,18,150],[0,-18,0])]);
  const n=names(f);expect(n.fc[0]).not.toBe('Zócalo');expect(n.piso).toEqual(['Piso','high']);
 });
 it('un piso que no apoya en nada queda en revisión',()=>{
  const f=furniture([board('lat-i',[18,450,450],[0,0,0]),board('lat-d',[18,450,450],[1182,0,200]),board('piso',[1164,444,18],[18,0,120]),board('tapa',[1164,444,18],[18,0,432])]);
  expect(names(f).piso).toEqual(['Piso','review']);
 });
 it('conserva Zócalo escrito por el taller y ofrece una corrección Zoc a otra pieza del mismo rol',()=>{
  const nodes=bancoBastidor();nodes[5].name='Zocalo';
  let f=furniture(nodes);expect(nameSuggestions(f,o,true).find(s=>s.ids[0]==='zf')).toMatchObject({base:'Zócalo',confidence:'high'});
  f=furniture(bancoBastidor());f.naming={moduleCode:'M01',bases:[],reviews:[{id:'zf',proposed:'Zócalo',base:'Zoc'}]};
  expect(nameSuggestions(f,o).find(s=>s.ids[0]==='zt')).toMatchObject({base:'Zoc',confidence:'review'});
 });
});

describe('El frente alcanza: vertical por defecto en el eje azul',()=>{
 it('marcar sólo el frente confirma la orientación y calcula todos los nombres',()=>{
  const f=furniture(bancoLaterales()),marked={upAxis:2,...frontFromPick(f,'lat-i',[0,200,300],2),confirmed:true};
  // Frente marcado en la cara exterior del lateral izquierdo: −X.
  expect(marked).toMatchObject({frontAxis:0,frontSign:-1});
  const all=nameSuggestions(f,marked,true);
  expect(all.every(s=>s.confidence!=='unclassified')).toBe(true);
  expect(all.find(s=>s.ids[0]==='piso')).toMatchObject({base:'Piso',confidence:'high'});
  expect(all.find(s=>s.ids[0]==='lat-d')?.base).toBe('Fondo');
 });
 it('la vertical sale del eje azul aunque el grupo esté girado en planta o de canto; sólo se pide si está oblicuo',()=>{
  expect(uprightFromTransform(furniture(bancoLaterales()))).toEqual({upAxis:2,upSign:1});
  expect(uprightFromTransform(furniture(bancoLaterales(),new Matrix4().makeRotationZ(.7)))).toEqual({upAxis:2,upSign:1});
  // Ejes del grupo girados 90° alrededor del rojo: el azul del mundo es el +Y local.
  expect(uprightFromTransform(furniture(bancoLaterales(),new Matrix4().makeRotationX(Math.PI/2)))).toEqual({upAxis:1,upSign:1});
  // Inclinado 5°: todavía es el eje Z; inclinado 30°: claramente rotado.
  expect(uprightFromTransform(furniture(bancoLaterales(),new Matrix4().makeRotationX(5*Math.PI/180)))).toEqual({upAxis:2,upSign:1});
  const tilted=furniture(bancoLaterales(),new Matrix4().makeRotationX(Math.PI/6));
  expect(uprightFromTransform(tilted)).toBeNull();expect(proposeOrientation(tilted).askUp).toBe(true);
 });
});

describe('Frente propuesto automáticamente',()=>{
 it('lado opuesto al fondo delgado',()=>{
  expect(proposeOrientation(furniture(bancoLaterales()))).toEqual({orientation:{upAxis:2,frontAxis:1,frontSign:-1,confirmed:true},source:'fondo',askUp:false});
  expect(proposeFront(createDemo().furniture[0],2)).toEqual({frontAxis:1,frontSign:-1,cue:'fondo'});
 });
 it('lado con puertas al ras, aunque el fondo no exista o el frente mire a +X',()=>{
  const doors=[board('lat-i',[450,18,450],[0,0,0]),board('lat-d',[450,18,450],[0,1182,0]),board('piso',[432,1164,18],[0,18,100]),board('pi',[18,580,332],[432,18,100]),board('pd',[18,580,332],[432,600,100])];
  expect(proposeFront(furniture(doors),2)).toEqual({frontAxis:0,frontSign:1,cue:'frentes'});
  expect(proposeOrientation(furniture(doors)).source).toBe('frentes');
 });
 it('sin señales o con señales contradictorias se usan los ejes del grupo',()=>{
  expect(proposeOrientation(createDemo().furniture[1])).toMatchObject({source:'ejes',orientation:{frontAxis:1,frontSign:-1}});
  // Fondo delgado atrás (+Y) y puertas al ras también atrás: no se adivina.
  const mixed=[...bancoLaterales(),board('pt',[580,18,300],[18,450,120])];
  expect(proposeFront(furniture(mixed),2)).toBeNull();
 });
 it('un frente ya marcado se reutiliza tal cual, también si quedó guardado sin confirmar',()=>{
  const f=furniture(bancoLaterales());f.naming={moduleCode:'M01',bases:[],reference:{upAxis:2,frontAxis:0,frontSign:1,confirmed:false}};
  expect(proposeOrientation(f)).toEqual({orientation:{upAxis:2,frontAxis:0,frontSign:1,confirmed:true},source:'guardado',askUp:false});
 });
 it('en un grupo girado en planta el frente sigue siendo local y el fondo lo indica',()=>{
  const f=furniture(bancoLaterales(),new Matrix4().makeRotationZ(1.1));
  expect(proposeOrientation(f).orientation).toMatchObject({upAxis:2,frontAxis:1,frontSign:-1});
  expect(names(f,proposeOrientation(f).orientation).piso).toEqual(['Piso','high']);
 });
});

describe('Vista exterior e interior desde el frente marcado',()=>{
 const close=(v:number[],w:number[])=>v.forEach((x,i)=>expect(x).toBeCloseTo(w[i],9));
 it('frente −Y del mundo: exterior desde −Y, interior desde +Y, sin girar la cámara',()=>{
  const view=exteriorFromOrientation(o);
  expect(view.exterior).toMatchObject({axis:1,sign:-1});expect(view.interior).toMatchObject({axis:1,sign:1});
  close(view.exterior.world,[0,-1,0]);close(view.interior.world,[0,1,0]);close(view.up.world,[0,0,1]);expect(view.yaw).toBe(0);
 });
 it('frente +X, +Y o −X: giro de la cámara alrededor del eje azul',()=>{
  expect(exteriorFromOrientation({...o,frontAxis:0,frontSign:1}).yaw).toBeCloseTo(90);
  expect(exteriorFromOrientation({...o,frontAxis:1,frontSign:1}).yaw).toBeCloseTo(180);
  expect(exteriorFromOrientation({...o,frontAxis:0,frontSign:-1}).yaw).toBeCloseTo(-90);
 });
 it('usa los ejes del grupo: un mueble girado 30° en planta gira la cámara 30°',()=>{
  const turn=new Matrix4().makeRotationZ(Math.PI/6),view=exteriorFromOrientation(o,turn.toArray());
  close(view.exterior.world,[Math.sin(Math.PI/6),-Math.cos(Math.PI/6),0]);expect(view.yaw).toBeCloseTo(30);
  const f=furniture(bancoLaterales(),turn);expect(furnitureExterior(f)).toMatchObject({saved:false,exterior:{axis:1,sign:-1}});expect(furnitureExterior(f).yaw).toBeCloseTo(30);
  f.naming={moduleCode:'M01',bases:[],reference:{upAxis:2,frontAxis:0,frontSign:1,confirmed:true}};
  expect(furnitureExterior(f)).toMatchObject({saved:true,exterior:{axis:0,sign:1},interior:{axis:0,sign:-1}});expect(furnitureExterior(f).yaw).toBeCloseTo(120);
 });
 it('es pura: no cambia la orientación recibida',()=>{
  const orientation={...o};exteriorFromOrientation(orientation,new Matrix4().makeRotationZ(1).toArray());expect(orientation).toEqual(o);
 });
});
