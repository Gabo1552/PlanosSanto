import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shortcutFor } from '../sketchup_offline/ui/quickActions';

// QA de integración de la noche: cruces entre el transporte por partes (Hito 6),
// las acciones nuevas de materiales (Hito 7) y los atajos del shell (UX ronda 2)
// frente al teclado del pincel (Hito 2). Sin SketchUp: bridge real, nativo simulado.
describe('bridge por partes × acciones de materiales del Hito 7', () => {
  let request: typeof import('../sketchup_offline/ui/bridge').request;
  let sent: { id: string; action: string }[];
  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules(); sent = [];
    vi.stubGlobal('window', { sketchup: { request: (raw: string) => { sent.push(JSON.parse(raw)); } } });
    request = (await import('../sketchup_offline/ui/bridge')).request;
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function parts(id: string, result: unknown, size = 40) {
    const text = JSON.stringify({ version: 1, id, result, error: null }), out: string[] = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
  }
  it.each(['material_package_preview', 'material_package_export'])('%s: el selector sin plazo, luego la vista previa grande llega por partes', async action => {
    const preview = { token: 't', items: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `Melamina José ${i}` })) };
    const result = request<typeof preview>(action);
    const id = sent[0].id;
    window.PlanosSantoBridge.receive({ version: 1, id, phase: 'waiting_user' });
    // El operador tarda más que el plazo de respuesta en elegir el .zip.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    window.PlanosSantoBridge.receive({ version: 1, id, phase: 'working' });
    const chunks = parts(id, preview);
    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((data, index) => window.PlanosSantoBridge.receiveChunk({ version: 1, id, index, total: chunks.length, data }));
    await expect(result).resolves.toEqual(preview);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('una acción de materiales sin selector conserva el plazo aunque Ruby mande una fase', async () => {
    const result = request('material_texture_preview');
    const id = sent[0].id;
    window.PlanosSantoBridge.receive({ version: 1, id, phase: 'waiting_user' });
    const failure = expect(result).rejects.toThrow('SketchUp no respondió');
    await vi.advanceTimersByTimeAsync(120_001);
    await failure;
  });
  it('dos ventanas a la vez: las partes de una respuesta no resuelven la otra', async () => {
    const palette = request<string>('smart_palette_load'), focus = request<{ focused: boolean }>('viewport_focus');
    const [load, view] = sent.map(message => message.id);
    const chunks = parts(load, 'x'.repeat(120));
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: load, index: 0, total: chunks.length, data: chunks[0] });
    window.PlanosSantoBridge.receive({ version: 1, id: view, result: { focused: true }, error: null });
    await expect(focus).resolves.toEqual({ focused: true });
    chunks.slice(1).forEach((data, i) => window.PlanosSantoBridge.receiveChunk({ version: 1, id: load, index: i + 1, total: chunks.length, data }));
    await expect(palette).resolves.toBe('x'.repeat(120));
  });
});

describe('atajos del shell × teclado del pincel', () => {
  const base = { key: '', ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  it('Tab, Mayús+Tab, Ctrl+Tab y Ctrl+Mayús+Tab nunca son atajos del shell', () => {
    for (const event of [{ key: 'Tab', code: 'Tab' }, { key: 'Tab', code: 'Tab', shiftKey: true }, { key: 'Tab', code: 'Tab', ctrlKey: true }, { key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true }, { key: 'Escape', code: 'Escape' }])
      expect(shortcutFor({ ...base, ...event })).toBeUndefined();
  });
  it('con la paleta Pintar abierta en la ventana principal ningún atajo actúa', () => {
    for (const event of [{ key: 's', ctrlKey: true }, { key: 'E', ctrlKey: true, shiftKey: true }, { key: '2', code: 'Digit2', altKey: true }, { key: '?' }])
      expect(shortcutFor({ ...base, ...event }, true)).toBeUndefined();
  });
});
