import { ImportError, SketchUpReader } from '@/lib/reader';
import { BodyLimitError, limitedBody, sameOrigin } from '@/lib/http';
import { saveProject } from '@/lib/store';
export const runtime='nodejs';
export async function GET(){return Response.json({available:await new SketchUpReader().available(),verified:false});}
export async function POST(req:Request){
  if(!sameOrigin(req))return new Response(null,{status:403});
  if(Number(req.headers.get('content-length'))>51*1024*1024)return Response.json({error:'El archivo supera 50 MB.'},{status:413});
  try{
    const bytes=await limitedBody(req,51*1024*1024);
    const bounded=new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')||''},body:bytes});
    const form=await bounded.formData(),file=form.get('file');
    if(!(file instanceof File))throw new ImportError('No se recibió un archivo.',400);
    if(file.size>50*1024*1024)throw new ImportError('El archivo supera 50 MB.',413);
    return Response.json(await saveProject(await new SketchUpReader().read(new Uint8Array(await file.arrayBuffer()),file.name)),{status:201});
  }catch(e){return Response.json({error:e instanceof ImportError||e instanceof BodyLimitError?e.message:'No se pudo procesar la carga.'},{status:e instanceof ImportError?e.status:e instanceof BodyLimitError?413:400});}
}
