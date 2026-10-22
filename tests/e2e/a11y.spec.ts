import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Auditoría automática WCAG 2.2 AA de las pantallas de la app web.
// Falla con violaciones serious o critical; las moderate/minor se informan en el reporte.
const TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'];
const BLOCKING=['serious','critical'];

async function audit(page:Page,screen:string){
  const {violations}=await new AxeBuilder({page}).withTags(TAGS).analyze();
  const detail=violations.map(v=>`[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.map(n=>`   ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`).join('\n')}`);
  if(detail.length)test.info().annotations.push({type:'axe',description:`${screen}\n${detail.join('\n')}`});
  expect(violations.filter(v=>BLOCKING.includes(v.impact||'')).map(v=>`${screen}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}
async function openDemo(page:Page){
  await page.goto('/');await page.getByRole('button',{name:'Explorar proyecto DEMO →'}).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:/^Guardado$/})).toBeVisible();
}

for(const [screen,path] of [['Inicio','/'],['Instalar','/instalar'],['Instalar exportador 0.3','/instalar/web'],['Instalar offline','/instalar/offline']] as const)
  test(`axe: ${screen}`,async({page})=>{await page.goto(path);await page.waitForLoadState('networkidle');await audit(page,screen);});

test('axe: editor con proyecto DEMO',async({page})=>{await openDemo(page);await audit(page,'Editor');});

test('axe: editor con una nota abierta',async({page})=>{
  await openDemo(page);
  await page.getByRole('button',{name:/^\+ Agregar nota a/}).click();
  await expect(page.getByRole('textbox',{name:'Comentario',exact:true})).toBeVisible();
  await audit(page,'Editor con nota');
});

test('axe: vista de impresión',async({page})=>{
  await openDemo(page);const id=new URL(page.url()).searchParams.get('proyecto');
  await page.goto(`/print/${id}`);await page.waitForLoadState('networkidle');await audit(page,'Impresión');
});

test('axe: inicio con aviso de error',async({page})=>{
  await page.goto('/?proyecto=00000000-0000-4000-8000-000000000000');
  await expect(page.locator('.alert.error')).toContainText('No encontramos el proyecto de este enlace.');
  await audit(page,'Inicio con error');
});

test('axe: editor moviendo cotas y editando la visibilidad interior',async({page})=>{
  await openDemo(page);
  await page.getByText('Rotar vista, mover cotas y mostrar IDs',{exact:true}).click();
  await page.getByRole('button',{name:'Mover cotas',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Mover cota P/}).first()).toBeVisible();
  await audit(page,'Editor · mover cotas');
  await page.getByText(/^Piezas visibles en la vista interior/).click();
  await page.getByRole('button',{name:'Editar visibilidad interior',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Cancelar vista previa/})).toBeVisible();
  await audit(page,'Editor · visibilidad interior');
});

test.describe('pantalla de celular',()=>{
  test.use({viewport:{width:390,height:844}});
  test('axe: inicio y editor en celular',async({page})=>{
    await page.goto('/');await audit(page,'Inicio · celular');
    await openDemo(page);await audit(page,'Editor · celular');
  });
});
