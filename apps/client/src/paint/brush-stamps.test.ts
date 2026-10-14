import { describe, expect, it } from 'vitest';
import { interpolateStamps } from './brush-stamps';

const p = (x: number) => ({ x, y: 0, z: 0 });

describe('interpolateStamps', () => {
  it('fills a fast stroke with evenly spaced stamps', () => {
    const { points } = interpolateStamps(p(0), p(1), 0.25, 0);
    expect(points.map((q) => q.x)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('keeps even spacing across many small moves (slow finger)', () => {
    let carried = 0;
    const xs: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = interpolateStamps(p(i * 0.1), p((i + 1) * 0.1), 0.25, carried);
      carried = r.carried;
      xs.push(...r.points.map((q) => Math.round(q.x * 100) / 100));
    }
    expect(xs).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('adds nothing when the finger did not move', () => {
    expect(interpolateStamps(p(0.3), p(0.3), 0.25, 0.1).points).toEqual([]);
  });
});
