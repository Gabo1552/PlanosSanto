import * as yauzl from 'yauzl';
import { importRubyDocument } from './ruby-import';
import { ImportError,SketchUpReader } from './reader';
import type { Project } from './model';

const MB=1024*1024;
export type UploadResult={state:'imported';project:Project}|{state:'needs-sketchup';models:{name:string;bytes:number}[]};
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes:Uint8Array,previous=0){let c=previous^0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}

async function withArchive<T>(bytes:Buffer,fn:(zip:yauzl.ZipFile)=>Promise<T>){
  const zip=await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true,autoClose:false},(e,z)=>e||!z?reject(new ImportError('No se pudo abrir el ZIP. Volvé a comprimirlo.',400)):resolve(z)));
  try{return await fn(zip);}finally{zip.close();}
}
async function inspect(zip:yauzl.ZipFile){
  return new Promise<yauzl.Entry[]>((resolve,reject)=>{
    const entries:yauzl.Entry[]=[];let total=0;
    const error=(e:unknown)=>reject(e instanceof ImportError?e:new ImportError('El ZIP está dañado o contiene rutas no válidas.',400));
    zip.once('error',error);zip.once('end',()=>{zip.removeListener('error',error);resolve(entries);});
    zip.on('entry',(entry:yauzl.Entry)=>{
      try{
        const name=entry.fileName;
        if(name.startsWith('/')||name.includes('\\')||/^[a-z]:/i.test(name)||name.split('/').includes('..')||name.includes('\0'))throw new ImportError('El ZIP contiene una ruta no permitida.',400);
        if(((entry.externalFileAttributes>>>16)&0o170000)===0o120000)throw new ImportError('El ZIP no puede contener enlaces simbólicos.',400);
        if(entry.generalPurposeBitFlag&1)throw new ImportError('El ZIP tiene contraseña. Guardalo sin contraseña para importarlo.',400);
        total+=entry.uncompressedSize;
        if(entries.length>=200 || total>100*MB || entry.uncompressedSize>50*MB)throw new ImportError('El ZIP supera los límites: 200 archivos y 100 MB descomprimidos.',413);
        entries.push(entry);zip.readEntry();
      }catch(e){error(e);}
    });zip.readEntry();
  });
}
async function readEntry(zip:yauzl.ZipFile,entry:yauzl.Entry,limit:number){
  if(entry.uncompressedSize>limit)throw new ImportError('Un archivo del ZIP supera el tamaño admitido.',413);
  return new Promise<Buffer>((resolve,reject)=>{
    zip.openReadStream(entry,(e,stream)=>{
      if(e||!stream){reject(new ImportError('No se pudo leer un archivo del ZIP.',400));return;}
      const chunks:Buffer[]=[];let total=0,crc=0;
      stream.on('data',(chunk:Buffer)=>{
        total+=chunk.length;
        if(total>limit){stream.destroy(new ImportError('Un archivo del ZIP supera el tamaño admitido.',413));return;}
        crc=crc32(chunk,crc);chunks.push(chunk);
      });
      stream.once('error',e=>reject(e instanceof ImportError?e:new ImportError('El ZIP está dañado.',400)));
      stream.once('end',()=>{if(total!==entry.uncompressedSize||crc!==(entry.crc32>>>0))reject(new ImportError('Falló la verificación del ZIP. Volvé a comprimirlo.',400));else resolve(Buffer.concat(chunks,total));});
    });
  });
}
function decodeExport(bytes:Uint8Array){
  try{return importRubyDocument(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
  catch{throw new ImportError('La exportación está incompleta o no es compatible. Volvé a exportarla desde Planos Santo en SketchUp.',422);}
}
async function modelResult(models:{name:string;bytes:number;load:()=>Promise<Buffer>}[]):Promise<UploadResult>{
  const reader=new SketchUpReader();
  if(models.length===1&&await reader.available())return {state:'imported',project:await reader.read(await models[0].load(),models[0].name)};
  // Detecting a .skp is not reading its geometry. Do not persist a phantom project.
  return {state:'needs-sketchup',models:models.map(({name,bytes})=>({name,bytes}))};
}
export async function importUpload(bytes:Buffer,name:string):Promise<UploadResult>{
  if(!bytes.length||bytes.length>50*MB)throw new ImportError('Elegí un archivo de hasta 50 MB.',413);
  if(/\.json$/i.test(name))return {state:'imported',project:decodeExport(bytes)};
  if(/\.skp$/i.test(name))return modelResult([{name,bytes:bytes.length,load:async()=>bytes}]);
  if(!/\.zip$/i.test(name))throw new ImportError('Subí un ZIP, un archivo SketchUp o una exportación de Planos Santo.',415);
  return withArchive(bytes,async zip=>{
    const entries=(await inspect(zip)).filter(e=>!e.fileName.endsWith('/')&&!e.fileName.startsWith('__MACOSX/')&&!e.fileName.split('/').some(p=>p.startsWith('.')));
    const exports=entries.filter(e=>/\.planos-santo\.json$/i.test(e.fileName));
    if(exports.length>1)throw new ImportError('El ZIP contiene varias exportaciones. Guardá un ZIP por proyecto desde la extensión.',422);
    if(exports.length===1)return {state:'imported',project:decodeExport(await readEntry(zip,exports[0],30*MB))};
    // Other documents, scripts and reports are ignored; never interpret them as commands or geometry.
    const models=entries.filter(e=>/\.skp$/i.test(e.fileName));
    if(!models.length)throw new ImportError('No encontramos un modelo .skp ni una exportación de Planos Santo dentro del ZIP.',422);
    // Check actual bytes and CRC even when the reader is unavailable.
    const checked=await Promise.all(models.map(async entry=>({name:entry.fileName,bytes:entry.uncompressedSize,data:await readEntry(zip,entry,50*MB)})));
    return modelResult(checked.map(m=>({name:m.name,bytes:m.bytes,load:async()=>m.data})));
  });
}
