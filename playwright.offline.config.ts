import { defineConfig } from '@playwright/test';
import { chromiumPath } from './tests/chromium';
// Native Ruby children (photo/paint specs) read Unicode fixture paths; force UTF-8 in clean environments.
if(!/utf-?8/i.test(`${process.env.LC_ALL||''}${process.env.LC_CTYPE||''}${process.env.LANG||''}`)){process.env.LANG='C.UTF-8';process.env.LC_ALL='C.UTF-8';}
export default defineConfig({testDir:'./tests/offline',fullyParallel:false,workers:1,timeout:60_000,
  outputDir:'test-results/offline',use:{viewport:{width:1500,height:1100},launchOptions:{executablePath:chromiumPath()}}});
