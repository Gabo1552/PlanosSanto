import {describe,expect,it} from 'vitest';
import type {CatalogItem} from '../sketchup_offline/ui/WorkshopPanel';
import {addThickness,applyDraft,changeKind,chooseThickness,DEFAULT_THICKNESSES,draftChanged,draftFromItem,groupItems,groupOf,hexColor,linkName,nameCollision,newDraft,parseMeasure,removeThickness,rgbFromHex,setThickness,standardThicknesses,type FichaItem} from '../sketchup_offline/ui/materialLibraryModel';

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
 it('+ agrega una fila vacía, − la quita y corre la elección',()=>{
  let draft=draftFromItem(item({thicknessMm:18}));
  expect(draft.thicknesses[draft.chosen!]).toBe('18');
  draft=removeThickness(draft,0);expect(draft.thicknesses[draft.chosen!]).toBe('18');
  draft=removeThickness(draft,draft.chosen!);expect(draft.chosen).toBeNull();
  draft=addThickness(draft);expect(draft.thicknesses.at(-1)).toBe('');
  draft=chooseThickness(setThickness(draft,draft.thicknesses.length-1,'16'),draft.thicknesses.length-1);
  const saved=applyDraft(item({thicknessMm:18}),draft).item!;
  expect(saved.thicknessMm).toBe(16);expect(saved.thicknessesMm).toEqual([5,12,15,16,25]);
  let full=newDraft('sheet');for(let index=0;index<40;index++)full=addThickness(full);
  expect(full.thicknesses).toHaveLength(32);
 });
 it('cambiar el tipo trae la lista del nuevo tipo solo si la anterior no se tocó',()=>{
  const draft=newDraft('unknown');
  expect(changeKind(draft,'edge').thicknesses).toEqual(['0,45','2']);
  expect(changeKind(newDraft('sheet'),'edge').thicknesses).toEqual(['0,45','2']);
  const edited=setThickness(newDraft('sheet'),0,'4');
  expect(changeKind(edited,'edge').thicknesses[0]).toBe('4');
  expect(changeKind(chooseThickness(newDraft('sheet'),4),'edge').thicknesses).toHaveLength(6);
  expect(changeKind(newDraft('sheet'),'edge').price.unit).toBe('metro');
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
  const chosenEmpty=applyDraft(base,setThickness(draftFromItem(base),draftFromItem(base).chosen!,''));
  expect(Object.values(chosenEmpty.errors.rows!)).toContain('Escribí el espesor elegido.');
 });
 it('arma la ficha completa de una placa y de un canto',()=>{
  const sheet=applyDraft(item(),{...chooseThickness(draftFromItem(item()),4),sku:' MB18 ',supplier:'Maderera',notes:'Lista oct.',lengthMm:'2750',widthMm:'1830',grain:'false',price:{amount:'95000',currency:'ARS',unit:'placa',date:'2026-10-01',source:'Lista'}}).item!;
  expect(sheet).toMatchObject({sku:'MB18',supplier:'Maderera',notes:'Lista oct.',thicknessMm:18,thicknessesMm:[3,5,12,15,18,25],lengthMm:2750,widthMm:1830,grain:false,price:{amount:95000,currency:'ARS',unit:'placa',date:'2026-10-01',source:'Lista'}});
  const edgeBase=item({kind:'edge',lengthMm:999,grain:true});
  const edge=applyDraft(edgeBase,{...chooseThickness(draftFromItem(edgeBase),0),widthMm:'22'}).item!;
  expect(edge).toMatchObject({kind:'edge',thicknessMm:0.45,thicknessesMm:[0.45,2],widthMm:22,lengthMm:999,grain:true,price:null});
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
