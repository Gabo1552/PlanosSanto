import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAnalysisState } from '../sketchup_offline/ui/StaleBanner';

// F-ARQ-A: real bridge with large replies split by Ruby into parts. No SketchUp is simulated as executed.
describe('SketchUp bridge: replies in parts', () => {
  let request: typeof import('../sketchup_offline/ui/bridge').request;
  let sent: { id: string; action: string }[];
  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules(); sent = [];
    vi.stubGlobal('window', { sketchup: { request: (raw: string) => { sent.push(JSON.parse(raw)); } } });
    request = (await import('../sketchup_offline/ui/bridge')).request;
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function split(text: string, size: number) { const parts: string[] = []; for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size)); return parts; }
  function send(index: number, payload: Record<string, unknown>, size = 7, order?: number[]) {
    const id = sent[index].id, parts = split(JSON.stringify({ version: 1, id, error: null, ...payload }), size);
    (order || parts.map((_, i) => i)).forEach(i => window.PlanosSantoBridge.receiveChunk({ version: 1, id, index: i, total: parts.length, data: parts[i] }));
    return parts.length;
  }
  it('reassembles parts in any order, including accents, and resolves once', async () => {
    const result = request<{ furniture: { name: string }[] }>('generate', { ids: ['1'] });
    const furniture = [{ name: 'Bajo Mesada · Cajón' }, { name: 'Alacena José' }];
    const id = sent[0].id, parts = split(JSON.stringify({ version: 1, id, result: { furniture }, error: null }), 9);
    expect(parts.length).toBeGreaterThan(3);
    [...parts.keys()].reverse().forEach(i => window.PlanosSantoBridge.receiveChunk({ version: 1, id, index: i, total: parts.length, data: parts[i] }));
    await expect(result).resolves.toEqual({ furniture });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('every part restarts the deadline: a slow but progressing transfer is not a hang', async () => {
    const result = request<string>('generate');
    const id = sent[0].id, parts = split(JSON.stringify({ version: 1, id, result: 'x'.repeat(50), error: null }), 10);
    for (let i = 0; i < parts.length; i += 1) {
      await vi.advanceTimersByTimeAsync(100_000);
      window.PlanosSantoBridge.receiveChunk({ version: 1, id, index: i, total: parts.length, data: parts[i] });
    }
    await expect(result).resolves.toBe('x'.repeat(50));
  });
  it('a native error sent in parts rejects with its message', async () => {
    const result = request('generate');
    send(0, { result: null, error: 'La respuesta de SketchUp supera el tope.' });
    await expect(result).rejects.toThrow('La respuesta de SketchUp supera el tope.');
  });
  it.each([
    [{ index: 0, total: 1 }], [{ index: 3, total: 3 }], [{ index: -1, total: 3 }], [{ index: 0, total: 65 }], [{ index: 0, total: 2.5 }],
  ])('rejects malformed part metadata %j', async meta => {
    const result = request('generate');
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[0].id, data: '{', ...meta });
    await expect(result).rejects.toThrow('respuesta por partes inválida');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects a reply whose parts do not parse or belong to another request', async () => {
    const broken = request('generate');
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[0].id, index: 0, total: 2, data: '{"version":1,' });
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[0].id, index: 1, total: 2, data: 'oops' });
    await expect(broken).rejects.toThrow('incompleta');
    const foreign = request('generate');
    const parts = split(JSON.stringify({ version: 1, id: 'otra', result: 1, error: null }), 10);
    parts.forEach((data, index) => window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[1].id, index, total: parts.length, data }));
    await expect(foreign).rejects.toThrow('no corresponde');
    const versioned = request('generate');
    const old = split(JSON.stringify({ version: 2, id: sent[2].id, result: 1, error: null }), 10);
    old.forEach((data, index) => window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[2].id, index, total: old.length, data }));
    await expect(versioned).rejects.toThrow('no corresponde');
  });
  it('a total that changes between parts is rejected; unknown ids are ignored', async () => {
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: 'desconocida', index: 0, total: 2, data: '{' });
    const result = request('generate');
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[0].id, index: 0, total: 2, data: '{' });
    window.PlanosSantoBridge.receiveChunk({ version: 1, id: sent[0].id, index: 1, total: 3, data: '}' });
    await expect(result).rejects.toThrow('inválida');
  });
});

describe('StaleBanner event contract', () => {
  it('accepts only the published analysis state', () => {
    expect(isAnalysisState({ stale: true, reason: 'Pintaste.', source: 'paint' })).toBe(true);
    expect(isAnalysisState({ stale: false, reason: null, source: null })).toBe(true);
    expect(isAnalysisState({ stale: 'sí' })).toBe(false);
    expect(isAnalysisState({ stale: true, reason: 3 })).toBe(false);
    expect(isAnalysisState(null)).toBe(false);
  });
});
