import { readFile } from 'node:fs/promises';
import path from 'node:path';
import release from '@/sketchup_offline/version.json';
const {version}=release;
export const runtime='nodejs';
export async function GET(){
  try{
    const name=`PlanosSanto-${version}.rbz`;
    const bytes=await readFile(path.join(process.cwd(),'artifacts',name));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name}"`,'Content-Length':String(bytes.length),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'El instalador de prueba todavía no está disponible. Ejecutá la compilación de la extensión.'},{status:503});}
}
