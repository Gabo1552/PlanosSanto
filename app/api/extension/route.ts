import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(){
  try{
    const bytes=await readFile(path.join(process.cwd(),'artifacts','PlanosSanto-0.3.0.rbz'));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="PlanosSanto-0.3.0.rbz"','Content-Length':String(bytes.length),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'La descarga no está disponible. Volvé a intentarlo en unos minutos.'},{status:503});}
}
