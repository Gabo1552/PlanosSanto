import {describe,expect,it} from 'vitest';
import {CSV_HEADER,DEFAULT_OPTIONS,buildEdgeSections,buildSections,codeText,cutlistCsv,designationDetail,edgeTotals,filterPieces,finalMm,formatM2,formatM3,formatMetres,grainNote,hexColor,
  missingLabels,parseOptions,rowLetter,sectionTitle,sheetTotals,stripDesignation,summaryRows,
  type CutlistData,type CutlistEdge,type CutlistPiece,type CutlistStrip} from '../sketchup_offline/ui/cutlistModel';

const LABELS={arr:'Longitud del borde 1',aba:'Longitud del borde 2',izq:'Ancho del borde 1',der:'Ancho del borde 2'} as const;
const edge=(side:CutlistEdge['side'],lengthMm:number,extra:Partial<CutlistEdge>={}):CutlistEdge=>({side,status:'none',lengthMm,...extra});
const abs=(side:CutlistEdge['side'],lengthMm:number)=>edge(side,lengthMm,{status:'catalog',catalogId:'abs',sku:'ABS-22',name:'Canto ABS 22',edgeKey:'catalog:abs'});
const painted=(side:CutlistEdge['side'],lengthMm:number)=>edge(side,lengthMm,{status:'observed',observedIds:['m9'],name:'Canto pintado',edgeKey:'model:m9'});
// Tiras como las arma Ruby (Cutlist.strips): ABS con ancho de ficha 22; el pintado, con el espesor de la pieza.
function strips(edges:CutlistEdge[],thickness:number,rectangular=true):CutlistStrip[]{
  return edges.filter(e=>e.edgeKey).map(e=>({side:e.side,label:LABELS[e.side],edgeKey:e.edgeKey!,lengthMm:e.lengthMm,widthMm:e.edgeKey==='catalog:abs'?22:thickness,widthApprox:e.edgeKey!=='catalog:abs',approximate:!rectangular}));
}
function piece(id:string,extra:Partial<CutlistPiece>={}):CutlistPiece{
  const base:CutlistPiece={id,ids:[id],code:'',codes:[],name:`Pieza ${id}`,furnitureId:'1',furnitureName:'Bajo mesada',quantity:1,lengthMm:700,widthMm:450,thicknessMm:18,rectangular:true,mirrored:false,
    material:{source:'catalog',catalogId:'mel',name:'Melamina Blanca',sku:'MEL-18'},sectionKey:'catalog:mel|18.0',
    edges:[abs('arr',700),edge('aba',700),painted('izq',450),edge('der',450)],strips:[],grain:'none',notes:[],...extra};
  return {...base,strips:extra.strips||strips(base.edges,base.thicknessMm,base.rectangular)};
}
const data:CutlistData={schema:1,complete:true,readOnly:true,modelName:'Cocina Ana',unit:'mm',furniture:[{id:'1',name:'Bajo mesada'},{id:'2',name:'Alacena'}],
  sections:[{key:'catalog:mel|18.0',source:'catalog',kind:'sheet',name:'Melamina Blanca',sku:'MEL-18',catalogId:'mel',thicknessMm:18,format:[2750,1830],grain:true,colorRgb:[240,238,230],missing:[]},
            {key:'catalog:mel|15.0',source:'catalog',kind:'sheet',name:'Melamina Blanca',sku:'MEL-18',catalogId:'mel',thicknessMm:15,missing:['veta']},
            {key:'none|18.0',source:'none',kind:'unknown',name:'Sin material',thicknessMm:18,missing:[]}],
  edgeSections:[{key:'catalog:abs',source:'catalog',kind:'edge',name:'Canto ABS 22',sku:'ABS-22',catalogId:'abs',thicknessMm:0.45,widthMm:22,colorRgb:[30,60,200],missing:[]},
                {key:'model:m9',source:'model',kind:'edge',name:'Canto pintado',observedIds:['m9'],thicknessMm:null,widthMm:null,missing:['ficha']}],
  pieces:[piece('1/1',{code:'M01·P01',codes:['M01·P01','M01·P02'],ids:['1/1','1/2'],quantity:2,name:'Lateral'}),
          piece('1/3',{code:'M01·P03',codes:['M01·P03'],name:'Estante',lengthMm:600,widthMm:300,edges:[abs('arr',600),edge('aba',600),painted('izq',300),edge('der',300)],grain:'width'}),
          piece('1/4',{name:'Fondo',thicknessMm:15,sectionKey:'catalog:mel|15.0',lengthMm:400,widthMm:300,edges:[edge('arr',400),edge('aba',400),edge('izq',300),edge('der',300)]}),
          piece('2/1',{name:'Puerta alacena',furnitureId:'2',furnitureName:'Alacena',material:null,sectionKey:'none|18.0',rectangular:false,edges:[edge('arr',700,{status:'unknown'}),edge('aba',700),edge('izq',450),edge('der',450)]})]};

