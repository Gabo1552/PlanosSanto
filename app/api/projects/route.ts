import { createDemo } from '@/lib/demo';
import { fail, sameOrigin } from '@/lib/http';
import { listProjects, saveProject } from '@/lib/store';
export const runtime='nodejs';
export async function GET() { try {return Response.json(await listProjects());} catch(e){return fail(e);} }
export async function POST(req:Request) {
  if(!sameOrigin(req)) return new Response(null,{status:403});
  try {return Response.json(await saveProject(createDemo()),{status:201});} catch(e){return fail(e);}
}
