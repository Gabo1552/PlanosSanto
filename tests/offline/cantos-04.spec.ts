import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';

// CANTOS-04: five asymmetric pieces through the real Ruby controller (synthetic SketchUp doubles, no SKP):
// the supplier TXT exported from «Maderera» (0.8.20: one TXT per board) and the references printed on the A4
// mark the same sides. The 2D view of the order is gone with the per-piece order screen.
// The A4 glyph itself is checked against the same fixture in tests/cantos-04.test.ts.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
const fixture=JSON.parse(readFileSync('tests/offline/fixtures/cantos-asimetricos.json','utf8')) as {pieces:{detail:string;edgeMap:number[]}[]};
type Reply={version:1;id:string;result:unknown;error:string|null};
type Item=Record<string,unknown>&{id:string};type Row=Record<string,unknown>&{id:string};
let child:ChildProcessWithoutNullStreams,pending:Map<string,(r:Reply)=>void>,errors:string[];
function raw(message:string):Promise<Reply>{return new Promise(done=>{pending.set(JSON.parse(message).id,done);child.stdin.write(message+'\n');});}
async function send<T=unknown>(action:string,data:unknown={}){const reply=await raw(JSON.stringify({version:1,id:randomUUID(),action,data}));expect(reply.error).toBeNull();return reply.result as T;}
async function boot(page:Page,folder:string){
  await mkdir(folder,{recursive:true});pending=new Map();errors=[];
  child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'cantos'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});
  child.stderr.on('data',()=>{});
  createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),done=pending.get(reply.id);if(done){pending.delete(reply.id);done(reply);}});
  await page.exposeFunction('namesNativeRequest',(message:string)=>raw(message));
  await page.addInitScript({content:'window.sketchup={request:function(message){window.namesNativeRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://planos-santo.test/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
    await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
  });
  await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('cinco piezas asimétricas: el TXT de la placa y la referencia de la A4 marcan los mismos lados',async({page},info)=>{
  await boot(page,info.outputDir);
  const generate=page.getByRole('button',{name:'Generar guías (1)',exact:true});await expect(generate).toBeEnabled();await generate.click();
  await page.getByRole('button',{name:'Guardar guía',exact:true}).click();await expect(page.getByText('Guía guardada en el modelo abierto.',{exact:false})).toBeVisible();
  // Library: one board and two edge roles with complete fichas (no approval tick since 0.8.16).
  let library:{catalog:{revision:number;items:Item[]}}|undefined;
  for(const [name,kind] of [['Placa cantos','sheet'],['Canto principal','edge'],['Canto secundario','edge']])library=await send('catalog_add',{revision:library?.catalog.revision??0,item:{name,kind}});
  const [sheet,first,second]=library!.catalog.items;
  Object.assign(sheet,{sku:'TEST-18',supplier:'Prueba',thicknessMm:19.05,widthMm:2000,lengthMm:3000,grain:false});
  Object.assign(first,{sku:'EDGE-1',supplier:'Prueba',thicknessMm:.8,widthMm:22});Object.assign(second,{sku:'EDGE-2',supplier:'Prueba',thicknessMm:2,widthMm:22});
  await send('catalog_save',{revision:library!.catalog.revision,items:[sheet,first,second]});
  // Order draft: each piece with its own asymmetric map, set by hand with no ticks (same rows as cantos_double.rb).
  const {plan}=await send<{plan:{rows:Row[]}}>('order_plan');
  const rows=[...plan.rows].sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));expect(rows).toHaveLength(5);
  rows.forEach((row,i)=>Object.assign(row,{detail:fixture.pieces[i].detail,axes:[0,1],frontSign:1,materialId:sheet.id,principalId:first.id,secondaryId:second.id,edgeMap:fixture.pieces[i].edgeMap,
    grainPolicy:'locked',dimensionRule:'finished_accepted'}));
  await send('order_save',{plan});
  // A4: the printed references (partial route used by the sheet) carry the same map and cut.
  const partial=await send<{references:Record<string,{edgeMap:number[];base:number;height:number}>;pending:string[]}>('order_references_partial');
  expect(partial.pending).toEqual([]);
  // F-DESP-B wiring: one row with a physical problem (thickness axis) prints «pendiente de pedido»; the others keep their order data.
  const reviewed=rows[4];reviewed.axes=[1,2];await send('order_save',{plan});
  await page.keyboard.press('Alt+5');await page.locator('details.save-options summary').click();
  await page.getByLabel('Incluir materiales y cantos del pedido revisado en el PDF').check();
  await expect(page.locator('.a4-order-pill')).toContainText('4 de 5 piezas');await expect(page.locator('.a4-order-pill')).toContainText('1 pendiente');
  // 0.8.20: the workshop does not use labels; Planos no longer shows their panel (labels.test.ts and the
  // labels.spec.ts harness keep testing the generator and the panel themselves).
  await expect(page.getByTestId('labels-panel')).toHaveCount(0);await expect(page.getByRole('button',{name:'Generar etiquetas'})).toHaveCount(0);
  reviewed.axes=[0,1];await send('order_save',{plan});
  // TXT of the board from «Maderera»: columns 6-9 are Arr·Aba·Izq·Der over base × height; canto 1 is the edge with
  // more metres on the board (EDGE-1 here), canto 2 the other one.
  await page.getByRole('navigation',{name:'Módulos de Planos Santo'}).getByRole('button',{name:'Maderera',exact:true}).click();
  const board=page.getByRole('region',{name:'Placa cantos · 19,05 mm'});
  await expect(board.getByRole('list',{name:'Cantos de Placa cantos · 19,05 mm'})).toContainText(/Canto 1 Canto principal · EDGE-1.*Canto 2 Canto secundario · EDGE-2/);
  await board.getByRole('button',{name:'Exportar TXT de Placa cantos · 19,05 mm',exact:true}).click();
  const file=(await board.locator('.workshop-board-export small').textContent())!.replace(/^Archivo: /,'');
  await expect(page.getByRole('status').filter({hasText:'guardado en'})).toContainText(join(info.outputDir,file));
  const lines=(await readFile(join(info.outputDir,file),'utf8')).split('\r\n').map(line=>line.split('\t')).filter(cols=>/^\d+$/.test(cols[0]));
  expect(lines).toHaveLength(5);
  for(const [i,row] of rows.entries()){
    const map=fixture.pieces[i].edgeMap,line=lines.find(cols=>cols[3]===fixture.pieces[i].detail)!;
    expect(line.slice(5,9).map(Number),`TXT ${row.detail}`).toEqual(map);
    expect(partial.references[row.id].edgeMap,`A4 ${row.detail}`).toEqual(map);
    expect([line[1],line[2]].map(value=>Number(value.replace(',','.'))),`corte ${row.detail}`).toEqual([partial.references[row.id].base,partial.references[row.id].height].map(n=>Number(n.toFixed(3))));
  }
});
