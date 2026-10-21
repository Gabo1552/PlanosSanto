import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
export async function launchBrowser(){
  const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  return chromium.launch({executablePath,headless:true,args:['--disable-dev-shm-usage']});
}
