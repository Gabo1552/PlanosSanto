import { BodyLimitError,limitedBody,sameOrigin } from '@/lib/http';
import { ImportError } from '@/lib/reader';
import { importUpload } from '@/lib/archive';
import { saveProject } from '@/lib/store';
export const runtime='nodejs';
export async function POST(req:Request){
  if(!sameOrigin(req))return new Response(null,{status:403});
  try{
    const body=await limitedBody(req,51*1024*1024);
    const form=await new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')||''},body}).formData();
    const file=form.get('file');
    if(!(file instanceof File))throw new ImportError('Elegí un archivo para subir.',400);
    const result=await importUpload(Buffer.from(await file.arrayBuffer()),file.name);
    if(result.state==='imported')await saveProject(result.project);
    return Response.json(result,{status:result.state==='imported'?201:200,headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof ImportError||e instanceof BodyLimitError)return Response.json({error:e.message},{status:e instanceof ImportError?e.status:413});
    if(e instanceof TypeError)return Response.json({error:'No se pudo leer la carga. Elegí el archivo nuevamente.'},{status:400});
    console.error('File upload failed');return Response.json({error:'No se pudo guardar el proyecto. Intentá nuevamente.'},{status:500});
  }
}
