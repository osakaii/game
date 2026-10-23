import { describe, expect, it, vi } from 'vitest';
import { TELEMETRY_INTERVAL_SEC, TELEMETRY_MAX_ERRORS, type ClientReport, type DeviceInfo } from '@mecha/shared';
import { FrameStats, Telemetry, type PerfSnapshot } from '../../src/net/telemetry';

const device: DeviceInfo = { ua: 'test', gpu: 'Adreno 610', dpr: 2, screenW: 780, screenH: 360, cores: 8, memoryGb: 4 };
const snapshot: PerfSnapshot = { quality: 2, renderScale: 2, wet8bit: false, drawCalls: 14, triangles: 120_000, mapId: 'apartment', phase: 'hiding' };

describe('FrameStats', () => {
  it('average FPS hides stutter, low FPS shows it', () => {
    const stats = new FrameStats();
    // 95 ровных кадров по 10 мс и 5 рывков по 100 мс.
    for (let i = 0; i < 95; i++) stats.add(0.01);
    for (let i = 0; i < 5; i++) stats.add(0.1);
    const { fps, lowFps, seconds } = stats.summary();
    expect(seconds).toBe(1.5); // 1.45 с, округлено до десятых
    expect(fps).toBeCloseTo(69, 0); // «вроде нормально»
    expect(lowFps).toBe(10); // а рывки — 10 FPS
  });

  it('ignores long gaps (tab switched away) and empty periods', () => {
    const stats = new FrameStats();
    expect(stats.summary()).toEqual({ fps: 0, lowFps: 0, seconds: 0 });
    stats.add(5);
    stats.add(0.016);
    expect(stats.seconds).toBeCloseTo(0.016);
  });
});

describe('Telemetry', () => {
  const setup = (state: PerfSnapshot | null = snapshot) => {
    const sent: ClientReport[] = [];
    const telemetry = new Telemetry((r) => sent.push(r), device, vi.fn(() => state), '1.1.0');
    return { telemetry, sent };
  };
  /** Прокрутить секунды по 60 кадров в секунду. */
  const run = (telemetry: Telemetry, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) telemetry.tick(1 / 60);
  };

  it('sends a perf report every interval while in a room', () => {
    const { telemetry, sent } = setup();
    run(telemetry, TELEMETRY_INTERVAL_SEC - 1);
    expect(sent).toHaveLength(0);
    run(telemetry, 2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'perf', mapId: 'apartment', device: { gpu: 'Adreno 610' } });
    expect((sent[0] as { fps: number }).fps).toBeCloseTo(60, 0);
  });

  it('stays silent outside a room', () => {
    const { telemetry, sent } = setup(null);
    run(telemetry, TELEMETRY_INTERVAL_SEC * 2 + 1);
    expect(sent).toHaveLength(0);
  });

  it('sends each distinct error once, at most a few per session, skips «Script error.»', () => {
    const { telemetry, sent } = setup();
    telemetry.reportError('x is undefined', 'index.js:1:1', '');
    telemetry.reportError('x is undefined', 'index.js:1:1', '');
    telemetry.reportError('Script error.', '', '');
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 10; i++) telemetry.reportError(`error ${i}`, '', '');
    expect(sent).toHaveLength(TELEMETRY_MAX_ERRORS);
    expect(sent[0]).toMatchObject({ kind: 'error', version: '1.1.0' });
  });
});
