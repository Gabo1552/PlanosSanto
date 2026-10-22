export const NETWORK_ERROR='No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.';
export class ApiError extends Error{constructor(message:string,readonly status:number){super(message);}}
// El servidor responde {error} en español; un proxy o un límite de Next puede devolver HTML o nada.
export async function errorMessage(response:Response):Promise<string>{
  const data=await response.json().catch(()=>null) as {error?:unknown}|null;
  if(data&&typeof data.error==='string'&&data.error.trim())return data.error;
  if(response.status===413)return 'El archivo es demasiado grande para el servidor. Elegí uno de hasta 50 MB.';
  if(response.status===404)return 'No encontramos lo que buscabas en el servidor.';
  return `El servidor no pudo completar la operación (error ${response.status}). Probá de nuevo en unos minutos.`;
}
export async function send(url:string,init?:RequestInit):Promise<Response>{
  let response:Response;
  try{response=await fetch(url,init);}catch{throw new ApiError(NETWORK_ERROR,0);}
  if(!response.ok)throw new ApiError(await errorMessage(response),response.status);
  return response;
}
export async function fetchJson<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await send(url,init);
  try{return await response.json() as T;}catch{throw new ApiError('El servidor respondió con datos ilegibles. Probá de nuevo.',response.status);}
}
