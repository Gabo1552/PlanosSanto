import { BodyLimitError,limitedBody,sameOrigin } from '@/lib/http';
import { consumePairing,PairingError } from '@/lib/pairing';
import { importRubyDocument } from '@/lib/ruby-import';
import { saveProject } from '@/lib/store';
export const runtime='nodejs';
export async function POST(req:Request){
  if(!sameOrigin(req))return new Response(null,{status:403});
  try{
    const auth=req.headers.get('authorization')||'';
    const match=/^Bearer ([a-f0-9]{64})$/.exec(auth);
    if(!match)throw new PairingError('Se requiere un código temporal válido.');
    await consumePairing(match[1],req.headers.get('host')||new URL(req.url).host);
    // A code authorizes one attempt, including invalid/oversized payloads. Never silently retry uploads.
    const bytes=await limitedBody(req,30*1024*1024);
    let project;
    try{project=importRubyDocument(JSON.parse(new TextDecoder().decode(bytes)));}
    catch{return Response.json({error:'La exportación no es válida o contiene geometría no admitida. Corregila y generá otro código.'},{status:422});}
    await saveProject(project);
    return Response.json({project:{id:project.id,name:project.name}},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof PairingError)return Response.json({error:e.message},{status:e.status});
    if(e instanceof BodyLimitError)return Response.json({error:e.message},{status:413});
    console.error('SketchUp receive storage failure');return Response.json({error:'No se pudo guardar la entrega. Revisá los proyectos antes de reintentar.'},{status:500});
  }
}
