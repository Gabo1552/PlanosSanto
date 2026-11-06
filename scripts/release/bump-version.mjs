#!/usr/bin/env node
// Sube la versión de la extensión en los cuatro lugares que la llevan.
// Uso: node scripts/release/bump-version.mjs 0.8.31 [--root <dir>]
// Falla sin escribir nada si algún reemplazo no encuentra exactamente lo esperado.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
const root = rootFlag >= 0 ? resolve(args[rootFlag + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const next = args.find((a, i) => !a.startsWith('--') && i !== rootFlag + 1);
const SEMVER = /^\d+\.\d+\.\d+$/;
if (!next || !SEMVER.test(next)) { console.error('Uso: bump-version.mjs <X.Y.Z> [--root <dir>]'); process.exit(2); }

const read = rel => readFileSync(join(root, rel), 'utf8');
const current = JSON.parse(read('sketchup_offline/version.json')).version;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(next, current) <= 0) { console.error(`La versión nueva (${next}) tiene que ser mayor que la actual (${current}).`); process.exit(2); }

const q = v => `'${v}'`;
const edits = [];
function plan(rel, transform) {
  const before = read(rel), after = transform(before);
  if (after === before) throw new Error(`${rel}: no cambió nada`);
  edits.push([rel, after]);
}
function replaceExactly(text, from, to, count, rel) {
  const found = text.split(from).length - 1;
  if (found !== count) throw new Error(`${rel}: se esperaban ${count} apariciones de ${from}, hay ${found}`);
  return text.split(from).join(to);
}

try {
  plan('sketchup_offline/version.json', () => `{"version": "${next}"}\n`);
  plan('lib/model.ts', t => replaceExactly(t, `${q(current)}])`, `${q(current)},${q(next)}])`, 1, 'lib/model.ts'));
  plan('docs/validacion-0811/verificar_0811_sketchup.rb', t => {
    const range = /candidatas 0\.8\.11 a \d+\.\d+\.\d+/;
    if (!range.test(t)) throw new Error('verificar_0811_sketchup.rb: no está el rango de candidatas');
    return replaceExactly(t.replace(range, `candidatas 0.8.11 a ${next}`), `VERSION = ${q(current)}`, `VERSION = ${q(next)}`, 1, 'verificar_0811_sketchup.rb');
  });
  plan('sketchup_offline/test/verificador_0811_test.rb', t => replaceExactly(t, q(current), q(next), 3, 'verificador_0811_test.rb'));
} catch (error) { console.error(error.message); process.exit(1); }

for (const [rel, text] of edits) writeFileSync(join(root, rel), text);
console.log(`${current} -> ${next}: ${edits.map(([rel]) => rel).join(', ')}`);
