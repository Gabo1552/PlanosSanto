import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { applyEdit, type Project } from './model';

const root=()=>path.resolve(process.env.PROJECT_DATA_DIR || path.join(process.cwd(),'data'));
const location=(id:string)=>path.join(root(),`${z.uuid().parse(id)}.json`);
export async function getProject(id:string): Promise<Project> {
  return JSON.parse(await readFile(location(id),'utf8'));
}
export async function listProjects() {
  await mkdir(root(),{recursive:true});
  const files=(await readdir(root())).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f));
  const projects=await Promise.all(files.map(f=>getProject(f.slice(0,-5))));
  return projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>({id:p.id,name:p.name,source:p.source,updatedAt:p.updatedAt}));
}
export async function saveProject(p:Project) {
  await mkdir(root(),{recursive:true});
  const file=location(p.id),tmp=`${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,JSON.stringify(p),{mode:0o600});await rename(tmp,file);
  return p;
}
// Serialize read/modify/write within this single Node service; revision detects stale clients.
const locks=new Map<string,Promise<unknown>>();
export async function editProject(id:string,input:unknown) {
  const before=locks.get(id) || Promise.resolve();
  const op=before.catch(()=>{}).then(async()=>saveProject(applyEdit(await getProject(id),input)));
  locks.set(id,op);
  try { return await op; } finally { if(locks.get(id)===op) locks.delete(id); }
}
