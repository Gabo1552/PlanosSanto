import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real bridge, deterministic browser clock; no SketchUp or native dialog is simulated as executed.
describe('SketchUp bridge: human file-dialog time', () => {
  let request: typeof import('../sketchup_offline/ui/bridge').request;
  let sent: { id: string; action: string }[];
  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules(); sent = [];
    vi.stubGlobal('window', { sketchup: { request: (raw: string) => { sent.push(JSON.parse(raw)); } } });
    request = (await import('../sketchup_offline/ui/bridge')).request;
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function receive(index: number, extra: Record<string, unknown>) {
    window.PlanosSantoBridge.receive({ version: 1, id: sent[index].id, result: null, error: null, ...extra });
  }
  it('accepts a PDF saved after a 158-second human choice without rejecting or losing the reply', async () => {
    const result = request<{ path: string }>('pdf', { base64: 'example' });
    const settled = vi.fn(); void result.then(settled, settled);
    receive(0, { phase: 'waiting_user' });
    await vi.advanceTimersByTimeAsync(158_000);
    expect(settled).not.toHaveBeenCalled();
    receive(0, { phase: 'working' });
    receive(0, { result: { path: 'C:\\QA\\guide.pdf' } });
    await expect(result).resolves.toEqual({ path: 'C:\\QA\\guide.pdf' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['save', 'catalog_import', 'catalog_export', 'catalog_install', 'order_export', 'materials_report', 'skm_preview','material_photo_pick'])('also permits a slow native chooser for %s', async action => {
    const result = request(action);
    receive(0, { phase: 'waiting_user' });
    await vi.advanceTimersByTimeAsync(600_000);
    receive(0, { phase: 'working' }); receive(0, { result: { cancelled: true } });
    await expect(result).resolves.toEqual({ cancelled: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('still times out when native code never acknowledges an export', async () => {
    const result = request('pdf'); const rejected = expect(result).rejects.toThrow('SketchUp no respondió');
    await vi.advanceTimersByTimeAsync(120_000); await rejected;
    receive(0, { result: { path: 'late.pdf' } }); expect(vi.getTimerCount()).toBe(0);
  });
  it('resumes a full bounded working deadline after the dialog closes, without extending it on duplicate progress', async () => {
    const result = request('pdf'); const rejected = expect(result).rejects.toThrow('SketchUp no respondió');
    await vi.advanceTimersByTimeAsync(110_000); receive(0, { phase: 'waiting_user' });
    await vi.advanceTimersByTimeAsync(158_000); receive(0, { phase: 'working' });
    await vi.advanceTimersByTimeAsync(119_999); receive(0, { phase: 'working' });
    await vi.advanceTimersByTimeAsync(1); await rejected;
  });
  it('returns a real native write error after a long choice', async () => {
    const result = request('pdf'); const rejected = expect(result).rejects.toThrow('No se pudo escribir');
    receive(0, { phase: 'waiting_user' }); await vi.advanceTimersByTimeAsync(158_000);
    receive(0, { phase: 'working' }); receive(0, { error: 'No se pudo escribir' }); await rejected;
  });
  it('cancels a long PDF choice and allows the next export', async () => {
    const first = request('pdf'); receive(0, { phase: 'waiting_user' });
    await vi.advanceTimersByTimeAsync(158_000); receive(0, { phase: 'working' });
    receive(0, { result: { cancelled: true } }); await expect(first).resolves.toEqual({ cancelled: true });
    const second = request('pdf'); receive(1, { result: { path: 'second.pdf' } });
    await expect(second).resolves.toEqual({ path: 'second.pdf' });
    receive(0, { phase: 'waiting_user' }); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps other requests bounded and ignores progress for unknown IDs, versions, phases or actions', async () => {
    const result = request('scan'); const rejected = expect(result).rejects.toThrow('SketchUp no respondió');
    receive(0, { phase: 'waiting_user' }); receive(0, { phase: 'unknown' });
    window.PlanosSantoBridge.receive({ version: 1, id: 'unknown', result: null, error: null });
    receive(0, { version: 2, phase: 'waiting_user' });
    await vi.advanceTimersByTimeAsync(120_000); await rejected;
  });
  it('does not suspend the deadline of a second request when the first is waiting for a user', async () => {
    const pdf = request('pdf'); receive(0, { phase: 'waiting_user' });
    const status = request('smart_tool_status'); const rejected = expect(status).rejects.toThrow('SketchUp no respondió');
    await vi.advanceTimersByTimeAsync(158_000); await rejected;
    receive(0, { result: { cancelled: true } }); await expect(pdf).resolves.toEqual({ cancelled: true });
  });
  it('cleans up transport exceptions and rejects a missing native bridge', async () => {
    window.sketchup!.request = () => { throw new Error('transport failure'); };
    await expect(request('pdf')).rejects.toThrow('transport failure'); expect(vi.getTimerCount()).toBe(0);
    delete window.sketchup; await expect(request('pdf')).rejects.toThrow('Abrí Planos Santo');
  });
});
