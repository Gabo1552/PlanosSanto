import {describe,expect,it} from 'vitest';
import {Matrix4,Vector3} from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {box} from '../lib/demo';
import {importDocument,MAX_FURNITURE,type Furniture,type Mesh,type RawDocument,type RawNode} from '../lib/model';
import {OBRA_SCHEMA,obraSchema,parseObra,type Obra} from '../lib/obra';
import {buildObra,obraNameIssues} from '../sketchup_offline/ui/obra';
import {buildEdgeSections,buildSections,cutlistCsv,type CutlistData,type CutlistPiece} from '../sketchup_offline/ui/cutlistModel';

// Paquete de obra (planos-santo.obra.v1) para el visor 3D de App Santo. Geometría y nombres SINTÉTICOS:
// un bajo mesada de 600 × 560 × 720 y una alacena rotada 90° en planta, sin datos de clientes.
const node=(id:string,name:string,mesh:Mesh,transform:Matrix4):RawNode=>({id,name,kind:'component',definition:id,transform:transform.toArray(),mesh,children:[]});
const at=(x:number,y:number,z:number)=>new Matrix4().makeTranslation(x,y,z);
const reference={upAxis:2 as const,frontAxis:1 as const,frontSign:-1 as const,confirmed:true};
function project():Furniture[]{
  const doc:RawDocument={version:1,units:'mm',name:'Cocina SINTÉTICA',furniture:[
    {id:'101',name:'M01 Bajo mesada',kind:'group',transform:at(0,0,100).toArray(),children:[
      node('101/1','Lateral',box(18,560,720),at(0,0,0)),node('101/2','Lateral',box(18,560,720),at(582,0,0)),
      node('101/3','Piso',box(564,560,18),at(18,0,0)),
      // Fondo de 564 × 720 × 3 dibujado acostado y girado a su lugar.
      node('101/4','Fondo',box(564,720,3),at(18,563,0).multiply(new Matrix4().makeRotationX(Math.PI/2)))]},
    {id:'202',name:'Alacena',kind:'group',transform:at(2000,0,1500).multiply(new Matrix4().makeRotationZ(Math.PI/2)).toArray(),children:[
      node('202/1','Puerta',box(400,18,700),at(0,0,0))]},
  ]};
  return importDocument(doc,'sketchup-ruby').furniture.map(f=>({...f,naming:{moduleCode:f.name.startsWith('M01')?'M01':'',bases:[],reference}}));
}
const material={source:'catalog' as const,catalogId:'mel',name:'Melamina Blanca 18',sku:'MEL-18'};
function cutPiece(ids:string[],extra:Partial<CutlistPiece>):CutlistPiece{
  return {id:ids[0],ids,code:'',codes:[],name:'Pieza',furnitureId:'101',furnitureName:'M01 Bajo mesada',quantity:ids.length,lengthMm:720,widthMm:560,thicknessMm:18,rectangular:true,mirrored:false,
    material,sectionKey:'catalog:mel|18.0',edges:[],strips:[],grain:'none',notes:[],...extra};
}
function data():CutlistData{
  return {schema:1,complete:true,readOnly:true,modelName:'Cocina SINTÉTICA',unit:'mm',furniture:[{id:'101',name:'M01 Bajo mesada'},{id:'202',name:'Alacena'}],
    sections:[{key:'catalog:mel|18.0',source:'catalog',kind:'sheet',name:'Melamina Blanca 18',sku:'MEL-18',catalogId:'mel',thicknessMm:18,colorRgb:[240,238,230],missing:[]},
              {key:'model:fibro|3.0',source:'model',kind:'unknown',name:'Fibro pintado',thicknessMm:3,colorRgb:null,missing:['ficha']},
              {key:'none|18.0',source:'none',kind:'unknown',name:'Sin material',thicknessMm:18,colorRgb:null,missing:[]}],
    edgeSections:[],
    pieces:[cutPiece(['101/1','101/2'],{name:'Lateral',code:'M01·A',codes:['M01·A','M01·B'],idCodes:['M01·A','M01·B']}),
            cutPiece(['101/3'],{name:'Piso',code:'M01·C',codes:['M01·C'],idCodes:['M01·C'],lengthMm:564,widthMm:560}),
            cutPiece(['101/4'],{name:'Fondo',lengthMm:720,widthMm:564,thicknessMm:3,material:{source:'model',observedId:'fibro',name:'Fibro pintado'},sectionKey:'model:fibro|3.0'}),
            cutPiece(['202/1'],{name:'Puerta',furnitureId:'202',furnitureName:'Alacena',lengthMm:700,widthMm:400,material:null,sectionKey:'none|18.0'})]};
}
const EXAMPLE='docs/integracion-app-santo/ejemplo.obra.json';
const build=(over:Partial<Parameters<typeof buildObra>[0]>={})=>buildObra({version:'0.8.35',exportedAt:'2026-11-23T12:00:00.000Z',data:data(),furniture:project(),...over});

