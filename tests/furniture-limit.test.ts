import {describe,expect,it} from 'vitest';
import {editSchema,MAX_FURNITURE} from '../lib/model';

// 0.8.30: el tope de muebles por guía pasó de 100 a 500 (el límite real es la geometría y el tamaño de la guía).
const edit=(count:number)=>({revision:0,furniture:Array.from({length:count},(_,i)=>({id:`m${i}`,explosion:0,zoom:1,pieces:[],notes:[]}))});
describe('tope de muebles por guía',()=>{
  it('es 500',()=>expect(MAX_FURNITURE).toBe(500));
  it('acepta más de 100 y hasta 500 muebles',()=>{
    expect(editSchema.safeParse(edit(150)).success).toBe(true);
    expect(editSchema.safeParse(edit(500)).success).toBe(true);
  });
  it('rechaza 501',()=>expect(editSchema.safeParse(edit(501)).success).toBe(false));
});
