import { afterAll,beforeAll,expect,it } from 'vitest';
import { mkdtemp,readdir,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { authorizePairing,bridgeOrigin,consumePairing,createPairing,pairingEnabled } from '../lib/pairing';
let dir:string;const previousDir=process.env.PROJECT_DATA_DIR,previousKey=process.env.PLANOS_BRIDGE_KEY;
beforeAll(async()=>{dir=await mkdtemp(path.join(tmpdir(),'santo-pair-'));process.env.PROJECT_DATA_DIR=dir;process.env.PLANOS_BRIDGE_KEY=randomBytes(32).toString('hex');});
afterAll(async()=>{await rm(dir,{force:true,recursive:true});if(previousDir)process.env.PROJECT_DATA_DIR=previousDir;else delete process.env.PROJECT_DATA_DIR;if(previousKey)process.env.PLANOS_BRIDGE_KEY=previousKey;else delete process.env.PLANOS_BRIDGE_KEY;});
it('exige clave del administrador y HTTPS salvo loopback',()=>{
  expect(pairingEnabled()).toBe(true);expect(()=>authorizePairing(null)).toThrow(/incorrecta/);expect(()=>authorizePairing(process.env.PLANOS_BRIDGE_KEY!)).not.toThrow();
  expect(()=>bridgeOrigin('http://taller.example')).toThrow(/HTTPS/);expect(bridgeOrigin('https://taller.example').host).toBe('taller.example');
  expect(()=>bridgeOrigin('https://user:pass@taller.example')).toThrow();expect(()=>bridgeOrigin('http://localhost.evil.example')).toThrow();
  const key=process.env.PLANOS_BRIDGE_KEY;delete process.env.PLANOS_BRIDGE_KEY;expect(()=>authorizePairing('a')).toThrow(/deshabilitado/);process.env.PLANOS_BRIDGE_KEY=key;
});
it('guarda solo hashes, vence códigos y permite un solo consumidor incluso en paralelo',async()=>{
  const code=await createPairing('taller.example',1000),files=await readdir(path.join(dir,'.bridge-tokens'));
  expect(files.some(f=>f.includes(code.token))).toBe(false);
  expect((await readFile(path.join(dir,'.bridge-tokens',files[0]),'utf8')).includes(code.token)).toBe(false);
  const results=await Promise.allSettled([consumePairing(code.token,'taller.example',2000),consumePairing(code.token,'taller.example',2000)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const expired=await createPairing('taller.example',1000);await expect(consumePairing(expired.token,'taller.example',301001)).rejects.toThrow(/vencido/);
  const wrongHost=await createPairing('taller.example');await expect(consumePairing(wrongHost.token,'otra.example')).rejects.toThrow(/otra dirección/);
});