describe('Paquete de obra: armado',()=>{
  it('arma un mueble por mueble generado, con el nombre del listado, su código y sus medidas totales',()=>{
    const obra=build();
    expect(obra).toMatchObject({schema:OBRA_SCHEMA,version:'0.8.35',modelo:'Cocina SINTÉTICA',exportado:'2026-11-23T12:00:00.000Z',unidades:'mm'});
    expect(obra.muebles.map(m=>[m.id,m.nombre,m.codigo])).toEqual([['101','M01 Bajo mesada','M01'],['202','Alacena','']]);
    expect(obra.muebles[0].medidas).toEqual({alto:720,ancho:600,profundidad:563});
    expect(obra.muebles[1].medidas).toEqual({alto:700,ancho:400,profundidad:18});
  });
  it('lleva cada pieza física por separado, con su código, designación, material y medidas de corte',()=>{
    const [bajo,alacena]=build().muebles;
    expect(bajo.piezas.map(p=>[p.id,p.codigo,p.nombre,p.medidas])).toEqual([
      ['101/1','M01·A','Lateral',[720,560,18]],['101/2','M01·B','Lateral',[720,560,18]],['101/3','M01·C','Piso',[564,560,18]],['101/4','','Fondo',[720,564,3]]]);
    expect(bajo.piezas[0].material).toEqual({nombre:'Melamina Blanca 18',sku:'MEL-18',color:'#f0eee6'});
    expect(bajo.piezas[3].material).toEqual({nombre:'Fibro pintado',sku:null,color:null});
    expect(alacena.piezas[0].material).toEqual({nombre:'Sin material',sku:null,color:null});
  });
  it('la caja local y la matriz mundo (column-major, mm) ubican cada esquina donde está en el modelo',()=>{
    const obra=build(),fondo=obra.muebles[0].piezas[3],puerta=obra.muebles[1].piezas[0];
    expect(fondo.caja).toEqual({min:[0,0,0],max:[564,720,3]});
    const corner=(p:Obra['muebles'][number]['piezas'][number],c:number[])=>new Vector3(...c).applyMatrix4(new Matrix4().fromArray(p.transform)).toArray().map(v=>Math.round(v*100)/100+0);
    // Fondo girado: su cara de 564 × 720 queda vertical, de y 560 a 563, sobre el zócalo (z 100).
    expect(corner(fondo,fondo.caja.max)).toEqual([582,560,820]);
    expect(corner(fondo,fondo.caja.min)).toEqual([18,563,100]);
    // Alacena rotada 90° en planta: el ancho de la puerta corre sobre el eje Y del mundo.
    expect(corner(puerta,[400,0,0])).toEqual([2000,400,1500]);
  });
  it('redondea para que el archivo quede liviano: una cocina de 30 muebles pesa menos de 2 MB',()=>{
    const base=project()[0],furniture:Furniture[]=[],source=data(),pieces:CutlistPiece[]=[],list:CutlistData['furniture']=[];
    for(let i=0;i<30;i++){
      const id=`F${i}`,rotation=new Matrix4().makeRotationZ(i*0.37).setPosition(i*611.123456,i*13.98765,0);
      const copies=Array.from({length:6},(_,k)=>base.pieces.map(p=>({...p,id:`${id}/${k}/${p.id}`,transform:rotation.clone().multiply(new Matrix4().fromArray(p.transform)).toArray()}))).flat();
      furniture.push({...base,id,name:`Mueble ${i}`,pieces:copies});list.push({id,name:`Mueble ${i}`});
      pieces.push(...copies.map(p=>cutPiece([p.id],{name:p.name,furnitureId:id,furnitureName:`Mueble ${i}`})));
    }
    const obra=buildObra({version:'0.8.35',exportedAt:'2026-11-23T12:00:00.000Z',data:{...source,furniture:list,pieces},furniture});
    const text=JSON.stringify(obra);
    expect(obra.muebles.flatMap(m=>m.piezas)).toHaveLength(720);
    expect(text.length).toBeLessThan(2*1024*1024);
    expect(text).not.toMatch(/\d\.\d{7,}/);
  });
  it('rechaza un listado que no corresponde a los muebles generados',()=>{
    const stale=data();stale.pieces=stale.pieces.filter(p=>p.name!=='Piso');
    expect(()=>build({data:stale})).toThrow(/volvé a generar/);
    const extra=data();extra.furniture.push({id:'303',name:'Torre'});
    expect(()=>build({data:extra})).toThrow(/volvé a generar/);
    const foreign=data();foreign.pieces[0]={...foreign.pieces[0],ids:['101/1','999/9']};
    expect(()=>build({data:foreign})).toThrow(/volvé a generar/);
  });
  it('sin códigos por pieza (Ruby anterior) usa el de la fila solo si la fila es de una pieza',()=>{
    const old=data();old.pieces=old.pieces.map(piece=>{const copy={...piece};delete copy.idCodes;return copy;});
    const [bajo]=build({data:old}).muebles;
    expect(bajo.piezas.map(p=>p.codigo)).toEqual(['','','M01·C','']);
  });
});

