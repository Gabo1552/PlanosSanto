import { expect,it } from 'vitest';
import { BodyLimitError,limitedBody,sameOrigin } from '../lib/http';
it('admite origen del navegador aunque Next use una URL interna diferente',()=>{
  expect(sameOrigin(new Request('http://localhost:3000/api/projects',{headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))).toBe(true);
  expect(sameOrigin(new Request('http://localhost:3000/api/projects',{headers:{host:'127.0.0.1:3000',origin:'https://attacker.example'}}))).toBe(false);
});
it('limita cuerpos por bytes recibidos incluso sin content-length',async()=>{
  const request=(data:string)=>new Request('http://localhost',{method:'POST',body:data});
  expect(new TextDecoder().decode(await limitedBody(request('1234'),4))).toBe('1234');
  await expect(limitedBody(request('12345'),4)).rejects.toBeInstanceOf(BodyLimitError);
});
