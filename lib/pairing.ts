import { createHash,randomBytes,timingSafeEqual } from 'node:crypto';
import { mkdir,readdir,readFile,rename,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=()=>path.join(process.env.PROJECT_DATA_DIR||path.join(process.cwd(),'data'),'.bridge-tokens');
export class PairingError extends Error {constructor(message:string,public status=401){super(message);}}
export function pairingEnabled(){return (process.env.PLANOS_BRIDGE_KEY?.length||0)>=32;}
export function authorizePairing(key:string|null){
  if(!pairingEnabled())throw new PairingError('El envío directo está deshabilitado. El administrador debe configurar PLANOS_BRIDGE_KEY (mínimo 32 caracteres). La importación del JSON local sigue disponible.',503);
  const expected=Buffer.from(digest(process.env.PLANOS_BRIDGE_KEY!),'hex'),actual=Buffer.from(digest(key||''),'hex');
  if(!timingSafeEqual(expected,actual))throw new PairingError('Clave de vinculación incorrecta.');
}
export function bridgeOrigin(origin:string){
  let url:URL;try{url=new URL(origin);}catch{throw new PairingError('Origen inválido.',403);}
  if(url.origin!==origin || (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new PairingError('Se requiere HTTPS; HTTP solo se admite en esta misma PC mediante localhost.',403);
  return url;
}
export async function createPairing(host:string,now=Date.now()){
  await mkdir(root(),{recursive:true,mode:0o700});
  // Tokens are random 256-bit capabilities. Store only hashes; expire after five minutes.
  const files=(await readdir(root())).filter(f=>/^[a-f0-9]{64}\.json$/.test(f));
  for(const file of files){
    try{const state=JSON.parse(await readFile(path.join(root(),file),'utf8'));if(state.expiresAt<=now)await rm(path.join(root(),file),{force:true});}catch{}
  }
  if((await readdir(root())).filter(f=>f.endsWith('.json')).length>=100)throw new PairingError('Hay demasiados códigos pendientes. Esperá cinco minutos.',429);
  const token=randomBytes(32).toString('hex'),expiresAt=now+5*60*1000;
  await writeFile(path.join(root(),`${digest(token)}.json`),JSON.stringify({host,expiresAt}),{flag:'wx',mode:0o600});
  return {token,expiresAt:new Date(expiresAt).toISOString()};
}
export async function consumePairing(token:string,host:string,now=Date.now()){
  if(!pairingEnabled())throw new PairingError('El envío directo está deshabilitado.',503);
  if(!/^[a-f0-9]{64}$/.test(token))throw new PairingError('Código temporal inválido.');
  const file=path.join(root(),`${digest(token)}.json`),claimed=file+`.${randomBytes(8).toString('hex')}.used`;
  try{await rename(file,claimed);}catch{throw new PairingError('Código vencido, ya usado o inválido. Generá otro en la web.');}
  try{
    const state=JSON.parse(await readFile(claimed,'utf8'));
    if(state.expiresAt<=now || state.host!==host)throw new PairingError('Código vencido o emitido para otra dirección.');
  }finally{await rm(claimed,{force:true});}
}
