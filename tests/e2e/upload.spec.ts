import { test,expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile,mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import release from '../../sketchup_offline/version.json';
const {version}=release;
test('descarga el RBZ correcto y muestra instalación en tres pasos',async({page})=>{
  await page.goto('/');await page.getByRole('link',{name:'Instalar extensión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Planos Santo en tu SketchUp.'})).toBeVisible();
  const promise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar extensión para SketchUp',exact:true}).click();
  const file=await promise;expect(file.suggestedFilename()).toBe(`PlanosSanto-${version}.rbz`);
  await mkdir('artifacts',{recursive:true});await file.saveAs('artifacts/extension-descargada.rbz');
  const expected=await readFile(`artifacts/PlanosSanto-${version}.rbz`);expect(await readFile('artifacts/extension-descargada.rbz')).toEqual(expected);
  execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert 'planos_santo.rb' in z.namelist();assert 'planos_santo/bootstrap.rb' in z.namelist();assert not any(n.endswith('.skp') for n in z.namelist())",'artifacts/extension-descargada.rbz']);
  await page.screenshot({path:'artifacts/instalacion-web.png',fullPage:true});
});
test('ofrece la extensión offline actual como descarga separada y explica su validación pendiente',async({page})=>{
  await page.goto('/instalar/offline');
  await expect(page.getByRole('heading',{name:'Las guías dentro de SketchUp.'})).toBeVisible();
  await expect(page.getByText('Esta versión todavía no fue ejecutada dentro de SketchUp 2026 Windows.',{exact:false})).toBeVisible();
  const promise=page.waitForEvent('download');await page.getByRole('link',{name:`Descargar extensión ${version}`,exact:true}).click();
  const download=await promise;expect(download.suggestedFilename()).toBe(`PlanosSanto-${version}.rbz`);
  await download.saveAs('artifacts/extension-offline-descargada.rbz');
  expect(await readFile('artifacts/extension-offline-descargada.rbz')).toEqual(await readFile(`artifacts/PlanosSanto-${version}.rbz`));
  execFileSync('python3',['-c',"import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert 'planos_santo/offline.rb' in z.namelist();assert 'planos_santo/ui/app.js' in z.namelist();assert not any(n.endswith('.skp') or '/test/' in n for n in z.namelist());m=json.loads(z.read('planos_santo/manifest.json'));assert m['serverRequired'] is False",'artifacts/extension-offline-descargada.rbz']);
});
test('carga un ZIP de la extensión y recupera el proyecto después de recargar',async({page})=>{
  const ruby=process.env.RUBY_BIN||(existsSync('/workspace/.tools/ruby/bin/ruby')?'/workspace/.tools/ruby/bin/ruby':'ruby');
  const file='sketchup/build/ui-upload.zip';execFileSync('python3',['-c',"from pathlib import Path;Path('sketchup/build/ui-upload.zip').unlink(missing_ok=True)"]);
  await mkdir('sketchup/build',{recursive:true});execFileSync(ruby,['sketchup/test/write_zip_fixture.rb',file]);
  await page.goto('/');await page.getByLabel('Archivo del proyecto').setInputFiles(file);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('SKETCHUP · EXTENSIÓN RUBY',{exact:true})).toBeVisible();
  expect(page.url()).toContain('?proyecto=');await page.reload();await expect(page.locator('tbody tr')).toHaveCount(2);
});
test('un ZIP con solo SKP pide conversión sin crear un plano falso, con instalación accesible',async({page,request})=>{
  const zip=execFileSync('python3',['-c',"import io,zipfile,sys;b=io.BytesIO();z=zipfile.ZipFile(b,'w');z.writestr('sample/model.skp',b'opaque bytes');z.close();sys.stdout.buffer.write(b.getvalue())"]);
  const before=await(await request.get('/api/projects')).json();
  await page.goto('/');await page.getByLabel('Archivo del proyecto').setInputFiles({name:'mi-proyecto.zip',mimeType:'application/zip',buffer:zip});
  await expect(page.getByRole('heading',{name:'Encontramos tu modelo. Falta prepararlo en SketchUp.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Descargar e instalar la extensión',exact:true})).toBeVisible();
  const after=await(await request.get('/api/projects')).json();expect(after.length).toBe(before.length);
  await page.screenshot({path:'artifacts/zip-requiere-sketchup.png',fullPage:true});
});
test('carga por arrastre y comunica un ZIP inválido sin romper la interfaz móvil',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const transfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['invalid zip'],'roto.zip',{type:'application/zip'}));return d;});
  await page.locator('.upload-drop').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.getByRole('alert').filter({hasText:'No pudimos cargar el archivo'})).toContainText('No se pudo abrir el ZIP');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/subida-mobile.png',fullPage:true});
});

test('el flujo ZIP identifica el exportador anterior y conserva su descarga',async({page,request})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'¿Primera vez? Instalá la extensión en SketchUp →'}).click();
  await expect(page).toHaveURL(/\/instalar\/web$/);
  await expect(page.getByRole('heading',{name:'Exportador anterior · 0.3'})).toBeVisible();
  const response=await request.get('/api/extension');
  expect(response.status()).toBe(200);
  expect(await response.body()).toEqual(await readFile('artifacts/PlanosSanto-0.3.0.rbz'));
  await page.getByRole('link',{name:'Instalar versión actual',exact:true}).click();
  await expect(page).toHaveURL(/\/instalar$/);
  await expect(page.getByRole('link',{name:'Descargar extensión para SketchUp',exact:true})).toHaveAttribute('download',`PlanosSanto-${version}.rbz`);
});
