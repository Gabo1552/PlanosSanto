import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
// Raster-preview contract: real browser with synthetic Ruby model, never SketchUp.
const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
type Reply={version:1;id:string;result:unknown;error:string|null};
type State={active:boolean;changed:boolean;queuedCount:number;message:string;hover?:{pieceId:string;faceId:string;name:string;affectedPaths:string[];faceCount:number;sharedCount:number;side:string}};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNsSjFiYGBgYmBgYGBgAAANmgEcCGOihQAAAABJRU5ErkJggg==';
let child:ChildProcessWithoutNullStreams,pending:Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void}>,errors:string[],calls:{action:string;data:Record<string,unknown>}[],tool:State,settings:Record<string,unknown>;
const items=[['sheet-a','Melamina Petiribi','sheet',true],['sheet-b','Melamina Blanca','sheet',false],['sheet-missing','Melamina pendiente visual','sheet',false],['edge-a','Canto Petiribi','edge',true]].map(([id,name,kind,favorite])=>({id,name,kind,favorite,sku:`SKU-${id}`,supplier:'Taller sintético',approved:true,thicknessMm:kind==='sheet'?18:1,widthMm:1830,lengthMm:2600,grain:false,compatibleIds:[],price:null,updatedAt:'2026-10-19',sourceHash:'',observed:{}}));
let catalogItems=items.map(item=>({...item}));
const materials=[{id:'1',name:'Textura Petiribi real',color:[150,110,65],hasTexture:true,binding:{uuid:'uuid-sheet-a',catalogId:'sheet-a',kind:'sheet'},issues:[]},{id:'2',name:'Blanco real',color:[240,240,240],hasTexture:false,binding:{uuid:'uuid-sheet-b',catalogId:'sheet-b',kind:'sheet'},issues:[]},{id:'3',name:'Canto real',color:[125,90,50],hasTexture:false,binding:{uuid:'uuid-edge-a',catalogId:'edge-a',kind:'edge'},issues:[]}];
function native(message:string):Promise<Reply>{return new Promise((resolve,reject)=>{const msg=JSON.parse(message);pending.set(msg.id,{resolve,reject});child.stdin.write(message+'\n');});}
async function boot(page:Page,folder:string){
 await mkdir(folder,{recursive:true});pending=new Map();errors=[];calls=[];tool={active:false,changed:false,queuedCount:0,message:'Lista para activar'};settings={};catalogItems=items.map(item=>({...item}));
 child=spawn(ruby,['sketchup_offline/test/names_bridge_driver.rb',folder,'safe'],{stdio:'pipe',env:{...process.env,PLANOS_SANTO_DATA_DIR:resolve(folder,'catalog-data')}});let stderr='';child.stderr.on('data',data=>{stderr+=String(data);});createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),entry=pending.get(reply.id);if(entry){pending.delete(reply.id);entry.resolve(reply);}});child.on('exit',()=>{for(const entry of pending.values())entry.reject(new Error(stderr));pending.clear();});
 await page.exposeFunction('smartContractRequest',async(message:string)=>{const msg=JSON.parse(message),{action,data}=msg;calls.push({action,data});let result:unknown;
 if(action==='smart_palette_load')result={catalog:{schema:1,revision:3,items:catalogItems},visuals:{catalogRevision:3,assetRevision:2,materials,visuals:[]},settings,thumbnails:{'sheet-a':pixel,'sheet-b':'data:image/svg+xml;base64,PHN2Zy8+'},toolState:{...tool}};
 else if(action==='smart_tool_start'){settings={...data.options};const options=data.options;expect(options.confirmed).toBe(true);expect(options.axes).toEqual([0,1]);expect(options.scope==='unique'||options.allowShared===true).toBe(true);tool={...tool,active:true,message:'Acercá el cursor para ver el alcance'};result={toolState:{...tool}};}
 else if(action==='smart_tool_status')result={toolState:{...tool}};
 else if(action==='smart_tool_stop'){const changed=tool.changed;tool={...tool,active:false,changed:false,queuedCount:0,message:'Herramienta detenida'};result={toolState:{...tool},scanRequired:changed};}
 else if(action==='smart_palette_compact')result={compact:data.compact};
 else return native(message);
 return {version:1,id:msg.id,result,error:null};});
 await page.exposeFunction('smartToolDoubleEvent',(state:State)=>{tool={...state};});
 await page.addInitScript({content:'window.sketchup={request:function(message){window.smartContractRequest(message).then(function(reply){window.PlanosSantoBridge.receive(reply);});}};'});
 page.on('pageerror',error=>errors.push(error.message));await page.route('https://planos-santo.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['index.html','app.js','app.css'].includes(name))throw Error('Unexpected resource');await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});});page.setDefaultTimeout(10_000);await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');await expect(page.getByRole('button',{name:'Pintura avanzada',exact:true})).toBeEnabled();
}
async function open(page:Page){await page.getByRole('button',{name:'Pintura avanzada',exact:true}).click();await expect(page.getByRole('heading',{name:'Pintado directo',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Placas',exact:true})).toBeEnabled();return page.locator('.smart-paint-palette');}
test.afterEach(async()=>{child?.stdin.end();child?.kill();expect(errors).toEqual([]);});

test('miniatura SKM real se muestra sin activar pintura y el material elegido queda visible',async({page},info)=>{
 await boot(page,info.outputDir);const palette=await open(page);
 const material=palette.getByRole('button',{name:/Melamina Petiribi/});
 await expect(material.locator('img')).toHaveAttribute('src',pixel);
 await expect.poll(()=>material.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(2);
 await material.click();
 const active=palette.getByRole('region',{name:'Material activo en la paleta'});
 await expect(active).toContainText('Melamina Petiribi');await expect(active.locator('img')).toHaveAttribute('src',pixel);
 await expect(palette.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toBeDisabled();
 expect(calls.filter(call=>call.action==='smart_tool_start')).toHaveLength(0);
 await page.setViewportSize({width:420,height:720});
 expect(await active.evaluate(node=>getComputedStyle(node).position)).toBe('sticky');
 await page.screenshot({path:info.outputPath('paleta-miniatura-SINTETICA.png'),fullPage:true});
});

test('SVG o URL no se interpretan como textura: fallback explícito al color real',async({page},info)=>{
 await boot(page,info.outputDir);const palette=await open(page);
 const material=palette.getByRole('button',{name:/Melamina Blanca/});
 await expect(material.locator('img')).toHaveCount(0);await material.click();
 const active=palette.getByRole('region',{name:'Material activo en la paleta'});
 await expect(active.locator('img')).toHaveCount(0);await expect(active).toContainText('Sin miniatura SKM');
 await expect(palette.locator('img[src^="http"],img[src^="data:image/svg"]')).toHaveCount(0);
 expect(calls.filter(call=>call.action==='smart_tool_start')).toHaveLength(0);
});


test('recientes conserva hasta cinco selecciones únicas y filtra tipo/aprobación sin activar pintura',async({page},info)=>{
 await boot(page,info.outputDir);const palette=await open(page);
 await palette.getByRole('button',{name:/Melamina Petiribi/}).click();
 await palette.getByRole('button',{name:/Melamina Blanca/}).click();
 const recent=palette.getByLabel('Materiales usados recientemente',{exact:true});
 await expect(recent.locator('option')).toHaveText(['Volver a elegir un material…','Melamina Blanca','Melamina Petiribi']);
 await recent.selectOption('sheet-a');
 await expect(palette.getByRole('region',{name:'Material activo en la paleta'})).toContainText('Melamina Petiribi');
 await expect(palette.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toBeDisabled();
 await palette.getByRole('button',{name:'Cantos',exact:true}).click();await expect(recent).toHaveCount(0);
 await palette.getByRole('button',{name:/Canto Petiribi/}).click();
 await expect(recent.locator('option')).toHaveText(['Volver a elegir un material…','Canto Petiribi']);
 await palette.getByRole('button',{name:'Placas',exact:true}).click();
 catalogItems=[...catalogItems,...[1,2,3].map(index=>({...catalogItems[0],id:`extra-${index}`,name:`Placa reciente ${index}`,favorite:false}))];
 await palette.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();
 for(const name of ['Melamina pendiente visual','Placa reciente 1','Placa reciente 2','Placa reciente 3'])await palette.getByRole('button',{name:new RegExp(name)}).click();
 await expect(recent.locator('option')).toHaveCount(5); // Four visible sheet selections; the fifth session slot holds a canto.
 await palette.getByRole('button',{name:/Melamina Petiribi/}).click();
 await expect(recent.locator('option')).toHaveCount(6); // Five unique compatible selections, plus the placeholder.
 await palette.getByRole('button',{name:/Melamina Petiribi/}).click();await expect(recent.locator('option')).toHaveCount(6);
 catalogItems=catalogItems.map(item=>item.id==='sheet-a'?{...item,approved:false}:item);
 await palette.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();
 await expect(recent.locator('option[value="sheet-a"]')).toHaveCount(0);
 await expect(palette.getByRole('button',{name:'Activar pintado en SketchUp',exact:true})).toBeDisabled();
 expect(calls.filter(call=>call.action==='smart_tool_start')).toHaveLength(0);
});
