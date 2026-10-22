import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['tests/**/*.test.ts'],
  // Lógica TS compartida y de la UI offline; los componentes React se prueban con Playwright.
  coverage: { provider: 'v8', include: ['lib/**/*.ts', 'sketchup_offline/ui/**/*.ts'], reporter: ['text', 'json-summary'] },
} });
