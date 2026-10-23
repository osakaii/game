import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ErrorReport, PerfReport } from '@mecha/shared';
import { TelemetryService, percentile } from '../../src/telemetry/telemetry.service';

const perf = (fps: number, gpu: string, extra: Partial<PerfReport> = {}): PerfReport => ({
  kind: 'perf',
  fps,
  lowFps: fps / 2,
  seconds: 30,
  quality: 2,
  renderScale: 2,
  wet8bit: false,
  drawCalls: 14,
  triangles: 120_000,
  mapId: 'apartment',
  phase: 'hiding',
  device: { ua: 'test', gpu, dpr: 2, screenW: 780, screenH: 360, cores: 8, memoryGb: 4 },
  ...extra,
});

const error = (message: string): ErrorReport => ({ kind: 'error', message, source: 'index.js:1:1', stack: 'at f (index.js:1:1)', version: '1.1.0' });

describe('TelemetryService', () => {
  beforeAll(() => Logger.overrideLogger(false)); // строки лога в выводе тестов не нужны

  it('summarizes FPS overall and per GPU, most common GPU first', () => {
    const t = new TelemetryService();
    t.record('a', perf(60, 'Apple GPU'));
    t.record('b', perf(30, 'Adreno 610'));
    t.record('b', perf(20, 'Adreno 610', { quality: 0, wet8bit: true }));
    const stats = t.stats();
    expect(stats.perf.reports).toBe(3);
    expect(stats.perf.players).toBe(2);
    expect(stats.perf.fps.median).toBe(30);
    expect(stats.perf.quality).toEqual({ '0': 1, '1': 0, '2': 2 });
    expect(stats.perf.wet8bit).toBe(1);
    expect(stats.perf.gpus[0]).toEqual({ gpu: 'Adreno 610', reports: 2, fps: 25, lowFps: 12.5 });
  });

  it('never exposes player ids in the summary', () => {
    const t = new TelemetryService();
    t.record('secret-player-id', perf(60, 'Apple GPU'));
    t.record('secret-player-id', error('boom'));
    expect(JSON.stringify(t.stats())).not.toContain('secret-player-id');
  });

  it('folds identical errors into one entry with a count and distinct players', () => {
    const t = new TelemetryService();
    t.record('a', error('x is undefined'), 1000);
    t.record('a', error('x is undefined'), 2000);
    t.record('b', error('x is undefined'), 3000);
    t.record('a', error('other'), 1500);
    const [top, second] = t.stats().errors;
    expect(top).toMatchObject({ message: 'x is undefined', count: 3, players: 2, lastAt: new Date(3000).toISOString() });
    expect(second.message).toBe('other');
  });

  it('keeps memory bounded: only the latest 500 perf reports', () => {
    const t = new TelemetryService();
    for (let i = 0; i < 600; i++) t.record('a', perf(i < 100 ? 1 : 60, 'gpu'));
    const stats = t.stats();
    expect(stats.perf.reports).toBe(500);
    expect(stats.perf.fps.p10).toBe(60); // самые старые (по 1 FPS) вытеснены
  });
});

describe('percentile', () => {
  it('interpolates between values, empty list is 0', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([5], 10)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });
});