describe('listado de piezas: secciones y filtros',()=>{
  it('agrupa las placas por material y espesor en el orden de Ruby y omite secciones vacías',()=>{
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
    expect(buildSections(extra).at(-1)!.info).toMatchObject({key:'model:x|9.0',source:'model',kind:'unknown',name:'Pintura',thicknessMm:9});
  });
});

describe('listado de piezas: secciones de cantos',()=>{
  it('una sección por canto con una tira por pieza y lado, letras A, B, C…',()=>{
    const [first,second]=buildEdgeSections(data);
    expect(first.info.key).toBe('catalog:abs');
    expect(first.rows.map(r=>[r.letter,stripDesignation(r.piece,r.strip),r.piece.quantity,r.strip.lengthMm])).toEqual([['A','Lateral – Longitud del borde 1',2,700],['B','Estante – Longitud del borde 1',1,600]]);
    expect(second.rows.map(r=>[r.letter,stripDesignation(r.piece,r.strip)])).toEqual([['A','Lateral – Ancho del borde 1'],['B','Estante – Ancho del borde 1']]);
    // 2 × 0,7 + 0,6 = 2 m; × 22 mm = 0,044 m²; × 0,45 mm.
    expect(first.totals).toEqual({strips:3,lengthM:2,areaM2:0.044,volumeM3:0.0000198});
    // Sin ficha: ancho = espesor de la pieza (18 mm) y sin m³.
    expect(second.totals).toEqual({strips:3,lengthM:1.2,areaM2:0.0216,volumeM3:null});
  });
  it('los cantos siguen el filtro y un canto que Ruby no listó no se pierde',()=>{
    expect(buildEdgeSections(data,{query:'estante'}).map(s=>s.rows.length)).toEqual([1,1]);
    expect(buildEdgeSections(data,{furnitureId:'2'})).toEqual([]);
    const orphan=buildEdgeSections({...data,edgeSections:[]});
    expect(orphan.map(s=>[s.info.key,s.info.name,s.info.missing])).toEqual([['catalog:abs','Canto ABS 22',['ficha']],['model:m9','Canto pintado',['ficha']]]);
  });
  it('letras de fila más allá de la Z',()=>{
    expect([0,1,25,26,27,51,52,701,702].map(rowLetter)).toEqual(['A','B','Z','AA','AB','AZ','BA','ZZ','AAA']);
  });
});

describe('listado de piezas: resumen por material',()=>{
  it('placas, después cantos y al final lo que no tiene tipo, con sus Σ y avisos',()=>{
    const rows=summaryRows(buildSections(data),buildEdgeSections(data));
    expect(rows.map(r=>[r.kind,r.name,r.count])).toEqual([['sheet','Melamina Blanca',3],['sheet','Melamina Blanca',1],['edge','Canto ABS 22',3],['edge','Canto pintado',3],['unknown','Sin material',1]]);
    // 2 × 0,7 × 0,45 + 0,6 × 0,3 = 0,81 m²; × 18 mm = 0,01458 m³; largo 2 × 0,7 + 0,6.
    expect(rows[0]).toMatchObject({lengthM:2,areaM2:0.81,volumeM3:0.01458,color:'#f0eee6',warnings:[],catalogId:'mel',thicknessMm:18});
    expect(rows[1].warnings).toEqual(['Veta no definida']);
    expect(rows[2]).toMatchObject({thicknessMm:0.45,widthMm:22,widthApprox:false,color:'#1e3cc8'});
    expect(rows[3]).toMatchObject({widthMm:18,widthApprox:true,warnings:['Sin ficha en la biblioteca'],volumeM3:null,catalogId:null});
    // Sin tipo: las celdas Σ quedan rayadas (sin área ni volumen).
    expect(rows[4]).toMatchObject({kind:'unknown',areaM2:null,volumeM3:null,color:null});
  });
  it('Σ con las mismas cuentas que Ruby, sin redondear dos veces',()=>{
    expect(sheetTotals([data.pieces[0]])).toEqual({pieces:2,lengthM:1.4,areaM2:0.63,volumeM3:0.01134});
    expect(sheetTotals([])).toEqual({pieces:0,lengthM:0,areaM2:0,volumeM3:0});
    expect(edgeTotals([],0.45)).toEqual({strips:0,lengthM:0,areaM2:0,volumeM3:0});
  });
  it('avisos de la ficha y color de muestra',()=>{
    expect(missingLabels(['ancho','SKU','espesor','largo','veta','ficha','tipo','precio'])).toEqual(['Ancho no definido','SKU no definido','Espesor no definido','Largo no definido','Veta no definida','Sin ficha en la biblioteca','Tipo no definido','Precio no definido']);
    expect(missingLabels(undefined)).toEqual([]);
    expect(hexColor([255,0,16])).toBe('#ff0010');expect(hexColor([256,0,0])).toBeNull();expect(hexColor(null)).toBeNull();
  });
});

