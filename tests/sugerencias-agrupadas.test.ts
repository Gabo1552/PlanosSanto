import {describe,expect,it} from 'vitest';
import {Matrix4} from 'three';
import {box,demoDocument} from '../lib/demo';
import {identity,importDocument,type Furniture,type Mesh,type RawNode} from '../lib/model';
import {nameSuggestions} from '../lib/nameSuggestions';
import {identicalGroups,physicalGroups} from '../lib/pieceGroups';
import {carryEdits} from '../sketchup_offline/ui/names';

// 0.8.26 · Sugerencias agrupadas. Placard SINTÉTICO de 800 mm (frente −Y, vertical Z); sin nombres propios.
const orientation={upAxis:2,frontAxis:1,frontSign:-1,confirmed:true};
function board(id:string,definition:string,size:[number,number,number],pos:[number,number,number],mesh:Mesh=box(...size),transform=new Matrix4().makeTranslation(...pos)):RawNode{
 return {id,name:'',kind:'component',definition,transform:transform.toArray(),mesh,children:[]};
}
function placard(children:RawNode[]):Furniture{
 const doc=structuredClone(demoDocument);doc.furniture=[{id:'placard',name:'M01 Placard',kind:'group',transform:identity(),children}];
 return importDocument(doc,'demo').furniture[0];
}
const base=()=>[
 board('lat-a','def-lat-a',[18,450,700],[0,0,0]),
 board('lat-b','def-lat-b',[18,450,700],[782,0,0]),        // otra definición, mismas medidas
 board('div','def-lat-a',[18,450,700],[391,0,0]),          // instancia compartida de la definición del lateral
 board('piso','def-h',[764,450,18],[18,0,0]),
 board('tapa','def-h',[764,450,18],[18,0,682]),            // misma definición que el piso
 board('est-a','def-est-a',[364,430,18],[18,10,330]),
 board('est-b','def-est-b',[364,430,18],[409,10,330]),     // otra definición, mismas medidas
];
const rows=(f:Furniture,grouped=true,separate:Record<string,string>={})=>nameSuggestions(f,orientation,false,grouped,separate).map(s=>[s.base,s.ids.join('+')]);

describe('Equivalencia física para agrupar sugerencias',()=>{
 it('agrupa piezas iguales de distintas definiciones y conserva las instancias compartidas',()=>{
  const f=placard(base()),groups=physicalGroups(f).map(group=>group.flat().map(p=>p.id));
  expect(groups).toEqual([['lat-a','lat-b','div'],['piso','tapa'],['est-a','est-b']]);
  // La agrupación de la guía no cambia: sólo instancias de una misma definición.
  expect(identicalGroups(f).map(group=>group.map(p=>p.id))).toEqual([['lat-a','div'],['lat-b'],['piso','tapa'],['est-a'],['est-b']]);
 });
 it('tolera 0,5 mm en las medidas, pero separa material, veta, espejo y forma distintos',()=>{
  const near=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,450.4,700],[100,0,0])]);
  expect(physicalGroups(near)).toHaveLength(1);
  const far=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,451,700],[100,0,0])]);
  expect(physicalGroups(far)).toHaveLength(2);
  const material=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,450,700],[100,0,0])]);
  material.pieces[1].metadata={...meta(),material:{id:'roble',name:'Roble',color:[120,90,70],opacity:1,textured:false}};
  material.pieces[0].metadata=meta();
  expect(physicalGroups(material)).toHaveLength(2);
  const grain=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,450,700],[100,0,0])]);
  grain.pieces[0].metadata={...meta(),grainAxis:2};grain.pieces[1].metadata={...meta(),grainAxis:1};
  expect(physicalGroups(grain)).toHaveLength(2);
  grain.pieces[1].metadata={...meta(),grainAxis:2};expect(physicalGroups(grain)).toHaveLength(1);
  const mirrored=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d1',[18,450,700],[0,0,0],box(18,450,700),new Matrix4().makeScale(-1,1,1).setPosition(100,0,0))]);
  expect(physicalGroups(mirrored)).toHaveLength(2);
  // Misma caja envolvente pero con una muesca de 50 × 50 mm en una esquina: otra forma.
  const notch=prism([[0,0],[450,0],[450,650],[400,650],[400,700],[0,700]],18);
  const shaped=placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,450,700],[100,0,0],notch)]);
  expect(shaped.pieces[0].dimensions).toEqual(shaped.pieces[1].dimensions);
  expect(physicalGroups(shaped)).toHaveLength(2);
  // Una placa recta dibujada con otros vértices y otro origen de malla sigue siendo la misma forma.
  expect(physicalGroups(placard([board('a','d1',[18,450,700],[0,0,0]),board('b','d2',[18,450,700],[100,0,0],prism([[0,0],[450,0],[450,700],[0,700]],18))]))).toHaveLength(1);
 });
});

