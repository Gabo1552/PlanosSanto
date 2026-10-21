import { expect,it } from 'vitest';
import { SketchUpReader } from '../lib/reader';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { demoDocument } from '../lib/demo';
it('informa ausencia real del SDK y rechaza archivos incorrectos sin simular importación',async()=>{
  const previous=process.env.SKETCHUP_READER_BIN;delete process.env.SKETCHUP_READER_BIN;
  try {
    const reader=new SketchUpReader();expect(await reader.available()).toBe(false);
    await expect(reader.read(new Uint8Array([1]),'model.skp')).rejects.toMatchObject({status:503});
    await expect(reader.read(new Uint8Array([1]),'model.json')).rejects.toMatchObject({status:415});
    await expect(reader.read(new Uint8Array(),'model.skp')).rejects.toMatchObject({status:413});
  }finally {if(previous)process.env.SKETCHUP_READER_BIN=previous;}
});
it('verifica SOLO el contrato del adaptador mediante un ejecutable de prueba, sin validar SketchUp',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'santo-contract-')),previous=process.env.SKETCHUP_READER_BIN;
  try{
    const executable=path.join(dir,'contract-test-reader');
    const script=`#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv;fs.writeFileSync(a[a.indexOf('--output')+1],${JSON.stringify(JSON.stringify(demoDocument))});`;
    await writeFile(executable,script,{mode:0o700});process.env.SKETCHUP_READER_BIN=executable;
    const p=await new SketchUpReader().read(new Uint8Array([1]),'contract-test.skp');
    expect(p.furniture).toHaveLength(2);expect(p.furniture[0].pieces[0].dimensions).toEqual([700,450,18]);
    await writeFile(executable,`#!${process.execPath}\nprocess.exit(1);`,{mode:0o700});
    await expect(new SketchUpReader().read(new Uint8Array([1]),'contract-test.skp')).rejects.toMatchObject({status:422});
  }finally{await rm(dir,{recursive:true,force:true});if(previous)process.env.SKETCHUP_READER_BIN=previous;else delete process.env.SKETCHUP_READER_BIN;}
});