describe('listado de piezas: textos de celda',()=>{
  it('designación con detalle chico: códigos, mueble, medidas y material',()=>{
    expect(designationDetail(data.pieces[0],data.sections[0])).toBe('M01·P01, P02 · Bajo mesada · 700 × 450 × 18 · Melamina Blanca');
    expect(designationDetail(data.pieces[3])).toBe('Alacena · 700 × 450 × 18 · Sin material');
  });
  it('medidas finales en mm con «~» si son aproximadas, y unidades del resumen',()=>{
    expect(finalMm(609.6)).toBe('609,6 mm');expect(finalMm(1150,true)).toBe('~ 1150 mm');
    expect(formatMetres(3.028)).toBe('3,03 m');expect(formatM2(0.24)).toBe('0,24 m²');expect(formatM3(0.0043)).toBe('0,004 m³');
    expect(sectionTitle({name:'Melamina',thicknessMm:18})).toBe('Melamina / 18 mm');expect(sectionTitle({name:'Canto',thicknessMm:null})).toBe('Canto');
  });
  it('código agrupado muestra el módulo una vez',()=>{
    expect(codeText(data.pieces[0])).toBe('M01·P01, P02');
    expect(codeText(data.pieces[2])).toBe('');
    expect(codeText(piece('x',{codes:['P1','P2','P3','P4','P5']}))).toBe('P1, P2, P3 +2');
  });
  it('nota de fibra solo para placas con veta',()=>{
    const [white,thin]=buildSections(data);
    expect(grainNote(white.info,white.pieces)).toBe('La fibra sigue la longitud, salvo donde se indica');
    expect(grainNote(white.info,[data.pieces[0]])).toBe('La fibra sigue la longitud');
    expect(grainNote(thin.info,thin.pieces)).toBeUndefined();
  });
});

describe('listado de piezas: opciones y CSV',()=>{
  it('opciones guardadas: valores válidos y el resto por defecto',()=>{
    expect(parseOptions(null)).toEqual(DEFAULT_OPTIONS);expect(parseOptions('{roto')).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions(JSON.stringify({volume:false,area:'no',extra:true}))).toEqual({...DEFAULT_OPTIONS,volume:false});
  });
  it('CSV de lo que se ve: «;», coma decimal, CRLF, una fila por pieza y por tira',()=>{
    const csv=cutlistCsv(buildSections(data),buildEdgeSections(data));
    const lines=csv.split('\r\n');expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe(CSV_HEADER.join(';'));
    expect(lines.slice(1,-1)).toEqual([
      'Placa;Melamina Blanca;18;A;Lateral;Bajo mesada;M01·P01, P02;2;700;450;18;No;',
      'Placa;Melamina Blanca;18;B;Estante;Bajo mesada;M01·P03;1;600;300;18;No;',
      'Placa;Melamina Blanca;15;A;Fondo;Bajo mesada;;1;400;300;15;No;Veta no definida',
      'Sin tipo;Sin material;18;A;Puerta alacena;Alacena;;1;700;450;18;Sí;',
      'Canto;Canto ABS 22;0,45;A;Lateral – Longitud del borde 1;Bajo mesada;M01·P01, P02;2;700;22;0,45;No;',
      'Canto;Canto ABS 22;0,45;B;Estante – Longitud del borde 1;Bajo mesada;M01·P03;1;600;22;0,45;No;',
      'Canto;Canto pintado;;A;Lateral – Ancho del borde 1;Bajo mesada;M01·P01, P02;2;450;18;;Sí;Sin ficha en la biblioteca',
      'Canto;Canto pintado;;B;Estante – Ancho del borde 1;Bajo mesada;M01·P03;1;300;18;;Sí;Sin ficha en la biblioteca']);
  });
  it('CSV protege comillas, separadores y fórmulas',()=>{
    const tricky={...data,pieces:[piece('9/1',{name:'=SUMA(A1); "tapa"',furnitureName:'+Mueble',edges:[edge('arr',700),edge('aba',700),edge('izq',450),edge('der',450)]})]};
    const line=cutlistCsv(buildSections(tricky),[]).split('\r\n')[1];
    expect(line).toBe('Placa;Melamina Blanca;18;A;"\'=SUMA(A1); ""tapa""";\'+Mueble;;1;700;450;18;No;');
  });
});
