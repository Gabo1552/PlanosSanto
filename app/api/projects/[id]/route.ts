import { fail, limitedBody, sameOrigin } from '@/lib/http';
import { editProject, getProject } from '@/lib/store';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:Context) {
  try {return Response.json(await getProject((await params).id));} catch(e){return fail(e);}
}
export async function PUT(req:Request,{params}:Context) {
  if(!sameOrigin(req)) return new Response(null,{status:403});
  if(Number(req.headers.get('content-length'))>2_000_000) return Response.json({error:'La edición supera 2 MB.'},{status:413});
  try {return Response.json(await editProject((await params).id,JSON.parse(new TextDecoder().decode(await limitedBody(req,2_000_000)))));} catch(e){return fail(e);}
}
