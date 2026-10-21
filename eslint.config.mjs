import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // This editor runs as static HTML in SketchUp; Next Image cannot run in HtmlDialog.
  { files: ['sketchup_offline/ui/**/*.tsx'], rules: { '@next/next/no-img-element': 'off' } },
  { ignores: ['.next/**', 'node_modules/**', 'artifacts/**', 'next-env.d.ts', 'test-results/**', 'sketchup_offline/build/**'] },
];

export default config;
