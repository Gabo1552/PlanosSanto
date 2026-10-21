import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { importDocument, type Project } from './model';

export class ImportError extends Error { constructor(message:string,public status=422){super(message);} }
export interface ModelReader { available():Promise<boolean>; read(bytes:Uint8Array,name:string):Promise<Project> }
export class SketchUpReader implements ModelReader {
  async available(){
    const executable=process.env.SKETCHUP_READER_BIN;
    if(!executable||!path.isAbsolute(executable))return false;
    try{await access(executable,constants.X_OK);return true;}catch{return false;}
  }
  async read(bytes:Uint8Array,name:string){
    if(!/\.skp$/i.test(name))throw new ImportError('Se requiere un archivo .skp.',415);
    if(bytes.length===0||bytes.length>50*1024*1024)throw new ImportError('El archivo debe ocupar entre 1 byte y 50 MB.',413);
    if(!await this.available())throw new ImportError('Importación .skp no disponible: falta instalar y verificar el lector nativo de SketchUp C SDK. La demostración no importa archivos SketchUp.',503);
    const dir=await mkdtemp(path.join(tmpdir(),'santo-skp-'));
    try{
      await chmod(dir,0o700);
      const input=path.join(dir,'model.skp'),output=path.join(dir,'model.json');
      await writeFile(input,bytes,{mode:0o600});
      // Fixed argument vector; no shell or user-controlled executable. Reader must write protocol v1 JSON.
      await promisify(execFile)(process.env.SKETCHUP_READER_BIN!,['--input',input,'--output',output],{timeout:90_000,maxBuffer:1024*1024,windowsHide:true});
      if((await stat(output)).size>30*1024*1024)throw new ImportError('La geometría convertida supera 30 MB.');
      const json=await readFile(output);
      return importDocument(JSON.parse(json.toString('utf8')),'skp');
    }catch(e){
      if(e instanceof ImportError)throw e;
      console.error('SketchUp reader failed:',(e as Error).name);
      throw new ImportError('El lector no pudo convertir el archivo. Revisá su versión, geometría y agrupación en muebles.');
    }finally{await rm(dir,{recursive:true,force:true});}
  }
}
