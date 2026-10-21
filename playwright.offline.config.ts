import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({testDir:'./tests/offline',fullyParallel:false,workers:1,timeout:60_000,
  outputDir:'test-results/offline',use:{viewport:{width:1500,height:1100},launchOptions:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)}}});
