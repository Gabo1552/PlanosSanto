import { BodyLimitError,limitedBody,sameOrigin } from '@/lib/http';
import { importRubyDocument } from '@/lib/ruby-import';
import { saveProject } from '@/lib/store';
import { ModelValidationError } from '@/lib/model';
import { ZodError } from 'zod';
export const runtime='nodejs';
export async function POST(req:Request){
  if(!sameOrigin(req))return new Response(null,{status:403});
  try{
    const bytes=await limitedBody(req,30*1024*1024);
    const p=importRubyDocument(JSON.parse(new TextDecoder().decode(bytes)));
    return Response.json(await saveProject(p),{status:201});
  }catch(e){
    if(e instanceof BodyLimitError)return Response.json({error:e.message},{status:413});
    if(e instanceof ZodError||e instanceof SyntaxError)return Response.json({error:'JSON inválido o incompatible con Planos Santo Ruby 0.2.0.'},{status:400});
    if(e instanceof Error && !(e as NodeJS.ErrnoException).code)return Response.json({error:e instanceof ModelValidationError?e.message:`Modelo no admitido: ${e.message}`},{status:422});
    console.error('Ruby import storage failure');return Response.json({error:'No se pudo guardar el proyecto.'},{status:500});
  }
}
