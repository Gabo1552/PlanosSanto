import { ZodError } from 'zod';
export class BodyLimitError extends Error {}
export async function limitedBody(req:Request,limit:number):Promise<Uint8Array<ArrayBuffer>> {
  const reader=req.body?.getReader();
  if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel();throw new BodyLimitError('La carga supera el tamaño permitido.');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  return result;
}
export function fail(error:unknown) {
  const e=error as Error & {code?:string};
  if(e.message==='CONFLICT') return Response.json({error:'El proyecto cambió en otra pestaña. Recargá antes de guardar.'},{status:409});
  if(e.code==='ENOENT') return Response.json({error:'Proyecto no encontrado.'},{status:404});
  if(error instanceof BodyLimitError) return Response.json({error:error.message},{status:413});
  if(error instanceof SyntaxError) return Response.json({error:'El cuerpo de la solicitud no es JSON válido.'},{status:400});
  if(error instanceof ZodError) return Response.json({error:'Datos inválidos. Revisá nombres, notas y límites del modelo.'},{status:400});
  console.error(e);
  return Response.json({error:'No se pudo completar la operación.'},{status:500});
}
export function sameOrigin(req:Request) {
  const origin=req.headers.get('origin');
  if(!origin)return true;
  try {const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&url.host===(req.headers.get('host')||new URL(req.url).host);}
  catch{return false;}
}
