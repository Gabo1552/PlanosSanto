// Read-only replay of the JSON exported by the operator. Does not open or save a SKP.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import release from '../sketchup_offline/version.json';
import {PDFDocument} from 'pdf-lib';

async function main(){
  const raw=JSON.parse(await readFile('fixtures/private/modelo.planos-santo.json','utf8'));
  const ids=raw.furniture.map((f:{id:string})=>f.id),guide={version:1,revision:0,selection:ids,furniture:[]};
  const fingerprint=createHash('sha256').update(JSON.stringify(raw.furniture)).digest('hex');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
  try{
    const page=await browser.newPage({viewport:{width:1550,height:1050}}),errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('replayExport',async(message:string)=>{
      const msg=JSON.parse(message);let result:unknown;
      if(msg.action==='diagnostic')result={extensionVersion:release.version,replayOnly:true};
      else if(msg.action==='scan')result={tree:{roots:raw.furniture,warnings:raw.exporter?.warnings||[],modelName:raw.name},guide,selected:ids,path:'exportación-real-reproducida-sin-SketchUp'};
      else if(msg.action==='generate')result={document:raw,guide,fingerprint};
      else if(msg.action==='dirty')result=true;
      else if(msg.action==='pdf'){
        const bytes=Buffer.from(msg.data.base64,'base64'),pdf=await PDFDocument.load(bytes);
        if(pdf.getPageCount()!==1)throw new Error('El PDF no tiene una hoja.');
        const p=pdf.getPage(0);if(Math.abs(p.getWidth()*25.4/72-420)>0.001||Math.abs(p.getHeight()*25.4/72-297)>0.001)throw new Error('El formato no es A3.');
        await writeFile('artifacts/CA-AmSurrbac-UI-PRUEBA-DOS-VISTAS.pdf',bytes);result={path:'PDF DE PRUEBA · Exportación real de ocho piezas'};
      }else throw new Error('El replay no implementa '+msg.action+'; no permite guardar un SKP.');
      return {version:1,id:msg.id,result,error:null};
    });
    // Literal harness code avoids tsx's Node-only __name helper inside serialized functions.
    await page.addInitScript({content:'window.sketchup = { request: function(message) { window.replayExport(message).then(function(reply) { window.PlanosSantoBridge.receive(reply); }); } };'});
    await page.route('https://planos-santo.test/**',async route=>{
      const name=new URL(route.request().url()).pathname.slice(1);
      if(!['index.html','app.js','app.css'].includes(name))throw new Error('Recurso inesperado.');
      await route.fulfill({body:await readFile(resolve('sketchup_offline/build/planos_santo/ui',name)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'});
    });
    await page.context().setOffline(true);await page.goto('https://planos-santo.test/index.html');
    if(errors.length)throw new Error(errors.join('\n'));
    await page.getByRole('button',{name:'Generar guías (1)',exact:true}).click();
    await page.getByLabel('Nombre P01').waitFor();
    if(await page.locator('tbody tr').count()!==8)throw new Error('No se ven las ocho piezas reales.');
    if(await page.locator('[data-dimension]').count()!==10)throw new Error('No se ven las 10 cotas sobre las piezas reales.');
    for(const code of ['P03','P07','P08'])if(await page.locator('[data-dimension]').evaluateAll((nodes,code)=>nodes.some(n=>{const label=n.getAttribute('aria-label')||'';return label.startsWith(code+' ·')||label.startsWith('Ocultar cota '+code+' ');}),code))throw new Error('Se repitieron cotas: '+code);
    await page.screenshot({path:'artifacts/complemento-estilo-Santo-exportacion-real.png',fullPage:true});
    await page.screenshot({path:'artifacts/complemento-DOS-VISTAS-exportacion-real.png',fullPage:true});
    await page.screenshot({path:'artifacts/piezas-visor-063-real.png',fullPage:false});
    await page.setViewportSize({width:1000,height:760});
    await page.getByRole('button',{name:'Seleccionar P06',exact:true}).click();
    await page.getByLabel('Nombre P06',{exact:true}).waitFor();
    const field=await page.getByLabel('Nombre P06',{exact:true}).boundingBox(),chart=await page.locator('.diagram').boundingBox();
    if(!field||!chart||field.y<0||field.y+field.height>760||chart.x+chart.width>field.x)throw new Error('Pieza y nombre no están juntos/visibles a 1000 px.');
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('La página desborda a 1000 px.');
    if(!await page.locator('.parts-config .table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth))throw new Error('La tabla requiere desplazamiento horizontal.');
    await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
    await page.screenshot({path:'artifacts/piezas-visor-063-real-1000px.png',fullPage:false});
    await page.getByRole('button',{name:'Resaltar pieza',exact:true}).click();
    await page.setViewportSize({width:1550,height:1050});
    await writeFile('artifacts/ui-063-modelo-real.json',JSON.stringify({source:'JSON real recibido; reproducción sin ejecutar SketchUp',sha256:createHash('sha256').update(await readFile('fixtures/private/modelo.planos-santo.json')).digest('hex'),pieces:8,dimensions:10,viewport1000:{nameAndDrawingVisible:true,pageOverflow:false,tableHorizontalOverflow:false},sketchupExecuted:false,physicalSkpSaved:false},null,2));
    const frontPoints=await page.locator('[data-piece]').first().getAttribute('points');
    await page.getByRole('button',{name:'Ver trasera',exact:true}).click();
    if(await page.locator('[data-piece]').first().getAttribute('points')===frontPoints)throw new Error('La trasera repite la misma proyección.');
    if(await page.locator('tbody tr').count()!==8)throw new Error('Cambiar cámara alteró el listado.');
    await page.screenshot({path:'artifacts/complemento-DOS-VISTAS-trasera-exportacion-real.png',fullPage:true});
    await page.getByRole('button',{name:'Ver delantera',exact:true}).click();
    await page.locator('.dimension-controls>summary').click();
    await page.getByRole('checkbox',{name:'Mostrar cota P02 largo',exact:true}).uncheck();
    if(await page.locator('[data-dimension]').count()!==9||await page.locator('tbody tr').count()!==8)throw new Error('Ocultar la cota real alteró el listado o no se reflejó en la vista.');
    await page.screenshot({path:'artifacts/complemento-COTA-OCULTA-exportacion-real.png',fullPage:true});
    await page.getByRole('button',{name:'Mostrar todas las cotas',exact:true}).click();
    if(await page.locator('[data-dimension]').count()!==10)throw new Error('No se restauraron las cotas reales.');
    await page.locator('.dimension-controls>summary').click();
    await page.getByRole('button',{name:'Agregar nota',exact:true}).click();await page.getByRole('button',{name:'Seleccionar P01',exact:true}).click();
    await page.getByLabel('Texto de la nota').fill('NOTA DE PRUEBA: alinear antes de fijar');
    await page.getByRole('button',{name:'Exportar PDF A3',exact:true}).click();await page.getByText('PDF A3 guardado:',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Ayuda: Notas con flechas',exact:true}).click();
    await page.getByRole('dialog',{name:'Notas con flechas',exact:true}).waitFor();
    await page.screenshot({path:'artifacts/complemento-ayuda-notas-exportacion-real.png',fullPage:true});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('Replay del JSON real: 8 piezas, 10 cotas sobre el dibujo, capturas UI/ayuda y PDF A3 con nota de prueba. No ejecutó SketchUp ni guardó SKP.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
