import { describe, expect, it } from 'vitest';
import { ClientReportSchema, clip, type PerfReport } from '../src/telemetry.js';

const perf: PerfReport = {
  kind: 'perf',
  fps: 54.2,
  lowFps: 31,
  seconds: 30,
  quality: 2,
  renderScale: 2,
  wet8bit: false,
  drawCalls: 14,
  triangles: 128_000,
  mapId: 'apartment',
  phase: 'hiding',
  device: { ua: 'Mozilla/5.0 (Linux; Android 13)', gpu: 'Adreno (TM) 610', dpr: 2, screenW: 780, screenH: 360, cores: 8, memoryGb: 4 },
};

describe('ClientReportSchema', () => {
  it('accepts a perf report and an error report', () => {
    expect(ClientReportSchema.safeParse(perf).success).toBe(true);
    const error = { kind: 'error', message: 'x is undefined', source: 'index.js:1:20', stack: '', version: '1.1.0' };
    expect(ClientReportSchema.safeParse(error).success).toBe(true);
  });

  it('rejects junk: unknown kind, unknown map, oversized strings, absurd numbers', () => {
    expect(ClientReportSchema.safeParse({ ...perf, kind: 'hack' }).success).toBe(false);
    expect(ClientReportSchema.safeParse({ ...perf, mapId: 'moon' }).success).toBe(false);
    expect(ClientReportSchema.safeParse({ ...perf, device: { ...perf.device, ua: 'x'.repeat(301) } }).success).toBe(false);
    expect(ClientReportSchema.safeParse({ ...perf, fps: 1e9 }).success).toBe(false);
  });

  it('clip trims long strings instead of losing the whole report', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip(undefined, 3)).toBe('');
  });
});
