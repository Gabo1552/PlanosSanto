type RequestMessage={version:1;id:string;action:string;data:unknown};
type Reply={version:1;id:string;result?:unknown;error?:string|null;phase?:'waiting_user'|'working'};
// F-ARQ-A: SketchUp splits large replies into parts (one execute_script each)
// so CEF never receives one huge script. Parts carry a slice of the reply JSON.
type Chunk={version:1;id:string;index:number;total:number;data:string};
const MAX_CHUNKS=64;
declare global{
  interface Window{
    sketchup?:{request:(message:string)=>void};
    PlanosSantoBridge:{receive:(message:Reply)=>void;receiveChunk:(message:Chunk)=>void};
  }
}
const RESPONSE_TIMEOUT=120_000;
// Native code signals actual entry/exit of its file chooser. Never exempt all
// processing for these actions: missing native replies still have a deadline.
const USER_DIALOG_ACTIONS=new Set(['pdf','cutlist_csv','save','catalog_import','catalog_export','catalog_install','order_export','materials_report','skm_preview','material_photo_pick','material_package_export','material_package_preview']);
type Pending={action:string;resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>;waitingForUser:boolean;parts?:{total:number;received:number;items:string[]}};
const waiting=new Map<string,Pending>();
function armDeadline(id:string,pending:Pending){
  pending.timer=setTimeout(()=>{
    waiting.delete(id);
    pending.reject(new Error('SketchUp no respondió. No vuelvas a guardar todavía: revisá si sigue trabajando y luego analizá el modelo para recuperar el estado.'));
  },RESPONSE_TIMEOUT);
}
function fail(id:string,pending:Pending,text:string){clearTimeout(pending.timer);waiting.delete(id);pending.reject(new Error(text));}
function receive(message:Reply){
  if(message.version!==1)return;
  const pending=waiting.get(message.id);if(!pending)return;
  if(message.phase!==undefined){
    if(!USER_DIALOG_ACTIONS.has(pending.action))return;
    if(message.phase==='waiting_user'&&!pending.waitingForUser){
      clearTimeout(pending.timer);pending.timer=undefined;pending.waitingForUser=true;
    }else if(message.phase==='working'&&pending.waitingForUser){
      pending.waitingForUser=false;armDeadline(message.id,pending);
    }
    return;
  }
  clearTimeout(pending.timer);waiting.delete(message.id);
  if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.result);
}
function receiveChunk(message:Chunk){
  if(!message||message.version!==1)return;
  const pending=waiting.get(message.id);if(!pending)return;
  const {index,total,data}=message;
  if(!Number.isInteger(total)||total<2||total>MAX_CHUNKS||!Number.isInteger(index)||index<0||index>=total||typeof data!=='string'||(pending.parts&&pending.parts.total!==total)){
    fail(message.id,pending,'SketchUp envió una respuesta por partes inválida. Volvé a intentar; si se repite, analizá el modelo de nuevo.');return;
  }
  const parts=pending.parts??={total,received:0,items:new Array<string>(total)};
  if(parts.items[index]===undefined){parts.items[index]=data;parts.received+=1;}
  // Each part is progress: the deadline restarts until the last one arrives.
  if(!pending.waitingForUser){clearTimeout(pending.timer);armDeadline(message.id,pending);}
  if(parts.received<total)return;
  let reply:unknown;
  try{reply=JSON.parse(parts.items.join(''));}
  catch{fail(message.id,pending,'SketchUp envió una respuesta por partes incompleta. Volvé a intentar.');return;}
  if(!reply||typeof reply!=='object'||(reply as Reply).version!==1||(reply as Reply).id!==message.id||(reply as Reply).phase!==undefined){fail(message.id,pending,'SketchUp envió una respuesta por partes que no corresponde a esta operación.');return;}
  receive(reply as Reply);
}
window.PlanosSantoBridge={receive,receiveChunk};
export function request<T>(action:string,data:unknown={}):Promise<T>{
  return new Promise((resolve,reject)=>{
    if(!window.sketchup?.request){reject(new Error('Abrí Planos Santo desde el menú de SketchUp. Esta ventana necesita la extensión instalada.'));return;}
    const id=crypto.randomUUID();
    const pending:Pending={action,resolve:value=>resolve(value as T),reject,waitingForUser:false};
    waiting.set(id,pending);armDeadline(id,pending);
    const message:RequestMessage={version:1,id,action,data};
    try{window.sketchup.request(JSON.stringify(message));}
    catch(error){clearTimeout(pending.timer);waiting.delete(id);reject(error);}
  });
}
