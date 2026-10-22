import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

// DESPIECE-01 over the packaged UI and the real Ruby controller (bridge_driver.rb, API doubles), network offline.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
let child:ChildProcessWithoutNullStreams;
type Edits={furniture:{id:string;renumber?:boolean;pieces:{id:string;code:string}[]}[]};
let messages:{action:string;data?:Record<string,unknown>}[],errors:string[],tamper:((data:Edits)=>void)|undefined;
async function boot(page:Page,folder:string){
  await mkdir(folder,{recursive:true});
  const pending=new Map<string,(value:unknown)=>void>();messages=[];errors=[];tamper=undefined;
  child=spawn(ruby,['sketchup_offline/test/bridge_driver.rb',folder],{stdio:'pipe'});
  child.stderr.on('data',()=>{});
  createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),wait=pending.get(reply.id);if(wait){pending.delete(reply.id);wait(reply);}});
  await page.exposeFunction('nativeRequest',(raw:string)=>new Promise(resolve=>{const msg=JSON.parse(raw);if(msg.action==='save'&&tamper){tamper(msg.data);tamper=undefined;raw=JSON.stringify(msg);}messages.push(msg);pending.set(msg.id,resolve);child.stdin.write(raw+'\n');}));
  await page.addInitScript(()=>{
    const w=window as unknown as {nativeRequest:(raw:string)=>Promise<unknown>;sketchup:unknown;PlanosSantoBridge:{receive:(reply:unknown)=>void}};
    w.sketchup={request:(raw:string)=>{void w.nativeRequest(raw).then(reply=>w.PlanosSantoBridge.receive(reply));}};
  });
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://planos-santo.test/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if(!['index.html','app.js','app.css'].includes(name)){errors.push('Recurso inesperado: '+name);await route.abort();return;}
    await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
  });
  await page.context().setOffline(true);
  await page.goto('https://planos-santo.test/index.html');
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toBeVisible();
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});
const lastSave=()=>messages.filter(m=>m.action==='save').at(-1)?.data as Edits|undefined;
const rowCodes=(page:Page)=>page.locator('[data-code-row]').evaluateAll(rows=>rows.map(row=>[row.getAttribute('data-code-row'),row.querySelector('strong')?.textContent]));

test('Codificar despiece: vista previa, Escape, renumerar y guardar con renumber',async({page},info)=>{
  await boot(page,info.outputDir);
  const open=page.getByRole('button',{name:'Codificar despiece…'});
  await open.click();
  const dialog=page.getByRole('dialog',{name:'Codificar despiece'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('placa, espesor, largo y ancho');
  await expect(dialog.locator('[data-code-row]')).toHaveCount(2);
  // Nothing saved yet: both pieces are «sin código», but tree order already matches the workshop order.
  await expect(dialog.getByText('0 piezas reciben código · 2 sin cambios')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Aplicar códigos'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();

  // First save stores codes with gaps (pieces without saved code accept any free code): P03 and P07.
  tamper=data=>{for(const f of data.furniture)f.pieces.forEach((p,i)=>{p.code=`P${String(3+4*i).padStart(2,'0')}`;});};
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
  await expect(page.getByLabel('Nombre P03')).toBeVisible();await expect(page.getByLabel('Nombre P07')).toBeVisible();
  expect(lastSave()!.furniture.some(f=>'renumber' in f)).toBe(false);

  await open.click();
  await expect(dialog.getByText('0 piezas reciben código · 2 sin cambios')).toBeVisible();
  await dialog.getByRole('checkbox',{name:'Renumerar todas las piezas'}).check();
  await expect(dialog.getByRole('note')).toContainText('código anterior');
  await expect(dialog.getByText('2 piezas reciben código · 0 sin cambios')).toBeVisible();
  await expect(dialog.locator('tr[data-changed]')).toHaveCount(2);
  const planned=await rowCodes(page);
  expect(planned.map(([,code])=>code)).toEqual(['P01','P02']);
  await dialog.getByRole('button',{name:'Aplicar códigos'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Nombre P01')).toBeVisible();await expect(page.getByLabel('Nombre P02')).toBeVisible();
  await expect(page.getByLabel('Nombre P03')).toHaveCount(0);

  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();
  await expect.poll(()=>messages.filter(m=>m.action==='save').length).toBe(2);
  const sent=lastSave()!.furniture.find(f=>f.pieces.length===2)!;
  expect(sent.renumber).toBe(true);
  expect(Object.fromEntries(sent.pieces.map(p=>[p.id,p.code]))).toEqual(Object.fromEntries(planned));
  await expect(page.getByLabel('Nombre P01')).toBeVisible();

  // After reopening, the stored code history (previousCode) does not count as an unsaved change.
  await page.reload();
  await page.getByRole('button',{name:'Generar guías (2)',exact:true}).click();
  await expect(page.getByLabel('Nombre P01')).toBeVisible();
  await expect(page.getByText('Guía sin guardar',{exact:true})).toHaveCount(0);
});
