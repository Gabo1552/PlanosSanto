import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// Orden: CHROMIUM_PATH, /usr/bin/chromium, el navegador de esta versión de Playwright y,
// si no está, cualquier Chromium descargado en PLAYWRIGHT_BROWSERS_PATH (p. ej. /opt/pw-browsers).
export function chromiumPath():string|undefined{
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  if(existsSync('/usr/bin/chromium'))return '/usr/bin/chromium';
  try{if(existsSync(chromium.executablePath()))return undefined;}catch{}
  const root=process.env.PLAYWRIGHT_BROWSERS_PATH;if(!root||!existsSync(root))return undefined;
  const found=readdirSync(root).filter(d=>/^chromium-\d+$/.test(d)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))
    .map(d=>join(root,d,'chrome-linux','chrome')).find(p=>existsSync(p));
  return found;
}
