import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProject } from '@/lib/store';
import { fail } from '@/lib/http';
import { createOfflinePdf } from '@/sketchup_offline/ui/pdf';
export const runtime='nodejs';
export const maxDuration=120;
let active=0;
/** Shared vector layout: web and HtmlDialog enforce the same A4 overflow gate. */
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  let project;
  try{project=await getProject((await params).id);}catch(e){return fail(e);}
  if(active>=2)return Response.json({error:'Ya se están generando dos PDF. Intentá nuevamente en unos segundos.'},{status:429});
  active++;
  try{
    const assets=path.join(process.cwd(),'sketchup_offline/assets');
    const [regular,mono,logo]=await Promise.all(['DejaVuSans.ttf','DejaVuSansMono.ttf','santo-carpintero.png'].map(file=>readFile(path.join(assets,file))));
    const bytes=await createOfflinePdf(project,regular,mono,logo);
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="planos-santo-A4.pdf"','Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'No se pudo componer la guía A4.'},{status:422});
  }finally{active--;}
}