describe('Filas de sugerencias con piezas iguales',()=>{
 it('agrupa piezas iguales con la misma función y muestra la cantidad en ids',()=>{
  const f=placard(base());
  expect(rows(f)).toEqual([['Lateral','lat-a+lat-b'],['Divisor','div'],['Piso','piso'],['Tapa','tapa'],['Estante','est-a+est-b']]);
  // Sin agrupar: una fila por pieza.
  expect(rows(f,false)).toHaveLength(7);
 });
 it('no agrupa un Lateral con un Divisor iguales, aunque sean instancias de la misma definición',()=>{
  const f=placard(base()),lateral=nameSuggestions(f,orientation,false,true).find(s=>s.ids.includes('lat-a'))!;
  expect(lateral.ids).not.toContain('div');expect(lateral).toMatchObject({base:'Lateral',confidence:'high'});
  expect(nameSuggestions(f,orientation,false,true).find(s=>s.ids.includes('div'))).toMatchObject({ids:['div'],base:'Divisor'});
 });
 it('con «Agrupar componentes iguales» de la guía no parte la fila: avisa que comparten nombre',()=>{
  const f=placard(base());f.groupIdentical=true;
  const shared=nameSuggestions(f,orientation,false,true).find(s=>s.ids.includes('piso'))!;
  expect(shared).toMatchObject({ids:['piso','tapa'],base:'Panel',confidence:'review'});expect(shared.reason).toMatch(/Agrupar componentes iguales/);
  expect(nameSuggestions(f,orientation,false,true).find(s=>s.ids.includes('lat-a'))!.ids).toEqual(['lat-a','div']);
 });
 it('separa piezas con correcciones guardadas o nombres propios distintos',()=>{
  const f=placard(base());f.naming={moduleCode:'M01',bases:[],reviews:[{id:'lat-a',proposed:'Lateral',base:'Lat junto a heladera'},{id:'lat-b',proposed:'Lateral',base:'Lat'}]};
  const all=nameSuggestions(f,orientation,true,true);
  expect(all.find(s=>s.ids.includes('lat-a'))!.ids).toEqual(['lat-a']);expect(all.find(s=>s.ids.includes('lat-b'))).toMatchObject({ids:['lat-b'],base:'Lat'});
  f.naming.reviews=[];f.pieces[0].name='Lateral izquierdo';
  expect(nameSuggestions(f,orientation,true,true).find(s=>s.ids.includes('lat-a'))!.ids).toEqual(['lat-a']);
 });
 it('separate deja aparte las piezas con ediciones manuales distintas',()=>{
  const f=placard(base());
  expect(rows(f,true,{'lat-a':'Lat izquierdo'})[0]).toEqual(['Lateral','lat-a']);
  expect(rows(f,true,{'lat-a':'Lat','lat-b':'Lat'})[0]).toEqual(['Lateral','lat-a+lat-b']);
 });
});

describe('Ediciones por pieza al agrupar y desagrupar',()=>{
 it('desagrupar conserva la edición de la fila en cada pieza',()=>{
  const grouped=[{ids:['a','b'],base:'Lateral'}];
  expect(carryEdits({a:'Lat X',b:'Lat X'},grouped,[{ids:['a']},{ids:['b']}])).toEqual({chosen:{a:'Lat X',b:'Lat X'},kept:1,lost:0,auto:0});
 });
 it('agrupar conserva cada edición y descarta sólo lo automático',()=>{
  const single=[{ids:['a'],base:'Lateral'},{ids:['b'],base:'Lateral'}];
  expect(carryEdits({a:'Lat izq',b:'Lateral'},single,[{ids:['a','b']}])).toEqual({chosen:{a:'Lat izq'},kept:1,lost:0,auto:1});
  expect(carryEdits({a:'Lat izq'},single,[{ids:['b']}])).toEqual({chosen:{},kept:0,lost:1,auto:0});
 });
});
/** Prisma de espesor `t` en X con perfil (y,z); un perfil en L es una placa con muesca en una esquina. */
function prism(profile:[number,number][],t:number):Mesh{
 const n=profile.length,vertices=[...profile.map(([y,z])=>[0,y,z]),...profile.map(([y,z])=>[t,y,z])] as [number,number,number][],triangles:[number,number,number][]=[];
 for(let i=1;i<n-1;i++){triangles.push([0,i+1,i]);triangles.push([n,n+i,n+i+1]);}
 for(let i=0;i<n;i++){const j=(i+1)%n;triangles.push([i,j,n+j]);triangles.push([i,n+j,n+i]);}
 return {vertices,triangles};
}
function meta(){return {persistentId:'1',instancePath:[],originalName:'',definitionName:'',hidden:false,effectiveVisible:true,tag:'',material:null,worldTransform:identity(),warnings:[]};}
