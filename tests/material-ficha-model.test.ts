import {describe,expect,it} from 'vitest';
import type {CatalogItem} from '../sketchup_offline/ui/WorkshopPanel';
import {addThickness,addWidth,applyDraft,changeKind,chooseThickness,DEFAULT_THICKNESSES,DEFAULT_WIDTHS,draftChanged,draftFromItem,groupItems,groupOf,hexColor,inList,linkName,nameCollision,newDraft,parseMeasure,removeThickness,removeWidth,rgbFromHex,setThickness,setWidth,standardThicknesses,standardWidths,thicknessSummary,type FichaItem} from '../sketchup_offline/ui/materialLibraryModel';

// 0.8.17: lógica pura de la grilla agrupada y de «Propiedades del material».
const item=(patch:Partial<FichaItem>={}):FichaItem=>({id:'a',name:'Roble 18',kind:'sheet',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'2026-10-22T00:00:00Z',sourceHash:'0'.repeat(64),observed:{},...patch});

describe('Grilla agrupada por tipo',()=>{
 it('ordena Placas, Cantos, Otros y Sin tipo, sin grupos vacíos y conservando el orden',()=>{
  const rows=[item({id:'1',kind:'edge'}),item({id:'2',kind:'unknown'}),item({id:'3'}),item({id:'4',kind:'veneer'}),item({id:'5'}),item({id:'6',kind:'raro'})];
  const groups=groupItems(rows);
  expect(groups.map(group=>[group.key,group.label,group.items.map(row=>row.id)])).toEqual([['sheet','Placas',['3','5']],['edge','Cantos',['1']],['other','Otros materiales',['4']],['unknown','Sin tipo',['2','6']]]);
  expect(groupItems([item({kind:'edge'})]).map(group=>group.key)).toEqual(['edge']);
  expect(groupItems([])).toEqual([]);
  expect(['solid_wood','dimensional','veneer'].map(groupOf)).toEqual(['other','other','other']);
 });
});

