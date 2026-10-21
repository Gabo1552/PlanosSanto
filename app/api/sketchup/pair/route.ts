import { sameOrigin } from '@/lib/http';
import { authorizePairing,bridgeOrigin,createPairing,PairingError } from '@/lib/pairing';
export const runtime='nodejs';
export async function POST(req:Request){
  if(!req.headers.get('origin') || !sameOrigin(req))return Response.json({error:'La vinculación se inicia desde la web del taller.'},{status:403});
  try{
    const origin=bridgeOrigin(req.headers.get('origin')!);
    authorizePairing(req.headers.get('x-planos-bridge-key'));
    return Response.json(await createPairing(origin.host),{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof PairingError)return Response.json({error:e.message},{status:e.status});
    console.error('Pairing storage failure');return Response.json({error:'No se pudo generar el código temporal.'},{status:500});
  }
}
