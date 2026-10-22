import {describe,expect,it} from 'vitest';
import {buildSections,codeText,edgeLabel,edgeTotals,filterPieces,grainSymbol,grandTotals,sectionTotals,type CutlistData,type CutlistEdge,type CutlistPiece} from '../sketchup_offline/ui/cutlistModel';

const edge=(side:CutlistEdge['side'],lengthMm:number,extra:Partial<CutlistEdge>={}):CutlistEdge=>({side,status:'none',lengthMm,...extra});
function piece(id:string,extra:Partial<CutlistPiece>={}):CutlistPiece{
  return {id,ids:[id],code:'',codes:[],name:`Pieza ${id}`,furnitureId:'1',furnitureName:'Bajo mesada',quantity:1,lengthMm:700,widthMm:450,thicknessMm:18,rectangular:true,mirrored:false,
    material:{source:'catalog',catalogId:'mel',name:'Melamina Blanca',sku:'MEL-18'},sectionKey:'catalog:mel|18.0',
    edges:[edge('arr',700,{status:'catalog',catalogId:'abs',sku:'ABS-22',name:'Canto ABS 22'}),edge('aba',700),edge('izq',450,{status:'observed',observedIds:['m9'],name:'Canto pintado'}),edge('der',450)],
    grain:'none',notes:[],...extra};
}
const data:CutlistData={schema:1,complete:true,readOnly:true,furniture:[{id:'1',name:'Bajo mesada'},{id:'2',name:'Alacena'}],
  sections:[{key:'catalog:mel|18.0',source:'catalog',name:'Melamina Blanca',sku:'MEL-18',thicknessMm:18,format:[2750,1830],grain:false},
            {key:'catalog:mel|15.0',source:'catalog',name:'Melamina Blanca',sku:'MEL-18',thicknessMm:15},
            {key:'none|18.0',source:'none',name:'Sin material',thicknessMm:18}],
  pieces:[piece('1/1',{code:'M01·P01',codes:['M01·P01','M01·P02'],ids:['1/1','1/2'],quantity:2,name:'Lateral'}),
          piece('1/3',{code:'M01·P03',codes:['M01·P03'],name:'Estante',lengthMm:600,widthMm:300,edges:[edge('arr',600,{status:'catalog',catalogId:'abs',sku:'ABS-22',name:'Canto ABS 22'}),edge('aba',600),edge('izq',300,{status:'observed',observedIds:['m9'],name:'Canto pintado'}),edge('der',300)]}),
          piece('1/4',{name:'Fondo',thicknessMm:15,sectionKey:'catalog:mel|15.0',lengthMm:400,widthMm:300,edges:[edge('arr',400),edge('aba',400),edge('izq',300),edge('der',300)]}),
          piece('2/1',{name:'Puerta alacena',furnitureId:'2',furnitureName:'Alacena',material:null,sectionKey:'none|18.0',edges:[edge('arr',700,{status:'unknown'}),edge('aba',700),edge('izq',450),edge('der',450)]})]};

describe('lista de piezas: secciones y filtros',()=>{
  it('agrupa por material y espesor en el orden de Ruby y omite secciones vacías',()=>{
    const sections=buildSections(data);
    expect(sections.map(s=>[s.info.name,s.info.thicknessMm,s.pieces.map(p=>p.id)])).toEqual([['Melamina Blanca',18,['1/1','1/3']],['Melamina Blanca',15,['1/4']],['Sin material',18,['2/1']]]);
    expect(buildSections(data,{furnitureId:'2'}).map(s=>s.info.key)).toEqual(['none|18.0']);
  });
  it('filtra por mueble y busca por código o nombre sin tildes ni mayúsculas',()=>{
    expect(filterPieces(data.pieces,{furnitureId:'1'}).map(p=>p.id)).toEqual(['1/1','1/3','1/4']);
    expect(filterPieces(data.pieces,{query:'p02'}).map(p=>p.id)).toEqual(['1/1']);
    expect(filterPieces(data.pieces,{query:'ESTANTÉ'}).map(p=>p.id)).toEqual(['1/3']);
    expect(filterPieces(data.pieces,{query:'puerta',furnitureId:'1'})).toEqual([]);
  });
  it('una pieza con sección desconocida no se pierde',()=>{
    const extra={...data,pieces:[...data.pieces,piece('3/1',{sectionKey:'model:x|9.0',thicknessMm:9,material:{source:'model',name:'Pintura',observedId:'x'}})]};
    expect(buildSections(extra).at(-1)!.info).toMatchObject({key:'model:x|9.0',source:'model',name:'Pintura',thicknessMm:9});
  });
});

describe('lista de piezas: totales',()=>{
  it('suma piezas, m² netos y metros por canto con la cantidad',()=>{
    const [white]=buildSections(data);
    // 2 × 0,7 × 0,45 + 0,6 × 0,3 = 0,63 + 0,18
    expect(white.totals).toMatchObject({rows:2,pieces:3,areaM2:0.81});
    expect(white.totals.edges).toEqual([
      {key:'catalog:abs',label:'ABS-22',name:'Canto ABS 22',linked:true,metres:2.0},  // 2 × 0,7 + 0,6
      {key:'model:m9',label:'Canto pintado',name:'Canto pintado',linked:false,metres:1.2}]); // 2 × 0,45 + 0,3
    expect(sectionTotals([]).edges).toEqual([]);
  });
  it('los lados sin canto o sin verificar no suman metros',()=>{
    expect(edgeTotals([data.pieces[3]])).toEqual([]);
  });
  it('totales generales de lo visible',()=>{
    expect(grandTotals(buildSections(data))).toEqual({sections:3,rows:4,pieces:5,areaM2:1.245,edgeMetres:3.2});
    expect(grandTotals(buildSections(data,{query:'fondo'}))).toEqual({sections:1,rows:1,pieces:1,areaM2:0.12,edgeMetres:0});
  });
});

describe('lista de piezas: textos de celda',()=>{
  it('chip de canto: SKU de la ficha, nombre si es del modelo, raya si no hay',()=>{
    const [arr,aba,izq]=data.pieces[0].edges;
    expect(edgeLabel(arr)).toBe('ABS-22');expect(edgeLabel(aba)).toBe('—');expect(edgeLabel(izq)).toBe('Canto pin…');
    expect(edgeLabel(edge('der',1,{status:'unknown'}))).toBe('—');
  });
  it('código agrupado muestra el módulo una vez',()=>{
    expect(codeText(data.pieces[0])).toBe('M01·P01, P02');
    expect(codeText(data.pieces[2])).toBe('—');
    expect(codeText(piece('x',{codes:['P1','P2','P3','P4','P5']}))).toBe('P1, P2, P3 +2');
  });
  it('veta',()=>{
    expect(grainSymbol('length').symbol).toBe('↔');expect(grainSymbol('width').symbol).toBe('↕');
    expect(grainSymbol('none')).toEqual({symbol:'—',label:'Sin veta'});expect(grainSymbol(null).label).toMatch(/sin definir/);
  });
});