describe('Espesores estándar',()=>{
 it('predeterminados de Gabriel por tipo',()=>{
  expect(DEFAULT_THICKNESSES).toEqual({sheet:[3,5,12,15,18,25],edge:[0.45,2]});
  expect(newDraft('sheet').thicknesses).toEqual(['3','5','12','15','18','25']);
  expect(newDraft('edge').thicknesses).toEqual(['0,45','2']);
  expect(newDraft('unknown').thicknesses).toEqual([]);
 });
 it('una ficha v2 (sin lista) muestra los del tipo más su espesor; la lista guardada manda',()=>{
  expect(standardThicknesses(item({thicknessMm:16}))).toEqual([3,5,12,15,16,18,25]);
  expect(standardThicknesses(item({kind:'edge',thicknessMm:1}))).toEqual([0.45,1,2]);
  expect(standardThicknesses(item({thicknessesMm:[18],thicknessMm:18}))).toEqual([18]);
  expect(standardThicknesses(item({thicknessesMm:[25,18],thicknessMm:9}))).toEqual([9,18,25]);
  expect(standardThicknesses(item({thicknessesMm:[]}),{sheet:[19],edge:[1]})).toEqual([]);
  expect(standardThicknesses(item(),{sheet:[19],edge:[1]})).toEqual([19]);
 });
 it('acepta coma, punto y «mm»; rechaza lo que no es medida',()=>{
  expect(['18','0,45','0.45 mm','2mm',' 12 ','',' '].map(parseMeasure)).toEqual([18,0.45,0.45,2,12,null,null]);
  for(const bad of ['0','-3','abc','1e3','18,5,2','200000'])expect(Number.isNaN(parseMeasure(bad) as number),bad).toBe(true);
 });
 // Biblioteca v4 (0.8.20): el canto conserva su espesor elegido (se descuenta del corte); la placa no tiene uno.
 it('+ agrega una fila vacía, − la quita y corre la elección del canto',()=>{
  const edge=item({kind:'edge',thicknessMm:2,thicknessesMm:[0.45,1,2]});
  let draft=draftFromItem(edge);
  expect(draft.thicknesses[draft.chosen!]).toBe('2');
  draft=removeThickness(draft,0);expect(draft.thicknesses[draft.chosen!]).toBe('2');
  draft=removeThickness(draft,draft.chosen!);expect(draft.chosen).toBeNull();
  draft=addThickness(draft);expect(draft.thicknesses.at(-1)).toBe('');
  draft=chooseThickness(setThickness(draft,draft.thicknesses.length-1,'1,5'),draft.thicknesses.length-1);
  const saved=applyDraft(edge,draft).item!;
  expect(saved.thicknessMm).toBe(1.5);expect(saved.thicknessesMm).toEqual([1,1.5]);
  let full=newDraft('sheet');for(let index=0;index<40;index++)full=addThickness(full);
  expect(full.thicknesses).toHaveLength(32);
 });
 it('una placa no tiene espesor elegido: todos los de la lista valen',()=>{
  const old=item({thicknessMm:16});// registro viejo (v2/v3) con «su» espesor
  const draft=draftFromItem(old);
  expect(draft.chosen).toBeNull();expect(draft.thicknesses).toEqual(['3','5','12','15','16','18','25']);
  expect(chooseThickness(draft,2).chosen).toBeNull();
  const saved=applyDraft(old,removeThickness(draft,0)).item!;
  expect(saved.thicknessMm).toBeNull();expect(saved.thicknessesMm).toEqual([5,12,15,16,18,25]);
  expect(saved.widthsMm).toEqual([]);
  expect(applyDraft(old,{...draft,thicknesses:[]}).item!.thicknessesMm).toEqual([]);
  expect(inList([15,18],17.95)).toBe(true);expect(inList([15,18],16)).toBe(false);
  expect([[18],[15,18],[12,15,18],[3,5,12,15,18,25],[]].map(thicknessSummary)).toEqual(['18 mm','15 y 18 mm','12, 15 y 18 mm','3 a 25 mm','']);
 });
 it('cambiar el tipo trae la lista del nuevo tipo solo si la anterior no se tocó',()=>{
  const draft=newDraft('unknown');
  expect(changeKind(draft,'edge').thicknesses).toEqual(['0,45','2']);
  expect(changeKind(draft,'edge').widths).toEqual(['22','45']);
  expect(changeKind(newDraft('sheet'),'edge').thicknesses).toEqual(['0,45','2']);
  const edited=setThickness(newDraft('sheet'),0,'4');
  expect(changeKind(edited,'edge').thicknesses[0]).toBe('4');
  expect(changeKind(chooseThickness(newDraft('edge'),1),'sheet').thicknesses).toEqual(['0,45','2']);
  expect(changeKind(chooseThickness(newDraft('edge'),1),'sheet').chosen).toBeNull();
  expect(changeKind(newDraft('edge'),'sheet').widths).toEqual([]);
  expect(changeKind(newDraft('sheet'),'edge').price.unit).toBe('metro');
 });
});

describe('Anchos estándar del canto',()=>{
 it('22 y 45 mm de fábrica; un registro viejo suma su ancho; otros tipos no tienen',()=>{
  expect(DEFAULT_WIDTHS).toEqual([22,45]);
  expect(newDraft('edge').widths).toEqual(['22','45']);expect(newDraft('sheet').widths).toEqual([]);
  expect(standardWidths(item({kind:'edge',widthMm:19}))).toEqual([19,22,45]);
  expect(standardWidths(item({kind:'edge',widthsMm:[45]}))).toEqual([45]);
  expect(standardWidths(item({kind:'edge'}),{...DEFAULT_THICKNESSES,edgeWidths:[33]})).toEqual([33]);
  expect(standardWidths(item({widthMm:1830}))).toEqual([]);// el ancho de una placa es su formato, no un ancho estándar
 });
 it('+ y − editan la lista; el ancho suelto del canto queda vacío',()=>{
  const edge=item({kind:'edge',thicknessMm:0.45,widthMm:22});
  let draft=draftFromItem(edge);
  expect(draft.widths).toEqual(['22','45']);expect(draft.widthMm).toBe('');
  draft=setWidth(addWidth(draft),2,'33');
  const saved=applyDraft(edge,removeWidth(draft,0)).item!;
  expect(saved).toMatchObject({widthMm:null,widthsMm:[33,45],thicknessMm:0.45});
  expect(applyDraft(edge,setWidth(draft,1,'22')).errors.widthRows?.[1]).toBe('Ese ancho ya está en la lista.');
  expect(applyDraft(edge,setWidth(draft,1,'ancho')).errors.widths).toBe('Revisá los anchos marcados.');
  expect(draftChanged(edge,draftFromItem(edge))).toBe(false);expect(draftChanged(edge,draft)).toBe(true);
 });
});

