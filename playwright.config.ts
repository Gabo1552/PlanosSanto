import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
process.env.PLANOS_BRIDGE_KEY ||= randomBytes(32).toString('hex');
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:60_000,
  use:{baseURL:'http://127.0.0.1:3000',viewport:{width:1500,height:1050},launchOptions:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)}},
  webServer:{command:'npm run start',url:'http://127.0.0.1:3000',reuseExistingServer:false,timeout:60_000,env:{PROJECT_DATA_DIR:'/tmp/planos-santo-e2e',PLANOS_BRIDGE_KEY:process.env.PLANOS_BRIDGE_KEY}},
});
