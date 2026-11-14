import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyDraft,autoSku,draftAutoSku,newDraft,skuThicknesses,withAutoSku,type FichaDraft} from '../sketchup_offline/ui/materialLibraryModel';
import type {FichaItem} from '../sketchup_offline/ui/materialLibraryModel';

// 0.8.34: el SKU se arma solo con el nombre y el espesor. Los mismos casos corren en Ruby (catalog_sku_test.rb).
type Case={name:string;kind:string;thicknessesMm:number[];thicknessMm:number|null;sku:string};
const {cases}=JSON.parse(readFileSync(new URL('./fixtures/auto-sku-cases.json',import.meta.url),'utf8')) as {cases:Case[]};

describe('SKU automático',()=>{
 for(const c of cases)it(`${JSON.stringify(c.name)} (${c.kind}) → ${c.sku||'vacío'}`,()=>{
  expect(autoSku(c.name.trim(),skuThicknesses(c.kind,c.thicknessesMm,c.thicknessMm))).toBe(c.sku);
 });
 it('el formulario lo arma mientras se escribe y respeta uno escrito a mano',()=>{
  let draft:FichaDraft={...newDraft('sheet'),thicknesses:['18']};
  draft=withAutoSku(draft,{...draft,name:'Melamina Gris'});
  expect(draft.sku).toBe('MELAMINA-GRIS-18MM');
  draft=withAutoSku(draft,{...draft,name:'Melamina Gris Humo'});
  expect(draft.sku).toBe('MELAMINA-GRIS-HUMO-18MM');
  draft=withAutoSku(draft,{...draft,thicknesses:['15']});
  expect(draft.sku).toBe('MELAMINA-GRIS-HUMO-15MM');
  draft=withAutoSku(draft,{...draft,sku:'MGH-PROVEEDOR'});
  expect(draft.sku).toBe('MGH-PROVEEDOR');
  draft=withAutoSku(draft,{...draft,name:'Otro nombre'});
  expect(draft.sku).toBe('MGH-PROVEEDOR');
 });
 it('al guardar, un SKU vacío se completa solo',()=>{
  const draft:FichaDraft={...newDraft('edge'),name:'Canto Roble',thicknesses:['0,45','2'],chosen:1};
  expect(draftAutoSku(draft)).toBe('CANTO-ROBLE-2MM');
  const item={id:'x',name:'',kind:'edge',sku:'',supplier:'',thicknessMm:null,widthMm:null,lengthMm:null,grain:null,compatibleIds:[],price:null,favorite:false,approved:false,updatedAt:'',sourceHash:'',observed:{}} as unknown as FichaItem;
  expect(applyDraft(item,draft).item?.sku).toBe('CANTO-ROBLE-2MM');
  expect(applyDraft(item,{...draft,sku:' PROPIO '}).item?.sku).toBe('PROPIO');
 });
});