describe('Aplicar la ficha',()=>{
 it('valida nombre, espesores repetidos o inválidos, medidas y precio sin exigir datos de pedido',()=>{
  const base=item({thicknessMm:18});
  expect(applyDraft(base,{...draftFromItem(base),name:'  '}).errors.name).toMatch(/nombre/);
  const repeated=applyDraft(base,setThickness(draftFromItem(base),0,'18'));
  expect(repeated.item).toBeUndefined();expect(Object.values(repeated.errors.rows!)).toContain('Ese espesor ya está en la lista.');
  expect(applyDraft(base,setThickness(draftFromItem(base),1,'cinco')).errors.rows?.[1]).toMatch(/espesor/);
  expect(applyDraft(base,{...draftFromItem(base),lengthMm:'-1'}).errors.lengthMm).toMatch(/Largo/);
  expect(applyDraft(base,{...draftFromItem(base),price:{...draftFromItem(base).price,amount:'abc'}}).errors.price).toMatch(/importe/);
  expect(applyDraft(base,{...draftFromItem(base),price:{...draftFromItem(base).price,amount:'100',source:' '}}).errors.price).toMatch(/fuente/);
  const empty=applyDraft(item(),draftFromItem(item()));
  expect(empty.item).toBeDefined();expect(empty.errors).toEqual({});
  const edge=item({kind:'edge',thicknessMm:2});
  const chosenEmpty=applyDraft(edge,setThickness(draftFromItem(edge),draftFromItem(edge).chosen!,''));
  expect(Object.values(chosenEmpty.errors.rows!)).toContain('Escribí el espesor elegido.');
 });
 it('arma la ficha completa de una placa y de un canto',()=>{
  const sheet=applyDraft(item(),{...draftFromItem(item()),sku:' MB18 ',supplier:'Maderera',notes:'Lista oct.',lengthMm:'2750',widthMm:'1830',grain:'false',price:{amount:'95000',currency:'ARS',unit:'placa',date:'2026-10-01',source:'Lista'}}).item!;
  expect(sheet).toMatchObject({sku:'MB18',supplier:'Maderera',notes:'Lista oct.',thicknessMm:null,thicknessesMm:[3,5,12,15,18,25],widthsMm:[],lengthMm:2750,widthMm:1830,grain:false,price:{amount:95000,currency:'ARS',unit:'placa',date:'2026-10-01',source:'Lista'}});
  const edgeBase=item({kind:'edge',lengthMm:999,grain:true});
  const edge=applyDraft(edgeBase,chooseThickness(draftFromItem(edgeBase),0)).item!;
  expect(edge).toMatchObject({kind:'edge',thicknessMm:0.45,thicknessesMm:[0.45,2],widthMm:null,widthsMm:[22,45],lengthMm:999,grain:true,price:null});
 });
 it('detecta cambios sin contar la fecha del precio vacío',()=>{
  const base=item({thicknessMm:18});
  expect(draftChanged(base,draftFromItem(base))).toBe(false);
  expect(draftChanged(base,{...draftFromItem(base),sku:'X'})).toBe(true);
  expect(draftChanged(base,{...draftFromItem(base),price:{...draftFromItem(base).price,currency:'USD'}})).toBe(false);
  expect(draftChanged(base,addThickness(draftFromItem(base)))).toBe(true);
 });
});

describe('Nombre y color',()=>{
 it('avisa nombres que el vínculo automático no podría distinguir',()=>{
  expect(linkName('  [Roble   18] ')).toBe('roble 18');
  const rows=[{id:'a',name:'Roble 18'},{id:'b',name:'Canto'}];
  expect(nameCollision(rows,'b','roble  18')).toBe(true);
  expect(nameCollision(rows,'a','Roble 18')).toBe(false);
  expect(nameCollision(rows,undefined,'')).toBe(false);
 });
 it('convierte color del modelo a hex y vuelta',()=>{
  expect(hexColor([143,98,64])).toBe('#8f6240');expect(hexColor([300,0,0])).toBeNull();expect(hexColor(null)).toBeNull();
  expect(rgbFromHex('#d0b599')).toEqual([208,181,153]);expect(rgbFromHex('d0b599')).toEqual([208,181,153]);expect(rgbFromHex('#xyz')).toBeNull();
 });
});

// Keeps the CatalogItem import meaningful for the type check of FichaItem.
const typed:CatalogItem=item();void typed;
