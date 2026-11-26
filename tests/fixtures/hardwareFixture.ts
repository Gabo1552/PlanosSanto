import {Matrix4} from 'three';
import {box} from '../../lib/demo';
import {importDocument,type Furniture,type Mesh,type RawDocument,type RawNode} from '../../lib/model';
import type {CutlistData,CutlistPiece} from '../../sketchup_offline/ui/cutlistModel';

// Herrajes calculados por nombre (0.8.36). Muebles SINTÉTICOS: un bajo mesada de 600 × 560 × 720 con dos cajones
// (frente «Fte» y delantera «Del Caj») y un placard con una puerta de 2100 y otra acostada (rebatible).
const node=(id:string,name:string,mesh:Mesh,transform:Matrix4):RawNode=>({id,name,kind:'component',definition:id,transform:transform.toArray(),mesh,children:[]});
const at=(x:number,y:number,z:number)=>new Matrix4().makeTranslation(x,y,z);
const reference={upAxis:2 as const,frontAxis:1 as const,frontSign:-1 as const,confirmed:true};
export function project():Furniture[]{
  const doc:RawDocument={version:1,units:'mm',name:'Cocina SINTÉTICA',furniture:[
    {id:'101',name:'M01 Bajo mesada',kind:'group',transform:at(0,0,0).toArray(),children:[
      node('101/1','Lateral',box(18,560,720),at(0,0,0)),node('101/2','Lateral',box(18,560,720),at(582,0,0)),
      node('101/3','Fte',box(600,18,300),at(0,-18,0)),node('101/4','Fte',box(600,18,300),at(0,-18,320)),
      node('101/5','Del Caj',box(530,15,200),at(35,20,40))]},
    {id:'202',name:'Placard',kind:'group',transform:at(3000,0,0).toArray(),children:[
      node('202/1','Lateral',box(18,600,2100),at(0,0,0)),
      node('202/2','Puerta',box(500,18,2100),at(18,-18,0)),
      // Puerta de alacena rebatible: más ancha (900) que alta (400).
      node('202/3','Puerta',box(900,18,400),at(18,-18,2150))]},
  ]};
  return importDocument(doc,'sketchup-ruby').furniture.map(f=>({...f,naming:{moduleCode:'',bases:[],reference}}));
}
export function cutPiece(ids:string[],extra:Partial<CutlistPiece>):CutlistPiece{
  return {id:ids[0],ids,code:'',codes:[],name:'Pieza',furnitureId:'101',furnitureName:'M01 Bajo mesada',quantity:ids.length,lengthMm:720,widthMm:560,thicknessMm:18,rectangular:true,mirrored:false,
    material:null,sectionKey:'none|18.0',edges:[],strips:[],grain:'none',notes:[],...extra};
}
export function data():CutlistData{
  return {schema:1,complete:true,readOnly:true,modelName:'Cocina SINTÉTICA',unit:'mm',furniture:[{id:'101',name:'M01 Bajo mesada'},{id:'202',name:'Placard'}],
    sections:[{key:'none|18.0',source:'none',kind:'unknown',name:'Sin material',thicknessMm:18,colorRgb:null,missing:[]},{key:'none|15.0',source:'none',kind:'unknown',name:'Sin material',thicknessMm:15,colorRgb:null,missing:[]}],edgeSections:[],
    pieces:[cutPiece(['101/1','101/2'],{name:'Lateral'}),
            cutPiece(['101/3','101/4'],{name:'AB M01 Fte',code:'M01·C',codes:['M01·C','M01·D'],idCodes:['M01·C','M01·D'],lengthMm:600,widthMm:300}),
            cutPiece(['101/5'],{name:'AB M01 Del Caj',lengthMm:530,widthMm:200,thicknessMm:15,sectionKey:'none|15.0'}),
            cutPiece(['202/1'],{name:'Lateral',furnitureId:'202',furnitureName:'Placard',lengthMm:2100,widthMm:600}),
            cutPiece(['202/2'],{name:'Puerta',furnitureId:'202',furnitureName:'Placard',lengthMm:2100,widthMm:500}),
            cutPiece(['202/3'],{name:'Puerta',furnitureId:'202',furnitureName:'Placard',lengthMm:900,widthMm:400})]};
}
