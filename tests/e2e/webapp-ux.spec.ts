import { test,expect,type Page } from '@playwright/test';

// Next.js agrega su propio anunciador de rutas con role=alert; se excluye.
const alerts=(page:Page)=>page.locator('[role=alert]:not(#__next-route-announcer__)');
const zip={name:'mueble.planos-santo.zip',mimeType:'application/zip',buffer:Buffer.from('PK')};
async function contrast(page:Page,selector:string){
  return page.locator(selector).first().evaluate(el=>{
    const parse=(c:string)=>(c.match(/[\d.]+/g)||[]).map(Number);
    const lum=([r,g,b]:number[])=>{const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
    let node:Element|null=el,bg=[255,255,255];
    while(node){const c=parse(getComputedStyle(node).backgroundColor);if(c.length===3||(c.length===4&&c[3]>0.5)){bg=c;break;}node=node.parentElement;}
    const a=lum(parse(getComputedStyle(el).color)),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
}

test('una respuesta HTML del servidor al subir se explica en español y permite reintentar',async({page})=>{
  await page.route('**/api/import/file',route=>route.fulfill({status:413,contentType:'text/html',body:'<html><body>Payload Too Large</body></html>'}));
  await page.goto('/');await page.getByLabel('Archivo del proyecto').setInputFiles(zip);
  const alert=alerts(page).filter({hasText:'No pudimos cargar el archivo'});
  await expect(alert).toContainText('El archivo es demasiado grande para el servidor.');
  await expect(alert).not.toContainText(/Unexpected|JSON|token/);
  await expect(alert.getByRole('button',{name:'Elegir otro archivo'})).toBeVisible();
});

test('sin conexión al subir muestra un mensaje en español y no queda procesando',async({page})=>{
  await page.route('**/api/import/file',route=>route.abort('internetdisconnected'));
  await page.goto('/');await page.getByLabel('Archivo del proyecto').setInputFiles(zip);
  await expect(alerts(page)).toContainText('No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.');
  await expect(alerts(page)).not.toContainText('Failed to fetch');
  await expect(page.getByRole('button',{name:'Elegir archivo',exact:true})).toBeEnabled();
});

test('un enlace a un proyecto inexistente lo explica y limpia la dirección',async({page})=>{
  await page.goto('/?proyecto=00000000-0000-4000-8000-000000000000');
  await expect(alerts(page)).toContainText('No encontramos el proyecto de este enlace.');
  await expect(page).not.toHaveURL(/proyecto=/);
  await expect(page.getByRole('button',{name:'Explorar proyecto DEMO →'})).toBeVisible();
  await page.reload();await expect(alerts(page)).toHaveCount(0);
});

test('mientras abre un proyecto del enlace muestra un estado de carga en vez de la pantalla vacía',async({page,request})=>{
  const created=await(await request.post('/api/projects',{headers:{origin:'http://127.0.0.1:3000'}})).json() as {id:string};
  let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
  await page.route(`**/api/projects/${created.id}`,async route=>{await gate;await route.continue();});
  await page.goto(`/?proyecto=${created.id}`);
  await expect(page.getByRole('status').filter({hasText:'Abriendo el proyecto guardado…'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Explorar proyecto DEMO →'})).toHaveCount(0);
  release();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByText('Abriendo el proyecto guardado…')).toHaveCount(0);
});

test('el selector de proyectos indica cuando todavía no hay ninguno guardado',async({page})=>{
  await page.route('**/api/projects',route=>route.request().method()==='GET'?route.fulfill({json:[]}):route.continue());
  await page.goto('/');
  await expect(page.getByLabel('Proyectos guardados').locator('option')).toHaveText(['Todavía no hay proyectos guardados']);
});

test('un error del servidor sin detalle al exportar no queda en blanco',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explorar proyecto DEMO →'}).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.route('**/api/pdf/**',route=>route.fulfill({status:502,body:''}));
  await page.getByRole('button',{name:'↓ Exportar PDF A4'}).click();
  await expect(alerts(page).first()).toContainText('El servidor no pudo completar la operación (error 502).');
});

test('textos secundarios y encabezados de tabla cumplen contraste AA y el foco se ve con teclado',async({page})=>{
  await page.goto('/');
  for(const selector of ['.subtitle','.project-picker label','.upload-drop small','.start-guide p','.app-footer span'])
    expect(await contrast(page,selector),selector).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page,'.start-guide>div>span'),'números de pasos').toBeGreaterThanOrEqual(3);
  await page.getByRole('button',{name:'Explorar proyecto DEMO →'}).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  for(const selector of ['th','.furniture-card small','.table-footnote','.export-card p','.count'])
    expect(await contrast(page,selector),selector).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('.furniture-icon').first()).toHaveAttribute('aria-hidden','true');
  const code=page.getByRole('button',{name:'Elegir P01'});await code.focus();await page.keyboard.press('Tab');
  const focused=page.locator(':focus');await expect(focused).toHaveAttribute('aria-label','Nombre P01');
  expect(await focused.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
});