describe('Paquete de obra: nombre del mueble igual al CSV de Piezas',()=>{
  it('cada fila del CSV cae en un mueble del paquete con el mismo nombre y la misma pieza',()=>{
    const source=data(),obra=build({data:source});
    const csv=cutlistCsv(buildSections(source),buildEdgeSections(source)).split('\r\n').slice(1,-1).map(line=>line.split(';'));
    const furniture=new Map(obra.muebles.map(m=>[m.nombre,m]));
    expect(csv.length).toBeGreaterThan(0);
    for(const row of csv){
      const [,,,,designation,mueble,codes,quantity]=row;
      const found=furniture.get(mueble);
      expect(found,`«${mueble}» del CSV no está en el paquete`).toBeDefined();
      const pieces=found!.piezas.filter(p=>p.nombre===designation);
      expect(pieces).toHaveLength(Number(quantity));
      // El CSV abrevia «M01·A, B»: el prefijo del módulo va solo en el primero.
      const list=codes?codes.split(', '):[],prefix=list[0]?.includes('·')?list[0].slice(0,list[0].indexOf('·')+1):'';
      expect(pieces.map(p=>p.codigo).filter(Boolean)).toEqual(list.map(code=>code.includes('·')?code:prefix+code));
    }
    expect(new Set(csv.map(row=>row[5]))).toEqual(new Set(obra.muebles.map(m=>m.nombre)));
  });
  it('avisa los nombres repetidos, que App Santo no puede distinguir',()=>{
    const twins=data();twins.furniture[1].name='M01 Bajo mesada';
    expect(obraNameIssues(build({data:twins}))).toEqual(['Hay 2 muebles llamados «M01 Bajo mesada»: App Santo los empareja por nombre. Renombrá uno en Muebles antes de importar.']);
    expect(obraNameIssues(build())).toEqual([]);
  });
});

describe('Paquete de obra: esquema',()=>{
  it('acepta SKU de hasta 160 caracteres, como la biblioteca y el SKU automático (0.8.35)',()=>{
    const obra=build(),withSku=(sku:string)=>({...obra,muebles:obra.muebles.map((m,i)=>i?m:{...m,piezas:m.piezas.map((p,j)=>j?p:{...p,material:{...p.material,sku}})})});
    expect(()=>parseObra(withSku('A'.repeat(160)))).not.toThrow();
    expect(()=>parseObra(withSku('A'.repeat(161)))).toThrow();
  });
  it('valida el ejemplo de docs, generado por esta prueba (WRITE_OBRA_EXAMPLE=1 lo regenera)',()=>{
    const obra=build();
    expect(parseObra(JSON.parse(JSON.stringify(obra)))).toEqual(obra);
    // Arrays de números en una línea para que el ejemplo se lea; el archivo real va compacto (JSON.stringify sin sangría).
    const pretty=JSON.stringify(obra,null,2).replace(/\[[-\d\s,.e]+\]/g,list=>list.replace(/\s+/g,'').replace(/,/g,', '))+'\n';
    if(process.env.WRITE_OBRA_EXAMPLE)writeFileSync(EXAMPLE,pretty);
    const stored=readFileSync(EXAMPLE,'utf8');
    expect(parseObra(JSON.parse(stored))).toEqual(obra);
    expect(stored).toBe(pretty);
  });
  it('rechaza esquema ajeno, unidades, matrices no afines, cajas invertidas, colores y duplicados',()=>{
    const ok=build(),bad=(change:(o:Obra)=>void)=>{const copy=structuredClone(ok);change(copy);return obraSchema.safeParse(copy).success;};
    expect(bad(()=>{})).toBe(true);
    expect(bad(o=>{(o as {schema:string}).schema='planos-santo.obra.v2';})).toBe(false);
    expect(bad(o=>{(o as {unidades:string}).unidades='in';})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas[0].transform[3]=1;})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas[0].transform=o.muebles[0].piezas[0].transform.slice(0,15);})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas[0].caja.max[0]=-1;})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas[0].material.color='#FFF';})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas[1].id=o.muebles[0].piezas[0].id;})).toBe(false);
    expect(bad(o=>{o.muebles[1].id=o.muebles[0].id;})).toBe(false);
    expect(bad(o=>{o.muebles[0].piezas=[];})).toBe(false);
    expect(bad(o=>{(o.muebles[0] as Record<string,unknown>).extra=1;})).toBe(false);
    expect(bad(o=>{o.muebles=Array.from({length:MAX_FURNITURE+1},(_,i)=>({...o.muebles[1],id:`x${i}`,piezas:o.muebles[1].piezas.map(p=>({...p,id:`x${i}/${p.id}`}))}));})).toBe(false);
  });
});
